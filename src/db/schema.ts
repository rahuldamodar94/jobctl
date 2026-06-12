import type Database from 'better-sqlite3';

/**
 * The v1 baseline schema — idempotent (CREATE IF NOT EXISTS + guarded ALTERs),
 * safe to run on a fresh or an existing database. Frozen: future schema changes
 * go through the versioned `migrate()` runner below, NOT by editing this.
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- identity
      external_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,

      -- content
      company TEXT NOT NULL,
      norm_company TEXT NOT NULL,
      title TEXT NOT NULL,
      norm_title TEXT NOT NULL,
      location TEXT,
      geo_bucket TEXT NOT NULL DEFAULT 'unknown',
      work_mode TEXT NOT NULL DEFAULT 'unknown',
      salary_text TEXT,
      description TEXT,
      tags TEXT NOT NULL DEFAULT '[]',          -- JSON array

      -- metadata
      category TEXT NOT NULL DEFAULT 'other',
      posted_date TEXT,                          -- ISO date, absolute
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_match INTEGER NOT NULL DEFAULT 1,

      -- matching (recomputed every scrape run)
      matched_role_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
      match_score INTEGER NOT NULL DEFAULT 0,
      match_reasons TEXT,                        -- JSON object

      -- user state (never touched by scraper)
      status TEXT NOT NULL DEFAULT 'new',
      user_notes TEXT,
      status_updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_norm_company ON jobs(norm_company);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
    CREATE INDEX IF NOT EXISTS idx_jobs_match ON jobs(is_match, match_score);
    -- Serves the list route's default sort AND its COUNT in one index. The
    -- leading (is_active, match_score DESC) index-orders the ORDER BY with early
    -- LIMIT termination; the trailing (status, is_match) make it a COVERING index
    -- for the COUNT, whose status/is_match residuals would otherwise force ~16k
    -- table lookups ('new' is ~99% of active rows). Measured: the slow filtered
    -- list+count went 58-70ms → ~3ms. (v4 backfills it.)
    CREATE INDEX IF NOT EXISTS idx_jobs_active_score ON jobs(is_active, match_score DESC, status, is_match);

    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',    -- running | completed | failed
      sources TEXT NOT NULL DEFAULT '[]',        -- JSON SourceRunResult[]
      total_new INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS source_state (
      source_id TEXT PRIMARY KEY,
      last_success_at TEXT,
      last_success_count INTEGER NOT NULL DEFAULT 0,
      suspect_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Lightweight column addition for DBs created before suspect_count existed.
  // (No migration framework by design — additive ALTERs are guarded like this.)
  try {
    db.exec('ALTER TABLE source_state ADD COLUMN suspect_count INTEGER NOT NULL DEFAULT 0');
  } catch {
    /* column already exists */
  }

  // Owning process id of a scrape_runs row — lets startup reconciliation tell an
  // orphaned (dead-process) lock from a live CLI scrape's lock. (Guarded ALTER.)
  try {
    db.exec('ALTER TABLE scrape_runs ADD COLUMN pid INTEGER');
  } catch {
    /* column already exists */
  }

  // Live scrape-progress columns on the `running` row (UI shows "40/120 sources"
  // instead of a static spinner). Guarded ALTERs — present in the v1 baseline for
  // fresh DBs; a v2 migration below re-applies them (idempotently) to long-lived
  // DBs already stamped at user_version=1 that never saw this edit.
  for (const col of [
    'sources_done INTEGER NOT NULL DEFAULT 0',
    'sources_total INTEGER NOT NULL DEFAULT 0',
    'current_source TEXT',
  ]) {
    try {
      db.exec(`ALTER TABLE scrape_runs ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }

  // Advisory LLM fit-judge columns (added later — same guarded-ALTER pattern).
  for (const col of [
    'llm_verdict TEXT',
    'llm_summary TEXT',
    'llm_reasons TEXT',
    'llm_blockers TEXT',
    'llm_dimensions TEXT', // JSON: per-dimension breakdown with evidence (added later)
    'llm_judged_hash TEXT',
  ]) {
    try {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${col}`);
    } catch {
      /* column already exists */
    }
  }
}

/**
 * Versioned migration runner (PRAGMA user_version). `initSchema` is the FROZEN
 * v1 baseline — idempotent, safe on fresh and pre-versioning databases. Append
 * v2, v3, … below for ANY future schema change. Crucially this lets a future
 * NON-additive change (rename/backfill/type-change — which the guarded-ALTER
 * pattern can't express) run against an EXISTING database instead of forcing
 * "delete data/jobs.db and re-scrape", which would throw away the user's
 * irreplaceable triage history (statuses + notes).
 *
 * Each migration runs exactly once, in order, for any database whose
 * user_version is below it. v1 (initSchema) must stay frozen so a fresh DB builds
 * up through every migration in sequence and reaches the same state as a
 * long-lived one (never seeing a "future" column before the migration adds it).
 * A migration that needs atomicity should wrap its own body in db.transaction()
 * (the runner doesn't, so v1's self-guarded ALTERs can't poison a transaction).
 */
/**
 * v2 — live scrape-progress columns on the `running` row, so the polling UI can
 * show "Scraping… 40/120 sources" instead of a static spinner over a multi-minute
 * run. Guarded ALTERs (idempotent): a fresh DB reaches this state via the v1
 * baseline → v2 here; a long-lived v1 DB gains the columns here. Either way the
 * end state is identical. (Updated incrementally by runScrape; completeRun writes
 * the authoritative final `sources`/`total_new`.)
 */
function v2_scrapeProgress(db: Database.Database): void {
  for (const col of [
    'sources_done INTEGER NOT NULL DEFAULT 0',
    'sources_total INTEGER NOT NULL DEFAULT 0',
    'current_source TEXT',
  ]) {
    try {
      db.exec(`ALTER TABLE scrape_runs ADD COLUMN ${col}`);
    } catch {
      /* column already exists (fresh DB whose v1 baseline pre-dated this) */
    }
  }
}

/**
 * v3 — advisory LLM fit-judge columns. These were originally appended (guarded)
 * inside initSchema, but a DB stamped at user_version=2 by an earlier build (v2
 * present, judge feature not yet shipped) would NEVER acquire them — migrate()
 * doesn't re-run initSchema for version>=1. This idempotent migration backfills
 * them. (They stay duplicated in initSchema too, like v2's columns, so a fresh DB
 * reaches the same state either way.)
 */
function v3_judgeColumns(db: Database.Database): void {
  for (const col of [
    'llm_verdict TEXT',
    'llm_summary TEXT',
    'llm_reasons TEXT',
    'llm_blockers TEXT',
    'llm_dimensions TEXT',
    'llm_judged_hash TEXT',
  ]) {
    try {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${col}`);
    } catch {
      /* column already exists (fresh DB whose v1 baseline already added it) */
    }
  }
}

/**
 * v4 — list-route covering index. The default triage list sorts by match_score
 * DESC over is_active rows, and its COUNT evaluates status/is_match residuals
 * over ~16k rows ('new' is ~99% of active). Without support the planner temp-
 * sorts the list AND table-looks-up every count row (measured 58-70ms). The
 * index orders the sort (early LIMIT termination) and COVERS the count
 * (index-only) → ~3ms. Idempotent so it's a no-op on a fresh DB that already
 * created it in initSchema.
 */
function v4_listSortIndex(db: Database.Database): void {
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_active_score ON jobs(is_active, match_score DESC, status, is_match)');
}

const MIGRATIONS: Array<(db: Database.Database) => void> = [
  initSchema, // v1 — baseline (DO NOT edit for new changes; add a vN below instead)
  v2_scrapeProgress, // v2 — scrape progress columns
  v3_judgeColumns, // v3 — advisory judge columns (backfills v2-stamped DBs)
  v4_listSortIndex, // v4 — list-route (is_active, match_score DESC) sort index
];

export function migrate(db: Database.Database): void {
  let version = db.pragma('user_version', { simple: true }) as number;
  for (; version < MIGRATIONS.length; version++) MIGRATIONS[version]!(db);
  db.pragma(`user_version = ${MIGRATIONS.length}`);
}
