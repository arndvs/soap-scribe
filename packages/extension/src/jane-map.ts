/**
 * Everything Jane-specific lives in this one file. When Jane changes its pages, only
 * this file changes.
 *
 * PLACEHOLDERS: every selector and URL pattern below is a guess until the day 2 spike
 * on a test patient (open question D-02). Replace them with the real ones, and keep the
 * saved test page in src/content/__fixtures__ in sync so the tests prove the mapping.
 */
export const janeMap = {
  schedulePage: {
    urlPattern: /\/admin#?\/?schedule/,
    appointmentRow: "[data-soap-appointment]",
    /** Attributes on each row. */
    attrs: {
      start: "data-start",
      end: "data-end",
      patientId: "data-patient-id",
      patientName: "data-patient-name",
    },
  },
  chartPage: {
    urlPattern: /\/patients\/(\d+)\/chart/,
    /** Element whose attribute repeats the patient ID; checked against the URL. */
    patientIdElement: "[data-soap-patient-id]",
    patientIdAttr: "data-soap-patient-id",
    previousNotes: {
      item: "[data-soap-note]",
      dateAttr: "data-note-date",
      section: {
        subjective: "[data-section='subjective']",
        objective: "[data-section='objective']",
        assessment: "[data-section='assessment']",
        plan: "[data-section='plan']",
      },
    },
    fields: {
      subjective: "#soap-s",
      objective: "#soap-o",
      assessment: "#soap-a",
      plan: "#soap-p",
    },
  },
} as const;
