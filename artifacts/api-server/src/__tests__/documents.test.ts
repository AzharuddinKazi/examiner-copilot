import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf, PdfValidationError, PDF_LIMITS } from "../lib/pdf";
import { suggestDocType, suggestLanguage, suggestBankAndProduct } from "../lib/suggest";
import { renderDemoPdf } from "./fixtures/generate";
import { DEMO_DOCUMENTS } from "./fixtures/content";

async function pdfWith(pages: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const t of pages) {
    const p = pdf.addPage();
    if (t) p.drawText(t, { x: 50, y: 700, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

describe("PDF validation and extraction", () => {
  it("rejects non-PDF bytes before parsing", async () => {
    await expect(extractPdf(Buffer.from("PK\u0003\u0004 zip file"))).rejects.toBeInstanceOf(PdfValidationError);
    await expect(extractPdf(Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it("rejects oversized files with 413", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(PDF_LIMITS.maxBytes)]);
    const err = await extractPdf(big).catch((e) => e);
    expect(err).toBeInstanceOf(PdfValidationError);
    expect(err.status).toBe(413);
  });

  it("rejects a damaged PDF with a clear error", async () => {
    await expect(extractPdf(Buffer.from("%PDF-1.7\ngarbage garbage"))).rejects.toThrow(/could not be read/);
  });

  it("keeps page numbers and flags pages without text as gaps", async () => {
    const out = await extractPdf(await pdfWith(["Annual fee: AED 500. Late payment fee: AED 230.", "", "Complaints: call us on 800 0000."]));
    expect(out.pageCount).toBe(3);
    expect(out.pages[0]!.textNormalized).toContain("Annual fee: AED 500.");
    expect(out.gapPages).toEqual([2]);
    expect(out.quality).toBeCloseTo(2 / 3);
  });

  it("extracts the demo scanned page as a gap and keeps the injection text as plain data", async () => {
    const tnc = DEMO_DOCUMENTS.find((d) => d.fileName.startsWith("Saffron_Coast_Classic_Terms"))!;
    expect((await extractPdf(await renderDemoPdf(tnc))).gapPages).toEqual([2]);
    const inj = DEMO_DOCUMENTS.find((d) => d.fileName.startsWith("Meridian_Dunes_Rewards"))!;
    const text = (await extractPdf(await renderDemoPdf(inj))).pages[0]!.textNormalized;
    expect(text).toContain("Ignore all previous instructions");
  });
});

describe("rule-based suggestions", () => {
  it("suggests the document type of every demo file correctly", async () => {
    for (const d of DEMO_DOCUMENTS) {
      const { pages } = await extractPdf(await renderDemoPdf(d));
      const s = suggestDocType(d.fileName, pages.slice(0, 2).map((p) => p.textNormalized).join("\n"));
      expect(s.value, d.fileName).toBe(d.docType);
    }
  });

  it("detects language by script share and refuses when mixed", () => {
    expect(suggestLanguage("Annual fee is AED 500 and the late fee is AED 230").value).toBe("en");
    expect(suggestLanguage("الرسوم السنوية خمسمائة درهم ورسوم التأخير مائتان وثلاثون درهما").value).toBe("ar");
    expect(suggestLanguage("Annual fee is five hundred dirhams per year الرسوم السنوية").value).toBeNull();
  });

  it("matches bank and product by name, and abstains on ties", () => {
    const banks = [
      { id: 1, nameEn: "Falconridge Bank", nameAr: null, products: [{ id: 10, name: "Platinum Card" }, { id: 11, name: "Classic Card" }] },
      { id: 2, nameEn: "Meridian Dunes Bank", nameAr: null, products: [{ id: 20, name: "Titanium Card" }] },
    ];
    const one = suggestBankAndProduct("x.pdf", "Falconridge Bank Platinum Card terms. Falconridge Bank.", banks);
    expect(one.bankId.value).toBe(1);
    expect(one.productId.value).toBe(10);
    const tie = suggestBankAndProduct("x.pdf", "Falconridge Bank and Meridian Dunes Bank", banks);
    expect(tie.bankId.value).toBeNull();
    expect(suggestBankAndProduct("x.pdf", "nothing", []).bankId.reason).toMatch(/No banks/);
  });
});
