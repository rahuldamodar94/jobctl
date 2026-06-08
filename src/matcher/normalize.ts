/**
 * Company/title normalization — the foundation of dedup.
 * Pure functions, no I/O.
 */

const LEGAL_SUFFIXES = /\b(limited|ltd|llc|inc|corp|gmbh|labs?)\.?$/i;

const SENIORITY_SYNONYMS: Record<string, string> = {
  sr: 'senior',
  'sr.': 'senior',
  snr: 'senior',
  eng: 'engineer',
  'eng.': 'engineer',
  engr: 'engineer',
  dev: 'developer',
  mgr: 'manager',
};

/** Tokens that don't define WHAT the role is (dropped for fuzzy comparison). */
const TITLE_STOPWORDS = new Set([
  'senior', 'staff', 'principal', 'lead', 'junior', 'mid', 'sr', 'jr',
  'remote', 'hybrid', 'onsite', 'fulltime', 'parttime', 'contract',
  'a', 'an', 'the', 'of', 'and', 'or', 'for', 'in', 'at', 'to', 'team',
  // common geo fragments that leak into titles
  'dubai', 'uae', 'london', 'usa', 'us', 'eu', 'emea', 'apac', 'india',
  'new', 'york', 'nyc', 'singapore', 'berlin', 'amsterdam', 'madrid',
]);

function stripPunctuation(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normCompany(company: string): string {
  let s = company.toLowerCase().trim();
  // "ether.fi" → "etherfi": collapse dots WITHIN a single word before stripping
  s = s.replace(/(\w)\.(\w)/g, '$1$2');
  s = stripPunctuation(s);
  // strip one trailing legal suffix, but never reduce to empty
  const stripped = s.replace(LEGAL_SUFFIXES, '').trim();
  return stripped.length > 0 ? stripped : s;
}

export function normTitle(title: string): string {
  const words = stripPunctuation(title)
    .split(' ')
    .map((w) => SENIORITY_SYNONYMS[w] ?? w);
  return words.join(' ');
}

/** Role-defining tokens only — used for fuzzy title overlap in dedupe. */
export function coreTitleTokens(title: string): string[] {
  return normTitle(title)
    .split(' ')
    .filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w));
}
