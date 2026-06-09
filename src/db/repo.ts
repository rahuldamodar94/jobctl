import type Database from 'better-sqlite3';
import type {
  Job,
  JobStatus,
  MatchReasons,
  RawJob,
  ScrapeRunSummary,
  SourceRunResult,
  Verdict,
} from '../shared/types.js';
import { STATUS_RANK } from '../shared/types.js';
import { localDateISO } from '../matcher/dates.js';
import { detectAts } from '../sources/ats/detect.js';
import { isHttpUrl } from '../shared/url.js';

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface JobRow {
  id: number;
  external_id: string;
  source_id: string;
  url: string;
  dedupe_key: string;
  company: string;
  norm_company: string;
  title: string;
  norm_title: string;
  location: string | null;
  geo_bucket: string;
  work_mode: string;
  salary_text: string | null;
  description: string | null;
  tags: string;
  category: string;
  posted_date: string | null;
  first_seen: string;
  last_seen: string;
  is_active: number;
  is_match: number;
  matched_role_ids: string;
  match_score: number;
  match_reasons: string | null;
  status: string;
  user_notes: string | null;
  status_updated_at: string | null;
  llm_verdict: string | null;
  llm_summary: string | null;
  llm_reasons: string | null;
  llm_blockers: string | null;
  llm_dimensions: string | null;
  llm_judged_hash: string | null;
}

/**
 * JSON.parse that can't take the app down: users WILL hand-edit the SQLite
 * file, and one corrupt cell must not brick the whole list/rescore path.
 */
export function safeJsonParse<T>(raw: string | null, fallback: T, rowId: number, col: string): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`jobs row ${rowId}: corrupt JSON in ${col} — using default`);
    return fallback;
  }
}

/** Is a process still alive? Used by reconcileRunsAtStartup to avoid killing a
 *  live CLI scrape's lock. null pid (pre-migration rows) counts as dead. */
function pidAlive(pid: number | null): boolean {
  if (pid == null) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't actually signal
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists but owned by another user
  }
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    externalId: r.external_id,
    sourceId: r.source_id,
    url: r.url,
    company: r.company,
    normCompany: r.norm_company,
    title: r.title,
    normTitle: r.norm_title,
    location: r.location,
    geoBucket: r.geo_bucket,
    workMode: r.work_mode as Job['workMode'],
    salaryText: r.salary_text,
    description: r.description,
    tags: safeJsonParse<string[]>(r.tags, [], r.id, 'tags'),
    category: r.category as Job['category'],
    postedDate: r.posted_date,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    isActive: r.is_active === 1,
    isMatch: r.is_match === 1,
    matchedRoleIds: safeJsonParse<string[]>(r.matched_role_ids, [], r.id, 'matched_role_ids'),
    matchScore: r.match_score,
    matchReasons: safeJsonParse<MatchReasons | null>(r.match_reasons, null, r.id, 'match_reasons'),
    status: r.status as JobStatus,
    userNotes: r.user_notes,
    statusUpdatedAt: r.status_updated_at,
    llmVerdict: (r.llm_verdict as Job['llmVerdict']) ?? null,
    llmSummary: r.llm_summary,
    llmReasons: safeJsonParse<string[]>(r.llm_reasons, [], r.id, 'llm_reasons'),
    llmBlockers: safeJsonParse<string[]>(r.llm_blockers, [], r.id, 'llm_blockers'),
    llmDimensions: safeJsonParse<Job['llmDimensions']>(r.llm_dimensions, [], r.id, 'llm_dimensions'),
    llmJudgedHash: r.llm_judged_hash,
  };
}

// ---------------------------------------------------------------------------
// Repo — every SQL statement in the app lives in this class.
// Conventions: scraper-owned columns (content, match_*) are freely rewritten;
// user-owned columns (status, user_notes) are ONLY written by explicit user
// actions (setStatus/setNotes/mergeStatus) — never by scrape refreshes.
// ---------------------------------------------------------------------------

export interface NewJobInput extends RawJob {
  dedupeKey: string;
  normCompany: string;
  normTitle: string;
  geoBucket: string;
  category: string;
  isMatch: boolean;
  matchScore: number;
  matchedRoleIds: string[];
  matchReasons: MatchReasons;
  /** Override first_seen/last_seen; defaults to today. */
  firstSeen?: string;
  status?: JobStatus;
  userNotes?: string | null;
}

export class Repo {
  // Hot statements prepared once — better-sqlite3 does NOT cache db.prepare()
  // calls, and ingest runs findByDedupeKey/findByCompany ~3k times per scrape.
  private stmtById;
  private stmtByKey;
  private stmtByCompany;
  private stmtRefresh;
  private stmtUpdateMatch;

  constructor(private db: Database.Database) {
    this.stmtById = db.prepare('SELECT * FROM jobs WHERE id = ?');
    this.stmtByKey = db.prepare('SELECT * FROM jobs WHERE dedupe_key = ?');
    // First-token candidate query (F3): both directions of the prefix rule
    // ("tether" ↔ "tether operations") share the company's FIRST word, so
    // equality + trailing-wildcard LIKE on the index replace the full-scan ORs.
    // companiesCompatible() in dedupe.ts still makes the precise call.
    this.stmtByCompany = db.prepare(
      `SELECT * FROM jobs WHERE norm_company = ? OR norm_company = ? OR norm_company LIKE ?`
    );
    this.stmtRefresh = db.prepare(
      `UPDATE jobs SET last_seen = ?, url = ?, location = ?, salary_text = ?,
                       description = ?, tags = ?, posted_date = ?, is_active = 1
       WHERE id = ?`
    );
    this.stmtUpdateMatch = db.prepare(
      'UPDATE jobs SET is_match = ?, match_score = ?, matched_role_ids = ?, match_reasons = ?, category = ? WHERE id = ?'
    );
  }

  // ----- jobs ---------------------------------------------------------------

  findById(id: number): Job | undefined {
    const row = this.stmtById.get(id) as JobRow | undefined;
    return row ? rowToJob(row) : undefined;
  }

  findByDedupeKey(key: string): Job | undefined {
    const row = this.stmtByKey.get(key) as JobRow | undefined;
    return row ? rowToJob(row) : undefined;
  }

  /**
   * Fuzzy-dedupe candidate pool: rows whose normalized company shares the
   * incoming company's FIRST word (covers both prefix directions: "tether" ↔
   * "tether operations"). Index-friendly (equality + trailing-wildcard LIKE);
   * findFuzzyMatch()/companiesCompatible() make the precise verdict.
   */
  findByCompany(normCompany: string): Job[] {
    const firstToken = normCompany.split(' ')[0] ?? normCompany;
    const rows = this.stmtByCompany.all(normCompany, firstToken, `${firstToken} %`) as JobRow[];
    return rows.map(rowToJob);
  }

  allActive(): Job[] {
    const rows = this.db.prepare('SELECT * FROM jobs WHERE is_active = 1').all() as JobRow[];
    return rows.map(rowToJob);
  }

  /** Active + matched only — the judge's working set (avoids loading the full
   *  table just to filter to the matched subset). `minScore` gates the auto
   *  judge run to high-match jobs (default 0 = no floor, e.g. the demo path). */
  activeMatched(minScore = 0): Job[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE is_active = 1 AND is_match = 1 AND match_score >= ?')
      .all(minScore) as JobRow[];
    return rows.map(rowToJob);
  }

  /** How many matched, active jobs at/above the floor have never been judged —
   *  the un-judged backlog the "Judge jobs" button mops up (e.g. a scrape that
   *  died before its judge phase finished). Cheap COUNT, not a row load. */
  countJudgePending(minScore = 0): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM jobs WHERE is_active = 1 AND is_match = 1 AND match_score >= ? AND llm_judged_hash IS NULL'
      )
      .get(minScore) as { n: number };
    return row.n;
  }

  /** Insert a brand-new job row (caller has already dedup-checked). */
  insert(j: NewJobInput): number {
    const today = todayISO();
    const res = this.db
      .prepare(
        `INSERT INTO jobs (
          external_id, source_id, url, dedupe_key,
          company, norm_company, title, norm_title, location, geo_bucket,
          work_mode, salary_text, description, tags,
          category, posted_date, first_seen, last_seen,
          is_active, is_match, matched_role_ids, match_score, match_reasons,
          status, user_notes, status_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        j.externalId,
        j.sourceId,
        isHttpUrl(j.url) ? j.url : '', // never store non-http(s) (javascript:/data:) links
        j.dedupeKey,
        j.company,
        j.normCompany,
        j.title,
        j.normTitle,
        j.location,
        j.geoBucket,
        j.workMode,
        j.salaryText,
        j.description,
        JSON.stringify(j.tags),
        j.category,
        j.postedDate,
        j.firstSeen ?? today,
        j.firstSeen ?? today,
        j.isMatch ? 1 : 0,
        JSON.stringify(j.matchedRoleIds),
        j.matchScore,
        JSON.stringify(j.matchReasons),
        j.status ?? 'new',
        j.userNotes ?? null,
        j.status ? new Date().toISOString() : null
      );
    return Number(res.lastInsertRowid);
  }

  /**
   * Refresh a previously-seen job with the latest scraped content.
   * Rules (computed in JS for readability — caller passes the existing row):
   *  - NEVER touches user state (status, notes)
   *  - keeps earliest first_seen / posted_date; bumps last_seen to today
   *  - keeps the LONGER description (a full JD beats a list-page stub)
   *  - prefers fresh location/salary/tags when the new scrape has them
   *  - reactivates the row (it was just seen)
   */
  refreshSeen(existing: Job, j: RawJob): void {
    const description =
      (j.description?.length ?? 0) > (existing.description?.length ?? 0) ? j.description : existing.description;
    // URL: a canonical ATS link (the employer's own apply page) is never
    // displaced by an aggregator link; otherwise freshest wins (reposts move).
    const url = !detectAts(j.url) && detectAts(existing.url) ? existing.url : j.url;
    // Location: never degrade. A board's vague "Remote" must not overwrite a
    // precise "Dubai, UAE" from an earlier scrape — only fill when empty.
    // (Normalized identity columns — dedupe_key/norm_*/geo_bucket — are
    // intentionally frozen at insert; recomputing them on refresh would let
    // row identity drift under the UNIQUE index.)
    this.stmtRefresh.run(
      todayISO(),
      url,
      existing.location ?? j.location,
      j.salaryText ?? existing.salaryText,
      description,
      JSON.stringify(j.tags.length > 0 ? j.tags : existing.tags),
      existing.postedDate ?? j.postedDate,
      existing.id
    );
  }

  /** Status-aware status setter used by dedupe merges: never downgrade. */
  mergeStatus(id: number, incoming: JobStatus): void {
    const row = this.db.prepare('SELECT status FROM jobs WHERE id = ?').get(id) as { status: JobStatus } | undefined;
    if (!row) return;
    if (STATUS_RANK[incoming] > STATUS_RANK[row.status]) {
      this.setStatus(id, incoming);
    }
  }

  /** Returns the number of rows changed (0 if the id didn't exist) so callers
   *  like the bulk route can report the true count, not the requested one. */
  setStatus(id: number, status: JobStatus, notes?: string | null): number {
    const info =
      notes !== undefined
        ? this.db
            .prepare('UPDATE jobs SET status = ?, user_notes = ?, status_updated_at = ? WHERE id = ?')
            .run(status, notes, new Date().toISOString(), id)
        : this.db
            .prepare('UPDATE jobs SET status = ?, status_updated_at = ? WHERE id = ?')
            .run(status, new Date().toISOString(), id);
    return info.changes;
  }

  setNotes(id: number, notes: string | null): void {
    this.db.prepare('UPDATE jobs SET user_notes = ? WHERE id = ?').run(notes, id);
  }

  /** Store an advisory LLM fit-verdict against the JD hash it was computed for. */
  setVerdict(id: number, v: Verdict, jdHash: string): void {
    this.db
      .prepare(
        `UPDATE jobs SET llm_verdict = ?, llm_summary = ?, llm_reasons = ?,
         llm_blockers = ?, llm_dimensions = ?, llm_judged_hash = ? WHERE id = ?`
      )
      .run(
        v.verdict,
        v.summary,
        JSON.stringify(v.reasons),
        JSON.stringify(v.blockers),
        JSON.stringify(v.dimensions),
        jdHash,
        id
      );
  }

  /** Count active rows from one source — used to tell if demo data is loaded. */
  countBySource(sourceId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE source_id = ?').get(sourceId) as { n: number }).n;
  }

  /** Remove every row from one source (e.g. clearing demo/sample data). */
  deleteBySource(sourceId: string): number {
    return this.db.prepare('DELETE FROM jobs WHERE source_id = ?').run(sourceId).changes;
  }

  updateMatch(id: number, isMatch: boolean, score: number, roleIds: string[], reasons: MatchReasons, category: string): void {
    this.stmtUpdateMatch.run(isMatch ? 1 : 0, score, JSON.stringify(roleIds), JSON.stringify(reasons), category, id);
  }

  /** Decay: deactivate jobs from this source not seen since the cutoff date. */
  deactivateStale(sourceId: string, cutoffISO: string): number {
    const res = this.db
      .prepare('UPDATE jobs SET is_active = 0 WHERE source_id = ? AND is_active = 1 AND last_seen < ?')
      .run(sourceId, cutoffISO);
    return res.changes;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ----- scrape runs & lock ---------------------------------------------------

  /**
   * Acquire the scrape lock by inserting a `running` run.
   * Returns the run id, or null if another live run holds the lock.
   * Stale running rows (older than ttlMinutes) are marked failed first.
   */
  /**
   * Reconcile orphaned scrape locks: mark any `running` row older than
   * ttlMinutes as `failed`. A scrape runs in-process (fire-and-forget); if that
   * process restarts/crashes before completeRun(), the row is stranded at
   * `running`. Shared by acquireScrapeLock AND the read path (latestRun) so the
   * running-state self-heals everywhere — not only when the next scrape starts,
   * which is what left the UI showing a phantom "scrape running…". Returns rows
   * reconciled. (Startup uses reconcileRunsAtStartup instead, which is
   * process-aware so it won't kill a live CLI scrape's lock.)
   */
  failStaleRuns(ttlMinutes = 60): number {
    const staleCutoff = new Date(Date.now() - ttlMinutes * 60_000).toISOString();
    return this.db
      .prepare("UPDATE scrape_runs SET status = 'failed', completed_at = ? WHERE status = 'running' AND started_at <= ?")
      .run(new Date().toISOString(), staleCutoff).changes;
  }

  /**
   * Server-boot reconciliation. A scrape running in THIS process can't have
   * survived the restart, so its row is orphaned — but a separate live process
   * (e.g. a `npm run scrape` CLI, or a cron) may legitimately still own a
   * `running` row. So fail a running row only when its owning process is gone
   * (pid dead/absent) OR it has exceeded the TTL — never a live process's lock.
   * (Replaces the old "fail ALL running rows at startup", which could release a
   * concurrent CLI scrape's lock and let a second scrape start → double ingest.)
   */
  reconcileRunsAtStartup(ttlMinutes = 60): number {
    const rows = this.db
      .prepare("SELECT id, pid, started_at FROM scrape_runs WHERE status = 'running'")
      .all() as { id: number; pid: number | null; started_at: string }[];
    const staleCutoff = Date.now() - ttlMinutes * 60_000;
    const fail = this.db.prepare("UPDATE scrape_runs SET status = 'failed', completed_at = ? WHERE id = ?");
    let failed = 0;
    for (const r of rows) {
      const stale = new Date(r.started_at).getTime() < staleCutoff;
      if (!stale && pidAlive(r.pid)) continue; // a live process still owns it
      fail.run(new Date().toISOString(), r.id);
      failed++;
    }
    return failed;
  }

  acquireScrapeLock(ttlMinutes = 60): number | null {
    return this.db.transaction(() => {
      this.failStaleRuns(ttlMinutes);
      const live = this.db.prepare("SELECT id FROM scrape_runs WHERE status = 'running'").get();
      if (live) return null;
      const res = this.db
        .prepare("INSERT INTO scrape_runs (started_at, status, pid) VALUES (?, 'running', ?)")
        .run(new Date().toISOString(), process.pid);
      return Number(res.lastInsertRowid);
    })();
  }

  /** Set the total number of sources up front so the UI can show "N/total". */
  setRunTotal(runId: number, sourcesTotal: number): void {
    this.db.prepare('UPDATE scrape_runs SET sources_total = ? WHERE id = ?').run(sourcesTotal, runId);
  }

  /** Incremental progress on the running row (best-effort; cheap single-row
   *  UPDATE). `currentSource` is a human label of what's being scraped now;
   *  `totalNew` is the running count of newly-inserted jobs so the UI can show
   *  "N new" live (completeRun re-writes the authoritative final value). */
  updateRunProgress(runId: number, sourcesDone: number, currentSource: string | null, totalNew: number): void {
    this.db
      .prepare('UPDATE scrape_runs SET sources_done = ?, current_source = ?, total_new = ? WHERE id = ?')
      .run(sourcesDone, currentSource, totalNew, runId);
  }

  completeRun(runId: number, sources: SourceRunResult[], totalNew: number, failed = false): void {
    this.db
      .prepare(
        'UPDATE scrape_runs SET completed_at = ?, status = ?, sources = ?, total_new = ?, current_source = NULL WHERE id = ?'
      )
      .run(new Date().toISOString(), failed ? 'failed' : 'completed', JSON.stringify(sources), totalNew, runId);
  }

  latestRun(): ScrapeRunSummary | null {
    // Self-heal on read: an orphaned `running` row past its TTL must not be
    // reported to the polling UI as still running. (Backstop for the case where
    // the server process stays alive but the scrape itself hung.)
    this.failStaleRuns();
    const row = this.db.prepare('SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1').get() as
      | {
          id: number;
          started_at: string;
          completed_at: string | null;
          status: string;
          sources: string;
          total_new: number;
          sources_done: number;
          sources_total: number;
          current_source: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status as ScrapeRunSummary['status'],
      sources: JSON.parse(row.sources),
      totalNew: row.total_new,
      sourcesDone: row.sources_done,
      sourcesTotal: row.sources_total,
      currentSource: row.current_source,
    };
  }

  // ----- source state (gates is_active decay) --------------------------------

  /** A real (accepted) result — also clears any suspect streak. */
  recordSourceSuccess(sourceId: string, count: number): void {
    this.db
      .prepare(
        `INSERT INTO source_state (source_id, last_success_at, last_success_count, suspect_count) VALUES (?, ?, ?, 0)
         ON CONFLICT(source_id) DO UPDATE SET
           last_success_at = excluded.last_success_at,
           last_success_count = excluded.last_success_count,
           suspect_count = 0`
      )
      .run(sourceId, new Date().toISOString(), count);
  }

  /**
   * Record a suspect run (0 jobs from a previously-productive source) and
   * return the consecutive-suspect streak. After SUSPECT_ACCEPT_AFTER streaks
   * the orchestrator accepts 0 as the new reality (board genuinely emptied)
   * so the source's decay doesn't stay frozen forever.
   */
  bumpSuspect(sourceId: string): number {
    this.db
      .prepare(
        `INSERT INTO source_state (source_id, suspect_count) VALUES (?, 1)
         ON CONFLICT(source_id) DO UPDATE SET suspect_count = suspect_count + 1`
      )
      .run(sourceId);
    return this.getSourceState(sourceId).suspectCount;
  }

  getSourceState(sourceId: string): { lastSuccessAt: string | null; lastSuccessCount: number; suspectCount: number } {
    const row = this.db
      .prepare('SELECT last_success_at, last_success_count, suspect_count FROM source_state WHERE source_id = ?')
      .get(sourceId) as
      | { last_success_at: string | null; last_success_count: number; suspect_count: number }
      | undefined;
    return row
      ? { lastSuccessAt: row.last_success_at, lastSuccessCount: row.last_success_count, suspectCount: row.suspect_count }
      : { lastSuccessAt: null, lastSuccessCount: 0, suspectCount: 0 };
  }
}

/** Local-timezone "today" — see localDateISO for the Dubai-at-2am rationale. */
export function todayISO(): string {
  return localDateISO();
}
