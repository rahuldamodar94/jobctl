import { describe, expect, test, afterEach, vi } from 'vitest';
import { testLlmConnection } from './test-connection.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TEST_API_KEY;
});

const mockFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch
  );

describe('testLlmConnection (openai-compatible) — error mapping', () => {
  test('missing base_url', async () => {
    expect((await testLlmConnection({ engine: 'openai-compatible', model: 'm' })).error).toMatch(/base_url/i);
  });
  test('missing model', async () => {
    expect((await testLlmConnection({ engine: 'openai-compatible', base_url: 'https://x/v1' })).error).toMatch(/model/i);
  });
  test('api_key_env named but not set in server env → names the var', async () => {
    const r = await testLlmConnection({ engine: 'openai-compatible', base_url: 'https://x/v1', model: 'm', api_key_env: 'TEST_API_KEY' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/TEST_API_KEY/);
  });
  test('401 → auth hint', async () => {
    process.env.TEST_API_KEY = 'sk-bad';
    mockFetch(401, { error: 'invalid key' });
    const r = await testLlmConnection({ engine: 'openai-compatible', base_url: 'https://x/v1', model: 'm', api_key_env: 'TEST_API_KEY' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/auth rejected|401/i);
  });
  test('200 with chat-completions shape → ok', async () => {
    process.env.TEST_API_KEY = 'sk-good';
    mockFetch(200, { choices: [{ message: { content: 'OK' } }] });
    const r = await testLlmConnection({ engine: 'openai-compatible', base_url: 'https://x/v1', model: 'm', api_key_env: 'TEST_API_KEY' });
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
  test('200 but wrong shape → not-ok with a clear reason', async () => {
    process.env.TEST_API_KEY = 'sk-good';
    mockFetch(200, { unexpected: true });
    const r = await testLlmConnection({ engine: 'openai-compatible', base_url: 'https://x/v1', model: 'm', api_key_env: 'TEST_API_KEY' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/shape|chat-completions/i);
  });
});
