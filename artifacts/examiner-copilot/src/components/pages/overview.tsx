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
import { SEVERITY_PILL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ThemeView } from "@/components/overview/theme-view";

/* ---------- data shaping ---------- */

type Outcome = "breach" | "warning" | "needs_review" | "compliant" | "not_applicable" | "rejected";
const SERIOUS = new Set(["breach", "warning", "needs_review"]);

/** A decision counts once it is final: approved, or a routine accept that needs no approval. */
const isFinal = (i: ReviewItem) => !!i.decision && (i.decision.approvalStatus === "not_required" || i.decision.approvalStatus === "approved");
/** What the record says now: the examiner's final decision if there is one, else the agents' proposal. */
function outcome(i: ReviewItem): Outcome {
  if (isFinal(i)) return i.decision!.finalStatus ?? "rejected";
  return i.proposedStatus;
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function useDashboard(q: { items: ReviewItem[]; products: ReviewProduct[] } | undefined, p: WorkspaceProgress | undefined) {
  return useMemo(() => {
    if (!q || !p) return null;
    const items = q.items;
    const decided = items.filter(isFinal);
    const undecided = items.filter((i) => !i.decision || i.decision.approvalStatus === "returned");
    const awaiting = items.filter((i) => i.decision?.approvalStatus === "awaiting").length;
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

    return {
      total: items.length, decided: decided.length, undecided: undecided.length,
      compliant, applicable: applicable.length,
      confirmedBreach, confirmedWarning, openSerious, openHigh, agreed, awaiting,
      products: q.products.length, productsInLibrary: p.library.products, docs, notices,
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
                sub={d.awaiting ? `${d.undecided} left · ${d.awaiting} awaiting approval` : `${d.undecided} left`} />
              <Kpi label="Agent proposals kept" value={d.decided ? `${pct(d.agreed, d.decided)}%` : "–"} testId="kpi-agreement"
                sub={d.decided ? `${d.agreed} of ${d.decided} accepted as proposed` : "after your first decision"} />
              <Kpi label="Cards assessed" value={`${d.products}/${d.productsInLibrary}`} testId="kpi-coverage"
                sub={plural(d.docs, "confirmed document", "confirmed documents")} />
            </div>
          </div>

          {d.total ? (
            <div className="rise grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Section title="How each theme rates, next to complaints" testId="section-themes"
                aside={<span className="text-xs text-muted-foreground">Weakest first · select a row to open its first open finding</span>}>
                <ThemeView products={queue.data!.products} items={queue.data!.items} />
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
