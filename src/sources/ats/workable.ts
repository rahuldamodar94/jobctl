import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from './html-to-text.js';

/**
 * Workable public account widget.
 * GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true
 * Returns all published jobs in ONE call with the full HTML `description`
 * inline (no pagination, no per-job fetch — no N+1). The human path
 * apply.workable.com/{slug}/ 302s via Cloudflare, but the API host answers
 * directly, so we pin to apply.workable.com with redirect:'error'.
 */

const HOST = 'apply.workable.com';

interface WorkableLocation {
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
}

interface WorkableJob {
  title?: string | null;
  shortcode?: string | null;
  code?: string | null;
  employment_type?: string | null;
  telecommuting?: boolean;
  department?: string | null;
  url?: string | null;
  application_url?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  locations?: WorkableLocation[] | null;
  description?: string | null; // HTML
}

interface WorkableAccount {
  name?: string;
  jobs?: WorkableJob[];
}

/** Build a human location string from the primary fields, falling back to the
 *  locations[] array (multi-country roles). */
function workableLocation(j: WorkableJob): string | null {
  const primary = [j.city, j.state, j.country].filter(Boolean).join(', ');
  if (primary) return primary;
  const locs = (j.locations ?? [])
    .map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '))
    .filter(Boolean);
  if (locs.length) return locs.join(' / ');
  return null;
}

export function parseWorkableJobs(payload: WorkableAccount, companyName: string): RawJob[] {
  return (payload.jobs ?? [])
    .filter((j) => !!j.title && !!(j.shortcode || j.url))
    .map((j) => {
      const loc = workableLocation(j);
      // telecommuting=true marks a fully-remote role; otherwise we can't tell
      // hybrid from onsite from this payload, so default to unknown.
      const workMode: RawJob['workMode'] = j.telecommuting ? 'remote' : 'unknown';
      return {
        externalId: j.shortcode || j.url || j.title!,
        sourceId: 'ats:workable',
        company: companyName,
        title: j.title!,
        location: j.telecommuting ? (loc ? `Remote / ${loc}` : 'Remote') : loc,
        workMode,
        salaryText: null,
        description: j.description ? htmlToText(j.description) : null,
        url: j.url ?? j.application_url ?? '',
        tags: [],
        postedDate: parsePostedDate(j.published_on ?? j.created_at ?? null),
      };
    });
}

export async function fetchWorkable(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const payload = await http.getJson<WorkableAccount>(
    `https://${HOST}/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`,
    {
      allowHosts: [HOST],
      redirect: 'error',
      delayRangeMs: [500, 1500],
    }
  );
  return parseWorkableJobs(payload, companyName);
}
