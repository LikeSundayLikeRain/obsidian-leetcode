// src/main/python3Highlighter.ts
//
// Phase 5.2 D-13 — python3 → python language-tag alias for Reading Mode
// syntax highlighting. Obsidian uses Prism.js (verified via `loadPrism` in
// obsidian.d.ts:3744); Prism recognizes `python` / `py` but NOT `python3`.
// LeetCode's canonical langSlug for Python is `python3`.
//
// Approach: teach Prism that `python3` IS the python grammar via
// `Prism.languages.python3 = Prism.languages.python` at plugin load. This
// is strictly additive — doesn't hijack the fence rendering, doesn't turn
// Live Preview into a read-mode widget, doesn't add an "Edit block" button.
// Obsidian's normal code-block path now recognizes `python3` and tokenizes
// it using the python grammar.
//
// Defensive post-processor: rewrites `code.language-python3` to
// `language-python` on already-rendered elements. Belt-and-suspenders: if
// the alias hasn't resolved when a note renders, the post-processor
// re-classes the <code> so CSS-based syntax-color themes still apply, and
// Prism's next pass (if any) will pick it up.
//
// Scope: Reading Mode only. Edit-Mode CM6 highlighting is Phase 5.3 scope
// — the full language pack (`@codemirror/lang-python`) is 5.3's territory.
// Global application (not gated on `lc-slug`) is the design.

import { loadPrism } from 'obsidian';
import type { Plugin } from 'obsidian';

interface PrismLike {
  languages?: Record<string, unknown>;
}

export function registerPython3Highlighter(plugin: Plugin): void {
  // Install the alias eagerly. loadPrism() resolves to the cached Prism
  // module; subsequent Prism.highlight calls against `python3` will then
  // find the grammar under that key.
  void (async () => {
    try {
      const prism = (await loadPrism()) as PrismLike;
      if (prism.languages && prism.languages['python']) {
        prism.languages['python3'] = prism.languages['python'];
      }
    } catch {
      // Prism unavailable — silent fallback. python3 fences render as plain
      // text (same as pre-5.2 behavior).
    }
  })();

  // Post-processor: for any <code> element that landed with
  // class="language-python3", rewrite to language-python so theme CSS
  // selectors that target `.language-python` apply. Also gives Obsidian's
  // Prism pass a chance to re-tokenize if it hasn't already.
  plugin.registerMarkdownPostProcessor((element) => {
    const codes = element.querySelectorAll('code.language-python3');
    for (const code of Array.from(codes)) {
      code.classList.remove('language-python3');
      code.classList.add('language-python');
    }
  });
}
