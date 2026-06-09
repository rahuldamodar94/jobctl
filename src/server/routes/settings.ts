import express, { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, sep, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { z } from 'zod';
import { profileDir, profileSchema, rolesFileSchema, categoriesSchema } from '../../config/load.js';
import { safeProfilePath } from '../../config/paths.js';
import { extractResume } from '../../upload/extract.js';
import { MAX_RESUME_BYTES } from '../../upload/guards.js';
import { testLlmConnection } from '../../llm/test-connection.js';
import { generateAuthoring } from '../../authoring/index.js';
import type { LlmBackendConfig } from '../../shared/types.js';

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

/** Resolve a path under profile/resumes/ (the only user-file write zone).
 *  Built on the shared safeProfilePath boundary guard (src/config/paths.ts). */
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

  // POST /resume/extract?filename=cv.pdf — convert an uploaded docx/pdf to
  // Markdown for review in the editor. EXTRACT ONLY: it never writes (the user
  // edits, then saves through the validated PUT /resume above). Raw bytes via a
  // route-scoped body limit; the global express.json (application/json only)
  // leaves an octet-stream body untouched, so this doesn't widen its 1mb limit.
  r.post('/resume/extract', express.raw({ type: 'application/octet-stream', limit: MAX_RESUME_BYTES + 65_536 }), async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const filename = String((req.query as { filename?: string }).filename ?? '');
    res.json(await extractResume(buf, filename));
  });

  // POST /api/settings/llm/test — a cheap LLM connectivity/auth check (body holds a
  // backend config; the API key itself stays in server env via api_key_env). The
  // UI requires this to pass before enabling the judge/resume features.
  r.post('/llm/test', async (req, res) => {
    const cfg = req.body as Partial<LlmBackendConfig>;
    if (cfg?.engine !== 'claude-cli' && cfg?.engine !== 'openai-compatible') {
      return res.status(400).json({ ok: false, latencyMs: 0, error: 'engine must be claude-cli or openai-compatible' });
    }
    res.json(await testLlmConnection(cfg as LlmBackendConfig));
  });

  // POST /api/settings/generate — author the judge rubric / resume-gen rules FROM
  // the user's resume (+ optional refinement). Returns markdown for the editor;
  // the user reviews and saves via PUT /skill|/rubric. Blocks while the LLM runs.
  r.post('/generate', async (req, res) => {
    const { target, instruction, currentDraft } = req.body as {
      target?: string;
      instruction?: string;
      currentDraft?: string;
    };
    if (target !== 'rubric' && target !== 'skill') {
      return res.status(400).json({ error: 'target must be "rubric" or "skill"' });
    }
    res.json(await generateAuthoring(target, { instruction, currentDraft }));
  });

  return r;
}
