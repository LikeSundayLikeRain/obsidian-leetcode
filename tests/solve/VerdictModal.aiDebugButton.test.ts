// tests/solve/VerdictModal.aiDebugButton.test.ts
//
// Phase 08 Plan 05 — AI: Debug button in the verdict modal footer.
//
// LOCKED visibility union (RESEARCH §Pitfall 7): the AI Debug button is
// visible iff the verdict's classifyStatus(...).kind ∈ {wa, tle, mle, re, ce}.
// It is ABSENT for ac (Phase 09 territory), ole, ie, unknown, unknown-lc.
//
// LOCKED close-then-fire ordering (T-08-05-T-stack mitigation): when wired
// through VerdictModal, the lambda calls `this.close()` BEFORE invoking
// `this.args.onOpenAIDebug?.()` — REVERSED from onCopyFailingInput's
// fire-then-close — so AIStreamModal does not stack on top of a closing
// verdict modal.
//
// CF-07 / D-30 compliance: assertions read DOM through textContent /
// querySelector ONLY; no innerHTML.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  class MockModal {
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(public app: unknown) {
      this.titleEl = document.createElement('div');
      this.contentEl = document.createElement('div');
    }
    open() { /* no-op */ }
    close() { /* no-op */ }
    onOpen() { /* no-op */ }
    onClose() { /* no-op */ }
  }
  return {
    ...actual,
    Modal: MockModal,
    setIcon: (_el: HTMLElement, _name: string) => undefined,
    Notice: class { constructor(_msg?: string, _ms?: number) { /* no-op */ } },
  };
});


import { renderVerdict } from '../../src/solve/verdictModalRenderer';
import { VerdictModal } from '../../src/solve/VerdictModal';

interface RenderArgs {
  onCopyFailingInput?: (input: string) => void;
  onOpenAIDebug?: () => void;
}

function render(payload: unknown, args: RenderArgs = {}): { titleEl: HTMLElement; contentEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const contentEl = document.createElement('div');
  renderVerdict({
    titleEl,
    contentEl,
    payload,
    onCopyFailingInput: args.onCopyFailingInput,
    onOpenAIDebug: args.onOpenAIDebug,
  } as Parameters<typeof renderVerdict>[0]);
  return { titleEl, contentEl };
}

function getAIDebugBtn(contentEl: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(contentEl.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '') === 'AI: Debug',
  ) as HTMLButtonElement | undefined;
}

function getCopyFailingBtn(contentEl: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(contentEl.querySelectorAll('button')).find((b) =>
    /Copy failing testcase/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

function getCopyErrorBtn(contentEl: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(contentEl.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '') === 'Copy error',
  ) as HTMLButtonElement | undefined;
}

// ── Test fixtures by status_code ────────────────────────────────────────────
// `state: 'SUCCESS' as const` so the SubmitCheckResponse literal-state union
// narrows correctly when these are passed to VerdictModal.renderVerdict.
const wa = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 11,
  status_msg: 'Wrong Answer',
  input: '[2,7,11,15]\n9',
  last_testcase: '[2,7,11,15]\n9',
  std_output: '[1,0]',
  expected_output: '[0,1]',
  code_output: '[1,0]',
  expected_code_answer: '[0,1]',
};
const mle = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 12,
  status_msg: 'Memory Limit Exceeded',
  input: '[1,2,3]',
  last_testcase: '[1,2,3]',
};
const ole = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 13,
  status_msg: 'Output Limit Exceeded',
};
const tle = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 14,
  status_msg: 'Time Limit Exceeded',
  input: '[1,2,3,4,5]',
  last_testcase: '[1,2,3,4,5]',
};
const re = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 15,
  status_msg: 'Runtime Error',
  input: '[]',
  last_testcase: '[]',
  full_runtime_error: 'IndexError: list index out of range',
};
const ie = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 16,
  status_msg: 'Internal Error',
};
const ce = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 20,
  status_msg: 'Compile Error',
  full_compile_error: 'SyntaxError: invalid syntax',
};
const unknownLc = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 21,
  status_msg: 'Unknown Error',
};
const ac = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 10,
  status_msg: 'Accepted',
  status_runtime: '52 ms',
  status_memory: '15.2 MB',
  runtime_percentile: 90.5,
  memory_percentile: 85.2,
};
const unknownVerdict = {
  state: 'SUCCESS' as const,
  submission_id: '1234567890',
  status_code: 99,
  status_msg: 'Future Status',
};

describe('verdictModalRenderer — AI Debug button visibility union (Plan 08-05)', () => {
  // ── PRESENT for non-Accepted actionable verdicts ───────────────────────
  it('PRESENT for status_code=11 (WA, kind=wa)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(wa, { onOpenAIDebug });
    const btn = getAIDebugBtn(contentEl);
    expect(btn).toBeDefined();
    expect(btn?.textContent).toBe('AI: Debug');
  });

  it('PRESENT for status_code=12 (MLE, kind=mle)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(mle, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });

  it('PRESENT for status_code=14 (TLE, kind=tle)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(tle, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });

  it('PRESENT for status_code=15 (RE, kind=re)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(re, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });

  it('PRESENT for status_code=20 (CE, kind=ce)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(ce, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });

  // ── ABSENT for non-actionable verdicts ─────────────────────────────────
  it('ABSENT for status_code=10 (Accepted — Phase 09 territory)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(ac, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  it('ABSENT for status_code=13 (OLE — no actionable failing case)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(ole, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  it('ABSENT for status_code=16 (IE — internal error, not user fault)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(ie, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  it('ABSENT for status_code=21 (unknown-lc — opaque LC error)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(unknownLc, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  it('ABSENT for status_code=99 (unknown verdict — D-15 path)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(unknownVerdict, { onOpenAIDebug });
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  // ── Defensive: no button when callback absent (T-08-05-D-callback-undef) ──
  it('ABSENT when onOpenAIDebug callback is undefined even if kind=wa', () => {
    const { contentEl } = render(wa); // no onOpenAIDebug
    expect(getAIDebugBtn(contentEl)).toBeUndefined();
  });

  // ── Click semantics ────────────────────────────────────────────────────
  it('click invokes onOpenAIDebug exactly once (kind=wa)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(wa, { onOpenAIDebug });
    const btn = getAIDebugBtn(contentEl);
    expect(btn).toBeDefined();
    btn!.click();
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });

  it('click invokes onOpenAIDebug exactly once (kind=ce)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(ce, { onOpenAIDebug });
    const btn = getAIDebugBtn(contentEl);
    expect(btn).toBeDefined();
    btn!.click();
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });

  // ── DOM order: [Copy failing?][Copy error?][AI: Debug?] (Close removed per D-01) ──
  it('DOM order for kind=wa with both callbacks: [Copy failing][AI: Debug]', () => {
    const onOpenAIDebug = vi.fn();
    const onCopyFailingInput = vi.fn();
    const { contentEl } = render(wa, { onOpenAIDebug, onCopyFailingInput });
    const footer = contentEl.querySelector('.leetcode-verdict-footer');
    expect(footer).not.toBeNull();
    const buttons = Array.from(footer!.querySelectorAll('button'));
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.textContent).toMatch(/Copy failing testcase/);
    expect(buttons[1]?.textContent).toBe('AI: Debug');
  });

  it('DOM order for kind=ce with both callbacks: [Copy error][AI: Debug]', () => {
    const onOpenAIDebug = vi.fn();
    const onCopyFailingInput = vi.fn();
    const { contentEl } = render(ce, { onOpenAIDebug, onCopyFailingInput });
    const footer = contentEl.querySelector('.leetcode-verdict-footer');
    expect(footer).not.toBeNull();
    const buttons = Array.from(footer!.querySelectorAll('button'));
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.textContent).toBe('Copy error');
    expect(buttons[1]?.textContent).toBe('AI: Debug');
  });

  // ── Color contract: NO mod-cta on AI Debug button ──────────────────────
  it('AI Debug button does NOT carry .mod-cta class (UI-SPEC §Color)', () => {
    const onOpenAIDebug = vi.fn();
    const { contentEl } = render(wa, { onOpenAIDebug });
    const btn = getAIDebugBtn(contentEl);
    expect(btn).toBeDefined();
    expect(btn!.classList.contains('mod-cta')).toBe(false);
  });

  // ── Co-existence guard — Copy failing button still works on WA ─────────
  it('Copy failing testcase still present on WA when onCopyFailingInput is wired', () => {
    const { contentEl } = render(wa, {
      onCopyFailingInput: vi.fn(),
      onOpenAIDebug: vi.fn(),
    });
    expect(getCopyFailingBtn(contentEl)).toBeDefined();
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });

  // ── Co-existence guard — Copy error button still works on CE ───────────
  it('Copy error still present on CE when full_compile_error is non-empty', () => {
    const { contentEl } = render(ce, { onOpenAIDebug: vi.fn() });
    expect(getCopyErrorBtn(contentEl)).toBeDefined();
    expect(getAIDebugBtn(contentEl)).toBeDefined();
  });
});

// ── VerdictModal close-then-fire ordering (T-08-05-T-stack mitigation) ─────

describe('VerdictModal — close-then-fire ordering for onOpenAIDebug', () => {
  it('renderVerdict on WA wires onOpenAIDebug lambda that closes BEFORE firing', () => {
    const closeOrder: string[] = [];
    const onOpenAIDebug = vi.fn(() => { closeOrder.push('callback'); });
    const modal = new VerdictModal({} as never, {
      problemTitle: 'Two Sum',
      onCancel: () => undefined,
      onOpenAIDebug,
    });
    // Spy on `close` to record ordering. Since MockModal.close is a no-op,
    // we override on the instance.
    modal.close = vi.fn(() => { closeOrder.push('close'); }) as unknown as typeof modal.close;

    // Drive the modal directly into renderVerdict (bypass onOpen pending step).
    modal.renderVerdict(wa, 'Two Sum');

    // Find the AI Debug button on the modal's contentEl and click it.
    const btn = getAIDebugBtn(modal.contentEl);
    expect(btn).toBeDefined();
    btn!.click();

    // Locked invariant: close() runs BEFORE the user-supplied callback fires.
    expect(closeOrder).toEqual(['close', 'callback']);
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });

  it('renderVerdict on CE wires onOpenAIDebug lambda that closes BEFORE firing', () => {
    const closeOrder: string[] = [];
    const onOpenAIDebug = vi.fn(() => { closeOrder.push('callback'); });
    const modal = new VerdictModal({} as never, {
      problemTitle: 'Two Sum',
      onCancel: () => undefined,
      onOpenAIDebug,
    });
    modal.close = vi.fn(() => { closeOrder.push('close'); }) as unknown as typeof modal.close;

    modal.renderVerdict(ce, 'Two Sum');

    const btn = getAIDebugBtn(modal.contentEl);
    expect(btn).toBeDefined();
    btn!.click();

    expect(closeOrder).toEqual(['close', 'callback']);
  });

  it('VerdictModalArgs.onOpenAIDebug is optional (backward compat)', () => {
    // Construct WITHOUT onOpenAIDebug — must not throw.
    const modal = new VerdictModal({} as never, {
      problemTitle: 'Two Sum',
      onCancel: () => undefined,
    });
    expect(() => modal.renderVerdict(wa, 'Two Sum')).not.toThrow();
    // No callback provided → no button rendered (defensive).
    expect(getAIDebugBtn(modal.contentEl)).toBeUndefined();
  });
});
