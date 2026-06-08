import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * JobStash — public JSON API, full descriptions included.
 * GET https://middleware.jobstash.xyz/jobs/list?page=N&limit=M
 * → { page, count, total, data: JobstashJob[] }
 */

interface JobstashJob {
  id: string;
  shortUUID: string;
  url: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  location: string | null;
  locationType: string | null; // REMOTE | HYBRID | ONSITE
  minimumSalary: number | null;
  maximumSalary: number | null;
  salaryCurrency: string | null;
  timestamp: number | null;
  tags: { name: string }[] | null;
  organization: { name: string | null } | null;
}

interface JobstashPage {
  page: number;
  count: number;
  total: number;
  data: JobstashJob[];
}

const PAGE_LIMIT = 50;

export function parseJobstashPage(page: JobstashPage): RawJob[] {
  const jobs: RawJob[] = [];
  for (const j of page.data ?? []) {
    const company = j.organization?.name;
    if (!company || !j.title) continue;

    const descriptionParts = [
      j.summary,
      j.description,
      j.requirements?.length ? `Requirements:\n${j.requirements.join('\n')}` : null,
      j.responsibilities?.length ? `Responsibilities:\n${j.responsibilities.join('\n')}` : null,
    ].filter(Boolean);

    const workMode = (j.locationType ?? '').toLowerCase();

    jobs.push({
      externalId: j.shortUUID || j.id,
      sourceId: 'jobstash',
      company,
      title: j.title,
      location: j.location ?? (j.locationType ? prettyLocationType(j.locationType) : null),
      workMode: workMode === 'remote' || workMode === 'hybrid' || workMode === 'onsite' ? workMode : 'unknown',
      salaryText: formatSalary(j.minimumSalary, j.maximumSalary, j.salaryCurrency),
      description: descriptionParts.join('\n\n') || null,
      url: j.url || `https://jobstash.xyz/jobs/${j.shortUUID}`,
      tags: (j.tags ?? []).map((t) => t.name),
      postedDate: parsePostedDate(j.timestamp),
    });
  }
  return jobs;
}

function prettyLocationType(t: string): string | null {
  const m: Record<string, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' };
  return m[t] ?? null;
}

function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (!min && !max) return null;
  const cur = currency ?? 'USD';
  const fmt = (n: number) => `${Math.round(n).toLocaleString('en-US')}`;
  if (min && max) return `${fmt(min)}–${fmt(max)} ${cur}`;
  return `${fmt((min ?? max)!)} ${cur}`;
}

export const jobstash: BoardAdapter = {
  id: 'jobstash',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const pages = Number(ctx.config.options?.pages ?? 5);
    const all: RawJob[] = [];
    for (let p = 1; p <= pages; p++) {
      const url = `${ctx.config.baseUrl}/jobs/list?page=${p}&limit=${PAGE_LIMIT}`;
      const page = await ctx.http.getJson<JobstashPage>(url);
      const jobs = parseJobstashPage(page);
      all.push(...jobs);
      ctx.log(`jobstash page ${p}: ${jobs.length} jobs (total available: ${page.total})`);
      if ((page.data?.length ?? 0) < PAGE_LIMIT) break; // missing `data` key = done
    }
    return all;
  },
};
