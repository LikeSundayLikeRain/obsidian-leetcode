// tests/ai/providers/abortSignal.test.ts
//
// Phase 08 Plan 02 Task 2 — Assumption A4 enforcement (RESEARCH §"Assumptions
// Log"). Validates that streamX / invokeXBuffered correctly forward
// `abortSignal` into the AI SDK's `streamText` / `generateText` for ALL 4
// provider files. The SDK's contract is `streamText({ abortSignal })` →
// `mergeAbortSignals(...)` → injected fetch's `init.signal` (verified via
// node_modules/ai/dist/index.mjs:6543).
//
// Strategy: vi.mock the `'ai'` module so streamText/generateText capture the
// arg shape without actually firing HTTP. We assert each provider passes the
// signal through.
//
// 8 cases minimum (2 per provider × 4 providers).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const streamTextSpy = vi.fn();
const generateTextSpy = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextSpy(...args),
  generateText: (...args: unknown[]) => generateTextSpy(...args),
}));

// Mock SDK provider factories so model construction doesn't try to validate
// API keys at import time. Each factory returns a callable that returns a
// stub model object.
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => ({ provider: 'anthropic-stub' })),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => () => ({ provider: 'openai-stub' })),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => () => ({ provider: 'openai-compatible-stub' })),
}));

vi.mock('obsidian', async () => await import('../../helpers/obsidian-stub'));

const CFG = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
  disclosureAcknowledged: true,
};

describe('Phase 08 AIDBG-T-08-02-D-zombie — Anthropic abortSignal propagation', () => {
  beforeEach(() => {
    streamTextSpy.mockReset();
    generateTextSpy.mockReset();
  });

  it('streamAnthropic passes abortSignal:signal to streamText', async () => {
    streamTextSpy.mockReturnValue({ textStream: (async function* () {})() });
    const { streamAnthropic } = await import('../../../src/ai/providers/anthropic');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    streamAnthropic(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(streamTextSpy).toHaveBeenCalledTimes(1);
    const args = streamTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal; prompt: string };
    expect(args.abortSignal).toBe(ctrl.signal);
    expect(args.prompt).toBe('hi');
  });

  it('invokeAnthropicBuffered passes abortSignal:signal to generateText', async () => {
    generateTextSpy.mockResolvedValue({ text: 'ok', usage: undefined });
    const { invokeAnthropicBuffered } = await import('../../../src/ai/providers/anthropic');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    await invokeAnthropicBuffered(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal; prompt: string };
    expect(args.abortSignal).toBe(ctrl.signal);
    expect(args.prompt).toBe('hi');
  });
});

describe('Phase 08 AIDBG-T-08-02-D-zombie — OpenAI abortSignal propagation', () => {
  beforeEach(() => {
    streamTextSpy.mockReset();
    generateTextSpy.mockReset();
  });

  it('streamOpenAI passes abortSignal:signal to streamText', async () => {
    streamTextSpy.mockReturnValue({ textStream: (async function* () {})() });
    const { streamOpenAI } = await import('../../../src/ai/providers/openai');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    streamOpenAI(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(streamTextSpy).toHaveBeenCalledTimes(1);
    const args = streamTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });

  it('invokeOpenAIBuffered passes abortSignal:signal to generateText', async () => {
    generateTextSpy.mockResolvedValue({ text: 'ok' });
    const { invokeOpenAIBuffered } = await import('../../../src/ai/providers/openai');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    await invokeOpenAIBuffered(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });
});

describe('Phase 08 AIDBG-T-08-02-D-zombie — OpenAI-compatible abortSignal propagation', () => {
  beforeEach(() => {
    streamTextSpy.mockReset();
    generateTextSpy.mockReset();
  });

  it('streamOpenAICompatible passes abortSignal:signal to streamText', async () => {
    streamTextSpy.mockReturnValue({ textStream: (async function* () {})() });
    const { streamOpenAICompatible } = await import('../../../src/ai/providers/openaiCompatible');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    streamOpenAICompatible(CFG, fetcher as never, 'hi', ctrl.signal, 'openrouter');
    expect(streamTextSpy).toHaveBeenCalledTimes(1);
    const args = streamTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });

  it('invokeOpenAICompatibleBuffered passes abortSignal:signal to generateText', async () => {
    generateTextSpy.mockResolvedValue({ text: 'ok' });
    const { invokeOpenAICompatibleBuffered } = await import(
      '../../../src/ai/providers/openaiCompatible'
    );
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    await invokeOpenAICompatibleBuffered(CFG, fetcher as never, 'hi', ctrl.signal, 'custom');
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });
});

describe('Phase 08 AIDBG-T-08-02-D-zombie — Ollama abortSignal propagation', () => {
  beforeEach(() => {
    streamTextSpy.mockReset();
    generateTextSpy.mockReset();
  });

  it('streamOllama passes abortSignal:signal to streamText', async () => {
    streamTextSpy.mockReturnValue({ textStream: (async function* () {})() });
    const { streamOllama } = await import('../../../src/ai/providers/ollama');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    streamOllama(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(streamTextSpy).toHaveBeenCalledTimes(1);
    const args = streamTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });

  it('invokeOllamaBuffered passes abortSignal:signal to generateText', async () => {
    generateTextSpy.mockResolvedValue({ text: 'ok' });
    const { invokeOllamaBuffered } = await import('../../../src/ai/providers/ollama');
    const ctrl = new AbortController();
    const fetcher = vi.fn();
    await invokeOllamaBuffered(CFG, fetcher as never, 'hi', ctrl.signal);
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(args.abortSignal).toBe(ctrl.signal);
  });
});

describe('Phase 08 AIDBG-T-08-02-D-zombie — abort cascade end-to-end', () => {
  beforeEach(() => {
    streamTextSpy.mockReset();
    generateTextSpy.mockReset();
  });

  it('aborting the controller before invokeXBuffered runs causes generateText to receive an aborted signal', async () => {
    generateTextSpy.mockImplementation((args: { abortSignal: AbortSignal }) => {
      // Simulate the SDK's behavior: check signal.aborted at call time.
      if (args.abortSignal.aborted) {
        const e = new Error('aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve({ text: 'ok' });
    });
    const { invokeAnthropicBuffered } = await import('../../../src/ai/providers/anthropic');
    const ctrl = new AbortController();
    ctrl.abort();
    const fetcher = vi.fn();
    await expect(
      invokeAnthropicBuffered(CFG, fetcher as never, 'hi', ctrl.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
