import type { RoleTemplate } from './api.js';

/**
 * Pure assembly of a roles.yaml entry from the onboarding inputs — extracted so
 * the critical matching-config carry-over is unit-testable (the React component
 * isn't). When a template is chosen, its RICH config (weighted nice_to_have +
 * excludes) is carried into the role; the user-edited title keywords / stack
 * still win. Without nice_to_have the matcher caps every job at 60/100
 * (must_have 20 + geo 15 + seniority 10, normalized ×100/75).
 */

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';

export const toList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

export interface RoleEntry {
  id: string;
  label: string;
  lane: 'ic' | 'em';
  title_keywords: string[];
  must_have_stack: string[];
  title_exclude?: string[];
  nice_to_have?: Record<string, number>;
  exclude_if_primary?: string[];
}

export function buildRoleEntry(input: {
  label: string;
  lane: 'ic' | 'em';
  titleKeywords: string;
  stack: string;
  template?: RoleTemplate;
}): RoleEntry {
  const { label, lane, titleKeywords, stack, template } = input;
  return {
    id: slug(label),
    label: label.trim(),
    lane,
    title_keywords: toList(titleKeywords),
    must_have_stack: toList(stack),
    ...(template
      ? {
          title_exclude: template.titleExclude,
          nice_to_have: template.niceToHave,
          exclude_if_primary: template.excludeIfPrimary,
        }
      : {}),
  };
}
