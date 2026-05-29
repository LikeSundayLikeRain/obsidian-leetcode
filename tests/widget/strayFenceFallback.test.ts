// Phase 19 Plan 04 Task 1 — strayFenceFallback unit tests (RED).
//
// VALIDATION row 19-04-02 / EMBED-04 / CONTEXT D-04 / RESEARCH Pitfall 19-D.
//
// Verifies the four corners of the codeBlockProcessor branching matrix from
// 19-04-PLAN.md Task 2:
//   (a) Non-LC note (no lc-slug, no embed) + leetcode-solve fence
//       → static <pre><code> rendered; addChild NOT called.
//   (b) Non-LC note inside an embed context (no lc-slug, IS embed)
//       → readOnly RenderChild added (still safer than nothing).
//   (c) Null getSectionInfo → static fallback; never throws.
//   (d) Malformed fence (opener present but no closer in section text)
//       → static fallback; never throws.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePlugin, createFakeMetadataCache } from '../solve/mocks/fakeWorkspace';
import { STRAY_FENCE_NOTE } from './__fixtures__/lcNoteFixtures';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // Override TFile so the processor's `instanceof TFile` check passes for
  // the fake file objects we hand back from getAbstractFileByPath.
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
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
  addChild: ReturnType<typeof vi.fn>;
}

function makeCtx(
  sourcePath: string,
  sectionInfo: FakeSectionInfo | null,
): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => sectionInfo,
    addChild: vi.fn(),
  };
}

async function getProcessor(plugin: ReturnType<typeof createFakePlugin>) {
  const mod = (await import('../../src/widget/codeBlockProcessor')) as unknown as {
    leetCodeBlockProcessor: (plugin: unknown) => (
      source: string,
      el: HTMLElement,
      ctx: unknown,
    ) => void;
  };
  const obs = await import('obsidian');
  const TFile = (obs as unknown as { TFile: new (path: string) => unknown }).TFile;
  (plugin.app as unknown as { vault?: unknown }).vault = {
    getAbstractFileByPath: (p: string) => new TFile(p),
  };
  return mod.leetCodeBlockProcessor(plugin);
}

describe('strayFenceFallback (Plan 19-04 EMBED-04 / CONTEXT D-04)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('(a) non-LC note + leetcode-solve fence + NOT embed → static <pre><code> rendered; no addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    // Intentionally no frontmatter set — no lc-slug.
    const plugin = createFakePlugin({ metadataCache });
    const processor = await getProcessor(plugin);

    const el = document.createElement('div');
    const ctx = makeCtx('Notes/random.md', {
      text: STRAY_FENCE_NOTE,
      lineStart: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd:
        STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve') + 2,
    });

    expect(() =>
      processor('console.log("not a real LC note");', el, ctx as never),
    ).not.toThrow();
    expect(ctx.addChild).not.toHaveBeenCalled();
    const pre = el.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre!.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('console.log("not a real LC note");');
  });

  it('(b) non-LC note inside an EMBED context → readOnly RenderChild via addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    // No frontmatter for the embedded path either.
    const plugin = createFakePlugin({ metadataCache });
    const processor = await getProcessor(plugin);

    const el = document.createElement('div');
    // Wrap el under a `.markdown-embed` ancestor — embed signal 1.
    const host = document.createElement('div');
    host.classList.add('markdown-embed');
    host.appendChild(el);

    const ctx = makeCtx('Hub/host.md', {
      text: STRAY_FENCE_NOTE,
      lineStart: STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve'),
      lineEnd:
        STRAY_FENCE_NOTE.split('\n').indexOf('```leetcode-solve') + 2,
    });

    expect(() => processor('source', el, ctx as never)).not.toThrow();
    // Embed context → routed to RenderChild (read-only widget).
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it('(c) null getSectionInfo → static fallback; never throws', async () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = createFakePlugin({ metadataCache });
    const processor = await getProcessor(plugin);

    const el = document.createElement('div');
    const ctx = makeCtx('Notes/random.md', null);

    expect(() => processor('console.log("x");', el, ctx as never)).not.toThrow();
    // Plan 19-04 routing: null section info is treated as embed-likely; if no
    // lc-slug, we still want a safe fallback. The current path renders static
    // <pre><code>. addChild is NOT called for non-LC + null-info.
    expect(ctx.addChild).not.toHaveBeenCalled();
    expect(el.querySelector('pre')).not.toBeNull();
  });

  it('(d) malformed fence (opener present, no closer in section text) → static fallback; never throws', async () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = createFakePlugin({ metadataCache });
    const processor = await getProcessor(plugin);

    const el = document.createElement('div');
    // Section text intentionally has the opener but no closer — represents a
    // broken note an external tool may produce. The processor must not throw.
    const ctx = makeCtx('Notes/random.md', {
      text: '## Code\n\n```leetcode-solve\nNo closer follows...',
      lineStart: 2,
      lineEnd: 3,
    });

    expect(() => processor('source', el, ctx as never)).not.toThrow();
    expect(ctx.addChild).not.toHaveBeenCalled();
    expect(el.querySelector('pre')).not.toBeNull();
  });
});
