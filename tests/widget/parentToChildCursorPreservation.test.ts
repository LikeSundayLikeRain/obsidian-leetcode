// Phase 22 regression — parent→child cursor preservation
// (.planning/debug/vim-cursor-jumps-to-widget-start.md).
//
// Symptom: in vim Insert mode inside the LeetCode widget, the cursor
// occasionally jumps to the top-left of the widget (line 1, col 0) while
// the user is typing — correlated with Obsidian's editor auto-save (~2s)
// reflowing the parent CM6.
//
// Root cause: pushParentToChild in src/widget/liveModeViewPlugin.ts
// dispatched a full-doc replacement (`from: 0, to: doc.length, insert: …`)
// into the child EditorView with NO `selection` field. CM6's default
// selection mapping for a 0..end replace collapses every selection
// coordinate to offset 0 → the cursor jumps to the widget origin.
//
// Fix: compute a minimal ChangeSpec (longest common prefix + suffix) and
// map the child's current selection through it via ChangeSet.mapPos with
// forward bias — the same algorithm as WidgetController.applyPeerSync
// (Plan 21-17, tests/widget/splitPaneCursorPreservation.test.ts P1..P6).
//
// This file drives pushParentToChild via the parent CM6 ViewPlugin so the
// production code path is exercised end-to-end.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import {
  ChangeSet,
  EditorSelection,
  EditorState,
  Transaction,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { leetCodeFenceViewPlugin } from '../../src/widget/liveModeViewPlugin';

// Minimal parent CM6 doc with a v1.3 leetcode-solve fence containing a body.
function makeParentDoc(body: string): string {
  return [
    '---',
    'lc-slug: two-sum',
    'lc-language: typescript',
    '---',
    '',
    '## Problem',
    'desc',
    '',
    '## Code',
    '```leetcode-solve',
    body,
    '```',
    '',
    '## Notes',
    '',
  ].join('\n');
}

function fenceBodyOffsets(parentDoc: string, body: string): { from: number; to: number } {
  const opener = '```leetcode-solve\n';
  const idx = parentDoc.indexOf(opener);
  if (idx < 0) throw new Error('test fixture: opener not found');
  const from = idx + opener.length;
  return { from, to: from + body.length };
}

interface FakePlugin {
  app: {
    vault: { read: ReturnType<typeof vi.fn> };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
  lcSettings: {
    getUseInlineWidget: () => boolean;
    getAutoMigrateOnOpen: () => boolean;
    getDefaultLanguage: () => string;
    getIndentSizeOverride: () => 'auto' | 2 | 4 | 8;
  };
  migrateInFlight: Set<string>;
  widgetRegistry: {
    values: () => Iterable<unknown>;
    valuesForPath: (path: string) => Iterable<unknown>;
  };
}

interface FakeWidget {
  file: { path: string };
  view: EditorView;
  writer: { hasPending: () => boolean };
  childDirty?: boolean;
  syncHandle?: {
    hasPending: () => boolean;
    flushSync: () => void;
  };
}

function makeFakePlugin(widgets: FakeWidget[]): FakePlugin {
  return {
    app: {
      vault: { read: vi.fn() },
      metadataCache: { getFileCache: vi.fn(() => null) },
    },
    lcSettings: {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => false,
      getDefaultLanguage: () => 'typescript',
      getIndentSizeOverride: () => 4,
    },
    migrateInFlight: new Set(),
    widgetRegistry: {
      values: () => widgets,
      valuesForPath: (path: string) =>
        widgets.filter((w) => w.file.path === path),
    },
  };
}

function makeChildView(initialDoc: string, caret: number): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const state = EditorState.create({
    doc: initialDoc,
    selection: EditorSelection.cursor(caret),
  });
  return new EditorView({ state, parent: container });
}

function makeParentView(parentDoc: string, plugin: FakePlugin, filePath: string): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);
  // Stub editorInfoField so liveModeViewPlugin can resolve `file.path`.
  const editorInfoStub = editorInfoField.init(() => ({
    file: { path: filePath },
  }) as never);
  const state = EditorState.create({
    doc: parentDoc,
    extensions: [
      editorInfoStub,
      leetCodeFenceViewPlugin(plugin as never),
    ],
  });
  return new EditorView({ state, parent: container });
}

// Apply a parent-side untagged change (simulates Obsidian's auto-save reflow
// or any external write) that replaces the fence body. Returns the parent
// view after dispatch.
function reflowParentFenceBody(
  parentView: EditorView,
  oldBody: string,
  newBody: string,
): void {
  const parentDoc = parentView.state.doc.toString();
  const { from, to } = fenceBodyOffsets(parentDoc, oldBody);
  parentView.dispatch({
    changes: { from, to, insert: newBody },
    // No userEvent annotation → looks like an external/auto-save reflow,
    // NOT a 'leetcode.*' echo. This is the bug-trigger condition.
  });
}

describe('pushParentToChild — cursor preservation (debug session: vim-cursor-jumps-to-widget-start)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('downstream parent change leaves child caret unchanged (the original bug — cursor was collapsing to 0)', () => {
    const oldBody = 'line1\nline2\nline3';
    const newBody = 'line1\nline2\nline3_extra';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'two-sum.md';

    // Caret at offset 5 (end of "line1") in the child.
    const childView = makeChildView(oldBody, 5);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    reflowParentFenceBody(parentView, oldBody, newBody);

    // Child doc converges on parent.
    expect(childView.state.doc.toString()).toBe(newBody);
    // Caret unchanged because the edit is downstream of the caret.
    expect(childView.state.selection.main.head).toBe(5);
  });

  it('upstream parent insertion maps child caret forward (was collapsing to 0)', () => {
    const oldBody = 'abc\ndef';
    const newBody = 'XXXXabc\ndef';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    // Caret at offset 4 (start of "def" in old body).
    const childView = makeChildView(oldBody, 4);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    reflowParentFenceBody(parentView, oldBody, newBody);

    expect(childView.state.doc.toString()).toBe(newBody);
    // 4 + 4 prepended chars → 8.
    expect(childView.state.selection.main.head).toBe(8);
  });

  it('upstream parent deletion maps child caret backward (was collapsing to 0)', () => {
    const oldBody = 'abcdefghij\nklmno';
    const newBody = 'cdefghij\nklmno';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    // Caret at offset 12 (the "l" — line 2 col 1).
    const childView = makeChildView(oldBody, 12);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    reflowParentFenceBody(parentView, oldBody, newBody);

    expect(childView.state.doc.toString()).toBe(newBody);
    // First 2 chars removed: 12 → 10.
    expect(childView.state.selection.main.head).toBe(10);
  });

  it('the symptom case: child has typing ahead of parent; child-is-superset guard skips the push entirely (no rollback, no caret jump)', () => {
    // Mirrors the user-reported sequence:
    //   1. Child typed "fn() {\n  ret" — caret near end.
    //   2. childParentSync flushed → parent fence body matches: "fn() {\n  ret".
    //   3. User types "u" — child now "fn() {\n  retu", caret at end (13).
    //      childParentSync has NOT flushed yet (300ms debounce).
    //   4. Obsidian's auto-save reflows parent (untagged change). Parent
    //      fence body in this test is the slightly older version
    //      "fn() {\n  ret" — the trailing 'u' is the only diff and the
    //      child is a strict prefix-extension of the parent.
    //   5. pushParentToChild fires.
    //      Plan-21-17 era (pre-260605-vny): caret-mapping fix prevented
    //        the cursor jump to 0 but the trailing 'u' was still deleted
    //        from the child — the char-rollback symptom.
    //      Post-260605-vny: the child-is-superset guard recognizes
    //        normChild.startsWith(normParent) && delta ≤ 8 and SKIPS the
    //        dispatch entirely. The trailing 'u' stays in the child;
    //        the next debounced flush absorbs it into the parent.
    const oldBody = 'fn() {\n  retu';
    const newBody = 'fn() {\n  ret';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'two-sum.md';

    const childView = makeChildView(oldBody, oldBody.length); // caret at 13
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    const dispatchSpy = vi.spyOn(childView, 'dispatch');
    reflowParentFenceBody(parentView, oldBody, newBody);

    // 260605-vny — push was SKIPPED. Child doc stays as the user typed
    // it (trailing 'u' preserved); caret stays at the end of the child
    // doc; no dispatch fired.
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(childView.state.doc.toString()).toBe(oldBody);
    expect(childView.state.selection.main.head).toBe(13);
    expect(childView.state.selection.main.head).not.toBe(0);
  });

  it('no-op when child already matches parent (no dispatch, caret unchanged)', () => {
    const body = 'same';
    const parentDoc = makeParentDoc(body);
    const filePath = 'note.md';

    const childView = makeChildView(body, 2);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    const dispatchSpy = vi.spyOn(childView, 'dispatch');
    // Trigger an untagged parent change OUTSIDE the fence body — fence body
    // text is unchanged. norm(childDoc) === norm(newBody) → no child
    // dispatch.
    parentView.dispatch({
      changes: { from: 0, to: 3, insert: '---' }, // edits frontmatter open marker
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(childView.state.selection.main.head).toBe(2);
  });

  it('dispatch carries syncAnnotation + leetcode.parent-sync userEvent + addToHistory.of(false)', () => {
    const oldBody = 'hello';
    const newBody = 'hello world';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    const childView = makeChildView(oldBody, 5);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    let capturedUserEvent: string | undefined;
    let capturedAddToHistory: boolean | undefined;
    const origDispatch = childView.dispatch.bind(childView);
    vi.spyOn(childView, 'dispatch').mockImplementation((spec: never) => {
      const s = spec as { annotations?: unknown[] };
      if (Array.isArray(s.annotations)) {
        for (const a of s.annotations) {
          const ann = a as { type?: unknown; value?: unknown };
          if (ann.type === Transaction.userEvent && typeof ann.value === 'string') {
            capturedUserEvent = ann.value;
          }
          if (ann.type === Transaction.addToHistory && typeof ann.value === 'boolean') {
            capturedAddToHistory = ann.value;
          }
        }
      }
      origDispatch(spec);
    });

    reflowParentFenceBody(parentView, oldBody, newBody);

    expect(capturedUserEvent).toBe('leetcode.parent-sync');
    expect(capturedAddToHistory).toBe(false);
  });

  it('rollback prevention: when childParentSync has a pending flush, the push is skipped — child typing is preserved', () => {
    // The user-reported risk (debug session follow-up):
    //   1. User types in child. childParentSync debounce timer is armed.
    //   2. Within the 300ms debounce window, an untagged parent change
    //      lands (Obsidian autosave reflow, ConflictModal echo, another
    //      plugin format-on-save, external file-sync, etc.).
    //   3. Pre-gate: pushParentToChild fires, sees child ≠ parent, and
    //      replaces the child's content with the parent's stale body —
    //      silently rolling back the user's most recent typing.
    //   4. Post-gate: syncHandle.hasPending() === true → push is skipped
    //      entirely. Child stays the source of truth. The next regular
    //      childParentSync flush will reconcile.
    //
    // We cannot run flushSync() synchronously inside pushParentToChild
    // because it executes inside the parent ViewPlugin's update() and
    // CM6 throws on re-entrant view.dispatch() during an update.
    // "Skip the push" is the only safe synchronous behavior.
    const childBody = 'fn() {\n  retu'; // child has typed "u" — not yet flushed
    const parentBody = 'fn() {\n  ret'; // parent is one char behind
    const parentDocText = makeParentDoc(parentBody);
    const filePath = 'two-sum.md';

    const childView = makeChildView(childBody, childBody.length);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
      syncHandle: {
        hasPending: () => true, // child has unflushed typing
        flushSync: () => {
          throw new Error(
            'flushSync must NOT be called from inside ViewPlugin.update — CM6 disallows re-entrant dispatch',
          );
        },
      },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDocText, plugin, filePath);

    const childDispatchSpy = vi.spyOn(childView, 'dispatch');

    // Trigger an untagged parent change OUTSIDE the fence (e.g., user
    // edited Notes section, or another plugin formatted frontmatter).
    // This causes the parent ViewPlugin.update() to fire, but the fence
    // body itself is unchanged — so newBody = parentBody, which still
    // differs from childBody. Without the gate, the push would dispatch
    // parentBody into the child (rollback). With the gate, hasPending()
    // returns true and the push is skipped.
    parentView.dispatch({
      changes: {
        from: parentView.state.doc.length,
        to: parentView.state.doc.length,
        insert: 'extra',
      },
    });

    // Child must keep its typing; cursor must stay; no child dispatch.
    expect(childView.state.doc.toString()).toBe(childBody);
    expect(childView.state.selection.main.head).toBe(childBody.length);
    expect(childDispatchSpy).not.toHaveBeenCalled();
  });

  it('rollback prevention: with no pending flush, the push runs as before (regression guard for the existing fix)', () => {
    // When childParentSync.hasPending() is false, the gate does nothing
    // and the existing minimal-diff + cursor-mapping behavior holds.
    const oldBody = 'abc';
    const newBody = 'abcd';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    // Caret at offset 1 (between 'a' and 'b'). The downstream insertion
    // at index 3 is past the caret, so the caret stays at 1.
    const childView = makeChildView(oldBody, 1);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
      syncHandle: {
        hasPending: () => false, // no pending flush
        flushSync: () => {
          throw new Error('flushSync must not run when hasPending() is false');
        },
      },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    reflowParentFenceBody(parentView, oldBody, newBody);

    // The child receives the parent body via the normal push path.
    expect(childView.state.doc.toString()).toBe(newBody);
    expect(childView.state.selection.main.head).toBe(1);
  });

  it('rollback prevention: backward-compat — widgets without syncHandle still receive pushes (no regression)', () => {
    // Test fixtures (and any older controller paths) that don't expose
    // a `syncHandle` must continue to receive pushes. The gate is a
    // soft check via optional chaining.
    const oldBody = 'abc';
    const newBody = 'abcdef';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    const childView = makeChildView(oldBody, 2);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
      // syncHandle intentionally omitted.
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    reflowParentFenceBody(parentView, oldBody, newBody);

    expect(childView.state.doc.toString()).toBe(newBody);
    expect(childView.state.selection.main.head).toBe(2);
  });

  it('dispatch.changes is INCREMENTAL — single contiguous range, NOT full-doc replacement (regression: this is the bug)', () => {
    const oldBody = 'hello';
    const newBody = 'helloX';
    const parentDoc = makeParentDoc(oldBody);
    const filePath = 'note.md';

    const childView = makeChildView(oldBody, 5);
    const widget: FakeWidget = {
      file: { path: filePath },
      view: childView,
      writer: { hasPending: () => false },
    };
    const plugin = makeFakePlugin([widget]);
    const parentView = makeParentView(parentDoc, plugin, filePath);

    let capturedChanges: unknown;
    const origDispatch = childView.dispatch.bind(childView);
    vi.spyOn(childView, 'dispatch').mockImplementation((spec: never) => {
      const s = spec as { changes?: unknown };
      capturedChanges = s.changes;
      origDispatch(spec);
    });

    reflowParentFenceBody(parentView, oldBody, newBody);

    const set = ChangeSet.of(
      capturedChanges as Parameters<typeof ChangeSet.of>[0],
      oldBody.length,
    );
    let rangeCount = 0;
    let captured: { fromA: number; toA: number; inserted: string } | null = null;
    set.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      rangeCount++;
      captured = { fromA, toA, inserted: inserted.toString() };
    });
    expect(rangeCount).toBe(1);
    expect(captured).not.toBeNull();
    if (captured !== null) {
      const c = captured as { fromA: number; toA: number; inserted: string };
      // Minimal edit at the end: { from: 5, to: 5, insert: 'X' }.
      expect(c.fromA).toBe(5);
      expect(c.toA).toBe(5);
      expect(c.inserted).toBe('X');
    }
  });
});
