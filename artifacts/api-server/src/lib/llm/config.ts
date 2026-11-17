export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface LlmConfig {
  apiKey: string | null;
  model: string | null;
}

/** Read on every call so a newly added secret takes effect after a restart without code changes. */
export function readLlmConfig(): LlmConfig {
  const apiKey = process.env["OPENROUTER_API_KEY"]?.trim() || null;
  const model = process.env["OPENROUTER_MODEL"]?.trim() || null;
  return { apiKey, model };
}

export function describeConfig(c: LlmConfig): string {
  if (!c.apiKey && !c.model) {
    return "No model provider is configured. Add OPENROUTER_API_KEY and OPENROUTER_MODEL in Secrets. Until then, agents cannot run and no results will be produced.";
  }
  if (!c.apiKey) return "OPENROUTER_API_KEY is missing from Secrets. Agents cannot run until it is added.";
  if (!c.model) return "OPENROUTER_MODEL is missing from Secrets. Add the model id (for example a model that supports tool calling and JSON-schema output).";
  return `Configured to use ${c.model} through OpenRouter. Use "Test connection" to confirm the key and model work.`;
}
