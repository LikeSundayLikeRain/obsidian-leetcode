# Debug: Widget cursor-jump-to-start and 1-2 char rollback (BRAT regression, post-Phase-22)

**UAT signal:** User report — *"cursor moves to the beginning of the block when I'm typing"* (less frequent after the prior fix, commit `8f28617`, but still happens) and *"content rollback usually 1 or 2 chars: typing `nums[i]`, after typing `i`, it got rolled back leaving `nums[]`"*.

**Severity:** user-visible, intermittent, undermines BRAT 7-day dogfood window.

**Status:** three primary races closed (commits `07e9ee2`, `0480178`, `6277362`, test `064d0ce` on `main`). Two principled fixes (D, E) and one structural cleanup (F) still pending — see *Followups* below.

**Related:**
- `widget-thrash-on-type.md` (separate registry-key collision; Phase-20 era; closed)
- `self-write-remount-cycle.md` (the echo loop architecture this regression rides on)
- Quick task `260605-vny` — `.planning/quick/260605-vny-fix-widget-cursor-jump-and-char-rollback/` (PLAN + SUMMARY for the shipped A/B/C)
- Debug workflow run: `wf_b127f280-b9e` (32 agents; 472 tool uses; mapping → ranked hypotheses → 3-lens adversarial verify per hypothesis → synthesis)

## Symptom

Two distinct user-visible bugs sharing one underlying race window:

1. **Cursor jumps to position 0 of the widget mid-typing.** Less frequent after commit `8f28617` (which replaced a full-doc-replace in `pushParentToChild` with an LCP/LCS minimal-diff). Did not disappear.
2. **Most-recently-typed 1–2 chars rolled back.** Example: typing `nums[i]`, after pressing `i`, the widget snaps back to `nums[]`. The character is genuinely lost — not a render lag.

Both fire intermittently during normal typing in Live Preview against an `lc-slug`-frontmattered note. Frequency correlates with how fast the user types — slower typing produces them rarely; bursts of `[a-zA-Z0-9_]` runs produce them several times per minute.

## Architecture context (post-Phase-22, v1.3 inline-widget)

The plugin's editing model:

- `registerMarkdownCodeBlockProcessor('leetcode-solve', …)` + `registerEditorExtension(leetCodeFenceViewPlugin)` — both call `mountLeetCodeWidget` (Reading mode + Live Preview).
- The widget owns its own embedded CM6 `EditorView` inside the parent note's CM6.
- Widget edits flow through `app.vault.process(file, fn)` (the only mutation primitive).
- Self-write echo suppression uses a per-path content-hash map with 2-second TTL (`SelfWriteSuppression`).
- Widget-to-disk writes are debounced (`DebouncedWriter`, ~500ms default).
- Parent→child sync (`pushParentToChild`) re-syncs the embedded child editor when the parent doc changes from any non-`'leetcode.*'` source.
- External edits arriving during in-flight typing should surface a conflict modal (Keep mine / Keep external / View diff) — gated on `writer.hasPending()`.

The shared race window is **the user typing during the user's own ~500ms `DebouncedWriter` flush**. While `vault.process` is awaiting and the modify echo has not yet fired, the live child has chars that the just-arming-suppression doesn't know about, and the gates that should protect against external-edit clobber fail open.

## Root causes (all confirmed against live source by orchestrator before fixes shipped)

### Cause 1 — `DebouncedWriter` resets `pending = false` before the modify echo fires

**File:** `src/widget/debouncedWriter.ts:237-241`

The `flush()` body wraps in `try/finally`; the finally resets `this.pending = false` synchronously after `await this.app.vault.process(…)` resolves. Obsidian's `vault.on('modify')` listeners are dispatched on a *subsequent* macrotask. During the gap:

- `writer.hasPending()` returns `false`.
- `main.ts:1443` reads `firstMatch.writer?.hasPending() === true` → `false` → falls through to `firstMatch.reloadFromDisk('silent')` at `main.ts:1454`.
- `liveModeViewPlugin.ts:147` reads `candidate.writer?.hasPending?.() === true` → `false` → `pushParentToChild` proceeds.

Both gates were intended to protect against clobber during in-flight typing. Both are open during the echo window.

### Cause 2 — `syncHandle` gate is dead code in production

**Files:**
- `src/widget/WidgetController.ts:1487` — passes `undefined` for the `syncExtension` parameter to `buildExtensions`.
- `src/widget/WidgetController.ts:251` — `public syncHandle?: ChildParentSyncHandle;` declared but never assigned anywhere in the codebase.
- `src/widget/liveModeViewPlugin.ts:159` — `if (candidate.syncHandle?.hasPending?.() === true) continue;`

Because `this.syncHandle` is permanently `undefined`, the optional-chain `?.hasPending?.()` evaluates to `undefined`, which is `!== true`. The gate at `liveModeViewPlugin.ts:159` is structurally dead. It was supposed to be the rollback-prevention gate for "child holds typing the parent has not yet absorbed."

The `createChildParentSyncExtension` factory in `src/widget/childParentSync.ts` exists but is never wired in production; only test fixtures exercise it.

### Cause 3 — `reloadFromDisk` does a full-doc replace + line/col cursor clamp

**File:** `src/widget/WidgetController.ts:677-700`

`reloadFromDisk('silent')` is the clobber primitive on the originator pane:

```ts
// (4) line/col clamp
const targetLine = Math.min(lineNumber, newLineCount);
// … walk to line start …
const targetLineLength = (targetLineEndIdx < 0 ? newBody.length : targetLineEndIdx) - targetLineFrom;
const targetCol = Math.min(col, targetLineLength);
const restoredHead = Math.min(targetLineFrom + targetCol, newDocLength);

// (5) Single transaction: full-doc replacement + restored cursor
this.view.dispatch({
  changes: { from: 0, to: this.view.state.doc.length, insert: newBody },
  selection: EditorSelection.cursor(restoredHead),
  annotations: [Transaction.addToHistory.of(false)],
});
```

When the chars typed during the user's own flush window don't exist on disk, `targetCol = min(col, targetLineLength)` clamps onto a now-shorter line — the **cursor-jump** symptom — and the typed chars vanish — the **rollback** symptom. Both produced by the same dispatch.

### Cause 4 — `pushParentToChild` catch fallback sets cursor to `prefixLen`

**File:** `src/widget/liveModeViewPlugin.ts:215-219` (pre-fix)

```ts
} catch {
  mappedSelection = EditorSelection.create([
    EditorSelection.cursor(prefixLen),
  ]);
}
```

`prefixLen` is the longest-common-prefix length between `childDoc` and the new parent body. When divergence starts at byte 0 (the most common case during typing — first char of a fresh line, leading whitespace, etc.), `prefixLen = 0` and the cursor is slammed to position 0 of the widget. The **cursor-jump-to-start primitive** for the LP push path.

## What we shipped (A/B/C)

Three atomic commits on `main`. Each closes one of the dominant clobber paths via a narrow change.

### Fix A — abort dispatch on `ChangeSet.of` throw (`07e9ee2`)

**File:** `src/widget/liveModeViewPlugin.ts:215-219`

Replaced the `mappedSelection = EditorSelection.cursor(prefixLen)` fallback with `continue;`. A `ChangeSet.of` throw implies malformed spec geometry; dispatching anyway is also wrong. Skipping the iteration is strictly safer — the next sync trigger reconciles. TypeScript accepts the restructure because `continue` is a control-flow exit, leaving `mappedSelection` definitely-assigned at the dispatch site.

### Fix B — child-is-superset in-flight-typing guard (`0480178`)

**File:** `src/widget/liveModeViewPlugin.ts:165-187`

Inserted right after the existing `norm(childDoc) === norm(newBody)` no-op check at line 164. When the child doc is a strict prefix-extension of the parent body with ≤8 trailing chars, the trailing chars are by definition just-typed input that the next debounced flush will absorb. Pushing the parent body now would delete them.

```ts
const normChild = norm(childDoc);
const normParent = norm(newBody);
if (
  normChild.startsWith(normParent) &&
  normChild.length - normParent.length <= 8
) {
  continue;
}
```

The 8-char window is loose enough to absorb realistic typing-during-flush bursts and tight enough that genuine external truncation edits (which delete more than 8 chars) still fall through to the dispatch path.

### Fix C — strengthened modify-handler self-write detection (`6277362`)

**Files:**
- `src/widget/debouncedWriter.ts` — new `private lastFlushCompletedAt = 0` field; the `finally` block records the timestamp **before** clearing `pending` so observers racing the modify macrotask see `recentlyFlushed()` even after `hasPending()` flips. New public `recentlyFlushed(thresholdMs = 200): boolean`.
- `src/main.ts:1430-1456` — new gate after the existing `observedBody === childDoc` backup self-write check. Recognizes typing-during-own-flush exactly: `childDoc.startsWith(observedBody) && childDoc.length - observedBody.length <= 8 && firstMatch.writer?.recentlyFlushed?.(200) === true`. The optional-chain on `recentlyFlushed?.(200)` keeps the gate inert for legacy mounts that predate the new method.

Without this gate, the modify event fell through to `reloadFromDisk('silent')` and Cause 3 fired.

### Test contract update (`064d0ce`)

**File:** `tests/widget/parentToChildCursorPreservation.test.ts:237-280`

The Plan-21-17-era "symptom case" codified the partial fix from commit `8f28617`: caret-mapping prevented cursor-jump but trailing chars were still deleted. Fix B supersedes that — the dispatch is skipped entirely. New assertions: `dispatchSpy not.toHaveBeenCalled()`, `childDoc === oldBody`, `caret === 13` (end of doc, not clamped, not 0).

### Why "less frequent after the previous fix"

Commit `8f28617` replaced a full-doc-replace with the LCP/LCS minimal-diff and *intended* to add a `syncHandle.hasPending()` gate — but the gate was wired against a handle that's never assigned (Cause 2). The minimal-diff change made symptoms rarer because many push iterations now produce no-op specs, but the underlying race window stayed open.

---

# Followups (D, E, F) — pending

These were deliberately deferred from quick task `260605-vny` because they're higher-risk, need probe tests, or touch hot paths that need broader coverage. They are not strictly required if A+B+C hold up in BRAT — but if the user reports any residual rollback or cursor-jump in split-pane or under unusual sync conditions, D and E are where to start.

## Followup D — defer `writer.pending = false` reset until echo ack

**File:** `src/widget/debouncedWriter.ts:237-241`

**Why this is the principled fix.** Cause 1 is "the gate sentinel resets too early." A/B/C work around it by recognizing the typing-during-own-flush *signature* after the fact (child-is-superset of disk + recently flushed). D fixes the sentinel itself: keep `pending = true` from `run()` through to the modify echo's actual arrival, not just to `vault.process` resolution.

**Mechanism.** Two implementation options:

(a) **Ack-based release.** Expose a callback from `SelfWriteSuppression` that fires when `tryConsume` returns `'consumed'` for this writer's path. Track a per-path `awaitingEcho` flag on the writer. Clear `pending` only after the ack, not in the `finally`. Add a 2s safety timeout matching the suppression TTL — if the modify event never fires (vault.process failed silently, suppression dropped the entry, file deleted), clear pending after 2s so future flushes aren't blocked forever.

(b) **Coarse-grained delay.** `setTimeout(() => { this.pending = false }, 0)` after `vault.process` resolves. Cheaper but only correct if Obsidian's modify macrotask is reliably queued before the timer's macrotask. Stopgap, not principled.

**Recommended:** option (a). Concrete sketch:

```ts
// New writer field:
private awaitingEcho = false;
private ackTimeout: number | null = null;

// In flush(), AFTER vault.process resolves:
this.awaitingEcho = true;
this.ackTimeout = window.setTimeout(() => {
  this.awaitingEcho = false;
  this.pending = false;
  this.ackTimeout = null;
}, 2000);
// SelfWriteSuppression calls writer.acknowledgeEcho() on consume → clears
// awaitingEcho + pending + clears the timeout.

hasPending(): boolean {
  return this.pending || this.awaitingEcho;
}
```

**Risks (need probe tests before shipping):**
- **Modify event ordering.** Hypothesis assumes modify fires on a *macrotask* after `vault.process` resolves. If it actually fires on a *microtask* in some Electron build, the ack-timeout approach over-blocks. There's a stub reference to `modifyEventOrdering.probe.test.ts` in `debouncedWriter.ts:212`'s comment — re-run / write that probe to confirm ordering on the user's Electron version before relying on it.
- **Rate-limit interaction.** `debouncedWriter.ts:153-173` defers a flush via `setTimeout` if we're inside the 200ms rate-limit window. If `forceFlush` is called while the prior flush's `awaitingEcho` is still true, the deferred flush may stack incorrectly — the rate-limit gate sees `lastFlushAt < now - rateLimitMs` and proceeds, but the prior flush's pending-ack arming is still in place and a second `arm()` call clobbers the suppression entry.
- **`forceFlush()` semantics.** `forceFlush` is called from language-switch and submit paths. If those callers expect "after `await forceFlush()`, all pending work is on disk and visible," D's ack-based release means the await resolves before the modify echo fires — the echo can still mutate the widget after `forceFlush` resolves. Need to audit callers.

**Required test coverage before shipping D:**
1. Probe: modify event ordering relative to `vault.process` resolution (microtask vs macrotask).
2. Rapid-typing-into-flush: writer schedules at t=0, user types at t=300, t=400, t=500ms during the awaiting-echo window — verify next flush includes all three chars and arms correctly.
3. `vault.process` rejection path: vault.process throws; verify pending clears via the safety timeout, no permanent block.
4. File deleted during flush: verify no permanent block, no orphan suppression entry.
5. Rate-limit interaction: forceFlush during the awaiting-echo window — verify second flush is correctly deferred or merged.

## Followup E — re-snapshot `getDoc()` inside the `vault.process` callback

**File:** `src/widget/debouncedWriter.ts:180-225`

**Why.** This eliminates the snapshot-vs-live divergence at its source. Currently the writer captures `newBody = this.getDoc()` at flush start (line 180), then awaits `vault.read` (line 187) and `sha1` (line 209). The `vault.process` callback at line 222 closes over the **stale** `newBody`:

```ts
await this.app.vault.process(this.file, (body) => {
  postWriteText = rewriteFenceBody(body, expectedFenceIndex, newBody);  // ← stale
  return postWriteText;
});
```

If the user typed during the await chain, disk gets a body that lags the live child by however many chars were typed. The arming hash (line 209) is computed from the stale body, so when the modify echo fires `tryConsume` returns `'consumed'` and the divergence is silently absorbed — but the child is now ahead of disk by 1-2 chars permanently until the next flush.

This isn't strictly a *symptom* path on its own (A/B/C now absorb it correctly), but it produces a steady-state where the child is always slightly ahead of disk during fast typing. Combined with any future regression that opens the modify-handler clobber path, it amplifies the symptom volume.

**Proposed change:**

```ts
let postWriteText = '';
let liveBody = '';
await this.app.vault.process(this.file, (body) => {
  liveBody = this.getDoc();  // ← re-snapshot inside the callback
  postWriteText = rewriteFenceBody(body, expectedFenceIndex, liveBody);
  return postWriteText;
});

// Re-arm AFTER vault.process with the actually-written body's hash so
// suppression matches the modify echo's observation.
const actualFenceBody = extractFenceBody(postWriteText, expectedFenceIndex) ?? liveBody;
const actualHash = await sha1(actualFenceBody);
this.suppression.arm(this.file.path, actualHash, this.registryKey);
```

**The hard part — arming order.** Currently `arm()` is called at line 216, **before** `vault.process` (CONTEXT C-04 references "probe-confirmed safe"). Moving the arm to *after* `vault.process` means there's a window where:

1. `vault.process` returns.
2. Obsidian queues the modify event on a macrotask.
3. Our re-arm runs on the same macrotask (synchronous JS continuation of the await resolution).
4. Modify event fires.

If step 4 happens before step 3, suppression **misses** the first echo. We'd then false-positive into the conflict modal or reload-silent path. The existing `modifyEventOrdering.probe.test.ts` reference is for exactly this question.

**Alternative shape — multi-hash arm:**

```ts
// Arm with BOTH the snapshot-time hash AND a fallback live-doc hash captured
// inside the callback, so tryConsume can match either.
const snapshotHash = await sha1(futureFenceBody);  // existing line 209
this.suppression.armMulti(this.file.path, [snapshotHash], this.registryKey);

await this.app.vault.process(this.file, (body) => {
  liveBody = this.getDoc();
  postWriteText = rewriteFenceBody(body, expectedFenceIndex, liveBody);
  return postWriteText;
});

// Add the actual-written hash to the suppression's accepted set without
// clearing the snapshot-hash entry.
const actualHash = await sha1(extractFenceBody(postWriteText, expectedFenceIndex) ?? liveBody);
this.suppression.addExpectedHash(this.file.path, actualHash);
```

This requires extending `SelfWriteSuppression` to support per-path multi-hash sets. Cleaner than re-ordering the arm because it preserves the "arm before vault.process" invariant — the modify event always finds *some* matching hash even if it fires before the post-process arm.

**Risks:**
- **Suppression class API extension.** The current `arm(path, hash, registryKey)` is one-hash-per-path. Multi-hash semantics need careful design around the 2s TTL — does each hash get its own TTL, or one TTL per path?
- **Drift detection at line 197-202.** The drift-detection countLcOpeners check uses `currentDisk` from the pre-`vault.process` `vault.read`. If the user typed during the read await, `currentDisk` lags too. Probably fine because drift detection only catches *new fences inserted by external writes*, not in-fence content drift, but worth double-checking the pitfall comment at line 193-202.

**Required test coverage before shipping E:**
1. Probe: modify event ordering vs post-process arm (same probe as D).
2. Multi-hash suppression: arm-then-add-then-modify-fires — verify both hashes match, neither leaves an orphan entry past TTL.
3. Concurrent forceFlush + typing: forceFlush captures live body inside callback even when rate-limit is involved.
4. `vault.process` rejection: liveBody stays consistent with retry semantics.

## Followup F — wire or remove the dead `syncHandle` field

**File:** `src/widget/WidgetController.ts:251`, `:1487`; `src/widget/childParentSync.ts`; `src/widget/liveModeViewPlugin.ts:159`.

**Why.** Cause 2 above. The `syncHandle` plumbing was added in Plan 19-02 / Plan 20-09 with the intent of providing a child→parent sync handle for `pushParentToChild`'s rollback-prevention gate. The factory `createChildParentSyncExtension` exists, the field is declared on `WidgetController`, the gate at `liveModeViewPlugin.ts:159` reads it. But `mountLeetCodeWidget` passes `undefined` for `syncExtension` (`WidgetController.ts:1487`), so the field is never assigned.

This is dead code in production. It survives because:
1. Test fixtures exercise it directly (some `parentToChildCursorPreservation.test.ts` cases construct controllers with a sync handle).
2. The optional-chain `?.hasPending?.()` makes the dead gate harmless rather than crashy.
3. The `WR-08` review-fix removed the `parentView` parameter but kept the `syncHandle` field "for future wiring."

**Two paths to take:**

(a) **Wire it.** Modify `mountLeetCodeWidget` to construct a `createChildParentSyncExtension(parentView, …)` and assign the returned handle to `ctl.syncHandle`. Re-enables the rollback-prevention gate at `liveModeViewPlugin.ts:159`. Requires resolving the original reason it was unwired — comment at `WidgetController.ts:1387-1393` says "the typing-path now relies on Obsidian's built-in editor auto-save instead." If the auto-save path is sufficient, wiring this back risks reintroducing whatever issue led to its removal.

(b) **Remove it.** Delete the `syncHandle` field, the `createChildParentSyncExtension` factory, the `syncExtension` parameter to `buildExtensions`, and the dead gate at `liveModeViewPlugin.ts:159`. Update test fixtures that synthesize a sync handle to use the same Path A/B guards as production code.

**Recommended:** (b) removal. Reasoning: A and B already close the symptom paths the gate at `:159` was supposed to protect. Keeping a "future hook" that's been dormant for a release cycle accumulates dead-code interest — the next refactor of `WidgetController` will trip over it. Test fixtures should reflect production wiring.

**Risks of removal:**
- Tests that synthesize a sync handle will need updating. About 20-30 lines across `parentToChildCursorPreservation.test.ts` and possibly `widgetController.test.ts`. Mechanical change.
- Loses the "future hook" if a child→parent debounced sync is ever needed again. Acceptable — it can be re-added when actually needed, with current rather than stale architecture context.

## Followup G — adoption-failure stale-source path (lower priority)

**File:** `src/widget/WidgetController.ts:2041-2073` (catch block in `LeetCodeWidgetRenderChild.onload`).

**Why this is on the list.** The debug workflow's H5 hypothesis ("StateField rebuilds with stale source on every parent docChange") was *partially* refuted (`eq()`-based DOM reuse means the stale source is discarded by CM6 on the happy path), but **not fully refuted**: the catch-block at `2041-2073` is a fall-through when adoption fails (BL-02 race — destroyed-view in registry, pane-ownership mismatch, or `readOnly`-mode mismatch). When it fires, it calls `mountLeetCodeWidget(this.containerEl, this.source, …)` using the RenderChild's *captured stale source* — the on-disk body extracted by Obsidian's metadataCache *before* the latest user keystroke was flushed.

Combined with `statePersistence.hydrateState` having no entry (initial mount, TTL expiry, or `persistenceKey` mismatch), this can produce a fresh `EditorView` seeded with stale doc + cursor at offset 0 — a separate, rarer instance of the cursor-jump-to-start symptom.

**Frequency.** Bounded but not zero. The verdict's "evidence_against" notes:

> Fall-through to mountLeetCodeWidget only fires when:
> - appendChild throws (catch block at line 2041) — rare DOM detach race
> - candidates filter rejects all candidates (line 1923 returns empty array) — requires destroyed-view race (BL-02), pane-ownership mismatch, or readOnly-mode mismatch

Trigger requires a *write to disk* (switchLanguage, processFrontMatter, forceFlush) — not pure typing. Plain typing doesn't re-fire the post-processor.

**Investigation step before fixing:** add a counter to the catch block at `WidgetController.ts:2042` to measure how often adoption fall-through actually fires in production. The user's BRAT logs will clarify whether this contributes meaningfully to the residual symptom volume after A+B+C.

**If the counter shows non-trivial frequency**, the fix shape is:
- Re-extract the latest fence body from `this.app.vault.read(this.file)` inside the catch block, rather than using the captured `this.source`.
- Persist cursor state in `statePersistence` more aggressively (capture on every `onunload` of the RenderChild, not just on `WidgetController.destroy()`), so the fresh-mount path always has an entry to clamp against.

## Multi-pane race window (out of scope, noted for future)

The verdict's "remaining_uncertainty" item (5):

> Multi-pane scenarios (split-LP layouts) may add an additional applyPeerSync clobber path on the originator's peer that has its own typing-ahead chars — H1's mechanism (b) — which I confirmed is structurally blocked for the originator but not for an actively-typing peer; this case is not covered by the proposed fixes and would need separate investigation if users report rollback in split-pane setups.

A/B/C close the originator's clobber paths. They do **not** close the case where pane A's flush triggers `applyPeerSync` on pane B *while pane B is also typing*. If users report the symptoms in split-pane setups specifically, this is the place to look — `WidgetController.applyPeerSync` (Plan 21-17) and the multi-pane coordinator at `src/widget/multiPaneCoordinator.ts`.

---

# Verification signals

After A/B/C shipped (`6277362` on `main`):

- DevTools console diagnostic logs at `main.ts:1424` (`branch=child-doc-matches-disk`) and the new `branch=typing-during-own-flush` should fire much more often than `branch=reload-silent` during normal typing. That's the success signature.
- If `branch=reload-silent` fires during pure typing without external sync activity, A/B/C didn't fully close the path and D becomes load-bearing.
- If the symptoms reappear in split-pane LP+LP layouts only, multi-pane is the place to look (out-of-scope item above).

# Source-of-truth reference

The full debug workflow output (mapping → hypotheses → 3-lens verdicts → synthesis) ran as workflow `wf_b127f280-b9e` in session `f12339b7-0245-49f2-82dc-62ef5788b2d1`. The transcript is ephemeral (lives in `/private/tmp/claude-504/.../tasks/w6ntfx7op.output` — wiped on session GC). This document is the durable record. If a future session needs to revisit D/E/F/G:

1. Start from this file's "Followups" section.
2. Re-verify the file:line citations (the surrounding code may have moved).
3. The probe test referenced for D and E ordering — `modifyEventOrdering.probe.test.ts` per the comment at `debouncedWriter.ts:212` — needs to be located or rewritten before either ships.
