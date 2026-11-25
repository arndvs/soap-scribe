import type { PreviousNote, SoapSection } from "@soap-scribe/shared";
import type { InsertResult, JanePage, ScheduleRow } from "./content/jane.js";

/** Messages from the side panel to the content script on the active Jane tab. */
export type ContentRequest =
  | { type: "page" }
  | { type: "readSchedule" }
  | { type: "readChart"; limit: number }
  | { type: "insert"; expectedPatientId: string; text: Record<SoapSection, string> };

export interface ContentResponses {
  page: JanePage;
  readSchedule: ScheduleRow[];
  readChart: { patientId: string | null; previousNotes: PreviousNote[] | null };
  insert: InsertResult;
}

export type ResponseFor<R extends ContentRequest> = ContentResponses[R["type"]];
