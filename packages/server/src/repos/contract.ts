import { describe, expect, it, beforeEach } from "vitest";
import type { Repos } from "./types.js";
import type { Draft, Template } from "../domain.js";

/**
 * Behaviour every repository implementation must have. The in-memory repos run this
 * on every test run; MongoDB runs it when TEST_MONGODB_URI is set. A future Postgres
 * implementation must pass the same suite before it replaces MongoDB.
 */
export function repoContract(name: string, make: () => Promise<Repos>) {
  describe(`repository contract: ${name}`, () => {
    let r: Repos;
    const t0 = new Date("2026-12-01T18:00:00.000Z");
    const later = (min: number) => new Date(t0.getTime() + min * 60_000);

    beforeEach(async () => {
      r = await make();
    });

    it("makes a duplicate webhook a no-op", async () => {
      const a = await r.jobs.upsertByRecording("rec-1", t0);
      const b = await r.jobs.upsertByRecording("rec-1", later(1));
      expect(a.created).toBe(true);
      expect(b.created).toBe(false);
      expect(b.job.id).toBe(a.job.id);
    });

    it("claims a job once, then again only after its lease expires", async () => {
      const { job } = await r.jobs.upsertByRecording("rec-2", t0);
      const first = await r.jobs.claimNext(["received"], "received", t0, later(10));
      expect(first?.id).toBe(job.id);
      expect(await r.jobs.claimNext(["received"], "received", later(5), later(15))).toBeNull();
      const again = await r.jobs.claimNext(["received"], "received", later(11), later(21));
      expect(again?.id).toBe(job.id);
    });

    it("only transitions from the expected status", async () => {
      const { job } = await r.jobs.upsertByRecording("rec-3", t0);
      expect(await r.jobs.transition(job.id, "fetched", "needs_confirmation", {}, t0)).toBeNull();
      const moved = await r.jobs.transition(job.id, "received", "fetched", { durationSeconds: 900 }, t0);
      expect(moved?.status).toBe("fetched");
      expect(moved?.durationSeconds).toBe(900);
    });

    it("finds the facts-ready job for a patient", async () => {
      const { job } = await r.jobs.upsertByRecording("rec-4", t0);
      await r.jobs.transition(job.id, "received", "facts_ready", { janePatientId: "p-1" }, t0);
      expect((await r.jobs.findReadyForPatient("p-1"))?.id).toBe(job.id);
      expect(await r.jobs.findReadyForPatient("p-2")).toBeNull();
    });

    it("replaces a day of appointments", async () => {
      const appt = (id: string, h: number) => ({
        id,
        date: "2026-12-01",
        start: new Date(Date.UTC(2026, 11, 1, h)).toISOString(),
        end: new Date(Date.UTC(2026, 11, 1, h, 30)).toISOString(),
        janePatientId: `p-${id}`,
        patientDisplayName: `Test ${id}`,
      });
      await r.appointments.replaceDay("2026-12-01", [appt("a", 18), appt("b", 17)]);
      await r.appointments.replaceDay("2026-12-01", [appt("c", 19)]);
      const day = await r.appointments.listDay("2026-12-01");
      expect(day.map((a) => a.id)).toEqual(["c"]);
      expect(await r.appointments.get("c")).toMatchObject({ janePatientId: "p-c" });
    });

    it("keeps one live draft per job", async () => {
      const draft = (id: string): Draft => ({
        id,
        jobId: "job-1",
        janePatientId: "p-1",
        templateId: "t-1",
        templateVersion: 1,
        sections: { subjective: [], objective: [], assessment: [], plan: [] },
        flags: [],
        status: "draft_ready",
        createdAt: t0.toISOString(),
      });
      await r.drafts.saveForJob(draft("d-1"));
      await r.drafts.saveForJob(draft("d-2"));
      expect(await r.drafts.get("d-1")).toBeNull();
      expect((await r.drafts.findReadyForPatient("p-1"))?.id).toBe("d-2");
    });

    it("deletes inserted drafts after their retention window", async () => {
      await r.drafts.saveForJob({
        id: "d-9",
        jobId: "job-9",
        janePatientId: "p-9",
        templateId: "t-1",
        templateVersion: 1,
        sections: { subjective: [], objective: [], assessment: [], plan: [] },
        flags: [],
        status: "inserted",
        createdAt: t0.toISOString(),
        insertedAt: t0.toISOString(),
      });
      expect(await r.drafts.deleteInsertedBefore(later(60))).toBe(1);
      expect(await r.drafts.get("d-9")).toBeNull();
    });

    it("keeps every template version", async () => {
      const tpl = (version: number): Template => ({
        id: "t-1",
        name: "Daily visit",
        version,
        sections: (["subjective", "objective", "assessment", "plan"] as const).map((key) => ({
          key,
          label: key,
          required: true,
          guidance: "",
          carryRule: "today_only" as const,
        })),
        styleNotes: `v${version}`,
        examples: [],
        updatedAt: t0.toISOString(),
      });
      await r.settings.saveTemplateVersion(tpl(1));
      await r.settings.saveTemplateVersion(tpl(2));
      expect((await r.settings.getTemplate("t-1"))?.version).toBe(2);
      expect((await r.settings.listTemplateVersions("t-1")).map((t) => t.version)).toEqual([2, 1]);
      await expect(r.settings.saveTemplateVersion(tpl(2))).rejects.toThrow();
    });

    it("lists protocol assignments newest first", async () => {
      await r.protocols.recordAssignments([
        { id: "x1", janePatientId: "p-1", protocolId: "cat-cow", assignedOn: "2026-11-20", draftId: "d" },
        { id: "x2", janePatientId: "p-1", protocolId: "pillow", assignedOn: "2026-12-01", draftId: "d" },
      ]);
      expect((await r.protocols.listAssignments("p-1")).map((a) => a.id)).toEqual(["x2", "x1"]);
    });
  });
}
