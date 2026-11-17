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
        ["R3", "", "Rule text", "max", "Billboard", "", "Urgent"],
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
    expect(rowErrors.map((e) => e.field).sort()).toEqual(["checkType", "code", "text"]);
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
    expect(parseAppliesTo("KFS and Billboard").unknown).toEqual(["Billboard"]);
    expect(parseAppliesTo("TC;KFS;SOFC;REWARDS;ADVERT").types).toEqual(["kfs", "tnc", "rewards", "fees", "advert"]);
  });
  it("parses thresholds with units", () => {
    expect(parseThreshold("AED 1,500")).toEqual({ value: 1500, unit: "AED", raw: "AED 1,500" });
    expect(parseThreshold("60 days")).toMatchObject({ value: 60, unit: "days" });
    expect(parseThreshold("")).toBeNull();
  });
});

describe("CSV rulebooks", () => {
  it("reads a comma-separated file with quotes, a BOM and a line break inside a cell", async () => {
    const csv = '\uFEFFRule ID,Rule name,Requirement,Check,Limit\r\nKFS-01,"Late fee cap","Must not exceed AED 230, ""incl. VAT""\nper month",Maximum,AED 230\r\n';
    const s = await parseWorkbook(Buffer.from(csv, "utf8"));
    expect(s.headers).toEqual(["Rule ID", "Rule name", "Requirement", "Check", "Limit"]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]!.cells[2]).toBe('Must not exceed AED 230, "incl. VAT"\nper month');
    expect(s.rows[0]!.row).toBe(2);
  });
  it("detects semicolon separators and Arabic text", async () => {
    const s = await parseWorkbook(Buffer.from("Code;Title;Text;Check\nAR-1;اللغة;نص عربي;Bilingual\n", "utf8"));
    expect(s.rows[0]!.cells).toEqual(["AR-1", "اللغة", "نص عربي", "Bilingual"]);
  });
  it("rejects non-UTF-8 and binary files with a clear message", async () => {
    await expect(parseWorkbook(Buffer.from([0x52, 0x75, 0x6c, 0x65, 0xff, 0x2c, 0x0a, 0x61, 0x2c, 0x62]))).rejects.toThrow(/UTF-8/);
    await expect(parseWorkbook(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/\.xls/);
  });
});

describe("rulebook with role columns and extra criteria", () => {
  it("maps rule_id / rule_type / runs_on_roles, derives titles and keeps extra columns", async () => {
    const csv = [
      "\uFEFFrule_id,rule_text,rule_type,severity,theme,runs_on_roles,compares_with_roles,satisfied",
      'HK-1,"Every headline benefit must appear in the T&C. Second sentence.",Calculation,High,Advertising,ADVERT,TC;REWARDS,"All claims found."',
      "S-2,The KFS must state the APR.,Binary,Medium,Interest,TC;KFS;SOFC,,",
      "S-3,Terms must be fair.,Subjective,Low,Fairness,TC,,",
    ].join("\r\n");
    const sheet = await parseWorkbook(Buffer.from(csv, "utf8"));
    const { mapping } = proposeMapping(sheet.headers);
    expect(mapping).toMatchObject({ code: "rule_id", title: null, text: "rule_text", checkType: "rule_type", appliesTo: "runs_on_roles", category: "theme", severity: "severity" });
    const { rules, rowErrors } = buildRules(sheet, mapping);
    expect(rowErrors).toEqual([]);
    expect(rules.map((r) => r.checkType)).toEqual(["calculation", "binary", "subjective"]);
    expect(rules[0]!.appliesToDocTypes).toEqual(["advert"]);
    expect(rules[1]!.appliesToDocTypes).toEqual(["kfs", "tnc", "fees"]);
    expect(rules[0]!.title).toBe("Every headline benefit must appear in the T&C");
    expect(rules[0]!.details).toEqual([
      { label: "compares_with_roles", value: "TC;REWARDS" },
      { label: "satisfied", value: "All claims found." },
    ]);
    expect(rules[1]!.details).toEqual([]);
  });
});
