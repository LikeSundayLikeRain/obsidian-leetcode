// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-07-adjacent D-11 / D-12 / D-13 — Reading-mode
// MarkdownPostProcessor that appends Run + Submit buttons after each <pre>
// when the active note has `lc-slug` frontmatter; idempotent; dispatches
// fully-qualified command IDs via app.commands.executeCommandById.
// Turns green when Plan 06 ships the postprocessor in
// src/main/codeActionsPostProcessor.ts (or equivalent location; the
// target module name is tracked in this stub — adjust on Plan 06 rename).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

interface ProcessorCtx {
  sourcePath: string;
  // The real MarkdownPostProcessorContext has more fields; Wave 0 tests only
  // drive sourcePath (frontmatter gate) + the element/root passed as the
  // first processor arg.
}

type ProcessorFn = (root: HTMLElement, ctx: ProcessorCtx) => void | Promise<void>;

describe('Phase 5 codeActionsPostProcessor (D-11 / D-12 / D-13)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  function buildRoot(): HTMLElement {
    // Reading-mode Markdown rendering produces this element shape:
    //   <div>                          ← root passed to postprocessor
    //     <pre><code class="language-python">…</code></pre>
    //   </div>
    const root = document.createElement('div');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-python';
    code.textContent = 'class Solution:\n    pass\n';
    pre.appendChild(code);
    root.appendChild(pre);
    return root;
  }

  it('no-op when the active file has no lc-slug frontmatter (D-12)', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor?: (plugin: unknown) => void;
    };
    expect(typeof mod.registerCodeBlockActionProcessor).toBe('function');

    const metadataCache = createFakeMetadataCache();
    // Explicitly set NO frontmatter for the sourcePath.
    metadataCache.setFrontmatter('Notes/random.md', null);
    const plugin = createFakePlugin({ metadataCache });

    mod.registerCodeBlockActionProcessor!(plugin);
    // Retrieve the registered processor callback from the spy.
    expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalled();
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = buildRoot();
    await processor(root, { sourcePath: 'Notes/random.md' });

    // No actions div appended when frontmatter lacks lc-slug.
    expect(root.querySelectorAll('.leetcode-code-actions').length).toBe(0);
  });

  it('appends .leetcode-code-actions with Run + Submit buttons after <pre> when lc-slug present (D-13)', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor?: (plugin: unknown) => void;
    };
    expect(typeof mod.registerCodeBlockActionProcessor).toBe('function');

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });

    mod.registerCodeBlockActionProcessor!(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = buildRoot();
    await processor(root, { sourcePath: 'LeetCode/1-two-sum.md' });

    const actionsDiv = root.querySelector('.leetcode-code-actions');
    expect(actionsDiv).not.toBeNull();
    // Exactly two buttons, Run + Submit, in order. Neutral styling — no
    // .mod-cta class (UI-SPEC: accent reserved for primary auth button).
    const buttons = Array.from(
      actionsDiv!.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe('Run');
    expect(buttons[1].textContent).toBe('Submit');
    // Positioned AFTER the <pre>.
    const pre = root.querySelector('pre')!;
    expect(pre.nextElementSibling).toBe(actionsDiv);
  });

  it('is idempotent — processing the same root twice does NOT duplicate the actions div', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor?: (plugin: unknown) => void;
    };
    expect(typeof mod.registerCodeBlockActionProcessor).toBe('function');

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });

    mod.registerCodeBlockActionProcessor!(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = buildRoot();
    await processor(root, { sourcePath: 'LeetCode/1-two-sum.md' });
    await processor(root, { sourcePath: 'LeetCode/1-two-sum.md' });

    // Exactly one actions div, not two.
    expect(root.querySelectorAll('.leetcode-code-actions').length).toBe(1);
  });

  it('Run button click dispatches fully-qualified executeCommandById (Pitfall 14: prefixed with plugin.manifest.id)', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor?: (plugin: unknown) => void;
    };
    expect(typeof mod.registerCodeBlockActionProcessor).toBe('function');

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache, manifestId: 'leetcode' });

    mod.registerCodeBlockActionProcessor!(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = buildRoot();
    await processor(root, { sourcePath: 'LeetCode/1-two-sum.md' });

    const runBtn = root.querySelector(
      '.leetcode-code-actions button',
    ) as HTMLButtonElement | null;
    expect(runBtn?.textContent).toBe('Run');
    runBtn!.click();

    expect(plugin.app.commands.executeCommandById).toHaveBeenCalledWith('leetcode:run');
  });
});
