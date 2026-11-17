import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Assess" };
export default function Page() {
  return (
    <FuturePage eyebrow="Step 2 of 4 · Assess" question="What do the agents propose?" stepKey="assess"
      primaryLabel="Run assessment" unavailableReason="Available once the assessment agents are built" icon="Bot"
      emptyTitle="No assessments run"
      emptyBody="Five read-only agents will read the uploaded documents against the active rulebook version and propose findings. They cannot change documents, rules or decisions."
      willDo={[
        "Run each agent against one product and one rulebook version.",
        "Every proposed finding must cite an exact quote and page.",
        "Code checks each quote against the document; unverifiable quotes become Warnings.",
        "Proposals wait for an examiner in Review and decide.",
      ]}
      next={{ href: "/review", label: "Review and decide" }} />
  );
}
