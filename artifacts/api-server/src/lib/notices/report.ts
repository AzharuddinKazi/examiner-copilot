/**
 * The final report (draft notice) per card. Assembled only from findings with an approved Breach or
 * Warning decision (see noticeEligible). Drafts only: nothing here can contact a bank.
 * Report state comes from the append-only notice_approvals rows: none = draft, submit = awaiting,
 * approve = approved (locked), return = returned (editable again).
 */
import {
  db,
  assessmentsTable,
  banksTable,
  documentsTable,
  evidenceTable,
  findingsTable,
  holidaysTable,
  noticeApprovalsTable,
  noticeFindingsTable,
  noticesTable,
  productsTable,
  rulesTable,
  type RuleRow,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Dataset } from "../dataset";
import { appendAudit } from "../audit";
import { actorLabel, currentUser, type CurrentUser } from "../auth";
import { ReviewError, decisionStates, latestFinished, noticeEligible, type DecisionState } from "../review";
import { buildScorecard } from "../scoring/scorecard";
import { FIX_DAYS, RESPONSE_DAYS, addBusinessDays, isValidDate, todayIn } from "./business-days";

export type NoticeState = "draft" | "awaiting" | "approved" | "returned";
type Step = { action: "submit" | "approve" | "return"; note: string | null; actor: string | null; userId: number | null; role: string; at: Date };

/** Pure: report state from its steps, oldest first. */
export function noticeState(steps: Pick<Step, "action">[]): NoticeState {
  const last = steps[steps.length - 1];
  if (!last) return "draft";
  return last.action === "submit" ? "awaiting" : last.action === "approve" ? "approved" : "returned";
}

export const canEditState = (s: NoticeState) => s === "draft" || s === "returned";

/**
 * Pure: who may approve or return a report. Only a senior examiner, never the person who sent it for
 * approval, and only while it is awaiting approval.
 */
export function checkNoticeApprover(submitter: { userId: number | null; actor: string | null } | null, me: { id: number; role: string; actor: string | null } | undefined, state: NoticeState, staleIncluded = 0) {
  if (!me) throw new ReviewError(401, "Sign in to continue.");
  if (me.role !== "senior_examiner") throw new ReviewError(403, "Only a senior examiner can approve or return a report.");
  const same = !!submitter && (submitter.userId !== null ? submitter.userId === me.id : !!submitter.actor && submitter.actor === me.actor);
  if (same) throw new ReviewError(403, "You sent this report for approval, so a different senior examiner must check it.");
  if (state !== "awaiting") throw new ReviewError(409, state === "approved" ? "This report is already approved." : "This report is not waiting for approval.");
  if (staleIncluded > 0) throw new ReviewError(409, "Some findings in this report are no longer approved breaches or warnings. Return it so the examiner can update it from current decisions.");
}

/**
 * Runs a report action while holding a per-report lock, so a state check and the write that follows
 * cannot interleave with another action on the same report (e.g. two checkers, or an edit racing a submit).
 * Writes inside fn commit before the lock is released at the end of this transaction.
 */
export async function withNoticeLock<T>(id: number, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('notice'), ${id}::int)`);
    return fn();
  });
}

const detail = (r: RuleRow | undefined, label: string) =>
  ((r?.details as { label: string; value: string }[] | null) ?? []).find((d) => d.label === label)?.value?.trim() || null;

/** Pure: the default next step for the bank, from the rule's "satisfied" wording when the rulebook has it. */
export function defaultAction(rule: Pick<RuleRow, "code" | "title" | "details"> | undefined, status: "breach" | "warning"): string {
  if (!rule) return "Correct the disclosure and send the revised document with a short explanation of the change.";
  const target = detail(rule as RuleRow, "satisfied");
  const verb = status === "breach" ? "Correct" : "Clarify";
  return target
    ? `${verb} the disclosure so that it meets ${rule.code}: ${target.replace(/\.$/, "")}. Send the revised document with a short explanation of the change.`
    : `${verb} the disclosure so that it meets ${rule.code} (${rule.title}). Send the revised document with a short explanation of the change.`;
}

async function holidaySet(calendarId: number | null): Promise<Set<string>> {
  if (!calendarId) return new Set();
  const rows = await db.select({ date: holidaysTable.date }).from(holidaysTable).where(eq(holidaysTable.calendarId, calendarId));
  return new Set(rows.map((r) => r.date));
}

/** Approved Breach/Warning findings of one assessment, with their final decision. */
async function eligibleFor(assessmentId: number) {
  const findings = await db.select().from(findingsTable).where(eq(findingsTable.assessmentId, assessmentId));
  const states = await decisionStates(findings.map((f) => f.id));
  const withDecision = findings.map((f) => ({ f, decision: (states.get(f.id) ?? null) as DecisionState | null }));
  return { findings, states, eligible: noticeEligible(withDecision) };
}

async function steps(noticeId: number): Promise<Step[]> {
  const rows = await db.select().from(noticeApprovalsTable).where(eq(noticeApprovalsTable.noticeId, noticeId)).orderBy(asc(noticeApprovalsTable.id));
  return rows.map((r) => ({ action: r.action, note: r.note, actor: r.actor, userId: r.userId, role: r.role, at: r.at }));
}

async function loadNotice(dataset: Dataset, id: number) {
  const [n] = await db.select().from(noticesTable).where(and(eq(noticesTable.dataset, dataset), eq(noticesTable.id, id)));
  if (!n) throw new ReviewError(404, "Report not found.");
  return n;
}

async function names(productId: number | null, bankId: number | null) {
  const [p] = productId ? await db.select().from(productsTable).where(eq(productsTable.id, productId)) : [];
  const [b] = bankId ? await db.select().from(banksTable).where(eq(banksTable.id, bankId)) : [];
  return { productName: p?.name ?? "Deleted product", bankName: b?.nameEn ?? "Unknown bank" };
}

const isMe = (me: CurrentUser | undefined, s: { userId: number | null; actor: string | null } | null) =>
  !!me && !!s && (s.userId !== null ? s.userId === me.id : !!s.actor && s.actor === actorLabel(me));

/** Whether a later finished assessment of the same card replaced this report's assessment, and where to go next. */
async function newerAssessment(dataset: Dataset, n: { assessmentId: number | null; productId: number | null }) {
  if (!n.assessmentId) return { outdated: false, newer: null };
  const latest = await latestFinished(dataset);
  if (latest.some((a) => a.id === n.assessmentId)) return { outdated: false, newer: null };
  const a = latest.find((x) => x.productId === n.productId);
  if (!a) return { outdated: true, newer: null };
  const [[existing], { eligible }] = await Promise.all([
    db.select({ id: noticesTable.id }).from(noticesTable).where(and(eq(noticesTable.dataset, dataset), eq(noticesTable.assessmentId, a.id))),
    eligibleFor(a.id),
  ]);
  return { outdated: true, newer: { assessmentId: a.id, noticeId: existing?.id ?? null, approvedFindings: eligible.length } };
}

/** Full report as the UI and the exports see it. */
export async function noticeView(dataset: Dataset, id: number) {
  const n = await loadNotice(dataset, id);
  const [hist, rows, nm] = await Promise.all([
    steps(n.id),
    db.select().from(noticeFindingsTable).where(eq(noticeFindingsTable.noticeId, n.id)).orderBy(asc(noticeFindingsTable.sort)),
    names(n.productId, n.bankId),
  ]);
  const state = noticeState(hist);
  const newer = await newerAssessment(dataset, n);
  const fIds = rows.map((r) => r.findingId);
  const [findings, ev, elig, sc] = await Promise.all([
    db.select().from(findingsTable).where(inArray(findingsTable.id, fIds.length ? fIds : [-1])),
    db.select().from(evidenceTable).where(inArray(evidenceTable.findingId, fIds.length ? fIds : [-1])).orderBy(asc(evidenceTable.id)),
    n.assessmentId ? eligibleFor(n.assessmentId) : Promise.resolve(null),
    n.assessmentId ? buildScorecard(dataset, n.assessmentId) : Promise.resolve(null),
  ]);
  const ruleIds = findings.map((f) => f.ruleId).filter((x): x is number => x !== null);
  const docIds = [...new Set(ev.map((e) => e.documentId))];
  const [rules, docs] = await Promise.all([
    db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds.length ? ruleIds : [-1])),
    db.select({ id: documentsTable.id, originalName: documentsTable.originalName, docType: documentsTable.docType }).from(documentsTable).where(inArray(documentsTable.id, docIds.length ? docIds : [-1])),
  ]);
  const eligibleIds = new Set(elig?.eligible.map((e) => e.f.id) ?? []);
  const themeOf = new Map((sc?.rules ?? []).map((r) => [r.findingId, r.theme ?? "No theme"]));

  const items = rows.map((row) => {
    const f = findings.find((x) => x.id === row.findingId);
    const r = rules.find((x) => x.id === f?.ruleId);
    const st = elig?.states.get(row.findingId);
    const fin = st?.final ?? null;
    return {
      findingId: row.findingId,
      ruleCode: r?.code ?? "(deleted rule)",
      ruleTitle: r?.title ?? "",
      ruleText: r?.text ?? "",
      sourceRef: detail(r, "source_ref"),
      theme: themeOf.get(row.findingId) ?? "No theme",
      status: (fin?.finalStatus === "warning" ? "warning" : "breach") as "breach" | "warning",
      severity: f?.severity ?? "medium",
      rationale: f?.rationale ?? "",
      examinerNote: fin?.examinerNote ?? null,
      decidedBy: fin?.actor ?? null,
      approvedBy: fin?.approvalStatus === "approved" ? fin.checker : null,
      evidence: ev
        .filter((e) => e.findingId === row.findingId)
        .map((e) => ({ documentName: docs.find((d) => d.id === e.documentId)?.originalName ?? "Deleted document", docType: docs.find((d) => d.id === e.documentId)?.docType ?? null, pageNo: e.pageNo, quote: e.quote, verified: e.verified === "exact" || e.verified === "normalized" })),
      action: row.action,
      dueDate: row.dueDate,
      included: row.included,
      stillEligible: eligibleIds.has(row.findingId),
    };
  });
  const inNotice = new Set(fIds);
  const newlyEligible = [...eligibleIds].filter((x) => !inNotice.has(x)).length;

  const included = items.filter((i) => i.included);
  const themes = (sc?.themes ?? [])
    .filter((t) => t.rating !== null)
    .map((t) => ({
      theme: t.theme,
      rating: t.rating,
      label: t.label,
      breaches: included.filter((i) => i.theme === t.theme && i.status === "breach").length,
      warnings: included.filter((i) => i.theme === t.theme && i.status === "warning").length,
      complaints: t.complaints?.count ?? null,
      peerMedian: t.complaints?.peerMedian ?? null,
    }))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  const me = currentUser();
  const lastSubmit = [...hist].reverse().find((s) => s.action === "submit") ?? null;
  const lastCheck = hist.length && hist[hist.length - 1]!.action !== "submit" ? hist[hist.length - 1]! : null;
  const editable = canEditState(state) && !!me && me.role !== "viewer";
  let canApprove = false;
  try {
    checkNoticeApprover(lastSubmit, me ? { id: me.id, role: me.role, actor: actorLabel(me) } : undefined, state, included.filter((i) => !i.stillEligible).length);
    canApprove = true;
  } catch {
    canApprove = false;
  }
  return {
    id: n.id,
    assessmentId: n.assessmentId,
    productName: nm.productName,
    bankName: nm.bankName,
    state,
    referenceDate: n.referenceDate,
    responseDueDate: n.responseDueDate,
    responseDays: RESPONSE_DAYS,
    body: n.body,
    overall: { rating: sc?.rating ?? null, label: sc?.label ?? null, provisional: sc?.provisional ?? false },
    themes,
    findings: items,
    newlyEligible,
    outdated: newer.outdated,
    newer: newer.newer,
    history: hist.map((s) => ({ action: s.action, actor: s.actor, note: s.note, at: s.at })),
    submittedBy: lastSubmit?.actor ?? null,
    submittedByYou: isMe(me, lastSubmit),
    checker: lastCheck?.actor ?? null,
    checkerNote: lastCheck?.note ?? null,
    checkedAt: lastCheck?.at ?? null,
    canEdit: editable,
    canSubmit: editable && included.length > 0 && !!n.referenceDate,
    canApprove,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}
export type NoticeView = Awaited<ReturnType<typeof noticeView>>;

/** Cards ready for a report, and the reports so far. */
export async function noticeList(dataset: Dataset) {
  const [latest, notices] = await Promise.all([
    latestFinished(dataset),
    db.select().from(noticesTable).where(eq(noticesTable.dataset, dataset)).orderBy(desc(noticesTable.updatedAt)),
  ]);
  const ready = [];
  for (const a of latest) {
    const { eligible } = await eligibleFor(a.id);
    const nm = await names(a.productId, a.bankId);
    ready.push({
      assessmentId: a.id,
      productName: nm.productName,
      bankName: nm.bankName,
      breaches: eligible.filter((e) => e.decision?.final?.finalStatus === "breach").length,
      warnings: eligible.filter((e) => e.decision?.final?.finalStatus === "warning").length,
      noticeId: notices.find((n) => n.assessmentId === a.id)?.id ?? null,
    });
  }
  const list = [];
  for (const n of notices) {
    const [hist, nm, fr] = await Promise.all([
      steps(n.id),
      names(n.productId, n.bankId),
      db.select().from(noticeFindingsTable).where(and(eq(noticeFindingsTable.noticeId, n.id), eq(noticeFindingsTable.included, true))),
    ]);
    list.push({
      id: n.id,
      assessmentId: n.assessmentId,
      productName: nm.productName,
      bankName: nm.bankName,
      state: noticeState(hist),
      findings: fr.length,
      responseDueDate: n.responseDueDate,
      updatedAt: n.updatedAt,
      outdated: !!n.assessmentId && !latest.some((a) => a.id === n.assessmentId),
    });
  }
  return { ready, notices: list };
}

function writer(): CurrentUser {
  const me = currentUser();
  if (!me) throw new ReviewError(401, "Sign in to continue.");
  if (me.role === "viewer") throw new ReviewError(403, "Your account has view-only access.");
  return me;
}

async function editable(dataset: Dataset, id: number) {
  const n = await loadNotice(dataset, id);
  const state = noticeState(await steps(n.id));
  if (!canEditState(state)) throw new ReviewError(409, state === "approved" ? "This report is approved and locked." : "This report is waiting for approval; it cannot change until it is approved or returned.");
  return n;
}

const touch = (id: number, tx: Pick<typeof db, "update"> = db) => tx.update(noticesTable).set({ updatedAt: new Date() }).where(eq(noticesTable.id, id));

/** Rows for findings not yet in the report, with default next steps and due dates. */
async function newRows(noticeId: number, eligible: Awaited<ReturnType<typeof eligibleFor>>["eligible"], have: Set<number>, referenceDate: string, holidays: Set<string>, startSort: number) {
  const add = eligible.filter((e) => !have.has(e.f.id));
  const ruleIds = add.map((e) => e.f.ruleId).filter((x): x is number => x !== null);
  const rules = await db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds.length ? ruleIds : [-1]));
  // Breaches first, then by severity.
  const sev = { high: 0, medium: 1, low: 2 } as const;
  add.sort((a, b) => (a.decision!.final!.finalStatus === "breach" ? 0 : 1) - (b.decision!.final!.finalStatus === "breach" ? 0 : 1) || sev[a.f.severity] - sev[b.f.severity]);
  return add.map((e, i) => ({
    noticeId,
    findingId: e.f.id,
    action: defaultAction(rules.find((r) => r.id === e.f.ruleId), e.decision!.final!.finalStatus as "breach" | "warning"),
    dueDate: addBusinessDays(referenceDate, FIX_DAYS[e.f.severity], holidays),
    included: true,
    sort: startSort + i,
  }));
}

export async function createNotice(dataset: Dataset, input: { assessmentId: number; referenceDate?: string | null }) {
  const me = writer();
  const latest = await latestFinished(dataset);
  const a = latest.find((x) => x.id === input.assessmentId);
  if (!a) {
    const [exists] = await db.select({ id: assessmentsTable.id }).from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.id, input.assessmentId)));
    throw new ReviewError(exists ? 409 : 404, exists ? "Only the latest finished assessment of a card can be reported on." : "Assessment not found.");
  }
  const [dup] = await db.select({ id: noticesTable.id }).from(noticesTable).where(and(eq(noticesTable.dataset, dataset), eq(noticesTable.assessmentId, a.id)));
  if (dup) throw new ReviewError(409, "A report for this assessment already exists. Open it instead.");
  const referenceDate = input.referenceDate ?? todayIn();
  if (!isValidDate(referenceDate)) throw new ReviewError(400, "The reference date must be a real date (YYYY-MM-DD).");
  const { eligible } = await eligibleFor(a.id);
  if (!eligible.length) throw new ReviewError(409, "No approved breach or warning on this card yet. Decide and approve findings first.");
  const holidays = new Set<string>();
  const nm = await names(a.productId, a.bankId);
  const id = await db.transaction(async (tx) => {
    const [n] = await tx
      .insert(noticesTable)
      .values({ dataset, bankId: a.bankId, productId: a.productId, assessmentId: a.id, referenceDate, responseDueDate: addBusinessDays(referenceDate, RESPONSE_DAYS, holidays), makerUserId: me.id, makerActor: actorLabel(me) })
      .returning();
    const rows = await newRows(n!.id, eligible, new Set(), referenceDate, holidays, 0);
    if (rows.length) await tx.insert(noticeFindingsTable).values(rows);
    await appendAudit({ dataset, role: me.role, action: "notice.created", entityType: "notice", entityId: String(n!.id), summary: `Drafted a report for ${nm.productName} (${nm.bankName}) with ${rows.length} finding${rows.length === 1 ? "" : "s"}.`, after: { assessmentId: a.id, findings: rows.map((r) => r.findingId), referenceDate } }, tx);
    return n!.id;
  });
  return id;
}

export interface NoticePatch {
  body?: string;
  referenceDate?: string;
  findings?: { findingId: number; action?: string; dueDate?: string | null; included?: boolean }[];
}

export async function updateNotice(dataset: Dataset, id: number, patch: NoticePatch) {
  const me = writer();
  const n = await editable(dataset, id);
  const changes: string[] = [];
  const set: Partial<typeof noticesTable.$inferInsert> = { updatedAt: new Date() };
  if (patch.body !== undefined && patch.body !== n.body) {
    set.body = patch.body.slice(0, 20000);
    changes.push("cover note");
  }
  if (patch.referenceDate !== undefined && patch.referenceDate !== n.referenceDate) {
    if (!isValidDate(patch.referenceDate)) throw new ReviewError(400, "The reference date must be a real date (YYYY-MM-DD).");
    set.referenceDate = patch.referenceDate;
    set.responseDueDate = addBusinessDays(patch.referenceDate, RESPONSE_DAYS, await holidaySet(n.calendarId));
    changes.push(`reference date ${patch.referenceDate}`);
  }
  const rows = await db.select().from(noticeFindingsTable).where(eq(noticeFindingsTable.noticeId, n.id));
  for (const f of patch.findings ?? []) {
    if (!rows.some((r) => r.findingId === f.findingId)) throw new ReviewError(400, `Finding ${f.findingId} is not in this report.`);
    if (f.dueDate && !isValidDate(f.dueDate)) throw new ReviewError(400, "Each due date must be a real date (YYYY-MM-DD).");
    if (f.action !== undefined && !f.action.trim()) throw new ReviewError(400, "Write what the bank must do for every finding.");
  }
  await db.transaction(async (tx) => {
    await tx.update(noticesTable).set(set).where(eq(noticesTable.id, n.id));
    for (const f of patch.findings ?? []) {
      const old = rows.find((r) => r.findingId === f.findingId)!;
      const upd: Partial<typeof noticeFindingsTable.$inferInsert> = {};
      if (f.action !== undefined && f.action.trim() !== old.action) upd.action = f.action.trim().slice(0, 4000);
      if (f.dueDate !== undefined && f.dueDate !== old.dueDate) upd.dueDate = f.dueDate;
      if (f.included !== undefined && f.included !== old.included) upd.included = f.included;
      if (Object.keys(upd).length) {
        await tx.update(noticeFindingsTable).set(upd).where(and(eq(noticeFindingsTable.noticeId, n.id), eq(noticeFindingsTable.findingId, f.findingId)));
        changes.push(`finding ${f.findingId} (${Object.keys(upd).join(", ")})`);
      }
    }
    if (changes.length) {
      await appendAudit({ dataset, role: me.role, action: "notice.edited", entityType: "notice", entityId: String(n.id), summary: `Edited report ${n.id}: ${changes.join("; ")}.`, after: patch }, tx);
    }
  });
}

/** Brings the report in line with current decisions: adds newly approved findings, drops ones no longer eligible. */
export async function syncNotice(dataset: Dataset, id: number) {
  const me = writer();
  const n = await editable(dataset, id);
  if (!n.assessmentId) throw new ReviewError(409, "The assessment behind this report was deleted.");
  const { eligible } = await eligibleFor(n.assessmentId);
  const rows = await db.select().from(noticeFindingsTable).where(eq(noticeFindingsTable.noticeId, n.id));
  const ok = new Set(eligible.map((e) => e.f.id));
  const drop = rows.filter((r) => !ok.has(r.findingId)).map((r) => r.findingId);
  const add = await newRows(n.id, eligible, new Set(rows.map((r) => r.findingId)), n.referenceDate ?? todayIn(), await holidaySet(n.calendarId), rows.length);
  await db.transaction(async (tx) => {
    if (drop.length) await tx.delete(noticeFindingsTable).where(and(eq(noticeFindingsTable.noticeId, n.id), inArray(noticeFindingsTable.findingId, drop)));
    if (add.length) await tx.insert(noticeFindingsTable).values(add);
    await touch(n.id, tx);
    if (drop.length || add.length) {
      await appendAudit({ dataset, role: me.role, action: "notice.synced", entityType: "notice", entityId: String(n.id), summary: `Updated report ${n.id} from current decisions: added ${add.length}, removed ${drop.length}.`, after: { added: add.map((a) => a.findingId), removed: drop } }, tx);
    }
  });
}

export async function submitNotice(dataset: Dataset, id: number) {
  const me = writer();
  const n = await editable(dataset, id);
  const v = await noticeView(dataset, id);
  if (!v.findings.some((f) => f.included)) throw new ReviewError(409, "Include at least one finding before sending the report for approval.");
  if (v.findings.some((f) => f.included && !f.stillEligible)) throw new ReviewError(409, "Some findings are no longer approved breaches or warnings. Update the report from current decisions first.");
  if (!n.referenceDate) throw new ReviewError(409, "Set a reference date first.");
  await db.transaction(async (tx) => {
    await tx.insert(noticeApprovalsTable).values({ dataset, noticeId: n.id, action: "submit", role: me.role, actor: actorLabel(me), userId: me.id });
    await touch(n.id, tx);
    await appendAudit({ dataset, role: me.role, action: "notice.submitted", entityType: "notice", entityId: String(n.id), summary: `Sent the report for ${v.productName} (${v.bankName}) for approval with ${v.findings.filter((f) => f.included).length} findings.`, before: { state: v.state }, after: { state: "awaiting" } }, tx);
  });
}

export async function reviewNotice(dataset: Dataset, id: number, input: { action: "approve" | "return"; note?: string | null }) {
  const n = await loadNotice(dataset, id);
  const hist = await steps(n.id);
  const me = currentUser();
  const lastSubmit = [...hist].reverse().find((s) => s.action === "submit") ?? null;
  const stale = input.action === "approve" ? (await noticeView(dataset, id)).findings.filter((f) => f.included && !f.stillEligible).length : 0;
  checkNoticeApprover(lastSubmit, me ? { id: me.id, role: me.role, actor: actorLabel(me) } : undefined, noticeState(hist), stale);
  const note = input.note?.trim() || null;
  if (input.action === "return" && !note) throw new ReviewError(400, "Write a note telling the examiner what to change.");
  const nm = await names(n.productId, n.bankId);
  await db.transaction(async (tx) => {
    await tx.insert(noticeApprovalsTable).values({ dataset, noticeId: n.id, action: input.action, note, role: me!.role, actor: actorLabel(me), userId: me!.id });
    await touch(n.id, tx);
    await appendAudit(
      {
        dataset,
        role: me!.role,
        action: input.action === "approve" ? "notice.approved" : "notice.returned",
        entityType: "notice",
        entityId: String(n.id),
        summary: input.action === "approve" ? `Approved the report for ${nm.productName} (${nm.bankName}) sent by ${lastSubmit?.actor ?? "an examiner"}.` : `Returned the report for ${nm.productName} (${nm.bankName}) to ${lastSubmit?.actor ?? "the examiner"}: ${note}`,
        before: { state: "awaiting" },
        after: { state: input.action === "approve" ? "approved" : "returned", note },
      },
      tx,
    );
  });
}

export async function deleteNotice(dataset: Dataset, id: number) {
  const me = writer();
  const n = await loadNotice(dataset, id);
  const state = noticeState(await steps(n.id));
  if (state === "approved") throw new ReviewError(409, "An approved report is kept for the record and cannot be deleted.");
  if (state === "awaiting") throw new ReviewError(409, "This report is waiting for approval. Ask a senior examiner to return it first.");
  const nm = await names(n.productId, n.bankId);
  await db.transaction(async (tx) => {
    await tx.delete(noticesTable).where(eq(noticesTable.id, n.id));
    await appendAudit({ dataset, role: me.role, action: "notice.deleted", entityType: "notice", entityId: String(n.id), summary: `Deleted the draft report for ${nm.productName} (${nm.bankName}).`, before: { state } }, tx);
  });
}

export async function recordExport(dataset: Dataset, v: NoticeView, format: "pdf" | "docx") {
  const me = currentUser();
  await appendAudit({ dataset, role: me?.role ?? "viewer", action: "notice.exported", entityType: "notice", entityId: String(v.id), summary: `Downloaded the ${v.state === "approved" ? "approved" : "unapproved"} report for ${v.productName} (${v.bankName}) as ${format.toUpperCase()}.` });
}
