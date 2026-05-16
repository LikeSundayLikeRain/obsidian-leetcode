// Phase 5.3 (POLISH-09 / D-09) — codeBlockButtonRow optional prefix coverage.
// Asserts the contract that protects D-09 lock: Reading-Mode caller (no opts)
// produces a 3-child row (Run + Submit + AI: Debug); Edit-Mode caller (with
// opts.prefix) produces a 4-child row with the prefix FIRST. Plus regression
// coverage that Run/Submit/AI-Debug click handlers continue to work in both
// shapes.
//
// Phase 08 Plan 04 (AIDBG-01) — bumped child counts 2→3 / 3→4 and added the
// 3rd-/4th-child class assertion + AI Debug click invocation case. The
// no-prefix invariant (`row.children[0]` is `.leetcode-code-action-run`) is
// preserved as a regression guard — the AI button is appended LAST so the
// existing 2 buttons keep their indices.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { buildCodeBlockButtonRow } from '../../src/main/codeBlockButtonRow';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';

type HostPlugin = Parameters<typeof buildCodeBlockButtonRow>[1];

function withHostMethods(overrides?: {
  runFromActive?: ReturnType<typeof vi.fn>;
  submitFromActive?: ReturnType<typeof vi.fn>;
  aiDebugFromActive?: ReturnType<typeof vi.fn>;
}): HostPlugin {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = overrides?.runFromActive ?? vi.fn();
  plugin.submitFromActive = overrides?.submitFromActive ?? vi.fn();
  plugin.aiDebugFromActive = overrides?.aiDebugFromActive ?? vi.fn();
  return plugin as unknown as HostPlugin;
}

describe('buildCodeBlockButtonRow without opts.prefix (Reading-Mode parity, D-09 + AIDBG-01)', () => {
  it('produces a row with EXACTLY 3 children (Run, Submit, AI: Debug) — no chevron leak in Reading Mode', () => {
    const plugin = withHostMethods();
    const row = buildCodeBlockButtonRow(document, plugin);

    expect(row.classList.contains('leetcode-code-actions')).toBe(true);
    expect(row.children.length).toBe(3);
    // Phase 5.3 D-09 invariant — `row.children[0]` is STILL the Run button,
    // not the chevron, in the no-prefix path. Phase 08 appends AI: Debug at
    // the END so existing indices are preserved.
    expect(row.children[0]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[1]!.classList.contains('leetcode-code-action-submit')).toBe(true);
    expect(row.children[2]!.classList.contains('leetcode-code-action-ai-debug')).toBe(true);
  });

  it('Run button click invokes plugin.runFromActive (no Submit / AI Debug side effect)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiDebugFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiDebugFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).not.toHaveBeenCalled();
    expect(aiDebugFromActive).not.toHaveBeenCalled();
  });

  it('Submit button click invokes plugin.submitFromActive (no Run / AI Debug side effect)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiDebugFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiDebugFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const submitBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit');
    expect(submitBtn).not.toBeNull();
    submitBtn!.click();

    expect(submitFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
    expect(aiDebugFromActive).not.toHaveBeenCalled();
  });

  it('AI Debug button click invokes plugin.aiDebugFromActive exactly once (AIDBG-01)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiDebugFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiDebugFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-debug');
    expect(aiBtn).not.toBeNull();
    expect(aiBtn!.textContent).toBe('AI: Debug');
    aiBtn!.click();

    expect(aiDebugFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
    expect(submitFromActive).not.toHaveBeenCalled();
  });

  it('AI Debug click preventDefault + stopPropagation — no event leak to underlying CM6 doc', () => {
    const aiDebugFromActive = vi.fn();
    const plugin = withHostMethods({ aiDebugFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-debug');
    expect(aiBtn).not.toBeNull();

    // Synthesize a click event so we can introspect the propagation flags.
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    let defaultPrevented = false;
    let propagationStopped = false;
    const origPreventDefault = evt.preventDefault.bind(evt);
    const origStopPropagation = evt.stopPropagation.bind(evt);
    evt.preventDefault = () => {
      defaultPrevented = true;
      origPreventDefault();
    };
    evt.stopPropagation = () => {
      propagationStopped = true;
      origStopPropagation();
    };
    aiBtn!.dispatchEvent(evt);

    expect(defaultPrevented).toBe(true);
    expect(propagationStopped).toBe(true);
    expect(aiDebugFromActive).toHaveBeenCalledTimes(1);
  });
});

describe('buildCodeBlockButtonRow with opts.prefix (Edit-Mode chevron, D-06/D-09 + AIDBG-01)', () => {
  it('produces a row with 4 children, prefix FIRST then Run then Submit then AI: Debug LAST', () => {
    const plugin = withHostMethods();
    const prefixEl = document.createElement('span');
    prefixEl.className = 'leetcode-language-chevron-wrapper';
    prefixEl.textContent = '▼ Python';
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => prefixEl,
    });

    expect(row.children.length).toBe(4);
    expect(row.children[0]).toBe(prefixEl);
    expect(row.children[1]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[2]!.classList.contains('leetcode-code-action-submit')).toBe(true);
    expect(row.children[3]!.classList.contains('leetcode-code-action-ai-debug')).toBe(true);
  });

  it('still wires Run + Submit + AI Debug click handlers correctly when prefix is present', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiDebugFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiDebugFromActive });
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => document.createElement('span'),
    });

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    const submitBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit');
    const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-debug');
    runBtn!.click();
    submitBtn!.click();
    aiBtn!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).toHaveBeenCalledTimes(1);
    expect(aiDebugFromActive).toHaveBeenCalledTimes(1);
  });

  it('prefix factory is invoked exactly once (DOM is built up-front, not on every event)', () => {
    const plugin = withHostMethods();
    const prefixFactory = vi.fn(() => document.createElement('span'));
    buildCodeBlockButtonRow(document, plugin, { prefix: prefixFactory });

    expect(prefixFactory).toHaveBeenCalledTimes(1);
  });
});
