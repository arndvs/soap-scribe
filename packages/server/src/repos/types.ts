import type {
  Appointment,
  AuditAction,
  Draft,
  Job,
  JobStatus,
  PracticeSettings,
  ProtocolAssignment,
  ProtocolItem,
  Template,
  VisitFacts,
} from "../domain.js";

/**
 * Every read and write goes through these interfaces. MongoDB implements them today;
 * a Drizzle/Postgres implementation can replace them without touching the worker,
 * pipeline or API. See ARCHITECTURE.md, "Built on MongoDB now, ready to move later".
 */

export interface JobRepo {
  /** Creates the job if no job exists for this recording. Returns the job and whether it was new. */
  upsertByRecording(pocketRecordingId: string, now: Date): Promise<{ job: Job; created: boolean }>;
  get(id: string): Promise<Job | null>;
  /**
   * Atomically claims the oldest job in one of `statuses` whose notBefore has passed,
   * moving it to `to` and leasing it until `leaseUntil` (stored in notBefore).
   * A worker that crashes simply lets the lease expire, and the job is claimed again.
   * Returns null when nothing is ready.
   */
  claimNext(statuses: readonly JobStatus[], to: JobStatus, now: Date, leaseUntil: Date): Promise<Job | null>;
  /** Moves a job only if it is still in `from` (optimistic). Returns the updated job or null. */
  transition(id: string, from: JobStatus, to: JobStatus, patch: Partial<Job>, now: Date): Promise<Job | null>;
  listSince(since: Date): Promise<Job[]>;
  findReadyForPatient(janePatientId: string): Promise<Job | null>;
  deleteOlderThan(before: Date): Promise<number>;
}

export interface AppointmentRepo {
  /** Replaces all appointments for a practice-local date. */
  replaceDay(date: string, appointments: Appointment[]): Promise<void>;
  listDay(date: string): Promise<Appointment[]>;
  get(id: string): Promise<Appointment | null>;
  deleteBeforeDate(date: string): Promise<number>;
}

export interface FactsRepo {
  save(jobId: string, facts: VisitFacts, now: Date): Promise<void>;
  get(jobId: string): Promise<VisitFacts | null>;
  delete(jobId: string): Promise<void>;
  deleteOlderThan(before: Date): Promise<number>;
}

export interface DraftRepo {
  /** One live draft per job: composing again replaces it. */
  saveForJob(draft: Draft): Promise<void>;
  get(id: string): Promise<Draft | null>;
  findReadyForPatient(janePatientId: string): Promise<Draft | null>;
  update(id: string, patch: Partial<Draft>): Promise<Draft | null>;
  deleteInsertedBefore(before: Date): Promise<number>;
  deleteUninsertedBefore(before: Date): Promise<number>;
}

export interface SettingsRepo {
  getSettings(): Promise<PracticeSettings | null>;
  saveSettings(settings: PracticeSettings): Promise<void>;
  getTemplate(id: string): Promise<Template | null>;
  /** Saves a new version; the previous one stays in version history. */
  saveTemplateVersion(template: Template): Promise<void>;
  listTemplateVersions(id: string): Promise<Template[]>;
}

export interface ProtocolRepo {
  listActive(): Promise<ProtocolItem[]>;
  listAll(): Promise<ProtocolItem[]>;
  get(id: string): Promise<ProtocolItem | null>;
  upsert(item: ProtocolItem): Promise<void>;
  recordAssignments(assignments: ProtocolAssignment[]): Promise<void>;
  listAssignments(janePatientId: string): Promise<ProtocolAssignment[]>;
}

export interface AuditEvent {
  at: Date;
  actor: "clinician" | "system";
  action: AuditAction;
  draftId?: string;
  jobId?: string;
  janePatientId?: string;
}

export interface AuditRepo {
  /** Append-only. There is no update or delete. */
  append(event: AuditEvent): Promise<void>;
  list(limit: number): Promise<AuditEvent[]>;
}

export interface Repos {
  jobs: JobRepo;
  appointments: AppointmentRepo;
  facts: FactsRepo;
  drafts: DraftRepo;
  settings: SettingsRepo;
  protocols: ProtocolRepo;
  audit: AuditRepo;
}
