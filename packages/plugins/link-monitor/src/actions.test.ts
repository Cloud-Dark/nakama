import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type JsonRecord, type JsonValue, run } from "./actions";
import { normalizeLink, scoreLink, verdictFor } from "./scoring";

let dir: string;

let context: Parameters<typeof run>[1];

let summarizeCalls: JsonRecord[];

let summarize: () => Promise<JsonValue>;

const invoke = async (actionKey: string, input: JsonRecord = {}) =>
  record(await run(input, { ...context, actionKey }));

function record(value: JsonValue): JsonRecord {
  if (!(value instanceof Object) || Array.isArray(value)) {
    throw new Error("Expected a JSON object");
  }

  return value;
}

function records(value: JsonValue | undefined): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected a JSON array");
  }

  return value.map(record);
}

function signalCodes(link: JsonRecord): string[] {
  return records(link.signals).map((signal) => String(signal.code));
}

const scoreOf = (url: string, sender?: string, trustedSenders?: string[]) =>
  scoreLink({ link: normalizeLink(url), sender, trustedSenders });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nakama-link-monitor-"));
  const databasePath = join(dir, "plugin.sqlite");
  const db = new Database(databasePath);
  db.exec(
    readFileSync(
      new URL("../migrations/001-link-monitor.sql", import.meta.url),
      "utf8"
    )
  );
  db.close();
  summarizeCalls = [];
  summarize = () => Promise.resolve("A shortened link to an unknown page.");
  context = {
    actionKey: "",
    actor: { id: "moderator", role: "member" },
    apiVersion: 1,
    databasePath,
    dataDir: dir,
    host: (request) => {
      summarizeCalls.push(request.bag);

      return summarize();
    },
    invocationId: "test",
    orgId: "org",
    pluginId: "link-monitor",
    pluginVersion: "0.1.0",
    profileId: "agent",
  };
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

test("normalization drops tracking noise, www, and default paths", () => {
  expect(
    normalizeLink("HTTPS://WWW.Example.com/Page/?utm_source=wa&b=2&a=1#top")
      .normalizedUrl
  ).toBe("https://example.com/Page/?a=1&b=2");
  expect(normalizeLink("example.com").normalizedUrl).toBe(
    "https://example.com"
  );
  expect(normalizeLink("https://example.com/?fbclid=x").normalizedUrl).toBe(
    "https://example.com"
  );
  expect(normalizeLink("https://news.example.com.").domain).toBe(
    "news.example.com"
  );
  expect(() => normalizeLink("mailto:someone@example.com")).toThrow();
  expect(() => normalizeLink("  ")).toThrow();
});

test("the heuristic separates a clean link from each spam shape", () => {
  expect(scoreOf("https://example.com/blog/post")).toMatchObject({
    score: 0,
    signals: [],
    verdict: "clean",
  });

  const shortener = scoreOf("https://bit.ly/3xYz");
  expect(shortener.signals.map((signal) => signal.code)).toEqual(["shortener"]);
  expect(shortener.verdict).toBe("suspicious");

  expect(
    scoreOf("https://xn--pple-43d.com/login").signals.map(
      (signal) => signal.code
    )
  ).toContain("homoglyph_host");
  expect(
    scoreOf("https://аpple.com/account").signals.map((signal) => signal.code)
  ).toContain("homoglyph_host");

  const ipHost = scoreOf("http://203.0.113.7/verify-account");
  expect(ipHost.signals.map((signal) => signal.code)).toEqual([
    "ip_host",
    "plain_http",
    "bad_keyword",
  ]);
  expect(ipHost.verdict).toBe("spam");

  expect(
    scoreOf("https://wa-gift.secure-login.claim.reward.xyz/?token=abc").verdict
  ).toBe("spam");
  expect(
    scoreOf("https://a.b.c.d.example.com/x").signals.map(
      (signal) => signal.code
    )
  ).toContain("many_subdomains");
  expect(
    scoreOf("https://user:pw@example.com/x").signals.map(
      (signal) => signal.code
    )
  ).toContain("userinfo_host");
});

test("an untrusted sender adds a signal and a trusted one does not", () => {
  expect(
    scoreOf("https://example.com/x", "+62811", ["+62811"]).signals
  ).toEqual([]);
  expect(
    scoreOf("https://example.com/x", "+62999", ["+62811"]).signals.map(
      (signal) => signal.code
    )
  ).toEqual(["untrusted_sender"]);
  expect(scoreOf("https://example.com/x", "+62999").signals).toEqual([]);
});

test("verdict thresholds sit at 30 and 60", () => {
  expect(verdictFor(0)).toBe("clean");
  expect(verdictFor(29)).toBe("clean");
  expect(verdictFor(30)).toBe("suspicious");
  expect(verdictFor(59)).toBe("suspicious");
  expect(verdictFor(60)).toBe("spam");
  expect(verdictFor(100)).toBe("spam");
});

test("the same link in one chat dedupes into one row and counts repeats", async () => {
  const first = await invoke("record_link", {
    chatId: "group-1",
    message: "check this",
    sender: "+62811",
    url: "https://www.example.com/post?utm_source=wa",
  });

  expect(first).toMatchObject({
    recorded: true,
    seenCount: 1,
    verdict: "clean",
  });

  const again = await invoke("record_link", {
    chatId: "group-1",
    sender: "+62811",
    url: "https://example.com/post",
  });

  expect(again).toMatchObject({ id: first.id, recorded: false, seenCount: 2 });

  const other = await invoke("record_link", {
    chatId: "group-2",
    url: "https://example.com/post",
  });

  expect(other.recorded).toBe(true);
  expect(other.id).not.toBe(first.id);

  const listed = await invoke("list_links", {});
  expect(listed).toMatchObject({ hasMore: false, total: 2 });
});

test("a burst of one domain in a chat raises the score", async () => {
  for (const path of ["/a", "/b", "/c"]) {
    await invoke("record_link", {
      chatId: "group-1",
      url: `https://blast.example.com${path}`,
    });
  }

  const fourth = await invoke("record_link", {
    chatId: "group-1",
    url: "https://blast.example.com/d",
  });

  expect(signalCodes(fourth)).toContain("repeated_domain");
});

test("filters, paging and stats narrow the recorded list", async () => {
  await invoke("record_link", {
    chatId: "group-1",
    sender: "+62811",
    url: "https://example.com/safe",
  });
  await invoke("record_link", {
    chatId: "group-1",
    url: "http://203.0.113.7/verify-account",
  });
  await invoke("record_link", {
    chatId: "group-2",
    url: "https://bit.ly/3xYz",
  });

  expect(await invoke("list_links", { verdict: "spam" })).toMatchObject({
    total: 1,
  });
  expect(await invoke("list_links", { chatId: "group-2" })).toMatchObject({
    total: 1,
  });
  expect(await invoke("list_links", { domain: "bit.ly" })).toMatchObject({
    total: 1,
  });
  expect(await invoke("list_links", { query: "62811" })).toMatchObject({
    total: 1,
  });

  const page = await invoke("list_links", { limit: 2 });
  expect(page).toMatchObject({ hasMore: true, limit: 2, total: 3 });
  expect(records(page.links)).toHaveLength(2);

  expect(await invoke("link_stats")).toMatchObject({
    byVerdict: { clean: 1, spam: 1, suspicious: 1 },
    overridden: 0,
    total: 3,
  });
});

test("get_link returns the signals and analysis of one row", async () => {
  const { id } = await invoke("record_link", {
    chatId: "group-1",
    url: "http://203.0.113.7/verify-account",
  });

  const found = await invoke("get_link", { id: String(id) });

  expect(found).toMatchObject({ overridden: false, verdict: "spam" });
  expect(signalCodes(found)).toContain("ip_host");
  expect(String(found.analysis).length).toBeGreaterThan(0);
  await expect(invoke("get_link", { id: "missing" })).rejects.toThrow();
});

test("a human override outlasts later scoring", async () => {
  const { id } = await invoke("record_link", {
    chatId: "group-1",
    url: "https://bit.ly/3xYz",
  });

  const overridden = await invoke("set_verdict", {
    id: String(id),
    reason: "Our own campaign link.",
    verdict: "clean",
  });

  expect(overridden).toMatchObject({
    overridden: true,
    overriddenBy: "moderator",
    overrideReason: "Our own campaign link.",
    verdict: "clean",
  });

  const rescored = await invoke("analyze_link", { id: String(id) });
  expect(rescored).toMatchObject({ score: 30, stored: true, verdict: "clean" });

  const reposted = await invoke("record_link", {
    chatId: "group-1",
    url: "https://bit.ly/3xYz",
  });

  expect(reposted).toMatchObject({ seenCount: 2, verdict: "clean" });
  await expect(
    invoke("set_verdict", { id: String(id), verdict: "unsure" })
  ).rejects.toThrow();
});

test("analyze_link judges an ad-hoc url without recording it", async () => {
  const checked = await invoke("analyze_link", {
    url: "https://bit.ly/3xYz",
  });

  expect(checked).toMatchObject({
    normalizedUrl: "https://bit.ly/3xYz",
    stored: false,
    verdict: "suspicious",
  });
  expect(await invoke("list_links")).toMatchObject({ total: 0 });
});

test("the model enriches the analysis only when asked", async () => {
  const plain = await invoke("record_link", { url: "https://bit.ly/3xYz" });
  expect(summarizeCalls).toEqual([]);
  expect(signalCodes(plain)).toContain("shortener");

  const enriched = await invoke("record_link", {
    enrich: true,
    url: "https://bit.ly/other",
  });

  expect(enriched.analysis).toBe("A shortened link to an unknown page.");
  expect(summarizeCalls).toHaveLength(1);
  expect(summarizeCalls[0]).toMatchObject({
    domain: "bit.ly",
    score: 30,
    verdict: "suspicious",
  });
});

test("the record still lands when the model is unavailable", async () => {
  summarize = () => Promise.reject(new Error("Provider is not configured."));

  const recorded = await invoke("record_link", {
    enrich: true,
    url: "http://203.0.113.7/verify-account",
  });

  expect(recorded).toMatchObject({ recorded: true, score: 60 });
  expect(String(recorded.analysis).length).toBeGreaterThan(0);
  expect(signalCodes(recorded)).toContain("ip_host");

  summarize = () => Promise.resolve(null);
  const reanalyzed = await invoke("analyze_link", { id: String(recorded.id) });
  expect(reanalyzed).toMatchObject({ score: 60, verdict: "spam" });
  expect(signalCodes(reanalyzed)).toContain("ip_host");
});

test("unknown actions and unreadable urls are refused", async () => {
  await expect(invoke("nope")).rejects.toThrow();
  await expect(invoke("record_link", { url: "not a url" })).rejects.toThrow();
  await expect(invoke("record_link", {})).rejects.toThrow();
  await expect(
    run({}, { ...context, actionKey: "list_links", databasePath: undefined })
  ).rejects.toThrow();
});
