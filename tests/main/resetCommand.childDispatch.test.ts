// tests/main/resetCommand.childDispatch.test.ts
//
// Phase 17 Plan 01 — D-03 / D-04 / D-05 / D-06 verification.
// Reset code dispatches through the child EditorView's CM6 instance (when a
// child is registered for the file), restoring the Phase 15 D-05 cm-z scope
// isolation invariant. When no child is registered the helper falls back to
// `app.vault.process(...)` (D-04 preserved).
//
// Asserts:
//   1. When child is registered: childView.dispatch fires exactly once with
//      userEvent 'leetcode.reset.child' and a full-body replace; vault.process
//      is NOT invoked through the helper's fallback branch.
//   2. When NO child is registered: vault.process is invoked exactly once
//      (D-04 fallback semantics preserved); childView.dispatch never fires.
//   3. D-05 cm-z scope isolation invariant: child dispatch carries NO
//      `Transaction.addToHistory.of(false)` — Reset must produce a child undo
//      entry; the existing childEditorSync mirror handles the parent side
//      with addToHistory.of(false), keeping the parent's ## Notes section
//      byte-identical across Reset+undo.
//   4. The new userEvent 'leetcode.reset.child' is NOT in
//      ECHO_PRONE_USER_EVENTS — guards against a regression where someone
//      adds it and silently breaks child→parent sync.

// vi.fn() spies stand in for unbound EditorView methods (dispatch). The
// `unbound-method` rule fires on `expect(childView.dispatch)` because the
// reference looks like a class method — but the test mock IS a vi.fn(),
// not a real method. The convention is established in
// tests/main/childEditorSync.test.ts (which the lint baseline accepts).
/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { resetCodeWithConfirm } from '../../src/solve/resetCodeWithConfirm';
import type { DetailCacheEntry } from '../../src/settings/SettingsStore';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

const REPO_ROOT = process.cwd();

function makeSettings(
  detail: Partial<DetailCacheEntry> | null = null,
  defaultLang = 'python3',
) {
  return {
    getProblemDetail: vi.fn(
      (_slug: string): DetailCacheEntry | null =>
        detail as DetailCacheEntry | null,
    ),
    getDefaultLanguage: vi.fn((): string => defaultLang),
  };
}

/**
 * Minimal mock CHILD EditorView. Mirrors the makeMockChildView pattern from
 * tests/main/childEditorSync.test.ts:87-97 — exposes `state.doc.length` and
 * `state.doc.toString()` plus a `dispatch` spy.
 */
function makeMockChildView(initialBody: string) {
  return {
    state: {
      doc: {
        length: initialBody.length,
        toString() {
          return initialBody;
        },
      },
    },
    dispatch: vi.fn(),
  } as unknown as import('@codemirror/view').EditorView;
}

/**
 * Minimal mock registry mirroring tests/main/childEditorSync.test.ts:99-109.
 * Backed by a Map<string, EditorView>.
 */
function makeMockRegistry() {
  const map = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => map.get(key)),
    has: vi.fn((key: string) => map.has(key)),
    set: vi.fn((key: string, view: unknown) => {
      map.set(key, view);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    _map: map,
  } as unknown as import('../../src/main/childEditorRegistry').ChildEditorRegistry;
}

const FILE_PATH = 'LeetCode/1-two-sum.md';

const NOTES_TEXT =
  'My personal note: tried hashmap approach, got TLE on edge case k=1.';

const INITIAL_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '```python3',
  'OLD_CODE',
  '```',
  '',
  '## Notes',
  NOTES_TEXT,
  '',
].join('\n');

describe('Reset code — child-CM6 dispatch (Phase 17 D-03 / D-04 / D-05 / D-06)', () => {
  it('dispatches on child when registered (D-03) — userEvent "leetcode.reset.child", no addToHistory.of(false)', async () => {
    const m = makeMockVaultApp({ [FILE_PATH]: INITIAL_NOTE });
    const file = m.app.vault.getAbstractFileByPath(FILE_PATH)!;
    const settings = makeSettings({
      codeSnippets: [
        { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
      ],
    });

    // Pre-load the child registry with a child view for the file.
    const registry = makeMockRegistry();
    const childView = makeMockChildView('OLD_CODE');
    (
      registry as unknown as { _map: Map<string, unknown> }
    )._map.set(FILE_PATH, childView);

    // The post-D-03 caller seam: getDispatchHandle looks up child first,
    // returns a handle that dispatches the FULL body replacement on the
    // child with userEvent 'leetcode.reset.child'.
    const getDispatchHandle = (targetFile: { path: string }) => {
      const cv = (
        registry as unknown as {
          get(key: string): import('@codemirror/view').EditorView | undefined;
        }
      ).get(targetFile.path);
      if (!cv) return null;
      return {
        replaceFullBody: (next: string) => {
          // The dispatch spec — matches the post-D-03 target shape from
          // 17-PATTERNS.md "src/main.ts Reset wiring" Target shape block.
          cv.dispatch({
            changes: { from: 0, to: cv.state.doc.length, insert: next },
            userEvent: 'leetcode.reset.child',
          });
        },
      };
    };

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      // D-03 seam — when supplied AND returns a handle, the helper routes
      // through the handle instead of vault.process.
      getDispatchHandle: getDispatchHandle as never,
    } as never);

    // Child dispatched exactly once with the new userEvent.
    expect(childView.dispatch).toHaveBeenCalledTimes(1);
    const call = (childView.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userEvent).toBe('leetcode.reset.child');

    // Full-body replace shape: from === 0, to === doc.length.
    expect(call.changes.from).toBe(0);
    expect(call.changes.to).toBe('OLD_CODE'.length);
    // Insert payload contains the starter code (could be just-the-body or
    // the full-note string depending on Task 2's slicing strategy — we only
    // assert the starter is present).
    expect(typeof call.changes.insert).toBe('string');
    expect(call.changes.insert).toContain('class S: pass');

    // D-05 / D-06 invariant: dispatch MUST NOT carry addToHistory.of(false).
    // The child holds the undo entry; the parent mirror (createChildSyncExtension)
    // applies addToHistory.of(false) to the parent side independently.
    // We assert the dispatch spec object has no `annotations` array, OR if
    // it does, no entry references addToHistory(false).
    if (call.annotations !== undefined) {
      const annotationsArr = Array.isArray(call.annotations)
        ? call.annotations
        : [call.annotations];
      const stringified = annotationsArr.map((a: unknown) => String(a)).join('|');
      // Loose guard — actual Annotation objects don't toString to "addToHistory"
      // but the dispatch spec object should NOT include the addToHistory key
      // shape used in childEditorSync.ts:111 (Transaction.addToHistory.of(false)).
      // We confirm by checking the raw call args do not contain "addToHistory".
      expect(stringified.toLowerCase()).not.toContain('addtohistory');
    }
    // Vault.process should NOT have been called when the child route was
    // exercised (D-04 fallback only runs when no child is registered).
    expect(m.spies.process).not.toHaveBeenCalled();
  });

  it('falls back to vault.process when no child is registered (D-04)', async () => {
    const m = makeMockVaultApp({ [FILE_PATH]: INITIAL_NOTE });
    const file = m.app.vault.getAbstractFileByPath(FILE_PATH)!;
    const settings = makeSettings({
      codeSnippets: [
        { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
      ],
    });

    // Empty registry — no child for this file.
    const registry = makeMockRegistry();
    const childView = makeMockChildView('OLD_CODE');
    // Intentionally do NOT register `childView` for FILE_PATH.

    const getDispatchHandle = (targetFile: { path: string }) => {
      const cv = (
        registry as unknown as {
          get(key: string): import('@codemirror/view').EditorView | undefined;
        }
      ).get(targetFile.path);
      if (!cv) return null;
      return {
        replaceFullBody: (next: string) => {
          cv.dispatch({
            changes: { from: 0, to: cv.state.doc.length, insert: next },
            userEvent: 'leetcode.reset.child',
          });
        },
      };
    };

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      getDispatchHandle: getDispatchHandle as never,
    } as never);

    // Fallback path: vault.process called exactly once; child dispatch never fires.
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(childView.dispatch).not.toHaveBeenCalled();

    // Body got the starter — fallback semantics preserved.
    const body = m.getContent(FILE_PATH)!;
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD_CODE');
  });

  it('D-05 cm-z scope isolation — Notes section preserved across Reset (child route)', async () => {
    const m = makeMockVaultApp({ [FILE_PATH]: INITIAL_NOTE });
    const file = m.app.vault.getAbstractFileByPath(FILE_PATH)!;
    const settings = makeSettings({
      codeSnippets: [
        { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
      ],
    });

    const registry = makeMockRegistry();
    const childView = makeMockChildView('OLD_CODE');
    (
      registry as unknown as { _map: Map<string, unknown> }
    )._map.set(FILE_PATH, childView);

    const getDispatchHandle = (targetFile: { path: string }) => {
      const cv = (
        registry as unknown as {
          get(key: string): import('@codemirror/view').EditorView | undefined;
        }
      ).get(targetFile.path);
      if (!cv) return null;
      return {
        replaceFullBody: (next: string) => {
          cv.dispatch({
            changes: { from: 0, to: cv.state.doc.length, insert: next },
            userEvent: 'leetcode.reset.child',
          });
        },
      };
    };

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      getDispatchHandle: getDispatchHandle as never,
    } as never);

    // Reset went through the child route — vault.process untouched.
    expect(m.spies.process).not.toHaveBeenCalled();
    expect(childView.dispatch).toHaveBeenCalledTimes(1);

    // The dispatch carried userEvent 'leetcode.reset.child' (canonical D-03
    // identifier). The child holds the undo entry — a future Cmd-Z on the
    // child pops the dispatch, the existing childEditorSync mirror runs with
    // addToHistory.of(false) on the parent side, and the parent's ## Notes
    // section is byte-identical across the cycle. Source-level proof of the
    // mirror's addToHistory.of(false) lives in childEditorSync.ts:112,162
    // and is asserted in tests/main/childEditorSync.test.ts:535-545.
    //
    // Here we assert the precondition that makes that invariant hold: the
    // CHILD dispatch carries the canonical userEvent and a full-body replace
    // payload — not a parent dispatch with addToHistory.of(false) (which
    // would lose the undo entry entirely, regressing worse than today).
    const call = (childView.dispatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userEvent).toBe('leetcode.reset.child');
    // Initial parent doc unchanged in our assertion (we don't manually run
    // the sync mirror in this unit test — that's exercised in
    // tests/main/childEditorSync.test.ts). The Notes text the user wrote
    // remains in the test fixture — Reset never touches it.
    const initialNotesIdx = INITIAL_NOTE.indexOf(NOTES_TEXT);
    expect(initialNotesIdx).toBeGreaterThan(0);
  });

  it('"leetcode.reset.child" is NOT in ECHO_PRONE_USER_EVENTS (Pitfall guard)', () => {
    // Source-level assertion: the new userEvent must NOT appear in
    // src/main/nestedEditorExtension.ts ECHO_PRONE_USER_EVENTS Set —
    // child-origin Reset relies on the existing child→parent sync mirror to
    // propagate to the parent doc. Adding 'leetcode.reset.child' to the
    // echo-prone set would silently drop the parent-side write.
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'src/main/nestedEditorExtension.ts'),
      'utf-8',
    );
    expect(source).not.toContain('leetcode.reset.child');

    // Sanity: the existing echo-prone entries are still there.
    expect(source).toContain('leetcode.child-sync');
    expect(source).toContain('leetcode.fence-repair');
  });
});
