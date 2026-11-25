import { loadConfig } from "../config.js";
import { connectMongo } from "../repos/mongo.js";
import { systemClock } from "../clock.js";
import { jsonLogger } from "../log.js";
import { createLlm } from "../runtime.js";
import { createDraftService } from "../services/drafts.js";
import { createApp } from "./app.js";

const config = loadConfig();
const mongo = await connectMongo(config.MONGODB_URI, config.MONGODB_DB);
const llm = createLlm(config);
const drafts = createDraftService({
  repos: mongo.repos,
  llm,
  clock: systemClock,
  composeModel: config.LLM_MODEL_COMPOSE,
  timeZone: config.PRACTICE_TIMEZONE,
});

const app = createApp({
  repos: mongo.repos,
  drafts,
  clock: systemClock,
  log: jsonLogger,
  extensionTokenHash: config.EXTENSION_TOKEN_HASH,
  pocketWebhookSecret: config.POCKET_WEBHOOK_SECRET,
  timeZone: config.PRACTICE_TIMEZONE,
  llm,
  composeModel: config.LLM_MODEL_COMPOSE,
});

const server = app.listen(config.PORT, () => jsonLogger.info({ event: "api_started" }));

const shutdown = () => server.close(() => void mongo.close().then(() => process.exit(0)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
