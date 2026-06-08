import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Location preference is PROFILE-level (one job seeker, one preference) — the
 *  scraper injects it into every role. These pin that config contract. */
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jh-loc-'));
  mkdirSync(join(dir, 'profile'), { recursive: true });
  mkdirSync(join(dir, 'config'), { recursive: true });
  process.env.PROFILE_DIR = join(dir, 'profile');
  process.env.CONFIG_DIR = join(dir, 'config');
});
afterEach(() => {
  delete process.env.PROFILE_DIR;
  delete process.env.CONFIG_DIR;
  rmSync(dir, { recursive: true, force: true });
});
const fresh = async () => {
  vi.resetModules(); // module caches PROFILE_DIR at import
  return import('./load.js');
};

describe('location is profile-level', () => {
  test('loadProfile reads geo_priority / geo_relocation_ok (lowercased)', async () => {
    writeFileSync(
      join(dir, 'profile', 'profile.yaml'),
      'name: T\nenabled_sources: [ats]\ngeo_priority: [Remote, Berlin]\ngeo_relocation_ok: [London]\n'
    );
    const { loadProfile } = await fresh();
    const p = loadProfile();
    expect(p.geoPriority).toEqual(['remote', 'berlin']);
    expect(p.geoRelocationOk).toEqual(['london']);
  });

  test('loadProfile defaults to no location preference', async () => {
    writeFileSync(join(dir, 'profile', 'profile.yaml'), 'name: T\nenabled_sources: [ats]\n');
    const { loadProfile } = await fresh();
    expect(loadProfile().geoPriority).toEqual([]);
  });

  test('loadRoles carries no per-role geo (legacy geo_* keys ignored)', async () => {
    writeFileSync(
      join(dir, 'profile', 'roles.yaml'),
      'roles:\n  - id: be\n    label: Backend\n    title_keywords: [backend]\n    must_have_stack: [node]\n    geo_priority: [berlin]\n'
    );
    const { loadRoles } = await fresh();
    const r = loadRoles()[0]!;
    expect(r.geoPriority).toEqual([]);
    expect(r.geoRelocationOk).toEqual([]);
  });
});
