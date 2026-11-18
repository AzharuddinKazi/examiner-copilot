import type { Metadata } from "next";
import { ScoringView } from "@/components/pages/scoring";
export const metadata: Metadata = { title: "Scoring and complaints" };
export default function Page() { return <ScoringView />; }
