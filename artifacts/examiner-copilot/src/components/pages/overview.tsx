"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Cpu, Landmark, Settings } from "lucide-react";
import { useGetLlmStatus, useGetWorkspaceProgress } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { QueryError } from "@/components/states";
import { StepCounts } from "@/components/step-counts";
import { StatusPill, ToolText } from "@/components/voice";
import { cn } from "@/lib/utils";

export function Overview() {
  const progress = useGetWorkspaceProgress();
  const llm = useGetLlmStatus();
  const data = progress.data;
  const nextStep = data?.steps.find((s) => s.key === data.nextStepKey);
  const firstRun = !!data && data.steps.every((s) => s.state === "not_started") && data.library.banks === 0 && data.library.rulebookVersions === 0;

  const lib = data
    ? [
        { label: "Banks", value: data.library.banks, href: "/library/banks" },
        { label: "Products", value: data.library.products, href: "/library/banks" },
        { label: "Rulebook versions", value: data.library.rulebookVersions, href: "/library/rulebook" },
        { label: "Active rules", value: data.library.activeRules, href: "/library/rulebook" },
      ]
    : [];

  return (
    <PageFrame
      eyebrow="Overview"
      question="Where do we stand?"
      primaryAction={
        progress.isLoading ? (
          <Skeleton className="h-9 w-56" />
        ) : (
          <Button asChild disabled={!nextStep} data-testid="button-continue">
            <Link href={nextStep?.href ?? "/upload"}>
              Continue where you left off <ArrowRight aria-hidden />
            </Link>
          </Button>
        )
      }
      answer={
        progress.isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : progress.isError || !data ? (
          <QueryError title="Could not load workspace progress" error={progress.error} onRetry={() => progress.refetch()} retrying={progress.isFetching} />
        ) : (
          <div className="space-y-4">
            {firstRun ? (
              <div className="rounded-lg border border-card-border bg-card p-5" data-testid="card-first-run">
                <p className="font-medium">Nothing has been examined yet.</p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  A review runs in four steps. You bring the documents and the rulebook; the agents read and propose; you decide;
                  and the tool drafts a notice that is never sent. Start by adding documents.
                </p>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-md bg-paper p-3 font-serif text-sm" data-testid="legend-first-run-bank">The bank's words</div>
                  <div className="rounded-md bg-muted p-3 font-mono" data-testid="legend-first-run-tool">The tool's analysis</div>
                  <div className="rounded-md border border-pen/30 p-3 font-serif text-sm italic text-pen" data-testid="legend-first-run-examiner">Your judgement</div>
                </div>
              </div>
            ) : null}
            <ol className="overflow-hidden rounded-lg border border-card-border bg-card">
              {data.steps.map((s) => {
                const isNext = s.key === data.nextStepKey;
                return (
                  <li key={s.key} className={cn("border-b border-border last:border-0", isNext && "bg-[hsl(var(--tone-info-bg)/0.5)]")}>
                    <Link href={s.href} className="group flex gap-4 p-4 hover:bg-muted/50" data-testid={`link-step-${s.key}`}>
                      <span className="font-mono text-2xl font-light leading-none text-muted-foreground">{s.number}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <span className="font-medium">{s.title}</span>
                          <span className="text-sm text-muted-foreground">{s.question}</span>
                          {isNext ? <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-info))]">Next</span> : null}
                        </div>
                        <StepCounts step={s} />
                        <ToolText data-testid={`text-step-summary-${s.key}`}>{s.summary}</ToolText>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        )
      }
      reason={
        data ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {lib.map((l) => (
              <Link key={l.label} href={l.href} className="rounded-lg border border-card-border bg-card p-3 hover:bg-muted/40"
                data-testid={`link-library-${l.label.replace(/\s+/g, "-").toLowerCase()}`}>
                <p className="font-mono text-2xl">{l.value}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {l.label.startsWith("Rule") || l.label.startsWith("Active") ? <BookOpen className="size-3" aria-hidden /> : <Landmark className="size-3" aria-hidden />}
                  {l.label}
                </p>
              </Link>
            ))}
          </div>
        ) : progress.isLoading ? <Skeleton className="h-20 w-full" /> : null
      }
      evidence={
        llm.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : llm.isError || !llm.data ? (
          <QueryError title="Could not read model provider status" error={llm.error} onRetry={() => llm.refetch()} retrying={llm.isFetching} testId="error-llm" />
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 sm:flex-row sm:items-center" data-testid="card-llm-status">
            <Cpu className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Model provider</span>
                <StatusPill variant={llm.data.configured ? "done" : "warning"} label={llm.data.configured ? "Configured" : "Not configured"} data-testid="status-llm" />
              </div>
              <ToolText>{llm.data.provider}{llm.data.model ? ` · ${llm.data.model}` : ""} — {llm.data.message}</ToolText>
            </div>
            {!llm.data.configured ? (
              <Button asChild variant="outline" size="sm" className="bg-card" data-testid="link-llm-settings">
                <Link href="/settings"><Settings aria-hidden /> Open settings</Link>
              </Button>
            ) : null}
          </div>
        )
      }
      next={{ href: nextStep?.href ?? "/upload", label: nextStep?.title ?? "Upload documents" }}
    />
  );
}
