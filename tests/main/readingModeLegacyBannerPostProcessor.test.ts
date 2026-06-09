// tests/main/readingModeLegacyBannerPostProcessor.test.ts
//
// Phase 21 Plan 21-10 Task 1 — Reading-mode legacy-banner post-processor.
//
// The new module `src/main/readingModeLegacyBannerPostProcessor.ts` registers
// a `Plugin.registerMarkdownPostProcessor` callback that walks rendered
// Reading-mode DOM and, when the parent note is a v1.2-shaped LC note
// (lc-slug + ## Code + ` ```java `/ ` ```python `/etc. fence + closer) AND
// `useInlineWidget=ON` AND `autoMigrateOnOpen=OFF`, replaces the rendered
// `<pre><code>` element with the legacy migration banner via
// `mountLegacyFenceBanner(host, source, file, plugin, 'manual-prompt')`.
//
// 17 tests:
//   1-6:  Gate tests (lc-slug, useInlineWidget, autoMigrateOnOpen,
//         isMigrationCandidate, non-TFile, idempotent already-v1.3).
//   7-12: DOM walker tests (java fence, python3 alias, unrecognized text,
//         non-first LC fence, no <pre><code>, replaceWith throws).
//   13:   Source extraction byte-equality.
//   14-16: Section-context detection (## Code preceding heading, ## Notes,
//          null + single matched block fallback).
//   17:   Header marker presence (CI lock for the PHASE_22_DELETE_WITH_V1_2_PATH
//         token).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.mock for the legacyFenceBanner module — captures call args so the test
// asserts only that the host element + source + 'manual-prompt' label are
// passed correctly.
const mountLegacyFenceBannerMock = vi.fn();
vi.mock('../../src/widget/legacyFenceBanner', () => ({
  mountLegacyFenceBanner: (...args: unknown[]) => mountLegacyFenceBannerMock(...args),
}));

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // Override TFile with an instantiable form so the module-under-test's
  // `instanceof TFileRuntime` check returns true for our test fakes.
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

// Mock the shared logger so test can assert logger.debug fires when
// pre.replaceWith throws (Step 10 try/catch test).
const loggerDebugMock = vi.fn();
vi.mock('../../src/shared/logger', () => ({
  logger: {
    debug: (...args: unknown[]) => loggerDebugMock(...args),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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

// -----------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------

const V12_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Problem',
  '',
  'Some problem text.',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {}',
  '```',
  '',
  '## Notes',
  '',
].join('\n');

const V12_NOTE_PYTHON3 = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```python3',
  'def solve(): pass',
  '```',
  '',
].join('\n');

const V12_NOTE_TEXT_FENCE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```text',
  'this is plain text',
  '```',
  '',
].join('\n');

const V13_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'def solve(): pass',
  '```',
  '',
].join('\n');

const NOT_LC_NOTE = [
  '---',
  'tag: misc',
  '---',
  '',
  '## Random',
  '',
  '```java',
  'class X {}',
  '```',
  '',
].join('\n');

// -----------------------------------------------------------------------
// Mock app + plugin
// -----------------------------------------------------------------------

interface FakeAppOpts {
  fmByPath: Record<string, Record<string, unknown> | null>;
  textByPath: Record<string, string>;
  /** Test-only: override what `getAbstractFileByPath` returns for `path`.
   *  Defaults to a plain TFile-shaped object whenever fm or text is set. */
  abstractByPath?: Record<string, unknown>;
}

async function makeApp(opts: FakeAppOpts) {
  // Pull the mocked TFile from the obsidian vi.mock factory so the runtime
  // `instanceof TFile` check inside the module-under-test returns true for
  // objects we hand back from getAbstractFileByPath.
  const { TFile } = await import('obsidian');
  return {
    workspace: { on: vi.fn() },
    metadataCache: {
      getFileCache: vi.fn((file: { path: string } | null) => {
        if (!file) return null;
        const fm = opts.fmByPath[file.path];
        return fm ? { frontmatter: fm } : null;
      }),
    },
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (opts.abstractByPath && path in opts.abstractByPath) {
          return opts.abstractByPath[path];
        }
        if (path in opts.fmByPath || path in opts.textByPath) {
          return new (TFile as unknown as new (p: string) => unknown)(path);
        }
        return null;
      }),
      cachedRead: vi.fn(async (file: { path: string }) => opts.textByPath[file.path] ?? ''),
    },
  };
}

interface FakeSettings {
  useInlineWidget: boolean;
  autoMigrateOnOpen: boolean;
  defaultLanguage: string;
}

function makePlugin(app: Awaited<ReturnType<typeof makeApp>>, settings: FakeSettings) {
  return {
    app,
    lcSettings: {
      getUseInlineWidget: () => settings.useInlineWidget,
      getAutoMigrateOnOpen: () => settings.autoMigrateOnOpen,
      getDefaultLanguage: () => settings.defaultLanguage,
    },
    registerMarkdownPostProcessor: vi.fn(),
  };
}

/** Build a single `<pre><code class="language-{lang}">{source}</code></pre>` */
function buildPreRoot(lang: string, source: string): { root: HTMLElement; pre: HTMLElement } {
  const root = document.createElement('div');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = `language-${lang}`;
  code.textContent = source;
  pre.appendChild(code);
  root.appendChild(pre);
  return { root, pre };
}

/** Build context with optional section info. */
function makeCtx(sourcePath: string, sectionInfo: FakeSectionInfo | null): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => sectionInfo,
  };
}

/** Build section info pointing at the langSlug fence inside the note text.
 *  lineStart points at the FENCE OPENER line (matches Obsidian's contract). */
function sectionInfoFor(noteText: string, fenceOpenerSubstring: string): FakeSectionInfo {
  const lines = noteText.split('\n');
  const idx = lines.findIndex((ln) => ln.startsWith(fenceOpenerSubstring));
  return { text: noteText, lineStart: idx, lineEnd: idx + 2 };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('registerLegacyBannerPostProcessor (Plan 21-10 Task 1)', () => {
  beforeEach(() => {
    vi.resetModules();
    mountLegacyFenceBannerMock.mockReset();
    loggerDebugMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------
  // Gate tests (1-6)
  // -------------------------------------------------------------------

  it('Test 1: lc-slug missing → no DOM mutation, banner not called', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'Random/notes.md': { tag: 'misc' } },
      textByPath: { 'Random/notes.md': NOT_LC_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class X {}');
    await processor(root, makeCtx('Random/notes.md', sectionInfoFor(NOT_LC_NOTE, '```java')));
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
    expect(root.querySelector('pre > code.language-java')).not.toBeNull();
  });

  it('Test 3: autoMigrateOnOpen=ON → no DOM mutation (auto path takes over)', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class Solution {}');
    await processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java')));
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 4: isMigrationCandidate returns false (text fence) → no DOM mutation', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE_TEXT_FENCE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('text', 'this is plain text');
    await processor(
      root,
      makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE_TEXT_FENCE, '```text')),
    );
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 5: ctx.sourcePath resolves to non-TFile → no DOM mutation, no throw', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: {},
      textByPath: {},
      // Explicitly returns null (no abstract file).
      abstractByPath: { 'Missing/path.md': null },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class X {}');
    await expect(processor(root, makeCtx('Missing/path.md', null))).resolves.toBeUndefined();
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 6: note already contains ```leetcode-solve (idempotent) → no DOM mutation', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V13_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    // Build a leetcode-solve rendered block (would not be matched anyway since it's not in LC_LANG_SLUGS).
    const { root } = buildPreRoot('leetcode-solve', 'def solve(): pass');
    await processor(
      root,
      makeCtx('LC/two-sum.md', sectionInfoFor(V13_NOTE, '```leetcode-solve')),
    );
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // DOM walker tests (7-12)
  // -------------------------------------------------------------------

  it('Test 7: single ```java code block under ## Code → pre replaced + banner mount called', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root, pre } = buildPreRoot('java', 'class Solution {}');
    await processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java')));

    expect(mountLegacyFenceBannerMock).toHaveBeenCalledTimes(1);
    const callArgs = mountLegacyFenceBannerMock.mock.calls[0] as unknown as [
      HTMLElement, string, { path: string }, unknown, string,
    ];
    const hostArg = callArgs[0];
    const sourceArg = callArgs[1];
    const fileArg = callArgs[2];
    const modeArg = callArgs[4];
    expect(hostArg.classList.contains('leetcode-migration-banner-host')).toBe(true);
    expect(sourceArg).toBe('class Solution {}');
    expect(fileArg.path).toBe('LC/two-sum.md');
    expect(modeArg).toBe('manual-prompt');
    // The original <pre> was replaced — it should no longer be in the DOM.
    expect(root.contains(pre)).toBe(false);
    // The banner host is in its place.
    expect(root.querySelector('.leetcode-migration-banner-host')).not.toBeNull();
  });

  it('Test 8: ```python3 alias → resolveLangSlug recognizes it; banner mounted', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE_PYTHON3 },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('python3', 'def solve(): pass');
    await processor(
      root,
      makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE_PYTHON3, '```python3')),
    );
    expect(mountLegacyFenceBannerMock).toHaveBeenCalledTimes(1);
  });

  it('Test 9: ```text fence (NOT a recognized LC slug) → no DOM mutation', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE_TEXT_FENCE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('text', 'this is plain text');
    await processor(
      root,
      makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE_TEXT_FENCE, '```text')),
    );
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 10: multiple code blocks where LC-langSlug one is NOT first → still locates and replaces it', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    // Root contains: text fence FIRST, then java fence. The walker must
    // locate the java fence (LC slug) and replace only it.
    const root = document.createElement('div');
    const preText = document.createElement('pre');
    const codeText = document.createElement('code');
    codeText.className = 'language-text';
    codeText.textContent = 'plain text';
    preText.appendChild(codeText);
    root.appendChild(preText);
    const preJava = document.createElement('pre');
    const codeJava = document.createElement('code');
    codeJava.className = 'language-java';
    codeJava.textContent = 'class Solution {}';
    preJava.appendChild(codeJava);
    root.appendChild(preJava);

    await processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java')));

    expect(mountLegacyFenceBannerMock).toHaveBeenCalledTimes(1);
    const [, sourceArg] = mountLegacyFenceBannerMock.mock.calls[0] as unknown as [
      HTMLElement, string,
    ];
    expect(sourceArg).toBe('class Solution {}');
    // The java pre was replaced; the text pre is untouched.
    expect(root.contains(preJava)).toBe(false);
    expect(root.contains(preText)).toBe(true);
  });

  it('Test 11: no `pre > code` children at all → no DOM mutation, no throw', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const root = document.createElement('div');
    root.appendChild(document.createElement('p'));
    await expect(
      processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java'))),
    ).resolves.toBeUndefined();
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 12: pre.replaceWith throws → caught, logger.debug called, no rethrow', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root, pre } = buildPreRoot('java', 'class Solution {}');
    // Force pre.replaceWith to throw.
    Object.defineProperty(pre, 'replaceWith', {
      value: () => {
        throw new Error('synthetic replaceWith failure');
      },
    });
    await expect(
      processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java'))),
    ).resolves.toBeUndefined();
    expect(loggerDebugMock).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Source extraction (13)
  // -------------------------------------------------------------------

  it('Test 13: code.textContent extracted byte-exactly (no whitespace mangling)', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const exotic = '  spaces\n\ttabs\n  trailing  ';
    const { root } = buildPreRoot('java', exotic);
    await processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java')));
    const [, sourceArg] = mountLegacyFenceBannerMock.mock.calls[0] as unknown as [
      HTMLElement, string,
    ];
    expect(sourceArg).toBe(exotic);
  });

  // -------------------------------------------------------------------
  // Section-context detection (14-16)
  // -------------------------------------------------------------------

  it('Test 14: getSectionInfo points at fence under ## Code → render banner', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class Solution {}');
    await processor(root, makeCtx('LC/two-sum.md', sectionInfoFor(V12_NOTE, '```java')));
    expect(mountLegacyFenceBannerMock).toHaveBeenCalledTimes(1);
  });

  it('Test 15: getSectionInfo: nearest preceding heading is ## Notes → no DOM mutation', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    // Note shape: ## Code section with java fence (so isMigrationCandidate
    // accepts it overall) but the section-info points at a DIFFERENT
    // langSlug fence under ## Notes (a user example). The walker must
    // verify the fence-being-rendered is under ## Code, not under ## Notes.
    const NOTE_WITH_NOTES_EXAMPLE = [
      '---',
      'lc-slug: two-sum',
      '---',
      '',
      '## Code',
      '',
      '```java',
      'class Solution {}',
      '```',
      '',
      '## Notes',
      '',
      'Example I tried earlier:',
      '',
      '```java',
      'class WIP {}',
      '```',
      '',
    ].join('\n');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': NOTE_WITH_NOTES_EXAMPLE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class WIP {}');
    // Section info points at the SECOND ```java in the note (the one under ## Notes).
    const lines = NOTE_WITH_NOTES_EXAMPLE.split('\n');
    let secondFenceIdx = -1;
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] ?? '').startsWith('```java')) {
        seen++;
        if (seen === 2) { secondFenceIdx = i; break; }
      }
    }
    const ctx = makeCtx('LC/two-sum.md', {
      text: NOTE_WITH_NOTES_EXAMPLE,
      lineStart: secondFenceIdx,
      lineEnd: secondFenceIdx + 2,
    });
    await processor(root, ctx);
    expect(mountLegacyFenceBannerMock).not.toHaveBeenCalled();
  });

  it('Test 16: getSectionInfo null + single matched langSlug block → render banner (fallback path)', async () => {
    const mod = await import('../../src/main/readingModeLegacyBannerPostProcessor');
    const app = await makeApp({
      fmByPath: { 'LC/two-sum.md': { 'lc-slug': 'two-sum' } },
      textByPath: { 'LC/two-sum.md': V12_NOTE },
    });
    const plugin = makePlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    mod.registerLegacyBannerPostProcessor(plugin as never);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0]![0] as ProcessorFn;
    const { root } = buildPreRoot('java', 'class Solution {}');
    // section info is null (degenerate path / embed); fallback: when there's
    // exactly one matched langSlug code block in `element`, render the banner.
    await processor(root, makeCtx('LC/two-sum.md', null));
    expect(mountLegacyFenceBannerMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // CI lock — header marker presence (17)
  // -------------------------------------------------------------------

  it('Test 17: module file begins with PHASE_22_DELETE_WITH_V1_2_PATH header marker', () => {
    const filePath = path.resolve(
      __dirname,
      '../../src/main/readingModeLegacyBannerPostProcessor.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');
    // First non-empty line must contain the literal token.
    const firstNonEmpty = src.split(/\r?\n/).find((ln) => ln.trim().length > 0) ?? '';
    expect(firstNonEmpty).toContain('PHASE_22_DELETE_WITH_V1_2_PATH');
  });
});
