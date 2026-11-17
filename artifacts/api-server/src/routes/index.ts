import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workspaceRouter from "./workspace";
import llmRouter from "./llm";
import auditRouter from "./audit";
import libraryRouter from "./library";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workspaceRouter);
router.use(llmRouter);
router.use(auditRouter);
router.use(libraryRouter);
router.use(documentsRouter);

export default router;
