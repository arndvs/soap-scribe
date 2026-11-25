import { z } from "zod";

/** Every environment variable the server reads. Secrets come from AWS Secrets Manager in production. */
const Env = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default("soap-scribe"),
  POCKET_API_KEY: z.string().min(1),
  POCKET_API_BASE: z.string().url().default("https://public.heypocketai.com/api/v1"),
  POCKET_WEBHOOK_SECRET: z.string().min(1),
  EXTENSION_TOKEN_HASH: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex"),
  LLM_PROVIDER: z.enum(["bedrock", "fake"]).default("bedrock"),
  AWS_REGION: z.string().default("us-west-2"),
  LLM_MODEL_EXTRACT: z.string().min(1),
  LLM_MODEL_COMPOSE: z.string().min(1),
  ALERT_EMAIL: z.string().email().optional().or(z.literal("")),
  ALERT_FROM_EMAIL: z.string().email().optional().or(z.literal("")),
  DRAFT_TTL_HOURS: z.coerce.number().positive().default(24),
  PRACTICE_TIMEZONE: z.string().default("America/Los_Angeles"),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Names only: never print values, some are secrets.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  return parsed.data;
}
