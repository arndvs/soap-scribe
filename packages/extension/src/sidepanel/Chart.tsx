import { useCallback, useEffect, useState } from "react";
import { SOAP_SECTIONS, type Draft, type DraftSentence, type PracticeSettings, type PriorAssignment, type SoapSection } from "@soap-scribe/shared";
import { api } from "../api.js";
import { draftToText } from "../format.js";
import { askActiveTab, onActiveTabChange } from "./tab.js";

const LABEL: Record<SoapSection, string> = {
  subjective: "Subjective",
  objective: "Objective",
  assessment: "Assessment",
  plan: "Plan",
};

/**
 * Chart view: drafts the note for the chart that's open, shows where every sentence came
 * from, lets her edit or remove lines, and inserts only on her click.
 */
export function Chart({ onError }: { onError: (m: string | null) => void }) {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [settings, setSettings] = useState<PracticeSettings | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "composing" | "inserting">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setNotice(null);
    try {
      const chart = await askActiveTab({ type: "readChart", limit: 0 });
      setPatientId(chart?.patientId ?? null);
      setDraft(chart?.patientId ? (await api.getDraft(chart.patientId)).draft : null);
      setSettings((await api.settings()).settings);
      setDirty(false);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setState("idle");
    }
  }, [onError]);

  useEffect(() => {
    void load();
    return onActiveTabChange(() => void load());
  }, [load]);

  const compose = async (withoutRecording = false) => {
    if (!patientId) return;
    setState("composing");
    try {
      const chart = await askActiveTab({ type: "readChart", limit: settings?.previousNotesToRead ?? 3 });
      const res = await api.compose({
        janePatientId: patientId,
        previousNotes: chart?.previousNotes ?? [],
        previousNotesUnavailable: !chart?.previousNotes,
        withoutRecording,
      });
      if (!res.draft) {
        setNotice("No confirmed visit for this patient yet. Confirm the recording in Today, or draft from previous notes if the visit wasn't recorded.");
      }
      setDraft(res.draft);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setState("idle");
    }
  };

  const edit = (key: SoapSection, i: number, text: string | null) => {
    if (!draft) return;
    const next = structuredClone(draft);
    if (text === null) next.sections[key].splice(i, 1);
    else next.sections[key][i] = { ...next.sections[key][i]!, text };
    setDraft(next);
    setDirty(true);
  };

  /** One click puts an earlier recommendation back in today's Plan, dated "since" (G-18). */
  const addPrior = (p: PriorAssignment) => {
    if (!draft) return;
    const next = structuredClone(draft);
    next.sections.plan.push({ text: p.planText, source: "protocol", protocolId: p.protocolId, assignedSince: p.firstAssignedOn });
    setDraft(next);
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    try {
      setDraft((await api.saveDraft(draft.id, draft.sections)).draft);
      setDirty(false);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const insert = async () => {
    if (!draft) return;
    setState("inserting");
    try {
      if (dirty) await save();
      const result = await askActiveTab({ type: "insert", expectedPatientId: draft.janePatientId, text: draftToText(draft.sections) });
      if (!result) return onError("Open the patient's chart in Jane first.");
      if (!result.ok) return onError(result.detail);
      await api.markInserted(draft.id, result.janePatientIdOnPage);
      setNotice("Inserted. Review, then save and sign the note in Jane.");
      setDraft(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setState("idle");
    }
  };

  const copy = (key: SoapSection) => draft && void navigator.clipboard.writeText(draftToText(draft.sections)[key]);

  if (state === "loading") return <p className="muted">Reading the chart…</p>;
  if (!patientId) return <p className="muted">Open a patient's chart in Jane to see or draft their note.</p>;
  if (!draft) {
    return (
      <section>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" onClick={() => void compose()} disabled={state === "composing"}>
          {state === "composing" ? "Drafting…" : "Draft today's note"}
        </button>
        <p>
          <button className="link" onClick={() => void compose(true)} disabled={state === "composing"}>
            Visit wasn't recorded? Draft from previous notes
          </button>
        </p>
      </section>
    );
  }

  const cloneWarning =
    draft.similarityToLast !== undefined && settings && draft.similarityToLast >= settings.cloneWarningThreshold;

  return (
    <section>
      {notice && <p className="notice">{notice}</p>}
      {cloneWarning && (
        <p className="warning">This note is almost the same as the last one. Add anything specific to today?</p>
      )}
      {draft.flags.length > 0 && (
        <ul className="flags">
          {draft.flags.map((f, i) => (
            <li key={i}>
              <strong>{LABEL[f.section]}:</strong> {f.reason}
            </li>
          ))}
        </ul>
      )}
      {SOAP_SECTIONS.map((key) => (
        <div key={key} className="section">
          <div className="row">
            <h3>{LABEL[key]}</h3>
            <button className="link" onClick={() => copy(key)}>Copy</button>
          </div>
          {key === "plan" && draft.priorAssignments && (
            <PriorStrip items={draft.priorAssignments} inPlan={new Set(draft.sections.plan.flatMap((s) => (s.protocolId ? [s.protocolId] : [])))} onAdd={addPrior} />
          )}
          {draft.sections[key].length === 0 && <p className="muted">Empty</p>}
          {draft.sections[key].map((s, i) => (
            <Sentence key={i} s={s} onChange={(t) => edit(key, i, t)} onRemove={() => edit(key, i, null)} />
          ))}
        </div>
      ))}
      <div className="row sticky">
        {dirty && <button onClick={save}>Save edits</button>}
        <button className="primary" onClick={insert} disabled={state === "inserting"}>
          {state === "inserting" ? "Inserting…" : "Insert into Jane"}
        </button>
        <button className="link" onClick={() => void compose(Boolean(draft.withoutRecording))}>Redraft</button>
      </div>
    </section>
  );
}

function Sentence({ s, onChange, onRemove }: { s: DraftSentence; onChange: (t: string) => void; onRemove: () => void }) {
  const chip =
    s.source === "carried"
      ? `from ${s.fromNoteDate}`
      : s.source === "updated"
        ? `updated from ${s.fromNoteDate}`
        : s.source === "protocol"
          ? s.assignedSince
            ? "library · given before"
            : "library · new today"
          : null;
  return (
    <div className={`sentence ${s.source}`} title={s.source === "updated" ? `Was: ${s.previousText}` : undefined}>
      <textarea
        value={s.text}
        rows={Math.max(1, Math.ceil(s.text.length / 48))}
        readOnly={s.source === "protocol"}
        onChange={(e) => onChange(e.target.value)}
      />
      {s.evidence && s.evidence.length > 0 && (
        <details className="evidence">
          <summary>What was said</summary>
          <ul>
            {s.evidence.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="meta">
        {chip && <span className="chip">{chip}</span>}
        <button className="link" onClick={onRemove} aria-label="Remove line">Remove</button>
      </div>
    </div>
  );
}

/**
 * Everything this patient was given on earlier visits, with dates (gap G-18): the
 * summary she builds today by scrolling back through old notes in Jane.
 */
function PriorStrip({
  items,
  inPlan,
  onAdd,
}: {
  items: PriorAssignment[];
  inPlan: Set<string>;
  onAdd: (p: PriorAssignment) => void;
}) {
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}/${y!.slice(2)}`;
  };
  return (
    <details className="prior" open={items.length <= 4}>
      <summary>
        Given before ({items.length}): {items.map((p) => p.title).join(", ")}
      </summary>
      <ul>
        {items.map((p) => (
          <li key={p.protocolId} className="row">
            <span>
              <strong>{p.title}</strong>
              {p.phase && <span className="muted"> · {p.phase}</span>}
              <span className="muted">
                {" "}· since {fmt(p.firstAssignedOn)}
                {p.timesAssigned > 1 ? `, ${p.timesAssigned} visits, last ${fmt(p.lastAssignedOn)}` : ""}
              </span>
            </span>
            {inPlan.has(p.protocolId) ? (
              <span className="chip">in today's Plan</span>
            ) : (
              <button className="link" onClick={() => onAdd(p)}>Add to Plan</button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
