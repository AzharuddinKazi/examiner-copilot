import type { Metadata } from "next";
import { FindingView } from "@/components/pages/finding";
export const metadata: Metadata = { title: "Finding" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FindingView id={Number(id)} />;
}
