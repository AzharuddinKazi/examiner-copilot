"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Send } from "lucide-react";
import {
  getGetNoticeQueryKey, getGetNoticeUrl, getListNoticesQueryKey,
  type Notice, type NoticeState,
} from "@workspace/api-client-react";
import { useInvalidate } from "@/lib/write-access";
import { cn } from "@/lib/utils";

export const NOTICE_STATE_LABELS: Record<NoticeState, string> = {
  draft: "Draft",
  awaiting: "Awaiting approval",
  approved: "Approved",
  returned: "Returned",
};

const TONE: Record<NoticeState, string> = {
  draft: "border-[hsl(var(--tone-neutral)/0.3)] bg-[hsl(var(--tone-neutral-bg))] text-[hsl(var(--tone-neutral))]",
  awaiting: "border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] text-[hsl(var(--tone-warn))]",
  approved: "border-[hsl(var(--tone-ok)/0.35)] bg-[hsl(var(--tone-ok-bg))] text-[hsl(var(--tone-ok))]",
  returned: "border-[hsl(var(--tone-bad)/0.35)] bg-[hsl(var(--tone-bad-bg))] text-[hsl(var(--tone-bad))]",
};

export function NoticeStateTag({ state, className, testId }: { state: NoticeState; className?: string; testId?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[state], className)}
      data-testid={testId ?? `tag-notice-${state}`}>
      {NOTICE_STATE_LABELS[state]}
    </span>
  );
}

/** "2026-12-08" -> "8 Dec 2026". */
export const formatDay = (d: string | null | undefined) => (d ? format(parseISO(d), "d MMM yyyy") : "Not set");
export const formatStamp = (d: string) => format(new Date(d), "d MMM yyyy, HH:mm");
/** "Name <email>" -> "Name". */
export const personName = (actor: string | null | undefined, fallback = "an examiner") => (actor ? actor.replace(/\s*<.*>$/, "") : fallback);

export function DraftsOnlyNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] p-4 text-sm" data-testid="text-notice-drafts-only">
      <Send className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-warn))]" aria-hidden />
      <p><strong className="font-semibold">Drafts only, never sent.</strong> This tool cannot contact a bank.</p>
    </div>
  );
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
/** True when any text that goes into the export contains Arabic (the PDF cannot show it). */
export function hasArabic(n: Notice): boolean {
  const texts = [n.body, n.productName, n.bankName, ...n.findings.filter((f) => f.included).flatMap((f) => [
    f.action, f.ruleText, f.ruleTitle, f.rationale, f.examinerNote ?? "", ...f.evidence.map((e) => e.quote),
  ])];
  return texts.some((t) => ARABIC.test(t));
}

export const exportUrl = (id: number, fmt: "pdf" | "docx") => `${getGetNoticeUrl(id)}/export.${fmt}`;

/** After a change: put the fresh report in the cache, refresh the list, progress and audit log. */
export function useNoticeRefresh() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useCallback(
    (n?: Notice, id?: number) => {
      if (n) qc.setQueryData(getGetNoticeQueryKey(n.id), n);
      else if (id) qc.invalidateQueries({ queryKey: getGetNoticeQueryKey(id) });
      invalidate([getListNoticesQueryKey()]);
    },
    [qc, invalidate],
  );
}
