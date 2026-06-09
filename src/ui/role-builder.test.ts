import { describe, expect, test } from 'vitest';
import { buildRoleEntry, deriveCustomNiceToHave, slug, toList } from './role-builder.js';
import type { RoleTemplate } from './api.js';
import { matchJob } from '../matcher/matcher.js';
import type { RoleConfig } from '../shared/types.js';

const TEMPLATE: RoleTemplate = {
  id: 'backend_engineer',
  label: 'Backend Engineer',
  group: 'Engineering',
  description: '',
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

  test('custom (no template) → synthesizes a nice_to_have from the stack (so scores span 0-100, not capped at 60)', () => {
    const role = buildRoleEntry({ label: 'My Custom Role', titleKeywords: 'lead', stack: 'go, kubernetes' });
    expect(role.id).toBe('my_custom_role');
    expect(role.title_keywords).toEqual(['lead']);
    expect(role.must_have_stack).toEqual(['go', 'kubernetes']);
    // derived from the stack so the matcher isn't starved
    expect(role.nice_to_have).toEqual({ go: 6, kubernetes: 6 });
    // template-only advanced keys stay absent for a custom role
    expect(role.title_exclude).toBeUndefined();
    expect(role.exclude_if_primary).toBeUndefined();
  });

  test('custom + explicit nice_to_have field merges with the stack-derived terms', () => {
    const role = buildRoleEntry({
      label: 'Platform Eng',
      titleKeywords: 'platform',
      stack: 'go',
      niceToHave: 'terraform, aws',
    });
    expect(role.nice_to_have).toEqual({ go: 6, terraform: 6, aws: 6 });
  });

  test('deriveCustomNiceToHave dedupes + lowercases + drops blanks', () => {
    expect(deriveCustomNiceToHave(['Go', ' '], ['go', 'AWS'])).toEqual({ go: 6, aws: 6 });
  });

  test('REGRESSION: a custom role can exceed 60 on a genuinely strong JD (was hard-capped at 60)', () => {
    const entry = buildRoleEntry({
      label: 'Backend Wizard',
      titleKeywords: 'backend engineer',
      stack: 'go, kubernetes, postgres',
    });
    const role: RoleConfig = {
      id: entry.id,
      label: entry.label,
      titleKeywords: entry.title_keywords,
      titleExclude: entry.title_exclude ?? [],
      mustHaveStack: entry.must_have_stack,
      niceToHave: entry.nice_to_have ?? {},
      excludeIfPrimary: entry.exclude_if_primary ?? [],
      geoPriority: ['remote'],
      geoRelocationOk: [],
    };
    const strong = matchJob(
      {
        title: 'Senior Backend Engineer',
        description:
          'We are hiring a senior backend engineer. You will write Go services, run Kubernetes clusters, and own our Postgres databases. Remote-friendly across the team. ' +
          'You will design distributed systems with Go, scale Kubernetes, and tune Postgres for high throughput. '.repeat(3),
        tags: [],
        location: 'Remote',
      },
      [role]
    );
    expect(strong.isMatch).toBe(true);
    // must-have(20) + nice(go/k8s/postgres ×6 = 18) + geo remote(15) + seniority(10)
    // = 63 raw → ×100/75 = 84 — comfortably above the old 60 ceiling and the 70 filter.
    expect(strong.score).toBeGreaterThan(70);
  });

  test('slug + toList helpers', () => {
    expect(slug('Senior Backend Engineer!')).toBe('senior_backend_engineer');
    expect(slug('   ')).toBe('role');
    expect(toList('a, b ,, c')).toEqual(['a', 'b', 'c']);
  });
});
