import { describe, expect, test, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import { initSchema } from '../../db/schema.js';
import { Repo, type NewJobInput } from '../../db/repo.js';
import { jobsRouter, buildJobsFilter } from './jobs.js';
import { exportRouter } from './export.js';

/**
 * Route-level tests for the dynamic WHERE builder — the COUNT query reuses
 * the filter params via slice(0,-2); this suite breaks if anyone appends a
 * param AFTER limit/offset (the reviewer-flagged trap).
 */

function makeInput(over: Partial<NewJobInput> = {}): NewJobInput {
  return {
    externalId: 'x',
    sourceId: 'jobstash',
    company: 'Acme',
    title: 'Senior Backend Engineer',
    location: 'Remote',
    workMode: 'remote',
    salaryText: null,
    description: 'desc',
    url: 'https://x.example/1',
    tags: [],
    postedDate: null,
    dedupeKey: `k-${Math.random()}`,
    normCompany: 'acme',
    normTitle: 'senior backend engineer',
    geoBucket: 'remote',
    category: 'web3',
    isMatch: true,
    matchScore: 50,
    matchedRoleIds: ['senior_backend'],
    matchReasons: { matchedKeywords: ['typescript'], descriptionMissing: false, roleOutcomes: {} },
    ...over,
  };
}

// Minimal request runner — invokes the router without binding a port.
async function get(app: express.Express, url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = { method: 'GET', url, headers: {} } as any;
    const chunks: any[] = [];
    const res: any = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(payload: unknown) {
        resolve({ status: this.statusCode, body: payload });
      },
      end(payload?: unknown) {
        resolve({ status: this.statusCode, body: payload ? JSON.parse(String(payload)) : chunks.join('') });
      },
      write(c: unknown) {
        chunks.push(c);
        return true;
      },
      on() {},
    };
    app(req, res, (err: unknown) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

describe('GET /api/jobs WHERE builder', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    const repo = new Repo(db);
    repo.insert(makeInput({ company: 'Plasma', matchScore: 90, category: 'fintech' }));
    repo.insert(makeInput({ company: 'Acme', matchScore: 40 }));
    repo.insert(makeInput({ company: 'LowCo', matchScore: 10 }));
    const dismissedId = repo.insert(makeInput({ company: 'GoneCo' }));
    repo.setStatus(dismissedId, 'dismissed');
    app = express();
    app.use('/api/jobs', jobsRouter(db, repo));
    app.use('/api/export.csv', exportRouter(db));
  });

  test('combined filters: status + minScore + q + category — total matches list', async () => {
    const r = await get(app, '/api/jobs?status=new&minScore=30&q=plasma&category=fintech&postedWithin=14');
    expect(r.status).toBe(200);
    expect(r.body.jobs).toHaveLength(1);
    expect(r.body.jobs[0].company).toBe('Plasma');
    expect(r.body.total).toBe(1); // COUNT params alignment — the slice(0,-2) trap
  });

  test('minScore alone filters and total is consistent', async () => {
    const r = await get(app, '/api/jobs?status=new&minScore=30');
    expect(r.body.jobs).toHaveLength(2);
    expect(r.body.total).toBe(2);
  });

  test("explicit status=all means ALL — dismissed included (least surprise)", async () => {
    const all = await get(app, '/api/jobs?status=all');
    expect(all.body.jobs.map((j: any) => j.company)).toContain('GoneCo');
  });

  test('absent/empty status still hides dismissed (safe API default)', async () => {
    const empty = await get(app, '/api/jobs?status=');
    expect(empty.body.jobs.map((j: any) => j.company)).not.toContain('GoneCo');
  });

  test('an all-invalid status csv still hides dismissed (no leak via empty filter)', async () => {
    const bogus = await get(app, '/api/jobs?status=bogus,nope');
    expect(bogus.body.jobs.map((j: any) => j.company)).not.toContain('GoneCo'); // dismissed stays hidden
  });

  test('unmatched audit ignores a leftover minScore (all-score-0 rows must still show)', async () => {
    // LowCo becomes an untriaged unmatched row (is_match=0, score 0)
    db.prepare(`UPDATE jobs SET is_match = 0, match_score = 0 WHERE company = 'LowCo'`).run();
    // a deep-linked/exported URL carrying both match=unmatched AND a high minScore
    const r = await get(app, '/api/jobs?status=new&match=unmatched&minScore=70');
    expect(r.body.jobs.map((j: any) => j.company)).toEqual(['LowCo']); // not dropped by the score floor
  });

  test('match filter: matched (default) / unmatched / all', async () => {
    // make LowCo an unmatched row with a stored rejection reason
    db.prepare(
      `UPDATE jobs SET is_match = 0, match_reasons = ? WHERE company = 'LowCo'`
    ).run(JSON.stringify({ matchedKeywords: [], descriptionMissing: false, roleOutcomes: { senior_backend: 'title: no role keyword' } }));

    const def = await get(app, '/api/jobs?status=new');
    expect(def.body.jobs.map((j: any) => j.company)).not.toContain('LowCo');

    const unmatched = await get(app, '/api/jobs?status=new&match=unmatched');
    expect(unmatched.body.jobs.map((j: any) => j.company)).toEqual(['LowCo']);
    expect(unmatched.body.total).toBe(1);

    const all = await get(app, '/api/jobs?status=new&match=all');
    expect(all.body.jobs.map((j: any) => j.company)).toContain('LowCo');
    expect(all.body.total).toBe(3);
  });

  test('export with filters returns only the filtered view (full set, no paging)', async () => {
    const r = await get(app, '/api/export.csv?status=new&minScore=30');
    const lines = String(r.body).trim().split('\n');
    expect(lines).toHaveLength(1 + 2); // header + Plasma(90) + Acme(40)
    expect(r.body).toContain('Plasma');
    expect(r.body).toContain('Acme');
    expect(r.body).not.toContain('GoneCo'); // dismissed hidden like the UI
    expect(r.body).not.toContain('LowCo'); // below minScore
  });

  test('export without params keeps full-dump backup semantics (incl. dismissed)', async () => {
    const r = await get(app, '/api/export.csv');
    const lines = String(r.body).trim().split('\n');
    expect(lines).toHaveLength(1 + 4); // header + all four rows
    expect(r.body).toContain('GoneCo');
  });

  test('export still escapes formula injection', async () => {
    const repo2 = new Repo(db);
    repo2.insert(makeInput({ company: '=HYPERLINK("evil")', matchScore: 99 }));
    const r = await get(app, '/api/export.csv?status=new&minScore=90');
    expect(r.body).toContain(`'=HYPERLINK`);
  });

  test('status csv list works', async () => {
    const r = await get(app, '/api/jobs?status=new,dismissed');
    expect(r.body.jobs.map((j: any) => j.company)).toContain('GoneCo');
    expect(r.body.total).toBe(4);
  });

  test('a corrupt JSON cell degrades to its default — never 500s the whole list', async () => {
    // simulate a corrupt row (e.g. an older bug / partial write)
    db.prepare(`UPDATE jobs SET tags = 'not json', llm_dimensions = '{bad' WHERE company = 'Acme'`).run();
    const r = await get(app, '/api/jobs?status=all');
    expect(r.status).toBe(200);
    const acme = r.body.jobs.find((j: any) => j.company === 'Acme');
    expect(acme.tags).toEqual([]); // degraded, not thrown
    expect(acme.llm_dimensions).toEqual([]);
  });

  test('refinements apply to New only: a low-score Interested job still shows', async () => {
    // LowCo (score 10) marked interested → must survive a minScore=30 filter
    db.prepare(`UPDATE jobs SET status='interested' WHERE company='LowCo'`).run();
    const r = await get(app, '/api/jobs?status=new,interested&minScore=30');
    expect(r.body.jobs.map((j: any) => j.company)).toContain('LowCo'); // triaged bypasses the floor
  });

  test('refinements apply to New only: low-score NEW job is hidden, triaged-unmatched shows', async () => {
    const repo = new Repo(db);
    repo.insert(makeInput({ company: 'NewLow', matchScore: 5, dedupeKey: 'newlow' }));
    const appliedUnmatchedId = repo.insert(
      makeInput({ company: 'AppliedSales', matchScore: 0, isMatch: false, dedupeKey: 'asales' })
    );
    repo.setStatus(appliedUnmatchedId, 'applied');

    // default-style view: matched + score>=30 over new+interested
    const def = await get(app, '/api/jobs?status=new,interested&minScore=30&match=matched');
    expect(def.body.jobs.map((j: any) => j.company)).not.toContain('NewLow');

    // applied view: the unmatched, score-0 applied job MUST show (curated)
    const applied = await get(app, '/api/jobs?status=applied&minScore=30&match=matched');
    expect(applied.body.jobs.map((j: any) => j.company)).toContain('AppliedSales');
  });

  test('location filter (substring, escaped)', async () => {
    const repo = new Repo(db);
    repo.insert(makeInput({ company: 'DubaiCo', location: 'Dubai, UAE', dedupeKey: 'dxb' }));
    const r = await get(app, '/api/jobs?status=new&location=dubai');
    expect(r.body.jobs.map((j: any) => j.company)).toEqual(['DubaiCo']);
  });

  test('role filter accepts a csv of ids (lane expansion) and ORs them', async () => {
    const repo = new Repo(db);
    repo.insert(makeInput({ company: 'EMCo', matchedRoleIds: ['engineering_manager'], dedupeKey: 'em1' }));
    // senior_backend OR engineering_manager → both Plasma-style IC rows and EMCo
    const r = await get(app, '/api/jobs?status=new&role=senior_backend,engineering_manager');
    const names = r.body.jobs.map((j: any) => j.company);
    expect(names).toContain('EMCo');
    expect(names).toContain('Plasma');
    // a lane with only the EM id returns just EM rows
    const emOnly = await get(app, '/api/jobs?status=new&role=engineering_manager');
    expect(emOnly.body.jobs.map((j: any) => j.company)).toEqual(['EMCo']);
  });

  test('sort=date orders by recency; default orders by score', async () => {
    const repo = new Repo(db);
    // give Plasma an old posted_date, a fresh low-score job a recent one
    db.prepare(`UPDATE jobs SET posted_date='2020-01-01' WHERE company='Plasma'`).run();
    repo.insert(makeInput({ company: 'FreshCo', matchScore: 35, postedDate: '2099-01-01', dedupeKey: 'fresh' }));
    const byScore = await get(app, '/api/jobs?status=new&minScore=30');
    expect(byScore.body.jobs[0].company).toBe('Plasma'); // score 90 first
    const byDate = await get(app, '/api/jobs?status=new&minScore=30&sort=date');
    expect(byDate.body.jobs[0].company).toBe('FreshCo'); // 2099 first
  });
});

describe('buildJobsFilter omitStatus (shared by /api/stats for WYSIWYG counts)', () => {
  test('omitStatus drops the status clause but keeps is_active + every refinement', () => {
    const withStatus = buildJobsFilter({ status: 'new', minScore: '30' });
    expect(withStatus.where.some((w) => w.includes('status IN'))).toBe(true);

    const without = buildJobsFilter({ status: 'new', minScore: '30' }, { omitStatus: true });
    expect(without.where.some((w) => w.includes('status IN'))).toBe(false);
    expect(without.where).toContain('is_active = 1');
    expect(without.where.some((w) => w.includes('match_score'))).toBe(true); // refinement kept
  });

  test('omitStatus also drops the dismissed-default clause (no status branch at all)', () => {
    const without = buildJobsFilter({ status: '' }, { omitStatus: true });
    expect(without.where.some((w) => w.includes("status != 'dismissed'"))).toBe(false);
  });
});
