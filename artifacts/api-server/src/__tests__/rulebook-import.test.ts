import { describe, it, expect } from "vitest";
import { parseWorkbook, proposeMapping, buildRules, parseAppliesTo, parseThreshold, WorkbookError } from "../lib/rulebook-import";
import { renderSampleRulebook } from "./fixtures/generate";
import ExcelJS from "exceljs";

async function xlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("sample rulebook", () => {
  it("maps every column and parses all 12 rules without errors", async () => {
    const sheet = await parseWorkbook(await renderSampleRulebook());
    const { mapping, reasons } = proposeMapping(sheet.headers);
    expect(mapping).toEqual({
      code: "Rule ID",
      title: "Rule name",
      text: "Requirement",
      category: "Area",
      appliesTo: "Applies to",
      checkType: "Check",
      threshold: "Limit",
      severity: "Severity",
    });
    expect(reasons.every((r) => r.reason.length > 0)).toBe(true);
    const { rules, rowErrors } = buildRules(sheet, mapping);
    expect(rowErrors).toEqual([]);
    expect(rules).toHaveLength(12);
    const fr02 = rules.find((r) => r.code === "FR-02")!;
    expect(fr02.checkType).toBe("max_value");
    expect(fr02.threshold).toEqual({ value: 3.25, unit: "%", raw: "3.25%" });
    expect(fr02.appliesToDocTypes).toEqual(["kfs", "tnc"]);
    expect(rules.find((r) => r.code === "FR-04")!.threshold).toEqual({ value: 230, unit: "AED", raw: "AED 230" });
  });
});

describe("row validation", () => {
  it("reports each problem against its spreadsheet row", async () => {
    const sheet = await parseWorkbook(
      await xlsx([
        ["Code", "Title", "Text", "Check", "Applies to", "Threshold", "Severity"],
        ["R1", "Ok", "Rule text", "Must be stated", "KFS", "", "High"],
        ["R1", "Dup", "Rule text", "presence", "KFS", "", "Low"],
        ["R3", "", "Rule text", "max", "Leaflet", "", "Urgent"],
        ["R4", "Cap", "Rule text", "maximum", "Fees", "no number", ""],
      ]),
    );
    const { mapping } = proposeMapping(sheet.headers);
    const { rules, rowErrors } = buildRules(sheet, mapping);
    expect(rules.map((r) => r.code)).toEqual(["R1"]);
    const at = (row: number) => rowErrors.filter((e) => e.row === row).map((e) => e.field).sort();
    expect(at(3)).toEqual(["code"]);
    expect(at(4)).toEqual(["appliesTo", "severity", "threshold", "title"]);
    expect(at(5)).toEqual(["threshold"]);
  });

  it("refuses to build when a required field is not mapped", async () => {
    const sheet = await parseWorkbook(await xlsx([["A", "B"], ["1", "2"]]));
    const { mapping } = proposeMapping(sheet.headers);
    const { rules, rowErrors } = buildRules(sheet, mapping);
    expect(rules).toEqual([]);
    expect(rowErrors.map((e) => e.field).sort()).toEqual(["checkType", "code", "text", "title"]);
  });

  it("rejects a column mapped twice", async () => {
    const sheet = await parseWorkbook(await xlsx([["Code", "Title", "Text", "Check"], ["R1", "T", "X", "presence"]]));
    const { mapping } = proposeMapping(sheet.headers);
    const { rowErrors } = buildRules(sheet, { ...mapping, category: "Title" });
    expect(rowErrors[0]?.message).toMatch(/more than one field/);
  });

  it("rejects files that are not .xlsx", async () => {
    await expect(parseWorkbook(Buffer.from("%PDF-1.7 not a workbook"))).rejects.toBeInstanceOf(WorkbookError);
  });
});

describe("cell parsers", () => {
  it("parses applies-to lists, including names that contain 'and'", () => {
    expect(parseAppliesTo("Terms and Conditions, Fees Schedule").types).toEqual(["tnc", "fees"]);
    expect(parseAppliesTo("All").types).toEqual(["kfs", "tnc", "rewards", "fees"]);
    expect(parseAppliesTo("").types).toHaveLength(4);
    expect(parseAppliesTo("KFS and Brochure").unknown).toEqual(["Brochure"]);
  });
  it("parses thresholds with units", () => {
    expect(parseThreshold("AED 1,500")).toEqual({ value: 1500, unit: "AED", raw: "AED 1,500" });
    expect(parseThreshold("60 days")).toMatchObject({ value: 60, unit: "days" });
    expect(parseThreshold("")).toBeNull();
  });
});
