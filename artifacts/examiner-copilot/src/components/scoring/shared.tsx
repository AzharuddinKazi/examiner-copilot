"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ImportSummary } from "@workspace/api-client-react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCanWrite } from "@/lib/write-access";

export const selectClass =
  "mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function Panel({ title, description, actions, children, testId }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-lg border border-card-border bg-card" data-testid={testId}>
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Small confirm-then-delete icon button for simple rows. */
export function ConfirmDelete({ label, onConfirm, pending, testId }: { label: string; onConfirm: () => void; pending?: boolean; testId: string }) {
  const { canWrite } = useCanWrite();
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-[hsl(var(--tone-bad))]" aria-label={`Delete ${label}`} onClick={() => setOpen(true)} data-testid={testId}>
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>This is recorded in the audit log. It cannot be undone, but you can add it again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => { onConfirm(); setOpen(false); }} data-testid={`${testId}-confirm`}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CsvButton({ label, onFile, pending, testId }: { label: string; onFile: (f: File) => void; pending?: boolean; testId: string }) {
  const { canWrite } = useCanWrite();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} data-testid={`${testId}-input`} />
      <Button variant="outline" size="sm" className="bg-card" disabled={!canWrite || pending} onClick={() => ref.current?.click()} data-testid={testId}>
        <Upload aria-hidden /> {pending ? "Importing…" : label}
      </Button>
    </>
  );
}

export function ImportResult({ result, onClose }: { result: ImportSummary | null; onClose: () => void }) {
  if (!result) return null;
  return (
    <div role="status" className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="text-import-result">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          Import finished: {result.added} added, {result.updated} updated, {result.skipped} skipped.
        </p>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onClose}>Dismiss</button>
      </div>
      {result.errors.length ? (
        <ul className="mt-1.5 max-h-32 list-disc overflow-auto pl-5 text-xs text-muted-foreground">
          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "bad" | "warn" | "info" | "neutral"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", `bg-[hsl(var(--tone-${tone}-bg))] text-[hsl(var(--tone-${tone}))]`)}>{children}</span>
  );
}
