import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBreezyJobs } from './breezy.js';
import { detectAts } from './detect.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/breezy.json'), 'utf8'));

describe('Breezy adapter', () => {
  test('detectAts recognizes a {slug}.breezy.hr careers URL', () => {
    expect(detectAts('https://zero-hash.breezy.hr/')).toEqual({ provider: 'breezy', slug: 'zero-hash' });
    expect(detectAts('https://acme.breezy.hr/p/some-role')).toEqual({ provider: 'breezy', slug: 'acme' });
  });

  test('parses list (no JD body — title+location for the short-JD path)', () => {
    const jobs = parseBreezyJobs(fixture, 'Zero Hash');
    expect(jobs).toHaveLength(2); // empty-name row skipped

    const counsel = jobs[0]!;
    expect(counsel.externalId).toBe('0af807f96bbb-associate-counsel');
    expect(counsel.sourceId).toBe('ats:breezy');
    expect(counsel.company).toBe('Zero Hash');
    expect(counsel.title).toBe('Associate Counsel');
    expect(counsel.workMode).toBe('remote');
    expect(counsel.location).toBe('Remote / Chicago, Illinois, United States');
    expect(counsel.url).toBe('https://zero-hash.breezy.hr/p/0af807f96bbb-associate-counsel');
    expect(counsel.postedDate).toBe('2026-05-20');
    expect(counsel.tags).toEqual(['Full-Time']);
    expect(counsel.description).toBeNull();
  });

  test('non-remote job → onsite work mode + city/country location', () => {
    const be = parseBreezyJobs(fixture, 'Zero Hash')[1]!;
    expect(be.title).toBe('Backend Engineer');
    expect(be.workMode).toBe('onsite');
    expect(be.location).toBe('Singapore, Singapore');
  });
});
