import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema, migrate } from './schema.js';

describe('migrate (versioned schema runner)', () => {
  test('a fresh DB gets the schema and is stamped at the current version', () => {
    const db = new Database(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    migrate(db);
    // v1 baseline applied → user_version reflects the migration count (≥1)
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
    // schema usable: the jobs table exists with the expected columns
    const cols = (db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('dedupe_key');
    expect(cols).toContain('llm_dimensions'); // judge column (v3 + duplicated in the v1 baseline)
    // v2 scrape-progress columns are present after migrate
    const runCols = (db.prepare('PRAGMA table_info(scrape_runs)').all() as { name: string }[]).map((c) => c.name);
    expect(runCols).toContain('sources_done');
    expect(runCols).toContain('sources_total');
    expect(runCols).toContain('current_source');
  });

  test('v2 migration adds scrape-progress columns to a long-lived v1 DB (existing-DB path)', () => {
    const db = new Database(':memory:');
    // simulate a v1 DB created BEFORE the progress columns existed: build the
    // scrape_runs table without them, then stamp it at version 1.
    db.exec(
      "CREATE TABLE scrape_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL DEFAULT 'running', sources TEXT NOT NULL DEFAULT '[]', total_new INTEGER NOT NULL DEFAULT 0)"
    );
    db.pragma('user_version = 1');
    migrate(db); // should run v2 only
    const runCols = (db.prepare('PRAGMA table_info(scrape_runs)').all() as { name: string }[]).map((c) => c.name);
    expect(runCols).toContain('sources_done');
    expect(runCols).toContain('sources_total');
    expect(runCols).toContain('current_source');
  });

  test('v3 backfills judge columns onto a DB stamped at user_version=2 WITHOUT them (regression)', () => {
    const db = new Database(':memory:');
    // simulate an old build: a v2-era DB whose jobs table never got the llm columns
    db.exec('CREATE TABLE jobs (id INTEGER PRIMARY KEY, dedupe_key TEXT, match_score INTEGER, is_active INTEGER, is_match INTEGER)');
    db.exec("CREATE TABLE scrape_runs (id INTEGER PRIMARY KEY, status TEXT, sources_done INTEGER, sources_total INTEGER, current_source TEXT)");
    db.pragma('user_version = 2');
    const before = (db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name);
    expect(before).not.toContain('llm_verdict');

    migrate(db); // must run v3

    const after = (db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name);
    expect(after).toContain('llm_verdict');
    expect(after).toContain('llm_judged_hash');
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });

  test('re-running migrate is idempotent (no version drift, no error)', () => {
    const db = new Database(':memory:');
    migrate(db);
    const v1 = db.pragma('user_version', { simple: true });
    migrate(db);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(v1);
  });

  test('migrate brings a DB created by the bare baseline up to version (existing-DB path)', () => {
    const db = new Database(':memory:');
    initSchema(db); // simulate a pre-versioning DB: schema present, user_version still 0
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    migrate(db); // runs v1 (idempotent on the already-present schema) → stamps version
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
  });
});
