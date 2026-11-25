import { z } from "zod";

/** One job per recording. See ARCHITECTURE.md §3. */
export const JOB_STATUSES = [
  "received",
  "fetched",
  "needs_confirmation",
  "confirmed",
  "extracting",
  "facts_ready",
  "inserted",
  "failed",
] as const;

export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

/**
 * Statuses the worker claims with a lease. If a worker crashes mid-job the lease
 * (stored in notBefore) expires and the job is claimed again, so every step must be
 * safe to run twice.
 */
export const LEASE_MINUTES = 10;

/**
 * Allowed transitions. Stage 1 (extract visit facts) runs in the background after the
 * clinician confirms the patient; stage 2 (compose the note) runs on demand when she
 * opens the chart, so there is no job status for it.
 */
export const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  received: ["fetched", "failed"],
  fetched: ["needs_confirmation", "failed"],
  needs_confirmation: ["confirmed"],
  confirmed: ["extracting"],
  extracting: ["facts_ready", "confirmed", "failed"],
  facts_ready: ["inserted", "needs_confirmation"],
  inserted: [],
  failed: ["received", "confirmed"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`Job cannot move from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const Job = z.object({
  id: z.string(),
  pocketRecordingId: z.string(),
  status: JobStatus,
  recordedAt: z.string().datetime().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  /** Suggested by the matcher; set for real once the clinician confirms. */
  suggestedAppointmentId: z.string().optional(),
  appointmentId: z.string().optional(),
  janePatientId: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  /** Earliest time the worker may pick this job up again (for backoff). */
  notBefore: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Job = z.infer<typeof Job>;

/** Backoff after each failed attempt: 1, 5, then 15 minutes. */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15] as const;
export const MAX_AUTOMATIC_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;
