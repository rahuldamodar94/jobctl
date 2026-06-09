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

  test('workable (apply.workable.com path + {slug}.workable.com)', () => {
    expect(detectAts('https://apply.workable.com/walletconnect/')).toEqual({
      provider: 'workable',
      slug: 'walletconnect',
    });
    expect(detectAts('https://acme.workable.com/')).toEqual({ provider: 'workable', slug: 'acme' });
  });

  test('teamtailor captures the whole subdomain (incl. region label)', () => {
    expect(detectAts('https://crossmint.na.teamtailor.com/jobs')).toEqual({
      provider: 'teamtailor',
      slug: 'crossmint.na',
    });
    expect(detectAts('https://acme.teamtailor.com/')).toEqual({ provider: 'teamtailor', slug: 'acme' });
  });

  test('personio ({slug}.jobs.personio.com)', () => {
    expect(detectAts('https://safe-labs.jobs.personio.com/')).toEqual({
      provider: 'personio',
      slug: 'safe-labs',
    });
  });

  test('breezy ({slug}.breezy.hr)', () => {
    expect(detectAts('https://zero-hash.breezy.hr/')).toEqual({ provider: 'breezy', slug: 'zero-hash' });
  });

  test('pinpoint ({slug}.pinpointhq.com)', () => {
    expect(detectAts('https://tabby.pinpointhq.com/')).toEqual({ provider: 'pinpoint', slug: 'tabby' });
  });

  test('unknown URLs → null', () => {
    expect(detectAts('https://company.com/careers')).toBe(null);
    expect(detectAts('https://myworkdayjobs.com/acme')).toBe(null);
  });
});
