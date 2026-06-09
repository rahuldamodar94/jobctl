import * as cheerio from 'cheerio';
import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from './html-to-text.js';

/**
 * Personio public XML feed.
 * GET https://{slug}.jobs.personio.com/xml
 * Root <workzag-jobs> with <position> children carrying <id>, <office>,
 * <department>, <recruitingCategory>, <name>, <createdAt>, and a
 * <jobDescriptions> block of one-or-more <jobDescription>{<name>,<value>} HTML
 * (CDATA) sections — the full JD inline (no pagination, no N+1). The companion
 * /search.json lists the same roles but with EMPTY descriptions, so /xml is the
 * source of truth for the JD.
 */

const HOST_SUFFIX = '.jobs.personio.com';

/** Infer work mode from the free-text office label ("Hybrid/New York", "Remote"). */
function personioWorkMode(office: string): RawJob['workMode'] {
  const o = office.toLowerCase();
  if (o.includes('hybrid')) return 'hybrid';
  if (o.includes('remote')) return 'remote';
  if (office.trim()) return 'onsite';
  return 'unknown';
}

export function parsePersonioFeed(xml: string, slug: string, companyName: string): RawJob[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs: RawJob[] = [];
  const host = `${slug.toLowerCase()}${HOST_SUFFIX}`;

  $('position').each((_, el) => {
    const pos = $(el);
    const id = pos.find('id').first().text().trim();
    const title = pos.find('name').first().text().trim();
    if (!id || !title) return;

    const office = pos.find('office').first().text().trim();
    const department = pos.find('department').first().text().trim();
    const createdAt = pos.find('createdAt').first().text().trim();

    // Concatenate every jobDescription section ("About the Role", "What we
    // offer", …) into one JD body, each as "Heading\n<html-stripped value>".
    const sections: string[] = [];
    pos.find('jobDescriptions jobDescription').each((_, sec) => {
      const s = $(sec);
      const name = s.find('name').first().text().trim();
      const value = s.find('value').first().text().trim();
      if (!value) return;
      const body = htmlToText(value);
      sections.push(name ? `${name}\n${body}` : body);
    });
    const description = sections.length ? sections.join('\n\n') : null;

    jobs.push({
      externalId: id,
      sourceId: 'ats:personio',
      company: companyName,
      title,
      location: office || null,
      workMode: personioWorkMode(office),
      salaryText: null,
      description,
      url: `https://${host}/job/${encodeURIComponent(id)}`,
      tags: department ? [department] : [],
      postedDate: parsePostedDate(createdAt || null),
    });
  });

  return jobs;
}

export async function fetchPersonio(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const host = `${slug.toLowerCase()}${HOST_SUFFIX}`; // host derived from the validated slug → SSRF-safe
  const xml = await http.getText(`https://${host}/xml`, {
    allowHosts: [host],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  return parsePersonioFeed(xml, slug, companyName);
}
