import * as cheerio from 'cheerio';
import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from '../ats/html-to-text.js';

/**
 * We Work Remotely — RSS category feeds, full JD inline (zero N+1).
 * Each <item>: title is "Company: Role", <region> is the location, <description>
 * is entity-escaped HTML, <pubDate> is RFC-822, <link>/<guid> is the posting URL.
 * One request per category feed; the adapter dedupes across feeds by URL.
 */

const DEFAULT_PATHS = [
  '/categories/remote-programming-jobs.rss',
  '/categories/remote-design-jobs.rss',
  '/categories/remote-devops-sysadmin-jobs.rss',
  '/categories/remote-product-jobs.rss',
  '/categories/remote-sales-and-marketing-jobs.rss',
];

export function parseWwrFeed(xml: string, now: Date): RawJob[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs: RawJob[] = [];

  $('item').each((_, el) => {
    const item = $(el);
    const rawTitle = item.find('title').first().text().trim();
    // WWR titles are uniformly "Company: Role" — no colon means we can't derive
    // a company (needed for dedup identity), so skip rather than guess.
    const idx = rawTitle.indexOf(':');
    if (idx <= 0) return;
    const company = rawTitle.slice(0, idx).trim();
    const title = rawTitle.slice(idx + 1).trim();
    if (!company || !title) return;

    const url = (item.find('link').first().text().trim() || item.find('guid').first().text().trim());
    if (!url) return;

    const region = item.find('region').first().text().trim();
    const category = item.find('category').first().text().trim();
    const rawDesc = item.find('description').first().text();
    const pub = item.find('pubDate').first().text().trim();
    const pubMs = pub ? Date.parse(pub) : NaN;

    jobs.push({
      externalId: url,
      sourceId: 'weworkremotely',
      company,
      title,
      // WWR is remote-only; "Anywhere in the World" is a true no-restriction
      // remote role, other regions ("USA Only") are geo-scoped remote.
      location: /anywhere/i.test(region) ? 'Remote' : region || 'Remote',
      workMode: 'remote' as const,
      salaryText: null, // not present in the RSS feed
      description: rawDesc ? htmlToText(rawDesc) : null,
      url,
      tags: category ? [category] : [],
      postedDate: parsePostedDate(Number.isNaN(pubMs) ? null : pubMs, now),
    });
  });

  return jobs;
}

export const weworkremotely: BoardAdapter = {
  id: 'weworkremotely',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const paths = (ctx.config.options?.paths as string[] | undefined) ?? DEFAULT_PATHS;
    const seen = new Set<string>();
    const out: RawJob[] = [];
    for (const path of paths) {
      try {
        const xml = await ctx.http.getText(`${ctx.config.baseUrl}${path}`);
        for (const j of parseWwrFeed(xml, ctx.now)) {
          if (seen.has(j.externalId)) continue; // same job can list under two feeds
          seen.add(j.externalId);
          out.push(j);
        }
      } catch (e) {
        // one bad feed must not sink the rest (reliability rule)
        ctx.log(`  ✗ weworkremotely ${path}: ${(e as Error).message}`);
      }
    }
    ctx.log(`weworkremotely: ${out.length} jobs (${paths.length} feeds)`);
    return out;
  },
};
