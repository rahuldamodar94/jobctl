import { describe, expect, test, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../db/schema.js';
import { Repo } from '../../db/repo.js';
import { loadDemo } from './demo.js';
import { DEMO_JOBS } from '../demo-jobs.js';

/**
 * Demo sample-data loader: pre-scored rows tagged source_id='demo', idempotent
 * load, clean clear — and never touching real (other-source) rows.
 */

let db: Database.Database;
let repo: Repo;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
  repo = new Repo(db);
});

describe('loadDemo', () => {
  test('loads all sample jobs as matched, scored, source=demo', () => {
    const now = new Date('2026-06-08T12:00:00Z');
    const n = loadDemo(repo, now);
    expect(n).toBe(DEMO_JOBS.length);
    expect(repo.countBySource('demo')).toBe(DEMO_JOBS.length);

    const rows = repo.activeMatched();
    expect(rows).toHaveLength(DEMO_JOBS.length);
    for (const r of rows) {
      expect(r.sourceId).toBe('demo');
      expect(r.isMatch).toBe(true);
      expect(r.matchScore).toBeGreaterThan(0);
      expect(r.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // resolved from postedDaysAgo
    }
  });

  test('is idempotent — re-loading does not duplicate', () => {
    loadDemo(repo);
    loadDemo(repo);
    expect(repo.countBySource('demo')).toBe(DEMO_JOBS.length);
  });

  test('clear removes only demo rows, leaving real jobs intact', () => {
    // a real (non-demo) job
    repo.insert({
      externalId: 'r1', sourceId: 'jobstash', company: 'Real Co', title: 'Backend Engineer',
      location: 'Remote', workMode: 'remote', salaryText: null, description: 'real',
      url: 'https://real/1', tags: [], postedDate: null, dedupeKey: 'real-key',
      normCompany: 'real co', normTitle: 'backend engineer', geoBucket: 'remote', category: 'saas',
      isMatch: true, matchScore: 50, matchedRoleIds: ['x'],
      matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    });
    loadDemo(repo);
    expect(repo.countBySource('demo')).toBe(DEMO_JOBS.length);

    const cleared = repo.deleteBySource('demo');
    expect(cleared).toBe(DEMO_JOBS.length);
    expect(repo.countBySource('demo')).toBe(0);
    expect(repo.countBySource('jobstash')).toBe(1); // real job untouched
  });
});
