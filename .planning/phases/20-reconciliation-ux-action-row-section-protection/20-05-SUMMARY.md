---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 05
status: complete
gap_closure: true
closes_gaps: ["multi-pane-cta-asymmetric", "widget-thrash-on-type"]
tasks_completed: 4
tasks_deferred: 1
manual_uat: deferred-to-phase-end
---

# Plan 20-05 Summary — Cluster A (per-pane registry + Hook 1 echo gate)

## Objective

Fix the multi-pane Take-Over CTA asymmetry (gap 3) and widget-thrash-on-type
(gap 4) blockers from `20-HUMAN-UAT.md` Test 4. Two compounding defects:

  PRIMARY — `WidgetController.ts` registered controllers under
  `${file.path}::${fenceIndex}` (pane-blind). Two panes on same file produced
  identical keys; `Map.set` clobbered.

  AMPLIFIER — `src/main.ts` Hook 1 called `flushAll()` synchronously on every
  active-leaf-change, including same-leaf focus reaffirmations.

## Tasks

- [x] Task 1 — Per-pane registry key shape on WidgetController + mountLeetCodeWidget
- [x] Task 2 — LeetCodeFenceWidget destroy via stored mountedCtlKey + LeetCodeWidgetRenderChild Blocker #5 mitigation
- [x] Task 3 — Hook 1 gated on actual file-path transition
- [x] Task 4 — Regression test + multiPaneCoordinator fixture rewrite
- [ ] Task 5 — Manual UAT (deferred to phase-end UAT loop per orchestrator decision)

## Files Modified

| File | Lines | Purpose |
|------|-------|---------|
| `src/widget/WidgetController.ts` | +71 (resolveLeafId, registryKey field, mountedRegistryKey on render child) | Per-pane key shape; Blocker #5 paired-write |
| `src/widget/LeetCodeFenceWidget.ts` | +21 / -2 | toDOM captures registryKey; destroy uses stored key |
| `src/widget/widgetRegistry.ts` | +9 / -3 (JSDoc only) | Document key shape change |
| `src/main.ts` | +35 (lastActiveLeafFilePath field + Hook 1 gate body + onunload reset) | Echo amplifier removal |
| `tests/widget/registryKeyPerPane.test.ts` | +245 (NEW) | Regression test: 4 cases (same-pane vs distinct-pane mount, leafId stability, UUID fallback) |
| `tests/widget/multiPaneCoordinator.test.ts` | 10 fabricated keys → production-shape; size === 2 assertion | Fixture conformance |

## Key Implementation Details

### `resolveLeafId(host)` algorithm

```ts
host?.closest('.workspace-leaf')   // production: real Obsidian leaf
  ?.getAttribute('data-lc-leaf-id') // existing or assign new
  ?? crypto.randomUUID()            // detached test fixtures
```

Distinct leaves return distinct ids; same leaf returns same id across calls.

### `registryKey` vs `persistenceKey` (intentional split)

| Key | Shape | Purpose |
|-----|-------|---------|
| `registryKey` | `${file.path}::${fenceIndex}::${leafId}` | widgetRegistry — per-pane uniqueness |
| `persistenceKey` | `${file.path}::${fenceIndex}` | statePersistence — pane-blind cursor restore |

A remount in the same logical pane should still hydrate from the captured
cursor regardless of which workspace-leaf hosts it. Splitting the keys preserves
that UX while fixing the Map.set clobber.

### Blocker #5 mitigation — `LeetCodeWidgetRenderChild`

Registry key stored on the render child at the same moment the registry entry
is created (paired write inside `onload`). Onunload deletes unconditionally
via the stored field — never depends on `this.controller` being set, so the
registry can never leak even on a hypothetical race.

### Hook 1 file-path gate

```ts
const currentPath = av?.file?.path ?? null;
if (this.lastActiveLeafFilePath === currentPath) return;
this.lastActiveLeafFilePath = currentPath;
void this.widgetRegistry?.flushAll();
```

Same-leaf focus reaffirmations (mousedown → contentDOM.focus → active-leaf-change
refire) are no-ops. Cross-file transitions still flush.

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| `npx vitest run tests/widget/` | 290/290 pass (+4 from baseline 286) |
| `npx vitest run` (full project) | 2061 pass / 6 skipped / 0 fail (+4 from baseline 2057) |
| `grep -RnE '\${[a-zA-Z_.]+\.path}::\${[a-zA-Z_]+}' src/widget/ src/main.ts` | only JSDoc references + the two intentional sites |
| `grep -nE "'foo\\.md::0:[a-z]" tests/widget/multiPaneCoordinator.test.ts` | 0 matches |

## Atomic Commits

1. `6b327fd` Task 1 — per-pane registry key shape
2. `c427e32` Task 2 — LeetCodeFenceWidget destroy via stored key
3. `7b55263` Task 3 — Hook 1 file-path transition gate
4. `6513e62` Task 4 — regression test + fixture rewrite

## Manual UAT — Deferred

Per orchestrator decision (interactive mode, --gaps-only batch), Task 5's
dev-vault UAT (multi-pane CTA symmetry + typing stability) is deferred to the
phase-end UAT loop where all 4 gap-closure plans (20-05/06/07/08) are
verified together against `20-HUMAN-UAT.md` Tests 2/3/4/6.

## Deviations from Plan

- Task 2's `LeetCodeWidgetRenderChild` changes (mountedRegistryKey field +
  paired onload write + unconditional onunload delete) were committed in
  Task 1's commit because both touch `src/widget/WidgetController.ts`.
  The commit message documents the bundling.
- Task 5 manual UAT not run inline; deferred to phase-end (above).

## Phase 22 Implication

Phase 22 (flip useInlineWidget=ON) inherits this fix; multi-pane workflows
that previously produced asymmetric CTA + typing flash now work symmetrically.
