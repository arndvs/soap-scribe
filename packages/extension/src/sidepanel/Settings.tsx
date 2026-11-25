import { useCallback, useEffect, useState } from "react";
import {
  SOAP_SECTIONS,
  type CarryRule,
  type DraftFlag,
  type DraftSections,
  type GlossaryEntry,
  type PracticeSettings,
  type ProtocolItem,
  type SoapSection,
  type Template,
} from "@soap-scribe/shared";
import { api, type TemplateInput } from "../api.js";
import { draftToText } from "../format.js";

const TEMPLATE_ID = "daily-visit";

/** Defaults for a first setup. She changes every one of them. */
const starterTemplate = (): TemplateInput => ({
  name: "Daily visit",
  sections: [
    { key: "subjective", label: "Subjective", required: true, guidance: "What the patient reports, with pain scores.", carryRule: "today_only" },
    { key: "objective", label: "Objective", required: true, guidance: "Segments and listings, technique, ROM, findings.", carryRule: "today_only" },
    { key: "assessment", label: "Assessment", required: true, guidance: "Diagnosis and progress.", carryRule: "carry" },
    { key: "plan", label: "Plan", required: true, guidance: "Visit frequency and next steps.", carryRule: "carry_unless_contradicted" },
  ],
  styleNotes: "",
  examples: [],
});

const starterSettings = (): Omit<PracticeSettings, "updatedAt"> => ({
  activeTemplateId: TEMPLATE_ID,
  glossary: [],
  previousNotesToRead: 3,
  cloneWarningThreshold: 0.85,
});

const CARRY_LABEL: Record<CarryRule, string> = {
  carry: "Carry forward",
  carry_unless_contradicted: "Carry forward unless today changes it",
  today_only: "Today only",
};

type Tab = "template" | "shorthand" | "protocols" | "history";

/**
 * Settings: her template, carry rules, shorthand and protocol library. Everything is saved
 * to her own database through the API; nothing here is in the public code.
 */
export function Settings({ onError }: { onError: (m: string | null) => void }) {
  const [tab, setTab] = useState<Tab>("template");
  const [template, setTemplate] = useState<TemplateInput | null>(null);
  const [templateId, setTemplateId] = useState(TEMPLATE_ID);
  const [version, setVersion] = useState<number | null>(null);
  const [settings, setSettings] = useState<Omit<PracticeSettings, "updatedAt"> | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.settings();
      if (res.settings && res.template) {
        const { id, version: v, updatedAt, ...rest } = res.template;
        setTemplate(rest);
        setTemplateId(id);
        setVersion(v);
        const { updatedAt: _u, ...s } = res.settings;
        setSettings(s);
      } else {
        setTemplate(starterTemplate());
        setSettings(starterSettings());
        setVersion(null);
      }
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);

  useEffect(() => void load(), [load]);

  const saveTemplate = async (t: TemplateInput) => {
    try {
      const res = await api.saveTemplate(templateId, t);
      setVersion(res.template.version);
      if (settings) await api.saveSettings({ ...settings, activeTemplateId: templateId });
      setSaved(`Saved as version ${res.template.version}.`);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      if (version === null && template) await saveTemplate(template);
      await api.saveSettings(settings);
      setSaved("Shorthand and options saved.");
    } catch (e) {
      onError((e as Error).message);
    }
  };

  if (!template || !settings) return <p className="muted">Loading settings…</p>;

  return (
    <section>
      <nav className="row">
        {(["template", "shorthand", "protocols", "history"] as const).map((t) => (
          <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => { setTab(t); setSaved(null); }}>
            {t === "template" ? "Template" : t === "shorthand" ? "Shorthand" : t === "protocols" ? "Protocols" : "History"}
          </button>
        ))}
      </nav>
      {saved && <p className="notice">{saved}</p>}
      {tab === "template" && (
        <TemplateEditor template={template} version={version} onChange={setTemplate} onSave={saveTemplate} onError={onError} />
      )}
      {tab === "shorthand" && <ShorthandEditor settings={settings} onChange={setSettings} onSave={saveSettings} />}
      {tab === "protocols" && <ProtocolEditor onError={onError} />}
      {tab === "history" && (
        <History templateId={templateId} onRestore={async (t) => { await saveTemplate(t); await load(); setTab("template"); }} onError={onError} />
      )}
      <p className="muted">
        Access token: <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>change it</button>
      </p>
    </section>
  );
}

function TemplateEditor({
  template,
  version,
  onChange,
  onSave,
  onError,
}: {
  template: TemplateInput;
  version: number | null;
  onChange: (t: TemplateInput) => void;
  onSave: (t: TemplateInput) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [preview, setPreview] = useState<{ sections: DraftSections; flags: DraftFlag[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const setSection = (key: SoapSection, patch: Partial<TemplateInput["sections"][number]>) =>
    onChange({ ...template, sections: template.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview((await api.preview(template)).preview);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addExample = () => onChange({ ...template, examples: [...template.examples, { subjective: "", objective: "", assessment: "", plan: "" }] });
  const setExample = (i: number, key: SoapSection, value: string) =>
    onChange({ ...template, examples: template.examples.map((e, j) => (j === i ? { ...e, [key]: value } : e)) });

  return (
    <div>
      <p className="muted">{version ? `Version ${version}. Saving creates a new version; old ones stay in History.` : "Not saved yet."}</p>
      <label>Template name</label>
      <input value={template.name} onChange={(e) => onChange({ ...template, name: e.target.value })} />
      {template.sections.map((s) => (
        <div key={s.key} className="card">
          <div className="row">
            <input value={s.label} onChange={(e) => setSection(s.key, { label: e.target.value })} aria-label={`${s.key} label`} />
            <label className="inline">
              <input type="checkbox" checked={s.required} onChange={(e) => setSection(s.key, { required: e.target.checked })} /> Required
            </label>
          </div>
          <label>Previous note</label>
          <select value={s.carryRule} onChange={(e) => setSection(s.key, { carryRule: e.target.value as CarryRule })}>
            {(Object.keys(CARRY_LABEL) as CarryRule[]).map((r) => (
              <option key={r} value={r}>{CARRY_LABEL[r]}</option>
            ))}
          </select>
          <label>What goes here</label>
          <textarea rows={2} value={s.guidance} onChange={(e) => setSection(s.key, { guidance: e.target.value })} />
        </div>
      ))}
      <label>Style notes</label>
      <textarea rows={3} value={template.styleNotes} placeholder="e.g. Short clauses. Spinal levels in capitals." onChange={(e) => onChange({ ...template, styleNotes: e.target.value })} />
      <label>Example notes (remove all patient details)</label>
      {template.examples.map((ex, i) => (
        <div key={i} className="card">
          {SOAP_SECTIONS.map((k) => (
            <textarea key={k} rows={2} placeholder={k} value={ex[k] ?? ""} onChange={(e) => setExample(i, k, e.target.value)} />
          ))}
          <button className="link" onClick={() => onChange({ ...template, examples: template.examples.filter((_, j) => j !== i) })}>Remove example</button>
        </div>
      ))}
      {template.examples.length < 10 && <button onClick={addExample}>Add example</button>}
      <div className="row sticky">
        <button onClick={runPreview} disabled={busy}>{busy ? "Previewing…" : "Preview"}</button>
        <button className="primary" onClick={() => void onSave(template)}>Save template</button>
      </div>
      {preview && (
        <div className="card">
          <p className="muted">Preview on a made-up visit (no patient data):</p>
          {SOAP_SECTIONS.map((k) => (
            <p key={k}><strong>{template.sections.find((s) => s.key === k)?.label}:</strong> {draftToText(preview.sections)[k] || <em>empty</em>}</p>
          ))}
          {preview.flags.map((f, i) => <p key={i} className="muted">Flag: {f.reason}</p>)}
        </div>
      )}
    </div>
  );
}

function ShorthandEditor({
  settings,
  onChange,
  onSave,
}: {
  settings: Omit<PracticeSettings, "updatedAt">;
  onChange: (s: Omit<PracticeSettings, "updatedAt">) => void;
  onSave: () => Promise<void>;
}) {
  const setEntry = (i: number, patch: Partial<GlossaryEntry>) =>
    onChange({ ...settings, glossary: settings.glossary.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return (
    <div>
      <p className="muted">Your abbreviations and shorthand, so the transcript is read the way you mean it.</p>
      {settings.glossary.map((g, i) => (
        <div key={i} className="row">
          <input value={g.term} placeholder="div" onChange={(e) => setEntry(i, { term: e.target.value })} />
          <input value={g.meaning} placeholder="Diversified technique" onChange={(e) => setEntry(i, { meaning: e.target.value })} />
          <button className="link" onClick={() => onChange({ ...settings, glossary: settings.glossary.filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...settings, glossary: [...settings.glossary, { term: "", meaning: "" }] })}>Add shorthand</button>
      <label>Previous notes to read from the chart</label>
      <input type="number" min={0} max={5} value={settings.previousNotesToRead} onChange={(e) => onChange({ ...settings, previousNotesToRead: Number(e.target.value) })} />
      <label>Remind me when a note is this similar to the last one</label>
      <select value={settings.cloneWarningThreshold} onChange={(e) => onChange({ ...settings, cloneWarningThreshold: Number(e.target.value) })}>
        <option value={0.75}>75%</option>
        <option value={0.85}>85%</option>
        <option value={0.95}>95%</option>
        <option value={1}>Only when identical</option>
      </select>
      <label>Date the recommendations in Plan</label>
      <select value={settings.planDateFormat ?? "us"} onChange={(e) => onChange({ ...settings, planDateFormat: e.target.value as NonNullable<PracticeSettings["planDateFormat"]> })}>
        <option value="us">Yes: "— given 11/24/26", or "— since" if given before</option>
        <option value="iso">Yes: "— given 2026-11-24"</option>
        <option value="off">No dates</option>
      </select>
      <div className="row sticky">
        <button className="primary" onClick={() => void onSave()} disabled={settings.glossary.some((g) => !g.term || !g.meaning)}>Save</button>
      </div>
    </div>
  );
}

const blankProtocol = (): ProtocolItem => ({
  id: crypto.randomUUID(),
  title: "",
  instruction: "",
  category: "home_exercise",
  aliases: [],
  active: true,
});

function ProtocolEditor({ onError }: { onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ProtocolItem[] | null>(null);
  const [editing, setEditing] = useState<ProtocolItem | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setItems((await api.protocols()).protocols);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);
  useEffect(() => void load(), [load]);

  const save = async (p: ProtocolItem) => {
    try {
      await api.saveProtocol({ ...p, aliases: p.aliases.map((a) => a.trim()).filter(Boolean) });
      setEditing(null);
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  if (!items) return <p className="muted">Loading protocols…</p>;
  if (editing) {
    const set = (patch: Partial<ProtocolItem>) => setEditing({ ...editing, ...patch });
    return (
      <div>
        <label>Title</label>
        <input value={editing.title} onChange={(e) => set({ title: e.target.value })} />
        <label>Your exact wording (goes into the Plan as written)</label>
        <textarea rows={3} value={editing.instruction} onChange={(e) => set({ instruction: e.target.value })} />
        <label>Category</label>
        <select value={editing.category} onChange={(e) => set({ category: e.target.value as ProtocolItem["category"] })}>
          <option value="home_exercise">Home exercise</option>
          <option value="daily_living">Daily living</option>
          <option value="nutrition">Nutrition</option>
          <option value="other">Other</option>
        </select>
        <label>Care phase (optional)</label>
        <input value={editing.phase ?? ""} placeholder="Foundational" onChange={(e) => set({ phase: e.target.value || undefined })} />
        <label>Frequency</label>
        <input value={editing.frequency ?? ""} placeholder="2x/day" onChange={(e) => set({ frequency: e.target.value || undefined })} />
        <label>Contraindications</label>
        <input value={editing.contraindications ?? ""} onChange={(e) => set({ contraindications: e.target.value || undefined })} />
        <label>Other ways you say it (comma-separated)</label>
        <input value={editing.aliases.join(", ")} onChange={(e) => set({ aliases: e.target.value.split(",") })} />
        <label className="inline">
          <input type="checkbox" checked={editing.active} onChange={(e) => set({ active: e.target.checked })} /> In use
        </label>
        <div className="row sticky">
          <button onClick={() => setEditing(null)}>Cancel</button>
          <button className="primary" disabled={!editing.title || !editing.instruction} onClick={() => void save(editing)}>Save</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <button className="primary" onClick={() => setEditing(blankProtocol())}>Add protocol</button>
      {items.length === 0 && <p className="muted">No protocols yet. Add the recommendations you usually paste from your Google Doc.</p>}
      {items.length > 8 && (
        <input type="search" placeholder="Find a protocol" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a protocol" />
      )}
      {CATEGORIES.map(([cat, label]) => {
        const group = items.filter((p) => p.category === cat && matches(p, query));
        if (group.length === 0) return null;
        return (
          <section key={cat}>
            <h3>{label} <span className="muted">({group.length})</span></h3>
            <ul className="list">
              {group.map((p) => (
                <li key={p.id} className="card">
                  <div className="row">
                    <strong>{p.title}</strong>
                    <span className="muted">{p.active ? [p.phase, p.frequency].filter(Boolean).join(" · ") : "not in use"}</span>
                  </div>
                  <p className="muted">{p.instruction}</p>
                  <button className="link" onClick={() => setEditing(p)}>Edit</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const CATEGORIES: Array<[ProtocolItem["category"], string]> = [
  ["home_exercise", "Home exercises"],
  ["daily_living", "Daily living"],
  ["nutrition", "Nutrition"],
  ["other", "Other"],
];

const matches = (p: ProtocolItem, q: string) => {
  const t = q.trim().toLowerCase();
  return !t || [p.title, p.instruction, p.phase ?? "", ...p.aliases].some((x) => x.toLowerCase().includes(t));
};

function History({
  templateId,
  onRestore,
  onError,
}: {
  templateId: string;
  onRestore: (t: TemplateInput) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [versions, setVersions] = useState<Template[] | null>(null);
  useEffect(() => {
    api.templateVersions(templateId).then((r) => setVersions(r.versions), (e: Error) => onError(e.message));
  }, [templateId, onError]);
  if (!versions) return <p className="muted">Loading history…</p>;
  if (versions.length === 0) return <p className="muted">No saved versions yet.</p>;
  return (
    <ul className="list">
      {versions.map((v, i) => (
        <li key={v.version} className="card">
          <div className="row">
            <strong>Version {v.version}</strong>
            <span className="muted">{new Date(v.updatedAt).toLocaleString()}</span>
          </div>
          {i > 0 && (
            <button onClick={() => { const { id, version, updatedAt, ...rest } = v; void onRestore(rest); }}>
              Restore as a new version
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
