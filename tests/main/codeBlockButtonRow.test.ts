// Phase 12 — codeBlockButtonRow: AI Solution + Run + Submit.
// Reading-Mode (no prefix) produces 3-child row; Edit-Mode (with prefix) produces 4-child.
// AI Debug removed from fence row (stays in failed verdict modal only).

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
  aiSolutionFromActive?: ReturnType<typeof vi.fn>;
}): HostPlugin {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = overrides?.runFromActive ?? vi.fn();
  plugin.submitFromActive = overrides?.submitFromActive ?? vi.fn();
  plugin.aiDebugFromActive = overrides?.aiDebugFromActive ?? vi.fn();
  plugin.aiSolutionFromActive = overrides?.aiSolutionFromActive ?? vi.fn();
  return plugin as unknown as HostPlugin;
}

describe('buildCodeBlockButtonRow without opts.prefix (Reading-Mode)', () => {
  it('produces a row with 3 children: AI Solution, Run, Submit', () => {
    const plugin = withHostMethods();
    const row = buildCodeBlockButtonRow(document, plugin);

    expect(row.classList.contains('leetcode-code-actions')).toBe(true);
    expect(row.children.length).toBe(3);
    expect(row.children[0]!.classList.contains('leetcode-code-action-ai-solution')).toBe(true);
    expect(row.children[1]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[2]!.classList.contains('leetcode-code-action-submit')).toBe(true);
  });

  it('Run button click invokes plugin.runFromActive', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiSolutionFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiSolutionFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run')!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).not.toHaveBeenCalled();
    expect(aiSolutionFromActive).not.toHaveBeenCalled();
  });

  it('Submit button click invokes plugin.submitFromActive', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiSolutionFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiSolutionFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit')!.click();

    expect(submitFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
    expect(aiSolutionFromActive).not.toHaveBeenCalled();
  });

  it('AI Solution button click invokes plugin.aiSolutionFromActive', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiSolutionFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiSolutionFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-solution');
    expect(aiBtn).not.toBeNull();
    expect(aiBtn!.textContent).toBe('AI Solution');
    aiBtn!.click();

    expect(aiSolutionFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
    expect(submitFromActive).not.toHaveBeenCalled();
  });

  it('AI Solution click preventDefault + stopPropagation', () => {
    const aiSolutionFromActive = vi.fn();
    const plugin = withHostMethods({ aiSolutionFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-solution')!;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    let defaultPrevented = false;
    let propagationStopped = false;
    const origPD = evt.preventDefault.bind(evt);
    const origSP = evt.stopPropagation.bind(evt);
    evt.preventDefault = () => { defaultPrevented = true; origPD(); };
    evt.stopPropagation = () => { propagationStopped = true; origSP(); };
    aiBtn.dispatchEvent(evt);

    expect(defaultPrevented).toBe(true);
    expect(propagationStopped).toBe(true);
    expect(aiSolutionFromActive).toHaveBeenCalledTimes(1);
  });
});

describe('buildCodeBlockButtonRow with opts.prefix (Edit-Mode chevron)', () => {
  it('produces a row with 4 children: prefix, AI Solution, Run, Submit', () => {
    const plugin = withHostMethods();
    const prefixEl = document.createElement('span');
    prefixEl.className = 'leetcode-language-chevron-wrapper';
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => prefixEl,
    });

    expect(row.children.length).toBe(4);
    expect(row.children[0]).toBe(prefixEl);
    expect(row.children[1]!.classList.contains('leetcode-code-action-ai-solution')).toBe(true);
    expect(row.children[2]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[3]!.classList.contains('leetcode-code-action-submit')).toBe(true);
  });

  it('all click handlers wired correctly with prefix present', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const aiSolutionFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive, aiSolutionFromActive });
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => document.createElement('span'),
    });

    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-solution')!.click();
    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run')!.click();
    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit')!.click();

    expect(aiSolutionFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).toHaveBeenCalledTimes(1);
  });

  it('prefix factory is invoked exactly once', () => {
    const plugin = withHostMethods();
    const prefixFactory = vi.fn(() => document.createElement('span'));
    buildCodeBlockButtonRow(document, plugin, { prefix: prefixFactory });

    expect(prefixFactory).toHaveBeenCalledTimes(1);
  });
});
