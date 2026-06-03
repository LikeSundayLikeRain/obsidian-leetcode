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

**Status:** Ready for visual check post-deploy.

**Empirical baseline (reported by user during 22-01-B dogfood):**
- Live Preview mode: widget code content renders at **14px**.
- Reading mode (pre-fix): widget code content renders at **16px** (inherited from `.markdown-rendered` prose font-size).
- Goal: Reading mode renders at the SAME 14px as Live Preview. Live Preview unchanged.

**CSS rule added** (after the existing `.cm-editor .lc-nested-editor .cm-content` rule at lines 1971-1974):

```css
.markdown-rendered .lc-nested-editor .cm-editor,
.markdown-rendered .lc-nested-editor .cm-content,
.markdown-rendered .lc-nested-editor .cm-line {
  font-size: 14px;
}
```

**Variable choice rationale:** literal `14px` chosen to match the existing Live Preview rule (`.cm-editor .lc-nested-editor .cm-content { font-size: 14px; }` at line 1973) verbatim. The Live Preview rule itself uses a literal — there is no upstream CSS variable to follow. If a future refactor lifts both to `var(--code-size)` or similar, the two rules should be migrated together. Inline comment in `styles.css` documents this coupling.

**Selector scoping:** anchored on `.markdown-rendered` ancestor, which is present ONLY in Reading mode. Live Preview's `.markdown-source-view` ancestor is never affected — Live Preview rendering remains untouched.

**Specificity check:** `.markdown-rendered` (1-class) + `.lc-nested-editor` (1-class) + `.cm-content` (1-class) = 3-class specificity. Beats the cascade-default `.markdown-rendered { font-size: ...; }` (1-class). No `!important` needed unless dev-vault verification shows otherwise.

**Build:** `npm run build` clean.
**Deploy:** see commit log.

**Visual check (human-driven, dogfood):**
- Reading mode (Cmd-E off) — widget code now renders at 14px (matching Live Preview). Adjacent rendered code blocks unchanged.
- Live Preview mode (Cmd-E on) — widget code still 14px (unchanged from baseline; the `.markdown-source-view` ancestor scopes the new rule out).

**DevTools verification (record after dogfood):**

| Mode | Pre-fix `font-size` (Computed) | Post-fix `font-size` (Computed) | Source rule cited |
| ---- | ------------------------------ | ------------------------------- | ----------------- |
| Live Preview | 14px | 14px | `.cm-editor .lc-nested-editor .cm-content` (line 1973, unchanged) |
| Reading mode | 16px | 14px | `.markdown-rendered .lc-nested-editor .cm-content` (new rule, line ~1976) |

**Acceptance:** PASS pending user dogfood confirmation. If specificity insufficient (read-mode still 16px), add `!important` and document.

## 22-02-01 Vim-Tab Probe

**Status:** _Held for later execution. Will run after 22-01-B dogfood completes and 22-01 Task E lands. See orchestrator plan 22-02-PLAN.md._
