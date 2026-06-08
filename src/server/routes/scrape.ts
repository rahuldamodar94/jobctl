import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Repo } from '../../db/repo.js';
import { runScrape } from '../../scraper/run.js';
import { loadProfile } from '../../config/load.js';

/**
 * POST /api/scrape — fire-and-forget; the DB scrape lock is the SINGLE source
 * of truth for "is a scrape running" (it also guards CLI scrapes from another
 * process, and survives server restarts via its staleness TTL). The UI polls
 * /api/runs/latest for progress. 409 when the lock is held.
 */
export function scrapeRouter(db: Database.Database, repo: Repo): Router {
  const r = Router();

  r.post('/', (_req, res) => {
    // clean first-run message instead of a silent caught-ConfigError no-op
    try {
      loadProfile();
    } catch {
      return res.status(400).json({ error: 'Set up your profile first (open Settings).' });
    }
    if (repo.latestRun()?.status === 'running') {
      return res.status(409).json({ error: 'scrape already running' });
    }
    // runScrape acquires the DB lock itself; a race between two POSTs resolves
    // there (the loser throws and is logged — nothing is left half-started).
    runScrape(db, { log: (m) => console.log(`[scrape] ${m}`) }).catch((e) =>
      console.error('[scrape] failed:', (e as Error).message)
    );
    res.status(202).json({ started: true });
  });

  return r;
}
