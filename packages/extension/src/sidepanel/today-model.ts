import type { Appointment, TodayItem, TodayResponse } from "@soap-scribe/shared";

export interface TodayRow {
  appointment: Appointment;
  /** The recording for this visit, or none (gap G-23: a visit with no recording is visible). */
  item?: TodayItem;
}

export interface TodayModel {
  rows: TodayRow[];
  /** Recordings not yet tied to any appointment on the schedule. */
  unmatched: TodayItem[];
  done: number;
}

/**
 * Appointment-first view of the day: one row per scheduled visit, so she can see which
 * notes are left, including visits that were never recorded. A recording belongs to an
 * appointment once confirmed; before that, to the one it's suggested for.
 */
export function arrangeToday(data: TodayResponse): TodayModel {
  const used = new Set<string>();
  const appointments = [...data.appointments].sort((a, b) => a.start.localeCompare(b.start));
  const rows: TodayRow[] = appointments.map((appointment) => {
    const confirmed = data.items.find((i) => !used.has(i.jobId) && i.confirmedAppointment?.id === appointment.id);
    const suggested = data.items.find(
      (i) => !used.has(i.jobId) && !i.confirmedAppointment && i.suggestedAppointment?.id === appointment.id,
    );
    const item = confirmed ?? suggested;
    if (item) used.add(item.jobId);
    return item ? { appointment, item } : { appointment };
  });
  const unmatched = data.items.filter((i) => !used.has(i.jobId));
  const done = rows.filter((r) => r.item?.status === "inserted").length;
  return { rows, unmatched, done };
}
