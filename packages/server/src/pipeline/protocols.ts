import type { ProtocolItem, VisitFacts } from "../domain.js";

export interface ProtocolMatch {
  mention: string;
  item: ProtocolItem;
  score: number;
}

export interface ProtocolMatchResult {
  matched: ProtocolMatch[];
  unmatched: string[];
}

const STOP = new Set(["a", "an", "the", "and", "or", "to", "of", "for", "with", "on", "in", "x", "times", "day", "daily", "per", "twice", "once", "start", "do", "your", "you", "please"]);

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

function score(mention: string, phrase: string): number {
  const m = new Set(tokens(mention));
  const p = tokens(phrase);
  if (p.length === 0 || m.size === 0) return 0;
  const hits = p.filter((w) => m.has(w)).length;
  return hits / p.length;
}

/** Share of the item's title (or best alias) words that must appear in the mention. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Deterministic matching of spoken recommendations to her library. No model is involved,
 * so a match can be explained ("all words of 'cat cow' were said") and library text is
 * never paraphrased. Unmatched mentions become flags; the clinician confirms matches.
 */
export function matchProtocols(
  mentions: VisitFacts["recommendationMentions"],
  library: readonly ProtocolItem[],
): ProtocolMatchResult {
  const matched: ProtocolMatch[] = [];
  const unmatched: string[] = [];
  for (const { text } of mentions) {
    let best: ProtocolMatch | undefined;
    for (const item of library) {
      const s = Math.max(score(text, item.title), ...item.aliases.map((a) => score(text, a)));
      if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { mention: text, item, score: s };
    }
    if (best && !matched.some((m) => m.item.id === best!.item.id)) matched.push(best);
    else if (!best) unmatched.push(text);
  }
  return { matched, unmatched };
}

/** Her exact library wording, with frequency, as it goes into the Plan. */
export function protocolSentence(item: ProtocolItem): string {
  const base = item.instruction.trim();
  return item.frequency ? `${base} (${item.frequency})` : base;
}

export type PlanDateFormat = "off" | "us" | "iso";

/** "2026-11-24" → "11/24/26" (us) or unchanged (iso). */
export function formatPlanDate(isoDate: string, format: Exclude<PlanDateFormat, "off">): string {
  if (format === "iso") return isoDate;
  const [y, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}/${y!.slice(2)}`;
}

/**
 * The Plan line with the date she would add by hand (gap G-17): "given" the first time,
 * "since" when this patient already had it. Her library wording itself is never changed.
 */
export function datedProtocolSentence(
  item: ProtocolItem,
  opts: { format: PlanDateFormat; givenOn: string; since?: string },
): string {
  const base = protocolSentence(item);
  if (opts.format === "off") return base;
  return opts.since
    ? `${base} — since ${formatPlanDate(opts.since, opts.format)}`
    : `${base} — given ${formatPlanDate(opts.givenOn, opts.format)}`;
}
