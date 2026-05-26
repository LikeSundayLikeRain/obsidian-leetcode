---
phase: 17
slug: polish-edge-cases
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-23
updated: 2026-05-23
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

> Wave 0 = test infrastructure additions before Wave 1 work begins. **Status: COMPLETE BY REUSE — no new infrastructure plan required.**

- [x] **`makeChildEditorMock` helper:** NOT needed as a new exported helper. Investigation (revision iteration 1, 2026-05-23) confirmed that `tests/helpers/obsidian-stub.ts` already exposes the stubs Wave-1 tests need (`Notice`, `TFile`, `MarkdownView`, `Workspace`, `makeStateForLockTests`, `makeFakeTransaction`). The `vi.fn()`-style child editor + registry mocks are inlined per-test following the established project convention at `tests/main/childEditorSync.test.ts:87-109` (`makeMockChildView`, `makeMockRegistry`) and `tests/main/childEditorRegistry.test.ts:10` (`{ destroy: vi.fn() }`-shape mocks). Plans 17-01, 17-02, 17-03 each inline their own factories — same pattern, scoped to the test file. **No shared helper needed**; promoting the inline shape to a shared helper would add coupling without removing duplication beyond ~5 LOC per file.
- [x] **`metadataCache.on('changed')` stubbing:** NOT needed as a new helper. Wave-2 fm-reactivity test (Plan 17-04 Task 1) uses the existing project pattern: `app: { metadataCache: { getFileCache: vi.fn() } }` inlined in a `makeMockPlugin()` factory, mirroring `tests/main/codeActionsPostProcessor.test.ts:103-105` (`createFakeMetadataCache().setFrontmatter(...)`) and the chevron analog at `src/main/codeActionsEditorExtension.ts:329-359`. Plan 17-04 invokes the extracted `createFmReactivityHandler(plugin)` directly without registering the event — no real metadataCache event-emitter is needed.
- [x] **Framework install:** vitest 4.1.5 already configured in `package.json` and `vitest.config.ts`.
- [x] **Conftest equivalent:** N/A — vitest's per-file `vi.mock(...)` pattern is the established project convention (no global setup file needed).

**Conclusion:** Wave 0 is satisfied without any pre-Wave-1 plan. The Wave-1 plans (17-01, 17-02, 17-03) declare `depends_on: []` and may run in Wave 1 in parallel.

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

- [x] All tasks have `<automated>` verify or are listed in Manual-Only with a UAT script reference
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual UAT clusters in Wave 2 are accepted because edge-input behaviors cannot be reliably simulated)
- [x] Wave 0 covers all MISSING test-helper references (satisfied by reuse — see Wave 0 Requirements above)
- [x] No watch-mode flags
- [x] Feedback latency < 30 seconds (full suite)
- [x] `nyquist_compliant: true` set in frontmatter (all sign-off boxes checked)

**Approval:** approved (revision 1, 2026-05-23 — Wave-0 reuse confirmed; no new infrastructure plan required)
