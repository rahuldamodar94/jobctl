import { describe, expect, test } from 'vitest';
import { buildRolesPrompt } from './prompt.js';
import { parseRolesDraft, extractJson } from './parse.js';

describe('buildRolesPrompt', () => {
  const base = { resume: 'RESUME TEXT', currentRole: '{"id":"x","title_keywords":["a"]}' };

  test('includes the resume, the current role, the preserve-titles rule, and a JSON-only contract', () => {
    const p = buildRolesPrompt(base);
    expect(p).toContain('RESUME TEXT');
    expect(p).toContain('"id":"x"');
    expect(p).toMatch(/PRESERVE them/);
    expect(p).toMatch(/Return ONLY a JSON object/);
    expect(p).toContain('nice_to_have');
  });

  test('refinement block only appears with an instruction or a draft', () => {
    expect(buildRolesPrompt(base)).not.toContain('REVISION INSTRUCTION');
    const refined = buildRolesPrompt({ ...base, instruction: 'weight fintech higher' });
    expect(refined).toContain('REVISION INSTRUCTION');
    expect(refined).toContain('weight fintech higher');
  });
});

describe('parseRolesDraft', () => {
  const valid = {
    id: 'engineering_manager',
    label: 'EM',
    title_keywords: ['engineering manager'],
    must_have_stack: ['typescript'],
    nice_to_have: { hiring: 5, mobile: -10 },
    title_exclude: ['frontend'],
    exclude_if_primary: ['java'],
  };

  test('parses a bare role object', () => {
    const r = parseRolesDraft(JSON.stringify(valid));
    expect(r.id).toBe('engineering_manager');
    expect(r.nice_to_have.hiring).toBe(5);
    expect(r.nice_to_have.mobile).toBe(-10);
  });

  test('parses a { roles: [role] } wrapper too', () => {
    expect(parseRolesDraft(JSON.stringify({ roles: [valid] })).id).toBe('engineering_manager');
  });

  test('survives code fences + chatter around the JSON', () => {
    const raw = 'Here you go:\n```json\n' + JSON.stringify(valid) + '\n```\nDone.';
    expect(parseRolesDraft(raw).label).toBe('EM');
  });

  test('applies the same schema defaults the loader does (missing optional fields)', () => {
    const minimal = { id: 'x', label: 'X', title_keywords: ['a'], must_have_stack: ['b'] };
    const r = parseRolesDraft(JSON.stringify(minimal));
    expect(r.title_exclude).toEqual([]);
    expect(r.nice_to_have).toEqual({});
    expect(r.exclude_if_primary).toEqual([]);
  });

  test('rejects output with no JSON object', () => {
    expect(() => parseRolesDraft('the model refused to answer')).toThrow(/no JSON/);
  });

  test('rejects a role missing required fields (would not load)', () => {
    expect(() => parseRolesDraft(JSON.stringify({ id: 'x' }))).toThrow(/validation/);
  });

  test('rejects empty title_keywords (schema requires at least one)', () => {
    expect(() => parseRolesDraft(JSON.stringify({ ...valid, title_keywords: [] }))).toThrow(/validation/);
  });
});

describe('extractJson', () => {
  test('balances braces that appear inside string values', () => {
    expect(extractJson('{"a":"x {y} z"}')).toBe('{"a":"x {y} z"}');
  });
  test('returns null when there is no object', () => {
    expect(extractJson('no braces here')).toBeNull();
  });
});
