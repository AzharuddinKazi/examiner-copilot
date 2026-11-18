import type { Metadata } from "next";
import { NoticeDetailView } from "@/components/pages/notice-detail";
export const metadata: Metadata = { title: "Findings report" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoticeDetailView id={Number(id)} />;
}
