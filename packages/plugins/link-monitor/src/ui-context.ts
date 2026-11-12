import type * as UI from "@nakama/ui";
import type * as ReactType from "react";
import type { JsonRecord, JsonValue } from "./actions";
import type { Verdict } from "./scoring";

export type Signal = { code: string; detail: string; weight: number };

export type LinkSummary = {
  analysis: string;
  chatId: string;
  domain: string;
  id: string;
  lastSeenAt: number;
  normalizedUrl: string;
  overridden: boolean;
  score: number;
  seenCount: number;
  sender: string;
  url: string;
  verdict: Verdict;
};

export type LinkDetail = LinkSummary & {
  message: string;
  overrideReason: string;
  overriddenBy: string;
  signals: Signal[];
};

export type LinkPage = {
  hasMore: boolean;
  links: LinkSummary[];
  offset: number;
  total: number;
};

export type Stats = {
  byVerdict: Record<Verdict, number>;
  overridden: number;
  topDomains: { domain: string; maxScore: number; total: number }[];
  total: number;
};

export type Filters = {
  chatId: string;
  domain: string;
  query: string;
  verdict: Verdict | "";
};

export type Context = {
  React: typeof ReactType;
  ui: typeof UI;
  signal: AbortSignal;
  slots: { register(slot: "page", component: ReactType.ComponentType): void };
  styles(css: string): void;
  host: { call(action: string, input?: JsonValue): Promise<JsonValue> };
};

export const VERDICTS: Verdict[] = ["spam", "suspicious", "clean"];

export function isVerdict(value: string): value is Verdict {
  return value === "spam" || value === "suspicious" || value === "clean";
}

export const EMPTY_FILTERS: Filters = {
  chatId: "",
  domain: "",
  query: "",
  verdict: "",
};

export const errorText = (error: Error | string) =>
  error instanceof Error ? error.message : error;

export function asJsonRecord(value: JsonValue | undefined): JsonRecord | null {
  return value instanceof Object && !Array.isArray(value) ? value : null;
}

function readVerdict(value: JsonValue | undefined): Verdict {
  return value === "spam" || value === "suspicious" ? value : "clean";
}

function readSignals(value: JsonValue | undefined): Signal[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const signal = asJsonRecord(entry);

        return signal
          ? [
              {
                code: String(signal.code),
                detail: String(signal.detail),
                weight: Number(signal.weight),
              },
            ]
          : [];
      })
    : [];
}

export function readSummary(value: JsonValue): LinkSummary {
  const record = asJsonRecord(value);

  if (!record) {
    throw new Error("Invalid Link Monitor response");
  }

  return {
    analysis: String(record.analysis ?? ""),
    chatId: String(record.chatId ?? ""),
    domain: String(record.domain),
    id: String(record.id),
    lastSeenAt: Number(record.lastSeenAt),
    normalizedUrl: String(record.normalizedUrl),
    overridden: record.overridden === true,
    score: Number(record.score),
    seenCount: Number(record.seenCount),
    sender: String(record.sender ?? ""),
    url: String(record.url),
    verdict: readVerdict(record.verdict),
  };
}

export function readDetail(value: JsonValue): LinkDetail {
  const record = asJsonRecord(value);

  if (!record) {
    throw new Error("Invalid Link Monitor response");
  }

  return {
    ...readSummary(value),
    message: String(record.message ?? ""),
    overriddenBy: String(record.overriddenBy ?? ""),
    overrideReason: String(record.overrideReason ?? ""),
    signals: readSignals(record.signals),
  };
}

export function readPage(value: JsonValue): LinkPage {
  const record = asJsonRecord(value);

  if (!(record && Array.isArray(record.links))) {
    throw new Error("Invalid Link Monitor list response");
  }

  return {
    hasMore: record.hasMore === true,
    links: record.links.map(readSummary),
    offset: Number(record.offset),
    total: Number(record.total),
  };
}

export function readStats(value: JsonValue): Stats {
  const record = asJsonRecord(value);
  const byVerdict = record && asJsonRecord(record.byVerdict);

  if (!(record && byVerdict)) {
    throw new Error("Invalid Link Monitor stats response");
  }

  const domains = Array.isArray(record.topDomains) ? record.topDomains : [];

  return {
    byVerdict: {
      clean: Number(byVerdict.clean ?? 0),
      spam: Number(byVerdict.spam ?? 0),
      suspicious: Number(byVerdict.suspicious ?? 0),
    },
    overridden: Number(record.overridden ?? 0),
    topDomains: domains.flatMap((entry) => {
      const domain = asJsonRecord(entry);

      return domain
        ? [
            {
              domain: String(domain.domain),
              maxScore: Number(domain.maxScore),
              total: Number(domain.total),
            },
          ]
        : [];
    }),
    total: Number(record.total ?? 0),
  };
}

export const PAGE_SIZE = 25;

export function filterInput(filters: Filters, offset: number): JsonRecord {
  const input: JsonRecord = { limit: PAGE_SIZE, offset };

  if (filters.verdict) {
    input.verdict = filters.verdict;
  }

  if (filters.domain.trim()) {
    input.domain = filters.domain.trim();
  }

  if (filters.chatId.trim()) {
    input.chatId = filters.chatId.trim();
  }

  if (filters.query.trim()) {
    input.query = filters.query.trim();
  }

  return input;
}

export function formatTime(value: number): string {
  return Number.isFinite(value)
    ? new Date(value).toLocaleString(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      })
    : "—";
}
