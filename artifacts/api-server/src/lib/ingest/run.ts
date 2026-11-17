/**
 * Runs the Ingestion agent for one document in the background and stores its checked proposal.
 * Calls run one at a time so a batch upload does not trip the free model's rate limit.
 * A failure is stored with its reason; the rule-based suggestion is unaffected.
 */
import { db, documentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { LlmError } from "../llm/adapter";
import { readLlmConfig } from "../llm/config";
import { appendAudit } from "../audit";
import type { Dataset } from "../dataset";
import { getPages, loadBanksForMatch } from "../documents";
import type { DocumentSuggestion } from "../suggest";
import { logger } from "../logger";
import { proposeDocument, type AgentDocumentProposal } from "./agent";

let chain: Promise<void> = Promise.resolve();

export function llmReady(): boolean {
  const c = readLlmConfig();
  return Boolean(c.apiKey && c.model);
}

function emptyProposal(status: AgentDocumentProposal["status"], error: string | null = null): AgentDocumentProposal {
  return {
    status,
    error,
    model: null,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: null,
    requestedAt: new Date().toISOString(),
    finishedAt: status === "running" ? null : new Date().toISOString(),
    docType: null,
    language: null,
    bankId: null,
    productId: null,
  };
}

/** Marks the document as waiting for the agent and queues the call. Returns immediately. */
export async function queueDocumentProposal(dataset: Dataset, documentId: number, role: string): Promise<void> {
  await db
    .update(documentsTable)
    .set({ agentProposal: emptyProposal("running") })
    .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, documentId)));
  chain = chain.then(() => runDocumentProposal(dataset, documentId, role)).catch((err) => logger.error({ err, documentId }, "ingestion agent crashed"));
}

async function runDocumentProposal(dataset: Dataset, documentId: number, role: string): Promise<void> {
  const [row] = await db.select().from(documentsTable).where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, documentId)));
  if (!row) return;
  const pages = await getPages(documentId);
  const banks = await loadBanksForMatch(dataset);
  let proposal: AgentDocumentProposal;
  try {
    const r = await proposeDocument({
      fileName: row.originalName,
      pages: pages.map((p) => ({ pageNo: p.pageNo, text: p.textNormalized, isGap: p.isGap })),
      banks,
      rules: (row.ingestionProposal as DocumentSuggestion | null) ?? null,
    });
    proposal = {
      ...emptyProposal("done"),
      requestedAt: (row.agentProposal as AgentDocumentProposal | null)?.requestedAt ?? new Date().toISOString(),
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      ...r.checked,
    };
  } catch (err) {
    const message = err instanceof LlmError ? err.message : "Unexpected error while asking the Ingestion agent.";
    if (!(err instanceof LlmError)) logger.error({ err, documentId }, "ingestion agent failed");
    proposal = emptyProposal("failed", message);
  }
  // The document may have been deleted (demo reset) while the call ran.
  const updated = await db
    .update(documentsTable)
    .set({
      agentProposal: proposal,
      ...(row.status === "uploaded" && proposal.status === "done" && [proposal.docType, proposal.bankId, proposal.productId].some((f) => f?.value != null)
        ? { status: "proposed" as const }
        : {}),
    })
    .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, documentId)))
    .returning({ id: documentsTable.id });
  if (!updated.length) return;
  const differs = (["docType", "language", "bankId", "productId"] as const).filter((k) => proposal[k]?.agreement === "differs");
  await appendAudit({
    dataset,
    role,
    action: proposal.status === "done" ? "document.agent_proposed" : "document.agent_failed",
    entityType: "document",
    entityId: String(documentId),
    summary:
      proposal.status === "done"
        ? `Ingestion agent proposed labels for ${row.originalName}${differs.length ? `; differs from the rule-based suggestion on ${differs.join(", ")}` : ""}. Awaiting examiner confirmation.`
        : `Ingestion agent could not propose labels for ${row.originalName}: ${proposal.error}`,
    after: { status: proposal.status, model: proposal.model, tokens: proposal.tokensIn + proposal.tokensOut },
  });
}

/** Proposals left "running" by a restart cannot resume; mark them failed. */
export async function recoverInterruptedProposals(): Promise<void> {
  await db
    .update(documentsTable)
    .set({ agentProposal: emptyProposal("failed", "The server restarted before the Ingestion agent answered. Ask it again.") })
    .where(sql`${documentsTable.agentProposal}->>'status' = 'running'`);
}
