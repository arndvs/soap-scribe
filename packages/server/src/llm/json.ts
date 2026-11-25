import type { z } from "zod";
import type { LlmClient, LlmRequest } from "./client.js";

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

/** Pulls the first JSON object out of a model reply, tolerating ```json fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmOutputError("reply contained no JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Calls the model and validates the reply against a zod schema. On failure it retries
 * once, sending the validation error back; after that it throws, and the job fails
 * visibly instead of passing bad output to the clinician.
 */
export async function completeValidated<S extends z.ZodTypeAny>(
  llm: LlmClient,
  req: LlmRequest,
  schema: S,
): Promise<z.infer<S>> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? req.user
        : `${req.user}\n\nYour previous reply was rejected: ${lastError}\nReply again with only the corrected JSON.`;
    const text = await llm.complete({ ...req, user });
    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : "unparseable reply";
    }
  }
  throw new LlmOutputError(`model output failed validation twice: ${lastError}`);
}
