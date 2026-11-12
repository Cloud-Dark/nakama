// ui/style.css
var style_default = `[data-plugin-id="link-monitor"] {
  --lm-clean: var(--color-emerald-500, #10b981);
  --lm-suspicious: var(--color-amber-500, #f59e0b);
  --lm-spam: var(--color-red-500, #ef4444);

  .lm-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .lm-page {
    width: 100%;
    font-size: 14px;
    color: var(--foreground);
  }

  .lm-summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .lm-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
  }

  .lm-tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .lm-tile-value {
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .lm-tile-label {
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .lm-tile[data-verdict="clean"] .lm-tile-value {
    color: var(--lm-clean);
  }

  .lm-tile[data-verdict="suspicious"] .lm-tile-value {
    color: var(--lm-suspicious);
  }

  .lm-tile[data-verdict="spam"] .lm-tile-value {
    color: var(--lm-spam);
  }

  .lm-domains {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: inline-flex;
      gap: 8px;
      align-items: baseline;
      padding: 4px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 12px;
    }
  }

  .lm-domain-count {
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  .lm-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    > input {
      flex: 1 1 160px;
      min-width: 0;
    }
  }

  .lm-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
    font-size: 12px;
    color: var(--foreground);
    background: color-mix(in oklab, var(--foreground) 8%, transparent);
  }

  .lm-badge[data-verdict="clean"] {
    color: var(--lm-clean);
    background: color-mix(in oklab, var(--lm-clean) 14%, transparent);
  }

  .lm-badge[data-verdict="suspicious"] {
    color: var(--lm-suspicious);
    background: color-mix(in oklab, var(--lm-suspicious) 16%, transparent);
  }

  .lm-badge[data-verdict="spam"] {
    color: var(--lm-spam);
    background: color-mix(in oklab, var(--lm-spam) 16%, transparent);
  }

  .lm-score {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .lm-score[data-verdict="clean"] {
    color: var(--lm-clean);
  }

  .lm-score[data-verdict="suspicious"] {
    color: var(--lm-suspicious);
  }

  .lm-score[data-verdict="spam"] {
    color: var(--lm-spam);
  }

  .lm-link {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 420px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .lm-link:hover .lm-link-domain {
    text-decoration: underline;
  }

  .lm-link:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .lm-link-domain {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .lm-link-url {
    font-size: 12px;
    color: var(--muted-foreground);
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow-wrap: anywhere;
  }

  .lm-muted {
    color: var(--muted-foreground);
    font-size: 13px;
  }

  .lm-pager {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .lm-empty {
    padding: 40px 0;
    text-align: center;
    color: var(--muted-foreground);
  }

  .lm-error {
    color: var(--lm-spam);
  }

  .lm-detail-head {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .lm-detail-title {
    gap: 8px;
  }

  .lm-detail-domain {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .lm-detail-url {
    font-size: 13px;
    color: var(--muted-foreground);
    overflow-wrap: anywhere;
  }

  .lm-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin: 0;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;

    dt {
      font-size: 12px;
      color: var(--muted-foreground);
    }

    dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
  }

  .lm-heading {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  .lm-analysis {
    margin: 0;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .lm-signals {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: baseline;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    li:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }
  }

  .lm-signal-weight {
    min-width: 36px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--lm-suspicious);
  }

  .lm-signal-detail {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .lm-signal-code {
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .lm-override {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    > input {
      flex: 1 1 200px;
      min-width: 0;
    }
  }
}
`;

// src/ui-context.ts
var VERDICTS = ["spam", "suspicious", "clean"];
var EMPTY_FILTERS = {
  chatId: "",
  domain: "",
  query: "",
  verdict: ""
};
var errorText = (error) => error instanceof Error ? error.message : error;
function asJsonRecord(value) {
  return value instanceof Object && !Array.isArray(value) ? value : null;
}
function readVerdict(value) {
  return value === "spam" || value === "suspicious" ? value : "clean";
}
function readSignals(value) {
  return Array.isArray(value) ? value.flatMap((entry) => {
    const signal = asJsonRecord(entry);
    return signal ? [
      {
        code: String(signal.code),
        detail: String(signal.detail),
        weight: Number(signal.weight)
      }
    ] : [];
  }) : [];
}
function readSummary(value) {
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
    verdict: readVerdict(record.verdict)
  };
}
function readDetail(value) {
  const record = asJsonRecord(value);
  if (!record) {
    throw new Error("Invalid Link Monitor response");
  }
  return {
    ...readSummary(value),
    message: String(record.message ?? ""),
    overriddenBy: String(record.overriddenBy ?? ""),
    overrideReason: String(record.overrideReason ?? ""),
    signals: readSignals(record.signals)
  };
}
function readPage(value) {
  const record = asJsonRecord(value);
  if (!(record && Array.isArray(record.links))) {
    throw new Error("Invalid Link Monitor list response");
  }
  return {
    hasMore: record.hasMore === true,
    links: record.links.map(readSummary),
    offset: Number(record.offset),
    total: Number(record.total)
  };
}
function readStats(value) {
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
      suspicious: Number(byVerdict.suspicious ?? 0)
    },
    overridden: Number(record.overridden ?? 0),
    topDomains: domains.flatMap((entry) => {
      const domain = asJsonRecord(entry);
      return domain ? [
        {
          domain: String(domain.domain),
          maxScore: Number(domain.maxScore),
          total: Number(domain.total)
        }
      ] : [];
    }),
    total: Number(record.total ?? 0)
  };
}
var PAGE_SIZE = 25;
function filterInput(filters, offset) {
  const input = { limit: PAGE_SIZE, offset };
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
function formatTime(value) {
  return Number.isFinite(value) ? new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }) : "—";
}

// src/ui-detail.tsx
var VERDICT_LABELS = {
  clean: "Clean",
  spam: "Spam",
  suspicious: "Suspicious"
};
function createDetail(ctx) {
  const React = ctx.React;
  const { Button, Input } = ctx.ui;
  return function Detail({
    link,
    busy,
    error,
    onBack,
    onOverride,
    onReanalyze
  }) {
    const [reason, setReason] = React.useState("");
    return /* @__PURE__ */ React.createElement("article", {
      className: "lm-stack"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "lm-detail-head"
    }, /* @__PURE__ */ React.createElement(Button, {
      onClick: onBack,
      variant: "ghost"
    }, "← All links"), /* @__PURE__ */ React.createElement(Button, {
      disabled: busy,
      onClick: onReanalyze,
      variant: "outline"
    }, "Analyze again")), /* @__PURE__ */ React.createElement("header", {
      className: "lm-stack lm-detail-title"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-badge",
      "data-verdict": link.verdict
    }, VERDICT_LABELS[link.verdict], " · ", link.score, "/100"), /* @__PURE__ */ React.createElement("h2", {
      className: "lm-detail-domain"
    }, link.domain), /* @__PURE__ */ React.createElement("a", {
      className: "lm-detail-url",
      href: link.normalizedUrl,
      rel: "noopener noreferrer nofollow",
      target: "_blank"
    }, link.normalizedUrl)), error ? /* @__PURE__ */ React.createElement("p", {
      className: "lm-error",
      role: "alert"
    }, error) : null, /* @__PURE__ */ React.createElement("dl", {
      className: "lm-facts"
    }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Chat"), /* @__PURE__ */ React.createElement("dd", null, link.chatId || "—")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Sender"), /* @__PURE__ */ React.createElement("dd", null, link.sender || "—")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Last seen"), /* @__PURE__ */ React.createElement("dd", null, formatTime(link.lastSeenAt))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Times seen"), /* @__PURE__ */ React.createElement("dd", null, link.seenCount))), /* @__PURE__ */ React.createElement("section", {
      className: "lm-stack"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "lm-heading"
    }, "Analysis"), /* @__PURE__ */ React.createElement("p", {
      className: "lm-analysis"
    }, link.analysis || "No analysis yet.")), /* @__PURE__ */ React.createElement("section", {
      className: "lm-stack"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "lm-heading"
    }, "Signals ", link.signals.length ? `(${link.signals.length})` : ""), link.signals.length ? /* @__PURE__ */ React.createElement("ul", {
      className: "lm-signals"
    }, link.signals.map((signal) => /* @__PURE__ */ React.createElement("li", {
      key: signal.code
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-signal-weight"
    }, "+", signal.weight), /* @__PURE__ */ React.createElement("span", {
      className: "lm-signal-detail"
    }, signal.detail), /* @__PURE__ */ React.createElement("code", {
      className: "lm-signal-code"
    }, signal.code)))) : /* @__PURE__ */ React.createElement("p", {
      className: "lm-muted"
    }, "No spam signals fired.")), link.message ? /* @__PURE__ */ React.createElement("section", {
      className: "lm-stack"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "lm-heading"
    }, "Message"), /* @__PURE__ */ React.createElement("p", {
      className: "lm-analysis"
    }, link.message)) : null, /* @__PURE__ */ React.createElement("section", {
      className: "lm-stack"
    }, /* @__PURE__ */ React.createElement("h3", {
      className: "lm-heading"
    }, "Set the verdict"), link.overridden ? /* @__PURE__ */ React.createElement("p", {
      className: "lm-muted"
    }, link.overriddenBy || "Someone", " set this verdict by hand", link.overrideReason ? `: ${link.overrideReason}` : ".") : null, /* @__PURE__ */ React.createElement("form", {
      className: "lm-override",
      onSubmit: (event) => event.preventDefault()
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Why this verdict",
      onChange: (event) => setReason(event.target.value),
      placeholder: "Why this verdict",
      value: reason
    }), VERDICTS.map((verdict) => /* @__PURE__ */ React.createElement(Button, {
      disabled: busy || verdict === link.verdict,
      key: verdict,
      onClick: () => {
        onOverride(verdict, reason.trim());
        setReason("");
      },
      type: "button",
      variant: verdict === "spam" ? "destructive" : "outline"
    }, VERDICT_LABELS[verdict])))));
  };
}

// src/ui-list.tsx
var VERDICT_LABELS2 = {
  clean: "Clean",
  spam: "Spam",
  suspicious: "Suspicious"
};
function createList(ctx) {
  const React = ctx.React;
  const {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } = ctx.ui;
  function VerdictBadge({ link }) {
    return /* @__PURE__ */ React.createElement("span", {
      className: "lm-badge",
      "data-verdict": link.verdict
    }, VERDICT_LABELS2[link.verdict], link.overridden ? " ·  set by hand" : "");
  }
  function Summary({ stats }) {
    return /* @__PURE__ */ React.createElement("div", {
      className: "lm-summary"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "lm-tiles"
    }, /* @__PURE__ */ React.createElement("div", {
      className: "lm-tile"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-value"
    }, stats.total), /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-label"
    }, "Links")), VERDICTS.map((verdict) => /* @__PURE__ */ React.createElement("div", {
      className: "lm-tile",
      "data-verdict": verdict,
      key: verdict
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-value"
    }, stats.byVerdict[verdict]), /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-label"
    }, VERDICT_LABELS2[verdict]))), /* @__PURE__ */ React.createElement("div", {
      className: "lm-tile"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-value"
    }, stats.overridden), /* @__PURE__ */ React.createElement("span", {
      className: "lm-tile-label"
    }, "Set by hand"))), stats.topDomains.length ? /* @__PURE__ */ React.createElement("ul", {
      className: "lm-domains"
    }, stats.topDomains.map((entry) => /* @__PURE__ */ React.createElement("li", {
      key: entry.domain
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-domain-name"
    }, entry.domain), /* @__PURE__ */ React.createElement("span", {
      className: "lm-domain-count"
    }, entry.total, " · up to ", entry.maxScore)))) : null);
  }
  function FilterBar({
    filters,
    onChange
  }) {
    const [draft, setDraft] = React.useState(filters);
    const dirty = draft.query !== filters.query;
    return /* @__PURE__ */ React.createElement("form", {
      className: "lm-filters",
      onSubmit: (event) => {
        event.preventDefault();
        onChange(draft);
      }
    }, /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Search links",
      onChange: (event) => setDraft({ ...draft, query: event.target.value }),
      placeholder: "Search url, sender or analysis",
      value: draft.query
    }), /* @__PURE__ */ React.createElement(Select, {
      onValueChange: (value) => {
        const verdict = value === null ? "" : String(value);
        const next = {
          ...draft,
          verdict: VERDICTS.includes(verdict) ? verdict : ""
        };
        setDraft(next);
        onChange(next);
      },
      value: draft.verdict || "all"
    }, /* @__PURE__ */ React.createElement(SelectTrigger, {
      "aria-label": "Verdict"
    }, /* @__PURE__ */ React.createElement(SelectValue, {
      placeholder: "Any verdict"
    }, draft.verdict ? VERDICT_LABELS2[draft.verdict] : "Any verdict")), /* @__PURE__ */ React.createElement(SelectContent, null, /* @__PURE__ */ React.createElement(SelectItem, {
      value: "all"
    }, "Any verdict"), VERDICTS.map((verdict) => /* @__PURE__ */ React.createElement(SelectItem, {
      key: verdict,
      value: verdict
    }, VERDICT_LABELS2[verdict])))), /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Domain",
      onChange: (event) => setDraft({ ...draft, domain: event.target.value }),
      placeholder: "Domain",
      value: draft.domain
    }), /* @__PURE__ */ React.createElement(Input, {
      "aria-label": "Chat",
      onChange: (event) => setDraft({ ...draft, chatId: event.target.value }),
      placeholder: "Chat",
      value: draft.chatId
    }), /* @__PURE__ */ React.createElement(Button, {
      type: "submit",
      variant: dirty ? "default" : "outline"
    }, "Apply"), /* @__PURE__ */ React.createElement(Button, {
      onClick: () => {
        setDraft(EMPTY_FILTERS);
        onChange(EMPTY_FILTERS);
      },
      type: "button",
      variant: "ghost"
    }, "Clear"));
  }
  return function LinkList({
    page,
    stats,
    filters,
    loading,
    onFilters,
    onOffset,
    onOpen,
    error
  }) {
    const from = page.total ? page.offset + 1 : 0;
    const to = page.offset + page.links.length;
    return /* @__PURE__ */ React.createElement("div", {
      className: "lm-stack"
    }, stats ? /* @__PURE__ */ React.createElement(Summary, {
      stats
    }) : null, /* @__PURE__ */ React.createElement(FilterBar, {
      filters,
      onChange: onFilters
    }), error ? /* @__PURE__ */ React.createElement("p", {
      className: "lm-error",
      role: "alert"
    }, error) : null, loading ? /* @__PURE__ */ React.createElement("p", {
      role: "status"
    }, "Loading…") : page.links.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Table, null, /* @__PURE__ */ React.createElement(TableHeader, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableHead, {
      scope: "col"
    }, "Link"), /* @__PURE__ */ React.createElement(TableHead, {
      scope: "col"
    }, "Verdict"), /* @__PURE__ */ React.createElement(TableHead, {
      scope: "col"
    }, "Score"), /* @__PURE__ */ React.createElement(TableHead, {
      scope: "col"
    }, "Chat"), /* @__PURE__ */ React.createElement(TableHead, {
      scope: "col"
    }, "Seen"))), /* @__PURE__ */ React.createElement(TableBody, null, page.links.map((link) => /* @__PURE__ */ React.createElement(TableRow, {
      key: link.id
    }, /* @__PURE__ */ React.createElement(TableCell, null, /* @__PURE__ */ React.createElement("button", {
      className: "lm-link",
      onClick: () => onOpen(link.id),
      type: "button"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-link-domain"
    }, link.domain), /* @__PURE__ */ React.createElement("span", {
      className: "lm-link-url"
    }, link.normalizedUrl))), /* @__PURE__ */ React.createElement(TableCell, null, /* @__PURE__ */ React.createElement(VerdictBadge, {
      link
    })), /* @__PURE__ */ React.createElement(TableCell, null, /* @__PURE__ */ React.createElement("span", {
      className: "lm-score",
      "data-verdict": link.verdict
    }, link.score)), /* @__PURE__ */ React.createElement(TableCell, {
      className: "lm-muted"
    }, link.chatId || "—", link.sender ? ` · ${link.sender}` : ""), /* @__PURE__ */ React.createElement(TableCell, {
      className: "lm-muted"
    }, formatTime(link.lastSeenAt), link.seenCount > 1 ? ` · ${link.seenCount}×` : ""))))), /* @__PURE__ */ React.createElement("div", {
      className: "lm-pager"
    }, /* @__PURE__ */ React.createElement("span", {
      className: "lm-muted"
    }, from, "–", to, " of ", page.total), /* @__PURE__ */ React.createElement(Button, {
      disabled: page.offset === 0,
      onClick: () => onOffset(Math.max(0, page.offset - PAGE_SIZE)),
      variant: "ghost"
    }, "Previous"), /* @__PURE__ */ React.createElement(Button, {
      disabled: !page.hasMore,
      onClick: () => onOffset(page.offset + PAGE_SIZE),
      variant: "ghost"
    }, "Next"))) : /* @__PURE__ */ React.createElement("p", {
      className: "lm-empty"
    }, "No links recorded yet"));
  };
}

// src/ui.tsx
var inject = ["slots", "host", "styles", "ui"];
var EMPTY_PAGE = {
  hasMore: false,
  links: [],
  offset: 0,
  total: 0
};
function apply(ctx) {
  const React = ctx.React;
  const LinkList = createList(ctx);
  const Detail = createDetail(ctx);
  ctx.styles(style_default);
  function LinkMonitorPage() {
    const [page, setPage] = React.useState(EMPTY_PAGE);
    const [stats, setStats] = React.useState(null);
    const [filters, setFilters] = React.useState(EMPTY_FILTERS);
    const [offset, setOffset] = React.useState(0);
    const [opened, setOpened] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [revision, setRevision] = React.useState(0);
    const refresh = React.useCallback(async () => {
      const [listed, counted] = await Promise.all([
        ctx.host.call("list_links", filterInput(filters, offset)),
        ctx.host.call("link_stats")
      ]);
      setPage(readPage(listed));
      setStats(readStats(counted));
    }, [filters, offset]);
    React.useEffect(() => {
      let active = true;
      setLoading(true);
      refresh().catch((reason) => {
        if (active) {
          setError(errorText(reason instanceof Error ? reason : "Failed"));
        }
      }).finally(() => {
        if (active) {
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [refresh, revision]);
    const act = async (work) => {
      setBusy(true);
      setError("");
      try {
        await work();
      } catch (reason) {
        setError(errorText(reason instanceof Error ? reason : "Failed"));
      } finally {
        setBusy(false);
      }
    };
    const open = (id) => act(async () => {
      setOpened(readDetail(await ctx.host.call("get_link", { id })));
    });
    const reanalyze = () => {
      if (opened) {
        const { id } = opened;
        act(async () => {
          setOpened(readDetail(await ctx.host.call("analyze_link", { id })));
          setRevision((value) => value + 1);
        });
      }
    };
    const override = (verdict, reason) => {
      if (opened) {
        const { id } = opened;
        act(async () => {
          setOpened(readDetail(await ctx.host.call("set_verdict", { id, reason, verdict })));
          setRevision((value) => value + 1);
        });
      }
    };
    return /* @__PURE__ */ React.createElement("section", {
      "aria-label": "Link Monitor",
      className: "lm-page"
    }, opened ? /* @__PURE__ */ React.createElement(Detail, {
      busy,
      error,
      link: opened,
      onBack: () => {
        setOpened(null);
        setError("");
      },
      onOverride: override,
      onReanalyze: reanalyze
    }) : /* @__PURE__ */ React.createElement(LinkList, {
      error,
      filters,
      loading,
      onFilters: (next) => {
        setFilters(next);
        setOffset(0);
      },
      onOffset: setOffset,
      onOpen: (id) => void open(id),
      page,
      stats
    }));
  }
  ctx.slots.register("page", LinkMonitorPage);
}
export {
  apply,
  inject
};
