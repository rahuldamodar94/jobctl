/**
 * CLI entry for `npm run scrape` (and `npm run scrape -- --source X`).
 * Same code path as the UI button — the DB scrape lock makes concurrent
 * triggers from both safe. Exit code 1 on failure so cron/scripts can alert.
 */
import { connect } from '../db/connect.js';
import { runScrape } from './run.js';

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
const only = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;

const db = connect();
try {
  const outcome = await runScrape(db, { only });
  console.log(
    `\nRun #${outcome.runId} complete: ${outcome.totalNew} new jobs across ${outcome.sources.length} sources`
  );
  for (const s of outcome.sources) {
    const mark = s.status === 'success' ? '✓' : s.status === 'suspect' ? '⚠' : '✗';
    console.log(`  ${mark} ${s.sourceId}: ${s.jobsFound} found, ${s.jobsNew} new (${s.status})${s.error ? ` — ${s.error}` : ''}`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
