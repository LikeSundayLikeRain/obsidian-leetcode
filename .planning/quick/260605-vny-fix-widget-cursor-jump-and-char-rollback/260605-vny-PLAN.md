---
quick_id: 260605-vny
slug: fix-widget-cursor-jump-and-char-rollback
description: Fix v1.3 inline-widget cursor-jump-to-start and 1-2 char rollback bugs (BRAT regression)
date: 2026-06-06
mode: quick
must_haves:
  truths:
    - The pushParentToChild catch fallback at liveModeViewPlugin.ts:215-219 sets cursor to prefixLen which is 0 when divergence starts at byte 0 — this is one of the cursor-jump-to-start primitives.
    - The pushParentToChild gate at liveModeViewPlugin.ts:147 (writer.hasPending) fails open during the post-flush modify-event window because DebouncedWriter resets pending=false in finally before Obsidian's modify macrotask fires (debouncedWriter.ts:237-241).
    - The reload-silent fall-through at main.ts:1418-1456 hits when the user types during their own ~500ms flush window — observedBody (stale disk) != childDoc (live), backup gate at :1419 fails, and reloadFromDisk('silent') runs a full-doc replace at WidgetController.ts:696-700 with line/col-clamped cursor.
    - The syncHandle gate at liveModeViewPlugin.ts:159 is dead code: mountLeetCodeWidget passes undefined for syncExtension at WidgetController.ts:1487 and nothing assigns this.syncHandle anywhere; the gate is permanently false in production.
  artifacts:
    - src/widget/liveModeViewPlugin.ts (modified — fix A + fix B)
    - src/main.ts (modified — fix C)
    - tests/* — at most one new unit test for the fix-C predicate if a clean test surface exists
    - .planning/quick/260605-vny-fix-widget-cursor-jump-and-char-rollback/260605-vny-SUMMARY.md
  key_links:
    - debug workflow run: wf_b127f280-b9e
    - architecture notes: CLAUDE.md "Architecture" section (v1.3 inline-widget post-Phase-22)
    - related session: BRAT issue #2 (rollback) and prior cursor-jump fix at commit 8f28617 (incomplete)
---

# Fix widget cursor-jump-to-start and 1-2 char rollback bugs

## Why

User reports two intermittent bugs in the v1.3 inline-widget:

1. **Cursor jumps to position 0 mid-typing.** Less frequent after the previous fix (commit `8f28617`) but still happens.
2. **Most-recently-typed 1-2 chars rollback.** Example: typing `nums[i]`, after typing `i`, it rolls back leaving `nums[]`.

A debug workflow (32 agents, 472 tool uses, file:line evidence verified) traced both symptoms to a shared race window: **the user typing during the ~500ms `DebouncedWriter` flush window**. Three concrete defects compose to produce the symptoms:

- **`DebouncedWriter` resets `pending=false` in `finally` before Obsidian's `vault.on('modify')` macrotask fires** → both `writer.hasPending()` gates that were intended to protect against clobber fail open during the echo window.
- **The `syncHandle` gate at `liveModeViewPlugin.ts:159` is dead code** — `mountLeetCodeWidget` passes `undefined` for `syncExtension` (WidgetController.ts:1487), and nothing in the codebase ever assigns `this.syncHandle`. The gate is permanently false.
- **`reloadFromDisk` does a full-doc replace with line/col-clamped cursor** (WidgetController.ts:677-700) — this is the clobber primitive on the originator pane.
- **`pushParentToChild`'s catch fallback sets cursor to `prefixLen`** (liveModeViewPlugin.ts:217) — when divergence starts at byte 0, that's literally position 0.

## What we're doing (out of scope first)

**Out of scope for this quick task** (deferred): the principled fixes — defer `writer.pending=false` reset until echo ack; re-snapshot inside `vault.process` callback. Both higher-risk; need event-ordering probe and broader test coverage. They go on the followup list.

**In scope:** three narrow fixes (A, B, C) localized to two files (`liveModeViewPlugin.ts`, `main.ts`). Each closes one of the dominant clobber paths via a small, low-risk change. Three atomic commits so any regression can be bisected.

## Tasks

### Task 1 (Fix A) — Abort dispatch on ChangeSet.of throw instead of slamming cursor to position 0

**files:** `src/widget/liveModeViewPlugin.ts`

**action:** Replace the catch fallback at `liveModeViewPlugin.ts:215-219` so it aborts the dispatch instead of computing a destructive selection.

Current code (lines 202-219):

```typescript
let mappedSelection: EditorSelection;
try {
  const changes = ChangeSet.of(spec, oldLen);
  const ranges = childView.state.selection.ranges.map((r) =>
    EditorSelection.range(
      changes.mapPos(r.anchor, 1),
      changes.mapPos(r.head, 1),
    ),
  );
  mappedSelection = EditorSelection.create(
    ranges,
    childView.state.selection.mainIndex,
  );
} catch {
  mappedSelection = EditorSelection.create([
    EditorSelection.cursor(prefixLen),
  ]);
}
```

Proposed code: drop the catch's `mappedSelection = ...` assignment and `return` (skip the entire dispatch on this iteration). `ChangeSet.of` throws imply the spec geometry is malformed; dispatching it anyway is also wrong. Aborting is strictly safer — the next user keystroke or next sync trigger will reconcile.

```typescript
let mappedSelection: EditorSelection;
try {
  const changes = ChangeSet.of(spec, oldLen);
  const ranges = childView.state.selection.ranges.map((r) =>
    EditorSelection.range(
      changes.mapPos(r.anchor, 1),
      changes.mapPos(r.head, 1),
    ),
  );
  mappedSelection = EditorSelection.create(
    ranges,
    childView.state.selection.mainIndex,
  );
} catch {
  // Aborting is strictly safer than slamming cursor to prefixLen — when
  // divergence starts at byte 0, prefixLen=0 produces the cursor-jump-to-
  // start symptom. The next sync trigger will reconcile.
  continue;
}
```

(Use `continue` rather than `return` because the function iterates over `iter` of registered widget controllers; aborting this iteration only skips the one mismatched candidate, not the whole loop.)

**verify:** `npm run build` succeeds; `vitest` (if any tests cover liveModeViewPlugin) passes; `liveModeViewPlugin.ts` no longer references `EditorSelection.cursor(prefixLen)` in the catch path.

**done:** ChangeSet.of throws can no longer slam the widget cursor to position 0 in production.

**commit:** `fix(widget): abort pushParentToChild dispatch on ChangeSet.of throw instead of slamming cursor to 0`

---

### Task 2 (Fix B) — Add child-is-superset in-flight-typing guard before LCP/LCS push

**files:** `src/widget/liveModeViewPlugin.ts`

**action:** Add a guard between the existing `norm(childDoc) === norm(newBody)` no-op check (line 164) and the prefix/suffix computation (line 177). When the child doc is `newBody + extraTrailingChars`, that is the in-flight-typing signature: the child has chars the parent disk doesn't yet have because the writer's flush already ran but the user kept typing. In that case, skip the push entirely — the next child→parent flush will reconcile, and pushing the stale parent body would delete those just-typed chars.

Concretely, after the existing no-op check at line 164:

```typescript
// No-op when child already matches parent.
const childDoc = childView.state.doc.toString();
const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
if (norm(childDoc) === norm(newBody)) continue;
```

Insert the new guard:

```typescript
// In-flight-typing guard. The post-flush modify-event window opens a race
// where DebouncedWriter has reset pending=false but Obsidian has not yet
// fired vault.on('modify'); during that window writer.hasPending() returns
// false (gate at line 147 above fails open) and pushParentToChild proceeds.
// If the child is a strict superset of the parent body — i.e., child = parent
// + a small trailing run of just-typed chars — that trailing run is the
// chars the user typed AFTER the writer's flush captured its snapshot. The
// next debounced flush will absorb them into the parent. Pushing the parent
// body now would delete them. Skip.
const normChild = norm(childDoc);
const normParent = norm(newBody);
if (
  normChild.startsWith(normParent) &&
  normChild.length - normParent.length <= 8
) {
  continue;
}
```

`<= 8` chars is a tight window — large enough to absorb realistic typing-during-flush bursts (typing speed × ~10ms gap rarely exceeds that), small enough that genuine external truncation edits (which usually delete more than 8 chars) still go through.

**verify:** `npm run build` succeeds; manual repro of the rollback bug (rapid typing of `nums[i]` in a fresh widget) no longer drops the trailing `i`.

**done:** Push-during-typing race no longer drops just-typed trailing chars.

**commit:** `fix(widget): skip pushParentToChild during in-flight typing (child-is-superset guard)`

---

### Task 3 (Fix C) — Strengthen reload-silent backup self-write detection

**files:** `src/main.ts`

**action:** Strengthen the modify-handler's backup self-write detection at `main.ts:1418-1428`. Currently the gate only catches the case where `observedBody === childDoc` exactly. Add: also absorb when the child doc is a strict superset of `observedBody` with ≤8 trailing chars (same shape as fix B), AND the originator's `vault.process` resolved within the last ~200ms.

This requires plumbing a "last flush timestamp" through `DebouncedWriter`. Add to `DebouncedWriter`:

- A new `private lastFlushCompletedAt = 0;` field.
- Set it via `this.lastFlushCompletedAt = Date.now();` inside the `finally` block at `debouncedWriter.ts:237-241`, immediately before the `pending = false` reset.
- Expose via `recentlyFlushed(thresholdMs = 200): boolean { return Date.now() - this.lastFlushCompletedAt < thresholdMs; }`.

Then strengthen the gate at `main.ts:1418-1428`:

```typescript
const childDoc = firstMatch.view.state.doc.toString();
if (observedBody === childDoc) {
  console.debug(
    `[lc-debug] modify:branch=child-doc-matches-disk path=${file.path} reason=backup-self-write-detection`,
  );
  return;
}

// Strengthened detection: typing-during-own-flush leaves observedBody
// (post-flush disk) as a strict prefix of childDoc (live + 1-2 typed
// chars) within ~200ms of our own vault.process resolving. Without this
// gate, the modify event falls through to reloadFromDisk('silent') which
// full-doc-replaces the live child with the stale disk body, dropping
// the just-typed chars and clamping the cursor onto a now-shorter line.
if (
  childDoc.startsWith(observedBody) &&
  childDoc.length - observedBody.length <= 8 &&
  firstMatch.writer?.recentlyFlushed?.(200) === true
) {
  console.debug(
    `[lc-debug] modify:branch=typing-during-own-flush path=${file.path} reason=child-is-superset-of-disk-within-flush-window delta=${childDoc.length - observedBody.length}`,
  );
  return;
}
```

**verify:** `npm run build` succeeds; `vitest` passes (writer tests still pass with the new field). If a clean test surface exists for the gate predicate (in `selfWriteSuppression.test.ts` or similar), add ONE focused test: child = "abc" + "i", observed = "abc", recentlyFlushed=true → returns silently (no reload); same shapes with recentlyFlushed=false → falls through.

**done:** Reload-silent path no longer clobbers the originator pane during typing-during-own-flush.

**commit:** `fix(widget,sync): strengthen backup self-write detection for typing-during-own-flush`

---

## Verification

After all three commits:

1. `npm run build` succeeds (TypeScript strict-null-checks mode catches any signature mismatches from the new `recentlyFlushed` method).
2. The DevTools console diagnostic logs at `main.ts:1424` (`branch=child-doc-matches-disk`) and the new `branch=typing-during-own-flush` should fire much more often than `branch=reload-silent` during normal typing — that's the success signature.
3. Manual repro: rapid typing of `nums[i]` and similar identifier-with-bracket sequences in a fresh widget, in a `lc-slug`-frontmattered note, in Live Preview mode, with the dev vault hot-reloaded. Both bugs should disappear or become drastically rarer.
4. No regressions in: split-pane Reading-mode + Live-Preview simultaneous editing; external Obsidian Sync edits arriving while a widget is open; the conflict modal trigger path on genuine external edits.

## Followups (deferred — not in this quick task)

- **Fix D:** Defer `pending=false` reset in `DebouncedWriter` until echo ack (ack-based release with 2s safety timeout matching suppression TTL). Principled fix; closes the gates at the source. Needs event-ordering probe (`modifyEventOrdering.probe.test.ts`) and rate-limit interaction tests.
- **Fix E:** Re-snapshot `getDoc()` inside the `vault.process` callback so disk reflects the live child. Eliminates the snapshot-vs-live divergence at its source. Higher risk; needs verification that suppression hash arming order remains correct.
- **Dead-code cleanup:** the `syncHandle` field on `WidgetController` and the gate at `liveModeViewPlugin.ts:159` are dead — `syncHandle` is never assigned. Remove or reactivate.
