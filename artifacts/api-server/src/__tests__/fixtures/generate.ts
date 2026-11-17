import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DemoDocument } from "./content";
import { RULEBOOK_HEADERS, RULEBOOK_ROWS } from "./content";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawScan(page: PDFPage) {
  // A simulated scanned page: shapes only, no text layer.
  const [w, h] = A4;
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.93, 0.92, 0.89) });
  let y = h - MARGIN - 20;
  for (let i = 0; i < 28; i++) {
    const len = (w - MARGIN * 2) * (0.55 + ((i * 37) % 40) / 100);
    page.drawRectangle({ x: MARGIN, y, width: len, height: 6, color: rgb(0.55, 0.54, 0.52), opacity: 0.6 });
    y -= i % 6 === 5 ? 30 : 18;
  }
}

/** Renders a synthetic disclosure PDF with a real text layer (except simulated scans). */
export async function renderDemoPdf(doc: DemoDocument): Promise<Buffer> {
  if (doc.pdfBase64) return Buffer.from(doc.pdfBase64, "base64");
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setProducer("Examiner Co-Pilot demo generator");
  pdf.setCreationDate(new Date("2026-01-15T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-15T00:00:00Z"));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;

  for (const [i, p] of doc.pages.entries()) {
    const page = pdf.addPage(A4);
    if (p.kind === "scan") {
      drawScan(page);
      continue;
    }
    let y = A4[1] - MARGIN;
    if (p.heading) {
      for (const l of wrap(p.heading, bold, 15, width)) {
        page.drawText(l, { x: MARGIN, y, size: 15, font: bold, color: rgb(0.1, 0.1, 0.1) });
        y -= 22;
      }
      y -= 8;
    }
    for (const para of p.paragraphs) {
      for (const l of wrap(para, regular, 10.5, width)) {
        page.drawText(l, { x: MARGIN, y, size: 10.5, font: regular, color: rgb(0.15, 0.15, 0.15) });
        y -= 15;
      }
      y -= 8;
    }
    page.drawText(`Page ${i + 1} of ${doc.pages.length}`, { x: MARGIN, y: 30, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
  }
  return Buffer.from(await pdf.save());
}

/** The fictional 12-rule rulebook as an .xlsx with non-standard headers, to exercise column mapping. */
export async function renderSampleRulebook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Examiner Co-Pilot";
  wb.created = new Date("2026-01-15T00:00:00Z");
  const ws = wb.addWorksheet("Rules");
  ws.addRow(RULEBOOK_HEADERS).font = { bold: true };
  for (const r of RULEBOOK_ROWS) ws.addRow(r);
  ws.columns.forEach((c, i) => (c.width = [10, 28, 70, 14, 14, 18, 12, 10][i] ?? 14));
  const notes = wb.addWorksheet("Read me");
  notes.addRow(["Fictional sample rulebook for Examiner Co-Pilot. Sample rules are not law."]);
  notes.addRow(["Check types: Must be stated, Maximum, Minimum, Consistency, Bilingual, Readability, Prohibited wording."]);
  notes.addRow(["Applies to: KFS, T&C, Rewards, Fees or All (comma-separated)."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
