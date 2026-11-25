/**
 * Day 1 check (gap G-05): calls Pocket's real API with your key and reports whether the
 * response shapes match what the code assumes. It prints SHAPES ONLY: field names, types,
 * counts, timestamps and durations. It never prints transcript text, titles, summaries
 * or speaker names, so it is safe to run on a real account and paste the output.
 *
 *   POCKET_API_KEY=pk_… pnpm --filter @soap-scribe/server pocket:check [recordingId]
 *
 * Use a role-played recording, not a patient visit.
 */
import { parseRecording, PocketTranscriptError } from "../pocket/client.js";

const key = process.env.POCKET_API_KEY;
const base = process.env.POCKET_API_BASE ?? "https://public.heypocketai.com/api/v1";
if (!key) {
  console.error("Set POCKET_API_KEY (your pk_ key). Nothing was called.");
  process.exit(2);
}

/** Replaces every value with its type, keeping structure. Arrays show length and their first item's shape. */
export function shapeOf(v: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(v)) return v.length ? [`${v.length} items, first:`, shapeOf(v[0], depth + 1)] : ["0 items"];
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  }
  return v === null ? "null" : typeof v;
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message;
    return { status: 0, body: `could not reach ${new URL(base).host}: ${cause}` };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = `(not JSON, ${text.length} bytes)`;
  }
  return { status: res.status, body };
}

const checks: Array<[string, boolean, string?]> = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push([name, ok, detail]);

const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const list = await get(`/public/recordings?start_date=${since}&limit=5&page=1`);
check("List endpoint returns 200", list.status === 200, `status ${list.status}`);
console.log("\nList response shape:\n", JSON.stringify(shapeOf(list.body), null, 2));

const listData = (list.body as { data?: Array<{ id?: unknown }> })?.data ?? [];
check("List has data[] with ids", Array.isArray((list.body as { data?: unknown })?.data) && listData.every((r) => r.id !== undefined));
check("List has pagination.has_more", typeof (list.body as { pagination?: { has_more?: unknown } })?.pagination?.has_more === "boolean");

const id = process.argv[2] ?? (listData[0]?.id !== undefined ? String(listData[0]!.id) : undefined);
if (!id) {
  check("A recording to inspect", false, "no recordings in the last 7 days; record a role-played visit and rerun");
} else {
  const detail = await get(`/public/recordings/${encodeURIComponent(id)}?include_transcript=true&include_summarizations=false`);
  check("Details endpoint returns 200", detail.status === 200, `status ${detail.status}`);
  console.log("\nDetails response shape:\n", JSON.stringify(shapeOf(detail.body), null, 2));

  const data = (detail.body as { data?: Record<string, unknown> })?.data ?? {};
  // Timestamps and duration are not patient content; print them to settle D-34.
  console.log("\nValues needed to confirm units and formats:");
  console.log("  recording_at:", JSON.stringify(data.recording_at));
  console.log("  created_at:  ", JSON.stringify(data.created_at));
  console.log("  duration:    ", JSON.stringify(data.duration), "(seconds or milliseconds? compare with the recording length)");
  const segs = (data.transcript as { segments?: Array<Record<string, unknown>> } | null)?.segments ?? [];
  console.log("  segments:    ", segs.length);
  console.log("  first segment start/end:", JSON.stringify(segs[0]?.start), JSON.stringify(segs[0]?.end));
  console.log("  segments with a speaker label:", segs.filter((s) => s.speaker || s.speakerName).length);

  check("recording_at parses as a date", typeof data.recording_at === "string" && !Number.isNaN(Date.parse(data.recording_at)));
  try {
    const rec = parseRecording(detail.body);
    check("parseRecording accepts it", true);
    check("Transcript present", Boolean(rec.transcript?.length), `${rec.transcript?.length ?? 0} segments after parsing`);
    const lagMin = (Date.now() - Date.parse(rec.startedAt)) / 60_000;
    check("startedAt is in the past", lagMin > 0, `${Math.round(lagMin)} minutes ago`);
  } catch (e) {
    check("parseRecording accepts it", false, e instanceof PocketTranscriptError ? e.message : (e as Error).message.slice(0, 200));
  }
}

console.log("\nChecks:");
for (const [name, ok, detail] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
console.log("\nRecord the result in docs/verification.md and decision D-34.");
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
