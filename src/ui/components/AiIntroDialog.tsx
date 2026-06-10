/**
 * One-time, closable popup introducing the optional AI features — what each one
 * does and its typical token spend — so the user decides to opt in with eyes
 * open. AI is recommended (not forced): jobctl works without it. The "Set up AI"
 * CTA deep-links to Settings → AI/LLM, where they pick a backend and then run the
 * guided tuning. Cost numbers come from shared/llm-costs (refined by workstream 2).
 */
import React from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { LLM_FEATURE_COSTS } from '../../shared/llm-costs.js';
import { Button } from './ui.js';

export function AiIntroDialog({ onSetup, onClose }: { onSetup: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-fade-up rounded-2xl border border-line bg-surface p-6 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-emerald-600 shadow-glow-accent">
            <Sparkles className="h-[18px] w-[18px] text-accent-fg" strokeWidth={2.4} />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold tracking-tight text-ink">Add AI for better results</h2>
            <p className="mt-0.5 text-xs text-muted">
              Optional, but recommended. jobctl works without it — turning it on sharpens your matches and skips
              the manual tuning. You bring the model, so it's your cost and your data.
            </p>
          </div>
          <button onClick={onClose} className="text-faint transition-colors hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {LLM_FEATURE_COSTS.map((f) => (
            <div key={f.key} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Check className="h-3.5 w-3.5 text-accent" /> {f.name}
              </div>
              <p className="mt-1 text-xs text-muted">{f.benefit}</p>
              <p className="mt-1 text-[11px] text-faint">Typical spend: {f.spend}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-faint">
          Estimates at typical sizes; your model choice changes them. Next, you'll pick the backend — your Claude
          subscription, any OpenAI-compatible API, or a fully local model (Ollama) for $0.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Maybe later
          </Button>
          <Button variant="primary" onClick={onSetup}>
            <Sparkles className="h-4 w-4" /> Set up AI
          </Button>
        </div>
      </div>
    </div>
  );
}
