import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Market view" };
export default function Page() {
  return (
    <FuturePage eyebrow="Market · Market view" question="How do banks compare?"
      primaryLabel="Compare banks" unavailableReason="Available once market comparison is built" icon="BarChart3"
      emptyTitle="No comparison yet"
      emptyBody="Once several products are assessed, this page will compare fees, rates and finding rates across banks."
      willDo={[
        "Line up comparable terms across products.",
        "Show where a bank sits relative to peers.",
        "Warn when the peer group is too small for statistics to mean much.",
        "Link every figure back to its source quote.",
      ]}
      next={{ href: "/market/what-if", label: "What-if sandbox" }} />
  );
}
