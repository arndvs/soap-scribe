import { z } from "zod";

export const SOAP_SECTIONS = ["subjective", "objective", "assessment", "plan"] as const;
export const SoapSection = z.enum(SOAP_SECTIONS);
export type SoapSection = z.infer<typeof SoapSection>;

/**
 * Per-section carry-forward rule, set by the clinician in Settings.
 * - carry: start from the last note's text; today's facts are added or update it
 * - carry_unless_contradicted: carry, but drop a carried line that today's facts contradict
 * - today_only: only what today's visit stated
 */
export const CarryRule = z.enum(["carry", "carry_unless_contradicted", "today_only"]);
export type CarryRule = z.infer<typeof CarryRule>;

export const TemplateSection = z.object({
  key: SoapSection,
  label: z.string().min(1),
  required: z.boolean(),
  /** Free-text guidance for the model: format, order, what belongs here. */
  guidance: z.string(),
  carryRule: CarryRule,
});
export type TemplateSection = z.infer<typeof TemplateSection>;

export const Template = z.object({
  id: z.string(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  sections: z.array(TemplateSection).length(4),
  styleNotes: z.string(),
  /** De-identified example notes, used as style references only. */
  examples: z.array(z.record(SoapSection, z.string())).max(10),
  updatedAt: z.string().datetime(),
});
export type Template = z.infer<typeof Template>;

export const GlossaryEntry = z.object({ term: z.string().min(1), meaning: z.string().min(1) });
export type GlossaryEntry = z.infer<typeof GlossaryEntry>;

export const PracticeSettings = z.object({
  activeTemplateId: z.string(),
  /** Her shorthand and abbreviations, e.g. "div" -> "Diversified technique". */
  glossary: z.array(GlossaryEntry),
  /** How many previous notes the extension reads from the chart (minimum necessary). */
  previousNotesToRead: z.number().int().min(0).max(5),
  /** Show the "almost identical to last note" reminder above this similarity (0..1). */
  cloneWarningThreshold: z.number().min(0).max(1),
  /**
   * How protocol lines in Plan are dated, the way she dates "clinical advice" by hand
   * (gap G-17). Unset means "us" (11/24/26). Confirm her format in session 1.
   */
  planDateFormat: z.enum(["off", "us", "iso"]).optional(),
  updatedAt: z.string().datetime(),
});
export type PracticeSettings = z.infer<typeof PracticeSettings>;

export const ProtocolCategory = z.enum(["home_exercise", "daily_living", "nutrition", "other"]);

export const ProtocolItem = z.object({
  id: z.string(),
  title: z.string().min(1),
  /** Her exact wording. Inserted verbatim; the model never rewrites it. */
  instruction: z.string().min(1),
  category: ProtocolCategory,
  frequency: z.string().optional(),
  contraindications: z.string().optional(),
  /** Care phase she uses it in, e.g. "Foundational", "Corrective" (gap G-24). */
  phase: z.string().max(40).optional(),
  /** Other phrases she uses for this item, to help matching. */
  aliases: z.array(z.string()),
  active: z.boolean(),
});
export type ProtocolItem = z.infer<typeof ProtocolItem>;

export const ProtocolAssignment = z.object({
  id: z.string(),
  janePatientId: z.string(),
  protocolId: z.string(),
  assignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  draftId: z.string(),
});
export type ProtocolAssignment = z.infer<typeof ProtocolAssignment>;
