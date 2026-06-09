import { Router } from 'express';
import type { Repo } from '../../db/repo.js';
import { loadRoles, loadProfile, loadCategories, ConfigError } from '../../config/load.js';
import { ingestBatch, loadRolesWithGeo } from '../../scraper/run.js';
import { importPayloadSchema, payloadToRawJobs } from '../../import/schema.js';
import { buildLinkedInPrompt } from '../../import/prompt.js';

/**
 * User-driven import surface (see docs/linkedin-import.md).
 *  POST /api/import          — ingest a normalized jobs payload (paste OR the
 *                              Claude extension). Runs the SAME pipeline as a
 *                              scrape: dedupe → match/score → categorize → store.
 *  GET  /api/import/prompt   — the config-generated Claude-extension prompt.
 *
 * No LinkedIn contact happens here — the server only receives already-extracted
 * jobs. The cross-origin guard protects this route; the extension's direct POST
 * (a token carve-out) is a later phase — paste is same-origin and needs nothing.
 */
export function importRouter(repo: Repo): Router {
  const r = Router();

  r.post('/import', (req, res) => {
    const parsed = importPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid import payload',
        issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      });
    }
    // Match imported jobs exactly like the scraper does (same geo-injected roles
    // + categories), so an imported job is scored/categorized identically.
    let profile, roles, categories;
    try {
      profile = loadProfile();
      roles = loadRolesWithGeo(profile);
      categories = loadCategories();
    } catch (e) {
      const msg = e instanceof ConfigError ? e.message : (e as Error).message;
      return res.status(400).json({ error: `configure your profile + roles before importing: ${msg}` });
    }

    const raws = payloadToRawJobs(parsed.data);
    const inserted = ingestBatch(repo, raws, roles, categories, (m) => console.log(`[import] ${m}`), profile.excludeCategories);
    // inserted = brand-new rows; the rest deduped into existing jobs (e.g. a
    // LinkedIn repost merging with the same role already scraped from its ATS).
    res.json({ received: raws.length, inserted, merged: raws.length - inserted });
  });

  r.get('/import/prompt', (_req, res) => {
    try {
      const profile = loadProfile();
      const roles = loadRoles();
      res.json({ prompt: buildLinkedInPrompt(roles, profile) });
    } catch (e) {
      const msg = e instanceof ConfigError ? e.message : (e as Error).message;
      res.status(400).json({ error: `configure your profile + roles first: ${msg}` });
    }
  });

  return r;
}
