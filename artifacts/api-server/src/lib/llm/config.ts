export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface LlmConfig {
  apiKey: string | null;
  model: string | null;
  /** Which secret the key came from, so messages name the right one. */
  keySource: "OPENROUTER_API_KEY" | "OPENAI_API_KEY" | null;
}

/** The OpenRouter key may be stored under either name; OPENROUTER_API_KEY wins if both exist. */
const KEY_NAMES = ["OPENROUTER_API_KEY", "OPENAI_API_KEY"] as const;

/** Read on every call so a newly added secret takes effect after a restart without code changes. */
export function readLlmConfig(): LlmConfig {
  const keySource = KEY_NAMES.find((k) => process.env[k]?.trim()) ?? null;
  const apiKey = keySource ? process.env[keySource]!.trim() : null;
  const model = process.env["OPENROUTER_MODEL"]?.trim() || null;
  return { apiKey, model, keySource };
}

export function describeConfig(c: LlmConfig): string {
  if (!c.apiKey && !c.model) {
    return "No model provider is configured. Add the OpenRouter key (OPENROUTER_API_KEY or OPENAI_API_KEY) and OPENROUTER_MODEL in Secrets. Until then, agents cannot run and no results will be produced.";
  }
  if (!c.apiKey) return "The OpenRouter key is missing from Secrets (OPENROUTER_API_KEY or OPENAI_API_KEY). Agents cannot run until it is added.";
  if (!c.model) return "OPENROUTER_MODEL is missing from Secrets. Add the model id (for example a model that supports tool calling and JSON-schema output).";
  return `The model connection is configured. Use "Test connection" to confirm it works.`;
}

/** The Challenger agent may use a different model from the Rule agent; otherwise it uses OPENROUTER_MODEL. */
export function challengerModel(): string | null {
  return process.env["OPENROUTER_CHALLENGER_MODEL"]?.trim() || null;
}
