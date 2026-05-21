// tests/ai/AIStreamModal.fallback.test.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal buffered fallback path tests.
//
// Verifies (per 08-PLAN.md Wave 0 acceptance):
//   - kind: 'buffered' shows Thinking… + counter; counter ticks every 1000ms.
//   - Single MarkdownRenderer.render call on text Promise resolution.
//   - Counter stops on text resolution.
//   - Counter clamps at 99:59+ defensively (fast-forward 6000+ seconds).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupModalMocks, clearRenderCalls } from './helpers/aiStreamModal-mocks';

setupModalMocks();

describe('Phase 08 Plan 03 — AIStreamModal buffered fallback path', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearRenderCalls();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("kind: 'buffered' shows Thinking… + counter; counter ticks every 1000ms", async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    let resolveText!: (s: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'buffered',
        text: textPromise,
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
    await Promise.resolve(); // allow invokeStream resolution to land

    // Counter at 00:00 initially.
    let thinkingEl = modal.contentEl.querySelector('.leetcode-ai-stream-thinking');
    expect(thinkingEl).not.toBeNull();
    expect(thinkingEl!.textContent).toBe('Thinking…');

    await vi.advanceTimersByTimeAsync(1000);
    thinkingEl = modal.contentEl.querySelector('.leetcode-ai-stream-thinking');
    expect(thinkingEl!.textContent).toMatch(/Thinking…\s*00:01/);

    await vi.advanceTimersByTimeAsync(1000);
    thinkingEl = modal.contentEl.querySelector('.leetcode-ai-stream-thinking');
    expect(thinkingEl!.textContent).toMatch(/Thinking…\s*00:02/);

    await vi.advanceTimersByTimeAsync(1000);
    thinkingEl = modal.contentEl.querySelector('.leetcode-ai-stream-thinking');
    expect(thinkingEl!.textContent).toMatch(/Thinking…\s*00:03/);

    resolveText('Final response.');
    await vi.runAllTimersAsync();
    await onOpenP;
  });

  it('single MarkdownRenderer.render call on text Promise resolution', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient, getRenderCallCount } = await import(
      './helpers/aiStreamModal-mocks'
    );

    let resolveText!: (s: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'buffered',
        text: textPromise,
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

    expect(getRenderCallCount()).toBe(0);

    resolveText('Final response.');
    await vi.runAllTimersAsync();
    await onOpenP;

    expect(getRenderCallCount()).toBe(1);
  });

  it('counter stops on text resolution', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    let resolveText!: (s: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'buffered',
        text: textPromise,
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

    resolveText('Done.');
    await vi.runAllTimersAsync();
    await onOpenP;

    // After resolution, the body no longer has the thinking placeholder.
    expect(modal.contentEl.querySelector('.leetcode-ai-stream-thinking')).toBeNull();

    // The body has the rendered content placeholder from MarkdownRenderer.render.
    expect(modal.contentEl.querySelector('.lc-test-rendered-markdown')).not.toBeNull();
  });

  it('counter clamps at 99:59+ defensively (fast-forward beyond 99:59)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    // Buffered-mode handle that NEVER resolves so the counter ticks freely.
    const textPromise = new Promise<string>(() => {
      /* never resolves — test asserts on the counter clamp */
    });
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'buffered',
        text: textPromise,
        abortController: new AbortController(),
      }),
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'anthropic',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'claude-haiku-4-5',
    });
    void modal.onOpen();
    await Promise.resolve();

    // Fast-forward past 99:59 — 99*60 + 59 = 5999 sec → +1 ms = 6000 sec.
    // Use 6001 sec to ensure we land squarely past the clamp.
    await vi.advanceTimersByTimeAsync(6001 * 1000);

    const thinkingEl = modal.contentEl.querySelector(
      '.leetcode-ai-stream-thinking',
    );
    expect(thinkingEl).not.toBeNull();
    expect(thinkingEl!.textContent).toMatch(/99:59\+/);

    // Force-close to clean up so vitest doesn't carry pending timers.
    modal.close();
  });
});
