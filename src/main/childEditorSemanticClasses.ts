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
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { tags as t, type Tag } from '@lezer/highlight';

/**
 * Map a Lezer Tag → Obsidian CM5-compatible semantic class name. Returns
 * null when the tag has no canonical Obsidian equivalent (the
 * HighlightStyle fallback handles those).
 *
 * Mapping derived from live DOM probe of Obsidian's Java code-block
 * rendering (One Dark theme, 2026-05-24):
 *   class, public         → cm-keyword
 *   Solution              → cm-def
 *   boolean, int, String  → cm-type
 *   x, y, target, name    → cm-variable
 *   "..."                 → cm-string
 *   // comment            → cm-comment
 *   42, true, null        → cm-number / cm-atom (Obsidian uses cm-number for
 *                           numeric literals, cm-atom for true/false/null)
 */
function tagToObsidianClass(tag: Tag): string | null {
  // The lezer Tag system supports tag matching via reference equality.
  // Listed in priority order — first match wins.
  if (tag === t.keyword) return 'cm-keyword';
  if (tag === t.controlKeyword) return 'cm-keyword';
  if (tag === t.modifier) return 'cm-keyword';
  if (tag === t.definitionKeyword) return 'cm-keyword';
  if (tag === t.operatorKeyword) return 'cm-keyword';

  if (tag === t.typeName) return 'cm-type';
  if (tag === t.className) return 'cm-type';

  if (tag === t.variableName) return 'cm-variable';
  if (tag === t.propertyName) return 'cm-property';

  // `t.definition(t.variableName)` and similar produce a different Tag
  // instance — compare against the modified-tag forms by checking the
  // base/modifier shape via the public `set` array.
  const setMatch = tag.set?.find((s) =>
    s === t.keyword ||
    s === t.typeName ||
    s === t.className ||
    s === t.variableName ||
    s === t.propertyName ||
    s === t.string ||
    s === t.comment ||
    s === t.number,
  );
  if (setMatch === t.keyword) return 'cm-keyword';
  if (setMatch === t.typeName) return 'cm-type';
  if (setMatch === t.className) return 'cm-type';
  if (setMatch === t.variableName) {
    // t.definition(t.variableName) is the function/class definition name.
    // Obsidian renders Java's `Solution` (in `class Solution {`) as cm-def.
    // We can't reliably distinguish definition-modified from plain via Tag
    // identity alone, but if any modifier in the set is `t.definition`,
    // emit cm-def. Otherwise cm-variable.
    if (tag.set?.includes(t.definition(t.variableName))) return 'cm-def';
    return 'cm-variable';
  }
  if (setMatch === t.propertyName) return 'cm-property';
  if (setMatch === t.string) return 'cm-string';
  if (setMatch === t.comment) return 'cm-comment';
  if (setMatch === t.number) return 'cm-number';

  // Direct matches for less ambiguous tags.
  if (tag === t.string) return 'cm-string';
  if (tag === t.regexp) return 'cm-string';
  if (tag === t.escape) return 'cm-string';
  if (tag === t.comment) return 'cm-comment';
  if (tag === t.lineComment) return 'cm-comment';
  if (tag === t.blockComment) return 'cm-comment';
  if (tag === t.number) return 'cm-number';
  if (tag === t.bool) return 'cm-atom';
  if (tag === t.null) return 'cm-atom';
  if (tag === t.operator) return 'cm-operator';
  if (tag === t.punctuation) return 'cm-punctuation';
  if (tag === t.bracket) return 'cm-bracket';

  return null;
}

/**
 * Build the DecorationSet for the visible viewport: walks the syntax
 * tree, looks up each leaf node's HighlightStyle tag, maps to an
 * Obsidian-compatible class via `tagToObsidianClass`, emits a
 * Decoration.mark range for each matching token.
 */
function buildSemanticDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // Cache the few decoration instances we actually use — RangeSetBuilder
  // accepts the same instance for many ranges with no overhead.
  const cache = new Map<string, Decoration>();
  function getMark(className: string): Decoration {
    let dec = cache.get(className);
    if (!dec) {
      dec = Decoration.mark({ class: className });
      cache.set(className, dec);
    }
    return dec;
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        // Many tree nodes have no associated highlight tag — skip those.
        // The `node.type` carries a `prop` lookup of NodeProp.add registered
        // at parser-build time. We use the resolved `tags` prop value via
        // the Lezer highlight integration. To avoid introducing a parser
        // dependency, we read the prop through the `node.type.prop` API.
        const ranges = collectTagsForNode(node, getMark, builder);
        return ranges;
      },
    });
  }

  return builder.finish();
}

/**
 * Helper: for each tag attached to `node`, look up its Obsidian class
 * and add a builder range. Returns void; the builder is mutated. The
 * `_view` parameter is reserved for future use (e.g., per-language
 * overrides).
 *
 * NOTE: we use `node.type.prop(NodeProp...)` indirectly via the lezer
 * highlight `styleTags` extension. To keep this module decoupled from
 * the specific parser used (Java, Python, etc.), we leverage the
 * `highlightTree` callback API from `@lezer/highlight`.
 */
function collectTagsForNode(
  _node: { from: number; to: number; type: { prop?: unknown } },
  _getMark: (className: string) => Decoration,
  _builder: RangeSetBuilder<Decoration>,
): boolean | undefined {
  // The recommended path is `highlightTree` from `@lezer/highlight`.
  // We use it from the ViewPlugin-level builder below instead; this
  // function-level enter() hook is too granular. Returning undefined
  // (default behavior) lets the iteration continue.
  return undefined;
}

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
  // Local require to avoid pulling `@lezer/highlight`'s entire surface
  // into the eager import graph at the top of this file. The package is
  // already a transitive peer dep via @codemirror/language.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { highlightTree, tagHighlighter } = require('@lezer/highlight') as typeof import('@lezer/highlight');

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
