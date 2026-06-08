import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from './html-to-text.js';

/**
 * Greenhouse public board API.
 * GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 * `content=true` includes the full JD as escaped HTML (verified live) — no N+1.
 */

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string } | null;
  content?: string;
  updated_at?: string;
  first_published?: string;
  metadata?: unknown;
}

export function parseGreenhouseJobs(payload: { jobs: GreenhouseJob[] }, companyName: string): RawJob[] {
  return (payload.jobs ?? [])
    .filter((j) => j.absolute_url && j.title)
    .map((j) => ({
      externalId: String(j.id),
      sourceId: 'ats:greenhouse',
      company: companyName,
      title: j.title,
      location: j.location?.name ?? null,
      workMode: /remote/i.test(j.location?.name ?? '') ? ('remote' as const) : ('unknown' as const),
      salaryText: null,
      description: j.content ? htmlToText(j.content) : null,
      url: j.absolute_url,
      tags: [],
      postedDate: parsePostedDate(j.first_published ?? j.updated_at ?? null),
    }));
}

export async function fetchGreenhouse(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const payload = await http.getJson<{ jobs: GreenhouseJob[] }>(url, {
    allowHosts: ['boards-api.greenhouse.io'],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  return parseGreenhouseJobs(payload, companyName);
}
