import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProfile, profileDir } from '../config/load.js';
import { claudeAvailable, runClaudeCli } from '../llm/claude-cli.js';
import { checkApiKeyEnv, checkLlmBaseUrl } from '../llm/safety.js';
import type { LlmBackendConfig } from '../shared/types.js';
import { buildAuthorPrompt, type AuthorTarget } from './prompt.js';

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

export async function generateAuthoring(
  target: AuthorTarget,
  opts: { instruction?: string; currentDraft?: string } = {}
): Promise<AuthorResult> {
  let profile;
  try {
    profile = loadProfile();
  } catch {
    return { error: 'Profile not configured yet.' };
  }

  // resume (the source of truth)
  const entry = profile.resumes[0];
  if (!entry) return { error: 'Add your resume first (Settings → Resume) — generation learns from it.' };
  const resumePath = join(profileDir(), 'resumes', entry.file.replace(/^resumes\//, ''));
  if (!existsSync(resumePath)) return { error: 'Resume file not found — re-save it in the Resume tab.' };
  const resume = readFileSync(resumePath, 'utf8').trim();
  if (!resume) return { error: 'Your resume is empty — add content in the Resume tab.' };

  // backend (prefer the judge's; fall back to the resume backend's)
  const name = profile.llm.judge.backend || profile.llm.resume.backend || 'claude-cli';
  const cfg = profile.llm.backends[name];
  if (!cfg) return { error: 'No LLM backend configured — set one up in the AI/LLM tab first.' };
  if (cfg.engine === 'claude-cli' && !claudeAvailable()) {
    return { error: 'claude CLI not available on this machine.' };
  }

  const prompt = buildAuthorPrompt(target, {
    resume,
    location: profile.geoPriority.join(', '),
    instruction: opts.instruction,
    currentDraft: opts.currentDraft,
  });

  try {
    const md = cleanMarkdown(await runPlain(cfg, prompt));
    if (!md.startsWith('#')) return { error: 'The model did not return a usable document — try again.' };
    return { markdown: md };
  } catch (e) {
    return { error: `Generation failed: ${(e as Error).message}` };
  }
}
