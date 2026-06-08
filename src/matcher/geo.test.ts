import { describe, expect, test } from 'vitest';
import { geoBucket, geoCompatible, locationMatches } from './geo.js';

describe('geoBucket', () => {
  test('canonicalizes remote variants into one bucket', () => {
    expect(geoBucket('Remote')).toBe('remote');
    expect(geoBucket('Remote — EMEA')).toBe('remote');
    expect(geoBucket('Remote (Europe TZ preferred)')).toBe('remote');
    expect(geoBucket('100% Remote')).toBe('remote');
  });

  test('extracts a primary city/country bucket', () => {
    expect(geoBucket('Dubai, UAE')).toBe('dubai');
    expect(geoBucket('New York, USA (Hybrid)')).toBe('new york');
    expect(geoBucket('London')).toBe('london');
  });

  test('null/empty/garbage → unknown', () => {
    expect(geoBucket(null)).toBe('unknown');
    expect(geoBucket('')).toBe('unknown');
  });

  test('remote with office option still buckets remote', () => {
    expect(geoBucket('Remote (London office option, visa sponsored)')).toBe('remote');
  });
});

describe('geoCompatible', () => {
  test('same bucket compatible', () => {
    expect(geoCompatible('dubai', 'dubai')).toBe(true);
  });
  test('remote compatible with anything (one remote role regardless of region)', () => {
    expect(geoCompatible('remote', 'london')).toBe(true);
    expect(geoCompatible('london', 'remote')).toBe(true);
  });
  test('unknown only matches unknown — NOT a wildcard (avoids losing a real role)', () => {
    expect(geoCompatible('unknown', 'unknown')).toBe(true);
    expect(geoCompatible('unknown', 'dubai')).toBe(false);
    expect(geoCompatible('dubai', 'unknown')).toBe(false);
  });
  test('two distinct cities NOT compatible (real distinct roles)', () => {
    expect(geoCompatible('dubai', 'london')).toBe(false);
  });
});

describe('locationMatches', () => {
  test('matches fragments against configured geo lists', () => {
    expect(locationMatches('Remote — Non-US (works for Dubai)', ['dubai', 'remote'])).toBe(true);
    expect(locationMatches('Madrid, Spain (Hybrid)', ['spain', 'madrid'])).toBe(true);
    expect(locationMatches('New York, USA', ['dubai', 'remote'])).toBe(false);
  });

  test('bare remote counts as match when remote is in the list', () => {
    expect(locationMatches('Remote', ['remote'])).toBe(true);
  });
});
