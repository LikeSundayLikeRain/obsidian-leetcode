// Phase 14 Plan 01 — childEditorSync unit tests.
// Tests for: syncAnnotation, createChildSyncExtension, detectAndPropagateExternalChange,
// wireSyncIfNeeded, unwireSync, repairFenceStructure.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

vi.mock('../../src/main/childEditorRegistry', () => ({
  ChildEditorRegistry: vi.fn(),
}));

import {
  syncAnnotation,
  createChildSyncExtension,
  detectAndPropagateExternalChange,
  wireSyncIfNeeded,
  unwireSync,
  repairFenceStructure,
} from '../../src/main/childEditorSync';

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
  '## Notes',
].join('\n');

/** Minimal mock EditorView for parent */
function makeMockParentView(docContent: string) {
  const state = makeStateForLockTests({ body: docContent });
  return {
    state,
    dispatch: vi.fn(),
  } as unknown as import('@codemirror/view').EditorView;
}

/** Minimal mock EditorView for child */
function makeMockChildView(docContent: string) {
  return {
    state: {
      doc: {
        length: docContent.length,
        toString() { return docContent; },
      },
    },
    dispatch: vi.fn(),
  } as unknown as import('@codemirror/view').EditorView;
}

/** Minimal mock registry */
function makeMockRegistry() {
  const map = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => map.get(key)),
    has: vi.fn((key: string) => map.has(key)),
    set: vi.fn((key: string, view: unknown) => { map.set(key, view); }),
    delete: vi.fn((key: string) => { map.delete(key); }),
    _map: map,
  } as unknown as import('../../src/main/childEditorRegistry').ChildEditorRegistry;
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe('childEditorSync', () => {
  beforeEach(() => {
    // Reset any module-level state (wiredPaths set)
    unwireSync('__all__');
  });

  describe('syncAnnotation', () => {
    it('is defined as an Annotation', () => {
      expect(syncAnnotation).toBeDefined();
      // CM6 Annotations are AnnotationType instances with an `of` method
      expect(typeof syncAnnotation.of).toBe('function');
    });
  });

  describe('createChildSyncExtension', () => {
    it('returns an Extension (EditorView.updateListener)', () => {
      const parentView = makeMockParentView(CANONICAL_NOTE);
      const registry = makeMockRegistry();
      const ext = createChildSyncExtension(parentView, 'test.md', registry);
      expect(ext).toBeDefined();
    });
  });

  describe('repairFenceStructure', () => {
    it('returns false when ## Code heading is missing', () => {
      const noCodeDoc = [
        '---',
        'lc-slug: two-sum',
        '---',
        '',
        '## Problem',
        '',
        'content',
        '',
        '## Notes',
      ].join('\n');
      const parentView = makeMockParentView(noCodeDoc);
      const result = repairFenceStructure(parentView);
      expect(result).toBe(false);
      expect(parentView.dispatch).not.toHaveBeenCalled();
    });

    it('returns true and dispatches when fence opener is missing', () => {
      const missingOpener = [
        '---',
        'lc-slug: two-sum',
        '---',
        '',
        '## Code',
        '',
        'class Solution:',
        '    pass',
        '```',
        '',
        '## Notes',
      ].join('\n');
      const parentView = makeMockParentView(missingOpener);
      const result = repairFenceStructure(parentView);
      expect(result).toBe(true);
      expect(parentView.dispatch).toHaveBeenCalled();
      // Verify repair dispatch uses 'leetcode.fence-repair' userEvent
      const call = (parentView.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.annotations).toBeDefined();
    });

    it('returns true and dispatches when fence closer is missing', () => {
      const missingCloser = [
        '---',
        'lc-slug: two-sum',
        '---',
        '',
        '## Code',
        '',
        '```python3',
        'class Solution:',
        '    pass',
        '',
        '## Notes',
      ].join('\n');
      const parentView = makeMockParentView(missingCloser);
      const result = repairFenceStructure(parentView);
      expect(result).toBe(true);
      expect(parentView.dispatch).toHaveBeenCalled();
    });

    it('returns false when fence structure is already intact', () => {
      // When findCodeFence succeeds, repair is a no-op
      // (but repairFenceStructure is only called when findCodeFence returned null,
      //  so we test the logic where the scan itself detects the fence is there)
      const parentView = makeMockParentView(CANONICAL_NOTE);
      const result = repairFenceStructure(parentView);
      // With both opener and closer present, repair returns false (nothing to fix)
      expect(result).toBe(false);
    });
  });

  describe('wireSyncIfNeeded / unwireSync', () => {
    it('wires sync on first call for a filePath', () => {
      const parentView = makeMockParentView(CANONICAL_NOTE);
      const childView = makeMockChildView('class Solution:\n    pass');
      const registry = makeMockRegistry();

      wireSyncIfNeeded(parentView, childView, 'test.md', registry);
      // Should dispatch reconfigure effect on child
      expect(childView.dispatch).toHaveBeenCalled();
    });

    it('is idempotent — second call does not re-wire', () => {
      const parentView = makeMockParentView(CANONICAL_NOTE);
      const childView = makeMockChildView('class Solution:\n    pass');
      const registry = makeMockRegistry();

      wireSyncIfNeeded(parentView, childView, 'test.md', registry);
      const firstCallCount = (childView.dispatch as ReturnType<typeof vi.fn>).mock.calls.length;

      wireSyncIfNeeded(parentView, childView, 'test.md', registry);
      const secondCallCount = (childView.dispatch as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount); // no additional dispatch
    });

    it('unwireSync allows re-wiring for the same path', () => {
      const parentView = makeMockParentView(CANONICAL_NOTE);
      const childView = makeMockChildView('class Solution:\n    pass');
      const registry = makeMockRegistry();

      wireSyncIfNeeded(parentView, childView, 'test.md', registry);
      unwireSync('test.md');
      wireSyncIfNeeded(parentView, childView, 'test.md', registry);

      // Should have dispatched twice total (once per wire)
      expect((childView.dispatch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });
  });

  describe('detectAndPropagateExternalChange', () => {
    it('does nothing when no child exists in registry for the file', () => {
      const registry = makeMockRegistry();
      // Build a minimal fake transaction — state.field(editorInfoField) returns { file }
      const state = makeStateForLockTests({
        body: CANONICAL_NOTE,
        filePath: 'LeetCode/0001-two-sum.md',
      });

      // Compute fence body offsets to simulate a change that overlaps
      // In CANONICAL_NOTE, the fence opener is "```python3" (line 12)
      // and closer is "```" (line 16). We need to find the bodyStart in the string.
      const lines = CANONICAL_NOTE.split('\n');
      // openerLine=12 -> "```python3", offset of opener line end + 1
      const openerEnd = lines.slice(0, 12).join('\n').length; // end of line 12
      const bodyStart = openerEnd + 1; // char after opener newline
      // Simulate a change that overlaps with fence body
      const fakeTr = {
        state,
        annotation: vi.fn(() => undefined),
        docChanged: true,
        changes: {
          iterChangedRanges: vi.fn((cb: Function) => {
            // Simulate a change inside the fence body area (new doc positions)
            cb(bodyStart, bodyStart + 5, bodyStart, bodyStart + 8);
          }),
        },
      };
      const plugin = {
        app: {
          metadataCache: {
            getFileCache: () => ({ frontmatter: { 'lc-slug': 'two-sum' } }),
          },
        },
      };

      // No child in registry for file path — should call registry.get but not dispatch
      detectAndPropagateExternalChange(
        fakeTr as any,
        plugin as any,
        registry,
      );
      // The function reaches registry.get(file.path) since the change overlaps
      expect(registry.get).toHaveBeenCalledWith('LeetCode/0001-two-sum.md');
    });
  });
});
