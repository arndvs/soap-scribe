import { z } from "zod";
import { PreviousNote, SoapSection, TranscriptSegment } from "../domain.js";

/**
 * One test visit. Public cases in eval-cases/ are synthetic. Her role-played visits and
 * ideal notes live outside the repo and are loaded with EVAL_CASES_DIR.
 */
export const EvalCase = z.object({
  id: z.string(),
  description: z.string(),
  transcript: z.array(TranscriptSegment).min(1),
  previousNotes: z.array(PreviousNote).default([]),
  expected: z.object({
    /** Phrases that must appear in a section (case-insensitive). Missing ones are reported. */
    mustInclude: z.record(SoapSection, z.array(z.string())).default({}),
    /** Phrases that must not appear anywhere: things a careless model might add. */
    mustNotInclude: z.array(z.string()).default([]),
    /** Spinal levels today's note must name, e.g. ["L5", "SI"]. */
    spinalLevels: z.array(z.string()).default([]),
    /** Library items the Plan should contain. */
    protocols: z.array(z.string()).default([]),
  }),
});
export type EvalCase = z.infer<typeof EvalCase>;
