import { describe, expect, test } from 'vitest';
import { dedupeKey, findFuzzyMatch, type DedupeCandidate } from './dedupe.js';

describe('dedupeKey', () => {
  test('same job, different boards, location-string variants → same key', () => {
    const a = dedupeKey('Plasma', 'Senior/Staff Backend Payments Engineer', 'Remote (London office option)');
    const b = dedupeKey('Plasma', 'Senior/Staff Backend Payments Engineer', 'Remote — EMEA');
    expect(a).toBe(b);
  });

  test('seniority abbreviation variants → same key', () => {
    const a = dedupeKey('Ether.fi', 'Sr. Backend Engineer', 'Remote');
    const b = dedupeKey('ether.fi', 'Senior Backend Engineer', 'Remote');
    expect(a).toBe(b);
  });

  test('same title in two real cities → DIFFERENT keys', () => {
    const dubai = dedupeKey('Acme', 'Senior Backend Engineer', 'Dubai, UAE');
    const london = dedupeKey('Acme', 'Senior Backend Engineer', 'London, UK');
    expect(dubai).not.toBe(london);
  });
});

describe('findFuzzyMatch', () => {
  const seeded: DedupeCandidate = {
    id: 1,
    normCompany: 'etherfi',
    title: 'Senior Backend Engineer',
    geoBucket: 'unknown', // hand-typed seed row had no location
    status: 'applied',
  };

  test('ACCEPTANCE: scraped variant matches hand-typed triaged seed row regardless of location', () => {
    const match = findFuzzyMatch(
      { normCompany: 'etherfi', title: 'Sr. Backend Eng', geoBucket: 'remote' },
      [seeded]
    );
    expect(match?.id).toBe(1);
  });

  test('triaged row matches even with extra title tokens', () => {
    const match = findFuzzyMatch(
      { normCompany: 'etherfi', title: 'Senior Backend Engineer, Infrastructure', geoBucket: 'remote' },
      [seeded]
    );
    expect(match?.id).toBe(1);
  });

  test('different role at same company does NOT match', () => {
    const match = findFuzzyMatch(
      { normCompany: 'etherfi', title: 'Senior Frontend Engineer', geoBucket: 'remote' },
      [seeded]
    );
    expect(match).toBeNull();
  });

  test('a regional suffix must not merge DIFFERENT roles (Trigger.dev Backend vs SRE, both "(Europe)")', () => {
    // Regression: "europe" was missing from the geo stopwords, so the shared
    // location token pushed overlap to 2 ([engineer, europe]) and these two
    // genuinely-different roles merged into one row — hiding the Backend role.
    const sreRow: DedupeCandidate = {
      id: 20,
      normCompany: 'triggerdev',
      title: 'Senior Site Reliability Engineer (Europe)',
      geoBucket: 'europe',
      status: 'new',
    };
    const match = findFuzzyMatch(
      { normCompany: 'triggerdev', title: 'Senior Backend Engineer (Europe)', geoBucket: 'europe' },
      [sreRow]
    );
    expect(match).toBeNull();
  });

  test('but the SAME role with a regional suffix still merges across boards', () => {
    const row: DedupeCandidate = {
      id: 21,
      normCompany: 'triggerdev',
      title: 'Senior Backend Engineer - Europe',
      geoBucket: 'europe',
      status: 'new',
    };
    const match = findFuzzyMatch(
      { normCompany: 'triggerdev', title: 'Backend Engineer (Europe)', geoBucket: 'europe' },
      [row]
    );
    expect(match?.id).toBe(21);
  });

  test('new-vs-new requires geo compatibility: Dubai vs London stay distinct', () => {
    const dubaiRow: DedupeCandidate = {
      id: 2,
      normCompany: 'acme',
      title: 'Senior Backend Engineer',
      geoBucket: 'dubai',
      status: 'new',
    };
    const match = findFuzzyMatch(
      { normCompany: 'acme', title: 'Senior Backend Engineer', geoBucket: 'london' },
      [dubaiRow]
    );
    expect(match).toBeNull();
  });

  test('new-vs-new merges when one side is remote', () => {
    const remoteRow: DedupeCandidate = {
      id: 3,
      normCompany: 'acme',
      title: 'Senior Backend Engineer',
      geoBucket: 'remote',
      status: 'new',
    };
    const match = findFuzzyMatch(
      { normCompany: 'acme', title: 'Sr Backend Engineer', geoBucket: 'london' },
      [remoteRow]
    );
    expect(match?.id).toBe(3);
  });

  test('company-name variants (legal suffixes) fuzzy-match: Tether vs Tether Operations', () => {
    const seededTether: DedupeCandidate = {
      id: 11,
      normCompany: 'tether',
      title: 'Staff Node.js Engineer',
      geoBucket: 'unknown',
      status: 'interested',
    };
    const match = findFuzzyMatch(
      { normCompany: 'tether operations', title: 'Staff Node.js Engineer (100% Remote)', geoBucket: 'remote' },
      [seededTether]
    );
    expect(match?.id).toBe(11);
  });

  test('shared word mid-name does NOT match: Modern Treasury vs Treasury Prime', () => {
    const row: DedupeCandidate = {
      id: 12,
      normCompany: 'modern treasury',
      title: 'Software Engineer',
      geoBucket: 'remote',
      status: 'new',
    };
    const match = findFuzzyMatch(
      { normCompany: 'treasury prime', title: 'Software Engineer', geoBucket: 'remote' },
      [row]
    );
    expect(match).toBeNull();
  });

  test('different company never matches', () => {
    const match = findFuzzyMatch(
      { normCompany: 'othercorp', title: 'Senior Backend Engineer', geoBucket: 'remote' },
      [seeded]
    );
    expect(match).toBeNull();
  });

  test('short titles (1 core token) require exact core-token equality', () => {
    const row: DedupeCandidate = {
      id: 4,
      normCompany: 'acme',
      title: 'Engineering Manager',
      geoBucket: 'remote',
      status: 'applied',
    };
    expect(
      findFuzzyMatch({ normCompany: 'acme', title: 'Engineering Manager', geoBucket: 'remote' }, [row])?.id
    ).toBe(4);
    expect(
      findFuzzyMatch({ normCompany: 'acme', title: 'Product Manager', geoBucket: 'remote' }, [row])
    ).toBeNull();
  });
});
