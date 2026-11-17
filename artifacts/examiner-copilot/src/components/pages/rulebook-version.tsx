"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  getGetRulebookVersionQueryKey, getListRulebooksQueryKey, useActivateRulebookVersion, useGetRulebookVersion,
} from "@workspace/api-client-react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { QueryError } from "@/components/states";
import { StatusPill } from "@/components/voice";
import { VERSION_PILL } from "@/components/pages/rulebook";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { CHECK_TYPE_LABELS, DOC_TYPE_SHORT, SEVERITY_PILL } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";

export function RulebookVersionView({ id }: { id: number }) {
  const { role, canWrite } = useCanWrite();
  const q = useGetRulebookVersion(id, { query: { enabled: Number.isFinite(id), queryKey: getGetRulebookVersionQueryKey(id) } });
  const activate = useActivateRulebookVersion();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = q.data;

  if (q.isLoading) return <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !v) return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
      <QueryError title={parseApiError(q.error).status === 404 ? "Version not found" : "Could not load this version"} error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-version" />
      <Link href="/library/rulebook" className="text-sm underline underline-offset-2" data-testid="link-back-rulebook">Back to rulebooks</Link>
    </div>
  );

  const pill = VERSION_PILL[v.status];
  const doActivate = () => {
    setError(null);
    activate.mutate({ id: v.id, data: { role } }, {
      onSuccess: () => {
        invalidate([getListRulebooksQueryKey(), getGetRulebookVersionQueryKey(v.id)]);
        toast({ title: `Version ${v.version} is active`, description: "Assessments will use it from now on." });
      },
      onError: (e) => setError(parseApiError(e).message),
    });
  };

  return (
    <PageFrame
      eyebrow={`Library · Rulebook · ${v.rulebookName}`}
      question={`${v.rulebookName}, version ${v.version}`}
      meta={<><StatusPill variant={pill.variant} label={pill.label} data-testid="status-version" /><span className="font-mono text-xs text-muted-foreground">{v.ruleCount} rules{v.sourceFileName ? ` · ${v.sourceFileName}` : ""}</span></>}
      primaryAction={v.status === "draft" ? (
        <div className="flex max-w-xs flex-col items-start gap-1.5 md:items-end">
          <Button onClick={doActivate} disabled={!canWrite || activate.isPending} data-testid="button-make-active">{activate.isPending ? "Activating…" : "Make active"}</Button>
          <p className="text-xs text-muted-foreground md:text-right">Assessments will use this version. The current active version will be retired.</p>
          <ViewerReason className="md:text-right" />
        </div>
      ) : <span className="text-xs text-muted-foreground">{v.status === "active" ? "This version is in use." : "Retired versions cannot be reactivated."}</span>}
      answer={
        <div className="space-y-2">
          <p className="text-[15px]" data-testid="text-answer">
            {v.status === "active" ? `Active since ${v.activatedAt ? format(new Date(v.activatedAt), "d MMM yyyy, HH:mm") : "—"}. Assessments use these rules.`
              : v.status === "draft" ? "Draft. Not used by assessments until you make it active."
              : "Retired. Kept for the record; past assessments may refer to it."}
          </p>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-activate-error">{error}</p> : null}
        </div>
      }
      evidence={
        <div>
          <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
            <table className="w-full text-sm" data-testid="table-rules">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Code</th><th className="px-3 py-2.5 font-medium">Title</th><th className="px-3 py-2.5 font-medium">Applies to</th>
                <th className="px-3 py-2.5 font-medium">Check</th><th className="px-3 py-2.5 font-medium">Threshold</th><th className="px-4 py-2.5 font-medium">Severity</th>
              </tr></thead>
              <tbody>
                {v.rules.map((r) => {
                  const isOpen = openRule === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border align-top" data-testid={`row-rule-${r.id}`}>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.code}</td>
                        <td className="min-w-[200px] px-3 py-2.5">
                          <button type="button" onClick={() => setOpenRule(isOpen ? null : r.id)} aria-expanded={isOpen}
                            className="flex items-start gap-1 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`button-toggle-rule-${r.id}`}>
                            <ChevronDown className={`mt-0.5 size-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />{r.title}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{r.appliesToDocTypes.map((t) => DOC_TYPE_SHORT[t]).join(", ") || "All"}</td>
                        <td className="px-3 py-2.5 text-xs">{CHECK_TYPE_LABELS[r.checkType]}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{r.threshold?.raw ?? "—"}</td>
                        <td className="px-4 py-2.5"><StatusPill variant={SEVERITY_PILL[r.severity].variant} label={SEVERITY_PILL[r.severity].label} /></td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-b border-border bg-muted/30"><td colSpan={6} className="px-4 py-3">
                          <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed" data-testid={`text-rule-${r.id}`}>{r.text}</p>
                          {r.category ? <p className="mt-1 text-xs text-muted-foreground">Category: {r.category}</p> : null}
                        </td></tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          
        </div>
      }
      next={{ href: "/library/rulebook", label: "All rulebooks" }}
    />
  );
}
