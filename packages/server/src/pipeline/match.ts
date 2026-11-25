import type { Appointment } from "../domain.js";

/** Recordings often start a little before or after the booked time. */
export const MATCH_SLACK_MINUTES = 15;

/**
 * Suggests the appointment a recording belongs to: the one whose time window (with
 * slack) contains the recording start, closest start first. Returns undefined when
 * none fits; the clinician always confirms, so a wrong suggestion costs one tap.
 */
export function suggestAppointment(recordedAt: Date, appointments: readonly Appointment[]): Appointment | undefined {
  const slack = MATCH_SLACK_MINUTES * 60_000;
  const t = recordedAt.getTime();
  return appointments
    .filter((a) => t >= new Date(a.start).getTime() - slack && t <= new Date(a.end).getTime() + slack)
    .sort((a, b) => Math.abs(new Date(a.start).getTime() - t) - Math.abs(new Date(b.start).getTime() - t))[0];
}
