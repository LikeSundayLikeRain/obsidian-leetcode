---
phase: 19
slug: widget-foundation-one-way-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `19-RESEARCH.md` §"Validation Architecture" (Wave-0 test seed list).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + happy-dom 20.9 (pre-installed; 196 existing test files) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run --reporter=dot tests/widget/` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | quick ~3s · full ~25s |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run --reporter=dot tests/widget/`
- **After every plan wave:** Run `npm test -- --run` plus `npm run build` (esbuild type-check + bundle).
- **Before `/gsd:verify-work`:** Full suite green AND `npm run build` succeeds AND ESLint clean (`npm run lint` if configured).
- **Max feedback latency:** 30 seconds (quick) / 60 seconds (full).

Manual UAT (dev-vault) checkpoints are scheduled at the end of each Plan (19-01..19-04) — see "Manual-Only Verifications" below. They are NOT in the per-task sampling loop.

---

## Per-Task Verification Map

> Plan-level task IDs are placeholders here; the planner finalizes IDs in PLAN.md frontmatter. Update task IDs here when plans are written.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 19-01 | 1 | EMBED-01 | — | Two-path mount registers iff `useInlineWidget=true`; soft-gated when `useNestedEditor=true`. | unit | `npm test -- --run tests/widget/widgetRegistry.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-02 | 19-01 | 1 | WIDGET-05, WIDGET-08 | — | `lc-slug` gate routes editable→fallback; language fallback to Python with Notice. | unit | `npm test -- --run tests/widget/codeBlockProcessor.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-03 | 19-01 | 1 | WIDGET-01, WIDGET-07 | — | `mountLeetCodeWidget` builds CM6 with `editable.of(false)` in Reading mode, editable in Live Preview. | unit | `npm test -- --run tests/widget/WidgetController.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-04 | 19-01 | 1 | WIDGET-02 | — | Parent CM6 cannot enter widget fence range — `EditorView.atomicRanges` consults widget decoration set. | unit | `npm test -- --run tests/widget/atomicRanges.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-05 | 19-01 | 1 | WIDGET-08, THEME-01..03 | — | `languageCompartment` registers all 8 packs; `lc-nested-editor` + `HyperMD-codeblock` + semantic classes attach. | unit | `npm test -- --run tests/widget/themeIntegration.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-06 | 19-01 | 1 | VIM-01, VIM-04 | — | Vim extension only mounts when `app.vault.getConfig('vimMode')` is true; vim mode confined to widget (`atomicRanges` blocks parent leakage). | unit | `npm test -- --run tests/widget/vimMount.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-07 | 19-01 | 1 | D-06 (CONTEXT) | — | Mutual-exclusion assert at TOP of `Plugin.onload()` forces `useNestedEditor=false` when `useInlineWidget=true` and surfaces a `Notice`. | unit | `npm test -- --run tests/main/mutualExclusion.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-08 | 19-01 | 1 | SYNC-06 (pure-fn corpus seed) | — | `extractFenceBody` / `rewriteFenceBody` are inverses on the seed corpus (CRLF, nested triple backticks, `---` lookalikes, edge whitespace, empty/single-line/mid-byte). | property | `npm test -- --run tests/widget/fenceSerialization.property.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-01 | 19-02 | 2 | (empirical probe — 19-A) | — | `vault.on('modify')` fires synchronously after `vault.process` resolves — confirmed before suppression map ships. | unit | `npm test -- --run tests/widget/modifyEventOrdering.probe.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-02 | 19-02 | 2 | SYNC-01 | — | Debounced writer fires after configured delay (300/400/500/1000/2000ms); `Debouncer.run()` resets timer on subsequent edits. | unit | `npm test -- --run tests/widget/debouncedWriter.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-03 | 19-02 | 2 | SYNC-03 | — | Per-path content-hash suppression map: armed before `vault.process` with future text hash; consumed in `vault.on('modify')`; expires after 2s TTL. | unit | `npm test -- --run tests/widget/selfWriteSuppression.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-04 | 19-02 | 2 | SYNC-07 | — | Per-file flush rate-limit: max 1 flush per 200ms; over-rate calls coalesce. | unit | `npm test -- --run tests/widget/flushRateLimit.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-05 | 19-02 | 2 | SYNC-02 | — | `flushNow()` invoked on: `MarkdownRenderChild.onunload`, `Plugin.onunload`, `workspace.on('active-leaf-change')`, file rename, `beforeunload`, `workspace.on('quit')`. | unit | `npm test -- --run tests/widget/flushTransitions.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-06 | 19-02 | 2 | SYNC-06 (runtime drift) | — | Post-flush hash diagnostic warns when `sha1(extractFenceBody(disk-after-flush)) ≠ sha1(widget.state.doc.toString())`. | unit | `npm test -- --run tests/widget/postFlushDiagnostic.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-07 | 19-02 | 2 | (Pitfall 19-E) | — | `fenceIndex` recomputed at flush time, not just mount time; multi-fence inserts above active fence handled. | unit | `npm test -- --run tests/widget/fenceIndexRecompute.test.ts` | ❌ W0 | ⬜ pending |
| 19-03-01 | 19-03 | 3 | WIDGET-04 | — | State map keyed by `${file.path}::${fenceIndex}`; captures cursor + scroll + undo on `onunload`; hydrates on mount within 30s TTL; expired entries evicted. | unit | `npm test -- --run tests/widget/statePersistence.test.ts` | ❌ W0 | ⬜ pending |
| 19-03-02 | 19-03 | 3 | (Pitfall 19-C) | — | CM6 history serializes via `state.toJSON({history})` and rehydrates via `EditorState.fromJSON`; round-trip preserves undo stack. | unit | `npm test -- --run tests/widget/historyRoundTrip.test.ts` | ❌ W0 | ⬜ pending |
| 19-03-03 | 19-03 | 3 | WIDGET-03, D-02 (CONTEXT) | — | `mousedown.stopPropagation()` listener on widget root; combined with state map covers all unmount paths (cursor approach, viewport scroll, mode switch, theme change). | unit | `npm test -- --run tests/widget/livePreviewUnmount.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-01 | 19-04 | 4 | EMBED-01..04 | — | `.markdown-embed`/`.internal-embed` ancestor walk OR `ctx.sourcePath !== file.path` mismatch → read-only widget; embed never offers Run/Submit. | unit | `npm test -- --run tests/widget/embedDetection.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-02 | 19-04 | 4 | EMBED-04 | — | Stray ` ```leetcode-solve ` fence in non-LC note (no `lc-slug`) renders read-only static fallback; never crashes; `getSectionInfo` null path safe. | unit | `npm test -- --run tests/widget/strayFenceFallback.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-03 | 19-04 | 4 | WIDGET-06 | — | `lc-language` missing or unrecognized → Python fallback + `Notice` issued exactly once per mount. | unit | `npm test -- --run tests/widget/languageFallback.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-04 | 19-04 | 4 | SYNC-06 (corpus expansion) | — | Property test corpus expanded (CRLF, nested backticks, edge whitespace, frontmatter-like lines, empty body, trailing whitespace, mid-character truncation). | property | `npm test -- --run tests/widget/fenceSerialization.property.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-05 | 19-04 | 4 | (Pitfall 19-F) | — | `WidgetType.eq()` identity is content-hash-based (`filePath + fenceIndex + sourceHash`); CM6 reuses widget across rebuilds for unchanged fences. | unit | `npm test -- --run tests/widget/widgetEquality.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 creates the test files (stubs). All tests start RED until the corresponding plan task makes them GREEN.

- [ ] `tests/widget/__fixtures__/lcNoteFixtures.ts` — sample LC notes (basic, multi-fence, missing slug, missing language, embed-host, stray-fence, CRLF, nested-backticks)
- [ ] `tests/widget/__fixtures__/cm6Helpers.ts` — happy-dom CM6 EditorView factory; assertion helpers for atomicRanges + decoration set
- [ ] `tests/widget/widgetRegistry.test.ts` — plugin registration gating (WIDGET-01)
- [ ] `tests/widget/codeBlockProcessor.test.ts` — Reading-mode mount + lc-slug gate (WIDGET-05, WIDGET-08)
- [ ] `tests/widget/WidgetController.test.ts` — shared mount factory contract (WIDGET-01, WIDGET-07)
- [ ] `tests/widget/atomicRanges.test.ts` — parent cursor blocked from fence range (WIDGET-02)
- [ ] `tests/widget/themeIntegration.test.ts` — lc-nested-editor + HyperMD-codeblock + semantic classes (THEME-01..03)
- [ ] `tests/widget/vimMount.test.ts` — conditional vim attach (VIM-01, VIM-04)
- [ ] `tests/main/mutualExclusion.test.ts` — useInlineWidget + useNestedEditor mutual exclusion (D-06)
- [ ] `tests/widget/fenceSerialization.property.test.ts` — `extractFenceBody`/`rewriteFenceBody` inverse property (SYNC-06 pure)
- [ ] `tests/widget/modifyEventOrdering.probe.test.ts` — empirical probe of `vault.on('modify')` ordering (Pitfall 19-A)
- [ ] `tests/widget/debouncedWriter.test.ts` — Obsidian `Debouncer` behavior (SYNC-01)
- [ ] `tests/widget/selfWriteSuppression.test.ts` — content-hash map TTL + arm/consume (SYNC-03)
- [ ] `tests/widget/flushRateLimit.test.ts` — per-file 1/200ms rate limit (SYNC-07)
- [ ] `tests/widget/flushTransitions.test.ts` — flush-on-transition hooks (SYNC-02)
- [ ] `tests/widget/postFlushDiagnostic.test.ts` — runtime hash drift warning (SYNC-06 runtime)
- [ ] `tests/widget/fenceIndexRecompute.test.ts` — fenceIndex recomputed at flush time (Pitfall 19-E)
- [ ] `tests/widget/statePersistence.test.ts` — state map TTL + capture/hydrate (WIDGET-04)
- [ ] `tests/widget/historyRoundTrip.test.ts` — CM6 history JSON round-trip (Pitfall 19-C)
- [ ] `tests/widget/livePreviewUnmount.test.ts` — stopPropagation + state map covers unmount paths (WIDGET-03, D-02)
- [ ] `tests/widget/embedDetection.test.ts` — embed read-only routing (EMBED-01..04)
- [ ] `tests/widget/strayFenceFallback.test.ts` — non-LC fence safe fallback (EMBED-04)
- [ ] `tests/widget/languageFallback.test.ts` — Python fallback + Notice (WIDGET-06)
- [ ] `tests/widget/widgetEquality.test.ts` — `WidgetType.eq()` content-hash identity (Pitfall 19-F)

No new framework install — vitest 4.1.5 + happy-dom 20.9 already in `package.json`. No fast-check (use Vitest `it.each` + 30 LOC seeded generator per RESEARCH §"Property Tests"). No new runtime deps.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Preview cursor approach unmount mitigation | WIDGET-03 / D-02 | `mousedown.stopPropagation()` effectiveness depends on Obsidian's "raw source reveal" pipeline — not reproducible in happy-dom; persistence map handles all other unmount paths regardless. | Open dev vault with `useInlineWidget=ON`. Place caret near fence boundary in Live Preview, then click into fence. Confirm widget does NOT unmount-remount (no flash). Confirm undo stack and cursor preserved if it does unmount. |
| Force-quit data preservation (Cmd-Q within ms of typing) | SYNC-02 | `beforeunload` synchronous flush is best-effort in Electron; `workspace.on('quit')` `Tasks.add(promise)` is the reliable path. Cmd-Q timing cannot be reproduced in unit tests. | In dev vault, type a unique sentinel string in a widget. Within 100ms, press Cmd-Q. Re-open vault and confirm sentinel string is on disk in the fence body. |
| Identical render across Reading + Live Preview modes | WIDGET-01, WIDGET-07 | Visual equivalence (CM6 chrome, theme classes, gutter absence) is qualitative; happy-dom does not paint. | Open same LC note in Reading mode, Live Preview, and Source mode. Confirm fence body renders identically (modulo Reading-mode `editable=false`). Toggle community theme and confirm cascade applies. |
| Vim mode keystrokes confined to widget | VIM-04 | Confirms `atomicRanges` blocks vim leakage to parent doc — requires real keyboard events through Obsidian's input pipeline. | In dev vault with vim mode ON: enter vim NORMAL inside widget, press `j` repeatedly. Confirm parent CM6 caret does NOT move; only widget caret moves. |
| Theme cascade with community themes | THEME-01..03 | Visual; community themes (e.g., Minimal, Things) need a real Obsidian instance to load CSS. | In dev vault, install Minimal theme. Open LC note. Confirm widget visual matches surrounding code blocks (font, padding, syntax colors). |
| Embed read-only via `![[lc-note]]` | EMBED-01..04 | Embed rendering uses Obsidian's MarkdownRenderer pipeline; `.markdown-embed` ancestor only exists in real DOM. | In dev vault, create host note containing `![[some-lc-note]]`. Confirm widget renders read-only (no editing). Confirm no Run/Submit even when ACTION row lands in Phase 20 (regression check at Phase 20). |
| Hard-gate isolation (`useInlineWidget=OFF`) | D-05 (CONTEXT) | Confirms zero v1.3 surface when flag is OFF — bisection requirement for v1.2 baseline. | Toggle `useInlineWidget=OFF` in Settings → Experimental. Open LC note. Confirm v1.2 nested-editor mounts (existing behavior). Confirm `leetcode-solve` fences in non-LC notes fall back to Obsidian default code-block rendering. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify command OR Wave 0 dependency listed
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (24 test files seeded above)
- [ ] No watch-mode flags (`--watch` is forbidden in CI; use `--run`)
- [ ] Feedback latency < 30s for quick / < 60s for full
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands and per-task IDs are finalized by planner

**Approval:** pending — set to "approved YYYY-MM-DD" by gsd-plan-checker after PLAN.md task IDs are mapped into the table above.
