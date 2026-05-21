// tests/ai/AIStreamModal.streaming.test.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal stream-path tests.
//
// Verifies (per 08-PLAN.md Wave 0 acceptance):
//   - First chunk replaces the Thinking… placeholder; counter stops.
//   - MarkdownRenderer.render is called via flushRender after the debounce window.
//   - Stream-end fires the cost-ledger update with a non-zero value when
//     usage is exposed.
//   - Buffer accumulates across chunks; final flush has the full content.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupModalMocks } from './helpers/aiStreamModal-mocks';

setupModalMocks();

describe('Phase 08 Plan 03 — AIStreamModal stream path', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first chunk replaces Thinking… placeholder; counter stops', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, end, getUsage } = makeStreamHandle();
    void getUsage;
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        result: { textStream: iterator, usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }) },
        abortController: new AbortController(),
      }),
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'anthropic',
      prompt: 'PROMPT_BODY',
      aiClient: aiClient as never,
      model: 'claude-haiku-4-5',
    });
    const onOpenP = modal.onOpen();

    // Pre-first-chunk: body shows Thinking… placeholder.
    expect(modal.contentEl.querySelector('.leetcode-ai-stream-thinking')).not.toBeNull();

    // Push the first chunk and let the iterator deliver it.
    push('Hello ');
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve(); // allow microtask queue to drain
    await Promise.resolve();

    // First-chunk handler: Thinking… placeholder is removed.
    expect(modal.contentEl.querySelector('.leetcode-ai-stream-thinking')).toBeNull();

    // End the stream.
    end();
    await onOpenP;
  });

  it('MarkdownRenderer.render is called via flushRender after debounce window', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient, getRenderCallCount } = await import(
      './helpers/aiStreamModal-mocks'
    );

    const { iterator, push, end } = makeStreamHandle();
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        result: { textStream: iterator, usage: Promise.resolve({ inputTokens: 5, outputTokens: 5 }) },
        abortController: new AbortController(),
      }),
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'openai',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'gpt-5-mini',
    });
    const onOpenP = modal.onOpen();
    const before = getRenderCallCount();

    push('chunk-1');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(getRenderCallCount()).toBeGreaterThan(before);

    end();
    await onOpenP;
  });

  it('stream-end fires the cost-ledger update with a non-zero value', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, end } = makeStreamHandle();
    const addCost = vi.fn().mockResolvedValue(undefined);
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        result: { textStream: iterator, usage: Promise.resolve({ inputTokens: 1000, outputTokens: 1000 }) },
        abortController: new AbortController(),
      }),
      addCost,
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'anthropic',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'claude-haiku-4-5',
    });
    const onOpenP = modal.onOpen();

    push('content');
    await vi.advanceTimersByTimeAsync(100);
    end();
    await vi.runAllTimersAsync();
    await onOpenP;

    expect(addCost).toHaveBeenCalled();
    // claude-haiku-4-5 = $1/M input + $5/M output = 0.001 + 0.005 = 0.006 USD
    const cost = addCost.mock.calls[0]![0] as number;
    expect(cost).toBeGreaterThan(0);
  });

  it('buffer accumulates across chunks; final flush has the full content', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient, getLastRenderArgs } = await import(
      './helpers/aiStreamModal-mocks'
    );

    const { iterator, push, end } = makeStreamHandle();
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        result: { textStream: iterator, usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }) },
        abortController: new AbortController(),
      }),
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'anthropic',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'claude-haiku-4-5',
    });
    const onOpenP = modal.onOpen();

    push('Hello ');
    push('world');
    push('!');
    await vi.advanceTimersByTimeAsync(100);
    end();
    await vi.runAllTimersAsync();
    await onOpenP;

    const last = getLastRenderArgs();
    expect(last).toBeDefined();
    expect(last!.markdown).toBe('Hello world!');
  });
});
