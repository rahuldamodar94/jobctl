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

// ---------------------------------------------------------------------------
// Profile patch (domains + geo only) — the LLM tunes which slice of the registry
// to scrape and the location preferences; everything else in profile.yaml is
// left untouched and merged on save.
// ---------------------------------------------------------------------------

export interface DraftProfilePatch {
  domains: string[];
  geo_priority: string[];
  geo_relocation_ok: string[];
}

const profilePatchSchema = z.object({
  domains: z.array(z.string()).default([]),
  geo_priority: z.array(z.string()).default([]),
  geo_relocation_ok: z.array(z.string()).default([]),
});

const cleanList = (xs: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
};

/**
 * Parse a drafted profile patch. Domain ids are filtered to the committed
 * vocabulary (unknown ids dropped, not fatal); at least one valid domain is
 * required. geo lists are trimmed + de-duped. Throws on unrecoverable output.
 */
export function parseProfileDraft(raw: string, validDomainIds: string[]): DraftProfilePatch {
  const json = extractJson(raw);
  if (!json) throw new Error('no JSON object found in the model output');
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new Error(`model output is not valid JSON: ${(e as Error).message}`);
  }
  const r = profilePatchSchema.safeParse(obj);
  if (!r.success) {
    throw new Error(
      'drafted profile failed validation: ' +
        r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    );
  }
  const valid = new Set(validDomainIds.map((d) => d.toLowerCase()));
  const domains = cleanList(r.data.domains).filter((d) => valid.has(d.toLowerCase()));
  if (!domains.length) {
    throw new Error('no valid domains in the draft (ids must come from the domain vocabulary)');
  }
  return {
    domains,
    geo_priority: cleanList(r.data.geo_priority),
    geo_relocation_ok: cleanList(r.data.geo_relocation_ok),
  };
}
