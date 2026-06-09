/**
 * Location parsing — canonical geo buckets for dedup + list matching for scoring.
 * Pure functions, no I/O.
 */

import { containsTerm } from './matcher.js';

const REMOTE_RE = /\bremote\b|\bwork from home\b|\bwfh\b/i;

/** Strip parentheticals and mode qualifiers before fragment extraction. */
function clean(location: string): string {
  return location
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(hybrid|onsite|on-site|full[- ]?time|100%)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical bucket for dedup: 'remote' beats everything (a remote role is one
 * role regardless of region qualifier), else the first concrete place fragment,
 * else 'unknown'.
 */
export function geoBucket(location: string | null | undefined): string {
  if (!location || !location.trim()) return 'unknown';
  if (REMOTE_RE.test(location)) return 'remote';
  const cleaned = clean(location);
  if (!cleaned) return 'unknown';
  // Separators: comma/slash/pipe/&/•/·/em/en dash always split. The ASCII
  // hyphen splits ONLY when whitespace-flanked (" - "), so an intra-word
  // hyphen keeps its tail — "Wilkes-Barre" stays one bucket (not "wilkes"),
  // "Baden-Württemberg" stays whole, while "Berlin - Germany" still splits.
  const first = cleaned.split(/[,/|&•·—–]+|\s-+\s/)[0]?.trim();
  return first && first.length > 1 ? first : 'unknown';
}

/** Two buckets are compatible when merging could be the same job. `remote`
 *  collapses with anything (a remote role is one role regardless of region),
 *  but `unknown` (an UNPARSEABLE location) only matches `unknown` — treating it
 *  as a wildcard merged a same-title role with a garbled location into a real
 *  located role, silently losing the second posting. */
export function geoCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  return a === 'remote' || b === 'remote';
}

/** Does a raw location string match any configured geo term? Word-boundary
 *  matched (same class the matcher uses) so short terms like 'us'/'eu'/'uk'
 *  don't substring-hit "Belarus"/"museum"/"Europe"; multi-word/country terms
 *  ("united states", "remote") still match as a unit. */
export function locationMatches(location: string | null | undefined, terms: string[]): boolean {
  if (!location) return false;
  return terms.some((t) => containsTerm(location, t));
}
