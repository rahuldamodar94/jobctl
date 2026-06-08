import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';

/**
 * blockchainheadhunter.com — static Astro site. Jobs are embedded as
 * HTML-escaped Astro-serialized state: {"id":[0,646],"title":[0,"..."],...}
 * where each value is an [typeTag, value] tuple. We unescape and regex the
 * job objects out — resilient to surrounding markup changes.
 */

interface BhhJob {
  id?: number;
  title?: string;
  client?: string;
  slug?: string;
  location?: string;
  salary?: string;
  category?: string[];
  seniority?: string;
  state?: string;
}

export function parseBlockchainHeadhunterPage(html: string, baseUrl: string): RawJob[] {
  const unescaped = html
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'");

  const jobs: RawJob[] = [];
  const seen = new Set<string>();

  // Match serialized job objects by their stable field signature.
  const objRe = /\{"id":\[0,\d+\][^{}]*?"title":\[0,"(?:[^"\\]|\\.)*"\][\s\S]*?\}/g;
  for (const m of unescaped.matchAll(objRe)) {
    const job = parseAstroObject(m[0]);
    if (!job.title || !job.slug || seen.has(job.slug)) continue;
    if (job.state && job.state !== 'active') continue; // filled/hold/paid roles
    seen.add(job.slug);
    jobs.push({
      externalId: String(job.id ?? job.slug),
      sourceId: 'blockchainheadhunter',
      company: job.client ?? 'Confidential (via Blockchain Headhunter)',
      title: job.title,
      location: job.location ?? null,
      workMode: /remote/i.test(job.location ?? '') ? 'remote' : 'unknown',
      salaryText: job.salary?.trim() || null,
      description: null,
      url: `${baseUrl}/jobs/${job.slug}`,
      tags: [...(job.category ?? []), ...(job.seniority ? [job.seniority] : [])],
      postedDate: null,
    });
  }
  return jobs;
}

/** Pull [0,"value"] tuples for known string fields + category list. */
function parseAstroObject(s: string): BhhJob {
  const str = (field: string): string | undefined => {
    const m = s.match(new RegExp(`"${field}":\\[0,"((?:[^"\\\\]|\\\\.)*)"\\]`));
    return m ? JSON.parse(`"${m[1]}"`) : undefined;
  };
  const num = (field: string): number | undefined => {
    const m = s.match(new RegExp(`"${field}":\\[0,(\\d+)\\]`));
    return m ? Number(m[1]) : undefined;
  };
  const category = (() => {
    const m = s.match(/"category":\[1,\[(.*?)\]\]/);
    if (!m) return undefined;
    return [...m[1]!.matchAll(/\[0,"((?:[^"\\]|\\.)*)"\]/g)].map((x) => JSON.parse(`"${x[1]}"`));
  })();
  return {
    id: num('id'),
    title: str('title'),
    client: str('client'),
    slug: str('slug'),
    location: str('location'),
    salary: str('salary'),
    seniority: str('seniority'),
    state: str('state'),
    category,
  };
}

export const blockchainheadhunter: BoardAdapter = {
  id: 'blockchainheadhunter',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const html = await ctx.http.getText(`${ctx.config.baseUrl}/jobs`);
    const jobs = parseBlockchainHeadhunterPage(html, ctx.config.baseUrl);
    ctx.log(`blockchainheadhunter: ${jobs.length} live jobs`);
    return jobs;
  },
};
