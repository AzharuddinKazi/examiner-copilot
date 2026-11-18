"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getGetAssessmentScorecardQueryKey, useGetAssessmentScorecard, useListComplaints,
  type ReviewItem, type ReviewProduct, type ThemeScore,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/states";
import { cn } from "@/lib/utils";

export type Outcome = "breach" | "warning" | "needs_review" | "compliant" | "not_applicable" | "rejected";
const BAR_ORDER: Outcome[] = ["breach", "warning", "needs_review", "compliant"];
const BAR_LABEL: Record<string, string> = { breach: "breach", warning: "warning", needs_review: "needs review", compliant: "compliant" };
const FILL: Record<string, string> = {
  breach: "bg-[hsl(var(--tone-bad))]",
  warning: "bg-[hsl(var(--tone-warn))]",
  needs_review: "bg-[hsl(var(--tone-info))]",
  compliant: "bg-[hsl(var(--tone-ok))]",
};
const RATING_TONE: Record<number, string> = {
  1: "bg-[hsl(var(--tone-ok-bg))] text-[hsl(var(--tone-ok))]",
  2: "bg-[hsl(var(--tone-info-bg))] text-[hsl(var(--tone-info))]",
  3: "bg-[hsl(var(--tone-warn-bg))] text-[hsl(var(--tone-warn))]",
  4: "bg-[hsl(var(--tone-bad-bg))] text-[hsl(var(--tone-bad))]",
};

interface Row {
  t: ThemeScore;
  counts: Record<string, number>;
  decided: number;
  total: number;
  firstFinding: number | null;
}

function OutcomeBar({ r }: { r: Row }) {
  const shown = BAR_ORDER.reduce((n, o) => n + (r.counts[o] ?? 0), 0);
  const summary = BAR_ORDER.filter((o) => r.counts[o]).map((o) => `${r.counts[o]} ${BAR_LABEL[o]}`).join(", ");
  return (
    <div className="min-w-0" title={summary || "No applicable rules"}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {BAR_ORDER.map((o) => (r.counts[o] ? <span key={o} className={FILL[o]} style={{ width: `${(r.counts[o]! / Math.max(shown, 1)) * 100}%` }} /> : null))}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {r.counts.breach ? <span className="font-medium text-[hsl(var(--tone-bad))]">{r.counts.breach} breach{r.counts.breach === 1 ? "" : "es"}</span> : null}
        {r.counts.breach && (r.counts.warning || r.counts.needs_review) ? " · " : null}
        {r.counts.warning || r.counts.needs_review ? `${(r.counts.warning ?? 0) + (r.counts.needs_review ?? 0)} to check` : null}
        {!r.counts.breach && !r.counts.warning && !r.counts.needs_review ? `${r.counts.compliant ?? 0} compliant` : null}
        <span className="sr-only">{summary}</span>
      </p>
    </div>
  );
}

function ComplaintsCell({ t, max }: { t: ThemeScore; max: number }) {
  const c = t.complaints;
  if (!c) return <span className="text-xs text-muted-foreground" title="No complaint category is linked to this theme">–</span>;
  const above = c.peerMedian !== null && c.count > c.peerMedian;
  return (
    <div className="min-w-0" title={`${c.count} complaints${c.peerMedian !== null ? `; median across banks ${c.peerMedian}` : ""}. Context only; never changes the rating.`}>
      <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", above ? "bg-[hsl(var(--tone-bad)/0.7)]" : "bg-pen/60")} style={{ width: `${(c.count / max) * 100}%` }} />
        {c.peerMedian !== null ? <span className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground" style={{ left: `calc(${(c.peerMedian / max) * 100}% - 1px)` }} /> : null}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <span className={cn("font-mono tabular-nums", above ? "text-[hsl(var(--tone-bad))]" : "text-foreground")}>{c.count}</span>
        {c.peerMedian !== null ? <> · median {c.peerMedian}</> : null}
        {c.corroborated ? <span className="ml-1 font-medium text-[hsl(var(--tone-bad))]">· backs the rating</span> : null}
      </p>
    </div>
  );
}

function CardThemes({ prod, items }: { prod: ReviewProduct; items: ReviewItem[]; }) {
  const sc = useGetAssessmentScorecard(prod.assessmentId, { query: { queryKey: getGetAssessmentScorecardQueryKey(prod.assessmentId) } });
  const complaints = useListComplaints();

  const data = useMemo(() => {
    if (!sc.data) return null;
    const byFinding = new Map(items.map((i) => [i.findingId, i]));
    const rows: Row[] = sc.data.themes.map((t) => {
      const counts: Record<string, number> = {};
      let decided = 0, total = 0, firstFinding: number | null = null;
      for (const r of sc.data!.rules) {
        if ((r.theme ?? "No theme") !== t.theme || r.findingId == null) continue;
        const i = byFinding.get(r.findingId);
        if (!i) continue;
        const o = i.decision ? (i.decision.finalStatus ?? "rejected") : i.proposedStatus;
        counts[o] = (counts[o] ?? 0) + 1;
        total++;
        if (i.decision) decided++;
        if (firstFinding === null && (o === "breach" || o === "warning" || o === "needs_review")) firstFinding = i.findingId;
      }
      return { t, counts, decided, total, firstFinding };
    });
    const live = rows.filter((r) => r.t.rating !== null || r.t.notAssessed + r.t.documentMissing > 0);
    const idle = rows.filter((r) => !live.includes(r));
    live.sort((a, b) => (b.t.rating ?? 0) - (a.t.rating ?? 0) || (b.counts.breach ?? 0) - (a.counts.breach ?? 0));
    const max = Math.max(1, ...live.map((r) => Math.max(r.t.complaints?.count ?? 0, r.t.complaints?.peerMedian ?? 0)));
    const mine = (complaints.data?.items ?? []).filter((c) => c.bankName === prod.bankName);
    const unmapped = new Map<string, number>();
    for (const c of mine) if (!c.theme) unmapped.set(c.category, (unmapped.get(c.category) ?? 0) + c.count);
    const totalComplaints = mine.reduce((n, c) => n + c.count, 0);
    return { live, idle, max, unmapped: [...unmapped.entries()].sort((a, b) => b[1] - a[1]), totalComplaints };
  }, [sc.data, items, complaints.data, prod.bankName]);

  if (sc.isLoading) return <Skeleton className="h-80 w-full" />;
  if (sc.isError || !data) return <QueryError title="Could not load the theme ratings" error={sc.error} onRetry={() => sc.refetch()} retrying={sc.isFetching} />;

  const unmappedTotal = data.unmapped.reduce((n, [, v]) => n + v, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-card-border bg-card" data-testid={`card-themes-${prod.assessmentId}`}>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,140px)_150px_minmax(0,130px)] gap-4 border-b border-border px-4 py-2 text-[11px] font-medium text-muted-foreground md:grid">
        <span>Theme</span>
        <span>Rule outcomes</span>
        <span>Rating</span>
        <span>{prod.bankName} complaints</span>
      </div>
      <ul className="divide-y divide-border">
        {data.live.map((r) => (
          <li key={r.t.theme} data-testid={`row-theme-${r.t.theme}`}>
            <Link href={r.firstFinding ? `/review/${r.firstFinding}` : `/assess/${prod.assessmentId}`}
              className="grid gap-x-4 gap-y-2 px-4 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_minmax(0,140px)_150px_minmax(0,130px)] md:items-center">
              <span className="min-w-0">
                <span className="block text-sm leading-snug">{r.t.theme}</span>
                <span className="block text-[11px] text-muted-foreground">{r.total} rule{r.total === 1 ? "" : "s"} · {r.decided} decided</span>
              </span>
              <OutcomeBar r={r} />
              <span>
                {r.t.rating !== null ? (
                  <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs", RATING_TONE[r.t.rating])}>
                    <span className="font-mono font-semibold">{r.t.rating}</span>{r.t.label}
                  </span>
                ) : <span className="text-xs text-muted-foreground">Not rated yet</span>}
              </span>
              <ComplaintsCell t={r.t} max={data.max} />
            </Link>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {BAR_ORDER.map((o) => <span key={o} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-[2px]", FILL[o])} aria-hidden />{BAR_LABEL[o]}</span>)}
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 rounded bg-foreground" aria-hidden />median across banks</span>
        </p>
        <p>Rating 1 Strong to 4 Weak. Outcomes use your decision where made, otherwise the agents&apos; proposal. Complaints are context only and never change a rating.</p>
        {data.idle.length ? <p>Does not apply to this card: {data.idle.map((r) => r.t.theme).join(", ")}.</p> : null}
        {unmappedTotal ? (
          <p className="text-[hsl(var(--tone-warn))]" data-testid="text-unmapped-complaints">
            {unmappedTotal} of {data.totalComplaints} {prod.bankName} complaints are in categories not linked to a theme ({data.unmapped.map(([k, v]) => `${k} ${v}`).join(", ")}).{" "}
            <Link href="/library/scoring" className="underline underline-offset-2">Link them in Scoring and complaints</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ThemeView({ products, items }: { products: ReviewProduct[]; items: ReviewItem[] }) {
  const [sel, setSel] = useState(products[0]?.assessmentId ?? null);
  const prod = products.find((p) => p.assessmentId === sel) ?? products[0];
  if (!prod) return null;
  return (
    <div className="space-y-2">
      {products.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Card">
          {products.map((p) => (
            <Button key={p.assessmentId} size="sm" variant={p.assessmentId === prod.assessmentId ? "secondary" : "ghost"} aria-pressed={p.assessmentId === prod.assessmentId}
              onClick={() => setSel(p.assessmentId)} data-testid={`button-card-${p.assessmentId}`}>
              {p.productName ?? "Deleted product"} <span className="text-muted-foreground">· {p.bankName}</span>
            </Button>
          ))}
        </div>
      ) : null}
      <CardThemes prod={prod} items={items.filter((i) => i.assessmentId === prod.assessmentId)} />
    </div>
  );
}
