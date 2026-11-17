import type { Metadata } from "next";
import { Send } from "lucide-react";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Notices" };
export default function Page() {
  return (
    <FuturePage eyebrow="Step 4 of 4 · Notices (draft only)" question="What would we ask the bank to fix?" stepKey="notices"
      primaryLabel="Draft notice" unavailableReason="Available once notice drafting is built" icon="FilePen"
      notice={
        <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] p-4 text-sm" data-testid="text-notice-drafts-only">
          <Send className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-warn))]" aria-hidden />
          <p><strong className="font-semibold">Notices are drafts and are never sent.</strong> This tool has no way to contact a bank. Any real communication happens outside it, under your institution's process.</p>
        </div>
      }
      emptyTitle="No draft notices"
      emptyBody="Approved findings will be gathered into a draft notice listing what the bank would be asked to correct, each item traced to its quote and rule."
      willDo={[
        "Assemble only findings an examiner has approved.",
        "Cite rule, quote and page for every requested fix.",
        "Export the draft for your own review and sign-off.",
        "Never send anything from this tool.",
      ]}
      next={{ href: "/market", label: "Market view" }} />
  );
}
