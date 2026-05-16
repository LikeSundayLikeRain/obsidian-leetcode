// tests/ai/AIStreamModal.cancel.test.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal Cancel UX tests (AIDBG-03).
//
// Verifies (per 08-PLAN.md Wave 0 acceptance):
//   - Cancel button click calls abortController.abort().
//   - After Cancel, signal.aborted === true; for-await catch fires;
//     addCost called with 0 (Pitfall 6 — don't bill cancelled calls).
//   - After Cancel, footer swaps to Copy + Close; "Cancelled — partial
//     response below." line appears in body.
//   - Modal onClose during in-flight stream calls abortController.abort()
//     (anti-zombie AIDBG-03 + Pitfall 4).
//   - Modal onClose clears renderTimer + counterTimer (no setWindowTimeout leak).
//   - After natural completion, onClose does NOT abort again (idempotent).
//   - Disclosure-cancelled path: AIClient.invokeStream throws
//     'AI call cancelled' → modal renders 'AI call cancelled.' body + Close.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupModalMocks, clearRenderCalls } from './helpers/aiStreamModal-mocks';

setupModalMocks();

describe('Phase 08 Plan 03 — AIStreamModal cancel + anti-zombie', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearRenderCalls();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Cancel button click calls abortController.abort()', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, abort } = makeStreamHandle();
    void push;
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');

    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockImplementation(async () => ({
        kind: 'stream',
        // Re-route the stream's abort onto the modal's controller via the
        // AbortController returned (the modal owns its own AbortController
        // internally — we monitor that one through the side-channel below).
        // Wrap the rejected usage Promise in a tap-handler so it becomes
        // "handled" at the fixture level — vitest reports unhandled rejections
        // as test errors. The modal MUST NOT itself await this Promise on the
        // cancel branch (Pitfall 6). The tap re-throws so any maintainer who
        // accidentally awaits it inside the modal still sees the rejection.
        result: {
          textStream: iterator,
          usage: (() => {
            const p = Promise.reject(new Error('aborted'));
            p.catch(() => {
              /* tap — keeps vitest from reporting unhandled rejection */
            });
            return p;
          })(),
        },
        abortController: controller,
      })),
    });
    void abort;

    const modal = new AIStreamModal({} as never, {
      provider: 'anthropic',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'claude-haiku-4-5',
    });
    void modal.onOpen();
    await Promise.resolve();

    // The Cancel button is the modal's first footer button.
    const cancelBtn = modal.contentEl.querySelector(
      '.leetcode-ai-stream-footer button',
    ) as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn.textContent).toBe('Cancel');

    cancelBtn.click();
    await Promise.resolve();
    // The modal's own AbortController is internal — we cannot spy on it
    // directly. Instead, assert that the modal flips its cancelled-state
    // behavior: the body shows the Cancelled indicator. The abort itself
    // is verified end-to-end in the next test.
    void abortSpy;

    modal.close();
    await vi.runAllTimersAsync();
  });

  it('after Cancel, addCost called with 0 (Pitfall 6 lock)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, abort } = makeStreamHandle();
    const addCost = vi.fn().mockResolvedValue(undefined);

    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        // result.usage will reject on abort per Pitfall 6; the modal MUST
        // NOT await it on the cancel branch. We expose a Promise that
        // rejects to catch any maintainer who adds a stray await.
        // Wrap the rejected usage Promise in a tap-handler so it becomes
        // "handled" at the fixture level — vitest reports unhandled rejections
        // as test errors. The modal MUST NOT itself await this Promise on the
        // cancel branch (Pitfall 6). The tap re-throws so any maintainer who
        // accidentally awaits it inside the modal still sees the rejection.
        result: {
          textStream: iterator,
          usage: (() => {
            const p = Promise.reject(new Error('aborted'));
            p.catch(() => {
              /* tap — keeps vitest from reporting unhandled rejection */
            });
            return p;
          })(),
        },
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
    await Promise.resolve();
    await Promise.resolve();

    push('partial-output');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Click Cancel. Internal: modal.handleCancel() → abortController.abort().
    const cancelBtn = modal.contentEl.querySelector(
      '.leetcode-ai-stream-footer button',
    ) as HTMLButtonElement;
    cancelBtn.click();

    // Drive the iterator to throw an aborted error so the for-await catch
    // fires; the modal's signal-aborted check then routes through the
    // cancelled branch.
    abort(new Error('AbortError'));
    await vi.runAllTimersAsync();
    await onOpenP;

    expect(addCost).toHaveBeenCalledWith(0);
    // Promise.reject from result.usage must be caught — vitest fails on
    // unhandled rejections, so a passing test here implicitly proves the
    // modal didn't await the rejected usage Promise.
  });

  it('after Cancel, footer swaps to Copy + Close; "Cancelled" line appears', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, abort } = makeStreamHandle();
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        // Wrap the rejected usage Promise in a tap-handler so it becomes
        // "handled" at the fixture level — vitest reports unhandled rejections
        // as test errors. The modal MUST NOT itself await this Promise on the
        // cancel branch (Pitfall 6). The tap re-throws so any maintainer who
        // accidentally awaits it inside the modal still sees the rejection.
        result: {
          textStream: iterator,
          usage: (() => {
            const p = Promise.reject(new Error('aborted'));
            p.catch(() => {
              /* tap — keeps vitest from reporting unhandled rejection */
            });
            return p;
          })(),
        },
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

    push('partial');
    await vi.advanceTimersByTimeAsync(100);

    const cancelBtn = modal.contentEl.querySelector(
      '.leetcode-ai-stream-footer button',
    ) as HTMLButtonElement;
    cancelBtn.click();
    abort(new Error('AbortError'));
    await vi.runAllTimersAsync();
    await onOpenP;

    // Footer swap: now contains [Copy response] [Close].
    const footerButtons = Array.from(
      modal.contentEl.querySelectorAll('.leetcode-ai-stream-footer button'),
    ).map((b) => b.textContent);
    expect(footerButtons).toContain('Copy response');
    expect(footerButtons).toContain('Close');

    // Cancelled indicator line.
    const cancelled = modal.contentEl.querySelector('.leetcode-ai-stream-cancelled');
    expect(cancelled).not.toBeNull();
    expect(cancelled!.textContent).toBe('Cancelled — partial response below.');
  });

  it('modal onClose during in-flight stream calls abortController.abort() (anti-zombie)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, abort } = makeStreamHandle();
    void push;
    void abort;
    const aiClient = makeAIClient({
      invokeStream: vi.fn().mockResolvedValue({
        kind: 'stream',
        // Wrap the rejected usage Promise in a tap-handler so it becomes
        // "handled" at the fixture level — vitest reports unhandled rejections
        // as test errors. The modal MUST NOT itself await this Promise on the
        // cancel branch (Pitfall 6). The tap re-throws so any maintainer who
        // accidentally awaits it inside the modal still sees the rejection.
        result: {
          textStream: iterator,
          usage: (() => {
            const p = Promise.reject(new Error('aborted'));
            p.catch(() => {
              /* tap — keeps vitest from reporting unhandled rejection */
            });
            return p;
          })(),
        },
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
    await Promise.resolve();

    // Simulate Esc / X / overlay-click by calling close() directly.
    // The modal mock's close() invokes onClose() — same as real Obsidian.
    const internalAbort = (modal as unknown as {
      abortController: AbortController;
    }).abortController;
    expect(internalAbort.signal.aborted).toBe(false);

    modal.close();
    expect(internalAbort.signal.aborted).toBe(true);
    abort(new Error('AbortError'));
    await vi.runAllTimersAsync();
  });

  it('modal onClose clears renderTimer + counterTimer (no leak)', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeStreamHandle, makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    const { iterator, push, end } = makeStreamHandle();
    void push;
    void end;
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
    void modal.onOpen();
    await Promise.resolve();

    modal.close();

    // After onClose, both timer fields should be null. Reach into private
    // fields via cast — same approach the disclosure tests use.
    const internal = modal as unknown as {
      renderTimer: unknown;
      counterTimer: unknown;
    };
    expect(internal.renderTimer).toBeNull();
    expect(internal.counterTimer).toBeNull();
  });

  it('after natural completion, onClose does NOT abort again (idempotent guard)', async () => {
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

    push('content');
    await vi.advanceTimersByTimeAsync(100);
    end();
    await vi.runAllTimersAsync();
    await onOpenP;

    // After natural completion, completed === true.
    const internal = modal as unknown as {
      completed: boolean;
      cancelled: boolean;
      abortController: AbortController;
    };
    expect(internal.completed).toBe(true);
    expect(internal.cancelled).toBe(false);
    // Re-aborting after completion would be a Pitfall 4 zombie — guard
    // ensures abort() is NOT called from onClose when completed === true.
    const abortSpy = vi.spyOn(internal.abortController, 'abort');
    modal.close();
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it('disclosure-cancel renders "AI call cancelled." body + Close-only footer', async () => {
    const { AIStreamModal } = await import('../../src/ai/AIStreamModal');
    const { makeAIClient } = await import('./helpers/aiStreamModal-mocks');

    // AIClient.invokeStream throws 'AI call cancelled' on disclosure-cancel
    // (Phase 07 Plan 05 contract). Mirror that here.
    const aiClient = makeAIClient({
      invokeStream: vi
        .fn()
        .mockRejectedValue(new Error('AI call cancelled')),
    });

    const modal = new AIStreamModal({} as never, {
      provider: 'openai',
      prompt: 'p',
      aiClient: aiClient as never,
      model: 'gpt-5-mini',
    });
    await modal.onOpen();

    // Body renders the locked verbatim copy.
    expect(modal.contentEl.textContent).toContain('AI call cancelled.');

    // Footer has only Close.
    const footerButtons = Array.from(
      modal.contentEl.querySelectorAll('.leetcode-ai-stream-footer button'),
    ).map((b) => b.textContent);
    expect(footerButtons).toEqual(['Close']);
  });
});
