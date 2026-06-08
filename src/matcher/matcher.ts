import type { MatchResult, RoleConfig } from '../shared/types.js';
import { locationMatches } from './geo.js';

/**
 * Keyword matcher — hard filter + 0-100 soft score, fully config-driven.
 * Pure function: same inputs, same outputs, no I/O.
 */

export interface MatchInput {
  title: string;
  description: string | null;
  tags: string[];
  location: string | null;
}

// 'sr' covers the "Sr. Software Engineer" abbreviation (word-boundary keeps
// it from matching inside other words)
const SENIORITY_TITLE_RE = /\b(senior|sr|staff|lead|principal|manager|director|head)\b/i;

function escapeRe(s: string): string {
  return s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The term as a standalone token: 'scala' must not match inside "scalable". */
const boundary = (term: string) => `(?<![a-z0-9])${escapeRe(term)}(?![a-z0-9])`;

const REQUIRED_NEARBY_RE = (term: string) =>
  new RegExp(
    `(must have|required|primary|you have|expert in|deep experience (with|in)|proficien\\w+ (with|in)|strong\\w* (in|with))[^.]{0,80}${boundary(term)}` +
      `|${boundary(term)}[^.]{0,60}(is required|is our primary|in production)`,
    'i'
  );

/**
 * Word-boundary keyword test: 'node' must match "node", "node.js", "(node)"
 * but NOT "anode" or "nodemon". Lookarounds on [a-z0-9] act as boundaries
 * that work for dotted/symbol terms ('node.js', 'c++') where \b fails.
 */
export function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(boundary(t), 'i').test(haystack);
}

/** Word-boundary occurrence count — substring counting caused the audit's
 *  worst bug class ('go' counted inside "governments", 'rust' inside "trust"). */
function countOccurrences(haystack: string, term: string): number {
  if (!term.trim()) return 0;
  return [...haystack.matchAll(new RegExp(boundary(term), 'gi'))].length;
}

/** Count DISTINCT spans matching any of the terms (longest term wins at each
 *  position) — overlapping terms like 'node.js'/'node' count one span, not two. */
function countDistinctMentions(haystack: string, terms: string[]): number {
  const parts = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  if (parts.length === 0) return 0;
  const re = new RegExp(`(?<![a-z0-9])(?:${parts.join('|')})(?![a-z0-9])`, 'gi');
  return [...haystack.matchAll(re)].length;
}

/**
 * Strip NEGATED mentions of a term before judging it: "no Rust required",
 * "Rust not needed", "without prior Golang" must not trigger an exclusion.
 */
function stripNegatedMentions(description: string, term: string): string {
  const t = escapeRe(term.trim());
  return description.replace(
    new RegExp(`(?:\\bno\\b|\\bnot\\b|\\bnon[- ]|\\bwithout\\b)[^.,;]{0,30}${t}`, 'gi'),
    ' '
  );
}

/** "Primary requirement" heuristic: early mention, repeated, or near
 *  required-phrasing. All checks are word-boundary — substring matching here
 *  produced the audit's 23 false exclusions (scalable→scala, trust→rust). */
function isPrimaryRequirement(description: string, term: string): boolean {
  const d = stripNegatedMentions(description.toLowerCase(), term);
  const t = term.trim().toLowerCase();
  if (!containsTerm(d, t)) return false;
  if (containsTerm(d.slice(0, 250), t)) return true;
  if (countOccurrences(d, t) >= 3) return true;
  return REQUIRED_NEARBY_RE(t).test(d);
}

/** Programming-language tokens — used for the polyglot title carve-out. */
const LANGUAGE_TERMS = new Set([
  'rust', 'golang', 'go', 'python', 'java', 'kotlin', 'scala', 'c++', 'c#',
  'ruby', 'php', 'elixir', 'solidity', 'cairo',
]);

/** Below this, the description is too thin to be a real JD (HTML list pages). */
const SHORT_DESCRIPTION_CHARS = 300;
/** Below this, don't even attempt the exclusion heuristic — not enough signal. */
const MIN_DESCRIPTION_FOR_EXCLUSION = 50;

/**
 * Component caps: must-have 20 + nice-to-have 30 + geo 15 + seniority 10 = 75 raw max.
 * Normalized to a 0-100 scale so "great match" reads as 90+, not 70.
 */
const RAW_MAX = 75;

export function matchJob(input: MatchInput, roles: RoleConfig[]): MatchResult {
  const title = input.title.toLowerCase();
  const description = (input.description ?? '').trim();
  const descriptionMissing = description.length < SHORT_DESCRIPTION_CHARS;
  // Match against ALL text we have — title, tags, and whatever description exists.
  const everything = `${title} ${input.tags.join(' ')} ${description}`.toLowerCase();

  const matchedRoleIds: string[] = [];
  const allKeywords = new Set<string>();
  const roleOutcomes: Record<string, string> = {};
  let bestScore = 0;
  let anyStackUnverified = false;

  for (const role of roles) {
    // ---- hard filter ----
    if (!role.titleKeywords.some((k) => title.includes(k))) {
      roleOutcomes[role.id] = 'title: no role keyword';
      continue;
    }

    // Title exclusions (word-boundary — 'go' must not hit "Good Systems") with
    // one carve-out: a language term in the title is forgiven when a must-have
    // term is ALSO in the title ("Backend (Golang or Typescript)" is a polyglot
    // listing the user can apply to with their stack).
    const titleHasMustHave = role.mustHaveStack.some((k) => containsTerm(title, k));
    const titleHit = role.titleExclude?.find(
      (k) => containsTerm(title, k) && !(titleHasMustHave && LANGUAGE_TERMS.has(k.trim()))
    );
    if (titleHit) {
      roleOutcomes[role.id] = `excluded: title contains "${titleHit}"`;
      continue;
    }

    const mustHaveHits = role.mustHaveStack.filter((k) => containsTerm(everything, k));
    let roleStackUnverified = false;
    if (mustHaveHits.length === 0) {
      if (descriptionMissing) {
        // No JD to judge from — include with a flag, not exclude (CONTEXT rule).
        roleStackUnverified = true;
      } else {
        roleOutcomes[role.id] = `stack: none of [${role.mustHaveStack.join(', ')}] found`;
        continue;
      }
    }

    // Exclusion needs a real description to judge "primary"; never hard-fail on
    // absence. When the JD ALSO has must-have stack evidence (polyglot listings
    // like "Go / Typescript"), the excluded language must DOMINATE the user's
    // stack mentions to exclude — co-listing is an opportunity, not a veto.
    if (description.length >= MIN_DESCRIPTION_FOR_EXCLUSION) {
      const d = description.toLowerCase();
      // Count the user's stack mentions as DISTINCT text spans (an alternation
      // matched longest-first), so one literal "node.js" isn't double-counted
      // by both the 'node.js' and 'node' terms — and strip negated mentions
      // ("no TypeScript here") symmetrically with the excluded-term side.
      const mustMentions = countDistinctMentions(
        role.mustHaveStack.reduce((txt, k) => stripNegatedMentions(txt, k), d),
        role.mustHaveStack
      );
      const primary = role.excludeIfPrimary.find((k) => {
        if (!isPrimaryRequirement(description, k)) return false;
        if (mustHaveHits.length === 0) return true; // no TS evidence — primary verdict stands
        return countOccurrences(stripNegatedMentions(d, k), k) > mustMentions;
      });
      if (primary) {
        roleOutcomes[role.id] = `excluded: "${primary.trim()}" is a primary requirement`;
        continue;
      }
    }

    // ---- soft score ----
    let raw = 0;
    const matched: string[] = [];

    raw += Math.min(mustHaveHits.length * 10, 20);
    matched.push(...mustHaveHits);

    let niceTotal = 0;
    for (const [kw, weight] of Object.entries(role.niceToHave)) {
      if (containsTerm(everything, kw)) {
        if (weight > 0) {
          niceTotal += weight;
          matched.push(kw);
        } else {
          raw += weight; // negatives apply directly, uncapped
        }
      }
    }
    raw += Math.min(niceTotal, 30);

    if (locationMatches(input.location, role.geoPriority)) raw += 15;
    else if (locationMatches(input.location, role.geoRelocationOk)) raw += 10;

    if (SENIORITY_TITLE_RE.test(input.title)) raw += 10;

    const score = Math.max(0, Math.min(100, Math.round((raw * 100) / RAW_MAX)));
    roleOutcomes[role.id] = roleStackUnverified ? `matched, stack unverified (score ${score})` : `matched (score ${score})`;
    matchedRoleIds.push(role.id);
    matched.forEach((k) => allKeywords.add(k));
    bestScore = Math.max(bestScore, score);
    if (roleStackUnverified) anyStackUnverified = true;
  }

  return {
    isMatch: matchedRoleIds.length > 0,
    score: bestScore,
    matchedRoleIds,
    reasons: {
      matchedKeywords: [...allKeywords],
      descriptionMissing,
      ...(anyStackUnverified ? { stackUnverified: true } : {}),
      roleOutcomes,
    },
  };
}
