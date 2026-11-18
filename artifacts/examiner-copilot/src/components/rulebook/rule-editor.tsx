"use client";

import { useState } from "react";
import {
  getGetRulebookVersionQueryKey, getListRulebooksQueryKey, useDeleteRule, useUpdateRule,
  type CheckType, type DocType, type Rule, type Severity,
} from "@workspace/api-client-react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete, selectClass } from "@/components/scoring/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { CHECK_TYPE_LABELS, DOC_TYPE_SHORT } from "@/lib/labels";
import { useCanWrite, useInvalidate } from "@/lib/write-access";

const DOC_TYPES: DocType[] = ["kfs", "tnc", "rewards", "fees", "advert"];
const SEVERITIES: Severity[] = ["low", "medium", "high"];

function RuleDialog({ rule, versionId, onClose }: { rule: Rule; versionId: number; onClose: () => void }) {
  const { canWrite } = useCanWrite();
  const update = useUpdateRule();
  const invalidate = useInvalidate();
  const [title, setTitle] = useState(rule.title);
  const [text, setText] = useState(rule.text);
  const [category, setCategory] = useState(rule.category ?? "");
  const [severity, setSeverity] = useState<Severity>(rule.severity);
  const [checkType, setCheckType] = useState<CheckType>(rule.checkType);
  const [types, setTypes] = useState<DocType[]>(rule.appliesToDocTypes);
  const [details, setDetails] = useState(rule.details.map((d) => ({ ...d })));
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim() && text.trim() && types.length > 0;
  const submit = () => {
    if (!valid) return;
    setError(null);
    update.mutate(
      { id: rule.id, data: { title: title.trim(), text: text.trim(), category: category.trim() || null, severity, checkType, appliesToDocTypes: types, details: details.filter((d) => d.label.trim()) } },
      {
        onSuccess: () => { invalidate([getGetRulebookVersionQueryKey(versionId), getListRulebooksQueryKey()]); onClose(); },
        onError: (e) => setError(parseApiError(e).message),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-edit-rule">
        <DialogHeader>
          <DialogTitle>Edit rule <span className="font-mono">{rule.code}</span></DialogTitle>
          <DialogDescription>Draft version only. The rubric fields below (satisfied, partially satisfied, combine and so on) are what the Rule agent is given.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div>
            <Label htmlFor="re-title">Title</Label>
            <Input id="re-title" className="mt-1.5" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} data-testid="input-rule-title" />
          </div>
          <div>
            <Label htmlFor="re-text">Requirement</Label>
            <Textarea id="re-text" className="mt-1.5 min-h-24" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} data-testid="input-rule-text" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="re-cat">Theme</Label>
              <Input id="re-cat" className="mt-1.5" value={category} maxLength={200} onChange={(e) => setCategory(e.target.value)} data-testid="input-rule-category" />
            </div>
            <div>
              <Label htmlFor="re-sev">Severity</Label>
              <select id="re-sev" className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} data-testid="select-rule-severity">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="re-check">Check</Label>
              <select id="re-check" className={selectClass} value={checkType} onChange={(e) => setCheckType(e.target.value as CheckType)} data-testid="select-rule-check">
                {(Object.keys(CHECK_TYPE_LABELS) as CheckType[]).map((c) => <option key={c} value={c}>{CHECK_TYPE_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Runs on</legend>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {DOC_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={types.includes(t)} onCheckedChange={(c) => setTypes((x) => (c ? [...x, t] : x.filter((y) => y !== t)))} data-testid={`checkbox-rule-doc-${t}`} />
                  {DOC_TYPE_SHORT[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Rubric and other columns</legend>
            <div className="mt-1.5 space-y-2">
              {details.map((d, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                  <Input aria-label="Field name" className="h-8 font-mono text-xs" value={d.label} onChange={(e) => setDetails((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} data-testid={`input-detail-label-${i}`} />
                  <Textarea aria-label={`${d.label} value`} className="min-h-8 text-xs" rows={Math.min(4, Math.ceil(d.value.length / 80) || 1)} value={d.value} onChange={(e) => setDetails((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} data-testid={`input-detail-value-${i}`} />
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remove ${d.label}`} onClick={() => setDetails((x) => x.filter((_, j) => j !== i))}><X className="size-3.5" aria-hidden /></Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setDetails((x) => [...x, { label: "", value: "" }])} data-testid="button-add-detail"><Plus aria-hidden /> Add field</Button>
            </div>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-rule-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canWrite || !valid || update.isPending} data-testid="button-save-rule">{update.isPending ? "Saving…" : "Save rule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit and delete buttons for one rule of a draft version. */
export function RuleActions({ rule, versionId }: { rule: Rule; versionId: number }) {
  const { canWrite } = useCanWrite();
  const del = useDeleteRule();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;
  return (
    <span className="inline-flex">
      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Edit ${rule.code}`} onClick={() => setOpen(true)} data-testid={`button-edit-rule-${rule.id}`}>
        <Pencil className="size-3.5" aria-hidden />
      </Button>
      <ConfirmDelete label={`rule ${rule.code}`} testId={`button-delete-rule-${rule.id}`} pending={del.isPending}
        onConfirm={() => del.mutate({ id: rule.id }, {
          onSuccess: () => { invalidate([getGetRulebookVersionQueryKey(versionId), getListRulebooksQueryKey()]); toast({ title: `Removed ${rule.code}` }); },
          onError: (e) => toast({ title: "Not deleted", description: parseApiError(e).message, variant: "destructive" }),
        })} />
      {open ? <RuleDialog rule={rule} versionId={versionId} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

