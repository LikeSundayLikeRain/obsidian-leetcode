# Phase 22: v1.2 Path Removal + Polish — Verification Log

**Started:** 2026-06-02
**Status:** Plan 22-02 partial execution (CSS-only tasks; 22-02-01 vim-Tab probe held for later)

## 22-02-02 Widget Hover Border

**Status:** Ready for visual check post-deploy.
**CSS rule added:** `.cm-editor .lc-nested-editor:hover, .cm-editor .lc-nested-editor .leetcode-widget-codeblock:hover { border: none; outline: none; }` — inserted after line 1955 (after `.leetcode-widget-codeblock` rule, before `.lc-nested-editor > .leetcode-code-actions` rule).
**Build:** `npm run build` clean.
**Deploy:** see commit log.
**Visual check (human-driven, dogfood):** hover the v1.3 widget surface — confirm no border paints. Click into widget — confirm focus ring + cursor marker unchanged. Selection highlight unchanged.
**Acceptance:** PASS pending user dogfood confirmation.

## 22-02-03 Action Row Font

**Status:** Ready for visual check post-deploy.
**CSS rule added:** `.leetcode-code-actions, .leetcode-code-actions * { font-family: var(--font-text); }` — inserted after line 970 (after the `!important` cascade-override block at lines 961-970). Base-class specificity should win against `.cm-content`'s monospace cascade since `.cm-content` does not declare `font-family` with `!important`. If dev-vault check shows monospace still wins, add `!important` and document.
**Build:** `npm run build` clean.
**Deploy:** see commit log.
**Visual check (human-driven, dogfood):** open an LC note with widget mounted; inspect the action row chevron + buttons — confirm they render in the user's text font (not monospace). DevTools Computed `font-family` should show the resolved `var(--font-text)` value (e.g., -apple-system, BlinkMacSystemFont, Inter), not Menlo / Consolas / monospace.
**Acceptance:** PASS pending user dogfood confirmation.

## 22-02-04 Read-Mode Font-Size

**Status:** _Pending — Task 22-02-04 next._

## 22-02-01 Vim-Tab Probe

**Status:** _Held for later execution. Will run after 22-01-B dogfood completes and 22-01 Task E lands. See orchestrator plan 22-02-PLAN.md._
