import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from '../ats/html-to-text.js';

/**
 * RemoteOK — general remote-jobs board with a public JSON API.
 * GET https://remoteok.com/api  (item 0 is a legal notice, not a job)
 * Disabled by default in Web3-focused profiles.
 */

interface RemoteOkItem {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  tags?: string[];
  date?: string;
  epoch?: number;
  salary_min?: number;
  salary_max?: number;
  legal?: string;
}

export function parseRemoteOkJobs(payload: RemoteOkItem[]): RawJob[] {
  return (payload ?? [])
    .filter((j) => j.position && j.company && (j.url || j.apply_url))
    .map((j) => ({
      externalId: j.id ?? j.slug ?? j.url!,
      sourceId: 'remoteok',
      company: j.company!,
      title: j.position!,
      location: j.location?.trim() || 'Remote',
      workMode: 'remote' as const,
      salaryText:
        j.salary_min && j.salary_max ? `${j.salary_min.toLocaleString('en-US')}–${j.salary_max.toLocaleString('en-US')} USD` : null,
      description: j.description ? htmlToText(j.description) : null,
      url: j.url ?? j.apply_url!,
      tags: j.tags ?? [],
      postedDate: parsePostedDate(j.date ?? j.epoch ?? null),
    }));
}

export const remoteok: BoardAdapter = {
  id: 'remoteok',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const payload = await ctx.http.getJson<RemoteOkItem[]>(`${ctx.config.baseUrl}/api`);
    const jobs = parseRemoteOkJobs(payload);
    ctx.log(`remoteok: ${jobs.length} jobs`);
    return jobs;
  },
};
