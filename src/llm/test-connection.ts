import { spawnSync } from 'node:child_process';
import { runClaudeCli } from './claude-cli.js';
import { checkApiKeyEnv, checkLlmBaseUrl } from './safety.js';
import type { LlmBackendConfig } from '../shared/types.js';

/**
 * Cheap connectivity/auth check for an LLM backend — a ~handful-of-tokens
 * round-trip. This is VALIDATION, not a benchmark: it answers "is this backend
 * actually reachable and authenticated?" so the UI can require a working backend
 * before enabling the judge / resume features (no more silent no-ops). Never
 * throws — always resolves to a result with a user-facing reason on failure.
 */

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

const TEST_PROMPT = 'Reply with exactly: OK';
const HTTP_TIMEOUT_MS = 20_000;

// Status-based hint only — the upstream response body is NOT echoed back (it
// could carry internal-service content if base_url were ever pointed inward).
function httpHint(status: number): string {
  if (status === 401 || status === 403) return `Auth rejected (HTTP ${status}) — check the API key.`;
  if (status === 404) return 'Not found (HTTP 404) — check base_url and model.';
  if (status >= 300 && status < 400) return `Unexpected redirect (HTTP ${status}) — check base_url.`;
  if (status === 400) return 'Bad request (HTTP 400) — the model may be invalid.';
  return `HTTP ${status}.`;
}

export async function testLlmConnection(cfg: LlmBackendConfig): Promise<ConnectionTestResult> {
  const t0 = Date.now();
  const fail = (error: string): ConnectionTestResult => ({ ok: false, latencyMs: Date.now() - t0, error });

  try {
    if (cfg.engine === 'claude-cli') {
      // Uncached availability — a freshly-installed/logged-in CLI must be
      // detectable without a server restart (unlike the cached claudeAvailable()).
      const v = spawnSync('claude', ['--version'], { timeout: 10_000, encoding: 'utf8' });
      if (v.status !== 0) return fail('claude CLI not found on PATH — install it and log in, or use an OpenAI-compatible backend.');
      const out = await runClaudeCli(TEST_PROMPT, { timeoutMs: 30_000, model: cfg.model });
      if (!out.trim()) return fail('claude CLI returned no output — is it logged in (`claude` once interactively)?');
      return { ok: true, latencyMs: Date.now() - t0 };
    }

    // openai-compatible — guard the user-supplied config before reading any env
    // secret or making the request (credential-exfil / SSRF protection).
    const urlErr = checkLlmBaseUrl(cfg.base_url);
    if (urlErr) return fail(urlErr);
    if (!cfg.model) return fail('Missing model.');
    const keyErr = checkApiKeyEnv(cfg.api_key_env);
    if (keyErr) return fail(keyErr);
    const key = cfg.api_key_env ? process.env[cfg.api_key_env] : undefined;
    if (cfg.api_key_env && !key) return fail(`The env var "${cfg.api_key_env}" is not set on the server — export your API key there.`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(`${cfg.base_url!.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: cfg.model, temperature: 0, max_tokens: 16, messages: [{ role: 'user', content: TEST_PROMPT }] }),
        signal: ctrl.signal,
        redirect: 'manual', // a 3xx must not bounce the Bearer token to another host
      });
      if (!res.ok) return fail(httpHint(res.status));
      const j = (await res.json().catch(() => null)) as { choices?: { message?: unknown }[] } | null;
      if (!j?.choices?.[0]?.message) return fail('The endpoint responded, but not in OpenAI chat-completions shape.');
      return { ok: true, latencyMs: Date.now() - t0 };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (/abort/i.test(msg)) return fail('Request timed out — is base_url reachable from the server?');
    return fail(msg);
  }
}
