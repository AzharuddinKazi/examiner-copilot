import type { Metadata } from "next";
import { UploadView } from "@/components/pages/upload";
export const metadata: Metadata = { title: "Upload documents" };
export default function Page() { return <UploadView />; }
