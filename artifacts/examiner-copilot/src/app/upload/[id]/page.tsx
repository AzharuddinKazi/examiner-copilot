import type { Metadata } from "next";
import { DocumentDetailView } from "@/components/pages/document-detail";
export const metadata: Metadata = { title: "Document" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetailView id={Number(id)} />;
}
