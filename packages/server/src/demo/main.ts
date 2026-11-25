import express from "express";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { localDate, systemClock } from "../clock.js";
import { jsonLogger } from "../log.js";
import { createMemoryRepos } from "../repos/memory.js";
import { FakePocketClient, POCKET_SIGNATURE_HEADER, POCKET_TIMESTAMP_HEADER } from "../pocket/client.js";
import { BedrockLlmClient, type LlmClient } from "../llm/client.js";
import { noopNotifier } from "../notify/notifier.js";
import { createDraftService } from "../services/drafts.js";
import { createApp, sha256Hex } from "../api/app.js";
import { Worker } from "../worker/worker.js";
import { DEMO_PATIENTS as BUILT_IN, DEMO_PROTOCOLS, DEMO_TEMPLATE, appointmentWindow, parsePatientsFile, previousNotesFor } from "./data.js";
import { DemoLlmClient } from "./llm.js";
import { fakeJaneRouter, type FakeJaneState } from "./jane.js";

/**
 * Demo mode: the real API, worker, pipeline and extension against synthetic patients,
 * a fake Pocket and a fake Jane. In-memory data; nothing leaves this machine unless
 * DEMO_LLM=bedrock. See docs/demo.md.
 */
const API_PORT = Number(process.env.DEMO_API_PORT ?? 4100);
const JANE_PORT = Number(process.env.DEMO_JANE_PORT ?? 4101);
const TIME_ZONE = process.env.PRACTICE_TIMEZONE ?? "America/Los_Angeles";
const TOKEN = process.env.DEMO_TOKEN ?? "demo-token-not-a-secret";
const WEBHOOK_SECRET = "demo-webhook-secret";
const MODEL = "demo";

// Session 1: her role-played visits come from a private file outside the repo.
const DEMO_PATIENTS = process.env.DEMO_PATIENTS_FILE
  ? parsePatientsFile(readFileSync(process.env.DEMO_PATIENTS_FILE, "utf8"))
  : BUILT_IN;

const llm: LlmClient =
  process.env.DEMO_LLM === "bedrock" ? new BedrockLlmClient(process.env.AWS_REGION ?? "us-west-2") : new DemoLlmClient();
const extractModel = process.env.DEMO_LLM === "bedrock" ? (process.env.LLM_MODEL_EXTRACT ?? "") : MODEL;
const composeModel = process.env.DEMO_LLM === "bedrock" ? (process.env.LLM_MODEL_COMPOSE ?? "") : MODEL;

const repos = createMemoryRepos();
const pocket = new FakePocketClient();
const now = systemClock.now();
const today = () => localDate(systemClock.now(), TIME_ZONE);

const jane: FakeJaneState = {
  patients: DEMO_PATIENTS,
  notes: new Map(),
  appointments: new Map(),
  today,
};

async function reset() {
  Object.assign(repos, createMemoryRepos());
  pocket.recordings.clear();
  jane.notes.clear();
  for (const p of DEMO_PATIENTS) {
    jane.appointments.set(p.janePatientId, appointmentWindow(p, now));
    jane.notes.set(p.janePatientId, previousNotesFor(p, now, TIME_ZONE));
  }
  await repos.settings.saveTemplateVersion(DEMO_TEMPLATE);
  await repos.settings.saveSettings({
    activeTemplateId: DEMO_TEMPLATE.id,
    glossary: [{ term: "div", meaning: "Diversified technique" }],
    previousNotesToRead: 3,
    cloneWarningThreshold: 0.85,
    updatedAt: now.toISOString(),
  });
  for (const item of DEMO_PROTOCOLS) await repos.protocols.upsert(item);
  for (const p of DEMO_PATIENTS) {
    await repos.protocols.recordAssignments(
      (p.assignments ?? []).map((a, i) => ({
        id: `demo-assign-${p.janePatientId}-${i}`,
        janePatientId: p.janePatientId,
        protocolId: a.protocolId,
        assignedOn: localDate(new Date(now.getTime() - a.daysAgo * 86_400_000), TIME_ZONE),
        draftId: "demo-history",
      })),
    );
  }
}
await reset();

const worker = new Worker({
  repos,
  pocket,
  llm,
  clock: systemClock,
  log: jsonLogger,
  extractModel,
  timeZone: TIME_ZONE,
  notifier: noopNotifier,
});
let working = false;
const kick = async () => {
  if (working) return;
  working = true;
  try {
    while ((await worker.tick()) > 0) {
      /* drain */
    }
  } finally {
    working = false;
  }
};
setInterval(() => void kick(), 1000);

const drafts = createDraftService({ repos, llm, clock: systemClock, composeModel, timeZone: TIME_ZONE });
const app = createApp({
  repos,
  drafts,
  clock: systemClock,
  log: jsonLogger,
  extensionTokenHash: sha256Hex(TOKEN),
  pocketWebhookSecret: WEBHOOK_SECRET,
  timeZone: TIME_ZONE,
  llm,
  composeModel,
  onJobCreated: () => void kick(),
});

/** Simulates Pocket: stores the recording, then sends a signed transcription.completed webhook. */
async function finishRecording(janePatientId: string) {
  const p = DEMO_PATIENTS.find((x) => x.janePatientId === janePatientId);
  if (!p) throw new Error("unknown demo patient");
  const id = `demo-rec-${janePatientId}`;
  const start = jane.appointments.get(janePatientId)!.start;
  pocket.recordings.set(id, {
    id,
    startedAt: new Date(start.getTime() + 2 * 60_000).toISOString(),
    durationSeconds: 600,
    transcript: p.transcript.map((s, index) => ({ ...s, index })),
  });
  const body = JSON.stringify({ event: "transcription.completed", recording: { id } });
  const ts = String(Date.now());
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
  const res = await fetch(`http://localhost:${API_PORT}/webhooks/pocket`, {
    method: "POST",
    headers: { "content-type": "application/json", [POCKET_SIGNATURE_HEADER]: sig, [POCKET_TIMESTAMP_HEADER]: ts },
    body,
  });
  if (!res.ok) throw new Error(`webhook rejected: ${res.status}`);
}

const root = express();
const demo = express.Router();
demo.get("/", (_req, res) => {
  const rows = DEMO_PATIENTS.map(
    (p) => `<li>${p.name}: <form method="post" action="/demo/record/${p.janePatientId}" style="display:inline">
      <button>${pocket.recordings.has(`demo-rec-${p.janePatientId}`) ? "Recorded ✓" : "Finish recording"}</button></form></li>`,
  ).join("");
  res.send(`<!doctype html><meta charset="utf-8"><title>Fake Pocket</title>
    <body style="font:15px system-ui;margin:24px;max-width:640px">
    <h1>Fake Pocket recorder</h1>
    <p>Each button stores a synthetic transcript and sends a signed <code>transcription.completed</code> webhook, as Pocket would.</p>
    <ul>${rows}</ul>
    <form method="post" action="/demo/record-all"><button>Finish all three</button></form>
    <form method="post" action="/demo/reset"><button>Reset demo</button></form>
    <p>Fake Jane: <a href="http://localhost:${JANE_PORT}/admin/schedule">http://localhost:${JANE_PORT}/admin/schedule</a><br>
    Extension token: <code>${TOKEN}</code></p></body>`);
});
demo.post("/record/:id", async (req, res, next) => {
  try {
    await finishRecording(req.params.id);
    if (req.accepts(["html", "json"]) === "json") res.json({ ok: true });
    else res.redirect("/demo");
  } catch (e) {
    next(e);
  }
});
demo.post("/record-all", async (_req, res, next) => {
  try {
    for (const p of DEMO_PATIENTS) await finishRecording(p.janePatientId);
    res.redirect("/demo");
  } catch (e) {
    next(e);
  }
});
demo.post("/reset", async (_req, res) => {
  await reset();
  res.redirect("/demo");
});
root.use("/demo", demo);
root.use(app);

root.listen(API_PORT, () => {
  console.log(`SOAP Scribe demo
  API + fake Pocket:  http://localhost:${API_PORT}/demo
  Fake Jane:          http://localhost:${JANE_PORT}/admin/schedule
  Extension token:    ${TOKEN}
  Model:              ${process.env.DEMO_LLM === "bedrock" ? "Bedrock" : "rule-based demo stand-in (not AI)"}`);
});
express().use(fakeJaneRouter(jane)).listen(JANE_PORT);
