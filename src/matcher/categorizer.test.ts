import { describe, expect, test } from 'vitest';
import { categorize } from './categorizer.js';
import type { CategoriesConfig } from '../shared/types.js';

const config: CategoriesConfig = {
  order: ['ai', 'defi', 'web3', 'fintech', 'web2'],
  fallback: 'web2',
  keywords: {
    ai: ['llm', 'ai agent', 'machine learning'],
    defi: ['defi', 'lending protocol', 'staking', 'amm'],
    web3: ['web3', 'blockchain', 'evm', 'on-chain', 'indexer'],
    fintech: ['payments', 'stablecoin', 'settlement', 'card issuing'],
  },
};

describe('categorize', () => {
  test('first match in order wins: AI trumps DeFi', () => {
    expect(categorize('AI Agent Engineer', 'Build LLM agents for a DeFi protocol', [], config)).toBe('ai');
  });

  test('DeFi trumps generic web3', () => {
    expect(categorize('Backend Engineer', 'Work on our lending protocol on EVM chains', [], config)).toBe('defi');
  });

  test('fintech when payments-led without defi/web3 signals', () => {
    expect(categorize('Senior Backend Engineer', 'Card issuing and payments settlement platform', [], config)).toBe('fintech');
  });

  test('tags participate in matching', () => {
    expect(categorize('Backend Engineer', '', ['stablecoin', 'payments'], config)).toBe('fintech');
  });

  test('word-boundary: "index"/"programming" must not trigger dex/amm → defi', () => {
    expect(
      categorize('Backend Engineer', 'Build the search index. Strong programming skills in payments.', [], config)
    ).toBe('fintech');
  });

  test('no category keywords → configured fallback', () => {
    expect(categorize('Backend Engineer', 'Build REST APIs for our e-commerce store', [], config)).toBe('web2');
    expect(categorize('Backend Engineer', 'Plain APIs', [], { ...config, fallback: 'other' })).toBe('other');
  });

  test('custom user taxonomy works end to end (categories are not hardcoded)', () => {
    const gamedev: CategoriesConfig = {
      order: ['gaming', 'web2'],
      fallback: 'other',
      keywords: { gaming: ['unreal', 'unity', 'game engine'] },
    };
    expect(categorize('Gameplay Programmer', 'Ship features in Unreal Engine 5', [], gamedev)).toBe('gaming');
    expect(categorize('Backend Engineer', 'REST APIs', [], gamedev)).toBe('other');
  });
});
