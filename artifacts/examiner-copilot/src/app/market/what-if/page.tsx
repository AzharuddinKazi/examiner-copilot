import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "What-if sandbox" };
export default function Page() {
  return (
    <FuturePage eyebrow="Market · What-if sandbox" question="What changes if the rule changes?"
      primaryLabel="Try a rule change" unavailableReason="Available once the what-if sandbox is built" icon="FlaskConical"
      emptyTitle="No scenarios yet"
      emptyBody="Adjust a threshold in a copy of the rulebook and see which products would move between compliant and breach. Nothing here changes the real rulebook."
      willDo={[
        "Copy a rulebook version into a sandbox.",
        "Change a threshold or wording.",
        "See which existing findings would change.",
        "Discard or keep the scenario as a note.",
      ]}
      next={{ href: "/library/rulebook", label: "Rulebook" }} />
  );
}
