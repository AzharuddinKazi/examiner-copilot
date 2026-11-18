import ExcelJS from "exceljs";

export const RULEBOOK_TEMPLATE_FILE = "rulebook-template.xlsx";
const HEADERS = ["Rule ID", "Rule name", "Requirement", "Area", "Applies to", "Check", "Limit", "Severity"];

/** An empty rulebook with the expected columns and a short guide; contains no rules. */
export async function renderRulebookTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Examiner Co-Pilot";
  const ws = wb.addWorksheet("Rules");
  ws.addRow(HEADERS).font = { bold: true };
  ws.columns.forEach((c, i) => (c.width = [10, 28, 70, 14, 14, 18, 12, 10][i] ?? 14));
  const notes = wb.addWorksheet("Guide");
  notes.addRow(["One row per rule on the Rules sheet. Column names can differ; you map them on import."]);
  notes.addRow(["Check: Binary, Subjective, Calculation, Must be stated, Maximum, Minimum, Consistency, Bilingual, Readability, Prohibited wording."]);
  notes.addRow(["Applies to: KFS, T&C (or TC), Rewards, Fees (or SOFC), Advert, or All. Separate with commas or semicolons."]);
  notes.addRow(["Rule name is optional; if left out, it is taken from the requirement text. Any extra columns are kept with each rule."]);
  notes.addRow(["Limit: needed for Maximum and Minimum checks, e.g. 3.25% or AED 300."]);
  notes.addRow(["Severity: Low, Medium or High."]);
  notes.getColumn(1).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
