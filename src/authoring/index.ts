import { existsSync, readFileSync } from 'node:fs';
import { loadProfile, loadRoles } from '../config/load.js';
import { safeProfileSubpath } from '../config/paths.js';
import { claudeAvailable, runClaudeCli } from '../llm/claude-cli.js';
import { checkApiKeyEnv, checkLlmBaseUrl } from '../llm/safety.js';
import type { LlmBackendConfig, ProfileConfig, RoleConfig } from '../shared/types.js';
import { buildAuthorPrompt, buildRolesPrompt, type AuthorTarget } from './prompt.js';
import { parseRolesDraft, type DraftRole } from './parse.js';

/**
 * Generate the fit-judge rubric / resume-generation rules FROM the user's resume
 * (+ an optional refinement instruction). Returns markdown for the editor — it
 * NEVER writes; the user reviews and saves through the existing PUT /skill|/rubric.
 * Best-effort: every failure returns a user-facing { error }, never throws.
 */

export interface AuthorResult {
  markdown?: string;
  error?: string;
}

/** Plain-text LLM call — deliberately NOT the judge's makeRunner, which forces a
 *  verdict JSON schema. Authoring needs free-form markdown out. */
async function runPlain(cfg: LlmBackendConfig, prompt: string): Promise<string> {
  if (cfg.engine === 'claude-cli') return runClaudeCli(prompt, { model: cfg.model, timeoutMs: 150_000 });
  const urlErr = checkLlmBaseUrl(cfg.base_url);
  if (urlErr) throw new Error(urlErr);
  const keyErr = checkApiKeyEnv(cfg.api_key_env);
  if (keyErr) throw new Error(keyErr);
  const key = cfg.api_key_env ? process.env[cfg.api_key_env] : undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${cfg.base_url!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
      redirect: 'manual',
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 180)}`);
    const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const content = j?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned no content');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip an accidental ```markdown … ``` fence the model sometimes wraps. */
function cleanMarkdown(raw: string): string {
  let md = raw.trim();
  const fence = md.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  if (fence) md = fence[1]!.trim();
  return md;
}

/** Shared setup for every authoring call: the resume (source of truth) and the
 *  resolved LLM backend. Returns a user-facing error string if anything's
 *  missing — callers never throw. Backend preference: judge's, then resume's. */
function loadAuthoringContext(): {
  ctx?: { resume: string; cfg: LlmBackendConfig; profile: ProfileConfig };
  error?: string;
} {
  let profile: ProfileConfig;
  try {
    profile = loadProfile();
  } catch {
    return { error: 'Profile not configured yet.' };
  }
  const entry = profile.resumes[0];
  if (!entry) return { error: 'Add your resume first (Settings → Resume) — generation learns from it.' };
  const resumePath = safeProfileSubpath('resumes', entry.file.replace(/^resumes\//, '')); // boundary-guarded
  if (!resumePath || !existsSync(resumePath)) return { error: 'Resume file not found — re-save it in the Resume tab.' };
  const resume = readFileSync(resumePath, 'utf8').trim();
  if (!resume) return { error: 'Your resume is empty — add content in the Resume tab.' };

  const name = profile.llm.judge.backend || profile.llm.resume.backend || 'claude-cli';
  const backend = profile.llm.backends[name];
  if (!backend) return { error: 'No LLM backend configured — set one up in the AI/LLM tab first.' };
  if (backend.engine === 'claude-cli' && !claudeAvailable()) {
    return { error: 'claude CLI not available on this machine.' };
  }
  // Authoring is a "writing" task → use the resume (writing) model override.
  const writingModel = profile.llm.resume.model;
  const cfg = writingModel ? { ...backend, model: writingModel } : backend;
  return { ctx: { resume, cfg, profile } };
}

export async function generateAuthoring(
  target: AuthorTarget,
  opts: { instruction?: string; currentDraft?: string } = {}
): Promise<AuthorResult> {
  const { ctx, error } = loadAuthoringContext();
  if (!ctx) return { error };

  const prompt = buildAuthorPrompt(target, {
    resume: ctx.resume,
    location: ctx.profile.geoPriority.join(', '),
    instruction: opts.instruction,
    currentDraft: opts.currentDraft,
  });

  try {
    const md = cleanMarkdown(await runPlain(ctx.cfg, prompt));
    if (!md.startsWith('#')) return { error: 'The model did not return a usable document — try again.' };
    return { markdown: md };
  } catch (e) {
    return { error: `Generation failed: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Roles tuning — structured (JSON) authoring of the matching config. Returns a
// validated, ready-to-save role; the title_keywords from the curated template
// are preserved (the LLM tunes stack/weights/excludes). Like the markdown path,
// it NEVER writes — the user reviews and saves through PUT /roles.
// ---------------------------------------------------------------------------

export interface RolesDraftResult {
  role?: DraftRole;
  error?: string;
}

function toSnakeRole(r: RoleConfig): DraftRole {
  return {
    id: r.id,
    label: r.label,
    title_keywords: r.titleKeywords,
    title_exclude: r.titleExclude ?? [],
    must_have_stack: r.mustHaveStack,
    nice_to_have: r.niceToHave,
    exclude_if_primary: r.excludeIfPrimary,
  };
}

/** Keep every current keyword; append any new ones the draft adds (case-insensitive). */
function unionKeep(current: string[], drafted: string[]): string[] {
  const seen = new Set(current.map((k) => k.toLowerCase()));
  const out = [...current];
  for (const k of drafted) {
    const lk = k.toLowerCase();
    if (!seen.has(lk)) {
      seen.add(lk);
      out.push(k);
    }
  }
  return out;
}

export async function generateRolesDraft(
  opts: { instruction?: string; currentDraft?: string } = {}
): Promise<RolesDraftResult> {
  const { ctx, error } = loadAuthoringContext();
  if (!ctx) return { error };

  let roles: RoleConfig[];
  try {
    roles = loadRoles();
  } catch {
    return { error: 'No role configured yet — finish onboarding first.' };
  }
  const current = roles[0];
  if (!current) return { error: 'No role found in roles.yaml.' };
  const currentSnake = toSnakeRole(current);

  const prompt = buildRolesPrompt({
    resume: ctx.resume,
    currentRole: JSON.stringify(currentSnake, null, 2),
    location: ctx.profile.geoPriority.join(', '),
    instruction: opts.instruction,
    currentDraft: opts.currentDraft,
  });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await runPlain(ctx.cfg, prompt);
    } catch (e) {
      return { error: `Generation failed: ${(e as Error).message}` };
    }
    try {
      const drafted = parseRolesDraft(raw);
      // Safety net independent of the prompt: never drop a template title_keyword,
      // never let the id drift (the matcher + save path key on it).
      return {
        role: {
          ...drafted,
          id: current.id,
          title_keywords: unionKeep(currentSnake.title_keywords, drafted.title_keywords),
        },
      };
    } catch (e) {
      lastErr = e as Error;
    }
  }
  return { error: `Could not parse a valid role after a retry: ${lastErr?.message}` };
}
