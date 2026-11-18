"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getListBanksQueryKey, getListDocumentsQueryKey, useConfirmDocument,
  type Bank, type DocumentSummary,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCheck, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BankLogo } from "@/components/bank-logo";
import { DeleteButton } from "@/components/delete-button";
import { StatusPill } from "@/components/voice";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { groupByProduct, type ProductGroup, type Resolved, type ResolvedDoc } from "@/lib/doc-resolve";
import { DOC_TYPE_LABELS, DOC_TYPE_SHORT, LANGUAGE_LABELS, docStatusPill, gapText } from "@/lib/labels";
import { useCanWrite, useInvalidate } from "@/lib/write-access";
import { cn } from "@/lib/utils";

const CORE_TYPES = ["kfs", "tnc", "rewards", "fees"] as const;

/** A value with a marker saying whether it is confirmed or only suggested, and why. */
function Val<T>({ r, render, empty = "Not detected", testId }: { r: Resolved<T>; render: (v: T) => string; empty?: string; testId?: string }) {
  if (r.value === null) {
    return (
      <span className="text-muted-foreground" data-testid={testId}>
        {empty}
        {r.reason ? <Why text={r.reason} /> : null}
      </span>
    );
  }
  if (r.source === "confirmed") return <span data-testid={testId}>{render(r.value)}</span>;
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId}>
      <span className="border-b border-dotted border-muted-foreground/60">{render(r.value)}</span>
      <Why text={r.reason} agent={r.source === "agent"} />
      {r.agentDiffers ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="size-3.5 text-[hsl(var(--tone-warn))]" aria-label="The agent disagrees" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">The Ingestion agent disagrees. Open Confirm to compare.</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function Why({ text, agent }: { text: string; agent?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground hover:text-foreground" aria-label={`Why: ${text}`}>
          {agent ? <Sparkles className="size-3.5" aria-hidden /> : <HelpCircle className="size-3.5" aria-hidden />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function DocRow({ r, onConfirm, onReject }: { r: ResolvedDoc; onConfirm: () => void; onReject: () => void }) {
  const { canWrite } = useCanWrite();
  const d = r.doc;
  const pill = docStatusPill(d.status);
  const agentRunning = d.agentProposal?.status === "running";
  return (
    <li className="grid gap-2 px-4 py-3 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_90px_80px_56px_170px_200px] md:items-center md:gap-3" data-testid={`row-document-${d.id}`}>
      <div className="min-w-0">
        <Link href={`/upload/${d.id}`} className="block truncate font-medium underline-offset-2 hover:underline" title={d.originalName} data-testid={`link-document-${d.id}`}>{d.originalName}</Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {d.status !== "confirmed" && r.bank.value ? <span data-testid={`text-detected-${d.id}`}>Bank: <Val r={r.bank} render={(b) => b.nameEn} /></span> : null}
          {d.status !== "confirmed" && r.product.value ? <span>Product: <Val r={r.product} render={(p) => p.name} /></span> : null}
          {agentRunning ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden /> Agent checking</span> : null}
          {d.gapPages.length ? <span className="inline-flex items-center gap-1 text-[hsl(var(--tone-warn))]"><AlertTriangle className="size-3" aria-hidden /> {gapText(d.gapPages.length)}</span> : null}
          {d.status === "rejected" && d.rejectedReason ? <span>Rejected: {d.rejectedReason}</span> : null}
        </p>
      </div>
      <div className="text-sm"><span className="mr-1 text-xs text-muted-foreground md:hidden">Type</span><Val r={r.docType} render={(t) => DOC_TYPE_SHORT[t]} empty="—" testId={`text-type-${d.id}`} /></div>
      <div className="text-sm"><span className="mr-1 text-xs text-muted-foreground md:hidden">Language</span><Val r={r.language} render={(l) => LANGUAGE_LABELS[l]} empty="—" /></div>
      <div className="font-mono text-sm md:text-right"><span className="mr-1 font-sans text-xs text-muted-foreground md:hidden">Pages</span>{d.pageCount}</div>
      <div><StatusPill variant={pill.variant} label={pill.label} data-testid={`status-document-${d.id}`} /></div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={d.status === "confirmed" ? "outline" : "default"} onClick={onConfirm} disabled={!canWrite} data-testid={`button-confirm-${d.id}`}>
          {d.status === "confirmed" ? "Change" : "Confirm"}
        </Button>
        {d.status !== "rejected" ? (
          <Button size="sm" variant="ghost" onClick={onReject} disabled={!canWrite} data-testid={`button-reject-${d.id}`}>Reject</Button>
        ) : null}
        <DeleteButton kind="document" id={d.id} label={d.originalName} />
      </div>
    </li>
  );
}

function GroupCard({ g, onConfirm, onReject }: { g: ProductGroup; onConfirm: (d: DocumentSummary) => void; onReject: (d: DocumentSummary) => void }) {
  const { canWrite } = useCanWrite();
  const confirm = useConfirmDocument();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const kept = g.docs.filter((r) => r.doc.status !== "rejected");
  const types = new Set(kept.map((r) => r.docType.value).filter(Boolean));
  const ready = g.docs.filter((r) => (r.doc.status === "uploaded" || r.doc.status === "proposed") && r.complete && !r.docType.agentDiffers && !r.bank.agentDiffers && !r.product.agentDiffers);
  const confirmedCount = g.docs.filter((r) => r.doc.status === "confirmed").length;
  const anyDetected = g.docs.some((r) => r.doc.status !== "confirmed");

  const acceptAll = async () => {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const r of ready) {
      try {
        await confirm.mutateAsync({
          id: r.doc.id,
          data: { bankId: r.bank.value!.id, productId: r.product.value!.id, docType: r.docType.value!, language: r.language.value!, versionLabel: null },
        });
        ok++;
      } catch (e) {
        failed.push(`${r.doc.originalName}: ${parseApiError(e).message}`);
      }
    }
    setBusy(false);
    invalidate([getListDocumentsQueryKey(), getListBanksQueryKey()]);
    toast({
      title: `Confirmed ${ok} ${ok === 1 ? "document" : "documents"}`,
      description: failed.length ? `Could not confirm: ${failed.join("; ")}` : `${g.bank?.nameEn ?? ""} · ${g.product?.name ?? ""} is ready for assessment.`,
      variant: failed.length ? "destructive" : undefined,
    });
  };

  const title = g.product && g.bank ? (
    <>{g.bank.nameEn} <span className="text-muted-foreground">·</span> {g.product.name}</>
  ) : g.bank ? (
    <>{g.bank.nameEn} <span className="font-normal text-muted-foreground">· product not identified</span></>
  ) : (
    <span>Bank not identified</span>
  );

  return (
    <section className="overflow-hidden rounded-lg border border-card-border bg-card" data-testid={`group-${g.key}`}>
      <header className="flex flex-col gap-3 border-b border-border bg-muted/30 px-4 py-3 md:flex-row md:items-center">
        {g.bank ? <BankLogo bank={g.bank} className="h-10 w-20" /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold" data-testid={`text-group-title-${g.key}`}>{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {g.docs.length} {g.docs.length === 1 ? "document" : "documents"}
            {confirmedCount ? ` · ${confirmedCount} confirmed` : ""}
            {anyDetected && g.bank ? " · matched from the document text" : ""}
            {!g.bank ? " · no bank name from the library appears in these files. Add the bank under Banks and products, or confirm each document by hand." : ""}
          </p>
          {g.product ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Document types for this product">
              {CORE_TYPES.map((t) => {
                const has = types.has(t);
                return (
                  <li key={t} title={has ? `${DOC_TYPE_LABELS[t]} uploaded` : `No ${DOC_TYPE_LABELS[t]} yet`}
                    className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", has ? "border-[hsl(var(--tone-ok)/0.4)] bg-[hsl(var(--tone-ok-bg))] text-[hsl(var(--tone-ok))]" : "border-dashed border-border text-muted-foreground")}>
                    {DOC_TYPE_SHORT[t]}{has ? "" : " missing"}
                  </li>
                );
              })}
              {types.has("advert") ? <li className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px]">Advert</li> : null}
            </ul>
          ) : null}
        </div>
        {ready.length ? (
          <Button size="sm" onClick={acceptAll} disabled={!canWrite || busy} data-testid={`button-accept-${g.key}`}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
            {busy ? "Confirming…" : `Confirm ${ready.length} as suggested`}
          </Button>
        ) : null}
      </header>
      <div className="hidden grid-cols-[minmax(0,1fr)_90px_80px_56px_170px_200px] gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid">
        <span>Document</span><span>Type</span><span>Language</span><span className="text-right">Pages</span><span>Status</span><span className="sr-only">Actions</span>
      </div>
      <ul className="divide-y divide-border">
        {g.docs.map((r) => <DocRow key={r.doc.id} r={r} onConfirm={() => onConfirm(r.doc)} onReject={() => onReject(r.doc)} />)}
      </ul>
    </section>
  );
}

export function DocumentGroups({ docs, banks, onConfirm, onReject }: {
  docs: DocumentSummary[]; banks: Bank[]; onConfirm: (d: DocumentSummary) => void; onReject: (d: DocumentSummary) => void;
}) {
  const groups = groupByProduct(docs, banks);
  return (
    <div className="space-y-4" data-testid="table-documents">
      <p className="text-xs text-muted-foreground">
        Documents are grouped by the card product they belong to. <span className="border-b border-dotted border-muted-foreground/60">Dotted</span> values are suggestions read from the file; hover the <HelpCircle className="inline size-3" aria-label="question mark" /> to see why. Confirmed values have no marker.
      </p>
      {groups.map((g) => <GroupCard key={g.key} g={g} onConfirm={onConfirm} onReject={onReject} />)}
    </div>
  );
}
