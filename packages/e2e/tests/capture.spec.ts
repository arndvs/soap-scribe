import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JANE, expect, test } from "./fixtures.js";

const TOOL = readFileSync(resolve(import.meta.dirname, "../../extension/tools/jane-capture.js"), "utf8");

// The day 2 mapping tool (G-06) must find the fields and must not carry patient data out.
test("the Jane capture tool suggests selectors and leaves no patient details in its output", async ({ jane }) => {
  await jane.goto(`${JANE}/patients/1001/chart`);
  const out = (await jane.evaluate(TOOL)) as {
    fields: Array<{ selector: string; guess: string | null }>;
    patientIdCarriers: Array<{ attribute: string }>;
    previousNoteListCandidates: Array<{ itemSelector: string; count: number }>;
    skeleton: string;
  };
  expect(Object.fromEntries(out.fields.map((f) => [f.guess, f.selector]))).toMatchObject({
    subjective: "#soap-s",
    objective: "#soap-o",
    assessment: "#soap-a",
    plan: "#soap-p",
  });
  expect(out.patientIdCarriers.map((c) => c.attribute)).toContain("data-soap-patient-id");
  expect(out.previousNoteListCandidates.some((c) => c.itemSelector.endsWith("article") && c.count === 2)).toBe(true);
  const whole = JSON.stringify(out);
  for (const leak of ["Maria", "Lopez", "1001", "Low back", "L5"]) expect(whole).not.toContain(leak);
});
