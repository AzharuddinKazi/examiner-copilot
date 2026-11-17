import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Rulebook" };
export default function Page() {
  return (
    <FuturePage eyebrow="Library · Rulebook" question="Which rules are we applying?"
      primaryLabel="Add rulebook version" unavailableReason="Available once the rulebook editor is built" icon="BookOpen"
      emptyTitle="No rulebook versions"
      emptyBody="Examiners will supply rules here as numbered, versioned entries. Sample rules are not law; you remain responsible for interpreting them."
      willDo={[
        "Create a rulebook version and add rules.",
        "Activate one version for assessments.",
        "Keep earlier versions read-only for traceability.",
        "Record every change in the audit log.",
      ]}
      next={{ href: "/library/banks", label: "Banks and products" }} />
  );
}
