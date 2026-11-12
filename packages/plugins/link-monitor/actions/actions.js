// @bun
// src/actions.ts
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

// src/scoring.ts
var SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "shorturl.at",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "v.gd"
]);
var SUSPICIOUS_TLDS = new Set([
  "best",
  "buzz",
  "cam",
  "cfd",
  "click",
  "cyou",
  "gq",
  "icu",
  "link",
  "loan",
  "ml",
  "mom",
  "quest",
  "rest",
  "sbs",
  "shop",
  "surf",
  "tk",
  "top",
  "work",
  "xyz",
  "zip"
]);
var BAD_KEYWORDS = [
  "airdrop",
  "bansos",
  "bonus-deposit",
  "claim-reward",
  "confirm-account",
  "crypto-giveaway",
  "free-pulsa",
  "gift-card",
  "login-verify",
  "metamask",
  "reset-password",
  "secure-login",
  "slot-gacor",
  "unlock-wallet",
  "update-billing",
  "verify-account",
  "wa-gift",
  "whatsapp-gift",
  "win-prize"
];
var CREDENTIAL_KEYS = [
  "otp",
  "passcode",
  "password",
  "pin",
  "secret",
  "seed",
  "session",
  "token"
];
var TRACKING_PARAMS = /^(?:utm_|ga_|mc_|pk_|vero_|_hs)/;
var DROPPED_PARAMS = new Set([
  "fbclid",
  "gbraid",
  "gclid",
  "igshid",
  "mkt_tok",
  "msclkid",
  "ttclid",
  "twclid",
  "wbraid",
  "yclid"
]);
var IP_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$/;
var HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;
var WEB_SCHEME = /^https?:\/\//i;
var ASCII_HOST = /^[\da-z.-]+$/;
var LATIN_LETTER = /[a-z]/;
var HOMOGLYPH_LETTER = /[\u0391-\u03CE\u0410-\u044F]/;
var TRAILING_DOTS = /\.+$/;
var SPAM_AT = 60;
var SUSPICIOUS_AT = 30;
var LONG_QUERY_CHARS = 120;
var MANY_SUBDOMAIN_LABELS = 5;
var MANY_HYPHENS = 3;
var REPEAT_BURST = 3;
var WEIGHTS = {
  badKeyword: 22,
  credentialQuery: 24,
  homoglyphHost: 34,
  ipHost: 30,
  longQuery: 10,
  manyHyphens: 10,
  manySubdomains: 14,
  plainHttp: 8,
  repeatedDomain: 16,
  shortener: 30,
  suspiciousTld: 20,
  untrustedSender: 10,
  userinfoHost: 26
};
function sortedQuery(params) {
  const kept = [...params.entries()].filter(([key]) => !(TRACKING_PARAMS.test(key) || DROPPED_PARAMS.has(key)));
  kept.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return new URLSearchParams(kept).toString();
}
function normalizeLink(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Missing url.");
  }
  if (HAS_SCHEME.test(trimmed) && !WEB_SCHEME.test(trimmed)) {
    throw new Error("Only http and https links are recorded.");
  }
  const candidate = WEB_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Could not read this link: ${trimmed}`);
  }
  const host = parsed.hostname.toLowerCase().replace(TRAILING_DOTS, "");
  if (!host) {
    throw new Error(`Could not read this link: ${trimmed}`);
  }
  const labels = host.split(".");
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  const query = sortedQuery(parsed.searchParams);
  const port = parsed.port ? `:${parsed.port}` : "";
  const scheme = parsed.protocol.replace(":", "");
  const bare = labels.length > 2 && labels[0] === "www" ? labels.slice(1).join(".") : host;
  return {
    domain: bare,
    host,
    normalizedUrl: `${scheme}://${bare}${port}${path}${query ? `?${query}` : ""}`,
    path,
    query,
    scheme,
    url: trimmed,
    userinfo: Boolean(parsed.username || parsed.password)
  };
}
function hostSignals(link) {
  const signals = [];
  const labels = link.host.split(".");
  const tld = labels.at(-1) ?? "";
  if (SHORTENER_DOMAINS.has(link.domain)) {
    signals.push({
      code: "shortener",
      detail: `${link.domain} hides the real destination`,
      weight: WEIGHTS.shortener
    });
  }
  if (IP_LITERAL.test(link.host)) {
    signals.push({
      code: "ip_host",
      detail: `The host is a bare IP address (${link.host})`,
      weight: WEIGHTS.ipHost
    });
  } else if (!ASCII_HOST.test(link.host)) {
    signals.push({
      code: "homoglyph_host",
      detail: "The host mixes non-ASCII letters that imitate Latin ones",
      weight: WEIGHTS.homoglyphHost
    });
  } else if (labels.some((label) => label.startsWith("xn--")) || HOMOGLYPH_LETTER.test(link.host) && LATIN_LETTER.test(link.host)) {
    signals.push({
      code: "homoglyph_host",
      detail: "The host is punycode, so it can imitate a familiar name",
      weight: WEIGHTS.homoglyphHost
    });
  }
  if (SUSPICIOUS_TLDS.has(tld)) {
    signals.push({
      code: "suspicious_tld",
      detail: `.${tld} is cheap and heavily abused`,
      weight: WEIGHTS.suspiciousTld
    });
  }
  if (!IP_LITERAL.test(link.host) && labels.length >= MANY_SUBDOMAIN_LABELS) {
    signals.push({
      code: "many_subdomains",
      detail: `${labels.length} host labels can bury a brand name`,
      weight: WEIGHTS.manySubdomains
    });
  }
  if ((link.domain.match(/-/g) ?? []).length >= MANY_HYPHENS) {
    signals.push({
      code: "many_hyphens",
      detail: "The domain stacks hyphens the way typosquats do",
      weight: WEIGHTS.manyHyphens
    });
  }
  if (link.userinfo) {
    signals.push({
      code: "userinfo_host",
      detail: "Credentials before @ can disguise the real host",
      weight: WEIGHTS.userinfoHost
    });
  }
  if (link.scheme === "http") {
    signals.push({
      code: "plain_http",
      detail: "The link is not encrypted",
      weight: WEIGHTS.plainHttp
    });
  }
  return signals;
}
function contentSignals(input) {
  const { link } = input;
  const signals = [];
  const haystack = `${link.host}${link.path}${link.query} ${input.message ?? ""}`.toLowerCase();
  const keyword = BAD_KEYWORDS.find((entry) => haystack.includes(entry) || haystack.includes(entry.replaceAll("-", "")));
  if (keyword) {
    signals.push({
      code: "bad_keyword",
      detail: `The link reads like a ${keyword} lure`,
      weight: WEIGHTS.badKeyword
    });
  }
  const credential = CREDENTIAL_KEYS.find((key) => new URLSearchParams(link.query).has(key));
  if (credential) {
    signals.push({
      code: "credential_query",
      detail: `The query carries a ${credential} value`,
      weight: WEIGHTS.credentialQuery
    });
  }
  if (link.query.length > LONG_QUERY_CHARS) {
    signals.push({
      code: "long_query",
      detail: `The query is ${link.query.length} characters long`,
      weight: WEIGHTS.longQuery
    });
  }
  if ((input.recentDomainCount ?? 0) >= REPEAT_BURST) {
    signals.push({
      code: "repeated_domain",
      detail: `${link.domain} was posted ${input.recentDomainCount} times recently`,
      weight: WEIGHTS.repeatedDomain
    });
  }
  const sender = input.sender?.trim() ?? "";
  const trusted = input.trustedSenders ?? [];
  if (trusted.length && !trusted.includes(sender)) {
    signals.push({
      code: "untrusted_sender",
      detail: sender ? `${sender} is not on the trusted sender list` : "The sender is unknown",
      weight: WEIGHTS.untrustedSender
    });
  }
  return signals;
}
function verdictFor(score) {
  if (score >= SPAM_AT) {
    return "spam";
  }
  return score >= SUSPICIOUS_AT ? "suspicious" : "clean";
}
function scoreLink(input) {
  const signals = [...hostSignals(input.link), ...contentSignals(input)];
  const score = Math.min(100, signals.reduce((total, signal) => total + signal.weight, 0));
  return { score, signals, verdict: verdictFor(score) };
}
function describeScore(score, link) {
  if (!score.signals.length) {
    return `No spam signals fired for ${link.domain}.`;
  }
  return [
    `${score.verdict} (${score.score}/100) for ${link.domain}:`,
    ...score.signals.map((signal) => `- ${signal.detail}`)
  ].join(`
`);
}

// src/actions.ts
var MAX_LIST_LIMIT = 100;
var DEFAULT_LIST_LIMIT = 25;
var MAX_STATS_DOMAINS = 10;
var MAX_MESSAGE_CHARS = 2000;
var MAX_ANALYSIS_CHARS = 4000;
var REPEAT_WINDOW_MS = 10 * 60 * 1000;
var ANALYSIS_PROMPT = [
  "You review one link that was posted in a chat.",
  "The receipts hold a deterministic spam score and the signals that fired; treat them as the only evidence.",
  "Reply with at most three sentences: what the link appears to be, why the signals matter, and what a moderator should do.",
  "Do not invent page contents, ownership, or reputation data you were not given."
].join(" ");
function text(value, name) {
  if (value !== String(value) || !value.trim()) {
    throw new Error(`Missing ${name}.`);
  }
  return value.trim();
}
function optionalText(value, max) {
  return value === String(value) ? value.trim().slice(0, max) : "";
}
function count(value, fallback) {
  return Number.isInteger(value) ? Number(value) : fallback;
}
function readVerdict(value) {
  if (value === "clean" || value === "spam" || value === "suspicious") {
    return value;
  }
  throw new Error("verdict must be clean, suspicious, or spam.");
}
function readTrustedSenders(value) {
  return Array.isArray(value) ? value.flatMap((entry) => entry === String(entry) && entry.trim() ? [entry.trim()] : []) : [];
}
function readSignals(value) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((entry) => entry instanceof Object && !Array.isArray(entry) ? [
    {
      code: String(entry.code),
      detail: String(entry.detail),
      weight: Number(entry.weight)
    }
  ] : []);
}
function summary(row) {
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
    verdict: row.verdict
  };
}
function detail(row) {
  return {
    ...summary(row),
    message: row.message,
    overrideReason: row.override_reason,
    overriddenAt: row.overridden_at,
    overriddenBy: row.overridden_by,
    signals: readSignals(row.signals).map((signal) => ({ ...signal }))
  };
}
function effectiveVerdict(row, score) {
  return row.overridden_at === null ? score.verdict : row.verdict;
}
function recentDomainCount(db, domain, chatId, since, excludeId) {
  const row = db.query("SELECT COUNT(*) AS total FROM links WHERE domain = ? AND chat_id = ? AND last_seen_at >= ? AND id <> ?").get(domain, chatId, since, excludeId);
  return row?.total ?? 0;
}
async function enrich(context, link, score, row) {
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
        verdict: score.verdict
      },
      op: "summarize",
      prompt: ANALYSIS_PROMPT
    });
    return result === String(result) ? result.trim().slice(0, MAX_ANALYSIS_CHARS) : "";
  } catch {
    return "";
  }
}
function analysisText(enriched, score, link) {
  return enriched || describeScore(score, link);
}
function loadById(db, id) {
  const row = db.query("SELECT * FROM links WHERE id = ?").get(text(id, "id"));
  if (!row) {
    throw new Error("Link not found.");
  }
  return row;
}
function listLinks(db, input) {
  const filters = [];
  const values = [];
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
    filters.push("(normalized_url LIKE ? OR message LIKE ? OR sender LIKE ? OR analysis LIKE ?)");
    const like = `%${query.toLowerCase()}%`;
    values.push(like, like, like, like);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const total = db.query(`SELECT COUNT(*) AS total FROM links${where}`).get(...values)?.total ?? 0;
  const limit = Math.min(Math.max(count(input.limit, DEFAULT_LIST_LIMIT), 1), MAX_LIST_LIMIT);
  const offset = Math.max(count(input.offset, 0), 0);
  const rows = db.query(`SELECT * FROM links${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).all(...values, limit, offset);
  return {
    hasMore: offset + rows.length < total,
    links: rows.map(summary),
    limit,
    offset,
    total
  };
}
function linkStats(db) {
  const verdicts = db.query("SELECT verdict, COUNT(*) AS total FROM links GROUP BY verdict").all();
  const domains = db.query("SELECT domain, COUNT(*) AS total, MAX(score) AS score FROM links GROUP BY domain ORDER BY total DESC, domain ASC LIMIT ?").all(MAX_STATS_DOMAINS);
  const byVerdict = { clean: 0, spam: 0, suspicious: 0 };
  for (const entry of verdicts) {
    byVerdict[entry.verdict] = entry.total;
  }
  return {
    byVerdict,
    overridden: db.query("SELECT COUNT(*) AS total FROM links WHERE overridden_at IS NOT NULL").get()?.total ?? 0,
    topDomains: domains.map((entry) => ({
      domain: entry.domain,
      maxScore: entry.score,
      total: entry.total
    })),
    total: verdicts.reduce((sum, entry) => sum + entry.total, 0)
  };
}
async function recordLink(db, context, input) {
  const link = normalizeLink(text(input.url, "url"));
  const chatId = optionalText(input.chatId, MAX_MESSAGE_CHARS);
  const sender = optionalText(input.sender, MAX_MESSAGE_CHARS);
  const message = optionalText(input.message, MAX_MESSAGE_CHARS);
  const now = Date.now();
  const existing = db.query("SELECT * FROM links WHERE normalized_url = ? AND chat_id = ?").get(link.normalizedUrl, chatId);
  const score = scoreLink({
    link,
    message,
    recentDomainCount: recentDomainCount(db, link.domain, chatId, now - REPEAT_WINDOW_MS, existing?.id ?? ""),
    sender,
    trustedSenders: readTrustedSenders(input.trustedSenders)
  });
  const analysis = input.enrich === true ? analysisText(await enrich(context, link, score, { chatId, message, sender }), score, link) : describeScore(score, link);
  if (existing) {
    db.query("UPDATE links SET analysis = ?, analyzed_at = ?, last_seen_at = ?, message = ?, score = ?, seen_count = seen_count + 1, sender = ?, signals = ?, verdict = ? WHERE id = ?").run(analysis, now, now, message || existing.message, score.score, sender || existing.sender, JSON.stringify(score.signals), effectiveVerdict(existing, score), existing.id);
    return { ...detail(loadById(db, existing.id)), recorded: false };
  }
  const id = randomUUID();
  db.query("INSERT INTO links (id, url, normalized_url, domain, chat_id, sender, message, verdict, score, signals, analysis, first_seen_at, last_seen_at, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, link.url, link.normalizedUrl, link.domain, chatId, sender, message, score.verdict, score.score, JSON.stringify(score.signals), analysis, now, now, now);
  return { ...detail(loadById(db, id)), recorded: true };
}
async function analyzeLink(db, context, input) {
  const stored = input.id === undefined ? null : loadById(db, input.id);
  const link = normalizeLink(stored ? stored.url : text(input.url, "url"));
  const chatId = stored?.chat_id ?? optionalText(input.chatId, MAX_MESSAGE_CHARS);
  const sender = stored?.sender ?? optionalText(input.sender, MAX_MESSAGE_CHARS);
  const message = stored?.message ?? optionalText(input.message, MAX_MESSAGE_CHARS);
  const now = Date.now();
  const score = scoreLink({
    link,
    message,
    recentDomainCount: recentDomainCount(db, link.domain, chatId, now - REPEAT_WINDOW_MS, stored?.id ?? ""),
    sender,
    trustedSenders: readTrustedSenders(input.trustedSenders)
  });
  const analysis = analysisText(await enrich(context, link, score, { chatId, message, sender }), score, link);
  if (!stored) {
    return {
      analysis,
      domain: link.domain,
      normalizedUrl: link.normalizedUrl,
      score: score.score,
      signals: score.signals.map((signal) => ({ ...signal })),
      stored: false,
      url: link.url,
      verdict: score.verdict
    };
  }
  db.query("UPDATE links SET analysis = ?, analyzed_at = ?, score = ?, signals = ?, verdict = ? WHERE id = ?").run(analysis, now, score.score, JSON.stringify(score.signals), effectiveVerdict(stored, score), stored.id);
  return { ...detail(loadById(db, stored.id)), stored: true };
}
function setVerdict(db, context, input) {
  const row = loadById(db, input.id);
  const verdict = readVerdict(input.verdict);
  db.query("UPDATE links SET override_reason = ?, overridden_at = ?, overridden_by = ?, verdict = ? WHERE id = ?").run(optionalText(input.reason, MAX_MESSAGE_CHARS), Date.now(), context.actor.id, verdict, row.id);
  return detail(loadById(db, row.id));
}
async function run(input, context) {
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
export {
  run
};
