"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useListRulebooks, type RulebookVersionStatus } from "@workspace/api-client-react";
import { BookOpen, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { StatusPill, type StatusVariant } from "@/components/voice";
import { ImportWizard } from "@/components/rulebook/import-wizard";
import { DemoLoadButton } from "@/components/pages/upload";
import { useCanWrite, ViewerReason } from "@/lib/write-access";

export const VERSION_PILL: Record<RulebookVersionStatus, { variant: StatusVariant; label: string }> = {
  draft: { variant: "draft", label: "Draft" },
  active: { variant: "done", label: "Active" },
  retired: { variant: "not_applicable", label: "Retired" },
};
const fmt = (d: string | null) => (d ? format(new Date(d), "d MMM yyyy") : "—");

export function RulesFooterNote() {
  return <p className="mt-6 text-xs italic text-muted-foreground" data-testid="text-rules-not-law">Sample rules are not law. Examiners interpret rules; the tool does not.</p>;
}

export function RulebookView() {
  const { canWrite } = useCanWrite();
  const q = useListRulebooks();
  const [open, setOpen] = useState(false);
  const books = q.data?.items ?? [];
  const activeId = q.data?.activeVersionId ?? null;
  const active = books.flatMap((b) => b.versions.map((v) => ({ ...v, name: b.name }))).find((v) => v.id === activeId);

  return (
    <>
      <PageFrame
        eyebrow="Library · Rulebook"
        question="Which rules are we applying?"
        primaryAction={
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <Button onClick={() => setOpen(true)} disabled={!canWrite} data-testid="button-import-rulebook"><FileSpreadsheet aria-hidden /> Import rulebook (.xlsx)</Button>
            <a href="/api/rulebooks/sample.xlsx" className="inline-flex items-center gap-1 text-xs underline underline-offset-2" data-testid="link-sample-rulebook"><Download className="size-3" aria-hidden /> Download sample rulebook</a>
            <ViewerReason className="max-w-xs md:text-right" />
          </div>
        }
        answer={q.isLoading ? <Skeleton className="h-24 w-full" /> : q.isError ? (
          <QueryError title="Could not load rulebooks" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-rulebooks" />
        ) : active ? (
          <Link href={`/library/rulebook/${active.id}`} className="block rounded-lg border-2 border-[hsl(var(--tone-ok)/0.35)] bg-card p-5 transition-colors hover:bg-muted/40" data-testid="card-active-version">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill variant="done" label="Active" />
              <span className="font-mono text-xs text-muted-foreground">v{active.version}</span>
            </div>
            <p className="mt-2 text-lg font-semibold">{active.name}</p>
            <p className="text-sm text-muted-foreground">
              Assessments use these <span className="font-mono text-foreground">{active.ruleCount}</span> rules. Active since {fmt(active.activatedAt)}{active.sourceFileName ? ` · from ${active.sourceFileName}` : ""}.
            </p>
          </Link>
        ) : (
          <p className="text-[15px]" data-testid="text-answer">{books.length ? "No version is active yet. Open a draft and make it active before assessing." : "No rulebook yet. Import one from a spreadsheet."}</p>
        )}
        reason={<p className="text-sm text-muted-foreground">The rulebook is supplied by examiners. Only one version is active at a time, so every assessment can say exactly which rules it used.</p>}
        evidence={q.isLoading ? <Skeleton className="h-40 w-full" /> : q.isError ? null : books.length === 0 ? (
          <EmptyState icon={BookOpen} title="No rulebooks yet" testId="empty-rulebooks">
            <p>Import an .xlsx with one rule per row. Start from the sample if you need a template.</p>
            <DemoLoadButton />
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {books.map((b) => (
              <section key={b.id} className="rounded-lg border border-card-border bg-card" data-testid={`card-rulebook-${b.id}`}>
                <h3 className="border-b border-border px-4 py-3 font-semibold">{b.name}</h3>
                <ul className="divide-y divide-border">
                  {[...b.versions].sort((x, y) => y.version - x.version).map((v) => (
                    <li key={v.id}>
                      <Link href={`/library/rulebook/${v.id}`} className="grid gap-1 px-4 py-3 text-sm hover:bg-muted/40 sm:grid-cols-[60px_100px_1fr_auto] sm:items-center" data-testid={`link-version-${v.id}`}>
                        <span className="font-mono">v{v.version}</span>
                        <StatusPill variant={VERSION_PILL[v.status].variant} label={VERSION_PILL[v.status].label} className="w-fit" />
                        <span className="min-w-0 truncate text-muted-foreground"><span className="font-mono text-foreground">{v.ruleCount}</span> rules{v.sourceFileName ? ` · ${v.sourceFileName}` : ""}</span>
                        <span className="font-mono text-xs text-muted-foreground">created {fmt(v.createdAt)}{v.activatedAt ? ` · active ${fmt(v.activatedAt)}` : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <RulesFooterNote />
          </div>
        )}
        next={{ href: "/upload", label: "Upload documents" }}
      />
      <ImportWizard open={open} onOpenChange={setOpen} />
    </>
  );
}
