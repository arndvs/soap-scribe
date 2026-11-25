import { z } from "zod";
import { Appointment } from "./visit.js";
import { PreviousNote, DraftSections, Draft } from "./drafts.js";
import { JobStatus } from "./jobs.js";

/** POST /appointments/sync: what the content script read from Jane's day schedule. */
export const AppointmentSyncRequest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointments: z.array(Appointment.omit({ id: true, date: true })),
});
export type AppointmentSyncRequest = z.infer<typeof AppointmentSyncRequest>;

/** GET /today: one row per recording. */
export const TodayItem = z.object({
  jobId: z.string(),
  status: JobStatus,
  recordedAt: z.string().datetime().optional(),
  suggestedAppointment: Appointment.optional(),
  confirmedAppointment: Appointment.optional(),
  lastError: z.string().optional(),
});
export type TodayItem = z.infer<typeof TodayItem>;

export const TodayResponse = z.object({
  items: z.array(TodayItem),
  appointments: z.array(Appointment),
});
export type TodayResponse = z.infer<typeof TodayResponse>;

/** POST /jobs/:id/confirm */
export const ConfirmRequest = z.object({ appointmentId: z.string().min(1) });

/** POST /drafts/compose: sent when the clinician opens a chart. */
export const ComposeRequest = z.object({
  janePatientId: z.string().min(1),
  previousNotes: z.array(PreviousNote).max(5),
  /** Set when the content script could not read the notes list. */
  previousNotesUnavailable: z.boolean().default(false),
  /** No recording exists for today's visit: draft from previous notes only (gap G-23). */
  withoutRecording: z.boolean().default(false),
});
export type ComposeRequest = z.infer<typeof ComposeRequest>;

/** PUT /drafts/:id */
export const DraftEditRequest = z.object({ sections: DraftSections });

/** POST /drafts/:id/inserted: only after the extension verified the read-back. */
export const InsertedRequest = z.object({
  janePatientIdOnPage: z.string().min(1),
  readBackMatched: z.literal(true),
});

export const DraftResponse = z.object({ draft: Draft.nullable() });
export type DraftResponse = z.infer<typeof DraftResponse>;
