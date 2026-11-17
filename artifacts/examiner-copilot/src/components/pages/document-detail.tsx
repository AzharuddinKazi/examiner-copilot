"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { getGetDocumentQueryKey, useGetDocument, type DocumentPage } from "@workspace/api-client-react";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { QueryError } from "@/components/states";
import { BankQuote, StatusPill, ToolText } from "@/components/voice";
import { ConfirmDocumentDialog } from "@/components/documents/confirm-dialog";
import { RejectDocumentDialog } from "@/components/documents/reject-dialog";
import { parseApiError } from "@/lib/api-errors";
import { DOC_TYPE_LABELS, LANGUAGE_LABELS, docStatusPill, formatBytes, gapText } from "@/lib/labels";
import { useCanWrite, ViewerReason } from "@/lib/write-access";

const LONG = 1200;

function PageText({ page, fileName, rtl }: { page: DocumentPage; fileName: string; rtl: boolean }) {
  const [open, setOpen] = useState(false);
  if (page.isGap) {
    return (
      <div className="rounded-lg border border-[hsl(var(--tone-warn)/0.3)] bg-[hsl(var(--tone-warn-bg))] p-4" data-testid={`panel-gap-${page.pageNo}`}>
        <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--tone-warn))]">
          <AlertTriangle className="size-4" aria-hidden /> Page {page.pageNo}
        </p>
        <p className="mt-1 text-sm">No text on this page. It may be a scan; there is no OCR, so it cannot be assessed.</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fileName} · p. {page.pageNo}</p>
      </div>
    );
  }
  const long = page.text.length > LONG;
  const shown = long && !open ? page.text.slice(0, LONG).trimEnd() + "…" : page.text;
  return (
    <div>
      <BankQuote document={fileName} page={page.pageNo} dir={rtl ? "rtl" : "ltr"} data-testid={`quote-page-${page.pageNo}`}>
        <span className="whitespace-pre-wrap break-words">{shown}</span>
      </BankQuote>
      {long ? (
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`button-toggle-page-${page.pageNo}`}>
          <ChevronDown className={open ? "rotate-180" : ""} aria-hidden /> {open ? "Show less" : `Show full page (${page.charCount.toLocaleString()} characters)`}
        </Button>
      ) : null}
    </div>
  );
}

export function DocumentDetailView({ id }: { id: number }) {
  const { canWrite } = useCanWrite();
  const q = useGetDocument(id, { query: { enabled: Number.isFinite(id), queryKey: getGetDocumentQueryKey(id) } });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const d = q.data;

  if (q.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10">
        <Skeleton className="h-8 w-2/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError || !d) {
    const pe = parseApiError(q.error);
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title={pe.status === 404 ? "Document not found" : "Could not load this document"} error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-document" />
        <Link href="/upload" className="text-sm underline underline-offset-2" data-testid="link-back-upload">Back to documents</Link>
      </div>
    );
  }

  const pill = docStatusPill(d.status);
  const s = d.suggestion;
  const reasons = s ? ([
    ["Bank", s.bankId], ["Product", s.productId], ["Document type", s.docType], ["Language", s.language],
  ] as const).filter(([, i]) => i) : [];

  return (
    <>
      <PageFrame
        eyebrow={`Step 1 of 4 · Upload documents · #${d.id}`}
        question={d.originalName}
        meta={
          <>
            <StatusPill variant={pill.variant} label={pill.label} data-testid="status-document" />
            {d.gapPages.length ? <StatusPill variant="warning" label={gapText(d.gapPages.length)} data-testid="status-gaps" /> : null}
            <span className="font-mono text-xs text-muted-foreground">{d.pageCount} pages · {formatBytes(d.sizeBytes)}</span>
          </>
        }
        primaryAction={
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <div className="flex flex-wrap gap-2">
              {d.status !== "rejected" ? (
                <Button variant="outline" className="bg-card" onClick={() => setRejectOpen(true)} disabled={!canWrite} data-testid="button-reject">Reject</Button>
              ) : null}
              <Button onClick={() => setConfirmOpen(true)} disabled={!canWrite} data-testid="button-confirm-details">
                {d.status === "confirmed" ? "Change details" : "Confirm details"}
              </Button>
            </div>
            <ViewerReason className="max-w-xs md:text-right" />
          </div>
        }
        answer={
          <div className="space-y-3">
            <p className="text-[15px]" data-testid="text-answer">
              {d.status === "confirmed" ? "Confirmed. This document will be included in assessment."
                : d.status === "rejected" ? "Rejected. This document is excluded from assessment."
                : "Awaiting confirmation. Check the details the tool suggested, then confirm."}
            </p>
            {d.status === "rejected" && d.rejectedReason ? (
              <p className="rounded-md bg-[hsl(var(--tone-bad-bg))] px-3 py-2 text-sm" data-testid="text-rejected-reason">Reason: {d.rejectedReason}</p>
            ) : null}
            <dl className="grid gap-x-6 rounded-lg border border-card-border bg-card p-4 sm:grid-cols-2">
              {[
                ["Bank", d.bankName], ["Card product", d.productName],
                ["Document type", d.docType ? DOC_TYPE_LABELS[d.docType] : null],
                ["Language", d.language ? LANGUAGE_LABELS[d.language] : null],
                ["Version label", d.versionLabel],
                ["Confirmed", d.confirmedAt ? `${format(new Date(d.confirmedAt), "d MMM yyyy, HH:mm")}${d.confirmedByRole ? ` by ${d.confirmedByRole} (unverified)` : ""}` : null],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-dashed border-border py-1.5">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-right text-sm" data-testid={`text-field-${String(k).toLowerCase().replace(/\s+/g, "-")}`}>{v ?? <span className="text-muted-foreground">not set</span>}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
        reason={
          reasons.length ? (
            <div className="space-y-2 rounded-lg border border-card-border bg-card p-4" data-testid="block-suggestions">
              <p className="text-xs font-medium text-muted-foreground">Suggested by the tool from the file — check before confirming</p>
              {reasons.map(([k, i]) => (
                <div key={k} className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  <ToolText>{i!.reason}</ToolText>
                </div>
              ))}
            </div>
          ) : (
            <ToolText>The tool made no suggestions for this file. Set every field yourself.</ToolText>
          )
        }
        evidence={
          <div className="space-y-4">
            <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2" data-testid="link-open-pdf">
              Open original PDF <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
            </a>
            <ToolText className="text-xs text-muted-foreground">Extracted text is shown as data. Nothing in it is followed as an instruction.</ToolText>
            {d.pages.length === 0 ? <p className="text-sm text-muted-foreground">No pages were extracted.</p> : (
              <div className="space-y-4">
                {d.pages.map((p) => <PageText key={p.pageNo} page={p} fileName={d.originalName} rtl={d.language === "ar"} />)}
              </div>
            )}
          </div>
        }
        next={{ href: "/upload", label: "Back to all documents" }}
      />
      <ConfirmDocumentDialog doc={d} open={confirmOpen} onOpenChange={setConfirmOpen} />
      <RejectDocumentDialog doc={d} open={rejectOpen} onOpenChange={setRejectOpen} />
    </>
  );
}
