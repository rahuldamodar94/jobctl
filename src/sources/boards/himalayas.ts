import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from '../ats/html-to-text.js';

/**
 * Himalayas — large remote-jobs board with a clean public JSON API.
 * GET https://himalayas.app/jobs/api?limit=N&offset=M
 * Newest-first; the full JD ships inline in `description` (zero N+1).
 * 100k+ listings total, so we page a small, configurable window.
 * NB: the server caps each response at 20 regardless of `limit`, so we advance
 * the offset by the COUNT ACTUALLY RETURNED — never by the requested page size —
 * or we'd silently skip the jobs between cap and requested limit.
 */

interface HimalayasJob {
  title?: string;
  companyName?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  locationRestrictions?: string[];
  description?: string;
  pubDate?: number | null;
  applicationLink?: string | null;
  guid?: string | null;
}

interface HimalayasPayload {
  jobs?: HimalayasJob[];
}

export function parseHimalayasJobs(payload: HimalayasPayload, now: Date): RawJob[] {
  return (payload.jobs ?? [])
    .filter((j) => j.title && j.companyName && (j.applicationLink || j.guid))
    .map((j) => {
      const restrictions = j.locationRestrictions ?? [];
      const url = (j.applicationLink || j.guid)!;
      return {
        externalId: (j.guid || j.applicationLink)!,
        sourceId: 'himalayas',
        company: j.companyName!,
        title: j.title!,
        location: restrictions.length ? restrictions.join(', ') : 'Remote',
        workMode: 'remote' as const,
        salaryText:
          j.minSalary && j.maxSalary
            ? `${j.minSalary.toLocaleString('en-US')}–${j.maxSalary.toLocaleString('en-US')}${j.currency ? ` ${j.currency}` : ''}`
            : null,
        description: j.description ? htmlToText(j.description) : null,
        url,
        tags: [],
        postedDate: parsePostedDate(j.pubDate ?? null, now),
      };
    });
}

export const himalayas: BoardAdapter = {
  id: 'himalayas',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const limit = Number(ctx.config.options?.limit ?? 20);
    const pages = Number(ctx.config.options?.pages ?? 5);
    const out: RawJob[] = [];
    const seen = new Set<string>();
    let offset = 0;
    for (let page = 0; page < pages; page++) {
      const payload = await ctx.http.getJson<HimalayasPayload>(
        `${ctx.config.baseUrl}/jobs/api?limit=${limit}&offset=${offset}`
      );
      const batch = payload.jobs ?? [];
      if (batch.length === 0) break; // ran past the end of the listing
      offset += batch.length; // advance by what the server actually returned
      for (const j of parseHimalayasJobs(payload, ctx.now)) {
        if (seen.has(j.externalId)) continue;
        seen.add(j.externalId);
        out.push(j);
      }
    }
    ctx.log(`himalayas: ${out.length} jobs`);
    return out;
  },
};
