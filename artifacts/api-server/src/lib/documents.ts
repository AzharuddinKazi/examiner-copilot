import {
  db,
  banksTable,
  productsTable,
  documentsTable,
  documentPagesTable,
  type DocumentRow,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Dataset } from "./dataset";
import { extractPdf, type PdfExtraction } from "./pdf";
import { sha256, safeFileName, storeFile } from "./files";
import { suggestDocument, type BankForMatch, type DocumentSuggestion } from "./suggest";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadBanksForMatch(dataset: Dataset): Promise<BankForMatch[]> {
  const banks = await db.select().from(banksTable).where(eq(banksTable.dataset, dataset)).orderBy(asc(banksTable.id));
  const products = await db.select().from(productsTable).where(eq(productsTable.dataset, dataset));
  return banks.map((b) => ({
    id: b.id,
    nameEn: b.nameEn,
    nameAr: b.nameAr,
    products: products.filter((p) => p.bankId === b.id).map((p) => ({ id: p.id, name: p.name })),
  }));
}

export async function findDuplicate(dataset: Dataset, hash: string): Promise<number | null> {
  const rows = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.sha256, hash)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export interface PreparedDocument {
  fileName: string;
  buf: Buffer;
  sha256: string;
  extraction: PdfExtraction;
  suggestion: DocumentSuggestion;
}

/** Validates and extracts a PDF and computes rule-based suggestions. No database writes. */
export async function prepareDocument(buf: Buffer, originalName: string, banks: BankForMatch[]): Promise<PreparedDocument> {
  const fileName = safeFileName(originalName);
  const extraction = await extractPdf(buf);
  const suggestion = suggestDocument(
    fileName,
    extraction.pages.map((p) => p.textNormalized),
    banks,
  );
  return { fileName, buf, sha256: sha256(buf), extraction, suggestion };
}

function hasAnySuggestion(s: DocumentSuggestion): boolean {
  return [s.docType.value, s.language.value, s.bankId.value, s.productId.value].some((v) => v !== null);
}

export async function insertPreparedDocument(
  tx: Tx,
  dataset: Dataset,
  doc: PreparedDocument,
  confirmed?: { bankId: number; productId: number; docType: DocumentRow["docType"]; language: DocumentRow["language"]; role: string },
): Promise<DocumentRow> {
  const file = await storeFile({ dataset, purpose: "document", originalName: doc.fileName, mime: "application/pdf", data: doc.buf }, tx);
  const [row] = await tx
    .insert(documentsTable)
    .values({
      dataset,
      originalName: doc.fileName,
      sha256: doc.sha256,
      fileKey: String(file.id),
      mime: "application/pdf",
      pageCount: doc.extraction.pageCount,
      sizeBytes: doc.buf.length,
      status: confirmed ? "confirmed" : hasAnySuggestion(doc.suggestion) ? "proposed" : "uploaded",
      ingestionProposal: doc.suggestion,
      extractionQuality: doc.extraction.quality,
      bankId: confirmed?.bankId ?? null,
      productId: confirmed?.productId ?? null,
      docType: confirmed?.docType ?? null,
      language: confirmed?.language ?? null,
      confirmedAt: confirmed ? new Date() : null,
      confirmedByRole: confirmed?.role ?? null,
    })
    .returning();
  if (doc.extraction.pages.length) {
    await tx.insert(documentPagesTable).values(
      doc.extraction.pages.map((p) => ({
        documentId: row!.id,
        pageNo: p.pageNo,
        textRaw: p.textRaw,
        textNormalized: p.textNormalized,
        extractionMethod: "pdf-text-layer",
        charCount: p.charCount,
        isGap: p.isGap,
      })),
    );
  }
  return row!;
}

async function namesFor(dataset: Dataset, rows: DocumentRow[]) {
  const bankIds = [...new Set(rows.map((r) => r.bankId).filter((v): v is number => v !== null))];
  const productIds = [...new Set(rows.map((r) => r.productId).filter((v): v is number => v !== null))];
  const banks = bankIds.length
    ? await db.select().from(banksTable).where(and(eq(banksTable.dataset, dataset), inArray(banksTable.id, bankIds)))
    : [];
  const products = productIds.length
    ? await db.select().from(productsTable).where(and(eq(productsTable.dataset, dataset), inArray(productsTable.id, productIds)))
    : [];
  return { banks: new Map(banks.map((b) => [b.id, b.nameEn])), products: new Map(products.map((p) => [p.id, p.name])) };
}

async function gapsFor(ids: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ documentId: documentPagesTable.documentId, pageNo: documentPagesTable.pageNo })
    .from(documentPagesTable)
    .where(and(inArray(documentPagesTable.documentId, ids), eq(documentPagesTable.isGap, true)))
    .orderBy(asc(documentPagesTable.pageNo));
  for (const r of rows) map.set(r.documentId, [...(map.get(r.documentId) ?? []), r.pageNo]);
  return map;
}

export function toSummary(r: DocumentRow, names: { banks: Map<number, string>; products: Map<number, string> }, gaps: number[]) {
  return {
    id: r.id,
    originalName: r.originalName,
    bankId: r.bankId,
    bankName: r.bankId !== null ? (names.banks.get(r.bankId) ?? null) : null,
    productId: r.productId,
    productName: r.productId !== null ? (names.products.get(r.productId) ?? null) : null,
    docType: r.docType,
    language: r.language,
    versionLabel: r.versionLabel,
    status: r.status,
    pageCount: r.pageCount,
    gapPages: gaps,
    extractionQuality: r.extractionQuality,
    sizeBytes: r.sizeBytes,
    sha256: r.sha256,
    suggestion: (r.ingestionProposal as DocumentSuggestion | null) ?? null,
    rejectedReason: r.rejectedReason,
    confirmedAt: r.confirmedAt,
    confirmedByRole: r.confirmedByRole,
    createdAt: r.createdAt,
  };
}

export async function summarize(dataset: Dataset, rows: DocumentRow[]) {
  const [names, gaps] = await Promise.all([namesFor(dataset, rows), gapsFor(rows.map((r) => r.id))]);
  return rows.map((r) => toSummary(r, names, gaps.get(r.id) ?? []));
}

export async function listDocumentRows(dataset: Dataset): Promise<DocumentRow[]> {
  return db.select().from(documentsTable).where(eq(documentsTable.dataset, dataset)).orderBy(desc(documentsTable.id));
}

export async function getDocumentRow(dataset: Dataset, id: number): Promise<DocumentRow | null> {
  const rows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, id)));
  return rows[0] ?? null;
}

export async function getPages(documentId: number) {
  return db
    .select()
    .from(documentPagesTable)
    .where(eq(documentPagesTable.documentId, documentId))
    .orderBy(asc(documentPagesTable.pageNo));
}
