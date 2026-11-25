export * from "@soap-scribe/shared";

export type AuditAction =
  | "draft_composed"
  | "draft_viewed"
  | "draft_edited"
  | "draft_inserted"
  | "job_confirmed"
  | "settings_changed"
  | "template_changed"
  | "protocol_changed"
  | "data_deleted";
