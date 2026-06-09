import { Router } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadCategories,
  loadDomains,
  loadProfile,
  loadRoles,
  loadRoleTemplates,
  loadSources,
  profileDir,
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
  /** enabled source ids (exposed for the onboarding wizard) */
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
  /** does profile/judge-rubric.md exist? — the Fit/verdict filter shows only
   *  when the judge is on AND a rubric is present. */
  rubricExists: boolean;
  /** is the local `claude` CLI on PATH? (surfaced in the AI/LLM Settings tab so
   *  the user knows whether the claude-cli backend will work). Same detection as
   *  resumeGeneration, named for its own meaning. */
  claudeAvailable: boolean;
}

/** Pure builder (unit-tested); config read errors degrade to empty lists so a
 *  broken roles.yaml doesn't take the whole UI down with a 500. */
export function buildConfigPayload(): AppConfigPayload {
  let sources: string[] = [];
  let categories: string[] = [];
  let uiPrefs: AppConfigPayload['uiPrefs'] = {};
  let judgeEnabled = false;
  let rolesOk = false;
  let profileOk = false;
  // independent loads — a broken roles.yaml must not blank the profile data
  // (and vice-versa); each degrades on its own.
  try {
    rolesOk = loadRoles().length > 0;
  } catch {
    /* roles unreadable */
  }
  try {
    const profile = loadProfile();
    profileOk = true;
    uiPrefs = profile.uiPrefs;
    judgeEnabled = profile.llm.judge.enabled;
    // the aggregate `ats` pseudo-source stores per-provider ids on its rows
    sources = profile.enabledSources.flatMap((s) => (s === 'ats' ? ATS_SOURCE_IDS : [s]));
  } catch {
    /* profile unreadable — source filter degrades */
  }
  try {
    // The dropdown vocabulary = the taxonomy order plus the conventional
    // 'other' fallback bucket (the DB default for no-description jobs).
    categories = [...new Set([...loadCategories().order, 'other'])];
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
  const cliPresent = claudeAvailable();
  return {
    resumeGeneration: cliPresent,
    claudeAvailable: cliPresent,
    configured: profileOk && rolesOk,
    sources,
    availableSources,
    categories,
    domains,
    roleTemplates,
    uiPrefs,
    judgeEnabled,
    rubricExists: existsSync(join(profileDir(), 'judge-rubric.md')),
  };
}

export function configRouter(): Router {
  const r = Router();
  r.get('/', (_req, res) => res.json(buildConfigPayload()));
  return r;
}
