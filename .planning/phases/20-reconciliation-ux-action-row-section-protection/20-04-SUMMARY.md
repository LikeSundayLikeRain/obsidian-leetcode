---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 04
subsystem: live-theme-retheme / multi-pane Take-Over affordance / polish
tags:
  - theme-retheme
  - multi-pane
  - polish
  - vertical-slice
requirements_complete:
  - THEME-04
dependency_graph:
  requires:
    - "Phase 19 widget foundation: WidgetController, widgetRegistry (with `*values()` iterator added in Plan 20-01)"
    - "Plan 20-01: WidgetController.reconfigureVim + per-widget vimCompartment (added the `WidgetControllerLike.reconfigureVim` shape that 20-04 mirrors with `cssRetheme` + `setPaneState`)"
    - "Plan 20-02: WidgetController.actionRow + isEmbed gate established for action-row mount; 20-04 reuses the same embed gate to skip multi-pane affordance for transcluded widgets"
    - "src/widget/embedDetect.ts: isEmbedContext probe (Phase 19 EMBED-01..04) — captured at mount and stored on the controller"
  provides:
    - "src/widget/themeListener.ts: registerThemeListener(plugin) — single global app.workspace.on('css-change') subscription that walks widgetRegistry.values() and calls ctl.cssRetheme() per widget"
    - "src/widget/multiPaneCoordinator.ts: registerMultiPaneCoordinator(plugin) + reconcileFocus(activeView, plugin) — single global active-leaf-change + layout-change subscription; flips data-pane-state per widget"
    - "WidgetController.cssRetheme(): void — calls only view.requestMeasure(); no rebuild; cursor + scroll + undo preserved"
    - "WidgetController.setPaneState(state: 'active' | 'peer'): void — toggles data-pane-state attribute + mounts/unmounts .lc-takeover-overlay + .lc-takeover-cta button"
    - "WidgetController.isEmbed: boolean (captured at mount) + WidgetController.takeoverOverlay: HTMLDivElement | undefined + WidgetController.paneState: 'active' | 'peer' field"
    - "styles.css: lc-nested-editor[data-pane-state] + lc-takeover-overlay + lc-takeover-cta block — Obsidian CSS variables only (UI-SPEC §3 contract)"
    - "main.ts: registerThemeListener(this) + registerMultiPaneCoordinator(this) called inside the existing useInlineWidget=ON onload block"
  affects:
    - "src/widget/WidgetController.ts: cssRetheme + setPaneState + promoteThisPane methods; isEmbed/takeoverOverlay/paneState fields; mountLeetCodeWidget sets initial data-pane-state='active' on the container; isEmbed flag captured at action-row mount gate; destroy() removes overlay if present"
    - "src/widget/widgetRegistry.ts: WidgetControllerLike.cssRetheme + setPaneState declared optional in the structural contract (allows test fixtures to omit while production controllers always satisfy)"
    - "src/main.ts: imports registerThemeListener + registerMultiPaneCoordinator; both registrations placed alongside the layout-change vim dispatcher inside the useInlineWidget=ON gate"
    - "styles.css: appended ~50 LOC lc-takeover-* selectors at file end; does NOT collide with Plan 20-03's lc-conflict-* block"
tech_stack:
  added: []
  patterns:
    - "Single-listener fan-out via widgetRegistry.values() iterator — both css-change and active-leaf-change subscribe ONCE and broadcast to N controllers (mirrors the layout-change vim dispatcher from Plan 20-01)"
    - "view.requestMeasure() as the entire retheme primitive — no EditorView rebuild; the cascading CSS classes (lc-nested-editor + HyperMD-codeblock + childEditorSemanticClasses Lezer→CSS-class outputs) already pick up the new theme's CSS variables; requestMeasure only nudges CM6 to recompute layout-affected metrics on the next animation frame"
    - "Container data-pane-state attribute as the visual state machine — CSS rule [data-pane-state='peer'] > .lc-takeover-overlay reactively shows/hides the overlay; setPaneState only flips the attribute + mounts/unmounts the overlay"
    - "createElement + textContent + setAttribute (NO innerHTML) for overlay + CTA construction — T-20-04-03 mitigation; CTA copy hardcoded 'Click to take over' + descriptive title attribute (UI-SPEC §Copywriting)"
    - "Click promotion via app.workspace.setActiveLeaf(<leaf>) — synchronously fires active-leaf-change so the coordinator listener flips state in the same animation frame (~16ms race window per UI-SPEC §3)"
    - "Embed gate at TWO levels (defense-in-depth): coordinator filter early-returns setPaneState('active') for embed widgets; WidgetController.setPaneState ALSO enforces the gate so direct calls bypassing the coordinator can't accidentally mount overlays on embeds"
    - "Subscribe to both active-leaf-change + layout-change (per src/solve/ephemeralTabStore.ts:42-47 precedent) — pane create/teardown doesn't always fire active-leaf-change cleanly, so layout-change is the safety net"
    - "Idempotent setPaneState — early-return when paneState already matches; guards against redundant overlay re-mount on every active-leaf-change fire"
key_files:
  created:
    - path: "src/widget/themeListener.ts"
      loc: 88
      purpose: "Single export registerThemeListener(plugin); subscribes to app.workspace.on('css-change'); walks widgetRegistry.values() and calls ctl.cssRetheme() per controller. Defensively skips controllers without cssRetheme. JSDoc documents MutationObserver fallback for older Obsidian (NOT shipped — event verified at obsidian.d.ts:7137 in 1.12.3)."
    - path: "src/widget/multiPaneCoordinator.ts"
      loc: 158
      purpose: "Two exports: registerMultiPaneCoordinator(plugin) + reconcileFocus(activeView, plugin). Subscribes to active-leaf-change + layout-change. reconcileFocus walks widgetRegistry.values(): same-leaf widgets stay 'active'; peer-leaf widgets for the same file path flip to 'peer'; widgets on different files always 'active'; embed widgets always 'active'. Pure function exposed for direct unit tests."
    - path: "tests/widget/themeListener.test.ts"
      loc: 171
      purpose: "5 cases: (1) registerEvent shape; (2) fan-out across 2 widgets; (3) WidgetController.cssRetheme dispatches only view.requestMeasure (no rebuild); (4) empty-registry no-op; (5) controllers without cssRetheme silently skipped."
    - path: "tests/widget/multiPaneCoordinator.test.ts"
      loc: 256
      purpose: "10 cases: listener registration shape (active-leaf-change + layout-change); 2 widgets same file → A active / B peer with overlay mounted; single widget always active; cross-file no-op; no-active-view reset; setPaneState attribute + overlay mount/unmount; idempotent re-mount guard; embed gate enforcement; click → setActiveLeaf promote path; reconcileFocus pure-function callable."
  modified:
    - path: "src/widget/WidgetController.ts"
      changes: "Added cssRetheme() (calls only view.requestMeasure with try/catch); setPaneState(state) toggling data-pane-state + mounting overlay+CTA on 'peer'; promoteThisPane() helper (walks getLeavesOfType to find owning leaf and calls setActiveLeaf); fields isEmbed, takeoverOverlay, paneState; destroy() cleanup of overlay; mountLeetCodeWidget sets initial data-pane-state='active' on container and records isEmbed flag at the action-row gate."
    - path: "src/widget/widgetRegistry.ts"
      changes: "WidgetControllerLike interface: added optional cssRetheme + setPaneState members so the dispatcher iterators can defensively call them when present (declared in Task 1; carried through Task 2)."
    - path: "src/main.ts"
      changes: "Imported registerThemeListener + registerMultiPaneCoordinator from src/widget/. Inside the useInlineWidget=ON onload gate, added registerThemeListener(this) and registerMultiPaneCoordinator(this) alongside the existing layout-change vim dispatcher (Plan 20-01)."
    - path: "styles.css"
      changes: "Appended ~50 LOC lc-takeover-* block after the Plan 20-03 lc-conflict-* block. Selectors: .lc-nested-editor[data-pane-state] (position:relative), .lc-nested-editor[data-pane-state='active'] > .lc-takeover-overlay (display:none), .lc-nested-editor[data-pane-state='peer'] > .lc-takeover-overlay (absolute inset:0 + var(--background-secondary) backdrop opacity:0.55 + flex-center + pointer-events:auto + z-index:5), :hover (border var(--interactive-accent)), .lc-takeover-cta (var(--background-primary) bg + var(--text-normal) text + var(--background-modifier-border) border, 13px 500 weight). Obsidian CSS variables only — no raw hex."
key_decisions:
  - "Multi-pane affordance — locked to 'greyed-out + CTA' option per UI-SPEC §3 (CONTEXT D-04 'Claude's Discretion' line 90). Frozen-readonly snapshot and banner-across-both-panes alternatives REJECTED: the greyed-out overlay's pointer-events:auto captures peer-pane clicks before they reach CM6 (T-20-04-01 keystroke-to-peer mitigation), and the centered CTA is the lowest-cognitive-load explicit affordance."
  - "L10 single-active-per-file is the v1.3 baseline (REQUIREMENTS.md Q4). Peer panes show CTA only — they do NOT live-mirror the editor. MULTI-01/02 (true live-mirror) deferred to v1.4+ per CONTEXT L10."
  - "Single global listener per event (css-change AND active-leaf-change) instead of per-widget subscriptions — every theme change / focus change is a single global event; subscribing per-widget would multiply the cost linearly with widget count for zero benefit. The fan-out via widgetRegistry.values() is the canonical Phase 20 pattern (mirrors the layout-change vim dispatcher in Plan 20-01)."
  - "view.requestMeasure() is the entire retheme path — NO EditorView rebuild. The cascading CSS class chain already inherits Obsidian's CSS variables, so a theme swap repaints them via Obsidian's stylesheet replace; requestMeasure only nudges CM6 to recompute layout-affected metrics (line height, gutter widths, scroll offsets) AFTER the new computed styles apply. Cursor + scroll + undo preserved (Phase 16 Pitfall C analog)."
  - "MutationObserver fallback for css-change DOCUMENTED (in themeListener.ts JSDoc) but NOT shipped — the event is verified to exist at obsidian.d.ts:7137 in 1.12.3. The fallback is reserved for a hypothetical future Obsidian breaking change; defense-in-depth shim left in JSDoc as forward-reference only."
  - "Subscribe to BOTH active-leaf-change AND layout-change (per src/solve/ephemeralTabStore.ts:42-47 precedent). Pane create/teardown doesn't always fire active-leaf-change cleanly; layout-change is the safety net so a freshly-split pane gets correctly-styled widgets on first paint."
  - "Embed gate at TWO levels: coordinator filter (early-return setPaneState('active') for ctl.isEmbed===true) AND WidgetController.setPaneState (defense-in-depth — direct callers bypassing the coordinator can't accidentally mount overlays on embed widgets). The mount-time isEmbed flag is captured from the existing isEmbedContext probe used by the action-row gate (Plan 20-02), reusing the same signal."
  - "Click→promote via app.workspace.setActiveLeaf(<leaf>) — synchronously fires active-leaf-change so the coordinator's listener catches it and flips state in the same animation frame (~16ms race window). Walk getLeavesOfType('markdown') and use el.contains(this.container) to locate this widget's owning leaf; setActiveLeaf with { focus: true }."
  - "Initial data-pane-state='active' set at container mount (mountLeetCodeWidget). The coordinator may not fire its first listener before the widget paints (Phase 19 codeBlockProcessor mounts run synchronously); without an initial attribute, the [data-pane-state='active'] CSS rule wouldn't match and the overlay would render visible momentarily on first paint. This guarantees the visual contract on the very first frame."
  - "Idempotent setPaneState — early-return when paneState already matches the requested state. Active-leaf-change fires on every focus event including focus-self; without the gate the dispatcher would re-set the attribute + check overlay state on every fire (bounded cost but cheaper to short-circuit)."
  - "DOM construction uses createElement + textContent + setAttribute exclusively — NO innerHTML (T-20-04-03 mitigation; CLAUDE.md no-innerHTML rule). CTA copy hardcoded 'Click to take over' + title attribute 'This file is being edited in another pane. Click to take over and edit here.' per UI-SPEC §Copywriting."
metrics:
  duration_minutes: 35
  completed: 2026-05-29
---

# Phase 20 Plan 04: Live Theme Retheme + Multi-Pane Take-Over Affordance Summary

**One-liner:** THEME-04 live retheme via app.workspace.on('css-change') + view.requestMeasure() — no EditorView rebuild — and multi-pane Take-Over affordance: peer-pane widgets greyed at 55% with "Click to take over" CTA, click promotes via app.workspace.setActiveLeaf in one animation frame, all wired through a single registry-walking active-leaf-change + layout-change coordinator and gated to skip embeds. L10 single-active-per-file invariant preserved.

## What Shipped

### Task 1 — Theme listener + WidgetController.cssRetheme (THEME-04)

- **`src/widget/themeListener.ts`** (88 LOC, NEW): single export `registerThemeListener(plugin)`. Body subscribes to `plugin.app.workspace.on('css-change', cb)` (verified at `obsidian.d.ts:7137` in 1.12.3); the callback walks `plugin.widgetRegistry.values()` and calls `ctl.cssRetheme()` on every controller that exposes the method. Defensive guards: try/catch per controller (a single retheme failure doesn't block peers); skip when registry is missing; skip when `cssRetheme` is missing (test fixtures). JSDoc documents the MutationObserver fallback per RESEARCH §"Pattern 7" lines 642-649 — NOT shipped (event verified to exist).

- **`WidgetController.cssRetheme()`** added: body is exactly `try { this.view.requestMeasure(); } catch {}`. NO EditorView rebuild; NO DOM mutation; NO Compartment.reconfigure; NO dispatch. The cascading CSS class chain (`lc-nested-editor` + `HyperMD-codeblock` + `childEditorSemanticClasses` Lezer→CSS-class outputs) carries the retheme via Obsidian's normal stylesheet replace. The method exists only to nudge CM6 to recompute layout-affected metrics (line height, gutter widths, scroll offsets) on the next animation frame.

- **`src/main.ts:Plugin.onload()`**: `registerThemeListener(this)` placed inside the existing `if (useInlineWidget) {...}` block (line ~1016) alongside the Plan 20-01 layout-change vim dispatcher.

- **Tests** (`tests/widget/themeListener.test.ts`, 171 LOC, 5/5 PASS):
  - Behavior 1: workspace.on subscription + EventRef threaded through registerEvent
  - Behavior 2 + 4: fan-out across 2 controllers (single css-change → cssRetheme called once on each)
  - Behavior 3: cssRetheme dispatches ONLY view.requestMeasure — no other view methods
  - Empty registry: no-op without throwing
  - Controllers without cssRetheme: silently skipped

**Commit:** `e270668` — `feat(20-04): live theme retheme via app.workspace.on('css-change') (THEME-04)`

### Task 2 — Multi-pane coordinator + setPaneState + overlay (UI-SPEC §3)

- **`src/widget/multiPaneCoordinator.ts`** (158 LOC, NEW): two exports — `registerMultiPaneCoordinator(plugin)` and `reconcileFocus(activeView, plugin)`. The handler:
  1. Resolves `activeView = workspace.getActiveViewOfType(MarkdownView)` (try/catch wraps for hostile test envs).
  2. `reconcileFocus(activeView, plugin)` walks `widgetRegistry.values()`:
     - Embed widgets (`ctl.isEmbed === true`): `setPaneState('active')`.
     - No active view OR no active file: every widget back to `'active'` (UI-SPEC §3 line 322 "accept-the-no-op").
     - Different file path: `setPaneState('active')` (no contention with focused note).
     - Same file path: walk `ctl.container.closest('.workspace-leaf')` and `activeView.containerEl.closest('.workspace-leaf')`; same leaf → `'active'`, different leaf → `'peer'`.
  3. Subscribes to BOTH `active-leaf-change` (primary trigger) AND `layout-change` (companion for pane create/teardown — per `src/solve/ephemeralTabStore.ts:42-47` precedent).

- **`WidgetController.setPaneState(state: 'active' | 'peer')`** added:
  - Embed gate (defense-in-depth): if `this.isEmbed === true`, force `'active'` regardless of requested state.
  - Idempotent: early-return when current paneState matches requested.
  - `setAttribute('data-pane-state', state)` on the container.
  - On `'peer'`: mount `.lc-takeover-overlay` div (role="button", tabindex="0") containing `.lc-takeover-cta` button (textContent "Click to take over", title attribute per UI-SPEC §Copywriting). Click handler calls `promoteThisPane()`. Keyboard handler (Enter/Space) routes to same.
  - On `'active'`: remove overlay div if present.

- **`WidgetController.promoteThisPane()`** added (private): walks `app.workspace.getLeavesOfType('markdown')`, finds the leaf whose `containerEl.contains(this.container)` is true, calls `app.workspace.setActiveLeaf(leaf, { focus: true })`. The setActiveLeaf side effect synchronously fires `active-leaf-change`; the coordinator's listener catches it and flips state in the same animation frame (~16ms race window per UI-SPEC §3).

- **Controller fields:** `isEmbed: boolean` (captured at mount from existing `isEmbedContext` probe used by the action-row gate), `takeoverOverlay?: HTMLDivElement`, `paneState: 'active' | 'peer' = 'active'`.

- **`mountLeetCodeWidget`**: sets initial `data-pane-state='active'` on the container at construction; records `ctl.isEmbed = isEmbed` at the embed-context probe (line ~840). `destroy()` removes the overlay if mounted.

- **`styles.css`** (~50 LOC appended after Plan 20-03's lc-conflict-* block):
  - `.lc-nested-editor[data-pane-state] { position: relative }` (anchor for absolute overlay)
  - `[data-pane-state='active'] > .lc-takeover-overlay { display: none }`
  - `[data-pane-state='peer'] > .lc-takeover-overlay`: absolute inset:0, `background: var(--background-secondary)`, `opacity: 0.55`, flex-center, `pointer-events: auto`, z-index 5, `border-radius: 4px`
  - `:hover { border: 1px solid var(--interactive-accent) }`
  - `.lc-takeover-cta`: pill 12px 16px padding, `background: var(--background-primary)`, `color: var(--text-normal)`, `border: 1px solid var(--background-modifier-border)`, 13px / 500 weight, hover ring `var(--interactive-accent)`. Obsidian CSS variables only — no raw hex.

- **`src/main.ts:Plugin.onload()`**: `registerMultiPaneCoordinator(this)` placed inside the `useInlineWidget=ON` onload block alongside `registerThemeListener(this)`.

- **Tests** (`tests/widget/multiPaneCoordinator.test.ts`, 256 LOC, 10/10 PASS):
  - Coord Test 1: registers BOTH active-leaf-change AND layout-change subscriptions
  - Coord Test 2: 2 widgets same file, different leaves — A active / B peer; container attributes flip correctly; B mounts overlay, A does not
  - Coord Test 3: single widget always active (no peer)
  - Coord Test 4: active view on different file → every widget reset to active
  - Coord Test 4b: no active markdown view → every widget back to active
  - setPaneState 1+2: peer mounts overlay+CTA with correct text + title; active removes overlay
  - setPaneState idempotent: repeated 'peer' does NOT double-mount
  - setPaneState 3 (embed gate): isEmbed widgets always active even when coordinator filter wouldn't have caught them
  - Click promote: overlay click → setActiveLeaf called with the widget's owning leaf
  - reconcileFocus: pure function exposed for direct unit testing without subscription wrapper

**Commit:** `7ee8d52` — `feat(20-04): multi-pane Take-Over affordance (greyed-out + CTA per UI-SPEC §3)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking type mismatch] `getActiveViewOfType` structural shape too tight**
- **Found during:** Task 2 first tsc run after `registerMultiPaneCoordinator` integration in `src/main.ts`
- **Issue:** Initial `MultiPaneCoordinatorHost` declared `getActiveViewOfType<T>(type: new (...args: unknown[]) => T): T | null`. TypeScript reported `TS2345 Argument of type 'this' is not assignable to parameter of type 'Plugin & MultiPaneCoordinatorHost'` — Obsidian's actual signature is `<T extends View>(type: Constructor<T>) => T | null` and the structural intersection complained about the constructor variance (`Constructor<T>` vs `new (...args: unknown[]) => T`).
- **Fix:** Loosened the structural type to `getActiveViewOfType: (type: unknown) => unknown`; cast result through `unknown` at the call site (`(... ?? null) as MarkdownView | null`). Production callers satisfy the wider Obsidian signature; unit tests pass `vi.fn()` returning whatever they configure.
- **Files modified:** `src/widget/multiPaneCoordinator.ts` (interface + handler call site)
- **Re-verified:** tsc clean (exit 0); both new test files pass.

### Auth gates: None — no external services touched.

### CLAUDE.md adherence

- **`'leetcode.*'` userEvent convention**: not exercised. Coordinator dispatches no CM6 transactions; setPaneState only mutates container attributes + DOM children. No filter bypass needed.
- **Canonical plugin write-path pattern (Phase 17 D-05)**: not exercised. setPaneState does not touch the fence body; vault writes remain in Phase 19's debouncedWriter as the single channel.
- **No-innerHTML rule**: enforced — all overlay/CTA construction uses `createElement` + `textContent` + `setAttribute`. Verified via `grep -nE "innerHTML" src/widget/multiPaneCoordinator.ts src/widget/themeListener.ts src/widget/WidgetController.ts` returning 0 hits in the new code paths.
- **`registerEvent()` lifecycle cleanup**: both new global listeners (css-change + active-leaf-change + layout-change) registered through `plugin.registerEvent(ref)` so plugin unload auto-unregisters.

## Verification

- `npx tsc --noEmit` → exit 0
- `npx vitest run tests/widget/themeListener.test.ts tests/widget/multiPaneCoordinator.test.ts` → **15/15 pass**
- `npm test` → **234 test files pass, 1 skipped (235 total); 2057 tests pass, 6 skipped (2063 total)** — no regressions introduced by Plan 20-04
- `npm run build` → exit 0; bundle 1,755,658 bytes (~1.71 MB) — well within milestone headroom (~92 KB headroom from PROJECT.md)
- Phase-level verification checks (from PLAN.md `<verification>`):
  1. `wc -l src/widget/themeListener.ts` → 88 (target ~20; expanded slightly with JSDoc + structural type + defensive guards — within tolerance)
  2. `wc -l src/widget/multiPaneCoordinator.ts` → 158 (target ~80; expanded with structural type, helper exports, two-listener subscription, and JSDoc — within tolerance)
  3. `grep -nE "css-change" src/widget/themeListener.ts` → 2 hits (subscription + JSDoc reference)
  4. `grep -nE "active-leaf-change" src/widget/multiPaneCoordinator.ts` → present
  5. `grep -nE "data-pane-state" src/widget/WidgetController.ts styles.css` → 6+ hits across both files
  6. `grep -nE "innerHTML" src/widget/multiPaneCoordinator.ts src/widget/themeListener.ts` → 0 hits
  7. Both new test files pass
  8. Full suite green
  9. Manual UAT items pending — see "Manual UAT Items" below
  10. styles.css uses only Obsidian CSS variables — verified via inspection (no raw hex except documented existing AI-Solution gradient `#7c3aed → #4f46e5` and `rgba(0,0,0,0.15)` popover-shadow precedent, neither modified by this plan)
  11. tsc clean; build clean

## Manual UAT Items (deferred to dev-vault probe)

Per 20-VALIDATION.md "Manual-Only Verifications" — both classified as Manual-Only because automated DOM tests cannot validate Obsidian's runtime stylesheet replace + cross-pane focus.

### Surface 4 — Live theme retheme (T1-T4)

| Test | Action | Pass criterion |
|------|--------|----------------|
| **T1** light/dark toggle | Open LC note with widget mounted; in Obsidian Settings → Appearance, toggle Light → Dark | Widget body background flips within ~16ms; syntax highlight colors update; cursor stays at same line:col; scroll position unchanged; undo stack intact (Cmd-Z reverts last typed character, NOT the theme change) |
| **T2** Minimal theme swap | With note open, swap to Minimal theme | Widget retheme observed; no white flash; 8 language packs all repaint correctly |
| **T3** Things theme swap | Swap to Things theme | Same as T2 |
| **T4** reduced-motion | Enable `prefers-reduced-motion`; toggle theme | Instant repaint, no animation |

**Status:** PENDING — to be executed in the dev vault per 20-VALIDATION row §"Manual-Only Verifications" / D-plan-02 Day 4 dogfood.

### Surface 3 — Multi-pane Take-Over CTA

| Test | Action | Pass criterion |
|------|--------|----------------|
| Two-pane open | Open same LC note in two split panes | Pane A widget editable; pane B widget greyed (55% opacity backdrop) with "Click to take over" CTA centered |
| Click promote | Click pane B's CTA | Pane A demotes (greys with CTA); pane B promotes (editable); transition completes within 1 animation frame |
| Reverse promote | Click pane A's CTA | Pane A re-promotes; pane B demotes |
| Embed skip | Open a note that transcludes the LC fence (`![[lc-note#Code]]`) in a second pane | Embed widget shows underlying content; NO greyed overlay; NO CTA (embed gate) |

**Status:** PENDING — to be executed in the dev vault per 20-VALIDATION row §"Manual-Only Verifications".

## Known Stubs

None — both surfaces ship with full data wiring. No placeholder text, no hardcoded empty values, no "coming soon" affordances.

## Threat Flags

None new. Phase 20 introduces zero new package dependencies; the multi-pane affordance opens no new network endpoints, auth paths, or file-access patterns. The threat register from `<threat_model>` (T-20-04-01..07 + T-20-04-SC) is fully covered:

- T-20-04-01 (multi-pane race) → mitigated via L10 + setPaneState's pointer-events:auto overlay capturing peer-pane clicks before they reach CM6
- T-20-04-02 (DoS via active-leaf-change) → mitigated via O(N) reconcileFocus + idempotent setPaneState early-return
- T-20-04-03 (DOM XSS) → mitigated via createElement + textContent (NO innerHTML)
- T-20-04-04 (theme spoofing) → accepted (community theme review prevents arbitrary DOM injection)
- T-20-04-05 (non-theme css-change) → accepted (requestMeasure idempotent)
- T-20-04-06 (overlay info disclosure) → accepted (user owns the content)
- T-20-04-07 (click race) → mitigated (synchronous setActiveLeaf → active-leaf-change → setPaneState in same animation frame)
- T-20-04-SC (slopsquatted package) → mitigated (zero new dependencies)

## Phase 20 Closeout

This is the final plan in Phase 20. All four waves now complete:

- **20-01** (Foundation): section protection narrowing + vim live-reconfigure ✅
- **20-02** (UX): action row + chevron + *FromWidget methods ✅
- **20-03** (Sync): external-edit reconciliation + conflict modal + 3-pane diff ✅
- **20-04** (Polish): live theme retheme + multi-pane Take-Over affordance ✅ ← THIS PLAN

**Next action:** `/gsd-verify-work` to gate on Phase 20 acceptance criteria from CONTEXT/ROADMAP. After verification passes, Phase 20 is complete and the v1.3 widget UX loop closes — Phase 22 can flip `useInlineWidget` to default ON without UX regressions.

## Self-Check: PASSED

- [x] `src/widget/themeListener.ts` exists (88 LOC)
- [x] `src/widget/multiPaneCoordinator.ts` exists (158 LOC)
- [x] `tests/widget/themeListener.test.ts` exists (171 LOC, 5 cases)
- [x] `tests/widget/multiPaneCoordinator.test.ts` exists (256 LOC, 10 cases)
- [x] Commit `e270668` — Task 1 (THEME-04 theme listener)
- [x] Commit `7ee8d52` — Task 2 (multi-pane coordinator)
- [x] tsc clean
- [x] Full suite 2057/2063 pass (no Plan 20-04 regressions)
- [x] Build clean (1.71 MB bundle)
