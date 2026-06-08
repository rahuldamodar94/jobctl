import type { JudgeVerdict, Verdict } from '../shared/types.js';

/**
 * Fit-judge prompt assembly + output parsing. The LLM applies the user's
 * rubric (profile/judge-rubric.md) to a JD and returns a 4-level verdict.
 * Advisory only — the caller never hides jobs on a verdict; it annotates/ranks.
 */

export interface JudgeJobInput {
  company: string;
  title: string;
  location: string | null;
  description: string | null;
}

const VERDICTS: JudgeVerdict[] = ['STRONG', 'DECENT', 'WEAK', 'SKIP'];

export function buildJudgePrompt(job: JudgeJobInput, rubric: string): string {
  return [
    'You are screening ONE job for fit against the rubric below. Apply it strictly.',
    '',
    '=== RUBRIC (the evaluation criteria — follow it exactly) ===',
    rubric,
    '',
    '=== JOB ===',
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    `Location: ${job.location ?? 'not stated'}`,
    'Job description:',
    job.description?.trim() || '(no description provided — judge from title + company, and say so)',
    '',
    '=== OUTPUT (STRICT) ===',
    'Return ONLY a JSON object, no prose, no code fences, with EXACTLY these keys:',
    '  "verdict":  one of "STRONG" | "DECENT" | "WEAK" | "SKIP"',
    '  "summary":  one sentence on the fit',
    '  "reasons":  array of short strings (why this verdict)',
    '  "blockers": array of short strings — hard mismatches to verify (e.g.',
    '              "Go-primary", "onsite SF, no visa", "requires 10+ yrs"); [] if none',
    'Be conservative: if genuinely unsure between two levels, choose the MORE',
    'generous one (WEAK over SKIP) — never wrongly discard a real match.',
    'All four keys are required; use empty arrays rather than omitting.',
  ].join('\n');
}

/** Parse the model output into a Verdict — salvages fenced/wrapped JSON,
 *  validates the enum, coerces arrays. Throws on unrecoverable output. */
export function parseVerdict(raw: string): Verdict {
  const json = extractJson(raw);
  if (!json) throw new Error('no JSON object found in judge output');
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`judge output is not valid JSON: ${(e as Error).message}`);
  }

  const v = String(obj.verdict ?? '').toUpperCase().trim();
  const verdict = VERDICTS.find((x) => x === v);
  if (!verdict) throw new Error(`judge verdict "${obj.verdict}" is not one of ${VERDICTS.join('/')}`);

  return {
    verdict,
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
    reasons: toStringArray(obj.reasons),
    blockers: toStringArray(obj.blockers),
  };
}

/**
 * Pull the first complete top-level {...} object out of text. String-aware
 * brace balancing → robust to ```json fences, leading/trailing chatter,
 * multiple objects (takes the first), and braces/backticks INSIDE JSON string
 * values (which a naive first-{/last-} slice mishandles).
 */
function extractJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  return null; // unbalanced (truncated output) → caller retries / fails
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
