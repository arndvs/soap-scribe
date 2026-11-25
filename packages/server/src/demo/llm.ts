import type { LlmClient, LlmRequest } from "../llm/client.js";
import { COMPOSE_SYSTEM } from "../pipeline/compose.js";
import { EXTRACT_SYSTEM } from "../pipeline/extract.js";

/**
 * DEMO ONLY. A rule-based stand-in for the model so the whole flow runs offline and
 * deterministically (demo mode and the end-to-end test). It reads the same prompts the
 * real model gets and answers in the same JSON shapes, so everything after it (schema
 * validation, carry rules, protocol matching, similarity) is the real code.
 *
 * It only understands the demo transcripts' conventions: pain as "N out of ten", and a
 * spoken recap starting "Recap:". It is not a model and says nothing about draft quality.
 */
export class DemoLlmClient implements LlmClient {
  async complete(req: LlmRequest): Promise<string> {
    if (req.system === EXTRACT_SYSTEM) return JSON.stringify(extract(req.user));
    if (req.system === COMPOSE_SYSTEM) return JSON.stringify(compose(req.user));
    throw new Error("DemoLlmClient: unknown prompt");
  }
}

const NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const REGIONS = ["low back", "mid back", "neck", "shoulder", "hip"];
const TECHNIQUES = /\b(diversified|activator|webster|drop table|soft tissue|thompson)\b/i;
const SEGMENT = /\b([CTL][1-7]|SI|sacrum)\b/;
const ROM = /\b(flexion|extension|rotation|lateral bending)\b/i;
const PLAN = /\b(continue|weekly|every|return|as needed|next week)\b/i;
const HOMEWORK = /\b(pillow|wedge|cat-?cow|stretch|twice a day|daily|ice|heat)\b/i;

function pain(text: string): { region: string; score: number } | null {
  const m = text.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:out\s+)?of\s+ten\b/i);
  if (!m) return null;
  const score = NUMBERS[m[1]!.toLowerCase()] ?? Number(m[1]);
  const lower = text.toLowerCase();
  const region = REGIONS.find((r) => lower.includes(r)) ?? "pain";
  return { region, score };
}

function parseTranscript(user: string) {
  return [...user.matchAll(/^\[(\d+)\]\s*(?:(\w+):)?\s*(.*)$/gm)].map((m) => ({
    index: Number(m[1]),
    speaker: m[2] ?? "",
    text: m[3]!.trim(),
  }));
}

function extract(user: string) {
  const lines = parseTranscript(user);
  const facts = {
    complaints: [] as Array<{ text: string; sourceSegments: number[] }>,
    findings: [] as Array<{ kind: string; text: string; sourceSegments: number[] }>,
    treatments: [] as Array<{ text: string; sourceSegments: number[] }>,
    painScores: [] as Array<{ region: string; score: number; sourceSegments: number[] }>,
    recommendationMentions: [] as Array<{ text: string; sourceSegments: number[] }>,
    planItems: [] as Array<{ text: string; sourceSegments: number[] }>,
    recapFound: false,
  };
  let lastRegion = "";
  for (const line of lines) {
    const src = [line.index];
    const mentioned = REGIONS.find((r) => line.text.toLowerCase().includes(r));
    if (mentioned) lastRegion = mentioned;
    if (/^recap:/i.test(line.text)) {
      facts.recapFound = true;
      const parts = line.text.replace(/^recap:\s*/i, "").split(/\.\s*/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const p = pain(part);
        if (p) {
          if (!facts.painScores.some((x) => x.region === p.region)) facts.painScores.push({ ...p, sourceSegments: src });
        } else if (TECHNIQUES.test(part)) facts.treatments.push({ text: part, sourceSegments: src });
        else if (ROM.test(part)) facts.findings.push({ kind: "rom", text: part, sourceSegments: src });
        else if (SEGMENT.test(part)) facts.findings.push({ kind: "segment", text: part, sourceSegments: src });
        else if (PLAN.test(part)) facts.planItems.push({ text: part, sourceSegments: src });
        else facts.findings.push({ kind: "other", text: part, sourceSegments: src });
      }
      continue;
    }
    if (line.speaker === "Patient") {
      const p = pain(line.text);
      if (p) {
        facts.painScores.push({ region: p.region === "pain" ? lastRegion || "pain" : p.region, score: p.score, sourceSegments: src });
      } else {
        facts.complaints.push({ text: line.text, sourceSegments: src });
      }
      continue;
    }
    if (HOMEWORK.test(line.text)) facts.recommendationMentions.push({ text: line.text, sourceSegments: src });
  }
  return facts;
}

type Section = "subjective" | "objective" | "assessment" | "plan";
const SECTIONS: Section[] = ["subjective", "objective", "assessment", "plan"];

function parseCompose(user: string) {
  const today = user.match(/^Today's date: (\d{4}-\d{2}-\d{2})/m)?.[1] ?? "";
  const rules = Object.fromEntries(
    SECTIONS.map((s) => [s, user.match(new RegExp(`^- ${s} \\(.*carry rule: (\\w+)\\)`, "m"))?.[1] ?? "today_only"]),
  ) as Record<Section, string>;
  const noteMatch = user.match(/Note from (\d{4}-\d{2}-\d{2}):\n((?: {2}\w+: .*\n?)+)/);
  const lastNote = noteMatch
    ? {
        date: noteMatch[1]!,
        sections: Object.fromEntries(
          [...noteMatch[2]!.matchAll(/^ {2}(\w+): (.*)$/gm)].map((m) => [m[1], m[2] === "(empty)" ? "" : m[2]]),
        ) as Record<Section, string>,
      }
    : null;
  const factsJson = user.match(/Today's visit facts:\n([\s\S]*?)\n\nReturn JSON/)?.[1] ?? "{}";
  const facts = JSON.parse(factsJson) as {
    complaints: string[];
    findings: string[];
    treatments: string[];
    painScores: string[];
    planItems: string[];
  };
  return { today, rules, lastNote, facts };
}

const sentences = (text: string) =>
  text.split(/\n+|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
const end = (s: string) => (/[.!?)]$/.test(s) ? s : `${s}.`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function compose(user: string) {
  const { rules, lastNote, facts } = parseCompose(user);
  const out: Record<Section, Array<Record<string, string>>> = { subjective: [], objective: [], assessment: [], plan: [] };

  const todayBySection: Record<Section, string[]> = {
    subjective: [
      ...facts.complaints,
      ...facts.painScores.map((p) => {
        const [, region, score] = p.match(/^(.*) (\d+\/10)$/) ?? [];
        return region ? `${cap(region)} ${score}` : p;
      }),
    ],
    objective: [...facts.findings.map((f) => f.replace(/^\w+: /, "")), ...facts.treatments],
    assessment: [],
    plan: facts.planItems,
  };

  for (const s of SECTIONS) {
    const todays = todayBySection[s].map(end);
    const carried = (lastNote && rules[s] !== "today_only" ? sentences(lastNote.sections[s] ?? "") : [])
      // Recommendations come from her library afterwards, never from the model.
      .filter((line) => !(s === "plan" && HOMEWORK.test(line)));
    const usedToday = new Set<number>();

    for (const prev of carried) {
      // A previous line that today's facts restate with a new value becomes "updated".
      const idx = todays.findIndex((t, i) => !usedToday.has(i) && sameTopic(prev, t));
      if (idx >= 0) {
        usedToday.add(idx);
        const t = todays[idx]!;
        if (normalize(t) === normalize(prev)) {
          out[s].push({ text: prev, source: "carried", fromNoteDate: lastNote!.date });
        } else {
          out[s].push({ text: t, source: "updated", fromNoteDate: lastNote!.date, previousText: prev });
        }
      } else if (rules[s] === "carry_unless_contradicted" && contradicted(prev, todays)) {
        continue;
      } else {
        out[s].push({ text: prev, source: "carried", fromNoteDate: lastNote!.date });
      }
    }
    todays.forEach((t, i) => {
      if (!usedToday.has(i)) out[s].push({ text: t, source: "today" });
    });
  }
  return { sections: out, flags: [] };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]/g, "").replace(/\s+/g, " ").trim();

/** Same subject: the same pain region, the same spinal segment, the same motion, or the same visit frequency. */
function sameTopic(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const region = REGIONS.find((r) => na.includes(r) && nb.includes(r));
  if (region && /\d+\/10/.test(na) && /\d+\/10/.test(nb)) return true;
  const seg = a.match(SEGMENT)?.[1];
  if (seg && seg === b.match(SEGMENT)?.[1]) return true;
  const motion = a.match(ROM)?.[1]?.toLowerCase();
  if (motion && motion === b.match(ROM)?.[1]?.toLowerCase()) return true;
  return PLAN.test(a) && PLAN.test(b) && !HOMEWORK.test(a) && !HOMEWORK.test(b);
}

/** Today's facts cover the same kind of statement (a pain score, a segment) with different content. */
function contradicted(prev: string, todays: string[]): boolean {
  const kind = (s: string) => (/\d+\/10/.test(s) ? "pain" : SEGMENT.test(s) ? "segment" : "");
  const k = kind(prev);
  return k !== "" && todays.some((t) => kind(t) === k);
}
