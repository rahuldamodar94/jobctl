import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTeamtailorFeed } from './teamtailor.js';
import { detectAts } from './detect.js';

const fixture = readFileSync(join(__dirname, '__fixtures__/teamtailor.rss'), 'utf8');

describe('Teamtailor adapter', () => {
  test('detectAts captures the WHOLE subdomain incl. a region label', () => {
    expect(detectAts('https://crossmint.na.teamtailor.com/jobs')).toEqual({
      provider: 'teamtailor',
      slug: 'crossmint.na',
    });
    expect(detectAts('https://acme.teamtailor.com/')).toEqual({ provider: 'teamtailor', slug: 'acme' });
  });

  test('parses RSS items with the full HTML JD inline (no N+1)', () => {
    const jobs = parseTeamtailorFeed(fixture, 'Crossmint');
    expect(jobs).toHaveLength(2);

    const fs = jobs[0]!;
    expect(fs.externalId).toBe('23017354-9c3a-4773-aa44-bdeb8b536e71');
    expect(fs.sourceId).toBe('ats:teamtailor');
    expect(fs.company).toBe('Crossmint');
    expect(fs.title).toBe('Full-stack Engineer - Payments (Spain)');
    expect(fs.workMode).toBe('hybrid');
    expect(fs.location).toBe('Madrid, Spain');
    expect(fs.url).toBe('https://crossmint.na.teamtailor.com/jobs/110042-full-stack-engineer-payments-spain');
    expect(fs.postedDate).toBe('2025-02-18');
    expect(fs.description).toContain('stablecoin');
    expect(fs.description).toContain('TypeScript');
    expect(fs.description).not.toContain('<strong>');
  });

  test('remoteStatus "fully" → remote work mode + Remote-prefixed location', () => {
    const remote = parseTeamtailorFeed(fixture, 'Crossmint')[1]!;
    expect(remote.workMode).toBe('remote');
    // degenerate "United Kingdom/United Kingdom" collapses to one country
    expect(remote.location).toBe('Remote / United Kingdom');
    expect(remote.description).toContain('Rust');
  });
});
