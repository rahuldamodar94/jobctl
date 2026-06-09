import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSmartRecruitersJobs, type SrPage } from './smartrecruiters.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/smartrecruiters.json'), 'utf8')) as SrPage;

describe('SmartRecruiters adapter', () => {
  const jobs = parseSmartRecruitersJobs(fixture.content ?? [], 'Wise', 'Wise');

  test('drops postings missing id/name; keeps the rest', () => {
    expect(jobs).toHaveLength(3); // the null-name row is filtered out
  });

  test('remote role: cleans the messy fullLocation + prefixes Remote, extracts salary, builds the human URL', () => {
    const j = jobs[0]!;
    expect(j.title).toBe('Senior Backend Engineer');
    expect(j.sourceId).toBe('ats:smartrecruiters');
    expect(j.company).toBe('Wise');
    expect(j.workMode).toBe('remote');
    // "London, , United Kingdom" → empty segment dropped, then Remote-prefixed
    expect(j.location).toBe('Remote / London, United Kingdom');
    expect(j.salaryText).toBe('£87500 - £111000 GBP Annual');
    expect(j.url).toBe('https://jobs.smartrecruiters.com/Wise/744000131103194');
    expect(j.externalId).toBe('744000131103194');
    expect(j.description).toBeNull(); // list has no JD
    expect(j.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // released timestamp → local ISO date
  });

  test('hybrid role: numeric id stringified, no salary', () => {
    const j = jobs[1]!;
    expect(j.workMode).toBe('hybrid');
    expect(j.location).toBe('Berlin, Germany');
    expect(j.externalId).toBe('744000999'); // numeric id → string
    expect(j.salaryText).toBeNull();
  });

  test('onsite role (no remote/hybrid flag) → unknown work mode; null released → null postedDate', () => {
    const j = jobs[2]!;
    expect(j.workMode).toBe('unknown');
    expect(j.location).toBe('Dubai, United Arab Emirates');
    expect(j.postedDate).toBeNull();
  });
});
