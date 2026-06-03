# Phase 22: v1.2 Path Removal + Polish — Verification Log

**Started:** 2026-06-02
**Status:** Plan 22-02 partial execution (CSS-only tasks; 22-02-01 vim-Tab probe held for later)

## 22-02-02 Widget Hover Border

**Status:** PASS — confirmed in dev vault by user 2026-06-02.

**Three-round investigation:**

| Round | Commit | Approach | Outcome |
|-------|--------|----------|---------|
| 1 | `439b029` | `.cm-editor .lc-nested-editor:hover { border: none; outline: none; }` | Hover effect persisted — round 1 missed the actual property and selector. |
| 2 | `b039e51` | Added `box-shadow: none`, `:not(:focus-within)` scope, parent `.cm-editor:has(...)` selector with `!important` | Still failed — guesses without DevTools evidence. |
| 3 | `e8401a3` | DevTools confirmed source rule (Obsidian core `app.css`); override matches the source selector path | **PASS** — hover effect gone. |

**Root cause (round-3 finding):**

Obsidian core `app.css` paints hover on every CM6 embed block:

```css
@media (hover: hover) {
  .markdown-source-view.mod-cm6
    .cm-embed-block:not(.cm-table-widget, .cm-lang-base):hover {
    box-shadow: var(--embed-block-shadow-hover);
    border-radius: var(--radius-s);
    cursor: text;
  }
}
```

Our v1.3 widget mounts as `.cm-embed-block` (the standard CM6 block-widget mount path). Obsidian's exclusion list (`.cm-table-widget`, `.cm-lang-base`) does not cover us, so we fall in scope.

**Final rule** (lines ~1969-1995 of `styles.css`):

```css
@media (hover: hover) {
  .markdown-source-view.mod-cm6 .cm-embed-block:has(.lc-nested-editor):hover {
    box-shadow: none !important;
    border-radius: 0 !important;
    cursor: auto !important;
  }
}
.cm-editor .lc-nested-editor:hover:not(:focus-within),
.cm-editor .lc-nested-editor .leetcode-widget-codeblock:hover:not(:focus-within) {
  border: none !important;
  outline: none !important;
}
```

The override (a) matches the source selector path so specificity wins, (b) restricts via `:has(.lc-nested-editor)` so other CM6 embed blocks keep their hover behavior, and (c) keeps a defensive `border`/`outline` reset on the inner widget surface in case a theme adds those.

**Build:** `npm run build` clean.
**Deploy:** see commit log (final state in `e8401a3`).
**Visual check (human-confirmed):** hover the v1.3 widget — no box-shadow, no border-radius change, no cursor flicker. Focus ring + cursor marker unchanged when widget is focused.

**Lesson for SUMMARY.md:** Round 1+2 burned three commits guessing. The DevTools "Force element state → :hover" path produced the answer in seconds once the user found the right button. Document this as a Phase 22 learning.

## 22-02-03 Action Row Font

**Status:** PASS — confirmed in dev vault by user 2026-06-02.
**CSS rule added:** `.leetcode-code-actions, .leetcode-code-actions * { font-family: var(--font-text); }` — inserted after line 970 (after the `!important` cascade-override block at lines 961-970). Base-class specificity should win against `.cm-content`'s monospace cascade since `.cm-content` does not declare `font-family` with `!important`. If dev-vault check shows monospace still wins, add `!important` and document.
**Build:** `npm run build` clean.
**Deploy:** see commit log.
**Visual check (human-driven, dogfood):** open an LC note with widget mounted; inspect the action row chevron + buttons — confirm they render in the user's text font (not monospace). DevTools Computed `font-family` should show the resolved `var(--font-text)` value (e.g., -apple-system, BlinkMacSystemFont, Inter), not Menlo / Consolas / monospace.
**Acceptance:** PASS pending user dogfood confirmation.

## 22-02-04 Read-Mode Font-Size

**Status:** PASS — confirmed in dev vault by user 2026-06-02. Reading mode widget renders at 14px matching Live Preview; Live Preview unchanged.

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

## 22-02-06 Line-Number Gutter (D-polish-06)

**Status:** PASS — confirmed in dev vault by user 2026-06-02. Added during 22-01-B dogfood.

**Behavior verified:**
- Vim OFF → absolute numbering (1, 2, 3, ...).
- Vim ON → hybrid mode: current line shows absolute number; other lines show absolute distance from cursor.
- Hybrid mode tracks cursor movement via `j`/`k` / arrow keys — relative numbers update on every cursor-line crossing.
- Live vim toggle (Settings → Editor → Vim Mode) reconfigures both `vimCompartment` and `lineNumbersCompartment` atomically in the same transaction.

**Implementation trail (4 commits before convergence):**

| Commit | Approach | Outcome |
|--------|----------|---------|
| `8e66e59` | Standard `lineNumbers({ formatNumber })` + ViewPlugin with `view.requestMeasure()` on cursor-line crossing | FAIL — `requestMeasure()` doesn't invalidate the gutter cache; relative numbers stale until doc edit |
| `38dc730` | StateField holding cursor line; `formatNumber` reads via `state.field()` | FAIL — establishing a state-field dependency edge in `formatNumber` doesn't invalidate the gutter cache either |
| (intermediate) | `EditorView.updateListener` dispatching no-op `redrawEffect` on `selectionSet` via `queueMicrotask` | FAIL — additional dispatch loops still didn't trigger gutter rerender |
| `01e1a76` | Custom `gutter()` extension with `lineMarker` + explicit `lineMarkerChange(update) => update.selectionSet \|\| update.docChanged` | **PASS** — ported v1.2's pattern verbatim from `src/main/childEditorFactory.ts:createRelativeLineNumberGutter` (Phase 17 Plan 12 / LINENUM-01) |

**Root cause:** CM6's standard `lineNumbers({ formatNumber })` extension has no documented hook to force a refresh on selection change. Only the lower-level `gutter()` API exposes `lineMarkerChange`, which lets you explicitly mark `selectionSet` transactions as cache-invalidating.

**Phase 22 learning (for SUMMARY.md):** When implementing anything that v1.2 already solved, **read v1.2's implementation FIRST**. Three failed attempts before checking `childEditorFactory.ts`; the canonical answer was already in tree, in a file Plan 22-01 Task E will delete (the logic is correctly ported into the surviving v1.3 widget so the deletion is safe).

**Build:** `npm run build` clean.
**Tests:** `npm test -- WidgetController` — 14/14 pass after the final port.
**Deploy:** commit `01e1a76`.

## 22-02-05 Takeover Overlay Hidden (D-polish-05)

**Status:** PASS — confirmed in dev vault by user 2026-06-02. Added during 22-01-B dogfood when user observed the takeover CTA was redundant chrome.

**Finding:** Multi-pane takeover already happens implicitly via `multiPaneCoordinator`'s `active-leaf-change` listener — clicking into the peer pane promotes it to active in the same animation frame. The Phase 20 Plan 20-04 overlay (greyed surface + "Click to take over" CTA at lines 818-855 of `WidgetController.ts`) is redundant chrome.

**Fix:** CSS-only override on `.lc-nested-editor[data-pane-state="peer"] > .lc-takeover-overlay`:
- `display: none` — hides the overlay
- `pointer-events: none` — defensive; ensures clicks pass to the underlying CM6 instance even if browser were to render display:none differently in some edge case

The overlay element still mounts so its keyboard handler stays available as a defensive fallback for keyboard-only navigation.

**Build:** `npm run build` clean.
**Deploy:** commit `367622d`.
**Visual check (human-confirmed):** opening the same LC file in two panes shows identical visual treatment in both panes (no overlay, no CTA in the peer pane). Clicking into the peer pane promotes it to active without intermediate UI step.

**Note for 22-01-E:** Task E may delete the entire overlay mount path (lines 818-855 of `WidgetController.ts`) as part of the unwiring — verify whether the multi-pane peer-affordance code is reachable post-cutover or if it's vestigial Phase 20 infrastructure.

## 22-02-01 Vim-Tab Probe

**Status:** _Held for later execution. Will run after 22-01-B dogfood completes and 22-01 Task E lands. See orchestrator plan 22-02-PLAN.md._
