/**
 * Compact scrape-health pill in the app bar: "2h ago · 38 new · 5/5 ok".
 * Failed/suspect sources turn it amber with the error in a tooltip — a
 * silently-broken scraper should never go unnoticed.
 */
import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, History } from 'lucide-react';
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
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/25">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Scraping…
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
