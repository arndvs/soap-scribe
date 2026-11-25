import type { Draft, DraftSections, PreviousNote, ProtocolAssignment } from "../domain.js";
import type { Repos } from "../repos/types.js";
import type { LlmClient } from "../llm/client.js";
import { localDate, type Clock } from "../clock.js";
import { newId } from "../ids.js";
import { composeDraft } from "../pipeline/compose.js";
import { matchProtocols } from "../pipeline/protocols.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export interface DraftServiceDeps {
  repos: Repos;
  llm: LlmClient;
  clock: Clock;
  composeModel: string;
  timeZone: string;
}

export function createDraftService(d: DraftServiceDeps) {
  return {
    /**
     * Stage 2: called when the clinician opens a patient's chart. Uses today's extracted
     * facts plus the previous notes the extension read from the page (not stored).
     * Returns null when there is no confirmed visit ready for this patient.
     */
    async compose(janePatientId: string, previousNotes: PreviousNote[], previousNotesUnavailable: boolean): Promise<Draft | null> {
      const job = await d.repos.jobs.findReadyForPatient(janePatientId);
      if (!job) return null;
      const facts = await d.repos.facts.get(job.id);
      if (!facts) throw new ConflictError("visit facts are missing; retry the job");
      const settings = await d.repos.settings.getSettings();
      if (!settings) throw new ConflictError("practice settings have not been set up");
      const template = await d.repos.settings.getTemplate(settings.activeTemplateId);
      if (!template) throw new ConflictError("active template not found");

      const now = d.clock.now();
      const visitDate = localDate(job.recordedAt ? new Date(job.recordedAt) : now, d.timeZone);
      const library = await d.repos.protocols.listActive();
      const notes = [...previousNotes]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, settings.previousNotesToRead);

      const composed = await composeDraft(d.llm, d.composeModel, {
        facts,
        template,
        previousNotes: notes,
        protocols: matchProtocols(facts.recommendationMentions, library),
        visitDate,
      });
      if (previousNotesUnavailable) {
        composed.flags.push({ section: "subjective", reason: "Previous notes could not be read from the chart" });
      }

      const draft: Draft = {
        id: newId(),
        jobId: job.id,
        janePatientId,
        templateId: template.id,
        templateVersion: template.version,
        sections: composed.sections,
        flags: composed.flags,
        ...(composed.similarityToLast !== undefined ? { similarityToLast: composed.similarityToLast } : {}),
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
      await d.repos.facts.delete(draft.jobId);
      await d.repos.audit.append({ at: now, actor: "clinician", action: "draft_inserted", draftId: id, jobId: draft.jobId, janePatientId: draft.janePatientId });
      return updated!;
    },
  };
}

export type DraftService = ReturnType<typeof createDraftService>;
