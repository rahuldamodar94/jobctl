import type { CompanyConfig, RawJob } from '../../shared/types.js';
import type { PoliteHttp } from '../http.js';
import { detectAts, type AtsProvider } from './detect.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchAshby } from './ashby.js';
import { fetchRecruitee } from './recruitee.js';
import { fetchWorkable } from './workable.js';
import { fetchTeamtailor } from './teamtailor.js';
import { fetchPersonio } from './personio.js';
import { fetchBreezy } from './breezy.js';
import { fetchPinpoint } from './pinpoint.js';

const FETCHERS: Record<AtsProvider, (http: PoliteHttp, slug: string, company: string) => Promise<RawJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  recruitee: fetchRecruitee,
  workable: fetchWorkable,
  teamtailor: fetchTeamtailor,
  personio: fetchPersonio,
  breezy: fetchBreezy,
  pinpoint: fetchPinpoint,
};

export interface AtsCompanyResult {
  company: string;
  provider: AtsProvider | null;
  jobs: RawJob[];
  error?: string;
}

/** Fetch all configured companies' boards. Per-company failures are isolated. */
export async function fetchAtsCompanies(
  http: PoliteHttp,
  companies: CompanyConfig[],
  log: (m: string) => void
): Promise<AtsCompanyResult[]> {
  const results: AtsCompanyResult[] = [];
  for (const c of companies) {
    const detected = detectAts(c.careersUrl);
    const provider = c.provider ?? detected?.provider ?? null;
    const slug = detected?.slug;
    if (!provider || !slug) {
      results.push({
        company: c.name,
        provider: null,
        jobs: [],
        error: `cannot detect ATS from ${c.careersUrl} — supported: greenhouse/lever/ashby/recruitee/workable/teamtailor/personio/breezy/pinpoint board URLs`,
      });
      continue;
    }
    try {
      const jobs = await FETCHERS[provider](http, slug, c.name);
      log(`  ats:${provider}/${slug}: ${jobs.length} jobs`);
      results.push({ company: c.name, provider, jobs });
    } catch (e) {
      results.push({ company: c.name, provider, jobs: [], error: (e as Error).message });
      log(`  ✗ ats:${provider}/${slug} (${c.name}): ${(e as Error).message}`);
    }
  }
  return results;
}
