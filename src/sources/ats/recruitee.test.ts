import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRecruiteeJobs } from './recruitee.js';
import { detectAts } from './detect.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/recruitee.json'), 'utf8'));

describe('Recruitee adapter', () => {
  test('detectAts recognizes a recruitee careers URL → subdomain slug', () => {
    expect(detectAts('https://acme.recruitee.com/')).toEqual({ provider: 'recruitee', slug: 'acme' });
    expect(detectAts('https://my-co.recruitee.com/o/some-role')).toEqual({ provider: 'recruitee', slug: 'my-co' });
  });

  test('parses published offers with the full JD inline (no N+1)', () => {
    const jobs = parseRecruiteeJobs(fixture, 'Acme');
    expect(jobs).toHaveLength(2); // draft is filtered out

    const pm = jobs[0]!;
    expect(pm.externalId).toBe('2627754');
    expect(pm.sourceId).toBe('ats:recruitee');
    expect(pm.company).toBe('Acme');
    expect(pm.title).toBe('Senior Product Manager, AI & Agents');
    expect(pm.location).toBe('Remote / Amsterdam, Netherlands');
    expect(pm.workMode).toBe('remote');
    expect(pm.url).toBe('https://careers.tellent.com/o/senior-product-manager-ai-agents');
    expect(pm.postedDate).toBe('2026-06-04');
    expect(pm.tags).toEqual(['product']);
    // description is the full JD, HTML-stripped
    expect(pm.description).toContain('own the agentic roadmap');
    expect(pm.description).not.toContain('<strong>');
    expect(pm.description).toContain('TypeScript');
  });

  test('on-site job → city/country location + onsite work mode', () => {
    const be = parseRecruiteeJobs(fixture, 'Acme')[1]!;
    expect(be.location).toBe('Berlin, Germany');
    expect(be.workMode).toBe('onsite');
    expect(be.description).toBe('Build APIs in Go.');
  });
});
