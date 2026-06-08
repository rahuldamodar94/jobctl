/**
 * First-run setup wizard — shown when /api/config reports configured=false.
 * Collects a working setup (name → sources+domains → role → location → AI →
 * optional resume) and writes profile.yaml + roles.yaml via the validated
 * settings endpoints. Vocabulary (domains, role templates) comes from
 * /api/config — no hardcoded product data. No file editing required.
 */
import React, { useState } from 'react';
import { User, Globe, Briefcase, MapPin, Sparkles, FileText, Check, Crosshair, ArrowLeft, ArrowRight } from 'lucide-react';
import { saveProfile, saveRoles, saveResume, type AppConfig, type RoleTemplate } from '../api.js';
import { Button, cn } from './ui.js';

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';
const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const STEPS = [
  { icon: User, label: 'You' },
  { icon: Globe, label: 'Sources' },
  { icon: Briefcase, label: 'Role' },
  { icon: MapPin, label: 'Location' },
  { icon: Sparkles, label: 'AI' },
  { icon: FileText, label: 'Resume' },
];

type AiBackend = 'skip' | 'claude' | 'openai' | 'ollama';

export function Onboarding({ config, onDone }: { config: AppConfig; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sources, setSources] = useState<Set<string>>(new Set(['ats']));
  const [domains, setDomains] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [lane, setLane] = useState<'ic' | 'em'>('ic');
  const [titleKeywords, setTitleKeywords] = useState('');
  const [stack, setStack] = useState('');
  const [geoPriority, setGeoPriority] = useState('remote');
  const [relocationOk, setRelocationOk] = useState('');
  const [ai, setAi] = useState<AiBackend>('skip');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiKeyEnv, setAiKeyEnv] = useState('OPENAI_API_KEY');
  const [judgeOn, setJudgeOn] = useState(false);
  const [resumeLabel, setResumeLabel] = useState('');
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

  // role-template picker: choosing a template prefills the editable fields
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = config.roleTemplates.find((x) => x.id === id);
    if (!t) return; // "custom" → leave fields as the user has them
    setRoleLabel(t.label);
    setLane(t.lane);
    setTitleKeywords(t.titleKeywords.join(', '));
    setStack(t.mustHaveStack.join(', '));
  };

  // group templates for an optgroup'd picker
  const grouped = config.roleTemplates.reduce<Record<string, RoleTemplate[]>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  function buildLlm(): Record<string, unknown> | undefined {
    if (ai === 'skip') return undefined;
    const judge = { enabled: judgeOn, backend: '' as string };
    let backends: Record<string, unknown> = {};
    let name = '';
    if (ai === 'claude') {
      name = 'local';
      backends = { local: { engine: 'claude-cli' } };
    } else if (ai === 'openai') {
      name = 'cloud';
      backends = { cloud: { engine: 'openai-compatible', base_url: aiBaseUrl.trim(), model: aiModel.trim(), api_key_env: aiKeyEnv.trim() } };
    } else {
      name = 'ollama';
      backends = { ollama: { engine: 'openai-compatible', base_url: aiBaseUrl.trim() || 'http://localhost:11434/v1', model: aiModel.trim() } };
    }
    judge.backend = name;
    return { backends, judge, resume: { backend: name } };
  }

  async function finish() {
    setError(null);
    setSaving(true);
    try {
      const resumes = resumeMd.trim()
        ? [{ id: 'main', label: resumeLabel || 'My Resume', file: 'resumes/main.md', base: 'ic' as const }]
        : [];
      const llm = buildLlm();
      const profile: Record<string, unknown> = {
        name: name.trim(),
        enabled_sources: [...sources],
        companies: { domains: [...domains] },
        geo_priority: toList(geoPriority),
        geo_relocation_ok: toList(relocationOk),
        ...(llm ? { llm } : {}),
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
  const hint = 'mt-1.5 block text-xs text-faint';

  const canNext =
    (step === 0 && !!name.trim()) ||
    (step === 1 && sources.size > 0 && (!sources.has('ats') || domains.size > 0)) ||
    (step === 2 && !!roleLabel.trim() && toList(titleKeywords).length > 0 && toList(stack).length > 0) ||
    step === 3 ||
    (step === 4 && (ai === 'skip' || ai === 'claude' || (ai === 'openai' ? !!aiBaseUrl.trim() && !!aiModel.trim() : !!aiModel.trim()))) ||
    step === 5;

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

          {/* ── Role (template picker + editable keywords) ──────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              {config.roleTemplates.length > 0 && (
                <label className="block">
                  <span className={lbl}>Start from a template <span className="font-normal text-faint">(optional — everything below stays editable)</span></span>
                  <select className={input} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">Custom — start blank</option>
                    {Object.entries(grouped).map(([group, ts]) => (
                      <optgroup key={group} label={group}>
                        {ts.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
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

          {/* ── Location ────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Your location preference applies to every role (one job seeker, one location). Use <span className="font-mono text-ink">remote</span> for remote-friendly.</p>
              <label className="block">
                <span className={lbl}>Preferred locations <span className="font-normal text-faint">(comma-separated, best first)</span></span>
                <input className={input} value={geoPriority} onChange={(e) => setGeoPriority(e.target.value)} placeholder="remote, london, berlin" />
                <span className={hint}>Jobs in these locations score higher; others still appear.</span>
              </label>
              <label className="block">
                <span className={lbl}>Open to relocating to <span className="font-normal text-faint">(optional)</span></span>
                <input className={input} value={relocationOk} onChange={(e) => setRelocationOk(e.target.value)} placeholder="new york, remote-us" />
              </label>
            </div>
          )}

          {/* ── AI (model setup) ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Optional — add a model to judge fit &amp; tailor resumes. The scrape &amp; keyword match work with no model at all. See <span className="font-mono text-ink">docs/model-tradeoffs.md</span>.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['skip', 'Skip for now'],
                  ['claude', 'Claude CLI (subscription)'],
                  ['openai', 'OpenAI-compatible API'],
                  ['ollama', 'Local Ollama'],
                ] as [AiBackend, string][]).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setAi(v)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all',
                      ai === v ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-2/40 text-muted hover:border-line-strong'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(ai === 'openai' || ai === 'ollama') && (
                <div className="space-y-2 rounded-lg border border-line bg-surface-2/30 p-3">
                  <label className="block">
                    <span className={lbl}>Base URL</span>
                    <input className={input} value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)} placeholder={ai === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'} />
                  </label>
                  <label className="block">
                    <span className={lbl}>Model</span>
                    <input className={input} value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder={ai === 'ollama' ? 'llama3.1' : 'gpt-4o-mini'} />
                  </label>
                  {ai === 'openai' && (
                    <label className="block">
                      <span className={lbl}>API key env var <span className="font-normal text-faint">— the key itself stays in your shell env</span></span>
                      <input className={cn(input, 'font-mono text-xs')} value={aiKeyEnv} onChange={(e) => setAiKeyEnv(e.target.value)} placeholder="OPENAI_API_KEY" />
                    </label>
                  )}
                </div>
              )}

              {ai !== 'skip' && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm">
                  <input type="checkbox" checked={judgeOn} onChange={(e) => setJudgeOn(e.target.checked)} className="accent-accent" />
                  <span className="text-ink">Enable the fit-judge <span className="text-faint">(add a rubric in Settings to use it; resumes use a non-training backend)</span></span>
                </label>
              )}
            </div>
          )}

          {/* ── Resume ──────────────────────────────────────────────────── */}
          {step === 5 && (
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
