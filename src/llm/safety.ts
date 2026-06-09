/**
 * Guards for a user-supplied LLM backend config (base_url + api_key_env). The
 * config is deliberately user-arbitrary — any OpenAI-compatible endpoint, INCLUDING
 * a local Ollama on loopback/LAN — so we can't allowlist hosts. But two narrow
 * protections matter (especially for a HOST=0.0.0.0 deployment, where a request
 * can come from off-box):
 *
 *  - api_key_env: a request must not coerce the server into reading an ARBITRARY
 *    env var (e.g. AWS_SECRET_ACCESS_KEY) and shipping it as a Bearer token to an
 *    attacker endpoint. Restricted to conventional LLM-key names + a sensitive-
 *    secret denylist.
 *  - base_url: block the cloud-metadata service + link-local addresses (the
 *    highest-value SSRF target). Loopback/LAN stays allowed (local Ollama is a
 *    documented use), so this is a metadata/redirect guard, not a full SSRF block.
 *
 * Callers also set `redirect: 'manual'` so a 3xx can't bounce the request (with
 * the Bearer token) to a blocked address after the check.
 */

const KEY_NAME_SHAPE = /^[A-Z][A-Z0-9_]*(_API_KEY|_KEY|_TOKEN)$/;
const KEY_NAME_DENY = /(AWS|SECRET|PRIVATE|PASSWORD|GITHUB|GITLAB|^GH_|GCP|GOOGLE_APPLICATION|AZURE|^DB_|DATABASE|SESSION|COOKIE|STRIPE|TWILIO|SLACK)/;

/** null = ok; otherwise a user-facing reason. Empty/undefined is fine (a local
 *  Ollama needs no key). */
export function checkApiKeyEnv(name: string | undefined): string | null {
  if (!name) return null;
  if (!KEY_NAME_SHAPE.test(name) || KEY_NAME_DENY.test(name)) {
    return `api_key_env "${name}" is not an allowed LLM key variable name (expected e.g. OPENAI_API_KEY).`;
  }
  return null;
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
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === '0.0.0.0' ||
    host === 'metadata.google.internal' ||
    host.startsWith('169.254.') || // IPv4 link-local incl. 169.254.169.254 (cloud metadata)
    host.startsWith('fe80:') || // IPv6 link-local
    host === '[::]'
  ) {
    return 'base_url points at a blocked internal/metadata address.';
  }
  return null;
}
