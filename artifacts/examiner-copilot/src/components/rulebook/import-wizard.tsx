"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getListRulebooksQueryKey, useCommitRulebookImport, useListRulebooks, usePreviewRulebookImport, useRequestRulebookAgentMapping,
  type AgentMappingProposal, type ColumnMapping, type RulebookImportPreview, type RulebookImportResult,
} from "@workspace/api-client-react";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, ToolText } from "@/components/voice";
import { parseApiError } from "@/lib/api-errors";
import { CHECK_TYPE_LABELS, DOC_TYPE_SHORT, REQUIRED_RULE_FIELDS, RULE_FIELDS, RULE_FIELD_LABELS, SEVERITY_PILL } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

const NONE = "__none";
const STEPS = ["Upload", "Map columns", "Check rows", "Import"];

export function ImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { canWrite } = useCanWrite();
  const rulebooks = useListRulebooks();
  const preview = usePreviewRulebookImport();
  const commit = useCommitRulebookImport();
  const askAgent = useRequestRulebookAgentMapping();
  const [agent, setAgent] = useState<AgentMappingProposal | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<RulebookImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [check, setCheck] = useState<RulebookImportResult | null>(null);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const [done, setDone] = useState<RulebookImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setStep(0); setFile(null); setPv(null); setMapping(null); setCheck(null); setTarget("new"); setName(""); setDone(null); setError(null); setAgent(null); setAgentError(null); };
  const close = (o: boolean) => { onOpenChange(o); if (!o) reset(); };

  const doPreview = () => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setError("Choose an .xlsx file."); return; }
    setError(null);
    preview.mutate({ data: { file } }, {
      onSuccess: (r) => { setPv(r); setMapping(r.proposedMapping); setName(r.fileName.replace(/\.xlsx$/i, "")); setStep(1); },
      onError: (e) => setError(parseApiError(e).message),
    });
  };
  const doAskAgent = () => {
    if (!pv) return;
    setAgentError(null);
    askAgent.mutate({ importId: pv.importId, data: {} }, {
      onSuccess: (r) => setAgent(r),
      onError: (e) => setAgentError(parseApiError(e).message),
    });
  };
  const agentDiffers = agent && mapping ? RULE_FIELDS.some((f) => (agent.mapping[f] ?? null) !== (mapping[f] ?? null)) : false;

  const doCheck = () => {
    if (!pv || !mapping) return;
    setError(null);
    commit.mutate({ data: { importId: pv.importId, mapping, dryRun: true } }, {
      onSuccess: (r) => { setCheck(r); setStep(2); },
      onError: (e) => setError(parseApiError(e).message),
    });
  };
  const doImport = () => {
    if (!pv || !mapping) return;
    setError(null);
    const isNew = target === "new";
    commit.mutate({ data: { importId: pv.importId, mapping, dryRun: false, rulebookId: isNew ? null : Number(target), rulebookName: isNew ? name.trim() : null } }, {
      onSuccess: (r) => {
        if (!r.valid || !r.versionId) { setCheck(r); setStep(2); setError("The rows did not pass the check. Fix the spreadsheet or the mapping and try again."); return; }
        invalidate([getListRulebooksQueryKey()]);
        setDone(r);
      },
      onError: (e) => setError(parseApiError(e).message),
    });
  };

  const missingRequired = mapping ? REQUIRED_RULE_FIELDS.filter((k) => !mapping[k]) : [];
  const books = rulebooks.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-testid="dialog-import-rulebook">
        <DialogHeader>
          <DialogTitle>Import rulebook</DialogTitle>
          <DialogDescription>Rules come from your spreadsheet. The tool proposes a column mapping; you check it.</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Import steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5", i === step ? "font-semibold text-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              <span className={cn("grid size-5 place-items-center rounded-full border font-mono text-[10px]", i < step || done ? "border-[hsl(var(--tone-ok))] text-[hsl(var(--tone-ok))]" : i === step ? "border-foreground" : "border-border")}>{i + 1}</span>{s}
            </li>
          ))}
        </ol>

        {done ? (
          <div className="rounded-lg border border-[hsl(var(--tone-ok)/0.3)] bg-[hsl(var(--tone-ok-bg))] p-4" role="status" data-testid="result-import-success">
            <p className="flex items-center gap-2 font-medium text-[hsl(var(--tone-ok))]"><CheckCircle2 className="size-4" aria-hidden /> Imported as version {done.version} (draft)</p>
            <p className="mt-1 text-sm">{done.rules.length} rules. It is not used until you make it active.</p>
            <Link href={`/library/rulebook/${done.versionId}`} onClick={() => close(false)} className="mt-2 inline-block text-sm font-medium underline underline-offset-2" data-testid="link-imported-version">Open version {done.version}</Link>
          </div>
        ) : step === 0 ? (
          <div className="space-y-3">
            <label htmlFor="rb-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/60 px-6 py-8 text-center hover:border-primary/60 focus-within:ring-2 focus-within:ring-ring">
              <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{file ? file.name : "Choose an .xlsx file"}</span>
              <span className="text-xs text-muted-foreground">One rule per row, headers in row 1.</span>
              <input id="rb-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} data-testid="input-file-xlsx" />
            </label>
            <a href="/api/rulebooks/template.xlsx" className="text-xs underline underline-offset-2" data-testid="link-sample-wizard">Download empty template</a>
          </div>
        ) : step === 1 && pv && mapping ? (
          <div className="space-y-4">
            <ToolText className="text-xs text-muted-foreground">{pv.fileName} · sheet "{pv.sheetName}" · {pv.rowCount} rows</ToolText>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-2" data-testid="block-agent-mapping">
              <p className="flex-1 text-xs text-muted-foreground">
                {agent
                  ? agentDiffers
                    ? `The Ingestion agent proposes a different mapping for ${RULE_FIELDS.filter((f) => (agent.mapping[f] ?? null) !== (mapping[f] ?? null)).map((f) => RULE_FIELD_LABELS[f].toLowerCase()).join(", ")}.`
                    : "The Ingestion agent agrees with this mapping."
                  : "The mapping below is from header names. You can also ask the Ingestion agent (model), which reads the headers and five sample rows."}
              </p>
              {agent && agentDiffers ? (
                <Button size="sm" variant="outline" onClick={() => setMapping({ ...agent.mapping })} data-testid="button-use-agent-mapping">Use the agent's mapping</Button>
              ) : null}
              {!agent ? (
                <Button size="sm" variant="outline" onClick={doAskAgent} disabled={!canWrite || askAgent.isPending} data-testid="button-ask-agent-mapping">
                  {askAgent.isPending ? <><Loader2 className="animate-spin" aria-hidden /> Asking…</> : "Ask the agent"}
                </Button>
              ) : null}
              {agentError ? <p role="alert" className="w-full text-xs text-[hsl(var(--tone-bad))]" data-testid="text-agent-mapping-error">{agentError}</p> : null}
            </div>
            <div className="divide-y divide-border rounded-lg border border-card-border">
              {RULE_FIELDS.map((field) => {
                const req = REQUIRED_RULE_FIELDS.includes(field);
                const reason = pv.mappingReasons.find((r) => r.field === field)?.reason;
                const agentReason = agent?.reasons.find((r) => r.field === field);
                return (
                  <div key={field} className="grid gap-2 p-3 sm:grid-cols-[160px_220px_1fr] sm:items-start" data-testid={`row-mapping-${field}`}>
                    <Label htmlFor={`map-${field}`} className="pt-2">
                      {RULE_FIELD_LABELS[field]} {req ? <span className="ml-1 rounded bg-[hsl(var(--tone-warn-bg))] px-1 text-[10px] font-semibold text-[hsl(var(--tone-warn))]">Required</span> : null}
                    </Label>
                    <Select value={mapping[field] ?? NONE} onValueChange={(v) => setMapping({ ...mapping, [field]: v === NONE ? null : v })}>
                      <SelectTrigger id={`map-${field}`} data-testid={`select-mapping-${field}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {pv.headers.filter((h) => h).map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="space-y-1">
                      {reason ? <ToolText className="text-xs text-muted-foreground">{reason}</ToolText> : null}
                      {agentReason && (agentReason.header ?? null) !== (mapping[field] ?? null) ? (
                        <ToolText className="text-xs text-[hsl(var(--tone-warn))]" data-testid={`text-agent-mapping-${field}`}>
                          Agent: {agentReason.header ? `"${agentReason.header}"` : "not mapped"}. {agentReason.reason}
                        </ToolText>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {pv.sampleRows.length ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sample rows from the sheet</p>
                <div className="overflow-x-auto rounded-lg border border-card-border">
                  <table className="w-full text-xs" data-testid="table-sample-rows">
                    <thead><tr className="border-b border-border bg-muted/50">{pv.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                    <tbody>{pv.sampleRows.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">{pv.headers.map((_, j) => <td key={j} className="max-w-[220px] truncate px-2 py-1.5 font-mono" title={r[j]}>{r[j] ?? ""}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {missingRequired.length ? <p className="text-xs text-[hsl(var(--tone-warn))]" data-testid="text-missing-required">Map the required fields first: {missingRequired.map((k) => RULE_FIELD_LABELS[k]).join(", ")}.</p> : null}
          </div>
        ) : check ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill variant={check.rowErrors.length ? "error" : "done"} label={check.rowErrors.length ? `${check.rowErrors.length} row ${check.rowErrors.length === 1 ? "error" : "errors"}` : "All rows passed"} data-testid="status-check" />
              <span className="text-xs text-muted-foreground">{check.rules.length} rules parsed</span>
            </div>
            {check.rowErrors.length ? (
              <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-bad)/0.3)]">
                <table className="w-full text-xs" data-testid="table-row-errors">
                  <thead><tr className="border-b border-border bg-[hsl(var(--tone-bad-bg))] text-left"><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Field</th><th className="px-2 py-1.5">Problem</th></tr></thead>
                  <tbody>{check.rowErrors.map((e, i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td className="px-2 py-1.5 font-mono">{e.row}</td><td className="px-2 py-1.5">{RULE_FIELD_LABELS[e.field]}</td><td className="px-2 py-1.5">{e.message}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
            {check.rules.length ? (
              <div className="max-h-64 overflow-auto rounded-lg border border-card-border">
                <table className="w-full text-xs" data-testid="table-parsed-rules">
                  <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left"><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Code</th><th className="px-2 py-1.5">Title</th><th className="px-2 py-1.5">Check</th><th className="px-2 py-1.5">Applies to</th><th className="px-2 py-1.5">Severity</th></tr></thead>
                  <tbody>{check.rules.map((r) => (
                    <tr key={r.row} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 font-mono">{r.row}</td><td className="px-2 py-1.5 font-mono">{r.code}</td><td className="px-2 py-1.5">{r.title}</td>
                      <td className="px-2 py-1.5">{CHECK_TYPE_LABELS[r.checkType]}{r.threshold ? <span className="font-mono"> {r.threshold.raw}</span> : null}</td>
                      <td className="px-2 py-1.5">{r.appliesToDocTypes.map((t) => DOC_TYPE_SHORT[t]).join(", ") || "All"}</td>
                      <td className="px-2 py-1.5"><StatusPill variant={SEVERITY_PILL[r.severity].variant} label={SEVERITY_PILL[r.severity].label} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
            {step === 3 ? (
              <fieldset className="space-y-3 rounded-lg border border-card-border p-3">
                <legend className="px-1 text-sm font-medium">Where should these rules go?</legend>
                <RadioGroup value={target} onValueChange={setTarget}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="new" id="tg-new" data-testid="radio-target-new" /><Label htmlFor="tg-new">New rulebook</Label></div>
                  {books.map((b) => (
                    <div key={b.id} className="flex items-center gap-2"><RadioGroupItem value={String(b.id)} id={`tg-${b.id}`} data-testid={`radio-target-${b.id}`} /><Label htmlFor={`tg-${b.id}`}>New version of {b.name}</Label></div>
                  ))}
                </RadioGroup>
                {target === "new" ? (
                  <div><Label htmlFor="rb-name">Rulebook name</Label>
                    <Input id="rb-name" className="mt-1.5" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-rulebook-name" /></div>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-import-error">{error}</p> : null}
        <ViewerReason />
        <DialogFooter className="gap-2">
          {done ? <Button onClick={() => close(false)} data-testid="button-import-close">Close</Button> : (
            <>
              {step > 0 ? <Button variant="outline" onClick={() => { setError(null); setStep(step === 3 ? 2 : step - 1); }} data-testid="button-import-back">Back</Button> : null}
              {step === 0 ? <Button onClick={doPreview} disabled={!canWrite || !file || preview.isPending} data-testid="button-import-preview">{preview.isPending ? "Reading file…" : "Read file"}</Button> : null}
              {step === 1 ? <Button onClick={doCheck} disabled={!canWrite || missingRequired.length > 0 || commit.isPending} data-testid="button-check-rows">{commit.isPending ? "Checking…" : "Check rows"}</Button> : null}
              {step === 2 ? <Button onClick={() => setStep(3)} disabled={!check || check.rowErrors.length > 0 || !check.valid} data-testid="button-import-continue">Continue</Button> : null}
              {step === 3 ? <Button onClick={doImport} disabled={!canWrite || !check || check.rowErrors.length > 0 || commit.isPending || (target === "new" && name.trim().length < 2)} data-testid="button-import-commit">{commit.isPending ? "Importing…" : "Import"}</Button> : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
