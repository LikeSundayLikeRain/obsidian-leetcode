---
phase: 21-v1-2-migration
plan: 15
subsystem: migration/widget-banner-styling
tags: [migration, banner, live-preview, css, gap-closure, phase-21, post-uat-r4, visual]
requirements: [MIGRATE-BANNER-LP-01]
gap_closure: true
wave: 2
depends_on: ["21-14"]
provides:
  - "LP banner CSS isolation: `.lc-legacy-banner--livepreview` host class + ~75 LOC styles.css scope (Task 1+2)"
  - "Visual separation between banner header (copy + CTA) and read-only fence body in Live Preview (Task 2)"
requires:
  - "Plan 21-11 — legacyBannerStateField hosting AutoMigratingBannerWidget + ManualPromptBannerWidget"
  - "Plan 21-14 — leetcodeRefreshAnnotation + StateField widening (no overlap; sibling Wave 1 modification)"
affects:
  - "src/widget/liveModeBannerStateField.ts (host classList add — both *BannerWidget.toDOM)"
  - "styles.css (new LP-scoped section at file end)"
tech-stack:
  added: []
  patterns:
    - "Top-level CSS scope class on widget host as the isolation primitive (Obsidian + CM6)"
    - "Theme-variable-only CSS (THEME-04 baseline preserved)"
    - "PHASE_22_DELETE_WITH_V1_2_PATH grep anchor on temporary v1.2 scaffolding"
key-files:
  created: []
  modified:
    - "src/widget/liveModeBannerStateField.ts"
    - "styles.css"
    - "tests/widget/liveModeBannerStateField.test.ts"
decisions:
  - "Add the LP class at the toDOM call sites (NOT inside mountLegacyFenceBanner) — the helper is mode-agnostic and shared with the Reading-mode caller in src/widget/codeBlockProcessor.ts; pushing the class into the helper would either add a third mode parameter or break Reading-mode styling"
  - "Use Obsidian CSS theme variables exclusively (`var(--background-primary)`, `var(--font-text)`, `var(--size-4-*)`, `var(--code-background)`, `var(--interactive-accent)`) — no hard-coded colors / sizes so the banner rethemes across light/dark/community themes (THEME-04 baseline)"
  - "Anchor the section with the literal token `PHASE_22_DELETE_WITH_V1_2_PATH` in the lead comment so the Phase 22 grep+delete sweep catches this CSS section alongside the StateField it scopes against"
  - "Test inspects classList on the host element returned from widget.toDOM(view) — extracted via DecorationSet.between iter (the widget classes are not exported; the StateField is the only construction path)"
metrics:
  duration: "~3 minutes"
  tasks_completed: 2
  tests_added: 2
  tests_passing: 18
  files_modified: 3
  files_created: 0
  completed: 2026-06-01
---

# Phase 21 Plan 21-15: LP Banner CSS Scope Isolation Summary

Closes UAT re-test Gap R4 (severity=minor) by adding a top-level CSS scope class to the Live-Preview migration banner hosts and adding ~75 LOC of LP-scoped CSS rules that reset CM6's block-decoration container styling so the banner no longer reads as one rounded code-block-tinted box. Reading-mode banner is untouched (its host is not wrapped by CM6 and has no class to scope against).

## What Shipped

**Two tasks, both atomic, single-cycle wave:**

1. **Task 1 (commit `e3041e3`) — host classList add + 2 RED→GREEN regression tests.**
   - `src/widget/liveModeBannerStateField.ts` — both `AutoMigratingBannerWidget.toDOM` (line ~190) and `ManualPromptBannerWidget.toDOM` (line ~228) now call `host.classList.add('leetcode-migration-banner-host', 'lc-legacy-banner--livepreview')`. Comment block above each toDOM explains the rationale and the Reading-mode contrast (Reading-mode caller of `mountLegacyFenceBanner` does NOT add the LP class — its host is not wrapped by CM6).
   - `tests/widget/liveModeBannerStateField.test.ts` — new `describe('R4 — LP banner CSS scope isolation (Plan 21-15)', ...)` block with 2 tests (R4.LP.1 and R4.LP.2). Tests extract the widget from the StateField's DecorationSet via `decos.between(...)`, call `widget.toDOM({} as EditorView)`, and assert both `.leetcode-migration-banner-host` AND `.lc-legacy-banner--livepreview` are on the returned host element. Helper function `extractBannerHost(doc, autoMigrate)` shared between tests.
   - RED gate observed: 2/2 R4.LP tests fail before source change (16 prior tests still pass). After source change: 18/18 pass.

2. **Task 2 (commit `88eff10`) — LP-scoped CSS rules.**
   - `styles.css` — new section appended at file end (line 2169 onward) with PHASE_22_DELETE_WITH_V1_2_PATH grep anchor in the lead comment. 7 selector rules using `.lc-legacy-banner--livepreview`:
     - Host wrapper: reset background to `var(--background-primary)`, border `1px solid var(--background-modifier-border)`, padding/margin via `var(--size-4-*)`, font-family `var(--font-text)`.
     - `__copy` paragraph: UI font, ui-small size, normal text color, margin-bottom separator.
     - `__cta` button: UI font, ui-small size, accent background, accent text color, no border, pointer cursor, margin-bottom for header→body separator.
     - `__cta:hover` — accent-hover background.
     - `pre` (read-only fence body): code-background, code border, monospace font, ui-smaller size, overflow-x auto.
     - `pre code` — transparent background (host `pre` already provides the code styling).
     - `.leetcode-migration-banner--auto-migrating` — compact padding (single-line ephemeral mode).
   - `grep -c 'lc-legacy-banner--livepreview' styles.css` returns 7 (≥ plan's required ≥ 7).
   - `npm run build` exits 0 (esbuild bundles CSS without syntax error).

## Architecture: why a host class, not a helper-side class

The `mountLegacyFenceBanner` helper in `src/widget/legacyFenceBanner.ts` is mode-agnostic and shared with the Reading-mode caller (`src/widget/codeBlockProcessor.ts:223-230`). Reading-mode passes the post-processor's `el` directly — that host is NOT wrapped by CM6's block-decoration container, so it has no inherited fence-block styling to fight against, and the user reports Reading-mode banner is correctly styled (UAT R3 pass).

Pushing `lc-legacy-banner--livepreview` into the helper itself would either:
1. Apply it to the Reading-mode host too — defeating the isolation (Reading mode would gain unnecessary overrides), OR
2. Require a third mode parameter ('auto-migrating' / 'manual-prompt' / 'read-only-legacy' already exist) — overloading the existing semantics for a styling concern that belongs at the call site.

The chosen shape — class added at the LP toDOM call sites — keeps the helper pure and lets the LP class encode the FACT that the host is going to be wrapped by CM6's block-decoration container.

## Tests Added (2 new, 18/18 pass)

| Suite | Tests Added | New Total | Coverage |
|-------|-------------|-----------|----------|
| `tests/widget/liveModeBannerStateField.test.ts` | 2 (R4.LP.1, R4.LP.2) | 18 | toDOM host classList contains both `.leetcode-migration-banner-host` AND `.lc-legacy-banner--livepreview` for both AutoMigratingBannerWidget AND ManualPromptBannerWidget |

## Verification Performed

- `npm test -- tests/widget/liveModeBannerStateField.test.ts --run` → 18/18 pass (16 Plan 21-11 + 21-14 prior + 2 new).
- RED gate observed: with classList.add still single-class, R4.LP.1 + R4.LP.2 both fail with `expected false to be true` on `.classList.contains('lc-legacy-banner--livepreview')`. After source change: green.
- `npm run build` → 0 (TypeScript clean + esbuild bundles styles.css without CSS syntax error).
- `grep -c 'lc-legacy-banner--livepreview' styles.css` → 7 (≥ plan's required ≥ 7: 1 comment scope reference + 6 selector rules).
- `grep -ic 'lc-legacy\|leetcode-migration-banner\|leetcode-banner' styles.css` → 8 (7 LP-class occurrences + 1 "Reading-mode banner" mention in the section comment); no pre-existing rules being shadowed.

## Decisions Made

1. **Host classList.add at the toDOM call site (NOT inside mountLegacyFenceBanner).** The helper is mode-agnostic and shared with the Reading-mode caller; pushing the class into the helper would either defeat the isolation or overload the existing mode enum. Call-site classList encodes the architectural fact ("this host will be wrapped by CM6").
2. **CSS theme variables exclusively.** All seven CSS rules use `var(--*)` from Obsidian's theme cascade — no hard-coded colors, no hard-coded sizes. THEME-04 baseline preserved across light / dark / community themes.
3. **PHASE_22_DELETE_WITH_V1_2_PATH grep anchor in the section's lead comment.** Phase 22 deletes the legacyBannerStateField + its toDOM call sites (per existing markers in liveModeBannerStateField.ts:422). The CSS section is tied to the StateField's lifetime — Phase 22 must remove it in the same sweep. The grep anchor at the top of the section's lead comment is the catch.
4. **Compact auto-migrating padding.** The 'auto-migrating' mode renders a single-line copy ('Migrating note to v1.3 format...') with no CTA and no read-only body, and the migration window is brief (~50-200ms before Plan 21-08's rerender remounts the v1.3 widget). The compact padding rule prevents an oversized empty card during the transient render.
5. **Test extraction via DecorationSet.between.** The widget classes (AutoMigratingBannerWidget, ManualPromptBannerWidget) are not exported; the StateField is the only construction path. `extractBannerHost(doc, autoMigrate)` constructs the EditorState, reads `legacyBannerStateField`, iterates the DecorationSet via `decos.between(0, doclen, (_from, _to, deco) => widget = deco.spec.widget)`, then calls `widget.toDOM({} as EditorView)`. The widget toDOM body does not consult the view, so the dummy cast is safe.

## Deviations from Plan

None — plan executed exactly as written. The grep count came in at 7 (the plan listed `≥ 7`, allowing for the section comment reference — exactly that count was achieved with 1 comment + 6 selectors).

## Threat-Model + Write-Path Hygiene

- **Static class-name strings.** Both `'leetcode-migration-banner-host'` and `'lc-legacy-banner--livepreview'` are compile-time literals — no user input flows into the classList (T-21-15-01 mitigation: `lc-legacy-banner` prefix verified unused elsewhere; `--livepreview` BEM modifier unique to this plan).
- **No vault writes** added by this plan. The toDOM bodies only build DOM and call `mountLegacyFenceBanner` (which itself is read-only on the source string and writes only via the existing [Migrate now] click handler, unchanged).
- **No CM6 dispatch** added — the toDOM execution is in the widget render path, not a transaction sink. The Phase 05.5 `'leetcode.*'` userEvent convention does not apply (no dispatch).
- **No new write-path** — the canonical Phase 17 D-05 child-editor write-path pattern is irrelevant here (no plugin write).
- **CSS layer trust boundary** unchanged. The new rules consume `var(--*)` from Obsidian's theme cascade (T-21-15-04 disposition: accept; this is the standard Obsidian theming surface — not a new attack vector).
- **DOM structure exposure** unchanged. `.leetcode-migration-banner__copy` / `__cta` were already public class names visible to user-installed CSS snippets; the new `.lc-legacy-banner--livepreview` adds one more public identifier (T-21-15-02 disposition: accept).

## Known Stubs

None. The CSS rules reference real existing class selectors in mountLegacyFenceBanner's render output:
- `.leetcode-migration-banner__copy` — `<p>` produced by `mk(banner, 'p', { cls: 'leetcode-migration-banner__copy' })` in legacyFenceBanner.ts:74-77 + 81-84.
- `.leetcode-migration-banner__cta` — `<button>` produced by `mk(banner, 'button', { cls: 'leetcode-migration-banner__cta' })` in legacyFenceBanner.ts:85-88.
- `pre` / `pre code` — produced by `renderReadOnly` in legacyFenceBanner.ts:129-146 (defensive `createEl` chain with happy-dom fallback).
- `.leetcode-migration-banner--auto-migrating` — outer `<div>` produced by `mk(host, 'div', { cls: 'leetcode-migration-banner leetcode-migration-banner--auto-migrating' })` in legacyFenceBanner.ts:70-72.

All selectors hit real DOM. No placeholders, no TODOs.

## Threat Flags

None. The two new code paths (classList.add + CSS rules) sit entirely within the existing trust boundaries from `<threat_model>`:
- T-21-15-01 (CSS class name collision) → `lc-legacy-banner` prefix verified unused (`grep -ic 'lc-legacy' styles.css` returned 0 pre-change). ✓
- T-21-15-02 (Information Disclosure via CSS) → existing class names already public; one more identifier doesn't change the surface. ✓
- T-21-15-03 (CSS bloat) → ~75 LOC vs. 2168-line styles.css; gzip-friendly; no measurable bundle regression. ✓
- T-21-15-04 (Theme variable injection) → standard Obsidian theming cascade; not a new attack vector. ✓

## Commits

| Task | Hash | Type | Files | Description |
|------|------|------|-------|-------------|
| Task 1 | `e3041e3` | feat | 2 | Add `lc-legacy-banner--livepreview` class to LP banner hosts (toDOM + RED→GREEN tests) |
| Task 2 | `88eff10` | feat | 1 | Add LP-scoped banner CSS isolating from CM6 fence styling (styles.css ~75 LOC) |

## Self-Check: PASSED

**Files exist:**
- `src/widget/liveModeBannerStateField.ts` ✓
- `tests/widget/liveModeBannerStateField.test.ts` ✓
- `styles.css` ✓

**Commits exist on branch:**
- `e3041e3` — feat(21-15): add lc-legacy-banner--livepreview class to LP banner hosts (Task 1) ✓
- `88eff10` — feat(21-15): add LP-scoped banner CSS isolating from CM6 fence styling (Task 2) ✓

**Tests pass:**
- 18/18 liveModeBannerStateField.test.ts (16 prior + 2 new R4.LP) ✓

**Build:** `npm run build` exits 0 ✓

**Plan-required grep counts:**
- `grep -c 'lc-legacy-banner--livepreview' styles.css` → 7 (≥ 7 required) ✓
