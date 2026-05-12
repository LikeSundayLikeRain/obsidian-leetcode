// Phase 5.3 (POLISH-09 / D-09) — codeBlockButtonRow optional prefix coverage.
// Asserts the contract that protects D-09 lock: Reading-Mode caller (no opts)
// produces a 2-child row (Run + Submit only); Edit-Mode caller (with opts.prefix)
// produces a 3-child row with the prefix FIRST. Plus regression coverage that
// Run/Submit click handlers continue to work in both shapes.

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
}): HostPlugin {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = overrides?.runFromActive ?? vi.fn();
  plugin.submitFromActive = overrides?.submitFromActive ?? vi.fn();
  return plugin as unknown as HostPlugin;
}

describe('buildCodeBlockButtonRow without opts.prefix (Reading-Mode parity, D-09)', () => {
  it('produces a row with EXACTLY 2 children (Run, Submit) — no chevron leak in Reading Mode', () => {
    const plugin = withHostMethods();
    const row = buildCodeBlockButtonRow(document, plugin);

    expect(row.classList.contains('leetcode-code-actions')).toBe(true);
    expect(row.children.length).toBe(2);
    expect(row.children[0]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[1]!.classList.contains('leetcode-code-action-submit')).toBe(true);
  });

  it('Run button click invokes plugin.runFromActive (no Submit side effect)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).not.toHaveBeenCalled();
  });

  it('Submit button click invokes plugin.submitFromActive (no Run side effect)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive });
    const row = buildCodeBlockButtonRow(document, plugin);

    const submitBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit');
    expect(submitBtn).not.toBeNull();
    submitBtn!.click();

    expect(submitFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
  });
});

describe('buildCodeBlockButtonRow with opts.prefix (Edit-Mode chevron, D-06/D-09)', () => {
  it('produces a row with 3 children, prefix FIRST then Run then Submit', () => {
    const plugin = withHostMethods();
    const prefixEl = document.createElement('span');
    prefixEl.className = 'leetcode-language-chevron-wrapper';
    prefixEl.textContent = '▼ Python';
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => prefixEl,
    });

    expect(row.children.length).toBe(3);
    expect(row.children[0]).toBe(prefixEl);
    expect(row.children[1]!.classList.contains('leetcode-code-action-run')).toBe(true);
    expect(row.children[2]!.classList.contains('leetcode-code-action-submit')).toBe(true);
  });

  it('still wires Run + Submit click handlers correctly when prefix is present', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const plugin = withHostMethods({ runFromActive, submitFromActive });
    const row = buildCodeBlockButtonRow(document, plugin, {
      prefix: () => document.createElement('span'),
    });

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    const submitBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit');
    runBtn!.click();
    submitBtn!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).toHaveBeenCalledTimes(1);
  });

  it('prefix factory is invoked exactly once (DOM is built up-front, not on every event)', () => {
    const plugin = withHostMethods();
    const prefixFactory = vi.fn(() => document.createElement('span'));
    buildCodeBlockButtonRow(document, plugin, { prefix: prefixFactory });

    expect(prefixFactory).toHaveBeenCalledTimes(1);
  });
});
