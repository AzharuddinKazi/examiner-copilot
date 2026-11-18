/**
 * Deleting library items. Deleting something also deletes what depends on it, so the
 * workspace never holds an assessment that points at a missing document or rule:
 * - a bank takes its products, their documents and assessments, and its notices;
 * - a product takes its documents and assessments;
 * - a document takes the assessments that read it;
 * - a rulebook takes its versions; a version takes its rules and the assessments that used it.
 * Notices left with no findings are removed. The audit log is never changed: each deletion
 * is recorded in it. Nothing is deleted while an affected assessment is running.
 */
import {
  db,
  assessmentsTable,
  assessmentDocumentsTable,
  banksTable,
  documentsTable,
  noticeFindingsTable,
  noticesTable,
  productsTable,
  rulebooksTable,
  rulebookVersionsTable,
  rulesTable,
  storedFilesTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Dataset } from "./dataset";

export type DeleteKind = "bank" | "product" | "document" | "rulebook" | "rulebook_version" | "assessment";

export interface DeleteImpact {
  kind: DeleteKind;
  id: number;
  name: string;
  products: number;
  documents: number;
  assessments: number;
  rulebookVersions: number;
  rules: number;
  notices: number;
  /** True when the active rulebook version would be deleted; assessments cannot start until another is activated. */
  removesActiveRulebook: boolean;
  blockedReason: string | null;
}

interface Plan {
  name: string;
  productIds: number[];
  documentIds: number[];
  assessmentIds: number[];
  versionIds: number[];
  ruleCount: number;
  noticeIds: number[];
  fileIds: number[];
  running: boolean;
  activeVersion: boolean;
}

export class DeleteNotFound extends Error {}

const ids = <T extends { id: number }>(rows: T[]) => rows.map((r) => r.id);

async function plan(dataset: Dataset, kind: DeleteKind, id: number): Promise<Plan> {
  const p: Plan = { name: "", productIds: [], documentIds: [], assessmentIds: [], versionIds: [], ruleCount: 0, noticeIds: [], fileIds: [], running: false, activeVersion: false };
  const docsWhere = (col: typeof documentsTable.bankId | typeof documentsTable.productId, v: number[]) =>
    v.length ? db.select({ id: documentsTable.id, fileKey: documentsTable.fileKey }).from(documentsTable).where(and(eq(documentsTable.dataset, dataset), inArray(col, v))) : Promise.resolve([]);

  if (kind === "bank") {
    const [b] = await db.select().from(banksTable).where(and(eq(banksTable.dataset, dataset), eq(banksTable.id, id)));
    if (!b) throw new DeleteNotFound("Bank not found.");
    p.name = b.nameEn;
    p.productIds = ids(await db.select({ id: productsTable.id }).from(productsTable).where(and(eq(productsTable.dataset, dataset), eq(productsTable.bankId, id))));
    const docs = await docsWhere(documentsTable.bankId, [id]);
    const docs2 = await docsWhere(documentsTable.productId, p.productIds);
    const all = new Map([...docs, ...docs2].map((d) => [d.id, d]));
    p.documentIds = [...all.keys()];
    p.fileIds = [...all.values()].map((d) => Number(d.fileKey));
    p.assessmentIds = ids(await db.select({ id: assessmentsTable.id }).from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.bankId, id))));
    p.noticeIds = ids(await db.select({ id: noticesTable.id }).from(noticesTable).where(and(eq(noticesTable.dataset, dataset), eq(noticesTable.bankId, id))));
  } else if (kind === "product") {
    const [pr] = await db.select().from(productsTable).where(and(eq(productsTable.dataset, dataset), eq(productsTable.id, id)));
    if (!pr) throw new DeleteNotFound("Product not found.");
    p.name = pr.name;
    p.productIds = [id];
    const docs = await docsWhere(documentsTable.productId, [id]);
    p.documentIds = ids(docs);
    p.fileIds = docs.map((d) => Number(d.fileKey));
    p.assessmentIds = ids(await db.select({ id: assessmentsTable.id }).from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.productId, id))));
  } else if (kind === "document") {
    const [d] = await db.select().from(documentsTable).where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, id)));
    if (!d) throw new DeleteNotFound("Document not found.");
    p.name = d.originalName;
    p.documentIds = [id];
    p.fileIds = [Number(d.fileKey)];
  } else if (kind === "rulebook" || kind === "rulebook_version") {
    if (kind === "rulebook") {
      const [rb] = await db.select().from(rulebooksTable).where(and(eq(rulebooksTable.dataset, dataset), eq(rulebooksTable.id, id)));
      if (!rb) throw new DeleteNotFound("Rulebook not found.");
      p.name = rb.name;
      p.versionIds = ids(await db.select({ id: rulebookVersionsTable.id }).from(rulebookVersionsTable).where(eq(rulebookVersionsTable.rulebookId, id)));
    } else {
      const [v] = await db.select().from(rulebookVersionsTable).where(and(eq(rulebookVersionsTable.dataset, dataset), eq(rulebookVersionsTable.id, id)));
      if (!v) throw new DeleteNotFound("Rulebook version not found.");
      const [rb] = await db.select().from(rulebooksTable).where(eq(rulebooksTable.id, v.rulebookId));
      p.name = `${rb?.name ?? "Rulebook"} v${v.version}`;
      p.versionIds = [id];
    }
    if (p.versionIds.length) {
      const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(rulesTable).where(inArray(rulesTable.versionId, p.versionIds))) as [{ n: number }];
      p.ruleCount = n;
      p.assessmentIds = ids(await db.select({ id: assessmentsTable.id }).from(assessmentsTable).where(inArray(assessmentsTable.rulebookVersionId, p.versionIds)));
      const files = await db.select({ key: rulebookVersionsTable.sourceFileKey, status: rulebookVersionsTable.status }).from(rulebookVersionsTable).where(inArray(rulebookVersionsTable.id, p.versionIds));
      p.fileIds = files.map((f) => Number(f.key)).filter((n) => Number.isFinite(n));
      p.activeVersion = files.some((f) => f.status === "active");
    }
  } else {
    const [a] = await db.select().from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.id, id)));
    if (!a) throw new DeleteNotFound("Assessment not found.");
    p.name = `assessment #${a.id}`;
    p.assessmentIds = [id];
  }

  // Assessments that read any of the documents go too.
  if (p.documentIds.length) {
    const viaDocs = await db.selectDistinct({ id: assessmentDocumentsTable.assessmentId }).from(assessmentDocumentsTable).where(inArray(assessmentDocumentsTable.documentId, p.documentIds));
    p.assessmentIds = [...new Set([...p.assessmentIds, ...ids(viaDocs)])];
  }
  if (p.assessmentIds.length) {
    const running = await db
      .select({ id: assessmentsTable.id })
      .from(assessmentsTable)
      .where(and(inArray(assessmentsTable.id, p.assessmentIds), inArray(assessmentsTable.status, ["queued", "running"])));
    p.running = running.length > 0;
  }
  return p;
}

export async function deleteImpact(dataset: Dataset, kind: DeleteKind, id: number): Promise<DeleteImpact> {
  const p = await plan(dataset, kind, id);
  return {
    kind,
    id,
    name: p.name,
    products: kind === "bank" ? p.productIds.length : 0,
    documents: p.documentIds.length,
    assessments: p.assessmentIds.length,
    rulebookVersions: kind === "rulebook" ? p.versionIds.length : 0,
    rules: p.ruleCount,
    notices: p.noticeIds.length,
    removesActiveRulebook: p.activeVersion,
    blockedReason: p.running ? "An assessment that uses this is still running. Stop it on the Assess page, then delete." : null,
  };
}

const LABEL: Record<DeleteKind, string> = {
  bank: "bank",
  product: "card product",
  document: "document",
  rulebook: "rulebook",
  rulebook_version: "rulebook version",
  assessment: "assessment",
};

export async function deleteItem(dataset: Dataset, kind: DeleteKind, id: number, role: string): Promise<DeleteImpact> {
  const impact = await deleteImpact(dataset, kind, id);
  if (impact.blockedReason) return impact;
  const p = await plan(dataset, kind, id);
  await db.transaction(async (tx) => {
    // Notices that will lose findings: remember them so empty ones can be removed afterwards.
    const touchedNotices = p.assessmentIds.length
      ? await tx.execute<{ notice_id: number }>(sql`
          select distinct nf.notice_id from notice_findings nf
          join findings f on f.id = nf.finding_id
          where f.assessment_id in (${sql.join(p.assessmentIds.map((x) => sql`${x}`), sql`, `)})`)
      : { rows: [] as { notice_id: number }[] };
    if (p.assessmentIds.length) await tx.delete(assessmentsTable).where(inArray(assessmentsTable.id, p.assessmentIds));
    if (p.documentIds.length) await tx.delete(documentsTable).where(inArray(documentsTable.id, p.documentIds));
    if (p.versionIds.length) await tx.delete(rulebookVersionsTable).where(inArray(rulebookVersionsTable.id, p.versionIds));
    if (kind === "rulebook") await tx.delete(rulebooksTable).where(and(eq(rulebooksTable.dataset, dataset), eq(rulebooksTable.id, id)));
    if (kind === "product") await tx.delete(productsTable).where(and(eq(productsTable.dataset, dataset), eq(productsTable.id, id)));
    if (kind === "bank") {
      if (p.noticeIds.length) await tx.delete(noticesTable).where(inArray(noticesTable.id, p.noticeIds));
      await tx.delete(banksTable).where(and(eq(banksTable.dataset, dataset), eq(banksTable.id, id)));
    }
    const fileIds = p.fileIds.filter((n) => Number.isFinite(n) && n > 0);
    if (fileIds.length) await tx.delete(storedFilesTable).where(and(eq(storedFilesTable.dataset, dataset), inArray(storedFilesTable.id, fileIds)));
    const candidates = touchedNotices.rows.map((r) => Number(r.notice_id));
    if (candidates.length) {
      const stillUsed = await tx.selectDistinct({ id: noticeFindingsTable.noticeId }).from(noticeFindingsTable).where(inArray(noticeFindingsTable.noticeId, candidates));
      const empty = candidates.filter((n) => !stillUsed.some((s) => s.id === n));
      if (empty.length) await tx.delete(noticesTable).where(inArray(noticesTable.id, empty));
    }
    const also = [
      impact.products && `${impact.products} product(s)`,
      impact.rulebookVersions && `${impact.rulebookVersions} version(s)`,
      impact.rules && `${impact.rules} rule(s)`,
      kind !== "document" && impact.documents && `${impact.documents} document(s)`,
      kind !== "assessment" && impact.assessments && `${impact.assessments} assessment(s)`,
      impact.notices && `${impact.notices} notice(s)`,
    ].filter(Boolean);
    await appendAudit(
      {
        dataset,
        role,
        action: `${kind}.deleted`,
        entityType: kind,
        entityId: String(id),
        summary: `Deleted ${LABEL[kind]} ${impact.name}${also.length ? `, with ${also.join(", ")}` : ""}.`,
        before: impact,
      },
      tx,
    );
  });
  return impact;
}
