import { z } from "zod";
import { chatCompletion, LlmError, type ChatMessage } from "./adapter";

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  attempts: number;
}

/** Strips a ```json fence or leading prose some models add despite the schema. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]!.trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("not JSON");
  }
}

export type CallModel = typeof chatCompletion;

/**
 * One model call whose reply must match a zod schema. On an invalid reply it makes one repair
 * attempt that shows the model its own validation errors. Never returns unvalidated data:
 * if both attempts fail it throws LlmError("invalid_response").
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  name: string;
  schema: S;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs?: number;
  call?: CallModel;
  model?: string;
}): Promise<StructuredResult<z.infer<S>>> {
  const call = opts.call ?? chatCompletion;
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  let messages = opts.messages;
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;
  let model = "";
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await call({
      messages,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs ?? 90_000,
      jsonSchema: { name: opts.name, schema: jsonSchema },
      ...(opts.model ? { model: opts.model } : {}),
    });
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
    latencyMs += r.latencyMs;
    model = r.model;
    let parsed: unknown;
    try {
      parsed = extractJson(r.content);
    } catch {
      lastProblem = "The reply was not valid JSON.";
      messages = [...opts.messages, { role: "assistant", content: r.content.slice(0, 4000) }, { role: "user", content: `${lastProblem} Reply again with only a JSON object that matches the schema.` }];
      continue;
    }
    const v = opts.schema.safeParse(parsed);
    if (v.success) return { data: v.data, model, tokensIn, tokensOut, latencyMs, attempts: attempt };
    lastProblem = v.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    messages = [
      ...opts.messages,
      { role: "assistant", content: r.content.slice(0, 4000) },
      { role: "user", content: `Your JSON did not match the schema: ${lastProblem}. Reply again with only the corrected JSON object.` },
    ];
  }
  const err = new LlmError("invalid_response", `The model's reply did not match the expected format after a retry (${lastProblem.slice(0, 200)}).`);
  (err as LlmError & { usage?: unknown }).usage = { tokensIn, tokensOut, latencyMs };
  throw err;
}
