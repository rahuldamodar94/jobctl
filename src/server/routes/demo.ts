import { Router } from 'express';
import type Database from 'better-sqlite3';
import { Repo } from '../../db/repo.js';
import { dedupeKey } from '../../matcher/dedupe.js';
import { normCompany, normTitle } from '../../matcher/normalize.js';
import { geoBucket } from '../../matcher/geo.js';
import { localDateISO } from '../../matcher/dates.js';
import { DEMO_JOBS } from '../demo-jobs.js';

/**
 * In-app sample data: POST /api/demo loads pre-scored sample jobs (tagged
 * source_id='demo') so a new user sees a populated triage page before
 * configuring a real scrape; DELETE /api/demo clears them; GET /api/demo
 * reports how many are loaded (drives the "Clear sample jobs" banner).
 *
 * Sample jobs carry baked match scores, so they render as matched WITHOUT a
 * configured profile. They never collide with real data — a real scrape uses
 * other source ids, and clearing only touches source_id='demo'.
 */

const DEMO_SOURCE = 'demo';

/** Insert the sample jobs (idempotent: clears prior demo rows first). */
export function loadDemo(repo: Repo, now: Date = new Date()): number {
  repo.deleteBySource(DEMO_SOURCE);
  let loaded = 0;
  repo.transaction(() => {
    for (const j of DEMO_JOBS) {
      const postedDate = localDateISO(new Date(now.getTime() - j.postedDaysAgo * 86_400_000));
      repo.insert({
        externalId: j.url,
        sourceId: DEMO_SOURCE,
        company: j.company,
        title: j.title,
        location: j.location,
        workMode: j.workMode,
        salaryText: j.salaryText,
        description: j.description,
        url: j.url,
        tags: j.tags,
        postedDate,
        dedupeKey: dedupeKey(j.company, j.title, j.location),
        normCompany: normCompany(j.company),
        normTitle: normTitle(j.title),
        geoBucket: geoBucket(j.location),
        category: j.category,
        isMatch: true,
        matchScore: j.matchScore,
        matchedRoleIds: j.matchedRoleIds,
        matchReasons: { matchedKeywords: j.matchedKeywords, descriptionMissing: false, roleOutcomes: {} },
      });
      loaded++;
    }
  });
  return loaded;
}

export function demoRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/demo', (_req, res) => {
    res.json({ count: new Repo(db).countBySource(DEMO_SOURCE) });
  });

  r.post('/demo', (_req, res) => {
    try {
      const loaded = loadDemo(new Repo(db));
      res.json({ loaded });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/demo', (_req, res) => {
    res.json({ cleared: new Repo(db).deleteBySource(DEMO_SOURCE) });
  });

  return r;
}
