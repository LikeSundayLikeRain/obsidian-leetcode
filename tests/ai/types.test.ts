// tests/ai/types.test.ts
// Phase 07 Plan 01 Task 1 — Wave 0 type-test scaffold for src/ai/types.ts.
//
// The cast `as AIProvider[]` IS the type test: if the union shape ever drifts
// (an entry added/removed/reordered) this file fails to compile and the
// downstream Phase 07 plans are protected from a silent contract change.
// Plans 02–06 import the same union; D-04 (browse/types.ts) reuse precedent.

import { describe, it, expect } from 'vitest';
import type {
  AIProvider,
  ProviderConfig,
  AICostLedger,
  ProbeResult,
  AIRequest,
  AIResponse,
} from '../../src/ai/types';

describe('Phase 07 ai/types — locked union + interface shapes', () => {
  it('AIProvider union contains exactly 5 entries in locked order', () => {
    const providers: AIProvider[] = [
      'anthropic',
      'openai',
      'openrouter',
      'ollama',
      'custom',
    ];
    expect(providers).toHaveLength(5);
  });

  it('ProviderConfig accepts exactly four required fields', () => {
    const cfg: ProviderConfig = {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku-4-5',
      disclosureAcknowledged: false,
    };
    expect(cfg.apiKey).toBe('');
    expect(cfg.baseUrl).toBe('https://api.anthropic.com/v1');
    expect(cfg.model).toBe('claude-haiku-4-5');
    expect(cfg.disclosureAcknowledged).toBe(false);
  });

  it('AICostLedger has date + usdToday fields', () => {
    const ledger: AICostLedger = { date: '2026-05-15', usdToday: 0 };
    expect(ledger.date).toBe('2026-05-15');
    expect(ledger.usdToday).toBe(0);
  });

  it('ProbeResult has ok with optional modelCount and errorMessage', () => {
    const ok: ProbeResult = { ok: true, modelCount: 5 };
    const fail: ProbeResult = { ok: false, errorMessage: 'unreachable' };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
    expect(fail.errorMessage).toBe('unreachable');
  });

  it('AIRequest and AIResponse are exported (Phase 08 expands)', () => {
    // These interfaces are intentionally empty in Phase 07 (placeholders for
    // Plan 07-02's AIClient.invoke(req: AIRequest): Promise<AIResponse>).
    const req: AIRequest = {};
    const res: AIResponse = {};
    expect(req).toBeDefined();
    expect(res).toBeDefined();
  });
});
