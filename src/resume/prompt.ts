/**
 * Prompt assembly + output validation for resume generation.
 * The LLM (local `claude` CLI) does the semantic tailoring per the user's
 * skill document; everything here is deterministic and unit-tested.
 */

export interface ResumeJobInput {
  company: string;
  title: string;
  location: string | null;
  category: string;
  description: string | null;
  url: string;
}

export function assembleResumePrompt(
  job: ResumeJobInput,
  skillText: string,
  resumeIcMd: string,
  resumeEmMd: string,
  /** profile resume_rules.forbidden_terms — e.g. NDA'd employer names. */
  forbiddenTerms: string[] = []
): string {
  // numbered dynamically so the list stays consistent when no terms are configured
  const hardRules = [
    [
      'ABSOLUTELY NO em dashes (—) or en dashes (–) anywhere. LLMs habitually write "X — Y";',
      '   you must not. Use a comma, colon, or plain hyphen instead:',
      '     WRONG: "shipped the indexer — cutting latency 40%"   (em dash)',
      '     RIGHT: "shipped the indexer, cutting latency 40%"',
      '   Date ranges and role lines use a plain hyphen: "2019-2021", "**Title** - 2019-2021 · London".',
    ].join('\n'),
    ...(forbiddenTerms.length
      ? [`Never mention ${forbiddenTerms.join(', ')} under any circumstances.`]
      : []),
    'Only skills approved by the skill document; honest content only, never invent facts or metrics.',
    'Keep the exact contact details (email, phone, links) from the base resume.',
  ].map((rule, i) => `${i + 1}. ${rule}`);

  return [
    'You are generating a tailored resume. Follow EVERY rule in the skill document below; it is the contract.',
    '',
    '=== SKILL DOCUMENT (rules, canonical facts, hard constraints) ===',
    skillText,
    '',
    '=== BASE RESUME: IC ===',
    resumeIcMd,
    '',
    '=== BASE RESUME: EM ===',
    resumeEmMd,
    '',
    '=== TARGET JOB ===',
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    `Location: ${job.location ?? 'not stated'}`,
    `Category: ${job.category}`,
    `Posting URL: ${job.url}`,
    'Job description:',
    job.description?.trim() || '(no description available — tailor from the title, company, and category)',
    '',
    '=== OUTPUT CONTRACT ===',
    'Return ONLY the tailored resume as markdown, nothing else: no preamble, no commentary, no code fences.',
    'Use the EXACT structure of the base resumes:',
    '  # Name',
    '  subtitle line',
    '  contact line(s)',
    '  ## SECTION headings (Summary, Experience, Skills, Education)',
    '  ### Company names',
    '  **Role title** followed by " - date range · location" on the same line',
    '  bullet lists with "- "',
    'Bold the key metrics inside bullets with **double asterisks** (e.g. **2.5M+ events/day across 25 chains**).',
    'The content must fit ONE printed page: be selective with bullets per the skill rules.',
    '',
    '=== HARD RULES (output is rejected if any fail) ===',
    ...hardRules,
    '',
    'FINAL STEP before returning: scan your complete draft for any em dash (—) or en dash (–)',
    'and rewrite every line that contains one. Only then return the markdown.',
  ].join('\n');
}

export interface ValidationResult {
  ok: boolean;
  markdown?: string;
  error?: string;
}

/** Extract the contact email from a base resume — used to verify the
 *  generated output kept the real contact details (no personal data in code). */
export function extractEmail(baseResumeMd: string): string | null {
  return baseResumeMd.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? null;
}

/** Sanity-check (and lightly clean) the model output before rendering.
 *  forbiddenTerms come from profile resume_rules — never hardcode them here. */
export function validateResumeOutput(
  raw: string,
  expectedEmail?: string | null,
  forbiddenTerms: string[] = []
): ValidationResult {
  let md = raw.trim();

  // strip accidental code fences (```markdown ... ```)
  const fence = md.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  if (fence) md = fence[1]!.trim();

  // Em/en dashes (skill hard rule): punctuation, not content — normalize to a
  // plain hyphen instead of failing the whole (slow, billed) generation.
  // "LLM owns words, code owns layout" is preserved: no words change.
  md = md.replace(/[—–]/g, '-');

  if (!md.startsWith('# ')) {
    return { ok: false, error: 'output does not start with the "# Name" heading (preamble chatter?)' };
  }
  if (!md.includes('\n## ')) return { ok: false, error: 'no "## Section" headings found' };
  if (md.length < 1000) return { ok: false, error: `output too short (${md.length} chars) — truncated?` };
  if (md.length > 8000) return { ok: false, error: `output too long (${md.length} chars) — not one page` };
  for (const term of forbiddenTerms) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(md)) return { ok: false, error: `mentions "${term}" (profile forbidden term)` };
  }
  if (expectedEmail && !md.includes(expectedEmail)) {
    return { ok: false, error: 'contact email missing — output likely malformed' };
  }
  return { ok: true, markdown: md };
}
