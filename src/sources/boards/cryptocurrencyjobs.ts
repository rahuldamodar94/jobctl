import * as cheerio from 'cheerio';
import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';

/**
 * cryptocurrencyjobs.co — static SSR (minified, unquoted attrs).
 * Root page lists recent jobs across categories:
 *   <h2><a href=/engineering/{slug}/>Title</a></h2>
 *   <h3><a href=/startups/{company}/>Company</a></h3>
 *   followed by location/tag anchors in the same card.
 */

const JOB_PATH_RE = /^\/(engineering|design|marketing|operations|sales|product|customer-support|finance|legal|people|trading|startups-other)\/[a-z0-9-]+\/$/;

export function parseCryptocurrencyJobsPage(html: string, baseUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];
  const seen = new Set<string>();

  $('h2 a').each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    if (!href || !JOB_PATH_RE.test(href) || seen.has(href)) return;

    const title = a.text().trim();
    if (!title) return;

    // The card: h2 and h3 share a parent div; the grandparent holds meta lists.
    const headerDiv = a.closest('div');
    const company = headerDiv.find('h3 a').first().text().trim();
    if (!company) return;

    const card = headerDiv.parent();

    // Card meta layout (DOM order): location list first (`ul li h4 a`), then a
    // category anchor, then commitment + tag lists. Taking the FIRST ul-list h4
    // anchor reliably yields the location; anything text-y after it is a tag.
    const location = card.find('ul li h4 a').first().text().trim() || null;

    const tags = card
      .find('h4 a, li a')
      .map((_, m) => $(m).text().trim())
      .get()
      .filter((t) => t && t !== title && t !== company && t !== location)
      .slice(0, 12);

    seen.add(href);
    jobs.push({
      externalId: href,
      sourceId: 'cryptocurrencyjobs',
      company,
      title,
      location,
      workMode: /remote/i.test(`${location} ${tags.join(' ')}`) ? 'remote' : 'unknown',
      salaryText: null,
      description: null, // list page only — matcher falls back to title+tags
      url: new URL(href, baseUrl).toString(),
      tags,
      postedDate: null, // not shown on list page; first_seen governs
    });
  });

  return jobs;
}

export const cryptocurrencyjobs: BoardAdapter = {
  id: 'cryptocurrencyjobs',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const html = await ctx.http.getText(`${ctx.config.baseUrl}/`);
    const jobs = parseCryptocurrencyJobsPage(html, ctx.config.baseUrl);
    ctx.log(`cryptocurrencyjobs: ${jobs.length} jobs from root page`);
    return jobs;
  },
};
