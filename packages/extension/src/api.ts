import type {
  AppointmentSyncRequest,
  ComposeRequest,
  Draft,
  DraftSections,
  PracticeSettings,
  ProtocolAssignment,
  Template,
  TodayResponse,
} from "@soap-scribe/shared";

declare const __API_URL__: string;

/** Non-secret, injected at build time from an allowlist. The token is never bundled. */
export const API_URL: string = typeof __API_URL__ === "string" ? __API_URL__ : "http://localhost:8787";

export async function getToken(): Promise<string | null> {
  const { token } = await chrome.storage.local.get("token");
  return typeof token === "string" && token ? token : null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Add your access token in the extension options first.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, "Can't reach the SOAP Scribe server. Drafts will wait; recordings are safe in Pocket.");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
  return json;
}

export const api = {
  today: () => call<TodayResponse>("GET", "/today"),
  syncAppointments: (body: AppointmentSyncRequest) => call<{ count: number }>("POST", "/appointments/sync", body),
  confirm: (jobId: string, appointmentId: string) => call("POST", `/jobs/${jobId}/confirm`, { appointmentId }),
  retry: (jobId: string) => call("POST", `/jobs/${jobId}/retry`),
  compose: (body: ComposeRequest) => call<{ draft: Draft | null }>("POST", "/drafts/compose", body),
  getDraft: (janePatientId: string) =>
    call<{ draft: Draft | null }>("GET", `/drafts?janePatientId=${encodeURIComponent(janePatientId)}`),
  saveDraft: (id: string, sections: DraftSections) => call<{ draft: Draft }>("PUT", `/drafts/${id}`, { sections }),
  markInserted: (id: string, janePatientIdOnPage: string) =>
    call<{ draft: Draft }>("POST", `/drafts/${id}/inserted`, { janePatientIdOnPage, readBackMatched: true }),
  settings: () => call<{ settings: PracticeSettings | null; template: Template | null }>("GET", "/settings"),
  assignments: (janePatientId: string) =>
    call<{ assignments: ProtocolAssignment[] }>("GET", `/patients/${encodeURIComponent(janePatientId)}/assignments`),
};
