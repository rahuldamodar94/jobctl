import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * Integrity guards over the committed config DATA (not the loaders): the company
 * registry and the category taxonomy must only use ids from the canonical
 * domain vocabulary (config/domains.yaml). Catches drift when someone adds a
 * company or category with an off-list / typo'd tag.
 */
const root = process.cwd();
const read = (p: string) => parse(readFileSync(join(root, p), 'utf8'));

const domains = (read('config/domains.yaml').domains as { id: string }[]).map((d) => d.id);
const vocab = new Set(domains);

describe('domain vocabulary integrity', () => {
  test('domains.yaml defines the 12 core software-industry domains', () => {
    expect(domains).toEqual([
      'ai-ml', 'fintech', 'crypto', 'cloud-infra', 'devtools', 'security',
      'data', 'saas', 'gaming', 'consumer', 'ecommerce', 'healthtech',
    ]);
  });

  test('every company registry tag is in the vocabulary (no drift/typos)', () => {
    const companies = read('config/companies.yaml').companies as { name: string; domains?: string[] }[];
    const offenders = companies.flatMap((c) =>
      (c.domains ?? []).filter((d) => !vocab.has(d)).map((d) => `${c.name}: "${d}"`)
    );
    expect(offenders).toEqual([]);
  });

  test('default category ids are a subset of the domain vocabulary', () => {
    const cats = read('config/categories.yaml');
    const ids = [...cats.order, cats.fallback];
    expect(ids.filter((c: string) => !vocab.has(c))).toEqual([]);
  });
});
