/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import type { ReactNode } from "react";
import {
  type Context,
  EMPTY_FILTERS,
  type Filters,
  formatTime,
  isVerdict,
  type LinkPage,
  type LinkSummary,
  PAGE_SIZE,
  type Stats,
  VERDICTS,
} from "./ui-context";

const VERDICT_LABELS = {
  clean: "Clean",
  spam: "Spam",
  suspicious: "Suspicious",
};

export function createList(ctx: Context) {
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
    TableRow,
  } = ctx.ui;

  function VerdictBadge({ link }: { link: LinkSummary }) {
    return (
      <span className="lm-badge" data-verdict={link.verdict}>
        {VERDICT_LABELS[link.verdict]}
        {link.overridden ? " ·  set by hand" : ""}
      </span>
    );
  }

  function Summary({ stats }: { stats: Stats }) {
    return (
      <div className="lm-summary">
        <div className="lm-tiles">
          <div className="lm-tile">
            <span className="lm-tile-value">{stats.total}</span>
            <span className="lm-tile-label">Links</span>
          </div>
          {VERDICTS.map((verdict) => (
            <div className="lm-tile" data-verdict={verdict} key={verdict}>
              <span className="lm-tile-value">{stats.byVerdict[verdict]}</span>
              <span className="lm-tile-label">{VERDICT_LABELS[verdict]}</span>
            </div>
          ))}
          <div className="lm-tile">
            <span className="lm-tile-value">{stats.overridden}</span>
            <span className="lm-tile-label">Set by hand</span>
          </div>
        </div>
        {stats.topDomains.length ? (
          <ul className="lm-domains">
            {stats.topDomains.map((entry) => (
              <li key={entry.domain}>
                <span className="lm-domain-name">{entry.domain}</span>
                <span className="lm-domain-count">
                  {entry.total} · up to {entry.maxScore}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  function FilterBar({
    filters,
    onChange,
  }: {
    filters: Filters;
    onChange: (next: Filters) => void;
  }) {
    const [draft, setDraft] = React.useState(filters);
    const dirty = draft.query !== filters.query;

    return (
      <form
        className="lm-filters"
        onSubmit={(event) => {
          event.preventDefault();
          onChange(draft);
        }}
      >
        <Input
          aria-label="Search links"
          onChange={(event) =>
            setDraft({ ...draft, query: event.target.value })
          }
          placeholder="Search url, sender or analysis"
          value={draft.query}
        />
        <Select
          onValueChange={(value) => {
            const verdict = value === null ? "" : String(value);

            const next = {
              ...draft,
              verdict: isVerdict(verdict) ? verdict : "",
            };

            setDraft(next);
            onChange(next);
          }}
          value={draft.verdict || "all"}
        >
          <SelectTrigger aria-label="Verdict">
            <SelectValue placeholder="Any verdict">
              {draft.verdict ? VERDICT_LABELS[draft.verdict] : "Any verdict"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any verdict</SelectItem>
            {VERDICTS.map((verdict) => (
              <SelectItem key={verdict} value={verdict}>
                {VERDICT_LABELS[verdict]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Domain"
          onChange={(event) =>
            setDraft({ ...draft, domain: event.target.value })
          }
          placeholder="Domain"
          value={draft.domain}
        />
        <Input
          aria-label="Chat"
          onChange={(event) =>
            setDraft({ ...draft, chatId: event.target.value })
          }
          placeholder="Chat"
          value={draft.chatId}
        />
        <Button type="submit" variant={dirty ? "default" : "outline"}>
          Apply
        </Button>
        <Button
          onClick={() => {
            setDraft(EMPTY_FILTERS);
            onChange(EMPTY_FILTERS);
          }}
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
      </form>
    );
  }

  return function LinkList({
    page,
    stats,
    filters,
    loading,
    onFilters,
    onOffset,
    onOpen,
    error,
  }: {
    error: string;
    filters: Filters;
    loading: boolean;
    onFilters: (next: Filters) => void;
    onOffset: (next: number) => void;
    onOpen: (id: string) => void;
    page: LinkPage;
    stats: Stats | null;
  }): ReactNode {
    const from = page.total ? page.offset + 1 : 0;
    const to = page.offset + page.links.length;

    return (
      <div className="lm-stack">
        {stats ? <Summary stats={stats} /> : null}
        <FilterBar filters={filters} onChange={onFilters} />
        {error ? (
          <p className="lm-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status">Loading…</p>
        ) : page.links.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Link</TableHead>
                  <TableHead scope="col">Verdict</TableHead>
                  <TableHead scope="col">Score</TableHead>
                  <TableHead scope="col">Chat</TableHead>
                  <TableHead scope="col">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <button
                        className="lm-link"
                        onClick={() => onOpen(link.id)}
                        type="button"
                      >
                        <span className="lm-link-domain">{link.domain}</span>
                        <span className="lm-link-url">
                          {link.normalizedUrl}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <VerdictBadge link={link} />
                    </TableCell>
                    <TableCell>
                      <span className="lm-score" data-verdict={link.verdict}>
                        {link.score}
                      </span>
                    </TableCell>
                    <TableCell className="lm-muted">
                      {link.chatId || "—"}
                      {link.sender ? ` · ${link.sender}` : ""}
                    </TableCell>
                    <TableCell className="lm-muted">
                      {formatTime(link.lastSeenAt)}
                      {link.seenCount > 1 ? ` · ${link.seenCount}×` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="lm-pager">
              <span className="lm-muted">
                {from}–{to} of {page.total}
              </span>
              <Button
                disabled={page.offset === 0}
                onClick={() => onOffset(Math.max(0, page.offset - PAGE_SIZE))}
                variant="ghost"
              >
                Previous
              </Button>
              <Button
                disabled={!page.hasMore}
                onClick={() => onOffset(page.offset + PAGE_SIZE)}
                variant="ghost"
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <p className="lm-empty">No links recorded yet</p>
        )}
      </div>
    );
  };
}
