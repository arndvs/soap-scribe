import type { Repos } from "../repos/types.js";
import { localDate } from "../clock.js";

export interface RetentionPolicy {
  draftTtlHours: number;
  uninsertedDraftDays: number;
  factsDays: number;
  appointmentDays: number;
  jobDays: number;
}

export const defaultRetention = (draftTtlHours: number): RetentionPolicy => ({
  draftTtlHours,
  uninsertedDraftDays: 7,
  factsDays: 7,
  appointmentDays: 7,
  jobDays: 30,
});

/**
 * Deletes patient data on schedule. This job is the retention mechanism (it works on
 * MongoDB and Postgres alike); MongoDB TTL indexes are only a backstop.
 */
export async function runCleanup(repos: Repos, now: Date, policy: RetentionPolicy, timeZone: string) {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const day = 24 * 3_600_000;
  const result = {
    insertedDrafts: await repos.drafts.deleteInsertedBefore(ago(policy.draftTtlHours * 3_600_000)),
    uninsertedDrafts: await repos.drafts.deleteUninsertedBefore(ago(policy.uninsertedDraftDays * day)),
    facts: await repos.facts.deleteOlderThan(ago(policy.factsDays * day)),
    appointments: await repos.appointments.deleteBeforeDate(localDate(ago(policy.appointmentDays * day), timeZone)),
    jobs: await repos.jobs.deleteOlderThan(ago(policy.jobDays * day)),
  };
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (total > 0) await repos.audit.append({ at: now, actor: "system", action: "data_deleted" });
  return result;
}
