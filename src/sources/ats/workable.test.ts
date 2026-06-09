import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkableJobs } from './workable.js';
import { detectAts } from './detect.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/workable.json'), 'utf8'));

describe('Workable adapter', () => {
  test('detectAts recognizes apply.workable.com and {slug}.workable.com', () => {
    expect(detectAts('https://apply.workable.com/walletconnect/')).toEqual({
      provider: 'workable',
      slug: 'walletconnect',
    });
    expect(detectAts('https://apply.workable.com/walletconnect')).toEqual({
      provider: 'workable',
      slug: 'walletconnect',
    });
    expect(detectAts('https://acme.workable.com/jobs')).toEqual({ provider: 'workable', slug: 'acme' });
  });

  test('parses jobs with full HTML JD inline (no N+1)', () => {
    const jobs = parseWorkableJobs(fixture, 'Acme');
    expect(jobs).toHaveLength(2); // empty-title row skipped

    const pm = jobs[0]!;
    expect(pm.externalId).toBe('2EB3D29E9B');
    expect(pm.sourceId).toBe('ats:workable');
    expect(pm.company).toBe('Acme');
    expect(pm.title).toBe('Product Manager - Merchant Experience');
    expect(pm.workMode).toBe('remote');
    // telecommuting + a primary country field → "Remote / United Kingdom"
    // (the primary city/state/country fields win over locations[] when present)
    expect(pm.location).toBe('Remote / United Kingdom');
    expect(pm.url).toBe('https://apply.workable.com/j/2EB3D29E9B');
    expect(pm.postedDate).toBe('2026-04-27');
    expect(pm.description).toContain('agentic');
    expect(pm.description).toContain('TypeScript');
    expect(pm.description).not.toContain('<strong>');
  });

  test('non-telecommuting job → city/country location, unknown work mode', () => {
    const be = parseWorkableJobs(fixture, 'Acme')[1]!;
    expect(be.title).toBe('Backend Engineer');
    expect(be.location).toBe('Berlin, Germany');
    expect(be.workMode).toBe('unknown');
    expect(be.description).toBe('Build APIs in Go.');
  });
});
