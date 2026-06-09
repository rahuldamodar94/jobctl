import { describe, expect, test } from 'vitest';
import { withTimeout } from './guards.js';

describe('withTimeout', () => {
  test('passes through a value that resolves in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'x')).resolves.toBe('ok');
  });
  test('rejects with a labelled error when the work overruns', async () => {
    const slow = new Promise<void>((r) => setTimeout(r, 200));
    await expect(withTimeout(slow, 10, 'pdf extraction')).rejects.toThrow(/pdf extraction timed out/);
  });
});
