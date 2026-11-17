import type { Metadata } from "next";
import { AssessmentDetailView } from "@/components/pages/assessment-detail";
export const metadata: Metadata = { title: "Assessment" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentDetailView id={Number(id)} />;
}
