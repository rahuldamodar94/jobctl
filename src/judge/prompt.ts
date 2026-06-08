import {
  DIMENSION_KEYS,
  DIMENSION_RATINGS,
  JUDGE_VERDICTS,
  type DimensionKey,
  type Verdict,
  type VerdictDimension,
} from '../shared/types.js';

/**
 * Fit-judge prompt assembly + output parsing. The LLM applies the user's
 * rubric (profile/judge-rubric.md) to a JD and returns a 4-level overall
 * verdict PLUS a per-dimension breakdown, each dimension backed by 1-2 short
 * evidence citations from the JD.
 * Advisory only — the caller never hides jobs on a verdict; it annotates/ranks.
 */

export interface JudgeJobInput {
  company: string;
  title: string;
  location: string | null;
  description: string | null;
}

const MAX_EVIDENCE = 2;
const EVIDENCE_MAX_LEN = 280;

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
    '  "summary":  one sentence on the overall fit',
    '  "reasons":  array of short strings (why this overall verdict)',
    '  "blockers": array of short strings — hard mismatches to verify (e.g.',
    '              "Go-primary", "onsite SF, no visa", "requires 10+ yrs"); [] if none',
    '  "dimensions": array of EXACTLY these five objects, one per dimension, in order:',
    '              skills, seniority, domain, location, red_flags',
    '     each: { "key": <the dimension>,',
    '             "rating": "strong" | "ok" | "weak" | "unknown",',
    '             "note": one short sentence,',
    '             "evidence": array of 1-2 SHORT quotes/paraphrases FROM THE JD that',
    '                         justify the rating ([] only if the JD says nothing) }',
    '  Rating meaning: strong = great fit / no concern, ok = acceptable, weak =',
    '  poor / concerning, unknown = the JD does not say. For "red_flags",',
    '  strong = none found, weak = notable red flags.',
    '',
    'Be conservative on the OVERALL verdict: if genuinely unsure between two',
    'levels, choose the MORE generous one (WEAK over SKIP) — never wrongly',
    'discard a real match. Ground every dimension in the JD: evidence must be',
    'text actually present in the description, never invented.',
    'All keys are required; use empty arrays rather than omitting.',
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
  const verdict = JUDGE_VERDICTS.find((x) => x === v);
  if (!verdict) throw new Error(`judge verdict "${obj.verdict}" is not one of ${JUDGE_VERDICTS.join('/')}`);

  return {
    verdict,
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
    reasons: toStringArray(obj.reasons),
    blockers: toStringArray(obj.blockers),
    dimensions: parseDimensions(obj.dimensions),
  };
}

/**
 * Parse the dimensions array defensively: drop entries with an unknown key,
 * coerce an out-of-range rating to "unknown", trim+cap evidence to MAX_EVIDENCE
 * short strings, and dedupe by key (first wins). A model that omits dimensions
 * or ships junk degrades to [] — the verdict is still usable (advisory).
 */
function parseDimensions(raw: unknown): VerdictDimension[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<DimensionKey>();
  const out: VerdictDimension[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const key = DIMENSION_KEYS.find((k) => k === String(o.key ?? '').toLowerCase().trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const r = String(o.rating ?? '').toLowerCase().trim();
    const rating = DIMENSION_RATINGS.find((x) => x === r) ?? 'unknown';
    out.push({
      key,
      rating,
      note: typeof o.note === 'string' ? o.note.trim() : '',
      evidence: toStringArray(o.evidence)
        .slice(0, MAX_EVIDENCE)
        .map((e) => (e.length > EVIDENCE_MAX_LEN ? `${e.slice(0, EVIDENCE_MAX_LEN - 1)}…` : e)),
    });
  }
  return out;
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
