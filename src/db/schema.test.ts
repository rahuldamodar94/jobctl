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
    expect(cols).toContain('llm_dimensions'); // a "later" guarded-ALTER column, part of v1
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
