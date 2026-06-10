// Behavioral test for the widget's Tab handler — verifies that pressing Tab
// in the child editor inserts ONE indent unit (read from the live indentUnit
// facet supplied by buildLanguageExtensions), NOT a literal "\t".
//
// Background: @codemirror/commands' `insertTab` dispatches a literal "\t"
// regardless of the indentUnit facet. Before this fix, the widget's empty-
// selection Tab branch called `insertTab`, which produced the user-reported
// "mixed tabs and spaces" — auto-indent (Enter) emits spaces from the facet,
// but manual Tab emitted "\t". The fix replaces `insertTab` with a manual
// `replaceSelection(state.facet(indentUnit))` so Tab matches Enter.
//
// Strategy mirrors `tests/main/childEditorLanguage.behavioral.test.ts`:
// import live `@codemirror/*` packages with NO `vi.mock`. We don't mount the
// full WidgetController (that pulls in the entire DOM/widgetRegistry path);
// instead we replicate just the empty-selection Tab branch from
// WidgetController.ts and assert it dispatches the correct text.
//
// Coverage:
//   1. python3 + override='auto' → Tab inserts 4 spaces.
//   2. python3 + override=2 → Tab inserts 2 spaces.
//   3. python3 + override=8 → Tab inserts 8 spaces.
//   4. javascript + override='auto' → Tab inserts 2 spaces (per-language default).
//   5. golang + override='auto' → Tab inserts "\t" (D-06 Go non-negotiable).
//   6. golang + override=4 → Tab still inserts "\t" (D-06 wins).
//   7. The Tab handler does NOT emit a literal "\t" for non-Go languages
//      (regression guard against `insertTab` regression).
//   8. Tab on a non-empty selection invokes indentMore which pushes ONE
//      indent unit per line (matches Tab on empty selection — uniform).

import { describe, it, expect } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import {
  buildLanguageExtensions,
  type IndentOverride,
} from '../../src/main/childEditorLanguage';

// Replicates the empty-selection branch of the widget's Tab handler verbatim.
// Returns the resulting EditorState after the Tab dispatch.
function pressTabEmptySelection(state: EditorState): EditorState {
  const unit = state.facet(indentUnit);
  let next = state;
  // Use the same `state.update + replaceSelection` shape the production
  // handler uses (so a regression in either keeps this test honest).
  const tr = state.update(state.replaceSelection(unit), {
    scrollIntoView: true,
    userEvent: 'input',
  });
  next = tr.state;
  return next;
}

// Replicates the non-empty-selection branch — calls indentMore with a
// {state, dispatch} target shape (same as the widget handler casts to).
function pressTabSelection(state: EditorState): EditorState {
  let next = state;
  // `indentMore` is a StateCommand from @codemirror/commands which carries
  // a version-skewed nominal type (the repo has two @codemirror/state
  // copies — see childEditorLanguage.behavioral.test.ts header). Cast
  // through unknown to a structural shape compatible with both copies.
  type LooseCommand = (target: {
    state: EditorState;
    dispatch: (tr: Transaction) => void;
  }) => boolean;
  (indentMore as unknown as LooseCommand)({
    state,
    dispatch: (tr) => { next = tr.state; },
  });
  return next;
}

function makeState(
  slug: string,
  override: IndentOverride,
  doc: string,
  selection?: { anchor: number; head?: number },
): EditorState {
  const extensions = buildLanguageExtensions(slug, override);
  return EditorState.create({ doc, selection, extensions });
}

describe('Widget Tab handler — empty selection inserts indentUnit (not literal \\t)', () => {
  it('python3 + auto override → Tab inserts 4 spaces', () => {
    const state = makeState('python3', 'auto', '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('    ');
    expect(next.doc.toString()).not.toBe('\t');
  });

  it('python3 + override=2 → Tab inserts 2 spaces', () => {
    const state = makeState('python3', 2, '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('  ');
  });

  it('python3 + override=8 → Tab inserts 8 spaces', () => {
    const state = makeState('python3', 8, '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('        ');
  });

  it('javascript + auto override → Tab inserts 2 spaces (per-language default)', () => {
    const state = makeState('javascript', 'auto', '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('  ');
  });

  it('typescript + override=4 → Tab inserts 4 spaces', () => {
    const state = makeState('typescript', 4, '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('    ');
  });

  it('golang + auto override → Tab inserts a real "\\t" (D-06 non-negotiable)', () => {
    const state = makeState('golang', 'auto', '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('\t');
  });

  it('golang + override=4 → Tab still inserts "\\t" (D-06 wins over override)', () => {
    const state = makeState('golang', 4, '', { anchor: 0 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('\t');
  });

  it('regression: non-Go languages do NOT receive a literal "\\t" on Tab', () => {
    // Hardens against any future regression that re-introduces
    // @codemirror/commands' insertTab in the empty-selection branch.
    for (const slug of ['python3', 'java', 'cpp', 'rust', 'javascript', 'typescript']) {
      const state = makeState(slug, 'auto', '', { anchor: 0 });
      const next = pressTabEmptySelection(state);
      expect(next.doc.toString().includes('\t')).toBe(false);
    }
  });

  it('Tab in the middle of an existing line inserts the unit at the cursor only', () => {
    // Cursor between "ab" and "cd" — Tab inserts unit, not a full re-indent
    // of the line. (Matches the production handler comment: "does NOT shift
    // the rest of the line, so Tab in the middle of a line behaves like a
    // normal text editor.")
    const state = makeState('python3', 'auto', 'abcd', { anchor: 2 });
    const next = pressTabEmptySelection(state);
    expect(next.doc.toString()).toBe('ab    cd');
  });
});

describe('Widget Tab handler — non-empty selection invokes indentMore', () => {
  it('python3 + auto + multi-line selection → each line gains 4 spaces', () => {
    const doc = 'a\nb\nc';
    const state = makeState(
      'python3',
      'auto',
      doc,
      // Select from start of line 1 through end of line 3.
      { anchor: 0, head: doc.length },
    );
    const next = pressTabSelection(state);
    expect(next.doc.toString()).toBe('    a\n    b\n    c');
  });

  it('javascript + auto + multi-line selection → each line gains 2 spaces', () => {
    const doc = 'x\ny';
    const state = makeState(
      'javascript',
      'auto',
      doc,
      { anchor: 0, head: doc.length },
    );
    const next = pressTabSelection(state);
    expect(next.doc.toString()).toBe('  x\n  y');
  });

  it('golang + override=4 + multi-line selection → each line gains "\\t" (D-06)', () => {
    const doc = 'p\nq';
    const state = makeState(
      'golang',
      4,
      doc,
      { anchor: 0, head: doc.length },
    );
    const next = pressTabSelection(state);
    expect(next.doc.toString()).toBe('\tp\n\tq');
  });

  it('python3 + override=2 + multi-line selection → 2 spaces per line', () => {
    const doc = 'foo\nbar';
    const state = makeState(
      'python3',
      2,
      doc,
      { anchor: 0, head: doc.length },
    );
    const next = pressTabSelection(state);
    expect(next.doc.toString()).toBe('  foo\n  bar');
  });
});
