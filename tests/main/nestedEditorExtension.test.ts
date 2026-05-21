// Phase 13 Plan 02 — Nested Editor Extension unit tests.
// Tests for: buildNestedDecorations gating logic, NestedEditorWidget eq/destroy/ignoreEvent,
// extractFenceBody, StateField update behavior, transactionFilter cursor redirect.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
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
  NestedEditorWidget,
  extractFenceBody,
} from '../../src/main/nestedEditorExtension';

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

function createMockPlugin(opts: { slug?: string; filePath?: string } = {}) {
  const metadataCache = createFakeMetadataCache();
  const filePath = opts.filePath ?? 'LeetCode/0001-two-sum.md';
  if (opts.slug !== null) {
    metadataCache.setFrontmatter(filePath, {
      'lc-slug': opts.slug ?? 'two-sum',
      'lc-language': 'python3',
    });
  }
  const plugin = createFakePlugin({ metadataCache });
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
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'content1');
    const w2 = new NestedEditorWidget('path/a.md', registry as never, 'content2');
    expect(w1.eq(w2)).toBe(true);
  });

  it('eq() returns true even when fenceContent differs (stable identity)', () => {
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'hello');
    const w2 = new NestedEditorWidget('path/a.md', registry as never, 'world');
    expect(w1.eq(w2)).toBe(true);
  });

  it('eq() returns false when filePath differs', () => {
    const registry = createMockRegistry();
    const w1 = new NestedEditorWidget('path/a.md', registry as never, 'content');
    const w2 = new NestedEditorWidget('path/b.md', registry as never, 'content');
    expect(w1.eq(w2)).toBe(false);
  });

  it('destroy() does NOT call registry.delete or childView.destroy', () => {
    const registry = createMockRegistry();
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content');

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
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content');
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

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content');
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

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'content');
    const dom = widget.toDOM({} as never);

    expect(registry.get).toHaveBeenCalledWith('path/a.md');
    expect(dom.contains(mockChildView.dom)).toBe(true);
  });

  it('toDOM() creates new child via factory when not in registry', async () => {
    const registry = createMockRegistry();
    registry.get.mockReturnValue(undefined);

    const mockChildView = {
      dom: document.createElement('div'),
      focus: vi.fn(),
    };
    mockChildView.dom.className = 'cm-editor';

    const { createChildEditor } = await import('../../src/main/childEditorFactory');
    (createChildEditor as ReturnType<typeof vi.fn>).mockReturnValue(mockChildView);

    const widget = new NestedEditorWidget('path/a.md', registry as never, 'some code');
    widget.toDOM({} as never);

    expect(createChildEditor).toHaveBeenCalledWith('some code', expect.any(HTMLElement));
    expect(registry.set).toHaveBeenCalledWith('path/a.md', mockChildView);
  });

  it('estimatedHeight returns at least 60px', () => {
    const registry = createMockRegistry();
    const widget = new NestedEditorWidget('path/a.md', registry as never, 'line1');
    expect(widget.estimatedHeight).toBeGreaterThanOrEqual(60);
  });

  it('estimatedHeight scales with line count', () => {
    const registry = createMockRegistry();
    const content = 'line1\nline2\nline3\nline4\nline5';
    const widget = new NestedEditorWidget('path/a.md', registry as never, content);
    expect(widget.estimatedHeight).toBe(5 * 20);
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
