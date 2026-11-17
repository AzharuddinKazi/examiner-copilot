"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  getListBanksQueryKey, getListDocumentsQueryKey, getListRulebooksQueryKey,
  useListDocuments, useUploadDocument,
  type DocumentSummary,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, FileText, FileUp, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { StatusPill, ToolText } from "@/components/voice";
import { ConfirmDocumentDialog } from "@/components/documents/confirm-dialog";
import { RejectDocumentDialog } from "@/components/documents/reject-dialog";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { DOC_TYPE_LABELS, DOC_TYPE_SHORT, LANGUAGE_LABELS, docStatusPill, formatBytes, gapText } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

type UploadRow = {
  key: string; name: string; size: number;
  state: "queued" | "uploading" | "done" | "duplicate" | "error";
  message?: string; docId?: number;
};

function Counts({ c }: { c: { total: number; awaiting: number; confirmed: number; rejected: number; withGaps: number } }) {
  const items = [
    { k: "total", label: "Total", v: c.total },
    { k: "awaiting", label: "Awaiting confirmation", v: c.awaiting },
    { k: "confirmed", label: "Confirmed", v: c.confirmed },
    { k: "rejected", label: "Rejected", v: c.rejected },
    { k: "gaps", label: "With extraction gaps", v: c.withGaps, warn: c.withGaps > 0 },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-card-border bg-card sm:grid-cols-5" data-testid="strip-document-counts">
      {items.map((i) => (
        <div key={i.k} className="border-b border-r border-border px-4 py-3 last:border-r-0 sm:border-b-0">
          <dt className="text-[11px] text-muted-foreground">{i.label}</dt>
          <dd className={cn("font-mono text-xl font-medium", i.warn && "text-[hsl(var(--tone-warn))]")} data-testid={`text-count-${i.k}`}>{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RowActions({ doc, onConfirm, onReject }: { doc: DocumentSummary; onConfirm: () => void; onReject: () => void }) {
  const { canWrite } = useCanWrite();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant={doc.status === "confirmed" ? "outline" : "default"} onClick={onConfirm} disabled={!canWrite} data-testid={`button-confirm-${doc.id}`}>
        {doc.status === "confirmed" ? "Change" : "Confirm"}
      </Button>
      {doc.status !== "rejected" ? (
        <Button size="sm" variant="ghost" onClick={onReject} disabled={!canWrite} data-testid={`button-reject-${doc.id}`}>Reject</Button>
      ) : null}
    </div>
  );
}

function DocMeta({ doc }: { doc: DocumentSummary }) {
  return (
    <span className="text-xs text-muted-foreground">
      {doc.bankName ?? "No bank yet"}{doc.productName ? ` · ${doc.productName}` : ""}
    </span>
  );
}

function GapWarning({ doc }: { doc: DocumentSummary }) {
  if (doc.gapPages.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--tone-warn))]" data-testid={`text-gap-${doc.id}`}>
      <AlertTriangle className="size-3.5" aria-hidden /> {gapText(doc.gapPages.length)}
    </span>
  );
}

function DocumentTable({ docs, onConfirm, onReject }: {
  docs: DocumentSummary[]; onConfirm: (d: DocumentSummary) => void; onReject: (d: DocumentSummary) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-card-border bg-card md:block">
        <table className="w-full text-sm" data-testid="table-documents">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Document</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Language</th>
              <th className="px-3 py-2.5 text-right font-medium">Pages</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const pill = docStatusPill(d.status);
              return (
                <tr key={d.id} className="border-b border-border align-top last:border-0 hover:bg-muted/40" data-testid={`row-document-${d.id}`}>
                  <td className="max-w-[280px] px-4 py-3">
                    <Link href={`/upload/${d.id}`} className="block truncate font-medium underline-offset-2 hover:underline" data-testid={`link-document-${d.id}`}>{d.originalName}</Link>
                    <DocMeta doc={d} />
                    <div><GapWarning doc={d} /></div>
                  </td>
                  <td className="px-3 py-3" title={d.docType ? DOC_TYPE_LABELS[d.docType] : undefined}>{d.docType ? DOC_TYPE_SHORT[d.docType] : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-3">{d.language ? LANGUAGE_LABELS[d.language] : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-3 text-right font-mono">{d.pageCount}</td>
                  <td className="px-3 py-3"><StatusPill variant={pill.variant} label={pill.label} data-testid={`status-document-${d.id}`} /></td>
                  <td className="px-4 py-3"><RowActions doc={d} onConfirm={() => onConfirm(d)} onReject={() => onReject(d)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" data-testid="list-documents">
        {docs.map((d) => {
          const pill = docStatusPill(d.status);
          return (
            <li key={d.id} className="rounded-lg border border-card-border bg-card p-3" data-testid={`card-document-${d.id}`}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/upload/${d.id}`} className="min-w-0 break-all font-medium underline-offset-2 hover:underline" data-testid={`link-document-mobile-${d.id}`}>{d.originalName}</Link>
                <StatusPill variant={pill.variant} label={pill.label} />
              </div>
              <DocMeta doc={d} />
              <p className="mt-1 text-xs text-muted-foreground">
                {d.docType ? DOC_TYPE_LABELS[d.docType] : "Type not set"} · {d.language ? LANGUAGE_LABELS[d.language] : "Language not set"} · <span className="font-mono">{d.pageCount}</span> pages
              </p>
              <GapWarning doc={d} />
              <div className="mt-2"><RowActions doc={d} onConfirm={() => onConfirm(d)} onReject={() => onReject(d)} /></div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function UploadView() {
  const { role, canWrite } = useCanWrite();
  const docs = useListDocuments({
    query: { queryKey: getListDocumentsQueryKey(), refetchInterval: (qq) => (qq.state.data?.items.some((d) => d.agentProposal?.status === "running") ? 3000 : false) },
  });
  const upload = useUploadDocument();
  const invalidate = useInvalidate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<DocumentSummary | null>(null);
  const [rejectDoc, setRejectDoc] = useState<DocumentSummary | null>(null);
  const maxBytes = docs.data?.limits.maxBytes;

  const patch = (key: string, p: Partial<UploadRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || !canWrite || busy) return;
    const files = Array.from(list);
    if (!files.length) return;
    const stamp = Date.now();
    const next: (UploadRow & { file: File })[] = files.map((f, i) => {
      const base = { key: `${stamp}-${i}`, name: f.name, size: f.size, file: f };
      if (!f.name.toLowerCase().endsWith(".pdf")) return { ...base, state: "error", message: "Only PDF files can be uploaded." };
      if (maxBytes && f.size > maxBytes) return { ...base, state: "error", message: `Larger than the ${formatBytes(maxBytes)} limit.` };
      return { ...base, state: "queued" };
    });
    setRows((rs) => [...next.map(({ file: _f, ...r }) => r), ...rs]);
    setBusy(true);
    for (const r of next) {
      if (r.state !== "queued") continue;
      patch(r.key, { state: "uploading" });
      try {
        const d = await upload.mutateAsync({ data: { file: r.file, role } });
        patch(r.key, {
          state: "done", docId: d.id,
          message: d.gapPages.length ? `Uploaded, ${d.pageCount} pages. ${gapText(d.gapPages.length)}.` : `Uploaded, ${d.pageCount} pages with text.`,
        });
      } catch (e) {
        const pe = parseApiError(e);
        if (pe.status === 409 && pe.existingId) patch(r.key, { state: "duplicate", docId: pe.existingId, message: pe.message });
        else patch(r.key, { state: "error", message: pe.message });
      }
    }
    setBusy(false);
    invalidate([getListDocumentsQueryKey(), getListBanksQueryKey()]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  const items = docs.data?.items ?? [];
  const c = docs.data?.counts;

  const answer = docs.isLoading ? <Skeleton className="h-16 w-full" /> : docs.isError || !docs.data ? (
    <QueryError title="Could not load documents" error={docs.error} onRetry={() => docs.refetch()} retrying={docs.isFetching} testId="error-documents" />
  ) : (
    <div className="space-y-3">
      <p className="text-[15px]" data-testid="text-answer">
        {c!.total === 0 ? "No documents yet. Upload the disclosures for one card product to begin."
          : c!.awaiting > 0 ? `${c!.total} ${c!.total === 1 ? "document" : "documents"} uploaded; ${c!.awaiting} still need you to confirm bank, product, type and language.`
          : `All ${c!.confirmed} kept documents are confirmed${c!.rejected ? ` and ${c!.rejected} rejected` : ""}. You can move on to assessment.`}
      </p>
      <Counts c={c!} />
    </div>
  );

  return (
    <>
    <PageFrame
      eyebrow="Step 1 of 4 · Upload documents"
      question="Which documents are we examining?"
      primaryAction={
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <Button onClick={() => inputRef.current?.click()} disabled={!canWrite || busy} data-testid="button-upload-pdfs">
            <FileUp aria-hidden /> {busy ? "Uploading…" : "Upload PDFs"}
          </Button>
          <ViewerReason className="max-w-xs md:text-right" />
        </div>
      }
      answer={answer}
      reason={
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Each document needs a bank, a card product, a type and a language before it can be assessed. The tool suggests these from the file; you confirm or correct them.</p>
          <p className="max-w-prose text-sm text-muted-foreground">Pages without a text layer (scans) are flagged as gaps; there is no OCR.</p>
        </div>
      }
      evidence={
        docs.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : docs.isError ? null : items.length === 0 ? (
          <EmptyState icon={FileText} title="No documents yet" testId="empty-documents">
            <p>Upload the four disclosures for a card product:</p>
            <ul className="mx-auto mt-3 grid max-w-md gap-1.5 text-left sm:grid-cols-2">
              {(["kfs", "tnc", "rewards", "fees"] as const).map((t) => (
                <li key={t} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <span className="font-mono text-[11px] text-muted-foreground">{DOC_TYPE_SHORT[t]}</span>
                  <span className="block font-medium text-foreground">{DOC_TYPE_LABELS[t]}</span>
                </li>
              ))}
            </ul>
          </EmptyState>
        ) : (
          <DocumentTable docs={items} onConfirm={setConfirmDoc} onReject={setRejectDoc} />
        )
      }
      action={
        <div className="space-y-3">
          <div
            role="button" tabIndex={canWrite ? 0 : -1} aria-disabled={!canWrite}
            onClick={() => canWrite && inputRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && canWrite) { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); if (canWrite) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            data-testid="dropzone-upload"
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              drag ? "border-primary bg-primary/5" : "border-border bg-card/60",
              canWrite ? "cursor-pointer hover:border-primary/60" : "cursor-not-allowed opacity-70",
            )}
          >
            <FileUp className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Drop PDFs here or choose files</p>
            <p className="text-xs text-muted-foreground">
              PDF only{maxBytes ? `, up to ${formatBytes(maxBytes)} each` : ""}{docs.data ? `, up to ${docs.data.limits.maxPages} pages` : ""}. Files upload one at a time.
            </p>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" tabIndex={-1}
              onChange={(e) => handleFiles(e.target.files)} data-testid="input-file-pdf" aria-label="Choose PDF files" />
          </div>
          {rows.length ? (
            <ul className="divide-y divide-border rounded-lg border border-card-border bg-card" aria-live="polite" data-testid="list-upload-results">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-3 px-4 py-2.5" data-testid={`row-upload-${r.key}`}>
                  {r.state === "uploading" || r.state === "queued" ? <Loader2 className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", r.state === "uploading" && "animate-spin")} aria-hidden />
                    : r.state === "done" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-ok))]" aria-hidden />
                    : r.state === "duplicate" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-warn))]" aria-hidden />
                    : <XCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-bad))]" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{r.name} <span className="text-muted-foreground">· {formatBytes(r.size)}</span></p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-upload-result-${r.key}`}>
                      {r.state === "queued" ? "Waiting" : r.state === "uploading" ? "Uploading and extracting text…"
                        : r.state === "duplicate" ? <>Already uploaded. {r.docId ? <Link href={`/upload/${r.docId}`} className="underline underline-offset-2" data-testid={`link-existing-${r.docId}`}>Open the existing document</Link> : null}</>
                        : r.message}
                    </p>
                  </div>
                  {r.state === "done" && r.docId ? (
                    <Link href={`/upload/${r.docId}`} className="shrink-0 text-xs font-medium underline underline-offset-2" data-testid={`link-uploaded-${r.docId}`}>Review</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      }
      next={{ href: "/assess", label: "Assess" }}
    />
    {confirmDoc ? <ConfirmDocumentDialog doc={confirmDoc} open onOpenChange={(o) => !o && setConfirmDoc(null)} /> : null}
    {rejectDoc ? <RejectDocumentDialog doc={rejectDoc} open onOpenChange={(o) => !o && setRejectDoc(null)} /> : null}
    </>
  );
}
