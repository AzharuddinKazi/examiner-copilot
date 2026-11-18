import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import type { NoticeView } from "./report";
import { SELF_APPROVED_LABEL } from "../review";
import { formatLong } from "./business-days";

const WIN_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[\s\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\d.,:;()%-]*[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;

/** The standard PDF fonts only cover Western European text; Arabic is pointed to the Word file instead. */
export function pdfSafe(s: string): string {
  return s
    .replace(ARABIC, "[Arabic text: see the Word file]")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split("")
    .map((c) => (c === "\n" || (c >= " " && c <= "~") || (c >= "\u00A0" && c <= "\u00FF") || WIN_EXTRA.has(c) ? c : "?"))
    .join("");
}

const INK = rgb(0.13, 0.12, 0.1);
const MUTED = rgb(0.42, 0.4, 0.36);
const BAD = rgb(0.62, 0.16, 0.12);
const WARN = rgb(0.66, 0.42, 0.05);
const RULE = rgb(0.82, 0.79, 0.73);

const STATUS = { breach: "Breach", warning: "Warning" } as const;
const SEV = { high: "High", medium: "Medium", low: "Low" } as const;

export async function renderNoticePdf(v: NoticeView): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Findings report - ${pdfSafe(v.productName)} - ${pdfSafe(v.bankName)}`);
  doc.setCreator("Examiner Co-Pilot");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = 595.28, H = 841.89, M = 56, CW = W - 2 * M;
  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];

  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/ +/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= width) line = tryLine;
        else {
          if (line) out.push(line);
          // Break very long words.
          let w = word;
          while (font.widthOfTextAtSize(w, size) > width) {
            let k = w.length;
            while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
            out.push(w.slice(0, k));
            w = w.slice(k);
          }
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  };
  const text = (s: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 10, indent = o.indent ?? 0, lh = size * 1.35;
    for (const line of wrap(s, font, size, CW - indent)) {
      ensure(lh);
      page.drawText(line, { x: M + indent, y: y - size, size, font, color: o.color ?? INK });
      y -= lh;
    }
    y -= o.gap ?? 4;
  };
  const hr = () => {
    ensure(10);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.6, color: RULE });
    y -= 10;
  };

  newPage();
  text("DRAFT SUPERVISORY NOTICE: NOT SENT", { font: bold, size: 8, color: MUTED, gap: 2 });
  text("Findings report", { font: bold, size: 20, gap: 2 });
  text(`${v.productName} · ${v.bankName}`, { size: 13, gap: 10 });

  const meta: [string, string][] = [
    ["Reference date", formatLong(v.referenceDate)],
    ["Bank to respond by", `${formatLong(v.responseDueDate)} (${v.responseDays} business days)`],
    ["Overall rating", v.overall.rating !== null ? `${v.overall.rating} ${v.overall.label ?? ""}${v.overall.provisional ? " (provisional)" : ""}` : "Not rated"],
    ["Findings", `${v.findings.filter((f) => f.included && f.status === "breach").length} breaches, ${v.findings.filter((f) => f.included && f.status === "warning").length} warnings`],
    [
      "Approval",
      v.state === "approved"
        ? `${v.selfApproved ? `${SELF_APPROVED_LABEL}: approved` : "Approved"} by ${v.checker ?? "a senior examiner"} on ${v.checkedAt ? new Date(v.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}; prepared by ${v.submittedBy ?? "an examiner"}${v.selfApproved ? ". Production requires a different senior examiner as checker." : ""}`
        : v.state === "awaiting"
          ? `Awaiting approval; sent by ${v.submittedBy ?? "an examiner"}`
          : "Not approved: internal working copy",
    ],
  ];
  for (const [k, val] of meta) {
    const lines = wrap(val, reg, 10, CW - 130);
    ensure(lines.length * 13.5);
    page.drawText(k, { x: M, y: y - 10, size: 9, font: bold, color: MUTED });
    lines.forEach((l, i) => page.drawText(l, { x: M + 130, y: y - 10 - i * 13.5, size: 10, font: reg, color: INK }));
    y -= lines.length * 13.5 + 3;
  }
  y -= 6;
  hr();

  if (v.body.trim()) {
    text("Cover note", { font: bold, size: 12, gap: 4 });
    text(v.body, { gap: 10 });
  }

  if (v.themes.length) {
    text("Theme ratings", { font: bold, size: 12, gap: 2 });
    text("Rating 1 Strong to 4 Weak. Complaint counts are context only and never change a rating.", { size: 8.5, color: MUTED, gap: 6 });
    const cols = [0, 230, 330, 400];
    const head = ["Theme", "Rating", "Findings", "Complaints (median across banks)"];
    ensure(16);
    head.forEach((h, i) => page.drawText(h, { x: M + cols[i]!, y: y - 9, size: 8.5, font: bold, color: MUTED }));
    y -= 14;
    for (const t of v.themes) {
      const name = wrap(t.theme, reg, 9.5, 220);
      ensure(name.length * 12.5 + 4);
      name.forEach((l, i) => page.drawText(l, { x: M, y: y - 9.5 - i * 12.5, size: 9.5, font: reg, color: INK }));
      page.drawText(pdfSafe(`${t.rating} ${t.label ?? ""}`), { x: M + cols[1]!, y: y - 9.5, size: 9.5, font: bold, color: (t.rating ?? 0) >= 3 ? BAD : INK });
      page.drawText(`${t.breaches} B · ${t.warnings} W`, { x: M + cols[2]!, y: y - 9.5, size: 9.5, font: reg, color: INK });
      page.drawText(t.complaints === null ? "-" : `${t.complaints}${t.peerMedian !== null ? ` (${t.peerMedian})` : ""}`, { x: M + cols[3]!, y: y - 9.5, size: 9.5, font: reg, color: INK });
      y -= name.length * 12.5 + 4;
    }
    y -= 6;
    hr();
  }

  text("Findings and required actions", { font: bold, size: 12, gap: 8 });
  const inc = v.findings.filter((f) => f.included);
  inc.forEach((f, idx) => {
    ensure(60);
    text(`${idx + 1}. ${f.ruleCode} · ${f.ruleTitle}`, { font: bold, size: 11, gap: 1 });
    text(`${STATUS[f.status]} · ${SEV[f.severity]} severity · ${f.theme}`, { font: bold, size: 8.5, color: f.status === "breach" ? BAD : WARN, gap: 5 });
    text("Rule", { font: bold, size: 8.5, color: MUTED, gap: 1 });
    text(f.ruleText + (f.sourceRef ? `\nSource: ${f.sourceRef}` : ""), { size: 9.5, gap: 5 });
    text("What we found", { font: bold, size: 8.5, color: MUTED, gap: 1 });
    text(f.rationale, { size: 9.5, gap: f.examinerNote ? 2 : 5 });
    if (f.examinerNote) text(`Examiner note: ${f.examinerNote}`, { font: ital, size: 9.5, gap: 5 });
    if (f.evidence.length) {
      text("Evidence", { font: bold, size: 8.5, color: MUTED, gap: 1 });
      for (const e of f.evidence.slice(0, 4)) text(`"${e.quote}" (${e.documentName}, page ${e.pageNo})`, { font: ital, size: 9, indent: 10, gap: 2 });
      if (f.evidence.length > 4) text(`and ${f.evidence.length - 4} more quotes`, { size: 8.5, color: MUTED, indent: 10, gap: 2 });
      y -= 3;
    }
    text("Required action", { font: bold, size: 8.5, color: MUTED, gap: 1 });
    text(f.action, { size: 9.5, gap: 1 });
    text(`Fix by ${formatLong(f.dueDate)}`, { font: bold, size: 9.5, gap: 6 });
    const decided = [f.decidedBy && `Decided by ${f.decidedBy}`, f.approvedBy && `approved by ${f.approvedBy}`, f.selfApproved && SELF_APPROVED_LABEL].filter(Boolean).join(", ");
    if (decided) text(decided, { size: 8, color: MUTED, gap: 6 });
    hr();
  });
  if (!inc.length) text("No findings are included.", { color: MUTED });

  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawText(`Draft only. This tool never contacts a bank.   Page ${i + 1} of ${total}`, { x: M, y: 30, size: 7.5, font: reg, color: MUTED });
    if (v.state !== "approved") {
      p.drawText("NOT APPROVED", { x: 150, y: 330, size: 64, font: bold, color: rgb(0.85, 0.3, 0.25), opacity: 0.09, rotate: degrees(35) });
    }
  });
  return Buffer.from(await doc.save());
}
