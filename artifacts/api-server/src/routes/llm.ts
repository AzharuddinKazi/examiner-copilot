import { Router, type IRouter } from "express";
import { GetLlmStatusResponse, TestLlmConnectionBody, TestLlmConnectionResponse } from "@workspace/api-zod";
import { readLlmConfig, describeConfig } from "../lib/llm/config";
import { chatCompletion, LlmError } from "../lib/llm/adapter";
import { getActiveDataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/llm/status", (_req, res): void => {
  const c = readLlmConfig();
  res.json(
    GetLlmStatusResponse.parse({
      configured: Boolean(c.apiKey && c.model),
      keyPresent: Boolean(c.apiKey),
      modelPresent: Boolean(c.model),
      model: c.model,
      provider: "OpenRouter",
      message: describeConfig(c),
    }),
  );
});

router.post("/llm/test", async (req, res): Promise<void> => {
  const parsed = TestLlmConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { model } = readLlmConfig();
  const checkedAt = new Date();
  let result: { ok: boolean; model: string | null; latencyMs: number | null; error: string | null; checkedAt: Date };
  try {
    const r = await chatCompletion({
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      // Reasoning models spend tokens before answering; a tiny limit returns no content.
      maxTokens: 512,
      timeoutMs: 20_000,
    });
    result = { ok: true, model: r.model, latencyMs: r.latencyMs, error: null, checkedAt };
  } catch (err) {
    const message = err instanceof LlmError ? err.message : "Unexpected error while contacting the provider.";
    req.log.warn({ code: err instanceof LlmError ? err.code : "unknown" }, "LLM connection test failed");
    result = { ok: false, model, latencyMs: null, error: message, checkedAt };
  }
  const dataset = await getActiveDataset();
  await appendAudit({
    dataset,
    role: req.user?.role ?? null,
    action: "llm.test",
    entityType: "provider",
    entityId: "openrouter",
    summary: result.ok ? `Provider connection test passed (${result.model}).` : `Provider connection test failed: ${result.error}`,
    after: { ok: result.ok, model: result.model, latencyMs: result.latencyMs },
  });
  res.json(TestLlmConnectionResponse.parse(result));
});

export default router;
