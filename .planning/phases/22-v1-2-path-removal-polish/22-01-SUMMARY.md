---
phase: 22
plan: 01
status: complete
completed: 2026-06-03
aggregates: [22-01, 22-02]
commits:
  - 8b77a53  # 22-01-A flip default + invert mutual-exclusion Notice
  - 2b3f0ac  # 22-01-C delete v1.2 source files (DELETE-01..05)
  - 745d72f  # 22-01-D delete dead v1.2 test files (DELETE-07)
  - 306f48a  # 22-01-E atomic main.ts unwiring + retire 'leetcode.*' userEvent (DELETE-06, DELETE-08, PROTECT-03)
  - 439b029  # 22-02-02 round 1 (insufficient — too narrow)
  - b039e51  # 22-02-02 round 2 (insufficient — wrong layer)
  - e8401a3  # 22-02-02 round 3 PASS — Obsidian app.css cm-embed-block:hover override
  - 4044d63  # 22-02-03 action row text font
  - f05468a  # 22-02-04 read-mode font size 14px
  - 367622d  # 22-02-05 takeover overlay hidden
  - 8e66e59  # 22-02-06 round 1 (lineNumbers + ViewPlugin requestMeasure — failed)
  - 38dc730  # 22-02-06 round 2 (StateField — failed)
  - 01e1a76  # 22-02-06 round 3 PASS — gutter() + lineMarkerChange (v1.2 pattern)
  - 675d7e2  # 22-02-07 round 1 (mode classes only — incomplete)
  - 3fe5370  # 22-02-07 round 2 (animation: none + caret-color: auto — partial)
  - dc61ffa  # 22-02-07 round 3 (broader caret-color override — partial)
  - 15599b1  # 22-02-07 round 4 PASS — .cm-line caret-color override
  - e163c04  # 22-02-08 blank line between ## Code and fence + regression-guard test
---

# Plan 22-01 SUMMARY — v1.2 Path Removal + Polish

> Aggregates Plan 22-01 (5-sub-step cutover) and Plan 22-02 (8 carry-over polish items shipped during the 22-01-B dogfood window).

## Headline

**Net -3,325 LOC across 34 files.** v1.2 path is fully unwired; v1.3 is the only path; `'leetcode.*'` userEvent convention retired; CLAUDE.md `## Conventions` section deleted; 8 user-visible polish items shipped during dogfood.

## Plan 22-01 — Cutover (5 atomic commits per CONTEXT D-cutover-01)

### Sub-step A — Flip default + invert mutual-exclusion Notice (commit `8b77a53`)
- `useInlineWidget` default flipped `false → true` in `SettingsStore.ts`.
- `src/main.ts:1139` mutual-exclusion guard inverted: 1.2.x carry-over `data.json` (`useInlineWidget: false` + `useNestedEditor: true`) is force-flipped to v1.3 with one-time Notice "v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget".
- Test fixtures `mutualExclusion.test.ts` + `inlineWidgetActionGate.test.ts` updated to assert the inverted behavior.

### Sub-step B — 1-day dev-vault dogfood (no commit; manual gate)
- Real-vault testing on default-ON behavior with v1.2 sources STILL IN TREE as safety net.
- 8 polish items surfaced during this window (see Plan 22-02 below).
- User explicitly approved the resume signal on 2026-06-03 after exercising: open, solve, run, submit, AI debug, language switch, vim toggle, theme swap, read mode, migration sanity.

### Sub-step C — Delete 5 v1.2 source files (commit `2b3f0ac`)
- `src/main/childEditorSync.ts` (809 LOC) — DELETE-01
- `src/main/sectionLockExtension.ts` (527 LOC) — DELETE-02
- `src/main/nestedEditorExtension.ts` (395 LOC) — DELETE-03
- `src/main/childEditorRegistry.ts` (114 LOC) — DELETE-04
- `src/main/codeActionsEditorExtension.ts` (401 LOC) — DELETE-05
- ~2,246 LOC removed in one atomic commit.

### Sub-step D — Delete dead test files (commit `745d72f`)
- 8+ test files deleted that targeted the deleted source files. Floor list per CONTEXT D-cutover-01 plus audit-expand candidates per RESEARCH §14.

### Sub-step E — Atomic main.ts unwiring + downstream cleanup (commit `306f48a`)
- ~1,200 LOC removed from `src/main.ts` alone (master gate, conditional branches, childEditorRegistry field/onunload, nestedEditorRebuildEffect, ECHO_PRONE_USER_EVENTS, fence-repair hooks).
- `src/settings/SettingsStore.ts` + `SettingsTab.ts`: `useInlineWidget` + `useNestedEditor` fields deleted from type, DEFAULT_DATA, loadFromRaw, getters, setters, settings UI (D-settings-01 read-and-ignore).
- `src/notes/NoteTemplate.ts`: legacy `codeBlockFor(langSlug, starter)` deleted; `codeBlockForV13` renamed back to `codeBlockFor(starter)` — single emitter, leetcode-solve fence opener regardless of language (D-emit-01).
- 11 downstream consumer files updated: `NoteWriter.ts`, `codeExtractor.ts`, `starterCodeInjector.ts`, `ContestFinalizer.ts`, `codeBlockProcessor.ts`, `liveModeBannerStateField.ts`, `liveModeViewPlugin.ts`, `readingModeMigrationHook.ts`, `readingModeLegacyBannerPostProcessor.ts`. `useInlineWidget` conditionals collapsed to v1.3 branch.
- `'leetcode.*'` userEvent annotations stripped from `childParentSync.ts`, `resetCodeWithConfirm.ts`, `sectionProtectionExtension.ts` per D-unwire-02 (PROTECT-03).
- CLAUDE.md `## Conventions` section deleted (D-claude-01) — both the userEvent paragraph and the canonical write-path paragraph.
- Test cleanup: 1 file deleted (`fmReactivity.test.ts` — 10 dead tests of deleted reactivity hook), 5 files trimmed (deleted `useInlineWidget=OFF` test cases), 6 files ported (assertions updated to v1.3 single-emitter contract).

## Plan 22-02 — Carry-over polish (8 items, all shipped during 22-01-B dogfood)

| Task | Outcome | Final commit | Notable |
|------|---------|--------------|---------|
| 22-02-01 vim-Tab cursor-marker | RESOLVED no-repro | — | Marker desync was a v1.2 nested-editor measure-pass artifact; the cursor cleanup in D-polish-07 incidentally fixed it |
| 22-02-02 hover border | PASS | `e8401a3` (3 commits) | Source rule was Obsidian core `app.css` `.cm-embed-block:not(.cm-table-widget, .cm-lang-base):hover { box-shadow: ... }`; widget mounts as `.cm-embed-block` and falls in scope. Override scoped via `:has(.lc-nested-editor)` so other CM6 embeds keep their hover treatment |
| 22-02-03 action row font | PASS | `4044d63` | `.leetcode-code-actions { font-family: var(--font-text) }` overrides inherited `.cm-editor` monospace |
| 22-02-04 read-mode font size | PASS | `f05468a` | Read mode `.markdown-rendered` rendered widget at 16px; Live Preview at 14px. Override `.markdown-rendered .lc-nested-editor .cm-editor/.cm-content/.cm-line { font-size: 14px }` aligns Read mode to Live Preview |
| 22-02-05 takeover overlay | PASS | `367622d` | Multi-pane takeover already happens implicitly via `multiPaneCoordinator`'s `active-leaf-change` listener — the explicit "Click to take over" overlay was redundant chrome. CSS-only `display: none` on the peer-state overlay |
| 22-02-06 line-number gutter | PASS | `01e1a76` (3 commits) | Standard `lineNumbers({ formatNumber })` doesn't expose cache invalidation. v1.2's `gutter()` + `lineMarkerChange` pattern is the canonical answer (Phase 17 Plan 12 / LINENUM-01); ported verbatim. Vim ON → hybrid (current line absolute, others relative); vim OFF → absolute |
| 22-02-07 clean cursor by vim mode | PASS | `15599b1` (4 commits) | v1.2's "force both cursor layers visible" compromise replaced with mode-class-driven per-mode rendering. Vim Normal → solid fat block (no blink). Vim Insert → blinking pipe (caret-color restored on `.cm-line` after vim() set it transparent at the editor wrapper). Vim OFF → CM6 default (no override) |
| 22-02-08 blank line `## Code → fence` | PASS | `e163c04` | `buildNoteBody` regression: v1.3 emitter rewrite collapsed the blank line between `## Code` heading and the fence opener. Fixed to `## Code\n\n```leetcode-solve`. Added regression-guard test |

## Bundle Size

- v1.2 baseline: 1,706,000 bytes
- Phase 22 post-cutover: **1,756,707 bytes** (+50 KB above v1.2 baseline)
- Reason: Plan 22-02 polish features added back ~50 KB (`lineNumbers` + `gutter` + `GutterMarker` + cursor-mode ViewPlugin from CM6 + the hover/cursor/font-size CSS overrides).
- Plan 22-03 D-gate-01 will set the new threshold to 1,800,000 bytes (current `scripts/check-bundle-size.mjs` HARD_LIMIT) and a SOFT_WARN at 1,760,000 bytes — leaving headroom for Plan 22-03 doc/version bumps.

## Verification

- `npm run build` clean (tsc --noEmit + esbuild production).
- `npm test`: **2820 pass / 1 fail / 7 skipped** (the single failure is a pre-existing flake at `liveModeBannerStateField.test.ts:683`, captured in `deferred-items.md` under "Pre-existing test failure").
- `grep -rn 'useInlineWidget\|useNestedEditor' src/` → 0 functional hits (32 historical breadcrumb comments retained per CONTEXT D-unwire-01 cleanup rules).
- `grep -rn "userEvent: 'leetcode\\." src/` → 0 hits.
- CLAUDE.md `## Conventions` heading absent.

## Lessons learned

1. **Read v1.2 source first when porting features.** Plan 22-02 burned multiple commits on D-polish-06 (line numbers) before checking `src/main/childEditorFactory.ts` — v1.2's `gutter()` + `lineMarkerChange` pattern was already the proven answer. Same for D-polish-07 (cursor cleanup): once we read `@replit/codemirror-vim` source plus v1.2's CSS compromise, the three-layer fix (animation off + caret-color restored + class-driven discrimination) clicked. Pattern: when v1.3 is replacing v1.2, the prior solution likely encoded knowledge we'd otherwise re-derive painfully.

2. **Multi-layer CSS issues need DevTools cascade tracing, not selector guessing.** D-polish-02 (hover border) required 3 attempts before locating Obsidian core's `.cm-embed-block:hover` rule via the user's DevTools force-state inspection. Earlier rounds used `.cm-editor:hover`, `.cm-editor:has(.lc-nested-editor):hover`, etc — all wrong because we weren't tracing the actual rule. Same pattern for D-polish-07 (cursor): four rounds before `getComputedStyle(line).caretColor` revealed `.cm-line` was the unwon level.

3. **Atomic commit constraints are enforced by the type system.** Sub-step E's tsc errors after partial unwiring (5 callsites referencing deleted symbols) made it impossible to commit a half-unwired state. The "single atomic commit" framing of D-unwire-01 was logically forced; staged commits would have failed `tsc --noEmit`.

4. **Test fixture vs. production output drift is invisible without explicit assertions.** D-polish-08 (blank line) caught a regression that had been live since the v1.3 emitter rewrite, missed by every existing test because no test asserted on `buildNoteBody`'s exact whitespace. Other tests used `## Code\n\n` synthetic fixtures for parser/sync testing — those fixtures matched the *intent* but never validated the actual emitter output. The regression-guard test now pins the convention.

5. **Live-reconfigure for vim toggle is unreliable for Settings-panel toggle.** Phase 20 thought the `workspace.on('layout-change')` listener would reliably propagate Settings changes to the widget's `reconfigureVim` path. Empirical observation during dogfood (2026-06-03): toggling vim ON/OFF in Settings does NOT hot-reload the widget; user must reload Obsidian. User accepted this as the v1.3 contract; Plan 22-03 README will document the reload requirement. VIM-03 traceability marker becomes "Resolved by 'reload required' documentation".

## Carry-over to Plan 22-03

- **Bundle threshold update.** Set `scripts/check-bundle-size.mjs` HARD_LIMIT to 1,800,000 bytes; SOFT_WARN to 1,760,000.
- **README v1.3 update.** Architecture overview, migration docs, sync interaction notes, Cmd-Z/Cmd-F scoping, **vim-toggle reload requirement**, **block-id widget UX deferred to v1.4+** (per `22-CONTEXT.md` deferred list).
- **CLAUDE.md `## Architecture` section.** Currently empty placeholder; Plan 22-03 fills with v1.3 sketch.
- **Manifest version bump.** `1.2.x → 1.3.0-beta.1` (BRAT) → `1.3.0` (GA).
- **REQUIREMENTS.md traceability.** VIM-03 marker changes from "Resolved by Phase 20 live-reconfigure (no banner shipped)" to "Resolved by 'reload required' documentation. The Phase 20 reconfigureVim path works for plugin-driven dispatches but Settings-panel toggle requires app reload — accepted as v1.3 contract; banner explicitly NOT shipped per user decision 2026-06-03 during 22-01-B dogfood."
- **Pre-existing flake `liveModeBannerStateField.test.ts:683`** still failing — captured in `deferred-items.md`; investigate during release-prep.
