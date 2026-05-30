---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 06
status: complete
gap_closure: true
closes_gaps: ["self-write-remount-cycle"]
tasks_completed: 4
tasks_deferred: 1
manual_uat: deferred-to-phase-end
---

# Plan 20-06 Summary — Cluster B (self-write remount cycle)

## Objective

Fix Phase 20 UAT Test 6 (`20-HUMAN-UAT.md` line 44-49, severity blocker,
carry-over from Phase 19 Test 1): "widget loses focus after the 400ms
sync... ViewPlugin rebuilds on any parent docChanged without distinguishing
self-writes from external edits — after debouncedWriter flushes via
vault.process(), parent doc update triggers ViewPlugin rebuild → sourceHash
mismatch → eq() false → full remount → focus/vim/cursor lost."

## Tasks

- [x] Task 1 — Add `peekExpectedHash` accessor to `SelfWriteSuppression`
- [x] Task 2 — `liveModeViewPlugin.update()` provenance gate (skip rebuild on echo)
- [x] Task 3 — `LeetCodeFenceWidget.eq()` suppression-map hardening
- [x] Task 4 — 14 regression tests pinning gate-decision + eq() contracts
- [ ] Task 5 — Manual UAT (deferred to phase-end UAT loop per orchestrator decision)

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/widget/selfWriteSuppression.ts` | +23 | New `peekExpectedHash(path)` read-only accessor; class-level JSDoc on dual-consumer model |
| `src/widget/liveModeViewPlugin.ts` | +74 / -10 | `buildLeetCodeFenceRanges` returns `{set, sourceHash, filePath}`; `update()` peeks suppression map and short-circuits via `return` (keeps `this.decorations` reference-stable) |
| `src/widget/LeetCodeFenceWidget.ts` | +35 / -7 | `eq()` falls through from strict compare to suppression-map peek; treats armed-match as equal |
| `tests/widget/selfWriteEcho.test.ts` | NEW (288 LOC) | 14 regression cases (8 eq() hardening + 6 gate-decision predicate) |

## Path Chosen — (a) suppression-map analog

Per Plan 20-06 `<objective>` rationale and `Warning #9` CONTEXT.md absence
finding: path (a) selected. The `selfWriteSuppression` map already arms
per-path expected hashes before `vault.process` and consumes them in
`vault.on('modify')`. This plan plumbs the SAME primitive into the CM6
ViewPlugin via a peek-only accessor — single source of truth for
self-write provenance.

Path (b) (userEvent annotation on a wrapped `vault.process` dispatch) was
rejected: `vault.process` writes through Obsidian's vault layer, not a
direct CM6 dispatch on the parent — there's no place to attach an
annotation without polluting the public vault API.

CONTEXT.md citation: read of `20-CONTEXT.md` confirms NO decision
constrains the self-write provenance approach. Phase 20 CONTEXT covers
section protection (D-protect-01..04), action row (D-action-01..04),
conflict modal (D-conflict-01..04), and plan structure (D-plan-01..02);
the carry-over remount cycle from Phase 19 was recorded as an open item
without prescribing a solution shape.

## Key Implementation Details

### Two-observer suppression map

```ts
class SelfWriteSuppression {
  arm(path, expectedHash): void          // existing — DebouncedWriter.flush
  tryConsume(path, observedHash):        // existing — vault.on('modify')
    'consumed' | 'stale' | 'miss'
  peekExpectedHash(path): string | null  // NEW — liveModeViewPlugin.update()
}
```

`peekExpectedHash` is read-only — never deletes on hit, never lazy-evicts
on stale (`tryConsume` keeps that responsibility) so the ViewPlugin's
`update()` can run on every transaction without racing the modify-handler.

### ViewPlugin gate

```ts
update(update: ViewUpdate): void {
  if (!(update.docChanged || update.viewportChanged)) return;
  const { set, sourceHash, filePath } = buildLeetCodeFenceRanges(update.view, this.plugin);

  if (update.docChanged && sourceHash !== null && filePath !== null && this.plugin.selfWriteSuppression) {
    const peeked = this.plugin.selfWriteSuppression.peekExpectedHash(filePath);
    if (peeked !== null && peeked === sourceHash) {
      // Self-write echo — keep `this.decorations` reference-stable.
      return;
    }
  }

  this.decorations = set;
  this.ranges = set;
}
```

### eq() suppression hardening

```ts
eq(other: WidgetType): boolean {
  if (!(other instanceof LeetCodeFenceWidget)) return false;
  if (other.plugin !== this.plugin) return false;
  if (other.file !== this.file) return false;
  if (other.fenceIndex !== this.fenceIndex) return false;
  if (other.sourceHash === this.sourceHash) return true;

  // Phase 20 Plan 20-06 — suppression-map peek (PRIMARY mechanism for
  // next-build DOM reuse after a flush).
  try {
    const sup = this.plugin.selfWriteSuppression;
    if (sup) {
      const peeked = sup.peekExpectedHash(this.file.path);
      if (peeked !== null && (peeked === this.sourceHash || peeked === other.sourceHash)) {
        return true;
      }
    }
  } catch { /* defensive */ }
  return false;
}
```

## Blocker Audits (verification per plan)

| Blocker | Check | Result |
|---------|-------|--------|
| #1 — readonly mutation | `grep -RnE 'refreshOnScreenSourceHash' src/` | 0 hits |
| #1 — readonly cast | `grep -RnE 'as unknown as \{ sourceHash' src/` | 0 hits |
| #1 — sourceHash readonly | `LeetCodeFenceWidget.ts:40` `public readonly sourceHash` | preserved |
| #2 — viewport gate | `grep -nE '!update\.viewportChanged' src/widget/liveModeViewPlugin.ts` | only in JSDoc explanation; no live code |
| Plumbing | `grep -rnE 'peekExpectedHash' src/` | 4 hits (1 doc + 1 def + 2 callers) |

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| `npx vitest run tests/widget/selfWriteEcho.test.ts` | 14/14 pass |
| `npx vitest run tests/widget/widgetEquality.test.ts tests/widget/selfWriteSuppression.test.ts tests/widget/livePreviewUnmount.test.ts` | 24/24 pre-existing tests pass (no regression) |
| `npx vitest run` (full project) | 2080 pass / 6 skipped / 0 fail (+14 from baseline 2066) |

## Atomic Commits

1. `00dc379` Task 1 — `peekExpectedHash` on SelfWriteSuppression
2. `16fde14` Task 2 — ViewPlugin update() provenance gate (Blocker #1 + #2 honored)
3. `feb70d0` Task 3 — `LeetCodeFenceWidget.eq()` suppression-map clause
4. `81eba28` Task 4 — 14 regression cases (8 eq + 6 gate-decision)

## Manual UAT — Deferred

Task 5 (dev-vault verification of focus + cursor + vim mode survival
across the 400ms flush, in BOTH vim and non-vim modes; multi-pane
regression with Plan 20-05's per-pane registry; external-edit reload
preserved) deferred to the phase-end UAT loop.

## Cluster Composition Note

Plan 20-05 fixed Cluster A (registry-key collision + Hook 1 echo
amplifier). Plan 20-06 fixes Cluster B (self-write remount cycle on the
ViewPlugin transaction stream). The two plans are complementary:
- Plan 20-05 stops `flushAll` from firing on every focus reaffirmation
  (the AMPLIFIER that made the echo loud).
- Plan 20-06 stops the ViewPlugin from rebuilding on the echo itself
  (the underlying root cause that survived even after 20-05).

Together, after a 400ms flush:
1. Hook 1 no longer fires on same-leaf refocus (20-05).
2. The vault.process echo lands on the parent CM6 — ViewPlugin sees
   docChanged but the suppression map's peek matches; `this.decorations`
   stays reference-stable (20-06 Task 2).
3. The next genuine keystroke triggers a rebuild — strict eq() compare
   fails (sourceHash changed); suppression peek matches one side; eq()
   returns true; CM6 reuses the existing DOM (20-06 Task 3).

## Phase 22 Implication

Phase 22 (flip useInlineWidget=ON) inherits this fix. Users typing into
the widget will experience uninterrupted typing — no focus loss, no
cursor jump, no vim mode reset across the 400ms debounced flush.
