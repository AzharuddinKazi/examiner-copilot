import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Review and decide" };
export default function Page() {
  return (
    <FuturePage eyebrow="Step 3 of 4 · Review and decide" question="Do you agree with this finding?" stepKey="review"
      primaryLabel="Start review" unavailableReason="Available once findings review is built" icon="Scale"
      emptyTitle="Nothing to review"
      emptyBody="Proposed findings will appear here one at a time: the bank's words, the tool's analysis and space for your judgement, kept visibly separate."
      willDo={[
        "Read the quoted clause on its paper panel with document and page.",
        "Read the agent's reasoning, labelled as a proposal.",
        "Approve, amend or reject with your own note.",
        "Every decision is written to the audit log.",
      ]}
      next={{ href: "/notices", label: "Notices" }} />
  );
}
