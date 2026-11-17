"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getGetDocumentQueryKey, getListBanksQueryKey, getListDocumentsQueryKey,
  useConfirmDocument, useListBanks,
  type AgentField, type DocLanguage, type DocType, type DocumentSummary, type SuggestionItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolText } from "@/components/voice";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { DOC_TYPE_LABELS, DOC_TYPES, LANGUAGE_LABELS, LANGUAGES } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";

function Suggestion({ item, agent, testId }: { item: SuggestionItem | undefined; agent: AgentField | null | undefined; testId: string }) {
  const rules = item && item.value !== null && item.value !== undefined;
  // Show the agent's reason only when it fills a gap or disagrees; when it agrees the rule reason is enough.
  const agentShown = agent && agent.value !== null && (agent.agreement === "differs" || agent.agreement === "only_agent");
  if (!rules && !agentShown) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {rules ? <ToolText className="text-[11.5px] text-muted-foreground" data-testid={testId}>{item!.reason}</ToolText> : null}
      {agentShown ? (
        <ToolText className="text-[11.5px] text-muted-foreground" data-testid={`${testId}-agent`}>
          {agent!.agreement === "differs" ? "Agent disagrees: " : "Agent: "}{agent!.reason}
        </ToolText>
      ) : null}
    </div>
  );
}

/** Rule-based value first; the agent's checked value only fills a gap. */
function sugStr(item: SuggestionItem | undefined, agent?: AgentField | null) {
  if (item && item.value !== null && item.value !== undefined) return String(item.value);
  return agent && agent.value !== null ? String(agent.value) : "";
}

export function ConfirmDocumentDialog({
  doc, open, onOpenChange,
}: { doc: DocumentSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role, canWrite } = useCanWrite();
  const banks = useListBanks();
  const confirm = useConfirmDocument();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const s = doc.suggestion;
  const ap = doc.agentProposal?.status === "done" ? doc.agentProposal : null;

  const [bankId, setBankId] = useState("");
  const [productId, setProductId] = useState("");
  const [docType, setDocType] = useState("");
  const [language, setLanguage] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBankId(doc.bankId ? String(doc.bankId) : sugStr(s?.bankId, ap?.bankId));
    setProductId(doc.productId ? String(doc.productId) : sugStr(s?.productId, ap?.productId));
    setDocType(doc.docType ?? sugStr(s?.docType, ap?.docType));
    setLanguage(doc.language ?? sugStr(s?.language, ap?.language));
    setVersionLabel(doc.versionLabel ?? "");
    setError(null);
  }, [open, doc, s, ap]);

  const bankList = banks.data?.items ?? [];
  const products = useMemo(() => bankList.find((b) => String(b.id) === bankId)?.products ?? [], [bankList, bankId]);
  const noLibrary = banks.isSuccess && (bankList.length === 0 || bankList.every((b) => b.products.length === 0));
  const valid = bankId && productId && docType && language && products.some((p) => String(p.id) === productId);

  const submit = () => {
    if (!valid) return;
    setError(null);
    confirm.mutate(
      {
        id: doc.id,
        data: {
          role, bankId: Number(bankId), productId: Number(productId),
          docType: docType as DocType, language: language as DocLanguage,
          versionLabel: versionLabel.trim() || null,
        },
      },
      {
        onSuccess: (d) => {
          invalidate([getListDocumentsQueryKey(), getGetDocumentQueryKey(doc.id), getListBanksQueryKey()]);
          toast({ title: "Details confirmed", description: `${d.originalName} is ready for assessment.` });
          onOpenChange(false);
        },
        onError: (e) => setError(parseApiError(e).message),
      },
    );
  };

  const hasSuggestion = (!!s && [s.bankId, s.productId, s.docType, s.language].some((i) => i && i.value !== null)) || (!!ap && [ap.bankId, ap.productId, ap.docType, ap.language].some((i) => i && i.value !== null));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="dialog-confirm-document">
        <DialogHeader>
          <DialogTitle>Confirm document details</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{doc.originalName}</DialogDescription>
        </DialogHeader>
        {hasSuggestion ? (
          <p className="rounded-md bg-[hsl(var(--tone-info-bg))] px-3 py-2 text-xs text-[hsl(var(--tone-info))]" data-testid="text-suggestion-note">
            Filled in from the rule-based suggestion and the Ingestion agent's proposal. Check every field before confirming.
          </p>
        ) : null}
        {banks.isLoading ? <Skeleton className="h-48 w-full" /> : noLibrary ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm" data-testid="text-no-library">
            There are no banks with card products yet.{" "}
            <Link href="/library/banks" className="font-medium underline underline-offset-2" data-testid="link-library-banks">
              Add a bank and product in the library
            </Link>{" "}
            first.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="cf-bank">Bank</Label>
              <Select value={bankId} onValueChange={(v) => { setBankId(v); setProductId(""); }}>
                <SelectTrigger id="cf-bank" className="mt-1.5" data-testid="select-bank"><SelectValue placeholder="Choose a bank" /></SelectTrigger>
                <SelectContent>
                  {bankList.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nameEn}</SelectItem>)}
                </SelectContent>
              </Select>
              <Suggestion item={s?.bankId} agent={ap?.bankId} testId="text-suggest-bank" />
            </div>
            <div>
              <Label htmlFor="cf-product">Card product</Label>
              <Select value={productId} onValueChange={setProductId} disabled={!bankId}>
                <SelectTrigger id="cf-product" className="mt-1.5" data-testid="select-product">
                  <SelectValue placeholder={bankId ? (products.length ? "Choose a product" : "This bank has no products") : "Choose a bank first"} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.cardTier ? ` · ${p.cardTier}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Suggestion item={s?.productId} agent={ap?.productId} testId="text-suggest-product" />
              {bankId && products.length === 0 ? (
                <Link href="/library/banks" className="mt-1 inline-block text-xs underline underline-offset-2" data-testid="link-add-product">Add a product to this bank</Link>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cf-type">Document type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="cf-type" className="mt-1.5" data-testid="select-doc-type"><SelectValue placeholder="Choose a type" /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
                <Suggestion item={s?.docType} agent={ap?.docType} testId="text-suggest-doc-type" />
              </div>
              <div>
                <Label htmlFor="cf-lang">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="cf-lang" className="mt-1.5" data-testid="select-language"><SelectValue placeholder="Choose a language" /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l]}</SelectItem>)}</SelectContent>
                </Select>
                <Suggestion item={s?.language} agent={ap?.language} testId="text-suggest-language" />
              </div>
            </div>
            <div>
              <Label htmlFor="cf-version">Version label <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="cf-version" className="mt-1.5" maxLength={60} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="e.g. March 2025" data-testid="input-version-label" />
            </div>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-confirm-error">{error}</p> : null}
        <ViewerReason />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-confirm">Cancel</Button>
          <Button onClick={submit} disabled={!canWrite || !valid || confirm.isPending} data-testid="button-submit-confirm">
            {confirm.isPending ? "Confirming…" : "Confirm details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
