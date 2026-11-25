import type { Appointment, Draft, Job, PracticeSettings, ProtocolAssignment, ProtocolItem, Template, VisitFacts } from "../domain.js";
import { newId } from "../ids.js";
import type { AuditEvent, Repos } from "./types.js";

const clone = <T>(v: T): T => structuredClone(v);
const iso = (d: Date) => d.toISOString();

/** In-memory repositories: used by unit tests and local demos. Same contract as MongoDB. */
export function createMemoryRepos(): Repos {
  const jobs = new Map<string, Job>();
  const appts = new Map<string, Appointment>();
  const facts = new Map<string, { facts: VisitFacts; savedAt: Date }>();
  const drafts = new Map<string, Draft>();
  let settings: PracticeSettings | null = null;
  const templateVersions: Template[] = [];
  const protocols = new Map<string, ProtocolItem>();
  const assignments: ProtocolAssignment[] = [];
  const audit: AuditEvent[] = [];

  const ready = (j: Job, now: Date) => !j.notBefore || new Date(j.notBefore) <= now;

  return {
    jobs: {
      async upsertByRecording(pocketRecordingId, now) {
        const existing = [...jobs.values()].find((j) => j.pocketRecordingId === pocketRecordingId);
        if (existing) return { job: clone(existing), created: false };
        const job: Job = {
          id: newId(),
          pocketRecordingId,
          status: "received",
          attempts: 0,
          createdAt: iso(now),
          updatedAt: iso(now),
        };
        jobs.set(job.id, job);
        return { job: clone(job), created: true };
      },
      async createWithoutRecording(job) {
        const existing = [...jobs.values()].find((j) => j.pocketRecordingId === job.pocketRecordingId);
        if (existing) return clone(existing);
        jobs.set(job.id, clone(job));
        return clone(job);
      },
      async get(id) {
        const j = jobs.get(id);
        return j ? clone(j) : null;
      },
      async claimNext(statuses, to, now, leaseUntil) {
        const next = [...jobs.values()]
          .filter((j) => statuses.includes(j.status) && ready(j, now))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next) return null;
        next.status = to;
        next.notBefore = iso(leaseUntil);
        next.updatedAt = iso(now);
        return clone(next);
      },
      async transition(id, from, to, patch, now) {
        const j = jobs.get(id);
        if (!j || j.status !== from) return null;
        Object.assign(j, patch, { status: to, updatedAt: iso(now) });
        return clone(j);
      },
      async listSince(since) {
        return [...jobs.values()].filter((j) => new Date(j.createdAt) >= since).map(clone);
      },
      async findReadyForPatient(janePatientId) {
        const j = [...jobs.values()]
          .filter((x) => x.janePatientId === janePatientId && x.status === "facts_ready")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return j ? clone(j) : null;
      },
      async deleteOlderThan(before) {
        let n = 0;
        for (const [id, j] of jobs) if (new Date(j.createdAt) < before) (jobs.delete(id), n++);
        return n;
      },
    },
    appointments: {
      async replaceDay(date, list) {
        for (const [id, a] of appts) if (a.date === date) appts.delete(id);
        for (const a of list) appts.set(a.id, clone(a));
      },
      async listDay(date) {
        return [...appts.values()].filter((a) => a.date === date).sort((a, b) => a.start.localeCompare(b.start)).map(clone);
      },
      async get(id) {
        const a = appts.get(id);
        return a ? clone(a) : null;
      },
      async deleteBeforeDate(date) {
        let n = 0;
        for (const [id, a] of appts) if (a.date < date) (appts.delete(id), n++);
        return n;
      },
    },
    facts: {
      async save(jobId, f, now) {
        facts.set(jobId, { facts: clone(f), savedAt: now });
      },
      async get(jobId) {
        const f = facts.get(jobId);
        return f ? clone(f.facts) : null;
      },
      async delete(jobId) {
        facts.delete(jobId);
      },
      async deleteOlderThan(before) {
        let n = 0;
        for (const [id, f] of facts) if (f.savedAt < before) (facts.delete(id), n++);
        return n;
      },
    },
    drafts: {
      async saveForJob(draft) {
        for (const [id, d] of drafts) if (d.jobId === draft.jobId) drafts.delete(id);
        drafts.set(draft.id, clone(draft));
      },
      async get(id) {
        const d = drafts.get(id);
        return d ? clone(d) : null;
      },
      async findReadyForPatient(janePatientId) {
        const d = [...drafts.values()]
          .filter((x) => x.janePatientId === janePatientId && x.status === "draft_ready")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return d ? clone(d) : null;
      },
      async update(id, patch) {
        const d = drafts.get(id);
        if (!d) return null;
        Object.assign(d, patch);
        return clone(d);
      },
      async deleteInsertedBefore(before) {
        let n = 0;
        for (const [id, d] of drafts)
          if (d.status === "inserted" && d.insertedAt && new Date(d.insertedAt) < before) (drafts.delete(id), n++);
        return n;
      },
      async deleteUninsertedBefore(before) {
        let n = 0;
        for (const [id, d] of drafts)
          if (d.status !== "inserted" && new Date(d.createdAt) < before) (drafts.delete(id), n++);
        return n;
      },
    },
    settings: {
      async getSettings() {
        return settings ? clone(settings) : null;
      },
      async saveSettings(s) {
        settings = clone(s);
      },
      async getTemplate(id) {
        const latest = templateVersions.filter((t) => t.id === id).sort((a, b) => b.version - a.version)[0];
        return latest ? clone(latest) : null;
      },
      async saveTemplateVersion(t) {
        if (templateVersions.some((x) => x.id === t.id && x.version === t.version)) {
          throw new Error(`Template ${t.id} version ${t.version} already exists`);
        }
        templateVersions.push(clone(t));
      },
      async listTemplateVersions(id) {
        return templateVersions.filter((t) => t.id === id).sort((a, b) => b.version - a.version).map(clone);
      },
    },
    protocols: {
      async listActive() {
        return [...protocols.values()].filter((p) => p.active).map(clone);
      },
      async listAll() {
        return [...protocols.values()].sort((a, b) => a.title.localeCompare(b.title)).map(clone);
      },
      async get(id) {
        const p = protocols.get(id);
        return p ? clone(p) : null;
      },
      async upsert(item) {
        protocols.set(item.id, clone(item));
      },
      async recordAssignments(list) {
        assignments.push(...list.map(clone));
      },
      async listAssignments(janePatientId) {
        return assignments
          .filter((a) => a.janePatientId === janePatientId)
          .sort((a, b) => b.assignedOn.localeCompare(a.assignedOn))
          .map(clone);
      },
    },
    audit: {
      async append(e) {
        audit.push(clone(e));
      },
      async list(limit) {
        return audit.slice(-limit).reverse().map(clone);
      },
    },
  };
}
