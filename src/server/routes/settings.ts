import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, normalize, sep, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { z } from 'zod';
import { profileDir, profileSchema, rolesFileSchema, categoriesSchema } from '../../config/load.js';

/**
 * Settings/onboarding write surface. Every write validates with the SAME zod
 * schema the loaders use (config is rejected, never written invalid) and is
 * atomic (temp file + rename). The app has no config cache, so a written file
 * is live on the very next read — no reload needed.
 *
 * Editing is limited to the personal `profile/` zone; committed community data
 * under `config/` is never touched. No auth (localhost single-user by design).
 */

const SKILL_FILE = 'RESUME_GENERATION_SKILL.md';
const RUBRIC_FILE = 'judge-rubric.md';

/** Resolve a path strictly INSIDE profile/ (reject the root itself + escapes). */
function safeProfilePath(rel: string): string | null {
  const root = profileDir();
  const path = normalize(join(root, rel));
  if (path === root || !path.startsWith(root + sep)) return null;
  return path;
}

/** Resolve a path under profile/resumes/ (the only user-file write zone). */
function safeResumePath(rel: string): string | null {
  const path = safeProfilePath(rel);
  if (!path || !path.startsWith(join(profileDir(), 'resumes') + sep)) return null;
  return path;
}

/** Atomic write: temp file + rename, so a crash mid-write never leaves a
 *  half-written (corrupt) config behind. Cleans up the temp on failure. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* temp already gone */
    }
    throw e;
  }
}

function writeYaml(rel: string, obj: unknown, header: string): void {
  const path = join(profileDir(), rel);
  writeAtomic(path, `# ${header}\n# Managed in Settings — hand-edits to comments are not preserved.\n${stringify(obj)}`);
}

/** Read + parse a YAML file under profile/, or null if absent/invalid. */
function readYaml(rel: string): unknown {
  const path = join(profileDir(), rel);
  if (!existsSync(path)) return null;
  try {
    return parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readText(rel: string): string | null {
  const path = join(profileDir(), rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Validate body with a zod schema; on success write YAML, else 400 with issues. */
function putYaml<S extends z.ZodTypeAny>(
  schema: S,
  rel: string,
  header: string,
  body: unknown,
  res: import('express').Response
): void {
  const result = schema.safeParse(body);
  if (!result.success) {
    return void res.status(400).json({
      error: 'validation failed',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    });
  }
  writeYaml(rel, body, header);
  res.json({ ok: true });
}

export function settingsRouter(): Router {
  const r = Router();

  // Snapshot of everything the Settings UI edits (+ first-run `configured`).
  r.get('/', (_req, res) => {
    const profile = readYaml('profile.yaml');
    res.json({
      configured: profileSchema.safeParse(profile).success,
      profile,
      roles: readYaml('roles.yaml'),
      categories: readYaml('categories.yaml'),
      skill: readText(SKILL_FILE),
      rubric: readText(RUBRIC_FILE),
    });
  });

  r.put('/profile', (req, res) => putYaml(profileSchema, 'profile.yaml', 'profile.yaml', req.body, res));
  r.put('/roles', (req, res) => putYaml(rolesFileSchema, 'roles.yaml', 'roles.yaml', req.body, res));
  r.put('/categories', (req, res) =>
    putYaml(categoriesSchema, 'categories.yaml', 'categories.yaml (profile override)', req.body, res)
  );

  // Free-text markdown artifacts (no schema — passed to the LLM verbatim).
  r.get('/skill', (_req, res) => res.json({ text: readText(SKILL_FILE) ?? '' }));
  r.put('/skill', (req, res) => {
    writeAtomic(join(profileDir(), SKILL_FILE), String((req.body as { text?: string }).text ?? ''));
    res.json({ ok: true });
  });
  r.get('/rubric', (_req, res) => res.json({ text: readText(RUBRIC_FILE) ?? '' }));
  r.put('/rubric', (req, res) => {
    writeAtomic(join(profileDir(), RUBRIC_FILE), String((req.body as { text?: string }).text ?? ''));
    res.json({ ok: true });
  });

  // Resume markdown: write the file under profile/resumes/ (boundary-guarded).
  // The profile.yaml `resumes[]` entry is managed via PUT /profile.
  r.put('/resume', (req, res) => {
    const { file, markdown } = req.body as { file?: string; markdown?: string };
    if (!file || typeof markdown !== 'string') {
      return res.status(400).json({ error: 'need { file, markdown }' });
    }
    const path = safeResumePath(file);
    if (!path) return res.status(400).json({ error: 'file must be under resumes/' });
    writeAtomic(path, markdown);
    res.json({ ok: true });
  });
  r.get('/resume', (req, res) => {
    // boundary-guarded to resumes/ — must not read arbitrary profile/ files
    const path = safeResumePath(String((req.query as { file?: string }).file ?? ''));
    if (!path || !existsSync(path)) return res.status(404).json({ error: 'not found' });
    res.json({ markdown: readFileSync(path, 'utf8') });
  });
  r.delete('/resume', (req, res) => {
    const path = safeResumePath(String((req.query as { file?: string }).file ?? ''));
    if (!path) return res.status(400).json({ error: 'file must be under resumes/' });
    if (existsSync(path)) unlinkSync(path);
    res.json({ ok: true });
  });

  return r;
}
