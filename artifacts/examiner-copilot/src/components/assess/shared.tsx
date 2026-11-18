"use client";

import Link from "next/link";
import type { CandidateDocument, StatusCounts } from "@workspace/api-client-react";
import { AlertTriangle } from "lucide-react";
import { StatusPill } from "@/components/voice";
import { DOC_TYPE_SHORT, FINDING_STATUS_ORDER, FINDING_STATUS_PLURAL, LANGUAGE_LABELS, gapText } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function countsSentence(c: StatusCounts) {
  const parts = FINDING_STATUS_ORDER.filter((k) => c[k] > 0).map((k) => {
    const [one, many] = FINDING_STATUS_PLURAL[k];
    return `${c[k]} ${c[k] === 1 ? one : many}`;
  });
  return parts.length ? parts.join(", ") : "No findings";
}

export function totalCount(c: StatusCounts) {
  return FINDING_STATUS_ORDER.reduce((a, k) => a + c[k], 0);
}

export function CountPills({ c, testId }: { c: StatusCounts; testId?: string }) {
  const shown = FINDING_STATUS_ORDER.filter((k) => c[k] > 0);
  if (!shown.length) return <span className="text-xs text-muted-foreground">No findings</span>;
  return (
    <span className="flex flex-wrap gap-1" data-testid={testId}>
      {shown.map((k) => <StatusPill key={k} variant={k} label={`${c[k]}`} className="px-2" />)}
      <span className="sr-only">{countsSentence(c)}</span>
    </span>
  );
}

export function DocChip({ d, link = false }: { d: CandidateDocument; link?: boolean }) {
  const inner = (
    <>
      <span className="font-mono text-[11px] font-medium">{DOC_TYPE_SHORT[d.docType]}</span>
      <span className="text-muted-foreground">{LANGUAGE_LABELS[d.language]}</span>
      {d.gapPages.length ? (
        <span className="inline-flex items-center gap-0.5 text-[hsl(var(--tone-warn))]" title={gapText(d.gapPages.length)}>
          <AlertTriangle className="size-3" aria-hidden /><span className="sr-only">{gapText(d.gapPages.length)}</span>
          <span aria-hidden className="font-mono text-[10px]">{d.gapPages.length}</span>
        </span>
      ) : null}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-xs";
  return link ? (
    <Link href={`/upload/${d.id}`} title={d.originalName} className={cn(cls, "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} data-testid={`chip-document-${d.id}`}>
      {inner}<span className="max-w-[180px] truncate text-muted-foreground">{d.originalName}</span>
    </Link>
  ) : (
    <span title={d.originalName} className={cls} data-testid={`chip-document-${d.id}`}>{inner}</span>
  );
}

export function UsageBar({ label, used, limit, testId }: { label: string; used: number; limit: number; testId?: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span>{label}</span><span className="text-foreground">{used.toLocaleString()}{limit > 0 ? ` / ${limit.toLocaleString()}` : " · no limit"}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div className={cn("h-full origin-left rounded-full transition-transform duration-500", pct > 85 ? "bg-[hsl(var(--tone-warn))]" : "bg-primary")}
          style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
