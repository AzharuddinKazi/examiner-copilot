import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
  VerifyAuditChainResponse,
  RecordRoleChangeBody,
  RecordRoleChangeResponse,
} from "@workspace/api-zod";
import { getActiveDataset } from "../lib/dataset";
import { appendAudit, listAudit, verifyAuditChain } from "../lib/audit";
import type { AuditLogRow } from "@workspace/db";

const router: IRouter = Router();

function toApi(r: AuditLogRow) {
  return {
    id: r.id,
    dataset: r.dataset,
    ts: r.ts,
    role: r.role,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    before: r.before,
    after: r.after,
    hash: r.hash,
  };
}

const ROLE_LABELS: Record<string, string> = {
  examiner: "Examiner",
  senior_examiner: "Senior examiner",
  viewer: "Viewer",
};

router.get("/audit/events", async (req, res): Promise<void> => {
  const q = ListAuditEventsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const dataset = await getActiveDataset();
  const page = await listAudit(dataset, {
    limit: q.data.limit ?? 50,
    offset: q.data.offset ?? 0,
    action: q.data.action || undefined,
  });
  res.json(ListAuditEventsResponse.parse({ items: page.items.map(toApi), total: page.total, actions: page.actions }));
});

router.get("/audit/verify", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const v = await verifyAuditChain(dataset);
  res.json(VerifyAuditChainResponse.parse({ ...v, checkedAt: new Date() }));
});

router.post("/audit/role-change", async (req, res): Promise<void> => {
  const parsed = RecordRoleChangeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { role, previousRole } = parsed.data;
  const dataset = await getActiveDataset();
  const row = await appendAudit({
    dataset,
    role,
    action: "role.selected",
    entityType: "session",
    summary: `Role self-selected as ${ROLE_LABELS[role] ?? role}${previousRole ? ` (was ${ROLE_LABELS[previousRole] ?? previousRole})` : ""}. Unverified.`,
    before: previousRole ? { role: previousRole } : null,
    after: { role },
  });
  res.status(201).json(RecordRoleChangeResponse.parse(toApi(row)));
});

export default router;
