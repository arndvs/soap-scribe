import { SOAP_SECTIONS, sectionText, type DraftSections, type PreviousNote, type TranscriptSegment } from "../domain.js";
import type { EvalCase } from "./types.js";

export interface CaseScore {
  id: string;
  /** Spinal levels or forbidden phrases in the draft that no source supports. Blocks a release. */
  invented: string[];
  /** Expected phrases or levels the draft left out. */
  missing: string[];
  /** Expected levels absent while other levels were named instead. */
  wrongLevels: string[];
  protocols: { expected: string[]; got: string[] };
  /** Plan lines with the wrong "given"/"since" date, or none. */
  datingErrors: string[];
  /** A citation pointing at the wrong transcript line misleads her. Blocks a release. */
  wrongEvidence: string[];
  passed: boolean;
}

const usDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y!.slice(2)}`;
};

/** C1–C7, T1–T12, L1–L5, S1–S5 and SI, written the way notes usually write them. */
const LEVEL = /\b(?:C[1-7]|T(?:1[0-2]|[1-9])|L[1-5]|S[1-5]|SI)\b/gi;

export function spinalLevels(text: string): Set<string> {
  return new Set([...text.matchAll(LEVEL)].map((m) => m[0].toUpperCase()));
}

const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Scores one draft against its case. Deterministic, so a failing case can be explained:
 * an invented level is one the draft names that neither the transcript nor a previous
 * note mentions.
 */
export function scoreCase(c: EvalCase, draft: DraftSections): CaseScore {
  const all = SOAP_SECTIONS.map((k) => sectionText(draft[k])).join(" ");
  const sources = [
    ...c.transcript.map((s: TranscriptSegment) => s.text),
    ...c.previousNotes.flatMap((n: PreviousNote) => Object.values(n.sections)),
  ].join(" ");

  const sourceLevels = spinalLevels(sources);
  const invented = [
    ...[...spinalLevels(all)].filter((l) => !sourceLevels.has(l)).map((l) => `level ${l}`),
    ...c.expected.mustNotInclude.filter((p) => contains(all, p)).map((p) => `"${p}"`),
  ];

  const missing: string[] = [];
  for (const key of SOAP_SECTIONS) {
    const text = sectionText(draft[key]);
    for (const phrase of c.expected.mustInclude[key] ?? []) if (!contains(text, phrase)) missing.push(`${key}: "${phrase}"`);
  }
  const draftLevels = spinalLevels(all);
  const absentLevels = c.expected.spinalLevels.map((l) => l.toUpperCase()).filter((l) => !draftLevels.has(l));
  missing.push(...absentLevels.map((l) => `level ${l}`));
  const wrongLevels = absentLevels.length && draftLevels.size ? absentLevels : [];

  const protocolLines = draft.plan.filter((s) => s.source === "protocol" && s.protocolId);
  const got = protocolLines.map((s) => s.protocolId!).sort();
  const expected = [...c.expected.protocols].sort();

  // Dates on Plan lines (US format, the default): "— since" the first date for repeats, "— given" otherwise.
  const datingErrors: string[] = [];
  for (const line of protocolLines) {
    const since = c.expected.protocolsSince[line.protocolId!];
    if (since && !line.text.endsWith(`— since ${usDate(since)}`)) datingErrors.push(`${line.protocolId}: expected "since ${usDate(since)}"`);
    if (!since && !/— given \d+\/\d+\/\d\d$/.test(line.text)) datingErrors.push(`${line.protocolId}: expected "given <date>"`);
  }

  const sentences = SOAP_SECTIONS.flatMap((k) => draft[k]);
  if (c.expected.onlyCarried) {
    for (const s of sentences) {
      if (s.source === "today" || s.source === "updated") invented.push(`"${s.text}" marked ${s.source} with no recording`);
    }
  }

  const wrongEvidence: string[] = [];
  for (const e of c.expected.evidence) {
    const s = sentences.find((x) => contains(x.text, e.sentence));
    if (!s) missing.push(`sentence with "${e.sentence}"`);
    else if (!s.evidence?.length) missing.push(`evidence for "${e.sentence}"`);
    else if (!s.evidence.some((line) => contains(line, e.quote))) wrongEvidence.push(`"${e.sentence}" cites the wrong line`);
  }

  return {
    id: c.id,
    invented,
    missing,
    wrongLevels,
    protocols: { expected, got },
    datingErrors,
    wrongEvidence,
    passed: invented.length === 0 && wrongEvidence.length === 0,
  };
}

export interface RunSummary {
  cases: number;
  invented: number;
  missing: number;
  wrongLevels: number;
  protocolMismatches: number;
  datingErrors: number;
  wrongEvidence: number;
  passed: boolean;
}

/** The release rule: a run passes only if no case invented anything or cited the wrong line. */
export function summarize(scores: CaseScore[]): RunSummary {
  return {
    cases: scores.length,
    invented: scores.reduce((n, s) => n + s.invented.length, 0),
    missing: scores.reduce((n, s) => n + s.missing.length, 0),
    wrongLevels: scores.reduce((n, s) => n + s.wrongLevels.length, 0),
    protocolMismatches: scores.filter((s) => s.protocols.expected.join() !== s.protocols.got.join()).length,
    datingErrors: scores.reduce((n, s) => n + s.datingErrors.length, 0),
    wrongEvidence: scores.reduce((n, s) => n + s.wrongEvidence.length, 0),
    passed: scores.every((s) => s.passed),
  };
}
