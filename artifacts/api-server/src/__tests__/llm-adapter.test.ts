import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatCompletion, LlmError } from "../lib/llm/adapter";

const saved = { ...process.env };

describe("LLM adapter never fabricates results", () => {
  beforeEach(() => {
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENROUTER_MODEL"];
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("refuses to call the provider when the key is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env["OPENROUTER_MODEL"] = "some/model";
    await expect(chatCompletion({ messages: [{ role: "user", content: "x" }], maxTokens: 1 })).rejects.toMatchObject({
      code: "missing_key",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the model is missing", async () => {
    process.env["OPENROUTER_API_KEY"] = "k";
    await expect(chatCompletion({ messages: [{ role: "user", content: "x" }], maxTokens: 1 })).rejects.toMatchObject({
      code: "missing_model",
    });
  });

  it("maps provider failures to clear errors instead of returning content", async () => {
    process.env["OPENROUTER_API_KEY"] = "k";
    process.env["OPENROUTER_MODEL"] = "some/model";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorised", { status: 401 }));
    const err = await chatCompletion({ messages: [{ role: "user", content: "x" }], maxTokens: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe("invalid_key");
  });

  it("rejects a response with no message content", async () => {
    process.env["OPENROUTER_API_KEY"] = "k";
    process.env["OPENROUTER_MODEL"] = "some/model";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(chatCompletion({ messages: [{ role: "user", content: "x" }], maxTokens: 1 })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
