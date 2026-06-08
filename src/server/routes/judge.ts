import { Router } from 'express';
import { Repo } from '../../db/repo.js';
import { judgePending } from '../../judge/index.js';

/**
 * POST /api/jobs/:id/judge — re-judge a single job on demand (the "Re-judge"
 * button). 503 when the judge is disabled/unavailable. Reuses judgePending
 * (best-effort, never throws) with all:true so it re-runs even if the JD is
 * unchanged.
 */
export function judgeRouter(repo: Repo): Router {
  const r = Router();

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
