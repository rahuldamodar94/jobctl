import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

/**
 * Shared local `claude` CLI runner — used by resume generation and the
 * fit-judge. Headless (`-p`), billed to the user's Claude subscription (no API
 * key). cwd=tmpdir keeps it hermetic (no project CLAUDE.md / scaffolding loads
 * — that's the cheap path while preserving subscription auth).
 *
 * NOTE: do NOT use `--bare` — it bypasses the logged-in subscription session
 * and demands ANTHROPIC_API_KEY (`claude -p --bare` → "Not logged in"), which
 * breaks the no-API-key design. The flag is deliberately unsupported here (no
 * opt), so it can't be wired in by accident.
 */

const DEFAULT_TIMEOUT_MS = 180_000;

let cliAvailable: boolean | null = null;

/** Cached check — is a logged-in claude CLI on PATH? */
export function claudeAvailable(): boolean {
  if (cliAvailable === null) {
    try {
      const r = spawnSync('claude', ['--version'], { timeout: 10_000, encoding: 'utf8' });
      cliAvailable = r.status === 0;
    } catch {
      cliAvailable = false;
    }
  }
  return cliAvailable;
}

export interface ClaudeCliOpts {
  /** --model (omit → CLI/subscription default) */
  model?: string;
  timeoutMs?: number;
}

/** Run a prompt through `claude -p`; resolves with the model's text output. */
export function runClaudeCli(prompt: string, opts: ClaudeCliOpts = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['-p', '--output-format', 'text'];
  if (opts.model) args.push('--model', opts.model);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: tmpdir(), timeout: timeoutMs });
    let out = '';
    let err = '';
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return; // child 'error'/'close' and stdin 'error' can race — settle once
      settled = true;
      fn();
    };
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => done(() => reject(new Error(`claude CLI failed to start: ${e.message}`))));
    // A claude that exits early makes our (large resume) write fail with EPIPE on
    // child.stdin — a SEPARATE emitter from child.on('error'). Without this
    // listener an unhandled stream error takes down the whole process; here it
    // rejects the promise instead (the real cause usually surfaces via 'close').
    child.stdin.on('error', (e) =>
      done(() => reject(new Error(`claude CLI stdin failed: ${e.message}`)))
    );
    child.on('close', (code, signal) =>
      done(() => {
        if (signal === 'SIGTERM') return reject(new Error(`claude CLI timed out after ${timeoutMs / 1000}s`));
        if (code !== 0) return reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
        resolve(out);
      })
    );
    // Belt-and-suspenders: a synchronous throw (EPIPE can surface here too) is
    // caught and rejected rather than escaping the Promise executor.
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      done(() => reject(new Error(`claude CLI stdin failed: ${(e as Error).message}`)));
    }
  });
}
