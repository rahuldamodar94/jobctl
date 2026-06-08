import { describe, expect, test, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { Repo } from '../db/repo.js';
import { ingestBatch } from './run.js';
import type { CategoriesConfig, RawJob, RoleConfig } from '../shared/types.js';

const ROLES: RoleConfig[] = [
  {
    id: 'senior_backend',
    label: 'SB',
    lane: 'ic',
    titleKeywords: ['backend engineer'],
    mustHaveStack: ['typescript'],
    niceToHave: {},
    excludeIfPrimary: [],
    geoPriority: ['remote'],
    geoRelocationOk: [],
  },
];
const CATS: CategoriesConfig = { order: ['web3', 'web2'], fallback: 'web2', keywords: { web3: ['crypto'] } };

const raw = (over: Partial<RawJob>): RawJob => ({
  externalId: 'e1',
  sourceId: 'jobstash',
  company: 'Acme',
  title: 'Senior Backend Engineer',
  location: 'Remote',
  workMode: 'remote',
  salaryText: null,
  description: 'TypeScript crypto services. '.repeat(15),
  url: 'https://a.example/1',
  tags: [],
  postedDate: null,
  ...over,
});

describe('ingestBatch dedup policy (reviewer gap — cross-board)', () => {
  let db: Database.Database;
  let repo: Repo;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    repo = new Repo(db);
  });

  test('same job from 3 boards with string variants = 1 row', () => {
    ingestBatch(repo, [raw({ sourceId: 'jobstash', location: 'Remote' })], ROLES, CATS, () => {});
    ingestBatch(
      repo,
      [raw({ sourceId: 'web3career', title: 'Sr. Backend Engineer', location: 'Remote — EMEA', externalId: 'w1', url: 'https://b.example/2' })],
      ROLES,
      CATS,
      () => {}
    );
    ingestBatch(
      repo,
      [raw({ sourceId: 'ats:ashby', company: 'Acme Labs', location: null, externalId: 'a1', url: 'https://c.example/3' })],
      ROLES,
      CATS,
      () => {}
    );
    expect(repo.allActive()).toHaveLength(1);
  });

  test('DELIBERATE POLICY: same title in two real cities stays 2 rows (untriaged)', () => {
    // Dubai and London postings of the same title are usually two real
    // headcounts — the new-vs-new geo gate keeps them apart on purpose.
    ingestBatch(repo, [raw({ location: 'Dubai, UAE', externalId: 'd1' })], ROLES, CATS, () => {});
    ingestBatch(repo, [raw({ location: 'London, UK', externalId: 'l1', url: 'https://a.example/2' })], ROLES, CATS, () => {});
    expect(repo.allActive()).toHaveLength(2);
  });

  test('ACCEPTANCE: a user-triaged job never resurfaces as new, even with messier strings', () => {
    // user triages via the UI (status dropdown)
    ingestBatch(repo, [raw({ company: 'Polymarket', title: 'Senior Backend Engineer, Onchain', location: 'New York' })], ROLES, CATS, () => {});
    repo.setStatus(repo.allActive()[0]!.id, 'dismissed');

    // a later scrape finds the same role reposted with string variants AND a
    // different location string — triaged rows merge regardless of geo
    ingestBatch(
      repo,
      [raw({ company: 'Polymarket', title: 'Sr. Backend Engineer - Onchain', location: 'Remote (US)', externalId: 'p2', url: 'https://b.example/7' })],
      ROLES,
      CATS,
      () => {}
    );
    const all = repo.allActive();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('dismissed');
  });

  test('profile exclude_categories: ai-category jobs are unmatched with a clear reason', () => {
    ingestBatch(
      repo,
      [raw({ description: 'TypeScript backend for our LLM agent platform. '.repeat(10), externalId: 'ai1' })],
      ROLES,
      { order: ['ai', 'web2'], fallback: 'web2', keywords: { ai: ['llm'] } },
      () => {},
      ['ai'] // profile-level category exclusion
    );
    const j = repo.allActive()[0]!;
    expect(j.category).toBe('ai');
    expect(j.isMatch).toBe(false);
    expect(JSON.stringify(j.matchReasons)).toContain('exclude_categories');
  });

  test('company-name suffix variant merges (tether ↔ tether operations)', () => {
    ingestBatch(repo, [raw({ company: 'Tether', externalId: 't1' })], ROLES, CATS, () => {});
    ingestBatch(
      repo,
      [raw({ company: 'Tether Operations Limited', externalId: 't2', url: 'https://a.example/9' })],
      ROLES,
      CATS,
      () => {}
    );
    expect(repo.allActive()).toHaveLength(1);
  });
});
