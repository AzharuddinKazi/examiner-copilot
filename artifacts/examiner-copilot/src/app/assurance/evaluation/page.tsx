import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Agent evaluation" };
export default function Page() {
  return (
    <FuturePage eyebrow="Assurance · Agent evaluation" question="Can we trust the agents?"
      primaryLabel="Run evaluation" unavailableReason="Not built yet." icon="Gauge"
      emptyTitle="No evaluations run"
      emptyBody={null}
      willDo={[
        "Run each agent against cases with known answers.",
        "Report agreement with examiner decisions.",
        "Count quotes that failed verification.",
        "Show results per agent and per rule.",
      ]}
      next={{ href: "/assurance/audit", label: "Audit log" }} />
  );
}
