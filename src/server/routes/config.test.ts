import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * /api/config payload: the UI's dropdown vocabulary (sources/categories) must
 * come from the user's config, never from hardcoded UI constants. Capability
 * flags (judgeEnabled, rubricExists, claudeAvailable) gate optional features.
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

test('payload reflects the user config: ats-expanded sources, category order', async () => {
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
  expect(payload.configured).toBe(true); // valid profile + 1 role
  expect(payload.rubricExists).toBe(false); // no judge-rubric.md in this temp profile
  expect(payload.sources).toEqual([
    'jobstash',
    'ats:greenhouse',
    'ats:lever',
    'ats:ashby',
    'ats:recruitee',
    'ats:workable',
    'ats:teamtailor',
    'ats:personio',
    'ats:breezy',
    'ats:pinpoint',
    'ats:smartrecruiters',
  ]);
  expect(payload.categories).toEqual(['gaming', 'web2', 'other']);
  expect(payload.roleTemplates).toEqual([]); // no role-templates.yaml in this temp config dir
  expect(typeof payload.resumeGeneration).toBe('boolean');
  // claude CLI detection surfaced for the AI/LLM Settings tab (mirrors resumeGeneration)
  expect(typeof payload.claudeAvailable).toBe('boolean');
  expect(payload.claudeAvailable).toBe(payload.resumeGeneration);
});

test('rubricExists flips true when profile/judge-rubric.md is present', async () => {
  writeFileSync(join(dir, 'profile', 'profile.yaml'), 'name: Test\nenabled_sources: [jobstash]\n');
  writeFileSync(
    join(dir, 'profile', 'roles.yaml'),
    'roles:\n  - id: be\n    label: Backend\n    title_keywords: [backend]\n    must_have_stack: [node]\n'
  );
  writeFileSync(join(dir, 'profile', 'judge-rubric.md'), '# Rubric\nprefer TS backend');
  const payload = (await freshBuild())();
  expect(payload.rubricExists).toBe(true);
});

test('unreadable config degrades to empty lists, never throws', async () => {
  // no profile files at all
  const payload = (await freshBuild())();
  expect(payload.configured).toBe(false);
  expect(payload.sources).toEqual([]);
  expect(payload.categories).toEqual([]);
});
