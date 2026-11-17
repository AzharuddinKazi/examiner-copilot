import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "What-if sandbox" };
export default function Page() {
  return (
    <FuturePage eyebrow="Market · What-if sandbox" question="What changes if the rule changes?"
      primaryLabel="Try a rule change" unavailableReason="Not built yet." icon="FlaskConical"
      emptyTitle="No scenarios yet"
      emptyBody="Scenarios use a copy of the rulebook. The active rulebook is never changed."
      willDo={[
        "Copy a rulebook version into a sandbox.",
        "Change a threshold or wording.",
        "See which existing findings would change.",
        "Discard or keep the scenario as a note.",
      ]}
      next={{ href: "/library/rulebook", label: "Rulebook" }} />
  );
}
