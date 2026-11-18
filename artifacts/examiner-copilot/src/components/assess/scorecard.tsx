"use client";

import { useState } from "react";
import Link from "next/link";
import { getGetAssessmentScorecardQueryKey, useGetAssessmentScorecard, type Scorecard, type ThemeScore } from "@workspace/api-client-react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/states";
import { Pill } from "@/components/scoring/shared";
import { cn } from "@/lib/utils";

const TONE: Record<number, "ok" | "info" | "warn" | "bad"> = { 1: "ok", 2: "info", 3: "warn", 4: "bad" };

function Rating({ rating, label, big }: { rating: number | null; label: string | null; big?: boolean }) {
  if (rating === null) return <span className="text-sm text-muted-foreground">Not rated</span>;
  const tone = TONE[rating]!;
  return (
    <span className={cn("inline-flex items-baseline gap-2 rounded-md px-2 py-0.5", `bg-[hsl(var(--tone-${tone}-bg))] text-[hsl(var(--tone-${tone}))]`)}>
      <span className={cn("font-mono font-semibold", big ? "text-2xl" : "text-sm")}>{rating}</span>
      <span className={big ? "text-base font-medium" : "text-xs"}>{label}</span>
    </span>
  );
}

function ThemeRow({ t, rules }: { t: ThemeScore; rules: Scorecard["rules"] }) {
  const [open, setOpen] = useState(false);
  const mine = rules.filter((r) => (r.theme ?? "No theme") === t.theme);
  const unscored = t.notApplicable + t.notAssessed + t.documentMissing + t.scoredUnder;
  return (
    <li className="border-t border-dashed border-border first:border-t-0" data-testid={`row-theme-score-${t.theme}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full flex-col gap-1.5 py-2.5 text-left hover:bg-muted/30 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
          {t.theme}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 pl-5 sm:pl-0">
          {t.complaints ? (
            <span className="text-xs text-muted-foreground" title="Complaints are shown for context and never change the rating.">
              {t.complaints.count} complaints{t.complaints.peerMedian !== null ? ` · peer median ${t.complaints.peerMedian}` : ""}
            </span>
          ) : null}
          {t.complaints?.corroborated ? <Pill tone="bad">Corroborated</Pill> : null}
          {t.capped ? <Pill tone="warn">capped</Pill> : null}
          {t.nearCutoff ? <Pill tone="neutral">near cutoff</Pill> : null}
          <span className="w-28 text-right font-mono text-xs text-muted-foreground">{t.assessed} rated{unscored ? ` · ${unscored} not` : ""}</span>
          <span className="w-44 text-right">
            {t.rating === null && t.notAssessed + t.documentMissing === 0 ? <span className="text-sm text-muted-foreground">Does not apply</span> : <Rating rating={t.rating} label={t.label} />}
          </span>
        </span>
      </button>
      {open ? (
        <ul className="mb-2 ml-5 space-y-1 rounded-md bg-muted/30 p-2 text-xs">
          {t.mean !== null ? <li className="text-muted-foreground">Mean of rule ratings {t.mean}{t.capped ? `; a rule rated 4 keeps the theme at ${t.rating}` : ""}.</li> : null}
          {mine.map((r) => (
            <li key={r.ruleId} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-muted-foreground">{r.code}</span>
              <span className="min-w-0 flex-1">{r.title}</span>
              {r.contradiction ? <Pill tone="warn">Contradiction</Pill> : null}
              <span className={cn(r.outcome === "Not satisfied" && "text-[hsl(var(--tone-bad))]", r.outcome === "Partially" && "text-[hsl(var(--tone-warn))]")}>{r.outcome}</span>
              <span className="w-6 text-right font-mono">{r.rating ?? "–"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Product and theme ratings from the latest decision on each finding (or the proposal when undecided). */
export function ScorecardPanel({ assessmentId }: { assessmentId: number }) {
  const q = useGetAssessmentScorecard(assessmentId, { query: { queryKey: getGetAssessmentScorecardQueryKey(assessmentId) } });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return <QueryError title="Could not load the scorecard" error={q.error} onRetry={() => q.refetch()} testId="error-scorecard" />;
  const s = q.data;
  const themes = [...s.themes].filter((t) => t.assessed || t.notApplicable || t.notAssessed || t.documentMissing || t.scoredUnder)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.theme.localeCompare(b.theme));
  const cov = s.coverage;
  return (
    <section className="rounded-lg border border-card-border bg-card" data-testid="panel-scorecard">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Product rating</p>
          <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="text-product-rating">
            <Rating rating={s.rating} label={s.label} big />
            {s.percentage !== null ? <span className="font-mono text-sm text-muted-foreground">{s.percentage}%</span> : null}
            {s.provisional ? <Pill tone="warn">{s.provisionalLabel}</Pill> : null}
            {s.nearCutoff ? <Pill tone="neutral">near a cutoff</Pill> : null}
          </div>
          {s.capReasons.map((c) => <p key={c} className="mt-1 text-xs text-muted-foreground">{c}</p>)}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-right text-xs">
          <div><dt className="text-muted-foreground">Coverage</dt><dd className="font-mono text-base">{cov.ratio !== null ? `${Math.round(cov.ratio * 100)}%` : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Rules rated</dt><dd className="font-mono text-base">{cov.assessed}</dd></div>
          <div><dt className="text-muted-foreground">Contradictions</dt><dd className="font-mono text-base">{s.contradictions}</dd></div>
        </dl>
      </header>
      {s.missingRoles.length ? (
        <p className="flex items-start gap-2 border-b border-border bg-[hsl(var(--tone-warn-bg))] px-4 py-2 text-sm text-[hsl(var(--tone-warn))]" data-testid="text-missing-roles">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Missing from the submission: {s.missingRoles.join("; ")}.
        </p>
      ) : null}
      <div className="px-4 py-2">
        {themes.length ? <ul>{themes.map((t) => <ThemeRow key={t.theme} t={t} rules={s.rules} />)}</ul> : <p className="py-3 text-sm text-muted-foreground">No rules were rated.</p>}
      </div>
      <footer className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Uses the examiner’s decision where one exists, otherwise the proposal; recalculated as you decide. {cov.notAssessed + cov.documentMissing} rule(s) not assessed count against coverage, not the rating.
        {s.hasComplaintData ? " Complaints are shown for context and never change a rating." : ""}{" "}
        <Link href="/library/scoring" className="underline underline-offset-2">Scoring rubric {s.configVersion}</Link>
      </footer>
    </section>
  );
}
