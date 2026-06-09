/**
 * Import payload contract + mapping to RawJob. The shape is deliberately small
 * and tool-agnostic: the Claude Chrome extension OR a manual paste OR any future
 * emitter produces this exact JSON, and it lands on POST /api/import. Imported
 * jobs flow through the SAME ingest pipeline as scraped ones (dedupe → match →
 * categorize → track → judge), so there is no parallel code path.
 *
 * See docs/linkedin-import.md.
 */
import { z } from 'zod';
import type { RawJob } from '../shared/types.js';
import { parsePostedDate } from '../matcher/dates.js';

const httpUrl = z.string().refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL');

const importJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullish(),
  url: httpUrl,
  /** The full "About the job" text. Optional, but the fit-judge needs it to
   *  produce a real verdict; absent → matcher still scores on title+tags. */
  description: z.string().nullish(),
  workMode: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).optional(),
  salaryText: z.string().nullish(),
  /** Absolute yyyy-mm-dd, OR a relative phrase ("2 weeks ago") we convert. */
  postedDate: z.string().optional(),
  postedRelative: z.string().optional(),
  /** Stable per-source id; defaults to the LinkedIn job id parsed from the url. */
  externalId: z.string().optional(),
});

export const importPayloadSchema = z.object({
  // which site the jobs came from → stored as source_id "import:<source>".
  // 'linkedin' today; the contract is reusable for other user-driven imports.
  source: z
    .string()
    .regex(/^[a-z0-9_-]+$/i, 'source must be a simple slug')
    .default('linkedin'),
  jobs: z.array(importJobSchema).min(1).max(500),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
type ImportJob = z.infer<typeof importJobSchema>;

/** Strip query + hash (LinkedIn appends tracking params) → canonical posting url. */
function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** LinkedIn posting urls look like /jobs/view/<digits>; use that id when present. */
function linkedinJobId(url: string): string | null {
  return url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? null;
}

/** "Posted 2 weeks ago" → "2 weeks ago" so parsePostedDate's relative regex hits. */
function cleanRelative(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/^posted\s+/i, '').trim();
}

/** Map one validated import entry to a RawJob. `source` → source_id "import:<source>". */
export function toRawJob(j: ImportJob, source: string, now: Date = new Date()): RawJob {
  const url = canonicalUrl(j.url);
  return {
    externalId: j.externalId || linkedinJobId(url) || url,
    sourceId: `import:${source}`,
    company: j.company,
    title: j.title,
    location: j.location ?? null,
    workMode: j.workMode ?? 'unknown',
    salaryText: j.salaryText ?? null,
    description: j.description ?? null,
    url,
    tags: [],
    // Validate BOTH forms through parsePostedDate: an absolute date is only kept
    // if it's real ISO (a junk "June 1, 2026" → null, not stored raw — the
    // posted_date column is compared lexically, so a non-ISO value would corrupt
    // the date floor). Absolute wins; else the relative phrase; else null.
    postedDate: parsePostedDate(j.postedDate, now) ?? parsePostedDate(cleanRelative(j.postedRelative), now),
  };
}

export function payloadToRawJobs(p: ImportPayload, now: Date = new Date()): RawJob[] {
  return p.jobs.map((j) => toRawJob(j, p.source, now));
}
