import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Banks and products" };
export default function Page() {
  return (
    <FuturePage eyebrow="Library · Banks and products" question="Who are we supervising?"
      primaryLabel="Add bank" unavailableReason="Available once bank and product records are built" icon="Landmark"
      emptyTitle="No banks or products"
      emptyBody="Banks and their credit-card products will be listed here, each with its documents and assessment history."
      willDo={[
        "Add a bank and its card products.",
        "See which documents each product has.",
        "Jump to a product's findings.",
        "Keep demo and live records apart.",
      ]}
      next={{ href: "/assurance/evaluation", label: "Agent evaluation" }} />
  );
}
