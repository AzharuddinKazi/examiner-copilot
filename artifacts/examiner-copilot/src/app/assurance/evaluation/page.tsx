import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Agent evaluation" };
export default function Page() {
  return (
    <FuturePage eyebrow="Assurance · Agent evaluation" question="Can we trust the agents?"
      primaryLabel="Run evaluation" unavailableReason="Available once agent evaluation is built" icon="Gauge"
      emptyTitle="No evaluations run"
      emptyBody="Agents will be scored against labelled cases so you can see how often they are right, wrong or unable to cite a quote."
      willDo={[
        "Run each agent against cases with known answers.",
        "Report agreement with examiner decisions.",
        "Count quotes that failed verification.",
        "Show results per agent and per rule.",
      ]}
      next={{ href: "/assurance/audit", label: "Audit log" }} />
  );
}
