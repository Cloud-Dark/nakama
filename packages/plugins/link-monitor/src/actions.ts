import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { PluginExecutionContext } from "@nakama/core";
import {
  describeScore,
  type NormalizedLink,
  normalizeLink,
  scoreLink,
  type Score,
  type Signal,
  type Verdict,
} from "./scoring";

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRecord = { [key: string]: JsonValue };

type SummarizeRequest = {
  agentId: string;
  bag: JsonRecord;
  op: "summarize";
  prompt: string;
};

type Context = PluginExecutionContext & {
  actionKey: string;
  host(request: SummarizeRequest): Promise<JsonValue>;
};

type LinkRow = {
  id: string;
  url: string;
  normalized_url: string;
  domain: string;
  chat_id: string;
  sender: string;
  message: string;
  verdict: Verdict;
  score: number;
  signals: string;
  analysis: string;
  overridden_by: string;
  override_reason: string;
  overridden_at: number | null;
  first_seen_at: number;
  last_seen_at: number;
  seen_count: number;
  analyzed_at: number | null;
};

const MAX_LIST_LIMIT = 100;

const DEFAULT_LIST_LIMIT = 25;

const MAX_STATS_DOMAINS = 10;

const MAX_MESSAGE_CHARS = 2000;

const MAX_ANALYSIS_CHARS = 4000;

/** How far back a burst of the same domain still counts as repetition. */
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

const ANALYSIS_PROMPT = [
  "You review one link that was posted in a chat.",
  "The receipts hold a deterministic spam score and the signals that fired; treat them as the only evidence.",
  "Reply with at most three sentences: what the link appears to be, why the signals matter, and what a moderator should do.",
  "Do not invent page contents, ownership, or reputation data you were not given.",
].join(" ");

function text(value: JsonValue | undefined, name: string): string {
  if (value !== String(value) || !value.trim()) {
    throw new Error(`Missing ${name}.`);
  }

  return value.trim();
}

function optionalText(value: JsonValue | undefined, max: number): string {
  return value === String(value) ? value.trim().slice(0, max) : "";
}

function count(value: JsonValue | undefined, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}

function readVerdict(value: JsonValue | undefined): Verdict {
  if (value === "clean" || value === "spam" || value === "suspicious") {
    return value;
  }

  throw new Error("verdict must be clean, suspicious, or spam.");
}

function readTrustedSenders(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) =>
        entry === String(entry) && entry.trim() ? [entry.trim()] : []
      )
    : [];
}

function readSignals(value: string): Signal[] {
  const parsed: JsonValue = JSON.parse(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry) =>
    entry instanceof Object && !Array.isArray(entry)
      ? [
          {
            code: String(entry.code),
            detail: String(entry.detail),
            weight: Number(entry.weight),
          },
        ]
      : []
  );
}

function summary(row: LinkRow) {
  return {
    analysis: row.analysis,
    analyzedAt: row.analyzed_at,
    chatId: row.chat_id,
    domain: row.domain,
    firstSeenAt: row.first_seen_at,
    id: row.id,
    lastSeenAt: row.last_seen_at,
    normalizedUrl: row.normalized_url,
    overridden: row.overridden_at !== null,
    score: row.score,
    seenCount: row.seen_count,
    sender: row.sender,
    url: row.url,
    verdict: row.verdict,
  };
}

function detail(row: LinkRow) {
  return {
    ...summary(row),
    message: row.message,
    overrideReason: row.override_reason,
    overriddenAt: row.overridden_at,
    overriddenBy: row.overridden_by,
    signals: readSignals(row.signals).map((signal) => ({ ...signal })),
  };
}

/** A stored link keeps a human verdict even after the score moves. */
function effectiveVerdict(row: LinkRow, score: Score): Verdict {
  return row.overridden_at === null ? score.verdict : row.verdict;
}

function recentDomainCount(
  db: Database,
  domain: string,
  chatId: string,
  since: number,
  excludeId: string
): number {
  const row = db
    .query<{ total: number }, [string, string, number, string]>(
      "SELECT COUNT(*) AS total FROM links WHERE domain = ? AND chat_id = ? AND last_seen_at >= ? AND id <> ?"
    )
    .get(domain, chatId, since, excludeId);

  return row?.total ?? 0;
}

/** LLM prose is a bonus; a missing provider must never lose the record. */
async function enrich(
  context: Context,
  link: NormalizedLink,
  score: Score,
  row: { chatId: string; message: string; sender: string }
): Promise<string> {
  const agentId = context.profileId?.trim();

  if (!agentId) {
    return "";
  }

  try {
    const result = await context.host({
      agentId,
      bag: {
        chatId: row.chatId,
        domain: link.domain,
        message: row.message,
        score: score.score,
        sender: row.sender,
        signals: score.signals.map((signal) => ({ ...signal })),
        url: link.normalizedUrl,
        verdict: score.verdict,
      },
      op: "summarize",
      prompt: ANALYSIS_PROMPT,
    });

    return result === String(result)
      ? result.trim().slice(0, MAX_ANALYSIS_CHARS)
      : "";
  } catch {
    return "";
  }
}

function analysisText(enriched: string, score: Score, link: NormalizedLink) {
  return enriched || describeScore(score, link);
}

function loadById(db: Database, id: JsonValue | undefined): LinkRow {
  const row = db
    .query<LinkRow, [string]>("SELECT * FROM links WHERE id = ?")
    .get(text(id, "id"));

  if (!row) {
    throw new Error("Link not found.");
  }

  return row;
}

function listLinks(db: Database, input: JsonRecord) {
  const filters: string[] = [];
  const values: (number | string)[] = [];

  if (input.verdict !== undefined) {
    filters.push("verdict = ?");
    values.push(readVerdict(input.verdict));
  }

  const domain = optionalText(input.domain, MAX_MESSAGE_CHARS).toLowerCase();

  if (domain) {
    filters.push("domain = ?");
    values.push(domain);
  }

  if (input.chatId !== undefined) {
    filters.push("chat_id = ?");
    values.push(optionalText(input.chatId, MAX_MESSAGE_CHARS));
  }

  const query = optionalText(input.query, MAX_MESSAGE_CHARS);

  if (query) {
    filters.push(
      "(normalized_url LIKE ? OR message LIKE ? OR sender LIKE ? OR analysis LIKE ?)"
    );
    const like = `%${query.toLowerCase()}%`;
    values.push(like, like, like, like);
  }

  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";

  const total =
    db
      .query<{ total: number }, (number | string)[]>(
        `SELECT COUNT(*) AS total FROM links${where}`
      )
      .get(...values)?.total ?? 0;

  const limit = Math.min(
    Math.max(count(input.limit, DEFAULT_LIST_LIMIT), 1),
    MAX_LIST_LIMIT
  );

  const offset = Math.max(count(input.offset, 0), 0);

  const rows = db
    .query<LinkRow, (number | string)[]>(
      `SELECT * FROM links${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    hasMore: offset + rows.length < total,
    links: rows.map(summary),
    limit,
    offset,
    total,
  };
}

function linkStats(db: Database) {
  const verdicts = db
    .query<{ total: number; verdict: Verdict }, []>(
      "SELECT verdict, COUNT(*) AS total FROM links GROUP BY verdict"
    )
    .all();

  const domains = db
    .query<{ domain: string; score: number; total: number }, [number]>(
      "SELECT domain, COUNT(*) AS total, MAX(score) AS score FROM links GROUP BY domain ORDER BY total DESC, domain ASC LIMIT ?"
    )
    .all(MAX_STATS_DOMAINS);

  const byVerdict: Record<Verdict, number> = {
    clean: 0,
    spam: 0,
    suspicious: 0,
  };

  for (const entry of verdicts) {
    byVerdict[entry.verdict] = entry.total;
  }

  return {
    byVerdict,
    overridden:
      db
        .query<{ total: number }, []>(
          "SELECT COUNT(*) AS total FROM links WHERE overridden_at IS NOT NULL"
        )
        .get()?.total ?? 0,
    topDomains: domains.map((entry) => ({
      domain: entry.domain,
      maxScore: entry.score,
      total: entry.total,
    })),
    total: verdicts.reduce((sum, entry) => sum + entry.total, 0),
  };
}

async function recordLink(
  db: Database,
  context: Context,
  input: JsonRecord
): Promise<JsonRecord> {
  const link = normalizeLink(text(input.url, "url"));
  const chatId = optionalText(input.chatId, MAX_MESSAGE_CHARS);
  const sender = optionalText(input.sender, MAX_MESSAGE_CHARS);
  const message = optionalText(input.message, MAX_MESSAGE_CHARS);
  const now = Date.now();

  const existing = db
    .query<LinkRow, [string, string]>(
      "SELECT * FROM links WHERE normalized_url = ? AND chat_id = ?"
    )
    .get(link.normalizedUrl, chatId);

  const score = scoreLink({
    link,
    message,
    recentDomainCount: recentDomainCount(
      db,
      link.domain,
      chatId,
      now - REPEAT_WINDOW_MS,
      existing?.id ?? ""
    ),
    sender,
    trustedSenders: readTrustedSenders(input.trustedSenders),
  });

  const analysis =
    input.enrich === true
      ? analysisText(
          await enrich(context, link, score, { chatId, message, sender }),
          score,
          link
        )
      : describeScore(score, link);

  if (existing) {
    db.query(
      "UPDATE links SET analysis = ?, analyzed_at = ?, last_seen_at = ?, message = ?, score = ?, seen_count = seen_count + 1, sender = ?, signals = ?, verdict = ? WHERE id = ?"
    ).run(
      analysis,
      now,
      now,
      message || existing.message,
      score.score,
      sender || existing.sender,
      JSON.stringify(score.signals),
      effectiveVerdict(existing, score),
      existing.id
    );

    return { ...detail(loadById(db, existing.id)), recorded: false };
  }

  const id = randomUUID();

  db.query(
    "INSERT INTO links (id, url, normalized_url, domain, chat_id, sender, message, verdict, score, signals, analysis, first_seen_at, last_seen_at, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    link.url,
    link.normalizedUrl,
    link.domain,
    chatId,
    sender,
    message,
    score.verdict,
    score.score,
    JSON.stringify(score.signals),
    analysis,
    now,
    now,
    now
  );

  return { ...detail(loadById(db, id)), recorded: true };
}

async function analyzeLink(
  db: Database,
  context: Context,
  input: JsonRecord
): Promise<JsonRecord> {
  const stored = input.id === undefined ? null : loadById(db, input.id);
  const link = normalizeLink(stored ? stored.url : text(input.url, "url"));

  const chatId =
    stored?.chat_id ?? optionalText(input.chatId, MAX_MESSAGE_CHARS);

  const sender =
    stored?.sender ?? optionalText(input.sender, MAX_MESSAGE_CHARS);

  const message =
    stored?.message ?? optionalText(input.message, MAX_MESSAGE_CHARS);

  const now = Date.now();

  const score = scoreLink({
    link,
    message,
    recentDomainCount: recentDomainCount(
      db,
      link.domain,
      chatId,
      now - REPEAT_WINDOW_MS,
      stored?.id ?? ""
    ),
    sender,
    trustedSenders: readTrustedSenders(input.trustedSenders),
  });

  const analysis = analysisText(
    await enrich(context, link, score, { chatId, message, sender }),
    score,
    link
  );

  if (!stored) {
    return {
      analysis,
      domain: link.domain,
      normalizedUrl: link.normalizedUrl,
      score: score.score,
      signals: score.signals.map((signal) => ({ ...signal })),
      stored: false,
      url: link.url,
      verdict: score.verdict,
    };
  }

  db.query(
    "UPDATE links SET analysis = ?, analyzed_at = ?, score = ?, signals = ?, verdict = ? WHERE id = ?"
  ).run(
    analysis,
    now,
    score.score,
    JSON.stringify(score.signals),
    effectiveVerdict(stored, score),
    stored.id
  );

  return { ...detail(loadById(db, stored.id)), stored: true };
}

function setVerdict(
  db: Database,
  context: Context,
  input: JsonRecord
): JsonRecord {
  const row = loadById(db, input.id);
  const verdict = readVerdict(input.verdict);

  db.query(
    "UPDATE links SET override_reason = ?, overridden_at = ?, overridden_by = ?, verdict = ? WHERE id = ?"
  ).run(
    optionalText(input.reason, MAX_MESSAGE_CHARS),
    Date.now(),
    context.actor.id,
    verdict,
    row.id
  );

  return detail(loadById(db, row.id));
}

export async function run(
  input: JsonRecord,
  context: Context
): Promise<JsonValue> {
  if (!context.databasePath) {
    throw new Error("Link Monitor database is unavailable.");
  }

  const db = new Database(context.databasePath);

  try {
    if (context.actionKey === "record_link") {
      return await recordLink(db, context, input);
    }

    if (context.actionKey === "list_links") {
      return listLinks(db, input);
    }

    if (context.actionKey === "get_link") {
      return detail(loadById(db, input.id));
    }

    if (context.actionKey === "analyze_link") {
      return await analyzeLink(db, context, input);
    }

    if (context.actionKey === "set_verdict") {
      return setVerdict(db, context, input);
    }

    if (context.actionKey === "link_stats") {
      return linkStats(db);
    }

    throw new Error("Unknown Link Monitor action.");
  } finally {
    db.close();
  }
}
