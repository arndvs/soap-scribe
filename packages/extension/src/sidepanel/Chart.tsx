import { useCallback, useEffect, useState } from "react";
import { SOAP_SECTIONS, type Draft, type DraftSentence, type PracticeSettings, type SoapSection } from "@soap-scribe/shared";
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

  const compose = async () => {
    if (!patientId) return;
    setState("composing");
    try {
      const chart = await askActiveTab({ type: "readChart", limit: settings?.previousNotesToRead ?? 3 });
      const res = await api.compose({
        janePatientId: patientId,
        previousNotes: chart?.previousNotes ?? [],
        previousNotesUnavailable: !chart?.previousNotes,
      });
      if (!res.draft) setNotice("No confirmed visit for this patient yet. Confirm the recording in Today.");
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
        <button className="primary" onClick={compose} disabled={state === "composing"}>
          {state === "composing" ? "Drafting…" : "Draft today's note"}
        </button>
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
        <button className="link" onClick={compose}>Redraft</button>
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
          ? "library"
          : null;
  return (
    <div className={`sentence ${s.source}`} title={s.source === "updated" ? `Was: ${s.previousText}` : undefined}>
      <textarea
        value={s.text}
        rows={Math.max(1, Math.ceil(s.text.length / 48))}
        readOnly={s.source === "protocol"}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="meta">
        {chip && <span className="chip">{chip}</span>}
        <button className="link" onClick={onRemove} aria-label="Remove line">Remove</button>
      </div>
    </div>
  );
}
