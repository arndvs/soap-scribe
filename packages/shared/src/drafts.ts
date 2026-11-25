import { z } from "zod";
import { SoapSection } from "./settings.js";

/**
 * Where each sentence of a draft came from. The side panel renders each differently,
 * so the clinician can see at a glance what's new today. See ARCHITECTURE.md.
 */
export const SourceTag = z.enum(["today", "carried", "updated", "protocol"]);
export type SourceTag = z.infer<typeof SourceTag>;

export const DraftSentence = z
  .object({
    text: z.string().min(1),
    source: SourceTag,
    /** For carried/updated: the date of the note it came from (YYYY-MM-DD). */
    fromNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** For updated: the previous wording, shown on hover. */
    previousText: z.string().optional(),
    /** For protocol: the library item inserted verbatim. */
    protocolId: z.string().optional(),
    /** For protocol: first date she gave this item to this patient, when given before. */
    assignedSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** For today/updated: the transcript lines the sentence rests on. */
    evidence: z.array(z.string()).max(6).optional(),
  })
  .superRefine((s, ctx) => {
    if ((s.source === "carried" || s.source === "updated") && !s.fromNoteDate) {
      ctx.addIssue({ code: "custom", message: `${s.source} sentence needs fromNoteDate` });
    }
    if (s.source === "updated" && !s.previousText) {
      ctx.addIssue({ code: "custom", message: "updated sentence needs previousText" });
    }
    if (s.source === "protocol" && !s.protocolId) {
      ctx.addIssue({ code: "custom", message: "protocol sentence needs protocolId" });
    }
  });
export type DraftSentence = z.infer<typeof DraftSentence>;

export const DraftFlag = z.object({
  section: SoapSection,
  reason: z.string().min(1),
});
export type DraftFlag = z.infer<typeof DraftFlag>;

export const DraftSections = z.object({
  subjective: z.array(DraftSentence),
  objective: z.array(DraftSentence),
  assessment: z.array(DraftSentence),
  plan: z.array(DraftSentence),
});
export type DraftSections = z.infer<typeof DraftSections>;

/** What the compose model must return. Validated before anything reaches the clinician. */
export const ComposeOutput = z.object({
  sections: DraftSections,
  flags: z.array(DraftFlag),
});
export type ComposeOutput = z.infer<typeof ComposeOutput>;

export const DraftStatus = z.enum(["draft_ready", "inserted"]);

/** A library item given to this patient on an earlier visit (shown beside the draft). */
export const PriorAssignment = z.object({
  protocolId: z.string(),
  title: z.string(),
  phase: z.string().optional(),
  firstAssignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lastAssignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timesAssigned: z.number().int().positive(),
  /** True when today's draft already has it in Plan. */
  inToday: z.boolean(),
  /** The Plan line to add with one click: her library wording plus the "since" date. */
  planText: z.string(),
});
export type PriorAssignment = z.infer<typeof PriorAssignment>;

export const Draft = z.object({
  id: z.string(),
  jobId: z.string(),
  janePatientId: z.string(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  sections: DraftSections,
  flags: z.array(DraftFlag),
  /** Similarity to the previous note (0..1), for the clone reminder. */
  similarityToLast: z.number().min(0).max(1).optional(),
  /** Everything given before, oldest first (gap G-18). */
  priorAssignments: z.array(PriorAssignment).optional(),
  /** Drafted from previous notes only: no recording existed for the visit (gap G-23). */
  withoutRecording: z.boolean().optional(),
  status: DraftStatus,
  createdAt: z.string().datetime(),
  insertedAt: z.string().datetime().optional(),
});
export type Draft = z.infer<typeof Draft>;

/** A previous note, as read from the open Jane chart by the extension. */
export const PreviousNote = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sections: z.record(SoapSection, z.string()),
});
export type PreviousNote = z.infer<typeof PreviousNote>;

export function sectionText(sentences: readonly DraftSentence[]): string {
  return sentences.map((s) => s.text).join(" ");
}
