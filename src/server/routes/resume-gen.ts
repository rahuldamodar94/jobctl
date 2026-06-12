import { Router } from 'express';
import type Database from 'better-sqlite3';
import { Repo } from '../../db/repo.js';
import { existsSync } from 'node:fs';
import { safeProfileSubpath } from '../../config/paths.js';
import { claudeAvailable, findExistingResume, generateResume } from '../../resume/generate.js';

/**
 * Resume-generation routes.
 *  POST /api/jobs/:id/resume      → generate (synchronous, ~30-90s; single user)
 *  GET  /api/jobs/:id/resume      → existing generation info for the job
 *  GET  /api/generated/<dir>/<f>  → serve generated pdf/md (boundary-guarded)
 * Availability is reported via GET /api/config (server/index.ts) — the UI
 * hides the feature entirely when the claude CLI isn't on this machine.
 */
export function resumeGenRouter(db: Database.Database): Router {
  const r = Router();

  r.post('/jobs/:id/resume', async (req, res) => {
    if (!claudeAvailable()) {
      return res.status(503).json({ error: 'claude CLI not available on this machine (feature is host-only)' });
    }
    if (!new Repo(db).findById(Number(req.params.id))) {
      return res.status(404).json({ error: 'not found' });
    }
    try {
      const result = await generateResume(db, Number(req.params.id));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/jobs/:id/resume', (req, res) => {
    const existing = findExistingResume(Number(req.params.id));
    if (!existing) return res.json(null);
    res.json({
      dir: existing.dir,
      // meta records the basenames; generations from before the
      // Name_Company_Title rename fall back to the old fixed names
      pdfFile: `${existing.dir}/${(existing.meta.pdfFile as string) ?? 'resume.pdf'}`,
      mdFile: `${existing.dir}/${(existing.meta.mdFile as string) ?? 'resume.md'}`,
      generatedAt: existing.meta.generatedAt,
      pages: existing.meta.pages,
      warning: existing.meta.warning,
    });
  });

  // Express 5 requires named wildcards (`*splat`), captured as a segment array.
  r.get('/generated/*splat', (req, res) => {
    const splat = (req.params as { splat?: string[] }).splat ?? [];
    const rel = decodeURIComponent(splat.join('/'));
    // boundary-aware guard (shared): confined strictly to profile/generated/.
    const path = safeProfileSubpath('generated', rel);
    if (!path || !existsSync(path)) {
      return res.status(404).json({ error: 'not found' });
    }
    if (path.endsWith('.pdf')) res.type('application/pdf');
    else if (path.endsWith('.md')) res.type('text/markdown');
    res.sendFile(path);
  });

  return r;
}
