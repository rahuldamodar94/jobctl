/**
 * Import from LinkedIn — a two-step overlay (see docs/linkedin-import.md):
 *  1. copy the config-generated prompt → run it in the Claude Chrome extension
 *     on your own logged-in LinkedIn (the server never touches LinkedIn).
 *  2. paste the JSON the extension returns → POST /api/import → jobs land in
 *     triage, scored/tracked/judgeable like any scraped job.
 */
import React, { useEffect, useState } from 'react';
import { X, Copy, Check, AlertCircle, Import as ImportIcon } from 'lucide-react';
import { getImportPrompt, importJobs, type ImportResult } from '../api.js';
import { Button } from './ui.js';

export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImportPrompt().then((p) => !cancelled && setPrompt(p));
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

  const label = 'mb-1.5 text-xs font-medium uppercase tracking-wide text-faint';
  const box =
    'w-full rounded-lg border border-line-strong bg-surface-2/60 p-3 font-mono text-xs text-ink';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg animate-fade-in">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <ImportIcon className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-ink">Import from LinkedIn</h2>
        <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
          <X className="h-4 w-4" /> Close
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-6">
        <p className="mb-6 text-sm text-muted">
          jobctl never contacts LinkedIn. You run the prompt below in the{' '}
          <span className="text-ink">Claude Chrome extension</span> on your own logged-in LinkedIn; it
          collects matching jobs (filtered to your roles, locations, last 14 days) and you paste the
          result back here. Go slowly — the prompt tells Claude to pace itself and stop on any LinkedIn
          security check.
        </p>

        {/* Step 1 — the generated prompt */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className={label}>Step 1 · Copy this prompt → run it in the Claude extension</div>
            <button
              onClick={copyPrompt}
              disabled={!prompt}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            readOnly
            value={prompt ?? 'Configure your roles + locations first (Settings), then reopen this.'}
            className={`${box} h-44 resize-none`}
          />
        </div>

        {/* Step 2 — paste the result */}
        <div className="mb-4">
          <div className={label}>Step 2 · Paste the JSON the extension returns</div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{ "source": "linkedin", "jobs": [ … ] }'
            className={`${box} h-44 resize-none`}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={runImport} disabled={busy || !paste.trim()}>
            {busy ? 'Importing…' : 'Import jobs'}
          </Button>
          {result && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              {result.inserted} added, {result.merged} merged (of {result.received}).
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
