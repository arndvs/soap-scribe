import { z } from "zod";
import { PreviousNote, SoapSection, TranscriptSegment } from "../domain.js";

/**
 * One test visit. Public cases in eval-cases/ are synthetic. Her role-played visits and
 * ideal notes live outside the repo and are loaded with EVAL_CASES_DIR.
 */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EvalCase = z.object({
  id: z.string(),
  description: z.string(),
  /** Empty only when the visit wasn't recorded (withoutRecording). */
  transcript: z.array(TranscriptSegment).default([]),
  previousNotes: z.array(PreviousNote).default([]),
  /** The visit wasn't recorded: the draft comes from previous notes only (G-23). */
  withoutRecording: z.boolean().default(false),
  /** Library items this patient was given on earlier visits: protocolId → first date (G-18). */
  assignedBefore: z.record(z.string(), IsoDate).default({}),
  expected: z.object({
    /** Phrases that must appear in a section (case-insensitive). Missing ones are reported. */
    mustInclude: z.record(SoapSection, z.array(z.string())).default({}),
    /** Phrases that must not appear anywhere: things a careless model might add. */
    mustNotInclude: z.array(z.string()).default([]),
    /** Spinal levels today's note must name, e.g. ["L5", "SI"]. */
    spinalLevels: z.array(z.string()).default([]),
    /** Library items the Plan should contain. */
    protocols: z.array(z.string()).default([]),
    /** Repeats: protocolId → the "since" date its Plan line must carry. Others must say "given" (G-17). */
    protocolsSince: z.record(z.string(), IsoDate).default({}),
    /** No sentence may be new today or updated: nothing was recorded (G-23). */
    onlyCarried: z.boolean().default(false),
    /** A sentence containing `sentence` must cite a transcript line containing `quote` (G-19). */
    evidence: z.array(z.object({ sentence: z.string(), quote: z.string() })).default([]),
  }),
}).refine((c) => c.withoutRecording || c.transcript.length > 0, { message: "transcript is required unless withoutRecording" });
export type EvalCase = z.infer<typeof EvalCase>;
