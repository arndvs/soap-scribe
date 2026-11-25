import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { Appointment, Draft, Job, PracticeSettings, ProtocolAssignment, ProtocolItem, Template, VisitFacts } from "../domain.js";
import { newId } from "../ids.js";
import type { AuditEvent, Repos } from "./types.js";

/**
 * MongoDB implementation. Our string IDs are stored as `_id`, so no ObjectId ever
 * leaves this file. All query shapes live here, behind the interfaces in types.ts.
 */

const toDoc = <T extends { id: string }>(v: T): Document => {
  const { id, ...rest } = v;
  return { _id: id, ...rest };
};
const fromDoc = <T extends { id: string }>(d: Document | null): T | null => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return { id: String(_id), ...rest } as T;
};
const iso = (d: Date) => d.toISOString();

export interface MongoHandle {
  client: MongoClient;
  db: Db;
  repos: Repos;
  close(): Promise<void>;
}

export async function connectMongo(uri: string, dbName: string): Promise<MongoHandle> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  await ensureIndexes(db);
  return { client, db, repos: createMongoRepos(db), close: () => client.close() };
}

/** Indexes, including TTL indexes as a backstop to the cleanup job (Postgres has no TTL). */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("jobs").createIndexes([
    { key: { pocketRecordingId: 1 }, unique: true },
    { key: { status: 1, notBefore: 1, createdAt: 1 } },
    { key: { janePatientId: 1, status: 1 } },
  ]);
  await db.collection("appointments").createIndexes([
    { key: { date: 1, start: 1 } },
    { key: { syncedAt: 1 }, expireAfterSeconds: 8 * 24 * 3600 },
  ]);
  await db.collection("visitFacts").createIndexes([{ key: { savedAt: 1 }, expireAfterSeconds: 8 * 24 * 3600 }]);
  await db.collection("drafts").createIndexes([
    { key: { jobId: 1 }, unique: true },
    { key: { janePatientId: 1, status: 1 } },
  ]);
  await db.collection("templateVersions").createIndexes([{ key: { templateId: 1, version: -1 }, unique: true }]);
  await db.collection("protocolAssignments").createIndexes([{ key: { janePatientId: 1, assignedOn: -1 } }]);
  await db.collection("audit").createIndexes([{ key: { at: -1 } }]);
}

export function createMongoRepos(db: Db): Repos {
  const jobs: Collection<Document> = db.collection("jobs");
  const appts: Collection<Document> = db.collection("appointments");
  const facts: Collection<Document> = db.collection("visitFacts");
  const drafts: Collection<Document> = db.collection("drafts");
  const settings: Collection<Document> = db.collection("settings");
  const templates: Collection<Document> = db.collection("templateVersions");
  const protocols: Collection<Document> = db.collection("protocols");
  const assignments: Collection<Document> = db.collection("protocolAssignments");
  const audit: Collection<Document> = db.collection("audit");

  return {
    jobs: {
      async upsertByRecording(pocketRecordingId, now) {
        const fresh: Job = {
          id: newId(),
          pocketRecordingId,
          status: "received",
          attempts: 0,
          createdAt: iso(now),
          updatedAt: iso(now),
        };
        const res = await jobs.findOneAndUpdate(
          { pocketRecordingId },
          { $setOnInsert: toDoc(fresh) },
          { upsert: true, returnDocument: "after", includeResultMetadata: true },
        );
        const created = res.lastErrorObject?.updatedExisting === false;
        return { job: fromDoc<Job>(res.value)!, created };
      },
      async get(id) {
        return fromDoc<Job>(await jobs.findOne({ _id: id as never }));
      },
      async claimNext(statuses, to, now, leaseUntil) {
        const doc = await jobs.findOneAndUpdate(
          {
            status: { $in: [...statuses] },
            $or: [{ notBefore: { $exists: false } }, { notBefore: { $lte: iso(now) } }],
          },
          { $set: { status: to, notBefore: iso(leaseUntil), updatedAt: iso(now) } },
          { sort: { createdAt: 1 }, returnDocument: "after" },
        );
        return fromDoc<Job>(doc);
      },
      async transition(id, from, to, patch, now) {
        const { id: _ignore, ...rest } = patch as Partial<Job> & { id?: string };
        const unset = Object.fromEntries(Object.entries(rest).filter(([, v]) => v === undefined).map(([k]) => [k, ""]));
        const set = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        const doc = await jobs.findOneAndUpdate(
          { _id: id as never, status: from },
          { $set: { ...set, status: to, updatedAt: iso(now) }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { returnDocument: "after" },
        );
        return fromDoc<Job>(doc);
      },
      async listSince(since) {
        const docs = await jobs.find({ createdAt: { $gte: iso(since) } }).sort({ createdAt: 1 }).toArray();
        return docs.map((d) => fromDoc<Job>(d)!);
      },
      async findReadyForPatient(janePatientId) {
        return fromDoc<Job>(
          await jobs.findOne({ janePatientId, status: "facts_ready" }, { sort: { createdAt: -1 } }),
        );
      },
      async deleteOlderThan(before) {
        return (await jobs.deleteMany({ createdAt: { $lt: iso(before) } })).deletedCount;
      },
    },
    appointments: {
      async replaceDay(date, list) {
        await appts.deleteMany({ date });
        if (list.length) await appts.insertMany(list.map((a) => ({ ...toDoc(a), syncedAt: new Date() })));
      },
      async listDay(date) {
        const docs = await appts.find({ date }, { projection: { syncedAt: 0 } }).sort({ start: 1 }).toArray();
        return docs.map((d) => fromDoc<Appointment>(d)!);
      },
      async get(id) {
        return fromDoc<Appointment>(await appts.findOne({ _id: id as never }, { projection: { syncedAt: 0 } }));
      },
      async deleteBeforeDate(date) {
        return (await appts.deleteMany({ date: { $lt: date } })).deletedCount;
      },
    },
    facts: {
      async save(jobId, f, now) {
        await facts.replaceOne({ _id: jobId as never }, { facts: f, savedAt: now }, { upsert: true });
      },
      async get(jobId) {
        const d = await facts.findOne({ _id: jobId as never });
        return d ? (d.facts as VisitFacts) : null;
      },
      async delete(jobId) {
        await facts.deleteOne({ _id: jobId as never });
      },
      async deleteOlderThan(before) {
        return (await facts.deleteMany({ savedAt: { $lt: before } })).deletedCount;
      },
    },
    drafts: {
      async saveForJob(draft) {
        await drafts.deleteMany({ jobId: draft.jobId });
        await drafts.insertOne(toDoc(draft));
      },
      async get(id) {
        return fromDoc<Draft>(await drafts.findOne({ _id: id as never }));
      },
      async findReadyForPatient(janePatientId) {
        return fromDoc<Draft>(
          await drafts.findOne({ janePatientId, status: "draft_ready" }, { sort: { createdAt: -1 } }),
        );
      },
      async update(id, patch) {
        const { id: _ignore, ...rest } = patch as Partial<Draft> & { id?: string };
        return fromDoc<Draft>(
          await drafts.findOneAndUpdate({ _id: id as never }, { $set: rest }, { returnDocument: "after" }),
        );
      },
      async deleteInsertedBefore(before) {
        return (await drafts.deleteMany({ status: "inserted", insertedAt: { $lt: iso(before) } })).deletedCount;
      },
      async deleteUninsertedBefore(before) {
        return (await drafts.deleteMany({ status: { $ne: "inserted" }, createdAt: { $lt: iso(before) } })).deletedCount;
      },
    },
    settings: {
      async getSettings() {
        const d = await settings.findOne({ _id: "practice" as never });
        if (!d) return null;
        const { _id, ...rest } = d;
        return rest as PracticeSettings;
      },
      async saveSettings(s) {
        await settings.replaceOne({ _id: "practice" as never }, s, { upsert: true });
      },
      async getTemplate(id) {
        const d = await templates.findOne({ templateId: id }, { sort: { version: -1 } });
        return d ? templateFromDoc(d) : null;
      },
      async saveTemplateVersion(t) {
        const { id, ...rest } = t;
        await templates.insertOne({ _id: `${id}:${t.version}` as never, templateId: id, ...rest });
      },
      async listTemplateVersions(id) {
        const docs = await templates.find({ templateId: id }).sort({ version: -1 }).toArray();
        return docs.map(templateFromDoc);
      },
    },
    protocols: {
      async listActive() {
        return (await protocols.find({ active: true }).sort({ title: 1 }).toArray()).map((d) => fromDoc<ProtocolItem>(d)!);
      },
      async listAll() {
        return (await protocols.find({}).sort({ title: 1 }).toArray()).map((d) => fromDoc<ProtocolItem>(d)!);
      },
      async get(id) {
        return fromDoc<ProtocolItem>(await protocols.findOne({ _id: id as never }));
      },
      async upsert(item) {
        await protocols.replaceOne({ _id: item.id as never }, toDoc(item), { upsert: true });
      },
      async recordAssignments(list) {
        if (list.length) await assignments.insertMany(list.map((a) => toDoc(a)));
      },
      async listAssignments(janePatientId) {
        const docs = await assignments.find({ janePatientId }).sort({ assignedOn: -1 }).toArray();
        return docs.map((d) => fromDoc<ProtocolAssignment>(d)!);
      },
    },
    audit: {
      async append(e) {
        await audit.insertOne({ ...e });
      },
      async list(limit) {
        const docs = await audit.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
        return docs as unknown as AuditEvent[];
      },
    },
  };
}

function templateFromDoc(d: Document): Template {
  const { _id, templateId, ...rest } = d;
  return { id: templateId, ...rest } as Template;
}
