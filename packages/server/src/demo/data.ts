import type { PreviousNote, ProtocolItem, Template, TranscriptSegment } from "../domain.js";
import { addMinutes, localDate } from "../clock.js";

/**
 * Synthetic demo practice: three made-up patients, their previous notes and today's
 * recorded visits. No real patient data, ever. Dates are relative to "now" so the demo
 * works on any day.
 */

export interface DemoPatient {
  janePatientId: string;
  name: string;
  /** Minutes before now that today's appointment started. */
  appointmentMinutesAgo: number;
  /** Previous notes, by how many days ago they were written. */
  previous: Array<{ daysAgo: number; sections: PreviousNote["sections"] }>;
  transcript: Array<Omit<TranscriptSegment, "index">>;
}

const C = "Clinician";
const P = "Patient";

export const DEMO_PATIENTS: DemoPatient[] = [
  {
    janePatientId: "1001",
    name: "Maria Lopez",
    appointmentMinutesAgo: 95,
    previous: [
      {
        daysAgo: 14,
        sections: {
          subjective: "Low back 6/10, worse at night. 30 weeks pregnant.",
          objective: "L5 left posterior. Right SI fixation. Lumbar flexion limited.",
          assessment: "Lumbar segmental dysfunction, pregnancy related.",
          plan: "Weekly visits. Cat-cow T/S mobilization on hands and knees, slow and pain-free, 10 reps (2x/day)",
        },
      },
      {
        daysAgo: 7,
        sections: {
          subjective: "Low back 5/10, worse at night. 31 weeks pregnant.",
          objective: "L5 left posterior. Right SI fixation. Lumbar flexion limited.",
          assessment: "Lumbar segmental dysfunction, pregnancy related, improving.",
          plan: "Weekly visits.",
        },
      },
    ],
    transcript: [
      { speaker: C, text: "How has your low back been this week?" },
      { speaker: P, text: "Better. About a three out of ten. Sleeping on my side is still hard." },
      { speaker: C, text: "Let's try a wedge pillow under the belly when you're side lying." },
      { speaker: C, text: "And keep doing the cat-cow twice a day." },
      { speaker: C, text: "Recap: L5 left posterior. Right SI fixation. Webster technique. Lumbar flexion improved. Low back three of ten. Continue weekly." },
    ],
  },
  {
    janePatientId: "1002",
    name: "James Carter",
    appointmentMinutesAgo: 65,
    previous: [
      {
        daysAgo: 7,
        sections: {
          subjective: "Neck 2/10.",
          objective: "C5 right posterior. Cervical rotation limited to the left. Diversified.",
          assessment: "Cervical segmental dysfunction, stable.",
          plan: "Every two weeks.",
        },
      },
    ],
    transcript: [
      { speaker: C, text: "Anything new with the neck?" },
      { speaker: P, text: "Same as last time. Stiff, about a two out of ten." },
      { speaker: C, text: "Recap: C5 right posterior. Diversified. Cervical rotation limited to the left. Neck two of ten. Every two weeks." },
    ],
  },
  {
    janePatientId: "1003",
    name: "Priya Shah",
    appointmentMinutesAgo: 35,
    previous: [
      {
        daysAgo: 21,
        sections: {
          subjective: "Mid back 4/10 after long drives.",
          objective: "T6 left posterior.",
          assessment: "Thoracic segmental dysfunction.",
          plan: "As needed.",
        },
      },
    ],
    transcript: [
      { speaker: P, text: "My mid back is fine now, but I've had headaches since Monday." },
      { speaker: P, text: "Neck is about a four out of ten." },
      { speaker: C, text: "Recap: C1 right lateral. Activator. Cervical extension limited. Neck four of ten. Return next week." },
    ],
  },
];

export const DEMO_TEMPLATE: Template = {
  id: "demo-template",
  name: "Daily visit (demo)",
  version: 1,
  sections: [
    { key: "subjective", label: "Subjective", required: true, guidance: "Patient report and pain scores.", carryRule: "carry_unless_contradicted" },
    { key: "objective", label: "Objective", required: true, guidance: "Segments, ROM, technique.", carryRule: "carry_unless_contradicted" },
    { key: "assessment", label: "Assessment", required: true, guidance: "Diagnosis and progress.", carryRule: "carry" },
    { key: "plan", label: "Plan", required: true, guidance: "Visit frequency and next steps.", carryRule: "carry_unless_contradicted" },
  ],
  styleNotes: "Short clauses. Spinal levels in capitals.",
  examples: [],
  updatedAt: new Date(0).toISOString(),
};

export const DEMO_PROTOCOLS: ProtocolItem[] = [
  {
    id: "cat-cow",
    title: "Cat-cow",
    instruction: "Cat-cow T/S mobilization on hands and knees, slow and pain-free, 10 reps",
    category: "home_exercise",
    frequency: "2x/day",
    aliases: ["cat cow", "cat-cow twice a day"],
    active: true,
  },
  {
    id: "wedge",
    title: "Belly wedge pillow",
    instruction: "Place a wedge under the belly when side-lying to support the lumbar spine",
    category: "daily_living",
    aliases: ["wedge pillow under the belly", "wedge pillow"],
    active: true,
  },
  {
    id: "lumbar-pillow",
    title: "Lumbar pillow",
    instruction: "Use a lumbar pillow when sitting for more than 20 minutes",
    category: "daily_living",
    aliases: ["lumbar pillow"],
    active: true,
  },
];

export function appointmentWindow(p: DemoPatient, now: Date) {
  const start = addMinutes(now, -p.appointmentMinutesAgo);
  start.setUTCSeconds(0, 0);
  return { start, end: addMinutes(start, 30) };
}

export function previousNotesFor(p: DemoPatient, now: Date, timeZone: string): PreviousNote[] {
  return p.previous
    .map((n) => ({ date: localDate(addMinutes(now, -n.daysAgo * 24 * 60), timeZone), sections: n.sections }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
