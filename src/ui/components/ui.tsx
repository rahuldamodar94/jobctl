/**
 * Shared UI primitives for the refined-dark design system: a tiny, dependency-
 * light kit (cn, Button, Badge, ScoreRing, Spinner, Skeleton) so every screen
 * shares one visual language instead of bespoke inline classes.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ── Button ──────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg font-semibold shadow-soft hover:brightness-110 active:brightness-95',
  secondary:
    'border border-line-strong bg-surface-2/80 text-ink hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'border border-rose-500/40 bg-rose-500/5 text-rose-300 hover:bg-rose-500/15',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  icon: 'h-8 w-8',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ── Badge / chip ─────────────────────────────────────────────────────────────
type Tone = 'accent' | 'neutral' | 'success' | 'warn' | 'info' | 'danger' | 'muted';
const TONES: Record<Tone, string> = {
  accent: 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25',
  success: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
  info: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/25',
  warn: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25',
  danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/25',
  neutral: 'bg-surface-3 text-muted ring-1 ring-inset ring-line',
  muted: 'bg-surface-2 text-faint ring-1 ring-inset ring-line/60',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  title,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Score ring ───────────────────────────────────────────────────────────────
/** Compact 0-100 keyword-score dial: colored arc + tabular number, band-tinted.
 *  `diverged` = the keyword score is high but the fit-judge disagrees (SKIP/WEAK);
 *  we tint amber + flag a dot so a green-looking score doesn't read as "great." */
export function ScoreRing({ score, diverged = false }: { score: number; diverged?: boolean }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 13;
  const c = 2 * Math.PI * r;
  const stroke = diverged
    ? 'rgb(245 158 66)'
    : score >= 70 ? 'rgb(var(--accent))' : score >= 40 ? 'rgb(245 200 80)' : 'rgb(var(--text-faint))';
  return (
    <span
      className="relative inline-flex h-8 w-8 items-center justify-center"
      title={diverged ? 'High keyword score, but the fit-judge flagged this — see Verify below' : undefined}
    >
      <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="3" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <span
        className="tnum absolute font-mono text-[11px] font-semibold"
        style={{ color: stroke }}
      >
        {score}
      </span>
      {diverged && (
        <span
          className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-surface-2"
          aria-hidden
        />
      )}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}
