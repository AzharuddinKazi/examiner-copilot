import type { Metadata } from "next";
import { RulebookVersionView } from "@/components/pages/rulebook-version";
export const metadata: Metadata = { title: "Rulebook version" };
export default async function Page({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  return <RulebookVersionView id={Number(versionId)} />;
}
