import type Database from 'better-sqlite3';
import { Repo, todayISO } from '../db/repo.js';
import {
  loadCategories,
  loadCompanies,
  loadProfile,
  loadRoles,
  loadSources,
} from '../config/load.js';
import { PoliteHttp, scopeHttp, type HttpClient } from '../sources/http.js';
import type { BoardAdapter, ScrapeContext } from '../sources/types.js';
import type { RawJob, SourceRunResult } from '../shared/types.js';
import { dedupeKey, findFuzzyMatch } from '../matcher/dedupe.js';
import { normCompany, normTitle } from '../matcher/normalize.js';
import { geoBucket } from '../matcher/geo.js';
import { isOlderThan, localDateISO } from '../matcher/dates.js';
import { matchJob } from '../matcher/matcher.js';
import { categorize } from '../matcher/categorizer.js';
import { judgePending } from '../judge/index.js';

import { fetchAtsCompanies } from '../sources/ats/index.js';
import { jobstash } from '../sources/boards/jobstash.js';
import { web3career } from '../sources/boards/web3career.js';
import { cryptocurrencyjobs } from '../sources/boards/cryptocurrencyjobs.js';
import { blockchainheadhunter } from '../sources/boards/blockchainheadhunter.js';
import { remotive } from '../sources/boards/remotive.js';
import { remoteok } from '../sources/boards/remoteok.js';
import { weworkremotely } from '../sources/boards/weworkremotely.js';
import { himalayas } from '../sources/boards/himalayas.js';

/** Registry of board adapters — one entry per file in src/sources/boards/. */
const BOARD_ADAPTERS: Record<string, BoardAdapter> = {
  [jobstash.id]: jobstash,
  [web3career.id]: web3career,
  [cryptocurrencyjobs.id]: cryptocurrencyjobs,
  [blockchainheadhunter.id]: blockchainheadhunter,
  [remotive.id]: remotive,
  [remoteok.id]: remoteok,
  [weworkremotely.id]: weworkremotely,
  [himalayas.id]: himalayas,
};

/** Per-provider source ids the aggregate `ats` source expands to — the decay
 *  loop and the UI source filter both depend on exactly this list. */
export const ATS_SOURCE_IDS = [
  'ats:greenhouse',
  'ats:lever',
  'ats:ashby',
  'ats:recruitee',
  'ats:workable',
  'ats:teamtailor',
  'ats:personio',
  'ats:breezy',
  'ats:pinpoint',
];

export interface ScrapeOptions {
  /** Limit to a single source id (debugging). */
  only?: string;
  log?: (msg: string) => void;
}

export interface ScrapeOutcome {
  runId: number;
  sources: SourceRunResult[];
  totalNew: number;
}

export async function runScrape(db: Database.Database, opts: ScrapeOptions = {}): Promise<ScrapeOutcome> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const repo = new Repo(db);

  const profile = loadProfile();
  // location is profile-level: inject it into every role so the per-role matcher
  // scores geo from the one profile preference (one job seeker, one location).
  const roles = loadRoles().map((r) => ({
    ...r,
    geoPriority: profile.geoPriority,
    geoRelocationOk: profile.geoRelocationOk,
  }));
  const categories = loadCategories();
  const sourceConfigs = loadSources();

  const runId = repo.acquireScrapeLock();
  if (runId === null) {
    throw new Error('A scrape is already running (or use the UI to watch it). Try again in a minute.');
  }

  const http = new PoliteHttp();
  const now = new Date();
  const results: SourceRunResult[] = [];
  let totalNew = 0;

  const enabled = profile.enabledSources.filter((s) => !opts.only || s === opts.only);
  if (enabled.length === 0) {
    repo.completeRun(runId, [], 0, true);
    throw new Error(
      opts.only
        ? `source "${opts.only}" is not in profile.yaml enabled_sources (${profile.enabledSources.join(', ')})`
        : 'no sources enabled in profile.yaml'
    );
  }

  try {
    for (const sourceId of enabled) {
      // "ats" is a pseudo-source: it fans out to every company in
      // profile/companies.yaml via the greenhouse/lever/ashby adapters.
      if (sourceId === 'ats') {
        const atsResults = await runAtsSources(repo, http, roles, categories, log, profile.excludeCategories);
        results.push(...atsResults.results);
        totalNew += atsResults.totalNew;
        continue;
      }

      const config = sourceConfigs.find((s) => s.id === sourceId);
      const adapter = BOARD_ADAPTERS[sourceId];
      const started = Date.now();

      if (!config || !adapter) {
        results.push({
          sourceId,
          status: 'skipped',
          jobsFound: 0,
          jobsNew: 0,
          error: !config ? 'no entry in config/sources.yaml' : 'no adapter implemented',
          durationMs: 0,
        });
        continue;
      }

      // Pin each board adapter to its configured host (SSRF guard mirroring the
      // ATS fetchers): derive the allowlist host from base_url; if it's absent/
      // invalid, leave the client unscoped (such an adapter doesn't fetch a URL).
      let boardHttp: HttpClient = http;
      try {
        boardHttp = scopeHttp(http, [new URL(config.baseUrl).hostname]);
      } catch {
        /* no/invalid base_url → leave unscoped */
      }
      const ctx: ScrapeContext = { http: boardHttp, config, log, now };
      try {
        const raw = await adapter.fetch(ctx);
        const fresh = raw.filter((j) => !isOlderThan(j.postedDate, profile.maxAgeDays, now));
        const newCount = ingestBatch(repo, fresh, roles, categories, log, profile.excludeCategories);
        totalNew += newCount;

        // A previously-productive source returning 0 jobs = suspect (selector
        // drift?), not success — BUT after 3 consecutive suspect runs we accept
        // 0 as the new reality (board genuinely emptied/shut), otherwise the
        // source's decay would stay frozen forever.
        const prior = repo.getSourceState(sourceId);
        let suspect = raw.length === 0 && prior.lastSuccessCount > 0;
        if (suspect && repo.bumpSuspect(sourceId) >= 3) {
          log(`  ${sourceId}: 0 jobs for 3 consecutive runs — accepting as the new baseline`);
          suspect = false;
        }
        if (!suspect) repo.recordSourceSuccess(sourceId, raw.length);

        results.push({
          sourceId,
          status: suspect ? 'suspect' : 'success',
          jobsFound: raw.length,
          jobsNew: newCount,
          durationMs: Date.now() - started,
          ...(suspect ? { error: '0 jobs from a previously-productive source — selector drift?' } : {}),
        });
        log(`✓ ${sourceId}: ${raw.length} found, ${newCount} new${suspect ? ' [SUSPECT]' : ''}`);
      } catch (e) {
        results.push({
          sourceId,
          status: 'failed',
          jobsFound: 0,
          jobsNew: 0,
          error: (e as Error).message,
          durationMs: Date.now() - started,
        });
        log(`✗ ${sourceId} failed: ${(e as Error).message}`);
      }
    }

    // Rescore ALL active rows against current config — roles.yaml edits take
    // effect every run; scores stay globally consistent.
    rescoreAll(repo, roles, categories, log, profile.excludeCategories);

    // Decay: only for sources that succeeded this run (a broken scraper must
    // not erase its own jobs).
    // Local-date cutoff to match last_seen stamps (also local) — using UTC here
    // would skew decay by a day for non-UTC users.
    const cutoff = localDateISO(new Date(now.getTime() - profile.inactiveAfterDays * 86_400_000));
    for (const r of results) {
      if (r.status !== 'success') continue;
      // ATS rows carry per-provider source ids (ats:greenhouse etc.)
      const ids = r.sourceId === 'ats' ? ATS_SOURCE_IDS : [r.sourceId];
      for (const id of ids) {
        const n = repo.deactivateStale(id, cutoff);
        if (n > 0) log(`  ${id}: ${n} stale jobs deactivated (not seen since ${cutoff})`);
      }
    }

    // Optional advisory LLM fit-judge over newly-matched / changed jobs.
    // Best-effort: judgePending never throws, so a backend outage can't fail
    // the scrape or touch match/status.
    if (profile.llm.judge.enabled) {
      await judgePending(repo, log, { profile });
    }

    repo.completeRun(runId, results, totalNew);
    return { runId, sources: results, totalNew };
  } catch (e) {
    repo.completeRun(runId, results, totalNew, true);
    throw e;
  }
}

/**
 * Ingest a batch of RawJobs: exact dedupe_key → fuzzy pass → insert.
 * Runs in one transaction. Returns the number of NEW rows inserted.
 */
export function ingestBatch(
  repo: Repo,
  raws: RawJob[],
  roles: ReturnType<typeof loadRoles>,
  categories: ReturnType<typeof loadCategories>,
  log: (m: string) => void,
  excludeCategories: string[] = []
): number {
  let inserted = 0;
  repo.transaction(() => {
    for (const raw of raws) {
      const key = dedupeKey(raw.company, raw.title, raw.location);

      // 1. exact match — same normalized company+title+geo seen before
      const exact = repo.findByDedupeKey(key);
      if (exact) {
        repo.refreshSeen(exact, raw);
        continue;
      }

      // 2. fuzzy match against existing rows for the same company
      const nc = normCompany(raw.company);
      const candidates = repo.findByCompany(nc).map((j) => ({
        id: j.id,
        normCompany: j.normCompany,
        title: j.title,
        geoBucket: j.geoBucket,
        status: j.status,
      }));
      const fuzzy = findFuzzyMatch({ normCompany: nc, title: raw.title, geoBucket: geoBucket(raw.location) }, candidates);
      if (fuzzy) {
        repo.refreshSeen(repo.findById(fuzzy.id)!, raw);
        continue;
      }

      // 3. genuinely new
      const match = matchJob(
        { title: raw.title, description: raw.description, tags: raw.tags, location: raw.location },
        roles
      );
      const category = categorize(raw.title, raw.description, raw.tags, categories);
      applyCategoryExclusion(match, category, excludeCategories);
      repo.insert({
        ...raw,
        dedupeKey: key,
        normCompany: nc,
        normTitle: normTitle(raw.title),
        geoBucket: geoBucket(raw.location),
        category,
        isMatch: match.isMatch,
        matchScore: match.score,
        matchedRoleIds: match.matchedRoleIds,
        matchReasons: match.reasons,
      });
      inserted++;
    }
  });
  return inserted;
}

/** Profile-level category veto: the job stays in the DB (auditably unmatched
 *  with a reason) — deletion would just be undone by the next scrape. */
function applyCategoryExclusion(
  match: ReturnType<typeof matchJob>,
  category: string,
  excludeCategories: string[]
): void {
  if (match.isMatch && excludeCategories.includes(category)) {
    match.isMatch = false;
    match.score = 0;
    match.reasons.roleOutcomes['category'] =
      `excluded: category '${category}' is in profile exclude_categories`;
  }
}

function rescoreAll(
  repo: Repo,
  roles: ReturnType<typeof loadRoles>,
  categories: ReturnType<typeof loadCategories>,
  log: (m: string) => void,
  excludeCategories: string[] = []
): void {
  const active = repo.allActive();
  repo.transaction(() => {
    for (const job of active) {
      // demo/sample rows ship with baked scores and aren't real listings — never
      // rescore them (else a real scrape un-matches them and the "N sample jobs"
      // banner desyncs from the now-empty table).
      if (job.sourceId === 'demo') continue;
      const m = matchJob(
        { title: job.title, description: job.description, tags: job.tags, location: job.location },
        roles
      );
      const cat = categorize(job.title, job.description, job.tags, categories);
      applyCategoryExclusion(m, cat, excludeCategories);
      repo.updateMatch(job.id, m.isMatch, m.score, m.matchedRoleIds, m.reasons, cat);
    }
  });
  log(`rescored ${active.length} active jobs`);
}

/**
 * ATS sources from companies config — one logical source `ats` in the run
 * summary, with per-company failure isolation inside it. ATS jobs are NOT
 * age-filtered at all (see the note inside): the company's own board API
 * returning a posting means it is open, whatever its publish date.
 * Invariant: ATS adapters write source_id = 'ats:<provider>' (greenhouse/
 * lever/ashby) — the decay loop in runScrape depends on exactly these ids.
 */
async function runAtsSources(
  repo: Repo,
  http: PoliteHttp,
  roles: ReturnType<typeof loadRoles>,
  categories: ReturnType<typeof loadCategories>,
  log: (m: string) => void,
  excludeCategories: string[] = []
): Promise<{ results: SourceRunResult[]; totalNew: number }> {
  const companies = loadCompanies();
  const started = Date.now();
  if (companies.length === 0) {
    return {
      results: [{ sourceId: 'ats', status: 'skipped', jobsFound: 0, jobsNew: 0, error: 'no companies configured', durationMs: 0 }],
      totalNew: 0,
    };
  }

  const companyResults = await fetchAtsCompanies(http, companies, log);
  const raw = companyResults.flatMap((r) => r.jobs);
  // NOTE: no max-age filter for ATS sources — a posting returned by the
  // company's own board API is open by definition, even if it was first
  // published months ago. (Board scrapes DO apply max_age_days: an old listing
  // on an aggregator is probably stale.) The UI date filter shows these via
  // first_seen, so they surface once and then age out of the default view.
  const jobsNew = ingestBatch(repo, raw, roles, categories, log, excludeCategories);

  const failures = companyResults.filter((r) => r.error);
  const allFailed = failures.length === companyResults.length;

  // Symmetric with the board path: a previously-productive ATS aggregate that
  // surprisingly returns 0 jobs (but ISN'T the all-errored case above) is
  // SUSPECT, not success — recording success here would let the decay loop
  // deactivate the entire prior ATS corpus on one fluke empty run. After 3
  // consecutive suspect runs we accept 0 as the new baseline (same mechanism/
  // state as boards) so decay never stays frozen forever.
  let suspect = false;
  if (!allFailed) {
    const prior = repo.getSourceState('ats');
    suspect = raw.length === 0 && prior.lastSuccessCount > 0;
    if (suspect && repo.bumpSuspect('ats') >= 3) {
      log('  ats: 0 jobs for 3 consecutive runs — accepting as the new baseline');
      suspect = false;
    }
    if (!suspect) repo.recordSourceSuccess('ats', raw.length);
  }

  // ATS decay scope: each provider gets its own source_id (ats:greenhouse etc.)
  // handled by the caller's decay loop via this aggregate result — which only
  // runs for status 'success', so 'suspect'/'failed' correctly skip decay.
  return {
    results: [
      {
        sourceId: 'ats',
        status: allFailed ? 'failed' : suspect ? 'suspect' : 'success',
        jobsFound: raw.length,
        jobsNew,
        durationMs: Date.now() - started,
        ...(suspect
          ? { error: '0 jobs from a previously-productive source — selector drift?' }
          : failures.length
          ? { error: failures.map((f) => `${f.company}: ${f.error}`).join(' | ').slice(0, 500) }
          : {}),
      },
    ],
    totalNew: jobsNew,
  };
}
