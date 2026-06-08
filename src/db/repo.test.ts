import { describe, expect, test, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from './schema.js';
import { Repo, type NewJobInput } from './repo.js';
import type { RawJob } from '../shared/types.js';

function makeInput(over: Partial<NewJobInput> = {}): NewJobInput {
  return {
    externalId: 'x1',
    sourceId: 'jobstash',
    company: 'Acme',
    title: 'Senior Backend Engineer',
    location: 'Dubai, UAE',
    workMode: 'unknown',
    salaryText: null,
    description: 'short',
    url: 'https://example.com/1',
    tags: ['a'],
    postedDate: '2026-06-01',
    dedupeKey: `key-${Math.random()}`,
    normCompany: 'acme',
    normTitle: 'senior backend engineer',
    geoBucket: 'dubai',
    category: 'web3',
    isMatch: true,
    matchScore: 50,
    matchedRoleIds: ['senior_backend'],
    matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    ...over,
  };
}

describe('Repo', () => {
  let db: Database.Database;
  let repo: Repo;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    repo = new Repo(db);
  });

  describe('corrupt-row resilience (F2)', () => {
    test('a hand-corrupted JSON column does not brick reads', () => {
      const id = repo.insert(makeInput());
      db.prepare("UPDATE jobs SET tags = 'not-json{', match_reasons = '{broken' WHERE id = ?").run(id);
      const job = repo.findById(id)!;
      expect(job.tags).toEqual([]); // defaulted, not thrown
      expect(job.matchReasons).toBe(null);
      expect(repo.allActive()).toHaveLength(1); // list paths survive too
    });
  });

  describe('findByCompany prefix candidates (F3)', () => {
    test('finds exact, stored-prefix, and incoming-prefix variants via first token', () => {
      repo.insert(makeInput({ normCompany: 'tether', dedupeKey: 'k1' }));
      repo.insert(makeInput({ normCompany: 'tether operations', dedupeKey: 'k2' }));
      repo.insert(makeInput({ normCompany: 'treasury prime', dedupeKey: 'k3' }));

      const forIncomingLong = repo.findByCompany('tether operations');
      expect(forIncomingLong.map((j) => j.normCompany).sort()).toEqual(['tether', 'tether operations']);

      const forIncomingShort = repo.findByCompany('tether');
      expect(forIncomingShort.map((j) => j.normCompany).sort()).toEqual(['tether', 'tether operations']);

      // sharing a non-first word must NOT pull candidates
      expect(repo.findByCompany('modern treasury').map((j) => j.normCompany)).toEqual([]);
    });
  });

  describe('refreshSeen merge rules (F19 + reviewer gap)', () => {
    const raw = (over: Partial<RawJob> = {}): RawJob => ({
      externalId: 'x1',
      sourceId: 'web3career',
      company: 'Acme',
      title: 'Senior Backend Engineer',
      location: null,
      workMode: 'unknown',
      salaryText: null,
      description: null,
      url: 'https://example.com/2',
      tags: [],
      postedDate: null,
      ...over,
    });

    test('longer description wins; shorter does not regress it', () => {
      const id = repo.insert(makeInput({ description: 'a full long JD text here'.repeat(5) }));
      repo.refreshSeen(repo.findById(id)!, raw({ description: 'stub' }));
      expect(repo.findById(id)!.description).toContain('full long JD');
      repo.refreshSeen(repo.findById(id)!, raw({ description: 'an even longer full JD '.repeat(20) }));
      expect(repo.findById(id)!.description).toContain('even longer');
    });

    test('location is never degraded ("Remote" must not overwrite "Dubai, UAE")', () => {
      const id = repo.insert(makeInput({ location: 'Dubai, UAE' }));
      repo.refreshSeen(repo.findById(id)!, raw({ location: 'Remote' }));
      expect(repo.findById(id)!.location).toBe('Dubai, UAE');
    });

    test('null location gets filled from the new scrape', () => {
      const id = repo.insert(makeInput({ location: null, geoBucket: 'unknown' }));
      repo.refreshSeen(repo.findById(id)!, raw({ location: 'Remote — EMEA' }));
      expect(repo.findById(id)!.location).toBe('Remote — EMEA');
    });

    test('canonical ATS URL is never displaced by an aggregator URL', () => {
      const id = repo.insert(makeInput({ url: 'https://jobs.ashbyhq.com/acme/123' }));
      repo.refreshSeen(repo.findById(id)!, raw({ url: 'https://web3.career/job/9' }));
      expect(repo.findById(id)!.url).toBe('https://jobs.ashbyhq.com/acme/123'); // sticky

      // ...but a fresh ATS URL upgrades an aggregator URL
      const id2 = repo.insert(makeInput({ url: 'https://web3.career/job/7', dedupeKey: 'k2' }));
      repo.refreshSeen(repo.findById(id2)!, raw({ url: 'https://boards.greenhouse.io/acme/jobs/1' }));
      expect(repo.findById(id2)!.url).toBe('https://boards.greenhouse.io/acme/jobs/1');

      // aggregator → aggregator keeps freshness (reposts move)
      const id3 = repo.insert(makeInput({ url: 'https://web3.career/job/1', dedupeKey: 'k3' }));
      repo.refreshSeen(repo.findById(id3)!, raw({ url: 'https://jobstash.xyz/jobs/abc' }));
      expect(repo.findById(id3)!.url).toBe('https://jobstash.xyz/jobs/abc');
    });

    test('earliest posted_date kept; status untouched', () => {
      const id = repo.insert(makeInput({ postedDate: '2026-06-01' }));
      repo.setStatus(id, 'applied');
      repo.refreshSeen(repo.findById(id)!, raw({ postedDate: '2026-06-05' }));
      const j = repo.findById(id)!;
      expect(j.postedDate).toBe('2026-06-01');
      expect(j.status).toBe('applied');
    });
  });

  describe('scrape lock (reviewer gap)', () => {
    test('acquire → blocked → complete → acquirable again', () => {
      const run1 = repo.acquireScrapeLock();
      expect(run1).not.toBe(null);
      expect(repo.acquireScrapeLock()).toBe(null); // held
      repo.completeRun(run1!, [], 0);
      expect(repo.acquireScrapeLock()).not.toBe(null);
    });

    test('stale running row (crashed process) is auto-failed and lock recovered', () => {
      const run1 = repo.acquireScrapeLock()!;
      // simulate a crash 2 hours ago
      db.prepare('UPDATE scrape_runs SET started_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 2 * 3600_000).toISOString(), run1);
      const run2 = repo.acquireScrapeLock();
      expect(run2).not.toBe(null);
      expect(repo.latestRun()!.id).toBe(run2);
      const stale = db.prepare('SELECT status FROM scrape_runs WHERE id = ?').get(run1) as { status: string };
      expect(stale.status).toBe('failed');
    });

    test('failStaleRuns reconciles only running rows past the TTL', () => {
      const old = repo.acquireScrapeLock()!;
      db.prepare('UPDATE scrape_runs SET started_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 2 * 3600_000).toISOString(), old);
      // a freshly-running scrape must survive the sweep
      db.prepare("INSERT INTO scrape_runs (started_at, status) VALUES (?, 'running')")
        .run(new Date().toISOString());
      expect(repo.failStaleRuns()).toBe(1);
      const oldStatus = db.prepare('SELECT status FROM scrape_runs WHERE id = ?').get(old) as { status: string };
      expect(oldStatus.status).toBe('failed');
    });

    test('latestRun self-heals an orphaned running row past the TTL (UI no longer stuck)', () => {
      const run1 = repo.acquireScrapeLock()!;
      db.prepare('UPDATE scrape_runs SET started_at = ? WHERE id = ?')
        .run(new Date(Date.now() - 2 * 3600_000).toISOString(), run1);
      const latest = repo.latestRun()!;
      expect(latest.id).toBe(run1);
      expect(latest.status).toBe('failed'); // healed on read, not reported as 'running' forever
    });

    test('reconcileRunsAtStartup fails orphaned (dead/legacy pid) runs but PRESERVES a live process lock', () => {
      const ins = db.prepare("INSERT INTO scrape_runs (started_at, status, pid) VALUES (?, 'running', ?)");
      const dead = Number(ins.run(new Date().toISOString(), 2_000_000_000).lastInsertRowid); // no such pid
      const legacy = Number(ins.run(new Date().toISOString(), null).lastInsertRowid); // pre-migration row
      const live = Number(ins.run(new Date().toISOString(), process.pid).lastInsertRowid); // live CLI scrape

      expect(repo.reconcileRunsAtStartup()).toBe(2);
      const st = (id: number) => (db.prepare('SELECT status FROM scrape_runs WHERE id = ?').get(id) as { status: string }).status;
      expect(st(dead)).toBe('failed');
      expect(st(legacy)).toBe('failed');
      expect(st(live)).toBe('running'); // a concurrent live scrape keeps its lock — no double-scrape race
    });

    test('reconcileRunsAtStartup still fails a live-pid run once it exceeds the TTL', () => {
      const old = Number(
        db.prepare("INSERT INTO scrape_runs (started_at, status, pid) VALUES (?, 'running', ?)")
          .run(new Date(Date.now() - 2 * 3600_000).toISOString(), process.pid).lastInsertRowid
      );
      expect(repo.reconcileRunsAtStartup()).toBe(1);
      expect((db.prepare('SELECT status FROM scrape_runs WHERE id = ?').get(old) as { status: string }).status).toBe('failed');
    });
  });

  describe('suspect counter (F16)', () => {
    test('three consecutive suspects then acceptance resets', () => {
      repo.recordSourceSuccess('web3career', 50);
      expect(repo.bumpSuspect('web3career')).toBe(1);
      expect(repo.bumpSuspect('web3career')).toBe(2);
      expect(repo.bumpSuspect('web3career')).toBe(3);
      repo.recordSourceSuccess('web3career', 0); // accepted the new reality
      expect(repo.getSourceState('web3career').suspectCount).toBe(0);
    });
  });
});
