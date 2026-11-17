import { OPENROUTER_BASE_URL, readLlmConfig } from "./config";

/**
 * The single server-side entry point for every model call.
 * It never fabricates output: on any failure it throws LlmError with a clear, user-facing message.
 * Budgets, tool calling and zod validation are layered on top of this in later milestones.
 */
export type LlmErrorCode =
  | "missing_key"
  | "missing_model"
  | "invalid_key"
  | "insufficient_credits"
  | "model_not_found"
  | "rate_limited"
  | "provider_error"
  | "network_error"
  | "timeout"
  | "invalid_response";

export class LlmError extends Error {
  constructor(public code: LlmErrorCode, message: string, public status?: number) {
    super(message);
    this.name = "LlmError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  /** JSON schema the reply must follow (OpenAI-compatible response_format). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Retries on 429 with backoff. Default 2. */
  rateLimitRetries?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

function mapHttpError(status: number, body: string): LlmError {
  const detail = body.slice(0, 300);
  if (status === 401 || status === 403) return new LlmError("invalid_key", "The provider rejected the OpenRouter key. Check it in Secrets (OPENROUTER_API_KEY or OPENAI_API_KEY).", status);
  if (status === 402) return new LlmError("insufficient_credits", "The OpenRouter account has insufficient credits for this request.", status);
  if (status === 404) return new LlmError("model_not_found", "The model in OPENROUTER_MODEL was not found or is unavailable. Check the model id.", status);
  if (status === 429) return new LlmError("rate_limited", "The provider is rate limiting requests. Try again shortly.", status);
  return new LlmError("provider_error", `The provider returned an error (HTTP ${status}). ${detail}`.trim(), status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatCompletion(req: ChatRequest): Promise<ChatResult> {
  const retries = req.rateLimitRetries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatCompletionOnce(req);
    } catch (err) {
      const retryable = err instanceof LlmError && (err.code === "rate_limited" || (err.code === "provider_error" && (err.status ?? 0) >= 500));
      if (!retryable || attempt >= retries) throw err;
      await sleep(3000 * 2 ** attempt);
    }
  }
}

async function chatCompletionOnce(req: ChatRequest): Promise<ChatResult> {
  const { apiKey, model } = readLlmConfig();
  if (!apiKey) throw new LlmError("missing_key", "No OpenRouter key is set in Secrets (OPENROUTER_API_KEY or OPENAI_API_KEY). No model call was made.");
  if (!model) throw new LlmError("missing_model", "OPENROUTER_MODEL is not set in Secrets. No model call was made.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Examiner Co-Pilot",
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 0,
        ...(req.jsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema },
              },
            }
          : {}),
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new LlmError("timeout", "The provider did not respond in time.");
    throw new LlmError("network_error", "Could not reach the provider. Check network access and try again.");
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;
  const text = await res.text();
  if (!res.ok) throw mapHttpError(res.status, text);

  let json: {
    model?: string;
    choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string; code?: number };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("invalid_response", "The provider returned a response that is not valid JSON.");
  }
  if (json.error) throw mapHttpError(json.error.code ?? 502, json.error.message ?? "");
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    if (json.choices?.[0]?.finish_reason === "length") {
      throw new LlmError("invalid_response", "The model used its whole token limit before answering (it may be a reasoning model). Raise the limit or choose another model.");
    }
    throw new LlmError("invalid_response", "The provider returned no message content.");
  }
  return {
    content,
    model: json.model ?? model,
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}
