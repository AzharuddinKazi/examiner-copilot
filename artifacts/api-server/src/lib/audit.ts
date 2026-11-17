import { createHash } from "node:crypto";
import { db, auditLogTable, type AuditLogRow } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Dataset } from "./dataset";

export interface AuditInput {
  dataset: Dataset;
  role: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function computeAuditHash(
  prevHash: string | null,
  e: { dataset: string; ts: Date; role: string | null; action: string; entityType: string; entityId: string | null; summary: string; before: unknown; after: unknown },
): string {
  const payload = canonicalJson({
    prevHash,
    dataset: e.dataset,
    ts: e.ts.toISOString(),
    role: e.role,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: e.summary,
    before: e.before ?? null,
    after: e.after ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Appends one event to the dataset's hash chain. Serialised with an advisory lock per dataset. */
export async function appendAudit(input: AuditInput, tx?: Tx): Promise<AuditLogRow> {
  const run = async (t: Tx) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${"audit_log:" + input.dataset}))`);
    const last = await t
      .select({ hash: auditLogTable.hash })
      .from(auditLogTable)
      .where(eq(auditLogTable.dataset, input.dataset))
      .orderBy(desc(auditLogTable.id))
      .limit(1);
    const prevHash = last[0]?.hash ?? null;
    // Millisecond precision so the stored timestamp round-trips exactly for verification.
    const ts = new Date(Math.floor(Date.now()));
    const row = {
      dataset: input.dataset,
      ts,
      role: input.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: input.before ?? null,
      after: input.after ?? null,
    };
    const hash = computeAuditHash(prevHash, row);
    const [inserted] = await t.insert(auditLogTable).values({ ...row, prevHash, hash }).returning();
    return inserted!;
  };
  return tx ? run(tx) : db.transaction(run);
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAtId: number | null;
}

export async function verifyAuditChain(dataset: Dataset): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.dataset, dataset))
    .orderBy(asc(auditLogTable.id));
  let prev: string | null = null;
  for (const r of rows) {
    const expected = computeAuditHash(prev, r);
    if (r.prevHash !== prev || r.hash !== expected) {
      return { valid: false, checked: rows.length, brokenAtId: r.id };
    }
    prev = r.hash;
  }
  return { valid: true, checked: rows.length, brokenAtId: null };
}

export async function listAudit(dataset: Dataset, opts: { limit: number; offset: number; action?: string }) {
  const where = opts.action
    ? and(eq(auditLogTable.dataset, dataset), eq(auditLogTable.action, opts.action))
    : eq(auditLogTable.dataset, dataset);
  const [items, totalRows, actionRows] = await Promise.all([
    db.select().from(auditLogTable).where(where).orderBy(desc(auditLogTable.id)).limit(opts.limit).offset(opts.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLogTable).where(where),
    db
      .selectDistinct({ action: auditLogTable.action })
      .from(auditLogTable)
      .where(eq(auditLogTable.dataset, dataset))
      .orderBy(asc(auditLogTable.action)),
  ]);
  return { items, total: totalRows[0]?.n ?? 0, actions: actionRows.map((a) => a.action) };
}
