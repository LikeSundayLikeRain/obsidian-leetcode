// Phase 5 Plan 05 — D-11 / D-12 / D-13 Reading-mode Run/Submit buttons.
// Post-regression update (fix(05-05)): gate via ctx.getSectionInfo on the
// `## Code` heading so buttons appear only below the solution code block,
// not every fenced block. Click handlers call plugin.runFromActive() /
// submitFromActive() directly (not executeCommandById) so Reading Mode
// (no editor) can dispatch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

interface FakeSectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface ProcessorCtx {
  sourcePath: string;
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
}

type ProcessorFn = (root: HTMLElement, ctx: ProcessorCtx) => void | Promise<void>;

const FULL_NOTE = `## Problem

Example 1:

\`\`\`text
ex1
\`\`\`

Example 2:

\`\`\`text
ex2
\`\`\`

## Code

\`\`\`java
class Solution {}
\`\`\`

## Techniques
`;

function makeCtx(sourcePath: string, sectionInfo: FakeSectionInfo | null): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => sectionInfo,
  };
}

function buildSinglePreRoot(): HTMLElement {
  const root = document.createElement('div');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-java';
  code.textContent = 'class Solution {}';
  pre.appendChild(code);
  root.appendChild(pre);
  return root;
}

interface FakePluginOverrides {
  runFromActive?: ReturnType<typeof vi.fn>;
  submitFromActive?: ReturnType<typeof vi.fn>;
  // Phase 08 Plan 04 (AIDBG-01) — fence-row factory now requires a 3rd
  aiDebugFromActive?: ReturnType<typeof vi.fn>;
  aiSolutionFromActive?: ReturnType<typeof vi.fn>;
}

function withHostMethods(plugin: ReturnType<typeof createFakePlugin>, overrides: FakePluginOverrides = {}) {
  const host = plugin as unknown as Record<string, unknown>;
  host.runFromActive = overrides.runFromActive ?? vi.fn();
  host.submitFromActive = overrides.submitFromActive ?? vi.fn();
  host.aiDebugFromActive = overrides.aiDebugFromActive ?? vi.fn();
  host.aiSolutionFromActive = overrides.aiSolutionFromActive ?? vi.fn();
  return plugin as ReturnType<typeof createFakePlugin> & FakePluginOverrides;
}

describe('codeActionsPostProcessor (Reading Mode)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('no-op when file has no lc-slug frontmatter (D-12)', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor: (plugin: unknown) => void;
    };

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('Notes/random.md', null);
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    mod.registerCodeBlockActionProcessor(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;

    const root = buildSinglePreRoot();
    // Simulate ## Code section — would attach buttons if lc-slug were set.
    const ctx = makeCtx('Notes/random.md', {
      text: FULL_NOTE,
      lineStart: FULL_NOTE.split('\n').indexOf('## Code') + 2,
      lineEnd: FULL_NOTE.split('\n').indexOf('## Code') + 4,
    });
    await processor(root, ctx);

    expect(root.querySelectorAll('.leetcode-code-actions').length).toBe(0);
  });

  it('appends AI Solution + Run + Submit when section is under ## Code', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor: (plugin: unknown) => void;
    };

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    mod.registerCodeBlockActionProcessor(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;

    const root = buildSinglePreRoot();
    const lines = FULL_NOTE.split('\n');
    const codeHeadingIdx = lines.indexOf('## Code');
    const ctx = makeCtx('LeetCode/1-two-sum.md', {
      text: FULL_NOTE,
      lineStart: codeHeadingIdx + 2,
      lineEnd: codeHeadingIdx + 4,
    });
    await processor(root, ctx);

    const actionsDiv = root.querySelector('.leetcode-code-actions');
    expect(actionsDiv).not.toBeNull();
    const buttons = Array.from(actionsDiv!.querySelectorAll('button'));
    expect(buttons.length).toBe(3);
    expect(buttons[0]!.textContent).toBe('AI Solution');
    expect(buttons[1]!.textContent).toBe('Run');
    expect(buttons[2]!.textContent).toBe('Submit');
  });

  it('does NOT append when section is under ## Problem (example code blocks)', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor: (plugin: unknown) => void;
    };

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    mod.registerCodeBlockActionProcessor(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;

    const root = buildSinglePreRoot();
    const lines = FULL_NOTE.split('\n');
    const problemHeadingIdx = lines.indexOf('## Problem');
    const ctx = makeCtx('LeetCode/1-two-sum.md', {
      text: FULL_NOTE,
      lineStart: problemHeadingIdx + 4,
      lineEnd: problemHeadingIdx + 6,
    });
    await processor(root, ctx);

    expect(root.querySelectorAll('.leetcode-code-actions').length).toBe(0);
  });

  it('is idempotent — processing the same root twice does NOT duplicate', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor: (plugin: unknown) => void;
    };

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    mod.registerCodeBlockActionProcessor(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;

    const root = buildSinglePreRoot();
    const lines = FULL_NOTE.split('\n');
    const codeHeadingIdx = lines.indexOf('## Code');
    const ctx = makeCtx('LeetCode/1-two-sum.md', {
      text: FULL_NOTE,
      lineStart: codeHeadingIdx + 2,
      lineEnd: codeHeadingIdx + 4,
    });
    await processor(root, ctx);
    await processor(root, ctx);

    expect(root.querySelectorAll('.leetcode-code-actions').length).toBe(1);
  });

  it('Run click invokes plugin.runFromActive(); Submit click invokes submitFromActive()', async () => {
    const mod = (await import('../../src/main/codeActionsPostProcessor')) as unknown as {
      registerCodeBlockActionProcessor: (plugin: unknown) => void;
    };

    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const plugin = withHostMethods(
      createFakePlugin({ metadataCache, manifestId: 'leetcode' }),
      { runFromActive, submitFromActive },
    );

    mod.registerCodeBlockActionProcessor(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;

    const root = buildSinglePreRoot();
    const lines = FULL_NOTE.split('\n');
    const codeHeadingIdx = lines.indexOf('## Code');
    const ctx = makeCtx('LeetCode/1-two-sum.md', {
      text: FULL_NOTE,
      lineStart: codeHeadingIdx + 2,
      lineEnd: codeHeadingIdx + 4,
    });
    await processor(root, ctx);

    const [, runBtn, submitBtn] = Array.from(
      root.querySelectorAll('.leetcode-code-actions button'),
    );

    (runBtn as HTMLButtonElement).click();
    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).not.toHaveBeenCalled();

    (submitBtn as HTMLButtonElement).click();
    expect(submitFromActive).toHaveBeenCalledTimes(1);
  });
});
