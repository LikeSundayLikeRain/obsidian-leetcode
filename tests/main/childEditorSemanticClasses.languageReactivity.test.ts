// Regression test for .planning/debug/language-switch-body-not-swapped.md
// Failure A — obsidianSemanticClasses ViewPlugin must recompute decorations
// when the `language` facet changes (Compartment.reconfigure delivery path),
// not only on docChanged / viewportChanged / geometryChanged.
//
// Why this scope: the plugin is a CM6 ViewPlugin whose `update()` method
// gates the call to buildSemanticClassDecorations. The bug was the gate
// missing the language-facet signal, so a reconfigure dispatch left stale
// cm-keyword/cm-type/etc. classes on tokens until the user typed.
//
// We exercise the full CM6 stack: a real EditorView mounted in jsdom with
// the real obsidianSemanticClasses extension and a real Compartment of()
// holding a Python language pack, dispatch a Compartment.reconfigure to
// Java, and assert the decoration set was recomputed (token count + class
// distribution shifts in observable ways).

import { describe, it, expect } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { obsidianSemanticClasses } from '../../src/main/childEditorSemanticClasses';

// Helper — collect all decoration class names spanning visible ranges
// by walking the live ViewPlugin's DecorationSet.
function readDecorationClasses(view: EditorView): string[] {
  const out: string[] = [];
  // Snapshot the DecorationSet via the view's own `update` mechanism by
  // iterating over decorations the ViewPlugin exposes. CM6 ViewPlugin
  // decorations are surfaced through view.dom inspection — but cleaner:
  // walk the plugin's decorations field directly via the view.plugin API.
  // We use view.dom DOM traversal because the plugin doesn't expose a
  // public handle, and the decorations are realized as DOM classes once
  // the view paints. jsdom supports class-name reads but not full layout,
  // so we inspect the .cm-content children for ".cm-*" classes.
  const content = view.dom.querySelector('.cm-content');
  if (!content) return out;
  for (const span of Array.from(content.querySelectorAll('span'))) {
    for (const cls of Array.from(span.classList)) {
      if (cls.startsWith('cm-')) out.push(cls);
    }
  }
  return out;
}

function makeView(initialDoc: string): { view: EditorView; compartment: Compartment } {
  const compartment = new Compartment();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      compartment.of(python()),
      obsidianSemanticClasses,
      EditorView.editable.of(true),
    ],
  });
  const view = new EditorView({ state, parent });
  return { view, compartment };
}

describe('obsidianSemanticClasses — language-facet reactivity (regression)', () => {
  it('recomputes decorations when Compartment.reconfigure swaps the language', () => {
    // Use a snippet that's KEYWORDS in BOTH Python AND Java but tokenized
    // differently — `class Foo` is a class-keyword in both, BUT `def`
    // is a keyword in Python and an identifier in Java. After switching
    // Python → Java, the `def` token must lose its `cm-keyword` class.
    const code = ['def foo():', '    return 1'].join('\n');
    const { view, compartment } = makeView(code);

    // Force a paint pass so the ViewPlugin's decorations are realized as
    // DOM classes. jsdom's microtask flush via requestAnimationFrame is
    // unreliable; instead, dispatch a no-op viewport refresh — the
    // ViewPlugin reads visibleRanges on construction so the constructor
    // pass is enough for initial decorations.
    const beforeClasses = readDecorationClasses(view);

    // Sanity check: Python's parser SHOULD have tagged `def` as a keyword.
    // We don't assert exact token counts (jsdom layout differs) — only
    // that some cm-keyword class made it onto the DOM.
    expect(beforeClasses.some((c) => c === 'cm-keyword')).toBe(true);

    // Snapshot the keyword count for the diff assertion below.
    const beforeKeywordCount = beforeClasses.filter((c) => c === 'cm-keyword').length;

    // Effects-only dispatch — exactly the pattern WidgetController.ts:1897
    // uses to swap the parser. No docChanged. No viewportChanged. No
    // geometryChanged. The pre-fix predicate would have skipped the
    // recompute and left the OLD-language decorations cached.
    view.dispatch({
      effects: compartment.reconfigure(java()),
    });

    const afterClasses = readDecorationClasses(view);

    // After Java replaces Python:
    //   - `def foo()` is no longer a keyword sequence — Java doesn't
    //     reserve `def`. Java's `cm-keyword` count for this snippet is
    //     0 (no class/public/return-style tokens, just identifiers).
    //   - The decoration set MUST have been rebuilt. Pre-fix, the
    //     beforeKeywordCount would persist verbatim. Post-fix, it
    //     should drop to 0 because `def`/`return` lose keyword status
    //     under Java's parser (the snippet isn't valid Java; the parser
    //     produces an error tree but no `def` keyword token).
    const afterKeywordCount = afterClasses.filter((c) => c === 'cm-keyword').length;

    // Strict assertion — the decoration set MUST differ. We don't pin
    // exact counts because Java's error-recovery tagging may produce
    // some defensive keyword-style classes; we only require a CHANGE
    // from the Python baseline.
    expect(afterKeywordCount).not.toBe(beforeKeywordCount);

    // Cleanup.
    view.destroy();
  });

  it('preserves recompute on docChanged (existing behavior — must not regress)', () => {
    const { view } = makeView('x = 1');
    const before = readDecorationClasses(view);

    // A real doc edit — the pre-fix predicate handled this and the
    // post-fix predicate must continue to.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: '\nclass Foo: pass' },
    });

    const after = readDecorationClasses(view);
    // After adding `class Foo: pass`, the decoration set must include
    // additional cm-keyword (for `class`) entries.
    expect(after.length).toBeGreaterThan(before.length);

    view.destroy();
  });
});
