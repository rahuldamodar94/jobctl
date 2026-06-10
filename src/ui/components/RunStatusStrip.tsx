/**
 * Compact scrape-health pill in the app bar: "2h ago · 38 new · 5/5 ok".
 * Failed/suspect sources turn it amber with the error in a tooltip — a
 * silently-broken scraper should never go unnoticed.
 */
import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, History, Info, Square } from 'lucide-react';
import type { RunSummary } from '../api.js';
import { cn } from './ui.js';

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RunStatusStrip({ run, scraping }: { run: RunSummary | null; scraping: boolean }) {
  if (scraping || run?.status === 'running') {
    // Show live progress when the running row reports a total (it always does
    // after setRunTotal); fall back to a plain spinner before the first tick.
    // (The scrape no longer runs the judge — judging is a separate user action.)
    const total = run?.sourcesTotal ?? 0;
    const done = run?.sourcesDone ?? 0;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/25"
        title={run?.currentSource ? `Scraping ${run.currentSource}…` : undefined}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {total > 0 ? (
          <>
            Scraping… <span className="tnum">{done}/{total}</span>
            <span className="text-accent/60">sources</span>
            {run && run.totalNew > 0 && (
              <>
                <span className="text-accent/40">·</span>
                <span className="tnum">{run.totalNew}</span> new
              </>
            )}
          </>
        ) : (
          'Scraping…'
        )}
        {/* Replaces the old amber "first scrape takes minutes" banner: a quiet
            ⓘ whose explanation appears on hover only (CSS group-hover, no JS). */}
        <span className="group relative inline-flex">
          <Info className="h-3 w-3 cursor-help text-accent/60 transition-colors hover:text-accent" />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface-3 px-3 py-2 text-[11px] font-normal leading-relaxed text-muted opacity-0 shadow-raised transition-opacity duration-150 group-hover:opacity-100"
          >
            Pulls ~570 company boards — a few minutes. Runs in the background, so keep working; progress shows here.
          </span>
        </span>
      </span>
    );
  }
  if (!run) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-faint">
        <History className="h-3.5 w-3.5" />
        No scrapes yet
      </span>
    );
  }

  // A user-stopped run: it kept whatever it found before stopping.
  if (run.status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-2.5 py-1 text-xs text-muted ring-1 ring-inset ring-line">
        <Square className="h-3.5 w-3.5 text-faint" />
        <span>Stopped</span>
        <span className="text-line-strong">·</span>
        <span>{relativeTime(run.completedAt ?? run.startedAt)}</span>
        {run.totalNew > 0 && (
          <>
            <span className="text-line-strong">·</span>
            <span className="tnum font-semibold text-ink">{run.totalNew}</span>
            <span>new</span>
          </>
        )}
      </span>
    );
  }

  const ok = run.sources.filter((s) => s.status === 'success').length;
  const bad = run.sources.filter((s) => s.status === 'failed' || s.status === 'suspect');
  const when = relativeTime(run.completedAt ?? run.startedAt);
  const hasBad = bad.length > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset',
        hasBad ? 'bg-amber-500/10 text-amber-200 ring-amber-500/25' : 'bg-surface-2/80 text-muted ring-line'
      )}
    >
      {hasBad ? (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
      )}
      <span>{when}</span>
      <span className="text-line-strong">·</span>
      <span className="tnum font-semibold text-ink">{run.totalNew}</span>
      <span>new</span>
      <span className="text-line-strong">·</span>
      <span className="tnum">{ok}/{run.sources.length} ok</span>
      {hasBad && (
        <span
          className="font-medium text-amber-300"
          title={bad.map((b) => `${b.sourceId}: ${b.error ?? b.status}`).join('\n')}
        >
          · {bad.map((b) => b.sourceId).join(', ')} {bad.some((b) => b.status === 'suspect') ? 'suspect' : 'failed'}
        </span>
      )}
    </span>
  );
}
