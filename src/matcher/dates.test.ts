import { describe, expect, test } from 'vitest';
import { parsePostedDate, isOlderThan, localDateISO } from './dates.js';

describe('localDateISO (vitest pins TZ=Asia/Dubai, UTC+4)', () => {
  test('late-UTC instant is already "tomorrow" in Dubai', () => {
    // 22:00 UTC on Jun 5 = 02:00 Jun 6 in Dubai — local date must say Jun 6
    expect(localDateISO(new Date('2026-06-05T22:00:00Z'))).toBe('2026-06-06');
  });
  test('midday instant agrees in both zones', () => {
    expect(localDateISO(new Date('2026-06-05T12:00:00Z'))).toBe('2026-06-05');
  });
});

const NOW = new Date('2026-06-06T12:00:00Z');

describe('parsePostedDate', () => {
  test('parses relative day/week/month formats', () => {
    expect(parsePostedDate('5d', NOW)).toBe('2026-06-01');
    expect(parsePostedDate('2w', NOW)).toBe('2026-05-23');
    expect(parsePostedDate('1mo', NOW)).toBe('2026-05-07'); // 1mo ≈ 30 days
    expect(parsePostedDate('6h', NOW)).toBe('2026-06-06');
    expect(parsePostedDate('3 days ago', NOW)).toBe('2026-06-03');
    expect(parsePostedDate('< 1d', NOW)).toBe('2026-06-06');
  });

  test('passes through ISO dates and timestamps', () => {
    expect(parsePostedDate('2026-05-30', NOW)).toBe('2026-05-30');
    expect(parsePostedDate('2026-05-30T10:00:00Z', NOW)).toBe('2026-05-30');
  });

  test('unparseable → null', () => {
    expect(parsePostedDate('whenever', NOW)).toBe(null);
    expect(parsePostedDate('', NOW)).toBe(null);
    expect(parsePostedDate(null, NOW)).toBe(null);
  });

  test('epoch milliseconds (ATS APIs) → ISO date', () => {
    expect(parsePostedDate(1749100000000, NOW)).toBe('2025-06-05');
  });

  test('epoch SECONDS (RemoteOK) detected and converted — not 1970', () => {
    // 1780663022 s = 2026-06-05; naive ms interpretation would be 1970-01-21
    expect(parsePostedDate(1780663022, NOW)).toBe('2026-06-05');
  });

  test('epoch is stamped at LOCAL calendar date (Dubai), not UTC', () => {
    // 22:00 UTC Jun 5 = 02:00 Jun 6 in Dubai — the stamp must say Jun 6, matching
    // localDateISO/first_seen, so a late-evening posting doesn't drift a day.
    const NOW_LATE = new Date('2026-06-06T23:00:00Z');
    expect(parsePostedDate(Date.parse('2026-06-05T22:00:00Z'), NOW_LATE)).toBe('2026-06-06');
  });

  test('future dates (bad board data) → null, not a permanent top-of-list entry', () => {
    expect(parsePostedDate('2099-01-01', NOW)).toBe(null);
    expect(parsePostedDate('2030-01-01T00:00:00Z', NOW)).toBe(null);
    expect(parsePostedDate(4102444800000, NOW)).toBe(null); // year 2100 in ms
  });
});

describe('isOlderThan', () => {
  test('true when date is beyond maxAgeDays', () => {
    expect(isOlderThan('2026-05-01', 30, NOW)).toBe(true);
    expect(isOlderThan('2026-06-01', 30, NOW)).toBe(false);
  });
  test('null dates are never "older" (kept, governed by first_seen)', () => {
    expect(isOlderThan(null, 30, NOW)).toBe(false);
  });
  test('bare yyyy-mm-dd compared at LOCAL midnight (Dubai), not UTC', () => {
    // NOW 22:00Z → cutoff = 2026-05-07T22:00Z. '2026-05-08' at LOCAL (Dubai)
    // midnight is 2026-05-07T20:00Z → older than cutoff. UTC-parsing it as
    // 2026-05-08T00:00Z would wrongly say NOT older. This pins the local-tz fix.
    const NOW2 = new Date('2026-06-06T22:00:00Z');
    expect(isOlderThan('2026-05-08', 30, NOW2)).toBe(true);
  });
});
