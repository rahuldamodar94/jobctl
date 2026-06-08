import { Router } from 'express';
import type Database from 'better-sqlite3';
import { buildJobsFilter } from './jobs.js';

/**
 * GET /api/stats — pipeline counts by status over ACTIVE jobs, for the
 * status-pill row. Global (not affected by the other refinement filters) — but
 * it mirrors the DEFAULT (matched) lens: unmatched jobs are an explicit audit
 * lane (match=unmatched), NOT part of the triage pipeline, so they must not
 * inflate the `new` count. Same rule as buildJobsFilter's default:
 *   (is_match = 1 OR status <> 'new')
 * i.e. `new` counts matched rows only; already-triaged rows always count
 * (refinement-on-new-only). Without this the pill reads "2158 new" while the
 * default list shows ~0 — 99% of it being unmatched noise the user never sees.
 */
export interface StatsPayload {
  new: number;
  interested: number;
  applied: number;
  rejected: number;
  dismissed: number;
  total: number;
}

export function buildStats(db: Database.Database, query: Record<string, string | undefined> = {}): StatsPayload {
  // Reuse the list's refinement WHERE (minus status) and GROUP BY status, so
  // every pill's number == exactly what clicking it would show under the current
  // filters. The score/recency clauses carry `OR status <> 'new'`, so triaged
  // statuses stay fully counted; only `new` narrows to matched + score + recency.
  const { where, params } = buildJobsFilter(query, { omitStatus: true });
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM jobs WHERE ${where.join(' AND ')} GROUP BY status`)
    .all(...params) as { status: string; n: number }[];
  const out: StatsPayload = { new: 0, interested: 0, applied: 0, rejected: 0, dismissed: 0, total: 0 };
  const counts = out as unknown as Record<string, number>;
  for (const { status, n } of rows) {
    if (status !== 'total' && status in out) counts[status] = n;
    out.total += n;
  }
  return out;
}

export function statsRouter(db: Database.Database): Router {
  const r = Router();
  r.get('/', (req, res) => res.json(buildStats(db, req.query as Record<string, string>)));
  return r;
}
