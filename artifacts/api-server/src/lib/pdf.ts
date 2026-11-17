import { extractText, getDocumentProxy } from "unpdf";

export const PDF_LIMITS = { maxBytes: 15 * 1024 * 1024, maxPages: 200 } as const;

/** A page with fewer non-space characters than this is treated as having no usable text. */
export const GAP_MIN_CHARS = 25;

export class PdfValidationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message);
  }
}

export interface ExtractedPage {
  pageNo: number;
  textRaw: string;
  textNormalized: string;
  charCount: number;
  isGap: boolean;
}

export interface PdfExtraction {
  pageCount: number;
  pages: ExtractedPage[];
  gapPages: number[];
  quality: number;
}

export function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

/** Checks size and the PDF signature before any parsing. */
export function assertPdfBytes(buf: Buffer): void {
  if (buf.length === 0) throw new PdfValidationError("The file is empty.");
  if (buf.length > PDF_LIMITS.maxBytes) {
    throw new PdfValidationError(`The file is larger than ${PDF_LIMITS.maxBytes / 1024 / 1024} MB.`, 413);
  }
  // The signature may be preceded by a little junk; PDF readers accept it within the first 1 KB.
  const head = buf.subarray(0, 1024).toString("latin1");
  if (!head.includes("%PDF-")) {
    throw new PdfValidationError("This is not a PDF. Only PDF disclosures can be uploaded.");
  }
}

/** Extracts text page by page. No OCR: pages without a text layer are reported as gaps. */
export async function extractPdf(buf: Buffer): Promise<PdfExtraction> {
  assertPdfBytes(buf);
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/password/i.test(msg)) throw new PdfValidationError("The PDF is password-protected. Upload an unprotected copy.");
    throw new PdfValidationError("The PDF could not be read. It may be damaged.");
  }
  try {
    if (pdf.numPages < 1) throw new PdfValidationError("The PDF has no pages.");
    if (pdf.numPages > PDF_LIMITS.maxPages) {
      throw new PdfValidationError(`The PDF has ${pdf.numPages} pages; the limit is ${PDF_LIMITS.maxPages}.`);
    }
    const { text } = await extractText(pdf, { mergePages: false });
    const pages: ExtractedPage[] = text.map((raw, i) => {
      // Some fonts (e.g. Arabic ligatures) map glyphs to NUL or other control characters; Postgres rejects NUL.
      const textRaw = (raw ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
      const textNormalized = normalizeText(textRaw);
      const charCount = textNormalized.replace(/\s/g, "").length;
      return { pageNo: i + 1, textRaw, textNormalized, charCount, isGap: charCount < GAP_MIN_CHARS };
    });
    const gapPages = pages.filter((p) => p.isGap).map((p) => p.pageNo);
    return {
      pageCount: pages.length,
      pages,
      gapPages,
      quality: pages.length ? (pages.length - gapPages.length) / pages.length : 0,
    };
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
