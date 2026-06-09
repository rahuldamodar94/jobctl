/**
 * Filter bar — status pills (with pipeline counts) on top, refinement controls
 * (search, match, domain, location, score, recency, fit, sort) below. The Domain
 * vocabulary comes from /api/config; counts from /api/stats. Defaults = the daily
 * triage view; refinements narrow the `new` queue only.
 */
import React from 'react';
import { Search, RotateCcw } from 'lucide-react';
import type { AppConfig, Filters, Stats } from '../api.js';
import { JUDGE_VERDICTS } from '../../shared/types.js';
import { cn } from './ui.js';

/** Status pills: value sent to the server ↔ display label. "Active" = the
 *  untriaged queue plus things you're actively tracking. */
const STATUS_PILLS: { value: string; label: string; statKey?: keyof Stats }[] = [
  { value: 'new,interested', label: 'Active' },
  { value: 'new', label: 'New', statKey: 'new' },
  { value: 'interested', label: 'Interested', statKey: 'interested' },
  { value: 'applied', label: 'Applied', statKey: 'applied' },
  { value: 'rejected', label: 'Rejected', statKey: 'rejected' },
  { value: 'dismissed', label: 'Dismissed', statKey: 'dismissed' },
  { value: 'all', label: 'All', statKey: 'total' },
];

const CTRL =
  'h-8 rounded-lg border border-line bg-surface-2/60 px-2 text-xs text-ink outline-none transition-colors hover:border-line-strong focus:border-accent';

export function FilterBar({
  filters,
  onChange,
  defaults,
  vocab,
  stats,
  judgeEnabled,
  verdictFilterEnabled,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  defaults: Filters;
  vocab: Pick<AppConfig, 'categories'>;
  stats: Stats | null;
  judgeEnabled: boolean;
  /** show the Fit/verdict filter — judge is on AND a rubric exists */
  verdictFilterEnabled: boolean;
}) {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [k]: e.target.value });

  // The Domain vocabulary from /api/config is authoritative; only synthesize
  // 'other' when the server returned NO categories at all (no taxonomy loaded yet).
  const cats = vocab.categories.length ? vocab.categories : ['other'];
  const isDefault = JSON.stringify(filters) === JSON.stringify(defaults);

  const Label = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{children}</span>
  );

  return (
    <div className="mb-3 space-y-2.5">
      {/* status pills with pipeline counts */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_PILLS.map((p) => {
          const active = filters.status === p.value;
          const count = p.statKey && stats ? stats[p.statKey] : undefined;
          return (
            <button
              key={p.value}
              onClick={() => onChange({ ...filters, status: p.value })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all',
                active
                  ? 'bg-accent text-accent-fg shadow-soft'
                  : 'bg-surface-2/60 text-muted ring-1 ring-inset ring-line hover:bg-surface-3 hover:text-ink'
              )}
            >
              {p.label}
              {count !== undefined && (
                <span
                  className={cn(
                    'tnum rounded-full px-1.5 py-px text-[10.5px] font-semibold',
                    active ? 'bg-accent-fg/15 text-accent-fg' : 'bg-surface-3 text-faint'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* refinement controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface/40 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            value={filters.q}
            onChange={set('q')}
            placeholder="Search company / title / JD…"
            className={cn(CTRL, 'w-60 pl-8 placeholder-faint')}
          />
        </div>

        <label className="flex items-center gap-1.5">
          <Label>Match</Label>
          <select
            value={filters.match}
            onChange={(e) =>
              // a min-score filter would hide every unmatched job (they score 0);
              // switching back to matched restores the default threshold
              onChange({
                ...filters,
                match: e.target.value,
                minScore: e.target.value === 'matched' ? filters.minScore || '30' : '',
              })
            }
            className={CTRL}
          >
            <option value="matched">matched</option>
            <option value="unmatched">unmatched</option>
            <option value="all">all</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <Label>Domain</Label>
          <select value={filters.category} onChange={set('category')} className={CTRL}>
            <option value="">all</option>
            {cats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <Label>Location</Label>
          <input
            value={filters.location}
            onChange={set('location')}
            placeholder="e.g. remote, london"
            className={cn(CTRL, 'w-36 placeholder-faint')}
          />
        </label>

        <label className="flex items-center gap-1.5">
          <Label>Score ≥</Label>
          <select value={filters.minScore} onChange={set('minScore')} className={CTRL}>
            {['', '30', '50', '70'].map((s) => (
              <option key={s} value={s}>{s || 'any'}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <Label>Posted ≤</Label>
          <select value={filters.postedWithin} onChange={set('postedWithin')} className={CTRL}>
            {[
              ['7', '7d'],
              ['14', '14d'],
              ['30', '30d'],
              ['', 'any'],
            ].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>

        {verdictFilterEnabled && (
          <label className="flex items-center gap-1.5">
            <Label>Fit</Label>
            <select value={filters.verdict} onChange={set('verdict')} className={CTRL}>
              <option value="">all</option>
              {JUDGE_VERDICTS.map((v) => (
                <option key={v} value={v}>{v.toLowerCase()}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5">
          <Label>Sort</Label>
          <select value={filters.sort} onChange={set('sort')} className={CTRL}>
            <option value="score">score</option>
            <option value="date">date</option>
            {judgeEnabled && <option value="verdict">fit</option>}
          </select>
        </label>

        <button
          onClick={() => onChange(defaults)}
          disabled={isDefault}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-faint transition-colors hover:text-ink disabled:opacity-30"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
