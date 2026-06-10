/**
 * Settings overlay — edit every profile/ config artifact in-app, no file
 * editing. Structured config (profile/roles/categories) is edited as YAML and
 * server-validated on save (invalid input is rejected with inline issues, the
 * file is never corrupted). Docs (resume rules, judge rubric) and resume files
 * are plain markdown.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { User, Briefcase, FileText, Scale, Files, Sparkles, X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import {
  getSettings,
  saveProfile,
  saveRoles,
  saveSkill,
  saveRubric,
  saveResume,
  testLlmConnection,
  generateAuthoring,
  generateRolesDraft,
  generateProfileDraft,
  type AppConfig,
  type SaveResult,
  type SettingsSnapshot,
  type RoleDraft,
  type ProfilePatch,
} from '../api.js';
import { Button, cn } from './ui.js';
import { ResumeUpload } from './ResumeUpload.js';
import { slug, toList } from '../role-builder.js';
import { COMMON_LOCATIONS } from '../locations.js';

export type Tab = 'profile' | 'ai' | 'roles' | 'skill' | 'rubric' | 'resumes';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'ai', label: 'AI setup', icon: Sparkles },
  { id: 'roles', label: 'Role', icon: Briefcase },
  { id: 'skill', label: 'Resume tailoring', icon: FileText },
  { id: 'rubric', label: 'Judge rubric', icon: Scale },
  { id: 'resumes', label: 'My resume', icon: Files },
];

export function Settings({ config, onClose, onSaved, initialTab }: { config: AppConfig | null; onClose: () => void; onSaved: () => void; initialTab?: Tab }) {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'profile');

  const loadSnap = useCallback(() => {
    getSettings().then(setSnap).catch(() => setSnap(null));
  }, []);
  useEffect(() => {
    loadSnap();
  }, [loadSnap]);
  // After any save, re-fetch the snapshot so a subsequent tab (which spreads the
  // full profile) writes fresh data instead of clobbering this save — then reload
  // the app (config + jobs).
  const handleSaved = useCallback(() => {
    loadSnap();
    onSaved();
  }, [loadSnap, onSaved]);

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
            <ProfileForm key="profile" profile={snap.profile} config={config} onSaved={handleSaved} />
          ) : tab === 'ai' ? (
            <AiSettings key="ai" profile={snap.profile} claudeAvailable={config?.claudeAvailable ?? false} onGoToTab={setTab} onSaved={handleSaved} />
          ) : tab === 'roles' ? (
            <RolesForm key="roles" roles={snap.roles} hasResume={Boolean((snap.profile as { resumes?: unknown[] } | null)?.resumes?.length)} onSaved={handleSaved} />
          ) : tab === 'skill' ? (
            <AuthoredDocTab key="skill" target="skill" title="Resume tailoring rules" hint="How the resume generator tailors your resume per job. Generate it from your resume, then refine." initial={snap.skill ?? ''} hasResume={Boolean((snap.profile as { resumes?: unknown[] } | null)?.resumes?.length)} save={saveSkill} onSaved={handleSaved} />
          ) : tab === 'rubric' ? (
            <AuthoredDocTab key="rubric" target="rubric" title="Judge rubric" hint="How the fit-judge scores a JD against you. Generate it from your resume, then refine." initial={snap.rubric ?? ''} hasResume={Boolean((snap.profile as { resumes?: unknown[] } | null)?.resumes?.length)} save={saveRubric} onSaved={handleSaved} />
          ) : (
            <ResumesTab snap={snap} onSaved={handleSaved} />
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

/** Reusable chip multi-select (sources, domains, locations). When onSet is
 *  passed it renders a "Select all · Clear" control wired to every option id. */
function Chips({
  options,
  selected,
  onToggle,
  onSet,
}: {
  options: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSet?: (next: Set<string>) => void;
}) {
  return (
    <div>
      {onSet && (
        <div className="mb-1.5 text-[11px] font-medium text-faint">
          <button type="button" onClick={() => onSet(new Set(options.map((o) => o.id)))} className="text-accent hover:underline">Select all</button>
          <span className="mx-1.5 text-line-strong">·</span>
          <button type="button" onClick={() => onSet(new Set())} className="hover:text-muted hover:underline">Clear</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.id);
          return (
            <button
              key={o.id}
              onClick={() => onToggle(o.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                on ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Form over the general profile.yaml fields (replaces the raw-YAML editor).
 *  Writes the FULL profile (spread + overrides) so the AI/LLM block etc. survive;
 *  the validated PUT strips any legacy keys. */
function ProfileForm({ profile, config, onSaved }: { profile: Record<string, unknown> | null; config: AppConfig | null; onSaved: () => void }) {
  const p = (profile ?? {}) as Record<string, any>;
  const [name, setName] = useState<string>(p.name ?? '');
  const [sources, setSources] = useState<Set<string>>(new Set<string>(p.enabled_sources ?? []));
  const [domains, setDomains] = useState<Set<string>>(new Set<string>(p.companies?.domains ?? []));
  const [geoPriority, setGeoPriority] = useState<Set<string>>(new Set<string>(p.geo_priority ?? []));
  const [relocationOk, setRelocationOk] = useState<Set<string>>(new Set<string>(p.geo_relocation_ok ?? []));
  const [customLoc, setCustomLoc] = useState('');
  const [maxAge, setMaxAge] = useState<number>(p.max_age_days ?? 30);
  const [inactiveAfter, setInactiveAfter] = useState<number>(p.inactive_after_days ?? 14);
  const [minScore, setMinScore] = useState<number>(p.ui_prefs?.default_min_score ?? 30);
  const [postedWithin, setPostedWithin] = useState<number>(p.ui_prefs?.default_posted_within ?? 14);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const touch = () => setDirty(true);

  const toggler = (setSet: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) => {
    setSet((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    touch();
  };
  const addCustomLoc = () => {
    const v = customLoc.trim();
    if (!v) return;
    setGeoPriority((prev) => new Set(prev).add(v));
    setCustomLoc('');
    touch();
  };
  const setter = (setSet: React.Dispatch<React.SetStateAction<Set<string>>>) => (next: Set<string>) => {
    setSet(next);
    touch();
  };

  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  function applyPatch(patch: ProfilePatch) {
    setDomains(new Set(patch.domains));
    setGeoPriority(new Set(patch.geo_priority));
    setRelocationOk(new Set(patch.geo_relocation_ok));
    touch();
  }
  const currentPatchJson = () =>
    JSON.stringify({ domains: [...domains], geo_priority: [...geoPriority], geo_relocation_ok: [...relocationOk] }, null, 2);
  async function runSuggest(refine: boolean) {
    // A fresh suggestion replaces domains/locations; guard unsaved edits against a misclick.
    if (!refine && dirty && !window.confirm('Replace the current domains & locations with fresh AI suggestions from your resume? Unsaved edits will be lost.')) {
      return;
    }
    setSuggesting(true);
    setSuggestError(null);
    const r = await generateProfileDraft({
      instruction: refine ? aiInstruction.trim() || undefined : undefined,
      currentDraft: refine ? currentPatchJson() : undefined,
    });
    setSuggesting(false);
    if (r.error || !r.patch) {
      setSuggestError(r.error ?? 'Suggestion returned nothing — try again.');
      return;
    }
    applyPatch(r.patch);
    setAiInstruction('');
  }

  const sourceOpts = (config?.availableSources ?? [...sources]).map((s) => ({ id: s, label: s }));
  const domainOpts = (config?.domains ?? []).map((d) => ({ id: d.id, label: d.label }));
  const locOpts = [...new Set([...COMMON_LOCATIONS, ...geoPriority, ...relocationOk])].map((l) => ({ id: l, label: l }));

  async function onSave() {
    setResult(null);
    if (!name.trim()) return setResult({ ok: false, error: 'Name is required.' });
    if (sources.size === 0) return setResult({ ok: false, error: 'Pick at least one source.' });
    setSaving(true);
    const next = {
      ...p,
      name: name.trim(),
      enabled_sources: [...sources],
      geo_priority: [...geoPriority],
      geo_relocation_ok: [...relocationOk],
      max_age_days: maxAge,
      inactive_after_days: inactiveAfter,
      ui_prefs: { default_min_score: minScore, default_posted_within: postedWithin },
      companies: { ...(p.companies ?? {}), domains: [...domains] },
    };
    const r = await saveProfile(next);
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  const lbl = 'mb-1.5 block text-sm font-medium text-ink';
  const sub = 'mb-1.5 block text-xs text-faint';
  const fld = 'rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-faint outline-none focus:border-accent';
  const ctrl = 'h-8 flex-1 min-w-[14rem] rounded-lg border border-line bg-surface-2/60 px-2.5 text-xs text-ink placeholder-faint outline-none focus:border-accent disabled:opacity-50';
  const num = (v: number, set: (n: number) => void, min = 1) => (
    <input type="number" min={min} className={cn(fld, 'w-24')} value={v} onChange={(e) => { set(Math.max(min, Math.round(Number(e.target.value) || min))); touch(); }} />
  );

  return (
    <div className="max-w-2xl">
      <EditorHead title="Profile" hint="Your identity, what to scrape, where you want to work, and the default triage view." />
      {(p.resumes?.length ?? 0) > 0 ? (
        <div className="mb-4 rounded-lg border border-line bg-surface-2/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => runSuggest(false)} loading={suggesting} disabled={suggesting}>
              {!suggesting && <Sparkles className="h-3.5 w-3.5" />}
              Suggest domains &amp; locations with AI
            </Button>
            <input
              className={ctrl}
              placeholder='Fine-tune: e.g. "add healthtech", "remote only"'
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !suggesting && aiInstruction.trim()) { e.preventDefault(); runSuggest(true); } }}
              disabled={suggesting}
            />
            <Button variant="secondary" size="sm" onClick={() => runSuggest(true)} loading={suggesting} disabled={suggesting || !aiInstruction.trim()}>
              Fine-tune
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-faint">AI suggests company domains and locations from your resume. Review them below, then Save.</p>
          {suggesting && <p className="mt-1 text-xs text-faint">Reading your resume… this can take up to a minute.</p>}
          {suggestError && <p className="mt-1 text-xs text-amber-300">{suggestError}</p>}
        </div>
      ) : (
        <p className="mb-4 text-xs text-muted">Add your resume (Resume tab) to let AI suggest domains &amp; locations — or pick them by hand below.</p>
      )}
      <div className="space-y-5">
        <label className="block">
          <span className={lbl}>Your name <span className="font-normal text-faint">(appears on generated resumes)</span></span>
          <input className={cn(fld, 'w-full max-w-sm')} value={name} onChange={(e) => { setName(e.target.value); touch(); }} placeholder="Jane Doe" />
        </label>

        <div>
          <span className={lbl}>Sources</span>
          <span className={sub}>Which job boards / the company-ATS registry to scrape.</span>
          <Chips options={sourceOpts} selected={sources} onToggle={toggler(setSources)} onSet={setter(setSources)} />
        </div>

        {sources.has('ats') && (
          <div>
            <span className={lbl}>Company domains</span>
            <span className={sub}>Which slices of the committed company registry to include (ATS source).</span>
            <Chips options={domainOpts} selected={domains} onToggle={toggler(setDomains)} onSet={setter(setDomains)} />
          </div>
        )}

        <div>
          <span className={lbl}>Preferred locations</span>
          <span className={sub}>+15 to the score; 'Remote' is a normal entry.</span>
          <Chips options={locOpts} selected={geoPriority} onToggle={toggler(setGeoPriority)} onSet={setter(setGeoPriority)} />
          <div className="mt-2 flex gap-2">
            <input className={cn(fld, 'w-48')} value={customLoc} placeholder="Add a location…" onChange={(e) => setCustomLoc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLoc(); } }} />
            <Button variant="secondary" size="sm" onClick={addCustomLoc} disabled={!customLoc.trim()}>Add</Button>
          </div>
        </div>

        <div>
          <span className={lbl}>Open to relocating to <span className="font-normal text-faint">(+10)</span></span>
          <Chips options={locOpts} selected={relocationOk} onToggle={toggler(setRelocationOk)} onSet={setter(setRelocationOk)} />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="block">
            <span className={lbl}>Drop board jobs older than</span>
            <span className="flex items-center gap-2">{num(maxAge, setMaxAge)}<span className="text-xs text-faint">days</span></span>
          </label>
          <label className="block">
            <span className={lbl}>Deactivate unseen jobs after</span>
            <span className="flex items-center gap-2">{num(inactiveAfter, setInactiveAfter)}<span className="text-xs text-faint">days</span></span>
          </label>
        </div>

        {/* Triage-VIEW defaults — distinct from the scraping/profile settings above:
            these only seed the triage screen's starting filters. Grouped + labeled
            so they don't read as profile facts. */}
        <div className="rounded-lg border border-line/60 bg-surface-2/30 p-3">
          <span className={lbl}>Triage view defaults</span>
          <span className={sub}>The starting filters on the triage screen — you can change score &amp; recency anytime there; this just sets the default view.</span>
          <div className="mt-2 flex flex-wrap gap-6">
            <label className="block">
              <span className="mb-1 block text-xs text-faint">Min score</span>
              <span className="flex items-center gap-2">{num(minScore, setMinScore, 0)}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-faint">Posted within</span>
              <span className="flex items-center gap-2">{num(postedWithin, setPostedWithin)}<span className="text-xs text-faint">days</span></span>
            </label>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
      </div>
    </div>
  );
}

/** Form over the single role search (replaces the raw-YAML editor). Optionally
 *  prefill from a curated template; nice_to_have weights are editable rows. */
function RolesForm({ roles, hasResume, onSaved }: { roles: Record<string, unknown> | null; hasResume: boolean; onSaved: () => void }) {
  const role = ((roles as { roles?: Record<string, any>[] } | null)?.roles?.[0] ?? {}) as Record<string, any>;
  const existingId = role.id as string | undefined;
  const [label, setLabel] = useState<string>(role.label ?? '');
  const [titleKeywords, setTitleKeywords] = useState<string>((role.title_keywords ?? []).join(', '));
  const [stack, setStack] = useState<string>((role.must_have_stack ?? []).join(', '));
  const [titleExclude, setTitleExclude] = useState<string>((role.title_exclude ?? []).join(', '));
  const [excludePrimary, setExcludePrimary] = useState<string>((role.exclude_if_primary ?? []).join(', '));
  const [niceRows, setNiceRows] = useState<{ term: string; weight: number }[]>(
    Object.entries((role.nice_to_have ?? {}) as Record<string, number>).map(([term, weight]) => ({ term, weight }))
  );
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [tuneError, setTuneError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const touch = () => setDirty(true);

  // Populate every field from a drafted/template role (the form IS the review surface).
  function applyDraft(r: RoleDraft) {
    setLabel(r.label);
    setTitleKeywords(r.title_keywords.join(', '));
    setStack(r.must_have_stack.join(', '));
    setTitleExclude((r.title_exclude ?? []).join(', '));
    setExcludePrimary((r.exclude_if_primary ?? []).join(', '));
    setNiceRows(Object.entries(r.nice_to_have ?? {}).map(([term, weight]) => ({ term, weight })));
    touch();
  }

  // Serialize the live form state into the on-disk role shape (for a fine-tune pass).
  function currentRoleJson(): string {
    const nice: Record<string, number> = {};
    for (const r of niceRows) {
      const t = r.term.trim().toLowerCase();
      if (t) nice[t] = r.weight;
    }
    return JSON.stringify(
      {
        id: existingId || slug(label),
        label: label.trim(),
        title_keywords: toList(titleKeywords),
        must_have_stack: toList(stack),
        title_exclude: toList(titleExclude),
        nice_to_have: nice,
        exclude_if_primary: toList(excludePrimary),
      },
      null,
      2
    );
  }

  // refine=false → draft from the on-disk role + resume; refine=true → revise the
  // live (possibly edited) form per the instruction.
  async function runTune(refine: boolean) {
    // A fresh draft replaces the fields; guard unsaved hand-edits against a misclick.
    if (!refine && dirty && !window.confirm('Replace the current role fields with a fresh AI draft from your resume? Unsaved edits will be lost.')) {
      return;
    }
    setTuning(true);
    setTuneError(null);
    const r = await generateRolesDraft({
      instruction: refine ? instruction.trim() || undefined : undefined,
      currentDraft: refine ? currentRoleJson() : undefined,
    });
    setTuning(false);
    if (r.error || !r.role) {
      setTuneError(r.error ?? 'Tuning returned nothing — try again.');
      return;
    }
    applyDraft(r.role);
    setInstruction('');
  }

  const setRow = (i: number, patch: Partial<{ term: string; weight: number }>) => {
    setNiceRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    touch();
  };

  async function onSave() {
    setResult(null);
    if (!label.trim()) return setResult({ ok: false, error: 'Label is required.' });
    const tk = toList(titleKeywords);
    const st = toList(stack);
    if (!tk.length) return setResult({ ok: false, error: 'Add at least one title keyword.' });
    if (!st.length) return setResult({ ok: false, error: 'Add at least one must-have stack term.' });
    const nice_to_have: Record<string, number> = {};
    for (const r of niceRows) {
      const t = r.term.trim().toLowerCase();
      if (t) nice_to_have[t] = r.weight;
    }
    setSaving(true);
    const entry = {
      id: existingId || slug(label), // keep the existing id (avoids orphaning matched rows)
      label: label.trim(),
      title_keywords: tk,
      must_have_stack: st,
      ...(toList(titleExclude).length ? { title_exclude: toList(titleExclude) } : {}),
      nice_to_have,
      ...(toList(excludePrimary).length ? { exclude_if_primary: toList(excludePrimary) } : {}),
    };
    const r = await saveRoles({ roles: [entry] });
    setResult(r);
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      onSaved();
    }
  }

  const lbl = 'mb-1.5 block text-sm font-medium text-ink';
  // base field WITHOUT a width (callers add w-full / flex-1 / w-20 as needed —
  // a baked-in w-full would fight flex-1/w-20 on the nice-to-have rows).
  const fld = 'rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-faint outline-none focus:border-accent';
  const ctrl = 'h-8 flex-1 min-w-[14rem] rounded-lg border border-line bg-surface-2/60 px-2.5 text-xs text-ink placeholder-faint outline-none focus:border-accent disabled:opacity-50';

  return (
    <div className="max-w-2xl">
      <EditorHead title="Role" hint="The single role you're hunting. Title keywords gate the match; must-have stack is an OR-gate; nice-to-have weights tune the score." />
      {hasResume ? (
        <div className="mb-4 rounded-lg border border-line bg-surface-2/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => runTune(false)} loading={tuning} disabled={tuning}>
              {!tuning && <Sparkles className="h-3.5 w-3.5" />}
              Tune with AI from resume
            </Button>
            <input
              className={ctrl}
              placeholder='Fine-tune: e.g. "weight fintech higher", "exclude data roles"'
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !tuning && instruction.trim()) { e.preventDefault(); runTune(true); } }}
              disabled={tuning}
            />
            <Button variant="secondary" size="sm" onClick={() => runTune(true)} loading={tuning} disabled={tuning || !instruction.trim()}>
              Fine-tune
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-faint">AI keeps your title keywords and tunes the stack, weights, and excludes from your resume. Review the fields below, then Save.</p>
          {tuning && <p className="mt-1 text-xs text-faint">Tuning from your resume… this can take up to a minute.</p>}
          {tuneError && <p className="mt-1 text-xs text-amber-300">{tuneError}</p>}
        </div>
      ) : (
        <p className="mb-4 text-xs text-muted">Add your resume (Resume tab) to tune this role with AI — or edit the fields below by hand.</p>
      )}
      <div className="space-y-5">
        <label className="block">
          <span className={lbl}>Label</span>
          <input className={cn(fld, 'w-full max-w-md')} value={label} onChange={(e) => { setLabel(e.target.value); touch(); }} placeholder="Senior Backend Engineer" />
        </label>
        <label className="block">
          <span className={lbl}>Title keywords <span className="font-normal text-faint">(comma-separated; substring-matched against the job title)</span></span>
          <textarea className={cn(fld, 'w-full h-20 font-mono text-xs')} value={titleKeywords} onChange={(e) => { setTitleKeywords(e.target.value); touch(); }} placeholder="senior backend, staff engineer, backend developer" />
        </label>
        <label className="block">
          <span className={lbl}>Must-have stack <span className="font-normal text-faint">(comma-separated; the JD must mention ≥1, word-boundary matched)</span></span>
          <input className={cn(fld, 'w-full')} value={stack} onChange={(e) => { setStack(e.target.value); touch(); }} placeholder="typescript, node.js, javascript" />
        </label>

        <div>
          <span className={lbl}>Nice-to-have weights <span className="font-normal text-faint">(boost the score when a JD mentions these; negatives deprioritize)</span></span>
          <div className="space-y-1.5">
            {niceRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={cn(fld, 'flex-1')} value={r.term} onChange={(e) => setRow(i, { term: e.target.value })} placeholder="keyword" />
                <input type="number" className={cn(fld, 'w-20')} value={r.weight} onChange={(e) => setRow(i, { weight: Math.round(Number(e.target.value) || 0) })} />
                <button onClick={() => { setNiceRows((rows) => rows.filter((_, j) => j !== i)); touch(); }} className="px-2 text-faint hover:text-amber-300" title="remove">✕</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => { setNiceRows((rows) => [...rows, { term: '', weight: 5 }]); touch(); }}>+ add weight</Button>
          </div>
        </div>

        <label className="block">
          <span className={lbl}>Title excludes <span className="font-normal text-faint">(comma-separated; reject titles containing any)</span></span>
          <input className={cn(fld, 'w-full')} value={titleExclude} onChange={(e) => { setTitleExclude(e.target.value); touch(); }} placeholder="junior, intern, frontend" />
        </label>
        <label className="block">
          <span className={lbl}>Exclude if primary <span className="font-normal text-faint">(comma-separated; reject when one of these is the JD's primary language)</span></span>
          <input className={cn(fld, 'w-full')} value={excludePrimary} onChange={(e) => { setExcludePrimary(e.target.value); touch(); }} placeholder="rust, golang, python, java" />
        </label>
      </div>
      <div className="mt-5">
        <SaveBar result={result} dirty={dirty} onSave={onSave} saving={saving} />
      </div>
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
            placeholder='Fine-tune: e.g. "be stricter on location", "emphasize fintech"'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating && instruction.trim()) {
                e.preventDefault();
                onGenerate();
              }
            }}
            disabled={generating}
          />
          <Button variant="secondary" size="sm" onClick={onGenerate} loading={generating} disabled={generating || !instruction.trim()}>
            Fine-tune
          </Button>
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
  judge?: { enabled?: boolean; backend?: string; min_score?: number; model?: string };
  resume?: { backend?: string; model?: string };
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
  input: {
    engine: LlmEngine;
    model: string;
    baseUrl: string;
    apiKeyEnv: string;
    judgeEnabled: boolean;
    minScore: number;
    /** per-feature model overrides (blank → the backend/CLI default) */
    judgeModel?: string;
    writingModel?: string;
  }
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
  const judgeModel = (input.judgeModel ?? '').trim();
  const writingModel = (input.writingModel ?? '').trim();
  return {
    ...prev,
    backends: { ...(prev.backends ?? {}), [FORM_BACKEND]: backend },
    // model: '' clears the override (undefined → dropped on the validated write).
    judge: { ...(prev.judge ?? {}), enabled: input.judgeEnabled, backend: FORM_BACKEND, min_score: input.minScore, model: judgeModel || undefined },
    resume: { backend: prev.resume?.backend ?? FORM_BACKEND, model: writingModel || undefined },
  };
}

function AiSettings({
  profile,
  claudeAvailable,
  onGoToTab,
  onSaved,
}: {
  profile: Record<string, unknown> | null;
  claudeAvailable: boolean;
  onGoToTab: (tab: Tab) => void;
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
  // Per-feature model routing (cheap model for the judge, stronger for writing).
  const [judgeModel, setJudgeModel] = useState(judge.model ?? '');
  const [writingModel, setWritingModel] = useState(llm.resume?.model ?? '');

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
    const nextLlm = buildLlmBlock(llm, { engine, model, baseUrl, apiKeyEnv, judgeEnabled, minScore, judgeModel, writingModel });
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
      <EditorHead title="AI setup" hint="Set up the optional fit-judge (and the backend it uses). Writes the profile.yaml llm block — validated and atomic, same as every other tab." />

      {/* Guided tuning hub — the primary call-to-action once a backend is set.
          Each step opens its tuning surface (draft from resume → review → save). */}
      {existingBackend && (
        <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-accent" /> Tune your matching with AI
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            A backend is set — let AI draft each piece from your resume. You review and edit every step before it saves.
          </p>
          <div className="mt-3 grid gap-1.5">
            {([
              { tab: 'roles', label: 'Role keywords & weights', desc: 'Tune stack, weights, and excludes from your resume' },
              { tab: 'profile', label: 'Domains & locations', desc: 'Suggest which companies to scrape and where' },
              { tab: 'rubric', label: 'Judge rubric', desc: 'How the fit-judge scores a JD against you' },
              { tab: 'skill', label: 'Resume tailoring', desc: 'How tailored resumes are generated' },
            ] as { tab: Tab; label: string; desc: string }[]).map((s) => (
              <button
                key={s.tab}
                onClick={() => onGoToTab(s.tab)}
                className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-left transition-all hover:border-accent/50"
              >
                <span>
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  <span className="block text-[11px] text-faint">{s.desc}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </div>
      )}

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
              onClick={() => {
                setEngine(e);
                touchBackend();
                // the haiku/sonnet presets are Claude-CLI-only — drop them when
                // switching to an OpenAI-compatible backend (which needs real model ids).
                if (e !== 'claude-cli') {
                  if (judgeModel === 'haiku') setJudgeModel('');
                  if (writingModel === 'sonnet') setWritingModel('');
                }
              }}
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

      {/* Model routing — per-feature model overrides (the biggest cost lever) */}
      {/* Collapsed by default — an optional advanced control, kept out of the way. */}
      <details className="mb-4 rounded-lg border border-line/60 bg-surface-2/30 px-3 py-2.5">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Advanced: model routing <span className="font-normal text-faint">(optional — cheaper judge, stronger writer)</span>
        </summary>
        <div className="mt-2.5">
          {engine === 'claude-cli' && (
            <div className="mb-1 flex justify-end">
              <button type="button" onClick={() => { setJudgeModel('haiku'); setWritingModel('sonnet'); touch(); }} className="text-[11px] font-medium text-accent hover:underline">
                Use recommended (Haiku / Sonnet)
              </button>
            </div>
          )}
          <span className={sub}>
            Blank uses the backend/CLI default. The judge is cheap classification — a fast model (e.g. Haiku) is plenty;
            writing tasks (resume + AI config tuning) prefer a stronger one (e.g. Sonnet). Routing the judge to a small
            model is the single biggest cost saver.
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-faint">Judge model</span>
              <input className={fld} value={judgeModel} onChange={(e) => { setJudgeModel(e.target.value); touch(); }} placeholder={engine === 'claude-cli' ? 'haiku' : 'e.g. gpt-4o-mini'} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-faint">Writing model</span>
              <input className={fld} value={writingModel} onChange={(e) => { setWritingModel(e.target.value); touch(); }} placeholder={engine === 'claude-cli' ? 'sonnet' : 'e.g. gpt-4o'} />
            </label>
          </div>
        </div>
      </details>

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
          <span className={sub}>Default 50. Higher = fewer (and costlier) LLM calls per run. The Re-judge button bypasses this floor.</span>
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
