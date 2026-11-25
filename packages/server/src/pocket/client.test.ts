import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  HttpPocketClient,
  PocketTranscriptError,
  parseRecording,
  parseWebhook,
  verifyPocketSignature,
} from "./client.js";

// Shapes from https://docs.heypocketai.com/docs/api, with synthetic values.
const details = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    id: "rec_123",
    title: "Visit",
    created_at: "2026-12-01T18:46:00Z",
    recording_at: "2026-12-01T18:31:00Z",
    duration: 840,
    transcript: {
      segments: [
        { start: 0, end: 3.2, text: "How's the low back?", originalText: "How's the low back?", speaker: "SPEAKER_00", speakerName: "Clinician" },
        { start: 3.4, end: 6, text: "Better.", originalText: "Better.", speaker: "SPEAKER_01" },
        { start: 6, end: 6.5, text: "  ", originalText: "", speaker: "SPEAKER_01" },
      ],
    },
    transcript_error: "",
    ...over,
  },
});

describe("parseRecording", () => {
  it("reads the documented details response", () => {
    expect(parseRecording(details())).toEqual({
      id: "rec_123",
      startedAt: "2026-12-01T18:31:00.000Z",
      durationSeconds: 840,
      transcript: [
        { index: 0, speaker: "Clinician", startSeconds: 0, text: "How's the low back?" },
        { index: 1, speaker: "SPEAKER_01", startSeconds: 3.4, text: "Better." },
      ],
    });
  });

  it("prefers recording_at, the time the conversation happened", () => {
    expect(parseRecording(details({ recording_at: null })).startedAt).toBe("2026-12-01T18:46:00.000Z");
  });

  it("treats a missing transcript as not ready", () => {
    expect(parseRecording(details({ transcript: null })).transcript).toBeUndefined();
  });

  it("reports a transcription error without copying Pocket's text", () => {
    expect(() => parseRecording(details({ transcript: null, transcript_error: "failed on: some quoted words" }))).toThrow(PocketTranscriptError);
    try {
      parseRecording(details({ transcript: null, transcript_error: "failed on: some quoted words" }));
    } catch (e) {
      expect((e as Error).message).not.toContain("quoted");
    }
  });
});

describe("HttpPocketClient", () => {
  it("asks for the transcript without summaries", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(details()), { status: 200 });
    }) as typeof fetch;
    await new HttpPocketClient("pk_test", "https://pocket.example/api/v1", fetchImpl).getRecording("rec_123");
    expect(urls[0]).toBe("https://pocket.example/api/v1/public/recordings/rec_123?include_transcript=true&include_summarizations=false");
  });

  it("pages through the recordings list by UTC date", async () => {
    const urls: string[] = [];
    const pages = [
      { data: [{ id: "a" }, { id: "b" }], pagination: { has_more: true, page: 1, limit: 100, total: 3, total_pages: 2 }, success: true },
      { data: [{ id: "c" }], pagination: { has_more: false, page: 2, limit: 100, total: 3, total_pages: 2 }, success: true },
    ];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(pages.shift()), { status: 200 });
    }) as typeof fetch;
    const ids = await new HttpPocketClient("pk", "https://p", fetchImpl).listRecordingIdsSince(new Date("2026-12-01T05:00:00Z"));
    expect(ids).toEqual(["a", "b", "c"]);
    expect(urls[0]).toBe("https://p/public/recordings?start_date=2026-12-01&limit=100&page=1");
  });

  it("reports the status code, not the response body, on errors", async () => {
    const fetchImpl = (async () => new Response('{"error":"x"}', { status: 429 })) as unknown as typeof fetch;
    await expect(new HttpPocketClient("pk", "https://p", fetchImpl).getRecording("r")).rejects.toThrow("returned 429");
  });
});

describe("webhooks", () => {
  const secret = "whsec_test";
  const now = new Date("2026-12-01T18:50:00Z");
  const body = Buffer.from(JSON.stringify({ event: "transcription.completed", recording: { id: "rec_123" } }));
  const ts = String(now.getTime());
  const sig = createHmac("sha256", secret).update(`${ts}.${body.toString()}`).digest("hex");

  it("accepts a correctly signed delivery", () => {
    expect(verifyPocketSignature(body, sig, ts, secret, now)).toBe(true);
  });

  it("rejects a wrong secret, a missing header, a changed body or an old timestamp", () => {
    expect(verifyPocketSignature(body, sig, ts, "other", now)).toBe(false);
    expect(verifyPocketSignature(body, undefined, ts, secret, now)).toBe(false);
    expect(verifyPocketSignature(Buffer.from(body.toString() + " "), sig, ts, secret, now)).toBe(false);
    expect(verifyPocketSignature(body, sig, ts, secret, new Date(now.getTime() + 6 * 60_000))).toBe(false);
  });

  it("reads the event and recording ID only", () => {
    expect(parseWebhook({ event: "transcription.completed", recording: { id: "rec_123" }, user: { email: "x@example.com" } })).toEqual({
      event: "transcription.completed",
      recordingId: "rec_123",
    });
    expect(parseWebhook({ event: "x" })).toBeNull();
  });
});
