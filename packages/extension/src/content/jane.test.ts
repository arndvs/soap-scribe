// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { detectPage, insertNote, patientIdOnPage, readPreviousNotes, readSchedule } from "./jane.js";
import { draftToText } from "../format.js";

// A synthetic stand-in for Jane's chart page, built from the selectors in jane-map.ts.
// Replace with a saved, de-identified copy of the real page after the day 2 spike.
const CHART_URL = "https://example.jane.app/admin#/patients/1001/chart";
const chartPage = (patientId = "1001") => `
  <h1 data-soap-patient-id="${patientId}">Test Patient A</h1>
  <textarea id="soap-s"></textarea>
  <textarea id="soap-o"></textarea>
  <textarea id="soap-a"></textarea>
  <textarea id="soap-p"></textarea>
  <article data-soap-note data-note-date="2026-11-17">
    <div data-section="subjective">Low back 6/10.</div><div data-section="plan">Weekly.</div>
  </article>
  <article data-soap-note data-note-date="2026-11-24">
    <div data-section="subjective">Low back 5/10.</div><div data-section="objective">L5 left posterior.</div>
  </article>`;

const text = { subjective: "Low back 3/10.", objective: "L5 left posterior.", assessment: "Improving.", plan: "Continue weekly.\nCat-cow (2x/day)" };

describe("detectPage", () => {
  it("recognizes a chart and its patient ID", () => {
    expect(detectPage(CHART_URL)).toEqual({ kind: "chart", patientId: "1001" });
  });
  it("recognizes the schedule", () => {
    expect(detectPage("https://example.jane.app/admin#/schedule").kind).toBe("schedule");
  });
});

describe("reading the page", () => {
  beforeEach(() => {
    document.body.innerHTML = chartPage();
  });

  it("reads the newest notes first, limited to what's asked", () => {
    const notes = readPreviousNotes(document, 1);
    expect(notes).toEqual([{ date: "2026-11-24", sections: { subjective: "Low back 5/10.", objective: "L5 left posterior." } }]);
  });

  it("returns null when the notes list isn't on the page", () => {
    document.body.innerHTML = "<textarea id='soap-s'></textarea>";
    expect(readPreviousNotes(document, 3)).toBeNull();
  });

  it("refuses a patient ID when the URL and the page disagree", () => {
    document.body.innerHTML = chartPage("2002");
    expect(patientIdOnPage(document, CHART_URL)).toBeNull();
  });

  it("reads schedule rows and skips incomplete ones", () => {
    document.body.innerHTML = `
      <div data-soap-appointment data-start="2026-12-01T10:30:00-08:00" data-end="2026-12-01T10:45:00-08:00" data-patient-id="1001" data-patient-name="Test Patient A"></div>
      <div data-soap-appointment data-start="2026-12-01T11:00:00-08:00"></div>`;
    expect(readSchedule(document)).toEqual([
      { start: "2026-12-01T18:30:00.000Z", end: "2026-12-01T18:45:00.000Z", janePatientId: "1001", patientDisplayName: "Test Patient A" },
    ]);
  });
});

describe("insertNote fails closed", () => {
  beforeEach(() => {
    document.body.innerHTML = chartPage();
  });

  it("fills all four fields, fires input events and confirms by read-back", () => {
    let inputs = 0;
    document.body.addEventListener("input", () => inputs++);
    const r = insertNote(document, CHART_URL, "1001", text);
    expect(r).toEqual({ ok: true, janePatientIdOnPage: "1001" });
    expect(document.querySelector<HTMLTextAreaElement>("#soap-p")!.value).toBe(text.plan);
    expect(inputs).toBe(4);
  });

  it("writes nothing into another patient's chart", () => {
    const r = insertNote(document, CHART_URL, "2002", text);
    expect(r).toMatchObject({ ok: false, reason: "patient_mismatch" });
    expect(document.querySelector<HTMLTextAreaElement>("#soap-s")!.value).toBe("");
  });

  it("writes nothing when a field is missing", () => {
    document.querySelector("#soap-a")!.remove();
    const r = insertNote(document, CHART_URL, "1001", text);
    expect(r).toMatchObject({ ok: false, reason: "fields_missing" });
    expect(document.querySelector<HTMLTextAreaElement>("#soap-s")!.value).toBe("");
  });

  it("writes nothing off a chart page", () => {
    expect(insertNote(document, "https://example.jane.app/admin#/schedule", "1001", text)).toMatchObject({ ok: false, reason: "not_chart" });
  });

  it("reports a read-back mismatch when the page rewrites the value", () => {
    document.querySelector("#soap-o")!.addEventListener("input", (e) => {
      (e.target as HTMLTextAreaElement).value = "something else";
    });
    expect(insertNote(document, CHART_URL, "1001", text)).toMatchObject({ ok: false, reason: "read_back_mismatch" });
  });
});

describe("draftToText", () => {
  it("joins sentences and puts plan items on their own lines", () => {
    const out = draftToText({
      subjective: [{ text: "Low back 3/10.", source: "today" }, { text: "Mornings worse.", source: "today" }],
      objective: [],
      assessment: [{ text: "Improving.", source: "carried", fromNoteDate: "2026-11-24" }],
      plan: [{ text: "Weekly.", source: "today" }, { text: "Cat-cow (2x/day)", source: "protocol", protocolId: "cat-cow" }],
    });
    expect(out).toEqual({ subjective: "Low back 3/10. Mornings worse.", objective: "", assessment: "Improving.", plan: "Weekly.\nCat-cow (2x/day)" });
  });
});
