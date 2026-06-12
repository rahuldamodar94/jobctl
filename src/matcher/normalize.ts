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
  // Common geo fragments that leak into titles — these must NOT count as
  // role-defining tokens, or a location suffix inflates fuzzy-dedupe overlap
  // and merges DIFFERENT roles (e.g. "Backend Engineer (Europe)" was merging
  // with "Site Reliability Engineer (Europe)" because the shared "europe"
  // pushed the overlap to 2 tokens). Geo is already its own dedupe dimension.
  // regions / continents
  'eu', 'emea', 'apac', 'latam', 'anz', 'europe', 'americas', 'america',
  'asia', 'africa', 'global', 'worldwide', 'anywhere', 'international', 'based',
  // countries
  'usa', 'us', 'uk', 'india', 'uae', 'germany', 'france', 'ireland',
  'netherlands', 'spain', 'italy', 'poland', 'portugal', 'canada', 'australia',
  'brazil', 'mexico', 'japan', 'israel', 'switzerland', 'sweden', 'romania',
  'philippines', 'indonesia', 'malaysia', 'singapore', 'argentina', 'colombia',
  // cities
  'dubai', 'london', 'york', 'nyc', 'new', 'berlin', 'amsterdam', 'madrid',
  'paris', 'munich', 'dublin', 'lisbon', 'barcelona', 'toronto', 'vancouver',
  'sydney', 'melbourne', 'tokyo', 'bangalore', 'bengaluru', 'mumbai', 'delhi',
  'hyderabad', 'pune', 'chennai', 'warsaw', 'krakow', 'zurich', 'stockholm',
  'lagos', 'nairobi', 'riyadh', 'doha',
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
