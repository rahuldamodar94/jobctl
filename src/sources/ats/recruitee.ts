import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from './html-to-text.js';

/**
 * Recruitee public board API.
 * GET https://{slug}.recruitee.com/api/offers/
 * Returns ALL published offers in one call WITH the full description inline
 * (HTML) — no pagination, no per-job fetch (no N+1).
 */
interface RecruiteeOffer {
  id: number;
  title: string;
  description?: string | null; // HTML
  location?: string | null;
  city?: string | null;
  country?: string | null;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  careers_url?: string | null;
  careers_apply_url?: string | null;
  status?: string;
  published_at?: string | null;
  created_at?: string | null;
  tags?: string[] | null;
}

export function parseRecruiteeJobs(payload: { offers?: RecruiteeOffer[] }, companyName: string): RawJob[] {
  return (payload.offers ?? [])
    .filter((o) => o.status === 'published' && !!o.title && !!(o.careers_url || o.careers_apply_url))
    .map((o) => {
      const place = [o.city, o.country].filter(Boolean).join(', ');
      const location = o.remote ? (place ? `Remote / ${place}` : 'Remote') : place || o.location || null;
      const workMode: RawJob['workMode'] = o.remote ? 'remote' : o.hybrid ? 'hybrid' : o.on_site ? 'onsite' : 'unknown';
      return {
        externalId: String(o.id),
        sourceId: 'ats:recruitee',
        company: companyName,
        title: o.title,
        location,
        workMode,
        salaryText: null,
        description: o.description ? htmlToText(o.description) : null,
        url: o.careers_url ?? o.careers_apply_url ?? '',
        tags: o.tags ?? [],
        postedDate: parsePostedDate(o.published_at ?? o.created_at ?? null),
      };
    });
}

export async function fetchRecruitee(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  // The detect regex is case-insensitive, so a pasted "ACME.recruitee.com" yields
  // slug "ACME"; lowercase it (the subdomain is DNS-case-insensitive — safe, unlike
  // Ashby slugs which ARE case-sensitive and must NOT be touched).
  const host = `${slug.toLowerCase()}.recruitee.com`; // host derived from the validated slug → SSRF-safe
  const payload = await http.getJson<{ offers?: RecruiteeOffer[] }>(`https://${host}/api/offers/`, {
    allowHosts: [host],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  return parseRecruiteeJobs(payload, companyName);
}
