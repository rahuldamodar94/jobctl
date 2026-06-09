/**
 * Upload a .docx/.pdf resume → extract to Markdown → hand it to the parent's
 * editor (never auto-saved). Reused by the Settings Resume tab and onboarding.
 * Extraction is best-effort: on failure/empty it shows a note and the parent's
 * paste/edit textarea stays the fallback.
 */
import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { extractResumeFile } from '../api.js';
import { Button, cn } from './ui.js';

export function ResumeUpload({
  onExtracted,
  className,
}: {
  /** receives the converted markdown — the parent loads it into its editor */
  onExtracted: (markdown: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'error' | 'approx'; text: string } | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file after an edit
    if (!file) return;
    setBusy(true);
    setNote(null);
    const r = await extractResumeFile(file);
    setBusy(false);
    if (r.error || !r.markdown) {
      setNote({ kind: 'error', text: r.error ?? 'Could not read the file. Paste your resume as text instead.' });
      return;
    }
    onExtracted(r.markdown);
    if (r.approximate) {
      setNote({
        kind: 'approx',
        text: 'PDF layout is approximate — review and fix the text below before saving.',
      });
    }
  };

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept=".docx,.pdf" className="hidden" onChange={onPick} />
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={busy} disabled={busy}>
        {!busy && <Upload className="h-3.5 w-3.5" />}
        {busy ? 'Reading…' : 'Upload .docx / .pdf'}
      </Button>
      {note && (
        <p className={cn('mt-1.5 text-xs', note.kind === 'error' ? 'text-amber-300' : 'text-muted')}>{note.text}</p>
      )}
    </div>
  );
}
