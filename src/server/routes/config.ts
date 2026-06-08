import { Router } from 'express';
import {
  loadCategories,
  loadDomains,
  loadProfile,
  loadRoles,
  loadRoleTemplates,
  loadSources,
  type DomainConfig,
  type RoleTemplateConfig,
} from '../../config/load.js';
import { ATS_SOURCE_IDS } from '../../scraper/run.js';
import { claudeAvailable } from '../../resume/generate.js';

/**
 * GET /api/config — capability flags + the user's actual config vocabulary,
 * so the UI never hardcodes role ids / source ids / category names (they are
 * personal/config data, not product constants).
 */
export interface AppConfigPayload {
  resumeGeneration: boolean;
  /** false on a fresh install (no/invalid profile.yaml) → UI shows onboarding. */
  configured: boolean;
  roles: { id: string; label: string; lane: 'ic' | 'em' }[];
  /** enabled source ids (for the source filter dropdown) */
  sources: string[];
  /** ALL available source ids incl. 'ats' (for the onboarding wizard) */
  availableSources: string[];
  categories: string[];
  /** canonical software-industry domain vocabulary (onboarding/Settings picker) */
  domains: DomainConfig[];
  /** curated role-search templates (onboarding/Settings role picker) */
  roleTemplates: RoleTemplateConfig[];
  /** default triage-filter prefs that seed the UI's default view */
  uiPrefs: { defaultMinScore?: number; defaultPostedWithin?: number };
  /** is the advisory fit-judge turned on? (UI shows verdict chips + re-judge) */
  judgeEnabled: boolean;
}

/** Pure builder (unit-tested); config read errors degrade to empty lists so a
 *  broken roles.yaml doesn't take the whole UI down with a 500. */
export function buildConfigPayload(): AppConfigPayload {
  let roles: AppConfigPayload['roles'] = [];
  let sources: string[] = [];
  let categories: string[] = [];
  let uiPrefs: AppConfigPayload['uiPrefs'] = {};
  let judgeEnabled = false;
  let rolesOk = false;
  let profileOk = false;
  // independent loads — a broken roles.yaml must not blank the profile data
  // (and vice-versa); each degrades on its own.
  try {
    roles = loadRoles().map((r) => ({ id: r.id, label: r.label, lane: r.lane }));
    rolesOk = roles.length > 0;
  } catch {
    /* roles unreadable — role filter degrades */
  }
  let excluded = new Set<string>();
  try {
    const profile = loadProfile();
    profileOk = true;
    uiPrefs = profile.uiPrefs;
    judgeEnabled = profile.llm.judge.enabled;
    excluded = new Set(profile.excludeCategories);
    // the aggregate `ats` pseudo-source stores per-provider ids on its rows
    sources = profile.enabledSources.flatMap((s) => (s === 'ats' ? ATS_SOURCE_IDS : [s]));
  } catch {
    /* profile unreadable — source/category filters degrade */
  }
  try {
    // drop categories the user excluded — listing them in the filter is just
    // confusing (their jobs are unmatched and never appear in the matched view)
    categories = loadCategories().order.filter((c) => !excluded.has(c));
  } catch {
    /* categories unreadable */
  }
  let availableSources: string[] = [];
  try {
    availableSources = [...loadSources().map((s) => s.id), 'ats'];
  } catch {
    /* committed sources.yaml unreadable — wizard source list degrades */
  }
  let domains: DomainConfig[] = [];
  try {
    domains = loadDomains();
  } catch {
    /* committed domains.yaml unreadable — domain picker degrades */
  }
  let roleTemplates: RoleTemplateConfig[] = [];
  try {
    roleTemplates = loadRoleTemplates();
  } catch {
    /* committed role-templates.yaml unreadable — role picker degrades */
  }
  // "configured" = a usable setup: the app needs both a profile and ≥1 role.
  return {
    resumeGeneration: claudeAvailable(),
    configured: profileOk && rolesOk,
    roles,
    sources,
    availableSources,
    categories,
    domains,
    roleTemplates,
    uiPrefs,
    judgeEnabled,
  };
}

export function configRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => res.json(buildConfigPayload()));
  return r;
}
