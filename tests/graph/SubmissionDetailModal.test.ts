// tests/graph/SubmissionDetailModal.test.ts
//
// Phase 4 Plan 04 tests (copy-to-code + overwrite-confirm + language) PLUS
// Phase 5 Plan 05 Task 2 (D-31) assertions — the detail modal now renders the
// code fence via `MarkdownRenderer.render` with a Component lifecycle. This
// file mocks both at module level so we can spy on the render args and assert
// the load/unload order dictated by Pitfall 6.
//
// Target: src/graph/SubmissionDetailModal.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';

// D-31 — replace the obsidian stub's inert MarkdownRenderer / Component with
// vi-instrumented versions so the render-path tests can observe call args and
// lifecycle hooks. The rest of the stub (Modal, TFile, etc.) falls through to
// the real obsidian-stub via `...actual`.
// `vi.mock` is hoisted to the top of the file (before any other top-level
// statements) so the spies MUST live inside `vi.hoisted` to survive the
// hoisting reorder — otherwise we hit "Cannot access before initialization".
const hoisted = vi.hoisted(() => ({
  renderSpy: vi.fn(async () => undefined),
  loadSpy: vi.fn(),
  unloadSpy: vi.fn(),
}));
const { renderSpy, loadSpy, unloadSpy } = hoisted;
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Component {
    load = hoisted.loadSpy;
    unload = hoisted.unloadSpy;
    addChild<T>(c: T): T {
      return c;
    }
  }
  return {
    ...actual,
    MarkdownRenderer: { render: hoisted.renderSpy },
    Component,
  };
});

// Import AFTER the vi.mock so the modal picks up the instrumented versions.
import { SubmissionDetailModal } from '../../src/graph/SubmissionDetailModal';

describe('SubmissionDetailModal (D-04 + D-31)', () => {
  beforeEach(() => {
    renderSpy.mockClear();
    loadSpy.mockClear();
    unloadSpy.mockClear();
  });

  it('copy to code does not create ## Solution', async () => {
    // GRAPH-01 revised (D-01): Copy-to-Code writes the submitted code into
    // ## Code via vault.process. NEVER creates a ## Solution heading.
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Problem\nfoo\n\n## Code\n```python3\nstarter\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution:\n    def twoSum(self, nums, target): return [0, 1]\n',
      lang: 'python3',
      // Test-only hook — auto-confirm the overwrite dialog so we exercise
      // the final vault write deterministically.
      confirmOverwriteForTest: async () => true,
    });

    await (modal as unknown as { performCopy(): Promise<void> }).performCopy();

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).not.toContain('## Solution');
    expect(body).toContain('## Code');
    expect(body).toContain('class Solution:');
  });

  it('copy-to-code confirms overwrite', async () => {
    // When ## Code currently has a non-empty fenced block, the detail modal
    // must gate the vault.process on a user confirmation. Cancel → no write.
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD CODE\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const confirm = vi.fn(async () => false);   // user cancels
    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'NEW CODE',
      lang: 'python3',
      confirmOverwriteForTest: confirm,
    });

    await (modal as unknown as { handleCopyToCode(): Promise<void> }).handleCopyToCode();

    expect(confirm).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('OLD CODE');      // user-cancelled — original intact
    expect(body).not.toContain('NEW CODE');
    expect(m.spies.process).not.toHaveBeenCalled();
  });

  it('copy uses submission language', async () => {
    // D-04: the replacement fence's language tag = submitted language (not
    // the current fence's tag).
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution {}',
      lang: 'java',                            // submitted language differs
      confirmOverwriteForTest: async () => true,
    });

    await (modal as unknown as { performCopy(): Promise<void> }).performCopy();

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('```java');
    expect(body).toContain('class Solution {}');
    expect(body).not.toContain('```python3\nOLD');
  });

  // ── D-31 render-path assertions ──────────────────────────────────────

  it('D-31: onOpen calls component.load() before MarkdownRenderer.render', async () => {
    const m = makeMockVaultApp({
      'LeetCode/1-two-sum.md':
        '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\n```\n',
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'print("ok")\n',
      lang: 'python3',
    });
    await (modal as unknown as { onOpen(): Promise<void> }).onOpen();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // Pitfall 6 — load MUST precede render.
    const loadOrder = loadSpy.mock.invocationCallOrder[0]!;
    const renderOrder = renderSpy.mock.invocationCallOrder[0]!;
    expect(loadOrder).toBeLessThan(renderOrder);
  });

  it('D-31: MarkdownRenderer.render receives fenced markdown + component', async () => {
    const m = makeMockVaultApp({
      'LeetCode/1-two-sum.md':
        '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\n```\n',
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution:\n    pass\n',
      lang: 'python3',
    });
    await (modal as unknown as { onOpen(): Promise<void> }).onOpen();

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const call = renderSpy.mock.calls[0] as unknown as [
      unknown,
      string,
      HTMLElement,
      string,
      unknown,
    ];
    // arg[0] = app
    expect(call[0]).toBe(m.app);
    // arg[1] = fenced markdown starting with ```{lang}\n and ending with \n```\n
    expect(call[1]).toBe('```python3\nclass Solution:\n    pass\n\n```\n');
    // arg[2] = container element (the .leetcode-submissions-code div)
    expect(call[2]).toBeDefined();
    expect(call[2].classList.contains('leetcode-submissions-code')).toBe(true);
    // arg[3] = file.path
    expect(call[3]).toBe('LeetCode/1-two-sum.md');
    // arg[4] = the Component instance (truthy object)
    expect(call[4]).toBeTruthy();
  });

  it('D-31: onClose calls component.unload()', async () => {
    const m = makeMockVaultApp({
      'LeetCode/1-two-sum.md':
        '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\n```\n',
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'x',
      lang: 'python3',
    });
    await (modal as unknown as { onOpen(): Promise<void> }).onOpen();
    (modal as unknown as { onClose(): void }).onClose();

    expect(unloadSpy).toHaveBeenCalledTimes(1);
  });

  it('D-31: old <pre><code class="language-*"> render path is deleted', async () => {
    // Source file must not contain the legacy `class="language-` pattern any
    // longer — D-31 swaps the textContent-on-<pre><code> path for
    // MarkdownRenderer.render.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const source = await fs.readFile(
      path.join(process.cwd(), 'src/graph/SubmissionDetailModal.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/class="language-/);
  });
});
