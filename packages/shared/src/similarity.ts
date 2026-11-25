/**
 * Word-trigram Jaccard similarity between two notes, 0..1.
 * Used only for the gentle "almost the same as your last note" reminder;
 * cheap, deterministic, and good enough to spot a cloned note.
 */
export function noteSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

function trigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9/\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    if (words.length > 0) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}
