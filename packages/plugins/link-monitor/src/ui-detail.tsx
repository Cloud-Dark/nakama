/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import {
  type Context,
  formatTime,
  type LinkDetail,
  VERDICTS,
} from "./ui-context";
import type { Verdict } from "./scoring";

const VERDICT_LABELS = {
  clean: "Clean",
  spam: "Spam",
  suspicious: "Suspicious",
};

export function createDetail(ctx: Context) {
  const React = ctx.React;
  const { Button, Input } = ctx.ui;

  return function Detail({
    link,
    busy,
    error,
    onBack,
    onOverride,
    onReanalyze,
  }: {
    busy: boolean;
    error: string;
    link: LinkDetail;
    onBack: () => void;
    onOverride: (verdict: Verdict, reason: string) => void;
    onReanalyze: () => void;
  }) {
    const [reason, setReason] = React.useState("");

    return (
      <article className="lm-stack">
        <div className="lm-detail-head">
          <Button onClick={onBack} variant="ghost">
            ← All links
          </Button>
          <Button disabled={busy} onClick={onReanalyze} variant="outline">
            Analyze again
          </Button>
        </div>
        <header className="lm-stack lm-detail-title">
          <span className="lm-badge" data-verdict={link.verdict}>
            {VERDICT_LABELS[link.verdict]} · {link.score}/100
          </span>
          <h2 className="lm-detail-domain">{link.domain}</h2>
          <a
            className="lm-detail-url"
            href={link.normalizedUrl}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {link.normalizedUrl}
          </a>
        </header>
        {error ? (
          <p className="lm-error" role="alert">
            {error}
          </p>
        ) : null}
        <dl className="lm-facts">
          <div>
            <dt>Chat</dt>
            <dd>{link.chatId || "—"}</dd>
          </div>
          <div>
            <dt>Sender</dt>
            <dd>{link.sender || "—"}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{formatTime(link.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>Times seen</dt>
            <dd>{link.seenCount}</dd>
          </div>
        </dl>
        <section className="lm-stack">
          <h3 className="lm-heading">Analysis</h3>
          <p className="lm-analysis">{link.analysis || "No analysis yet."}</p>
        </section>
        <section className="lm-stack">
          <h3 className="lm-heading">
            Signals {link.signals.length ? `(${link.signals.length})` : ""}
          </h3>
          {link.signals.length ? (
            <ul className="lm-signals">
              {link.signals.map((signal) => (
                <li key={signal.code}>
                  <span className="lm-signal-weight">+{signal.weight}</span>
                  <span className="lm-signal-detail">{signal.detail}</span>
                  <code className="lm-signal-code">{signal.code}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lm-muted">No spam signals fired.</p>
          )}
        </section>
        {link.message ? (
          <section className="lm-stack">
            <h3 className="lm-heading">Message</h3>
            <p className="lm-analysis">{link.message}</p>
          </section>
        ) : null}
        <section className="lm-stack">
          <h3 className="lm-heading">Set the verdict</h3>
          {link.overridden ? (
            <p className="lm-muted">
              {link.overriddenBy || "Someone"} set this verdict by hand
              {link.overrideReason ? `: ${link.overrideReason}` : "."}
            </p>
          ) : null}
          <form
            className="lm-override"
            onSubmit={(event) => event.preventDefault()}
          >
            <Input
              aria-label="Why this verdict"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this verdict"
              value={reason}
            />
            {VERDICTS.map((verdict) => (
              <Button
                disabled={busy || verdict === link.verdict}
                key={verdict}
                onClick={() => {
                  onOverride(verdict, reason.trim());
                  setReason("");
                }}
                type="button"
                variant={verdict === "spam" ? "destructive" : "outline"}
              >
                {VERDICT_LABELS[verdict]}
              </Button>
            ))}
          </form>
        </section>
      </article>
    );
  };
}
