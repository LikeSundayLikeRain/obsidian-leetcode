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

## 22-02-08 Blank Line Between `## Code` and Fence (D-polish-08)

**Status:** PASS — confirmed in dev vault by user 2026-06-02. Added during 22-01-B dogfood.

**Regression caught:** `buildNoteBody` at `src/notes/NoteTemplate.ts:245` emitted `## Code\n${codeBlock}` (no blank line) since the v1.3 emitter rewrite (Phase 21 D-emit-01 introducing `codeBlockForV13`). Visually cramped in Reading mode; inconsistent with the trailing `## Notes\n\n` pattern on the same line; regression from pre-v1.3 template shape.

**Fix:** insert `\n\n` between `CODE_HEADING_LINE` and `codeBlock` in `buildNoteBody` — single-character semantic change, atomic commit `e163c04`.

**Why no automated test caught the regression:** the only `buildNoteBody` test (`tests/solve/noteTemplate-phase3.test.ts`) asserted on heading **order** via `indexOf`, never on exact whitespace. Other tests across the codebase used `## Code\n\n` in synthetic body fixtures (`tests/widget/codeBlockProcessor.phase21.test.ts`, `tests/widget/childParentSync.test.ts`, `tests/solve/submissionOrchestrator.test.ts`) but those were inputs for parsers/sync — they never validated `buildNoteBody`'s actual output. Internal inconsistency went unnoticed.

**Regression guard added:** new test in `noteTemplate-phase3.test.ts` pinning `'## Code\n\n```'` and `'## Code\n\n```leetcode-solve'` for both emitter branches. Future emitter rewrites can't silently regress the spacing.

**Scope of fix:** only affects NEW notes created after this commit. Existing notes keep their tight spacing because the migration infrastructure (`fenceMigrator.ts`) deliberately does not normalize whitespace (Phase 21 user-data preservation rule). User accepted this scope — no whitespace migration needed for existing notes.

**Tests:** `npm test -- noteTemplate-phase3` — 23/23 pass after fix + regression guard.

## 22-02-07 Clean Cursor by Vim Mode (D-polish-07)

**Status:** PASS — confirmed in dev vault by user 2026-06-02. Added during 22-01-B dogfood.

**Behavior verified:**
- Vim OFF → blinking pipe (CM6 default; no override applied).
- Vim Insert mode (`i`) → blinking pipe (OS-native caret restored).
- Vim Normal mode (`Esc`) → solid red fat block (no blink).
- Vim Visual mode (`v`) → solid red fat block at the moving end.

**Implementation trail (4 commits — vim's cursor architecture has 3 hidden layers):**

| Commit | Approach | Outcome |
|--------|----------|---------|
| `675d7e2` | `createVimModeClassExtension` ViewPlugin toggling `.lc-vim-active` + `.lc-vim-insert` classes; CSS three-state `display:none/block` rules | Wrong direction — only hid the wrong cursor; didn't address blink (Normal) or hidden caret (Insert) |
| `3fe5370` | Added `animation: none !important` on `.cm-vimCursorLayer` for Normal mode + `caret-color: auto` on `.cm-editor`/`.cm-content` for Insert | Normal mode FIX (block stopped blinking); Insert mode pipe still missing |
| `dc61ffa` | Broadened caret-color override to `.cm-scroller`, `.cm-content`, `.cm-line` levels; switched to `var(--text-normal, currentColor)` | DevTools confirmed `.cm-content` got the right caret-color but `.cm-line` still showed `rgba(0,0,0,0)` |
| `15599b1` | Added `.cm-content .cm-line` and `.cm-line *` to the override selectors with same `var(--text-normal)` value | **PASS** — cursor visible in Insert mode |

**Root cause (verified by reading `@replit/codemirror-vim/dist/index.js`):**

vim's cursor architecture has 3 layers we had to address independently:

1. **Vim's own theme rule** sets `caret-color: transparent !important` on `.cm-editor` so the OS-native caret is hidden in Normal/Visual mode (vim's own red `.cm-fat-cursor` div is the visible cursor).
2. **`.cm-vimCursorLayer` carries an animation-name** (`cm-blink` / `cm-blink2`) toggled per measure pass — that's the blink on the fat block.
3. **`.cm-line` inherits `caret-color: transparent`** through the cascade and our `.cm-content`-level override didn't reach it because CM6 generates `.cm-line` rules at higher specificity.

The fix needed all three:
- Disable blink: `animation: none !important` on `.cm-vimCursorLayer` in Normal mode.
- Restore caret in Insert mode: explicit `caret-color: var(--text-normal, currentColor) !important` on `.cm-editor`, `.cm-scroller`, `.cm-content`, `.cm-content .cm-line`, `.cm-line`, AND `.cm-line *` to ensure all selectors win against vim's transparent default.

**Files changed:** `src/widget/WidgetController.ts` (+ ~50 LOC for `createVimModeClassExtension` + `reconfigureVim` cleanup), `styles.css` (deleted v1.2's "force both layers visible" compromise rules, replaced with three-state per-mode rendering).

**Phase 22 learning (for SUMMARY.md):** Multi-layer compositions (vim + CM6) need DevTools-driven debugging of the actual cascade, not selector guessing. The trail compressed from "4 commits over 30 min" to "1 commit" once we ran `getComputedStyle().caretColor` on each cursor-relevant DOM level — that revealed `.cm-line` was the unwon level, fix was specific.

**v1.2 reference (for cleanup orientation):** The compromise this replaces lived in `styles.css` lines ~2071-2099 (Phase 17 gap-closure 17-11 + Phase 18 — both layers always visible because the v1.2 nested-editor mount couldn't reliably keep vim's measure-pass timing). The widget mount is more stable, so the simpler per-mode design is now correct.

**Build:** `npm run build` clean.
**Tests:** `npm test -- WidgetController` — 14/14 pass after each commit in the trail.
**Deploy:** final state in commit `15599b1`.

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

## 22-01-B Dogfood Note: Vim Toggle Requires Reload

**Status:** ACCEPTED as the v1.3 contract — confirmed by user 2026-06-02.

**Observation during dogfood:** Toggling vim ON/OFF in Obsidian Settings does not hot-reload the widget — the user must reload the app (Cmd-R or restart) for the new vim state to apply. The widget's `reconfigureVim` path works for plugin-driven dispatches, but the user-driven Settings-panel toggle does not propagate reliably through the existing `workspace.on('layout-change')` listener.

**Disposition:** Acceptable. Plan 22-03 documents the reload requirement in README "Known notes" section. Users hit the inconvenience once per vim toggle, which is a rare event.

**REQUIREMENTS.md update needed in Plan 22-03 (D-gate-08 / L7 amendment):**
- VIM-03 traceability marker changes from `"Resolved by Phase 20 live-reconfigure (no banner shipped)"` to `"Resolved by 'reload required' documentation. The Phase 20 reconfigureVim path works for plugin-driven dispatches but Settings-panel toggle requires app reload — accepted as v1.3 contract; banner explicitly NOT shipped per user decision 2026-06-02 during 22-01-B dogfood."`

**Escape hatch:** If BRAT alpha (Plan 22-03 D-gate-04, 7-day window) surfaces user complaints about the reload requirement, ship the VIM-03 banner as a 22.1 hotfix (~30 LOC: Notice from obsidian API hooked into SettingsTab onChange for the vim setting). Banner UX was designed in Phase 20 CONTEXT but never built because Phase 20 thought live-reconfigure was reliable.

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

**Status:** RESOLVED (no-repro) by user 2026-06-02 during 22-01-B dogfood.

**Original issue (Phase 20 UAT):** the Plan 20-10 hotfix Tab handler routes Tab through `insertTab` directly, allegedly bypassing vim's input pipeline so the CM5-style block-cursor marker lagged the actual caret by one indent in vim Insert mode.

**Empirical observation 2026-06-02:** the issue cannot be reproduced in the v1.3 widget after the polish chain shipped this session. Most likely contributors: the cursor cleanup (D-polish-07 — clean per-mode rendering, transparent caret restored, fat block / pipe / native caret each handled correctly) eliminated whatever measure-pass timing window made the marker visibly lag in v1.2. The Tab handler in `src/widget/WidgetController.ts:1071-1095` is unchanged from Phase 20-10 — the fix didn't come from touching the Tab path; it came from fixing the cursor rendering surrounding it.

**Disposition:**
- No code change for D-polish-01.
- ROADMAP §22 success criterion 7 is satisfied: the marker now tracks correctly in dev-vault dogfood. No README footnote needed; no GitHub issue needed.
- The 30-min probe in PLAN 22-02 task 22-02-01 is unnecessary — the no-repro observation supersedes the probe.
- The 22-02-01 task block in `22-02-PLAN.md` can stay as-is for the audit trail; just mark its `<done>` outcome as "supplanted by D-polish-07 — no probe required, no defer required."

**Closing the carry-over:** all 7 polish items in Plan 22-02 are resolved (6 shipped + 1 no-repro). Plan 22-02 is feature-complete — SUMMARY.md can be written once 22-01 closes its remaining sub-steps (C/D/E).

## 22-03-02 ESLint + innerHTML Scan

**Status:** PARTIAL PASS — 2026-06-03.

**innerHTML scan in `src/widget/` (the operative D-gate-02 concern):** PASS.

`grep -rn 'innerHTML' src/widget/` returned 7 hits across 4 files (`legacyFenceBanner.ts`, `conflictDiff.ts`, `codeBlockProcessor.ts`, `WidgetController.ts`). Every match is a comment line documenting the no-innerHTML rule (e.g., `// Pattern S-07 — no innerHTML`, `* helpers. NEVER assigns innerHTML.`, `// CLAUDE.md: NO innerHTML — use createEl with text option.`). **Zero active `.innerHTML =` assignments anywhere in `src/widget/`** — the plugin-store rejection guard is intact (Pitfall 13).

`grep` filter for active assignments (`grep -n 'innerHTML' src/widget/*.ts | grep -E '\.innerHTML\s*='`) returned nothing.

**`npm run lint` clean run:** FAIL — pre-existing baseline regression, not Phase 22 caused.

`npm run lint` reports `161 problems (81 errors, 80 warnings)`. Verified pre-existing by checking out commit `245f45b` (Plan 22-01 close, before any 22-03 work) and running `npm run lint` — output is identical. The baseline existed at Phase 22's entry. RESEARCH §7's "baseline already passing per Phase 21.1 close" claim was stale.

Categories of pre-existing errors (concentrated in `src/main.ts`, `src/widget/ConflictModal.ts`, `src/types/`, and `tests/widget/`):
- `obsidianmd/prefer-window-timers` (bare `setTimeout`/`clearTimeout`) — most numerous.
- `@typescript-eslint/no-unnecessary-type-assertion` — concentrated in `src/main.ts` (~9 sites) and `src/widget/ConflictModal.ts`.
- `@typescript-eslint/no-floating-promises`, `no-misused-promises` — single sites in `src/main.ts`.
- `obsidianmd/prefer-file-manager-trash-file` — warnings.
- `@typescript-eslint/no-empty-object-type`, `no-base-to-string`, `obsidianmd/hardcoded-config-path` — single sites.

**Scope-boundary application:** per the executor SCOPE BOUNDARY rule, fixing pre-existing errors in unrelated files is out of scope. The eslint baseline reset is logged in `deferred-items.md` with a recommended mini-phase scope (`Phase 22.5 — eslint baseline reset`, ~3 hours: `--fix` auto-corrections + ~26 hand-fixes + baseline gate wiring).

**Plugin-store re-review impact:** the reviewer's automated checks scope to runtime-observable concerns (innerHTML, eval, isDesktopOnly, no remote code, no telemetry). All of those are PASS. The `obsidianmd/prefer-window-timers` lint rule is a popout-window correctness suggestion; the `@typescript-eslint/*` rules are type-strictness hygiene. None are plugin-store auto-rejection criteria.

## 22-03-03 THEME-05 Manual Theme Regression Checklist

**Status:** PASS (spot-check) — confirmed in dev vault by user 2026-06-03 against the active Atom theme + the polish surface (hover, font, cursor, line numbers, read-mode size, takeover, blank line) that was stress-tested across the 22-01-B dogfood window.

**Procedure executed:** spot-check against the user's active Atom theme. Phase 22's framing is "deletion + checklist, no new architecture" — the polish surface that the cutover preserves was already visually validated across the 22-01-B and 22-03 deploy cycles. Real-world risk for theme regressions in a deletion-only milestone phase is low.

**Decision rationale:** rigorous 5-theme matrix (Minimal / Things / Catppuccin / Anuppuccin / Atom × 3 views = 30 screenshots + side-by-side diff) was framed in CONTEXT D-gate-03 as the gold-standard procedure but explicitly tagged "manual checklist is sufficient" for the success criterion. User chose spot-check — captures real-vault behavior on their daily theme; remaining 4 themes can be exercised passively during the 7-day BRAT window if desired.

**Polish surface validated** (all PASS in Atom):
- Hover border absent (D-polish-02)
- Action row text font (D-polish-03)
- Read-mode 14px matching Live Preview (D-polish-04)
- Takeover overlay invisible (D-polish-05)
- Line-number gutter, vim-aware hybrid (D-polish-06)
- Cursor mode-class rendering (Insert pipe / Normal block / vim-OFF default) (D-polish-07)
- Blank line between `## Code` and fence in fresh notes (D-polish-08)

**Build state at validation:** `1.3.0-beta.1` deployed at 2026-06-03 13:40, bundle 1,756,707 B (under HARD_LIMIT 1,800,000), full smoke test passed.

**Escape hatch:** if a P0/P1 theme regression surfaces during the BRAT 7-day window in any of the 4 unverified themes, fix and re-tag `1.3.0-beta.2` (window restarts).

**Acceptance:** PARTIAL PASS — the operative D-gate-02 concern (innerHTML in widget) passes; the broader eslint cleanup is deferred. Phase 22 ships under this disposition.
