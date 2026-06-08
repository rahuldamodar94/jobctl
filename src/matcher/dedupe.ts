import { createHash } from 'node:crypto';
import { coreTitleTokens, normCompany, normTitle } from './normalize.js';
import { geoBucket, geoCompatible } from './geo.js';
import type { JobStatus } from '../shared/types.js';

/**
 * Dedup — the critical invariant of the whole tool:
 *  1. The same job on three boards must be ONE row.
 *  2. A job the user already triaged must NEVER resurface as new.
 *
 * Two layers:
 *  - exact: dedupe_key (UNIQUE index) over normalized company|title|geo-bucket
 *  - fuzzy: per-company core-title-token overlap, status-aware geo rules
 */

export function dedupeKey(company: string, title: string, location: string | null): string {
  const raw = `${normCompany(company)}|${normTitle(title)}|${geoBucket(location)}`;
  return createHash('sha1').update(raw).digest('hex');
}

/**
 * Companies match when equal OR one is a word-boundary prefix of the other.
 * Catches cross-board name variants ("tether" vs "tether operations",
 * "robinhood" vs "robinhood markets") without merging companies that merely
 * share a word somewhere ("modern treasury" vs "treasury prime").
 */
export function companiesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

export interface DedupeCandidate {
  id: number;
  normCompany: string;
  title: string;
  geoBucket: string;
  status: JobStatus;
}

export interface IncomingJob {
  normCompany: string;
  title: string;
  geoBucket: string;
}

/**
 * Find an existing row the incoming job is a duplicate of.
 * Rules (per design review):
 *  - candidates must share norm_company
 *  - title similarity: ≥2 shared core tokens AND ≥0.6 overlap of the smaller
 *    token set; single-core-token titles require exact core-token equality
 *  - if the candidate is user-triaged (status ≠ new): merge regardless of geo
 *    (suppressing re-suggest beats precision; reposts often change location strings)
 *  - if the candidate is new: merge only when geo buckets are compatible
 */
export function findFuzzyMatch(
  incoming: IncomingJob,
  candidates: DedupeCandidate[]
): DedupeCandidate | null {
  const inTokens = new Set(coreTitleTokens(incoming.title));
  if (inTokens.size === 0) return null;

  for (const c of candidates) {
    if (!companiesCompatible(c.normCompany, incoming.normCompany)) continue;

    const cTokens = new Set(coreTitleTokens(c.title));
    if (cTokens.size === 0) continue;

    const shared = [...inTokens].filter((t) => cTokens.has(t)).length;
    const smaller = Math.min(inTokens.size, cTokens.size);

    const titlesMatch =
      smaller === 1
        ? shared === 1 && inTokens.size === cTokens.size // short titles: exact core equality
        : shared >= 2 && shared / smaller >= 0.6;

    if (!titlesMatch) continue;

    const triaged = c.status !== 'new';
    if (triaged || geoCompatible(c.geoBucket, incoming.geoBucket)) {
      return c;
    }
  }
  return null;
}
