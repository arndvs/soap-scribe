import { LEASE_MINUTES, MAX_AUTOMATIC_ATTEMPTS, RETRY_BACKOFF_MINUTES, type Job, type JobStatus } from "../domain.js";
import type { Repos } from "../repos/types.js";
import type { PocketClient } from "../pocket/client.js";
import type { LlmClient } from "../llm/client.js";
import { addMinutes, localDate, type Clock } from "../clock.js";
import { errorText, type Logger } from "../log.js";
import { suggestAppointment } from "../pipeline/match.js";
import { extractVisitFacts } from "../pipeline/extract.js";
import { noopNotifier, type Notifier } from "../notify/notifier.js";

export interface WorkerDeps {
  repos: Repos;
  pocket: PocketClient;
  llm: LlmClient;
  clock: Clock;
  log: Logger;
  extractModel: string;
  timeZone: string;
  notifier?: Notifier;
}

export class TranscriptNotReadyError extends Error {
  constructor() {
    super("transcript not ready yet");
  }
}

/**
 * Background work. Each step claims a job with a lease, so a crashed worker's job is
 * simply claimed again when the lease runs out; every step is safe to run twice.
 * Stage 2 (composing the note) is not here: it runs when the clinician opens the chart.
 */
export class Worker {
  constructor(private readonly d: WorkerDeps) {}

  /** Runs one unit of each kind of work. Returns how many jobs were processed. */
  async tick(): Promise<number> {
    let n = 0;
    if (await this.fetchAndMatch()) n++;
    if (await this.extract()) n++;
    return n;
  }

  /** Step 1: fetch recording details from Pocket and suggest the appointment. */
  async fetchAndMatch(): Promise<boolean> {
    const now = this.d.clock.now();
    const job = await this.d.repos.jobs.claimNext(["received"], "received", now, addMinutes(now, LEASE_MINUTES));
    if (!job) return false;
    try {
      const rec = await this.d.pocket.getRecording(job.pocketRecordingId);
      if (!rec.transcript?.length) throw new TranscriptNotReadyError();
      const fetched = await this.d.repos.jobs.transition(
        job.id,
        "received",
        "fetched",
        { recordedAt: rec.startedAt, durationSeconds: rec.durationSeconds, notBefore: undefined, lastError: undefined },
        now,
      );
      if (!fetched) return true; // someone else moved it; nothing to do
      const recordedAt = new Date(rec.startedAt);
      const day = await this.d.repos.appointments.listDay(localDate(recordedAt, this.d.timeZone));
      const suggestion = suggestAppointment(recordedAt, day);
      await this.d.repos.jobs.transition(
        job.id,
        "fetched",
        "needs_confirmation",
        { suggestedAppointmentId: suggestion?.id },
        now,
      );
      this.d.log.info({ event: "job_fetched", jobId: job.id, status: "needs_confirmation" });
    } catch (e) {
      await this.fail(job, "received", e);
    }
    return true;
  }

  /** Step 2 (stage 1 of drafting): extract structured visit facts once the patient is confirmed. */
  async extract(): Promise<boolean> {
    const now = this.d.clock.now();
    const job = await this.d.repos.jobs.claimNext(
      ["confirmed", "extracting"],
      "extracting",
      now,
      addMinutes(now, LEASE_MINUTES),
    );
    if (!job) return false;
    const started = Date.now();
    try {
      const rec = await this.d.pocket.getRecording(job.pocketRecordingId);
      if (!rec.transcript?.length) throw new TranscriptNotReadyError();
      const settings = await this.d.repos.settings.getSettings();
      const facts = await extractVisitFacts(this.d.llm, this.d.extractModel, rec.transcript, settings?.glossary ?? []);
      await this.d.repos.facts.save(job.id, facts, now);
      await this.d.repos.jobs.transition(
        job.id,
        "extracting",
        "facts_ready",
        { notBefore: undefined, lastError: undefined },
        now,
      );
      this.d.log.info({ event: "facts_ready", jobId: job.id, durationMs: Date.now() - started });
    } catch (e) {
      await this.fail(job, "confirmed", e);
    }
    return true;
  }

  /** Retry with backoff (1, 5, 15 minutes), then mark failed for a manual retry. */
  private async fail(job: Job, retryStatus: JobStatus, e: unknown) {
    const now = this.d.clock.now();
    const attempts = job.attempts + 1;
    const error = errorText(e);
    if (attempts < MAX_AUTOMATIC_ATTEMPTS) {
      const wait = RETRY_BACKOFF_MINUTES[attempts - 1] ?? RETRY_BACKOFF_MINUTES.at(-1)!;
      await this.d.repos.jobs.transition(job.id, job.status, retryStatus, {
        attempts,
        lastError: error,
        notBefore: addMinutes(now, wait).toISOString(),
      }, now);
      this.d.log.warn({ event: "job_retry", jobId: job.id, attempts, error });
    } else {
      await this.d.repos.jobs.transition(job.id, job.status, "failed", { attempts, lastError: error, notBefore: undefined }, now);
      this.d.log.error({ event: "job_failed", jobId: job.id, attempts, error });
      try {
        await (this.d.notifier ?? noopNotifier).jobFailed(job.id, attempts, error);
      } catch (notifyError) {
        this.d.log.error({ event: "alert_failed", jobId: job.id, error: errorText(notifyError) });
      }
    }
  }

  /** Daily: create jobs for any recording whose webhook never arrived. */
  async reconcile(lookbackHours = 36): Promise<number> {
    const now = this.d.clock.now();
    const ids = await this.d.pocket.listRecordingIdsSince(new Date(now.getTime() - lookbackHours * 3_600_000));
    let created = 0;
    for (const id of ids) if ((await this.d.repos.jobs.upsertByRecording(id, now)).created) created++;
    this.d.log.info({ event: "reconciled", count: created });
    return created;
  }
}
