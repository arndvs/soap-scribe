import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { createApp, sha256Hex } from "./app.js";
import { createMemoryRepos } from "../repos/memory.js";
import type { Repos } from "../repos/types.js";
import { FakeLlmClient } from "../llm/client.js";
import { FakePocketClient, POCKET_SIGNATURE_HEADER, POCKET_TIMESTAMP_HEADER } from "../pocket/client.js";
import { createDraftService } from "../services/drafts.js";
import { Worker } from "../worker/worker.js";
import { silentLogger } from "../log.js";
import { composeOutput, facts, previousNote, protocolLibrary, settings, T0, template, transcript } from "../testing/fixtures.js";

const TOKEN = "test-token-not-a-secret";
const SECRET = "webhook-secret-for-tests";
const TS = String(T0.getTime());
const sign = (body: string) => createHmac("sha256", SECRET).update(`${TS}.${body}`).digest("hex");

describe("API", () => {
  let repos: Repos;
  let llm: FakeLlmClient;
  let pocket: FakePocketClient;
  let app: ReturnType<typeof createApp>;
  let worker: Worker;
  const clock = { now: () => new Date(T0) };

  beforeEach(async () => {
    repos = createMemoryRepos();
    llm = new FakeLlmClient();
    pocket = new FakePocketClient();
    const drafts = createDraftService({ repos, llm, clock, composeModel: "compose-model", timeZone: "America/Los_Angeles" });
    app = createApp({
      repos,
      drafts,
      clock,
      log: silentLogger,
      extensionTokenHash: sha256Hex(TOKEN),
      pocketWebhookSecret: SECRET,
      timeZone: "America/Los_Angeles",
      llm,
      composeModel: "compose-model",
    });
    worker = new Worker({ repos, pocket, llm, clock, log: silentLogger, extractModel: "extract-model", timeZone: "America/Los_Angeles" });
    await repos.settings.saveSettings(settings());
    await repos.settings.saveTemplateVersion(template());
    for (const p of protocolLibrary) await repos.protocols.upsert(p);
    pocket.recordings.set("rec-1", { id: "rec-1", startedAt: "2026-12-01T18:31:00.000Z", transcript });
  });

  const authed = (r: request.Test) => r.set("Authorization", `Bearer ${TOKEN}`);
  const webhook = (body: object) => {
    const raw = JSON.stringify(body);
    return request(app)
      .post("/webhooks/pocket")
      .set("Content-Type", "application/json")
      .set(POCKET_SIGNATURE_HEADER, sign(raw))
      .set(POCKET_TIMESTAMP_HEADER, TS)
      .send(raw);
  };
  const transcribed = (id: string) => ({ event: "transcription.completed", timestamp: T0.toISOString(), recording: { id } });

  it("rejects requests without the extension token", async () => {
    await request(app).get("/today").expect(401);
    await request(app).get("/today").set("Authorization", "Bearer wrong").expect(401);
  });

  it("rejects an unsigned webhook and accepts duplicates once", async () => {
    await request(app).post("/webhooks/pocket").send(transcribed("rec-1")).expect(401);
    await webhook(transcribed("rec-1")).expect(200);
    await webhook(transcribed("rec-1")).expect(200);
    expect(await repos.jobs.listSince(new Date(0))).toHaveLength(1);
  });

  it("acknowledges events that don't start a job", async () => {
    const res = await webhook({ event: "summary.completed", recording: { id: "rec-9" } }).expect(200);
    expect(res.body.ignored).toBe(true);
    expect(await repos.jobs.listSince(new Date(0))).toHaveLength(0);
  });

  it("runs a visit end to end: webhook, match, confirm, extract, compose, insert", async () => {
    await authed(request(app).post("/appointments/sync")).send({
      date: "2026-12-01",
      appointments: [{ start: "2026-12-01T18:30:00.000Z", end: "2026-12-01T18:45:00.000Z", janePatientId: "1001", patientDisplayName: "Test Patient A" }],
    }).expect(200);
    await webhook(transcribed("rec-1")).expect(200);
    await worker.fetchAndMatch();

    const today = (await authed(request(app).get("/today")).expect(200)).body;
    expect(today.items).toHaveLength(1);
    const item = today.items[0];
    expect(item.status).toBe("needs_confirmation");
    expect(item.suggestedAppointment.janePatientId).toBe("1001");

    await authed(request(app).post(`/jobs/${item.jobId}/confirm`)).send({ appointmentId: item.suggestedAppointment.id }).expect(200);
    llm.push(JSON.stringify(facts));
    await worker.extract();

    llm.push(JSON.stringify(composeOutput));
    const composed = (await authed(request(app).post("/drafts/compose")).send({ janePatientId: "1001", previousNotes: [previousNote] }).expect(200)).body.draft;
    expect(composed.templateVersion).toBe(1);
    expect(composed.sections.plan.filter((s: { source: string }) => s.source === "protocol")).toHaveLength(2);

    const fetched = (await authed(request(app).get("/drafts?janePatientId=1001")).expect(200)).body.draft;
    expect(fetched.id).toBe(composed.id);

    await authed(request(app).post(`/drafts/${composed.id}/inserted`)).send({ janePatientIdOnPage: "9999", readBackMatched: true }).expect(409);
    await authed(request(app).post(`/drafts/${composed.id}/inserted`)).send({ janePatientIdOnPage: "1001", readBackMatched: true }).expect(200);

    expect((await repos.jobs.get(item.jobId))?.status).toBe("inserted");
    expect(await repos.facts.get(item.jobId)).toBeNull();
    const assignments = (await authed(request(app).get("/patients/1001/assignments")).expect(200)).body.assignments;
    expect(assignments.map((a: { protocolId: string }) => a.protocolId).sort()).toEqual(["cat-cow", "wedge"]);
    const actions = (await repos.audit.list(20)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["job_confirmed", "draft_composed", "draft_viewed", "draft_inserted"]));
  });

  it("suggests a patient when the schedule is synced after the recording arrives, and survives a re-sync", async () => {
    const sync = () =>
      authed(request(app).post("/appointments/sync")).send({
        date: "2026-12-01",
        appointments: [{ start: "2026-12-01T18:30:00.000Z", end: "2026-12-01T18:45:00.000Z", janePatientId: "1001", patientDisplayName: "Test Patient A" }],
      }).expect(200);
    await webhook(transcribed("rec-1")).expect(200);
    await worker.fetchAndMatch(); // no schedule yet: nothing to suggest at fetch time
    await sync();
    const item = (await authed(request(app).get("/today")).expect(200)).body.items[0];
    expect(item.suggestedAppointment.janePatientId).toBe("1001");

    await authed(request(app).post(`/jobs/${item.jobId}/confirm`)).send({ appointmentId: item.suggestedAppointment.id }).expect(200);
    await sync(); // e.g. she opens the schedule again
    const after = (await authed(request(app).get("/today")).expect(200)).body.items[0];
    expect(after.confirmedAppointment?.janePatientId).toBe("1001");
  });

  it("returns no draft for a patient without a confirmed visit", async () => {
    const body = (await authed(request(app).post("/drafts/compose")).send({ janePatientId: "2002", previousNotes: [] }).expect(200)).body;
    expect(body.draft).toBeNull();
  });

  it("refuses an insert report that skipped the read-back", async () => {
    await authed(request(app).post("/drafts/x/inserted")).send({ janePatientIdOnPage: "1001", readBackMatched: false }).expect(400);
  });

  it("saves every template edit as a new version", async () => {
    const { id, version, updatedAt, ...body } = template();
    await authed(request(app).put("/templates/tpl-1")).send({ ...body, styleNotes: "v2" }).expect(200);
    const versions = (await authed(request(app).get("/templates/tpl-1/versions")).expect(200)).body.versions;
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it("previews an unsaved template on the synthetic visit", async () => {
    llm.push(JSON.stringify(composeOutput));
    const { id, version, updatedAt, ...body } = template();
    const preview = (await authed(request(app).post("/settings/preview")).send(body).expect(200)).body.preview;
    expect(preview.sections.plan.some((s: { protocolId?: string }) => s.protocolId === "cat-cow")).toBe(true);
    expect(llm.requests.at(-1)?.user).not.toMatch(/1001/);
  });

  it("validates settings before saving", async () => {
    await authed(request(app).put("/settings")).send({ activeTemplateId: "tpl-1" }).expect(400);
  });
});
