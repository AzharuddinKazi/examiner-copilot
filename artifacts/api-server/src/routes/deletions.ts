import { Router, type IRouter } from "express";
import { DeleteItemParams, DeleteItemResponse, GetDeleteImpactParams, GetDeleteImpactResponse } from "@workspace/api-zod";
import { getActiveDataset } from "../lib/dataset";
import { requireWriter } from "../lib/roles";
import { DeleteNotFound, deleteImpact, deleteItem } from "../lib/deletion";

const router: IRouter = Router();

router.get("/deletions/:kind/:id", async (req, res): Promise<void> => {
  const params = GetDeleteImpactParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  try {
    const impact = await deleteImpact(await getActiveDataset(), params.data.kind, params.data.id);
    res.json(GetDeleteImpactResponse.parse(impact));
  } catch (err) {
    if (err instanceof DeleteNotFound) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/deletions/:kind/:id", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const params = DeleteItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  try {
    const impact = await deleteItem(await getActiveDataset(), params.data.kind, params.data.id, role);
    if (impact.blockedReason) {
      res.status(409).json({ error: impact.blockedReason });
      return;
    }
    res.json(DeleteItemResponse.parse(impact));
  } catch (err) {
    if (err instanceof DeleteNotFound) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
