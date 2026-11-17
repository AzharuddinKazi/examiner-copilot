"use client";

import { useState } from "react";
import {
  getListBanksQueryKey, useCreateBank, useCreateProduct, useListBanks, type Bank,
} from "@workspace/api-client-react";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { BankLogo } from "@/components/bank-logo";
import { EmptyState, QueryError } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";

function BankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { canWrite } = useCanWrite();
  const create = useCreateBank();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [en, setEn] = useState(""); const [ar, setAr] = useState(""); const [error, setError] = useState<string | null>(null);
  const valid = en.trim().length >= 2;
  const submit = () => {
    if (!valid) return;
    setError(null);
    create.mutate({ data: { nameEn: en.trim(), nameAr: ar.trim() || null } }, {
      onSuccess: (b) => {
        invalidate([getListBanksQueryKey()]);
        toast({ title: "Bank added", description: b.nameEn });
        setEn(""); setAr(""); onOpenChange(false);
      },
      onError: (e) => setError(parseApiError(e).message),
    });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setError(null); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-add-bank">
        <DialogHeader><DialogTitle>Add bank</DialogTitle><DialogDescription>Use the bank's published name.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div>
            <Label htmlFor="bk-en">Name in English</Label>
            <Input id="bk-en" className="mt-1.5" value={en} maxLength={120} onChange={(e) => setEn(e.target.value)} data-testid="input-bank-name-en" />
          </div>
          <div>
            <Label htmlFor="bk-ar">Name in Arabic <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="bk-ar" dir="rtl" lang="ar" className="mt-1.5 font-arabic text-base" value={ar} maxLength={120} onChange={(e) => setAr(e.target.value)} data-testid="input-bank-name-ar" />
          </div>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-bank-error">{error}</p> : null}
          <ViewerReason />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bank">Cancel</Button>
            <Button type="submit" disabled={!canWrite || !valid || create.isPending} data-testid="button-submit-bank">{create.isPending ? "Adding…" : "Add bank"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ bank, onDone }: { bank: Bank; onDone: () => void }) {
  const { canWrite } = useCanWrite();
  const create = useCreateProduct();
  const invalidate = useInvalidate();
  const [name, setName] = useState(""); const [tier, setTier] = useState(""); const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;
  return (
    <form className="mt-3 space-y-2 rounded-md border border-dashed border-border p-3" data-testid={`form-add-product-${bank.id}`}
      onSubmit={(e) => {
        e.preventDefault(); if (!valid) return; setError(null);
        create.mutate({ id: bank.id, data: { name: name.trim(), cardTier: tier.trim() || null } }, {
          onSuccess: () => { invalidate([getListBanksQueryKey()]); setName(""); setTier(""); onDone(); },
          onError: (er) => setError(parseApiError(er).message),
        });
      }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
        <div>
          <Label htmlFor={`pr-name-${bank.id}`} className="text-xs">Product name</Label>
          <Input id={`pr-name-${bank.id}`} className="mt-1 h-8" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid={`input-product-name-${bank.id}`} autoFocus />
        </div>
        <div>
          <Label htmlFor={`pr-tier-${bank.id}`} className="text-xs">Card tier <span className="text-muted-foreground">(optional)</span></Label>
          <Input id={`pr-tier-${bank.id}`} className="mt-1 h-8" value={tier} maxLength={60} placeholder="e.g. Platinum" onChange={(e) => setTier(e.target.value)} data-testid={`input-product-tier-${bank.id}`} />
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-[hsl(var(--tone-bad))]" data-testid={`text-product-error-${bank.id}`}>{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canWrite || !valid || create.isPending} data-testid={`button-submit-product-${bank.id}`}>{create.isPending ? "Adding…" : "Add product"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} data-testid={`button-cancel-product-${bank.id}`}>Cancel</Button>
      </div>
    </form>
  );
}

function BankCard({ bank }: { bank: Bank }) {
  const { canWrite } = useCanWrite();
  const [adding, setAdding] = useState(false);
  return (
    <article className="rounded-lg border border-card-border bg-card p-4" data-testid={`card-bank-${bank.id}`}>
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <BankLogo bank={bank} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold" data-testid={`text-bank-name-${bank.id}`}>{bank.nameEn}</h3>
          {bank.nameAr ? <p dir="rtl" lang="ar" className="font-arabic text-base text-muted-foreground" data-testid={`text-bank-name-ar-${bank.id}`}>{bank.nameAr}</p> : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{bank.documentCount} {bank.documentCount === 1 ? "doc" : "docs"}</span>
      </header>
      {bank.products.length ? (
        <ul className="divide-y divide-dashed divide-border">
          {bank.products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid={`row-product-${p.id}`}>
              <span>{p.name}{p.cardTier ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{p.cardTier}</span> : null}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.documentCount} docs</span>
            </li>
          ))}
        </ul>
      ) : <p className="py-3 text-sm text-muted-foreground">No card products yet.</p>}
      {adding ? <ProductForm bank={bank} onDone={() => setAdding(false)} /> : (
        <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => setAdding(true)} disabled={!canWrite} data-testid={`button-add-product-${bank.id}`}>
          <Plus aria-hidden /> Add product
        </Button>
      )}
    </article>
  );
}

export function BanksView() {
  const { canWrite } = useCanWrite();
  const q = useListBanks();
  const [open, setOpen] = useState(false);
  const banks = q.data?.items ?? [];
  const productCount = banks.reduce((n, b) => n + b.products.length, 0);
  return (
    <>
      <PageFrame
        eyebrow="Library · Banks and products"
        question="Which banks and cards are in scope?"
        primaryAction={
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <Button onClick={() => setOpen(true)} disabled={!canWrite} data-testid="button-add-bank"><Plus aria-hidden /> Add bank</Button>
            <ViewerReason className="max-w-xs md:text-right" />
          </div>
        }
        answer={q.isLoading ? <Skeleton className="h-6 w-2/3" /> : q.isError ? (
          <QueryError title="Could not load banks" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-banks" />
        ) : (
          <p className="text-[15px]" data-testid="text-answer">
            {banks.length === 0 ? "No banks yet. Add a bank and at least one card product before confirming documents."
              : `${banks.length} ${banks.length === 1 ? "bank" : "banks"} with ${productCount} card ${productCount === 1 ? "product" : "products"} in scope.`}
          </p>
        )}
        reason={<p className="text-sm text-muted-foreground">Every uploaded document is attached to one bank and one card product, so findings can be compared per card.</p>}
        evidence={q.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        ) : q.isError ? null : banks.length === 0 ? (
          <EmptyState icon={Building2} title="No banks yet" testId="empty-banks">
            <p>Add the banks whose card disclosures you are examining.</p>
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{banks.map((b) => <BankCard key={b.id} bank={b} />)}</div>
        )}
        next={{ href: "/upload", label: "Upload documents" }}
      />
      <BankDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
