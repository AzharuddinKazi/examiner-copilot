/**
 * The scoring rubric and the document-role settings. Both are JSON documents the examiner can
 * edit; they are validated here so a bad edit is refused with a clear message instead of breaking scoring.
 */
import { z } from "zod";
import defaultScoring from "./defaults/scoring-config.json";
import defaultRoles from "./defaults/document-roles.json";

export const VERDICTS = ["Satisfied", "Partially", "Not satisfied", "Not applicable"] as const;
export const SEVERITIES = ["Low", "Medium", "High"] as const;
export const ROLES = ["TC", "REWARDS", "KFS", "SOFC", "ADVERT"] as const;
export type Role = (typeof ROLES)[number];

const rating = z.number().int().min(1).max(4);
const severityRow = z.object({ Low: rating, Medium: rating, High: rating });

export const scoringConfigSchema = z
  .object({
    version: z.string().min(1),
    scale: z
      .object({
        "1": z.string().min(1),
        "2": z.string().min(1),
        "3": z.string().min(1),
        "4": z.string().min(1),
        direction: z.string().optional(),
        percentage: z.string().optional(),
      })
      .passthrough(),
    verdicts: z.array(z.string()).optional(),
    rating_matrix: z.object({ Satisfied: severityRow, Partially: severityRow, "Not satisfied": severityRow }),
    cutoffs: z
      .array(z.number().min(1).max(4))
      .length(3)
      .refine((c) => c[0]! < c[1]! && c[1]! < c[2]!, "Cutoffs must be three increasing numbers, e.g. [1.5, 2.5, 3.5]."),
    on_cutoff_goes_to: z.enum(["weaker rating", "stronger rating"]).default("weaker rating"),
    near_cutoff_margin: z.number().min(0).max(1).default(0.15),
    caps: z
      .object({
        trigger_rating: rating,
        any_rule_at_trigger_floor: rating,
        any_theme_at_trigger_floor: rating,
        theme_cap: z.string().optional(),
      })
      .passthrough(),
    combine: z.record(z.string(), z.string()).optional(),
    aggregation: z.record(z.string(), z.unknown()).optional(),
    applicability: z.record(z.string(), z.string()).optional(),
    coverage: z.string().optional(),
    completeness: z
      .object({
        required_roles: z.array(z.string()),
        required_if_detected: z.record(z.string(), z.string()).default({}),
        optional: z.array(z.string()).default([]),
        label_if_incomplete: z.string().default("Provisional: incomplete submission"),
      })
      .passthrough(),
    contradiction_flag: z.string().optional(),
    themes: z.array(z.string().min(1)).min(1),
    complaints: z.string().optional(),
  })
  .passthrough();
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

const roleSchema = z
  .object({
    signals: z.array(z.string()).optional(),
    subtypes: z.record(z.string(), z.array(z.string())).optional(),
    note: z.string().optional(),
    metadata_required: z.array(z.string()).optional(),
  })
  .passthrough();

export const documentRolesSchema = z
  .object({
    version: z.string().min(1),
    principle: z.string().optional(),
    roles: z
      .record(z.string(), roleSchema)
      .refine((r) => ROLES.every((k) => k in r), `Every role must be present: ${ROLES.join(", ")}.`),
    section_output_format: z.record(z.string(), z.string()).optional(),
    low_confidence_rule: z.string().optional(),
  })
  .passthrough();
export type DocumentRolesConfig = z.infer<typeof documentRolesSchema>;

export const SETTINGS = {
  scoring: { schema: scoringConfigSchema, defaults: defaultScoring as unknown, label: "scoring rubric" },
  document_roles: { schema: documentRolesSchema, defaults: defaultRoles as unknown, label: "document roles" },
} as const;
export type SettingsKind = keyof typeof SETTINGS;

/** Readable list of what is wrong with an edited settings document. */
export function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "(top level)"}: ${i.message}`)
    .join("; ");
}

/** Signals that show a card has a rewards programme (cashback, points or miles). */
export function rewardSignals(roles: DocumentRolesConfig): string[] {
  return roles.roles.REWARDS?.signals ?? ["cashback", "reward points", "miles"];
}
