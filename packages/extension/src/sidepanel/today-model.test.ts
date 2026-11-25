import { describe, expect, it } from "vitest";
import type { Appointment, TodayItem } from "@soap-scribe/shared";
import { arrangeToday } from "./today-model.js";

const appt = (id: string, start: string, name: string): Appointment => ({
  id,
  date: "2026-12-01",
  start,
  end: start,
  janePatientId: id.replace("a", "p"),
  patientDisplayName: name,
});
const A = appt("a1", "2026-12-01T17:00:00.000Z", "Ann");
const B = appt("a2", "2026-12-01T17:30:00.000Z", "Ben");
const C = appt("a3", "2026-12-01T18:00:00.000Z", "Cal");

describe("Today, appointment first (G-23)", () => {
  it("shows every visit, including ones with no recording, and counts notes left", () => {
    const items: TodayItem[] = [
      { jobId: "j1", status: "inserted", confirmedAppointment: A },
      { jobId: "j2", status: "needs_confirmation", suggestedAppointment: B },
      { jobId: "j3", status: "needs_confirmation" }, // no suggestion: recorder clock off, say
    ];
    const m = arrangeToday({ appointments: [C, A, B], items });
    expect(m.rows.map((r) => [r.appointment.patientDisplayName, r.item?.jobId])).toEqual([
      ["Ann", "j1"],
      ["Ben", "j2"],
      ["Cal", undefined],
    ]);
    expect(m.unmatched.map((i) => i.jobId)).toEqual(["j3"]);
    expect(m.done).toBe(1);
  });

  it("puts a confirmed recording on its appointment even if another was suggested there", () => {
    const items: TodayItem[] = [
      { jobId: "j1", status: "needs_confirmation", suggestedAppointment: A },
      { jobId: "j2", status: "facts_ready", confirmedAppointment: A },
    ];
    const m = arrangeToday({ appointments: [A], items });
    expect(m.rows[0]!.item?.jobId).toBe("j2");
    expect(m.unmatched.map((i) => i.jobId)).toEqual(["j1"]);
  });
});
