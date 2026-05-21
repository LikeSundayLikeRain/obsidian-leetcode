// tests/ai/pricing.test.ts
// Phase 07 Plan 02 Task 2 — pricing table + estimateCostUsd tests.
//
// Locked invariants:
//   - 4 default-model rates (claude-haiku-4-5, gpt-5-mini, anthropic/claude-haiku-4.5, llama3.2)
//   - Unknown models return 0 (safe default per CONTEXT decision F)
//   - OpenRouter slug uses DOT not dash (regression on RESEARCH Assumption A4)

import { describe, it, expect } from 'vitest';
import { PRICING, estimateCostUsd } from '../../src/ai/pricing';

describe('Phase 07 pricing — estimateCostUsd', () => {
  it('returns 0 for unknown model', () => {
    expect(estimateCostUsd('unknown-model', { inputTokens: 100, outputTokens: 100 })).toBe(0);
  });

  it('computes cost for claude-haiku-4-5 (input 1e-6, output 5e-6)', () => {
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6.0, 6); // 1.0 + 5.0
  });

  it('computes cost for gpt-5-mini (input 0.25e-6, output 2e-6)', () => {
    const cost = estimateCostUsd('gpt-5-mini', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2.25, 6); // 0.25 + 2.0
  });

  it('returns 0 cost for ollama llama3.2 (both rates are 0)', () => {
    expect(estimateCostUsd('llama3.2', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
  });
});

describe('Phase 07 pricing — PRICING table regression (RESEARCH Assumption A4)', () => {
  it('OpenRouter slug uses dot not dash', () => {
    expect(PRICING['anthropic/claude-haiku-4.5']).toBeDefined();
    expect(PRICING['anthropic/claude-haiku-4-5']).toBeUndefined();
  });
});
