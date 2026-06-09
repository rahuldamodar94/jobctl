import * as cheerio from 'cheerio';
import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from './html-to-text.js';

/**
 * Teamtailor public RSS feed.
 * GET https://{slug}.teamtailor.com/jobs.rss
 * Each <item> carries the full HTML JD in <description> (entity-escaped), with
 * <title>, <link>, <pubDate>, <guid>, <remoteStatus> and structured
 * <tt:location> children. One call lists all open roles (no pagination, no N+1).
 *
 * The `slug` here is the WHOLE subdomain incl. an optional region label
 * (e.g. "crossmint.na"), so the host is `{slug}.teamtailor.com`.
 *
 * CAVEAT: custom Teamtailor domains fronted by Cloudflare (e.g.
 * careers.reap.global) return a CF challenge — only the canonical
 * *.teamtailor.com host is reachable server-side.
 */

const REMOTE_MAP: Record<string, RawJob['workMode']> = {
  fully: 'remote',
  hybrid: 'hybrid',
  temporary: 'hybrid',
  none: 'onsite',
};

/** Pull a readable location from the tt:location children (name/city/country).
 *  The feed uses the `tt:` XML namespace, which cheerio (xmlMode) keeps in the
 *  tag name — hence the escaped `tt\:` selectors. */
function teamtailorLocation($: cheerio.CheerioAPI, item: cheerio.Cheerio<any>): string | null {
  const locs: string[] = [];
  item.find('tt\\:location').each((_, el) => {
    const loc = $(el);
    const name = loc.find('tt\\:name').first().text().trim();
    const city = loc.find('tt\\:city').first().text().trim();
    const country = loc.find('tt\\:country').first().text().trim();
    // Prefer "City, Country"; fall back to the location name. Teamtailor often
    // repeats the country as a degenerate location ("Spain/Spain/Spain") — dedupe
    // the city against the country to avoid "Spain, Spain".
    const parts = [city && city !== country ? city : '', country].filter(Boolean);
    const label = parts.length ? parts.join(', ') : name;
    if (label && !locs.includes(label)) locs.push(label);
  });
  return locs.length ? locs.join(' / ') : null;
}

export function parseTeamtailorFeed(xml: string, companyName: string, now: Date = new Date()): RawJob[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs: RawJob[] = [];

  $('item').each((_, el) => {
    const item = $(el);
    const title = item.find('title').first().text().trim();
    const url = item.find('link').first().text().trim() || item.find('guid').first().text().trim();
    if (!title || !url) return;

    const rawDesc = item.find('description').first().text();
    const pub = item.find('pubDate').first().text().trim();
    const pubMs = pub ? Date.parse(pub) : NaN;
    const remoteStatus = item.find('remoteStatus').first().text().trim().toLowerCase();
    const location = teamtailorLocation($, item);
    const baseMode = REMOTE_MAP[remoteStatus] ?? 'unknown';

    jobs.push({
      externalId: item.find('guid').first().text().trim() || url,
      sourceId: 'ats:teamtailor',
      company: companyName,
      title,
      location: baseMode === 'remote' ? (location ? `Remote / ${location}` : 'Remote') : location,
      workMode: baseMode,
      salaryText: null,
      description: rawDesc ? htmlToText(rawDesc) : null,
      url,
      tags: [],
      postedDate: parsePostedDate(Number.isNaN(pubMs) ? null : pubMs, now),
    });
  });

  return jobs;
}

export async function fetchTeamtailor(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const host = `${slug.toLowerCase()}.teamtailor.com`; // host derived from the validated slug → SSRF-safe
  const xml = await http.getText(`https://${host}/jobs.rss`, {
    allowHosts: [host],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  return parseTeamtailorFeed(xml, companyName);
}
