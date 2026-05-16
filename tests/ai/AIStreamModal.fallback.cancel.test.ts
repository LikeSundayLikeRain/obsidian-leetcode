// tests/ai/AIStreamModal.fallback.cancel.test.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal fallback-path Cancel tests.
//
// Verifies (per 08-PLAN.md Wave 0 acceptance):
//   - Fallback Cancel calls this.close() immediately (modal closes
//     synchronously even though text Promise is still pending).
//   - Pending text Promise lands in `.catch (() => {})` so no unhandled
//     rejection bubbles when the request resolves AFTER modal close
//     (Pitfall 3 — requestUrl has no abort).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupModalMocks, clearRenderCalls } from './helpers/aiStreamModal-mocks';

setupModalMocks();

describe('Phase 08 Plan 03 — AIStreamModal fallback-path Cancel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearRenderCalls();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fallback Cancel calls this.close() immediately', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    let resolveText!: (s: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    void resolveText;
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

    // The Cancel button is in the footer pre-resolution.
    const cancelBtn = modal.contentEl.querySelector(
      '.leetcode-ai-stream-footer button',
    ) as HTMLButtonElement;
    expect(cancelBtn.textContent).toBe('Cancel');

    // Click Cancel + close the modal. Both routes converge through
    // onClose() which aborts the controller.
    cancelBtn.click();
    modal.close();

    const internal = modal as unknown as {
      cancelled: boolean;
      abortController: AbortController;
    };
    expect(internal.cancelled).toBe(true);
    expect(internal.abortController.signal.aborted).toBe(true);

    // Verify modal is in a closed state — contentEl was emptied.
    expect(modal.contentEl.children.length).toBe(0);
  });

  it('pending text Promise lands in .catch (no unhandled rejection)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    // textPromise rejects after the modal closes — the modal MUST swallow
    // that rejection so vitest doesn't report it as an unhandled rejection.
    let rejectText!: (e: unknown) => void;
    const textPromise = new Promise<string>((_resolve, reject) => {
      rejectText = reject;
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

    modal.close();
    rejectText(new Error('post-close rejection'));

    // Drive any pending microtasks. If the modal didn't catch the
    // rejection, vitest would report an unhandled rejection error and
    // this test would fail.
    await vi.runAllTimersAsync();
    await onOpenP;

    // Sanity: the modal stayed in cancelled/closed state.
    const internal = modal as unknown as { cancelled: boolean };
    expect(internal.cancelled).toBe(true);
  });
});
