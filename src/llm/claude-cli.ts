import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

/**
 * Shared local `claude` CLI runner — used by resume generation and the
 * fit-judge. Headless (`-p`), billed to the user's Claude subscription (no API
 * key). cwd=tmpdir keeps it hermetic (no project CLAUDE.md / scaffolding loads
 * — that's the cheap path while preserving subscription auth).
 *
 * NOTE: do NOT use `--bare` — it bypasses the logged-in subscription session
 * and demands ANTHROPIC_API_KEY, which breaks the no-API-key design (verified
 * 2026-06-08: `claude -p --bare` → "Not logged in"). The opt exists only for
 * callers that explicitly bring an API key.
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
  /** --bare: ONLY for API-key callers — breaks subscription auth (see file note). */
  bare?: boolean;
  timeoutMs?: number;
}

/** Run a prompt through `claude -p`; resolves with the model's text output. */
export function runClaudeCli(prompt: string, opts: ClaudeCliOpts = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['-p', '--output-format', 'text'];
  if (opts.bare) args.push('--bare'); // off by default — preserves subscription auth
  if (opts.model) args.push('--model', opts.model);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: tmpdir(), timeout: timeoutMs });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`claude CLI failed to start: ${e.message}`)));
    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM') return reject(new Error(`claude CLI timed out after ${timeoutMs / 1000}s`));
      if (code !== 0) return reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
