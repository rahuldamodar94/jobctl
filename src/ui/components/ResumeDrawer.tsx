/**
 * Right-side drawer rendering the markdown resumes from profile/resumes/ —
 * reference-only while triaging (e.g. comparing a JD against the IC vs EM
 * framing). Click outside or ✕ to close.
 */
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, FileText } from 'lucide-react';
import { getResume, listResumes } from '../api.js';
import { cn } from './ui.js';

export function ResumeDrawer({ onClose }: { onClose: () => void }) {
  const [resumes, setResumes] = useState<{ id: string; label: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    listResumes().then((r) => {
      setResumes(r);
      if (r[0]) setActive(r[0].id);
    });
  }, []);

  useEffect(() => {
    if (active) getResume(active).then(setContent);
  }, [active]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-pop animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <FileText className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-ink">Resume reference</span>
          <div className="ml-2 flex items-center gap-1">
            {resumes.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  active === r.id ? 'bg-accent text-accent-fg' : 'bg-surface-2/60 text-muted ring-1 ring-inset ring-line hover:text-ink'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {content ? (
            <article className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-ink prose-a:text-accent prose-strong:text-ink prose-hr:border-line">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-sm text-faint">No resume content.</p>
          )}
        </div>
      </div>
    </div>
  );
}
