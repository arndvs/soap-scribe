import { z } from "zod";

export const Appointment = z.object({
  id: z.string(),
  /** Practice-local date, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().datetime(),
  end: z.string().datetime(),
  janePatientId: z.string().min(1),
  patientDisplayName: z.string().min(1),
});
export type Appointment = z.infer<typeof Appointment>;

/** A transcript line from Pocket, with speaker label when Pocket provides one. */
export const TranscriptSegment = z.object({
  index: z.number().int().nonnegative(),
  speaker: z.string().optional(),
  startSeconds: z.number().nonnegative().optional(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

/** Every fact points at the transcript lines it came from. */
const Sourced = {
  sourceSegments: z.array(z.number().int().nonnegative()).min(1),
  /**
   * The cited transcript lines, copied in by code after extraction (never by the model),
   * so the clinician can check a sentence against what was said. Deleted with the facts.
   */
  evidence: z.array(z.string()).optional(),
};

/** Stage 1 output: structured facts from today's visit only. */
export const VisitFacts = z.object({
  complaints: z.array(z.object({ text: z.string(), ...Sourced })),
  findings: z.array(
    z.object({
      kind: z.enum(["segment", "rom", "palpation", "orthopedic", "neurological", "posture", "other"]),
      text: z.string(),
      ...Sourced,
    }),
  ),
  treatments: z.array(z.object({ text: z.string(), ...Sourced })),
  painScores: z.array(
    z.object({ region: z.string(), score: z.number().min(0).max(10), ...Sourced }),
  ),
  /** Recommendations as said aloud; matched to the protocol library afterwards. */
  recommendationMentions: z.array(z.object({ text: z.string(), ...Sourced })),
  planItems: z.array(z.object({ text: z.string(), ...Sourced })),
  /** True when the end-of-visit spoken recap was found. */
  recapFound: z.boolean(),
});
export type VisitFacts = z.infer<typeof VisitFacts>;
