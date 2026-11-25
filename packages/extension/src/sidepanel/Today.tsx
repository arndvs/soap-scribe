import { useCallback, useEffect, useState } from "react";
import type { Appointment, TodayItem, TodayResponse } from "@soap-scribe/shared";
import { api } from "../api.js";
import { localToday } from "../format.js";
import { askActiveTab, openChartInActiveTab } from "./tab.js";
import { arrangeToday } from "./today-model.js";

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

  const { rows, unmatched, done } = arrangeToday(data);
  const openChart = (id: string) => void openChartInActiveTab(id).catch((e: Error) => onError(e.message));
  const card = (item: TodayItem, appointment?: Appointment) => (
    <JobCard
      key={item.jobId}
      item={item}
      appointment={appointment}
      appointments={data.appointments}
      choice={picked[item.jobId] ?? item.confirmedAppointment?.id ?? item.suggestedAppointment?.id}
      onPick={(v) => setPicked({ ...picked, [item.jobId]: v })}
      onConfirm={confirm}
      onRetry={retry}
      onOpenChart={openChart}
    />
  );

  return (
    <section>
      <div className="row">
        <span className="muted">{data.appointments.length} appointments synced</span>
        <button onClick={sync} disabled={busy}>
          {busy ? "Syncing…" : "Sync schedule"}
        </button>
      </div>
      {rows.length > 0 && (
        <p className="progress">
          {done} of {rows.length} notes inserted
        </p>
      )}
      {rows.length === 0 && data.items.length === 0 && <p className="muted">No recordings yet today. Open the schedule in Jane and sync.</p>}
      <ul className="list">
        {rows.map(({ appointment, item }) =>
          item ? (
            card(item, appointment)
          ) : (
            <li key={appointment.id} className="card no-recording">
              <div className="row">
                <strong>
                  {timeOf(appointment.start)} · {appointment.patientDisplayName}
                </strong>
                <span className="badge">No recording</span>
              </div>
              <p className="muted">
                Still recording, or the recorder was off? If it wasn't recorded, open the chart and draft from previous notes.
              </p>
              <button className="link" onClick={() => openChart(appointment.janePatientId)}>Open chart</button>
            </li>
          ),
        )}
      </ul>
      {unmatched.length > 0 && (
        <>
          <h3>Recordings to match</h3>
          <ul className="list">{unmatched.map((item) => card(item))}</ul>
        </>
      )}
    </section>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function JobCard({
  item,
  appointment,
  appointments,
  choice,
  onPick,
  onConfirm,
  onRetry,
  onOpenChart,
}: {
  item: TodayItem;
  appointment?: Appointment;
  appointments: Appointment[];
  choice: string | undefined;
  onPick: (appointmentId: string) => void;
  onConfirm: (jobId: string, appointmentId: string | undefined) => void;
  onRetry: (jobId: string) => void;
  onOpenChart: (janePatientId: string) => void;
}) {
  const canConfirm = item.status === "needs_confirmation" || item.status === "facts_ready";
  const heading = item.confirmedAppointment
    ? `${timeOf(item.confirmedAppointment.start)} · ${item.confirmedAppointment.patientDisplayName}`
    : appointment
      ? `${timeOf(appointment.start)} · ${appointment.patientDisplayName}?`
      : `Recorded ${item.recordedAt ? timeOf(item.recordedAt) : "—"}`;
  return (
    <li className="card">
      <div className="row">
        <strong>{heading}</strong>
        <span className={`badge ${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
      </div>
      {item.recordedAt && <p className="muted">Recording from {timeOf(item.recordedAt)}</p>}
      {canConfirm && (
        <div className="row">
          <select value={choice ?? ""} onChange={(e) => onPick(e.target.value)} aria-label="Patient for this recording">
            <option value="">Pick patient…</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {timeOf(a.start)} · {a.patientDisplayName}
              </option>
            ))}
          </select>
          {item.status === "needs_confirmation" ? (
            <button onClick={() => onConfirm(item.jobId, choice)}>Confirm</button>
          ) : (
            choice !== item.confirmedAppointment?.id && <button onClick={() => onConfirm(item.jobId, choice)}>Change</button>
          )}
        </div>
      )}
      {item.status === "facts_ready" && item.confirmedAppointment && (
        <div className="row">
          <span className="muted">Open {item.confirmedAppointment.patientDisplayName}'s chart in Jane to draft the note.</span>
          <button className="link" onClick={() => onOpenChart(item.confirmedAppointment!.janePatientId)}>Open chart</button>
        </div>
      )}
      {item.status === "failed" && (
        <div className="row">
          <span className="error">{item.lastError}</span>
          <button onClick={() => onRetry(item.jobId)}>Retry</button>
        </div>
      )}
    </li>
  );
}
