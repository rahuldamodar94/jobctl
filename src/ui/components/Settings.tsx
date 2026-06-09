/**
 * Settings overlay — edit every profile/ config artifact in-app, no file
 * editing. Structured config (profile/roles/categories) is edited as YAML and
 * server-validated on save (invalid input is rejected with inline issues, the
 * file is never corrupted). Docs (resume rules, judge rubric) and resume files
 * are plain markdown.
 */
import React, { useEffect, useState } from 'react';
import { parse, stringify } from 'yaml';
import { User, Briefcase, Tags, FileText, Scale, Files, X, Check, AlertCircle } from 'lucide-react';
import {
  getSettings,
  saveProfile,
  saveRoles,
  saveCategories,
  saveSkill,
  saveRubric,
  saveResume,
  type SaveResult,
  type SettingsSnapshot,
} from '../api.js';
import { Button, cn } from './ui.js';

type Tab = 'profile' | 'roles' | 'categories' | 'skill' | 'rubric' | 'resumes';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'roles', label: 'Roles', icon: Briefcase },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'skill', label: 'Resume rules', icon: FileText },
  { id: 'rubric', label: 'Judge rubric', icon: Scale },
  { id: 'resumes', label: 'Resumes', icon: Files },
];

export function Settings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    getSettings().then(setSnap).catch(() => setSnap(null));
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg animate-fade-in">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <h2 className="text-base font-bold text-ink">Settings</h2>
        <span className="text-xs text-faint">Edit in-app — changes apply on the next scrape/refresh.</span>
        <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
          <X className="h-3.5 w-3.5" /> Close
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 space-y-0.5 border-r border-line p-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-surface-2 text-ink ring-1 ring-inset ring-line' : 'text-muted hover:bg-surface-2/50 hover:text-ink'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-faint')} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {!snap ? (
            <p className="text-sm text-faint">Loading…</p>
          ) : tab === 'profile' ? (
            // key per tab: these are all YamlEditor — without a distinct key
            // React reuses the instance across tabs and keeps stale text state.
            <YamlEditor key="profile" title="profile.yaml" hint="Your identity, enabled sources, company selection, exclude_categories, ui_prefs." initial={snap.profile} save={saveProfile} onSaved={onSaved} />
          ) : tab === 'roles' ? (
            <YamlEditor key="roles" title="roles.yaml" hint="One entry per role you're hunting. title_keywords are substring matches; lane is ic|em." initial={snap.roles} save={saveRoles} onSaved={onSaved} />
          ) : tab === 'categories' ? (
            <YamlEditor key="categories" title="categories.yaml (override)" hint="Your own job taxonomy (order + fallback + keywords). Optional — overrides the committed default." initial={snap.categories ?? { order: ['web2', 'other'], fallback: 'other', keywords: {} }} save={saveCategories} onSaved={onSaved} />
          ) : tab === 'skill' ? (
            <MarkdownEditor key="skill" title="RESUME_GENERATION_SKILL.md" hint="Rules the resume generator follows. Free text." initial={snap.skill ?? ''} save={saveSkill} onSaved={onSaved} />
          ) : tab === 'rubric' ? (
            <MarkdownEditor key="rubric" title="judge-rubric.md" hint="How the fit-judge evaluates a JD against you. Free text." initial={snap.rubric ?? ''} save={saveRubric} onSaved={onSaved} />
          ) : (
            <ResumesTab snap={snap} onSaved={onSaved} />
          )}
        </div>
      </div>
    </div>
  );
}

function SaveBar({ result, dirty, onSave, saving }: { result: SaveResult | null; dirty: boolean; onSave: () => void; saving: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <Button variant="primary" onClick={onSave} disabled={!dirty} loading={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
      {result?.ok && !dirty && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <Check className="h-3.5 w-3.5" /> Saved
        </span>
      )}
      {result && !result.ok && (
        <div className="flex items-start gap-1.5 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            {result.issues?.length
              ? result.issues.map((i, n) => <div key={n}>{i.path}: {i.message}</div>)
              : result.error ?? 'Save failed'}
          </div>
        </div>
      )}
    </div>
  );
}

const ta = 'w-full rounded-xl border border-line bg-surface-2/50 p-3 font-mono text-xs leading-relaxed text-ink outline-none transition-colors focus:border-accent';

function EditorHead({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <h3 className="font-mono text-sm font-semibold text-ink">{title}</h3>
      <p className="mb-2.5 mt-0.5 text-xs text-muted">{hint}</p>
    </>
  );
}

function YamlEditor({ title, hint, initial, save, onSaved }: { title: string; hint: string; initial: unknown; save: (o: unknown) => Promise<SaveResult>; onSaved: () => void }) {
  const [text, setText] = useState(() => stringify(initial ?? {}));
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function onSave() {
    setSaving(true);
    setResult(null);
    let obj: unknown;
    try {
      obj = parse(text);
    } catch (e) {
      setSaving(false);
      return setResult({ ok: false, error: `YAML parse error: ${(e as Error).message}` });
    }
    const r = await save(obj);
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  return (
    <div>
      <EditorHead title={title} hint={hint} />
      <textarea
        className={`${ta} h-[60vh]`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
      />
      <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
    </div>
  );
}

function MarkdownEditor({ title, hint, initial, save, onSaved }: { title: string; hint: string; initial: string; save: (t: string) => Promise<SaveResult>; onSaved: () => void }) {
  const [text, setText] = useState(initial);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function onSave() {
    setSaving(true);
    const r = await save(text);
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  return (
    <div>
      <EditorHead title={title} hint={hint} />
      <textarea
        className={`${ta} h-[60vh]`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
      />
      <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
    </div>
  );
}

/** List resume entries from the profile; edit each file's markdown; add new. */
function ResumesTab({ snap, onSaved }: { snap: SettingsSnapshot; onSaved: () => void }) {
  const profile = (snap.profile ?? {}) as { resumes?: { id: string; label: string; file: string }[] };
  const resumes = profile.resumes ?? [];
  const [file, setFile] = useState(resumes[0]?.file ?? '');
  const [markdown, setMarkdown] = useState('');
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Free-text new-path input has its OWN local state — typing here must NOT call
  // switchFile per keystroke (that would load a partial path → 404 → wipe the
  // editor, and spam the discard-confirm). It commits only on blur/Enter/Open.
  const [newPath, setNewPath] = useState('');

  // guard against silently discarding unsaved edits when switching files
  const switchFile = (next: string) => {
    if (next === file) return;
    if (dirty && !window.confirm('Discard unsaved changes to this resume?')) return;
    setDirty(false);
    setFile(next);
  };

  // Commit the typed path (blur / Enter / Open button) — only then do we load it.
  const openNewPath = () => {
    const next = newPath.trim();
    if (!next) return;
    switchFile(next);
  };

  useEffect(() => {
    if (!file) return setMarkdown('');
    fetch(`/api/settings/resume?file=${encodeURIComponent(file)}`)
      .then((r) => (r.ok ? r.json() : { markdown: '' }))
      .then((j) => setMarkdown(j.markdown ?? ''))
      .catch(() => setMarkdown(''));
  }, [file]);

  async function onSave() {
    setSaving(true);
    const r = await saveResume(file, markdown);
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  const ctrl = 'h-8 rounded-lg border border-line bg-surface-2/60 px-2 text-xs text-ink outline-none focus:border-accent';

  return (
    <div>
      <EditorHead title="Resumes" hint="Edit base resume markdown. To register a NEW resume (so it appears in the drawer / is usable as an IC/EM base), add an entry under resumes: in the Profile tab, then edit its file here." />
      <div className="mb-2.5 flex items-center gap-2">
        <select value={file} onChange={(e) => switchFile(e.target.value)} className={ctrl}>
          <option value="">— pick a resume —</option>
          {resumes.map((r) => (
            <option key={r.file} value={r.file}>{r.label} ({r.file})</option>
          ))}
        </select>
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onBlur={openNewPath}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              openNewPath();
            }
          }}
          placeholder="resumes/new.md"
          className={cn(ctrl, 'w-48')}
        />
        <Button variant="secondary" size="sm" onClick={openNewPath} disabled={!newPath.trim()}>
          Open
        </Button>
      </div>
      {file && (
        <>
          <textarea
            className={`${ta} h-[50vh]`}
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
          />
          <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
        </>
      )}
    </div>
  );
}
