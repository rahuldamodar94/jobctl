import { Router } from 'express';
import type Database from 'better-sqlite3';
import { buildJobsFilter, FILTER_KEYS } from './jobs.js';

/**
 * GET /api/export.csv — streams jobs as CSV, formula-injection safe.
 * With any filter param present, exports EXACTLY the UI's filtered view
 * (same buildJobsFilter as the list route, full set — no paging).
 * With no params, keeps the original full-dump semantics (every row,
 * including dismissed/inactive) as a one-command backup.
 */
export function exportRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/', (req, res) => {
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="jobs-${new Date().toISOString().slice(0, 10)}.csv"`);

    const filtered = FILTER_KEYS.some((k) => (req.query as Record<string, string>)[k] !== undefined);
    const { where, params } = filtered
      ? buildJobsFilter(req.query as Record<string, string>)
      : { where: ['1=1'], params: [] as unknown[] };

    const cols = [
      'id', 'company', 'title', 'location', 'work_mode', 'salary_text', 'url',
      'category', 'source_id', 'posted_date', 'first_seen', 'last_seen',
      'is_active', 'is_match', 'match_score', 'status', 'user_notes', 'tags',
    ];
    res.write(cols.join(',') + '\n');

    // Iterate row-by-row; stop if the client disconnects mid-download so the
    // statement iterator doesn't keep running. Backpressure (write() return
    // value) is deliberately ignored — localhost, single user, ~MBs at most.
    const stmt = db.prepare(
      `SELECT ${cols.join(', ')} FROM jobs WHERE ${where.join(' AND ')} ORDER BY match_score DESC, id`
    );
    let aborted = false;
    res.on('close', () => {
      aborted = true;
    });
    for (const row of stmt.iterate(...params) as Iterable<Record<string, unknown>>) {
      if (aborted) break;
      res.write(cols.map((c) => csvCell(row[c])).join(',') + '\n');
    }
    res.end();
  });

  return r;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // formula-injection guard
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}
