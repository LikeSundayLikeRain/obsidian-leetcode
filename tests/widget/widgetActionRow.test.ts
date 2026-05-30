// Phase 20 Plan 20-02 — widgetActionRow tests (TDD RED first).
//
// Covers ACTION-01..06, D-action-02..04 mount-side contracts:
//   1. mountActionRow returns a div with class `leetcode-code-actions` containing
//      EXACTLY 6 children in the locked D-action-03 order:
//      chevron-wrapper / Retrieve / Reset / AI Solution / Run / Submit.
//   2. Run button click invokes ctl.plugin.runFromWidget(ctl).
//   3. Chevron prefix wrapper exists and is positioned BEFORE the icon-buttons.
//   4. mountActionRow appends the row to ctl.container (sibling of .cm-editor).
//   5. AI Debug NOT in widget row (D-action-03); mousedown.preventDefault retained.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { ...actual, TFile };
});

import { mountActionRow } from '../../src/widget/widgetActions';

interface FakePlugin {
  runFromWidget: ReturnType<typeof vi.fn>;
  submitFromWidget: ReturnType<typeof vi.fn>;
  aiSolutionFromWidget: ReturnType<typeof vi.fn>;
  resetFromWidget: ReturnType<typeof vi.fn>;
  retrieveLastSubmissionFromWidget: ReturnType<typeof vi.fn>;
  switchLanguageFromWidget: ReturnType<typeof vi.fn>;
}

interface FakeCtl {
  plugin: FakePlugin;
  container: HTMLElement;
  file: { path: string };
  fenceIndex: number;
}

function makeFakeCtl(): FakeCtl {
  const plugin: FakePlugin = {
    runFromWidget: vi.fn(),
    submitFromWidget: vi.fn(),
    aiSolutionFromWidget: vi.fn(),
    resetFromWidget: vi.fn(),
    retrieveLastSubmissionFromWidget: vi.fn(),
    switchLanguageFromWidget: vi.fn(),
  };
  return {
    plugin,
    container: document.createElement('div'),
    file: { path: 'LeetCode/two-sum.md' },
    fenceIndex: 0,
  };
}

describe('mountActionRow — DOM shape (D-action-03 lock + UI-SPEC §1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a row with class leetcode-code-actions containing exactly 6 children in locked order', () => {
    const ctl = makeFakeCtl();
    const file = { path: 'LeetCode/two-sum.md' } as never;
    const row = mountActionRow(ctl as never, file, 'python3', document);

    expect(row.classList.contains('leetcode-code-actions')).toBe(true);
    expect(row.children.length).toBe(6);
    // Child[0] = chevron prefix wrapper
    expect(row.children[0]!.classList.contains('leetcode-language-chevron-wrapper')).toBe(true);
    // Child[1] = Retrieve icon-button
    expect(row.children[1]!.classList.contains('leetcode-code-action-icon')).toBe(true);
    expect((row.children[1] as HTMLButtonElement).title).toBe('Retrieve last submission');
    // Child[2] = Reset icon-button
    expect(row.children[2]!.classList.contains('leetcode-code-action-icon')).toBe(true);
    expect((row.children[2] as HTMLButtonElement).title).toBe('Reset to starter code');
    // Child[3] = AI Solution
    expect(row.children[3]!.classList.contains('leetcode-code-action-ai-solution')).toBe(true);
    // Child[4] = Run
    expect(row.children[4]!.classList.contains('leetcode-code-action-run')).toBe(true);
    // Child[5] = Submit
    expect(row.children[5]!.classList.contains('leetcode-code-action-submit')).toBe(true);
  });

  it('mountActionRow appends the row to ctl.container (sibling of .cm-editor, NOT a CM6 child)', () => {
    const ctl = makeFakeCtl();
    const file = { path: 'LeetCode/two-sum.md' } as never;
    const row = mountActionRow(ctl as never, file, 'python3', document);

    expect(ctl.container.contains(row)).toBe(true);
    expect(ctl.container.lastElementChild).toBe(row);
  });
});

describe('mountActionRow — adapter routing (*FromActive → *FromWidget per D-action-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Run button click invokes ctl.plugin.runFromWidget(ctl)', () => {
    const ctl = makeFakeCtl();
    const file = { path: 'LeetCode/two-sum.md' } as never;
    const row = mountActionRow(ctl as never, file, 'python3', document);

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(ctl.plugin.runFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.runFromWidget).toHaveBeenCalledWith(ctl);
    expect(ctl.plugin.submitFromWidget).not.toHaveBeenCalled();
  });

  it('Submit button click invokes ctl.plugin.submitFromWidget(ctl)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-submit')!.click();
    expect(ctl.plugin.submitFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.submitFromWidget).toHaveBeenCalledWith(ctl);
  });

  it('AI Solution button click invokes ctl.plugin.aiSolutionFromWidget(ctl)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-solution')!.click();
    expect(ctl.plugin.aiSolutionFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.aiSolutionFromWidget).toHaveBeenCalledWith(ctl);
  });

  it('Reset icon button click invokes ctl.plugin.resetFromWidget(ctl)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    const resetBtn = Array.from(row.querySelectorAll<HTMLButtonElement>('button.leetcode-code-action-icon'))
      .find((b) => b.title === 'Reset to starter code');
    expect(resetBtn).toBeDefined();
    resetBtn!.click();
    expect(ctl.plugin.resetFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.resetFromWidget).toHaveBeenCalledWith(ctl);
  });

  it('Retrieve icon button click invokes ctl.plugin.retrieveLastSubmissionFromWidget(ctl)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    const retrieveBtn = Array.from(row.querySelectorAll<HTMLButtonElement>('button.leetcode-code-action-icon'))
      .find((b) => b.title === 'Retrieve last submission');
    expect(retrieveBtn).toBeDefined();
    retrieveBtn!.click();
    expect(ctl.plugin.retrieveLastSubmissionFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.retrieveLastSubmissionFromWidget).toHaveBeenCalledWith(ctl);
  });

  it('mousedown.preventDefault retained on Run button (focus retention from codeBlockButtonRow.ts:59)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run')!;
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    let defaultPrevented = false;
    const origPD = evt.preventDefault.bind(evt);
    evt.preventDefault = () => {
      defaultPrevented = true;
      origPD();
    };
    runBtn.dispatchEvent(evt);

    expect(defaultPrevented).toBe(true);
  });
});

describe('mountActionRow — chevron prefix integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chevron prefix wrapper exists and is positioned BEFORE Retrieve/Reset icon buttons', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    const chevronWrapper = row.querySelector('.leetcode-language-chevron-wrapper');
    expect(chevronWrapper).not.toBeNull();
    expect(row.children[0]).toBe(chevronWrapper);

    const iconButtons = row.querySelectorAll('button.leetcode-code-action-icon');
    expect(iconButtons.length).toBe(2);
    // chevron's index < both icon buttons' indices
    const chevronIdx = Array.from(row.children).indexOf(chevronWrapper as Element);
    const retrieveIdx = Array.from(row.children).indexOf(iconButtons[0]!);
    const resetIdx = Array.from(row.children).indexOf(iconButtons[1]!);
    expect(chevronIdx).toBeLessThan(retrieveIdx);
    expect(chevronIdx).toBeLessThan(resetIdx);
  });

  it('chevron item click on different language calls ctl.plugin.switchLanguageFromWidget(ctl, file, slug)', () => {
    const ctl = makeFakeCtl();
    const file = { path: 'LeetCode/two-sum.md' } as never;
    const row = mountActionRow(ctl as never, file, 'python3', document);

    // Open the dropdown by clicking the chevron button.
    const chevronBtn = row.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    expect(chevronBtn).not.toBeNull();
    chevronBtn.click();

    // Find the dropdown — portal'd to doc.body when open.
    const dropdown = document.body.querySelector<HTMLElement>('.leetcode-language-chevron-dropdown');
    expect(dropdown).not.toBeNull();

    // Click on a non-current language item (java).
    const items = dropdown!.querySelectorAll<HTMLButtonElement>('.leetcode-language-chevron-item');
    const javaItem = Array.from(items).find((el) => el.textContent === 'Java');
    expect(javaItem).toBeDefined();
    javaItem!.click();

    expect(ctl.plugin.switchLanguageFromWidget).toHaveBeenCalledTimes(1);
    expect(ctl.plugin.switchLanguageFromWidget).toHaveBeenCalledWith(ctl, file, 'java');

    // Cleanup — close the dropdown so subsequent tests start clean.
    if (dropdown && dropdown.parentElement === document.body) {
      dropdown.remove();
    }
  });

  it('chevron item click on SAME language is a no-op (does not call switchLanguageFromWidget)', () => {
    const ctl = makeFakeCtl();
    const file = { path: 'LeetCode/two-sum.md' } as never;
    const row = mountActionRow(ctl as never, file, 'python3', document);

    const chevronBtn = row.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    chevronBtn.click();

    const dropdown = document.body.querySelector<HTMLElement>('.leetcode-language-chevron-dropdown');
    expect(dropdown).not.toBeNull();

    const items = dropdown!.querySelectorAll<HTMLButtonElement>('.leetcode-language-chevron-item');
    const pythonItem = Array.from(items).find((el) => el.classList.contains('is-current'));
    expect(pythonItem).toBeDefined();
    pythonItem!.click();

    expect(ctl.plugin.switchLanguageFromWidget).not.toHaveBeenCalled();

    if (dropdown && dropdown.parentElement === document.body) {
      dropdown.remove();
    }
  });
});

describe('mountActionRow — D-action-03 lock: AI Debug NOT in widget row', () => {
  it('row contains no AI Debug button (D-action-03 — AI Debug stays in failed verdict modal only)', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    // No button with class containing 'ai-debug'.
    const aiDebugBtn = row.querySelector('[class*="ai-debug"]');
    expect(aiDebugBtn).toBeNull();
  });

  it('row contains no Copy button (deferred per CONTEXT "Deferred Ideas")', () => {
    const ctl = makeFakeCtl();
    const row = mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    // No button with class containing 'copy'.
    const copyBtn = row.querySelector('[class*="copy"]');
    expect(copyBtn).toBeNull();
  });
});
