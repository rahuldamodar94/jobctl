import { describe, expect, test } from 'vitest';
import { buildLinkedInPrompt, LINKEDIN_RECENCY_DAYS, LINKEDIN_SESSION_CAP } from './prompt.js';

// minimal structural stubs — buildLinkedInPrompt only reads these fields
const roles = [
  { titleKeywords: ['backend engineer', 'staff engineer'], mustHaveStack: ['typescript', 'node.js'] },
] as unknown as ReturnType<typeof import('../config/load.js').loadRoles>;
const profile = { geoPriority: ['Remote', 'Dubai', 'India'] } as unknown as ReturnType<
  typeof import('../config/load.js').loadProfile
>;

describe('buildLinkedInPrompt', () => {
  const p = buildLinkedInPrompt(roles, profile);

  test('includes the user role keywords, stack, and preferred locations', () => {
    expect(p).toContain('backend engineer');
    expect(p).toContain('staff engineer');
    expect(p).toContain('typescript');
    expect(p).toContain('Dubai');
  });

  test('encodes the recency window and the session cap', () => {
    expect(p).toContain(String(LINKEDIN_RECENCY_DAYS));
    expect(p).toContain(String(LINKEDIN_SESSION_CAP));
  });

  test('bakes in the anti-bot stop instruction and the exact JSON output shape', () => {
    expect(p.toUpperCase()).toContain('STOP IMMEDIATELY');
    expect(p).toContain('"source": "linkedin"');
    expect(p).toContain('About the job');
  });

  test('degrades gracefully when no roles/locations are configured', () => {
    const empty = buildLinkedInPrompt([] as never, { geoPriority: [] } as never);
    expect(empty).toContain('Remote'); // location fallback
    expect(empty.length).toBeGreaterThan(100);
  });
});
