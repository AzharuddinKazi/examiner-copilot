"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDeleteImpactQueryKey, useDeleteItem, useGetDeleteImpact, type DeleteImpact, type DeleteKind } from "@workspace/api-client-react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite } from "@/lib/write-access";

const NOUN: Record<DeleteKind, string> = {
  bank: "bank",
  product: "card product",
  document: "document",
  rulebook: "rulebook",
  rulebook_version: "rulebook version",
  assessment: "assessment",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function alsoDeleted(i: DeleteImpact): string[] {
  return [
    i.products ? plural(i.products, "card product") : null,
    i.rulebookVersions ? plural(i.rulebookVersions, "version") : null,
    i.rules ? plural(i.rules, "rule") : null,
    i.kind !== "document" && i.documents ? plural(i.documents, "document") : null,
    i.kind !== "assessment" && i.assessments ? `${plural(i.assessments, "assessment")} with their findings and review decisions` : null,
    i.notices ? plural(i.notices, "draft notice") : null,
  ].filter((x): x is string => !!x);
}

/**
 * A delete button that first shows what else will be deleted, then asks for confirmation.
 * After deletion every cached list is refreshed, since one deletion can touch many pages.
 */
export function DeleteButton({
  kind, id, label, onDeleted, variant = "icon", testId,
}: {
  kind: DeleteKind;
  id: number;
  label: string;
  onDeleted?: () => void;
  variant?: "icon" | "text";
  testId?: string;
}) {
  const { canWrite } = useCanWrite();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const impact = useGetDeleteImpact(kind, id, { query: { queryKey: getGetDeleteImpactQueryKey(kind, id), enabled: open, staleTime: 0 } });
  const del = useDeleteItem();
  const i = impact.data;
  const also = i ? alsoDeleted(i) : [];

  const submit = () => {
    setError(null);
    del.mutate(
      { kind, id },
      {
        onSuccess: () => {
          setOpen(false);
          toast({ title: `Deleted ${NOUN[kind]}`, description: label });
          onDeleted?.();
          qc.invalidateQueries();
        },
        onError: (e) => setError(parseApiError(e).message),
      },
    );
  };

  if (!canWrite) return null;
  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-[hsl(var(--tone-bad))]"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          aria-label={`Delete ${NOUN[kind]} ${label}`} title={`Delete ${NOUN[kind]}`}
          data-testid={testId ?? `button-delete-${kind}-${id}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button
          variant="outline" size="sm" className="text-[hsl(var(--tone-bad))]"
          onClick={() => setOpen(true)} data-testid={testId ?? `button-delete-${kind}-${id}`}
        >
          <Trash2 className="mr-1.5 size-4" aria-hidden /> Delete
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
        <DialogContent className="sm:max-w-md" data-testid={`dialog-delete-${kind}`}>
          <DialogHeader>
            <DialogTitle>Delete this {NOUN[kind]}?</DialogTitle>
            <DialogDescription className="break-words">{label}</DialogDescription>
          </DialogHeader>
          {impact.isLoading ? <Skeleton className="h-16 w-full" /> : impact.isError ? (
            <p className="text-sm text-[hsl(var(--tone-bad))]">{parseApiError(impact.error).message}</p>
          ) : i ? (
            <div className="space-y-2 text-sm" data-testid="text-delete-impact">
              {i.blockedReason ? (
                <p className="text-[hsl(var(--tone-warn))]">{i.blockedReason}</p>
              ) : also.length ? (
                <>
                  <p>This also deletes:</p>
                  <ul className="list-disc space-y-0.5 pl-5">{also.map((a) => <li key={a}>{a}</li>)}</ul>
                </>
              ) : (
                <p>Nothing else depends on it.</p>
              )}
              {i.removesActiveRulebook ? (
                <p className="text-[hsl(var(--tone-warn))]">This is the active rulebook. No assessment can start until you import or activate another version.</p>
              ) : null}
              <p className="text-muted-foreground">This cannot be undone. The audit log keeps a record of the deletion.</p>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-delete-error">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive" onClick={submit}
              disabled={!i || !!i.blockedReason || del.isPending}
              data-testid="button-confirm-delete"
            >
              {del.isPending ? "Deleting…" : `Delete ${NOUN[kind]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
