---
slug: phase-18-regressions
status: open
trigger: "All three Phase 18 plans (18-01 vim Scope, 18-02 vault.on recovery + stale-child invalidation, 18-03 relative line numbers) shipped passing unit tests but introduced major UAT regressions when deployed to the user's vault. All three reverted; need redesign."
created: 2026-05-25
related_phase: 18-vim-recovery-polish
related_uat: .planning/phases/17-polish-edge-cases/17-UAT.md (Tests 17, 23, 24, 25)
---

# Phase 18 Regressions — Live UAT 2026-05-25

After all three Phase 18 plans merged (commits ac54eb3, eabec6a, 60c5cdf — all reverted in cf7cd51 / dc886a1 / 98dec9b), the user reported live UAT failures across multiple surfaces. Unit tests (1738 green) did not surface any of these.

## Plan 18-01 — Vim Scope intercept

Multiple regressions, intermittent:

- **Esc no longer returns Insert→Normal mode.** Scope intercept appears to swallow Esc keystroke before vim's modal state machine sees it.
- **`o`/`i`/`a`/`s` Insert-mode entry intermittently fails to enable typing.** Status panel updates to `--INSERT--` but the editor doesn't accept input until the user presses i/a/s a second time.
- **`:set nu` / `:set nonu` aliases are no-ops.** Gutter shows line numbers regardless. The `Vim.defineEx` registration may not be registering as expected, OR the alias is being routed away by the Scope.
- **NEW POSITIVE:** j/k/dd/o navigation no longer leaks to parent editor (the bug 18-01 was meant to fix). So the routing direction works — but the over-aggressive intercept is breaking modal state and Insert-mode keystrokes.

**Hypothesis:** The Scope intercept registers too many keys (or registers them at the wrong priority). Vim's modal state machine relies on key events flowing through CM6's vim() extension's input handler, which our Scope is bypassing for navigation keys but apparently also for Esc and Insert-mode initiator keys.

**Likely fix path for redesign:**
- NARROW the intercepted key set: only intercept the keys that empirically leak (h/j/k/l/d/y/p/x). DO NOT intercept i/a/o/s/Esc/`:`/visual-mode keys — those should flow through CM6's vim() naturally.
- Verify in-DOM what keys actually leak via DevTools `keydown` listener probe BEFORE coding the fix.
- Consider a different mechanism entirely: instead of Scope-on-app.keymap, use a CM6 keymap.of with `precedence: 'highest'` on the child's extension array — keeps the intercept inside CM6's pipeline.

## Plan 18-02 — vault.on('modify') recovery + stale-child invalidation

**CRITICAL: chevron switch to python3 or c produces blank Code section.** Reproduced on user's vault:

- Open Java problem note → Code section renders correctly.
- Use chevron to switch to Python3 → fence opener becomes ` ```python ` (Phase 5.3 D-04 remaps python3→python for Prism), `lc-language: python3` in frontmatter.
- Code section goes BLANK. `.lc-nested-editor` div exists in DOM but is empty (no `.cm-content` inner editor).
- Same for switching to C (slug `c` → fence opener ` ```cpp ` due to D-04 remap).
- Other languages (java, javascript, rust, go, cpp directly) are fine.
- Reverting just 18-02 fixes the regression.

**Confirmed root cause:** `checkStaleChildAndInvalidate` in src/main.ts:2751 was reading `openerSlug` via `readActiveFenceSlug` which returned the RAW fence tag (e.g., `python` after a python3 switch). That disagreed with `currentSlug` from the tracker (`python3`), tripping the registry.delete path. Even after a hotfix that normalized `readActiveFenceSlug` via `resolveLangSlug` to alias-resolve `python → python3` and `cpp → c`, the bug PERSISTED — the user reported "still broken" with the normalization in place. So the normalization fix was insufficient OR there's a second causal path.

**Possible additional cause:** The vault.on('modify') listener may be firing during the chevron's switchFenceLanguage write, and triggerRepairFromVaultModify may be running against the in-flight state where findCodeFence transiently returns null (during the rewrite). Mid-flight repair dispatch could be corrupting the parent CM6 state.

**Likely fix path for redesign:**
- Re-confirm the bug presence on baseline (DONE 2026-05-25 — clean on Phase 17 round-3 baseline, broken with 18-02 applied).
- Add diagnostic instrumentation BEFORE coding: log every checkStaleChildAndInvalidate invocation with all three slugs (currentSlug, fmLang, openerSlug-raw, openerSlug-normalized).
- Consider whether checkStaleChildAndInvalidate is the right approach at all — Plan 17-09's per-child language tracker plus Plan 17-13's CM6 update listener may already cover the legitimate stale-child cases. The 999.3 reproduction may have been a one-off vim-driven write that doesn't actually need a state-invalidation gate.
- For the vault.on path (Bug 1 — vim dd bypass), verify whether triggerRepairFromVaultModify causes the regression or just checkStaleChildAndInvalidate.

## Plan 18-03 — Relative line numbers

Confirmed broken in live UAT but no regressions to other features:

- Toggle setting ON in plugin settings → reload app → child editor still shows ABSOLUTE line numbers, not relative.
- The relative formatter is not reaching the gutter.

**Hypothesis:** The new `getShowRelativeLineNumbers()` accessor may not be wired through the path. The plan added a 7th parameter to `createChildEditor`, but the path through `nestedEditorExtension.ts:NestedEditorWidget.toDOM` may not be passing it. Verified test expectations passed but DOM behavior didn't — classic "tested the contract but not the integration" gap.

**Likely fix path:** read the live computed gutter span text via DevTools to confirm whether `formatNumber` is being called at all, then trace back through the createChildEditor call chain.

## Decisions for Phase 18 redesign

1. **Maintain v1.2 scope** — user has confirmed all three plans must ship before v1.2 release.
2. **Re-plan from scratch** — the existing 18-01/02/03 PLAN.md files have shape mismatches with reality (e.g., plan claimed `src/main.ts:920` was the slug-mismatch invalidation callsite when actually the issue was checkStaleChildAndInvalidate at line 2751 + readActiveFenceSlug raw return at line 2826). Don't iterate on the existing plans.
3. **Run live diagnostic probes BEFORE writing fix code** — the unit-test pattern that worked in Phase 17 didn't catch any of these regressions. Live DOM probes (DevTools snippets that the user runs and pastes back) are the only path that catches these.
4. **Be much more surgical** — narrower key sets, narrower gates, no broad-brush patterns like "intercept all vim navigation keys". 

## Reverted commits

- `60c5cdf` (18-03 merge) → reverted in `dc886a1`
- `eabec6a` (18-01 merge) → reverted in `cf7cd51`
- `ac54eb3` (18-02 merge) → reverted in `98dec9b`

Tree is back at Phase 17 round-3 baseline (HEAD = `98dec9b`, all unit tests green at 1713 passed).
