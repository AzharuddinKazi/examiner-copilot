import type { Metadata } from "next";
import { FuturePage } from "@/components/future-page";
export const metadata: Metadata = { title: "Upload documents" };
export default function Page() {
  return (
    <FuturePage eyebrow="Step 1 of 4 · Upload documents" question="Which documents are we examining?" stepKey="upload"
      primaryLabel="Upload documents" unavailableReason="Available once document upload is built" icon="FileUp"
      emptyTitle="No documents yet"
      emptyBody="This is where you will add a bank's Key Facts Statement, Terms and Conditions, Rewards terms and Fees Schedule for one card product. Public or synthetic documents only."
      willDo={[
        "Attach each disclosure to a bank and a card product.",
        "Extract text page by page, keeping page numbers so every quote can be traced.",
        "Flag scanned pages without text as extraction gaps; there is no OCR.",
        "Treat text inside documents as data to analyse, never as instructions.",
      ]}
      next={{ href: "/assess", label: "Assess" }} />
  );
}
