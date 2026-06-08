import type { LlmBackendConfig } from '../shared/types.js';
import { runClaudeCli } from '../llm/claude-cli.js';

/** A backend runner: prompt in, raw model text out. */
export type Runner = (prompt: string) => Promise<string>;

/** JSON schema for the verdict — all fields REQUIRED (empty arrays, never
 *  omitted) to sidestep Gemini's OpenAI-compat optional-field bug. */
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'reasons', 'blockers'],
  properties: {
    verdict: { type: 'string', enum: ['STRONG', 'DECENT', 'WEAK', 'SKIP'] },
    summary: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
};

const HTTP_TIMEOUT_MS = 60_000;

/** Build the runner for a backend config. Throws if misconfigured. */
export function makeRunner(cfg: LlmBackendConfig): Runner {
  if (cfg.engine === 'claude-cli') {
    return (prompt) => runClaudeCli(prompt, { model: cfg.model, timeoutMs: 120_000 });
  }
  // openai-compatible (OpenAI / Gemini / DeepSeek / OpenRouter / local Ollama)
  if (!cfg.base_url) throw new Error('openai-compatible backend needs base_url');
  const key = cfg.api_key_env ? process.env[cfg.api_key_env] : undefined;
  return async (prompt) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(`${cfg.base_url!.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema: VERDICT_SCHEMA } },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
      const content = j?.choices?.[0]?.message?.content;
      if (!content) {
        // surface the real reason rather than letting parseVerdict report "no JSON"
        throw new Error(`LLM returned no content: ${JSON.stringify(j).slice(0, 200)}`);
      }
      return content;
    } finally {
      clearTimeout(t);
    }
  };
}
