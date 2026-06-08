import { describe, expect, test } from 'vitest';
import { normCompany, normTitle, coreTitleTokens } from './normalize.js';

describe('normCompany', () => {
  test('lowercases and strips punctuation/whitespace', () => {
    expect(normCompany('Ether.fi')).toBe('etherfi');
    expect(normCompany('ether.fi ')).toBe('etherfi');
    expect(normCompany('0x / Matcha')).toBe('0x matcha');
  });

  test('strips common legal suffixes', () => {
    expect(normCompany('Tether Operations Limited')).toBe('tether operations');
    expect(normCompany('Zero Hash LLC')).toBe('zero hash');
    expect(normCompany('Polygon Labs Inc.')).toBe('polygon labs');
  });
});

describe('normTitle', () => {
  test('collapses seniority synonyms', () => {
    expect(normTitle('Sr. Backend Engineer')).toBe('senior backend engineer');
    expect(normTitle('Sr Backend Eng')).toBe('senior backend engineer');
    expect(normTitle('Senior Backend Engineer')).toBe('senior backend engineer');
  });

  test('strips punctuation and collapses spaces', () => {
    expect(normTitle('Senior/Staff Backend — Payments  Engineer')).toBe(
      'senior staff backend payments engineer'
    );
  });
});

describe('coreTitleTokens', () => {
  test('drops seniority/stopwords, keeps role-defining tokens', () => {
    expect(coreTitleTokens('Senior Backend Engineer')).toEqual(['backend', 'engineer']);
    expect(coreTitleTokens('Sr. Backend Eng, Earn Data Team')).toEqual([
      'backend',
      'engineer',
      'earn',
      'data',
    ]);
  });

  test('drops location-ish and remote tokens', () => {
    expect(coreTitleTokens('Backend Engineer (Remote, Dubai)')).toEqual(['backend', 'engineer']);
  });
});
