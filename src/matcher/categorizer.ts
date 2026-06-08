import type { CategoriesConfig, Category } from '../shared/types.js';
import { containsTerm } from './matcher.js';

/**
 * Rule-based categorization: first category in `order` with a keyword hit wins.
 * Word-boundary matched — substring matching mislabeled payments companies as
 * defi via 'dex'⊂"index" and 'amm'⊂"programming" (2026-06-07 corpus audit).
 */
export function categorize(
  title: string,
  description: string | null,
  tags: string[],
  config: CategoriesConfig
): Category {
  const haystack = `${title} ${description ?? ''} ${tags.join(' ')}`.toLowerCase();
  for (const cat of config.order) {
    const keywords = config.keywords[cat];
    if (!keywords) continue; // e.g. web2 has no keywords — it's the default
    if (keywords.some((k) => containsTerm(haystack, k))) return cat;
  }
  return config.fallback;
}
