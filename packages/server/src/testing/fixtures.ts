// Synthetic data only. No real patient, practice, or note appears anywhere in this repo.
import type { Appointment, PracticeSettings, ProtocolItem, Template, TranscriptSegment, VisitFacts, ComposeOutput } from "../domain.js";

export const T0 = new Date("2026-12-01T18:30:00.000Z"); // 10:30 Pacific

export const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: "appt-1",
  date: "2026-12-01",
  start: "2026-12-01T18:30:00.000Z",
  end: "2026-12-01T18:45:00.000Z",
  janePatientId: "1001",
  patientDisplayName: "Test Patient A",
  ...over,
});

export const transcript: TranscriptSegment[] = [
  { index: 0, speaker: "Clinician", text: "How has the low back been since last week?" },
  { index: 1, speaker: "Patient", text: "Better. Maybe a three out of ten, mostly in the morning." },
  { index: 2, speaker: "Clinician", text: "Keep doing the cat-cow twice a day, and add the side-lying wedge pillow." },
  { index: 3, speaker: "Clinician", text: "Recap: L5 left posterior, SI right, diversified. Lumbar flexion improved. Low back 3 of 10. Continue weekly." },
];

export const facts: VisitFacts = {
  complaints: [{ text: "Low back pain improved, mostly mornings", sourceSegments: [1] }],
  findings: [
    { kind: "segment", text: "L5 left posterior", sourceSegments: [3] },
    { kind: "segment", text: "Right SI", sourceSegments: [3] },
    { kind: "rom", text: "Lumbar flexion improved", sourceSegments: [3] },
  ],
  treatments: [{ text: "Diversified adjustment L5, right SI", sourceSegments: [3] }],
  painScores: [{ region: "low back", score: 3, sourceSegments: [1, 3] }],
  recommendationMentions: [
    { text: "cat-cow twice a day", sourceSegments: [2] },
    { text: "side-lying wedge pillow", sourceSegments: [2] },
  ],
  planItems: [{ text: "Continue weekly visits", sourceSegments: [3] }],
  recapFound: true,
};

export const template = (over: Partial<Template> = {}): Template => ({
  id: "tpl-1",
  name: "Daily visit",
  version: 1,
  sections: [
    { key: "subjective", label: "Subjective", required: true, guidance: "Patient report and pain scores.", carryRule: "today_only" },
    { key: "objective", label: "Objective", required: true, guidance: "Segments, ROM, findings.", carryRule: "today_only" },
    { key: "assessment", label: "Assessment", required: true, guidance: "Diagnosis and progress.", carryRule: "carry" },
    { key: "plan", label: "Plan", required: true, guidance: "Frequency and next steps.", carryRule: "carry_unless_contradicted" },
  ],
  styleNotes: "Short clauses. Spinal levels in capitals.",
  examples: [],
  updatedAt: T0.toISOString(),
  ...over,
});

export const settings = (over: Partial<PracticeSettings> = {}): PracticeSettings => ({
  activeTemplateId: "tpl-1",
  glossary: [{ term: "div", meaning: "Diversified technique" }],
  previousNotesToRead: 3,
  cloneWarningThreshold: 0.85,
  updatedAt: T0.toISOString(),
  ...over,
});

export const protocolLibrary: ProtocolItem[] = [
  {
    id: "cat-cow",
    title: "Cat-cow",
    instruction: "Cat-cow T/S mobilization on hands and knees, slow and pain-free, 10 reps",
    category: "home_exercise",
    frequency: "2x/day",
    aliases: ["cat cow stretch"],
    active: true,
  },
  {
    id: "wedge",
    title: "Belly wedge pillow",
    instruction: "Place a wedge under the belly when side-lying to support the lumbar spine",
    category: "daily_living",
    aliases: ["side-lying wedge pillow", "wedge pillow"],
    active: true,
  },
];

export const previousNote = {
  date: "2026-11-24",
  sections: {
    subjective: "Low back 5/10, worse after lifting.",
    objective: "L5 left posterior. Lumbar flexion limited.",
    assessment: "Lumbar segmental dysfunction, improving.",
    plan: "Continue weekly. Cat-cow 2x/day.",
  },
};

export const composeOutput: ComposeOutput = {
  sections: {
    subjective: [{ text: "Low back pain 3/10, mostly mornings.", source: "updated", fromNoteDate: "2026-11-24", previousText: "Low back 5/10, worse after lifting." }],
    objective: [
      { text: "L5 left posterior, right SI.", source: "today" },
      { text: "Lumbar flexion improved.", source: "today" },
    ],
    assessment: [{ text: "Lumbar segmental dysfunction, improving.", source: "carried", fromNoteDate: "2026-11-24" }],
    plan: [{ text: "Continue weekly.", source: "carried", fromNoteDate: "2026-11-24" }],
  },
  flags: [],
};
