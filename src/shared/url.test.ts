import { describe, expect, test } from 'vitest';
import { isHttpUrl } from './url.js';

describe('isHttpUrl', () => {
  test('accepts http and https', () => {
    expect(isHttpUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });
  test('rejects dangerous schemes from hostile scraped data', () => {
    expect(isHttpUrl('javascript:fetch("/api/jobs/bulk")')).toBe(false);
    expect(isHttpUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isHttpUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
  });
  test('rejects empty / malformed', () => {
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});
