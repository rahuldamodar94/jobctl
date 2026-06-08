import type { RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { parsePostedDate } from '../../matcher/dates.js';

/**
 * Lever public postings API.
 * GET https://api.lever.co/v0/postings/{slug}?mode=json → array, full JD included.
 */

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string; // remote | hybrid | onsite | unspecified
  categories?: { location?: string; team?: string; commitment?: string; allLocations?: string[] };
  descriptionPlain?: string;
  descriptionBodyPlain?: string;
  additionalPlain?: string;
  openingPlain?: string;
}

export function parseLeverJobs(payload: LeverJob[], companyName: string): RawJob[] {
  return (payload ?? [])
    .filter((j) => j.hostedUrl && j.text)
    .map((j) => {
      const description =
        [j.openingPlain, j.descriptionPlain ?? j.descriptionBodyPlain, j.additionalPlain]
          .filter(Boolean)
          .join('\n\n') || null;
      const wm = (j.workplaceType ?? '').toLowerCase();
      return {
        externalId: j.id,
        sourceId: 'ats:lever',
        company: companyName,
        title: j.text,
        location: j.categories?.allLocations?.join(', ') ?? j.categories?.location ?? null,
        workMode: wm === 'remote' || wm === 'hybrid' || wm === 'onsite' ? (wm as RawJob['workMode']) : 'unknown',
        salaryText: null,
        description,
        url: j.hostedUrl,
        tags: [j.categories?.team, j.categories?.commitment].filter((t): t is string => Boolean(t)),
        postedDate: parsePostedDate(j.createdAt ?? null),
      };
    });
}

export async function fetchLever(http: PoliteHttp, slug: string, companyName: string): Promise<RawJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const payload = await http.getJson<LeverJob[]>(url, {
    allowHosts: ['api.lever.co'],
    redirect: 'error',
    delayRangeMs: [500, 1500],
  });
  if (!Array.isArray(payload)) throw new Error(`lever/${slug}: unexpected response shape`);
  return parseLeverJobs(payload, companyName);
}
