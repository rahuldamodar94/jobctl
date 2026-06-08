import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHimalayasJobs } from './himalayas.js';

const NOW = new Date('2026-07-01T12:00:00Z');
const payload = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'himalayas.json'), 'utf8')
);

describe('parseHimalayasJobs', () => {
  const jobs = parseHimalayasJobs(payload, NOW);

  test('drops listings without an application link / guid', () => {
    expect(jobs).toHaveLength(2); // the "Ghost Listing" is skipped
    expect(jobs.find((j) => j.company === 'Initech')).toBeUndefined();
  });

  test('maps a full job with salary, location and inline JD', () => {
    const pm = jobs[0]!;
    expect(pm.sourceId).toBe('himalayas');
    expect(pm.company).toBe('Jerry');
    expect(pm.title).toBe('Senior Product Manager, AI Agents');
    expect(pm.location).toBe('Canada, United States');
    expect(pm.workMode).toBe('remote');
    expect(pm.salaryText).toBe('160,000–200,000 USD');
    expect(pm.url).toBe('https://himalayas.app/companies/jerry/jobs/senior-pm-ai-3120228057');
    expect(pm.externalId).toBe('https://himalayas.app/companies/jerry/jobs/senior-pm-ai-3120228057');
    expect(pm.postedDate).toBe('2025-06-01'); // epoch seconds → ISO
    // description is the full JD, HTML-stripped
    expect(pm.description).toContain('first super app');
    expect(pm.description).toContain('TypeScript');
    expect(pm.description).not.toContain('<strong>');
  });

  test('no location restrictions → Remote, no salary → null', () => {
    const be = jobs[1]!;
    expect(be.company).toBe('Globex');
    expect(be.location).toBe('Remote');
    expect(be.salaryText).toBeNull();
    expect(be.workMode).toBe('remote');
  });
});
