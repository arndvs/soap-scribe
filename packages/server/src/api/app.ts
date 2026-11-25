import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AppointmentSyncRequest,
  ComposeRequest,
  ConfirmRequest,
  DraftEditRequest,
  InsertedRequest,
  PracticeSettings,
  ProtocolItem,
  Template,
  assertTransition,
  type TodayItem,
} from "../domain.js";
import type { Repos } from "../repos/types.js";
import type { Clock } from "../clock.js";
import { localDate } from "../clock.js";
import { newId } from "../ids.js";
import { suggestAppointment } from "../pipeline/match.js";
import { errorText, type Logger } from "../log.js";
import { JOB_EVENTS, POCKET_SIGNATURE_HEADER, POCKET_TIMESTAMP_HEADER, parseWebhook, verifyPocketSignature } from "../pocket/client.js";
import { ConflictError, NotFoundError, type DraftService } from "../services/drafts.js";
import { previewTemplate } from "../services/preview.js";
import type { LlmClient } from "../llm/client.js";

export interface AppDeps {
  repos: Repos;
  drafts: DraftService;
  clock: Clock;
  log: Logger;
  extensionTokenHash: string;
  pocketWebhookSecret: string;
  timeZone: string;
  /** Lets the worker know new work arrived without waiting for its next poll. */
  onJobCreated?: () => void;
  /** For the Settings Preview, which composes a synthetic visit. */
  llm?: LlmClient;
  composeModel?: string;
}

export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function createApp(d: AppDeps) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Webhook: verified against the exact raw body before anything else happens.
  // Delivery is at-least-once, so duplicates must be harmless (unique pocketRecordingId).
  app.post("/webhooks/pocket", express.raw({ type: "*/*", limit: "5mb" }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const ok = verifyPocketSignature(
      raw,
      req.header(POCKET_SIGNATURE_HEADER),
      req.header(POCKET_TIMESTAMP_HEADER),
      d.pocketWebhookSecret,
      d.clock.now(),
    );
    if (!ok) {
      d.log.warn({ event: "webhook_rejected", route: "/webhooks/pocket", httpStatus: 401 });
      return res.status(401).json({ error: "invalid signature" });
    }
    let payload: ReturnType<typeof parseWebhook> = null;
    try {
      payload = parseWebhook(JSON.parse(raw.toString("utf8")));
    } catch {
      /* fall through */
    }
    if (!payload) return res.status(400).json({ error: "unrecognized payload" });
    if (!JOB_EVENTS.has(payload.event)) {
      d.log.info({ event: "webhook_ignored", status: payload.event });
      return res.status(200).json({ ok: true, ignored: true });
    }
    const { job, created } = await d.repos.jobs.upsertByRecording(payload.recordingId, d.clock.now());
    if (created) d.onJobCreated?.();
    d.log.info({ event: created ? "job_created" : "webhook_duplicate", jobId: job.id });
    return res.status(200).json({ ok: true });
  });

  // Everything below needs the extension's bearer token.
  app.use(express.json({ limit: "512kb" }));
  app.use(auth(d.extensionTokenHash));

  app.post("/appointments/sync", handle(async (req, res) => {
    const body = AppointmentSyncRequest.parse(req.body);
    await d.repos.appointments.replaceDay(
      body.date,
      // Stable IDs: re-syncing the same schedule must not orphan a job's confirmed appointment.
      body.appointments.map((a) => ({ ...a, id: appointmentId(body.date, a.janePatientId, a.start), date: body.date })),
    );
    res.json({ ok: true, count: body.appointments.length });
  }));

  app.get("/today", handle(async (_req, res) => {
    const now = d.clock.now();
    const today = localDate(now, d.timeZone);
    const appointments = await d.repos.appointments.listDay(today);
    const byId = new Map(appointments.map((a) => [a.id, a]));
    const jobs = await d.repos.jobs.listSince(new Date(now.getTime() - 24 * 3_600_000));
    const items: TodayItem[] = jobs
      .filter((j) => j.status !== "received" || j.lastError)
      .map((j) => ({
        jobId: j.id,
        status: j.status,
        ...(j.recordedAt ? { recordedAt: j.recordedAt } : {}),
        ...suggestionFor(j, appointments, byId),
        ...(j.appointmentId && byId.get(j.appointmentId) ? { confirmedAppointment: byId.get(j.appointmentId)! } : {}),
        ...(j.lastError ? { lastError: j.lastError } : {}),
      }));
    res.json({ items, appointments });
  }));

  app.post("/jobs/:id/confirm", handle(async (req, res) => {
    const { appointmentId } = ConfirmRequest.parse(req.body);
    const job = await d.repos.jobs.get(String(req.params.id));
    if (!job) throw new NotFoundError("job not found");
    const appt = await d.repos.appointments.get(appointmentId);
    if (!appt) throw new NotFoundError("appointment not found");
    const now = d.clock.now();
    // Re-confirming a ready job (wrong patient picked) sends it back through extraction.
    if (job.status === "facts_ready") {
      assertTransition("facts_ready", "needs_confirmation");
      await d.repos.jobs.transition(job.id, "facts_ready", "needs_confirmation", {}, now);
      await d.repos.facts.delete(job.id);
    } else if (job.status !== "needs_confirmation") {
      throw new ConflictError(`job is ${job.status}`);
    }
    assertTransition("needs_confirmation", "confirmed");
    const updated = await d.repos.jobs.transition(job.id, "needs_confirmation", "confirmed", {
      appointmentId: appt.id,
      janePatientId: appt.janePatientId,
      notBefore: undefined,
    }, now);
    if (!updated) throw new ConflictError("job changed; reload");
    await d.repos.audit.append({ at: now, actor: "clinician", action: "job_confirmed", jobId: job.id, janePatientId: appt.janePatientId });
    d.onJobCreated?.();
    res.json({ ok: true });
  }));

  app.post("/jobs/:id/retry", handle(async (req, res) => {
    const job = await d.repos.jobs.get(String(req.params.id));
    if (!job) throw new NotFoundError("job not found");
    if (job.status !== "failed") throw new ConflictError(`job is ${job.status}`);
    const to = job.janePatientId ? "confirmed" : "received";
    await d.repos.jobs.transition(job.id, "failed", to, { attempts: 0, notBefore: undefined }, d.clock.now());
    d.onJobCreated?.();
    res.json({ ok: true });
  }));

  app.post("/drafts/compose", handle(async (req, res) => {
    const body = ComposeRequest.parse(req.body);
    const draft = await d.drafts.compose(body.janePatientId, body.previousNotes, body.previousNotesUnavailable, body.withoutRecording);
    res.json({ draft });
  }));

  app.get("/drafts", handle(async (req, res) => {
    const janePatientId = z.string().min(1).parse(req.query.janePatientId);
    res.json({ draft: await d.drafts.get(janePatientId) });
  }));

  app.put("/drafts/:id", handle(async (req, res) => {
    const { sections } = DraftEditRequest.parse(req.body);
    res.json({ draft: await d.drafts.edit(String(req.params.id), sections) });
  }));

  app.post("/drafts/:id/inserted", handle(async (req, res) => {
    const body = InsertedRequest.parse(req.body);
    res.json({ draft: await d.drafts.markInserted(String(req.params.id), body.janePatientIdOnPage) });
  }));

  // Settings: her template, glossary and protocol library live in her database only.
  app.get("/settings", handle(async (_req, res) => {
    const settings = await d.repos.settings.getSettings();
    const template = settings ? await d.repos.settings.getTemplate(settings.activeTemplateId) : null;
    res.json({ settings, template });
  }));

  app.put("/settings", handle(async (req, res) => {
    const settings = PracticeSettings.parse({ ...req.body, updatedAt: d.clock.now().toISOString() });
    await d.repos.settings.saveSettings(settings);
    await d.repos.audit.append({ at: d.clock.now(), actor: "clinician", action: "settings_changed" });
    res.json({ settings });
  }));

  /** Saving a template always creates a new version; old versions are kept for rollback. */
  app.put("/templates/:id", handle(async (req, res) => {
    const id = String(req.params.id);
    const current = await d.repos.settings.getTemplate(id);
    const template = Template.parse({
      ...req.body,
      id,
      version: (current?.version ?? 0) + 1,
      updatedAt: d.clock.now().toISOString(),
    });
    await d.repos.settings.saveTemplateVersion(template);
    await d.repos.audit.append({ at: d.clock.now(), actor: "clinician", action: "template_changed" });
    res.json({ template });
  }));

  app.get("/templates/:id/versions", handle(async (req, res) => {
    res.json({ versions: await d.repos.settings.listTemplateVersions(String(req.params.id)) });
  }));

  /** Preview an unsaved template on a synthetic visit. No patient data is involved. */
  app.post("/settings/preview", handle(async (req, res) => {
    if (!d.llm || !d.composeModel) throw new ConflictError("preview is not configured");
    const template = Template.parse({ ...req.body, id: "preview", version: 1, updatedAt: d.clock.now().toISOString() });
    const library = await d.repos.protocols.listActive();
    res.json({ preview: await previewTemplate(d.llm, d.composeModel, template, library) });
  }));

  /** Every protocol, including inactive ones, for the Settings editor. */
  app.get("/protocols/all", handle(async (_req, res) => {
    res.json({ protocols: await d.repos.protocols.listAll() });
  }));

  app.get("/protocols", handle(async (_req, res) => {
    res.json({ protocols: await d.repos.protocols.listActive() });
  }));

  app.put("/protocols/:id", handle(async (req, res) => {
    const item = ProtocolItem.parse({ ...req.body, id: String(req.params.id) });
    await d.repos.protocols.upsert(item);
    await d.repos.audit.append({ at: d.clock.now(), actor: "clinician", action: "protocol_changed" });
    res.json({ protocol: item });
  }));

  app.get("/patients/:janePatientId/assignments", handle(async (req, res) => {
    res.json({ assignments: await d.repos.protocols.listAssignments(String(req.params.janePatientId)) });
  }));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      err instanceof z.ZodError ? 400 : err instanceof NotFoundError ? 404 : err instanceof ConflictError ? 409 : 500;
    d.log[status >= 500 ? "error" : "warn"]({ event: "request_failed", route: req.route?.path ?? req.path, httpStatus: status, error: errorText(err) });
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : status === 500
          ? "internal error"
          : errorText(err);
    res.status(status).json({ error: message });
  });

  return app;
}

/** Deterministic, opaque appointment ID from the schedule row. */
export const appointmentId = (date: string, janePatientId: string, start: string) =>
  sha256Hex(`${date}|${janePatientId}|${new Date(start).toISOString()}`).slice(0, 24);

/**
 * Recomputed while a job waits for confirmation, so a schedule synced after the
 * recording arrived (the end-of-day batch) still gets a suggestion.
 */
function suggestionFor(
  j: { status: string; recordedAt?: string; suggestedAppointmentId?: string },
  appointments: Parameters<typeof suggestAppointment>[1],
  byId: Map<string, (typeof appointments)[number]>,
) {
  const s =
    j.status === "needs_confirmation" && j.recordedAt
      ? suggestAppointment(new Date(j.recordedAt), appointments)
      : j.suggestedAppointmentId
        ? byId.get(j.suggestedAppointmentId)
        : undefined;
  return s ? { suggestedAppointment: s } : {};
}

function auth(tokenHash: string) {
  const expected = Buffer.from(tokenHash, "hex");
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const given = Buffer.from(sha256Hex(token), "hex");
    if (!token || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };
}

const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
