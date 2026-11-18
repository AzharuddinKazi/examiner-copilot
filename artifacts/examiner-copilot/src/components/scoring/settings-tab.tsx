"use client";

import { useEffect, useState } from "react";
import {
  getGetScoringSettingsQueryKey, useGetScoringSettings, useResetScoringSettings, useSaveScoringSettings, type SettingsKind,
} from "@workspace/api-client-react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";
import { Panel, Pill } from "./shared";

type Json = Record<string, unknown>;
const SEV = ["Low", "Medium", "High"] as const;
const LABEL: Record<SettingsKind, string> = { scoring: "scoring rubric", document_roles: "document roles" };

function RubricSummary({ c }: { c: Json }) {
  const scale = (c.scale ?? {}) as Record<string, string>;
  const matrix = (c.rating_matrix ?? {}) as Record<string, Record<string, number>>;
  const cutoffs = (c.cutoffs ?? []) as number[];
  const caps = (c.caps ?? {}) as Record<string, number | string>;
  const themes = (c.themes ?? []) as string[];
  const completeness = (c.completeness ?? {}) as { required_roles?: string[]; optional?: string[]; label_if_incomplete?: string };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 text-sm font-medium">Rating scale</h4>
        <ol className="space-y-1 text-sm">
          {["1", "2", "3", "4"].map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-5 font-mono text-muted-foreground">{k}</span>
              <span>{scale[k]}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{125 - 25 * Number(k)}%</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">A higher number means a higher risk. Means are banded at {cutoffs.join(", ")}; a mean exactly on a cutoff goes to the {String(c.on_cutoff_goes_to ?? "weaker rating")}.</p>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Rule rating by outcome and severity</h4>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-normal">Outcome</th>{SEV.map((s) => <th key={s} className="py-1 text-center font-normal">{s}</th>)}</tr></thead>
          <tbody>
            {Object.entries(matrix).map(([o, row]) => (
              <tr key={o} className="border-t border-dashed border-border">
                <td className="py-1.5">{o}</td>
                {SEV.map((s) => <td key={s} className="py-1.5 text-center font-mono">{row[s]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Caps</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Any rule rated {String(caps.trigger_rating)} keeps its theme and the product at {String(caps.any_rule_at_trigger_floor)} or worse.</li>
          <li>Any theme rated {String(caps.trigger_rating)} keeps the product at {String(caps.any_theme_at_trigger_floor)}.</li>
        </ul>
        <h4 className="mb-2 mt-4 text-sm font-medium">Complete submission</h4>
        <p className="text-sm">Required: {(completeness.required_roles ?? []).join(", ")}. Optional: {(completeness.optional ?? []).join(", ") || "none"}.</p>
        <p className="mt-1 text-xs text-muted-foreground">If a required document is missing the result is labelled “{completeness.label_if_incomplete}”.</p>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Themes ({themes.length})</h4>
        <div className="flex flex-wrap gap-1.5">{themes.map((t) => <Pill key={t} tone="neutral">{t}</Pill>)}</div>
        <p className="mt-2 text-xs text-muted-foreground">Complaints are shown next to theme ratings only; they never change a score.</p>
      </div>
    </div>
  );
}

function RolesSummary({ c }: { c: Json }) {
  const roles = (c.roles ?? {}) as Record<string, { signals?: string[]; subtypes?: Record<string, string[]>; note?: string }>;
  return (
    <div className="space-y-3">
      {c.principle ? <p className="text-sm text-muted-foreground">{String(c.principle)}</p> : null}
      <ul className="divide-y divide-dashed divide-border">
        {Object.entries(roles).map(([k, v]) => {
          const signals = v.signals ?? Object.values(v.subtypes ?? {}).flat();
          return (
            <li key={k} className="py-2.5 text-sm" data-testid={`row-role-${k}`}>
              <p className="font-medium">{k}{v.subtypes ? <span className="ml-2 text-xs font-normal text-muted-foreground">parts: {Object.keys(v.subtypes).join(", ").toLowerCase().replace(/_/g, " ")}</span> : null}</p>
              {signals.length ? <p className="mt-0.5 text-xs text-muted-foreground">Recognised by: {signals.slice(0, 14).join(", ")}{signals.length > 14 ? "…" : ""}</p> : null}
              {v.note ? <p className="mt-0.5 text-xs">{v.note}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SettingsTab({ kind }: { kind: SettingsKind }) {
  const { canWrite } = useCanWrite();
  const q = useGetScoringSettings(kind);
  const save = useSaveScoringSettings();
  const reset = useResetScoringSettings();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !editing) setText(JSON.stringify(q.data.content, null, 2));
  }, [q.data, editing]);

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <QueryError title={`Could not load the ${LABEL[kind]}`} error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const done = () => { invalidate([getGetScoringSettingsQueryKey(kind)]); setEditing(false); setError(null); };

  const onSave = () => {
    let content: Json;
    try {
      content = JSON.parse(text) as Json;
    } catch (e) {
      setError(`This is not valid JSON: ${(e as Error).message}`);
      return;
    }
    save.mutate({ kind, data: { content } }, {
      onSuccess: () => { done(); toast({ title: `Saved the ${LABEL[kind]}`, description: "New assessments and scorecards use it straight away." }); },
      onError: (e) => setError(parseApiError(e).message),
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        testId={`panel-${kind}`}
        title={kind === "scoring" ? "How rules become ratings" : "How documents are recognised"}
        description={
          <>
            Version <span className="font-mono">{String((s.content as Json).version ?? "—")}</span> ·{" "}
            {s.isDefault ? "the loaded file, not edited" : `edited by ${s.updatedBy ?? "someone"} on ${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}`}
          </>
        }
      >
        {kind === "scoring" ? <RubricSummary c={s.content as Json} /> : <RolesSummary c={s.content as Json} />}
      </Panel>
      <Panel
        testId={`panel-${kind}-editor`}
        title="Edit"
        description="Changes are checked before they are saved and recorded in the audit log. Past scorecards are recalculated with the saved settings."
        actions={
          <>
            {!s.isDefault ? (
              <Button variant="outline" size="sm" className="bg-card" disabled={!canWrite || reset.isPending}
                onClick={() => reset.mutate({ kind }, { onSuccess: () => { done(); toast({ title: "Back to the loaded file" }); }, onError: (e) => setError(parseApiError(e).message) })}
                data-testid={`button-reset-${kind}`}>
                <RotateCcw aria-hidden /> Reset to loaded file
              </Button>
            ) : null}
            <Button size="sm" disabled={!canWrite || !editing || save.isPending} onClick={onSave} data-testid={`button-save-${kind}`}>
              <Save aria-hidden /> {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <Textarea
          aria-label={`${LABEL[kind]} as JSON`}
          className="min-h-[360px] font-mono text-xs"
          value={text}
          readOnly={!canWrite}
          spellCheck={false}
          onChange={(e) => { setText(e.target.value); setEditing(true); }}
          data-testid={`input-json-${kind}`}
        />
        {error ? <p role="alert" className="mt-2 text-sm text-[hsl(var(--tone-bad))]" data-testid={`text-error-${kind}`}>{error}</p> : null}
        {editing ? (
          <button type="button" className="mt-2 text-xs text-muted-foreground underline" onClick={() => { setEditing(false); setError(null); }}>Discard changes</button>
        ) : null}
        <ViewerReason className="mt-2" />
      </Panel>
    </div>
  );
}
