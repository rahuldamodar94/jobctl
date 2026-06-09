import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * SmartRecruiters public Posting API.
 * GET https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset=N
 * → { totalFound, offset, limit, content: [...] }, paginated (max limit 100).
 *
 * Unlike greenhouse/lever/ashby/recruitee/workable, the LIST does NOT carry the
 * job description — the full JD lives only on the per-posting detail endpoint
 * (`/postings/{id}` → jobAd.sections), i.e. an N+1 fetch. We deliberately ship
 * LIST-ONLY for now: the matcher's short-JD path scores on title+tags (jobs
 * appear, matched, with a stackUnverified flag), and the advisory fit-judge
 * degrades gracefully without a JD. Title-gated JD enrichment is a documented
 * follow-up (it must NOT N+1 every posting — companies here can have thousands).
 *
 * The slug is CASE-SENSITIVE (like Ashby) — never lowercase it. The API host is
 * fixed; the regex-derived slug is encodeURIComponent'd into the path → SSRF-safe.
 */

const API_HOST = 'api.smartrecruiters.com';
const PAGE = 100;
// Bound the per-company pagination. 50 pages = 5000 postings, which covers every
// current target (the largest, BoschGroup ~4.6k, isn't in the registry anyway).
// A company beyond this is capped — visible via the job count logged per source.
const MAX_PAGES = 50;

interface SrLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean;
  hybrid?: boolean;
  fullLocation?: string | null;
}

interface SrCustomField {
  fieldLabel?: string | null;
  valueLabel?: string | null;
}

interface SrPosting {
  id?: string | number;
  name?: string | null;
  releasedDate?: string | null;
  location?: SrLocation | null;
  customField?: SrCustomField[] | null;
}

export interface SrPage {
  totalFound?: number;
  offset?: number;
  limit?: number;
  content?: SrPosting[];
}

/** fullLocation can carry empty segments ("London, , United Kingdom") — clean
 *  them; fall back to city/region/country when fullLocation is absent. */
function srLocation(loc?: SrLocation | null): string | null {
  if (!loc) return null;
  const raw = loc.fullLocation ?? [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  const place =
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ') || null;
  if (loc.remote) return place ? `Remote / ${place}` : 'Remote';
  return place;
}

/** SmartRecruiters surfaces a pay range as a customField labelled like
 *  "Job Ad Salary Range" — capture it when present. */
function srSalary(fields?: SrCustomField[] | null): string | null {
  const f = (fields ?? []).find((x) => /salary/i.test(x.fieldLabel ?? ''));
  return f?.valueLabel?.trim() || null;
}

export function parseSmartRecruitersJobs(postings: SrPosting[], slug: string, companyName: string): RawJob[] {
  return postings
    .filter((p) => p.id != null && !!p.name)
    .map((p) => {
      const loc = p.location;
      const workMode: RawJob['workMode'] = loc?.remote ? 'remote' : loc?.hybrid ? 'hybrid' : 'unknown';
      return {
        externalId: String(p.id),
        sourceId: 'ats:smartrecruiters',
        company: companyName,
        title: p.name!,
        location: srLocation(loc),
        workMode,
        salaryText: srSalary(p.customField),
        description: null, // list has no JD; enrichment (N+1 detail) is a future step
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${p.id}`,
        tags: [],
        postedDate: parsePostedDate(p.releasedDate ?? null),
      };
    });
}

export async function fetchSmartRecruiters(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE;
    const url = `https://${API_HOST}/v1/companies/${encodeURIComponent(slug)}/postings?limit=${PAGE}&offset=${offset}`;
    const data = await http.getJson<SrPage>(url, {
      allowHosts: [API_HOST],
      redirect: 'error',
      delayRangeMs: [500, 1500],
    });
    const content = data.content ?? [];
    out.push(...parseSmartRecruitersJobs(content, slug, companyName));
    const total = data.totalFound ?? out.length;
    if (content.length === 0 || offset + content.length >= total) break;
  }
  return out;
}
