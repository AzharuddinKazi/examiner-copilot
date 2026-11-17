/**
 * The bounded assessment run. Code drives the order of work; the Coordinator may only add
 * focused re-reads within the remaining step and token budget. Each model call is one step.
 * On a provider failure the run fails with a clear reason and no findings are written.
 */
import { z } from "zod";
import {
  db,
  assessmentsTable,
  assessmentDocumentsTable,
  agentStepsTable,
  findingsTable,
  evidenceTable,
  documentsTable,
  documentPagesTable,
  rulesTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { LlmError, type ChatMessage } from "../llm/adapter";
import { structuredCall } from "../llm/structured";
import { readLlmConfig } from "../llm/config";
import { appendAudit } from "../audit";
import type { Dataset } from "../dataset";
import { logger } from "../logger";
import type { CheckType, Threshold } from "../rulebook-import";
import {
  applicableDocs,
  decideBilingual,
  decideCrossDocument,
  decideJudgement,
  decideReadability,
  decideThreshold,
  missingDocTypes,
  type AssessDoc,
  type AssessRule,
  type Conflict,
  type Decision,
  type Fact,
  type Judgement,
  type RuleEvidence,
} from "./decide";
import {
  consistencyMessages,
  consistencySchema,
  coordinatorMessages,
  coordinatorSchema,
  evidenceMessages,
  evidenceSchema,
  ruleMessages,
  ruleSchema,
  type OpenIssue,
} from "./agents";
import { detectInjection } from "./text";

export const LIMITS = { stepLimit: 20, tokenLimit: 250_000, coordinatorRounds: 2 } as const;
const MAX_TOKENS = { evidence: 12000, rule: 10000, consistency: 8000, coordinator: 6000 } as const;
const DOC_LABEL = { kfs: "KFS", tnc: "T&C", rewards: "Rewards", fees: "Fees Schedule" } as const;

export interface Alert {
  kind: "injection" | "extraction_gap" | "missing_document" | "model_error";
  message: string;
  documentId: number | null;
  documentName: string | null;
  pageNo: number | null;
  quote: string | null;
}

/** Returns why the next model call must not run, or null if it fits the step and token limits. */
export function budgetStop(x: { steps: number; tokensUsed: number; messages: ChatMessage[]; maxTokens: number }, limits: { stepLimit: number; tokenLimit: number } = LIMITS): string | null {
  if (x.steps >= limits.stepLimit) return `Step limit reached (${limits.stepLimit} model calls).`;
  const estimate = Math.ceil(x.messages.reduce((n, m) => n + m.content.length, 0) / 3) + x.maxTokens;
  if (x.tokensUsed + estimate > limits.tokenLimit) {
    return `Token limit would be exceeded (${x.tokensUsed.toLocaleString()} used of ${limits.tokenLimit.toLocaleString()}; the next call needs about ${estimate.toLocaleString()}).`;
  }
  return null;
}

class StopRun extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/** Which assessment is running in this process. Only one at a time. */
let runningId: number | null = null;
export const currentRun = () => runningId;

type AgentName = "coordinator" | "evidence" | "consistency" | "rule" | "code";

class RunContext {
  steps = 0;
  stepNo = 0;
  tokensIn = 0;
  tokensOut = 0;
  model: string | null = null;
  constructor(public assessmentId: number) {}

  get tokensUsed() {
    return this.tokensIn + this.tokensOut;
  }

  async progress(text: string) {
    await db.update(assessmentsTable).set({ progress: text }).where(eq(assessmentsTable.id, this.assessmentId));
  }

  async log(step: { agent: AgentName; tool?: string | null; summary: string; input?: unknown; output?: unknown; tokensIn?: number; tokensOut?: number; latencyMs?: number | null; error?: string | null }) {
    this.stepNo++;
    await db.insert(agentStepsTable).values({
      assessmentId: this.assessmentId,
      agent: step.agent,
      stepNo: this.stepNo,
      tool: step.tool ?? null,
      summary: step.summary,
      input: step.input ?? null,
      output: step.output ?? null,
      tokensIn: step.tokensIn ?? 0,
      tokensOut: step.tokensOut ?? 0,
      latencyMs: step.latencyMs ?? null,
      error: step.error ?? null,
    });
  }

  private async checkStop() {
    const [row] = await db.select({ s: assessmentsTable.stopRequested }).from(assessmentsTable).where(eq(assessmentsTable.id, this.assessmentId));
    if (row?.s) throw new StopRun("Stopped by the examiner before the run finished.");
  }

  /** One bounded model call. Throws StopRun when a limit would be crossed. */
  async call<S extends z.ZodType>(opts: {
    agent: Exclude<AgentName, "code">;
    tool: string;
    name: string;
    schema: S;
    messages: ChatMessage[];
    maxTokens: number;
    input: unknown;
    summarize: (data: z.infer<S>) => string;
  }): Promise<z.infer<S> | null> {
    await this.checkStop();
    const over = budgetStop({ steps: this.steps, tokensUsed: this.tokensUsed, messages: opts.messages, maxTokens: opts.maxTokens });
    if (over) throw new StopRun(over);
    this.steps++;
    try {
      const r = await structuredCall({ name: opts.name, schema: opts.schema, messages: opts.messages, maxTokens: opts.maxTokens, timeoutMs: 150_000 });
      this.tokensIn += r.tokensIn;
      this.tokensOut += r.tokensOut;
      this.model = r.model;
      await this.log({
        agent: opts.agent,
        tool: opts.tool,
        summary: opts.summarize(r.data) + (r.attempts > 1 ? " (reply repaired after one invalid attempt)" : ""),
        input: opts.input,
        output: r.data,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
      });
      await this.saveUsage();
      return r.data;
    } catch (err) {
      const usage = (err as { usage?: { tokensIn: number; tokensOut: number; latencyMs: number } }).usage;
      if (usage) {
        this.tokensIn += usage.tokensIn;
        this.tokensOut += usage.tokensOut;
      }
      const message = err instanceof LlmError ? err.message : "Unexpected error during the model call.";
      await this.log({ agent: opts.agent, tool: opts.tool, summary: "The model call did not produce a usable reply.", input: opts.input, error: message, tokensIn: usage?.tokensIn, tokensOut: usage?.tokensOut, latencyMs: usage?.latencyMs });
      await this.saveUsage();
      // An unusable reply only affects this step; provider or configuration failures end the run.
      if (err instanceof LlmError && err.code === "invalid_response") return null;
      throw err;
    }
  }

  async saveUsage() {
    await db
      .update(assessmentsTable)
      .set({ stepsUsed: this.steps, tokensIn: this.tokensIn, tokensOut: this.tokensOut, model: this.model })
      .where(eq(assessmentsTable.id, this.assessmentId));
  }
}

async function loadInputs(dataset: Dataset, assessmentId: number) {
  const [a] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, assessmentId));
  if (!a) throw new Error("assessment not found");
  const docIds = (await db.select().from(assessmentDocumentsTable).where(eq(assessmentDocumentsTable.assessmentId, assessmentId))).map((r) => r.documentId);
  const docRows = docIds.length ? await db.select().from(documentsTable).where(and(eq(documentsTable.dataset, dataset), inArray(documentsTable.id, docIds))) : [];
  const pageRows = docIds.length
    ? await db.select().from(documentPagesTable).where(inArray(documentPagesTable.documentId, docIds)).orderBy(asc(documentPagesTable.documentId), asc(documentPagesTable.pageNo))
    : [];
  const docs: AssessDoc[] = docRows
    .filter((d) => d.docType && d.language)
    .map((d) => {
      const pages = pageRows.filter((p) => p.documentId === d.id);
      return {
        id: d.id,
        name: d.originalName,
        docType: d.docType!,
        language: d.language!,
        pages: pages.map((p) => ({ pageNo: p.pageNo, text: p.textNormalized })),
        gapPages: pages.filter((p) => p.isGap).map((p) => p.pageNo),
      };
    });
  const ruleRows = a.rulebookVersionId
    ? await db.select().from(rulesTable).where(eq(rulesTable.versionId, a.rulebookVersionId)).orderBy(asc(rulesTable.rowNo), asc(rulesTable.id))
    : [];
  const rules: AssessRule[] = ruleRows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    text: r.text,
    checkType: r.checkType as CheckType,
    threshold: (r.threshold as Threshold | null) ?? null,
    severity: r.severity,
    appliesToDocTypes: r.appliesToDocTypes,
  }));
  return { assessment: a, docs, rules };
}

const NUMERIC: CheckType[] = ["max_value", "min_value", "cross_document"];
const JUDGED: CheckType[] = ["presence", "prohibited_language"];

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

export async function runAssessment(dataset: Dataset, assessmentId: number, role: string): Promise<void> {
  runningId = assessmentId;
  const ctx = new RunContext(assessmentId);
  const decisions = new Map<number, Decision>();
  const alerts: Alert[] = [];
  let rules: AssessRule[] = [];
  let finalStatus: "complete" | "stopped" | "failed" = "complete";
  let stopReason: string | null = null;
  try {
    await db.update(assessmentsTable).set({ status: "running", startedAt: new Date(), progress: "Preparing documents" }).where(eq(assessmentsTable.id, assessmentId));
    const inputs = await loadInputs(dataset, assessmentId);
    rules = inputs.rules;
    const docs = inputs.docs;
    const byId = new Map(docs.map((d) => [d.id, d]));
    const english = docs.filter((d) => d.language === "en");

    // ---- Code: applicability, gaps, injection ----
    const active: AssessRule[] = [];
    for (const r of rules) {
      const present = applicableDocs(r, docs, r.checkType === "bilingual" ? "any" : "en");
      if (present.length === 0) {
        const missing = missingDocTypes(r, docs).map((t) => DOC_LABEL[t]).join(", ");
        decisions.set(r.id, {
          ruleId: r.id,
          status: "needs_review",
          rationale: `No confirmed ${missing} document is included for this product, so the rule could not be checked.`,
          evidence: [],
          checks: [{ label: "Applicability", result: "info", detail: `Rule applies to: ${r.appliesToDocTypes.map((t) => DOC_LABEL[t]).join(", ")}.` }],
          proposedBy: "Code (applicability)",
        });
      } else active.push(r);
    }
    const missingTypes = (["kfs", "tnc", "rewards", "fees"] as const).filter((t) => !english.some((d) => d.docType === t));
    for (const t of missingTypes) {
      alerts.push({ kind: "missing_document", message: `No confirmed English ${DOC_LABEL[t]} document is included. Rules that need it are marked Needs review.`, documentId: null, documentName: null, pageNo: null, quote: null });
    }
    for (const d of docs) {
      if (d.gapPages.length) {
        alerts.push({ kind: "extraction_gap", message: `Page ${d.gapPages.join(", ")} has no readable text (likely a scan). Nothing on it can be quoted or checked.`, documentId: d.id, documentName: d.name, pageNo: d.gapPages[0]!, quote: null });
      }
      for (const hit of detectInjection(d.pages)) {
        alerts.push({ kind: "injection", message: "This document contains text addressed to an AI system. It was treated as data and ignored.", documentId: d.id, documentName: d.name, pageNo: hit.pageNo, quote: hit.quote });
      }
    }
    await ctx.log({
      agent: "code",
      tool: "prepare",
      summary: `Prepared ${docs.length} document(s) and ${rules.length} rules: ${active.length} can be checked, ${rules.length - active.length} lack a document. ${alerts.filter((a) => a.kind === "injection").length} instruction-like passage(s) detected and kept as data.`,
      output: { documents: docs.map((d) => ({ id: d.id, type: d.docType, language: d.language, gapPages: d.gapPages })), alerts: alerts.length },
    });

    // ---- Evidence agent ----
    const evidence: RuleEvidence[] = [];
    const facts: Fact[] = [];
    const bilingualActive = active.some((r) => r.checkType === "bilingual");
    const evidenceJobs = docs
      .map((d) => ({ doc: d, rules: d.language === "en" ? active.filter((r) => NUMERIC.includes(r.checkType) && r.appliesToDocTypes.includes(d.docType)) : [] }))
      .filter((j) => j.rules.length > 0 || (bilingualActive && active.some((r) => r.checkType === "bilingual" && r.appliesToDocTypes.includes(j.doc.docType))));
    let done = 0;
    await ctx.progress(`Evidence agent reading ${evidenceJobs.length} document(s)`);
    await pool(evidenceJobs, 2, async ({ doc, rules: rs }) => {
      const out = await ctx.call({
        agent: "evidence",
        tool: "read_document",
        name: "evidence",
        schema: evidenceSchema,
        messages: evidenceMessages(doc, rs),
        maxTokens: MAX_TOKENS.evidence,
        input: { documentId: doc.id, document: doc.name, rules: rs.map((r) => r.code) },
        summarize: (o) => `Read ${doc.name}: quotes for ${o.rules.filter((r) => r.found).length} of ${rs.length} rule(s) and ${o.facts.length} key figure(s).`,
      });
      done++;
      await ctx.progress(`Evidence agent: ${done} of ${evidenceJobs.length} documents read`);
      if (!out) {
        alerts.push({ kind: "model_error", message: "The Evidence agent could not produce a usable reading of this document. Rules that depend on it are Needs review or Warning.", documentId: doc.id, documentName: doc.name, pageNo: null, quote: null });
        return;
      }
      const wanted = new Set(rs.map((r) => r.code));
      for (const r of out.rules) if (wanted.has(r.ruleCode)) evidence.push({ documentId: doc.id, ...r });
      for (const f of out.facts) facts.push({ documentId: doc.id, ...f });
    });

    // ---- Code decisions for numeric, bilingual and readability rules ----
    const conflicts: Conflict[] = [];
    const decideNumeric = (r: AssessRule) => {
      const ev = evidence.filter((e) => e.ruleCode === r.code && r.appliesToDocTypes.includes(byId.get(e.documentId)?.docType ?? "kfs"));
      if (r.checkType === "cross_document") {
        const x = decideCrossDocument(r, ev, byId);
        if (x.conflict) conflicts.push(x.conflict);
        return x.decision;
      }
      return decideThreshold(r, ev, byId);
    };
    for (const r of active) {
      if (NUMERIC.includes(r.checkType)) decisions.set(r.id, decideNumeric(r));
      else if (r.checkType === "bilingual") {
        const x = decideBilingual(r, facts, docs);
        conflicts.push(...x.conflicts);
        decisions.set(r.id, x.decision);
      } else if (r.checkType === "readability") decisions.set(r.id, decideReadability(r, docs));
    }
    await ctx.log({
      agent: "code",
      tool: "verify_and_compare",
      summary: `Verified quotes, ran threshold arithmetic and comparisons for ${[...decisions.values()].filter((d) => !d.proposedBy.startsWith("Code (applicability")).length} rule(s); ${conflicts.length} difference(s) between documents found.`,
    });

    // ---- Consistency agent ----
    if (conflicts.length) {
      await ctx.progress("Consistency agent reviewing differences between documents");
      const out = await ctx.call({
        agent: "consistency",
        tool: "compare",
        name: "consistency",
        schema: consistencySchema,
        messages: consistencyMessages(
          conflicts.map((c) => ({
            key: c.key,
            label: c.label,
            aDoc: byId.get(c.a.documentId)!.name,
            aValue: c.a.value,
            aQuote: c.a.quote.quote,
            bDoc: byId.get(c.b.documentId)!.name,
            bValue: c.b.value,
            bQuote: c.b.quote.quote,
          })),
        ),
        maxTokens: MAX_TOKENS.consistency,
        input: { conflicts: conflicts.map((c) => c.key) },
        summarize: (o) => `Reviewed ${conflicts.length} difference(s): ${o.conflicts.filter((c) => c.verdict === "real_difference").length} real.`,
      });
      for (const c of conflicts) {
        const rule = rules.find((r) => r.code === c.ruleCode)!;
        const d = decisions.get(rule.id)!;
        const v = out?.conflicts.find((x) => x.key === c.key);
        d.proposedBy = "Evidence agent + code comparison + Consistency agent";
        d.checks.push({
          label: `Consistency agent: ${c.label}`,
          result: !v ? "info" : v.verdict === "real_difference" ? "fail" : "info",
          detail: v ? `${v.verdict.replace(/_/g, " ")}: ${v.explanation}` : "No verdict returned.",
        });
        if (v && v.verdict !== "real_difference" && d.status === "breach") {
          // Code found different numbers; the model cannot clear that on its own. An examiner decides.
          d.status = "needs_review";
          d.rationale = `${d.rationale} The Consistency agent thinks this may not be a real difference (${v.explanation}), so it needs an examiner.`;
        }
      }
    }

    // ---- Rule agent ----
    const judged = active.filter((r) => JUDGED.includes(r.checkType));
    const judgements = new Map<string, Judgement>();
    const judge = async (rs: AssessRule[], focusDocs?: AssessDoc[], focus?: string) => {
      const relevant = focusDocs ?? english.filter((d) => rs.some((r) => r.appliesToDocTypes.includes(d.docType)));
      return ctx.call({
        agent: "rule",
        tool: "judge_rules",
        name: "rule_judgements",
        schema: ruleSchema,
        messages: ruleMessages(rs, relevant, focus),
        maxTokens: MAX_TOKENS.rule,
        input: { rules: rs.map((r) => r.code), documents: relevant.map((d) => d.id) },
        summarize: (o) => `Proposed statuses for ${o.judgements.length} rule(s): ${o.judgements.map((j) => `${j.ruleCode} ${j.status.replace("_", " ")}`).join(", ")}.`,
      });
    };
    if (judged.length) {
      const totalChars = english.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.text.length, 0), 0);
      const groups = totalChars > 60_000 ? judged.map((r) => [r]) : [judged];
      for (const [i, g] of groups.entries()) {
        await ctx.progress(`Rule agent judging ${g.map((r) => r.code).join(", ")}${groups.length > 1 ? ` (${i + 1} of ${groups.length})` : ""}`);
        const out = await judge(g);
        for (const j of out?.judgements ?? []) {
          if (g.some((r) => r.code === j.ruleCode)) judgements.set(j.ruleCode, j);
        }
      }
      for (const r of judged) decisions.set(r.id, decideJudgement(r, judgements.get(r.code), docs));
    }

    // ---- Coordinator: bounded follow-up ----
    for (let round = 1; round <= LIMITS.coordinatorRounds; round++) {
      const issues: OpenIssue[] = active
        .filter((r) => [...NUMERIC, ...JUDGED].includes(r.checkType))
        .map((r) => ({ r, d: decisions.get(r.id)! }))
        .filter(({ d }) => d.status === "warning" || (d.status === "needs_review" && !/could not be read|no confirmed|examiner/i.test(d.rationale)))
        .map(({ r, d }) => ({
          ruleCode: r.code,
          ruleTitle: r.title,
          status: d.status.replace("_", " "),
          problem: d.rationale,
          documents: applicableDocs(r, docs, "en").map((x) => ({ id: x.id, name: x.name })),
        }));
      if (!issues.length) {
        await ctx.log({ agent: "code", tool: "check_gaps", summary: round === 1 ? "No open evidence gaps; no follow-up needed." : "Follow-up resolved the open evidence gaps." });
        break;
      }
      await ctx.progress(`Coordinator reviewing ${issues.length} open issue(s) (round ${round} of ${LIMITS.coordinatorRounds})`);
      const plan = await ctx.call({
        agent: "coordinator",
        tool: "plan_next_step",
        name: "coordinator",
        schema: coordinatorSchema,
        messages: coordinatorMessages(issues, { steps: LIMITS.stepLimit - ctx.steps, tokens: LIMITS.tokenLimit - ctx.tokensUsed }),
        maxTokens: MAX_TOKENS.coordinator,
        input: { round, issues: issues.map((i) => i.ruleCode) },
        summarize: (o) => (o.done || !o.actions.length ? `Stopped follow-up: ${o.reason}` : `Chose ${o.actions.length} re-read(s): ${o.actions.map((a) => `${a.ruleCode} in document ${a.documentId}`).join(", ")}. ${o.reason}`),
      });
      if (!plan || plan.done || !plan.actions.length) break;
      // The Coordinator can only pick from open issues and applicable documents.
      const valid = plan.actions.filter((a) => issues.some((i) => i.ruleCode === a.ruleCode && i.documents.some((d) => d.id === a.documentId)));
      if (!valid.length) {
        await ctx.log({ agent: "code", tool: "check_plan", summary: "The Coordinator's choices did not match any open issue and applicable document, so they were ignored." });
        break;
      }
      for (const a of valid) {
        const rule = active.find((r) => r.code === a.ruleCode)!;
        const doc = byId.get(a.documentId)!;
        await ctx.progress(`Re-reading ${doc.name} for ${rule.code}`);
        if (NUMERIC.includes(rule.checkType)) {
          const out = await ctx.call({
            agent: "evidence",
            tool: "reread_document",
            name: "evidence",
            schema: evidenceSchema,
            messages: evidenceMessages(doc, [rule], a.instruction),
            maxTokens: MAX_TOKENS.evidence,
            input: { documentId: doc.id, rule: rule.code, instruction: a.instruction },
            summarize: (o) => `Re-read ${doc.name} for ${rule.code}: ${o.rules.some((x) => x.ruleCode === rule.code && x.found) ? "found relevant wording" : "nothing relevant found"}.`,
          });
          const hit = out?.rules.find((x) => x.ruleCode === rule.code);
          if (hit) {
            const idx = evidence.findIndex((e) => e.documentId === doc.id && e.ruleCode === rule.code);
            if (idx >= 0) evidence.splice(idx, 1);
            evidence.push({ documentId: doc.id, ...hit });
            decisions.set(rule.id, decideNumeric(rule));
          }
        } else {
          const out = await judge([rule], [doc], a.instruction);
          const j = out?.judgements.find((x) => x.ruleCode === rule.code);
          if (j) decisions.set(rule.id, decideJudgement(rule, j, docs));
        }
      }
    }
  } catch (err) {
    if (err instanceof StopRun) {
      finalStatus = "stopped";
      stopReason = err.reason;
    } else {
      finalStatus = "failed";
      stopReason = err instanceof LlmError ? err.message : "An unexpected error ended the run.";
      if (!(err instanceof LlmError)) logger.error({ err, assessmentId }, "assessment run failed");
      alerts.push({ kind: "model_error", message: `${stopReason} No findings were written; nothing was invented.`, documentId: null, documentName: null, pageNo: null, quote: null });
    }
  }

  try {
    if (finalStatus !== "failed") {
      for (const r of rules) {
        if (!decisions.has(r.id)) {
          decisions.set(r.id, { ruleId: r.id, status: "needs_review", rationale: "The run stopped before this rule was assessed.", evidence: [], checks: [], proposedBy: "Code (run stopped)" });
        }
      }
      await writeFindings(dataset, assessmentId, rules, decisions);
    }
    const [row] = await db
      .update(assessmentsTable)
      .set({
        status: finalStatus,
        stopReason: stopReason ?? (finalStatus === "complete" ? "Finished: every rule has a proposal." : null),
        progress: null,
        alerts,
        finishedAt: new Date(),
        stepsUsed: ctx.steps,
        tokensIn: ctx.tokensIn,
        tokensOut: ctx.tokensOut,
        model: ctx.model ?? readLlmConfig().model,
      })
      .where(eq(assessmentsTable.id, assessmentId))
      .returning();
    const counts = countStatuses([...decisions.values()]);
    await appendAudit({
      dataset,
      role,
      action: `assessment.${finalStatus}`,
      entityType: "assessment",
      entityId: String(assessmentId),
      summary:
        finalStatus === "failed"
          ? `Assessment ${assessmentId} failed: ${stopReason}`
          : `Assessment ${assessmentId} ${finalStatus === "complete" ? "finished" : "stopped"}: ${counts.breach} breach, ${counts.warning} warning, ${counts.needs_review} needs review, ${counts.compliant} compliant.`,
      after: { status: row?.status, steps: ctx.steps, tokens: ctx.tokensUsed, counts: finalStatus === "failed" ? null : counts },
    });
  } catch (err) {
    logger.error({ err, assessmentId }, "could not finalise assessment");
    await db.update(assessmentsTable).set({ status: "failed", stopReason: "The results could not be saved.", progress: null, finishedAt: new Date() }).where(eq(assessmentsTable.id, assessmentId));
  } finally {
    runningId = null;
  }
}

export function countStatuses(ds: { status: string }[]) {
  const c = { compliant: 0, breach: 0, warning: 0, needs_review: 0, not_applicable: 0 };
  for (const d of ds) c[d.status as keyof typeof c]++;
  return c;
}

async function writeFindings(dataset: Dataset, assessmentId: number, rules: AssessRule[], decisions: Map<number, Decision>) {
  await db.transaction(async (tx) => {
    for (const r of rules) {
      const d = decisions.get(r.id)!;
      const unsupported = d.evidence.some((e) => e.verified === "not_found") || d.status === "warning";
      const [f] = await tx
        .insert(findingsTable)
        .values({
          dataset,
          assessmentId,
          ruleId: r.id,
          proposedStatus: d.status,
          severity: r.severity,
          rationale: d.rationale,
          verification: unsupported ? "unsupported" : "verified",
          proposedBy: d.proposedBy,
          checks: d.checks,
        })
        .returning();
      if (d.evidence.length) {
        await tx.insert(evidenceTable).values(
          d.evidence.map((e) => ({ findingId: f!.id, documentId: e.documentId, pageNo: e.pageNo, quote: e.quote, charStart: e.charStart, charEnd: e.charEnd, verified: e.verified })),
        );
      }
    }
  });
}

/** Runs left "running" by a restart cannot resume; mark them failed so the record is honest. */
export async function recoverInterruptedRuns(): Promise<void> {
  const rows = await db
    .update(assessmentsTable)
    .set({ status: "failed", stopReason: "The server restarted while this run was in progress. No findings were written; run it again.", progress: null, finishedAt: new Date() })
    .where(inArray(assessmentsTable.status, ["queued", "running"]))
    .returning({ id: assessmentsTable.id });
  if (rows.length) logger.warn({ ids: rows.map((r) => r.id) }, "marked interrupted assessments as failed");
}
