import { describe, expect, it } from "vitest";
import {
  JOB_STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  InvalidTransitionError,
  DraftSentence,
  ComposeOutput,
  noteSimilarity,
} from "./index.js";

describe("job state machine", () => {
  it("defines transitions for every status", () => {
    for (const s of JOB_STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });

  it("only reaches extracting through a confirmed patient", () => {
    const into = JOB_STATUSES.filter((s) => canTransition(s, "extracting"));
    expect(into).toEqual(["confirmed"]);
  });

  it("treats inserted as terminal", () => {
    expect(TRANSITIONS.inserted).toEqual([]);
  });

  it("throws on an invalid move", () => {
    expect(() => assertTransition("received", "inserted")).toThrow(InvalidTransitionError);
  });
});

describe("draft sentences", () => {
  it("requires a date on carried text", () => {
    expect(DraftSentence.safeParse({ text: "x", source: "carried" }).success).toBe(false);
    expect(
      DraftSentence.safeParse({ text: "x", source: "carried", fromNoteDate: "2026-11-20" }).success,
    ).toBe(true);
  });

  it("requires the old wording on updated text", () => {
    const r = DraftSentence.safeParse({ text: "Pain 3/10", source: "updated", fromNoteDate: "2026-11-20" });
    expect(r.success).toBe(false);
  });

  it("requires a library id on protocol text", () => {
    expect(DraftSentence.safeParse({ text: "Cat-cow 2x/day", source: "protocol" }).success).toBe(false);
  });

  it("rejects compose output with an untagged sentence", () => {
    const bad = {
      sections: { subjective: [{ text: "x" }], objective: [], assessment: [], plan: [] },
      flags: [],
    };
    expect(ComposeOutput.safeParse(bad).success).toBe(false);
  });
});

describe("noteSimilarity", () => {
  it("is 1 for identical notes and low for different ones", () => {
    const a = "Patient reports low back pain 5/10 after lifting. Adjusted L5 diversified.";
    expect(noteSimilarity(a, a)).toBe(1);
    expect(noteSimilarity(a, "Neck stiffness after travel, cervical ROM limited, adjusted C5.")).toBeLessThan(0.1);
  });
});
