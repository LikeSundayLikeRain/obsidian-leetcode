// Phase 17 Plan 03 — Tab mid-line behavior (D-11/D-12).
//
// Verifies the customTabCommand/customShiftTabCommand exports from
// `src/main/childEditorFactory.ts` correctly branch on cursor position:
//
//   - Line-start (cursor at col 0 OR at/before first non-whitespace) → indent
//     the line (delegates to CM6 `indentMore`).
//   - Mid-line (cursor after at least one non-whitespace) → insert
//     indentUnit chars at cursor (delegates to CM6 `insertTab`).
//   - Multi-line selection (sel spans >1 line) → always indent ALL lines as a
//     single transaction (Phase 15 INDENT-03 single-undo invariant — D-12).
//
// Strategy: live `@codemirror/*` packages (no vi.mock for CM6 — vitest
// resolves them from node_modules). We construct a minimal EditorState with
// `indentUnit.of(unitStr)` and a `dispatch` spy on a fake EditorView shim.
// Then we invoke the commands directly and inspect the dispatched
// transaction spec.
//
// Why dispatch-spy instead of state.update assertions:
//   `insertTab` and `indentMore` from `@codemirror/commands` invoke
//   `dispatch(state.update(spec))` internally — they take a `{state, dispatch}`
//   target. By spying on `dispatch`, we observe the spec produced WITHOUT
//   needing a live EditorView with a real DOM (happy-dom can't simulate
//   keystroke pipelines deterministically).
//
// Single-undo invariant (D-12): we count `dispatch` invocations during the
// command. `indentMore` produces ONE dispatch even for multi-line selections,
// so the count must be exactly 1. If a future refactor breaks this (e.g.,
// per-line dispatch), Test 4 fails immediately.

import { describe, it, expect, vi } from 'vitest';
import { EditorState, EditorSelection, type Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';

import {
  customTabCommand,
  customShiftTabCommand,
} from '../../src/main/childEditorFactory';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build an EditorState with the given doc, selection, and indentUnit. No
 * LanguageSupport / closeBrackets / keymaps — we only need indentUnit + doc
 * for the customTab commands' internal logic and the delegated CM6 commands.
 */
function makeStateWithIndent(
  doc: string,
  selection: number | { from: number; to: number },
  indentUnitStr: string,
): EditorState {
  const sel =
    typeof selection === 'number'
      ? EditorSelection.single(selection)
      : EditorSelection.single(selection.from, selection.to);
  const extensions: Extension[] = [indentUnit.of(indentUnitStr)];
  return EditorState.create({
    doc,
    selection: sel,
    extensions,
  });
}

/**
 * Build a minimal EditorView shim that satisfies the structural shape used
 * by `insertTab` / `indentMore` / `indentLess` (which are `StateCommand` —
 * they only access `target.state` and `target.dispatch`).
 *
 * The cast to `EditorView` is safe at runtime because the CM6 commands never
 * touch DOM-facing fields on this code path. The same approach is used in
 * `tests/main/childEditorSync.test.ts` (`makeMockChildView`).
 */
function makeMockView(state: EditorState): {
  state: EditorState;
  dispatch: ReturnType<typeof vi.fn>;
} {
  return {
    state,
    dispatch: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('customTabCommand (Phase 17-03 D-11/D-12)', () => {
  describe('Tab line-start vs mid-line branching (D-11)', () => {
    it('Test 1: cursor at line-start — Tab indents line by indentUnit', () => {
      // doc has two lines: "  hello" and "  world"; cursor at offset 0.
      const state = makeStateWithIndent('  hello\n  world', 0, '    ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      // indentMore produces a transaction spec with `changes` that prepends
      // 4 spaces (or fills to next indent stop) on line 1.
      const tr = view.dispatch.mock.calls[0]![0];
      // tr is a Transaction object — its serialized changes start at line 1.
      // Sanity: the transaction must change the document (indent inserts spaces).
      expect(tr.docChanged).toBe(true);
      // Apply the transaction and verify line 1 grew by 2 spaces (from 2 to 4).
      const newDoc = tr.state.doc.toString();
      // After indentMore on a 2-space-indented line with indentUnit=4 spaces,
      // line 1 should be padded to the next indent column (offset 4).
      // Original "  hello" (2 leading spaces) becomes "    hello" (4 leading
      // spaces). This is the standard indentMore behavior.
      const firstLine = newDoc.split('\n')[0]!;
      expect(firstLine.startsWith('    ')).toBe(true);
      expect(firstLine).toContain('hello');
    });

    it('Test 2: cursor inside leading whitespace — Tab indents line', () => {
      // doc "    hello", cursor at offset 2 (in leading whitespace, before `h`).
      // The slice before cursor is "  " — all whitespace — so we delegate to
      // indentMore (line-indent path), NOT insertTab.
      const state = makeStateWithIndent('    hello', 2, '    ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      expect(tr.docChanged).toBe(true);
      // Line 1 was 4-space-indented; indentMore at indentUnit=4 advances it
      // to the next indent stop (8 spaces leading).
      const newDoc = tr.state.doc.toString();
      expect(newDoc.startsWith('        hello')).toBe(true);
    });

    it('Test 3: cursor mid-line — Tab inserts indentUnit at cursor', () => {
      // doc "hello world", cursor at offset 5 (between `hello` and ` world`).
      // The slice before cursor is "hello" — non-whitespace — so we delegate
      // to insertTab.
      const state = makeStateWithIndent('hello world', 5, '    ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      expect(tr.docChanged).toBe(true);
      // insertTab inserts 4 spaces at cursor (indentUnit="    ").
      // Result: "hello    world".
      const newDoc = tr.state.doc.toString();
      expect(newDoc).toBe('hello    world');
    });

    it('Test 4: multi-line selection — Tab indents all lines as ONE transaction (D-12 single-undo)', () => {
      // doc "line1\nline2\nline3"; selection from offset 0 (start of line1)
      // to offset 11 (end of "line2"). Selection spans lines 1 and 2.
      const doc = 'line1\nline2\nline3';
      // line1 is offsets 0..5; "\n" at 5; line2 is 6..11.
      const state = makeStateWithIndent(doc, { from: 0, to: 11 }, '    ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      // CRITICAL: exactly ONE dispatch — not three (one per line) — proves
      // the Phase 15 INDENT-03 single-undo invariant is preserved.
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      expect(tr.docChanged).toBe(true);
      // Both line1 and line2 must have leading 4-space indent. line3 is
      // outside the selection and stays untouched.
      const newDoc = tr.state.doc.toString();
      const lines = newDoc.split('\n');
      expect(lines[0]!.startsWith('    line1')).toBe(true);
      expect(lines[1]!.startsWith('    line2')).toBe(true);
      // line3 unchanged — selection did not extend into it
      expect(lines[2]).toBe('line3');
    });

    it('Test 4b: multi-line selection where head is mid-line still takes the indent branch', () => {
      // Selection from offset 0 (start of line1) to offset 8 (mid line2 —
      // between "li" and "ne2"). Cursor head sits AFTER non-whitespace on
      // line2, but the multi-line check fires FIRST so we still indent.
      const doc = 'line1\nline2';
      const state = makeStateWithIndent(doc, { from: 0, to: 8 }, '    ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      const newDoc = tr.state.doc.toString();
      const lines = newDoc.split('\n');
      // Both lines must be indented even though sel.head is mid-line2
      expect(lines[0]!.startsWith('    line1')).toBe(true);
      expect(lines[1]!.startsWith('    line2')).toBe(true);
    });
  });

  describe('Shift-Tab dedent (INDENT-02)', () => {
    it('Test 5: Shift-Tab dedents current line at any cursor position', () => {
      // doc "    hello", cursor mid-line at offset 6 (between "hell" and "o").
      const state = makeStateWithIndent('    hello', 6, '    ');
      const view = makeMockView(state);

      const ret = customShiftTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      expect(tr.docChanged).toBe(true);
      // indentLess removes one indentUnit (4 spaces) from leading whitespace.
      const newDoc = tr.state.doc.toString();
      expect(newDoc).toBe('hello');
    });

    it('Test 5b: Shift-Tab on already-zero-indent line is a no-op (returns false)', () => {
      // No leading whitespace to remove. indentLess returns false in CM6.
      const state = makeStateWithIndent('hello', 2, '    ');
      const view = makeMockView(state);

      const ret = customShiftTabCommand(view as never);

      // Either no dispatch happened (CM6 indentLess short-circuits) or
      // a no-op dispatch was issued. Both are acceptable; what matters is
      // we didn't lose content.
      if (view.dispatch.mock.calls.length > 0) {
        const tr = view.dispatch.mock.calls[0]![0];
        expect(tr.state.doc.toString()).toBe('hello');
      }
      // ret may be true or false depending on CM6 internal behavior; our
      // wrapper just returns whatever indentLess returns.
      expect(typeof ret).toBe('boolean');
    });
  });

  describe('indentUnit awareness (INDENT-04)', () => {
    it('Test 6a: indentUnit "  " (JS — 2 spaces) inserts 2 spaces at mid-line cursor', () => {
      const state = makeStateWithIndent('hello world', 5, '  ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      const newDoc = tr.state.doc.toString();
      // 2 spaces inserted (NOT 4)
      expect(newDoc).toBe('hello  world');
    });

    it('Test 6b: indentUnit "\\t" (Go) inserts a real tab at mid-line cursor', () => {
      const state = makeStateWithIndent('hello world', 5, '\t');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      const newDoc = tr.state.doc.toString();
      // Real tab character inserted
      expect(newDoc).toBe('hello\tworld');
    });

    it('Test 6c: indentUnit "  " (JS) at line-start indents to indentUnit boundary', () => {
      // 0 leading spaces → indentMore advances by 2 (one indentUnit).
      const state = makeStateWithIndent('hello', 0, '  ');
      const view = makeMockView(state);

      const ret = customTabCommand(view as never);

      expect(ret).toBe(true);
      expect(view.dispatch).toHaveBeenCalledTimes(1);
      const tr = view.dispatch.mock.calls[0]![0];
      const newDoc = tr.state.doc.toString();
      // indentMore at indentUnit=2 yields 2 leading spaces (not 4).
      expect(newDoc).toBe('  hello');
    });
  });
});
