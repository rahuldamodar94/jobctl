import { describe, expect, test } from 'vitest';
import { detectAts } from './detect.js';

describe('detectAts', () => {
  test('greenhouse variants', () => {
    expect(detectAts('https://job-boards.greenhouse.io/anthropic')).toEqual({
      provider: 'greenhouse',
      slug: 'anthropic',
    });
    expect(detectAts('https://job-boards.eu.greenhouse.io/polyai')).toEqual({
      provider: 'greenhouse',
      slug: 'polyai',
    });
    expect(detectAts('https://boards.greenhouse.io/uniswaplabs/jobs/123')).toEqual({
      provider: 'greenhouse',
      slug: 'uniswaplabs',
    });
  });

  test('lever', () => {
    expect(detectAts('https://jobs.lever.co/mistral')).toEqual({ provider: 'lever', slug: 'mistral' });
  });

  test('ashby with dots in slug', () => {
    expect(detectAts('https://jobs.ashbyhq.com/li.fi')).toEqual({ provider: 'ashby', slug: 'li.fi' });
    expect(detectAts('https://jobs.ashbyhq.com/sei-labs?utm=x')).toEqual({
      provider: 'ashby',
      slug: 'sei-labs',
    });
  });

  test('greenhouse embed form (?for=slug)', () => {
    expect(detectAts('https://boards.greenhouse.io/embed/job_board?for=acme&b=1')).toEqual({
      provider: 'greenhouse',
      slug: 'acme',
    });
  });

  test('unknown URLs → null', () => {
    expect(detectAts('https://company.com/careers')).toBe(null);
    expect(detectAts('https://myworkdayjobs.com/acme')).toBe(null);
  });
});
