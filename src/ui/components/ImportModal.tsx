/**
 * Paste-and-import modal for sites jobctl doesn't scrape server-side (LinkedIn,
 * Indeed, …). The user extracts jobs from their own logged-in page (e.g. with
 * Claude) and pastes the JSON here; it POSTs to /api/import, which runs them
 * through the same dedupe + scoring path as a scrape. See docs/importing-jobs.md.
 */
import React, { useState } from 'react';
import { X, DownloadCloud, Check } from 'lucide-react';
import { importJobs, type ImportResult } from '../api.js';
import { Button, cn } from './ui.js';

const SAMPLE = `[
  {
    "company": "Stripe",
    "title": "Senior Backend Engineer",
    "url": "https://www.linkedin.com/jobs/view/123",
    "location": "Remote — US",
    "description": "Full job description text…"
  }
]`;

/** Accept either a bare array of jobs or a { jobs: [...] } / { site, jobs } object. */
function extractJobs(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { jobs?: unknown }).jobs)) {
    return (parsed as { jobs: unknown[] }).jobs;
  }
  throw new Error('expected a JSON array of jobs, or an object with a "jobs" array');
}

export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [site, setSite] = useState('linkedin');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run() {
    setError(null);
    setResult(null);
    let jobs: unknown[];
    try {
      jobs = extractJobs(JSON.parse(text));
    } catch (e) {
      setError(`Couldn't read that JSON — ${(e as Error).message}`);
      return;
    }
    if (jobs.length === 0) {
      setError('No jobs in the pasted JSON.');
      return;
    }
    setBusy(true);
    try {
      const r = await importJobs(site.trim().toLowerCase(), jobs);
      setResult(r);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-faint outline-none transition-colors focus:border-accent';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <DownloadCloud className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-ink">Import jobs</span>
          <span className="text-xs text-faint">— from LinkedIn, Indeed, anywhere</span>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-muted">
            jobctl doesn't scrape these sites — instead, pull jobs from a page you have open
            (ask Claude to “extract every job as JSON”), paste them below, and they'll be
            de-duped and scored alongside your scraped jobs.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Source <span className="font-normal text-faint">— a tag for where these came from</span>
            </span>
            <input
              className={cn(input, 'max-w-[12rem] lowercase')}
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="linkedin"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Jobs JSON <span className="font-normal text-faint">— an array of {'{ company, title, url, … }'}</span>
            </span>
            <textarea
              className={cn(input, 'h-56 resize-none font-mono text-xs leading-relaxed')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE}
              spellCheck={false}
            />
          </label>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>
          )}
          {result && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <Check className="h-4 w-4 shrink-0" />
              <span>
                Imported <span className="tnum font-semibold">{result.imported}</span> new ·{' '}
                <span className="tnum font-semibold">{result.merged}</span> merged into existing ·
                tagged <span className="font-mono">{result.source}</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>{result ? 'Done' : 'Cancel'}</Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={!text.trim() || !site.trim()}>
            {!busy && <DownloadCloud className="h-4 w-4" />}
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </div>
  );
}
