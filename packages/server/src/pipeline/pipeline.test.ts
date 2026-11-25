import { describe, expect, it } from "vitest";
import { suggestAppointment } from "./match.js";
import { datedProtocolSentence, formatPlanDate, matchProtocols, protocolSentence } from "./protocols.js";
import { attachEvidence } from "./compose.js";
import { enforceRules, composeDraft, buildComposePrompt } from "./compose.js";
import { extractVisitFacts } from "./extract.js";
import { FakeLlmClient } from "../llm/client.js";
import { extractJson, LlmOutputError } from "../llm/json.js";
import { appointment, composeOutput, facts, previousNote, protocolLibrary, template, transcript } from "../testing/fixtures.js";

describe("suggestAppointment", () => {
  const a = appointment({ id: "a", start: "2026-12-01T18:30:00.000Z", end: "2026-12-01T18:45:00.000Z" });
  const b = appointment({ id: "b", start: "2026-12-01T18:45:00.000Z", end: "2026-12-01T19:00:00.000Z" });

  it("picks the appointment whose window contains the recording", () => {
    expect(suggestAppointment(new Date("2026-12-01T18:33:00Z"), [a, b])?.id).toBe("a");
  });

  it("prefers the closest start when windows overlap", () => {
    expect(suggestAppointment(new Date("2026-12-01T18:44:00Z"), [a, b])?.id).toBe("b");
  });

  it("allows a recording that starts a few minutes early", () => {
    expect(suggestAppointment(new Date("2026-12-01T18:20:00Z"), [a])?.id).toBe("a");
  });

  it("suggests nothing when no appointment fits", () => {
    expect(suggestAppointment(new Date("2026-12-01T22:00:00Z"), [a, b])).toBeUndefined();
  });
});

describe("matchProtocols", () => {
  it("matches spoken recommendations to library items by title or alias", () => {
    const r = matchProtocols(facts.recommendationMentions, protocolLibrary);
    expect(r.matched.map((m) => m.item.id)).toEqual(["cat-cow", "wedge"]);
    expect(r.unmatched).toEqual([]);
  });

  it("reports what it cannot match instead of guessing", () => {
    const r = matchProtocols([{ text: "ice the area for ten minutes", sourceSegments: [0] }], protocolLibrary);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual(["ice the area for ten minutes"]);
  });

  it("keeps her exact wording and frequency", () => {
    expect(protocolSentence(protocolLibrary[0]!)).toBe(
      "Cat-cow T/S mobilization on hands and knees, slow and pain-free, 10 reps (2x/day)",
    );
  });
});

describe("enforceRules", () => {
  const base = {
    facts,
    template: template(),
    previousNotes: [previousNote],
    protocols: matchProtocols(facts.recommendationMentions, protocolLibrary),
    visitDate: "2026-12-01",
  };

  it("keeps carried text where the section allows it", () => {
    const d = enforceRules(composeOutput, base);
    expect(d.sections.assessment[0]?.source).toBe("carried");
  });

  it("removes carried text from a today-only section and flags it", () => {
    const out = structuredClone(composeOutput);
    out.sections.objective.push({ text: "Lumbar flexion limited.", source: "carried", fromNoteDate: "2026-11-24" });
    const d = enforceRules(out, base);
    expect(d.sections.objective.every((s) => s.source === "today")).toBe(true);
    expect(d.flags.some((f) => f.section === "objective" && /today only/.test(f.reason))).toBe(true);
  });

  it("drops carried text when there is no previous note to carry from", () => {
    const d = enforceRules(composeOutput, { ...base, previousNotes: [] });
    expect(d.sections.assessment).toEqual([]);
    expect(d.flags.some((f) => f.section === "assessment" && /required/.test(f.reason))).toBe(true);
  });

  it("adds protocol items verbatim from the library, never from the model", () => {
    const out = structuredClone(composeOutput);
    out.sections.plan.push({ text: "Do some cat cows", source: "protocol", protocolId: "cat-cow" });
    const d = enforceRules(out, base);
    const protocolLines = d.sections.plan.filter((s) => s.source === "protocol");
    expect(protocolLines.map((s) => s.protocolId)).toEqual(["cat-cow", "wedge"]);
    expect(protocolLines[0]?.text).toBe(protocolSentence(protocolLibrary[0]!));
  });

  it("flags a missing spoken recap", () => {
    const d = enforceRules(composeOutput, { ...base, facts: { ...facts, recapFound: false } });
    expect(d.flags.some((f) => /recap/.test(f.reason))).toBe(true);
  });

  it("measures similarity to the last note for the clone reminder", () => {
    const d = enforceRules(composeOutput, base);
    expect(d.similarityToLast).toBeGreaterThanOrEqual(0);
    expect(d.similarityToLast).toBeLessThan(1);
  });
});

describe("composeDraft", () => {
  it("validates the model reply and retries once with the error", async () => {
    const llm = new FakeLlmClient(['{"sections": {}}', JSON.stringify(composeOutput)]);
    const d = await composeDraft(llm, "compose-model", {
      facts,
      template: template(),
      previousNotes: [previousNote],
      protocols: matchProtocols(facts.recommendationMentions, protocolLibrary),
      visitDate: "2026-12-01",
    });
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[1]?.user).toMatch(/rejected/);
    expect(d.sections.objective).toHaveLength(2);
  });

  it("gives up after two invalid replies", async () => {
    const llm = new FakeLlmClient(["not json", "still not json"]);
    await expect(
      composeDraft(llm, "m", { facts, template: template(), previousNotes: [], protocols: { matched: [], unmatched: [] }, visitDate: "2026-12-01" }),
    ).rejects.toThrow(LlmOutputError);
  });

  it("puts carry rules and previous notes in the prompt", () => {
    const p = buildComposePrompt({ facts, template: template(), previousNotes: [previousNote], protocols: { matched: [], unmatched: [] }, visitDate: "2026-12-01" });
    expect(p).toMatch(/carry rule: carry_unless_contradicted/);
    expect(p).toMatch(/Note from 2026-11-24/);
  });
});

describe("extractVisitFacts", () => {
  it("drops facts that cite transcript lines that don't exist", async () => {
    const reply = { ...facts, findings: [...facts.findings, { kind: "other", text: "made up", sourceSegments: [99] }] };
    const llm = new FakeLlmClient([JSON.stringify(reply)]);
    const out = await extractVisitFacts(llm, "extract-model", transcript, []);
    expect(out.findings.map((f) => f.text)).not.toContain("made up");
    expect(llm.requests[0]?.user).toMatch(/\[3\] Clinician: Recap/);
  });
});

describe("extractJson", () => {
  it("reads JSON inside a code fence", () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe("protocol matching, two in one sentence", () => {
  it("matches every library item a single sentence names", () => {
    const r = matchProtocols([{ text: "Keep the cat-cow twice a day, and try a wedge pillow under the belly", sourceSegments: [0] }], protocolLibrary);
    expect(r.matched.map((m) => m.item.id).sort()).toEqual(["cat-cow", "wedge"]);
    expect(r.unmatched).toEqual([]);
  });
});

describe("dated plan lines (G-17) and evidence (G-19)", () => {
  const item = protocolLibrary[0]!;
  const base = {
    facts,
    template: template(),
    previousNotes: [previousNote],
    protocols: matchProtocols(facts.recommendationMentions, protocolLibrary),
    visitDate: "2026-12-01",
  };

  it("dates a protocol line the way she does by hand, without touching her wording", () => {
    expect(formatPlanDate("2026-11-04", "us")).toBe("11/4/26");
    expect(datedProtocolSentence(item, { format: "us", givenOn: "2026-11-24" })).toBe(`${protocolSentence(item)} — given 11/24/26`);
    expect(datedProtocolSentence(item, { format: "iso", givenOn: "2026-11-24", since: "2026-10-03" })).toBe(`${protocolSentence(item)} — since 2026-10-03`);
    expect(datedProtocolSentence(item, { format: "off", givenOn: "2026-11-24" })).toBe(protocolSentence(item));
  });

  it("marks a protocol given on an earlier visit as a repeat, with its first date", () => {
    const d = enforceRules(composeOutput, {
      ...base,
      planDateFormat: "us",
      visitDate: "2026-12-01",
      firstAssignedOn: new Map([["cat-cow", "2026-10-03"]]),
    });
    const catCow = d.sections.plan.find((s) => s.protocolId === "cat-cow")!;
    expect(catCow.text).toMatch(/— since 10\/3\/26$/);
    expect(catCow.assignedSince).toBe("2026-10-03");
    expect(d.sections.plan.find((s) => s.protocolId === "wedge")!.text).toMatch(/— given 12\/1\/26$/);
  });

  it("links today's sentences to the transcript lines behind them, and never guesses", () => {
    const sections = structuredClone(composeOutput.sections);
    sections.objective.push({ text: "Gait normal.", source: "today" });
    attachEvidence(sections, {
      ...facts,
      findings: facts.findings.map((f) => ({ ...f, evidence: ["Clinician: Recap: L5 left posterior, SI right"] })),
    });
    expect(sections.objective[0]!.evidence).toEqual(["Clinician: Recap: L5 left posterior, SI right"]);
    expect(sections.objective.find((s) => s.text === "Gait normal.")!.evidence).toBeUndefined();
    expect(sections.assessment[0]!.evidence).toBeUndefined(); // carried: no transcript behind it
  });
});

