// ---------------------------------------------------------------------------
// Core domain types — the contracts between sources, matcher, db, and UI.
// ---------------------------------------------------------------------------

/** A job as returned by a source adapter, before dedupe/scoring/persistence. */
export interface RawJob {
  /** Stable id within the source (board's own id, ATS posting id, or URL). */
  externalId: string;
  sourceId: string;
  company: string;
  title: string;
  /** Raw location string as the source shows it ("Remote — EMEA", "Dubai, UAE"). */
  location: string | null;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  salaryText: string | null;
  /** Full JD when the source provides it; null/short for HTML list pages. */
  description: string | null;
  url: string;
  tags: string[];
  /** Absolute date (ISO yyyy-mm-dd). Adapters convert relative dates ("5d") at scrape time. */
  postedDate: string | null;
}

export type JobStatus = 'new' | 'interested' | 'applied' | 'rejected' | 'dismissed';

/**
 * Ordered ranks — dedupe merges never downgrade to a less-advanced status.
 * rejected/dismissed deliberately tie: both are terminal, and neither should
 * silently overwrite the other during a merge (an explicit setStatus can).
 */
export const STATUS_RANK: Record<JobStatus, number> = {
  new: 0,
  interested: 1,
  applied: 2,
  rejected: 3,
  dismissed: 3,
};

/** Free string — the taxonomy lives in categories.yaml (user-extendable),
 *  not in code. 'other' is the only conventional value (DB default +
 *  no-description fallback). */
export type Category = string;

/** Result of running the matcher over one job. */
export interface MatchResult {
  isMatch: boolean;
  score: number; // 0-100
  matchedRoleIds: string[];
  reasons: MatchReasons;
}

export interface MatchReasons {
  /** Keywords that contributed, for the UI "Mentions:" line. */
  matchedKeywords: string[];
  /** True when the source gave no/short description and matching fell back to title+tags. */
  descriptionMissing: boolean;
  /** True when no stack evidence was available to verify (no JD, no stack tags) —
   *  included anyway per "include with a flag, not exclude". */
  stackUnverified?: boolean;
  /** Per-role explanation of pass/fail (hard-filter stage). */
  roleOutcomes: Record<string, string>;
}

/** A persisted job row (DB column names are snake_case; this is the JS shape). */
export interface Job extends RawJob {
  id: number;
  normCompany: string;
  normTitle: string;
  geoBucket: string;
  category: Category;
  firstSeen: string;
  lastSeen: string;
  isActive: boolean;
  isMatch: boolean;
  matchedRoleIds: string[];
  matchScore: number;
  matchReasons: MatchReasons | null;
  status: JobStatus;
  userNotes: string | null;
  statusUpdatedAt: string | null;
  // optional LLM fit-judge verdict (advisory second-stage screening)
  llmVerdict: JudgeVerdict | null;
  llmSummary: string | null;
  llmReasons: string[];
  llmBlockers: string[];
  /** sha1 of the JD text the verdict was computed against (stale → re-judge) */
  llmJudgedHash: string | null;
}

/** 4-level fit verdict from the LLM judge (matches profile/judge-rubric.md). */
export type JudgeVerdict = 'STRONG' | 'DECENT' | 'WEAK' | 'SKIP';

export interface Verdict {
  verdict: JudgeVerdict;
  summary: string;
  reasons: string[];
  /** candidate hard-stops to verify (e.g. "Go-primary", "onsite, no visa"). */
  blockers: string[];
}

export interface LlmBackendConfig {
  engine: 'claude-cli' | 'openai-compatible';
  model?: string;
  base_url?: string;
  /** name of the env var holding the API key (key itself never in config) */
  api_key_env?: string;
}

// ---------------------------------------------------------------------------
// Config shapes (validated by zod in src/config/load.ts)
// ---------------------------------------------------------------------------

export interface RoleConfig {
  id: string;
  label: string;
  /** Career lane — drives the UI's IC/EM role filter. */
  lane: 'ic' | 'em';
  titleKeywords: string[];
  /** Hard-reject titles containing any of these (junior, intern, …). */
  titleExclude?: string[];
  mustHaveStack: string[];
  /** keyword -> weight (positive boosts, negative penalties). */
  niceToHave: Record<string, number>;
  excludeIfPrimary: string[];
  /** Location preference is profile-level (one job seeker, one preference); the
   *  scraper injects ProfileConfig.geoPriority/geoRelocationOk into every role
   *  before matching, so the matcher reads these as usual. */
  geoPriority: string[];
  geoRelocationOk: string[];
}

export interface ProfileConfig {
  name: string;
  /** Skip listings whose known posted date is older than this many days. */
  maxAgeDays: number;
  /** Mark jobs inactive after not being seen for this many days (per successful source runs). */
  inactiveAfterDays: number;
  /** Which boards from config/sources.yaml are enabled for this user. */
  enabledSources: string[];
  /** Preferred locations (+15 score) and relocation-OK locations (+10),
   *  applied to every role. 'remote' is a normal entry. */
  geoPriority: string[];
  geoRelocationOk: string[];
  resumes: { id: string; label: string; file: string; base?: 'ic' | 'em' }[];
  /** Categories the user never wants matched (jobs stay in the DB as
   *  unmatched-with-reason for auditability; deleting them would just get
   *  them re-inserted by the next scrape). */
  excludeCategories: string[];
  /** Resume-generation guardrails — e.g. NDA'd employer names that must
   *  never appear in generated output. Personal data, so config not code. */
  resumeRules: { forbiddenTerms: string[] };
  /** Default triage-filter preferences (seed the UI's default view). */
  uiPrefs: { defaultMinScore?: number; defaultPostedWithin?: number };
  /** Optional LLM features (resume gen + fit-judge). */
  llm: {
    backends: Record<string, LlmBackendConfig>;
    judge: { enabled: boolean; backend: string };
    resume: { backend: string };
  };
  /** Selection over the committed company registry + personal additions. */
  companies: {
    domains: string[];
    include: { name: string; careers_url: string; provider?: 'greenhouse' | 'lever' | 'ashby'; enabled: boolean }[];
    exclude: string[];
  };
}

export interface CompanyConfig {
  name: string;
  careersUrl: string;
  /** Optional explicit override; otherwise auto-detected from careersUrl. */
  provider?: 'greenhouse' | 'lever' | 'ashby';
  enabled?: boolean;
}

export interface SourceConfig {
  id: string;
  label: string;
  /** Board adapters declare their kind; ATS sources are driven by companies.yaml instead. */
  kind: 'api' | 'html';
  baseUrl: string;
  /** Adapter-specific knobs (paths, pages to scan, etc.). */
  options?: Record<string, unknown>;
}

export interface CategoriesConfig {
  /** Ordered list — first match wins. */
  order: Category[];
  /** Category assigned when no keyword list matches. */
  fallback: Category;
  keywords: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Scraper orchestration
// ---------------------------------------------------------------------------

export type SourceRunStatus = 'success' | 'suspect' | 'failed' | 'skipped';

export interface SourceRunResult {
  sourceId: string;
  status: SourceRunStatus;
  jobsFound: number;
  jobsNew: number;
  error?: string;
  durationMs: number;
}

export interface ScrapeRunSummary {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  sources: SourceRunResult[];
  totalNew: number;
}
