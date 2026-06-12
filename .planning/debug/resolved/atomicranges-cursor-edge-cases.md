# Debug: atomicRanges cursor-edge cases (Phase 20 PROTECT-01)

**UAT Test:** Phase 20 Test 2
**Severity:** major
**Status:** root cause identified — verified by parallel debug agent

## Symptom

Verbatim user report: *"for a and b, it actually turns into source mode instead of jump over"*

Expected: arrow-up into closer line / right-arrow at end of `## Code` heading should JUMP OVER the fence body via atomicRanges. Reality: cursor pierces the widget and Live Preview reveals raw source.

## Root Cause

**Two coupled defects** on the parent CM6 in the `useInlineWidget=ON` branch.

### PRIMARY (deterministic for case b — right-arrow at end of `## Code`)

`src/main/sectionProtectionExtension.ts:163-167` constructs the `## Code` heading lock with upper bound:
```ts
openerTo = state.doc.line(fence.openerLine + 1).from
```

The selection-snap `transactionFilter` (same file, lines 438-505) snaps any cursor entering `[headFrom, openerTo]` to `lockTo === openerTo` — which is the **first character of fence body line 1** and lies INSIDE the widget's `Decoration.replace([openerLine.from, closerLine.to])` range from `src/widget/liveModeViewPlugin.ts:67-90`.

The protection extension is producing an explicit cursor selection inside the widget's replace range. `atomicRanges` is bypassed because it is a motion-command hint, not a post-transaction filter — once a transactionFilter has set a selection authoritatively, the Facet does not get a second say.

Live Preview's selection-overlap detector then strips the widget and reveals source.

### SECONDARY (intermittent for case a — up-arrow into widget)

`src/widget/liveModeViewPlugin.ts:84-89` calls:
```ts
Decoration.replace({ widget })
```

without `block: true`. For a multi-line span, CM6 treats this as inline replacement; vertical line motion via `cursorLineUp` (which uses `coordsAtPos`) can land at column-aligned positions inside the range. `atomicRanges` covers `cursorCharLeft/Right` motion but does NOT consistently cover screen-coordinate-based vertical motion through a multi-line inline replace.

With `block: true`, the range is treated as a single visual block that vertical motion skips as a unit.

## Evidence

- `src/main/sectionProtectionExtension.ts:163-167` — `## Code` lock's upper bound `openerTo = state.doc.line(fence.openerLine + 1).from` falls **inside** the widget's `Decoration.replace` range. Comment at lines 155-159 acknowledges this is meant as a cosmetic pre-mount guard but the snap target was not coordinated with the widget's range boundary.
- `src/main/sectionProtectionExtension.ts:438-505` — `transactionFilter` rewrites the transaction with `selection: EditorSelection.cursor(mainHead)` where `mainHead = computeSnapTarget(...) = lockTo`. The filter sets the cursor authoritatively, bypassing the `atomicRanges` Facet.
- `src/widget/liveModeViewPlugin.ts:84-89` — `Decoration.replace({ widget })` constructed without `block: true` or `inclusive: true` despite spanning multiple lines (`[openerLine.from, closerLine.to]`).
- `src/main.ts:957, 1208-1212` — both extensions are registered on the parent CM6 in the `useInlineWidget=ON` branch but are not coordinated on cursor-target boundaries.
- `tests/widget/atomicRanges.test.ts` — only verifies the Facet has a function; does not exercise live cursor motion (Manual-Only UAT gate at `20-VERIFICATION.md:121-129`), which is why the bug shipped through automated tests.

## Files Involved

- `src/main/sectionProtectionExtension.ts` (lines 154-171, 438-505): snap target lands inside widget `Decoration.replace` range; needs the `## Code` snap-forward escape to land at `closerLine.to + 1` (the first editable position past the widget) instead of `openerLine + 1` start.
- `src/widget/liveModeViewPlugin.ts` (lines 84-89): `Decoration.replace` missing `block: true` for the multi-line widget; vertical motion can land inside the range.

## Suggested Fix Direction

1. **Primary fix** — in `sectionProtectionExtension.ts`'s `## Code` branch: when a `leetcode-solve` fence is detected (i.e., the widget is mounted), the snap-forward target for the `## Code` lock should be the position **past the widget closer line** (e.g., `state.doc.line(fence.closerLine + 1).from` if it exists, else `closerLine.to`). Simplest implementation: widen the `## Code` lock to `[headFrom, state.doc.line(fence.closerLine + 1).from]` ONLY when `fence.kind === 'leetcode-solve'`. For legacy fences, keep the current narrow lock to preserve v1.2 path behavior — but this branch is `useInlineWidget=ON` so the v1.2 path doesn't run here.
2. **Secondary fix** — in `liveModeViewPlugin.ts:85`: add `block: true` to the `Decoration.replace` spec so CM6 treats the multi-line widget as a single block. Vertical motion will skip the range as a unit. Already used for the action-row widget at `src/main/codeActionsEditorExtension.ts:294`.
3. **Manual UAT verification required** — `atomicRanges` cursor behavior cannot be exercised under vitest.
