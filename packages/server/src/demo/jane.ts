import express from "express";
import { SOAP_SECTIONS, type PreviousNote } from "../domain.js";
import type { DemoPatient } from "./data.js";

/**
 * A FAKE Jane: just enough of a schedule page and a chart page, using the selectors in
 * extension/src/jane-map.ts, for the demo and the end-to-end test. It is not a copy of
 * Jane's pages; the real selectors are mapped on day 2 (gaps G-06).
 */
export interface FakeJaneState {
  patients: DemoPatient[];
  notes: Map<string, PreviousNote[]>;
  appointments: Map<string, { start: Date; end: Date }>;
  today: () => string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} · Fake Jane</title>
<style>
  body { font: 15px/1.45 system-ui, sans-serif; margin: 0; color: #222; }
  header { background: #2f4858; color: #fff; padding: 10px 20px; display: flex; gap: 20px; align-items: baseline; }
  header a { color: #cfe3ee; }
  .banner { background: #fff3cd; padding: 6px 20px; font-size: 13px; }
  main { padding: 20px; max-width: 900px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
  article { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; margin: 10px 0; background: #fafafa; }
  article h3 { margin: 0 0 6px; font-size: 14px; }
  label { display: block; font-weight: 600; margin-top: 10px; }
  textarea { width: 100%; min-height: 70px; font: inherit; }
  button { margin-top: 12px; padding: 8px 14px; }
</style></head>
<body><header><strong>Fake Jane</strong><a href="/admin/schedule">Schedule</a></header>
<div class="banner">Demo only. Synthetic patients. Not affiliated with Jane App.</div>
<main>${body}</main></body></html>`;

export function fakeJaneRouter(state: FakeJaneState) {
  const r = express.Router();
  r.use(express.urlencoded({ extended: false }));

  r.get("/", (_req, res) => res.redirect("/admin/schedule"));

  r.get("/admin/schedule", (_req, res) => {
    const rows = state.patients
      .map((p) => {
        const a = state.appointments.get(p.janePatientId)!;
        return `<tr data-soap-appointment data-start="${a.start.toISOString()}" data-end="${a.end.toISOString()}"
          data-patient-id="${p.janePatientId}" data-patient-name="${esc(p.name)}">
          <td>${a.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a href="/patients/${p.janePatientId}/chart">${esc(p.name)}</a></td></tr>`;
      })
      .join("");
    res.send(page("Schedule", `<h1>Today, ${state.today()}</h1><table><tr><th>Time</th><th>Patient</th></tr>${rows}</table>`));
  });

  r.get("/patients/:id/chart", (req, res) => {
    const p = state.patients.find((x) => x.janePatientId === req.params.id);
    if (!p) return res.status(404).send(page("Not found", "<h1>No such patient</h1>"));
    const notes = state.notes.get(p.janePatientId) ?? [];
    const history = notes
      .map(
        (n) => `<article data-soap-note data-note-date="${n.date}"><h3>${n.date}</h3>${SOAP_SECTIONS.map(
          (k) => `<div><strong>${k[0]!.toUpperCase()}:</strong> <span data-section="${k}">${esc(n.sections[k] ?? "").replace(/\n/g, "<br>")}</span></div>`,
        ).join("")}</article>`,
      )
      .join("");
    const fields = SOAP_SECTIONS.map(
      (k, i) => `<label for="soap-${k[0]}">${["Subjective", "Objective", "Assessment", "Plan"][i]}</label>
      <textarea id="soap-${k[0]}" name="${k}"></textarea>`,
    ).join("");
    res.send(
      page(
        p.name,
        `<div data-soap-patient-id="${p.janePatientId}"><h1>${esc(p.name)}</h1>
        <h2>Today's chart note</h2>
        <form method="post" action="/patients/${p.janePatientId}/notes">${fields}
          <button type="submit">Save &amp; sign</button></form>
        <h2>Previous notes</h2>${history || "<p>None</p>"}</div>`,
      ),
    );
  });

  r.post("/patients/:id/notes", (req, res) => {
    const id = req.params.id;
    const body = req.body as Record<string, string>;
    const note: PreviousNote = {
      date: state.today(),
      sections: Object.fromEntries(SOAP_SECTIONS.map((k) => [k, (body[k] ?? "").trim()])),
    };
    const list = (state.notes.get(id) ?? []).filter((n) => n.date !== note.date);
    state.notes.set(id, [note, ...list]);
    res.redirect(`/patients/${id}/chart`);
  });

  return r;
}
