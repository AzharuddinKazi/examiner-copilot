"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  useGetReviewQueue, useGetWorkspaceProgress,
  type ReviewItem, type ReviewProduct, type WorkspaceProgress,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/states";
import { StatusPill } from "@/components/voice";
import { FINDING_STATUS_LABELS, SEVERITY_PILL } from "@/lib/labels";
import { cn } from "@/lib/utils";

/* ---------- data shaping ---------- */

type Outcome = "breach" | "warning" | "needs_review" | "compliant" | "not_applicable" | "rejected";
const OUTCOMES: Outcome[] = ["breach", "warning", "needs_review", "compliant", "not_applicable", "rejected"];
const OUTCOME_LABEL: Record<Outcome, string> = { ...FINDING_STATUS_LABELS, rejected: "Rejected" };
const OUTCOME_FILL: Record<Outcome, string> = {
  breach: "bg-[hsl(var(--tone-bad))]",
  warning: "bg-[hsl(var(--tone-warn))]",
  needs_review: "bg-[hsl(var(--tone-info))]",
  compliant: "bg-[hsl(var(--tone-ok))]",
  not_applicable: "bg-[hsl(var(--tone-neutral)/0.45)]",
  rejected: "bg-[hsl(var(--tone-neutral)/0.25)]",
};
const SERIOUS = new Set(["breach", "warning", "needs_review"]);

/** What the record says now: the examiner's decision if there is one, else the agents' proposal. */
function outcome(i: ReviewItem): Outcome {
  if (i.decision) return i.decision.finalStatus ?? "rejected";
  return i.proposedStatus;
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function useDashboard(q: { items: ReviewItem[]; products: ReviewProduct[] } | undefined, p: WorkspaceProgress | undefined) {
  return useMemo(() => {
    if (!q || !p) return null;
    const items = q.items;
    const decided = items.filter((i) => i.decision);
    const undecided = items.filter((i) => !i.decision);
    const outcomes = items.map(outcome);
    const applicable = outcomes.filter((o) => o !== "not_applicable" && o !== "rejected");
    const compliant = outcomes.filter((o) => o === "compliant").length;
    const confirmedBreach = decided.filter((i) => i.decision!.finalStatus === "breach").length;
    const confirmedWarning = decided.filter((i) => i.decision!.finalStatus === "warning").length;
    const openSerious = undecided.filter((i) => SERIOUS.has(i.proposedStatus));
    const openHigh = openSerious.filter((i) => i.severity === "high").length;
    const agreed = decided.filter((i) => i.decision!.decision === "accept").length;
    const docs = p.steps.find((s) => s.key === "upload")?.counts.find((c) => /confirmed/i.test(c.label))?.value ?? 0;
    const notices = p.steps.find((s) => s.key === "notices")?.counts[0]?.value ?? 0;

    const rules = [...new Map(items.map((i) => [i.ruleCode, i.ruleTitle])).entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    const byProduct = q.products.map((prod) => {
      const mine = items.filter((i) => i.assessmentId === prod.assessmentId);
      const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
      for (const i of mine) counts[outcome(i)]++;
      return { prod, mine, counts, cells: new Map(mine.map((i) => [i.ruleCode, i])) };
    });

    return {
      total: items.length, decided: decided.length, undecided: undecided.length,
      compliant, applicable: applicable.length,
      confirmedBreach, confirmedWarning, openSerious, openHigh, agreed,
      products: q.products.length, productsInLibrary: p.library.products, docs, rules, notices, byProduct,
      activeRules: p.library.activeRules,
      firstUndecided: undecided[0]?.findingId ?? null,
    };
  }, [q, p]);
}

/* ---------- building blocks ---------- */

type D = NonNullable<ReturnType<typeof useDashboard>>;

function Section({ title, aside, children, testId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="min-w-0 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone, testId }: { label: string; value: string; sub: string; tone?: "bad" | "warn"; testId: string }) {
  return (
    <div className="border-b border-r border-border px-3.5 py-2.5" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-mono text-xl tabular-nums",
        tone === "bad" && "text-[hsl(var(--tone-bad))]", tone === "warn" && "text-[hsl(var(--tone-warn))]")} data-testid={`${testId}-value`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Matrix({ d }: { d: D }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-card-border bg-card" data-testid="card-matrix">
      <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1.5 px-3 py-2 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card pr-3 text-left font-medium text-muted-foreground" scope="col">Card</th>
            {d.rules.map(([code, title]) => (
              <th key={code} scope="col" title={`${code} ${title}`} className="min-w-6 font-mono text-[10px] font-normal text-muted-foreground">{code.replace(/^[A-Z]+-/, "")}</th>
            ))}
            <th className="pl-3 text-right font-medium text-muted-foreground" scope="col">Decided</th>
          </tr>
        </thead>
        <tbody>
          {d.byProduct.map(({ prod, mine, cells }) => (
            <tr key={prod.assessmentId} data-testid={`matrix-row-${prod.assessmentId}`}>
              <th scope="row" className="sticky left-0 z-10 max-w-[200px] bg-card pr-3 text-left font-normal">
                <span className="block truncate text-[13px] font-medium" title={prod.productName ?? ""}>{prod.productName ?? "Deleted product"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{prod.bankName}</span>
              </th>
              {d.rules.map(([code, title]) => {
                const i = cells.get(code);
                if (!i) return <td key={code}><span className="block h-6 rounded-sm border border-dashed border-border" title={`${code}: not assessed`} /></td>;
                const o = outcome(i);
                const label = `${code} ${title}: ${OUTCOME_LABEL[o]}${i.decision ? ", decided" : ", proposed by agents, not decided"}`;
                return (
                  <td key={code}>
                    <Link href={`/review/${i.findingId}`} aria-label={label} title={label} data-testid={`matrix-cell-${i.findingId}`}
                      className={cn("block h-6 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        i.decision ? OUTCOME_FILL[o] : cn(OUTCOME_FILL[o], "opacity-30 hover:opacity-60"))} />
                  </td>
                );
              })}
              <td className="pl-3 text-right font-mono text-[11px] text-muted-foreground">{mine.filter((i) => i.decision).length}/{mine.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {OUTCOMES.map((o) => <span key={o} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-[2px]", OUTCOME_FILL[o])} aria-hidden />{OUTCOME_LABEL[o]}</span>)}
        <span className="ml-auto">Faded: agent proposal you have not decided</span>
      </div>
    </div>
  );
}

function DecisionList({ d }: { d: D }) {
  const list = d.openSerious.slice(0, 6);
  if (!list.length) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4" aria-hidden /> No possible problems are waiting.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-card-border bg-card" data-testid="card-needs-decision">
      {list.map((i) => (
        <li key={i.findingId}>
          <Link href={`/review/${i.findingId}`} className="block px-4 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" data-testid={`link-decide-${i.findingId}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{i.ruleTitle}</span>
              <StatusPill variant={i.proposedStatus} className="shrink-0" />
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              <span className="font-mono">{i.ruleCode}</span> · {i.productName} · {SEVERITY_PILL[i.severity].label.toLowerCase()} severity
            </span>
          </Link>
        </li>
      ))}
      {d.openSerious.length > list.length ? (
        <li className="px-4 py-2"><Link href="/review" className="text-xs underline underline-offset-2">All {d.openSerious.length} in the review queue</Link></li>
      ) : null}
    </ul>
  );
}

function GetStarted({ p }: { p: WorkspaceProgress }) {
  const docs = p.steps.find((s) => s.key === "upload")?.counts.find((c) => /confirmed/i.test(c.label))?.value ?? 0;
  const runs = p.steps.find((s) => s.key === "assess")?.counts[0]?.value ?? 0;
  const items = [
    { done: p.library.banks > 0 && p.library.products > 0, label: "Add the banks and their card products", detail: `${plural(p.library.banks, "bank", "banks")}, ${plural(p.library.products, "card product", "card products")}`, href: "/library/banks" },
    { done: p.library.activeRules > 0, label: "Import your rulebook (.xlsx or .csv) and make it active", detail: plural(p.library.activeRules, "active rule", "active rules"), href: "/library/rulebook" },
    { done: docs > 0, label: "Upload the card disclosures (PDF) and confirm each one", detail: plural(docs, "confirmed document", "confirmed documents"), href: "/upload" },
    { done: runs > 0, label: "Run an assessment for a card product", detail: plural(runs, "assessment", "assessments"), href: "/assess" },
  ];
  return (
    <ol className="divide-y divide-border rounded-lg border border-card-border bg-card" data-testid="list-get-started">
      {items.map((it, n) => (
        <li key={it.href}>
          <Link href={it.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" data-testid={`link-start-${n + 1}`}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]",
              it.done ? "border-[hsl(var(--tone-ok))] bg-[hsl(var(--tone-ok))] text-card" : "border-border text-muted-foreground")} aria-hidden>
              {it.done ? <CheckCircle2 className="size-3.5" /> : n + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{it.label}</span>
              <span className="block text-xs text-muted-foreground">{it.done ? "Done · " : ""}{it.detail}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ---------- page ---------- */

export function Overview() {
  const progress = useGetWorkspaceProgress();
  const queue = useGetReviewQueue();
  const d = useDashboard(queue.data, progress.data);
  const loading = progress.isLoading || queue.isLoading;
  const failed = !loading && (progress.isError || queue.isError || !d);
  const nextStep = progress.data?.steps.find((s) => s.key === progress.data!.nextStepKey);

  const confirmedParts = d ? [d.confirmedBreach && plural(d.confirmedBreach, "breach", "breaches"), d.confirmedWarning && plural(d.confirmedWarning, "warning", "warnings")].filter(Boolean) : [];
  const headline = !d ? "" : d.total === 0
    ? "Nothing has been assessed yet. Set up the workspace in four steps; results appear here after the first assessment."
    : `${plural(d.openSerious.length, "possible problem waits", "possible problems wait")} for your decision${d.openHigh ? `, ${d.openHigh} of them high severity` : ""}. ${
        confirmedParts.length ? `You have confirmed ${confirmedParts.join(" and ")}.` : "You have not confirmed any problem yet."}`;

  const cta = d?.openSerious[0]
    ? { href: `/review/${d.openSerious[0].findingId}`, label: "Review possible problems" }
    : d?.firstUndecided ? { href: `/review/${d.firstUndecided}`, label: "Continue review" }
    : d?.total ? { href: "/review", label: "Open the review queue" }
    : !progress.data?.library.products ? { href: "/library/banks", label: "Add a bank" }
    : !progress.data.library.activeRules ? { href: "/library/rulebook", label: "Import a rulebook" }
    : { href: nextStep?.href ?? "/upload", label: nextStep?.key === "assess" ? "Run an assessment" : "Upload documents" };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="rise mb-5 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl" data-testid="text-page-question">What needs your attention?</h1>
          {loading ? <Skeleton className="mt-3 h-5 w-96 max-w-full" /> : d ? (
            <p className="mt-1 max-w-2xl text-sm" data-testid="text-answer">{headline}</p>
          ) : null}
        </div>
        {loading ? <Skeleton className="h-9 w-52" /> : (
          <Button asChild className="shrink-0" data-testid="button-continue">
            <Link href={cta.href}>{cta.label} <ArrowRight aria-hidden /></Link>
          </Button>
        )}
      </header>

      {loading ? (
        <div className="space-y-8"><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div>
      ) : failed || !d ? (
        <QueryError title="Could not load the overview" error={progress.error ?? queue.error}
          onRetry={() => { progress.refetch(); queue.refetch(); }} retrying={progress.isFetching || queue.isFetching} />
      ) : (
        d.total === 0 && progress.data ? <GetStarted p={progress.data} /> : (
        <div className="space-y-6">
          <div className="rise overflow-hidden rounded-lg border border-card-border bg-card" data-testid="grid-kpis">
            <div className="-mb-px -mr-px grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Confirmed breaches" value={String(d.confirmedBreach)} tone={d.confirmedBreach ? "bad" : undefined} testId="kpi-breaches"
                sub={`plus ${plural(d.confirmedWarning, "warning", "warnings")}`} />
              <Kpi label="Possible problems" value={String(d.openSerious.length)} tone={d.openSerious.length ? "warn" : undefined} testId="kpi-possible"
                sub={d.openHigh ? `${d.openHigh} high severity, undecided` : "undecided"} />
              <Kpi label="Rule checks passing" value={`${pct(d.compliant, d.applicable)}%`} testId="kpi-compliance"
                sub={`${d.compliant} of ${d.applicable} applicable`} />
              <Kpi label="Findings decided" value={`${d.decided}/${d.total}`} testId="kpi-decided"
                sub={`${d.undecided} left`} />
              <Kpi label="Agent proposals kept" value={d.decided ? `${pct(d.agreed, d.decided)}%` : "–"} testId="kpi-agreement"
                sub={d.decided ? `${d.agreed} of ${d.decided} accepted as proposed` : "after your first decision"} />
              <Kpi label="Cards assessed" value={`${d.products}/${d.productsInLibrary}`} testId="kpi-coverage"
                sub={plural(d.docs, "confirmed document", "confirmed documents")} />
            </div>
          </div>

          {d.total ? (
            <div className="rise grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Section title="Every rule, every card" testId="section-matrix"
                aside={<span className="text-xs text-muted-foreground">Your decision where made, otherwise the agents&apos; proposal</span>}>
                <Matrix d={d} />
              </Section>
              <Section title="Needs your decision" testId="section-needs-decision">
                <DecisionList d={d} />
              </Section>
            </div>
          ) : null}
        </div>
        )
      )}
    </div>
  );
}
