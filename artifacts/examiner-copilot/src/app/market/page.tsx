import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Market view" };
export default function Page() {
  return (
    <FuturePage eyebrow="Market · Market view" question="How do banks compare?"
      primaryLabel="Compare banks" unavailableReason="Not built yet." icon="BarChart3"
      emptyTitle="No comparison yet"
      emptyBody="Needs several assessed products."
      willDo={[
        "Compare fees, rates and finding rates across products.",
        "Show where a bank sits relative to peers.",
        "Warn when the peer group is too small for statistics to mean much.",
        "Link every figure back to its source quote.",
      ]}
      next={{ href: "/market/what-if", label: "What-if sandbox" }} />
  );
}
