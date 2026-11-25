import { SOAP_SECTIONS, type DraftSections, type SoapSection } from "@soap-scribe/shared";

/** The text each Jane field receives. Plan items go on their own lines. */
export function draftToText(sections: DraftSections): Record<SoapSection, string> {
  const out = {} as Record<SoapSection, string>;
  for (const key of SOAP_SECTIONS) {
    const lines = sections[key].map((s) => s.text.trim()).filter(Boolean);
    out[key] = key === "plan" ? lines.join("\n") : lines.join(" ");
  }
  return out;
}

/** Practice-local "today" for the schedule sync, YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
