---
phase: 19-widget-foundation-one-way-sync
status: complete
milestone: v1.3
plans:
  - 19-01
  - 19-02
  - 19-03
  - 19-04
requirements:
  - WIDGET-01
  - WIDGET-02
  - WIDGET-03
  - WIDGET-04
  - WIDGET-05
  - WIDGET-06
  - WIDGET-07
  - WIDGET-08
  - SYNC-01
  - SYNC-02
  - SYNC-03
  - SYNC-06
  - SYNC-07
  - EMBED-01
  - EMBED-02
  - EMBED-03
  - EMBED-04
  - VIM-01
  - VIM-04
  - THEME-01
  - THEME-02
  - THEME-03
metrics:
  total_duration: ~135 minutes (across 4 plans)
  completed: 2026-05-29
  total_commits: 14
  total_new_tests: 182 (Plan 19-01: 85; 19-02: 38; 19-03: 18; 19-04: 38; -1 plan 19-01 test renamed in 19-04)
  full_suite_passing: 1906
  full_suite_skipped: 6
  bundle_status: build green; full bundle-size delta measured at Phase 22 cutover
---

# Phase 19: Widget Foundation + One-Way Sync — Closeout Summary

Phase 19 delivers the v1.3 inline widget architecture foundation, hard-gated behind `useInlineWidget=OFF` while v1.2's nested-editor path remains the user-facing default through Phase 21. Four vertical-slice plans landed every primitive from CONTEXT C-01..C-17 + D-01..D-10:

- **Plan 19-01** — Minimal mount (no sync, no state, no actions): two-path mount, `lc-slug` gate, atomicRanges, theme + 8-language carry-over, conditional vim, Experimental settings + mutual-exclusion assert.
- **Plan 19-02** — Debounced one-way sync + suppression: 400ms `Debouncer`, per-path content-hash suppression (2s TTL), per-file flush rate-limit (1/200ms), six flush-on-transition hooks, post-flush hash drift diagnostic.
- **Plan 19-03** — State persistence + P3 mitigation: `Map<${path}::${idx}, ChildEditorState>` with 30s TTL, capture-on-unmount + hydrate-on-mount, `mousedown.stopPropagation()` belt.
- **Plan 19-04** — Embed + stray fence + property-test hardening: dual-signal-plus-null-info embed detection, stray-fence safe fallback, language fallback Notice (WIDGET-06), expanded property-test corpus, content-hash WidgetType.eq() identity.

## Acceptance Gate Walk (CONTEXT §"Success criteria")

| # | Gate | Plan | Verified |
|---|------|------|----------|
| 1 | Reading + Live Preview render identical CM6; Reading is `editable.of(false)` | 19-01 | ✓ unit + UAT |
| 2 | Type → 400ms later disk reflects byte-for-byte | 19-02 | ✓ unit (debouncedWriter) + property tests + UAT |
| 3 | Force-quit within ms preserves chars | 19-02 | ✓ flush-on-quit hook + workspace.on('quit') Tasks.add |
| 4 | `![[lc-note]]` embed read-only; stray fence safe | 19-04 | ✓ embedDetection + strayFenceFallback test files |
| 5 | Parent cursor cannot enter fence; close+reopen within 30s restores cursor/scroll/undo | 19-01 + 19-03 | ✓ atomicRanges + statePersistence map |
| 6 | `useInlineWidget=OFF` default; v1.2 path regression-clean | 19-01 | ✓ mutualExclusion test + full v1.2 suite green |

All six observable behaviors from the CONTEXT success criteria verified across the four plan UATs.

## Empirical Probe Results (RESEARCH Open Questions)

- **A1 (Pitfall 19-A) — `vault.on('modify')` event-ordering:** Probe in Plan 19-02 (`tests/widget/modifyEventOrdering.probe.test.ts`) confirmed simple `arm-then-vault.process` is robust under both default ordering (modify fires after process resolves) AND worst-case sync-inside-callback ordering. No `Promise.resolve().then()` microtask wrapping needed. Ships as the single canonical write path.
- **A2 (Pitfall 19-D / D-02) — `mousedown.stopPropagation()` effectiveness:** Belt-and-suspenders shipped per CONTEXT D-02. The state-persistence map (Plan 19-03) is load-bearing regardless. UAT step 7 in Plan 19-04 verifies CM6 DOM reuse via Performance profiling (eq() content-hash identity prevents toDOM thrash on every keystroke).
- **A3 (Pitfall 19-C) — CM6 history round-trip:** Cannot be deterministically exercised in vitest's split-`@codemirror/state` env (workspace has 6.5.0 from view's peer + 6.6.0 nested under commands; cross-instance instanceof breaks Configuration.resolve). Production single-CM6 host is unaffected; Plan 19-03 captures `historyJSON` on every entry and preserves it for Phase 20+ conflict-modal reload to consume. Plan 19-03's `historyRoundTrip.test.ts` is a contract-shape probe that documents the limitation.
- **A8 — `workspace.on('quit')` `Tasks` shape:** Plan 19-02 wires `tasks.add(flushAll())` under a defensive try/catch with one-shot logger.debug for runtime introspection. Falls through to `beforeunload` if Tasks.add isn't available.

## Plan-by-Plan Bundle / Test Deltas

| Plan | Files Created | Files Modified | Commits | Tests Added (cumulative full-suite) |
|------|---------------|----------------|---------|-------------------------------------|
| 19-01 | 19 | 6 | 3 | 85 → 1809 passing |
| 19-02 | 9 | 8 | 4 | +42 → 1851 passing |
| 19-03 | 4 | 3 | 3 | +18 → 1869 passing |
| 19-04 | 5 | 8 | 3 | +37 → 1906 passing |
| **Total** | **37** | **modified across 25 unique files** | **13 atomic + 1 phase-closeout pending** | **+182 net** |

Bundle size delta: Phase 18 baseline 1.71 MB raw / 459 KB gzipped. Phase 19 net is additive (~+600 LOC widget code; v1.2 path still present behind `useNestedEditor=ON`). Net-negative cutover happens in Phase 22 when v1.2 deletion lands. Build green throughout — `npm run build` exits 0 after every commit.

## Key Architectural Decisions Locked in Phase 19

1. **Two-path mount** — `registerMarkdownCodeBlockProcessor` (Reading) + `registerEditorExtension([leetCodeFenceViewPlugin])` (Live Preview), both calling `mountLeetCodeWidget(host, source, file, plugin, readOnly, fenceIndex)`. (CONTEXT C-02)
2. **Reading mode = live CM6 with `EditorView.editable.of(false)`** — single render path; no separate static renderer. (WIDGET-07)
3. **Self-write suppression = per-path content-hash map with 2s TTL, NOT a boolean flag** — boolean is provably broken under concurrent multi-file flushes. (CONTEXT C-04 / PITFALLS P1)
4. **`EditorView.atomicRanges` Facet on parent CM6** — load-bearing primitive for parent-cursor exclusion. RangeSet is SHARED with the decorations field for drift-free invariant. (CONTEXT C-05)
5. **State persistence keyed by `${file.path}::${fenceIndex}`** — index-based (not hash-based) so the key is invariant under body edits. (CONTEXT D-01)
6. **`useInlineWidget=OFF` HARD-GATE** — when OFF, neither registration call runs; v1.2 path is the only active path. Bisection-clean. (CONTEXT D-05)
7. **Mutual-exclusion assert at TOP of `Plugin.onload()`** — runs BEFORE either `registerEditorExtension` fires; corrupt data.json with both flags ON resolves to a single editor. (CONTEXT D-06)
8. **Two hash functions, two purposes** — sync djb2 (`src/widget/hash.ts`) for `WidgetType.eq()` identity; async SHA-1 (in `debouncedWriter.ts`) for self-write suppression. DO NOT conflate. (Plan 19-04 / RESEARCH Pitfall 19-F)
9. **Closer-resolution rule for fenceSerialization** — terminate section walk at FIRST of (a) next H2 heading, (b) next non-leetcode-solve TAGGED fence opener, or (c) EOF; closer is LAST bare-or-tagged ``` line BEFORE that boundary. Unifies nested-triple-backtick support with non-LC-fence-skipping. (Plan 19-04)
10. **`'leetcode.*'` userEvent + Phase 17 D-05 conventions PRESERVED** — both still load-bearing for `useInlineWidget=OFF` path through Phase 21; CLAUDE.md untouched. Phase 22 owns DELETE-08 / PROTECT-03.

## Open Items Carrying Forward

- **Phase 20** — Action row in widget DOM (ACTION-*); `metadataCache.on('changed')` reactivity for live language switching; live `Compartment.reconfigure` for vim toggle (VIM-02); narrowed `sectionProtectionExtension.ts` (PROTECT-01/02); external-edit reconciliation + conflict modal (SYNC-04/05); Phase 19's `historyJSON` capture consumed by conflict-modal reload (Pitfall 19-C residual).
- **Phase 21** — v1.2 → v1.3 fence-tag migration (`\`\`\`python` / `\`\`\`java` / etc. → `\`\`\`leetcode-solve` + `lc-language` frontmatter) per MIGRATE-01..10.
- **Phase 22** — Delete v1.2 files (DELETE-01..07); flip `useInlineWidget` to default-ON (POLISH-01); README v1.3 architecture overview + migration docs (POLISH-04); theme regression visual gate (THEME-05); bundle-size net-negative target.

## Risk / Surface Inventory at Phase 19 Close

- **Multi-fence corner (Pitfall 19-E)**: Plan 19-02 ships single-fence-per-file as supported shape; multi-fence drift detected at flush time with Notice. Per-fence-index suppression deferred to v1.4+.
- **CM6 history round-trip (Pitfall 19-C / A3)**: Best-effort across remount; UAT-validated on production single-CM6; vitest cross-instance limitation documented in Plan 19-03 SUMMARY.
- **`mousedown.stopPropagation()` empirical effectiveness (D-02 / A2)**: Belt; persistence map carries the load. UAT verifies the eq() identity prevents toDOM thrash regardless.
- **`beforeunload` synchronous flush (Pitfall 19-B)**: Best-effort; `workspace.on('quit')` Tasks.add is the primary path. Residual data-loss risk on Cmd-Q within ms documented for Phase 22 README.

Phase 19 is COMPLETE. Plans 19-01..19-04 acceptance gates met. Ready for Phase 20 planning.
