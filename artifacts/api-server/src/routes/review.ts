import { Router, type IRouter } from "express";
import {
  GetReviewQueueResponse,
  GetFindingParams,
  GetFindingResponse,
  DecideFindingParams,
  DecideFindingBody,
  DecideFindingResponse,
  AcceptCompliantFindingsBody,
  AcceptCompliantFindingsResponse,
} from "@workspace/api-zod";
import { getActiveDataset } from "../lib/dataset";
import { requireWriter } from "../lib/roles";
import { ReviewError, bulkAccept, findingDetail, recordDecision, reviewQueue } from "../lib/review";

const router: IRouter = Router();

router.get("/review/queue", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  res.json(GetReviewQueueResponse.parse(await reviewQueue(dataset)));
});

router.get("/findings/:id", async (req, res): Promise<void> => {
  const params = GetFindingParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const d = params.success ? await findingDetail(dataset, params.data.id) : null;
  if (!d) {
    res.status(404).json({ error: "Finding not found." });
    return;
  }
  res.json(GetFindingResponse.parse(d));
});

router.post("/findings/:id/decisions", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const params = DecideFindingParams.safeParse(req.params);
  const body = DecideFindingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose accept, modify or reject." });
    return;
  }
  const dataset = await getActiveDataset();
  try {
    await recordDecision(dataset, params.data.id, role, body.data);
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
  res.status(201).json(DecideFindingResponse.parse(await findingDetail(dataset, params.data.id)));
});

router.post("/review/accept-compliant", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const body = AcceptCompliantFindingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "An assessmentId is required." });
    return;
  }
  const dataset = await getActiveDataset();
  try {
    const accepted = await bulkAccept(dataset, body.data.assessmentId, role, body.data.examinerNote ?? null);
    res.json(AcceptCompliantFindingsResponse.parse({ accepted }));
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
