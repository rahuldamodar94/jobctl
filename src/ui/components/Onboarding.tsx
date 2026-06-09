/**
 * First-run setup wizard — shown when /api/config reports configured=false.
 * Collects a working setup (name → sources+domains → role → location → optional
 * resume) and writes profile.yaml + roles.yaml via the validated settings
 * endpoints. Vocabulary (domains, role templates) comes from /api/config — no
 * hardcoded product data. Everything is PRE-FILLED from the curated config; the
 * user mostly selects, then edits if they want.
 *
 * AI features (fit-judge, resume generation) are intentionally OFF by default —
 * they need per-user files (rubric / resume rules) and are set up later in
 * Settings, not here.
 */
import React, { useState } from 'react';
import { User, Globe, Briefcase, MapPin, FileText, Check, Crosshair, ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { saveProfile, saveRoles, saveResume, type AppConfig, type RoleTemplate } from '../api.js';
import { buildRoleEntry, toList } from '../role-builder.js';
import { Button, cn } from './ui.js';
import { ResumeUpload } from './ResumeUpload.js';

const STEPS = [
  { icon: User, label: 'You' },
  { icon: Globe, label: 'Sources' },
  { icon: Briefcase, label: 'Role' },
  { icon: MapPin, label: 'Location' },
  { icon: FileText, label: 'Resume' },
];

// Common location choices (tap to select; matched as substrings against job
// locations). The loader lowercases these, so display casing is fine here.
const COMMON_LOCATIONS = [
  'Remote', 'United States', 'Europe', 'United Kingdom', 'India', 'Bangalore',
  'London', 'Berlin', 'New York', 'San Francisco', 'Dubai', 'MENA',
  'Singapore', 'Canada', 'Germany', 'Netherlands', 'Australia',
];

export function Onboarding({ config, onDone }: { config: AppConfig; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sources, setSources] = useState<Set<string>>(new Set(['ats']));
  const [domains, setDomains] = useState<Set<string>>(new Set());
  const [roleGroup, setRoleGroup] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [titleKeywords, setTitleKeywords] = useState('');
  const [stack, setStack] = useState('');
  const [niceToHave, setNiceToHave] = useState('');
  const [geoPriority, setGeoPriority] = useState<Set<string>>(new Set(['Remote']));
  const [relocationOk, setRelocationOk] = useState<Set<string>>(new Set());
  const [customLoc, setCustomLoc] = useState('');
  const [resumeMd, setResumeMd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) =>
    set((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  const toggleSource = toggle(setSources);
  const toggleDomain = toggle(setDomains);
  const toggleGeo = toggle(setGeoPriority);
  const toggleReloc = toggle(setRelocationOk);

  // group templates by function (the two-level picker's top level)
  const grouped = config.roleTemplates.reduce<Record<string, RoleTemplate[]>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  // picking a role template prefills the (still-editable) detail fields
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = config.roleTemplates.find((x) => x.id === id);
    if (!t) return;
    setRoleLabel(t.label);
    setTitleKeywords(t.titleKeywords.join(', '));
    setStack(t.mustHaveStack.join(', '));
  };
  const startCustom = () => {
    setRoleGroup('custom');
    setTemplateId('');
    setRoleLabel('');
    setTitleKeywords('');
    setStack('');
    setNiceToHave('');
  };

  // location chips = the common set plus any custom values the user added
  const locationOptions = [...new Set([...COMMON_LOCATIONS, ...geoPriority, ...relocationOk])];
  const addCustomLoc = () => {
    const v = customLoc.trim();
    if (!v) return;
    setGeoPriority((p) => new Set(p).add(v));
    setCustomLoc('');
  };

  async function finish() {
    setError(null);
    setSaving(true);
    try {
      const resumes = resumeMd.trim()
        ? [{ id: 'main', label: 'My Resume', file: 'resumes/main.md' }]
        : [];
      const profile: Record<string, unknown> = {
        name: name.trim(),
        enabled_sources: [...sources],
        companies: { domains: [...domains] },
        geo_priority: [...geoPriority],
        geo_relocation_ok: [...relocationOk],
        ...(resumes.length ? { resumes } : {}),
      };
      // buildRoleEntry carries the chosen template's rich matching config
      // (nice_to_have weights + excludes) so the matcher isn't starved — an empty
      // nice_to_have caps every score at 60/100. Unit-tested in role-builder.test.
      const roles = {
        roles: [
          buildRoleEntry({
            label: roleLabel,
            titleKeywords,
            stack,
            niceToHave,
            template: config.roleTemplates.find((t) => t.id === templateId),
          }),
        ],
      };
      if (resumeMd.trim()) {
        const w = await saveResume('resumes/main.md', resumeMd);
        if (!w.ok) throw new Error(w.error ?? 'failed to save resume');
      }
      const pr = await saveProfile(profile);
      if (!pr.ok) throw new Error(pr.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') ?? pr.error);
      const rr = await saveRoles(roles);
      if (!rr.ok) throw new Error(rr.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') ?? rr.error);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input =
    'w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-faint outline-none transition-colors focus:border-accent';
  const lbl = 'mb-1.5 block text-sm font-medium text-ink';
  const hint = 'mt-1.5 block text-xs text-faint';
  const tile = 'rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all';
  const tileOn = 'border-accent bg-accent/10 text-accent';
  const tileOff = 'border-line bg-surface-2/40 text-muted hover:border-line-strong';
  const chip = (on: boolean) =>
    cn('rounded-full border px-3 py-1 text-xs font-medium transition-all', on ? tileOn : tileOff);

  const roleDetailReady = !!templateId || roleGroup === 'custom';
  const canNext =
    (step === 0 && !!name.trim()) ||
    (step === 1 && sources.size > 0 && (!sources.has('ats') || domains.size > 0)) ||
    (step === 2 && !!roleLabel.trim() && toList(titleKeywords).length > 0 && toList(stack).length > 0) ||
    (step === 3 && geoPriority.size > 0) ||
    step === 4;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl animate-fade-up">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-emerald-600 shadow-glow-accent">
            <Crosshair className="h-[22px] w-[22px] text-accent-fg" strokeWidth={2.4} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Welcome to job<span className="text-accent">ctl</span>
            </h1>
            <p className="text-sm text-muted">A quick setup personalizes scraping &amp; matching. Change anything later in Settings.</p>
          </div>
        </div>

        {/* stepper */}
        <div className="mb-5 flex items-center px-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-all',
                    i < step
                      ? 'border-accent bg-accent text-accent-fg'
                      : i === step
                      ? 'border-accent bg-accent/15 text-accent shadow-glow-accent'
                      : 'border-line bg-surface-2 text-faint'
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <span className={cn('text-[11px] font-medium', i <= step ? 'text-ink' : 'text-faint')}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn('mx-2 mb-5 h-0.5 flex-1 rounded-full', i < step ? 'bg-accent' : 'bg-line')} />}
            </React.Fragment>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-line bg-surface/60 p-6 shadow-raised">
          {/* ── You ─────────────────────────────────────────────────────── */}
          {step === 0 && (
            <label className="block">
              <span className={lbl}>Your name <span className="font-normal text-faint">(appears on generated resumes)</span></span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
            </label>
          )}

          {/* ── Sources + domains ───────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <span className={lbl}>Where should we look for jobs?</span>
              <div className="space-y-1">
                {config.availableSources.map((s) => {
                  const on = sources.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSource(s)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-all',
                        on ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
                      )}
                    >
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      {s === 'ats' ? 'Company career boards (ATS registry)' : s}
                    </button>
                  );
                })}
              </div>
              {sources.has('ats') && (
                <div className="mt-4">
                  <span className={lbl}>Which domains? <span className="font-normal text-faint">— pick the industries you want</span></span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {config.domains.map((d) => {
                      const on = domains.has(d.id);
                      return (
                        <button
                          key={d.id}
                          onClick={() => toggleDomain(d.id)}
                          title={d.description}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all',
                            on ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
                          )}
                        >
                          <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>
                            {on && <Check className="h-2.5 w-2.5" />}
                          </span>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className={hint}>Only the registry companies tagged with these domains will be scraped.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Role: two-level picker (function → role) → editable detail ─ */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <span className={lbl}>What kind of role? <span className="font-normal text-faint">— pick a category</span></span>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.keys(grouped).map((g) => (
                    <button key={g} onClick={() => setRoleGroup(g)} className={cn(tile, roleGroup === g ? tileOn : tileOff)}>
                      {g}
                    </button>
                  ))}
                  <button onClick={startCustom} className={cn(tile, roleGroup === 'custom' ? tileOn : tileOff)}>
                    Custom role…
                  </button>
                </div>
              </div>

              {roleGroup && roleGroup !== 'custom' && (
                <div>
                  <span className={lbl}>Which role?</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {grouped[roleGroup]?.map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t.id)} title={t.description} className={cn(tile, 'text-xs', templateId === t.id ? tileOn : tileOff)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {roleDetailReady && (
                <div className="space-y-3 border-t border-line/60 pt-3">
                  <p className="text-xs text-faint">
                    {templateId ? 'Pre-filled from the template — tweak anything below.' : 'Define your role — describe the kind of job you want.'}
                  </p>
                  <label className="block">
                    <span className={lbl}>Role label</span>
                    <input className={input} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder="Senior Backend Engineer" />
                  </label>
                  <label className="block">
                    <span className={lbl}>Title keywords <span className="font-normal text-faint">— a job's title must contain one</span></span>
                    <input className={input} value={titleKeywords} onChange={(e) => setTitleKeywords(e.target.value)} placeholder="senior backend, backend engineer" />
                  </label>
                  <label className="block">
                    <span className={lbl}>Must-have keywords <span className="font-normal text-faint">— the JD must mention at least one</span></span>
                    <input className={input} value={stack} onChange={(e) => setStack(e.target.value)} placeholder="typescript, node.js" />
                  </label>
                  {roleGroup === 'custom' && (
                    <label className="block">
                      <span className={lbl}>Nice to have <span className="font-normal text-faint">(optional) — boosts the score when a JD mentions these</span></span>
                      <input className={input} value={niceToHave} onChange={(e) => setNiceToHave(e.target.value)} placeholder="kubernetes, postgres, distributed systems" />
                      <span className={hint}>Your must-have keywords already count toward the score; add more here to rank stronger fits higher.</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Location (chip selection, not typing) ───────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">Your location preference applies to every role. <span className="font-mono text-ink">Remote</span> matches remote-friendly listings.</p>
              <div>
                <span className={lbl}>Preferred locations <span className="font-normal text-faint">— tap to select</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {locationOptions.map((loc) => (
                    <button key={loc} onClick={() => toggleGeo(loc)} className={chip(geoPriority.has(loc))}>{loc}</button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className={cn(input, 'h-8 flex-1')}
                    value={customLoc}
                    onChange={(e) => setCustomLoc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomLoc())}
                    placeholder="Add another location…"
                  />
                  <Button size="sm" variant="secondary" onClick={addCustomLoc} disabled={!customLoc.trim()}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                <span className={hint}>Jobs in these locations score higher; others still appear.</span>
              </div>
              <div>
                <span className={lbl}>Open to relocating to <span className="font-normal text-faint">(optional)</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {locationOptions.map((loc) => (
                    <button key={loc} onClick={() => toggleReloc(loc)} className={chip(relocationOk.has(loc))}>{loc}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Resume (optional) ───────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Optional but recommended — upload a <span className="font-medium text-ink">.docx</span> or <span className="font-medium text-ink">.pdf</span> (we convert it to Markdown), or paste it below. The optional AI features (fit-judge, resume generation) learn from it. You can add it anytime in Settings.</p>
              <ResumeUpload onExtracted={setResumeMd} />
              <textarea className={`${input} h-44 font-mono text-xs`} value={resumeMd} onChange={(e) => setResumeMd(e.target.value)} placeholder="# Your Name&#10;&#10;## Summary&#10;... (or upload above)" />
            </div>
          )}

          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={finish} loading={saving}>
                {saving ? 'Saving…' : 'Finish setup'} {!saving && <Check className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
