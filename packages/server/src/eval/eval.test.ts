import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadCases, runEval } from "./run.js";
import { scoreCase, spinalLevels, summarize } from "./score.js";
import type { DraftSections } from "../domain.js";
import { FakeLlmClient } from "../llm/client.js";

const cases = loadCases(resolve(import.meta.dirname, "../../eval-cases"));
const routine = cases.find((c) => c.id === "01-routine-follow-up")!;

const draft = (over: Partial<DraftSections> = {}): DraftSections => ({
  subjective: [{ text: "Low back 3/10, mornings stiff.", source: "today" }],
  objective: [{ text: "L5 left posterior, right SI. Lumbar flexion improved.", source: "today" }],
  assessment: [{ text: "Lumbar segmental dysfunction, improving.", source: "carried", fromNoteDate: "2026-11-24" }],
  plan: [{ text: "Cat-cow (2x/day)", source: "protocol", protocolId: "cat-cow" }],
  ...over,
});

describe("draft test set", () => {
  it("loads every synthetic case", () => {
    expect(cases.map((c) => c.id)).toEqual(["01-routine-follow-up", "02-new-complaint", "03-no-recap", "04-pregnancy-protocols"]);
  });

  it("finds spinal levels the way notes write them", () => {
    expect([...spinalLevels("Adjusted L5, right SI and C5; t4 tender")].sort()).toEqual(["C5", "L5", "SI", "T4"]);
  });

  it("passes a draft that only uses supported facts", () => {
    const s = scoreCase(routine, draft());
    expect(s).toMatchObject({ invented: [], missing: [], passed: true, protocols: { expected: ["cat-cow"], got: ["cat-cow"] } });
  });

  it("fails a draft that names a level no source mentions", () => {
    const s = scoreCase(routine, draft({ objective: [{ text: "L5 left posterior, right SI, C5 right.", source: "today" }] }));
    expect(s.passed).toBe(false);
    expect(s.invented).toContain("level C5");
  });

  it("reports missing phrases and levels without failing the run", () => {
    const s = scoreCase(routine, draft({ objective: [{ text: "Lumbar flexion improved.", source: "today" }] }));
    expect(s.passed).toBe(true);
    expect(s.missing).toEqual(["level L5", "level SI"]);
  });

  it("passes a run only when nothing was invented", () => {
    const good = scoreCase(routine, draft());
    const bad = scoreCase(routine, draft({ subjective: [{ text: "Pain radiating down the leg.", source: "today" }] }));
    expect(summarize([good]).passed).toBe(true);
    expect(summarize([good, bad])).toMatchObject({ passed: false, invented: 1 });
  });

  it("runs a case through both pipeline stages", async () => {
    const llm = new FakeLlmClient([
      JSON.stringify({
        complaints: [{ text: "Low back better, 3/10, mornings stiff", sourceSegments: [1] }],
        findings: [{ kind: "segment", text: "L5 left posterior, right SI", sourceSegments: [3] }],
        treatments: [{ text: "Diversified", sourceSegments: [3] }],
        painScores: [{ region: "low back", score: 3, sourceSegments: [3] }],
        recommendationMentions: [{ text: "cat-cow twice a day", sourceSegments: [2] }],
        planItems: [{ text: "Continue weekly", sourceSegments: [3] }],
        recapFound: true,
      }),
      JSON.stringify({ sections: { ...draft(), plan: [] }, flags: [] }),
    ]);
    const [score] = await runEval(llm, [routine], { extract: "e", compose: "c" });
    expect(score).toMatchObject({ passed: true, protocols: { got: ["cat-cow"] } });
  });
});
