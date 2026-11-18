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
  ApproveDecisionParams,
  ApproveDecisionBody,
  ApproveDecisionResponse,
} from "@workspace/api-zod";
import { getActiveDataset } from "../lib/dataset";
import { requireWriter } from "../lib/roles";
import { ReviewError, bulkAccept, findingDetail, recordDecision, reviewDecision, reviewQueue } from "../lib/review";

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
  const role = requireWriter(req, res);
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

router.post("/decisions/:id/approval", async (req, res): Promise<void> => {
  const params = ApproveDecisionParams.safeParse(req.params);
  const body = ApproveDecisionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose approve or return." });
    return;
  }
  const dataset = await getActiveDataset();
  try {
    // Role and self-approval are checked inside, against the signed-in person.
    const findingId = await reviewDecision(dataset, params.data.id, body.data);
    res.json(ApproveDecisionResponse.parse(await findingDetail(dataset, findingId)));
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/review/accept-compliant", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
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
