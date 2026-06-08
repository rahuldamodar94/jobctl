import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PoliteHttp, HttpError } from './http.js';

/**
 * Retry/backoff behavior with a mocked global fetch and fake timers.
 * Delays are configured to ~0 so tests run instantly; we assert CALL COUNTS
 * and outcomes, not wall-clock times.
 */

const ok = (body: string) => new Response(body, { status: 200 });
const status = (code: number) => new Response(`err body`, { status: code });

function fastHttp() {
  return new PoliteHttp({ delayRangeMs: [0, 0], maxRetries: 2 });
}

describe('PoliteHttp retries', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('5xx retried then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(ok('hello'));
    vi.stubGlobal('fetch', fetchMock);

    const p = fastHttp().getText('https://example.com/x');
    await vi.runAllTimersAsync();
    expect(await p).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('404 is NOT retried and throws HttpError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(404));
    vi.stubGlobal('fetch', fetchMock);

    const p = fastHttp().getText('https://example.com/x');
    p.catch(() => {}); // avoid unhandled-rejection noise before assertion
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('429 backs off once (single sleep, no doubled generic backoff) then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok('recovered'));
    vi.stubGlobal('fetch', fetchMock);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const p = fastHttp().getText('https://example.com/x');
    await vi.runAllTimersAsync();
    expect(await p).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // exactly ONE long (>=30s) sleep was scheduled for the rate limit; the
    // generic exponential backoff must not stack a second wait on top
    const longSleeps = setTimeoutSpy.mock.calls.filter(([, ms]) => typeof ms === 'number' && ms >= 30_000);
    expect(longSleeps.length).toBe(1);
  });

  test('429 on final attempt fails fast without a pointless sleep', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(429));
    vi.stubGlobal('fetch', fetchMock);

    const p = fastHttp().getText('https://example.com/x');
    p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('host allowlist rejects before any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fastHttp().getJson('https://evil.com/x', { allowHosts: ['api.lever.co'] })
    ).rejects.toThrow(/allowlist/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
