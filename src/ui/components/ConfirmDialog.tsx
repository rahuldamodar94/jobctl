/**
 * In-app confirmation modal — replaces the browser's unstyled window.confirm()
 * so prompts match the app's dark UI. Matches AiIntroDialog's overlay/card style.
 * Esc or a backdrop click cancels; the costly action requires an explicit click
 * on the primary button (no Enter-to-confirm, on purpose).
 */
import React from 'react';
import { Button } from './ui.js';

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-surface p-6 shadow-raised"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              {icon}
            </span>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
