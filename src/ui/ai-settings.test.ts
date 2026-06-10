import { describe, expect, test } from 'vitest';
import { buildLlmBlock } from './components/Settings.js';
import { profileSchema } from '../config/load.js';

/**
 * The AI/LLM Settings form writes the profile.yaml `llm` block. Its keys MUST be
 * snake_case so the SAME profileSchema the loader/PUT-route use accepts it (the
 * spec's failure mode: a UI that writes camelCase or drops fields → rejected or
 * silently wrong). These assert the pure builder round-trips through the schema.
 */

// Minimal valid profile the form would be editing.
const baseProfile = { name: 'Test', enabled_sources: ['ats'] };

describe('buildLlmBlock (AI/LLM Settings tab)', () => {
  test('claude-cli engine: enabling the judge produces a schema-valid llm block', () => {
    const llm = buildLlmBlock(
      {},
      { engine: 'claude-cli', model: '', baseUrl: '', apiKeyEnv: '', judgeEnabled: true, minScore: 60 }
    );
    expect(llm.backends?.['claude-cli']).toEqual({ engine: 'claude-cli' });
    expect(llm.judge).toEqual({ enabled: true, backend: 'claude-cli', min_score: 60 });

    const parsed = profileSchema.safeParse({ ...baseProfile, llm });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.llm.judge.enabled).toBe(true);
      expect(parsed.data.llm.judge.min_score).toBe(60);
    }
  });

  test('openai-compatible engine carries model/base_url/api_key_env (snake_case)', () => {
    const llm = buildLlmBlock(
      {},
      {
        engine: 'openai-compatible',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        judgeEnabled: true,
        minScore: 50,
      }
    );
    expect(llm.backends?.['claude-cli']).toEqual({
      engine: 'openai-compatible',
      model: 'gpt-4o-mini',
      base_url: 'https://api.openai.com/v1',
      api_key_env: 'OPENAI_API_KEY',
    });
    expect(profileSchema.safeParse({ ...baseProfile, llm }).success).toBe(true);
  });

  test('claude-cli engine omits the openai-only fields even if they were typed', () => {
    const llm = buildLlmBlock(
      {},
      { engine: 'claude-cli', model: 'leftover', baseUrl: 'http://x', apiKeyEnv: 'K', judgeEnabled: false, minScore: 50 }
    );
    expect(llm.backends?.['claude-cli']).toEqual({ engine: 'claude-cli' });
  });

  test('pre-existing backends and resume config are preserved', () => {
    const prev = {
      backends: { 'my-gemini': { engine: 'openai-compatible' as const, model: 'gemini-2.0' } },
      resume: { backend: 'my-gemini' },
    };
    const llm = buildLlmBlock(prev, {
      engine: 'claude-cli',
      model: '',
      baseUrl: '',
      apiKeyEnv: '',
      judgeEnabled: true,
      minScore: 50,
    });
    // existing backend untouched, ours added, resume kept
    expect(llm.backends?.['my-gemini']).toEqual({ engine: 'openai-compatible', model: 'gemini-2.0' });
    expect(llm.backends?.['claude-cli']).toEqual({ engine: 'claude-cli' });
    expect(llm.resume).toEqual({ backend: 'my-gemini' });
    expect(profileSchema.safeParse({ ...baseProfile, llm }).success).toBe(true);
  });

  test('per-feature model overrides land on judge.model and resume.model', () => {
    const llm = buildLlmBlock(
      {},
      { engine: 'claude-cli', model: '', baseUrl: '', apiKeyEnv: '', judgeEnabled: true, minScore: 50, judgeModel: 'haiku', writingModel: 'sonnet' }
    );
    expect(llm.judge?.model).toBe('haiku');
    expect(llm.resume?.model).toBe('sonnet');
    const parsed = profileSchema.safeParse({ ...baseProfile, llm });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.llm.judge.model).toBe('haiku');
      expect(parsed.data.llm.resume.model).toBe('sonnet');
    }
  });

  test('blank model overrides clear the field (no model key persisted)', () => {
    const prev = { judge: { model: 'haiku' }, resume: { backend: 'claude-cli', model: 'sonnet' } };
    const llm = buildLlmBlock(prev, {
      engine: 'claude-cli', model: '', baseUrl: '', apiKeyEnv: '', judgeEnabled: true, minScore: 50, judgeModel: '', writingModel: '',
    });
    expect(llm.judge?.model).toBeUndefined();
    expect(llm.resume?.model).toBeUndefined();
  });
});
