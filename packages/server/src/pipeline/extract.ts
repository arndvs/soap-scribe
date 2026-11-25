import { VisitFacts, type GlossaryEntry, type TranscriptSegment } from "../domain.js";
import type { LlmClient } from "../llm/client.js";
import { completeValidated } from "../llm/json.js";

export const EXTRACT_SYSTEM = `You extract structured facts from a recorded clinical visit.

Rules:
- Use only what is said in the transcript. Never add a finding that is typical but not stated.
- Every fact lists the transcript line numbers it came from in "sourceSegments".
- Expand the clinician's shorthand using the glossary when it is clearly meant.
- The clinician usually ends with a short spoken recap of findings, treatment and plan.
  Set "recapFound" to true if you find it. Prefer the recap's wording for findings.
- "recommendationMentions" are home exercises, daily-living changes or other homework
  the clinician told the patient, quoted closely ("cat-cow twice a day").
- Pain scores are numbers from 0 to 10 with the body region.
- Reply with one JSON object and nothing else.`;

const SHAPE = `{
  "complaints": [{ "text": string, "sourceSegments": number[] }],
  "findings": [{ "kind": "segment"|"rom"|"palpation"|"orthopedic"|"neurological"|"posture"|"other", "text": string, "sourceSegments": number[] }],
  "treatments": [{ "text": string, "sourceSegments": number[] }],
  "painScores": [{ "region": string, "score": number, "sourceSegments": number[] }],
  "recommendationMentions": [{ "text": string, "sourceSegments": number[] }],
  "planItems": [{ "text": string, "sourceSegments": number[] }],
  "recapFound": boolean
}`;

export function buildExtractPrompt(transcript: readonly TranscriptSegment[], glossary: readonly GlossaryEntry[]): string {
  const lines = transcript
    .map((s) => `[${s.index}]${s.speaker ? ` ${s.speaker}:` : ""} ${s.text}`)
    .join("\n");
  const gloss = glossary.length ? glossary.map((g) => `- ${g.term}: ${g.meaning}`).join("\n") : "(none)";
  return `Glossary of the clinician's shorthand:\n${gloss}\n\nTranscript (line numbers in brackets):\n${lines}\n\nReturn JSON in exactly this shape:\n${SHAPE}`;
}

/** Stage 1: runs in the background after the patient is confirmed. */
export async function extractVisitFacts(
  llm: LlmClient,
  model: string,
  transcript: readonly TranscriptSegment[],
  glossary: readonly GlossaryEntry[],
): Promise<VisitFacts> {
  if (transcript.length === 0) throw new Error("recording has no transcript");
  const facts = await completeValidated(
    llm,
    { model, system: EXTRACT_SYSTEM, user: buildExtractPrompt(transcript, glossary), maxTokens: 4000 },
    VisitFacts,
  );
  // Drop any fact that cites a line that doesn't exist: it cannot be traced back.
  const max = transcript.length - 1;
  const valid = (f: { sourceSegments: number[] }) => f.sourceSegments.every((i) => i <= max);
  // Copy the cited lines in, from the transcript itself: the model never writes evidence.
  const byIndex = new Map(transcript.map((s) => [s.index, s]));
  const cite = <F extends { sourceSegments: number[] }>(f: F): F => ({
    ...f,
    evidence: f.sourceSegments.flatMap((i) => {
      const seg = byIndex.get(i);
      return seg ? [`${seg.speaker ? `${seg.speaker}: ` : ""}${seg.text}`] : [];
    }),
  });
  const keep = <F extends { sourceSegments: number[] }>(list: F[]) => list.filter(valid).map(cite);
  return {
    ...facts,
    complaints: keep(facts.complaints),
    findings: keep(facts.findings),
    treatments: keep(facts.treatments),
    painScores: keep(facts.painScores),
    recommendationMentions: keep(facts.recommendationMentions),
    planItems: keep(facts.planItems),
  };
}
