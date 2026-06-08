import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Registry + profile selection logic (WS2 restructure):
 * committed config/companies.yaml (domain-tagged) filtered by the profile's
 * companies.domains, minus excludes, plus personal includes.
 */

let dir: string;

function writeConfigs(profileCompanies: string) {
  mkdirSync(join(dir, 'config'), { recursive: true });
  mkdirSync(join(dir, 'profile'), { recursive: true });
  writeFileSync(
    join(dir, 'config', 'companies.yaml'),
    `companies:
  - name: Uniswap Labs
    careers_url: https://jobs.ashbyhq.com/uniswap
    domains: [web3, defi]
  - name: Vercel
    careers_url: https://boards.greenhouse.io/vercel
    domains: [ai, devtools]
  - name: Ziina
    careers_url: https://jobs.ashbyhq.com/ziina
    domains: [fintech]
  - name: Disabled Co
    careers_url: https://jobs.ashbyhq.com/disabled
    domains: [web3]
    enabled: false
`
  );
  writeFileSync(
    join(dir, 'profile', 'profile.yaml'),
    `name: Test
enabled_sources: [jobstash]
${profileCompanies}
`
  );
}

async function freshLoad() {
  // module caches PROFILE_DIR/CONFIG_DIR at import — reset registry per test
  vi.resetModules();
  return import('./load.js');
}

describe('loadCompanies registry selection', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jh-test-'));
    process.env.PROFILE_DIR = join(dir, 'profile');
    process.env.CONFIG_DIR = join(dir, 'config');
  });
  afterEach(() => {
    delete process.env.PROFILE_DIR;
    delete process.env.CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test('domains select matching registry slices; enabled:false skipped', async () => {
    writeConfigs(`companies:
  domains: [web3, fintech]`);
    const { loadCompanies } = await freshLoad();
    expect(loadCompanies().map((c: { name: string }) => c.name).sort()).toEqual(['Uniswap Labs', 'Ziina']);
  });

  test('exclude removes registry entries; include adds personal ones', async () => {
    writeConfigs(`companies:
  domains: [web3, ai]
  exclude: [Vercel]
  include:
    - name: My Startup
      careers_url: https://jobs.ashbyhq.com/mystartup`);
    const { loadCompanies } = await freshLoad();
    expect(loadCompanies().map((c: { name: string }) => c.name).sort()).toEqual(['My Startup', 'Uniswap Labs']);
  });

  test('no companies block → empty selection (ats source becomes a no-op)', async () => {
    writeConfigs('');
    const { loadCompanies } = await freshLoad();
    expect(loadCompanies()).toEqual([]);
  });
});

describe('loadCategories schema (user-extendable taxonomy)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jh-test-'));
    process.env.PROFILE_DIR = join(dir, 'profile');
    process.env.CONFIG_DIR = join(dir, 'config');
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'profile'), { recursive: true });
  });
  afterEach(() => {
    delete process.env.PROFILE_DIR;
    delete process.env.CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test('custom categories load; fallback defaults to other', async () => {
    writeFileSync(
      join(dir, 'config', 'categories.yaml'),
      'order: [gaming, healthcare]\nkeywords:\n  gaming: [Unity]\n'
    );
    const { loadCategories } = await freshLoad();
    const c = loadCategories();
    expect(c.order).toEqual(['gaming', 'healthcare']);
    expect(c.fallback).toBe('other');
    expect(c.keywords.gaming).toEqual(['unity']); // lowercased once at load
  });

  test('keywords key not listed in order fails fast (typo guard)', async () => {
    writeFileSync(
      join(dir, 'config', 'categories.yaml'),
      'order: [gaming]\nkeywords:\n  gamign: [unity]\n'
    );
    const { loadCategories } = await freshLoad();
    expect(() => loadCategories()).toThrow(/gamign.*not listed in order/);
  });

  test('fallback outside order fails fast', async () => {
    writeFileSync(
      join(dir, 'config', 'categories.yaml'),
      'order: [gaming]\nfallback: webtwo\nkeywords:\n  gaming: [unity]\n'
    );
    const { loadCategories } = await freshLoad();
    expect(() => loadCategories()).toThrow(/fallback 'webtwo' is not listed in order/);
  });
});
