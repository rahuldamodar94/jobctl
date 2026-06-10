import { describe, expect, test } from 'vitest';
import { buildProfilePrompt } from './prompt.js';
import { parseProfileDraft } from './parse.js';

const DOMAINS = [
  { id: 'fintech', label: 'Fintech', description: 'payments' },
  { id: 'crypto', label: 'Crypto', description: 'web3' },
  { id: 'saas', label: 'SaaS', description: '' },
];

describe('buildProfilePrompt', () => {
  const base = {
    resume: 'RESUME',
    domains: DOMAINS,
    currentDomains: ['saas'],
    currentGeoPriority: ['Remote'],
    currentGeoRelocation: [],
  };

  test('lists the valid domain vocabulary and demands a JSON object', () => {
    const p = buildProfilePrompt(base);
    expect(p).toContain('RESUME');
    expect(p).toContain('fintech: Fintech');
    expect(p).toMatch(/Return ONLY a JSON object/);
    expect(p).toContain('geo_priority');
  });

  test('refinement block only appears with an instruction', () => {
    expect(buildProfilePrompt(base)).not.toContain('REVISION INSTRUCTION');
    expect(buildProfilePrompt({ ...base, instruction: 'remote only' })).toContain('remote only');
  });
});

describe('parseProfileDraft', () => {
  const ids = DOMAINS.map((d) => d.id);

  test('keeps valid domains, drops unknown ids, trims + de-dupes geo', () => {
    const raw = JSON.stringify({
      domains: ['fintech', 'crypto', 'nonsense'],
      geo_priority: ['Remote', ' Remote ', 'Dubai'],
      geo_relocation_ok: ['London'],
    });
    const r = parseProfileDraft(raw, ids);
    expect(r.domains).toEqual(['fintech', 'crypto']);
    expect(r.geo_priority).toEqual(['Remote', 'Dubai']);
    expect(r.geo_relocation_ok).toEqual(['London']);
  });

  test('accepts code fences + chatter', () => {
    const raw = 'sure:\n```json\n' + JSON.stringify({ domains: ['saas'], geo_priority: [], geo_relocation_ok: [] }) + '\n```';
    expect(parseProfileDraft(raw, ids).domains).toEqual(['saas']);
  });

  test('throws when no valid domain is present', () => {
    expect(() => parseProfileDraft(JSON.stringify({ domains: ['nope'] }), ids)).toThrow(/no valid domains/);
  });

  test('throws on output with no JSON', () => {
    expect(() => parseProfileDraft('refused', ids)).toThrow(/no JSON/);
  });

  test('defaults the missing geo arrays', () => {
    const r = parseProfileDraft(JSON.stringify({ domains: ['saas'] }), ids);
    expect(r.geo_priority).toEqual([]);
    expect(r.geo_relocation_ok).toEqual([]);
  });
});
