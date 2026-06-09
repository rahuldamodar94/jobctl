import { describe, expect, test } from 'vitest';
import { judgeProgressLabel, parseJudgeProgress } from './types.js';

// The judge-phase sentinel is the one contract between runScrape (writes it to
// the running row's currentSource) and RunStatusStrip (reads it to show
// "Judging fit… X/Y"). Lock the round-trip and the reject cases.
describe('judge-progress sentinel', () => {
  test('label → parse round-trips', () => {
    expect(parseJudgeProgress(judgeProgressLabel(12, 105))).toEqual({ done: 12, total: 105 });
    expect(parseJudgeProgress(judgeProgressLabel(0, 0))).toEqual({ done: 0, total: 0 });
  });
  test('a real source name is NOT mistaken for judge progress', () => {
    expect(parseJudgeProgress('greenhouse: acme')).toBeNull();
    expect(parseJudgeProgress('judge')).toBeNull();
    expect(parseJudgeProgress('judging 1/2')).toBeNull(); // only the exact sentinel matches
  });
  test('null/undefined → null', () => {
    expect(parseJudgeProgress(null)).toBeNull();
    expect(parseJudgeProgress(undefined)).toBeNull();
  });
});
