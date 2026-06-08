import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * Ashby public posting API (slow — 30s timeout).
 * GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * Full descriptionPlain included in the list response (verified live).
 */

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl?: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  compensation?: {
    compensationTierSummary?: string;
  };
}

export function parseAshbyJobs(payload: { jobs: AshbyJob[] }, companyName: string): RawJob[] {
  return (payload.jobs ?? [])
    .filter((j) => j.jobUrl && j.title && j.isListed !== false)
    .map((j) => {
      const locations = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)]
        .filter(Boolean)
        .join(', ');
      const wm = j.isRemote ? 'remote' : (j.workplaceType ?? '').toLowerCase();
      return {
        externalId: j.id,
        sourceId: 'ats:ashby',
        company: companyName,
        title: j.title,
        location: locations || null,
        workMode:
          wm === 'remote' || wm === 'hybrid' || wm === 'onsite' ? (wm as RawJob['workMode']) : 'unknown',
        salaryText: j.compensation?.compensationTierSummary ?? null,
        description: j.descriptionPlain ?? null,
        url: j.jobUrl,
        tags: [j.department, j.team, j.employmentType].filter((t): t is string => Boolean(t)),
        postedDate: parsePostedDate(j.publishedAt ?? null),
      };
    });
}

export async function fetchAshby(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
  const payload = await http.getJson<{ jobs: AshbyJob[] }>(url, {
    allowHosts: ['api.ashbyhq.com'],
    redirect: 'error',
    delayRangeMs: [500, 1500],
    timeoutMs: 30_000,
  });
  return parseAshbyJobs(payload, companyName);
}
