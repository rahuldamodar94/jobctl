/**
 * Posted-date parsing — convert the mess boards show ("5d", "2w", "3 days ago",
 * ISO strings, epoch ms) into absolute ISO dates AT SCRAPE TIME so they never drift.
 * Pure functions; `now` injectable for tests.
 */

const REL_RE = /^[<~\s]*(\d+)\s*(h|hr|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|year|years)\b/i;

const UNIT_DAYS: Record<string, number> = {
  h: 0, hr: 0, hour: 0, hours: 0,
  d: 1, day: 1, days: 1,
  w: 7, wk: 7, week: 7, weeks: 7,
  mo: 30, month: 30, months: 30,
  y: 365, year: 365, years: 365,
};

/**
 * The date "today" in the machine's LOCAL timezone as yyyy-mm-dd.
 * Used for first_seen/last_seen stamps and decay cutoffs: a user in Dubai
 * (UTC+4) triaging at 02:00 local must see "today", not yesterday-UTC.
 * 'en-CA' is the locale whose date format is exactly ISO yyyy-mm-dd.
 */
export function localDateISO(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA');
}

export function parsePostedDate(
  raw: string | number | null | undefined,
  now: Date = new Date()
): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Epoch timestamps (ATS APIs / RemoteOK). Lever sends milliseconds,
  // RemoteOK sends SECONDS — anything below 1e12 (~Sep 2001 in ms) is
  // unambiguously seconds, so scale it up rather than parsing as 1970.
  if (typeof raw === 'number') {
    // 0 / negative are "missing" sentinels in some ATS JSON — not 1970
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (isNaN(d.getTime()) || d.getTime() > now.getTime()) return null; // future = bad data
    return localDateISO(d);
  }

  const s = raw.trim();

  // "< 1d" special-case is covered by REL_RE's leading [<~] allowance
  const rel = s.match(REL_RE);
  if (rel) {
    const n = parseInt(rel[1]!, 10);
    const unit = rel[2]!.toLowerCase();
    let daysBack = n * (UNIT_DAYS[unit] ?? 1);
    // "< 1d" means "less than N ago" — use the newer bound
    if (s.startsWith('<')) daysBack = Math.max(0, daysBack - 1);
    return localDateISO(new Date(now.getTime() - daysBack * 86_400_000));
  }

  // ISO date or timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime()) || d.getTime() > now.getTime()) return null; // future = bad data
    return localDateISO(d);
  }

  return null;
}

export function isOlderThan(
  isoDate: string | null,
  maxAgeDays: number,
  now: Date = new Date()
): boolean {
  if (!isoDate) return false; // unknown age — keep, first_seen governs
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  // bare yyyy-mm-dd parses as UTC midnight; pin to LOCAL midnight to match the
  // rest of the codebase (localDateISO stamps) — else off-by-a-day west of UTC.
  const t = isoDate.length === 10 ? new Date(`${isoDate}T00:00:00`) : new Date(isoDate);
  return t.getTime() < cutoff;
}
