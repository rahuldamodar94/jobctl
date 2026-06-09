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

/**
 * Custom-role (no template) nice_to_have synthesis. Without ANY nice_to_have the
 * matcher's raw max is 20+0+15+10=45 → ×100/75 = 60, so the user's best job ever
 * scores 60 and a `Score ≥ 70` filter is empty forever (the same class of bug v3
 * fixed for the template path). We derive a modest weighted nice_to_have from the
 * user's own signal — stack terms (the things they care about) plus an optional
 * comma-separated list they type — so a genuinely strong JD can clear ~85-100.
 * Weights are deliberately small (a few hits already saturate the 30-pt cap);
 * stack terms are also must-haves, so a JD mentioning them scores on BOTH axes.
 */
const CUSTOM_NICE_WEIGHT = 6;

export function deriveCustomNiceToHave(stack: string[], extra: string[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const term of [...stack, ...extra]) {
    const t = term.trim().toLowerCase();
    if (t) out[t] = CUSTOM_NICE_WEIGHT;
  }
  return out;
}

export function buildRoleEntry(input: {
  label: string;
  lane: 'ic' | 'em';
  titleKeywords: string;
  stack: string;
  /** custom-role only: optional comma-separated extra nice-to-have terms */
  niceToHave?: string;
  template?: RoleTemplate;
}): RoleEntry {
  const { label, lane, titleKeywords, stack, niceToHave, template } = input;
  const stackList = toList(stack);
  return {
    id: slug(label),
    label: label.trim(),
    lane,
    title_keywords: toList(titleKeywords),
    must_have_stack: stackList,
    ...(template
      ? {
          title_exclude: template.titleExclude,
          nice_to_have: template.niceToHave,
          exclude_if_primary: template.excludeIfPrimary,
        }
      : {
          // Custom role: synthesize nice_to_have so scores span 0-100, not 0-60.
          nice_to_have: deriveCustomNiceToHave(stackList, toList(niceToHave ?? '')),
        }),
  };
}
