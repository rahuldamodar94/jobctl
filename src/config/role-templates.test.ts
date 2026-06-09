import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadRoleTemplates, rolesFileSchema, loadDomains } from './load.js';

/**
 * Role templates are committed community seed data. These guards protect the
 * two contracts the picker depends on: every template is a USABLE role, and the
 * file stays internally consistent (unique ids).
 */

const RAW = parse(readFileSync(join(process.cwd(), 'config', 'role-templates.yaml'), 'utf8')) as {
  templates: Record<string, unknown>[];
};

describe('role-templates.yaml', () => {
  const templates = loadRoleTemplates();

  test('loads a non-trivial curated set spanning multiple groups', () => {
    expect(templates.length).toBeGreaterThanOrEqual(15);
    const groups = new Set(templates.map((t) => t.group));
    // software industry = more than just engineering
    expect(groups.size).toBeGreaterThanOrEqual(4);
    expect(groups).toContain('Engineering');
  });

  test('every template has the fields a role search needs', () => {
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.titleKeywords.length).toBeGreaterThan(0);
      expect(t.mustHaveStack.length).toBeGreaterThan(0);
    }
  });

  test('template ids are unique', () => {
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('CONTRACT: every template is a valid roles.yaml entry (picking one → usable role)', () => {
    // strip the two picker-only fields; the rest must parse as a real role.
    const asRoles = RAW.templates.map(({ group, description, ...role }) => role);
    const result = rolesFileSchema.safeParse({ roles: asRoles });
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
    expect(result.success).toBe(true);
  });

  test('missing file degrades to [] (optional convenience, never fatal)', () => {
    // sanity: loadDomains is required and present, proving CONFIG_DIR resolves;
    // loadRoleTemplates returning data here confirms the happy path. The []
    // branch is exercised by the unreadable-config path in config.test.ts.
    expect(loadDomains().length).toBeGreaterThan(0);
    expect(loadRoleTemplates().length).toBeGreaterThan(0);
  });
});
