import * as cheerio from 'cheerio';
import type { RawJob } from '../../shared/types.js';
import type { BoardAdapter, ScrapeContext } from '../types.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * web3.career — static SSR HTML, paginated job table.
 * Rows: <tr data-jobid=N class="table_row"> with h2 title, h3 company,
 * <time datetime>, location <p>, tag badges. Sponsor rows lack data-jobid.
 */

export function parseWeb3CareerPage(html: string, baseUrl: string, now: Date): RawJob[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const jobs: RawJob[] = [];

  $('tr.table_row[data-jobid]').each((_, el) => {
    const row = $(el);
    const id = row.attr('data-jobid');
    if (!id || seen.has(id)) return;

    const title = row.find('h2').first().text().trim();
    const company = row.find('h3').first().text().trim();
    // anchored suffix match: id "5" must not match href ".../15" or ".../1502"
    const href = row.find(`a[href$="/${id}"]`).first().attr('href');
    if (!title || !company || !href) return;

    // time element gives absolute datetime; the visible text is relative ("1h")
    const datetime = row.find('time').attr('datetime') ?? null;
    const relative = row.find('time').text().trim() || null;

    // location: first non-empty <p> in a job-location cell that isn't the salary
    const location =
      row
        .find('td.job-location-mobile p')
        .map((_, p) => $(p).text().trim())
        .get()
        .find((t) => t.length > 0) ?? null;

    const tags = row
      .find('span.my-badge a')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    const salaryText =
      row
        .find('p')
        .map((_, p) => $(p).text().trim())
        .get()
        .find((t) => /^\$\d/.test(t)) ?? null;

    seen.add(id);
    jobs.push({
      externalId: id,
      sourceId: 'web3career',
      company,
      title,
      location,
      workMode: /remote/i.test(`${location} ${tags.join(' ')}`) ? 'remote' : 'unknown',
      salaryText,
      description: null, // list page has no JD — matcher falls back to title+tags
      url: new URL(href, baseUrl).toString(),
      tags,
      postedDate: datetime ? parsePostedDate(datetime.slice(0, 10), now) : parsePostedDate(relative, now),
    });
  });

  return jobs;
}

export const web3career: BoardAdapter = {
  id: 'web3career',
  async fetch(ctx: ScrapeContext): Promise<RawJob[]> {
    const pages = Number(ctx.config.options?.pages ?? 3);
    const all: RawJob[] = [];
    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? `${ctx.config.baseUrl}/` : `${ctx.config.baseUrl}/?page=${p}`;
      const html = await ctx.http.getText(url);
      const jobs = parseWeb3CareerPage(html, ctx.config.baseUrl, ctx.now);
      ctx.log(`web3career page ${p}: ${jobs.length} jobs`);
      if (jobs.length === 0) break;
      all.push(...jobs);
    }
    return all;
  },
};
