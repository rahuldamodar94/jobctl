import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePersonioFeed } from './personio.js';
import { detectAts } from './detect.js';

const fixture = readFileSync(join(__dirname, '__fixtures__/personio.xml'), 'utf8');

describe('Personio adapter', () => {
  test('detectAts recognizes a {slug}.jobs.personio.com careers URL', () => {
    expect(detectAts('https://safe-labs.jobs.personio.com/')).toEqual({
      provider: 'personio',
      slug: 'safe-labs',
    });
    expect(detectAts('https://acme.jobs.personio.com/job/123')).toEqual({
      provider: 'personio',
      slug: 'acme',
    });
  });

  test('parses positions with concatenated multi-section JD (full JD inline)', () => {
    const jobs = parsePersonioFeed(fixture, 'safe-labs', 'Safe');
    expect(jobs).toHaveLength(2);

    const csm = jobs[0]!;
    expect(csm.externalId).toBe('2633465');
    expect(csm.sourceId).toBe('ats:personio');
    expect(csm.company).toBe('Safe');
    expect(csm.title).toBe('Customer Success Manager');
    expect(csm.location).toBe('Hybrid/New York');
    expect(csm.workMode).toBe('hybrid');
    expect(csm.url).toBe('https://safe-labs.jobs.personio.com/job/2633465');
    expect(csm.postedDate).toBe('2026-05-13');
    expect(csm.tags).toEqual(['Revenue']);
    // both jobDescription sections concatenated, HTML-stripped
    expect(csm.description).toContain('About the Role');
    expect(csm.description).toContain('conversion motion');
    expect(csm.description).toContain('What we offer');
    expect(csm.description).toContain('Equity');
    expect(csm.description).not.toContain('<strong>');
  });

  test('onsite office → onsite work mode', () => {
    const be = parsePersonioFeed(fixture, 'safe-labs', 'Safe')[1]!;
    expect(be.title).toBe('Backend Engineer');
    expect(be.location).toBe('Berlin');
    expect(be.workMode).toBe('onsite');
    expect(be.description).toContain('Build APIs in Go.');
  });
});
