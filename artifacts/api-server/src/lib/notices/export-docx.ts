import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { NoticeView } from "./report";
import { formatLong } from "./business-days";

const ARABIC = /[\u0600-\u06FF]/;
const MUTED = "6B665C";
const BAD = "9E291F";
const WARN = "A86B0D";

const label = (s: string) => new Paragraph({ spacing: { before: 120, after: 20 }, children: [new TextRun({ text: s, bold: true, size: 17, color: MUTED })] });
const para = (s: string, o: { italics?: boolean; bold?: boolean; size?: number; color?: string } = {}) =>
  s.split("\n").map(
    (line) =>
      new Paragraph({
        bidirectional: ARABIC.test(line),
        alignment: ARABIC.test(line) ? AlignmentType.RIGHT : undefined,
        spacing: { after: 60 },
        children: [new TextRun({ text: line, italics: o.italics, bold: o.bold, size: o.size ?? 20, color: o.color, rightToLeft: ARABIC.test(line) })],
      }),
  );

const cell = (s: string, o: { bold?: boolean; color?: string; width?: number } = {}) =>
  new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: s, bold: o.bold, size: 18, color: o.color })] })],
  });

export async function renderNoticeDocx(v: NoticeView): Promise<Buffer> {
  const inc = v.findings.filter((f) => f.included);
  const approval =
    v.state === "approved"
      ? `Approved by ${v.checker ?? "a senior examiner"} on ${v.checkedAt ? new Date(v.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}; prepared by ${v.submittedBy ?? "an examiner"}`
      : v.state === "awaiting"
        ? `Awaiting approval; sent by ${v.submittedBy ?? "an examiner"}`
        : "Not approved: internal working copy";

  const meta: [string, string][] = [
    ["Reference date", formatLong(v.referenceDate)],
    ["Bank to respond by", `${formatLong(v.responseDueDate)} (${v.responseDays} business days)`],
    ["Overall rating", v.overall.rating !== null ? `${v.overall.rating} ${v.overall.label ?? ""}${v.overall.provisional ? " (provisional)" : ""}` : "Not rated"],
    ["Findings", `${inc.filter((f) => f.status === "breach").length} breaches, ${inc.filter((f) => f.status === "warning").length} warnings`],
    ["Approval", approval],
  ];
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: "D1C9BA" };

  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: "DRAFT SUPERVISORY NOTICE: NOT SENT", bold: true, size: 16, color: MUTED })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Findings report" })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${v.productName} · ${v.bankName}`, size: 26 })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: meta.map(([k, val]) => new TableRow({ children: [cell(k, { bold: true, color: MUTED, width: 28 }), cell(val, { width: 72 })] })),
    }),
  ];

  if (v.body.trim()) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("Cover note")] }), ...para(v.body));
  }

  if (v.themes.length) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("Theme ratings")] }),
      new Paragraph({ children: [new TextRun({ text: "Rating 1 Strong to 4 Weak. Complaint counts are context only and never change a rating.", size: 17, color: MUTED })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: thin, bottom: thin, left: none, right: none, insideHorizontal: thin, insideVertical: none },
        rows: [
          new TableRow({ tableHeader: true, children: ["Theme", "Rating", "Breaches", "Warnings", "Complaints (median)"].map((h) => cell(h, { bold: true, color: MUTED })) }),
          ...v.themes.map(
            (t) =>
              new TableRow({
                children: [
                  cell(t.theme, { width: 40 }),
                  cell(`${t.rating} ${t.label ?? ""}`, { bold: true, color: (t.rating ?? 0) >= 3 ? BAD : undefined }),
                  cell(String(t.breaches)),
                  cell(String(t.warnings)),
                  cell(t.complaints === null ? "–" : `${t.complaints}${t.peerMedian !== null ? ` (${t.peerMedian})` : ""}`),
                ],
              }),
          ),
        ],
      }),
    );
  }

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("Findings and required actions")] }));
  inc.forEach((f, i) => {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240 }, children: [new TextRun(`${i + 1}. ${f.ruleCode} · ${f.ruleTitle}`)] }),
      new Paragraph({
        children: [new TextRun({ text: `${f.status === "breach" ? "Breach" : "Warning"} · ${f.severity[0]!.toUpperCase()}${f.severity.slice(1)} severity · ${f.theme}`, bold: true, size: 17, color: f.status === "breach" ? BAD : WARN })],
      }),
      label("Rule"),
      ...para(f.ruleText + (f.sourceRef ? `\nSource: ${f.sourceRef}` : "")),
      label("What we found"),
      ...para(f.rationale),
      ...(f.examinerNote ? para(`Examiner note: ${f.examinerNote}`, { italics: true }) : []),
    );
    if (f.evidence.length) {
      children.push(label("Evidence"));
      for (const e of f.evidence) {
        children.push(
          new Paragraph({
            bidirectional: ARABIC.test(e.quote),
            indent: { left: 360 },
            spacing: { after: 60 },
            children: [new TextRun({ text: `“${e.quote}”`, italics: true, size: 19, rightToLeft: ARABIC.test(e.quote) }), new TextRun({ text: ` (${e.documentName}, page ${e.pageNo})`, size: 17, color: MUTED })],
          }),
        );
      }
    }
    children.push(label("Required action"), ...para(f.action), new Paragraph({ children: [new TextRun({ text: `Fix by ${formatLong(f.dueDate)}`, bold: true, size: 20 })] }));
    const decided = [f.decidedBy && `Decided by ${f.decidedBy}`, f.approvedBy && `approved by ${f.approvedBy}`].filter(Boolean).join(", ");
    if (decided) children.push(new Paragraph({ children: [new TextRun({ text: decided, size: 16, color: MUTED })] }));
  });
  if (!inc.length) children.push(...para("No findings are included.", { color: MUTED }));

  const doc = new Document({
    creator: "Examiner Co-Pilot",
    title: `Findings report - ${v.productName} - ${v.bankName}`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [
      {
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: v.state === "approved" ? "Approved draft · not sent" : "NOT APPROVED · internal working copy", bold: v.state !== "approved", size: 16, color: v.state === "approved" ? MUTED : BAD })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new TextRun({ text: "Draft only. This tool never contacts a bank.   Page ", size: 15, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED }), new TextRun({ text: " of ", size: 15, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: MUTED })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
