/**
 * CLI entry for `npm run judge` — runs the advisory fit-judge over matched
 * jobs. `--all` re-judges every matched job (e.g. after editing the rubric);
 * `--id N` judges one. Default: only jobs whose JD changed since last verdict.
 * Best-effort: per-job failures are logged, the run still completes.
 */
import { connect } from '../db/connect.js';
import { Repo } from '../db/repo.js';
import { judgePending } from './index.js';

const args = process.argv.slice(2);
const all = args.includes('--all');
const idIdx = args.indexOf('--id');
const ids = idIdx >= 0 && args[idIdx + 1] ? [Number(args[idIdx + 1])] : undefined;

const db = connect();
try {
  const repo = new Repo(db);
  const out = await judgePending(repo, (m) => console.log(m), { all, ids });
  if (out.skipped) {
    console.error(`judge not run: ${out.skipped}`);
    process.exitCode = 1;
  } else {
    console.log(`\nJudged ${out.judged}, failed ${out.failed}.`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
