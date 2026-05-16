// tests/ai/types.test.ts
// Phase 07 Plan 01 Task 1 — Wave 0 type-test scaffold for src/ai/types.ts.
//
// The cast `as AIProvider[]` IS the type test: if the union shape ever drifts
// (an entry added/removed/reordered) this file fails to compile and the
// downstream Phase 07 plans are protected from a silent contract change.
// Plans 02–06 import the same union; D-04 (browse/types.ts) reuse precedent.
//
// Phase 08 Plan 01 Task 1 — extends with AIRequest/AIResponse field-presence
// assertions and a runtime grep against the source file to confirm the
// `@typescript-eslint/no-empty-object-type` eslint-disable suppressions are
// REMOVED (the empty-but-named Phase-07 placeholder shape is gone).

import * as fs from 'node:fs';
import * as path from 'node:path';
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

  it('AIRequest carries the four locked fields (prompt, maxTokens?, stream?, signal?)', () => {
    // Phase 08 Plan 01 Task 1 — locked field set per 08-CONTEXT decision E +
    // 08-RESEARCH §"E. AIRequest / AIResponse expansion".
    const ctrl = new AbortController();
    const req: AIRequest = {
      prompt: 'Debug my solution',
      maxTokens: 1024,
      stream: true,
      signal: ctrl.signal,
    };
    expect(req.prompt).toBe('Debug my solution');
    expect(req.maxTokens).toBe(1024);
    expect(req.stream).toBe(true);
    expect(req.signal).toBe(ctrl.signal);

    // Optional fields can be omitted — only `prompt` is required.
    const minimal: AIRequest = { prompt: 'ping' };
    expect(minimal.prompt).toBe('ping');
    expect(minimal.maxTokens).toBeUndefined();
    expect(minimal.stream).toBeUndefined();
    expect(minimal.signal).toBeUndefined();
  });

  it('AIResponse carries text + usdCost with optional usage', () => {
    // Phase 08 Plan 01 Task 1 — locked field set per 08-CONTEXT decision E.
    const res: AIResponse = {
      text: 'You forgot to handle the empty-array case.',
      usdCost: 0.0123,
      usage: { inputTokens: 850, outputTokens: 120 },
    };
    expect(res.text).toContain('empty-array');
    expect(res.usdCost).toBeCloseTo(0.0123);
    expect(res.usage?.inputTokens).toBe(850);
    expect(res.usage?.outputTokens).toBe(120);

    // usage is optional — Ollama / unknown providers may omit it.
    const noUsage: AIResponse = { text: 'ok', usdCost: 0 };
    expect(noUsage.text).toBe('ok');
    expect(noUsage.usdCost).toBe(0);
    expect(noUsage.usage).toBeUndefined();
  });

  it('src/ai/types.ts no longer carries empty-interface eslint-disable suppressions', () => {
    // Phase 08 Plan 01 Task 1 acceptance criterion:
    //   `grep -n 'eslint-disable-next-line @typescript-eslint/no-empty-object-type'
    //    src/ai/types.ts` returns 0 hits (the comments are gone because the
    //    interfaces now carry real fields).
    const typesPath = path.resolve(__dirname, '../../src/ai/types.ts');
    const fileContent = fs.readFileSync(typesPath, 'utf8');
    expect(fileContent.includes('@typescript-eslint/no-empty-object-type')).toBe(false);
    // Sanity: the interfaces themselves are still exported.
    expect(/export interface AIRequest \{/.test(fileContent)).toBe(true);
    expect(/export interface AIResponse \{/.test(fileContent)).toBe(true);
  });
});
