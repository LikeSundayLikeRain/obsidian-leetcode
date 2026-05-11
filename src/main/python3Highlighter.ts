// src/main/python3Highlighter.ts
//
// Phase 5.2 D-13 — python3 → python language-tag alias for Reading Mode
// syntax highlighting. Obsidian uses Prism.js (verified via `loadPrism` in
// obsidian.d.ts:3744); Prism recognizes `python` / `py` but NOT `python3`
// (https://prismjs.com/#supported-languages). LeetCode's canonical langSlug
// for Python is `python3`, which matches the fenced-block tags our
// starter-code inserter emits via `codeBlockFor`. Rewriting the class on
// the rendered <code> element makes Prism pick the python highlighter —
// synchronously with the render, no async race on `loadPrism()` (RESEARCH
// Pitfall 7).
//
// Scope: Reading Mode only. Edit-Mode CM6 highlighting is Phase 5.3 scope;
// do NOT touch `codeActionsEditorExtension.ts`. Global application (not
// gated on `lc-slug`) is the design — D-13 sanctions the post-processor
// running on any note so python3 fences in non-LC notes also benefit
// (threat model T-05.2-13 accept).
//
// Purity: function reads + mutates DOM it is handed; no module state, no
// I/O, no network, no async.

import type { Plugin } from 'obsidian';

export function registerPython3Highlighter(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element) => {
    const codes = element.querySelectorAll('code.language-python3');
    for (const code of Array.from(codes)) {
      code.classList.remove('language-python3');
      code.classList.add('language-python');
    }
  });
}
