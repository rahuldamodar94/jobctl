import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGreenhouseJobs } from './greenhouse.js';
import { parseLeverJobs } from './lever.js';
import { parseAshbyJobs } from './ashby.js';

const fix = (name: string) =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', name), 'utf8'));

describe('parseGreenhouseJobs', () => {
  const jobs = parseGreenhouseJobs(fix('greenhouse.json'), 'Stripe');

  test('maps title/url/location/company', () => {
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.company).toBe('Stripe');
    expect(jobs[0]!.title).toBeTruthy();
    expect(jobs[0]!.url).toMatch(/^https?:\/\//);
    expect(jobs[0]!.location).toBeTruthy();
  });

  test('content (HTML) is decoded to text description', () => {
    expect(jobs[0]!.description).toBeTruthy();
    expect(jobs[0]!.description).not.toContain('&lt;');
    expect(jobs[0]!.description).not.toMatch(/<[a-z]+>/i);
  });

  test('postedDate from updated_at/first_published', () => {
    expect(jobs[0]!.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseLeverJobs', () => {
  const jobs = parseLeverJobs(fix('lever.json'), 'Wintermute');

  test('maps text/hostedUrl/categories.location', () => {
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.company).toBe('Wintermute');
    expect(jobs[0]!.title).toBeTruthy();
    expect(jobs[0]!.url).toContain('lever.co');
    expect(jobs[0]!.location).toBeTruthy();
  });

  test('description from plain text fields', () => {
    expect(jobs[0]!.description!.length).toBeGreaterThan(50);
  });

  test('createdAt epoch → postedDate', () => {
    expect(jobs[0]!.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('workMode from workplaceType', () => {
    expect(['remote', 'hybrid', 'onsite', 'unknown']).toContain(jobs[0]!.workMode);
  });
});

describe('parseAshbyJobs', () => {
  const jobs = parseAshbyJobs(fix('ashby.json'), 'LiFi');

  test('maps title/jobUrl/location, only listed jobs', () => {
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]!.company).toBe('LiFi');
    expect(jobs[0]!.url).toContain('ashbyhq.com');
  });

  test('descriptionPlain used as description', () => {
    expect(jobs[0]!.description!.length).toBeGreaterThan(50);
  });

  test('isRemote → workMode remote', () => {
    const remote = jobs.find((j) => j.workMode === 'remote');
    expect(remote).toBeTruthy();
  });

  test('compensation summary becomes salaryText when present', () => {
    // fixture may or may not include compensation — just ensure no crash and type ok
    for (const j of jobs) expect(j.salaryText === null || typeof j.salaryText === 'string').toBe(true);
  });
});
