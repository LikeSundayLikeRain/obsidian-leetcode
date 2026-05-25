// Phase 17 Plan 05 — Themed HighlightStyle + bracket-match contrast theme.
// Implements decisions: D-15 (themed HighlightStyle bound to Obsidian CSS
// variables), D-16 (high-contrast .cm-matchingBracket theme block resolving
// the Phase 16 dark-mode cosmetic gap from 16-UAT.md Test 9).
//
// Pure module: zero captured state, zero side effects at module init. The
// `HighlightStyle.define([...])` and `EditorView.theme({...})` calls happen
// at module evaluation time but are simple data-shape constructors with no
// I/O or DOM mutation.
//
// Pitfall 5: bracketMatching() firing logic stays at childEditorFactory.ts —
// this module owns the styling only (HighlightStyle + theme block).
//
// The themed HighlightStyle replaces the previous `defaultHighlightStyle`
// import in `childEditorFactory.ts:36-37` (Phase 16 D-15 reference). The
// bindings here use Obsidian's published code-token CSS variables so colors
// track Obsidian theme switches (light ↔ dark) automatically with no plugin
// reload. See 17-RESEARCH.md Pattern 3 (lines 246-310) for the full Lezer
// tag → CSS variable mapping.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
// Phase 17 Plan 10 round-3: syntaxHighlighting is no longer wired into
// createThemedHighlight()'s return array (see function comment). The
// HighlightStyle.define() spec is still exported as `themedHighlightStyle`
// for testability and potential future re-enablement, so the import
// stays.
import { HighlightStyle } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { tags as t } from '@lezer/highlight';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { type Extension } from '@codemirror/state';

/**
 * D-15 — HighlightStyle binding Lezer tags to Obsidian CSS variables. Using
 * `var(--code-*)` strings means every tag's color is resolved by the browser
 * against Obsidian's currently-active theme; no plugin code runs on theme
 * switch. The legacy-modes `StreamLanguage` (Go) routes its tokens through
 * the same Lezer tag set, so this style applies to Go automatically iff Go's
 * mode binds to the listed tags (D-17 conditional — verified in 17-UAT.md
 * Test 16 GO-01).
 *
 * Exported as a named const (not just embedded in `createThemedHighlight`)
 * so unit tests can introspect the binding contract.
 */
// Phase 17 Plan 10 round-2 (17-UAT.md Test 13 cascade follow-up): inline
// fallbacks via the var() second argument so Obsidian's native --code-*
// (defined at body / :root level) wins via natural cascade. Previous
// iteration redefined --code-* under .lc-nested-editor scope, which had
// higher specificity than Obsidian's body-level definitions and shadowed
// the user's theme. Now Obsidian wins; the fallback hex codes only fire
// when --code-* is genuinely undefined in the cascade. The :where()
// fallback layers under .theme-light/.theme-dark in styles.css are
// removed in lockstep.
export const themedHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--code-keyword, #ff7b72)' },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.escape],
    color: 'var(--code-string, #a5d6ff)',
  },
  { tag: t.comment, color: 'var(--code-comment, #8b949e)', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: 'var(--code-function, #d2a8ff)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--code-tag, #7ee787)' },
  { tag: [t.propertyName, t.className], color: 'var(--code-property, #79c0ff)' },
  { tag: t.operator, color: 'var(--code-operator, #ff7b72)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-value, #79c0ff)' },
  // Phase 17 Plan 10 round-3 (17-UAT.md Test 13 final tag-mapping pass):
  // Obsidian's native renderer assigns class `cm-type` to type tokens
  // (e.g., `boolean`, `int`, `String` in Java) which are colored via
  // `--code-type`. Plan 17-05 mapped t.typeName → --code-keyword which
  // collapsed types into the keyword color, breaking visual parity with
  // the Notes block (verified live 2026-05-24 DOM probe). Map to
  // --code-type with a sensible fallback for themes that don't define it.
  { tag: t.typeName, color: 'var(--code-type, #79c0ff)' },
  { tag: t.invalid, color: 'var(--text-error)' },
]);

/**
 * D-16 — Raw spec object for the bracket-match theme block. Exported as a
 * separate const so unit tests can introspect it without invoking the
 * EditorView.theme constructor (which returns an opaque Extension that
 * doesn't expose its CSS rules via a public API).
 *
 * Solves the Phase 16 cosmetic gap (16-UAT.md Test 9): the default
 * `.cm-matchingBracket` styling was hard to see in dark themes. This block
 * uses high-contrast Obsidian theme variables — `--code-keyword` foreground
 * (a strong accent in every Obsidian theme) on `--background-modifier-
 * active-hover` background (a subtly tinted hover state) plus a 1px outline
 * for unambiguous edge definition. Visible in BOTH dark and light themes.
 */
export const bracketMatchThemeSpec: Parameters<typeof EditorView.theme>[0] = {
  '.cm-matchingBracket': {
    color: 'var(--code-keyword)',
    backgroundColor: 'var(--background-modifier-active-hover)',
    outline: '1px solid var(--code-keyword)',
    borderRadius: '2px',
  },
  '.cm-nonmatchingBracket': {
    color: 'var(--text-error)',
    backgroundColor: 'transparent',
  },
};

/**
 * D-16 — `EditorView.theme` Extension wrapping `bracketMatchThemeSpec`.
 * Exported separately for testability.
 */
export const themedBracketMatchTheme: Extension = EditorView.theme(bracketMatchThemeSpec);

/**
 * D-15 / D-16 — Returns the Extension[] consumed by the child editor's
 * extensions array (via spread `...createThemedHighlight()`). The array is
 * exactly two entries:
 *
 *   1. `syntaxHighlighting(themedHighlightStyle)` — wires the Lezer tag →
 *      CSS variable bindings into CM6's `syntaxHighlighting` facet. Applies
 *      to every active language pack (Lezer + StreamLanguage).
 *   2. `themedBracketMatchTheme` — high-contrast `.cm-matchingBracket` rule
 *      (D-16). The bracket-match firing logic stays in
 *      `childEditorFactory.ts:178` (`bracketMatching()`); this entry only
 *      styles the highlight CM6 emits.
 *
 * The function form (rather than a plain exported array) matches the
 * `buildLanguageExtensions` factory shape in `childEditorLanguage.ts:132-148`
 * and gives the consumer site a single named import to spread.
 *
 * Pitfall 5 reminder: do NOT add `bracketMatching()` here — that's at the
 * top-level extensions array in `childEditorFactory.ts`.
 */
export function createThemedHighlight(): Extension[] {
  // Phase 17 Plan 10 round-3 (17-UAT.md Test 13 final pass): the
  // syntaxHighlighting(themedHighlightStyle) entry was REMOVED from this
  // returned array. Its inline `style="color: var(--code-keyword)"`
  // beat class-scoped community-theme rules (e.g. One Dark's
  // `.HyperMD-codeblock .cm-keyword { color: var(--purple); }`) via CSS
  // specificity, so themes couldn't override the child editor's syntax
  // colors. Round-3 emits Obsidian-compatible CM5 semantic classes
  // (`cm-keyword`, `cm-type`, `cm-variable`, …) via
  // `obsidianSemanticClasses` (a sibling extension wired in
  // childEditorFactory.ts), and theme CSS now colors tokens by
  // cascading through Obsidian's app.css `.cm-keyword { color:
  // var(--code-keyword); }` (default) plus any community-theme
  // overrides scoped to `.HyperMD-codeblock`. The bracket-match theme
  // (D-16 — high-contrast `.cm-matchingBracket`) is unaffected and
  // continues to ship here.
  //
  // The function name is preserved for API stability (existing callers
  // and tests); the returned array now contains exactly one entry —
  // the bracket-match theme.
  return [themedBracketMatchTheme];
}
