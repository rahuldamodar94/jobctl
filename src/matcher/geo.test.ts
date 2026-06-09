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

  test('intra-word hyphen does NOT split — distinct hyphenated places keep tails', () => {
    // ASCII '-' inside a word is not a separator, so "Wilkes-Barre" doesn't
    // collapse to "wilkes" (and thus never shares a bucket with "Wilkes").
    expect(geoBucket('Wilkes-Barre, PA')).toBe('wilkes-barre');
    expect(geoBucket('Wilkes, PA')).toBe('wilkes');
    expect(geoBucket('Wilkes-Barre, PA')).not.toBe(geoBucket('Wilkes, PA'));
    expect(geoBucket('Baden-Württemberg')).toBe('baden-württemberg');
  });

  test('whitespace-flanked hyphen still splits like a dash separator', () => {
    expect(geoBucket('Berlin - Germany')).toBe('berlin');
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

  test('short terms are word-boundary matched — no substring over-match', () => {
    // 'us' must not substring-hit "Belarus"; must still hit a standalone "US".
    expect(locationMatches('Minsk, Belarus', ['us'])).toBe(false);
    expect(locationMatches('US', ['us'])).toBe(true);
    expect(locationMatches('Austin, US', ['us'])).toBe(true);
    // 'eu' must not hit "Europe"; 'uk' must not hit inside another word.
    expect(locationMatches('Europe', ['eu'])).toBe(false);
    // multi-word country term still matches as a unit.
    expect(locationMatches('Austin, United States', ['united states'])).toBe(true);
  });
});
