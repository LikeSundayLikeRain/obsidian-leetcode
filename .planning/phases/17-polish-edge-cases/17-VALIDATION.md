---
phase: 17
slug: polish-edge-cases
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `17-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (verified in package.json) |
| **Config file** | `vitest.config.ts` (project standard) |
| **Quick run command** | `npm test -- tests/main/<file>.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 sec full suite; ~5 sec per file |
| **Mock pattern** | `vi.mock('obsidian', ...)` per file (existing convention — see `tests/main/childEditorSync.test.ts:12-15`) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- tests/main/<touched-file>.test.ts` (~5 sec)
- **After every plan wave:** Run `npm test` + `npm run lint` + `npm run build`
- **Before `/gsd:verify-work`:** Full suite green AND `npm run check:bundle-size` passes AND manual UAT scripts in `17-UAT.md` checked off
- **Max feedback latency:** 30 seconds (full suite)

---

## Per-Task Verification Map

| Item | Plan Wave | Decision Ref | Behavior | Test Type | Automated Command | File Exists | Status |
|------|-----------|--------------|----------|-----------|-------------------|-------------|--------|
| Reset undo (child dispatch) | Wave 1 | D-03 | Cmd-Z restores prior body; `## Notes` untouched | unit | `npm test -- tests/main/resetCommand.childDispatch.test.ts` | ❌ Wave 1 (NEW) | ⬜ pending |
| Reset undo (userEvent) | Wave 1 | D-03 | Reset dispatches `userEvent: 'leetcode.reset.child'` on child | unit | same as above | ❌ Wave 1 (NEW) | ⬜ pending |
| Reset fallback (no child) | Wave 1 | D-04 | No-child path uses `vault.process(...)` | unit | `npm test -- tests/main/resetCommand.test.ts` (extend existing) | ✅ existing | ⬜ pending |
| Fence repair regression | Wave 1 | D-06b/D-06d | Damaged-closer reproduction + post-repair invariant | unit | `npm test -- tests/main/childEditorSync.repair.test.ts` | ❌ Wave 1 (NEW) | ⬜ pending |
| Tab mid-line | Wave 1 | D-11 | Mid-line Tab inserts char; line-start Tab indents; multi-line selection indents | unit | `npm test -- tests/main/tabMidLine.test.ts` | ❌ Wave 1 (NEW) | ⬜ pending |
| Tab single-undo invariant | Wave 1 | D-12 | Multi-line indent is one history entry | unit | same as above | ❌ Wave 1 (NEW) | ⬜ pending |
| fm reactivity dispatch | Wave 2 | D-13 | `metadataCache.changed` → `Compartment.reconfigure` on child | unit | `npm test -- tests/main/fmReactivity.test.ts` | ❌ Wave 2 (NEW) | ⬜ pending |
| fm reactivity (no body rewrite) | Wave 2 | D-14 | Listener does NOT rewrite fence opener | unit | same as above | ❌ Wave 2 (NEW) | ⬜ pending |
| Themed HighlightStyle | Wave 3 | D-15/D-16 | HighlightStyle uses CSS variables; bracket-match theme present | unit (DOM check) | `npm test -- tests/main/childEditorTheme.test.ts` | ❌ Wave 3 (NEW) | ⬜ pending |
| Theme visual verification | Wave 3 | D-15/D-16 | Dark + light theme legibility | manual UAT | `17-UAT.md` script | ❌ Wave 3 (NEW) | ⬜ pending |
| Go highlighting (conditional) | Wave 3 | D-17 | Go fence shows colorization (or formally deferred) | manual UAT | `17-UAT.md` script | ❌ Wave 3 (NEW) | ⬜ pending |
| Vim mode (conditional load) | Wave 3 | D-18/D-20 | `vimMode=true` loads vim; Esc-Esc returns focus; Cmd-/ works in Insert + Normal | manual UAT | `17-UAT.md` script | ❌ Wave 3 (NEW) | ⬜ pending |
| Lifecycle automated | Wave 3 | D-23a | `destroyAll`, LRU eviction, plugin `onunload` destroy | unit | `npm test -- tests/main/lifecycle.test.ts` | ❌ Wave 3 (NEW) | ⬜ pending |
| Heap snapshot UAT | Wave 3 | D-23b | 20 open/close cycles, no detached `EditorView` | manual UAT | `17-UAT.md` + DevTools | ❌ Wave 3 (NEW) | ⬜ pending |
| Bundle audit | Wave 3 | D-24 | Raw + gzipped + contributor breakdown documented; under 1.6 MB hard ceiling | manual record | `npm run check:bundle-size` + esbuild metafile | partial (script exists; audit doc NEW) | ⬜ pending |
| Paste UAT | Wave 2 | D-07/D-08 | VS Code, StackOverflow, LC web, Obsidian clipboard interceptor — no markdown formatting | manual UAT | `17-UAT.md` script | ❌ Wave 2 (NEW) | ⬜ pending |
| IME UAT | Wave 2 | D-09 | Pinyin, Romaji, Hangul — no duplication, no truncation | manual UAT | `17-UAT.md` script | ❌ Wave 2 (NEW) | ⬜ pending |
| Source ↔ Live Preview UAT | Wave 2 | D-10 | Cmd-E with pending edits; child preserves state on flip-back | manual UAT | `17-UAT.md` script | ❌ Wave 2 (NEW) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Wave 0 = test infrastructure additions before Wave 1 work begins.

- [ ] Confirm or extend `tests/helpers/obsidian-stub.ts` to expose a `makeChildEditorMock()` helper that allows asserting `addToHistory.of(false)` annotations and `userEvent` strings on dispatched transactions (Wave 1 needs this for Reset + fence-repair regression tests)
- [ ] Stub `app.metadataCache.on('changed', ...)` registration in `tests/helpers/obsidian-stub.ts` (Wave 2 fm reactivity tests)
- [ ] No new framework install — vitest 4.1.5 already configured
- [ ] No conftest equivalent — `vi.mock(...)` per-file pattern is established

*Track gap closure with: `/gsd:plan-phase 17 --gaps` if Wave 0 holes surface during execution.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Paste from VS Code → child | D-08 | Requires real Electron clipboard + Obsidian's interceptor | `17-UAT.md` script PASTE-01 |
| Paste from StackOverflow HTML → child | D-08 | Real browser-derived HTML clipboard | `17-UAT.md` script PASTE-02 |
| Paste from LeetCode web copy → child | D-08 | Real LC clipboard format | `17-UAT.md` script PASTE-03 |
| Paste through Obsidian's markdown interceptor | D-08 | Tests Obsidian's own paste pipeline | `17-UAT.md` script PASTE-04 |
| Pinyin (Chinese) IME composition | D-09 | Real OS-level IME; cannot be simulated reliably | `17-UAT.md` script IME-01 |
| Romaji → kanji (Japanese) IME | D-09 | Real OS-level IME | `17-UAT.md` script IME-02 |
| Hangul (Korean) IME | D-09 | Real OS-level IME | `17-UAT.md` script IME-03 |
| Source ↔ Live Preview Cmd-E with pending edits | D-10 | `Decoration.widget({block:true})` rendering parity is mode-specific | `17-UAT.md` script SRCLIV-01 |
| Themed HighlightStyle dark + light visual | D-15/D-16 | Visual perception, not source assertion | `17-UAT.md` script THEME-01..02 |
| Go syntax colorization | D-17 | Visual; legacy-modes binding outcome decided by inspection | `17-UAT.md` script GO-01 |
| Vim mode end-to-end | D-18/D-20 | Real key sequences + focus transitions | `17-UAT.md` script VIM-01..05 |
| 20 open/close heap snapshot | D-23b | DevTools heap snapshot is manual | `17-UAT.md` script LIFE-01 |
| Bundle audit record | D-24 | Written record (raw + gzipped + breakdown) gated against 1.6 MB ceiling | `17-UAT.md` script BUNDLE-01 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or are listed in Manual-Only with a UAT script reference
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual UAT clusters in Wave 2 are accepted because edge-input behaviors cannot be reliably simulated)
- [ ] Wave 0 covers all MISSING test-helper references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30 seconds (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter once all sign-off boxes are checked

**Approval:** pending
