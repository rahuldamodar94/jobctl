import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { Repo } from '../../db/repo.js';
import { loadCategories, loadProfile, loadRoles } from '../../config/load.js';
import { ingestBatch } from '../../scraper/run.js';
import { parsePostedDate } from '../../matcher/dates.js';
import { htmlToText } from '../../sources/ats/html-to-text.js';
import { isHttpUrl } from '../../shared/url.js';
import type { RawJob } from '../../shared/types.js';

/**
 * POST /api/import — bring jobs from sites we deliberately DON'T scrape
 * server-side (LinkedIn / Indeed / etc., where the value is the user's own
 * logged-in session). The client extracts structured jobs (e.g. with Claude on
 * the open page) and posts them here; we run them through the SAME dedupe +
 * keyword-match + insert path as a scrape, tagged `source_id = import:<site>`.
 *
 * Security: this endpoint never FETCHES a user-supplied URL (no SSRF) — it only
 * stores what was posted. URLs are validated http(s) (and re-guarded at insert),
 * the body is zod-validated and length-bounded, and the global 1mb json cap
 * applies. Rendered fields are React-escaped (no stored XSS).
 */

const importJobSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  url: z.string().url().refine(isHttpUrl, 'must be an http(s) URL'),
  location: z.string().max(300).nullish(),
  description: z.string().max(50_000).nullish(),
  salaryText: z.string().max(300).nullish(),
  // ISO, epoch, or relative ("2 days ago") — parsePostedDate normalizes it
  postedDate: z.union([z.string().max(40), z.number()]).nullish(),
  workMode: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
  tags: z.array(z.string().min(1).max(60)).max(30).default([]),
  // optional stable id within the site; defaults to the URL
  externalId: z.string().min(1).max(400).nullish(),
});

const importBodySchema = z.object({
  // becomes the `import:<site>` source id — keep it a clean slug
  site: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'site must be lowercase letters, digits, or hyphens (e.g. "linkedin")'),
  jobs: z.array(importJobSchema).min(1).max(100),
});

export interface ImportOutcome {
  imported: number; // genuinely new rows inserted
  received: number; // jobs in the payload
  merged: number; // received − imported (matched an existing row, deduped)
  source: string; // import:<site>
}

/** Validate + ingest. Returns an HTTP status + JSON body (pure-ish: only touches
 *  the db + config files), so it's unit-testable without HTTP plumbing. */
export function importJobs(db: Database.Database, body: unknown): { status: number; body: unknown } {
  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'invalid import payload',
        issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      },
    };
  }
  const { site, jobs } = parsed.data;

  // Imported jobs are deduped + scored exactly like scraped ones, so we need a
  // configured profile + roles (geo injected from the profile, as in a scrape).
  let roles: ReturnType<typeof loadRoles>;
  let categories: ReturnType<typeof loadCategories>;
  let excludeCategories: string[] = [];
  try {
    const profile = loadProfile();
    roles = loadRoles().map((r) => ({
      ...r,
      geoPriority: profile.geoPriority,
      geoRelocationOk: profile.geoRelocationOk,
    }));
    categories = loadCategories();
    excludeCategories = profile.excludeCategories;
  } catch (e) {
    return { status: 409, body: { error: `configure your profile and roles before importing: ${(e as Error).message}` } };
  }

  const sourceId = `import:${site}`;
  const raws: RawJob[] = jobs.map((j) => ({
    externalId: j.externalId || j.url,
    sourceId,
    company: j.company,
    title: j.title,
    location: j.location ?? null,
    workMode: j.workMode,
    salaryText: j.salaryText ?? null,
    description: j.description ? htmlToText(j.description) : null,
    url: j.url,
    tags: j.tags,
    postedDate: parsePostedDate(j.postedDate ?? null),
  }));

  try {
    const imported = ingestBatch(new Repo(db), raws, roles, categories, () => {}, excludeCategories);
    return { status: 200, body: { imported, received: jobs.length, merged: jobs.length - imported, source: sourceId } satisfies ImportOutcome };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message } };
  }
}

export function importRouter(db: Database.Database): Router {
  const r = Router();
  r.post('/import', (req, res) => {
    const { status, body } = importJobs(db, req.body);
    res.status(status).json(body);
  });
  return r;
}
