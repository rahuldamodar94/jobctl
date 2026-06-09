import { describe, expect, test } from 'vitest';
import { importPayloadSchema, payloadToRawJobs, toRawJob } from './schema.js';

const now = new Date('2026-06-09T12:00:00Z');
const job = (over: Record<string, unknown> = {}) => ({
  title: 'Backend Engineer',
  company: 'Acme',
  url: 'https://www.linkedin.com/jobs/view/123456',
  ...over,
});

describe('import payload schema', () => {
  test('accepts a valid payload and defaults source to linkedin', () => {
    const r = importPayloadSchema.parse({ jobs: [job()] });
    expect(r.source).toBe('linkedin');
    expect(r.jobs).toHaveLength(1);
  });

  test('rejects empty jobs, missing title, and non-http urls', () => {
    expect(importPayloadSchema.safeParse({ jobs: [] }).success).toBe(false);
    expect(importPayloadSchema.safeParse({ jobs: [{ company: 'y', url: 'https://x/1' }] }).success).toBe(false);
    expect(importPayloadSchema.safeParse({ jobs: [job({ url: 'ftp://x/1' })] }).success).toBe(false);
    expect(importPayloadSchema.safeParse({ jobs: [job({ url: 'javascript:alert(1)' })] }).success).toBe(false);
  });

  test('caps the batch at 500 jobs', () => {
    const jobs = Array.from({ length: 501 }, (_, i) => job({ url: `https://x.co/${i}` }));
    expect(importPayloadSchema.safeParse({ jobs }).success).toBe(false);
  });
});

describe('toRawJob mapping', () => {
  test('strips tracking params and derives externalId from the LinkedIn job id', () => {
    const j = toRawJob(job({ url: 'https://www.linkedin.com/jobs/view/123456?refId=abc&trk=xyz' }), 'linkedin', now);
    expect(j.url).toBe('https://www.linkedin.com/jobs/view/123456');
    expect(j.externalId).toBe('123456');
    expect(j.sourceId).toBe('import:linkedin');
    expect(j.workMode).toBe('unknown'); // default when absent
    expect(j.tags).toEqual([]);
  });

  test('parses a relative posted date, tolerating a "Posted " prefix', () => {
    const j = toRawJob(job({ postedRelative: 'Posted 2 weeks ago' }), 'linkedin', now);
    expect(j.postedDate).toBe('2026-05-26'); // 14 days before 2026-06-09
  });

  test('an explicit absolute postedDate wins over the relative phrase', () => {
    const j = toRawJob(job({ postedDate: '2026-06-01', postedRelative: '1 day ago' }), 'linkedin', now);
    expect(j.postedDate).toBe('2026-06-01');
  });

  test('a non-ISO absolute date is NOT stored raw — it falls through (A1)', () => {
    // "June 1, 2026" would corrupt the lexically-compared posted_date column
    const j = toRawJob(job({ postedDate: 'June 1, 2026' }), 'linkedin', now);
    expect(j.postedDate).toBeNull(); // rejected, and no relative to fall back to
    const k = toRawJob(job({ postedDate: 'garbage', postedRelative: '5 days ago' }), 'linkedin', now);
    expect(k.postedDate).toBe('2026-06-04'); // falls back to the valid relative
  });

  test('an explicit externalId overrides the parsed id; source flows into source_id', () => {
    const j = toRawJob(job({ externalId: 'ext-9' }), 'workable', now);
    expect(j.externalId).toBe('ext-9');
    expect(j.sourceId).toBe('import:workable');
  });

  test('payloadToRawJobs maps the whole batch', () => {
    const raws = payloadToRawJobs({ source: 'linkedin', jobs: [job(), job({ url: 'https://x.co/2' })] }, now);
    expect(raws).toHaveLength(2);
    expect(raws.every((r) => r.sourceId === 'import:linkedin')).toBe(true);
  });
});
