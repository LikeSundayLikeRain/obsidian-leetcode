// tests/ai/AIStreamModal.debounce.test.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal 100ms debounce ring buffer tests.
//
// Verifies (per 08-PLAN.md Wave 0 + Pitfall 1):
//   - 5 chunks within 100ms produce exactly 1 flushRender call (debounce).
//   - Chunks 100ms apart produce 2+ flushRender calls (per-window flush).
//   - renderTimer is null after each flush (only ONE outstanding scheduled
//     render at a time — the debounce ring-buffer invariant).
//
// This is the unit-test gate that proves the 100ms debounce decision works
// as designed. Plan 08-03's Task 3 manual UAT (live MarkdownRenderer.render
// flicker check on a 2000-token Anthropic stream) is the live-environment
// validation; the orchestrator deferred it to dogfood per the auto-mode
// policy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupModalMocks, clearRenderCalls } from './helpers/aiStreamModal-mocks';

setupModalMocks();

describe('Phase 08 Plan 03 — AIStreamModal 100ms debounce ring buffer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearRenderCalls();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 chunks within 100ms produce exactly 1 flushRender call', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient, getRenderCallCount } = await import(
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
    await Promise.resolve();
    await Promise.resolve();

    const beforeCount = getRenderCallCount();

    // 5 chunks within the same 100ms window.
    push('a');
    await vi.advanceTimersByTimeAsync(10);
    push('b');
    await vi.advanceTimersByTimeAsync(10);
    push('c');
    await vi.advanceTimersByTimeAsync(10);
    push('d');
    await vi.advanceTimersByTimeAsync(10);
    push('e');
    // Total elapsed inside the 100ms window: 40ms — well under the
    // RENDER_DEBOUNCE_MS = 100 threshold.

    // Now advance to the debounce boundary.
    await vi.advanceTimersByTimeAsync(70);
    await Promise.resolve();

    const duringCount = getRenderCallCount();
    // 5 chunks should produce exactly 1 flushRender call within the window.
    expect(duringCount - beforeCount).toBe(1);

    // Final flush also counts — end the stream and let the natural flush fire.
    end();
    await vi.runAllTimersAsync();
    await onOpenP;
  });

  it('chunks 100ms apart produce 2 flushRender calls', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient, getRenderCallCount } = await import(
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
    await Promise.resolve();
    await Promise.resolve();

    const beforeCount = getRenderCallCount();

    // First chunk + advance past debounce window.
    push('first');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(getRenderCallCount() - beforeCount).toBe(1);

    // Second chunk + advance past debounce window.
    push('second');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(getRenderCallCount() - beforeCount).toBe(2);

    end();
    await vi.runAllTimersAsync();
    await onOpenP;
  });

  it('renderTimer is null after each flush (single outstanding render invariant)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

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
    await Promise.resolve();
    await Promise.resolve();

    const internal = modal as unknown as { renderTimer: unknown };

    push('one');
    // Drain microtasks so the iterator's next() promise resolves and the
    // for-await body runs scheduleRender() before we inspect renderTimer.
    await Promise.resolve();
    await Promise.resolve();
    // After scheduleRender(), renderTimer is non-null until the debounce
    // boundary fires.
    expect(internal.renderTimer).not.toBeNull();

    // Advance past the debounce window — flush fires, timer cleared.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(internal.renderTimer).toBeNull();

    push('two');
    await Promise.resolve();
    await Promise.resolve();
    expect(internal.renderTimer).not.toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(internal.renderTimer).toBeNull();

    end();
    await vi.runAllTimersAsync();
    await onOpenP;
  });
});
