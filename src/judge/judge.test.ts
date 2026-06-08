import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initSchema } from '../db/schema.js';
import { Repo, type NewJobInput } from '../db/repo.js';
import { buildJudgePrompt, parseVerdict } from './prompt.js';

// --- pure: prompt + parse ---------------------------------------------------

describe('buildJudgePrompt', () => {
  test('embeds the rubric, the JD, and the strict-JSON contract', () => {
    const p = buildJudgePrompt(
      { company: 'Acme', title: 'Senior Backend Engineer', location: 'Remote', description: 'TypeScript, Node' },
      'MY RUBRIC TEXT'
    );
    expect(p).toContain('MY RUBRIC TEXT');
    expect(p).toContain('Senior Backend Engineer');
    expect(p).toContain('TypeScript, Node');
    expect(p).toMatch(/STRONG.*DECENT.*WEAK.*SKIP/s);
    expect(p.toLowerCase()).toContain('return only');
  });
});

describe('parseVerdict', () => {
  test('clean JSON', () => {
    const v = parseVerdict('{"verdict":"STRONG","summary":"great","reasons":["a","b"],"blockers":[]}');
    expect(v.verdict).toBe('STRONG');
    expect(v.reasons).toEqual(['a', 'b']);
    expect(v.blockers).toEqual([]);
  });
  test('salvages fenced + chatter-wrapped JSON', () => {
    const v = parseVerdict('Sure!\n```json\n{"verdict":"weak","summary":"meh","reasons":[],"blockers":["Go-primary"]}\n```');
    expect(v.verdict).toBe('WEAK'); // case-normalized
    expect(v.blockers).toEqual(['Go-primary']);
  });
  test('coerces non-array reasons/blockers to []', () => {
    const v = parseVerdict('{"verdict":"SKIP","summary":"","reasons":null,"blockers":"x"}');
    expect(v.reasons).toEqual([]);
    expect(v.blockers).toEqual([]);
  });
  test('throws on an unknown verdict', () => {
    expect(() => parseVerdict('{"verdict":"MAYBE","summary":"","reasons":[],"blockers":[]}')).toThrow(/not one of/);
  });
  test('throws when there is no JSON', () => {
    expect(() => parseVerdict('the model refused')).toThrow(/no JSON/);
  });
  test('handles backticks/braces inside JSON string values (string-aware)', () => {
    const v = parseVerdict('{"verdict":"DECENT","summary":"use ``` and { } in code","reasons":["a"],"blockers":[]}');
    expect(v.verdict).toBe('DECENT');
    expect(v.summary).toContain('{ }');
  });
  test('takes the first complete object when chatter adds a second', () => {
    const v = parseVerdict('{"verdict":"STRONG","summary":"x","reasons":[],"blockers":[]} ...oops {"verdict":"SKIP"}');
    expect(v.verdict).toBe('STRONG');
  });

  test('back-compat: a verdict with no dimensions key → dimensions []', () => {
    const v = parseVerdict('{"verdict":"DECENT","summary":"","reasons":[],"blockers":[]}');
    expect(v.dimensions).toEqual([]);
  });

  test('parses dimensions: valid keys/ratings, evidence capped at 2, junk dropped', () => {
    const v = parseVerdict(
      JSON.stringify({
        verdict: 'STRONG',
        summary: 'great',
        reasons: [],
        blockers: [],
        dimensions: [
          { key: 'skills', rating: 'strong', note: 'TS match', evidence: ['uses TypeScript', 'Node services', 'extra cite'] },
          { key: 'location', rating: 'WEAK', note: 'onsite', evidence: ['onsite in SF'] }, // rating case-normalized
          { key: 'red_flags', rating: 'banana', note: 'odd', evidence: [] }, // bad rating → unknown
          { key: 'made_up', rating: 'strong', note: 'x', evidence: [] }, // unknown key → dropped
          { key: 'skills', rating: 'ok', note: 'dup', evidence: [] }, // duplicate key → dropped
        ],
      })
    );
    expect(v.dimensions.map((d) => d.key)).toEqual(['skills', 'location', 'red_flags']);
    expect(v.dimensions[0]!.evidence).toEqual(['uses TypeScript', 'Node services']); // capped at 2
    expect(v.dimensions[1]!.rating).toBe('weak'); // case-normalized
    expect(v.dimensions[2]!.rating).toBe('unknown'); // out-of-range → unknown
  });

  test('non-array dimensions degrade to []', () => {
    const v = parseVerdict('{"verdict":"SKIP","summary":"","reasons":[],"blockers":[],"dimensions":"oops"}');
    expect(v.dimensions).toEqual([]);
  });
  test('fenced JSON whose summary contains a fence', () => {
    const v = parseVerdict('```json\n{"verdict":"WEAK","summary":"wrap in ```","reasons":[],"blockers":[]}\n```');
    expect(v.verdict).toBe('WEAK');
  });
});

// --- integration: config → openai-compatible backend → parse → persist ------

function makeInput(over: Partial<NewJobInput> = {}): NewJobInput {
  return {
    externalId: 'x', sourceId: 'jobstash', company: 'Acme', title: 'Senior Backend Engineer',
    location: 'Remote', workMode: 'remote', salaryText: null, description: 'TypeScript backend role',
    url: 'https://x/1', tags: [], postedDate: null, dedupeKey: `k-${Math.random()}`,
    normCompany: 'acme', normTitle: 'senior backend engineer', geoBucket: 'remote', category: 'web2',
    isMatch: true, matchScore: 60, matchedRoleIds: ['be'],
    matchReasons: { matchedKeywords: [], descriptionMissing: false, roleOutcomes: {} },
    ...over,
  };
}

describe('judgePending (openai-compatible backend, mocked fetch)', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jh-judge-'));
    mkdirSync(join(dir, 'profile'), { recursive: true });
    process.env.PROFILE_DIR = join(dir, 'profile');
    process.env.CONFIG_DIR = join(dir, 'config');
    writeFileSync(
      join(dir, 'profile', 'profile.yaml'),
      `name: T
enabled_sources: [jobstash]
llm:
  backends:
    cloud:
      engine: openai-compatible
      base_url: https://example.test/v1
  judge:
    enabled: true
    backend: cloud
`
    );
    writeFileSync(join(dir, 'profile', 'judge-rubric.md'), '# Rubric\nprefer TS backend');
    db = new Database(':memory:');
    initSchema(db);
  });
  afterEach(() => {
    delete process.env.PROFILE_DIR;
    delete process.env.CONFIG_DIR;
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  async function freshJudge() {
    vi.resetModules();
    return import('./index.js');
  }

  function mockFetch(content: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => content,
    })) as unknown as typeof fetch);
  }

  test('judges a matched job, persists the verdict, and skips when unchanged', async () => {
    const repo = new Repo(db);
    const id = repo.insert(makeInput());
    mockFetch(
      '{"verdict":"STRONG","summary":"strong fit","reasons":["ts"],"blockers":[],"dimensions":[{"key":"skills","rating":"strong","note":"TS/Node","evidence":["TypeScript backend role"]}]}'
    );
    const { judgePending } = await freshJudge();

    const r1 = await judgePending(repo, () => {});
    expect(r1).toMatchObject({ judged: 1, failed: 0, skipped: null });
    const job = repo.findById(id)!;
    expect(job.llmVerdict).toBe('STRONG');
    expect(job.llmReasons).toEqual(['ts']);
    expect(job.llmJudgedHash).toBeTruthy();
    // dimensions round-trip through persistence
    expect(job.llmDimensions).toEqual([
      { key: 'skills', rating: 'strong', note: 'TS/Node', evidence: ['TypeScript backend role'] },
    ]);

    // unchanged JD → no re-judge
    const r2 = await judgePending(repo, () => {});
    expect(r2.judged).toBe(0);

    // --all forces a re-judge
    const r3 = await judgePending(repo, () => {}, { all: true });
    expect(r3.judged).toBe(1);
  });

  test('best-effort: malformed output fails the job without throwing or persisting', async () => {
    const repo = new Repo(db);
    const id = repo.insert(makeInput());
    mockFetch('not json at all');
    const { judgePending } = await freshJudge();
    const r = await judgePending(repo, () => {});
    expect(r.failed).toBe(1);
    expect(r.judged).toBe(0);
    expect(repo.findById(id)!.llmVerdict).toBeNull(); // nothing persisted
  });

  test('disabled judge → skipped, nothing judged', async () => {
    writeFileSync(join(dir, 'profile', 'profile.yaml'), 'name: T\nenabled_sources: [jobstash]\n');
    const repo = new Repo(db);
    repo.insert(makeInput());
    const { judgePending } = await freshJudge();
    const r = await judgePending(repo, () => {});
    expect(r.skipped).toMatch(/disabled/);
    expect(r.judged).toBe(0);
  });
});
