/**
 * One job = one compact row; click anywhere to expand an inline detail panel
 * (age/source/salary, "Mentions:" matched keywords, tags, JD excerpt, notes).
 * The status dropdown and checkbox stopPropagation so triage clicks don't
 * toggle the expansion. A colored left rail + subtle tint encode status.
 *
 * Status changes apply IMMEDIATELY (triage speed first), then a small popover
 * offers an optional note — Save attaches it, Skip/Esc dismisses, Enter saves.
 * The Updated column shows when the status last changed, falling back to
 * first_seen for untouched rows.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink, FileText, Scale, Clock, Database, BadgeDollarSign, Loader2,
} from 'lucide-react';
import { generateResume, getResumeInfo, judgeJob, type GeneratedResumeInfo, type UiJob } from '../api.js';
import { Badge, ScoreRing, Button, cn } from './ui.js';
import { isHttpUrl } from '../../shared/url.js';

/** verdict → chip tone (advisory; never hides the row) */
const VERDICT_TONE: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  STRONG: 'success',
  DECENT: 'info',
  WEAK: 'warn',
  SKIP: 'muted',
};

/** per-dimension sub-score → chip tone + human label (advisory breakdown) */
const DIM_RATING_TONE: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  strong: 'success',
  ok: 'info',
  weak: 'warn',
  unknown: 'muted',
};
const DIM_LABEL: Record<string, string> = {
  skills: 'Skills',
  seniority: 'Seniority',
  domain: 'Domain',
  location: 'Location',
  red_flags: 'Red flags',
};

/** status → row tint + left-rail color */
const DEFAULT_ROW = { tint: '', rail: 'border-l-transparent' };
const STATUS_ROW: Record<string, { tint: string; rail: string }> = {
  new: DEFAULT_ROW,
  interested: { tint: 'bg-amber-500/[0.05]', rail: 'border-l-amber-500/70' },
  applied: { tint: 'bg-accent/[0.05]', rail: 'border-l-accent/70' },
  rejected: { tint: 'text-faint line-through', rail: 'border-l-rose-500/50' },
  dismissed: { tint: 'text-faint/70', rail: 'border-l-line-strong' },
};

function age(job: UiJob): string {
  const d = job.posted_date ?? job.first_seen;
  if (!d) return '';
  // bare yyyy-mm-dd parses as UTC midnight → pin to local midnight (like shortDate)
  const t = new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime();
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

/** Short local date for the Updated column ("6 Jun").
 *  Date-only strings get a local-midnight suffix — bare 'YYYY-MM-DD' parses as
 *  UTC midnight, which renders as the PREVIOUS day for users west of UTC. */
function shortDate(d: string): string {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** Statuses that don't deserve a note prompt — mechanical transitions. */
const NO_NOTE_STATUSES = new Set(['applied', 'new']);

const STATUS_OPTIONS = ['new', 'interested', 'applied', 'rejected', 'dismissed'];

export function JobRow({
  job,
  selected,
  resumeGenEnabled,
  judgeEnabled,
  leaving,
  onToggle,
  onStatus,
  onNotes,
  onSettled,
  onJudged,
}: {
  job: UiJob;
  selected: boolean;
  /** true only when the server has a usable claude CLI (host machine with the CLI installed) */
  resumeGenEnabled: boolean;
  /** advisory fit-judge is on → show verdict chip + re-judge */
  judgeEnabled: boolean;
  /** row no longer matches the filter — fading out before removal */
  leaving: boolean;
  onToggle: () => void;
  onStatus: (s: string) => void;
  onNotes: (n: string) => void;
  /** the status interaction is fully done (incl. note popover) — App may now
   *  remove the row from a view it no longer matches */
  onSettled: (status: string) => void;
  onJudged: (updated: UiJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<GeneratedResumeInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);

  // on expand, check whether a resume was already generated for this job
  useEffect(() => {
    if (open && resumeGenEnabled) getResumeInfo(job.id).then(setResumeInfo);
  }, [open, resumeGenEnabled, job.id]);

  const onGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      setResumeInfo(await generateResume(job.id));
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };
  const onRejudge = async () => {
    setJudging(true);
    setJudgeError(null);
    try {
      // merge the verdict patch into THIS row (keep all other fields intact)
      const patch = await judgeJob(job.id);
      onJudged({ ...job, ...patch });
    } catch (e) {
      setJudgeError((e as Error).message);
    } finally {
      setJudging(false);
    }
  };

  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [notePromptFor, setNotePromptFor] = useState<string | null>(null); // status just set
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notePromptFor) return;
    noteInputRef.current?.focus();
    // Outside-click dismisses (and implicitly enforces one-open-popover-at-a-
    // time: opening another row's popover is itself an outside click here).
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) closePromptRef.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notePromptFor]);

  const handleStatusChange = (status: string) => {
    onStatus(status); // apply immediately — the note is optional decoration
    if (NO_NOTE_STATUSES.has(status)) {
      onSettled(status); // no popover — the row may leave the view right away
    } else {
      setNotePromptFor(status); // popover first; the row leaves after it closes
    }
  };

  // outside-click handler lives in an effect — keep a stable ref to the
  // latest closePrompt so it always settles the right status
  const closePromptRef = useRef<() => void>(() => {});
  const closePrompt = () => {
    const status = notePromptFor;
    setNotePromptFor(null);
    if (status) onSettled(status);
  };
  closePromptRef.current = closePrompt;

  const saveNote = () => {
    const value = noteInputRef.current?.value ?? '';
    if (value !== (job.user_notes ?? '')) onNotes(value);
    closePrompt();
  };

  // Manually-added jobs (no source) are user-curated: a keyword score of 0 is
  // meaningless (often no JD to score), so show a "manual" tag instead of 0/✗.
  const isManual = !job.source_id;
  const showManual = isManual && (!job.is_match || job.match_score === 0);

  const updated = job.status_updated_at ?? job.first_seen;
  const updatedTitle = job.status_updated_at
    ? `status updated ${new Date(job.status_updated_at).toLocaleString()}`
    : `never triaged — first seen ${job.first_seen}`;

  const row = STATUS_ROW[job.status] ?? DEFAULT_ROW;
  const TD = 'px-3 py-2.5 align-middle';

  return (
    <>
      <tr
        className={cn(
          'group cursor-pointer border-l-2 border-t border-line/50 transition-colors duration-200 hover:bg-surface-2/50',
          row.rail,
          row.tint,
          leaving && 'opacity-0 transition-opacity'
        )}
        onClick={() => setOpen(!open)}
      >
        <td className={cn(TD, 'pr-0')} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-3.5 w-3.5 cursor-pointer rounded border-line-strong bg-surface-2 accent-accent"
          />
        </td>
        <td className={TD}>
          {showManual ? (
            <Badge tone="muted" title="manually added — not keyword-scored">manual</Badge>
          ) : job.is_match ? (
            <ScoreRing score={job.match_score} />
          ) : (
            <span className="font-mono text-xs text-faint" title="did not match any role">—</span>
          )}
        </td>
        <td className={cn(TD, 'truncate font-semibold text-ink')}>{job.company}</td>
        <td className={cn(TD, 'truncate')}>
          {judgeEnabled && job.llm_verdict && (
            <Badge tone={VERDICT_TONE[job.llm_verdict] ?? 'muted'} className="mr-1.5" title={job.llm_summary ?? job.llm_verdict}>
              {job.llm_verdict}
            </Badge>
          )}
          <span className="text-ink/90">{job.title}</span>
        </td>
        <td className={cn(TD, 'truncate text-muted')}>{job.location ?? '—'}</td>
        <td className={TD}>
          {job.category && (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-line/70">
              {job.category}
            </span>
          )}
        </td>
        <td className={cn(TD, 'relative')} onClick={(e) => e.stopPropagation()}>
          <select
            value={job.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-7 w-full cursor-pointer rounded-lg border border-line bg-surface-2/70 px-1.5 text-xs text-ink outline-none transition-colors hover:border-line-strong focus:border-accent"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* optional-note popover, anchored to the status cell */}
          {notePromptFor && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-line-strong bg-surface-3 p-2.5 text-ink no-underline shadow-pop [text-decoration:none] animate-scale-in"
            >
              <div className="mb-1.5 text-xs text-muted">
                Note for <span className="font-semibold text-ink">{notePromptFor}</span> (optional)
              </div>
              <textarea
                ref={noteInputRef}
                key={job.user_notes ?? ''}
                defaultValue={job.user_notes ?? ''}
                rows={2}
                placeholder="e.g. referred by X / failed system design / salary too low…"
                className="mb-2 w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink placeholder-faint outline-none focus:border-accent [text-decoration:none]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveNote();
                  }
                  if (e.key === 'Escape') closePrompt();
                }}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={closePrompt}>Skip (Esc)</Button>
                <Button size="sm" variant="primary" onClick={saveNote}>Save (Enter)</Button>
              </div>
            </div>
          )}
        </td>
        <td className={cn(TD, 'tnum font-mono text-[11px] text-faint')} title={updatedTitle}>
          {shortDate(updated)}
        </td>
      </tr>

      {open && (
        <tr className={cn('border-l-2 border-t border-line/40 bg-surface-2/30', row.rail, leaving && 'opacity-0')}>
          <td></td>
          <td colSpan={7} className="px-3 pb-4 pt-1">
            <div className="animate-fade-up rounded-xl border border-line bg-surface/60 p-3.5">
              {/* metadata + actions */}
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-faint" />{age(job)}</span>
                <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-faint" />{job.source_id || 'manual'}</span>
                {job.salary_text && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-accent">
                    <BadgeDollarSign className="h-3.5 w-3.5" />{job.salary_text}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {resumeGenEnabled &&
                    (generating ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating… (~1 min)
                      </span>
                    ) : resumeInfo ? (
                      <>
                        <a
                          href={`/api/generated/${resumeInfo.pdfFile}`}
                          target="_blank"
                          rel="noreferrer"
                          title={resumeInfo.warning ?? `generated ${resumeInfo.generatedAt ?? ''}`}
                          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sky-600/20 px-2.5 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-600/30"
                        >
                          <FileText className="h-3.5 w-3.5" /> Resume PDF{resumeInfo.warning ? ' ⚠' : ''}
                        </a>
                        <button onClick={onGenerate} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                          regenerate
                        </button>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={onGenerate} title="tailor a resume for this job via your local Claude (no API cost)">
                        <FileText className="h-3.5 w-3.5" /> Generate resume
                      </Button>
                    ))}
                  {judgeEnabled && (
                    <Button size="sm" variant="secondary" onClick={onRejudge} loading={judging}>
                      {!judging && <Scale className="h-3.5 w-3.5" />}
                      {judging ? 'Judging…' : job.llm_verdict ? 'Re-judge' : 'Judge fit'}
                    </Button>
                  )}
                  {isHttpUrl(job.url) ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-semibold text-accent-fg shadow-soft hover:brightness-110"
                    >
                      Open JD <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs text-faint" title="no valid link for this job">
                      No link
                    </span>
                  )}
                </span>
              </div>

              {genError && <div className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">Resume generation failed: {genError}</div>}
              {judgeError && <div className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">Judge failed: {judgeError}</div>}

              {judgeEnabled && job.llm_verdict && (
                <div className="mb-2.5 rounded-lg border border-line bg-surface-2/50 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge tone={VERDICT_TONE[job.llm_verdict] ?? 'muted'}>{job.llm_verdict}</Badge>
                    {job.llm_summary && <span className="text-ink/90">{job.llm_summary}</span>}
                  </div>
                  {job.llm_reasons.length > 0 && <div className="mt-1.5 text-muted">Why: {job.llm_reasons.join(' · ')}</div>}
                  {job.llm_blockers.length > 0 && (
                    <div className="mt-1"><span className="text-muted">Verify: </span><span className="text-amber-300">{job.llm_blockers.join(' · ')}</span></div>
                  )}
                  {job.llm_dimensions.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line/60 pt-2">
                      {job.llm_dimensions.map((d) => (
                        <div key={d.key} className="flex items-baseline gap-2">
                          <Badge tone={DIM_RATING_TONE[d.rating] ?? 'muted'} className="w-[4.75rem] shrink-0 justify-center text-[10px]">
                            {DIM_LABEL[d.key] ?? d.key}
                          </Badge>
                          <span className="text-ink/80">
                            {d.note}
                            {d.evidence.length > 0 && (
                              <span className="text-faint"> — “{d.evidence.join('” · “')}”</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!job.is_match && job.match_reasons?.roleOutcomes ? (
                <div className="mb-2 text-xs">
                  <span className="text-muted">Why rejected: </span>
                  <span className="text-rose-300">
                    {Object.entries(job.match_reasons.roleOutcomes).map(([role, reason]) => `${role}: ${reason}`).join(' · ')}
                  </span>
                </div>
              ) : null}

              {job.match_reasons?.matchedKeywords?.length ? (
                <div className="mb-2.5 text-xs">
                  <span className="text-muted">Mentions: </span>
                  <span className="font-medium text-accent">{job.match_reasons.matchedKeywords.join(', ')}</span>
                  {job.match_reasons.descriptionMissing && (
                    <span className="ml-2 text-amber-400">(no full JD — matched on title/tags)</span>
                  )}
                </div>
              ) : null}

              {job.tags.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {job.tags.slice(0, 12).map((t) => (
                    <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-line/70">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {job.description_excerpt && (
                <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-muted">
                  {job.description_excerpt}
                  {job.description_excerpt.length >= 600 ? '…' : ''}
                </p>
              )}

              <div onClick={(e) => e.stopPropagation()}>
                <input
                  value={notesDraft ?? job.user_notes ?? ''}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    if (notesDraft !== null && notesDraft !== (job.user_notes ?? '')) onNotes(notesDraft);
                  }}
                  placeholder="Add a note…"
                  className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-ink placeholder-faint outline-none focus:border-accent [text-decoration:none]"
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
