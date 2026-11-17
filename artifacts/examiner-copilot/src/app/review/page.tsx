import type { Metadata } from "next";
import { ReviewView } from "@/components/pages/review";
export const metadata: Metadata = { title: "Review and decide" };
export default function Page() {
  return <ReviewView />;
}
