import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
  VerifyAuditChainResponse,
} from "@workspace/api-zod";
import { getActiveDataset } from "../lib/dataset";
import { listAudit, verifyAuditChain } from "../lib/audit";
import type { AuditLogRow } from "@workspace/db";

const router: IRouter = Router();

function toApi(r: AuditLogRow) {
  return {
    id: r.id,
    dataset: r.dataset,
    ts: r.ts,
    role: r.role,
    actor: r.actor,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    before: r.before,
    after: r.after,
    hash: r.hash,
  };
}

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

export default router;
