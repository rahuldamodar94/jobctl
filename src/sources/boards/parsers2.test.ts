import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRemoteOkJobs } from './remoteok.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const read = (n: string) => readFileSync(join(FIX, n), 'utf8');

describe('parseRemoteOkJobs', () => {
  const jobs = parseRemoteOkJobs(JSON.parse(read('remoteok.json')));
  test('skips the legal-notice item and maps fields', () => {
    expect(jobs.length).toBe(3);
    expect(jobs[0]!.company).toBeTruthy();
    expect(jobs[0]!.title).toBeTruthy();
    expect(jobs[0]!.workMode).toBe('remote');
  });
});
