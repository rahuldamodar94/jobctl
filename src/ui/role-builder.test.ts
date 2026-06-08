import { describe, expect, test } from 'vitest';
import { buildRoleEntry, slug, toList } from './role-builder.js';
import type { RoleTemplate } from './api.js';

const TEMPLATE: RoleTemplate = {
  id: 'backend_engineer',
  label: 'Backend Engineer',
  group: 'Engineering',
  description: '',
  lane: 'ic',
  titleKeywords: ['backend engineer'],
  titleExclude: ['junior', 'intern'],
  mustHaveStack: ['python', 'golang'],
  niceToHave: { postgresql: 4, kafka: 4, 'distributed systems': 5 },
  excludeIfPrimary: ['rust'],
};

describe('buildRoleEntry', () => {
  test('REGRESSION: a chosen template carries nice_to_have + excludes (else score caps at 60)', () => {
    const role = buildRoleEntry({
      label: 'Backend Engineer',
      lane: 'ic',
      titleKeywords: 'backend engineer, senior backend',
      stack: 'python, node.js',
      template: TEMPLATE,
    });
    // user-edited keywords win
    expect(role.title_keywords).toEqual(['backend engineer', 'senior backend']);
    expect(role.must_have_stack).toEqual(['python', 'node.js']);
    // rich matching config carried from the template
    expect(role.nice_to_have).toEqual({ postgresql: 4, kafka: 4, 'distributed systems': 5 });
    expect(role.title_exclude).toEqual(['junior', 'intern']);
    expect(role.exclude_if_primary).toEqual(['rust']);
    expect(role.id).toBe('backend_engineer');
  });

  test('custom (no template) → only the edited fields, no empty advanced keys', () => {
    const role = buildRoleEntry({ label: 'My Custom Role', lane: 'em', titleKeywords: 'lead', stack: 'go' });
    expect(role).toEqual({
      id: 'my_custom_role',
      label: 'My Custom Role',
      lane: 'em',
      title_keywords: ['lead'],
      must_have_stack: ['go'],
    });
    expect(role.nice_to_have).toBeUndefined();
  });

  test('slug + toList helpers', () => {
    expect(slug('Senior Backend Engineer!')).toBe('senior_backend_engineer');
    expect(slug('   ')).toBe('role');
    expect(toList('a, b ,, c')).toEqual(['a', 'b', 'c']);
  });
});
