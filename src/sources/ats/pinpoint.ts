import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { htmlToText } from './html-to-text.js';

/**
 * Pinpoint public postings JSON.
 * GET https://{slug}.pinpointhq.com/postings.json
 * Returns `data[]` (one call, no pagination, no N+1) where each posting carries
 * the full JD across several HTML fields — `description`, `key_responsibilities`,
 * `skills_knowledge_expertise`, `benefits` — plus `title`, `url`, structured
 * `location{city,name(=country),province}`, `workplace_type` (remote|hybrid|
 * onsite), `employment_type`, and a preformatted `compensation` string with
 * `compensation_minimum/maximum/currency/frequency/visible`.
 *
 * No reliable publish date in the payload (only `deadline_at`), so postedDate is
 * left null — the UI date filter falls back to first_seen.
 */

const HOST_SUFFIX = '.pinpointhq.com';

interface PinpointLocation {
  city?: string | null;
  name?: string | null; // country
  province?: string | null; // region/state
}

interface PinpointPosting {
  id?: string;
  title?: string;
  url?: string;
  description?: string | null;
  key_responsibilities?: string | null;
  skills_knowledge_expertise?: string | null;
  benefits?: string | null;
  employment_type_text?: string | null;
  workplace_type?: string | null; // 'remote' | 'hybrid' | 'onsite'
  location?: PinpointLocation | null;
  compensation?: string | null; // preformatted, e.g. "ر.س6,000 - ر.س7,500 / month"
  compensation_minimum?: number | null;
  compensation_maximum?: number | null;
  compensation_currency?: string | null;
  compensation_frequency?: string | null;
  compensation_visible?: boolean;
}

const WORKPLACE_MAP: Record<string, RawJob['workMode']> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
  on_site: 'onsite',
};

function pinpointLocation(loc?: PinpointLocation | null): string | null {
  if (!loc) return null;
  return [loc.city, loc.province, loc.name].filter(Boolean).join(', ') || null;
}

/** Concatenate the HTML JD sections into one plain-text body. */
function pinpointDescription(p: PinpointPosting): string | null {
  const sections: { label: string; html?: string | null }[] = [
    { label: '', html: p.description },
    { label: 'Key Responsibilities', html: p.key_responsibilities },
    { label: 'Skills, Knowledge & Expertise', html: p.skills_knowledge_expertise },
    { label: 'Benefits', html: p.benefits },
  ];
  const parts = sections
    .filter((s) => s.html && s.html.trim())
    .map((s) => {
      const body = htmlToText(s.html!);
      return s.label ? `${s.label}\n${body}` : body;
    });
  return parts.length ? parts.join('\n\n') : null;
}

function pinpointSalary(p: PinpointPosting): string | null {
  if (p.compensation_visible === false) return null;
  if (p.compensation && p.compensation.trim()) return p.compensation.trim();
  if (p.compensation_minimum || p.compensation_maximum) {
    const cur = p.compensation_currency ?? '';
    const range = [p.compensation_minimum, p.compensation_maximum].filter((n) => n != null).join(' - ');
    const freq = p.compensation_frequency ? ` / ${p.compensation_frequency}` : '';
    return `${cur}${cur ? ' ' : ''}${range}${freq}`.trim();
  }
  return null;
}

export function parsePinpointJobs(payload: { data?: PinpointPosting[] } | PinpointPosting[], companyName: string): RawJob[] {
  const list = Array.isArray(payload) ? payload : payload.data ?? [];
  return list
    .filter((p) => !!p.title && !!(p.url || p.id))
    .map((p) => ({
      externalId: String(p.id ?? p.url),
      sourceId: 'ats:pinpoint',
      company: companyName,
      title: p.title!,
      location: pinpointLocation(p.location),
      workMode: WORKPLACE_MAP[(p.workplace_type ?? '').toLowerCase()] ?? 'unknown',
      salaryText: pinpointSalary(p),
      description: pinpointDescription(p),
      url: p.url ?? '',
      tags: [],
      postedDate: null, // no publish date in the payload — first_seen governs
    }));
}

export async function fetchPinpoint(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const host = `${slug.toLowerCase()}${HOST_SUFFIX}`; // host derived from the validated slug → SSRF-safe
  const payload = await http.getJson<{ data?: PinpointPosting[] } | PinpointPosting[]>(
    `https://${host}/postings.json`,
    {
      allowHosts: [host],
      redirect: 'error',
      delayRangeMs: [500, 1500],
    }
  );
  return parsePinpointJobs(payload, companyName);
}
