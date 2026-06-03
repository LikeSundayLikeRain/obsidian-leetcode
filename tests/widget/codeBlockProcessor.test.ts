// Phase 19 Plan 01 — codeBlockProcessor unit tests.
//
// Mirrors tests/main/codeActionsPostProcessor.test.ts setup (vi.mock + makeCtx).
// Covers WIDGET-01, WIDGET-05, EMBED-04 (CONTEXT C-10 / D-04).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import { CANONICAL_LC_NOTE, STRAY_FENCE_NOTE } from './__fixtures__/lcNoteFixtures';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // Override TFile so instanceof TFile returns true for our fake file objects
  // (the codeBlockProcessor uses `if (!(file instanceof TFile)) return ...`).
  class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    parent: unknown = null;
    constructor(path: string) {
      this.path = path;
      const slash = path.lastIndexOf('/');
      this.name = slash >= 0 ? path.slice(slash + 1) : path;
      const dot = this.name.lastIndexOf('.');
      this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
      this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    }
  }
  return { ...actual, TFile };
});

interface FakeSectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface ProcessorCtx {
  sourcePath: string;
  frontmatter?: unknown;
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
  addChild: ReturnType<typeof vi.fn>;
}

function makeCtx(sourcePath: string, sectionInfo: FakeSectionInfo | null): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => sectionInfo,
    addChild: vi.fn(),
  };
}

function buildHostElement(): HTMLElement {
  const el = document.createElement('div');
  // Mimic the `<pre><code>...</code></pre>` Obsidian normally hands the processor.
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = 'class Solution: pass';
  pre.appendChild(code);
  el.appendChild(pre);
  return el;
}

async function getProcessor(plugin: ReturnType<typeof createFakePlugin>) {
  const mod = (await import('../../src/widget/codeBlockProcessor')) as unknown as {
    leetCodeBlockProcessor: (plugin: unknown) => (
      source: string,
      el: HTMLElement,
      ctx: unknown,
    ) => void;
  };
  // Wire vault.getAbstractFileByPath so the processor can resolve TFile.
  const obs = await import('obsidian');
  // Plugin must expose .app — createFakePlugin already does so. Add the
  // required vault.getAbstractFileByPath mock.
  const TFile = (obs as unknown as { TFile: new (path: string) => unknown }).TFile;
  (plugin.app as unknown as { vault?: unknown }).vault = {
    getAbstractFileByPath: (p: string) => new TFile(p),
  };
  return mod.leetCodeBlockProcessor(plugin);
}

describe('leetCodeBlockProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('lc-slug present + valid section info → ctx.addChild called with a render child', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    const plugin = createFakePlugin({ metadataCache });

    const processor = await getProcessor(plugin);
    const el = buildHostElement();
    const ctx = makeCtx('LeetCode/two-sum.md', {
      text: CANONICAL_LC_NOTE,
      lineStart: CANONICAL_LC_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd: CANONICAL_LC_NOTE.split('\n').indexOf('```leetcode-solve') + 4,
    });

    expect(() => processor('class Solution:\n    pass', el, ctx as never)).not.toThrow();
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it('lc-slug absent → static <pre><code> fallback rendered, addChild not called', async () => {
    const metadataCache = createFakeMetadataCache();
    // No frontmatter set for this path → no lc-slug.
    const plugin = createFakePlugin({ metadataCache });

    const processor = await getProcessor(plugin);
    const el = document.createElement('div'); // empty host
    const ctx = makeCtx('Notes/random.md', {
      text: STRAY_FENCE_NOTE,
      lineStart: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve') + 2,
    });

    expect(() => processor('console.log("foo");', el, ctx as never)).not.toThrow();
    expect(ctx.addChild).not.toHaveBeenCalled();
    // Static fallback inserts a <pre> with a <code> child.
    const pre = el.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre!.querySelector('code');
    expect(code).not.toBeNull();
    // Source content rendered as TEXT (no innerHTML — POLISH-03 carry-through).
    expect(code!.textContent).toBe('console.log("foo");');
  });

  it('null getSectionInfo + lc-slug present → readOnly RenderChild (Plan 19-04 / Pitfall 19-D)', async () => {
    // Plan 19-04 routing: null info is regular in embed contexts (Pitfall
    // 19-D). With lc-slug present, we route to a readOnly RenderChild so
    // the embed renders the fence content as a read-only widget rather than
    // losing the widget treatment to a plain <pre><code>.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });

    const processor = await getProcessor(plugin);
    const el = document.createElement('div');
    const ctx = makeCtx('LeetCode/two-sum.md', null);

    expect(() => processor('pass', el, ctx as never)).not.toThrow();
    // Plan 19-04: lc-slug + null info → embed-likely → readOnly RenderChild.
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it('embed context (sourcePath mismatch) → readOnly RenderChild via addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    const plugin = createFakePlugin({ metadataCache });

    const processor = await getProcessor(plugin);
    const el = document.createElement('div');
    // Embed signal: sourcePath ≠ TFile path. The processor resolves the file
    // via getAbstractFileByPath(ctx.sourcePath), so the embed-detect signal
    // here is the host-DOM ancestor walk. Wrap el under a `.markdown-embed`.
    const host = document.createElement('div');
    host.classList.add('markdown-embed');
    host.appendChild(el);
    const ctx = makeCtx('LeetCode/two-sum.md', {
      text: CANONICAL_LC_NOTE,
      lineStart: CANONICAL_LC_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd: CANONICAL_LC_NOTE.split('\n').indexOf('```leetcode-solve') + 4,
    });

    expect(() => processor('class Solution: pass', el, ctx as never)).not.toThrow();
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it('stray fence in non-LC note (no lc-slug, not embed) → static fallback, never throws', async () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = createFakePlugin({ metadataCache });

    const processor = await getProcessor(plugin);
    const el = document.createElement('div');
    const ctx = makeCtx('Notes/random.md', {
      text: STRAY_FENCE_NOTE,
      lineStart: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve') + 2,
    });

    expect(() => processor('console.log("x");', el, ctx as never)).not.toThrow();
    expect(ctx.addChild).not.toHaveBeenCalled();
    expect(el.querySelector('pre code')).not.toBeNull();
  });
});
