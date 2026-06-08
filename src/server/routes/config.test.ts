import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * /api/config payload: the UI's dropdown vocabulary (roles/sources/categories)
 * must come from the user's config, never from hardcoded UI constants.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jh-cfg-'));
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

async function freshBuild() {
  vi.resetModules(); // load.ts caches PROFILE_DIR/CONFIG_DIR at import
  const { buildConfigPayload } = await import('./config.js');
  return buildConfigPayload;
}

test('payload reflects the user config: roles, ats-expanded sources, category order', async () => {
  writeFileSync(
    join(dir, 'profile', 'profile.yaml'),
    'name: Test\nenabled_sources: [jobstash, ats]\n'
  );
  writeFileSync(
    join(dir, 'profile', 'roles.yaml'),
    `roles:
  - id: gameplay_programmer
    label: Gameplay Programmer
    title_keywords: [gameplay]
    must_have_stack: [c++]
`
  );
  writeFileSync(
    join(dir, 'config', 'categories.yaml'),
    'order: [gaming, web2, other]\nkeywords:\n  gaming: [unity, unreal]\n'
  );

  const payload = (await freshBuild())();
  expect(payload.roles).toEqual([{ id: 'gameplay_programmer', label: 'Gameplay Programmer', lane: 'ic' }]);
  expect(payload.sources).toEqual(['jobstash', 'ats:greenhouse', 'ats:lever', 'ats:ashby', 'ats:recruitee']);
  expect(payload.categories).toEqual(['gaming', 'web2', 'other']);
  expect(payload.roleTemplates).toEqual([]); // no role-templates.yaml in this temp config dir
  expect(typeof payload.resumeGeneration).toBe('boolean');
});

test('excluded categories are dropped from the dropdown vocabulary', async () => {
  writeFileSync(
    join(dir, 'profile', 'profile.yaml'),
    'name: Test\nenabled_sources: [jobstash]\nexclude_categories: [ai]\n'
  );
  writeFileSync(
    join(dir, 'profile', 'roles.yaml'),
    'roles:\n  - id: be\n    label: Backend\n    title_keywords: [backend]\n    must_have_stack: [node]\n'
  );
  writeFileSync(
    join(dir, 'config', 'categories.yaml'),
    'order: [ai, web3, web2]\nkeywords:\n  ai: [llm]\n  web3: [crypto]\n'
  );
  const payload = (await freshBuild())();
  expect(payload.categories).toEqual(['web3', 'web2']); // ai excluded
});

test('unreadable config degrades to empty lists, never throws', async () => {
  // no profile files at all
  const payload = (await freshBuild())();
  expect(payload.roles).toEqual([]);
  expect(payload.sources).toEqual([]);
  expect(payload.categories).toEqual([]);
});
