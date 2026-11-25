import { describe, expect, it, beforeEach } from "vitest";
import { createMemoryRepos } from "../repos/memory.js";
import type { Repos } from "../repos/types.js";
import { FakePocketClient } from "../pocket/client.js";
import { FakeLlmClient } from "../llm/client.js";
import { silentLogger } from "../log.js";
import { Worker } from "./worker.js";
import { appointment, facts, settings, T0, transcript } from "../testing/fixtures.js";
import { runCleanup, defaultRetention } from "../services/cleanup.js";
import { FakeNotifier, failedJobText } from "../notify/notifier.js";

describe("Worker", () => {
  let repos: Repos;
  let pocket: FakePocketClient;
  let llm: FakeLlmClient;
  let now: Date;
  let worker: Worker;
  let notifier: FakeNotifier;

  beforeEach(async () => {
    repos = createMemoryRepos();
    pocket = new FakePocketClient();
    llm = new FakeLlmClient();
    now = new Date(T0);
    notifier = new FakeNotifier();
    worker = new Worker({
      notifier,
      repos,
      pocket,
      llm,
      clock: { now: () => now },
      log: silentLogger,
      extractModel: "extract-model",
      timeZone: "America/Los_Angeles",
    });
    await repos.settings.saveSettings(settings());
    await repos.appointments.replaceDay("2026-12-01", [appointment()]);
    pocket.recordings.set("rec-1", { id: "rec-1", startedAt: "2026-12-01T18:31:00.000Z", durationSeconds: 840, transcript });
  });

  const advance = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));

  it("fetches a recording and suggests the matching appointment", async () => {
    const { job } = await repos.jobs.upsertByRecording("rec-1", now);
    await worker.fetchAndMatch();
    const after = await repos.jobs.get(job.id);
    expect(after?.status).toBe("needs_confirmation");
    expect(after?.suggestedAppointmentId).toBe("appt-1");
    expect(after?.notBefore).toBeUndefined();
  });

  it("does not extract anything until the patient is confirmed", async () => {
    await repos.jobs.upsertByRecording("rec-1", now);
    await worker.fetchAndMatch();
    expect(await worker.extract()).toBe(false);
    expect(llm.requests).toHaveLength(0);
  });

  it("extracts visit facts after confirmation", async () => {
    const { job } = await repos.jobs.upsertByRecording("rec-1", now);
    await worker.fetchAndMatch();
    await repos.jobs.transition(job.id, "needs_confirmation", "confirmed", { appointmentId: "appt-1", janePatientId: "1001" }, now);
    llm.push(JSON.stringify(facts));
    await worker.extract();
    expect((await repos.jobs.get(job.id))?.status).toBe("facts_ready");
    const saved = await repos.facts.get(job.id);
    expect(saved).toMatchObject(facts);
    // Evidence is copied from the transcript by code (G-19), not written by the model.
    expect(saved!.complaints[0]!.evidence).toEqual([`${transcript[1]!.speaker}: ${transcript[1]!.text}`]);
  });

  it("waits and retries when the transcript isn't ready, then fails visibly", async () => {
    pocket.recordings.set("rec-2", { id: "rec-2", startedAt: "2026-12-01T18:31:00.000Z" });
    const { job } = await repos.jobs.upsertByRecording("rec-2", now);

    await worker.fetchAndMatch();
    let j = await repos.jobs.get(job.id);
    expect(j).toMatchObject({ status: "received", attempts: 1, lastError: "transcript not ready yet" });
    expect(await worker.fetchAndMatch()).toBe(false); // backing off

    advance(1);
    await worker.fetchAndMatch();
    advance(5);
    await worker.fetchAndMatch();
    j = await repos.jobs.get(job.id);
    expect(j).toMatchObject({ status: "failed", attempts: 3 });
    expect(notifier.failed).toEqual([{ jobId: job.id, attempts: 3, error: "transcript not ready yet" }]);
  });

  it("writes alert emails with the job ID and error only", () => {
    const text = failedJobText("job-123", 3, "Pocket API /public/recordings returned 503");
    expect(text).toContain("job-123");
    expect(text).not.toMatch(/patient|transcript:/i);
  });

  it("picks a job up again when a crashed worker's lease expires", async () => {
    const { job } = await repos.jobs.upsertByRecording("rec-1", now);
    await repos.jobs.claimNext(["received"], "received", now, new Date(now.getTime() + 10 * 60_000)); // crashed worker
    expect(await worker.fetchAndMatch()).toBe(false);
    advance(11);
    expect(await worker.fetchAndMatch()).toBe(true);
    expect((await repos.jobs.get(job.id))?.status).toBe("needs_confirmation");
  });

  it("creates jobs for recordings whose webhook never arrived", async () => {
    expect(await worker.reconcile()).toBe(1);
    expect(await worker.reconcile()).toBe(0);
  });

  it("deletes patient data on schedule", async () => {
    const { job } = await repos.jobs.upsertByRecording("rec-1", now);
    await repos.facts.save(job.id, facts, now);
    advance(8 * 24 * 60);
    const r = await runCleanup(repos, now, defaultRetention(24), "America/Los_Angeles");
    expect(r.facts).toBe(1);
    expect(r.appointments).toBe(1);
    expect(await repos.facts.get(job.id)).toBeNull();
  });
});
