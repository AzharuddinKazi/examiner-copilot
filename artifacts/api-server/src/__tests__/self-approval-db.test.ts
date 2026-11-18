/**
 * Database-backed checks for the maker-checker mode: in PoC mode a senior examiner's own approval is
 * stored and flagged as self-approved (approval row and audit event); in strict mode it is refused
 * and nothing is written. Runs the real API routes against a throwaway Postgres database that is
 * created from the Drizzle schema before the tests and dropped afterwards.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Sign-in comes from a test header instead of a Clerk session.
vi.mock("@clerk/express", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clerk/express")>()),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({ userId: req.headers["x-test-user"] ?? null, sessionClaims: null }),
}));

const SOURCE_URL = process.env.DATABASE_URL;
const DB_NAME = `self_approval_test_${process.pid}_${Date.now()}`;
const DB_DIR = path.resolve(__dirname, "../../../../lib/db");
const psql = (url: string, cmd: string) => execSync(`psql "${url}" -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(cmd)}`, { stdio: "pipe" });

let server: Server;
let base = "";
// Loaded after DATABASE_URL points at the throwaway database.
let m: typeof import("@workspace/db");
let orm: typeof import("drizzle-orm");

const LABEL = "Self-approved (PoC mode)";
const ids = { seniorA: 0, seniorB: 0, examiner: 0, viewer: 0, finding1: 0, finding2: 0, assessment2: 0 };

async function call(user: string, method: string, url: string, body?: unknown) {
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const setMode = (user: string, mode: "strict" | "poc") => call(user, "PUT", "/workspace/maker-checker-mode", { mode });

async function latestDecisionId(findingId: number) {
  const [d] = await m.db.select().from(m.decisionsTable).where(orm.eq(m.decisionsTable.findingId, findingId)).orderBy(orm.desc(m.decisionsTable.id)).limit(1);
  return d!.id;
}
const auditOf = (action: string) => m.db.select().from(m.auditLogTable).where(orm.eq(m.auditLogTable.action, action)).orderBy(m.auditLogTable.id);

beforeAll(async () => {
  if (!SOURCE_URL) throw new Error("DATABASE_URL must be set to create the throwaway test database.");
  psql(SOURCE_URL, `create database ${DB_NAME}`);
  const url = new URL(SOURCE_URL);
  url.pathname = `/${DB_NAME}`;
  process.env.DATABASE_URL = url.toString();
  execSync("pnpm exec drizzle-kit push --force --config ./drizzle.config.ts", { cwd: DB_DIR, env: process.env, stdio: "pipe" });

  m = await import("@workspace/db");
  orm = await import("drizzle-orm");
  const express = (await import("express")).default;
  const router = (await import("../routes")).default;

  const db = m.db;
  await db.insert(m.appStateTable).values({ id: 1, mode: "live", switchedAt: new Date(), switchedByRole: "system", makerCheckerMode: "strict" });
  const users = await db
    .insert(m.usersTable)
    .values([
      { clerkUserId: "senior-a", name: "Senior A", email: "a@test.ae", role: "senior_examiner" },
      { clerkUserId: "senior-b", name: "Senior B", email: "b@test.ae", role: "senior_examiner" },
      { clerkUserId: "examiner", name: "Examiner E", email: "e@test.ae", role: "examiner" },
      { clerkUserId: "viewer", name: "Viewer V", email: "v@test.ae", role: "viewer" },
    ])
    .returning();
  [ids.seniorA, ids.seniorB, ids.examiner, ids.viewer] = users.map((u) => u.id) as [number, number, number, number];

  const [bank] = await db.insert(m.banksTable).values({ dataset: "live", nameEn: "Test Bank" }).returning();
  const products = await db.insert(m.productsTable).values([
    { dataset: "live", bankId: bank!.id, name: "Card One" },
    { dataset: "live", bankId: bank!.id, name: "Card Two" },
  ]).returning();
  const assessments = await db.insert(m.assessmentsTable).values(
    products.map((p) => ({ dataset: "live" as const, bankId: bank!.id, productId: p.id, kind: "agentic" as const, status: "complete" as const, finishedAt: new Date() })),
  ).returning();
  ids.assessment2 = assessments[1]!.id;
  const findings = await db.insert(m.findingsTable).values(
    assessments.map((a) => ({ dataset: "live" as const, assessmentId: a.id, proposedStatus: "breach" as const, severity: "high" as const, rationale: "Fee not disclosed.", verification: "verified" as const, proposedBy: "test" })),
  ).returning();
  [ids.finding1, ids.finding2] = findings.map((f) => f.id) as [number, number];

  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (m) await m.pool.end();
  if (SOURCE_URL) psql(SOURCE_URL, `drop database if exists ${DB_NAME} with (force)`);
});

describe("maker-checker mode switch", () => {
  it("refuses an examiner or a viewer and writes no audit event", async () => {
    for (const user of ["examiner", "viewer"]) {
      const r = await setMode(user, "poc");
      expect(r.status).toBe(403);
    }
    const [state] = await m.db.select().from(m.appStateTable);
    expect(state!.makerCheckerMode).toBe("strict");
    expect(await auditOf("workspace.maker_checker_mode_changed")).toHaveLength(0);
  });

  it("lets a senior examiner switch, auditing who changed it and the old and new values", async () => {
    const r = await setMode("senior-a", "poc");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ makerCheckerMode: "poc" });
    const events = await auditOf("workspace.maker_checker_mode_changed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ role: "senior_examiner", actor: "Senior A <a@test.ae>", before: { makerCheckerMode: "strict" }, after: { makerCheckerMode: "poc" } });
    expect((await setMode("senior-a", "strict")).status).toBe(200);
    expect(await auditOf("workspace.maker_checker_mode_changed")).toHaveLength(2);
  });
});

describe("approving your own Breach decision", () => {
  it("strict mode returns 403 and stores no approval or audit event", async () => {
    const made = await call("senior-a", "POST", `/findings/${ids.finding1}/decisions`, { decision: "accept" });
    expect(made.status).toBe(201);
    const decisionId = await latestDecisionId(ids.finding1);

    const r = await call("senior-a", "POST", `/decisions/${decisionId}/approval`, { action: "approve" });
    expect(r.status).toBe(403);
    expect(await m.db.select().from(m.decisionApprovalsTable).where(orm.eq(m.decisionApprovalsTable.decisionId, decisionId))).toHaveLength(0);
    expect(await auditOf("finding.decision_approved")).toHaveLength(0);
  });

  it("PoC mode stores the approval and its audit event flagged as self-approved", async () => {
    expect((await setMode("senior-a", "poc")).status).toBe(200);
    const decisionId = await latestDecisionId(ids.finding1);

    const r = await call("senior-a", "POST", `/decisions/${decisionId}/approval`, { action: "approve" });
    expect(r.status).toBe(200);

    const rows = await m.db.select().from(m.decisionApprovalsTable).where(orm.eq(m.decisionApprovalsTable.decisionId, decisionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "approve", selfApproved: true, checkerUserId: ids.seniorA, role: "senior_examiner" });

    const events = await auditOf("finding.decision_approved");
    expect(events).toHaveLength(1);
    expect(events[0]!.summary).toContain(LABEL);
    expect(events[0]!.after).toMatchObject({ decisionId, approval: "approved", self_approved: true, makerCheckerMode: "poc" });
    expect((await setMode("senior-a", "strict")).status).toBe(200);
  });
});

describe("approving a report you sent for approval", () => {
  let noticeId = 0;
  const noticeSteps = () => m.db.select().from(m.noticeApprovalsTable).where(orm.eq(m.noticeApprovalsTable.noticeId, noticeId)).orderBy(m.noticeApprovalsTable.id);

  beforeAll(async () => {
    // An examiner's Breach, approved by a senior examiner, so the card can be reported on.
    expect((await call("examiner", "POST", `/findings/${ids.finding2}/decisions`, { decision: "accept" })).status).toBe(201);
    const decisionId = await latestDecisionId(ids.finding2);
    expect((await call("senior-b", "POST", `/decisions/${decisionId}/approval`, { action: "approve" })).status).toBe(200);

    const created = await call("senior-a", "POST", "/notices", { assessmentId: ids.assessment2 });
    expect(created.status).toBe(200);
    noticeId = created.body!["id"] as number;
    expect((await call("senior-a", "POST", `/notices/${noticeId}/submit`)).status).toBe(200);
  });

  it("strict mode returns 403 and stores nothing", async () => {
    const r = await call("senior-a", "POST", `/notices/${noticeId}/approval`, { action: "approve" });
    expect(r.status).toBe(403);
    expect((await noticeSteps()).map((s) => s.action)).toEqual(["submit"]);
    expect(await auditOf("notice.approved")).toHaveLength(0);
  });

  it("PoC mode stores the approval and its audit event flagged as self-approved", async () => {
    expect((await setMode("senior-a", "poc")).status).toBe(200);
    const r = await call("senior-a", "POST", `/notices/${noticeId}/approval`, { action: "approve" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ state: "approved", selfApproved: true });

    const steps = await noticeSteps();
    expect(steps.map((s) => s.action)).toEqual(["submit", "approve"]);
    expect(steps[1]).toMatchObject({ selfApproved: true, userId: ids.seniorA, role: "senior_examiner" });

    const events = await auditOf("notice.approved");
    expect(events).toHaveLength(1);
    expect(events[0]!.summary).toContain(LABEL);
    expect(events[0]!.after).toMatchObject({ state: "approved", self_approved: true, makerCheckerMode: "poc" });
  });
});
