/**
 * Settings overlay — edit every profile/ config artifact in-app, no file
 * editing. Structured config (profile/roles/categories) is edited as YAML and
 * server-validated on save (invalid input is rejected with inline issues, the
 * file is never corrupted). Docs (resume rules, judge rubric) and resume files
 * are plain markdown.
 */
import React, { useEffect, useState } from 'react';
import { parse, stringify } from 'yaml';
import { User, Briefcase, Tags, FileText, Scale, Files, Sparkles, X, Check, AlertCircle } from 'lucide-react';
import {
  getSettings,
  saveProfile,
  saveRoles,
  saveCategories,
  saveSkill,
  saveRubric,
  saveResume,
  testLlmConnection,
  generateAuthoring,
  type AppConfig,
  type SaveResult,
  type SettingsSnapshot,
} from '../api.js';
import { Button, cn } from './ui.js';
import { ResumeUpload } from './ResumeUpload.js';

type Tab = 'profile' | 'ai' | 'roles' | 'categories' | 'skill' | 'rubric' | 'resumes';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'ai', label: 'AI / LLM', icon: Sparkles },
  { id: 'roles', label: 'Roles', icon: Briefcase },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'skill', label: 'Resume rules', icon: FileText },
  { id: 'rubric', label: 'Judge rubric', icon: Scale },
  { id: 'resumes', label: 'Resumes', icon: Files },
];

export function Settings({ config, onClose, onSaved }: { config: AppConfig | null; onClose: () => void; onSaved: () => void }) {
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
            <YamlEditor key="profile" title="profile.yaml" hint="Your identity, enabled sources, company selection, ui_prefs." initial={snap.profile} save={saveProfile} onSaved={onSaved} />
          ) : tab === 'ai' ? (
            <AiSettings key="ai" profile={snap.profile} claudeAvailable={config?.claudeAvailable ?? false} onSaved={onSaved} />
          ) : tab === 'roles' ? (
            <YamlEditor key="roles" title="roles.yaml" hint="Your role search: title_keywords (substring matches), must_have_stack, weighted nice_to_have, excludes." initial={snap.roles} save={saveRoles} onSaved={onSaved} />
          ) : tab === 'categories' ? (
            <YamlEditor key="categories" title="categories.yaml (override)" hint="Your own job taxonomy (order + fallback + keywords). Optional — overrides the committed default." initial={snap.categories ?? { order: ['web2', 'other'], fallback: 'other', keywords: {} }} save={saveCategories} onSaved={onSaved} />
          ) : tab === 'skill' ? (
            <AuthoredDocTab key="skill" target="skill" title="Resume generation rules" hint="How the resume generator tailors your resume per job. Generate it from your resume, then refine." initial={snap.skill ?? ''} hasResume={Boolean((snap.profile as { resumes?: unknown[] } | null)?.resumes?.length)} save={saveSkill} onSaved={onSaved} />
          ) : tab === 'rubric' ? (
            <AuthoredDocTab key="rubric" target="rubric" title="Judge rubric" hint="How the fit-judge scores a JD against you. Generate it from your resume, then refine." initial={snap.rubric ?? ''} hasResume={Boolean((snap.profile as { resumes?: unknown[] } | null)?.resumes?.length)} save={saveRubric} onSaved={onSaved} />
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

/** A markdown doc (judge rubric / resume-gen rules) that can be GENERATED from the
 *  user's resume and refined in plain language — or hand-edited. Generation never
 *  auto-saves: it fills the editor and the user reviews, then Saves. */
function AuthoredDocTab({
  target,
  title,
  hint,
  initial,
  hasResume,
  save,
  onSaved,
}: {
  target: 'rubric' | 'skill';
  title: string;
  hint: string;
  initial: string;
  hasResume: boolean;
  save: (t: string) => Promise<SaveResult>;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');

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

  async function onGenerate() {
    setGenerating(true);
    setGenError(null);
    const r = await generateAuthoring(target, {
      instruction: instruction.trim() || undefined,
      currentDraft: text.trim() || undefined,
    });
    setGenerating(false);
    if (r.error || !r.markdown) {
      setGenError(r.error ?? 'Generation returned nothing — try again.');
      return;
    }
    setText(r.markdown);
    setDirty(true);
    setInstruction('');
  }

  const ctrl = 'h-8 flex-1 min-w-[12rem] rounded-lg border border-line bg-surface-2/60 px-2.5 text-xs text-ink placeholder-faint outline-none focus:border-accent disabled:opacity-50';

  return (
    <div>
      <EditorHead title={title} hint={hint} />
      {hasResume ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onGenerate} loading={generating} disabled={generating}>
            {!generating && <Sparkles className="h-3.5 w-3.5" />}
            {text.trim() ? 'Regenerate from resume' : 'Generate from my resume'}
          </Button>
          <input
            className={ctrl}
            placeholder='Refine: e.g. "stricter on location", "emphasize fintech"'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating) {
                e.preventDefault();
                onGenerate();
              }
            }}
            disabled={generating}
          />
        </div>
      ) : (
        <p className="mb-2.5 text-xs text-muted">
          Add your resume first (Resume tab) to generate this from it — or write it by hand below.
        </p>
      )}
      {generating && <p className="mb-2 text-xs text-faint">Generating from your resume… this can take up to a minute.</p>}
      {genError && <p className="mb-2 text-xs text-amber-300">{genError}</p>}
      <textarea
        className={`${ta} h-[50vh]`}
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

/** The single base resume: upload a .docx/.pdf or paste/edit Markdown, then save.
 *  Saving writes the file AND registers it in profile.resumes (one entry) so the
 *  generator and drawer find it — fixing the old "saved a file nothing references"
 *  split-brain. Single-role ⇒ exactly one resume, no picker. */
function ResumesTab({ snap, onSaved }: { snap: SettingsSnapshot; onSaved: () => void }) {
  const profile = (snap.profile ?? null) as (Record<string, unknown> & {
    resumes?: { id: string; label: string; file: string }[];
  }) | null;
  const registered = profile?.resumes ?? [];
  const file = registered[0]?.file ?? 'resumes/main.md';
  const [markdown, setMarkdown] = useState('');
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/settings/resume?file=${encodeURIComponent(file)}`)
      .then((r) => (r.ok ? r.json() : { markdown: '' }))
      .then((j) => setMarkdown(j.markdown ?? ''))
      .catch(() => setMarkdown(''));
  }, [file]);

  async function onSave() {
    setSaving(true);
    const r = await saveResume(file, markdown);
    // Register it in profile.resumes if it isn't already, so it's actually usable
    // (no more orphan files). No-op when already registered.
    if (r.ok && profile && !registered.some((x) => x.file === file)) {
      await saveProfile({ ...profile, resumes: [{ id: 'main', label: 'My Resume', file }] });
    }
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  return (
    <div>
      <EditorHead title="Resume" hint="Your base resume — the resume generator and fit-judge learn from it. Upload a .docx or .pdf to import it, or paste/edit the Markdown directly. Saving registers it automatically." />
      <ResumeUpload className="mb-2.5" onExtracted={(md) => { setMarkdown(md); setDirty(true); }} />
      <textarea
        className={`${ta} h-[50vh]`}
        value={markdown}
        onChange={(e) => {
          setMarkdown(e.target.value);
          setDirty(true);
        }}
        placeholder="# Your Name&#10;&#10;## Summary&#10;..."
        spellCheck={false}
      />
      <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
    </div>
  );
}

/* ── AI / LLM settings ────────────────────────────────────────────────────────
 * A friendly form over the profile.yaml `llm` block so the fit-judge can be
 * enabled WITHOUT hand-writing YAML into the Profile textarea. It reads the
 * current llm config from the (snake_case) parsed profile, edits a single
 * named backend + the judge toggle/min_score, and writes the FULL profile back
 * via the same validated PUT /profile the YAML editor uses (no new write path).
 * Keys stay snake_case to match profileSchema (min_score/base_url/api_key_env).
 */
export type LlmEngine = 'claude-cli' | 'openai-compatible';
export interface LlmBackend {
  engine: LlmEngine;
  model?: string;
  base_url?: string;
  api_key_env?: string;
}
export interface LlmBlock {
  backends?: Record<string, LlmBackend>;
  judge?: { enabled?: boolean; backend?: string; min_score?: number };
  resume?: { backend?: string };
}

// The single backend name this form manages. A power user with several backends
// can still edit them all via the raw Profile YAML tab; this form curates one.
const FORM_BACKEND = 'claude-cli';

/** Pure builder for the profile.yaml `llm` block from the form inputs — extracted
 *  so the snake_case shape (which MUST satisfy profileSchema) is unit-testable
 *  without rendering React. Preserves any pre-existing backends/keys; only the
 *  form's named backend + judge settings are (re)written. */
export function buildLlmBlock(
  prev: LlmBlock,
  input: { engine: LlmEngine; model: string; baseUrl: string; apiKeyEnv: string; judgeEnabled: boolean; minScore: number }
): LlmBlock {
  const backend: LlmBackend =
    input.engine === 'openai-compatible'
      ? {
          engine: input.engine,
          ...(input.model.trim() ? { model: input.model.trim() } : {}),
          ...(input.baseUrl.trim() ? { base_url: input.baseUrl.trim() } : {}),
          ...(input.apiKeyEnv.trim() ? { api_key_env: input.apiKeyEnv.trim() } : {}),
        }
      : { engine: input.engine };
  return {
    ...prev,
    backends: { ...(prev.backends ?? {}), [FORM_BACKEND]: backend },
    judge: { ...(prev.judge ?? {}), enabled: input.judgeEnabled, backend: FORM_BACKEND, min_score: input.minScore },
    resume: prev.resume ?? { backend: FORM_BACKEND },
  };
}

function AiSettings({
  profile,
  claudeAvailable,
  onSaved,
}: {
  profile: Record<string, unknown> | null;
  claudeAvailable: boolean;
  onSaved: () => void;
}) {
  const llm = ((profile?.llm as LlmBlock | undefined) ?? {}) as LlmBlock;
  const existingBackend = llm.backends?.[FORM_BACKEND];
  const judge = llm.judge ?? {};

  const [engine, setEngine] = useState<LlmEngine>(existingBackend?.engine ?? 'claude-cli');
  const [model, setModel] = useState(existingBackend?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(existingBackend?.base_url ?? '');
  const [apiKeyEnv, setApiKeyEnv] = useState(existingBackend?.api_key_env ?? '');
  const [judgeEnabled, setJudgeEnabled] = useState(judge.enabled ?? false);
  const [minScore, setMinScore] = useState(judge.min_score ?? 50);

  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const touch = () => setDirty(true);

  // A backend counts as "validated" when a connection test passed for the CURRENT
  // config, or it's the local claude CLI and we detected it on PATH. Enabling the
  // judge REQUIRES this — no more flipping the toggle on a backend that doesn't work.
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; latencyMs: number; error?: string } | null>(null);
  const claudeReady = engine === 'claude-cli' && claudeAvailable;
  const validated = claudeReady || (test?.ok ?? false);
  // changing any connection field clears a prior pass
  const touchBackend = () => {
    setDirty(true);
    setTest(null);
  };

  const backendCfg = () => ({
    engine,
    ...(model.trim() ? { model: model.trim() } : {}),
    ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
    ...(apiKeyEnv.trim() ? { api_key_env: apiKeyEnv.trim() } : {}),
  });

  async function onTest() {
    setTesting(true);
    setTest(null);
    setTest(await testLlmConnection(backendCfg()));
    setTesting(false);
  }

  async function onSave() {
    setResult(null);
    if (judgeEnabled && !validated) {
      setResult({
        ok: false,
        error:
          engine === 'claude-cli'
            ? 'Claude CLI not detected — install/log in, then Test connection before enabling the judge.'
            : 'Test the connection first — the judge needs a working backend.',
      });
      return;
    }
    setSaving(true);
    const nextLlm = buildLlmBlock(llm, { engine, model, baseUrl, apiKeyEnv, judgeEnabled, minScore });
    // Spread the whole profile so nothing else is dropped (atomic validated write).
    const nextProfile = { ...(profile ?? {}), llm: nextLlm };
    const r = await saveProfile(nextProfile);
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  const fld = 'w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-faint outline-none transition-colors focus:border-accent';
  const lbl = 'mb-1.5 block text-sm font-medium text-ink';
  const sub = 'mt-1 block text-xs text-faint';

  return (
    <div className="max-w-lg">
      <EditorHead title="AI / LLM" hint="Set up the optional fit-judge (and the backend it uses). Writes the profile.yaml llm block — validated and atomic, same as every other tab." />

      {/* CLI detection */}
      <div className={cn('mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs', claudeAvailable ? 'border-accent/40 bg-accent/10 text-accent' : 'border-amber-500/30 bg-amber-500/10 text-amber-200')}>
        {claudeAvailable ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
        Detected <span className="font-mono">claude</span> CLI: <span className="font-semibold">{claudeAvailable ? 'yes' : 'no'}</span>
        {!claudeAvailable && <span className="text-faint">— install it or use an OpenAI-compatible backend below.</span>}
      </div>

      {/* Backend engine */}
      <div className="mb-4">
        <span className={lbl}>Backend</span>
        <div className="flex gap-2">
          {(['claude-cli', 'openai-compatible'] as LlmEngine[]).map((e) => (
            <button
              key={e}
              onClick={() => { setEngine(e); touchBackend(); }}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                engine === e ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
              )}
            >
              {e === 'claude-cli' ? 'Claude CLI (local)' : 'OpenAI-compatible'}
            </button>
          ))}
        </div>
        <span className={sub}>
          {engine === 'claude-cli'
            ? 'Uses your local claude subscription — no API key needed.'
            : 'Any OpenAI-compatible API (OpenAI, Gemini, DeepSeek, OpenRouter, Ollama, …).'}
        </span>
      </div>

      {/* OpenAI-compatible fields (hidden unless that engine is picked) */}
      {engine === 'openai-compatible' && (
        <div className="mb-4 space-y-3 rounded-lg border border-line/60 bg-surface-2/30 p-3">
          <label className="block">
            <span className={lbl}>Model</span>
            <input className={fld} value={model} onChange={(e) => { setModel(e.target.value); touchBackend(); }} placeholder="gpt-4o-mini" />
          </label>
          <label className="block">
            <span className={lbl}>Base URL</span>
            <input className={fld} value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); touchBackend(); }} placeholder="https://api.openai.com/v1" />
          </label>
          <label className="block">
            <span className={lbl}>API key env var <span className="font-normal text-faint">— the NAME of the env var holding the key (never the key itself)</span></span>
            <input className={fld} value={apiKeyEnv} onChange={(e) => { setApiKeyEnv(e.target.value); touchBackend(); }} placeholder="OPENAI_API_KEY" />
            <span className={sub}>Set the actual key in your shell/env; the app reads it from this variable.</span>
          </label>
        </div>
      )}

      {/* Connection test — must pass before the judge can be enabled */}
      <div className="mb-4">
        <Button variant="secondary" size="sm" onClick={onTest} loading={testing} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        {test && (
          <p className={cn('mt-1.5 text-xs', test.ok ? 'text-accent' : 'text-amber-300')}>
            {test.ok ? `Connected — responded in ${test.latencyMs} ms.` : test.error}
          </p>
        )}
        {!test && claudeReady && (
          <p className="mt-1.5 text-xs text-faint">Local claude CLI detected — the judge can be enabled. (Test to confirm it's logged in.)</p>
        )}
      </div>

      {/* Judge toggle + floor */}
      <div className="mb-4 rounded-lg border border-line/60 bg-surface-2/30 p-3">
        <label className="flex cursor-pointer items-center gap-3">
          <span
            onClick={() => { setJudgeEnabled((v) => !v); touch(); }}
            className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', judgeEnabled ? 'bg-accent' : 'bg-line-strong')}
          >
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', judgeEnabled ? 'translate-x-4' : 'translate-x-0.5')} />
          </span>
          <span>
            <span className={cn(lbl, 'mb-0')}>Enable the fit-judge</span>
            <span className={sub}>Advisory only — adds verdict chips + sorting over matched jobs. Never hides anything.</span>
          </span>
        </label>
        <label className="mt-3 block">
          <span className={lbl}>Judge floor (min score) <span className="font-normal text-faint">— only judge jobs scoring at least this</span></span>
          <input
            type="number"
            min={0}
            max={100}
            className={cn(fld, 'w-28')}
            value={minScore}
            onChange={(e) => { setMinScore(Math.round(Math.max(0, Math.min(100, Number(e.target.value) || 0)))); touch(); }}
          />
          <span className={sub}>Default 50. The Re-judge button bypasses this floor.</span>
        </label>
      </div>

      {judgeEnabled && (
        <p className="mb-3 text-xs text-faint">
          The judge also needs a <span className="font-mono">judge-rubric.md</span> (Judge rubric tab) describing how to evaluate a JD against you.
        </p>
      )}

      <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
    </div>
  );
}
