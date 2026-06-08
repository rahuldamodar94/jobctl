import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';

/**
 * Settings write surface: valid PUT writes live config (zod-validated, atomic);
 * invalid PUT is rejected WITHOUT touching the file; reads reflect writes;
 * traversal is blocked. Uses buildConfigPayload to prove writes are live
 * (no cache) and flip `configured`.
 */

let dir: string;

async function fresh() {
  vi.resetModules(); // load.ts caches PROFILE_DIR at import
  const settings = await import('./settings.js');
  const config = await import('./config.js');
  return { ...settings, ...config };
}

// Minimal req/res harness for express route handlers.
function call(
  router: import('express').Router,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = { method, url, headers: {}, body, query: queryOf(url) } as any;
    const res: any = {
      statusCode: 200,
      status(c: number) { this.statusCode = c; return this; },
      json(payload: unknown) { resolve({ status: this.statusCode, body: payload }); },
    };
    (router as any)(req, res, (err: unknown) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}
function queryOf(url: string): Record<string, string> {
  const q: Record<string, string> = {};
  const i = url.indexOf('?');
  if (i >= 0) for (const [k, v] of new URLSearchParams(url.slice(i))) q[k] = v;
  return q;
}

const validProfile = {
  name: 'Test User',
  enabled_sources: ['jobstash'],
};
const validRoles = {
  roles: [{ id: 'be', label: 'Backend', title_keywords: ['backend'], must_have_stack: ['node'] }],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jh-set-'));
  mkdirSync(join(dir, 'profile'), { recursive: true });
  process.env.PROFILE_DIR = join(dir, 'profile');
  process.env.CONFIG_DIR = join(dir, 'config');
  mkdirSync(join(dir, 'config'), { recursive: true });
});
afterEach(() => {
  delete process.env.PROFILE_DIR;
  delete process.env.CONFIG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('settings write surface', () => {
  test('fresh install: configured=false until BOTH profile and roles exist (live, no cache)', async () => {
    const { settingsRouter, buildConfigPayload } = await fresh();
    const router = settingsRouter();

    expect(buildConfigPayload().configured).toBe(false);

    // profile alone is not enough — the app needs roles to match
    const p = await call(router, 'PUT', '/profile', validProfile);
    expect(p.status).toBe(200);
    expect(existsSync(join(dir, 'profile', 'profile.yaml'))).toBe(true);
    expect(buildConfigPayload().configured).toBe(false);

    // add roles → now configured, picked up live (no restart)
    const ro = await call(router, 'PUT', '/roles', validRoles);
    expect(ro.status).toBe(200);
    expect(buildConfigPayload().configured).toBe(true);
  });

  test('invalid profile PUT is rejected and does NOT write the file', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    const r = await call(router, 'PUT', '/profile', { name: '' }); // missing enabled_sources, empty name
    expect(r.status).toBe(400);
    expect(r.body.issues.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'profile', 'profile.yaml'))).toBe(false);
  });

  test('roles PUT round-trips and GET reflects it', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    await call(router, 'PUT', '/roles', validRoles);
    const written = parse(readFileSync(join(dir, 'profile', 'roles.yaml'), 'utf8'));
    expect(written.roles[0].id).toBe('be');
    const snap = await call(router, 'GET', '/');
    expect(snap.body.roles.roles[0].label).toBe('Backend');
  });

  test('markdown rubric write/read', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    await call(router, 'PUT', '/rubric', { text: '# My Rubric\nrules' });
    const r = await call(router, 'GET', '/rubric');
    expect(r.body.text).toContain('My Rubric');
  });

  test('resume write requires resumes/ prefix and blocks traversal', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    const ok = await call(router, 'PUT', '/resume', { file: 'resumes/r.md', markdown: '# R' });
    expect(ok.status).toBe(200);
    expect(readFileSync(join(dir, 'profile', 'resumes', 'r.md'), 'utf8')).toBe('# R');

    const escape = await call(router, 'PUT', '/resume', { file: '../escape.md', markdown: 'x' });
    expect(escape.status).toBe(400);
    expect(existsSync(join(dir, 'escape.md'))).toBe(false);
  });

  test('GET /resume is boundary-guarded — cannot read profile.yaml outside resumes/', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    await call(router, 'PUT', '/profile', validProfile); // creates profile.yaml
    const leak = await call(router, 'GET', '/resume?file=profile.yaml');
    expect(leak.status).toBe(404); // not under resumes/ → refused
  });

  test('invalid roles PUT leaves an existing valid file untouched (atomic)', async () => {
    const { settingsRouter } = await fresh();
    const router = settingsRouter();
    await call(router, 'PUT', '/roles', validRoles);
    const before = readFileSync(join(dir, 'profile', 'roles.yaml'), 'utf8');
    const bad = await call(router, 'PUT', '/roles', { roles: [] }); // min(1) fails
    expect(bad.status).toBe(400);
    expect(readFileSync(join(dir, 'profile', 'roles.yaml'), 'utf8')).toBe(before);
  });
});
