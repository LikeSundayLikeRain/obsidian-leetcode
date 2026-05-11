// src/main/whitespaceCopyIndent.ts
//
// Phase 5.3 D-06 — whitespace-copy indent fallback for LC languages outside
// the pragmatic 8 (C#, Ruby, Swift, Kotlin, Scala, PHP, MySQL/SQL, Bash, Dart,
// Elixir, Erlang, Racket, etc.). On Enter, new line inherits previous
// non-empty line's leading whitespace — no grammar awareness, no bracket
// auto-close, no crash.
//
// Purity: no state, no I/O, no plugin reference. Single shared Extension
// export safe to install inside a CM6 Compartment without per-view allocation.
//
// Silent posture: pure column math; CF-19 — no Notice, no console.error, no
// throw. The indentService callback returns a column count (number) directly.

// `@codemirror/language` ships `indentService` at runtime via Obsidian's
// peer dep. Marked external in esbuild.config.mjs (D-08).
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { indentService } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import type { Extension } from '@codemirror/state';

/**
 * Structural state shape consumed by `computeWhitespaceCopyIndent`. Narrower
 * than CM6's `EditorState` so Wave 0 unit tests can pass a hand-rolled fake
 * state (PATTERNS Option A, lines 494–504). At runtime the indentService
 * callback supplies a real EditorState; the shapes overlap on `doc.lineAt`
 * + `doc.line` so the cast is safe.
 */
interface WhitespaceCopyState {
  doc: {
    lineAt(pos: number): { number: number };
    line(n: number): { text: string };
  };
}

/**
 * Compute the column count to indent a new line by, derived from the leading
 * whitespace of the most-recent non-empty preceding line. Tabs are normalised
 * to 2 spaces (PATTERNS line 234).
 *
 * Contract:
 *   - line.number === 1 → 0 (no preceding line).
 *   - All preceding lines empty → 0.
 *   - Walks back through empty intermediate lines to find the first non-empty
 *     line, then returns its leading-whitespace column count.
 */
export function computeWhitespaceCopyIndent(
  state: WhitespaceCopyState,
  pos: number,
): number {
  const line = state.doc.lineAt(pos);
  if (line.number === 1) return 0;
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = state.doc.line(n);
    if (prev.text.trim().length === 0) continue;
    const match = /^[\t ]*/.exec(prev.text);
    const leading = match?.[0] ?? '';
    // Tab→2-space normalisation: gives a column count consistent with
    // Obsidian's default "indent with 2 spaces" expansion. CM6's indent
    // service expects a number (column), not a string.
    return leading.replace(/\t/g, '  ').length;
  }
  return 0;
}

/**
 * Shared CM6 indentService extension. Single instance — safe to install in
 * every fence's compartment without per-view allocation (the underlying
 * indentService.of(...) wrapper is stateless).
 */
export const whitespaceCopyIndentExtension: Extension = indentService.of(
  (ctx, pos) => computeWhitespaceCopyIndent(ctx.state as unknown as WhitespaceCopyState, pos),
);
