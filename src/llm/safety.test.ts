import { describe, expect, test } from 'vitest';
import { checkApiKeyEnv, checkLlmBaseUrl } from './safety.js';

describe('checkApiKeyEnv (credential-exfil guard)', () => {
  test('allows conventional LLM key names + no-key (local ollama)', () => {
    for (const n of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'MY_LLM_TOKEN', 'DEEPSEEK_KEY']) {
      expect(checkApiKeyEnv(n)).toBeNull();
    }
    expect(checkApiKeyEnv(undefined)).toBeNull();
    expect(checkApiKeyEnv('')).toBeNull();
  });
  test('blocks infra secrets and non-key-shaped names', () => {
    for (const n of ['AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'DB_PASSWORD', 'AZURE_CLIENT_SECRET', 'PATH', 'randomvar']) {
      expect(checkApiKeyEnv(n)).toMatch(/not an allowed/);
    }
  });
});

describe('checkLlmBaseUrl (SSRF/metadata guard)', () => {
  test('allows public and local (ollama) endpoints', () => {
    for (const u of ['https://api.openai.com/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:11434/v1', 'http://192.168.1.50:11434/v1']) {
      expect(checkLlmBaseUrl(u)).toBeNull();
    }
  });
  test('blocks metadata/link-local, bad schemes, and junk', () => {
    expect(checkLlmBaseUrl('http://169.254.169.254/latest/meta-data/')).toMatch(/blocked/);
    expect(checkLlmBaseUrl('http://metadata.google.internal/')).toMatch(/blocked/);
    expect(checkLlmBaseUrl('http://0.0.0.0/v1')).toMatch(/blocked/);
    expect(checkLlmBaseUrl('file:///etc/passwd')).toMatch(/http/);
    expect(checkLlmBaseUrl('not a url')).toMatch(/valid URL/);
    expect(checkLlmBaseUrl(undefined)).toMatch(/Missing/);
  });
});
