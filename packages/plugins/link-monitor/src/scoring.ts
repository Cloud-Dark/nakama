export type Verdict = "clean" | "spam" | "suspicious";

export type Signal = { code: string; detail: string; weight: number };

export type NormalizedLink = {
  domain: string;
  host: string;
  normalizedUrl: string;
  path: string;
  query: string;
  scheme: string;
  url: string;
  userinfo: boolean;
};

export type ScoreInput = {
  link: NormalizedLink;
  message?: string;
  recentDomainCount?: number;
  sender?: string;
  trustedSenders?: string[];
};

export type Score = { score: number; signals: Signal[]; verdict: Verdict };

const SHORTENER_DOMAINS = new Set([
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
  "v.gd",
]);

const SUSPICIOUS_TLDS = new Set([
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
  "zip",
]);

const BAD_KEYWORDS = [
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
  "win-prize",
];

const CREDENTIAL_KEYS = [
  "otp",
  "passcode",
  "password",
  "pin",
  "secret",
  "seed",
  "session",
  "token",
];

const TRACKING_PARAMS = /^(?:utm_|ga_|mc_|pk_|vero_|_hs)/;

const DROPPED_PARAMS = new Set([
  "fbclid",
  "gbraid",
  "gclid",
  "igshid",
  "mkt_tok",
  "msclkid",
  "ttclid",
  "twclid",
  "wbraid",
  "yclid",
]);

const IP_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;

const WEB_SCHEME = /^https?:\/\//i;

const ASCII_HOST = /^[\da-z.-]+$/;

const LATIN_LETTER = /[a-z]/;

/** Cyrillic and Greek letters that read as Latin in a domain name. */
const HOMOGLYPH_LETTER = /[Α-ώА-я]/;

const TRAILING_DOTS = /\.+$/;

const SPAM_AT = 60;

const SUSPICIOUS_AT = 30;

const LONG_QUERY_CHARS = 120;

const MANY_SUBDOMAIN_LABELS = 5;

const MANY_HYPHENS = 3;

const REPEAT_BURST = 3;

const WEIGHTS = {
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
  userinfoHost: 26,
};

function sortedQuery(params: URLSearchParams): string {
  const kept = [...params.entries()].filter(
    ([key]) => !(TRACKING_PARAMS.test(key) || DROPPED_PARAMS.has(key))
  );

  kept.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return new URLSearchParams(kept).toString();
}

/** Drops the noise that makes the same destination look like many links. */
export function normalizeLink(raw: string): NormalizedLink {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("Missing url.");
  }

  if (HAS_SCHEME.test(trimmed) && !WEB_SCHEME.test(trimmed)) {
    throw new Error("Only http and https links are recorded.");
  }

  const candidate = WEB_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;

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

  const bare =
    labels.length > 2 && labels[0] === "www" ? labels.slice(1).join(".") : host;

  return {
    domain: bare,
    host,
    normalizedUrl: `${scheme}://${bare}${port}${path}${query ? `?${query}` : ""}`,
    path,
    query,
    scheme,
    url: trimmed,
    userinfo: Boolean(parsed.username || parsed.password),
  };
}

function hostSignals(link: NormalizedLink): Signal[] {
  const signals: Signal[] = [];
  const labels = link.host.split(".");
  const tld = labels.at(-1) ?? "";

  if (SHORTENER_DOMAINS.has(link.domain)) {
    signals.push({
      code: "shortener",
      detail: `${link.domain} hides the real destination`,
      weight: WEIGHTS.shortener,
    });
  }

  if (IP_LITERAL.test(link.host)) {
    signals.push({
      code: "ip_host",
      detail: `The host is a bare IP address (${link.host})`,
      weight: WEIGHTS.ipHost,
    });
  } else if (!ASCII_HOST.test(link.host)) {
    signals.push({
      code: "homoglyph_host",
      detail: "The host mixes non-ASCII letters that imitate Latin ones",
      weight: WEIGHTS.homoglyphHost,
    });
  } else if (
    labels.some((label) => label.startsWith("xn--")) ||
    (HOMOGLYPH_LETTER.test(link.host) && LATIN_LETTER.test(link.host))
  ) {
    signals.push({
      code: "homoglyph_host",
      detail: "The host is punycode, so it can imitate a familiar name",
      weight: WEIGHTS.homoglyphHost,
    });
  }

  if (SUSPICIOUS_TLDS.has(tld)) {
    signals.push({
      code: "suspicious_tld",
      detail: `.${tld} is cheap and heavily abused`,
      weight: WEIGHTS.suspiciousTld,
    });
  }

  if (!IP_LITERAL.test(link.host) && labels.length >= MANY_SUBDOMAIN_LABELS) {
    signals.push({
      code: "many_subdomains",
      detail: `${labels.length} host labels can bury a brand name`,
      weight: WEIGHTS.manySubdomains,
    });
  }

  if ((link.domain.match(/-/g) ?? []).length >= MANY_HYPHENS) {
    signals.push({
      code: "many_hyphens",
      detail: "The domain stacks hyphens the way typosquats do",
      weight: WEIGHTS.manyHyphens,
    });
  }

  if (link.userinfo) {
    signals.push({
      code: "userinfo_host",
      detail: "Credentials before @ can disguise the real host",
      weight: WEIGHTS.userinfoHost,
    });
  }

  if (link.scheme === "http") {
    signals.push({
      code: "plain_http",
      detail: "The link is not encrypted",
      weight: WEIGHTS.plainHttp,
    });
  }

  return signals;
}

function contentSignals(input: ScoreInput): Signal[] {
  const { link } = input;
  const signals: Signal[] = [];

  const haystack =
    `${link.host}${link.path}${link.query} ${input.message ?? ""}`.toLowerCase();

  const keyword = BAD_KEYWORDS.find(
    (entry) =>
      haystack.includes(entry) || haystack.includes(entry.replaceAll("-", ""))
  );

  if (keyword) {
    signals.push({
      code: "bad_keyword",
      detail: `The link reads like a ${keyword} lure`,
      weight: WEIGHTS.badKeyword,
    });
  }

  const credential = CREDENTIAL_KEYS.find((key) =>
    new URLSearchParams(link.query).has(key)
  );

  if (credential) {
    signals.push({
      code: "credential_query",
      detail: `The query carries a ${credential} value`,
      weight: WEIGHTS.credentialQuery,
    });
  }

  if (link.query.length > LONG_QUERY_CHARS) {
    signals.push({
      code: "long_query",
      detail: `The query is ${link.query.length} characters long`,
      weight: WEIGHTS.longQuery,
    });
  }

  if ((input.recentDomainCount ?? 0) >= REPEAT_BURST) {
    signals.push({
      code: "repeated_domain",
      detail: `${link.domain} was posted ${input.recentDomainCount} times recently`,
      weight: WEIGHTS.repeatedDomain,
    });
  }

  const sender = input.sender?.trim() ?? "";
  const trusted = input.trustedSenders ?? [];

  if (trusted.length && !trusted.includes(sender)) {
    signals.push({
      code: "untrusted_sender",
      detail: sender
        ? `${sender} is not on the trusted sender list`
        : "The sender is unknown",
      weight: WEIGHTS.untrustedSender,
    });
  }

  return signals;
}

export function verdictFor(score: number): Verdict {
  if (score >= SPAM_AT) {
    return "spam";
  }

  return score >= SUSPICIOUS_AT ? "suspicious" : "clean";
}

/** Deterministic, offline score; the LLM only writes prose on top of it. */
export function scoreLink(input: ScoreInput): Score {
  const signals = [...hostSignals(input.link), ...contentSignals(input)];

  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.weight, 0)
  );

  return { score, signals, verdict: verdictFor(score) };
}

export function describeScore(score: Score, link: NormalizedLink): string {
  if (!score.signals.length) {
    return `No spam signals fired for ${link.domain}.`;
  }

  return [
    `${score.verdict} (${score.score}/100) for ${link.domain}:`,
    ...score.signals.map((signal) => `- ${signal.detail}`),
  ].join("\n");
}
