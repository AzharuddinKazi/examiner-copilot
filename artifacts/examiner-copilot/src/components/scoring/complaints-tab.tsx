"use client";

import { useMemo, useState } from "react";
import {
  getListComplaintThemesQueryKey, getListComplaintsQueryKey, useCreateComplaint, useCreateComplaintTheme, useDeleteComplaint,
  useDeleteComplaintTheme, useImportComplaintThemes, useImportComplaints, useListBanks, useListComplaintThemes, useListComplaints,
  useUpdateComplaint, useUpdateComplaintTheme, type Complaint, type ComplaintTheme, type ImportSummary,
} from "@workspace/api-client-react";
import { MessageSquareWarning, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, QueryError } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite, useInvalidate } from "@/lib/write-access";
import { ConfirmDelete, CsvButton, ImportResult, Panel, Pill, selectClass } from "./shared";

// ---------------- Category → theme ----------------

function ThemeDialog({ open, onOpenChange, themes, initial }: { open: boolean; onOpenChange: (o: boolean) => void; themes: string[]; initial: { id?: number; category: string; theme: string } }) {
  const { canWrite } = useCanWrite();
  const create = useCreateComplaintTheme();
  const update = useUpdateComplaintTheme();
  const invalidate = useInvalidate();
  const [category, setCategory] = useState(initial.category);
  const [theme, setTheme] = useState(initial.theme);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const submit = () => {
    setError(null);
    const data = { category: category.trim(), theme };
    const opts = {
      onSuccess: () => { invalidate([getListComplaintThemesQueryKey(), getListComplaintsQueryKey()]); onOpenChange(false); },
      onError: (e: unknown) => setError(parseApiError(e).message),
    };
    if (initial.id) update.mutate({ id: initial.id, data }, opts);
    else create.mutate({ data }, opts);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-complaint-theme">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Change mapping" : "Map a complaint category"}</DialogTitle>
          <DialogDescription>Complaints in this category are shown next to the chosen theme’s rating.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div>
            <Label htmlFor="ct-cat">Complaint category (as written in the complaint data)</Label>
            <Input id="ct-cat" className="mt-1.5" value={category} maxLength={200} onChange={(e) => setCategory(e.target.value)} data-testid="input-theme-category" />
          </div>
          <div>
            <Label htmlFor="ct-theme">Scoring theme</Label>
            <select id="ct-theme" className={selectClass} value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="select-theme">
              <option value="" disabled>Choose a theme</option>
              {themes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-theme-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canWrite || !category.trim() || !theme || pending} data-testid="button-submit-theme">{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThemeMap() {
  const { canWrite } = useCanWrite();
  const q = useListComplaintThemes();
  const del = useDeleteComplaintTheme();
  const imp = useImportComplaintThemes();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ id?: number; category: string; theme: string } | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return <QueryError title="Could not load the category mapping" error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const refresh = () => invalidate([getListComplaintThemesQueryKey(), getListComplaintsQueryKey()]);
  return (
    <Panel
      testId="panel-theme-map"
      title="Complaint category → scoring theme"
      description="Complaint data uses the bank’s own categories. Each one is mapped to a scoring theme; unmapped categories are kept but not shown on scorecards."
      actions={
        <>
          <CsvButton label="Import CSV" testId="button-import-themes" pending={imp.isPending}
            onFile={(file) => imp.mutate({ data: { file } }, { onSuccess: (r) => { setResult(r); refresh(); }, onError: (e) => toast({ title: "Import failed", description: parseApiError(e).message, variant: "destructive" }) })} />
          <Button size="sm" disabled={!canWrite} onClick={() => setDialog({ category: "", theme: "" })} data-testid="button-add-theme"><Plus aria-hidden /> Add mapping</Button>
        </>
      }
    >
      <ImportResult result={result} onClose={() => setResult(null)} />
      {d.unmappedCategories.length ? (
        <div className="mb-3 rounded-md border border-[hsl(var(--tone-warn)/0.3)] bg-[hsl(var(--tone-warn-bg))] p-3 text-sm" data-testid="text-unmapped">
          <p className="font-medium text-[hsl(var(--tone-warn))]">Not mapped to a theme yet</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {d.unmappedCategories.map((c) => (
              <Button key={c} variant="outline" size="sm" className="h-7 bg-card" disabled={!canWrite} onClick={() => setDialog({ category: c, theme: "" })} data-testid={`button-map-${c}`}>
                <Plus aria-hidden /> {c}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {d.items.length ? (
        <table className="w-full text-sm" data-testid="table-theme-map">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1.5 font-normal">Category</th><th className="py-1.5 font-normal">Theme</th><th className="py-1.5 text-right font-normal">Complaints</th><th className="w-16" /></tr></thead>
          <tbody>
            {d.items.map((t: ComplaintTheme) => (
              <tr key={t.id} className="border-t border-dashed border-border" data-testid={`row-theme-${t.id}`}>
                <td className="py-2 pr-2">{t.category}</td>
                <td className="py-2 pr-2">{t.theme}{!t.knownTheme ? <span className="ml-1.5"><Pill tone="warn">not a current theme</Pill></span> : null}</td>
                <td className="py-2 text-right font-mono">{t.complaintCount}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex">
                    {canWrite ? (
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Edit ${t.category}`} onClick={() => setDialog({ id: t.id, category: t.category, theme: t.theme })} data-testid={`button-edit-theme-${t.id}`}>
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                    <ConfirmDelete label={`the mapping for “${t.category}”`} testId={`button-delete-theme-${t.id}`} pending={del.isPending}
                      onConfirm={() => del.mutate({ id: t.id }, { onSuccess: refresh, onError: (e) => toast({ title: "Not deleted", description: parseApiError(e).message, variant: "destructive" }) })} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">No categories mapped yet.</p>}
      {dialog ? <ThemeDialog key={`${dialog.id ?? "new"}-${dialog.category}`} open onOpenChange={(o) => !o && setDialog(null)} themes={d.themes} initial={dialog} /> : null}
    </Panel>
  );
}

// ---------------- Complaint counts ----------------

function ComplaintDialog({ initial, onClose }: { initial: Partial<Complaint>; onClose: () => void }) {
  const { canWrite } = useCanWrite();
  const banks = useListBanks();
  const create = useCreateComplaint();
  const update = useUpdateComplaint();
  const invalidate = useInvalidate();
  const [bankId, setBankId] = useState<number | "">(initial.bankId ?? "");
  const [productId, setProductId] = useState<number | "">(initial.productId ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [count, setCount] = useState(initial.count !== undefined ? String(initial.count) : "");
  const [period, setPeriod] = useState(initial.period ?? "");
  const [error, setError] = useState<string | null>(null);
  const bank = banks.data?.items.find((b) => b.id === bankId);
  const n = Number(count);
  const valid = bankId !== "" && category.trim() && count !== "" && Number.isInteger(n) && n >= 0;
  const pending = create.isPending || update.isPending;
  const submit = () => {
    if (!valid) return;
    setError(null);
    const data = { bankId: bankId as number, productId: productId === "" ? null : productId, category: category.trim(), count: n, period: period.trim() || null };
    const opts = { onSuccess: () => { invalidate([getListComplaintsQueryKey(), getListComplaintThemesQueryKey()]); onClose(); }, onError: (e: unknown) => setError(parseApiError(e).message) };
    if (initial.id) update.mutate({ id: initial.id, data }, opts);
    else create.mutate({ data }, opts);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-complaint">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit complaint count" : "Add complaint count"}</DialogTitle>
          <DialogDescription>Leave the card empty when the count is for all of the bank’s credit cards.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-bank">Bank</Label>
              <select id="cp-bank" className={selectClass} value={bankId} onChange={(e) => { setBankId(e.target.value ? Number(e.target.value) : ""); setProductId(""); }} data-testid="select-complaint-bank">
                <option value="">Choose a bank</option>
                {banks.data?.items.map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cp-prod">Card <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <select id="cp-prod" className={selectClass} value={productId} disabled={!bank} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")} data-testid="select-complaint-product">
                <option value="">All cards</option>
                {bank?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="cp-cat">Category</Label>
            <Input id="cp-cat" className="mt-1.5" value={category} maxLength={200} onChange={(e) => setCategory(e.target.value)} data-testid="input-complaint-category" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-count">Number of complaints</Label>
              <Input id="cp-count" className="mt-1.5" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))} data-testid="input-complaint-count" />
            </div>
            <div>
              <Label htmlFor="cp-period">Period <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="cp-period" className="mt-1.5" placeholder="e.g. 2026-Q1" value={period} maxLength={60} onChange={(e) => setPeriod(e.target.value)} data-testid="input-complaint-period" />
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-complaint-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canWrite || !valid || pending} data-testid="button-submit-complaint">{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Counts() {
  const { canWrite } = useCanWrite();
  const q = useListComplaints();
  const del = useDeleteComplaint();
  const imp = useImportComplaints();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Partial<Complaint> | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [bankFilter, setBankFilter] = useState<string>("");
  const items = q.data?.items ?? [];
  const banks = useMemo(() => [...new Set(items.map((c) => c.bankName))].sort(), [items]);
  const shown = bankFilter ? items.filter((c) => c.bankName === bankFilter) : items;
  const byBank = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) m.set(c.bankName, (m.get(c.bankName) ?? 0) + c.count);
    return m;
  }, [items]);
  const refresh = () => invalidate([getListComplaintsQueryKey(), getListComplaintThemesQueryKey()]);

  return (
    <Panel
      testId="panel-complaints"
      title="Complaint counts"
      description="Import a summary (bank, category, count) or a case-level register with one row per complaint. Case-level files are counted per bank, category and quarter, credit cards only; personal details are not stored."
      actions={
        <>
          <CsvButton label="Import CSV" testId="button-import-complaints" pending={imp.isPending}
            onFile={(file) => imp.mutate({ data: { file } }, { onSuccess: (r) => { setResult(r); refresh(); }, onError: (e) => toast({ title: "Import failed", description: parseApiError(e).message, variant: "destructive" }) })} />
          <Button size="sm" disabled={!canWrite} onClick={() => setDialog({})} data-testid="button-add-complaint"><Plus aria-hidden /> Add count</Button>
        </>
      }
    >
      <ImportResult result={result} onClose={() => setResult(null)} />
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.isError ? (
        <QueryError title="Could not load complaints" error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState icon={MessageSquareWarning} title="No complaint data yet">Import a CSV or add counts by hand.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => setBankFilter("")} className={`rounded-full border px-2.5 py-0.5 ${bankFilter === "" ? "border-foreground bg-foreground text-background" : "border-border"}`} data-testid="filter-bank-all">
              All banks · {items.reduce((n, c) => n + c.count, 0)}
            </button>
            {banks.map((b) => (
              <button key={b} type="button" onClick={() => setBankFilter(b)} className={`rounded-full border px-2.5 py-0.5 ${bankFilter === b ? "border-foreground bg-foreground text-background" : "border-border"}`} data-testid={`filter-bank-${b}`}>
                {b} · {byBank.get(b)}
              </button>
            ))}
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm" data-testid="table-complaints">
              <thead className="sticky top-0 bg-card"><tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-normal">Bank</th><th className="py-1.5 font-normal">Category</th><th className="py-1.5 font-normal">Theme</th><th className="py-1.5 font-normal">Period</th><th className="py-1.5 text-right font-normal">Count</th><th className="w-16" />
              </tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-t border-dashed border-border" data-testid={`row-complaint-${c.id}`}>
                    <td className="py-1.5 pr-2">{c.bankName}{c.productName ? <span className="block text-xs text-muted-foreground">{c.productName}</span> : null}</td>
                    <td className="py-1.5 pr-2">{c.category}</td>
                    <td className="py-1.5 pr-2 text-xs">{c.theme ?? <Pill tone="warn">not mapped</Pill>}</td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{c.period ?? "—"}</td>
                    <td className="py-1.5 text-right font-mono">{c.count}</td>
                    <td className="py-1.5 text-right">
                      <span className="inline-flex">
                        {canWrite ? (
                          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Edit" onClick={() => setDialog(c)} data-testid={`button-edit-complaint-${c.id}`}><Pencil className="size-3.5" aria-hidden /></Button>
                        ) : null}
                        <ConfirmDelete label={`${c.count} ${c.category} complaint(s) for ${c.bankName}`} testId={`button-delete-complaint-${c.id}`} pending={del.isPending}
                          onConfirm={() => del.mutate({ id: c.id }, { onSuccess: refresh, onError: (e) => toast({ title: "Not deleted", description: parseApiError(e).message, variant: "destructive" }) })} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {dialog ? <ComplaintDialog initial={dialog} onClose={() => setDialog(null)} /> : null}
    </Panel>
  );
}

export function ComplaintsTab() {
  return (
    <div className="space-y-4">
      <ThemeMap />
      <Counts />
    </div>
  );
}
