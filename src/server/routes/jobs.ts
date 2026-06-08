import { Router } from 'express';
import type Database from 'better-sqlite3';
import { safeJsonParse, type Repo } from '../../db/repo.js';
import { localDateISO } from '../../matcher/dates.js';
import { JUDGE_VERDICTS } from '../../shared/types.js';

const STATUSES = ['new', 'interested', 'applied', 'rejected', 'dismissed'];

/** Query keys buildJobsFilter understands — the export route uses this to tell
 *  "filtered view requested" apart from a bare full-dump backup call. */
export const FILTER_KEYS = ['q', 'status', 'category', 'minScore', 'source', 'postedWithin', 'role', 'match', 'location', 'verdict'];

const VERDICTS = ['STRONG', 'DECENT', 'WEAK', 'SKIP'];

/** escape LIKE wildcards so a user search for "100%" or "node_modules" is literal */
const likeArg = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Shared filter→WHERE builder for the list route AND the CSV export, so an
 * export always means "exactly what the UI shows". Filters only — paging and
 * sort are the list route's concern (exports return the FULL filtered set).
 * Filters: q, status (csv|all), category, minScore, source, postedWithin
 * (days), role (csv of role ids), match (matched|unmatched|all), location.
 *
 * REFINEMENT-ON-NEW-ONLY: score / recency / matched are triage tools for the
 * untriaged queue — they constrain `status = 'new'` rows only. Anything the
 * user has already triaged (interested/applied/…) ALWAYS shows when its status
 * is selected, so a curated job never silently disappears for being low-score
 * or old. (match=unmatched stays global — it's the hard-filter audit view.)
 */
export function buildJobsFilter(
  query: Record<string, string | undefined>,
  opts: { omitStatus?: boolean } = {}
): {
  where: string[];
  params: unknown[];
} {
  const { q, status = 'new', category, minScore, source, postedWithin, role, match = 'matched', location, verdict } = query;

  const where: string[] = ['is_active = 1'];
  const params: unknown[] = [];

    // /api/stats reuses this builder with omitStatus to GROUP BY status itself —
    // every other refinement clause (incl. the matched/score/recency
    // OR-status<>'new' carve-outs) is shared, so pill counts == the list.
    if (opts.omitStatus) {
      // no status clause
    } else if (status === 'all') {
      // explicit "all" means ALL — including dismissed. Least surprise: by the
      // time the user deliberately picks "all" they're investigating, and
      // hiding their own dismissals from an investigation makes jobs "go missing".
    } else if (status) {
      // explicit status (or comma list) — invalid values are dropped
      const list = status.split(',').filter((s) => STATUSES.includes(s));
      if (list.length) {
        where.push(`status IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
    } else {
      // missing/empty status (bare API calls) still hides dismissed — the
      // protective default; the UI always sends an explicit value
      where.push(`status != 'dismissed'`);
    }

    // matched: triaged rows bypass (refinement-on-new-only). unmatched/all global.
    if (match === 'unmatched') where.push('is_match = 0');
    else if (match !== 'all') where.push(`(is_match = 1 OR status <> 'new')`);

    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (minScore) {
      where.push(`(match_score >= ? OR status <> 'new')`);
      params.push(Number(minScore));
    }
    if (source) {
      where.push('source_id = ?');
      params.push(source);
    }
    if (postedWithin) {
      // "Recent" = recently posted OR recently discovered by us. The OR matters:
      // an old-but-still-open ATS posting first seen today must show up today
      // (then age out), and undated board jobs must never vanish. Triaged rows
      // bypass the recency window entirely (refinement-on-new-only).
      const cutoff = localDateISO(new Date(Date.now() - Number(postedWithin) * 86_400_000));
      where.push(`((posted_date >= ? OR first_seen >= ?) OR status <> 'new')`);
      params.push(cutoff, cutoff);
    }
    if (role) {
      // csv of role ids → match any (the UI sends all role ids in a lane)
      const ids = role.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length) {
        where.push(`(${ids.map(() => 'matched_role_ids LIKE ?').join(' OR ')})`);
        ids.forEach((id) => params.push(`%"${id}"%`));
      }
    }
    if (location) {
      where.push("location LIKE ? ESCAPE '\\'");
      params.push(likeArg(location));
    }
    if (verdict) {
      // explicit verdict filter (csv) — global, like category (not new-only)
      const list = verdict.split(',').filter((v) => VERDICTS.includes(v));
      if (list.length) {
        where.push(`llm_verdict IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
    }
    if (q) {
      where.push(
        "(company LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR COALESCE(description,'') LIKE ? ESCAPE '\\')"
      );
      const like = likeArg(q);
      params.push(like, like, like);
    }

  return { where, params };
}

export function jobsRouter(db: Database.Database, repo: Repo): Router {
  const r = Router();

  /** GET /api/jobs — buildJobsFilter + limit/offset paging + total count. */
  r.get('/', (req, res) => {
    const { limit = '200', offset = '0', sort } = req.query as Record<string, string>;
    const { where, params } = buildJobsFilter(req.query as Record<string, string>);

    // sort=date → newest first; sort=verdict → best fit first; default → score
    // derived from the single-source JUDGE_VERDICTS order (best→worst); values are
    // controlled constants, never user input — safe to interpolate.
    const verdictRank = `CASE llm_verdict ${JUDGE_VERDICTS.map((v, i) => `WHEN '${v}' THEN ${i}`).join(' ')} ELSE ${JUDGE_VERDICTS.length} END`;
    const orderBy =
      sort === 'date'
        ? 'COALESCE(posted_date, first_seen) DESC, match_score DESC'
        : sort === 'verdict'
        ? `${verdictRank} ASC, match_score DESC`
        : 'match_score DESC, COALESCE(posted_date, first_seen) DESC';

    const sql = `
      SELECT id, company, title, location, work_mode, salary_text, url, tags,
             category, posted_date, first_seen, source_id, is_match,
             matched_role_ids, match_score, match_reasons, status, user_notes,
             status_updated_at, llm_verdict, llm_summary, llm_reasons, llm_blockers,
             llm_dimensions,
             substr(COALESCE(description, ''), 1, 600) AS description_excerpt
      FROM jobs
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;
    // snapshot filter-only params for COUNT before appending paging ones —
    // slicing them back off later breaks silently if params are ever reordered
    const countParams = [...params];
    params.push(Math.min(Number(limit) || 200, 500), Number(offset) || 0);

    // Degrade a corrupt JSON cell to its default rather than 500-ing the whole
    // list (mirrors repo.safeJsonParse — the documented "never throws" invariant).
    const rows = (db.prepare(sql).all(...params) as Record<string, unknown>[]).map((row) => {
      const id = Number(row.id);
      return {
        ...row,
        tags: safeJsonParse<string[]>((row.tags as string) ?? null, [], id, 'tags'),
        matched_role_ids: safeJsonParse<string[]>((row.matched_role_ids as string) ?? null, [], id, 'matched_role_ids'),
        match_reasons: safeJsonParse<unknown>((row.match_reasons as string) ?? null, null, id, 'match_reasons'),
        llm_reasons: safeJsonParse<string[]>((row.llm_reasons as string) ?? null, [], id, 'llm_reasons'),
        llm_blockers: safeJsonParse<string[]>((row.llm_blockers as string) ?? null, [], id, 'llm_blockers'),
        llm_dimensions: safeJsonParse<unknown[]>((row.llm_dimensions as string) ?? null, [], id, 'llm_dimensions'),
      };
    });

    const countSql = `SELECT COUNT(*) AS n FROM jobs WHERE ${where.join(' AND ')}`;
    const { n } = db.prepare(countSql).get(...countParams) as { n: number };

    res.json({ jobs: rows, total: n });
  });

  /** PATCH /api/jobs/:id { status?, notes? } */
  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { status, notes } = req.body as { status?: string; notes?: string | null };
    if (!repo.findById(id)) return res.status(404).json({ error: 'not found' });
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    }
    if (status !== undefined) repo.setStatus(id, status as never, notes !== undefined ? notes : undefined);
    else if (notes !== undefined) repo.setNotes(id, notes);
    res.json(repo.findById(id));
  });

  /** POST /api/jobs/bulk { ids: number[], status } — capped at 1000 per call. */
  r.post('/bulk', (req, res) => {
    const { ids, status } = req.body as { ids: number[]; status: string };
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'need ids[] (max 1000) and a valid status' });
    }
    // one transaction → all-or-nothing + a single WAL commit for up to 1000 rows
    repo.transaction(() => {
      for (const id of ids) repo.setStatus(Number(id), status as never);
    });
    res.json({ updated: ids.length });
  });

  return r;
}
