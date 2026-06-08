import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCryptocurrencyJobsPage } from './cryptocurrencyjobs.js';
import { parseBlockchainHeadhunterPage } from './blockchainheadhunter.js';
import { parseRemotiveJobs } from './remotive.js';
import { parseRemoteOkJobs } from './remoteok.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const read = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('parseCryptocurrencyJobsPage', () => {
  const jobs = parseCryptocurrencyJobsPage(read('cryptocurrencyjobs.html'), 'https://cryptocurrencyjobs.co');

  test('extracts title/company/url from SSR markup', () => {
    expect(jobs.length).toBeGreaterThan(10);
    const cow = jobs.find((j) => j.url.includes('cow-dao-integration-engineer'))!;
    expect(cow.title).toBe('Integration Engineer');
    expect(cow.company).toBe('CoW DAO');
    expect(cow.url).toBe('https://cryptocurrencyjobs.co/engineering/cow-dao-integration-engineer/');
  });

  test('captures location and tags when present', () => {
    const cow = jobs.find((j) => j.url.includes('cow-dao-integration-engineer'))!;
    expect(cow.location).toContain('Remote');
    expect(cow.tags.map((t) => t.toLowerCase())).toContain('defi');
  });

  test('no duplicates', () => {
    const urls = jobs.map((j) => j.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test('location is never a category/tag word', () => {
    // regression: "Engineering"/"DeFi"/"Full-Time" must not be mistaken for a location
    for (const j of jobs) {
      if (j.location) {
        expect(['engineering', 'defi', 'full-time', 'contract', 'marketing', 'design']).not.toContain(
          j.location.toLowerCase()
        );
      }
    }
  });
});

describe('parseBlockchainHeadhunterPage', () => {
  const jobs = parseBlockchainHeadhunterPage(read('blockchainheadhunter.html'), 'https://blockchainheadhunter.com');

  test('extracts active jobs from Astro-serialized state', () => {
    expect(jobs.length).toBeGreaterThan(3);
    const lead = jobs.find((j) => j.title === 'Senior Engineering Lead, Developer Platform')!;
    expect(lead.company).toBe('Web3 verification layer');
    expect(lead.location).toBe('Remote');
    expect(lead.url).toBe('https://blockchainheadhunter.com/jobs/Engineering-Lead-Developer-Platform');
  });

  test('salary text captured', () => {
    const lead = jobs.find((j) => j.title === 'Senior Engineering Lead, Developer Platform')!;
    expect(lead.salaryText).toContain('150-200k');
  });

  test('non-active jobs (filled/hold) are excluded', () => {
    expect(jobs.find((j) => j.url.includes('Institutional-Sales-Crypto-Lending'))).toBeUndefined();
    expect(jobs.find((j) => j.title === 'Frontend Engineer')).toBeUndefined(); // state: filled
  });
});

describe('graceful degradation on changed/unrelated pages (reviewer gap)', () => {
  const unrelated = '<html><body><nav><a href="/about">About</a></nav><h2><a href="/blog/post">Post</a></h2></body></html>';

  test('cryptocurrencyjobs returns 0 (not garbage, not throw) on unrelated HTML', () => {
    expect(parseCryptocurrencyJobsPage(unrelated, 'https://cryptocurrencyjobs.co')).toEqual([]);
  });

  test('blockchainheadhunter returns 0 on unrelated HTML', () => {
    expect(parseBlockchainHeadhunterPage(unrelated, 'https://blockchainheadhunter.com')).toEqual([]);
  });

  test('cryptocurrencyjobs never leaks nav/footer links as jobs', () => {
    const jobs = parseCryptocurrencyJobsPage(read('cryptocurrencyjobs.html'), 'https://cryptocurrencyjobs.co');
    for (const j of jobs) {
      expect(j.url).toMatch(/cryptocurrencyjobs\.co\/[a-z-]+\/[a-z0-9-]+\/$/);
      expect(j.company).not.toBe('');
    }
  });
});

describe('parseRemotiveJobs', () => {
  const jobs = parseRemotiveJobs(JSON.parse(read('remotive.json')));
  test('maps fields', () => {
    expect(jobs.length).toBe(3);
    expect(jobs[0]!.company).toBe('TELUS Digital');
    expect(jobs[0]!.location).toBe('Canada');
    expect(jobs[0]!.url).toMatch(/^https?:\/\//);
    expect(jobs[0]!.postedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(jobs[0]!.workMode).toBe('remote');
  });
});

describe('parseRemoteOkJobs', () => {
  const jobs = parseRemoteOkJobs(JSON.parse(read('remoteok.json')));
  test('skips the legal-notice item and maps fields', () => {
    expect(jobs.length).toBe(3);
    expect(jobs[0]!.company).toBeTruthy();
    expect(jobs[0]!.title).toBeTruthy();
    expect(jobs[0]!.workMode).toBe('remote');
  });
});
