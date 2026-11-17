"use client";

import { Fragment, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, ScrollText, ShieldCheck, ShieldX, RotateCw } from "lucide-react";
import { useListAuditEvents, useVerifyAuditChain, type AuditEvent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { ToolText } from "@/components/voice";
import { cn } from "@/lib/utils";

const LIMIT = 25;
const ALL = "__all__";

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/60 p-3 font-mono text-[12px] leading-relaxed">
        {value === undefined || value === null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function fmt(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : format(d, "d MMM yyyy, HH:mm:ss");
}

export function AuditLog() {
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState<string>(ALL);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const events = useListAuditEvents({ limit: LIMIT, offset, action: action === ALL ? undefined : action });
  const verify = useVerifyAuditChain();
  const page = events.data;
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const chainPill = verify.isLoading ? (
    <Skeleton className="h-6 w-44 rounded-full" />
  ) : verify.isError || !verify.data ? (
    <span className="text-xs text-[hsl(var(--tone-bad))]" data-testid="text-chain-error">Chain could not be verified</span>
  ) : verify.data.valid ? (
    <span data-testid="status-chain" className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--tone-ok)/0.25)] bg-[hsl(var(--tone-ok-bg))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--tone-ok))]">
      <ShieldCheck className="size-3.5" aria-hidden /> Chain intact ({verify.data.checked} events)
    </span>
  ) : (
    <span data-testid="status-chain" className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--tone-bad)/0.25)] bg-[hsl(var(--tone-bad-bg))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--tone-bad))]">
      <ShieldX className="size-3.5" aria-hidden /> Chain broken at event #{verify.data.brokenAtId ?? "?"}
    </span>
  );

  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + LIMIT, total);

  return (
    <PageFrame
      eyebrow="Assurance · Audit log"
      question="Who did what, and when?"
      primaryAction={
        <Button onClick={() => verify.refetch()} disabled={verify.isFetching} data-testid="button-verify-chain">
          <RotateCw className={cn(verify.isFetching && "animate-spin")} aria-hidden /> Verify chain
        </Button>
      }
      meta={
        <>
          {chainPill}
          {verify.data ? <ToolText as="span" className="text-[11px] text-muted-foreground">checked {fmt(verify.data.checkedAt)}</ToolText> : null}
        </>
      }
      answer={
        verify.isError ? (
          <QueryError title="Could not verify the audit chain" error={verify.error} onRetry={() => verify.refetch()} retrying={verify.isFetching} testId="error-verify" />
        ) : (
          <p className="max-w-prose text-sm text-muted-foreground">
            Every action is appended to a hash chain. Each event's hash covers the previous one, so altering any past event breaks the chain from that point.
            Roles shown are self-selected and unverified.
          </p>
        )
      }
      evidence={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="audit-action" className="text-xs text-muted-foreground">Action</label>
              <Select value={action} onValueChange={(v) => { setAction(v); setOffset(0); }}>
                <SelectTrigger id="audit-action" className="h-8 w-[200px] bg-card text-xs" data-testid="select-audit-action"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All actions</SelectItem>
                  {(page?.actions ?? []).map((a) => <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {page ? <ToolText as="span" className="text-xs" data-testid="text-audit-range">{from}–{to} of {total}</ToolText> : null}
          </div>

          {events.isLoading ? (
            <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : events.isError || !page ? (
            <QueryError title="Could not load audit events" error={events.error} onRetry={() => events.refetch()} retrying={events.isFetching} />
          ) : page.items.length === 0 ? (
            <EmptyState icon={ScrollText} title={action === ALL ? "No events recorded yet" : "No events for this action"} testId="empty-audit">
              {action === ALL ? "Changing your role in the header is the first thing that will appear here." : "Choose another action or show all."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
              <table className="w-full min-w-[760px] text-sm" data-testid="table-audit">
                <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"><span className="sr-only">Expand</span></th>
                    <th className="px-3 py-2 font-semibold">Time</th>
                    <th className="px-3 py-2 font-semibold">Role (unverified)</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Entity</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                    <th className="px-3 py-2 font-semibold">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((e: AuditEvent) => {
                    const isOpen = open.has(e.id);
                    const broken = verify.data && !verify.data.valid && verify.data.brokenAtId === e.id;
                    return (
                      <Fragment key={e.id}>
                        <tr className={cn("border-b border-border last:border-0", broken && "bg-[hsl(var(--tone-bad-bg))]")} data-testid={`row-audit-${e.id}`}>
                          <td className="px-2 py-2">
                            <Button variant="ghost" size="icon" className="size-7" aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Hide" : "Show"} details for event ${e.id}`} onClick={() => toggle(e.id)} data-testid={`button-expand-audit-${e.id}`}>
                              <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} aria-hidden />
                            </Button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{fmt(e.ts)}</td>
                          <td className="px-3 py-2 text-xs">{e.role ?? "—"} <span className="text-muted-foreground">· unverified</span></td>
                          <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.entityType}{e.entityId ? `#${e.entityId}` : ""}</td>
                          <td className="px-3 py-2">{e.summary}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={e.hash}>{e.hash.slice(0, 10)}</td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b border-border bg-muted/20" data-testid={`row-audit-detail-${e.id}`}>
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <Json label="Before" value={e.before} />
                                <Json label="After" value={e.after} />
                              </div>
                              <ToolText className="mt-2 break-all text-[11px] text-muted-foreground">event #{e.id} · {e.dataset} · hash {e.hash}</ToolText>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {page && total > LIMIT ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" className="bg-card" disabled={offset === 0 || events.isFetching}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))} data-testid="button-audit-prev">
                <ChevronLeft aria-hidden /> Newer
              </Button>
              <Button variant="outline" size="sm" className="bg-card" disabled={offset + LIMIT >= total || events.isFetching}
                onClick={() => setOffset(offset + LIMIT)} data-testid="button-audit-next">
                Older <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      }
      next={{ href: "/assurance/limitations", label: "Limitations" }}
    />
  );
}
