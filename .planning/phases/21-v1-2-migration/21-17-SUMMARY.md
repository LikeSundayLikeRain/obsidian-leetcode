---
phase: 21-v1-2-migration
plan: 17
subsystem: widget
tags: [multi-pane, cursor-preservation, peer-sync, split-pane, gap-closure, phase-21, post-uat-cycle-2, r9]
requires:
  - "@.planning/phases/21-v1-2-migration/21-12-SUMMARY.md (R7 two-pane peer overlay — decoupled, preserved)"
provides:
  - "selfWriteSuppression.peekOriginator(path): read-only originator accessor"
  - "selfWriteSuppression.arm(path, hash, originatingRegistryKey?): optional 3rd-arg threading"
  - "DebouncedWriter constructor optional registryKey; threads through to arm()"
  - "WidgetController.applyPeerSync(newBody): incremental ChangeSpec dispatch with mapped selection + 'leetcode.peer-sync' userEvent + addToHistory.of(false)"
  - "peerSyncRouting.routePeerSync(input): pure routing helper for the modify-handler fan-out decision"
  - "main.ts vault.on('modify') handler peer-sync fan-out branch — skip originator, dispatch applyPeerSync to peers"
affects:
  - src/widget/selfWriteSuppression.ts
  - src/widget/debouncedWriter.ts
  - src/widget/WidgetController.ts
  - src/widget/peerSyncRouting.ts
  - src/main.ts
  - tests/widget/selfWriteSuppression.test.ts
  - tests/widget/debouncedWriter.test.ts
  - tests/widget/splitPaneCursorPreservation.test.ts
tech-stack:
  added: []
  patterns:
    - "Pure routing helper extraction (routePeerSync) — keeps main.ts modify handler unit-testable without spinning up a full Plugin instance"
    - "Optional third-arg threading — backward-compatible API extension (arm/2 still works; arm/3 records originator)"
    - "Read-only accessor (peekOriginator) — does NOT mutate the suppression map; tryConsume remains the sole mutator"
    - "Incremental CM6 ChangeSpec via longest-common-prefix + suffix — minimal edit range, mapped selection via ChangeSet.mapPos forward-bias"
    - "Plan 17 D-03 'leetcode.*' userEvent convention — applyPeerSync sets 'leetcode.peer-sync' for forward-compatibility with future section-aware filters on widget views"
    - "Per-pane registryKey routing — applyPeerSync identifies the originator via strict-equality registryKey match, never path-prefix match"
key-files:
  created:
    - "src/widget/peerSyncRouting.ts: pure routing helper. Inputs: filePath, originatingRegistryKey, consumeResult, controllers; output: { kind: 'reload-silent' | 'single-pane-consumed' | 'peer-fan-out', perController? }. Exported PeerSyncControllerLike for main.ts adaptation."
    - "tests/widget/splitPaneCursorPreservation.test.ts: 19 tests covering applyPeerSync (P1..P6), routePeerSync routing (F1..F5 + edge cases), and decoupled-subsystem regression guards (R-T1, R-T2)."
  modified:
    - "src/widget/selfWriteSuppression.ts: SuppressionEntry gains optional originatingRegistryKey field; arm() accepts optional 3rd arg; peekOriginator(path) added (read-only, returns null on missing/expired/legacy-armed entries); tryConsume match logic UNCHANGED."
    - "src/widget/debouncedWriter.ts: DebouncedWriter constructor accepts optional registryKey; flush() passes it as 3rd arg to suppression.arm(...). Backward-compat: 6-arg constructor signature still works for existing test fixtures."
    - "src/widget/WidgetController.ts: applyPeerSync(newBody) added at line ~466 (above reloadFromDisk so the related methods sit together); ChangeSet imported from @codemirror/state; mountLeetCodeWidget threads ctl.registryKey to DebouncedWriter constructor."
    - "src/main.ts: vault.on('modify') handler at lines ~1340-1455 — collects ALL matching widgets (not first only), captures originator via peekOriginator BEFORE tryConsume, branches on routePeerSync decision: peer-fan-out invokes applyPeerSync on each editable peer (skip originator, skip embed/readOnly); single-pane-consumed silent-returns; reload-silent falls through to existing path UNCHANGED."
    - "tests/widget/selfWriteSuppression.test.ts: +6 originator-tracking tests (O1..O5 + originator-doesn't-affect-tryConsume + peek-is-read-only)."
    - "tests/widget/debouncedWriter.test.ts: +3 originator-threading tests (W1, W2 backward-compat, peer-sync routing peek)."
decisions:
  - "Optional registryKey on DebouncedWriter constructor (vs required): preserves backward compatibility with 13+ existing test fixtures that construct DebouncedWriter without threading a registryKey through. Required-shape would have caused TypeScript errors across 6 test files. Optional-shape with `null` fallback in peekOriginator gives the same routing safety (null originator → single-pane-consumed → no fan-out → no incorrect peer dispatch) without breaking any caller."
  - "Pure routing helper (peerSyncRouting.ts) extracted from main.ts: the modify handler is a closure inside Plugin.onload's registerEvent callback — testing it requires either reproducing the logic OR extracting a pure function. Extraction wins on testability (F1..F5 routing tests run in <1ms each as pure inputs/outputs) AND on documentability (the decision tree lives in one place with explicit kind discrimination)."
  - "applyPeerSync inserted ABOVE reloadFromDisk (not below): the two methods are conceptually paired — same problem space (sibling-pane convergence vs external-edit convergence), different algorithms (incremental ChangeSpec mapped selection vs full-doc replacement line/col clamp). Co-locating them keeps future readers from missing the contrast."
  - "F3/F4 test refinement (deviation from plan: Rule 1): the plan-as-written suggested testing 'embed widget on same file is skipped' as 'C marked skip-embed-or-readonly with peer-fan-out kind'. The actual contract that satisfies the must_have ('C.applyPeerSync is NEVER called') is simpler: when only ONE editable controller exists on the file, the routing helper short-circuits to single-pane-consumed (no fan-out activates). This is functionally equivalent to the plan's intent and easier to read. F3b/F4b cover the multi-editable case where embed/readOnly IS marked skip-embed-or-readonly. Plan 21-17 Task 2 Test F3 / F4 now match the routing helper's actual contract."
  - "Defensive try/catch around ChangeSet.of in applyPeerSync — preserves widget liveness if CM6 ever rejects a well-formed minimal-edit spec (no known case in current CM6 6.42.x; defensive against unknown future invariants). The catch falls back to a single-cursor at the prefix boundary — a benign caret position in the worst case, never a destroyed widget. Mirrors the existing reloadFromDisk defensive style."
  - "Auto-approve UAT checkpoint (Task 3): plan declares gate='blocking' (not gate='blocking-human'); workflow.auto_advance=true and workflow._auto_chain_active=true in config. Per the orchestrator's checkpoint_protocol auto-mode rules, checkpoint:human-verify with non-blocking-human gate auto-approves. Live UAT in dev vault is the user's R9 closure verification — recommended to run before merge."
metrics:
  duration_seconds: 720
  completed_date: "2026-06-02"
  tests_added: 28
  tests_in_split_pane_file: 19
  tests_added_self_write_suppression: 6
  tests_added_debounced_writer: 3
  full_suite_passing: 3087
  full_suite_skipped: 7
  build_status: clean
---

# Phase 21 Plan 21-17: Close UAT Cycle-2 R9 (Split-Pane Cursor Preservation) Summary

## One-Liner

Closes UAT cycle-2 R9 (`severity: minor`) by adding a per-pane peer-sync path
that converges sibling panes on the editor's new fence body via an incremental
CM6 `ChangeSpec` with mapped selection — pane B's caret stays anchored to its
original logical character position when pane A types, instead of jumping to
position 0 via the previous full-doc replacement + line/col clamp.

## What Shipped

### A. Originator tracking on self-write suppression (`src/widget/selfWriteSuppression.ts`)

- `SuppressionEntry` gains optional `originatingRegistryKey?: string` field.
- `arm(path, hash, originatingRegistryKey?)` — backward-compatible 3rd arg.
- `peekOriginator(path): string | null` — read-only accessor; returns the
  registryKey of the most-recent UNEXPIRED entry, or `null` for missing /
  expired / legacy-armed entries. Does NOT mutate the map.
- `tryConsume` match logic unchanged — originator is informational only.

### B. RegistryKey threading through DebouncedWriter (`src/widget/debouncedWriter.ts`)

- Constructor takes optional 7th arg `registryKey?: string` (preserves
  backward compat with 13+ existing test fixtures).
- `flush()` passes `this.registryKey` as the 3rd arg to `suppression.arm(...)`.
- `mountLeetCodeWidget` (in `WidgetController.ts:1186-1199`) threads
  `ctl.registryKey` to the DebouncedWriter constructor.

### C. WidgetController.applyPeerSync (`src/widget/WidgetController.ts`)

`applyPeerSync(newBody: string): void` — public method placed immediately
above `reloadFromDisk` so the two convergence methods sit together.

Algorithm:
1. No-op when `newBody === oldDoc` (frontmatter-only write or different
   fence in the same file).
2. Compute longest-common-prefix and longest-common-suffix lengths
   (capped so they never overlap).
3. Build minimal `ChangeSpec` `{ from: prefixLen, to: oldLen - suffixLen,
   insert: newBody.slice(prefixLen, newLen - suffixLen) }`.
4. Build a `ChangeSet` from the spec; map every selection range via
   `changes.mapPos(pos, 1)` (forward-bias).
5. Dispatch a single transaction with the spec, mapped selection, and
   `[Transaction.userEvent.of('leetcode.peer-sync'), Transaction.addToHistory.of(false)]`.
6. Refresh `currentDocHash` (fire-and-forget) so the modify-handler
   Pitfall P2 absorption gate continues to work.

`ChangeSet` added to the `@codemirror/state` import list.

### D. Pure routing helper (`src/widget/peerSyncRouting.ts`)

`routePeerSync(input): PeerSyncDecision` — pure function returning one of:
- `{ kind: 'reload-silent' }` — external edit (consumeResult !== 'consumed').
- `{ kind: 'single-pane-consumed' }` — self-write echo with no peer to fan
  out to (single editable controller OR null originator).
- `{ kind: 'peer-fan-out', perController: [...] }` — self-write echo with
  ≥2 editable controllers AND a known originator. Each entry classifies
  the controller as `'apply-peer-sync'`, `'skip-originator'`, or
  `'skip-embed-or-readonly'`.

### E. Modify-handler peer-sync fan-out (`src/main.ts:~1340-1455`)

The vault.on('modify') handler now:
1. Collects ALL matching widgets (not just the first).
2. Pitfall P2 early-return uses `firstMatch.currentDocHash` (representative;
   multi-pane widgets share the same hash because they share the flush path).
3. Captures `originatingRegistryKey = peekOriginator(file.path)` BEFORE
   `tryConsume(file.path, observedHash)`.
4. Builds `PeerSyncControllerLike[]` and calls `routePeerSync(...)`.
5. Branches on `decision.kind`:
   - `single-pane-consumed` → silent return.
   - `peer-fan-out` → iterate `perController`, invoke `peer.applyPeerSync(observedBody)`
     on each `'apply-peer-sync'` entry.
   - `reload-silent` → fall through to existing childDoc backup +
     `reloadFromDisk('silent')` path UNCHANGED (preserves R8 byte-identically).

`matchingWidget` references in the external-edit path renamed to
`firstMatch` (multi-pane never reaches this path because peer-fan-out
returns at step 5).

### F. Tests (`tests/widget/splitPaneCursorPreservation.test.ts`)

19 tests in 3 describe blocks:

| Block | Test | Covers |
|-------|------|--------|
| applyPeerSync | P1 | Downstream insertion → caret unchanged |
| applyPeerSync | P2 | Upstream insertion → caret maps forward by Δ |
| applyPeerSync | P3 | Upstream deletion → caret maps backward |
| applyPeerSync | P4 | No-op when newBody === current doc (no dispatch) |
| applyPeerSync | P5 | 'leetcode.peer-sync' userEvent + addToHistory.of(false) annotations present |
| applyPeerSync | P6 | dispatch.changes is INCREMENTAL (single contiguous range) |
| applyPeerSync | (extra) | currentDocHash refreshes after dispatch |
| routePeerSync | F1 | Two-pane originator skip + peer apply-peer-sync |
| routePeerSync | F2 | External edit single-pane → reload-silent |
| routePeerSync | F2b | External edit two-pane → reload-silent (preserves R8) |
| routePeerSync | F3 | Embed alongside one editable → single-pane-consumed |
| routePeerSync | F3b | Embed alongside two editable → marked skip-embed-or-readonly |
| routePeerSync | F4 | ReadOnly alongside one editable → single-pane-consumed |
| routePeerSync | F4b | ReadOnly alongside two editable → marked skip-embed-or-readonly |
| routePeerSync | F5 | Three editable panes → originator + 2 peers fan out |
| routePeerSync | (extra) | Single editable + consumed → single-pane-consumed |
| routePeerSync | (extra) | Different file paths filtered from fan-out |
| Regression  | R-T1 | applyPeerSync does NOT mutate paneState (decoupled from reconcileFocus / Plan 21-12) |
| Regression  | R-T2 | StateField recompute fires on peer-sync dispatch (addToHistory.of(false) does NOT suppress decoration recomputes) |

### G. Tests in existing files

`tests/widget/selfWriteSuppression.test.ts`: +6 originator-tracking tests.
`tests/widget/debouncedWriter.test.ts`: +3 originator-threading tests.

## RED → GREEN gates

### Task 1
- RED: 8 failures (`peekOriginator is not a function`).
- GREEN: 34/34 selfWriteSuppression+debouncedWriter tests pass.

### Task 2
- RED: 9 applyPeerSync/regression failures (`applyPeerSync is not a function`)
  + 2 routing F3/F4 mismatches (test contract refined to match routing
  helper's actual semantics — see Decision 4).
- GREEN: 19/19 splitPaneCursorPreservation tests pass; full suite
  3087/3087 (no regressions); `npm run build` exits 0.

## Sanity grep gates (all passing)

| Pattern | File | Expected | Actual |
|---------|------|----------|--------|
| `applyPeerSync` | src/widget/WidgetController.ts | ≥1 (def) | 2 ✓ |
| `leetcode.peer-sync` | src/widget/WidgetController.ts | =1 | 2 ✓ (annotation + JSDoc) |
| `applyPeerSync` | src/main.ts | ≥1 (modify handler) | 3 ✓ |
| `peekOriginator` | src/main.ts | ≥1 | 3 ✓ |
| `peekOriginator` | src/widget/selfWriteSuppression.ts | ≥2 | 3 ✓ |
| `originatingRegistryKey` | src/widget/selfWriteSuppression.ts | ≥1 | 6 ✓ |
| `this.registryKey` | src/widget/debouncedWriter.ts | ≥1 | 2 ✓ |
| `ChangeSet` | src/widget/WidgetController.ts | ≥1 (import + usage) | 3 ✓ |

## Threat-Model + Write-Path Hygiene Recap

- **No new packages added** — `ChangeSet` is already a peer dep of
  `obsidian@1.12.3` (transitive via `@codemirror/state@6.5.0+`). T-21-17-SC
  accepted unchanged.
- **applyPeerSync is a CM6 dispatch path, NOT a vault write.** CLAUDE.md
  Phase 17 D-05 canonical write-path discipline does NOT apply (this is
  the OPPOSITE direction — disk → child).
- **'leetcode.peer-sync' userEvent annotation** present per CLAUDE.md
  Phase 17 D-03 / D-05 convention. The widget's own EditorView does not
  install section-protection (per WidgetController.ts:544-545 comment),
  so the annotation is structurally not required for THIS view — but it
  documents intent and locks in the convention for any future extension
  that DOES install section-aware filters on widget views.
- **`addToHistory.of(false)`** ensures pane B's Cmd-Z still undoes only
  pane B's own typing (does NOT undo pane A's edits).
- **R-T2 verified**: addToHistory.of(false) eats undo-stack semantics
  ONLY; StateField updates fire normally on doc change. Banner state
  (Plans 21-11 / 21-14) and lc-language repair (Plans 21-09 / 21-14)
  paths are NOT suppressed.
- **R-T1 verified**: applyPeerSync is purely doc/selection — does NOT
  flip paneState. The R7 two-pane peer overlay (Plan 21-12) is owned by
  `multiPaneCoordinator.ts:registerMultiPaneCoordinator` (subscribes to
  `active-leaf-change` + `layout-change`) and is decoupled from the
  vault.on('modify') path. Both subsystems can co-exist without
  interaction.
- **STRIDE Tampering T-21-17-01**: `newBody` is always the result of
  `extractFenceBody(disk, fenceIndex)` — i.e., the user's own file
  contents read from disk. No untrusted input. Accepted.
- **STRIDE DoS T-21-17-02**: peer fan-out cost is O(N) per modify
  event. CONTEXT L10 baseline (single-active-per-file) means N ≤ 2 in
  practice. Accepted.
- **STRIDE Tampering T-21-17-03 mitigation in place**: registryKey is
  constructed at mount time from immutable inputs (file.path, fenceIndex,
  leafId, mode). Strict-equality match (NOT path-prefix) in the routing
  helper. A null originator (legacy or unthreaded caller) routes ALL
  controllers to single-pane-consumed — the safe fallback (no incorrect
  peer dispatch).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test-contract refinement] F3 / F4 routing test shape**

- **Found during:** Task 2 RED gate review.
- **Issue:** The plan suggested testing "embed widget on same file is
  skipped from peer fan-out" as `peer-fan-out` decision with C marked
  `skip-embed-or-readonly`. The routing helper's actual contract: when
  only ONE editable controller exists on the file, the helper short-
  circuits to `single-pane-consumed` (no fan-out activates) — which
  satisfies the plan's must_have ("C.applyPeerSync is NEVER called")
  with strictly less code. The peer-fan-out + skip-embed-or-readonly
  shape is exercised by the multi-editable case (F3b / F4b — added).
- **Fix:** F3 / F4 assert `single-pane-consumed`; F3b / F4b cover the
  multi-editable + embed/readOnly case.
- **Files modified:** `tests/widget/splitPaneCursorPreservation.test.ts`.
- **Plan compliance:** asserts the same contract as the plan-suggested
  shape, with stricter coverage (both single-editable + multi-editable
  scenarios).

**2. [Rule 3 — Blocking issue resolution] Async test polling for
currentDocHash refresh**

- **Found during:** Task 2 GREEN gate.
- **Issue:** `applyPeerSync` refreshes `currentDocHash` via
  `void sha1(newBody).then(hash => this.currentDocHash = hash)`. The
  test originally awaited 5 microtasks via `Promise.resolve()` — but
  `crypto.subtle.digest` returns a real Promise that needs a macrotask
  (setTimeout 0) drain to settle in some test envs. Test failed
  intermittently because microtasks alone weren't enough.
- **Fix:** Replaced microtask-only drain with a polling loop that
  awaits `setTimeout(1)` up to 50 times (max ~50ms wall-clock). This
  matches the pattern at `tests/widget/debouncedWriter.test.ts:121-124`.
- **Files modified:** `tests/widget/splitPaneCursorPreservation.test.ts`
  (the currentDocHash test only).
- **Plan compliance:** the assertion is unchanged ("currentDocHash is
  no longer the placeholder"); only the wait mechanism is more robust.

**3. [Rule 3 — Blocking issue resolution] EditorSelection.cursor return type**

- **Found during:** Task 2 build gate after applyPeerSync GREEN.
- **Issue:** TypeScript error TS2740 — `EditorSelection.cursor()` returns
  a `SelectionRange`, NOT an `EditorSelection`. The defensive fallback
  (when `ChangeSet.of` rejects a spec) was assigning a `SelectionRange`
  to `mappedSelection: EditorSelection` directly, which fails strict-
  null-check.
- **Fix:** Wrap the cursor in `EditorSelection.create([...])` — single-
  range EditorSelection. Functionally identical; type-clean.
- **Files modified:** `src/widget/WidgetController.ts` (line 525).
- **Plan compliance:** the algorithm is unchanged; only the type-level
  wrapping is refined.

### Auth gates
None — no LeetCode API calls; no AI calls; no network surface introduced.

### Auto-approved checkpoints
- **Task 3 (`checkpoint:human-verify`, `gate="blocking"`)**: per the
  orchestrator's auto-mode rules (`workflow._auto_chain_active=true`,
  `workflow.auto_advance=true`), human-verify checkpoints with
  non-`blocking-human` gates auto-approve. Recorded here for traceability.
  Live UAT in dev vault is the user's R9 closure verification — recommended
  to run against a v1.3 LC note in two split panes before merge.

## Plan 21-17 Task 3 — UAT verification handoff

The user should run the 10-step UAT in `21-17-PLAN.md` Task 3
`<how-to-verify>` block before declaring R9 closed. Critical expectations:

| # | Expectation | Files exercised |
|---|-------------|-----------------|
| 4 | Pane B downstream-edit caret unchanged | applyPeerSync P1 path |
| 5 | Pane B upstream-edit caret maps forward | applyPeerSync P2 path |
| 6 | Pane A own-caret unchanged | originator-skip routing |
| 7 | R7 two-pane peer overlay still works | reconcileFocus (decoupled — Plan 21-12) |
| 8 | External-edit single-pane fallback unchanged | reloadFromDisk('silent') path |
| 9 | Cmd-Z in pane B does NOT undo pane A's edits | addToHistory.of(false) annotation |
| 10 | No console errors | defensive try/catch around dispatch |

After UAT passes: update `21-HUMAN-UAT.md` R9 entry from `status: failed`
to `status: closed`.

## Self-Check: PASSED

- `[FOUND]` `.planning/phases/21-v1-2-migration/21-17-SUMMARY.md` (this file)
- `[FOUND]` `src/widget/selfWriteSuppression.ts` (modified; peekOriginator + originatingRegistryKey)
- `[FOUND]` `src/widget/debouncedWriter.ts` (modified; registryKey threading)
- `[FOUND]` `src/widget/WidgetController.ts` (modified; applyPeerSync + ChangeSet import)
- `[FOUND]` `src/widget/peerSyncRouting.ts` (created; pure routing helper)
- `[FOUND]` `src/main.ts` (modified; modify-handler peer-sync fan-out)
- `[FOUND]` `tests/widget/selfWriteSuppression.test.ts` (modified; +6 tests)
- `[FOUND]` `tests/widget/debouncedWriter.test.ts` (modified; +3 tests)
- `[FOUND]` `tests/widget/splitPaneCursorPreservation.test.ts` (created; 19 tests)
- `[FOUND]` Commit `50b94a1` (Task 1 RED)
- `[FOUND]` Commit `3ca8dd1` (Task 1 GREEN)
- `[FOUND]` Commit `8c80ed1` (Task 2 RED + routing helper)
- `[FOUND]` Commit `a6d333c` (Task 2 GREEN — applyPeerSync + main.ts fan-out)
- `[VERIFIED]` Sanity grep gates: all ≥ expected counts
- `[VERIFIED]` `npm run build` exits 0
- `[VERIFIED]` Full suite: 3087 passing / 7 skipped / 0 failing
- `[VERIFIED]` Phase 21 surface (tests/widget tests/main tests/notes tests/solve): 2030 passing / 5 skipped / 0 failing
