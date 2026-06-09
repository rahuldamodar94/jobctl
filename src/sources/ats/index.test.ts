import { describe, expect, test } from 'vitest';
import { fetchAtsCompanies } from './index.js';
import type { PoliteHttp } from '../http.js';
import type { CompanyConfig } from '../../shared/types.js';

// A stub http — never actually used here because every company URL below is
// undetectable (the early skip branch), so no FETCHER is invoked. This keeps the
// test hermetic (no network) while still exercising the progress callback.
const http = {} as PoliteHttp;

const company = (name: string): CompanyConfig => ({
  name,
  careersUrl: 'https://example.com/not-a-known-ats',
});

describe('fetchAtsCompanies progress callback', () => {
  test('onProgress fires once per company with a monotonic cumulative count (incl. the skip path)', async () => {
    const seen: { done: number; name: string }[] = [];
    const companies = [company('Acme'), company('Globex'), company('Initech')];
    const results = await fetchAtsCompanies(http, companies, () => {}, (done, name) =>
      seen.push({ done, name })
    );
    expect(results).toHaveLength(3);
    // every URL is undetectable → an error row, but progress still advances
    expect(results.every((r) => r.error)).toBe(true);
    expect(seen).toEqual([
      { done: 1, name: 'Acme' },
      { done: 2, name: 'Globex' },
      { done: 3, name: 'Initech' },
    ]);
  });

  test('a throwing onProgress never aborts the scrape (best-effort)', async () => {
    const companies = [company('Acme'), company('Globex')];
    const results = await fetchAtsCompanies(http, companies, () => {}, () => {
      throw new Error('UI/DB write blew up');
    });
    expect(results).toHaveLength(2); // completed despite the throwing callback
  });

  test('no callback is also fine (CLI / direct callers)', async () => {
    const results = await fetchAtsCompanies(http, [company('Acme')], () => {});
    expect(results).toHaveLength(1);
  });
});
