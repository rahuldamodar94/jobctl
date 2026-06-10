import { describe, expect, test } from 'vitest';
import { profileSchema } from './load.js';

// A backend config can be PERSISTED via PUT /profile, then read+used by the judge
// at runtime — so the SSRF/credential-exfil guards must reject a hostile backend
// at WRITE time (the durable fix), not only at the test-connection button.
const parse = (backend: object) =>
  profileSchema.safeParse({ name: 'T', enabled_sources: ['jobstash'], llm: { backends: { x: backend } } });

describe('profileSchema — llm.backends SSRF / credential-exfil guard', () => {
  test('rejects a metadata/link-local base_url', () => {
    expect(parse({ engine: 'openai-compatible', base_url: 'http://169.254.169.254/v1' }).success).toBe(false);
    expect(parse({ engine: 'openai-compatible', base_url: 'http://[::ffff:169.254.169.254]/v1' }).success).toBe(false);
  });
  test('rejects a non-allowlisted api_key_env (infra secret)', () => {
    expect(parse({ engine: 'openai-compatible', base_url: 'https://api.openai.com/v1', api_key_env: 'AWS_SECRET_ACCESS_KEY' }).success).toBe(false);
    expect(parse({ engine: 'openai-compatible', base_url: 'https://api.openai.com/v1', api_key_env: 'VAULT_TOKEN' }).success).toBe(false);
  });
  test('accepts a legit openai-compatible backend', () => {
    expect(parse({ engine: 'openai-compatible', base_url: 'https://api.openai.com/v1', api_key_env: 'OPENAI_API_KEY' }).success).toBe(true);
  });
  test('accepts a local Ollama (loopback, no key)', () => {
    expect(parse({ engine: 'openai-compatible', base_url: 'http://localhost:11434/v1' }).success).toBe(true);
  });
  test('accepts claude-cli (no url/key)', () => {
    expect(parse({ engine: 'claude-cli' }).success).toBe(true);
  });
});
