import { Router } from 'express';
import { Repo } from '../../db/repo.js';
import { judgePending, getJudgeContext } from '../../judge/index.js';

/**
 * Live state of a manual "Judge jobs" run. In-memory (single-user, one process)
 * and deliberately NOT persisted: if the server dies mid-run the verdicts
 * already written survive in the DB, and the un-judged remainder is simply
 * re-offered by the button (judgePending skips fresh verdicts) — resumable by
 * design, no orphaned-run bookkeeping needed.
 */
const judgeRun = { running: false, done: 0, total: 0, failed: 0 };

/**
 * Fit-judge HTTP surface:
 *  - POST /api/jobs/:id/judge — re-judge ONE job on demand (the "Re-judge"
 *    button); all:true so it re-runs even if the JD is unchanged.
 *  - POST /api/judge/pending — judge the whole un-judged backlog ≥ score floor
 *    in the background (the "Judge jobs" button — recovers a scrape that died
 *    before/during its judge phase, no re-scrape needed).
 *  - GET  /api/judge/status — capability + un-judged count + live progress.
 * 503 when the judge is disabled/unavailable. judgePending is best-effort and
 * never throws.
 */
export function judgeRouter(repo: Repo): Router {
  const r = Router();

  // Capability + backlog + live progress for the "Judge jobs" button.
  r.get('/judge/status', (_req, res) => {
    const { ctx, error } = getJudgeContext();
    const enabled = !!ctx;
    const pending = ctx ? repo.countJudgePending(ctx.minScore) : 0;
    res.json({ enabled, pending, ...judgeRun, ...(enabled ? {} : { error }) });
  });

  // Judge the un-judged backlog ≥ floor in the background; the UI polls
  // /judge/status for progress (same shape as a scrape poll).
  r.post('/judge/pending', (_req, res) => {
    const { ctx, error } = getJudgeContext();
    if (!ctx) return res.status(503).json({ error });
    if (judgeRun.running) return res.status(409).json({ error: 'judge already running' });
    // A scrape runs its OWN judge phase at the end — don't double-spend the
    // backend (and double-write verdicts) by racing it.
    if (repo.latestRun()?.status === 'running') {
      return res.status(409).json({ error: 'a scrape is running (it judges automatically when done)' });
    }
    judgeRun.running = true;
    judgeRun.done = 0;
    judgeRun.total = 0;
    judgeRun.failed = 0;
    judgePending(repo, (m) => console.log(`[judge] ${m}`), {
      onProgress: (done, total) => {
        judgeRun.done = done;
        judgeRun.total = total;
      },
    })
      .then((out) => {
        judgeRun.failed = out.failed;
      })
      .catch((e) => console.error('[judge] failed:', (e as Error).message))
      .finally(() => {
        judgeRun.running = false;
      });
    res.status(202).json({ started: true });
  });

  r.post('/jobs/:id/judge', async (req, res) => {
    // Express 4 doesn't catch async-handler rejections — wrap so any throw
    // becomes a JSON 500, not an unhandled rejection / hung connection.
    try {
      const id = Number(req.params.id);
      if (!repo.findById(id)) return res.status(404).json({ error: 'not found' });
      const out = await judgePending(repo, (m) => console.log(`[judge] ${m}`), { all: true, ids: [id] });
      if (out.skipped) return res.status(503).json({ error: out.skipped });
      if (out.failed && !out.judged) return res.status(502).json({ error: 'judge failed (see server log)' });
      // Return ONLY the verdict fields in the UI (snake_case) shape — the
      // client merges these into its existing row. Returning the full repo Job
      // (camelCase) would replace the row with the wrong shape and crash render.
      const j = repo.findById(id)!;
      res.json({
        llm_verdict: j.llmVerdict,
        llm_summary: j.llmSummary,
        llm_reasons: j.llmReasons,
        llm_blockers: j.llmBlockers,
        llm_dimensions: j.llmDimensions,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
