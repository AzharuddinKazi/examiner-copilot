import { Router, type IRouter, type Response } from "express";
import {
  ApproveNoticeBody,
  ApproveNoticeParams,
  CreateNoticeBody,
  DeleteNoticeParams,
  GetNoticeParams,
  GetNoticeResponse,
  ListNoticesResponse,
  SubmitNoticeParams,
  SyncNoticeParams,
  UpdateNoticeBody,
  UpdateNoticeParams,
} from "@workspace/api-zod";
import { getActiveDataset, type Dataset } from "../lib/dataset";
import { ReviewError } from "../lib/review";
import {
  createNotice,
  deleteNotice,
  noticeList,
  noticeView,
  recordExport,
  reviewNotice,
  submitNotice,
  syncNotice,
  updateNotice,
  withNoticeLock,
} from "../lib/notices/report";
import { renderNoticePdf } from "../lib/notices/export-pdf";
import { renderNoticeDocx } from "../lib/notices/export-docx";

const router: IRouter = Router();

/** Runs a notice action and answers with the report, mapping known errors to their status. */
async function run(res: Response, fn: (dataset: Dataset) => Promise<number | void>, id?: number) {
  const dataset = await getActiveDataset();
  try {
    const out = await fn(dataset);
    const target = typeof out === "number" ? out : id!;
    res.json(GetNoticeResponse.parse(await noticeView(dataset, target)));
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

router.get("/notices", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  res.json(ListNoticesResponse.parse(await noticeList(dataset)));
});

router.post("/notices", async (req, res): Promise<void> => {
  const b = CreateNoticeBody.safeParse(req.body);
  if (!b.success) {
    res.status(400).json({ error: "Choose an assessment; the reference date must be YYYY-MM-DD." });
    return;
  }
  await run(res, (d) => createNotice(d, { assessmentId: b.data.assessmentId, referenceDate: b.data.referenceDate ?? null }));
});

router.get("/notices/:id", async (req, res): Promise<void> => {
  const p = GetNoticeParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: "Invalid report id." });
    return;
  }
  await run(res, async () => undefined, p.data.id);
});

router.patch("/notices/:id", async (req, res): Promise<void> => {
  const p = UpdateNoticeParams.safeParse(req.params);
  const b = UpdateNoticeBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Check the changes: dates must be YYYY-MM-DD and texts not too long." });
    return;
  }
  await run(res, (d) => withNoticeLock(p.data.id, () => updateNotice(d, p.data.id, b.data)), p.data.id);
});

router.delete("/notices/:id", async (req, res): Promise<void> => {
  const p = DeleteNoticeParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: "Invalid report id." });
    return;
  }
  const dataset = await getActiveDataset();
  try {
    await withNoticeLock(p.data.id, () => deleteNotice(dataset, p.data.id));
    res.status(204).end();
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/notices/:id/sync", async (req, res): Promise<void> => {
  const p = SyncNoticeParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: "Invalid report id." });
    return;
  }
  await run(res, (d) => withNoticeLock(p.data.id, () => syncNotice(d, p.data.id)), p.data.id);
});

router.post("/notices/:id/submit", async (req, res): Promise<void> => {
  const p = SubmitNoticeParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: "Invalid report id." });
    return;
  }
  await run(res, (d) => withNoticeLock(p.data.id, () => submitNotice(d, p.data.id)), p.data.id);
});

router.post("/notices/:id/approval", async (req, res): Promise<void> => {
  const p = ApproveNoticeParams.safeParse(req.params);
  const b = ApproveNoticeBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Choose approve or return." });
    return;
  }
  await run(res, (d) => withNoticeLock(p.data.id, () => reviewNotice(d, p.data.id, b.data)), p.data.id);
});

/** File downloads (plain links, not part of the JSON API). */
router.get("/notices/:id/export.:format", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const format = req.params.format;
  if (!Number.isInteger(id) || (format !== "pdf" && format !== "docx")) {
    res.status(400).json({ error: "Choose PDF or Word." });
    return;
  }
  const dataset = await getActiveDataset();
  try {
    const v = await noticeView(dataset, id);
    const buf = format === "pdf" ? await renderNoticePdf(v) : await renderNoticeDocx(v);
    await recordExport(dataset, v, format);
    const name = `Findings report - ${v.productName} - ${v.bankName}${v.state === "approved" ? "" : " (not approved)"}.${format}`.replace(/[\\/:*?"<>|]/g, "");
    res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buf);
  } catch (err) {
    if (err instanceof ReviewError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
