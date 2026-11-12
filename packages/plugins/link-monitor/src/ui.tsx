/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import css from "../ui/style.css" with { type: "text" };
import type { Verdict } from "./scoring";
import {
  type Context,
  EMPTY_FILTERS,
  errorText,
  type Filters,
  filterInput,
  type LinkDetail,
  type LinkPage,
  readDetail,
  readPage,
  readStats,
  type Stats,
} from "./ui-context";
import { createDetail } from "./ui-detail";
import { createList } from "./ui-list";

export const inject = ["slots", "host", "styles", "ui"];

const EMPTY_PAGE: LinkPage = {
  hasMore: false,
  links: [],
  offset: 0,
  total: 0,
};

export function apply(ctx: Context) {
  const React = ctx.React;
  const LinkList = createList(ctx);
  const Detail = createDetail(ctx);
  ctx.styles(css);

  function LinkMonitorPage() {
    const [page, setPage] = React.useState<LinkPage>(EMPTY_PAGE);
    const [stats, setStats] = React.useState<Stats | null>(null);
    const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
    const [offset, setOffset] = React.useState(0);
    const [opened, setOpened] = React.useState<LinkDetail | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [revision, setRevision] = React.useState(0);

    const refresh = React.useCallback(async () => {
      const [listed, counted] = await Promise.all([
        ctx.host.call("list_links", filterInput(filters, offset)),
        ctx.host.call("link_stats"),
      ]);

      setPage(readPage(listed));
      setStats(readStats(counted));
    }, [filters, offset]);

    React.useEffect(() => {
      let active = true;
      setLoading(true);
      refresh()
        .catch((reason) => {
          if (active) {
            setError(errorText(reason instanceof Error ? reason : "Failed"));
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [refresh, revision]);

    const act = async (work: () => Promise<void>) => {
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

    const open = (id: string) =>
      act(async () => {
        setOpened(readDetail(await ctx.host.call("get_link", { id })));
      });

    const reanalyze = () => {
      if (opened) {
        const { id } = opened;
        void act(async () => {
          setOpened(readDetail(await ctx.host.call("analyze_link", { id })));
          setRevision((value) => value + 1);
        });
      }
    };

    const override = (verdict: Verdict, reason: string) => {
      if (opened) {
        const { id } = opened;
        void act(async () => {
          setOpened(
            readDetail(
              await ctx.host.call("set_verdict", { id, reason, verdict })
            )
          );
          setRevision((value) => value + 1);
        });
      }
    };

    return (
      <section aria-label="Link Monitor" className="lm-page">
        {opened ? (
          <Detail
            busy={busy}
            error={error}
            link={opened}
            onBack={() => {
              setOpened(null);
              setError("");
            }}
            onOverride={override}
            onReanalyze={reanalyze}
          />
        ) : (
          <LinkList
            error={error}
            filters={filters}
            loading={loading}
            onFilters={(next) => {
              setFilters(next);
              setOffset(0);
            }}
            onOffset={setOffset}
            onOpen={(id) => void open(id)}
            page={page}
            stats={stats}
          />
        )}
      </section>
    );
  }

  ctx.slots.register("page", LinkMonitorPage);
}
