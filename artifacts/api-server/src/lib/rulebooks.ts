import { db, rulebooksTable, rulebookVersionsTable, rulesTable, storedFilesTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Dataset } from "./dataset";
import type { ColumnMapping, RuleDraft } from "./rulebook-import";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createRulebookVersion(
  tx: Tx,
  input: {
    dataset: Dataset;
    rulebookId: number | null;
    rulebookName: string | null;
    sourceFileId: number;
    mapping: ColumnMapping;
    rules: RuleDraft[];
  },
) {
  let rulebookId = input.rulebookId;
  if (rulebookId === null) {
    const [rb] = await tx
      .insert(rulebooksTable)
      .values({ dataset: input.dataset, name: input.rulebookName ?? "Rulebook" })
      .returning();
    rulebookId = rb!.id;
  }
  const [{ next }] = (await tx
    .select({ next: sql<number>`coalesce(max(${rulebookVersionsTable.version}), 0)::int + 1` })
    .from(rulebookVersionsTable)
    .where(eq(rulebookVersionsTable.rulebookId, rulebookId))) as [{ next: number }];
  const [version] = await tx
    .insert(rulebookVersionsTable)
    .values({
      dataset: input.dataset,
      rulebookId,
      version: next,
      sourceFileKey: String(input.sourceFileId),
      columnMapping: input.mapping,
      status: "draft",
    })
    .returning();
  if (input.rules.length) {
    await tx.insert(rulesTable).values(
      input.rules.map((r) => ({
        dataset: input.dataset,
        versionId: version!.id,
        rowNo: r.row,
        code: r.code,
        title: r.title,
        text: r.text,
        category: r.category,
        appliesToDocTypes: r.appliesToDocTypes,
        checkType: r.checkType,
        threshold: r.threshold,
        severity: r.severity,
      })),
    );
  }
  return { rulebookId, version: version! };
}

/** Exactly one active version per dataset: activating retires any other active version. */
export async function activateVersion(tx: Tx, dataset: Dataset, versionId: number) {
  const previous = await tx
    .update(rulebookVersionsTable)
    .set({ status: "retired" })
    .where(and(eq(rulebookVersionsTable.dataset, dataset), eq(rulebookVersionsTable.status, "active")))
    .returning({ id: rulebookVersionsTable.id, version: rulebookVersionsTable.version });
  const [row] = await tx
    .update(rulebookVersionsTable)
    .set({ status: "active", activatedAt: new Date() })
    .where(and(eq(rulebookVersionsTable.dataset, dataset), eq(rulebookVersionsTable.id, versionId)))
    .returning();
  return { activated: row!, retired: previous.filter((p) => p.id !== versionId) };
}

export async function versionSummaries(dataset: Dataset, versionIds?: number[]) {
  const where = versionIds
    ? and(eq(rulebookVersionsTable.dataset, dataset), inArray(rulebookVersionsTable.id, versionIds))
    : eq(rulebookVersionsTable.dataset, dataset);
  const versions = await db.select().from(rulebookVersionsTable).where(where).orderBy(asc(rulebookVersionsTable.version));
  if (!versions.length) return [];
  const ids = versions.map((v) => v.id);
  const counts = await db
    .select({ versionId: rulesTable.versionId, n: sql<number>`count(*)::int` })
    .from(rulesTable)
    .where(inArray(rulesTable.versionId, ids))
    .groupBy(rulesTable.versionId);
  const fileIds = versions.map((v) => Number(v.sourceFileKey)).filter((n) => Number.isInteger(n) && n > 0);
  const files = fileIds.length
    ? await db
        .select({ id: storedFilesTable.id, name: storedFilesTable.originalName })
        .from(storedFilesTable)
        .where(and(eq(storedFilesTable.dataset, dataset), inArray(storedFilesTable.id, fileIds)))
    : [];
  const countMap = new Map(counts.map((c) => [c.versionId, c.n]));
  const fileMap = new Map(files.map((f) => [f.id, f.name]));
  return versions.map((v) => ({
    id: v.id,
    rulebookId: v.rulebookId,
    version: v.version,
    status: v.status,
    ruleCount: countMap.get(v.id) ?? 0,
    sourceFileName: fileMap.get(Number(v.sourceFileKey)) ?? null,
    createdAt: v.createdAt,
    activatedAt: v.activatedAt,
  }));
}
