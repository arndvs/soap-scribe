import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TranscriptSegment } from "../domain.js";

/**
 * Pocket public API client. Shapes follow https://docs.heypocketai.com/docs/api
 * (get recording details, list recordings, webhooks), read 2026-11-24.
 */

export interface PocketRecording {
  id: string;
  /** When the conversation happened (`recording_at`), ISO 8601. */
  startedAt: string;
  durationSeconds?: number;
  /** Present once transcription is done. */
  transcript?: TranscriptSegment[];
}

export interface PocketClient {
  getRecording(id: string): Promise<PocketRecording>;
  /** For the reconciliation that catches missed webhooks. */
  listRecordingIdsSince(since: Date): Promise<string[]>;
}

export class PocketTranscriptError extends Error {
  constructor() {
    // Pocket's own error text is not copied: it could quote the recording.
    super("Pocket reported a transcription error for this recording");
  }
}

const Segment = z.object({
  start: z.number().optional(),
  end: z.number().optional(),
  text: z.string(),
  speaker: z.string().optional(),
  speakerName: z.string().optional(),
});

const RecordingData = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    created_at: z.string().optional(),
    recording_at: z.string().optional().nullable(),
    duration: z.number().optional().nullable(),
    transcript: z.object({ segments: z.array(Segment) }).nullable().optional(),
    transcript_error: z.string().optional().nullable(),
  })
  .passthrough();

const DetailsResponse = z.object({ success: z.boolean().optional(), data: RecordingData });

const ListResponse = z.object({
  data: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough()),
  pagination: z.object({ has_more: z.boolean() }).passthrough(),
});

export function parseRecording(raw: unknown): PocketRecording {
  const r = DetailsResponse.parse(raw).data;
  const startedAt = r.recording_at || r.created_at;
  if (!startedAt) throw new Error("Pocket recording has no recording_at or created_at");
  const segments = r.transcript?.segments ?? [];
  if (segments.length === 0 && r.transcript_error) throw new PocketTranscriptError();
  const transcript = segments
    .filter((s) => s.text.trim())
    .map((s, index) => {
      const speaker = s.speakerName || s.speaker;
      return {
        index,
        text: s.text.trim(),
        ...(speaker ? { speaker } : {}),
        ...(s.start !== undefined ? { startSeconds: s.start } : {}),
      };
    });
  return {
    id: r.id,
    startedAt: new Date(startedAt).toISOString(),
    ...(r.duration != null ? { durationSeconds: r.duration } : {}),
    ...(transcript.length ? { transcript } : {}),
  };
}

export class HttpPocketClient implements PocketClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Pocket API ${path.split("?")[0]} returned ${res.status}`);
    return res.json();
  }

  async getRecording(id: string): Promise<PocketRecording> {
    return parseRecording(
      await this.get(`/public/recordings/${encodeURIComponent(id)}?include_transcript=true&include_summarizations=false`),
    );
  }

  async listRecordingIdsSince(since: Date): Promise<string[]> {
    // Pocket filters by UTC date, so ask from the start of that UTC day.
    const startDate = since.toISOString().slice(0, 10);
    const ids: string[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = ListResponse.parse(await this.get(`/public/recordings?start_date=${startDate}&limit=100&page=${page}`));
      ids.push(...res.data.map((r) => r.id));
      if (!res.pagination.has_more) break;
    }
    return ids;
  }
}

/** Test double: recordings are added by tests. */
export class FakePocketClient implements PocketClient {
  readonly recordings = new Map<string, PocketRecording>();
  failNext = 0;

  async getRecording(id: string): Promise<PocketRecording> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Pocket API /public/recordings returned 503");
    }
    const r = this.recordings.get(id);
    if (!r) throw new Error("Pocket API /public/recordings returned 404");
    return structuredClone(r);
  }

  async listRecordingIdsSince(since: Date): Promise<string[]> {
    return [...this.recordings.values()].filter((r) => new Date(r.startedAt) >= since).map((r) => r.id);
  }
}

// ---- Webhooks ----

export const POCKET_SIGNATURE_HEADER = "x-heypocket-signature";
export const POCKET_TIMESTAMP_HEADER = "x-heypocket-timestamp";
/** Pocket doesn't set a tolerance; we reject deliveries more than 5 minutes off, against replays. */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

/**
 * HMAC-SHA256 of `{timestamp}.{rawBody}` with the webhook's signing secret, hex-encoded,
 * per Pocket's docs. The raw body must be the exact bytes received.
 */
export function verifyPocketSignature(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  now: Date,
): boolean {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() - Number(timestamp)) > WEBHOOK_TOLERANCE_MS) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Only transcription.completed creates a job: by then the transcript exists, so the
 * worker doesn't have to wait for it. Other events are acknowledged and ignored; the
 * hourly reconciliation catches anything missed.
 */
export const JOB_EVENTS = new Set(["transcription.completed"]);

const WebhookPayload = z
  .object({
    event: z.string(),
    recording: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough(),
  })
  .passthrough();

/** Reads only the event name and recording ID. The payload's transcript and user email are ignored. */
export function parseWebhook(body: unknown): { event: string; recordingId: string } | null {
  const r = WebhookPayload.safeParse(body);
  return r.success ? { event: r.data.event, recordingId: r.data.recording.id } : null;
}
