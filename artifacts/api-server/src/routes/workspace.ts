import { Router, type IRouter } from "express";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
  appStateTable,
  banksTable,
  productsTable,
  rulebookVersionsTable,
  rulesTable,
  documentsTable,
  assessmentsTable,
  findingsTable,
  decisionsTable,
  noticesTable,
} from "@workspace/db";
import { GetWorkspaceStatusResponse, GetWorkspaceProgressResponse, SetMakerCheckerModeBody } from "@workspace/api-zod";
import { getAppState, type AppStateRow, type Dataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";
import { requireSenior } from "../lib/roles";
import { reviewQueue } from "../lib/review";

const router: IRouter = Router();

const statusOf = (s: AppStateRow) =>
  GetWorkspaceStatusResponse.parse({
    mode: s.mode,
    switchedAt: s.switchedAt,
    switchedByRole: s.switchedByRole,
    oneWay: true,
    makerCheckerMode: s.makerCheckerMode,
  });

router.get("/workspace/status", async (_req, res): Promise<void> => {
  res.json(statusOf(await getAppState()));
});

const MODE_LABEL = { strict: "Strict", poc: "Single-user PoC mode" } as const;

/** Senior examiners only. Every change is audited with the old and new values and who made it. */
router.put("/workspace/maker-checker-mode", async (req, res): Promise<void> => {
  if (!requireSenior(req, res, "Only a senior examiner can change the maker-checker mode.")) return;
  const parsed = SetMakerCheckerModeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a mode: strict or poc." });
    return;
  }
  const next = parsed.data.mode;
  const before = await getAppState();
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('maker-checker-mode'))`);
    const [cur] = await tx.select().from(appStateTable).where(eq(appStateTable.id, 1));
    const prev = cur?.makerCheckerMode ?? before.makerCheckerMode;
    if (prev === next) return cur ?? before;
    const [row] = await tx.update(appStateTable).set({ makerCheckerMode: next, updatedAt: new Date() }).where(eq(appStateTable.id, 1)).returning();
    await appendAudit(
      {
        dataset: before.mode,
        role: req.user!.role,
        action: "workspace.maker_checker_mode_changed",
        entityType: "workspace",
        entityId: "maker_checker_mode",
        summary:
          next === "poc"
            ? `Changed maker-checker mode from ${MODE_LABEL[prev]} to ${MODE_LABEL[next]}: one senior examiner may now approve their own decisions and reports. Production requires a different senior examiner.`
            : `Changed maker-checker mode from ${MODE_LABEL[prev]} to ${MODE_LABEL[next]}: a different senior examiner must approve again.`,
        before: { makerCheckerMode: prev },
        after: { makerCheckerMode: next },
      },
      tx,
    );
    return row!;
  });
  res.json(statusOf(updated));
});

const count = sql<number>`count(*)::int`;

async function countDocs(dataset: Dataset) {
  const rows = await db
    .select({ status: documentsTable.status, n: count })
    .from(documentsTable)
    .where(eq(documentsTable.dataset, dataset))
    .groupBy(documentsTable.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { total, confirmed: by["confirmed"] ?? 0, awaiting: (by["uploaded"] ?? 0) + (by["proposed"] ?? 0) };
}

async function countAssessments(dataset: Dataset) {
  const rows = await db
    .select({ status: assessmentsTable.status, n: count })
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.kind, "agentic")))
    .groupBy(assessmentsTable.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { total, running: (by["queued"] ?? 0) + (by["running"] ?? 0), finished: (by["complete"] ?? 0) + (by["stopped"] ?? 0) };
}

/** Counts only the latest finished assessment per product, matching the review queue. */
async function countFindings(dataset: Dataset) {
  const { counts } = await reviewQueue(dataset);
  // Decided counts only final decisions (approved, or routine accepts); awaiting approval is shown apart.
  return { total: counts.total, decided: counts.decided, pending: counts.undecided, awaiting: counts.awaitingApproval };
}

async function countLibrary(dataset: Dataset) {
  const [b] = await db.select({ n: count }).from(banksTable).where(eq(banksTable.dataset, dataset));
  const [p] = await db.select({ n: count }).from(productsTable).where(eq(productsTable.dataset, dataset));
  const [v] = await db.select({ n: count }).from(rulebookVersionsTable).where(eq(rulebookVersionsTable.dataset, dataset));
  const activeVersions = db
    .select({ id: rulebookVersionsTable.id })
    .from(rulebookVersionsTable)
    .where(and(eq(rulebookVersionsTable.dataset, dataset), eq(rulebookVersionsTable.status, "active")));
  const [r] = await db
    .select({ n: count })
    .from(rulesTable)
    .where(and(eq(rulesTable.dataset, dataset), inArray(rulesTable.versionId, activeVersions)));
  return { banks: b?.n ?? 0, products: p?.n ?? 0, rulebookVersions: v?.n ?? 0, activeRules: r?.n ?? 0 };
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

router.get("/workspace/progress", async (_req, res): Promise<void> => {
  const { mode: dataset } = await getAppState();
  const [docs, assess, findings, library, noticeRows] = await Promise.all([
    countDocs(dataset),
    countAssessments(dataset),
    countFindings(dataset),
    countLibrary(dataset),
    db.select({ n: count }).from(noticesTable).where(eq(noticesTable.dataset, dataset)),
  ]);
  const drafts = noticeRows[0]?.n ?? 0;

  const steps = [
    {
      key: "upload" as const,
      number: 1,
      title: "Upload documents",
      question: "Which documents are we examining?",
      href: "/upload",
      state: docs.total === 0 ? "not_started" : docs.awaiting > 0 ? "in_progress" : "done",
      counts: [
        { label: "Uploaded", value: docs.total },
        { label: "Confirmed", value: docs.confirmed },
        { label: "Awaiting confirmation", value: docs.awaiting },
      ],
      summary:
        docs.total === 0
          ? "No documents uploaded yet."
          : docs.awaiting > 0
            ? `${plural(docs.awaiting, "document")} awaiting examiner confirmation.`
            : `${plural(docs.confirmed, "document")} confirmed.`,
    },
    {
      key: "assess" as const,
      number: 2,
      title: "Assess",
      question: "What do the agents propose?",
      href: "/assess",
      state: assess.total === 0 ? "not_started" : assess.running > 0 ? "in_progress" : "done",
      counts: [
        { label: "Assessments", value: assess.total },
        { label: "Running", value: assess.running },
        { label: "Finished", value: assess.finished },
      ],
      summary:
        assess.total === 0
          ? "No assessments run yet."
          : assess.running > 0
            ? `${plural(assess.running, "assessment")} running.`
            : `${plural(assess.finished, "assessment")} finished.`,
    },
    {
      key: "review" as const,
      number: 3,
      title: "Review and decide",
      question: "Do you agree with this finding?",
      href: "/review",
      state: findings.total === 0 ? "not_started" : findings.pending > 0 || findings.awaiting > 0 ? "in_progress" : "done",
      counts: [
        { label: "Proposed findings", value: findings.total },
        { label: "Decided", value: findings.decided },
        { label: "Awaiting decision", value: findings.pending },
        { label: "Awaiting approval", value: findings.awaiting },
      ],
      summary:
        findings.total === 0
          ? "No findings to review yet."
          : findings.pending > 0
            ? `${plural(findings.pending, "finding")} awaiting an examiner decision.`
            : findings.awaiting > 0
              ? `${plural(findings.awaiting, "decision")} awaiting a senior examiner's approval.`
              : "Every proposed finding has a final decision.",
    },
    {
      key: "notices" as const,
      number: 4,
      title: "Notices",
      question: "What would we ask the bank to fix?",
      href: "/notices",
      state: drafts === 0 ? "not_started" : "in_progress",
      counts: [{ label: "Draft notices", value: drafts }],
      summary: drafts === 0 ? "No draft notices yet." : `${plural(drafts, "draft notice")}.`,
    },
  ];
  const next = steps.find((s) => s.state !== "done") ?? steps[steps.length - 1]!;

  res.json(GetWorkspaceProgressResponse.parse({ dataset, steps, nextStepKey: next.key, library }));
});

export default router;
