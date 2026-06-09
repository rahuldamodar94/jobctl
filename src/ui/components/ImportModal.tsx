/**
 * Import from LinkedIn — a guided overlay (see docs/linkedin-import.md):
 *  1. copy the config-generated prompt → run it in the Claude for Chrome
 *     extension on your own logged-in LinkedIn (the server never touches it).
 *  2. paste the JSON the extension returns → POST /api/import → jobs land in
 *     triage, scored/tracked/judgeable like any scraped job.
 */
import React, { useEffect, useState } from 'react';
import { X, Copy, Check, AlertCircle, AlertTriangle, ShieldCheck, Import as ImportIcon } from 'lucide-react';
import { getImportPrompt, importJobs, type ImportResult } from '../api.js';
import { Button } from './ui.js';

/** A numbered step heading with a circled index. */
function StepHead({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-semibold text-muted">
        {n}
      </span>
      <h3 className="text-sm font-medium text-ink">{children}</h3>
    </div>
  );
}

export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImportPrompt().then((p) => {
      if (cancelled) return;
      setPrompt(p);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the user can select+copy the textarea manually */
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await importJobs(paste.trim());
      setResult(r);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const box = 'w-full rounded-lg border border-line-strong bg-surface-2/60 p-3 font-mono text-xs leading-relaxed text-ink';
  const notConfigured = loaded && !prompt;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg animate-fade-in">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <ImportIcon className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-ink">Import jobs from LinkedIn</h2>
        <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
          <X className="h-4 w-4" /> Close
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-6">
        {/* What this is + privacy */}
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-surface-2/40 p-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-[13px] leading-relaxed text-muted">
            jobctl <span className="text-ink">never connects to LinkedIn</span>. You run a prompt in the{' '}
            <a href="https://claude.ai" target="_blank" rel="noreferrer" className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-muted">
              Claude for Chrome
            </a>{' '}
            extension on your own logged-in LinkedIn; it reads matching job postings and hands you a
            block of JSON, which you paste back here. Everything LinkedIn sees is you, in your own
            browser.
          </p>
        </div>

        {/* Prerequisites */}
        <p className="mb-5 text-xs text-faint">
          <span className="font-medium text-muted">Before you start:</span> install the Claude for Chrome
          extension and sign in to LinkedIn in Chrome. Imports are manual — run one whenever you want
          fresh jobs.
        </p>

        {notConfigured && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The prompt is built from your roles and locations — set those up in{' '}
              <span className="font-medium">Settings</span> first, then reopen this.
            </span>
          </div>
        )}

        {/* Step 1 — copy the prompt */}
        <section className="mb-6">
          <div className="flex items-center justify-between">
            <StepHead n={1}>Copy the prompt</StepHead>
            <button
              onClick={copyPrompt}
              disabled={!prompt}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mb-2 pl-[30px] text-xs text-faint">
            Auto-built from your roles, preferred locations, and the last 14 days — no editing needed.
          </p>
          <textarea
            readOnly
            value={prompt ?? 'Configure your roles + locations in Settings first, then reopen this.'}
            className={`${box} h-40 resize-none`}
          />
        </section>

        {/* Step 2 — run it in the extension */}
        <section className="mb-6">
          <StepHead n={2}>Run it in Claude for Chrome</StepHead>
          <ol className="ml-[30px] list-decimal space-y-1 text-[13px] leading-relaxed text-muted marker:text-faint">
            <li>Open LinkedIn (logged in) in a Chrome tab.</li>
            <li>Open the Claude for Chrome extension on that tab and paste the prompt.</li>
            <li>Let it work — it searches, opens matching jobs, and copies each full description.</li>
            <li>When it finishes it prints a single JSON block.</li>
          </ol>
          <div className="mt-2.5 ml-[30px] flex items-start gap-2 rounded-lg border border-line bg-surface-2/40 p-2.5 text-xs text-faint">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            <span>
              The prompt tells Claude to go slowly, one job at a time, and{' '}
              <span className="text-muted">stop immediately on any LinkedIn security check</span> — let
              it stop if it asks; don&apos;t push through. This keeps your account safe.
            </span>
          </div>
        </section>

        {/* Step 3 — paste + import */}
        <section className="mb-4">
          <StepHead n={3}>Paste the result and import</StepHead>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='Paste the JSON Claude produced, e.g. { "source": "linkedin", "jobs": [ … ] }'
            className={`${box} h-36 resize-none`}
          />
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={runImport} disabled={busy || !paste.trim()}>
              {busy ? 'Importing…' : 'Import jobs'}
            </Button>
            {result && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                {result.inserted} added, {result.merged} merged (of {result.received}). Close to see them
                in triage.
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </span>
            )}
          </div>
        </section>

        <p className="mt-6 border-t border-line pt-4 text-xs text-faint">
          Imported jobs are keyword-scored, tracked, and (if enabled) fit-judged just like scraped jobs.
          A LinkedIn repost of a role already pulled from its company ATS merges automatically — no
          duplicates.
        </p>
      </div>
    </div>
  );
}
