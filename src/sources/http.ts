/**
 * Polite HTTP client used by every adapter:
 * - fixed, honest UA
 * - 10s timeout (configurable per call for slow APIs like Ashby)
 * - 2 retries with exponential backoff + jitter on network errors / 5xx
 * - long backoff (30/60/120s) on 429/503 rate-limit responses
 * - 2-5s random delay between requests to the same host
 * - optional host allowlist + redirect:'error' — a cheap guardrail keeping
 *   ATS fetchers pinned to their API hosts (mainly protects against config
 *   mistakes; this is a single-user local tool, not an SSRF boundary)
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; jobctl/1.0; +https://github.com)';

export interface PoliteHttpOptions {
  /** Per-host minimum delay range in ms. */
  delayRangeMs?: [number, number];
  maxRetries?: number;
  timeoutMs?: number;
}

export interface RequestOptions {
  timeoutMs?: number;
  /** Restrict the request to these hosts (throws otherwise). */
  allowHosts?: string[];
  /** 'error' refuses redirects (used for ATS API calls). */
  redirect?: RequestRedirect;
  headers?: Record<string, string>;
  /** Override the per-host delay range — robust ATS APIs tolerate faster pacing. */
  delayRangeMs?: [number, number];
}

export class PoliteHttp {
  private lastRequestAt = new Map<string, number>();
  private delayRange: [number, number];
  private maxRetries: number;
  private defaultTimeout: number;

  constructor(opts: PoliteHttpOptions = {}) {
    this.delayRange = opts.delayRangeMs ?? [2000, 5000];
    this.maxRetries = opts.maxRetries ?? 2;
    this.defaultTimeout = opts.timeoutMs ?? 10_000;
  }

  async getText(url: string, opts: RequestOptions = {}): Promise<string> {
    const res = await this.request(url, opts);
    return res.text();
  }

  async getJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.request(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
    return (await res.json()) as T;
  }

  private async request(url: string, opts: RequestOptions): Promise<Response> {
    const host = new URL(url).hostname;
    if (opts.allowHosts && !opts.allowHosts.includes(host)) {
      throw new Error(`Host ${host} not in allowlist [${opts.allowHosts.join(', ')}]`);
    }

    await this.politeDelay(host, opts.delayRangeMs);

    const rateLimitBackoffs = [30_000, 60_000, 120_000];
    let lastError: Error | null = null;
    let justRateLimited = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0 && !justRateLimited) {
        // exponential backoff + jitter for ordinary failures; skipped right
        // after a rate-limit sleep (that wait already happened, don't stack)
        await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
      }
      justRateLimited = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.defaultTimeout);
        let res: Response;
        try {
          res = await fetch(url, {
            headers: { 'user-agent': USER_AGENT, ...opts.headers },
            redirect: opts.redirect ?? 'follow',
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        // Rate-limited: long backoff then retry — but fail fast on the last
        // attempt instead of sleeping for nothing.
        if (res.status === 429 || res.status === 503) {
          if (attempt >= this.maxRetries) throw new Error(`HTTP ${res.status} (rate limited, retries exhausted)`);
          await sleep(rateLimitBackoffs[attempt] ?? 120_000);
          lastError = new Error(`HTTP ${res.status}`);
          justRateLimited = true;
          continue;
        }
        if (!res.ok) {
          // The request timeout is already cleared — cap the error-body read
          // separately so a slow error stream can't hang the scraper.
          const body = (await Promise.race([res.text(), sleep(5000).then(() => '')])).slice(0, 200);
          throw new HttpError(res.status, `HTTP ${res.status} for ${url}: ${body}`);
        }
        return res;
      } catch (e) {
        // 4xx (except 429) are not retryable
        if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
        lastError = e as Error;
      }
    }
    throw lastError ?? new Error(`Request failed: ${url}`);
  }

  private async politeDelay(host: string, range?: [number, number]): Promise<void> {
    const [min, max] = range ?? this.delayRange;
    const wait = min + Math.random() * (max - min);
    const last = this.lastRequestAt.get(host) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < wait) await sleep(wait - elapsed);
    this.lastRequestAt.set(host, Date.now());
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
