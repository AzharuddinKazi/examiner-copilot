import type { Metadata } from "next";
import { RulebookView } from "@/components/pages/rulebook";
export const metadata: Metadata = { title: "Rulebook" };
export default function Page() { return <RulebookView />; }
