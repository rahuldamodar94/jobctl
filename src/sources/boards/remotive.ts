import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from '../ats/html-to-text.js';

/**
 * Remotive — general remote-jobs board with a public JSON API.
 * GET https://remotive.com/api/remote-jobs?category=software-dev
 * Disabled by default in Web3-focused profiles; useful for AI/generic searches.
 */

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  url: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  tags?: string[];
  publication_date?: string;
  job_type?: string;
}

export function parseRemotiveJobs(payload: { jobs: RemotiveJob[] }): RawJob[] {
  return (payload.jobs ?? [])
    .filter((j) => j.url && j.title && j.company_name)
    .map((j) => ({
      externalId: String(j.id),
      sourceId: 'remotive',
      company: j.company_name,
      title: j.title,
      location: j.candidate_required_location ?? 'Remote',
      workMode: 'remote' as const,
      salaryText: j.salary?.trim() || null,
      description: j.description ? htmlToText(j.description) : null,
      url: j.url,
      tags: j.tags ?? [],
      postedDate: parsePostedDate(j.publication_date ?? null),
    }));
}

export const remotive: BoardAdapter = {
  id: 'remotive',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const category = String(ctx.config.options?.category ?? 'software-dev');
    const payload = await ctx.http.getJson<{ jobs: RemotiveJob[] }>(
      `${ctx.config.baseUrl}/api/remote-jobs?category=${encodeURIComponent(category)}`
    );
    const jobs = parseRemotiveJobs(payload);
    ctx.log(`remotive: ${jobs.length} jobs (${category})`);
    return jobs;
  },
};
