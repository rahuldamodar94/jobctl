import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * Breezy HR public board JSON.
 * GET https://{slug}.breezy.hr/json
 * Returns an array of all published positions in ONE call with `id`,
 * `friendly_id`, `name`, `url`, `published_date`, structured `type` and
 * `location{city,state,country,is_remote,remote_details}`.
 *
 * LIST-ONLY (no JD body): the per-job endpoints (`/json/{friendly_id}`,
 * `/{friendly_id}/json`) 302-redirect to `/` and so fail under redirect:'error'
 * (verified 2026-06-09) — there is no public per-job JSON. Title + location
 * still satisfy the matcher's short-JD path (it matches on title+tags and flags
 * absent stack evidence), so list-only is acceptable for v1.
 */

interface BreezyNamed {
  id?: string;
  name?: string;
}

interface BreezyLocation {
  country?: BreezyNamed | null;
  state?: BreezyNamed | null;
  city?: string | null;
  name?: string | null;
  is_remote?: boolean;
  remote_details?: { value?: string | null; label?: string | null } | null;
}

interface BreezyPosition {
  id?: string;
  friendly_id?: string;
  name?: string;
  url?: string;
  published_date?: string | null;
  type?: BreezyNamed | null;
  location?: BreezyLocation | null;
}

function breezyLocation(loc?: BreezyLocation | null): { location: string | null; workMode: RawJob['workMode'] } {
  if (!loc) return { location: null, workMode: 'unknown' };
  const place =
    [loc.city, loc.state?.name, loc.country?.name].filter(Boolean).join(', ') || loc.name || null;
  const remoteVal = (loc.remote_details?.value ?? '').toLowerCase();
  let workMode: RawJob['workMode'] = 'unknown';
  if (loc.is_remote || remoteVal === 'remote') workMode = 'remote';
  else if (remoteVal === 'hybrid') workMode = 'hybrid';
  else if (place) workMode = 'onsite';
  const location = workMode === 'remote' ? (place ? `Remote / ${place}` : 'Remote') : place;
  return { location, workMode };
}

export function parseBreezyJobs(payload: BreezyPosition[], companyName: string): RawJob[] {
  return (Array.isArray(payload) ? payload : [])
    .filter((p) => !!p.name && !!(p.friendly_id || p.id || p.url))
    .map((p) => {
      const { location, workMode } = breezyLocation(p.location);
      return {
        externalId: p.friendly_id || p.id || p.url!,
        sourceId: 'ats:breezy',
        company: companyName,
        title: p.name!,
        location,
        workMode,
        salaryText: null,
        description: null, // list-only — no public per-job JD (see file header)
        url: p.url ?? '',
        tags: p.type?.name ? [p.type.name] : [],
        postedDate: parsePostedDate(p.published_date ?? null),
      };
    });
}

export async function fetchBreezy(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const host = `${slug.toLowerCase()}.breezy.hr`; // host derived from the validated slug → SSRF-safe
  const payload = await http.getJson<BreezyPosition[]>(`https://${host}/json`, {
    allowHosts: [host],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  return parseBreezyJobs(payload, companyName);
}
