---
phase: 18-vim-recovery-polish
status: discussed
source: backlog promotion 2026-05-24 (999.2/999.3/999.4 → v1.2 ship gate)
upstream_uat: .planning/phases/17-polish-edge-cases/17-UAT.md (Tests 17, 23, 24)
upstream_backlog:
  - 999.2 (vim focus routing — child editor steals navigation keys)
  - 999.3 (fence auto-recovery bypassed by vim + stale child render after reload)
  - 999.4 (relative line numbers in child editor)
locked_decisions:
  - "D-30: Fix scope is v1.2 ship gate. All three sub-plans MUST land before v1.2 release."
  - "D-31: 18-04 (manual ship-readiness pass) replaces 17-06's deferred portions. Heap-snapshot UAT + bundle audit doc are re-run on the FINAL v1.2 build that includes Phase 18 fixes."
  - "D-32: Vim focus routing fix mirrors createCmdSlashScopeExtension pattern at src/main/childEditorFactory.ts:165-170 (Obsidian Scope on app.keymap, push on focus, pop on blur). NOT a DOM-level keydown listener — Obsidian's app-level vim handler is in the Scope-managed pipeline, so a Scope-based intercept is the only path that reliably wins."
  - "D-33: vault.on('modify') listener for 18-02 fires repairFenceStructure ONLY when the modified file matches an active LC problem note (lc-slug frontmatter present). Idempotency guard from 17-13 is preserved verbatim."
  - "D-34: Stale-child invalidation fires when child's tracked language slug disagrees with parent fence opener tag AND with lc-language frontmatter. The check runs at child mount AND on metadataCache.changed. Mismatched state forces a child rebuild (registry.delete + re-create on next visible-frame)."
  - "D-35: Relative line numbers setting is plugin-owned. NOT a wrapper around any third-party plugin's setting. Default OFF. Read once at child mount per D-18 / Plan 17-12 — toggling requires note remount."
---

# Phase 18 Context — Vim, Recovery & Polish + Ship Close

## Phase Goal

Promote three backlog items from v1.3 deferral into the v1.2 ship gate, plus close the deferred ship-readiness work from 17-06. Each sub-plan addresses a distinct UAT-surfaced gap; the four together close the v1.2 release readiness checklist.

## Sub-Plan Scope

### 18-01 — Vim focus routing (from 999.2 / Test 17 — VIM-01)

**Bug shape (verified live 2026-05-24):**
- User has Obsidian's global vim mode ON.
- User clicks into the child editor inside the `## Code` fence.
- Status panel shows `--NORMAL--`. Press `i` → status panel shows `--INSERT--` (child's vim correctly transitioned).
- Press `j` → cursor moves DOWN in the **parent** editor (visible via parent's relative line number gutter). Press `dd` → deletes a line in the **parent doc**, not the child.
- Press `i` or `a` → focus re-engages the child, status panel updates, typing works again.
- Intermittent — not every keystroke leaks.
- DevTools probe: `document.activeElement` IS inside `.lc-nested-editor` (inChild: true) when the leak happens. Focus is correct, keystrokes still route to parent's vim.

**Hypothesis (high confidence):** Obsidian's global vim mode is wired into Obsidian's `Scope` keymap manager at app priority. The parent CM6 view's vim() extension and the child CM6 view's vim() extension are BOTH registered, but Obsidian's app-level Scope handler intercepts before either CM6 view's local keymap. Result: vim navigation keys (j/k/dd/o) route to whichever CM6 view Obsidian's app-level handler thinks is "active" (likely the most recently focused MarkdownView root, not the nested child). The status panel update is local to child's vim panel — independent of which vim instance handled the key.

**Fix path:** Mirror the `createCmdSlashScopeExtension` pattern from `src/main/childEditorFactory.ts:165-170`. When the child editor gains focus, push an Obsidian `Scope` onto `app.keymap` that intercepts vim navigation/edit keys (h/j/k/l/d/y/p/o/i/a/x/w/b/e/u/Ctrl-r/Esc/etc.) and routes them to the child's vim instance via the appropriate CodeMirror command. When the child editor blurs, pop the Scope.

**Bonus enhancement:** Add `:set nu` / `:set nonu` aliases (currently rejected by `@replit/codemirror-vim` — full `:set number` works). Implementation: register `Vim.defineEx('set', 'se', handler)` extension in childEditorVimScope.ts.

**Files:**
- `src/main/childEditorFactory.ts` (new module wired in next to createCmdSlashScopeExtension; ONE-line addition)
- `src/main/childEditorVimScope.ts` (NEW — owns the Scope-based intercept logic, mirrors createCmdSlashScopeExtension shape)
- `tests/main/childEditorVimScope.test.ts` (NEW — source-level + behavioral assertions)

### 18-02 — Fence recovery on non-CM6 edits + stale-child invalidation (from 999.3 / Test 23 — REPAIR-02)

**Bug 1 — vim `dd` bypasses parent repair listener:**
- Plan 17-13's `createParentRepairExtension` is a CM6 `EditorView.updateListener` — it only fires on CM6 transactions.
- When the user deletes the closer line via vim's `dd` (Normal mode), Obsidian's app-level vim handler edits the doc directly via Obsidian's commands, NOT via CM6 dispatch.
- Result: `repairFenceStructure` never observes the change. Closer stays missing until manual repair or reload.

**Bug 2 — Stale child render after reload on broken-fence note:**
- After app reload on a broken-fence note where parent doc + lc-language frontmatter both say Java, the child editor renders Python content (`class Solution:` + `def canMeasureWater(self, x: int, y: int, target: int) -> bool:`).
- Hypothesis: stale chevron/registry state cached in `data.json` OR in-memory child registry has a stale slug from a prior chevron switch that didn't go through `switchFenceLanguage`'s lc-language frontmatter update (likely interaction with 999.2 — vim's writes flipping things outside CM6).

**Fix path:**
- **Bug 1:** Add `vault.on('modify', file)` listener registered at plugin onload. When the modified file has `lc-slug` frontmatter (i.e., is an active LC problem note), trigger `repairFenceStructure` against the active MarkdownView's CM6 state. Idempotency guard from 17-13 already in place. Guard: ensure the parent CM6 view's state has actually been re-synced from disk (Obsidian's vault.modify → file → CM6 update is normally synchronous but verify under vim's edit path).
- **Bug 2:** At child mount, compare child's tracked slug (from childLanguageTracker WeakMap, Plan 17-09) against `lc-language` frontmatter AND active fence opener tag. If they disagree, force a registry invalidation (delete + recreate on next visible-frame) so the child re-mounts with the correct language. Same check on `metadataCache.changed` for the active note.

**Files:**
- `src/main/childEditorSync.ts` (extend `createParentRepairExtension` callsite to also register a `vault.on('modify')` listener)
- `src/main.ts` or `src/main/childEditorRegistry.ts` (slug-mismatch invalidation at child mount + on metadataCache.changed)
- `tests/main/childEditorSync.repair.test.ts` (extend with non-CM6 modify path; new test for stale-child invalidation)
- `.planning/debug/fence-auto-recovery-regression-round2.md` (append round-3 finding)

### 18-03 — Relative line numbers in child editor (from 999.4 / Test 24 stretch)

**Goal:** Add a plugin-owned settings option to render the child editor's gutter as relative line numbers (offset from cursor) instead of absolute. Independent of any third-party Obsidian plugin.

**Design:**
- Settings field: `showRelativeLineNumbers: boolean` (default `false`)
- Settings tab UI: new `Setting` block under the existing line-number section with label "Show relative line numbers in code editor" and a toggle.
- When ON, replace the existing `lineNumbers()` (Plan 17-12 LINENUM-01) with `lineNumbers({ formatNumber: (n, state) => relativeFormatter(n, state) })` where `relativeFormatter` returns:
  - The current line number when on the cursor's line
  - The absolute distance from cursor for other lines
- Read-once-at-mount semantic (matches D-18 / Plan 17-12 — toggle requires note remount or Cmd-E flip).

**Vim interaction:** When BOTH `showLineNumber` AND `showRelativeLineNumbers` are ON in vim mode, the gutter renders relative numbers and `:set nu`/`:set rnu` toggles still work (vim's runtime toggle of the gutter's display).

**Files:**
- `src/main/childEditorFactory.ts` (lineNumbers config — runs after 18-01 to avoid merge conflict; both touch this file)
- `src/settings/SettingsStore.ts` (new boolean field + getter)
- `src/main.ts` (settings tab — new Setting block)
- `tests/main/childEditorFactory.test.ts` (extend with showRelativeLineNumbers ON/OFF source-level assertions + format function unit test)

### 18-04 — v1.2 Ship-Readiness Close (from deferred 17-06)

**Manual / human-driven; no source changes.**

Three deliverables, all run on the FINAL v1.2 build that includes Phase 18 fixes:

1. **17-UAT.md regression spot-checks** — re-run a curated subset (Tests 1, 9, 10, 12, 13, 14, 17, 18, 19, 23, 24) on the final build to confirm no regressions from Phase 18 work.
2. **17-BUNDLE-AUDIT.md** — capture final `main.js` raw + gzipped sizes, esbuild metafile contributor breakdown (top 10 modules by bytes), hard-gate verdict against the 1.8 MB ceiling. Note: Phase 18 may have added bundle weight for the Scope-based vim intercept and the relative-line-numbers formatter; needs verification.
3. **17-LIFE-SNAPSHOT.md** — heap-snapshot UAT per CONTEXT D-23 arm b. Open + close a problem note 5 times; take heap snapshot in Chrome DevTools (Memory tab → Heap snapshot → Take snapshot). Verify retained `EditorView` instances drop to zero after each close. Verdict: pass / fail / leak detected.

**Files:**
- `.planning/phases/17-polish-edge-cases/17-UAT.md`
- `.planning/phases/17-polish-edge-cases/17-BUNDLE-AUDIT.md` (NEW)
- `.planning/phases/17-polish-edge-cases/17-LIFE-SNAPSHOT.md` (NEW)

## Cross-Plan Invariants (must remain TRUE after Phase 18)

1. All Phase 17 invariants preserved: section lock, sync annotations, child-sync userEvent, ECHO_PRONE_USER_EVENTS set, focus-retention behavior on Run/Submit buttons, customTabCommand priority chain, Plan 17-13's parent-side updateListener-based repair, Plan 17-09's per-child language tracker, Plan 17-10's semantic class layer.
2. CLAUDE.md Conventions section unchanged — no new userEvent strings introduced, `'leetcode.reset.child'` NOT added to ECHO_PRONE_USER_EVENTS, `'leetcode.fence-repair'` STAYS in ECHO_PRONE_USER_EVENTS.
3. Bundle stays under the 1.8 MB ceiling (CONTEXT D-19). Phase 18 likely adds < 5 KB minified.
4. No new build-time dependencies (the `@replit/codemirror-vim` package already shipped in Phase 17; we only USE its public API in 18-01).
5. Settings additions in 18-03 follow the existing SettingsStore pattern (default value at parse time, no migration logic since this is a new field).
6. Tests pass at every wave merge: Wave 1 leaves 1713+ green; Wave 2 leaves 1713+ green; Wave 3 (18-04) is doc-only.

## Wave Structure

- **Wave 1:** 18-01 + 18-02 in parallel (file-disjoint).
- **Wave 2:** 18-03 (touches childEditorFactory.ts which 18-01 will have changed).
- **Wave 3:** 18-04 (manual ship-close pass after all source work merged).

## What's NOT in Scope

- Visual theme parity (999.1 — Opinionated One Dark Pro palette) — stays in v1.3 backlog.
- Full LSP integration / IntelliSense — out of scope for v1.2.
- Mobile compatibility — v1.2 stays desktop-only.
- Plugin store re-submission — handled in a separate post-Phase-18 release phase.
