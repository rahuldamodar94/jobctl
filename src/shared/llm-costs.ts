/**
 * Per-feature LLM value + cost estimates — the single source the AI intro popup
 * and the pre-run judge estimate read, so the numbers stay honest and in one
 * place. Token counts are model-independent (measured at typical prompt sizes);
 * the actual cost/usage depends on the model you route each task to (see the
 * Model-routing section in Settings → AI/LLM). Caching is deliberately not
 * assumed here (it only helps API backends, not the default claude-cli).
 */

/** Typical input+output tokens for ONE judge call (rubric ~1.7K + JD ~1.4K +
 *  instructions + the verdict out). The judge is the only per-job LLM cost. */
export const JUDGE_TOKENS_PER_JOB = 3_500;

/** Estimate a judge run over `pending` jobs: total tokens + a short label. */
export function estimateJudgeRun(pending: number): { jobs: number; tokens: number; label: string } {
  const tokens = Math.max(0, pending) * JUDGE_TOKENS_PER_JOB;
  const k = Math.round(tokens / 1000);
  return { jobs: pending, tokens, label: `~${pending} job${pending === 1 ? '' : 's'} ≈ ~${k}K tokens` };
}
export interface LlmFeatureCost {
  key: 'tuning' | 'judge' | 'resume';
  name: string;
  /** one line on why it's worth turning on */
  benefit: string;
  /** one line on the typical token/cost spend */
  spend: string;
}

export const LLM_FEATURE_COSTS: LlmFeatureCost[] = [
  {
    key: 'tuning',
    name: 'AI matching setup',
    benefit:
      'Drafts your role keywords, domains, judge rubric, and resume rules from your resume — so your matches are actually accurate, not generic.',
    spend: 'One-time, ~a few thousand tokens per tune. You review and edit every draft before it saves.',
  },
  {
    key: 'judge',
    name: 'Fit-judge',
    benefit:
      'Scores each matched job against your rubric — STRONG / DECENT / WEAK / SKIP — with per-dimension reasons and quotes from the JD.',
    spend: '~3-4K tokens per job, only for matches above your score floor (often ~50-200 per run).',
  },
  {
    key: 'resume',
    name: 'Resume tailoring',
    benefit: 'Writes a one-page resume tailored to a specific job; jobctl renders the PDF.',
    spend: '~6-7K tokens, on demand — only when you click Generate on a job.',
  },
];
