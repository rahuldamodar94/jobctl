import type Database from 'better-sqlite3';

/**
 * Schema is idempotent (CREATE IF NOT EXISTS) — no migration framework in v1.
 * If the schema changes pre-1.0: delete data/jobs.db and re-scrape.
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
