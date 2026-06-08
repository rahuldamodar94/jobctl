import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initSchema } from '../../db/schema.js';
import { Repo } from '../../db/repo.js';

/**
 * POST /api/import core (importJobs): validate → dedupe+score via the scrape
 * path → insert as import:<site>. Tests run the pure core directly (no HTTP).
 */

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jh-import-'));
  mkdirSync(join(dir, 'profile'), { recursive: true });
  mkdirSync(join(dir, 'config'), { recursive: true });
  process.env.PROFILE_DIR = join(dir, 'profile');
  process.env.CONFIG_DIR = join(dir, 'config');
  writeFileSync(join(dir, 'profile', 'profile.yaml'), 'name: T\nenabled_sources: [jobstash]\ngeo_priority: [remote]\n');
  writeFileSync(
    join(dir, 'profile', 'roles.yaml'),
    `roles:
  - id: senior_backend
    label: Senior Backend
    title_keywords: [backend engineer, software engineer]
    must_have_stack: [typescript, node.js, python]
`
  );
  writeFileSync(join(dir, 'config', 'categories.yaml'), 'order: [web2, other]\nkeywords:\n  web2: [saas]\n');
  db = new Database(':memory:');
  initSchema(db);
});

afterEach(() => {
  delete process.env.PROFILE_DIR;
  delete process.env.CONFIG_DIR;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

async function fresh() {
  vi.resetModules(); // load.ts caches PROFILE_DIR/CONFIG_DIR at import
  return import('./import.js');
}

const job = (over: Record<string, unknown> = {}) => ({
  company: 'Acme',
  title: 'Backend Engineer',
  url: 'https://acme.example/jobs/1',
  location: 'Remote',
  description: 'We use <strong>TypeScript</strong> and Node.js to build APIs.',
  ...over,
});

describe('importJobs', () => {
  test('imports valid jobs through the scrape path: scored, HTML-stripped, tagged import:<site>', async () => {
    const { importJobs } = await fresh();
    const out = importJobs(db, { site: 'linkedin', jobs: [job()] });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ imported: 1, received: 1, merged: 0, source: 'import:linkedin' });

    const repo = new Repo(db);
    const rows = repo.activeMatched();
    expect(rows).toHaveLength(1);
    const j = rows[0]!;
    expect(j.sourceId).toBe('import:linkedin');
    expect(j.isMatch).toBe(true); // matched the senior_backend role
    expect(j.matchScore).toBeGreaterThan(0);
    expect(j.description).toContain('TypeScript'); // HTML stripped
    expect(j.description).not.toContain('<strong>');
  });

  test('dedupes against an existing identical job (merged, not double-inserted)', async () => {
    const { importJobs } = await fresh();
    const first = importJobs(db, { site: 'linkedin', jobs: [job()] });
    expect((first.body as { imported: number }).imported).toBe(1);

    // same company+title+geo → exact dedupe key → merge, not a second row
    const second = importJobs(db, { site: 'indeed', jobs: [job({ url: 'https://other.example/x' })] });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ imported: 0, merged: 1 });
    expect(new Repo(db).activeMatched()).toHaveLength(1);
  });

  test('rejects an invalid payload (missing company, bad url, dirty site)', async () => {
    const { importJobs } = await fresh();
    expect(importJobs(db, { site: 'linkedin', jobs: [{ title: 'X', url: 'https://x/1' }] }).status).toBe(400);
    expect(importJobs(db, { site: 'linkedin', jobs: [job({ url: 'javascript:alert(1)' })] }).status).toBe(400);
    expect(importJobs(db, { site: 'Bad Site!', jobs: [job()] }).status).toBe(400);
    expect(importJobs(db, { site: 'linkedin', jobs: [] }).status).toBe(400);
  });

  test('normalizes a relative postedDate to an absolute ISO date', async () => {
    const { importJobs } = await fresh();
    importJobs(db, { site: 'linkedin', jobs: [job({ postedDate: '3 days ago' })] });
    const j = new Repo(db).activeMatched()[0]!;
    expect(j.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('409 when profile/roles are not configured', async () => {
    rmSync(join(dir, 'profile', 'roles.yaml'));
    const { importJobs } = await fresh();
    const out = importJobs(db, { site: 'linkedin', jobs: [job()] });
    expect(out.status).toBe(409);
    expect((out.body as { error: string }).error).toMatch(/configure your profile and roles/);
  });
});
