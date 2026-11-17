import type { Metadata } from "next";
import { AssessView } from "@/components/pages/assess";
export const metadata: Metadata = { title: "Assess" };
export default function Page() {
  return <AssessView />;
}
