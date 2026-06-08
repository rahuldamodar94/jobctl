/**
 * First-run setup wizard — shown when /api/config reports configured=false.
 * Collects the minimum to get a working scrape (name → sources → one role →
 * optional resume) and writes profile.yaml + roles.yaml via the validated
 * settings endpoints. No file editing required.
 */
import React, { useState } from 'react';
import { User, Globe, Briefcase, FileText, Check, Crosshair, ArrowLeft, ArrowRight } from 'lucide-react';
import { saveProfile, saveRoles, saveResume, type AppConfig } from '../api.js';
import { Button, cn } from './ui.js';

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';
const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const STEPS = [
  { icon: User, label: 'You' },
  { icon: Globe, label: 'Sources' },
  { icon: Briefcase, label: 'Role' },
  { icon: FileText, label: 'Resume' },
];

export function Onboarding({ config, onDone }: { config: AppConfig; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sources, setSources] = useState<Set<string>>(new Set(['ats']));
  const [domains, setDomains] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [lane, setLane] = useState<'ic' | 'em'>('ic');
  const [titleKeywords, setTitleKeywords] = useState('');
  const [stack, setStack] = useState('');
  const [resumeLabel, setResumeLabel] = useState('');
  const [resumeMd, setResumeMd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleSource = (s: string) =>
    setSources((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  async function finish() {
    setError(null);
    setSaving(true);
    try {
      const resumes = resumeMd.trim()
        ? [{ id: 'main', label: resumeLabel || 'My Resume', file: 'resumes/main.md', base: 'ic' as const }]
        : [];
      const profile: Record<string, unknown> = {
        name: name.trim(),
        enabled_sources: [...sources],
        companies: { domains: toList(domains) },
        ...(resumes.length ? { resumes } : {}),
      };
      const roles = {
        roles: [
          {
            id: slug(roleLabel),
            label: roleLabel.trim(),
            lane,
            title_keywords: toList(titleKeywords),
            must_have_stack: toList(stack),
          },
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
  const canNext =
    (step === 0 && name.trim()) ||
    (step === 1 && sources.size > 0) ||
    (step === 2 && roleLabel.trim() && toList(titleKeywords).length && toList(stack).length) ||
    step === 3;

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
            <p className="text-sm text-muted">A quick setup personalizes scraping & matching. Change anything later in Settings.</p>
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
          {step === 0 && (
            <label className="block">
              <span className={lbl}>Your name <span className="font-normal text-faint">(appears on generated resumes)</span></span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
            </label>
          )}

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
                <label className="mt-3 block">
                  <span className={lbl}>Tech domains to include <span className="font-normal text-faint">(comma-separated)</span></span>
                  <input className={input} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="ai, fintech, devtools, security" />
                  <span className="mt-1.5 block text-xs text-faint">e.g. ai · fintech · payments · crypto/web3 · cloud · devtools · security · data · gaming</span>
                </label>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <label className="block">
                <span className={lbl}>Target role label</span>
                <input className={input} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder="Senior Backend Engineer" />
              </label>
              <div className="flex gap-2">
                {(['ic', 'em'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLane(l)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                      lane === l ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
                    )}
                  >
                    {l === 'ic' ? 'Individual contributor' : 'Manager / EM'}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className={lbl}>Title keywords <span className="font-normal text-faint">— a job's title must contain one</span></span>
                <input className={input} value={titleKeywords} onChange={(e) => setTitleKeywords(e.target.value)} placeholder="senior backend, backend engineer, staff engineer" />
              </label>
              <label className="block">
                <span className={lbl}>Must-have keywords <span className="font-normal text-faint">— the JD must mention at least one</span></span>
                <input className={input} value={stack} onChange={(e) => setStack(e.target.value)} placeholder="typescript, node.js" />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Optional — paste a base resume (Markdown). Needed only for the resume-generation feature; you can add it later.</p>
              <input className={input} value={resumeLabel} onChange={(e) => setResumeLabel(e.target.value)} placeholder="Resume label (e.g. My Resume)" />
              <textarea className={`${input} h-40 font-mono text-xs`} value={resumeMd} onChange={(e) => setResumeMd(e.target.value)} placeholder="# Your Name&#10;&#10;## Summary&#10;..." />
            </div>
          )}

          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
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
