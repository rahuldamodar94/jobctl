import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePinpointJobs } from './pinpoint.js';
import { detectAts } from './detect.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/pinpoint.json'), 'utf8'));

describe('Pinpoint adapter', () => {
  test('detectAts recognizes a {slug}.pinpointhq.com careers URL', () => {
    expect(detectAts('https://tabby.pinpointhq.com/')).toEqual({ provider: 'pinpoint', slug: 'tabby' });
    expect(detectAts('https://acme.pinpointhq.com/en/postings/x')).toEqual({
      provider: 'pinpoint',
      slug: 'acme',
    });
  });

  test('parses postings with concatenated JD sections + salary inline', () => {
    const jobs = parsePinpointJobs(fixture, 'Tabby');
    expect(jobs).toHaveLength(2); // empty-title row skipped

    const csr = jobs[0]!;
    expect(csr.externalId).toBe('196855');
    expect(csr.sourceId).toBe('ats:pinpoint');
    expect(csr.company).toBe('Tabby');
    expect(csr.title).toBe('Customer Support Representative');
    expect(csr.workMode).toBe('onsite');
    expect(csr.location).toBe('Cairo, Cairo, Egypt');
    expect(csr.url).toContain('tabby.pinpointhq.com');
    expect(csr.salaryText).toBe('ر.س6,000 - ر.س7,500 / month');
    expect(csr.postedDate).toBeNull(); // no publish date in payload
    // JD concatenates description + key_responsibilities + skills + benefits
    expect(csr.description).toContain('Help customers');
    expect(csr.description).toContain('Key Responsibilities');
    expect(csr.description).toContain('Answer tickets');
    expect(csr.description).toContain('Skills, Knowledge & Expertise');
    expect(csr.description).toContain('Arabic');
    expect(csr.description).toContain('Benefits');
    expect(csr.description).not.toContain('<strong>');
  });

  test('remote job + hidden compensation → no salary, remote work mode', () => {
    const eng = parsePinpointJobs(fixture, 'Tabby')[1]!;
    expect(eng.title).toBe('Senior Backend Engineer');
    expect(eng.workMode).toBe('remote');
    expect(eng.salaryText).toBeNull(); // compensation_visible: false
    expect(eng.location).toBe('Dubai, United Arab Emirates');
  });
});
