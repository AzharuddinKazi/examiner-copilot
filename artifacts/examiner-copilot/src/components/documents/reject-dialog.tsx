"use client";

import { useEffect, useState } from "react";
import {
  getGetDocumentQueryKey, getListBanksQueryKey, getListDocumentsQueryKey, useRejectDocument, type DocumentSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";

export function RejectDocumentDialog({
  doc, open, onOpenChange,
}: { doc: DocumentSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role, canWrite } = useCanWrite();
  const reject = useRejectDocument();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(doc.rejectedReason ?? ""); setError(null); } }, [open, doc.rejectedReason]);
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 500;

  const submit = () => {
    if (!valid) return;
    reject.mutate({ id: doc.id, data: { role, reason: trimmed } }, {
      onSuccess: () => {
        invalidate([getListDocumentsQueryKey(), getGetDocumentQueryKey(doc.id), getListBanksQueryKey()]);
        toast({ title: "Document rejected", description: "It will be left out of assessment." });
        onOpenChange(false);
      },
      onError: (e) => setError(parseApiError(e).message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-reject-document">
        <DialogHeader>
          <DialogTitle>Reject this document?</DialogTitle>
          <DialogDescription>It will be excluded from assessment. The reason is kept in the audit log.</DialogDescription>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-muted-foreground">{doc.originalName}</p>
        <div>
          <Label htmlFor="rj-reason">Reason</Label>
          <Textarea id="rj-reason" className="mt-1.5" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong product; this is the Platinum card KFS" data-testid="input-reject-reason" aria-describedby="rj-help" />
          <p id="rj-help" className="mt-1 text-xs text-muted-foreground">At least 3 characters.</p>
        </div>
        {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-reject-error">{error}</p> : null}
        <ViewerReason />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-reject">Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={!canWrite || !valid || reject.isPending} data-testid="button-submit-reject">
            {reject.isPending ? "Rejecting…" : "Reject document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
