import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initSchema } from './schema.js';

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'jobs.db');

/**
 * Open (and initialize) the SQLite database.
 * WAL + busy_timeout on EVERY connection so the server process and a CLI
 * scrape process (e.g. `docker compose exec ... npm run scrape`) can coexist.
 */
export function connect(dbPath: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  initSchema(db);
  return db;
}
