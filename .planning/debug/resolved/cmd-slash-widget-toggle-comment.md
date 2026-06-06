---
slug: cmd-slash-widget-toggle-comment
status: resolved
trigger: "User reports: Cmd+/ does not work inside the v1.3 widget's embedded CM6 editor — it should toggle line comment for the active language but the keybinding is missing or being swallowed by Obsidian's parent `editor:toggle-comments` hotkey."
created: 2026-06-05
updated: 2026-06-05
related_milestone: v1.3
related_history: .planning/debug/resolved/cmd-slash-not-reaching-child.md (Phase 16 — earlier resolved fix in legacy childEditorFactory.ts via createCmdSlashScopeExtension; pre-widget architecture)
---

## Symptoms

**Expected behavior:**
With cursor inside the widget's embedded CM6 editor, pressing Cmd-/ (Mac) or Ctrl-/ (Win/Linux) toggles a line comment using the active language's syntax (`# ` for Python, `// ` for Java/JS/TS/C/C++/Go/Rust, etc.). Pressing again removes the prefix.

**Actual behavior:**
Cmd-/ does nothing visible inside the widget OR it inserts Obsidian's markdown block-comment `%% %%` into the parent note (replicating the original Phase 16 bug — symptom returned).

**Error messages:**
None reported.

**Timeline:**
This was previously fixed in Phase 16 via `createCmdSlashScopeExtension(app)` plumbed through `childEditorFactory.ts` → see `.planning/debug/cmd-slash-not-reaching-child.md` (resolved 2026-05-22).

The v1.3 inline-widget rewrite (Phase 22) replaced the legacy `nestedEditorExtension` + `childEditorFactory` pipeline with a new widget-owned CM6 editor mounted via `mountLeetCodeWidget` (per CLAUDE.md "v1.3 inline-widget architecture"). It is highly likely the Scope extension was NOT ported into the new widget mount path, OR was ported but the `app` reference wasn't threaded through, OR a different focus model breaks the Scope push/pop on focus/blur.

**Reproduction:**
1. Open any problem note in dev vault.
2. Click into the widget's code editor body.
3. Press Cmd-/ on Mac.
4. Observe: nothing happens, OR `%% %%` is inserted into the parent note.

## Hypotheses

### H1 — Scope extension never wired into v1.3 widget mount — CONFIRMED

The Phase 16 fix added `createCmdSlashScopeExtension(app)` as part of the child editor's extensions array in `childEditorFactory.ts`. The v1.3 widget rewrite created a new editor mount point in `src/widget/WidgetController.ts` (`buildExtensions` → `mountLeetCodeWidget`). The Phase 16 Scope extension was NOT carried over.

**Verdict:** CONFIRMED.

Evidence:
- `grep -rn "createCmdSlashScopeExtension\|cmdSlashScope\|pushScope\|popScope" src/` returns ZERO matches in v1.3 source.
- `grep -rn "Scope\|app.keymap" src/main.ts src/main/ src/widget/` returns only an unrelated comment in `python3Highlighter.ts:21`.
- Commit `2b3f0ac` (Phase 22-01) deleted `src/main/childEditorFactory.ts` (482 LOC) wholesale — that file contained `createCmdSlashScopeExtension` (lines 176-225 in the pre-deletion file). The implementation was never ported into the v1.3 widget tree.
- `src/main/childEditorLanguage.ts:146` still wires `keymap.of([{ key: 'Mod-/', run: toggleLineComment }])` inside the `languageCompartment`, AND `WidgetController.ts:1176` includes that compartment via `languageCompartment.of(buildLanguageExtensions(slug, indent))`. So the CM6-level binding is present — but as documented in the Phase 16 prior-art (see `.planning/debug/resolved/cmd-slash-not-reaching-child.md` H2 + verification) the CM6 keymap layer is bypassed by Obsidian's app-level Scope dispatcher. Without the matching app-level Scope override in the widget, `editor:toggle-comments` (the parent hotkey) wins.

### H2 — Scope wired but focus/blur listeners attach to wrong DOM element — N/A (subsumed by H1)

H1 confirmed; the listener is not wired at all. H2 is moot.

### H3 — Stale view ref / wrong view in Scope.register closure — N/A (subsumed by H1)

H1 confirmed; H3 is moot.

## Current Focus

hypothesis: "H1 — `createCmdSlashScopeExtension(app)` (Phase 16 fix in deleted childEditorFactory.ts) was never ported into the v1.3 widget. Without the app-level Scope intercept, Obsidian's `editor:toggle-comments` Scope dispatcher beats CM6's per-EditorView keymap."
test: "grep src/ for createCmdSlashScopeExtension / Scope / pushScope / popScope — zero matches in v1.3 sources; child language compartment still has Mod-/ keymap but that is the very layer the prior art proved insufficient."
expecting: "Port createCmdSlashScopeExtension into src/widget/cmdSlashScopeExtension.ts; thread plugin.app.keymap + plugin.app.scope through WidgetMountHost; include the extension in buildExtensions when readOnly === false."
next_action: "Implement port, build, test, deploy to dev vault, request user verification."
reasoning_checkpoint: ""
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-06-05
  finding: "No `createCmdSlashScopeExtension`, `cmdSlashScope`, `pushScope`, or `popScope` references anywhere in current `src/`."
  source: "grep -rn 'createCmdSlashScopeExtension\\|cmdSlashScope\\|pushScope\\|popScope' src/"
- timestamp: 2026-06-05
  finding: "Commit 2b3f0ac (Phase 22-01) deleted src/main/childEditorFactory.ts (482 LOC including createCmdSlashScopeExtension at lines 176-225). No replacement was added in src/widget/."
  source: "git log --all --oneline -S 'createCmdSlashScopeExtension' → 2b3f0ac chore(22-01): delete v1.2 source files"
- timestamp: 2026-06-05
  finding: "src/main/childEditorLanguage.ts:146 still wires keymap.of([{ key: 'Mod-/', run: toggleLineComment }]) inside languageCompartment; WidgetController.ts:1176 includes that compartment via buildLanguageExtensions. The CM6-layer binding is present but per Phase 16 prior art is upstream-of-CM6 dispatch; Obsidian's app-level Scope wins."
  source: "src/main/childEditorLanguage.ts:146; src/widget/WidgetController.ts:1176"
- timestamp: 2026-06-05
  finding: "Obsidian's Scope/Keymap API (Scope, App.scope, App.keymap.pushScope/popScope) confirmed available on App at obsidian.d.ts:417, 5360-5400, 3491-3515 (matching the Phase 16 implementation's call surface)."
  source: "node_modules/obsidian/obsidian.d.ts"
- timestamp: 2026-06-05
  finding: "WidgetMountHost.app already structurally types `vault` and `metadataCache`; missing `keymap` and `scope`. Existing pattern (e.g. WidgetController.ts:341-346, getConfig) uses `unknown` cast for undocumented or absent-on-structural-type members. Same workaround applies for keymap/scope."
  source: "src/widget/WidgetController.ts:98-144"
- timestamp: 2026-06-05
  finding: "main.ts threads `app: this.app` into every plugin host construction (lines 469, 576, 580, 1616, 1889, 3428, 3927) — the real `App` instance (with .keymap and .scope) is already in the host shape at runtime."
  source: "src/main.ts (multiple sites)"
- timestamp: 2026-06-05
  finding: "Implemented fix: created src/widget/cmdSlashScopeExtension.ts (createCmdSlashScopeExtension(app)), extended WidgetMountHost.app with optional keymap + scope structural fields, wired the extension into buildExtensions (editable mounts only). Build clean (tsc -noEmit -skipLibCheck && esbuild production: PASS). Lint: 0 errors, 9 pre-existing warnings unrelated to this change. Full widget+main test suite: 1474 passed, 4 skipped, 0 failed. New regression test tests/widget/cmdSlashScopeExtension.test.ts: 12/12 passing (covers null-app no-op, focus→pushScope, blur→popScope, Mod-/ handler returns false, non-Mod returns true, double-focus dedupe, destroy detaches listeners, destroy pops still-active scope, mount-then-focus-race initial activeElement path)."
  source: "Build, lint, test commands; new file at src/widget/cmdSlashScopeExtension.ts"
- timestamp: 2026-06-05
  finding: "Deployed main.js to ~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/main.js — ready for user reproduction verification."
  source: "cp src/widget/... → vault path; ls -la confirms 19:10 timestamp."

## Eliminated

- H2 (focus/blur attaches to wrong DOM): subsumed — extension never wired.
- H3 (stale view ref): subsumed — extension never wired.

## Resolution

root_cause: "Phase 16's `createCmdSlashScopeExtension(app)` (the Obsidian-Scope-based Mod-/ intercept that ships with `app.keymap.pushScope` on contentDOM focus and pops on blur) was deleted alongside `src/main/childEditorFactory.ts` in Phase 22-01 (commit 2b3f0ac) and never ported into the v1.3 widget mount pipeline. CM6's keymap.of(Mod-/ → toggleLineComment) inside `languageCompartment` is still wired but is downstream of Obsidian's app-level Scope dispatcher; without the parallel Scope override registered while the widget is focused, Obsidian's `editor:toggle-comments` global hotkey runs first against the parent MarkdownView's stale selection (sitting in ## Notes after the parent transactionFilter snapped it out of the fence range), producing `%% %%` in the parent note body."

fix: |
  Ported the Phase 16 Scope intercept into the v1.3 widget tree.

  1. New module `src/widget/cmdSlashScopeExtension.ts`:
     - Exports `createCmdSlashScopeExtension(app)` returning a CM6 ViewPlugin Extension.
     - On `view.contentDOM` focus: constructs `new Scope(app.scope)`, registers
       `'Mod' + '/'` → `toggleLineComment(view); return false`, and pushes via
       `app.keymap.pushScope(scope)`.
     - On blur: pops the same scope handle.
     - On ViewPlugin destroy: detaches focus/blur listeners and pops any
       still-active scope (defensive teardown for focus-while-destroyed edge).
     - If `activeDocument.activeElement === view.contentDOM` at construction
       time, runs the focus path immediately (parking-lot adoption /
       mount-then-focus race coverage — important because the v1.3 widget's
       parking-lot lifecycle reparents containers without firing fresh
       focus events).
     - Returns `[]` when `app` is null/undefined so test fixtures and
       read-only mounts that lack a real App instance skip cleanly.

  2. Extended `WidgetMountHost.app` (in `src/widget/WidgetController.ts`)
     with optional structural `keymap?: { pushScope; popScope }` and
     `scope?: unknown` fields. Production `LeetCodePlugin.this.app`
     satisfies these via the real Obsidian App; tests can omit them.

  3. Wired the extension into `buildExtensions` (editable mounts only) by
     spreading `createCmdSlashScopeExtension(...)` immediately after the
     visual extensions block. The factory call gates on the presence of
     `plugin.app.keymap && plugin.app.scope` so missing fields produce a
     clean no-op rather than a throw.

  4. Regression test `tests/widget/cmdSlashScopeExtension.test.ts` (12
     specs) covers null-app shortcut, focus→pushScope, Mod-/ handler
     toggles + returns false, non-Mod passthrough, double-focus dedupe,
     blur→popScope, focus→blur→focus fresh-scope per cycle, destroy
     detaches listeners, destroy pops still-active scope, mount-then-
     focus-race initial activeElement path.

verification: |
  Build (tsc -noEmit -skipLibCheck && esbuild production): PASS.
  Lint (npm run lint): 0 errors (9 pre-existing no-console warnings
    in main.ts unrelated to this change).
  Full widget+main test suite (npx vitest run tests/widget/ tests/main/):
    1474 passed | 4 skipped | 0 failed.
  New regression test (tests/widget/cmdSlashScopeExtension.test.ts):
    12/12 passing.
  Deployed main.js (1.8 MB; bundle includes the new extension) to
    ~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/main.js
    for user reproduction.

  Awaiting user manual verification per Reproduction section: open a
  problem note, click into the widget code area, press Cmd-/, expect
  the active language's line-comment prefix to be inserted/removed
  (and NO `%% %%` in the parent note body).

files_changed:
  - src/widget/cmdSlashScopeExtension.ts (new file, 158 LOC)
  - src/widget/WidgetController.ts (WidgetMountHost.app extended with
    keymap/scope; buildExtensions editable-path includes the new ext)
  - tests/widget/cmdSlashScopeExtension.test.ts (new file, 12 specs)
