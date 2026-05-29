# Phase 19: Widget Foundation + One-Way Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 19-Widget Foundation + One-Way Sync
**Areas discussed:** fenceIdentity key + persistence, Live Preview unmount mitigation + initial widget scope, useInlineWidget gating semantics, Round-trip + plan/wave structure

---

## fenceIdentity key + persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Code-block index (Recommended) | fenceIdentity = ordinal index of the leetcode-solve fence in the file (0, 1, 2...). Stable across edits inside fence. Survives rename naturally (key is path+index). Multi-fence support free. Empirically what Dataview/Kanban use. | ✓ |
| Hash of opener-line + body-prefix | fenceIdentity = sha1(openerLine + first 80 chars of body). Survives reorder. But changes on every keystroke until debounced — makes the key churn during typing. | |
| getSectionInfo line range | fenceIdentity = `${lineStart}-${lineEnd}` from getSectionInfo. Updates on every body length change. Causes key thrashing on every typed character; persistence map fills with orphans. | |
| First-fence-only (path alone) | Drop fenceIdentity entirely; key by `file.path`. Only one widget per file; embeds/stray fences become unkeyed orphans. Simplest but can't support multi-fence. | |

**User's choice:** Code-block index.
**Notes:** User asked clarifying questions about (a) what the persistence key is used for and (b) what would happen with the hash option when the body changes. Walked through: key is used to find saved state (cursor, scroll, undo) on widget remount triggered by Live Preview viewport scroll, mode switch, theme change, and short-window note reopen. The hash option would rotate on every keystroke, defeating the point — the key MUST be invariant under body edits. User confirmed Option 1 after the explanation.

---

## Live Preview unmount mitigation (PITFALLS P3)

| Option | Description | Selected |
|--------|-------------|----------|
| Both: stopPropagation + state-persistence (Recommended) | Ship `mousedown.stopPropagation()` on widget root (cheap defense) AND state-persistence map. If stopPropagation works, state-persistence rarely fires — still load-bearing for scroll/mode-switch unmounts. Belt + suspenders. | ✓ |
| State-persistence only | Skip stopPropagation. Accept that cursor approach triggers unmount, restore from map on remount. Simpler code path; trusts the 30s TTL for every transition. | |
| stopPropagation only, defer state-persistence | Ship cheap fix only; punt state-persistence to Phase 20. Risk: scroll-driven unmounts (which stopPropagation does NOT prevent) lose state. | |
| Empirical probe first, decide later | Plan a Wave 1 dev-vault probe to measure unmount frequency under each scenario; let the planner decide based on findings. | |

**User's choice:** Both: stopPropagation + state-persistence.
**Notes:** Empirical probe is implicit in Plan 19-01/19-03 dev-vault testing — if stopPropagation reliably prevents cursor-place "raw source reveal," persistence map's importance for that specific scenario drops, but persistence ships regardless because non-cursor unmount paths (viewport scroll, mode switch, theme change) still need it.

---

## Initial widget scope (Phase 19 vs. Phase 20)

| Option | Description | Selected |
|--------|-------------|----------|
| No action row — widget renders code only (Recommended) | Widget DOM has only the embedded EditorView. With useInlineWidget=OFF default, no user sees this until Phase 20 wires actions. Phase 20 mounts buttons inside widget DOM as scoped. | ✓ |
| v1.2 reading-mode buttons reused below widget | Mount existing `codeActionsPostProcessor` row below the widget DOM as a temporary bridge so dev-vault testing can Run/Submit during Phase 19. Removed in Phase 20 when actions move inside widget DOM. | |
| Stub buttons with 'Phase 20' tooltip | Render placeholder buttons that show 'Coming in Phase 20' on click. Documents UX intent visually but adds throwaway DOM. | |

**User's choice:** No action row.
**Notes:** Phase 19 widgets are dogfood-only behind hard-gate; throwaway buttons would inflate removal work in Phase 20.

---

## useInlineWidget gating semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-gate: widget never mounts (Recommended) | When OFF, `registerMarkdownCodeBlockProcessor('leetcode-solve', …)` and the ViewPlugin are NOT registered at all. Stray `leetcode-solve` fences fall back to Obsidian's default rendering. v1.2 nested-editor path is the ONLY path. Cleanest bisection. | ✓ |
| Soft-gate: widget mounts but read-only | Registration happens always, but with OFF the widget renders read-only. v1.2 nested editor still owns user editing. Lets dev-vault visually inspect both paths simultaneously, but two CM6 instances per fence is risky. | |
| Per-note opt-in via frontmatter | Setting OFF default + per-note `lc-widget: true` frontmatter override. Lets the user dogfood selectively. Adds a flag to maintain. Per-note state cuts across the global flag. | |

**User's choice:** Hard-gate.
**Notes:** Mutual-exclusion assert (`useInlineWidget=true` forces `useNestedEditor=false`) lands in Plan 19-04.

---

## Settings UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden dev flag | No settings UI in Phase 19; toggle via plugin data file edit OR an unannounced 'Advanced' section. Keeps the v1.2 path as the only thing users see. Phase 22 promotes it (and then deletes it). | |
| Visible toggle in Settings tab | Add a 'Use inline widget (v1.3 preview)' toggle in main settings. Users can opt in. Risk: bug reports from non-dogfood users on incomplete v1.3. | |
| Toggle behind 'Experimental' subsection | Visible but cordoned. Compromise between hidden and prominent. Adds a setting category we'd otherwise not need. | ✓ |

**User's choice:** Toggle behind 'Experimental' subsection.
**Notes:** Includes the debounce-delay slider (300/500/1000/2000ms — SYNC-01) alongside the toggle. Banner: "These features are under development and may change between releases." Section is removed in Phase 22 when `useInlineWidget` becomes unconditional.

---

## Round-trip byte-exactness verification (SYNC-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Property tests + post-flush hash diagnostic (Recommended) | Vitest property tests on `extractFenceBody` and `rewriteFenceBody` over 100+ generated bodies (CRLF, tabs, edge whitespace, nested backticks). PLUS a runtime `console.warn` if the hash of doc-after-flush ≠ hash-just-written. Catches both pure-function bugs and integration drift. | ✓ |
| Property tests only | Pure-function tests cover serialization correctness. No runtime instrumentation. Cheapest; misses integration regressions where vault.process or modify-handler diverges from the pure transform. | |
| Fail-loud at runtime: throw on mismatch | Hard-fail (Notice + abort flush) when post-flush hash drift is detected. Aggressive but ships nothing into prod silently. Risk: false positives could break the editor mid-session. | |

**User's choice:** Property tests + post-flush hash diagnostic.
**Notes:** Diagnostic is `console.warn` only (not throw) — false positives can't brick a typing session. Phase 22 may strip the diagnostic or hide it behind a verbose-logging flag (planner discretion).

---

## Plan structure (advisory)

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical slice: thin path first, then broaden (Recommended) | Plan 19-01: minimal mount (Reading + Live Preview, no actions, no sync). Plan 19-02: debounced one-way sync + suppression + flush hooks. Plan 19-03: state persistence + atomicRanges + P3 mitigation. Plan 19-04: embed/stray-fence/lc-slug gating + theme/vim carry-over + property tests. Each plan ships an end-to-end working slice; bisection per-plan is clean. | ✓ |
| By-axis: parallelize by capability | Plan 19-01: mount paths. Plan 19-02: sync layer. Plan 19-03: state map. Plan 19-04: embed/stray gating. Plan 19-05: theme/vim/language carry-over. More plans, more parallelism, but Plan 1 alone doesn't yield a runnable widget — testing requires waiting for several plans. | |
| Let the planner decide based on dependency graph | Don't lock the structure. Pass requirements to gsd-planner; it splits based on dep analysis and codebase scout. | |

**User's choice:** Vertical slice.
**Notes:** This is advisory for gsd-planner; planner has discretion to merge or split based on dep-graph and LOC budget per plan.

---

## Claude's Discretion

- File naming/grouping under `src/widget/` (consolidating `selfWriteSuppression` into `debouncedWriter` if cleaner; splitting `liveModeViewPlugin.ts` from `readingModeProcessor.ts`).
- `fenceIndex` computation (counting prior `\`\`\`leetcode-solve` openers vs. Lezer syntax-tree walk).
- Property-test corpus size (100+ minimum) and tooling choice (fast-check vs. hand-written generator).
- Diagnostic gating (always-on vs. behind a verbose-logging flag).
- Specific test files lifted from `tests/main/` to seed Phase 19 coverage (e.g., `findCodeFence` tests if helper migrates).

## Deferred Ideas

(See CONTEXT.md `<deferred>` for the canonical list.)

- VIM-02 live `Compartment.reconfigure` — Phase 20.
- ACTION-* in-widget action row — Phase 20.
- ACTION-03 metadataCache language reactivity — Phase 20.
- SYNC-04/05 external-edit reconciliation + conflict modal — Phase 20.
- PROTECT-01/02 narrowed `sectionProtectionExtension.ts` — Phase 20.
- THEME-04 live re-themeing — Phase 20.
- PROTECT-03 `'leetcode.*'` userEvent convention removal — Phase 22.
- MIGRATE-* v1.2 fence-tag migration — Phase 21.
- DELETE-* legacy file deletions — Phase 22.
- POLISH-01 `useInlineWidget` default ON + fork removal — Phase 22.
- THEME-05 visual regression gate — Phase 22.
- POLISH-04 README v1.3 docs — Phase 22.
- Multi-pane live/mirror (MULTI-01, MULTI-02) — v1.4+.
- Empirical probe of `mousedown.stopPropagation()` effectiveness — surfaces inside Plan 19-01/19-03 dev-vault testing; persistence map ships regardless.
