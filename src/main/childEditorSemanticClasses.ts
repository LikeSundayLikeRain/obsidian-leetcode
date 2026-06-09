/**
 * Phase 17 Plan 10 round-3 (17-UAT.md Test 13 final pass) — emit
 * Obsidian/CM5-compatible semantic class names on syntax tokens so
 * community theme CSS rules (e.g., `.HyperMD-codeblock .cm-keyword
 * { color: var(--purple); }` from One Dark) cascade to the child
 * editor's spans.
 *
 * Background: CM6's HighlightStyle pipeline maps Lezer tags to inline
 * styles via opaque generated class hashes (e.g., `ͼ1q`), which
 * theme CSS cannot target. Obsidian's own code-block rendering uses a
 * CM5-legacy mode that emits semantic class names (`cm-keyword`,
 * `cm-type`, etc.) — this is what theme stylesheets target. By emitting
 * the same class names from a Decoration.mark layer, our child editor's
 * spans become reachable by the same theme rules, achieving per-token
 * parity with Obsidian's native code-block renderer.
 *
 * The plugin's themedHighlightStyle in childEditorTheme.ts continues to
 * apply as a FALLBACK — when a theme doesn't override `.cm-keyword` etc.,
 * the inline style from HighlightStyle still colors the token via the
 * cascade (var(--code-keyword) at the consumer site).
 */
import type { Extension, Range } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { RangeSetBuilder } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { tags as t, type Tag, highlightTree, tagHighlighter } from '@lezer/highlight';

/**
 * ViewPlugin that maintains a DecorationSet of semantic class marks.
 * Recomputed on every viewport scroll or doc change. Cost is bounded
 * by the visible-ranges syntax-tree walk — same complexity as CM6's
 * own syntaxHighlighting() ViewPlugin.
 */
const semanticClassesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildSemanticClassDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = buildSemanticClassDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * Real implementation: uses `highlightTree` from `@lezer/highlight` to
 * walk the visible-range syntax tree and call back per styled token.
 * For each token whose Tag maps to an Obsidian class, emit a
 * Decoration.mark. Keeps the implementation parser-agnostic (works for
 * any language whose Lezer parser registers tags via `styleTags`).
 */
function buildSemanticClassDecorations(view: EditorView): DecorationSet {
  // `highlightTree` + `tagHighlighter` are imported statically at the
  // top of this file alongside `tags`/`Tag`; @lezer/highlight is a
  // transitive peer dep via @codemirror/language and is external in
  // esbuild, so no extra bundle weight.

  // tagHighlighter accepts a list of { tag, class } rules; for each
  // styled token in the tree, it invokes the callback with the matched
  // class string (joined if multiple rules match). We collect every
  // mapping our `tagToObsidianClass` knows about into one tagHighlighter
  // instance, then run highlightTree against the visible ranges.
  const TAG_RULES: Array<{ tag: Tag; class: string }> = [
    { tag: t.keyword, class: 'cm-keyword' },
    { tag: t.controlKeyword, class: 'cm-keyword' },
    { tag: t.modifier, class: 'cm-keyword' },
    { tag: t.definitionKeyword, class: 'cm-keyword' },
    { tag: t.operatorKeyword, class: 'cm-keyword' },
    { tag: t.typeName, class: 'cm-type' },
    { tag: t.className, class: 'cm-type' },
    { tag: t.definition(t.variableName), class: 'cm-def' },
    { tag: t.definition(t.propertyName), class: 'cm-def' },
    { tag: t.function(t.variableName), class: 'cm-variable' },
    { tag: t.variableName, class: 'cm-variable' },
    { tag: t.propertyName, class: 'cm-property' },
    { tag: t.string, class: 'cm-string' },
    { tag: t.regexp, class: 'cm-string' },
    { tag: t.escape, class: 'cm-string' },
    { tag: t.comment, class: 'cm-comment' },
    { tag: t.lineComment, class: 'cm-comment' },
    { tag: t.blockComment, class: 'cm-comment' },
    { tag: t.number, class: 'cm-number' },
    { tag: t.bool, class: 'cm-atom' },
    { tag: t.null, class: 'cm-atom' },
    { tag: t.operator, class: 'cm-operator' },
    { tag: t.punctuation, class: 'cm-punctuation' },
    { tag: t.bracket, class: 'cm-bracket' },
  ];
  const highlighter = tagHighlighter(TAG_RULES);

  // Decoration cache keyed by class name string (so identical-class
  // tokens reuse the same Decoration instance — RangeSetBuilder is fine
  // with that and it's marginally cheaper than allocating per-token).
  const cache = new Map<string, Decoration>();
  function getMark(className: string): Decoration {
    let dec = cache.get(className);
    if (!dec) {
      dec = Decoration.mark({ class: className });
      cache.set(className, dec);
    }
    return dec;
  }

  // Decorations must be added to RangeSetBuilder in ascending `from`
  // order. highlightTree visits tokens in source order, so direct
  // append works. We collect into an array first because highlightTree
  // can interleave overlapping ranges in some grammars; sorting
  // defensively is cheap.
  const ranges: Array<Range<Decoration>> = [];
  for (const { from, to } of view.visibleRanges) {
    highlightTree(
      syntaxTree(view.state),
      highlighter,
      (tFrom, tTo, classes) => {
        if (!classes) return;
        // tagHighlighter joins multiple rule matches with spaces; we
        // emit a single Decoration carrying the joined class string so
        // theme rules targeting any of them work.
        ranges.push(getMark(classes).range(tFrom, tTo));
      },
      from,
      to,
    );
  }

  // RangeSetBuilder needs strictly ascending starts; highlightTree
  // already guarantees source order, but coalesce defensively.
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(range.from, range.to, range.value);
  }
  return builder.finish();
}

/**
 * Public Extension that adds Obsidian-compatible semantic class names
 * to syntax tokens. Intended to be spread alongside the themed
 * HighlightStyle in the child editor's extension array.
 */
export const obsidianSemanticClasses: Extension = semanticClassesPlugin;
