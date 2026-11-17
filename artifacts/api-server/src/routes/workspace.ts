import { Router, type IRouter } from "express";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
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
import { GetWorkspaceStatusResponse, GetWorkspaceProgressResponse } from "@workspace/api-zod";
import { getAppState, type Dataset } from "../lib/dataset";
import { reviewQueue } from "../lib/review";

const router: IRouter = Router();

router.get("/workspace/status", async (_req, res): Promise<void> => {
  const s = await getAppState();
  res.json(
    GetWorkspaceStatusResponse.parse({
      mode: s.mode,
      switchedAt: s.switchedAt,
      switchedByRole: s.switchedByRole,
      oneWay: true,
    }),
  );
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
  return { total: counts.total, decided: counts.decided, pending: counts.undecided };
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
      state: findings.total === 0 ? "not_started" : findings.pending > 0 ? "in_progress" : "done",
      counts: [
        { label: "Proposed findings", value: findings.total },
        { label: "Decided", value: findings.decided },
        { label: "Awaiting decision", value: findings.pending },
      ],
      summary:
        findings.total === 0
          ? "No findings to review yet."
          : findings.pending > 0
            ? `${plural(findings.pending, "finding")} awaiting an examiner decision.`
            : "Every proposed finding has a decision.",
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
