"use client";

import {
  getGetDocumentQueryKey, getListDocumentsQueryKey, useListBanks, useRequestDocumentAgentProposal,
  type AgentField, type DocumentSummary,
} from "@workspace/api-client-react";
import { CheckCircle2, Loader2, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankQuote, ToolText } from "@/components/voice";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { DOC_TYPE_LABELS, LANGUAGE_LABELS } from "@/lib/labels";
import { useCanWrite, useInvalidate } from "@/lib/write-access";
import { cn } from "@/lib/utils";

const FIELDS = [
  ["bankId", "Bank"],
  ["productId", "Product"],
  ["docType", "Document type"],
  ["language", "Language"],
] as const;

const AGREEMENT: Record<AgentField["agreement"], string | null> = {
  agrees: "Same as the rule-based suggestion",
  differs: "Differs from the rule-based suggestion",
  only_agent: "The rule-based check had no suggestion",
  only_rules: null,
  neither: null,
};

export function useAgentNames() {
  const banks = useListBanks();
  const list = banks.data?.items ?? [];
  return (field: (typeof FIELDS)[number][0], v: string | number | null) => {
    if (v === null) return null;
    if (field === "bankId") return list.find((b) => b.id === v)?.nameEn ?? `Bank ${v}`;
    if (field === "productId") return list.flatMap((b) => b.products).find((p) => p.id === v)?.name ?? `Product ${v}`;
    if (field === "docType") return DOC_TYPE_LABELS[v as keyof typeof DOC_TYPE_LABELS] ?? String(v);
    return LANGUAGE_LABELS[v as keyof typeof LANGUAGE_LABELS] ?? String(v);
  };
}

/** The Ingestion agent's checked proposal, shown next to (never instead of) the rule-based suggestion. */
export function AgentProposalPanel({ doc }: { doc: DocumentSummary }) {
  const p = doc.agentProposal;
  const { role, canWrite } = useCanWrite();
  const ask = useRequestDocumentAgentProposal();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const name = useAgentNames();
  const running = p?.status === "running" || ask.isPending;

  const askAgain = () =>
    ask.mutate({ id: doc.id, data: { role } }, {
      onSuccess: () => invalidate([getGetDocumentQueryKey(doc.id), getListDocumentsQueryKey()]),
      onError: (e) => toast({ title: "Could not ask the Ingestion agent", description: parseApiError(e).message, variant: "destructive" }),
    });

  return (
    <div className="space-y-3 rounded-lg border border-card-border bg-card p-4" data-testid="block-agent-proposal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Ingestion agent (model) — a proposal; you confirm</p>
        {doc.status !== "rejected" ? (
          <Button variant="ghost" size="sm" onClick={askAgain} disabled={!canWrite || running} data-testid="button-ask-agent">
            <RotateCw className={running ? "animate-spin" : ""} aria-hidden /> {p ? "Ask again" : "Ask the agent"}
          </Button>
        ) : null}
      </div>
      {!p ? (
        <p className="text-sm text-muted-foreground" data-testid="text-agent-none">The agent has not looked at this file.</p>
      ) : p.status === "running" ? (
        <p role="status" className="flex items-center gap-2 text-sm" data-testid="text-agent-running">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Reading the first two pages…
        </p>
      ) : p.status === "failed" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-[hsl(var(--tone-bad))]" data-testid="text-agent-failed">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {p.error ?? "The agent did not answer."} The rule-based suggestion is unaffected.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-dashed divide-border">
            {FIELDS.map(([k, label]) => {
              const f = p[k];
              if (!f) return null;
              const v = name(k, f.value);
              const note = AGREEMENT[f.agreement];
              return (
                <li key={k} className="grid gap-1 py-2 sm:grid-cols-[120px_1fr]" data-testid={`agent-field-${k}`}>
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="space-y-1.5">
                    <p className="text-sm">
                      {v ?? <span className="text-muted-foreground">No proposal</span>}
                      {v && note ? (
                        <span className={cn("ml-2 text-xs", f.agreement === "differs" ? "text-[hsl(var(--tone-warn))]" : "text-muted-foreground")}>{note}</span>
                      ) : null}
                    </p>
                    <ToolText className="text-xs text-muted-foreground">{f.reason}</ToolText>
                    {f.quote ? (
                      <div>
                        <BankQuote document={doc.originalName} page={f.quote.page} className="px-3 py-2" dir={/[\u0600-\u06FF]/.test(f.quote.quote) ? "rtl" : "ltr"}>
                          {f.quote.quote}
                        </BankQuote>
                        <span className={cn("mt-1 inline-flex items-center gap-1 text-xs", f.quote.verified ? "text-muted-foreground" : "text-[hsl(var(--tone-bad))]")}>
                          {f.quote.verified ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                          {f.quote.verified ? "Quote found in the document" : "Quote not found in the document"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
