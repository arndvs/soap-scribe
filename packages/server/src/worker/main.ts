import { loadConfig } from "../config.js";
import { connectMongo } from "../repos/mongo.js";
import { systemClock } from "../clock.js";
import { errorText, jsonLogger } from "../log.js";
import { createLlm, createNotifier, createPocket } from "../runtime.js";
import { defaultRetention, runCleanup } from "../services/cleanup.js";
import { Worker } from "./worker.js";

const config = loadConfig();
const mongo = await connectMongo(config.MONGODB_URI, config.MONGODB_DB);
const worker = new Worker({
  repos: mongo.repos,
  pocket: createPocket(config),
  llm: createLlm(config),
  clock: systemClock,
  log: jsonLogger,
  extractModel: config.LLM_MODEL_EXTRACT,
  timeZone: config.PRACTICE_TIMEZONE,
  notifier: createNotifier(config),
});

const POLL_MS = 5_000;
const HOUR_MS = 3_600_000;
let stopping = false;
let lastHourly = 0;

async function loop() {
  while (!stopping) {
    try {
      if (Date.now() - lastHourly > HOUR_MS) {
        lastHourly = Date.now();
        await worker.reconcile();
        await runCleanup(mongo.repos, systemClock.now(), defaultRetention(config.DRAFT_TTL_HOURS), config.PRACTICE_TIMEZONE);
      }
      const n = await worker.tick();
      if (n === 0) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (e) {
      jsonLogger.error({ event: "worker_loop_error", error: errorText(e) });
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  await mongo.close();
}

process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
jsonLogger.info({ event: "worker_started" });
await loop();
