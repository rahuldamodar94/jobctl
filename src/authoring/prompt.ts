/**
 * Prompt builders for auto-authoring the optional-AI config FROM the user's
 * resume: the fit-judge rubric and the resume-generation rules. Eliminates the
 * "hand-write two markdown files" burden — the user uploads a resume and we
 * derive grounded defaults they can then refine in plain language.
 *
 * The output follows the existing judge-rubric.md / RESUME_GENERATION_SKILL.md
 * section shape (both are consumed downstream as opaque text and round-trip
 * through the Settings editor). Grounded + anti-fluff: every claim must trace to
 * the resume. Pure functions, unit-tested.
 */

export type AuthorTarget = 'rubric' | 'skill';

export interface AuthorOpts {
  /** the user's base resume (markdown) — the only source of truth */
  resume: string;
  /** profile location preference, so the rubric's location line is real */
  location?: string;
  /** the current on-disk draft, for a refinement pass */
  currentDraft?: string;
  /** a natural-language refinement instruction ("be stricter on location") */
  instruction?: string;
}

const GROUNDING = [
  '=== RULES ===',
  'Ground EVERY statement in the resume above — never invent skills, domains, seniority, or facts the resume does not support.',
  'Be specific and concrete: no generic career-coach filler, no hedging, no preamble.',
  'Output ONLY the markdown document, starting at the first "#" heading. No code fences, no commentary before or after.',
].join('\n');

function refinementBlock(opts: AuthorOpts): string[] {
  if (!opts.currentDraft && !opts.instruction) return [];
  return [
    '',
    '=== CURRENT DRAFT (revise this, do not start over) ===',
    opts.currentDraft?.trim() || '(none yet)',
    '',
    '=== REVISION INSTRUCTION ===',
    opts.instruction?.trim() || '(no specific instruction — produce a tighter, better-grounded version)',
    'Make the SMALLEST change that satisfies the instruction; keep every other section and fact intact.',
    'If the instruction asks for something the resume does not support, note the gap instead of inventing it.',
  ];
}

export function buildRubricPrompt(opts: AuthorOpts): string {
  return [
    'You are writing a JOB-FIT SCREENING RUBRIC for ONE candidate, derived from their resume.',
    'It is applied mechanically to job descriptions to return STRONG / DECENT / WEAK / SKIP.',
    '',
    '=== RESUME (the only source of truth about the candidate) ===',
    opts.resume,
    '',
    '=== KNOWN PREFERENCES ===',
    `Location / remote: ${opts.location?.trim() || '(infer from the resume; if unknown, write "remote — confirm")'}`,
    '',
    '=== TASK ===',
    'First analyze the resume: years of experience, primary stack (skills appearing in multiple or recent roles), domains, role archetype (IC backend / EM / PM / etc.), and conspicuous GAPS (e.g. no frontend anywhere → frontend-primary is an auto-skip).',
    'Then emit the rubric in EXACTLY this section structure, with the values filled in from your analysis:',
    '',
    '# JD Evaluation Rubric',
    '## Candidate snapshot',
    '(bullets: Years of experience · Primary stack · Domain · Location / remote · Target roles — each grounded in the resume)',
    '## Auto-skip (any one true → SKIP)',
    '(concrete dealbreakers derived from the resume: wrong primary language, frontend/mobile-primary, seniority far off, onsite with no visa, unwanted role types. Mark inferred ones so the user can veto.)',
    '## Score each 0-3 (0 none · 3 strong)',
    '1. Stack match  2. Domain match  3. Role-type match  4. Location match  5. Seniority match  6. Compensation signal',
    '## Verdict (total /18)',
    'STRONG 14-18 · DECENT 10-13 · WEAK 6-9 · SKIP 0-5 (or any auto-skip)',
    '## Output per JD',
    'Verdict + one line why it fits + one line what does not + any hard blockers to verify.',
    ...refinementBlock(opts),
    '',
    GROUNDING,
  ].join('\n');
}

export function buildSkillPrompt(opts: AuthorOpts): string {
  return [
    "You are writing the RULES a resume-tailoring assistant will follow to adapt THIS person's resume per job.",
    'Infer the rules from their real resume so generated resumes reproduce its structure, tone, and emphasis exactly — and never fabricate.',
    '',
    '=== BASE RESUME (the only source of truth) ===',
    opts.resume,
    '',
    '=== TASK ===',
    'Analyze the resume, then emit the rules in EXACTLY this section structure, filled from your analysis:',
    '',
    '# Resume Generation Rules',
    '## Candidate profile',
    '(Name, contact details, location, years of experience — verbatim from the resume.)',
    '## Canonical facts',
    '(The exact numbers, metrics, team sizes, dates, employer and project names that must always be stated exactly. The generator must never invent anything beyond these.)',
    '## Approved skills list',
    '(Only skills actually present in the resume. Anything not listed must never appear.)',
    '## Structure & voice',
    '(The section order, tense, bullet density, and whether metrics are bolded — describe what the resume ACTUALLY does, so generated output matches it.)',
    '## Reframing rules',
    '(How to re-emphasize existing experience per company/domain — never invent.)',
    '## Hard rules',
    '(Never fabricate experience or skills; one page only; honest and defensible in an interview. Add a "never mention <name>" line here if an employer must be suppressed.)',
    ...refinementBlock(opts),
    '',
    GROUNDING,
  ].join('\n');
}

export function buildAuthorPrompt(target: AuthorTarget, opts: AuthorOpts): string {
  return target === 'rubric' ? buildRubricPrompt(opts) : buildSkillPrompt(opts);
}

// ---------------------------------------------------------------------------
// Roles tuning (structured JSON, not markdown). The title_keywords come from a
// curated template and are PRESERVED; the LLM tunes the per-user knobs that
// actually need the resume — must_have_stack, weighted nice_to_have, and the
// excludes — so good-fit jobs score high and wrong-fit jobs are filtered.
// ---------------------------------------------------------------------------

export interface RolesAuthorOpts {
  /** the user's base resume (markdown) — the source of truth for stack/domains */
  resume: string;
  /** the current role as pretty JSON (preserve id/title_keywords; tune the rest) */
  currentRole: string;
  /** profile location preference */
  location?: string;
  /** current draft JSON, for a refinement pass */
  currentDraft?: string;
  /** a natural-language refinement instruction ("weight fintech higher") */
  instruction?: string;
}

function jsonRefinementBlock(opts: { currentDraft?: string; instruction?: string }): string[] {
  if (!opts.currentDraft && !opts.instruction) return [];
  return [
    '',
    '=== CURRENT DRAFT (revise this JSON, do not start over) ===',
    opts.currentDraft?.trim() || '(none yet)',
    '',
    '=== REVISION INSTRUCTION ===',
    opts.instruction?.trim() || '(no specific instruction — produce a tighter, better-grounded version)',
    'Make the SMALLEST change that satisfies the instruction; keep every other field intact.',
  ];
}

export function buildRolesPrompt(opts: RolesAuthorOpts): string {
  return [
    'You are tuning ONE job-search role configuration for a candidate, from their resume.',
    'A keyword matcher uses this config: a job must contain a title_keyword (and no title_exclude),',
    'must mention a must_have_stack term, and is then SCORED by the nice_to_have weights.',
    '',
    '=== RESUME (the only source of truth about the candidate) ===',
    opts.resume,
    '',
    '=== CURRENT ROLE (JSON) ===',
    opts.currentRole,
    '',
    '=== KNOWN PREFERENCES ===',
    `Location / remote: ${opts.location?.trim() || '(infer from the resume)'}`,
    '',
    '=== TASK ===',
    'The title_keywords are already curated from a template — PRESERVE them (you MAY add real-world',
    'variants the resume justifies, but never remove one). Your real job is to tune the OTHER fields',
    'from the resume so good-fit jobs score highly and wrong-fit jobs are filtered:',
    '',
    "- \"must_have_stack\": the few CORE technologies a relevant JD must mention (the candidate's",
    '  primary, recurring stack). Keep it SMALL — each term is an OR gate that lets a job through.',
    '- "nice_to_have": an object mapping keyword -> integer weight. POSITIVE (1-10) boosts the score',
    "  when the JD mentions it; give higher weights to the candidate's strongest/most distinctive",
    '  signals (key domains, tools, specialties) and lower to generic-but-relevant ones. NEGATIVE',
    '  weights (-1 to -15) deprioritize mismatches (domains/stacks the candidate wants to avoid).',
    '- "title_exclude": title words that signal a WRONG role for this candidate (specializations they',
    '  do not do — e.g. frontend / mobile / qa for a backend candidate).',
    "- \"exclude_if_primary\": languages/frameworks that, when they are the JD's PRIMARY requirement,",
    '  mean skip (the candidate does not lead in them).',
    '',
    'Ground EVERY entry in the resume — never invent skills, domains, or tools it does not show.',
    'Weights must reflect how strongly each term signals a genuinely good fit for THIS candidate.',
    ...jsonRefinementBlock(opts),
    '',
    '=== OUTPUT (STRICT) ===',
    'Return ONLY a JSON object (no prose, no code fences) with EXACTLY these keys:',
    '  "id", "label", "title_keywords", "must_have_stack", "nice_to_have", "title_exclude", "exclude_if_primary"',
    'Keep "id" exactly as the current role. The four *_keywords/stack/exclude fields are arrays of',
    'strings; "nice_to_have" is an object of string -> integer.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Profile tuning — which company DOMAINS to scrape + LOCATION preferences,
// inferred from the resume. Domains must come from the committed vocabulary.
// ---------------------------------------------------------------------------

export interface ProfileAuthorOpts {
  resume: string;
  /** the committed domain vocabulary — the LLM must pick ids only from here */
  domains: { id: string; label: string; description: string }[];
  currentDomains: string[];
  currentGeoPriority: string[];
  currentGeoRelocation: string[];
  /** the user's stated location preference, if any */
  location?: string;
  currentDraft?: string;
  instruction?: string;
}

export function buildProfilePrompt(opts: ProfileAuthorOpts): string {
  const vocab = opts.domains
    .map((d) => `- ${d.id}: ${d.label}${d.description ? ` — ${d.description}` : ''}`)
    .join('\n');
  return [
    'You are choosing which company DOMAINS to scrape and the LOCATION preferences for a candidate,',
    'inferred from their resume. These drive which companies are scraped and how jobs are geo-scored.',
    '',
    '=== RESUME (the only source of truth about the candidate) ===',
    opts.resume,
    '',
    '=== VALID DOMAINS (choose ids ONLY from this list) ===',
    vocab,
    '',
    '=== CURRENT SETTINGS ===',
    `domains: ${opts.currentDomains.join(', ') || '(none)'}`,
    `geo_priority: ${opts.currentGeoPriority.join(', ') || '(none)'}`,
    `geo_relocation_ok: ${opts.currentGeoRelocation.join(', ') || '(none)'}`,
    `stated location: ${opts.location?.trim() || '(infer from the resume)'}`,
    '',
    '=== TASK ===',
    "Pick the domains whose companies best fit the candidate's actual experience (the industries and",
    'technologies they have really worked in). Prefer a focused, relevant set over selecting everything.',
    'Propose geo_priority (places they clearly want — their city/region, and "Remote" if remote-friendly)',
    'and geo_relocation_ok (places they would relocate to). Ground every location in the resume.',
    ...jsonRefinementBlock(opts),
    '',
    '=== OUTPUT (STRICT) ===',
    'Return ONLY a JSON object (no prose, no code fences) with EXACTLY these keys:',
    '  "domains": array of domain ids (each MUST be from the valid list above)',
    '  "geo_priority": array of location strings',
    '  "geo_relocation_ok": array of location strings',
  ].join('\n');
}
