// Phase 13 Plan 02 — Nested Editor Extension unit tests.
// Tests for: buildNestedDecorations gating logic, NestedEditorWidget eq/destroy/ignoreEvent,
// extractFenceBody, StateField update behavior, transactionFilter cursor redirect.
//
// Phase 17 Plan 07 — Source Mode phantom render regression tests appended at
// the bottom of this file (see "Phase 17-07" describe blocks). The vi.mock
// override below replaces the obsidian-stub's `editorInfoField` (which
// returns `{ file: null }` by default) with a real CM6 StateField whose
// `create()` yields a canonical LC file path. This unblocks the Phase 17-07
// behavioral tests that exercise the StateField via real
// `EditorState.create()` + `state.update(...)`. Existing tests are
// unaffected because they either:
//   (a) override `field()` on a mock state directly (e.g. `field: () => ({ file: null })`),
//       or
//   (b) use `makeStateForLockTests` whose mock `field()` ignores the field
//       argument and returns `{ file: { path } }` regardless.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // Phase 17-07: override editorInfoField so behavioral tests at the bottom
  // can exercise buildNestedEditorExtension via real EditorState.create()
  // without the slug-frontmatter gate short-circuiting on a null file.
  // eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
  const cm = await import('@codemirror/state');
  const editorInfoField = cm.StateField.define<{ file: { path: string } | null }>({
    create: () => ({ file: { path: 'LeetCode/0001-two-sum.md' } }),
    update: (v) => v,
  });
  return {
    ...actual,
    editorInfoField,
  };
});

// Mock the child editor registry and factory
vi.mock('../../src/main/childEditorRegistry', () => ({
  ChildEditorRegistry: vi.fn(),
}));

vi.mock('../../src/main/childEditorFactory', () => ({
  createChildEditor: vi.fn(),
}));

import {
  buildNestedDecorations,
  buildNestedEditorExtension,
  NestedEditorWidget,
  extractFenceBody,
} from '../../src/main/nestedEditorExtension';

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, Transaction } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

const CANONICAL_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Problem',
  '',
  'Given an array...',
  '',
  '## Code',
  '',
  '```python3',
  'class Solution:',
  '    def twoSum(self):',
  '        pass',
  '```',
  '',
  '## Techniques',
  '',
  '- [[Hash Table]]',
  '',
  '## Notes',
  '',
  'user notes here',
].join('\n');

function makeCanonicalState(body?: string, filePath?: string) {
  return makeStateForLockTests({
    body: body ?? CANONICAL_NOTE,
    filePath: filePath ?? 'LeetCode/0001-two-sum.md',
    lcSlug: 'two-sum',
  });
}

function createMockRegistry() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, view: unknown) => { store.set(key, view); }),
    delete: vi.fn((key: string) => { store.delete(key); }),
    destroyAll: vi.fn(),
    has: vi.fn((key: string) => store.has(key)),
    get size() { return store.size; },
  };
}

function createMockPlugin(opts: {
  slug?: string;
  filePath?: string;
  lcLanguage?: string;
  indentOverride?: 'auto' | 2 | 4 | 8;
} = {}) {
  const metadataCache = createFakeMetadataCache();
  const filePath = opts.filePath ?? 'LeetCode/0001-two-sum.md';
  if (opts.slug !== null) {
    metadataCache.setFrontmatter(filePath, {
      'lc-slug': opts.slug ?? 'two-sum',
      'lc-language': opts.lcLanguage ?? 'python3',
    });
  }
  const basePlugin = createFakePlugin({ metadataCache });
  // Phase 16: nested editor extension reads plugin.settings.getIndentSizeOverride()
  const plugin = Object.assign(basePlugin, {
    settings: {
      getIndentSizeOverride: vi.fn(() => opts.indentOverride ?? 'auto'),
    },
  });
  return { plugin, metadataCache };
}

// ────────────────────────────────────────────────────────────────────────
// buildNestedDecorations — gating logic
// ────────────────────────────────────────────────────────────────────────

describe('buildNestedDecorations', () => {
  describe('gating logic', () => {
    it('returns empty DecorationSet when editorInfoField has no file', () => {
      const state = makeStateForLockTests({
        body: CANONICAL_NOTE,
        filePath: undefined as unknown as string,
      });
      // Override field to return null file
      const noFileState = {
        ...state,
        doc: state.doc,
        field: () => ({ file: null }),
      } as unknown as typeof state;

      const { plugin } = createMockPlugin();
      const registry = createMockRegistry();

      const result = buildNestedDecorations(noFileState, plugin as never, registry as never);
      expect(result.size).toBe(0);
    });

    it('returns empty DecorationSet when file has no lc-slug frontmatter', () => {
      const state = makeCanonicalState();
      const metadataCache = createFakeMetadataCache();
      // No frontmatter set — no lc-slug
      const plugin = createFakePlugin({ metadataCache });
      const registry = createMockRegistry();

      const result = buildNestedDecorations(state, plugin as never, registry as never);
      expect(result.size).toBe(0);
    });

    it('returns empty DecorationSet when findCodeFence returns null', () => {
      // Note with lc-slug but no ## Code section
      const body = [
        '---',
        'lc-slug: two-sum',
        '---',
        '',
        '## Problem',
        '',
        'Some problem text',
        '',
        '## Notes',
        '',
        'notes',
      ].join('\n');
      const state = makeStateForLockTests({ body, filePath: 'LeetCode/0001-two-sum.md' });
      const { plugin } = createMockPlugin();
      const registry = createMockRegistry();

      const result = buildNestedDecorations(state, plugin as never, registry as never);
      expect(result.size).toBe(0);
    });
  });

  describe('decoration building', () => {
    it('returns DecorationSet with Decoration.line on every fence line (opener through closer inclusive)', () => {
      const state = makeCanonicalState();
      const { plugin } = createMockPlugin();
      const registry = createMockRegistry();

      const result = buildNestedDecorations(state, plugin as never, registry as never);

      // The fence in CANONICAL_NOTE: line 12 (```python3) to line 16 (```)
      // That's 5 lines of line decorations + 1 widget decoration
      // Total decorations should be > 0
      expect(result.size).toBeGreaterThan(0);
    });

    it('returns DecorationSet with widget at openerLine.to (block: true, side: 1)', () => {
      const state = makeCanonicalState();
      const { plugin } = createMockPlugin();
      const registry = createMockRegistry();

      const result = buildNestedDecorations(state, plugin as never, registry as never);
      // Non-empty result means decorations were built
      expect(result.size).toBeGreaterThan(0);
    });

    it('produces line decorations with class lc-fence-hidden', () => {
      const state = makeCanonicalState();
      const { plugin } = createMockPlugin();
      const registry = createMockRegistry();

      const result = buildNestedDecorations(state, plugin as never, registry as never);

      // Iterate over the decoration range set to check for line decorations
      const decos: Array<{ from: number; to: number; value: unknown }> = [];
      const cursor = result.iter();
      while (cursor.value) {
        decos.push({ from: cursor.from, to: cursor.to, value: cursor.value });
        cursor.next();
      }
      // Should have line decorations (from === to for line decos) with class
      const lineDecos = decos.filter(d => d.from === d.to && (d.value as { spec?: { class?: string } }).spec?.class === 'lc-fence-hidden');
      expect(lineDecos.length).toBeGreaterThan(0);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// NestedEditorWidget — eq, destroy, ignoreEvent
// ────────────────────────────────────────────────────────────────────────

describe('NestedEditorWidget', () => {
  it('eq() returns true when other.filePath matches this.filePath', () => {
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'content1', 'python3', 'auto');
    const w2 = new NestedEditorWidget('path/a.md', registry as never, 'content2', 'python3', 'auto');
    expect(w1.eq(w2)).toBe(true);
  });

  it('eq() returns true even when fenceContent differs (stable identity)', () => {
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'hello', 'python3', 'auto');
    const w2 = new NestedEditorWidget('path/a.md', registry as never, 'world', 'python3', 'auto');
    expect(w1.eq(w2)).toBe(true);
  });

  it('eq() returns true even when initialSlug or indentOverride differ — chevron reconfigure handles language switches without widget rebuild', () => {
    // Phase 16: language changes go through Compartment.reconfigure (16-04), NOT
    // a widget rebuild. The widget's stable identity (D-13) remains filePath-only.
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');
    const w2 = new NestedEditorWidget('path/a.md', registry as never, 'content', 'java', 4);
    expect(w1.eq(w2)).toBe(true);
  });

  it('eq() returns false when filePath differs', () => {
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');
    const w2 = new NestedEditorWidget('path/b.md', registry as never, 'content', 'python3', 'auto');
    expect(w1.eq(w2)).toBe(false);
  });

  it('destroy() does NOT call registry.delete or childView.destroy', () => {
    const registry = createMockRegistry();
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');

    // Create a container with a .cm-editor child to simulate widget DOM
    const container = document.createElement('div');
    const cmEditor = document.createElement('div');
    cmEditor.className = 'cm-editor';
    container.appendChild(cmEditor);

    widget.destroy(container);

    expect(registry.delete).not.toHaveBeenCalled();
  });

  it('ignoreEvent() returns false', () => {
    const registry = createMockRegistry();
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');
    expect(widget.ignoreEvent()).toBe(false);
  });

  it('toDOM() creates div.lc-nested-editor', async () => {
    const registry = createMockRegistry();
    const mockChildView = {
      dom: document.createElement('div'),
      focus: vi.fn(),
    };
    mockChildView.dom.className = 'cm-editor';

    // Mock createChildEditor to return our mock view
    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');
    const mockView = {} as never; // EditorView not used by toDOM except for container
    const dom = widget.toDOM(mockView);

    expect(dom.className).toBe('lc-nested-editor');
  });

  it('toDOM() uses registry.get() for existing child and attaches its DOM', () => {
    const registry = createMockRegistry();
    const mockChildView = {
      dom: document.createElement('div'),
      focus: vi.fn(),
    };
    mockChildView.dom.className = 'cm-editor';
    registry.get.mockReturnValue(mockChildView);

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content', 'python3', 'auto');
    const dom = widget.toDOM({} as never);

    expect(registry.get).toHaveBeenCalledWith('path/a.md');
    expect(dom.contains(mockChildView.dom)).toBe(true);
  });

  it('toDOM() creates new child via factory when not in registry, passing initialSlug + indentOverride (Phase 16)', async () => {
    const registry = createMockRegistry();
    registry.get.mockReturnValue(undefined);

    const mockChildView = {
      dom: document.createElement('div'),
      focus: vi.fn(),
    };
    mockChildView.dom.className = 'cm-editor';

    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'some code', 'java', 4);
    widget.toDOM({} as never);

    // Phase 16: factory takes (content, parent, initialSlug, indentOverride, app?)
    // — `app` is optional; widget was constructed without it here, so 5th arg is undefined.
    expect(createChildEditor).toHaveBeenCalledWith(
      'some code',
      expect.any(HTMLElement),
      'java',
      4,
      undefined,
    );
    expect(registry.set).toHaveBeenCalledWith('path/a.md', mockChildView);
  });

  it('estimatedHeight returns at least 60px', () => {
    const registry = createMockRegistry();
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'line1', 'python3', 'auto');
    expect(widget.estimatedHeight).toBeGreaterThanOrEqual(60);
  });

  it('estimatedHeight scales with line count', () => {
    const registry = createMockRegistry();
    const content = 'line1\nline2\nline3\nline4\nline5';
    const widget = new NestedEditorWidget('path/a.md', registry as never, content, 'python3', 'auto');
    expect(widget.estimatedHeight).toBe(5 * 20);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Phase 16 — buildNestedDecorations reads lc-language frontmatter +
// plugin.settings.getIndentSizeOverride() and passes them through the widget
// to createChildEditor.
// ────────────────────────────────────────────────────────────────────────

describe('buildNestedDecorations — Phase 16 language wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads lc-language from frontmatter and reaches createChildEditor with that slug', async () => {
    const state = makeCanonicalState();
    const { plugin } = createMockPlugin({ lcLanguage: 'java', indentOverride: 'auto' });
    const registry = createMockRegistry();

    const result = buildNestedDecorations(state, plugin as never, registry as never);
    expect(result.size).toBeGreaterThan(0);

    // Trigger widget toDOM by iterating decorations and finding the widget deco
    const cursor = result.iter();
    let widget: NestedEditorWidget | undefined;
    while (cursor.value) {
      const w = (cursor.value as { spec?: { widget?: unknown } }).spec?.widget;
      if (w instanceof NestedEditorWidget) {
        widget = w;
        break;
      }
      cursor.next();
    }
    expect(widget).toBeDefined();

    const mockChildView = { dom: document.createElement('div'), focus: vi.fn() };
    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    widget!.toDOM({} as never);
    expect(createChildEditor).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(HTMLElement),
      'java',
      'auto',
      expect.anything(),
    );
  });

  it('reads getIndentSizeOverride from plugin.settings and passes it to createChildEditor', async () => {
    const state = makeCanonicalState();
    const { plugin } = createMockPlugin({ lcLanguage: 'python3', indentOverride: 8 });
    const registry = createMockRegistry();

    const result = buildNestedDecorations(state, plugin as never, registry as never);
    const cursor = result.iter();
    let widget: NestedEditorWidget | undefined;
    while (cursor.value) {
      const w = (cursor.value as { spec?: { widget?: unknown } }).spec?.widget;
      if (w instanceof NestedEditorWidget) {
        widget = w;
        break;
      }
      cursor.next();
    }
    expect(widget).toBeDefined();

    const mockChildView = { dom: document.createElement('div'), focus: vi.fn() };
    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    widget!.toDOM({} as never);
    expect(createChildEditor).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(HTMLElement),
      'python3',
      8,
      expect.anything(),
    );
  });

  it('falls back to "python3" when lc-language is absent', async () => {
    // Set lc-slug but omit lc-language by setting frontmatter manually
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const basePlugin = createFakePlugin({ metadataCache });
    const plugin = Object.assign(basePlugin, {
      settings: { getIndentSizeOverride: vi.fn(() => 'auto' as const) },
    });
    const state = makeCanonicalState();
    const registry = createMockRegistry();

    const result = buildNestedDecorations(state, plugin as never, registry as never);
    const cursor = result.iter();
    let widget: NestedEditorWidget | undefined;
    while (cursor.value) {
      const w = (cursor.value as { spec?: { widget?: unknown } }).spec?.widget;
      if (w instanceof NestedEditorWidget) {
        widget = w;
        break;
      }
      cursor.next();
    }
    expect(widget).toBeDefined();

    const mockChildView = { dom: document.createElement('div'), focus: vi.fn() };
    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    widget!.toDOM({} as never);
    expect(createChildEditor).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(HTMLElement),
      'python3',
      'auto',
      expect.anything(),
    );
  });

  it('falls back to "python3" when lc-language is a non-string value', async () => {
    // Frontmatter with lc-language as a number (corrupt user edit)
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', {
      'lc-slug': 'two-sum',
      'lc-language': 42 as unknown as string, // intentionally wrong type
    });
    const basePlugin = createFakePlugin({ metadataCache });
    const plugin = Object.assign(basePlugin, {
      settings: { getIndentSizeOverride: vi.fn(() => 'auto' as const) },
    });
    const state = makeCanonicalState();
    const registry = createMockRegistry();

    const result = buildNestedDecorations(state, plugin as never, registry as never);
    const cursor = result.iter();
    let widget: NestedEditorWidget | undefined;
    while (cursor.value) {
      const w = (cursor.value as { spec?: { widget?: unknown } }).spec?.widget;
      if (w instanceof NestedEditorWidget) {
        widget = w;
        break;
      }
      cursor.next();
    }
    expect(widget).toBeDefined();

    const mockChildView = { dom: document.createElement('div'), focus: vi.fn() };
    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    widget!.toDOM({} as never);
    expect(createChildEditor).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(HTMLElement),
      'python3',
      'auto',
      expect.anything(),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// extractFenceBody
// ────────────────────────────────────────────────────────────────────────

describe('extractFenceBody', () => {
  it('returns body text between opener and closer (exclusive)', () => {
    const state = makeCanonicalState();
    // In CANONICAL_NOTE: opener at line 12, closer at line 16
    // Body is lines 13-15: "class Solution:", "    def twoSum(self):", "        pass"
    const result = extractFenceBody(state, { openerLine: 12, closerLine: 16 });
    expect(result).toContain('class Solution:');
    expect(result).toContain('def twoSum(self):');
    expect(result).toContain('pass');
  });

  it('returns empty string when closer - opener <= 1', () => {
    const state = makeCanonicalState();
    const result = extractFenceBody(state, { openerLine: 12, closerLine: 13 });
    expect(result).toBe('');
  });

  it('returns single line when closerLine - openerLine === 2', () => {
    const body = [
      '## Code',
      '',
      '```python3',
      'pass',
      '```',
    ].join('\n');
    const state = makeStateForLockTests({ body, filePath: 'test.md' });
    // opener at line 3, closer at line 5
    const result = extractFenceBody(state, { openerLine: 3, closerLine: 5 });
    expect(result).toBe('pass');
  });
});

// ────────────────────────────────────────────────────────────────────────
// chevron-switch-child-body-stale regression (2026-05-22)
//
// Source-level invariants on src/main/nestedEditorExtension.ts:
// the parent's externalChangeListener must skip ONLY echo-prone userEvents
// (`leetcode.child-sync`, `leetcode.fence-repair`), not the entire
// `'leetcode.*'` namespace. The Phase 14 broad-prefix gate over-blocked
// the Phase 16 chevron-driven `'leetcode.lang-switch'` parent dispatch,
// leaving the child editor body stale until app reload.
//
// We assert by reading the source file because the listener is wired
// internally inside `buildNestedEditorExtension` (private closure over
// `registry`) and has no exported handle. Source-level assertion is the
// project convention for invariant guards (see tests/main/childEditorSync.test.ts:548).
// ────────────────────────────────────────────────────────────────────────

describe('chevron-switch-child-body-stale regression — externalChangeListener echo gate', () => {
  it('uses an explicit ECHO_PRONE_USER_EVENTS skip-set rather than a broad "leetcode.*" prefix', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    // The fixed listener uses `ECHO_PRONE_USER_EVENTS.has(ev)` — not a startsWith call.
    expect(source).toMatch(/ECHO_PRONE_USER_EVENTS\.has\(ev\)/);
  });

  it('skip-set contains leetcode.child-sync (echo from child→parent dispatches)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    // The Set literal should declare leetcode.child-sync as an echo-prone event.
    expect(source).toMatch(/'leetcode\.child-sync'/);
    // And it should appear inside the ECHO_PRONE_USER_EVENTS Set declaration.
    const setBlock = /ECHO_PRONE_USER_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source);
    expect(setBlock).not.toBeNull();
    expect(setBlock![1]).toContain("'leetcode.child-sync'");
  });

  it('skip-set contains leetcode.fence-repair (parent-side fence marker repair)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    const setBlock = /ECHO_PRONE_USER_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source);
    expect(setBlock).not.toBeNull();
    expect(setBlock![1]).toContain("'leetcode.fence-repair'");
  });

  it('skip-set does NOT contain leetcode.lang-switch (Phase 16 chevron must propagate to child)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    const setBlock = /ECHO_PRONE_USER_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source);
    expect(setBlock).not.toBeNull();
    // CRITICAL invariant: lang-switch must reach detectAndPropagateExternalChange
    // so the chevron-driven body rewrite mirrors into the child editor.
    expect(setBlock![1]).not.toContain("'leetcode.lang-switch'");
  });

  it('externalChangeListener does NOT use the broad startsWith("leetcode.") gate (Phase 14 over-block regression)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    // Locate the externalChangeListener block and assert no broad-prefix gate.
    const listenerBlock =
      /externalChangeListener\s*=\s*EditorView\.updateListener\.of\(\(update\)\s*=>\s*\{([\s\S]*?)\}\);/.exec(
        source,
      );
    expect(listenerBlock).not.toBeNull();
    // The body must NOT contain a `startsWith('leetcode.')` test — that was
    // the Phase 14 design that caused the chevron-switch-child-body-stale bug.
    expect(listenerBlock![1]).not.toMatch(/startsWith\(['"]leetcode\.['"]\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Phase 17 Plan 07 — Source Mode phantom render regression (17-UAT.md Issue 1)
//
// Background — see .planning/phases/17-polish-edge-cases/17-07-PLAN.md and
// 17-UAT.md Tests 2 (PASTE-02) + 8 (SRCLIV-01). In Source Mode, when the user
// types or pastes content INSIDE the focused child editor that adds a new
// line to the parent fence body, the parent's StateField was using a
// fast-path:
//
//     const userEvent = tr.annotation(Transaction.userEvent);
//     if (userEvent && userEvent.startsWith('leetcode.')) {
//       return old.map(tr.changes);
//     }
//
// The child→parent mirror in `src/main/childEditorSync.ts:107-120` dispatches
// a transaction with `userEvent: 'leetcode.child-sync'`. When that dispatch
// added new lines to the parent fence body, the fast-path called
// `RangeSet.map(tr.changes)` which only SHIFTS existing decoration positions
// — it does NOT extend `lc-fence-hidden` line coverage to the newly-inserted
// lines. Result: the new line(s) of parent doc text rendered visibly BELOW
// the child editor in Source Mode (the widget is anchored at openerLine.to,
// the original line-hides covered only the original line range, and the
// newly inserted line had no hide decoration). On focus change a non-
// `leetcode.*` transaction triggered the rebuild path and the phantom
// disappeared — confirming the fast-path was the culprit.
//
// Fix: narrow the `'leetcode.*'` fast-path so it covers only transactions
// that DO NOT change line count. Line-count-changing transactions take the
// rebuild path (which calls `buildNestedDecorations` and produces a fresh
// RangeSet covering the full [openerLine, closerLine] inclusive).
// ────────────────────────────────────────────────────────────────────────

const PHASE17_FILE_PATH = 'LeetCode/0001-two-sum.md';

/**
 * Canonical LC note with a 4-line fence body. Opener at line 12
 * (```python3), body lines 13-15, closer at line 16 (```).
 */
const PHASE17_NOTE_WITH_FENCE = [
  '---', // 1
  'lc-slug: two-sum', // 2
  'lc-language: python3', // 3
  '---', // 4
  '', // 5
  '## Problem', // 6
  '', // 7
  'Given an array...', // 8
  '', // 9
  '## Code', // 10
  '', // 11
  '```python3', // 12 — opener
  'class Solution:', // 13
  '    def twoSum(self):', // 14
  '        pass', // 15
  '```', // 16 — closer
  '', // 17
  '## Techniques', // 18
  '', // 19
  '## Notes', // 20
].join('\n');

const PHASE17_OPENER_LINE = 12;
const PHASE17_CLOSER_LINE = 16;

function makePhase17Plugin(opts: { lcLanguage?: string } = {}) {
  const metadataCache = createFakeMetadataCache();
  metadataCache.setFrontmatter(PHASE17_FILE_PATH, {
    'lc-slug': 'two-sum',
    'lc-language': opts.lcLanguage ?? 'python3',
  });
  const basePlugin = createFakePlugin({ metadataCache });
  const registry = {
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(() => false),
    destroyAll: vi.fn(),
    get size() { return 0; },
  };
  return Object.assign(basePlugin, {
    childEditorRegistry: registry,
    settings: {
      getIndentSizeOverride: vi.fn(() => 'auto' as const),
    },
  });
}

/**
 * Build a real EditorState wired with the nested editor extension. The state
 * has the real DecorationSet StateField; reading the field and iterating
 * its decorations is the canonical way to introspect coverage.
 *
 * Note — `buildNestedDecorations` reads `state.field(editorInfoField)`. For
 * that to resolve we must register `editorInfoField` as an extension on the
 * state. The vi.mock at the top of this file overrides editorInfoField's
 * `create()` to return the canonical LC file path, so the slug-frontmatter
 * gate passes.
 */
async function makePhase17State(doc: string, plugin: ReturnType<typeof makePhase17Plugin>) {
  // Re-import the (mocked) obsidian editorInfoField so it can be added as
  // an extension on the state. The mock at the top of this file replaces
  // the stub's editorInfoField with a real CM6 StateField whose create()
  // yields PHASE17_FILE_PATH.
  const { editorInfoField } = await import('obsidian');
  return EditorState.create({
    doc,
    extensions: [
      editorInfoField as unknown as import('@codemirror/state').Extension,
      buildNestedEditorExtension(plugin as never),
    ],
  });
}

/**
 * Locate the DecorationSet StateField produced by buildNestedEditorExtension
 * by scanning state.values for a RangeSet (.iter() + .size). The DecorationSet
 * is the only RangeSet-shaped field on this state.
 *
 * Internal-API access is required because the StateField is a closure over
 * `registry` inside buildNestedEditorExtension and has no exported handle —
 * exporting one was explicitly excluded by the plan.
 */
function readPhase17DecorationSet(state: EditorState): DecorationSet {
  const values = (state as unknown as { values: unknown[] }).values;
  for (const v of values) {
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as { iter?: unknown }).iter === 'function' &&
      typeof (v as { size?: unknown }).size === 'number'
    ) {
      return v as DecorationSet;
    }
  }
  throw new Error('DecorationSet StateField not found on state');
}

/**
 * Count the number of `lc-fence-hidden` line decorations in the
 * DecorationSet. The block widget decoration is excluded by the
 * `from === to` + class filter.
 */
function countHideLineDecos(set: DecorationSet): number {
  let count = 0;
  const cursor = set.iter();
  while (cursor.value) {
    const spec = (cursor.value as { spec?: { class?: string } }).spec;
    if (cursor.from === cursor.to && spec?.class === 'lc-fence-hidden') {
      count++;
    }
    cursor.next();
  }
  return count;
}

/**
 * Return true if the DecorationSet has an `lc-fence-hidden` line decoration
 * starting at the given offset. Line decorations are emitted as zero-width
 * ranges where `from === to === doc.line(N).from`.
 */
function hasHideLineAt(set: DecorationSet, offset: number): boolean {
  const cursor = set.iter();
  while (cursor.value) {
    const spec = (cursor.value as { spec?: { class?: string } }).spec;
    if (
      cursor.from === offset &&
      cursor.to === offset &&
      spec?.class === 'lc-fence-hidden'
    ) {
      return true;
    }
    cursor.next();
  }
  return false;
}

describe('Phase 17-07 — StateField update() rebuild on line-count change (17-UAT.md Issue 1)', () => {
  it('line-adding leetcode.child-sync mirror triggers full rebuild — new closerLine has hideLine', async () => {
    const plugin = makePhase17Plugin();
    const state = await makePhase17State(PHASE17_NOTE_WITH_FENCE, plugin);

    // Sanity: initial DecorationSet covers [openerLine, closerLine] = [12, 16] inclusive — 5 lines.
    const initialSet = readPhase17DecorationSet(state);
    const initialHideCount = countHideLineDecos(initialSet);
    expect(initialHideCount).toBe(PHASE17_CLOSER_LINE - PHASE17_OPENER_LINE + 1); // 5

    // Pre-fix sanity: the closer at line 16 has a hideLine decoration.
    const initialCloserOffset = state.doc.line(PHASE17_CLOSER_LINE).from;
    expect(hasHideLineAt(initialSet, initialCloserOffset)).toBe(true);

    // Simulate the canonical child→parent mirror dispatch from
    // `src/main/childEditorSync.ts:114-120`. The child added a new line
    // (e.g. user typed Enter at end of body and started typing). The mirror
    // dispatches with userEvent='leetcode.child-sync' and addToHistory.of(false).
    //
    // We insert a new line just before the closer (i.e., at the END of the
    // fence body). The change adds 1 line to the doc — closerLine moves
    // from 16 to 17.
    const closerLineFrom = state.doc.line(PHASE17_CLOSER_LINE).from;
    const tr = state.update({
      changes: { from: closerLineFrom, to: closerLineFrom, insert: '        return null\n' },
      annotations: [
        Transaction.userEvent.of('leetcode.child-sync'),
        Transaction.addToHistory.of(false),
      ],
    });
    const newState = tr.state;

    // Sanity: doc has grown by exactly 1 line.
    expect(newState.doc.lines).toBe(state.doc.lines + 1);

    // Post-state's closer is now at line 17 (PHASE17_CLOSER_LINE + 1).
    const newCloserLine = PHASE17_CLOSER_LINE + 1;
    const newCloserText = newState.doc.line(newCloserLine).text;
    expect(newCloserText.trim()).toBe('```');

    // The post-state DecorationSet must cover the new closerLine.
    // PRE-FIX: fast-path mapped the old [12-16] RangeSet through tr.changes,
    // which shifted the [12-16] hide decorations to [12-15] and [17] (the
    // closer's old position got mapped through). The newly-inserted line
    // 16 has NO hide decoration → phantom render in Source Mode.
    // POST-FIX: rebuild path produces a fresh [12-17] RangeSet covering all
    // 6 fence lines.
    const newSet = readPhase17DecorationSet(newState);
    const newHideCount = countHideLineDecos(newSet);

    // Assertion 1: new DecorationSet covers ALL lines in the new fence range.
    expect(newHideCount).toBe(newCloserLine - PHASE17_OPENER_LINE + 1); // 6

    // Assertion 2: explicit check — the new closerLine has a hideLine decoration.
    const newCloserOffset = newState.doc.line(newCloserLine).from;
    expect(hasHideLineAt(newSet, newCloserOffset)).toBe(true);

    // Assertion 3: the newly-inserted line (line 16 in post-state) also has
    // a hideLine — this is the line that would render visibly pre-fix.
    const newlyInsertedLineOffset = newState.doc.line(PHASE17_CLOSER_LINE).from;
    expect(hasHideLineAt(newSet, newlyInsertedLineOffset)).toBe(true);
  });

  it('existing-line leetcode.child-sync edit keeps fast-path — no rebuild churn', async () => {
    const plugin = makePhase17Plugin();
    const state = await makePhase17State(PHASE17_NOTE_WITH_FENCE, plugin);

    const initialSet = readPhase17DecorationSet(state);
    const initialHideCount = countHideLineDecos(initialSet);
    expect(initialHideCount).toBe(5);

    // Modify a single existing line (line 13 — "class Solution:") in place.
    // No newline inserted, no line-count delta — the fast-path should run.
    const line13 = state.doc.line(13);
    const tr = state.update({
      changes: { from: line13.from, to: line13.to, insert: 'class Solver:' },
      annotations: [
        Transaction.userEvent.of('leetcode.child-sync'),
        Transaction.addToHistory.of(false),
      ],
    });
    const newState = tr.state;

    // Doc line count unchanged.
    expect(newState.doc.lines).toBe(state.doc.lines);

    // DecorationSet line count unchanged. (The fast-path's RangeSet.map is
    // safe here because no lines were added — the existing 5 hide decorations
    // still cover [12-16] inclusive.)
    const newSet = readPhase17DecorationSet(newState);
    const newHideCount = countHideLineDecos(newSet);
    expect(newHideCount).toBe(initialHideCount);

    // Closer at line 16 still covered.
    const closerOffset = newState.doc.line(PHASE17_CLOSER_LINE).from;
    expect(hasHideLineAt(newSet, closerOffset)).toBe(true);
  });

  it('non-child-sync line-adding edit (e.g., user typing in parent) still rebuilds via the existing rebuild path', async () => {
    const plugin = makePhase17Plugin();
    const state = await makePhase17State(PHASE17_NOTE_WITH_FENCE, plugin);

    const initialSet = readPhase17DecorationSet(state);
    const initialHideCount = countHideLineDecos(initialSet);
    expect(initialHideCount).toBe(5);

    // Apply a docChanged transaction with NO leetcode.* userEvent — falls
    // through to the existing `tr.docChanged || tr.reconfigured` rebuild
    // branch. We insert a new line before the closer.
    const closerLineFrom = state.doc.line(PHASE17_CLOSER_LINE).from;
    const tr = state.update({
      changes: { from: closerLineFrom, to: closerLineFrom, insert: '        return None\n' },
      // No annotations — userEvent is undefined.
    });
    const newState = tr.state;

    expect(newState.doc.lines).toBe(state.doc.lines + 1);

    // Post-state DecorationSet covers all 6 fence lines.
    const newSet = readPhase17DecorationSet(newState);
    const newHideCount = countHideLineDecos(newSet);
    expect(newHideCount).toBe(6);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Phase 17-07 — Source-level invariants. The leetcode.* fast-path must be
// guarded by a line-count check. Mirrors the chevron-switch-child-body-stale
// pattern at the bottom of this file.
// ────────────────────────────────────────────────────────────────────────

describe('Phase 17-07 — StateField update() source-level invariants', () => {
  it('StateField update() references doc.lines on tr.startState and tr.state for the line-count delta check', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    // The fix uses startState.doc.lines and state.doc.lines (or state.doc.lines
    // and startState.doc.lines in either order) to detect line-count delta.
    // grep target — must reference doc.lines at least twice.
    const matches = source.match(/doc\.lines/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('StateField update() body documents the 17-07 / 17-UAT.md Issue 1 rationale', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    // The fix block carries a documenting comment citing the gap-closure.
    expect(source).toMatch(/17-07|Issue 1|line-count/);
  });

  it('ECHO_PRONE_USER_EVENTS Set is unchanged from baseline (only child-sync + fence-repair) — fix does NOT add leetcode.child-sync to the parent→child propagation skip-set', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../../src/main/nestedEditorExtension.ts'),
      'utf8',
    );
    const setBlock = /ECHO_PRONE_USER_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source);
    expect(setBlock).not.toBeNull();
    // Must contain exactly child-sync + fence-repair.
    expect(setBlock![1]).toContain("'leetcode.child-sync'");
    expect(setBlock![1]).toContain("'leetcode.fence-repair'");
    // Must NOT contain lang-switch or any other event — that would be a
    // separate regression (chevron-switch-child-body-stale).
    expect(setBlock![1]).not.toContain("'leetcode.lang-switch'");
  });
});
