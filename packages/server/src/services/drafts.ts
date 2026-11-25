import type { Draft, DraftSections, Job, PreviousNote, PriorAssignment, ProtocolAssignment, ProtocolItem, VisitFacts } from "../domain.js";
import type { Repos } from "../repos/types.js";
import type { LlmClient } from "../llm/client.js";
import { localDate, type Clock } from "../clock.js";
import { newId } from "../ids.js";
import { composeDraft } from "../pipeline/compose.js";
import { datedProtocolSentence, matchProtocols } from "../pipeline/protocols.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export interface DraftServiceDeps {
  repos: Repos;
  llm: LlmClient;
  clock: Clock;
  composeModel: string;
  timeZone: string;
}

export const NO_RECORDING = "none:";

export const EMPTY_FACTS: VisitFacts = {
  complaints: [],
  findings: [],
  treatments: [],
  painScores: [],
  recommendationMentions: [],
  planItems: [],
  recapFound: false,
};

function firstAssigned(history: readonly ProtocolAssignment[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const a of history) {
    const cur = first.get(a.protocolId);
    if (!cur || a.assignedOn < cur) first.set(a.protocolId, a.assignedOn);
  }
  return first;
}

/** One row per library item given before, oldest first, with the line to add in one click. */
function summarize(
  history: readonly ProtocolAssignment[],
  items: ReadonlyMap<string, ProtocolItem>,
  inToday: ReadonlySet<string>,
  format: "off" | "us" | "iso",
  visitDate: string,
): PriorAssignment[] {
  const rows = new Map<string, PriorAssignment>();
  for (const a of history) {
    const item = items.get(a.protocolId);
    if (!item) continue;
    const row = rows.get(a.protocolId);
    if (!row) {
      rows.set(a.protocolId, {
        protocolId: a.protocolId,
        title: item.title,
        ...(item.phase ? { phase: item.phase } : {}),
        firstAssignedOn: a.assignedOn,
        lastAssignedOn: a.assignedOn,
        timesAssigned: 1,
        inToday: inToday.has(a.protocolId),
        planText: "",
      });
    } else {
      if (a.assignedOn < row.firstAssignedOn) row.firstAssignedOn = a.assignedOn;
      if (a.assignedOn > row.lastAssignedOn) row.lastAssignedOn = a.assignedOn;
      row.timesAssigned++;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, planText: datedProtocolSentence(items.get(r.protocolId)!, { format, givenOn: visitDate, since: r.firstAssignedOn }) }))
    .sort((a, b) => a.firstAssignedOn.localeCompare(b.firstAssignedOn));
}

export function createDraftService(d: DraftServiceDeps) {
  /** Today's visit had no recording: a job with no facts, so the draft is previous notes only. */
  async function jobWithoutRecording(janePatientId: string, now: Date): Promise<Job> {
    const existing = await d.repos.jobs.findReadyForPatient(janePatientId);
    if (existing) return existing; // a recording did arrive: use it
    const today = localDate(now, d.timeZone);
    const appointment = (await d.repos.appointments.listDay(today)).find((a) => a.janePatientId === janePatientId);
    return d.repos.jobs.createWithoutRecording({
      id: newId(),
      pocketRecordingId: `${NO_RECORDING}${janePatientId}:${today}`,
      status: "facts_ready",
      recordedAt: appointment?.start ?? now.toISOString(),
      ...(appointment ? { appointmentId: appointment.id } : {}),
      janePatientId,
      attempts: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return {
    /**
     * Stage 2: called when the clinician opens a patient's chart. Uses today's extracted
     * facts plus the previous notes the extension read from the page (not stored).
     * Returns null when there is no confirmed visit ready for this patient.
     */
    async compose(
      janePatientId: string,
      previousNotes: PreviousNote[],
      previousNotesUnavailable: boolean,
      withoutRecording = false,
    ): Promise<Draft | null> {
      const now = d.clock.now();
      const job = withoutRecording
        ? await jobWithoutRecording(janePatientId, now)
        : await d.repos.jobs.findReadyForPatient(janePatientId);
      if (!job) return null;
      const isUnrecorded = job.pocketRecordingId.startsWith(NO_RECORDING);
      const facts = isUnrecorded ? EMPTY_FACTS : await d.repos.facts.get(job.id);
      if (!facts) throw new ConflictError("visit facts are missing; retry the job");
      if (isUnrecorded && previousNotes.length === 0) {
        throw new ConflictError("there is no recording and no previous note to draft from");
      }
      const settings = await d.repos.settings.getSettings();
      if (!settings) throw new ConflictError("practice settings have not been set up");
      const template = await d.repos.settings.getTemplate(settings.activeTemplateId);
      if (!template) throw new ConflictError("active template not found");

      const visitDate = localDate(job.recordedAt ? new Date(job.recordedAt) : now, d.timeZone);
      const library = await d.repos.protocols.listActive();
      const notes = [...previousNotes]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, settings.previousNotesToRead);
      // Earlier visits only: an assignment from today's own (re)draft doesn't count as "before".
      const history = (await d.repos.protocols.listAssignments(janePatientId)).filter((a) => a.assignedOn < visitDate);
      const first = firstAssigned(history);
      const planDateFormat = settings.planDateFormat ?? "us";

      const composed = await composeDraft(d.llm, d.composeModel, {
        facts,
        template,
        previousNotes: notes,
        protocols: matchProtocols(facts.recommendationMentions, library),
        visitDate,
        planDateFormat,
        firstAssignedOn: first,
      });
      if (previousNotesUnavailable) {
        composed.flags.push({ section: "subjective", reason: "Previous notes could not be read from the chart" });
      }
      if (isUnrecorded) {
        composed.flags = composed.flags.filter((f) => !f.reason.startsWith("No spoken recap"));
        composed.flags.unshift({
          section: "subjective",
          reason: `No recording for this visit: everything here is carried from ${notes[0]?.date ?? "the last note"}. Add what was different today.`,
        });
      }

      const inToday = new Set(composed.sections.plan.flatMap((s) => (s.protocolId ? [s.protocolId] : [])));
      const allItems = new Map((await d.repos.protocols.listAll()).map((i) => [i.id, i]));
      const priorAssignments = summarize(history, allItems, inToday, planDateFormat, visitDate);

      const draft: Draft = {
        id: newId(),
        jobId: job.id,
        janePatientId,
        templateId: template.id,
        templateVersion: template.version,
        sections: composed.sections,
        flags: composed.flags,
        ...(composed.similarityToLast !== undefined ? { similarityToLast: composed.similarityToLast } : {}),
        ...(priorAssignments.length ? { priorAssignments } : {}),
        ...(isUnrecorded ? { withoutRecording: true } : {}),
        status: "draft_ready",
        createdAt: now.toISOString(),
      };
      await d.repos.drafts.saveForJob(draft);
      await d.repos.audit.append({ at: now, actor: "system", action: "draft_composed", draftId: draft.id, jobId: job.id, janePatientId });
      return draft;
    },

    async get(janePatientId: string): Promise<Draft | null> {
      const draft = await d.repos.drafts.findReadyForPatient(janePatientId);
      if (draft) {
        await d.repos.audit.append({ at: d.clock.now(), actor: "clinician", action: "draft_viewed", draftId: draft.id, janePatientId });
      }
      return draft;
    },

    async edit(id: string, sections: DraftSections): Promise<Draft> {
      const draft = await d.repos.drafts.get(id);
      if (!draft) throw new NotFoundError("draft not found");
      if (draft.status === "inserted") throw new ConflictError("draft was already inserted");
      const updated = await d.repos.drafts.update(id, { sections });
      await d.repos.audit.append({ at: d.clock.now(), actor: "clinician", action: "draft_edited", draftId: id, janePatientId: draft.janePatientId });
      return updated!;
    },

    /**
     * Called by the extension only after its own patient check and read-back passed.
     * The server checks the patient again, records protocol assignments and audits it.
     */
    async markInserted(id: string, janePatientIdOnPage: string): Promise<Draft> {
      const draft = await d.repos.drafts.get(id);
      if (!draft) throw new NotFoundError("draft not found");
      if (draft.janePatientId !== janePatientIdOnPage) throw new ConflictError("patient on the page does not match the draft");
      if (draft.status === "inserted") return draft;

      const now = d.clock.now();
      const job = await d.repos.jobs.get(draft.jobId);
      const assignedOn = localDate(job?.recordedAt ? new Date(job.recordedAt) : now, d.timeZone);
      const assignments: ProtocolAssignment[] = draft.sections.plan
        .filter((s) => s.source === "protocol" && s.protocolId)
        .map((s) => ({ id: newId(), janePatientId: draft.janePatientId, protocolId: s.protocolId!, assignedOn, draftId: draft.id }));
      await d.repos.protocols.recordAssignments(assignments);

      const updated = await d.repos.drafts.update(id, { status: "inserted", insertedAt: now.toISOString() });
      await d.repos.jobs.transition(draft.jobId, "facts_ready", "inserted", {}, now);
      await d.repos.facts.delete(draft.jobId); // no-op for a visit without a recording
      await d.repos.audit.append({ at: now, actor: "clinician", action: "draft_inserted", draftId: id, jobId: draft.jobId, janePatientId: draft.janePatientId });
      return updated!;
    },
  };
}

export type DraftService = ReturnType<typeof createDraftService>;
