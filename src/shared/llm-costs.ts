/**
 * Per-feature LLM value + cost estimates — the single source the AI intro popup
 * reads, so its numbers stay honest and live in one place.
 *
 * NOTE: these are PLACEHOLDER estimates measured at typical prompt sizes.
 * Workstream 2 (per-task model routing + rubric caching) will refine them and
 * make them model-aware — the popup imports from here so it updates for free.
 */
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
