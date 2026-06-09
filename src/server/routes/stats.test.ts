import { describe, expect, test, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../db/schema.js';
import { Repo, type NewJobInput } from '../../db/repo.js';
import { buildStats } from './stats.js';

/**
 * Stats mirror the DEFAULT (matched) list lens, not a raw status tally:
 * unmatched jobs are an audit view (match=unmatched, global) — they must NOT
 * inflate the `new` pill. So `new` counts matched rows only; triaged rows
 * always count regardless of match (refinement-on-new-only — same rule as
 * buildJobsFilter). Otherwise the pill screams "2158 new" while the default
 * view shows ~0.
 */

let n = 0;
function makeInput(over: Partial<NewJobInput> = {}): NewJobInput {
  n += 1;
  return {
    externalId: `x${n}`,
    sourceId: 'jobstash',
    company: 'Acme',
    title: 'Senior Backend Engineer',
    location: 'Remote',
    workMode: 'remote',
    salaryText: null,
    description: 'desc',
    url: `https://x.example/${n}`,
    tags: [],
    postedDate: null,
    dedupeKey: `k-${n}-${Math.random()}`,
    normCompany: 'acme',
    normTitle: `senior backend engineer ${n}`,
    geoBucket: 'remote',
    category: 'web3',
    isMatch: true,
    matchScore: 50,
    matchedRoleIds: ['senior_backend'],
    matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    ...over,
  };
}

describe('buildStats — matched-pipeline counts', () => {
  let db: Database.Database;
  let repo: Repo;
  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    repo = new Repo(db);
  });

  test('unmatched new jobs do NOT inflate the new count', () => {
    repo.insert(makeInput({ isMatch: true })); // matched new → counts
    repo.insert(makeInput({ isMatch: true })); // matched new → counts
    for (let i = 0; i < 5; i += 1) repo.insert(makeInput({ isMatch: false })); // unmatched new → audit only
    const s = buildStats(db);
    expect(s.new).toBe(2); // not 7
  });

  test('triaged rows always count even when unmatched (refinement-on-new-only)', () => {
    const id = repo.insert(makeInput({ isMatch: false }));
    repo.setStatus(id, 'applied' as never);
    const s = buildStats(db);
    expect(s.applied).toBe(1); // triaged → always counts despite is_match=0
    expect(s.new).toBe(0);
  });

  test('total reflects the matched pipeline, not the unmatched audit backlog', () => {
    repo.insert(makeInput({ isMatch: true })); // matched new
    for (let i = 0; i < 10; i += 1) repo.insert(makeInput({ isMatch: false })); // unmatched noise
    const applied = repo.insert(makeInput({ isMatch: false }));
    repo.setStatus(applied, 'applied' as never);
    const s = buildStats(db);
    expect(s.total).toBe(2); // 1 matched-new + 1 applied; the 10 unmatched-new excluded
  });

  // ---- WYSIWYG: counts reflect the active refinements (so the pill == the list) ----

  test('minScore refinement shrinks the new count (count == what the list shows)', () => {
    repo.insert(makeInput({ isMatch: true, matchScore: 10 })); // below floor
    repo.insert(makeInput({ isMatch: true, matchScore: 80 })); // above floor
    expect(buildStats(db, {}).new).toBe(2); // no floor → both
    expect(buildStats(db, { minScore: '30' }).new).toBe(1); // floor → only the 80
  });

  test('postedWithin refinement excludes a matched-new job old by BOTH posted_date and first_seen', () => {
    repo.insert(makeInput({ isMatch: true, matchScore: 80, postedDate: '2099-01-01' })); // fresh
    const oldId = repo.insert(makeInput({ isMatch: true, matchScore: 80, postedDate: '2000-01-01' }));
    // recency is "recently posted OR recently discovered" — repo stamps first_seen
    // to today, so age it too, else the job survives via first_seen (by design).
    db.prepare("UPDATE jobs SET first_seen = '2000-01-01' WHERE id = ?").run(oldId);
    expect(buildStats(db, {}).new).toBe(2);
    expect(buildStats(db, { postedWithin: '14' }).new).toBe(1); // only the fresh one
  });

  test('triaged rows ignore the score/recency refinements (refinement-on-new-only)', () => {
    const id = repo.insert(makeInput({ isMatch: true, matchScore: 5, postedDate: '2000-01-01' }));
    repo.setStatus(id, 'applied' as never);
    expect(buildStats(db, { minScore: '70', postedWithin: '14' }).applied).toBe(1);
  });

  test('a global refinement (category) narrows triaged counts too', () => {
    const a = repo.insert(makeInput({ isMatch: true, category: 'web3' }));
    repo.setStatus(a, 'applied' as never);
    const b = repo.insert(makeInput({ isMatch: true, category: 'ai' }));
    repo.setStatus(b, 'applied' as never);
    expect(buildStats(db, { category: 'web3' }).applied).toBe(1);
  });
});
