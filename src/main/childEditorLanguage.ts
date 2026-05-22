// Phase 16 — Per-language Extension[] builder for the child editor.
// Implements requirements: INDENT-04, LANG-01, COMMENT-01, BRACKET-01.
// Implements decisions: D-05 (per-language indent map), D-06 (Go-tab non-negotiable),
// D-07 (recompute on every switch), D-11 (single Compartment with parser+indent+
// closeBrackets+Cmd-/ keymap).
//
// Pure module: zero captured state, zero side effects at module init. The single
// non-pure detail is the module-level `languageCompartment` Compartment singleton —
// safe because Compartments are identity-keyed (Pitfall C) and the dispatch carries
// the EditorView context, not the Compartment.
//
// Pitfall A: `StreamLanguage.define(go)` is invoked INSIDE buildLanguageExtensions,
// not at module top-level. `@codemirror/language` is esbuild-external; calling it
// at module init would invoke an external before Obsidian provides it.
// Pitfall B: `closeBrackets` is imported from the package root of
// `@codemirror/autocomplete`, never a deep subpath.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { Compartment, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { indentUnit, StreamLanguage } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { keymap, type Command } from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { toggleLineComment } from '@codemirror/commands';
// eslint-disable-next-line import/no-extraneous-dependencies -- external in esbuild; runtime-provided by Obsidian
import { closeBrackets } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/legacy-modes/mode/go';

/** Indent override union — D-06. `'auto'` consults the per-language map (D-05). */
export type IndentOverride = 'auto' | 2 | 4 | 8;

/**
 * Module-level Compartment singleton (D-11, Pitfall C).
 *
 * The same Compartment key is used by every child EditorView; reconfigure
 * dispatches target a specific EditorView so multiple open notes don't collide.
 */
export const languageCompartment: Compartment = new Compartment();

/**
 * D-05 per-language indent map for `'auto'`. D-06: Go is always tab regardless
 * of override (gofmt non-negotiable). Unknown slug → 4-space fallback.
 */
const PER_LANG_INDENT: Readonly<Record<string, string>> = {
  python3: '    ',
  java: '    ',
  cpp: '    ',
  c: '    ',
  rust: '    ',
  javascript: '  ',
  typescript: '  ',
  golang: '\t',
};

/**
 * Compute the effective indent unit for a (slug, override) pair.
 *
 * Rules:
 *   - Go always returns `'\t'` (D-06 non-negotiable, regardless of override)
 *   - Numeric override (2 | 4 | 8) returns ' '.repeat(n) for non-Go
 *   - `'auto'` consults D-05 map; unknown slug falls back to 4 spaces
 */
export function effectiveIndent(slug: string, override: IndentOverride): string {
  if (slug === 'golang') return '\t';
  if (override !== 'auto') return ' '.repeat(override);
  return PER_LANG_INDENT[slug] ?? '    ';
}

/**
 * Resolve an LC slug to the appropriate CM6 language Extension.
 *
 * D-03: cpp() handles both 'cpp' and 'c'; javascript({ typescript: true })
 * handles the 'typescript' slug.
 * D-04: only the 8 chevron slugs are first-class; unknown slugs (csharp,
 * kotlin, ruby, ...) return python() defensively so the function is total.
 *
 * Return type is the broader `Extension` because StreamLanguage<T> (used for
 * Go) and LanguageSupport (used for the Lezer packs) are both extensions but
 * have different concrete types. Both are valid Compartment payloads.
 *
 * Pitfall A: `StreamLanguage.define(go)` MUST be called here (function body),
 * never at module top-level — `@codemirror/language` is esbuild-external.
 */
function getLanguageSupport(slug: string): Extension {
  switch (slug) {
    case 'python3':
      return python();
    case 'java':
      return java();
    case 'cpp':
    case 'c':
      return cpp();
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'golang':
      // Pitfall A: invoke at call time, not module init.
      return StreamLanguage.define(go);
    case 'rust':
      return rust();
    default:
      // D-04 defensive fallback — unknown slugs shouldn't reach here in
      // production (chevron only emits the 8 known slugs), but the function
      // is kept total to avoid throwing.
      return python();
  }
}

/**
 * Build the Extension[] payload that goes inside `languageCompartment` for a
 * given (slug, override) pair.
 *
 * Returns exactly 4 elements per D-11:
 *   1. LanguageSupport (parser + per-language data, e.g. commentTokens)
 *   2. indentUnit.of(effectiveIndent(slug, override))
 *   3. closeBrackets() — reads per-language pairs from languageData
 *   4. keymap.of([{ key: 'Mod-/', run: toggleLineComment }]) — COMMENT-01
 *
 * `closeBracketsKeymap` is intentionally NOT included here; 16-03 wires it at
 * the top level of the extensions array (Claude's Discretion in CONTEXT.md —
 * the keymap is language-agnostic so rebuilding it on every switch is wasted
 * work, and top-level placement gives correct precedence over defaultKeymap's
 * Backspace per Pitfall D).
 */
export function buildLanguageExtensions(
  slug: string,
  override: IndentOverride,
): Extension[] {
  return [
    getLanguageSupport(slug),
    indentUnit.of(effectiveIndent(slug, override)),
    closeBrackets(),
    // toggleLineComment is typed as `StateCommand` from @codemirror/commands but
    // structurally identical to view's `Command`. The mismatch comes from the
    // pre-existing @codemirror/state version duplication in node_modules
    // (commands brings in 6.6.0, the rest resolve 6.5.0). Runtime behavior is
    // unaffected — both interfaces are nominally the same EditorView.dispatch
    // contract. Cast through Command to unblock TypeScript strict mode.
    keymap.of([{ key: 'Mod-/', run: toggleLineComment as unknown as Command }]),
  ];
}
