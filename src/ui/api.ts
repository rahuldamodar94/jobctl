/**
 * Thin typed client for the Express API. Field names are snake_case because
 * the jobs route returns DB rows directly (single mapping layer, on purpose).
 */
export interface UiJob {
  id: number;
  company: string;
  title: string;
  location: string | null;
  work_mode: string;
  salary_text: string | null;
  url: string;
  tags: string[];
  category: string;
  posted_date: string | null;
  first_seen: string;
  source_id: string;
  is_match: number;
  matched_role_ids: string[];
  match_score: number;
  match_reasons: {
    matchedKeywords: string[];
    descriptionMissing: boolean;
    /** Per-role pass/fail explanation — shown for unmatched rows (filter audit). */
    roleOutcomes?: Record<string, string>;
  } | null;
  status: string;
  user_notes: string | null;
  /** ISO timestamp of the last status change; null = never touched (show first_seen). */
  status_updated_at: string | null;
  description_excerpt: string;
  // advisory LLM fit-judge (null until judged)
  llm_verdict: 'STRONG' | 'DECENT' | 'WEAK' | 'SKIP' | null;
  llm_summary: string | null;
  llm_reasons: string[];
  llm_blockers: string[];
  /** per-dimension breakdown with JD evidence ([] for un-judged / old verdicts) */
  llm_dimensions: VerdictDimension[];
}

/** One advisory fit dimension scored by the judge, backed by JD evidence. */
export interface VerdictDimension {
  key: 'skills' | 'seniority' | 'domain' | 'location' | 'red_flags';
  rating: 'strong' | 'ok' | 'weak' | 'unknown';
  note: string;
  evidence: string[];
}

export interface RunSummary {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  sources: { sourceId: string; status: string; jobsFound: number; jobsNew: number; error?: string }[];
  totalNew: number;
  /** live progress while scraping (0/0 once not running) */
  sourcesDone: number;
  sourcesTotal: number;
  currentSource: string | null;
}

export interface Filters {
  q: string;
  status: string;
  category: string;
  minScore: string;
  postedWithin: string;
  /** matched (default) | unmatched (filter audit) | all */
  match: string;
  /** substring match on the job location */
  location: string;
  /** score (default) | date | verdict */
  sort: string;
  /** csv of fit verdicts to show (STRONG/DECENT/WEAK/SKIP); '' = all */
  verdict: string;
}

export interface Stats {
  new: number;
  interested: number;
  applied: number;
  rejected: number;
  dismissed: number;
  total: number;
}

/** Pill counts mirror the current filters (WYSIWYG) — pass them so each pill's
 *  number equals what clicking it shows. Omit for an unfiltered pipeline tally. */
export async function getStats(filters?: Filters): Promise<Stats> {
  const qs = filters ? `?${filtersToParams(filters)}` : '';
  const res = await fetch(`/api/stats${qs}`);
  if (!res.ok) throw new Error(`stats: HTTP ${res.status}`);
  return res.json();
}

export const PAGE_SIZE = 200;

/** Serialize the filter object — shared by the list fetch and the CSV export
 *  link so "export" always means exactly the current view. */
export function filtersToParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
  return params;
}

export async function fetchJobs(f: Filters, offset = 0): Promise<{ jobs: UiJob[]; total: number }> {
  const params = filtersToParams(f);
  params.set('limit', String(PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  const res = await fetch(`/api/jobs?${params}`);
  if (!res.ok) throw new Error(`jobs: HTTP ${res.status}`);
  return res.json();
}

/** Mutations must surface failures — a swallowed 4xx/5xx would leave the
 *  optimistically-updated UI silently out of sync with the server. */
async function ensureOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => ({} as { error?: string }));
  throw new Error(body.error ?? `${what} failed: HTTP ${res.status}`);
}

export async function patchJob(id: number, body: { status?: string; notes?: string }): Promise<void> {
  const res = await fetch(`/api/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'update');
}

export async function bulkStatus(ids: number[], status: string): Promise<void> {
  const res = await fetch('/api/jobs/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
  await ensureOk(res, 'bulk update');
}

export async function startScrape(): Promise<boolean> {
  const res = await fetch('/api/scrape', { method: 'POST' });
  return res.status === 202;
}

/** Request a cooperative stop of the running scrape (best-effort, never throws). */
export async function stopScrape(): Promise<void> {
  try {
    await fetch('/api/scrape/stop', { method: 'POST' });
  } catch {
    /* the poll will reflect the real state regardless */
  }
}

export async function latestRun(): Promise<RunSummary | null> {
  // Polled every 2s during a scrape — a transient 5xx / non-JSON body must not
  // reject (an unhandled rejection in the poll can strand the run strip).
  try {
    const res = await fetch('/api/runs/latest');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface AppConfig {
  resumeGeneration: boolean;
  /** false on a fresh install (no profile+roles yet) → show onboarding. */
  configured: boolean;
  sources: string[];
  availableSources: string[];
  categories: string[];
  /** canonical software-industry domain vocabulary (for the domain picker) */
  domains: { id: string; label: string; description: string }[];
  /** curated role-search templates (for the onboarding role picker) */
  roleTemplates: RoleTemplate[];
  uiPrefs: { defaultMinScore?: number; defaultPostedWithin?: number };
  judgeEnabled: boolean;
  /** judge-rubric.md present? — the Fit/verdict filter shows only when the judge
   *  is on AND a rubric exists. */
  rubricExists: boolean;
  /** is the local `claude` CLI detected on PATH? (AI/LLM Settings tab) */
  claudeAvailable: boolean;
}

/** A curated role-search template the picker prefills into an editable role. */
export interface RoleTemplate {
  id: string;
  label: string;
  group: string;
  description: string;
  titleKeywords: string[];
  titleExclude: string[];
  mustHaveStack: string[];
  niceToHave: Record<string, number>;
  excludeIfPrimary: string[];
}

/** The verdict fields the judge endpoint returns — merged into a row client-side. */
export type VerdictPatch = Pick<UiJob, 'llm_verdict' | 'llm_summary' | 'llm_reasons' | 'llm_blockers' | 'llm_dimensions'>;

/** Re-judge one job via the configured fit-judge backend (~seconds). */
export async function judgeJob(id: number): Promise<VerdictPatch> {
  const res = await fetch(`/api/jobs/${id}/judge`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export interface JudgeStatus {
  /** judge configured + backend available (button hidden when false) */
  enabled: boolean;
  /** un-judged matched jobs ≥ the score floor — the button's backlog count */
  pending: number;
  /** live background-run progress (running=false when idle/done) */
  running: boolean;
  done: number;
  total: number;
  failed: number;
}

/** Capability + un-judged backlog + live progress for the "Judge jobs" button. */
export async function getJudgeStatus(): Promise<JudgeStatus | null> {
  try {
    const res = await fetch('/api/judge/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Kick off a background judge of the whole un-judged backlog ≥ floor.
 *  Returns the server error (409 busy / 503 disabled) instead of throwing. */
export async function startJudge(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/judge/pending', { method: 'POST' });
  if (res.status === 202) return { ok: true };
  const body = await res.json().catch(() => ({} as { error?: string }));
  return { ok: false, error: body.error };
}

/** Request a cooperative stop of the running manual judge (best-effort). */
export async function stopJudge(): Promise<void> {
  try {
    await fetch('/api/judge/stop', { method: 'POST' });
  } catch {
    /* the poll will reflect the real state regardless */
  }
}

/** Last successfully-fetched config — returned if a later fetch fails so the UI
 *  keeps its dropdown vocabulary instead of showing an error body as data. */
let lastConfig: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig | null> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return lastConfig;
    lastConfig = await res.json();
    return lastConfig;
  } catch {
    return lastConfig;
  }
}

// ---------------------------------------------------------------------------
// Demo / sample data
// ---------------------------------------------------------------------------

export async function getDemoCount(): Promise<number> {
  const res = await fetch('/api/demo');
  if (!res.ok) return 0;
  return (await res.json()).count ?? 0;
}

export async function loadDemoJobs(): Promise<number> {
  const res = await fetch('/api/demo', { method: 'POST' });
  if (!res.ok) throw new Error(`load demo: HTTP ${res.status}`);
  return (await res.json()).loaded ?? 0;
}

export async function clearDemoJobs(): Promise<number> {
  const res = await fetch('/api/demo', { method: 'DELETE' });
  if (!res.ok) throw new Error(`clear demo: HTTP ${res.status}`);
  return (await res.json()).cleared ?? 0;
}

// ---------------------------------------------------------------------------
// Settings / onboarding — write surface (server zod-validates every write)
// ---------------------------------------------------------------------------

export interface SettingsSnapshot {
  configured: boolean;
  profile: Record<string, unknown> | null;
  roles: Record<string, unknown> | null;
  categories: Record<string, unknown> | null;
  skill: string | null;
  rubric: string | null;
}

export interface SaveResult {
  ok: boolean;
  issues?: { path: string; message: string }[];
  error?: string;
}

export async function getSettings(): Promise<SettingsSnapshot> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
  return res.json();
}

/** PUT a config artifact; returns validation issues instead of throwing so the
 *  form can show them inline. */
async function putConfig(path: string, body: unknown): Promise<SaveResult> {
  const res = await fetch(`/api/settings/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const j = await res.json().catch(() => ({}));
  return { ok: false, issues: j.issues, error: j.error };
}

export const saveProfile = (obj: unknown) => putConfig('profile', obj);
export const saveRoles = (obj: unknown) => putConfig('roles', obj);
export const saveCategories = (obj: unknown) => putConfig('categories', obj);
export const saveSkill = (text: string) => putConfig('skill', { text });
export const saveRubric = (text: string) => putConfig('rubric', { text });

export async function saveResume(file: string, markdown: string): Promise<SaveResult> {
  return putConfig('resume', { file, markdown });
}

export interface ExtractedResume {
  /** converted markdown ('' on failure/empty) */
  markdown: string;
  /** PDF layout is lossy → prompt the user to review before saving */
  approximate: boolean;
  /** scanned/image-only PDF — no extractable text */
  empty: boolean;
  /** user-facing reason when markdown is empty */
  error?: string;
}

/** Upload a .docx/.pdf and get back Markdown for review. EXTRACT ONLY — the
 *  caller drops the result into the editor and saves via saveResume. Sends raw
 *  bytes (no base64), never throws (returns {error} instead). */
export async function extractResumeFile(file: File): Promise<ExtractedResume> {
  try {
    const res = await fetch(`/api/settings/resume/extract?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }));
      return { markdown: '', approximate: false, empty: false, error: body.error ?? `upload failed: HTTP ${res.status}` };
    }
    return await res.json();
  } catch (e) {
    return { markdown: '', approximate: false, empty: false, error: (e as Error).message };
  }
}

export interface GeneratedResumeInfo {
  dir: string;
  pdfFile: string;
  mdFile: string;
  generatedAt?: string;
  pages?: number;
  warning?: string;
}

/** Generate a tailored resume for a job via the local claude CLI (~30-90s). */
export async function generateResume(jobId: number): Promise<GeneratedResumeInfo> {
  const res = await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function getResumeInfo(jobId: number): Promise<GeneratedResumeInfo | null> {
  // 404 = no resume generated yet (the common case) — don't render the error
  // body as info; just report "none".
  const res = await fetch(`/api/jobs/${jobId}/resume`);
  if (!res.ok) return null;
  return res.json();
}

export async function listResumes(): Promise<{ id: string; label: string }[]> {
  const res = await fetch('/api/resumes');
  return res.json();
}

export async function getResume(id: string): Promise<string> {
  // Guard the read path so the drawer never renders a 404/500 error body as
  // resume content.
  const res = await fetch(`/api/resumes/${id}`);
  if (!res.ok) throw new Error(`resume: HTTP ${res.status}`);
  return res.text();
}
