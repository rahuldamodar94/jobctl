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
const judgeRun = { running: false, done: 0, total: 0, failed: 0, cancelRequested: false };

/** Is a manual "Judge jobs" run in flight? The scrape route checks this so its
 *  own end-of-run judge phase can't double-spend the backend against a manual
 *  run (symmetric to judge/pending 409ing against a running scrape). */
export function manualJudgeRunning(): boolean {
  return judgeRun.running;
}

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
    // WEAK/SKIP matches still in the `new` queue — drives the "Dismiss skipped" button.
    const skipped = enabled ? repo.skippableIds().length : 0;
    const { running, done, total, failed } = judgeRun; // cancelRequested stays internal
    res.json({ enabled, pending, skipped, running, done, total, failed, ...(enabled ? {} : { error }) });
  });

  // One-click cleanup: dismiss every matched `new` job the judge marked WEAK/SKIP.
  // Server-authoritative (no client id round-trip); one transaction.
  r.post('/judge/dismiss-skipped', (_req, res) => {
    const ids = repo.skippableIds();
    let dismissed = 0;
    repo.transaction(() => {
      for (const id of ids) dismissed += repo.setStatus(id, 'dismissed');
    });
    res.json({ dismissed });
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
    judgeRun.cancelRequested = false;
    judgePending(repo, (m) => console.log(`[judge] ${m}`), {
      shouldCancel: () => judgeRun.cancelRequested,
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

  // POST /api/judge/stop — cooperative cancel of a running manual judge. Stops
  // between jobs; verdicts already written persist (the rest stays in the
  // backlog, re-offered by the button). No-op (200) when nothing is running.
  r.post('/judge/stop', (_req, res) => {
    if (judgeRun.running) judgeRun.cancelRequested = true;
    res.json({ stopping: judgeRun.running });
  });

  r.post('/jobs/:id/judge', async (req, res) => {
    // Express 4 doesn't catch async-handler rejections — wrap so any throw
    // becomes a JSON 500, not an unhandled rejection / hung connection.
    try {
      const id = Number(req.params.id);
      if (!repo.findById(id)) return res.status(404).json({ error: 'not found' });
      // Don't spawn a judge call concurrently with a backlog run or a scrape's
      // judge phase (double-spend) — every other judge path has this guard.
      if (judgeRun.running || repo.latestRun()?.status === 'running') {
        return res.status(409).json({ error: 'a judge run is already in progress — try again in a moment.' });
      }
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
