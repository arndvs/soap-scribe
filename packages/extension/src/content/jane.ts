import { SOAP_SECTIONS, type PreviousNote, type SoapSection } from "@soap-scribe/shared";
import { janeMap } from "../jane-map.js";

/** Pure DOM logic, separated from chrome.* messaging so it can be tested with jsdom. */

export type JanePage = { kind: "chart"; patientId: string } | { kind: "schedule" } | { kind: "other" };

export function detectPage(url: string): JanePage {
  const chart = url.match(janeMap.chartPage.urlPattern);
  if (chart?.[1]) return { kind: "chart", patientId: chart[1] };
  if (janeMap.schedulePage.urlPattern.test(url)) return { kind: "schedule" };
  return { kind: "other" };
}

export interface ScheduleRow {
  start: string;
  end: string;
  janePatientId: string;
  patientDisplayName: string;
}

export function readSchedule(doc: Document): ScheduleRow[] {
  const { appointmentRow, attrs } = janeMap.schedulePage;
  return [...doc.querySelectorAll(appointmentRow)].flatMap((el) => {
    const start = el.getAttribute(attrs.start);
    const end = el.getAttribute(attrs.end);
    const id = el.getAttribute(attrs.patientId);
    const name = el.getAttribute(attrs.patientName);
    if (!start || !end || !id || !name) return [];
    return [{ start: new Date(start).toISOString(), end: new Date(end).toISOString(), janePatientId: id, patientDisplayName: name }];
  });
}

/** Reads only the last `limit` notes of the chart that's open: the minimum the draft needs. */
export function readPreviousNotes(doc: Document, limit: number): PreviousNote[] | null {
  const { item, dateAttr, section } = janeMap.chartPage.previousNotes;
  const items = [...doc.querySelectorAll(item)];
  if (items.length === 0) return null;
  return items
    .map((el) => {
      const date = el.getAttribute(dateAttr) ?? "";
      const sections: Partial<Record<SoapSection, string>> = {};
      for (const key of SOAP_SECTIONS) {
        const text = el.querySelector(section[key])?.textContent?.trim();
        if (text) sections[key] = text;
      }
      return { date, sections };
    })
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** The patient ID on the page: from the URL, confirmed by the page itself when it shows one. */
export function patientIdOnPage(doc: Document, url: string): string | null {
  const page = detectPage(url);
  if (page.kind !== "chart") return null;
  const el = doc.querySelector(janeMap.chartPage.patientIdElement);
  const domId = el?.getAttribute(janeMap.chartPage.patientIdAttr);
  if (domId && domId !== page.patientId) return null; // URL and page disagree: trust neither
  return page.patientId;
}

export type InsertResult =
  | { ok: true; janePatientIdOnPage: string }
  | { ok: false; reason: "not_chart" | "patient_mismatch" | "fields_missing" | "read_back_mismatch"; detail: string };

type Field = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

/**
 * Fails closed: checks the page and the patient first, inserts nothing unless every
 * field is found, fills each the way the page's own code expects, then reads all four
 * back. It never clicks Save or Sign; the clinician does that in Jane.
 */
export function insertNote(
  doc: Document,
  url: string,
  expectedPatientId: string,
  text: Record<SoapSection, string>,
): InsertResult {
  const page = detectPage(url);
  if (page.kind !== "chart") return { ok: false, reason: "not_chart", detail: "Open the patient's chart first." };
  const onPage = patientIdOnPage(doc, url);
  if (onPage !== expectedPatientId) {
    return {
      ok: false,
      reason: "patient_mismatch",
      detail: `This chart is patient ${onPage ?? "unknown"}, but the draft is for patient ${expectedPatientId}.`,
    };
  }

  const fields = SOAP_SECTIONS.map((key) => [key, doc.querySelector<Field>(janeMap.chartPage.fields[key])] as const);
  const missing = fields.filter(([, el]) => !el).map(([k]) => k);
  if (missing.length) {
    return { ok: false, reason: "fields_missing", detail: `Couldn't find: ${missing.join(", ")}. Nothing was inserted; use Copy.` };
  }

  for (const [key, el] of fields) setFieldValue(el!, text[key]);

  const mismatched = fields.filter(([key, el]) => normalize(getFieldValue(el!)) !== normalize(text[key])).map(([k]) => k);
  if (mismatched.length) {
    return { ok: false, reason: "read_back_mismatch", detail: `Check these sections in Jane: ${mismatched.join(", ")}.` };
  }
  return { ok: true, janePatientIdOnPage: onPage };
}

function setFieldValue(el: Field, value: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    // Use the native setter so frameworks that track the value (React) see the change.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  } else if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    // Rich-text editor: replace contents through the editor's own input path where possible.
    el.textContent = value;
  } else {
    throw new Error("field is not editable");
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

function getFieldValue(el: Field): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.textContent ?? "";
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
