import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWeb3CareerPage } from './web3career.js';

const NOW = new Date('2026-06-06T12:00:00Z');
const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'web3career.html'),
  'utf8'
);

describe('parseWeb3CareerPage', () => {
  const jobs = parseWeb3CareerPage(html, 'https://web3.career', NOW);

  test('extracts job rows, skipping sponsor banners', () => {
    expect(jobs.length).toBeGreaterThanOrEqual(15);
    for (const j of jobs) {
      expect(j.title).toBeTruthy();
      expect(j.company).toBeTruthy();
      expect(j.url).toMatch(/^https:\/\/web3\.career\//);
    }
  });

  test('parses the known Tether row correctly', () => {
    const tether = jobs.find((j) => j.externalId === '105878')!;
    expect(tether.title).toBe('Technical Lead - Wallets (100% remote)');
    expect(tether.company).toBe('Tether');
    expect(tether.location).toBe('Remote');
    expect(tether.tags).toContain('backend');
  });

  test('relative time converted to absolute ISO date', () => {
    const tether = jobs.find((j) => j.externalId === '105878')!;
    expect(tether.postedDate).toBe('2026-06-06'); // "1h" relative to NOW
  });

  test('no duplicate externalIds', () => {
    const ids = jobs.map((j) => j.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
