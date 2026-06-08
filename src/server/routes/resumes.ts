import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { loadProfile, profileDir } from '../../config/load.js';

/** GET /api/resumes → configured list; GET /api/resumes/:id → markdown body. */
export function resumesRouter(): Router {
  const r = Router();

  // first-run safe: no/invalid profile → empty list, not a 500
  const resumes = () => {
    try {
      return loadProfile().resumes;
    } catch {
      return [];
    }
  };

  r.get('/', (_req, res) => {
    res.json(resumes().map(({ id, label }) => ({ id, label })));
  });

  r.get('/:id', (req, res) => {
    const resume = resumes().find((x) => x.id === req.params.id);
    if (!resume) return res.status(404).json({ error: 'not found' });
    // Boundary-aware traversal guard: must be INSIDE profile/ — a bare
    // startsWith would also accept a sibling like /app/profile-evil.
    const path = normalize(join(profileDir(), resume.file));
    if (!path.startsWith(profileDir() + sep) || !existsSync(path)) {
      return res.status(404).json({ error: 'file missing' });
    }
    res.type('text/markdown').send(readFileSync(path, 'utf8'));
  });

  return r;
}
