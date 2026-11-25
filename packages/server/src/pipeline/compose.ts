import {
  ComposeOutput,
  SOAP_SECTIONS,
  noteSimilarity,
  sectionText,
  type DraftFlag,
  type DraftSections,
  type PreviousNote,
  type SoapSection,
  type Template,
  type VisitFacts,
} from "../domain.js";
import type { LlmClient } from "../llm/client.js";
import { completeValidated } from "../llm/json.js";
import { protocolSentence, type ProtocolMatchResult } from "./protocols.js";

export const COMPOSE_SYSTEM = `You write a clinician's SOAP note for today's visit.

Sources, and how to tag every sentence:
- "today": stated in today's visit facts.
- "carried": copied from the most recent previous note because nothing today changes it.
  Copy it closely in the clinician's own wording, and set "fromNoteDate".
- "updated": something in the previous note that today's facts change (e.g. pain 5/10 -> 3/10).
  Use today's value, set "fromNoteDate" and "previousText" (the old wording).

Rules:
- Follow each section's carry rule exactly:
  carry = start from the previous note's text for this section, then add or update with today's facts.
  carry_unless_contradicted = same, but leave out any previous line that today's facts contradict.
  today_only = use only today's facts; no carried or updated sentences.
- Today's facts always win over the previous note.
- Never invent a finding, score, segment or technique that is in neither source.
  If something the section normally needs is missing, add a flag instead.
- Do not write home-exercise or daily-living recommendations; they are added from the
  clinician's library afterwards.
- Follow the template's section guidance and the style notes. Match the examples' voice.
- One sentence or short clause per item. Reply with one JSON object and nothing else.`;

const SHAPE = `{
  "sections": {
    "subjective": [{ "text": string, "source": "today"|"carried"|"updated", "fromNoteDate"?: "YYYY-MM-DD", "previousText"?: string }],
    "objective": [ ...same ],
    "assessment": [ ...same ],
    "plan": [ ...same ]
  },
  "flags": [{ "section": "subjective"|"objective"|"assessment"|"plan", "reason": string }]
}`;

export interface ComposeInput {
  facts: VisitFacts;
  template: Template;
  previousNotes: readonly PreviousNote[];
  protocols: ProtocolMatchResult;
  /** Practice-local date of today's visit, YYYY-MM-DD. */
  visitDate: string;
}

export function buildComposePrompt(input: ComposeInput): string {
  const { facts, template, previousNotes } = input;
  const rules = template.sections
    .map((s) => `- ${s.key} ("${s.label}", ${s.required ? "required" : "optional"}, carry rule: ${s.carryRule}): ${s.guidance || "no extra guidance"}`)
    .join("\n");
  const prev = previousNotes.length
    ? previousNotes
        .map((n) => `Note from ${n.date}:\n${SOAP_SECTIONS.map((k) => `  ${k}: ${n.sections[k] ?? "(empty)"}`).join("\n")}`)
        .join("\n\n")
    : "(no previous notes available)";
  const examples = template.examples.length
    ? template.examples
        .map((e, i) => `Example ${i + 1}:\n${SOAP_SECTIONS.map((k) => `  ${k}: ${e[k] ?? ""}`).join("\n")}`)
        .join("\n\n")
    : "(none)";
  return [
    `Today's date: ${input.visitDate}`,
    `Template sections and carry rules:\n${rules}`,
    `Style notes:\n${template.styleNotes || "(none)"}`,
    `Style examples (voice only, not facts):\n${examples}`,
    `Previous notes, most recent first:\n${prev}`,
    `Today's visit facts:\n${JSON.stringify(stripSources(facts), null, 2)}`,
    `Return JSON in exactly this shape:\n${SHAPE}`,
  ].join("\n\n");
}

const stripSources = (f: VisitFacts) => ({
  complaints: f.complaints.map((x) => x.text),
  findings: f.findings.map((x) => `${x.kind}: ${x.text}`),
  treatments: f.treatments.map((x) => x.text),
  painScores: f.painScores.map((x) => `${x.region} ${x.score}/10`),
  planItems: f.planItems.map((x) => x.text),
  spokenRecapFound: f.recapFound,
});

export interface ComposedDraft {
  sections: DraftSections;
  flags: DraftFlag[];
  similarityToLast?: number;
}

/**
 * Stage 2: runs when the clinician opens the chart. The model writes S/O/A/P with source
 * tags; then deterministic rules enforce the carry rules and add her protocol library
 * text verbatim, so neither can be undone by a model mistake.
 */
export async function composeDraft(llm: LlmClient, model: string, input: ComposeInput): Promise<ComposedDraft> {
  const out = await completeValidated(
    llm,
    { model, system: COMPOSE_SYSTEM, user: buildComposePrompt(input), maxTokens: 4000 },
    ComposeOutput,
  );
  return enforceRules(out, input);
}

export function enforceRules(out: ComposeOutput, input: ComposeInput): ComposedDraft {
  const flags: DraftFlag[] = [...out.flags];
  const sections = structuredClone(out.sections) as DraftSections;
  const rules = new Map(input.template.sections.map((s) => [s.key, s.carryRule]));
  const hasPrevious = input.previousNotes.length > 0;

  for (const key of SOAP_SECTIONS) {
    const before = sections[key].length;
    sections[key] = sections[key].filter((s) => {
      if (s.source === "protocol") return false; // only added below, from the library
      if (s.source === "today") return true;
      return hasPrevious && rules.get(key) !== "today_only";
    });
    if (sections[key].length < before && hasPrevious && rules.get(key) === "today_only") {
      flags.push({ section: key, reason: "Removed carried text: this section is set to today only" });
    }
  }

  for (const m of input.protocols.matched) {
    sections.plan.push({ text: protocolSentence(m.item), source: "protocol", protocolId: m.item.id });
  }
  for (const u of input.protocols.unmatched) {
    flags.push({ section: "plan", reason: `Recommendation not found in your library: "${u}"` });
  }

  if (!input.facts.recapFound) {
    flags.push({ section: "objective", reason: "No spoken recap found; check findings and techniques" });
  }
  for (const s of input.template.sections) {
    if (s.required && sections[s.key].length === 0) {
      flags.push({ section: s.key, reason: `${s.label} is required but empty` });
    }
  }

  const last = input.previousNotes[0];
  const similarityToLast = last
    ? noteSimilarity(
        SOAP_SECTIONS.map((k) => sectionText(sections[k])).join(" "),
        SOAP_SECTIONS.map((k: SoapSection) => last.sections[k] ?? "").join(" "),
      )
    : undefined;

  return { sections, flags: dedupe(flags), ...(similarityToLast !== undefined ? { similarityToLast } : {}) };
}

const dedupe = (flags: DraftFlag[]) => {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.section}:${f.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
