/**
 * YAML config loaders — the only place config files are read.
 * Every file is validated with zod; a bad config fails fast with a friendly,
 * path-specific message instead of a stack trace deep in the scraper.
 * All keyword/geo strings are lowercased ONCE here so the matcher can do
 * plain case-insensitive substring checks everywhere.
 * PROFILE_DIR/CONFIG_DIR env vars exist for tests (and non-default install layouts).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type {
  CategoriesConfig,
  CompanyConfig,
  ProfileConfig,
  RoleConfig,
  SourceConfig,
} from '../shared/types.js';

const ROOT = process.cwd();
const PROFILE_DIR = process.env.PROFILE_DIR ?? join(ROOT, 'profile');
const CONFIG_DIR = process.env.CONFIG_DIR ?? join(ROOT, 'config');

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// http(s) only — z.string().url() alone also accepts file:/javascript:/etc.
// Used for careers_url, board base_url, and LLM base_url (all eventually fetched).
const httpUrl = () => z.string().url().refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL');

const roleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // career lane — drives the UI's IC/EM role filter (default ic = most roles)
  lane: z.enum(['ic', 'em']).default('ic'),
  title_keywords: z.array(z.string().min(1)).min(1),
  title_exclude: z.array(z.string()).default([]),
  must_have_stack: z.array(z.string().min(1)).min(1),
  nice_to_have: z.record(z.string(), z.number()).default({}),
  exclude_if_primary: z.array(z.string()).default([]),
  // location preference is profile-level now (profile.yaml geo_priority); any
  // legacy per-role geo_* keys are harmlessly ignored.
});

export const rolesFileSchema = z.object({ roles: z.array(roleSchema).min(1) });

// Role templates (config/role-templates.yaml) are roles plus two picker-only
// fields. A template is, by construction, a valid roles.yaml entry — picking one
// prefills a role the user then edits.
const roleTemplateSchema = roleSchema.extend({
  group: z.string().min(1).default('Other'),
  description: z.string().default(''),
});
export const roleTemplatesFileSchema = z.object({ templates: z.array(roleTemplateSchema).min(1) });

const companySchema = z.object({
  name: z.string().min(1),
  careers_url: httpUrl(),
  provider: z.enum(['greenhouse', 'lever', 'ashby']).optional(),
  enabled: z.boolean().default(true),
});

/** Committed registry entries additionally carry domain tags. */
const registryEntrySchema = companySchema.extend({
  domains: z.array(z.string().min(1)).min(1),
});

const registryFileSchema = z.object({ companies: z.array(registryEntrySchema).default([]) });

export const profileSchema = z.object({
  name: z.string().min(1),
  max_age_days: z.number().int().positive().default(30),
  inactive_after_days: z.number().int().positive().default(14),
  enabled_sources: z.array(z.string()).min(1),
  // Location preference (applies to all roles). 'remote' is a normal entry.
  geo_priority: z.array(z.string()).default([]),
  geo_relocation_ok: z.array(z.string()).default([]),
  resumes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        file: z.string(),
        // designates this resume as the IC or EM base for resume generation
        base: z.enum(['ic', 'em']).optional(),
      })
    )
    .default([]),
  // categories the user never wants matched (e.g. [ai])
  exclude_categories: z.array(z.string()).default([]),
  // resume-generation guardrails (e.g. NDA'd employer names)
  resume_rules: z
    .object({ forbidden_terms: z.array(z.string().min(1)).default([]) })
    .default({ forbidden_terms: [] }),
  // default triage-filter preferences (seed the UI's default view)
  ui_prefs: z
    .object({
      default_min_score: z.number().int().nonnegative().optional(),
      default_posted_within: z.number().int().positive().optional(),
    })
    .default({}),
  // optional LLM features (resume gen + fit-judge). backends is a registry;
  // judge/resume select one by name. API keys live in env (api_key_env), never
  // here. Default: judge disabled, resume on the local claude CLI.
  llm: z
    .object({
      backends: z
        .record(
          z.string(),
          z.object({
            engine: z.enum(['claude-cli', 'openai-compatible']),
            model: z.string().optional(),
            base_url: httpUrl().optional(),
            api_key_env: z.string().optional(),
          })
        )
        .default({}),
      // min_score gates the auto/scrape judge run to higher-match jobs — the LLM
      // is the costly layer. Default 50: in this corpus STRONG verdicts appear as
      // low as score 56, so a higher floor would starve real fits; the matcher
      // score only weakly predicts the verdict. The Re-judge button bypasses this.
      judge: z
        .object({
          enabled: z.boolean().default(false),
          backend: z.string().default('claude-cli'),
          min_score: z.number().int().nonnegative().default(50),
        })
        .default({ enabled: false, backend: 'claude-cli', min_score: 50 }),
      resume: z.object({ backend: z.string().default('claude-cli') }).default({ backend: 'claude-cli' }),
    })
    .default({
      backends: {},
      judge: { enabled: false, backend: 'claude-cli', min_score: 50 },
      resume: { backend: 'claude-cli' },
    }),
  // Which slices of the committed company registry to scrape, plus personal
  // additions/removals. Empty domains + empty include = ats source is a no-op.
  companies: z
    .object({
      domains: z.array(z.string()).default([]),
      include: z.array(companySchema).default([]),
      exclude: z.array(z.string()).default([]),
    })
    .default({ domains: [], include: [], exclude: [] }),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['api', 'html', 'rss']),
  base_url: httpUrl(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const sourcesFileSchema = z.object({ sources: z.array(sourceSchema).min(1) });

// Categories are free strings — the taxonomy is user data, not product code.
// (A gamedev can ship order: [gaming, web2, other] with their own keywords.)
export const categoriesSchema = z
  .object({
    order: z.array(z.string().min(1)).min(1),
    // category assigned when no keyword list matches
    fallback: z.string().min(1).default('other'),
    keywords: z.record(z.string(), z.array(z.string())),
  })
  .superRefine((c, ctx) => {
    for (const k of Object.keys(c.keywords)) {
      if (!c.order.includes(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['keywords', k],
          message: `keywords key '${k}' is not listed in order — typo?`,
        });
      }
    }
    if (c.fallback !== 'other' && !c.order.includes(c.fallback)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallback'],
        message: `fallback '${c.fallback}' is not listed in order`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadYaml<S extends z.ZodTypeAny>(path: string, schema: S, what: string): z.output<S> {
  if (!existsSync(path)) {
    throw new ConfigError(
      `${what} not found at ${path}.\n` +
        `If this is a fresh checkout: cp -r profile.example profile && edit the files inside.`
    );
  }
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`${what} (${path}) is not valid YAML: ${(e as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`${what} (${path}) failed validation:\n${issues}`);
  }
  return result.data;
}

export class ConfigError extends Error {}

export function loadRoles(): RoleConfig[] {
  const f = loadYaml(join(PROFILE_DIR, 'roles.yaml'), rolesFileSchema, 'roles.yaml');
  return f.roles.map((r) => ({
    id: r.id,
    label: r.label,
    lane: r.lane,
    titleKeywords: r.title_keywords.map(lc),
    titleExclude: r.title_exclude.map(lc),
    mustHaveStack: r.must_have_stack.map(lc),
    niceToHave: lowercaseKeys(r.nice_to_have),
    excludeIfPrimary: r.exclude_if_primary.map(lc),
    // geo is profile-level — the scraper injects it from the profile before matching
    geoPriority: [],
    geoRelocationOk: [],
  }));
}

export function loadProfile(): ProfileConfig {
  const p = loadYaml(join(PROFILE_DIR, 'profile.yaml'), profileSchema, 'profile.yaml');
  return {
    name: p.name,
    maxAgeDays: p.max_age_days,
    inactiveAfterDays: p.inactive_after_days,
    enabledSources: p.enabled_sources,
    geoPriority: p.geo_priority.map(lc),
    geoRelocationOk: p.geo_relocation_ok.map(lc),
    resumes: p.resumes,
    excludeCategories: p.exclude_categories,
    resumeRules: { forbiddenTerms: p.resume_rules.forbidden_terms },
    uiPrefs: {
      defaultMinScore: p.ui_prefs.default_min_score,
      defaultPostedWithin: p.ui_prefs.default_posted_within,
    },
    llm: {
      backends: p.llm.backends,
      judge: p.llm.judge,
      resume: p.llm.resume,
    },
    companies: p.companies,
  };
}

/**
 * Companies to scrape = committed registry (config/companies.yaml) filtered by
 * the profile's selected domains, minus profile excludes, plus profile includes.
 * The registry is community data; the profile holds only the user's selection.
 */
export function loadCompanies(): CompanyConfig[] {
  const selection = loadProfile().companies;

  const registryPath = join(CONFIG_DIR, 'companies.yaml');
  const registry = existsSync(registryPath)
    ? loadYaml(registryPath, registryFileSchema, 'config/companies.yaml').companies
    : [];

  const excluded = new Set(selection.exclude.map((n) => n.toLowerCase()));
  const wanted = new Set(selection.domains);

  const fromRegistry = registry.filter(
    (c) =>
      c.enabled &&
      !excluded.has(c.name.toLowerCase()) &&
      c.domains.some((d) => wanted.has(d))
  );

  const personal = selection.include.filter((c) => c.enabled);

  return [...fromRegistry, ...personal].map((c) => ({
    name: c.name,
    careersUrl: c.careers_url,
    provider: c.provider,
    enabled: c.enabled,
  }));
}

export function loadSources(): SourceConfig[] {
  const f = loadYaml(join(CONFIG_DIR, 'sources.yaml'), sourcesFileSchema, 'sources.yaml');
  return f.sources.map((s) => ({
    id: s.id,
    label: s.label,
    kind: s.kind,
    baseUrl: s.base_url,
    options: s.options,
  }));
}

export function loadCategories(): CategoriesConfig {
  // profile override wins over the committed default
  const override = join(PROFILE_DIR, 'categories.yaml');
  const path = existsSync(override) ? override : join(CONFIG_DIR, 'categories.yaml');
  const c = loadYaml(path, categoriesSchema, 'categories.yaml');
  return { order: c.order, fallback: c.fallback, keywords: lowercaseValueArrays(c.keywords) };
}

// Canonical software-industry domain vocabulary (config/domains.yaml). Drives the
// onboarding/Settings domain picker and validates registry/profile domain tags.
const domainSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
});
const domainsFileSchema = z.object({ domains: z.array(domainSchema).min(1) });
export interface DomainConfig {
  id: string;
  label: string;
  description: string;
}

export function loadDomains(): DomainConfig[] {
  return loadYaml(join(CONFIG_DIR, 'domains.yaml'), domainsFileSchema, 'domains.yaml').domains;
}

// Curated role-search templates (config/role-templates.yaml) — seed data the
// onboarding/Settings picker copies into roles.yaml. Keywords are kept
// AS-AUTHORED (not lowercased) for readable prefill; loadRoles lowercases when
// the chosen template becomes a real role. Optional file → [] when absent.
export interface RoleTemplateConfig {
  id: string;
  label: string;
  group: string;
  description: string;
  lane: 'ic' | 'em';
  titleKeywords: string[];
  titleExclude: string[];
  mustHaveStack: string[];
  niceToHave: Record<string, number>;
  excludeIfPrimary: string[];
}

export function loadRoleTemplates(): RoleTemplateConfig[] {
  const path = join(CONFIG_DIR, 'role-templates.yaml');
  if (!existsSync(path)) return [];
  const f = loadYaml(path, roleTemplatesFileSchema, 'config/role-templates.yaml');
  return f.templates.map((t) => ({
    id: t.id,
    label: t.label,
    group: t.group,
    description: t.description,
    lane: t.lane,
    titleKeywords: t.title_keywords,
    titleExclude: t.title_exclude,
    mustHaveStack: t.must_have_stack,
    niceToHave: t.nice_to_have,
    excludeIfPrimary: t.exclude_if_primary,
  }));
}

export function profileDir(): string {
  return PROFILE_DIR;
}

// trim + lowercase: stray whitespace in YAML entries must not change matching
const lc = (s: string) => s.trim().toLowerCase();

function lowercaseKeys(o: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
}

function lowercaseValueArrays(o: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(lc)]));
}
