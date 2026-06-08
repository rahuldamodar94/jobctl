/**
 * Express server — API + static UI in one process.
 * The single shared better-sqlite3 connection is safe here: calls are
 * synchronous and serialized by the JS event loop, and WAL mode lets a
 * separate CLI scrape process (docker exec) write concurrently.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from '../db/connect.js';
import { Repo } from '../db/repo.js';
import { jobsRouter } from './routes/jobs.js';
import { scrapeRouter } from './routes/scrape.js';
import { exportRouter } from './routes/export.js';
import { resumesRouter } from './routes/resumes.js';
import { resumeGenRouter } from './routes/resume-gen.js';
import { configRouter } from './routes/config.js';
import { statsRouter } from './routes/stats.js';
import { settingsRouter } from './routes/settings.js';
import { judgeRouter } from './routes/judge.js';
import { importRouter } from './routes/import.js';
import { demoRouter } from './routes/demo.js';

const PORT = Number(process.env.PORT ?? 3000);

const db = connect();
const repo = new Repo(db);

// Startup reconciliation: an in-process scrape (fire-and-forget from
// POST /api/scrape) can't survive a restart, so its `running` row is orphaned
// (e.g. `tsx watch` reloading on a file save). Clear it immediately instead of
// stranding the UI on a phantom "scrape running…" until the 60-min TTL. This is
// process-aware: a concurrently-running CLI `npm run scrape` (different live
// pid) keeps its lock and is NOT failed — avoids a double-scrape race.
const reconciled = repo.reconcileRunsAtStartup();
if (reconciled > 0) console.log(`reconciled ${reconciled} orphaned scrape run(s) at startup`);

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use('/api/jobs', jobsRouter(db, repo));
app.use('/api/scrape', scrapeRouter(db, repo));
app.use('/api/stats', statsRouter(db));
app.use('/api/export.csv', exportRouter(db));
app.use('/api/resumes', resumesRouter());

app.get('/api/runs/latest', (_req, res) => {
  res.json(repo.latestRun());
});

// Capability flags + config vocabulary (roles/sources/categories) for the UI.
app.use('/api/config', configRouter());
app.use('/api/settings', settingsRouter());

app.use('/api', resumeGenRouter(db));
app.use('/api', judgeRouter(db));
app.use('/api', importRouter(db));
app.use('/api', demoRouter(db));

// Static UI (production build). In dev, Vite serves the UI with a proxy.
const uiDist = join(process.cwd(), 'dist', 'ui');
if (existsSync(uiDist)) {
  app.use(express.static(uiDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(uiDist, 'index.html')));
}

// Last-resort error handler: any route throw becomes a JSON 500 instead of an
// Express HTML stack trace (or a hung connection for async throws).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err);
  res.status(500).json({ error: err.message ?? 'internal error' });
});

app.listen(PORT, () => {
  console.log(`jobctl listening on http://localhost:${PORT}`);
});
