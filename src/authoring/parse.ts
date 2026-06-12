import { z } from 'zod';
import { rolesFileSchema } from '../config/load.js';

/**
 * Parse + validate an LLM-drafted role config. The model returns JSON (the
 * structured counterpart to the markdown rubric/skill authoring); we validate it
 * against the SAME schema the loader and the PUT /roles writer use, so a draft
 * that wouldn't load is rejected here and never reaches disk. Throws on
 * unrecoverable output — the caller retries once, then surfaces the error.
 */

/** The validated snake_case role shape (ready to save via PUT /roles). */
export interface DraftRole {
  id: string;
  label: string;
  title_keywords: string[];
  title_exclude: string[];
  must_have_stack: string[];
  nice_to_have: Record<string, number>;
  exclude_if_primary: string[];
}

/**
 * Pull the first complete top-level {...} object out of text. String-aware brace
 * balancing → robust to ```json fences, leading/trailing chatter, and braces
 * inside JSON string values. (Mirrors the judge's extractor; kept local so the
 * authoring module doesn't depend on judge internals.)
 */
export function extractJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  return null; // unbalanced (truncated output) → caller retries / fails
}

/**
 * Parse a drafted role. Accepts either a bare role object or a `{ roles: [role] }`
 * wrapper (models do both). Validates through rolesFileSchema, which applies the
 * same defaults/coercions the loader does. Returns the single role.
 */
export function parseRolesDraft(raw: string): DraftRole {
  const json = extractJson(raw);
  if (!json) throw new Error('no JSON object found in the model output');
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new Error(`model output is not valid JSON: ${(e as Error).message}`);
  }
  const wrapped =
    obj && typeof obj === 'object' && Array.isArray((obj as { roles?: unknown }).roles)
      ? (obj as object)
      : { roles: [obj] };
  const result = rolesFileSchema.safeParse(wrapped);
  if (!result.success) {
    throw new Error(
      'drafted role failed validation: ' +
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    );
  }
  return result.data.roles[0] as DraftRole;
}

