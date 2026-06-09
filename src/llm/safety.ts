import { isIP } from 'node:net';

/**
 * Guards for a user-supplied LLM backend config (base_url + api_key_env). The
 * config is deliberately user-arbitrary — any OpenAI-compatible endpoint, INCLUDING
 * a local Ollama on loopback/LAN — so we can't allowlist hosts. But two narrow
 * protections matter (especially for a HOST=0.0.0.0 deployment, where a request
 * can come from off-box):
 *
 *  - api_key_env: a request must not coerce the server into reading an ARBITRARY
 *    env var (AWS_SECRET_ACCESS_KEY, VAULT_TOKEN, GITHUB_TOKEN, …) and shipping it
 *    as a Bearer token to an attacker endpoint. ALLOWLISTED to `*_API_KEY` /
 *    `*_API_TOKEN` names — an allowlist can't silently miss the next secret the
 *    way a denylist does, and every mainstream LLM key matches it.
 *  - base_url: block the cloud-metadata service + link-local addresses (the
 *    highest-value SSRF target), including the cheap IPv4-mapped-IPv6 / trailing-dot
 *    / decimal-IP encodings. Loopback/LAN stays allowed (local Ollama is documented).
 *
 * Residual: a hostname that RESOLVES to a blocked IP at fetch time (DNS rebinding)
 * is not caught here (we check the literal host, not the dialed IP). That residual
 * is bounded by the api_key_env allowlist above — only an LLM key, never infra
 * creds, can be exfiltrated — and callers set `redirect: 'manual'` so a 3xx can't
 * bounce the Bearer token to a blocked address after the check.
 */

// Mainstream LLM keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY,
// DEEPSEEK_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, REPLICATE_API_TOKEN, …
const KEY_NAME_ALLOW = /^[A-Z][A-Z0-9_]*_API_(KEY|TOKEN)$/;

/** null = ok; otherwise a user-facing reason. Empty/undefined is fine (a local
 *  Ollama needs no key). */
export function checkApiKeyEnv(name: string | undefined): string | null {
  if (!name) return null;
  if (!KEY_NAME_ALLOW.test(name)) {
    return `api_key_env "${name}" must be an *_API_KEY (or *_API_TOKEN) env var name, e.g. OPENAI_API_KEY.`;
  }
  return null;
}

/** Unwrap an IPv4-mapped IPv6 literal (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) to its
 *  dotted-quad, so a mapped form of a blocked address can't slip past. */
function unwrapMappedV4(host: string): string {
  const m = host.match(/^::ffff:(.+)$/);
  if (!m) return host;
  const rest = m[1]!;
  if (isIP(rest) === 4) return rest;
  const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return host;
}

/** null = ok; otherwise a user-facing reason. */
export function checkLlmBaseUrl(base: string | undefined): string | null {
  if (!base) return 'Missing base_url.';
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return 'base_url is not a valid URL.';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'base_url must be an http(s) URL.';
  // strip ipv6 brackets + a trailing dot, then unwrap IPv4-mapped IPv6.
  // (WHATWG URL already normalizes decimal/octal/hex IPv4 to dotted-quad.)
  const host = unwrapMappedV4(u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''));
  if (
    host === '0.0.0.0' ||
    host === '::' ||
    host === 'metadata.google.internal' ||
    host.startsWith('169.254.') || // IPv4 link-local incl. 169.254.169.254 (cloud metadata)
    host.startsWith('fe80:') // IPv6 link-local
  ) {
    return 'base_url points at a blocked internal/metadata address.';
  }
  return null;
}
