import { describe, expect, it } from "vitest";
import { DemoLlmClient } from "./llm.js";
import { DEMO_PATIENTS, DEMO_PROTOCOLS, DEMO_TEMPLATE, parsePatientsFile, previousNotesFor } from "./data.js";
import { extractVisitFacts } from "../pipeline/extract.js";
import { composeDraft } from "../pipeline/compose.js";
import { matchProtocols } from "../pipeline/protocols.js";

const NOW = new Date("2026-12-01T18:30:00.000Z");
const TZ = "America/Los_Angeles";

async function draftFor(id: string) {
  const p = DEMO_PATIENTS.find((x) => x.janePatientId === id)!;
  const llm = new DemoLlmClient();
  const facts = await extractVisitFacts(llm, "demo", p.transcript.map((s, index) => ({ ...s, index })), []);
  return composeDraft(llm, "demo", {
    facts,
    template: DEMO_TEMPLATE,
    previousNotes: previousNotesFor(p, NOW, TZ),
    protocols: matchProtocols(facts.recommendationMentions, DEMO_PROTOCOLS),
    visitDate: "2026-12-01",
  });
}

describe("demo stand-in model, through the real pipeline", () => {
  it("updates a changed pain score and adds both protocols verbatim (Maria)", async () => {
    const d = await draftFor("1001");
    const pain = d.sections.subjective.find((s) => s.text.includes("/10"));
    expect(pain).toMatchObject({ text: "Low back 3/10.", source: "updated", previousText: "Low back 5/10, worse at night." });
    expect(d.sections.subjective.filter((s) => s.text.includes("/10"))).toHaveLength(1);
    expect(d.sections.plan.filter((s) => s.source === "protocol").map((s) => s.protocolId).sort()).toEqual(["cat-cow", "wedge"]);
  });

  it("produces a near-identical note when nothing changed, so the clone warning fires (James)", async () => {
    const d = await draftFor("1002");
    expect(d.similarityToLast).toBeGreaterThanOrEqual(0.85);
  });

  it("flags nothing invented: every today sentence comes from the transcript (Priya)", async () => {
    const d = await draftFor("1003");
    const today = Object.values(d.sections).flat().filter((s) => s.source === "today").map((s) => s.text);
    expect(today.join(" ")).toMatch(/C1 right lateral/);
    expect(today.join(" ")).not.toMatch(/T6/);
  });

  it("reads a private patients file with a pasted transcript", () => {
    const [p] = parsePatientsFile(JSON.stringify([{
      janePatientId: "2001", name: "Dana Reyes", appointmentMinutesAgo: 30,
      previous: [{ daysAgo: 7, sections: { subjective: "Low back 6/10." } }],
      transcriptText: "Clinician: How's the back?\nPatient: About a four out of ten.\n\nRecap: L5 left posterior.",
    }]));
    expect(p!.transcript).toEqual([
      { speaker: "Clinician", text: "How's the back?" },
      { speaker: "Patient", text: "About a four out of ten." },
      { text: "Recap: L5 left posterior." },
    ]);
  });
});

