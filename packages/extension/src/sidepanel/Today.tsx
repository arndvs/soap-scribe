import { useCallback, useEffect, useState } from "react";
import type { TodayResponse } from "@soap-scribe/shared";
import { api } from "../api.js";
import { localToday } from "../format.js";
import { askActiveTab } from "./tab.js";

const STATUS_LABEL: Record<string, string> = {
  received: "Waiting for Pocket",
  fetched: "Matching",
  needs_confirmation: "Confirm patient",
  confirmed: "Queued",
  extracting: "Reading the visit",
  facts_ready: "Ready: open the chart",
  inserted: "Inserted",
  failed: "Failed",
};

/** Today view: sync the schedule, confirm each recording's patient, retry failures. */
export function Today({ onError }: { onError: (m: string | null) => void }) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.today());
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      const rows = await askActiveTab({ type: "readSchedule" });
      if (!rows?.length) {
        onError("Open today's schedule in Jane, then sync.");
        return;
      }
      await api.syncAppointments({ date: localToday(), appointments: rows });
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (jobId: string, appointmentId: string | undefined) => {
    if (!appointmentId) return onError("Pick the patient for this recording first.");
    try {
      await api.confirm(jobId, appointmentId);
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const retry = async (jobId: string) => {
    try {
      await api.retry(jobId);
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  if (!data) return <p className="muted">Loading today…</p>;

  return (
    <section>
      <div className="row">
        <span className="muted">{data.appointments.length} appointments synced</span>
        <button onClick={sync} disabled={busy}>
          {busy ? "Syncing…" : "Sync schedule"}
        </button>
      </div>
      {data.items.length === 0 && <p className="muted">No recordings yet today.</p>}
      <ul className="list">
        {data.items.map((item) => {
          const time = item.recordedAt
            ? new Date(item.recordedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : "—";
          const choice = picked[item.jobId] ?? item.confirmedAppointment?.id ?? item.suggestedAppointment?.id;
          const canConfirm = item.status === "needs_confirmation" || item.status === "facts_ready";
          return (
            <li key={item.jobId} className="card">
              <div className="row">
                <strong>{time}</strong>
                <span className={`badge ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
              </div>
              {canConfirm && (
                <div className="row">
                  <select value={choice ?? ""} onChange={(e) => setPicked({ ...picked, [item.jobId]: e.target.value })}>
                    <option value="">Pick patient…</option>
                    {data.appointments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {new Date(a.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {a.patientDisplayName}
                      </option>
                    ))}
                  </select>
                  {item.status === "needs_confirmation" ? (
                    <button onClick={() => confirm(item.jobId, choice)}>Confirm</button>
                  ) : (
                    choice !== item.confirmedAppointment?.id && <button onClick={() => confirm(item.jobId, choice)}>Change</button>
                  )}
                </div>
              )}
              {item.status === "facts_ready" && item.confirmedAppointment && (
                <p className="muted">Open {item.confirmedAppointment.patientDisplayName}'s chart in Jane to draft the note.</p>
              )}
              {item.status === "failed" && (
                <div className="row">
                  <span className="error">{item.lastError}</span>
                  <button onClick={() => retry(item.jobId)}>Retry</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
