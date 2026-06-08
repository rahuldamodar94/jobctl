import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJobstashPage } from './jobstash.js';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'jobstash.json'), 'utf8')
);

describe('parseJobstashPage', () => {
  const jobs = parseJobstashPage(fixture);

  test('parses all jobs with company from organization.name', () => {
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.company).toBe('Robinhood Markets, Inc.');
    expect(jobs[0]!.title).toBe('Software Engineer');
  });

  test('builds description from summary+description+requirements+responsibilities', () => {
    expect(jobs[0]!.description).toContain('scalability');
    expect(jobs[0]!.description!.length).toBeGreaterThan(300);
  });

  test('location falls back to locationType when missing', () => {
    const m0 = jobs.find((j) => j.company === 'M0')!;
    expect(m0.location).toBe('Remote, USA');
    const drift = jobs.find((j) => j.company === 'Drift')!;
    expect(drift.location).toBe(null);
  });

  test('workMode derived from locationType', () => {
    expect(jobs[0]!.workMode).toBe('hybrid');
    expect(jobs.find((j) => j.company === 'M0')!.workMode).toBe('remote');
  });

  test('timestamp (epoch ms) → ISO postedDate', () => {
    expect(jobs[0]!.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('salary formatted when present', () => {
    expect(jobs[0]!.salaryText).toContain('161');
  });

  test('tags extracted as names', () => {
    expect(jobs[0]!.tags).toContain('trading');
  });

  test('url and externalId present', () => {
    expect(jobs[0]!.url).toMatch(/^https?:\/\//);
    expect(jobs[0]!.externalId).toBeTruthy();
  });
});
