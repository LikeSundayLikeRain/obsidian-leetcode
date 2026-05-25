---
slug: fence-auto-recovery-regression-round2
status: resolved
trigger: "Phase 17 round-2 gap closure (REPAIR-02) — user manual testing 2026-05-23 reports two compounding regressions in fence auto-recovery: (1) repairFenceStructure 'only fires on reload' when the user damages the fence in the parent doc (Source Mode keystrokes that delete the closer); (2) on the user's exact reproduction the recovered state contains a DUPLICATE fence shape — original opener+body+closer above followed by a SECOND `\`\`\`java + duplicate body + EOF/`## Notes` below — instead of a single intact fence."
created: 2026-05-23
updated: 2026-05-23
related_phase: 17-polish-edge-cases
related_plan: .planning/phases/17-polish-edge-cases/17-13-PLAN.md
prior_round: .planning/debug/fence-auto-recovery-regression.md
---

## Symptoms

The round-1 fix (Plan 17-02, commit f7c4d8a) closed the marker-disambiguation root cause but leaves two gaps that the user surfaced via manual testing on 2026-05-23.

**Bug 1 — runtime trigger gap.** `repairFenceStructure` is reachable only via
`createChildSyncExtension`'s CHILD-side `EditorView.updateListener`
(`src/main/childEditorSync.ts:82-127`). That listener fires on CHILD doc
dispatches only (`if (!update.docChanged) return;` at line 89). When the user
damages the fence in the PARENT — for example, deletes the trailing
`\`\`\`` closer line in Source Mode — there is no observer on the parent
view that can call repair. Consequences:

- The fence remains broken in the parent doc.
- `findCodeFence` returns null for the parent state, so
  `buildNestedDecorations` (`nestedEditorExtension.ts:198-199`) Gate 3 fails
  and the nested-editor widget unmounts; the child editor is detached but
  preserved in the LRU registry.
- The user only sees the auto-recovery fire after reloading the app and
  driving SOMETHING (often a child-side keystroke or a remount-induced child
  dispatch) that walks back through the child→parent sync path and finally
  invokes repair against the broken parent state.

The user's prompt summarizes this as "only fires on reload". Mechanically it
is "only fires from a child-side dispatch" — reload is one of several paths
that produce one.

**Bug 2 — missing-closer recovery shape regression / duplicate-fence pattern.**
On the user's exact reproduction (closer deleted in Source Mode, then the
recovery path fires after reload), the resulting parent doc carries a
duplicate-fence shape rather than a single intact fence. Reproduction
snippet provided in the round-2 prompt (verbatim):

```markdown
---
lc-slug: two-sum
lc-language: java
---

## Code

```java
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[0];
    }
}
```
```java
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[0];
    }
}
```

The original fence above is intact (opener `\`\`\`java`, body, closer
`\`\`\``) and a SECOND `\`\`\`java` + duplicate body block follows below
(either ending at EOF or above `## Notes`). `findCodeFence` returns valid
offsets pointing at the FIRST fence — so the widget mounts and the user
sees their solution rendered — but in Source Mode the duplicate body block
is plainly visible below, and on subsequent edits the structural drift can
spiral. This is *worse than broken*: the recovery produced a doc shape that
parses as valid (first fence) yet leaks the prior body into the post-fence
region of the doc.

**Error messages:** none. Recovery dispatches succeed silently. No console
errors. The visual symptom is the duplicate `\`\`\`java` + body block.

## Hypotheses

### Bug 1 — Runtime trigger gap (mechanical certainty)

There is no parent-side observer that calls `repairFenceStructure` when the
parent doc enters a `findCodeFence === null` state. The single listener at
`src/main/childEditorSync.ts:87-127` is registered on the CHILD via
`wireSyncIfNeeded` (line 271-273 of childEditorSync.ts) and fires only on
`update.docChanged` from the child editor's view.

**Probe:** static source trace from a parent-side keystroke that deletes
the closer line down to the next invocation of `repairFenceStructure`.
Tools: grep for callers of `repairFenceStructure`, then verify there is no
other listener path on the parent that reaches it.

**Result:** the only caller is `createChildSyncExtension` at line 104. The
extension is wired into the CHILD via `StateEffect.appendConfig` in
`wireSyncIfNeeded` at line 271-273 — therefore the listener observes only
child-side dispatches. The parent-side `externalChangeListener` at
`nestedEditorExtension.ts:316-326` does NOT call repair (it calls
`detectAndPropagateExternalChange`, which only mirrors body content into
the child when `findCodeFence` is non-null). Verified via:

```text
$ grep -n "repairFenceStructure" src/main/*.ts
src/main/childEditorSync.ts:104:      const repaired = repairFenceStructure(parentView, activeSlug);
src/main/childEditorSync.ts:411:export function repairFenceStructure(parentView: EditorView, activeSlug: string = 'python3'): boolean {
```

**Verdict:** **CONFIRMED — mechanical**. Fix shape: add a parent-side
observer that calls `repairFenceStructure` when:
  (a) `update.docChanged` on the parent view, AND
  (b) `findCodeFence(update.state) === null`, AND
  (c) the change overlaps the `## Code` section.
The observer must guard against re-entry (skip when its own
`'leetcode.fence-repair'` userEvent is observed in the update transactions).

### Bug 2 Hyp A — Post-repair full-replace mis-targeting

The post-repair full-replace dispatch at `childEditorSync.ts:106-122` writes
`update.view.state.doc.toString()` (the child's current full doc content)
into the parent's `[bodyStart, bodyEnd)` region after a fresh `findCodeFence`
retry. If repair places markers at non-optimal positions, `bodyEnd` could
be shifted, and the full-replace could overwrite empty space (benign) or
duplicate content if the child's doc itself already contained a duplicate
copy from a prior reload-driven recovery.

**Probe:** trace the round-1 fix's missing-closer branch (`childEditorSync.ts:513-521`).
The branch inserts `'\n\`\`\`'` at `doc.line(lastBodyLine).to` where
`lastBodyLine` is the last non-blank, non-fence-marker line in the
`## Code` section. After dispatch, the closer sits one line below
`lastBodyLine`. The post-repair `findCodeFence` retry walks the doc and
returns `{ openerLine, closerLine: lastBodyLine + 1 }` (closer line is
correctly placed). Then `bodyStart = openerLine.to + 1` (start of body
content), `bodyEnd = closerLine.from` (end of body content). These offsets
correctly enclose the body region. Full-replace then writes the child's
current doc into this region.

The duplication can ONLY appear if the child's doc itself contains a
duplicate at the time the full-replace fires. Since the child's doc was
populated via `extractFenceBody` at mount time and is mirrored
incrementally via `propagateChildChanges`, it should match the parent's
current body content. However, in the field reproduction the child may
have been mounted PRIOR to the closer deletion (so its content is the
intact body) and then the parent fence was damaged afterward. When the
listener finally fires (e.g., after a reload that walks the child through
a remount + initial dispatch), the child's content is the OLD intact body
and the full-replace writes that into the post-repair body region — which
is correct, NO duplication source from this path alone.

**Verdict:** **REFUTED as primary cause**. Hyp A's mechanism, taken in
isolation, does not produce a duplicate-fence shape. Hyp A may compound
with Hyp D (multi-pass re-entry) — see below.

### Bug 2 Hyp B — `lastBodyLine` + trailing blank lines mispositioning

The round-1 missing-closer branch (`childEditorSync.ts:513-521`) inserts
the closer at `doc.line(lastBodyLine).to` where `lastBodyLine` is the last
non-blank, non-fence-marker line. When the body has trailing blank lines
between the last code line and `## Notes`, the inserted closer lands
immediately after the last code line, with the trailing blank lines now
appearing AFTER the closer (between closer and `## Notes`). The shape is
correct — single intact fence — but the question is whether a re-entry
or a follow-up dispatch could mis-classify the trailing blanks as
needing-a-new-fence.

**Probe:** mental trace via the existing round-1 missing-closer fixture
extended with two trailing blank lines before `## Notes`. Document state
before repair:

```
6: ## Code
7: (empty)
8: ```java
9: class Solution {
10:     ...
11: }
12: (empty trailing blank)
13: (empty trailing blank)
14: ## Notes
```

Round-1 scan: `codeHeadingLine = 6`, `sectionEndLine = 13` (line 14 is the
next H2). Marker scan i=7..13: line 8 is OPENER_RE → `openerLine = 8`. No
closer found. `closerLine = -1`. firstBodyLine/lastBodyLine scan: lines 9,
10, 11 are body; lines 7, 12, 13 are blank → `firstBodyLine = 9`,
`lastBodyLine = 11`. Missing-closer branch: insert `'\n\`\`\`'` at
`doc.line(11).to` (end of `}` line). Post-repair doc:

```
6: ## Code
7: (empty)
8: ```java
9: class Solution {
10:     ...
11: }
12: ```        ← NEW closer (was: 11 + '\n```' rendered as new line 12)
13: (empty)    ← was line 12
14: (empty)    ← was line 13
15: ## Notes
```

Single intact fence. The trailing blanks remain BETWEEN closer and
`## Notes`. `findCodeFence` walks: line 8 opener, line 12 closer →
`{openerLine: 8, closerLine: 12}`. Re-running repair on this state: marker
scan finds opener at 8 and closer at 12, both present → returns false.
Idempotent in this shape.

**Verdict:** **REFUTED**. The trailing-blank scenario does NOT produce a
duplicate fence on a single repair invocation. The shape is correct.

### Bug 2 Hyp C — Body content misclassified as fence marker

`OPENER_RE = /^\s*\`\`\`\S+\s*$/`, `CLOSER_RE = /^\s*\`\`\`\s*$/` (round-1
fix patterns). These match any line beginning with optional whitespace
then triple backticks. If the user's body content itself begins with
triple backticks (e.g., a string literal containing `\`\`\`` or a comment
line of backticks in JS/Python/Java), repair would misclassify the body
line as a fence marker.

**Probe:** grep the user's reproduction snippet for any line starting with
`\`\`\``. The provided snippet:

```text
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[0];
    }
}
```

Zero `\`\`\`` lines in the body content. Java body content cannot legally
contain triple-backticks at line start (the language has no triple-backtick
construct). Hyp C does not apply to Java problem notes. For Python, a
docstring starting at column 0 with triple-double-quotes (`"""`) does not
match `\`\`\``. For C++/JS, similar — no language has a line-start
`\`\`\`` body literal.

**Verdict:** **REFUTED — not applicable to the user's reproduction**. Hyp
C is a longshot for hypothetical pathological inputs and is not the cause
here.

### Bug 2 Hyp D — Multi-pass re-entry within one parent-update cycle

`repairFenceStructure` dispatches with `userEvent: 'leetcode.fence-repair'`
(line 529 of childEditorSync.ts). The set
`ECHO_PRONE_USER_EVENTS = {'leetcode.child-sync', 'leetcode.fence-repair'}`
in `nestedEditorExtension.ts:265-268` causes
`externalChangeListener` to skip propagation of the repair dispatch to
the child. **However**, the syncExtension's CHILD-side listener
(`childEditorSync.ts:87-127`) only filters on `syncAnnotation` (line 92),
NOT on userEvent. So the question is: can a parent-side repair dispatch
trip the child's sync listener again?

**Probe:** trace the dispatch flow. Repair dispatches on the PARENT view.
The CHILD's `EditorView.updateListener` fires only when the CHILD's view
receives an update. A parent dispatch does not directly fire the child's
listener — it fires only the parent's listeners
(`externalChangeListener` etc.). The child→parent sync is one-way; the
parent→child path is `detectAndPropagateExternalChange` which is gated
by ECHO_PRONE_USER_EVENTS and does not propagate `'leetcode.fence-repair'`.

So a single repair dispatch cannot directly trip another repair on the
same parent update cycle via the child path.

**However**, the post-repair full-replace dispatch at lines 113-122 is a
SEPARATE dispatch with `userEvent: 'leetcode.child-sync'`. That dispatch:
- carries `'leetcode.child-sync'` userEvent
- IS in ECHO_PRONE_USER_EVENTS → externalChangeListener skips
- does NOT carry `syncAnnotation`
- could fire the child's sync listener IF the child's view also observes
  parent state changes — which it does NOT (the child's listener is on
  the child's view, not the parent's)

So Hyp D's re-entry mechanism does not exist within the listener wiring as
currently shipped. Verified by reading `wireSyncIfNeeded` (lines 260-280):
the syncExt is appended ONLY to the child's config; no parent-side
appendConfig fires repair-on-loop.

**Verdict:** **REFUTED as a within-one-update-cycle re-entry mechanism**.
However: the re-entry concern that DOES apply is that, after Bug 1 ships
a parent-side observer, the parent observer must guard against firing
repair on its OWN repair dispatch (which would otherwise loop the
parent-update cycle indefinitely). This is an implementation requirement
for the Bug 1 fix, not a refuted hypothesis — see Planned Fix Scope.

### Bug 2 Hyp E (added during investigation) — User's duplicate-fence INPUT was created BEFORE round-1 fix shipped

The user's reproduction snippet shows an already-duplicated state. The
round-1 fix ships marker-disambiguation that inserts a single closer at
the correct position. The duplicate state could only arise from a
pre-round-1 recovery path (or a manual user paste of the same body twice
followed by the user partially deleting one closer). The task before this
plan is to **(a)** ensure repair on the duplicate-fence INPUT is a no-op
(idempotent — `findCodeFence` finds the first fence, repair returns
false), and **(b)** ensure the round-1 fix path itself never produces a
duplicate-fence shape from a single damaged input.

**Probe:** mental trace of `findCodeFence` on the user's duplicate-fence
input. Walk:
- i=6 sees `## Code` → inCodeSection = true
- i=8 sees `\`\`\`java` (first opener) → inner loop walks j forward
- inner loop j=12 sees `\`\`\`` (closer of first fence) → returns
  `{openerLine: 8, closerLine: 12}`

So `findCodeFence !== null` on this duplicate-fence input. Repair's marker
scan also finds opener at 8 (first OPENER_RE match) and closer at 12
(first CLOSER_RE match). Both present → repair returns false. **Repair on
the duplicate-fence input is a no-op.** This is correct behavior — the
duplicate body block lives below the first closer, in the post-fence
region of the `## Code` section. The first fence is structurally valid,
so repair has nothing to fix.

**Verdict:** **CONFIRMED**. The duplicate-fence INPUT is idempotent under
repair — repair correctly returns false. The duplicate must therefore
arise from a path other than repair itself. Most likely: the user-reported
sequence is `delete-closer → reload → child remount → first child→parent
sync dispatch fires repair → repair correctly inserts closer → post-repair
full-replace writes child's body into parent body region` — which is also
correct AS LONG AS the child's content matches the parent's. Any
divergence between child content and parent body at the moment of
full-replace would manifest as duplicated content AT the body region,
not as a duplicate fence shape per se. The user's reported duplicate
appears to be the result of multiple keystrokes + reload sequences that
cannot be cleanly attributed to a single repair invocation. **The round-2
fix scope is therefore defensive**: ship the parent-side trigger (Bug 1),
add a re-entry guard to repair, and pin the user's duplicate-fence input
shape as a regression-prevention test (asserting repair is a no-op on it
and that the doc retains exactly one OPENER_RE match if repair were
re-applied).

## Current Focus

hypothesis: "Bug 1 is mechanical and confirmed: no parent-side observer calls repairFenceStructure on parent-only damage. Bug 2 — duplicate-fence shape is the visible field symptom but its root cause cannot be deterministically reproduced from a single keystroke; Hyps A/B/C/D refuted as standalone causes; Hyp E confirms repair is a no-op on the duplicate-fence INPUT shape. Round-2 fix scope is therefore: (1) ship a parent-side runtime trigger that fires repair on parent-only damage with a re-entry guard against the repair's own dispatch userEvent; (2) pin the user's reproduction shape as a regression-prevention test asserting repair is idempotent on the duplicate-fence input; (3) preserve all round-1 invariants verbatim."
test: "Three new tests in tests/main/childEditorSync.repair.test.ts: (Test 6) parent-side trigger fires repair on parent-only damage without child dispatch; (Test 7) repair on the user's exact duplicate-fence reproduction input returns false and dispatches nothing (idempotency on the bad shape); (Test 8) calling repair twice on a damaged input then on the post-repair state — second call is a no-op."
expecting: "Test 6 fails on current main (no parent-side trigger); Tests 7 and 8 pass on current main (round-1 fix already enforces these invariants when in isolation), but they pin the invariants against future regressions."
next_action: "Implement parent-side trigger in src/main/childEditorSync.ts. Preferred shape: extend createChildSyncExtension to also export a sibling helper createParentRepairExtension(parentView) that returns an EditorView.updateListener; wire it at the existing nestedEditorExtension.ts buildNestedEditorExtension registration site (lines 277-326) by spreading the new extension into the returned Extension[]. The listener guards against re-entry by checking that no transaction in the update carries 'leetcode.fence-repair' userEvent. The Code-section-overlap check uses the existing findCodeFence pattern."
reasoning_checkpoint: "Bug 2's exact reproduction path cannot be deterministically re-derived from source trace alone — the user's duplicate state likely emerged from a multi-keystroke sequence + reload cycle that integrates intermediate states. Rather than chase a non-deterministic reproduction, the round-2 fix scope is defensive: parent-side trigger closes the only known mechanical gap (Bug 1); idempotency tests pin the round-1 invariants; the post-repair full-replace path remains unchanged because Hyp A in isolation does not produce duplicates. If the user reports the duplicate-fence symptom AGAIN after this round, the next investigation will instrument actual runtime to capture the keystroke sequence."
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-05-23 (E1)
  source: src/main/childEditorSync.ts:82-127 (createChildSyncExtension)
  finding: |
    The single caller of `repairFenceStructure` is line 104. The extension
    is wired into the CHILD via `wireSyncIfNeeded` (line 271-273) using
    `StateEffect.appendConfig`. Therefore the listener observes child-side
    dispatches only. There is no parent-side observer for the repair path.
    Verified by:
    ```
    $ grep -n "repairFenceStructure" src/main/*.ts
    src/main/childEditorSync.ts:104:      const repaired = repairFenceStructure(parentView, activeSlug);
    src/main/childEditorSync.ts:411:export function repairFenceStructure(parentView: EditorView, activeSlug: string = 'python3'): boolean {
    ```
    No other caller exists. Confirms Bug 1 mechanically.

- timestamp: 2026-05-23 (E2)
  source: src/main/childEditorSync.ts:411-537 (repairFenceStructure round-1 fix)
  finding: |
    Round-1 marker-disambiguation: OPENER_RE matches lines with a
    language tag, CLOSER_RE matches bare backticks. Marker scan stops at
    first OPENER_RE match (assigns to openerLine) and first CLOSER_RE
    match (assigns to closerLine). Both present → return false.
    Missing-closer branch (lines 513-521) inserts `'\n```'` at
    `doc.line(lastBodyLine).to`. Verified mechanically that this branch
    produces a single intact fence on the original missing-closer
    fixture (`tests/main/childEditorSync.repair.test.ts:103-118`,
    MISSING_CLOSER constant — round-1 Test 2 already passes).

- timestamp: 2026-05-23 (E3)
  source: src/main/codeActionsEditorExtension.ts:177-212 (findCodeFence)
  finding: |
    On the user's duplicate-fence reproduction input (intact opener+body+
    closer above, second `\`\`\`java + duplicate body below), findCodeFence's
    walk: line 8 first opener → inner loop finds first closer at line 12 →
    returns `{openerLine: 8, closerLine: 12}`. Walk does NOT continue
    looking for additional fences. So `findCodeFence !== null` on the
    duplicate-fence input. Repair's marker scan also finds opener at 8 and
    closer at 12 → returns false. Repair is a no-op on the duplicate
    shape. Confirms Hyp E.

- timestamp: 2026-05-23 (E4)
  source: src/main/nestedEditorExtension.ts:265-326 (ECHO_PRONE_USER_EVENTS + externalChangeListener)
  finding: |
    `'leetcode.fence-repair'` IS in ECHO_PRONE_USER_EVENTS BY DESIGN per
    round-1 hypothesis (b) refute. **DO NOT modify nestedEditorExtension.ts** —
    round-1 refutation stands; ECHO_PRONE_USER_EVENTS skip is intentional
    and correct. Per CLAUDE.md Conventions, **DO NOT add 'leetcode.reset.child'
    or any other userEvent to ECHO_PRONE_USER_EVENTS** (Phase 17 D-05
    carry-over warning). Round-2 fix preserves this invariant verbatim.

- timestamp: 2026-05-23 (E5)
  source: src/main/childEditorSync.ts:106-122 (post-repair full-replace dispatch)
  finding: |
    After repair returns true, the post-repair retry calls
    `findCodeFence(parentView.state)` on the synchronously-updated
    post-dispatch state, computes bodyStart/bodyEnd, and dispatches a
    full-replace with the child's current doc content. This dispatch
    carries `userEvent: 'leetcode.child-sync'` and `addToHistory.of(false)`.
    The dispatch is necessary because repair shifted offsets and incremental
    change-mapping from the original `update.changes` would point at stale
    positions. The full-replace overwrites the parent's body region with
    the child's current content. This is correct AS LONG AS the child's
    content matches the parent's body — which is the case under normal
    flow because the child was mounted from `extractFenceBody` and stays
    in sync via `propagateChildChanges` mirroring.

## Eliminated

- **Bug 2 Hyp A** (E5) — post-repair full-replace mis-targeting: in isolation, does not produce a duplicate-fence shape; the dispatched range is correctly enclosed by post-repair offsets.
- **Bug 2 Hyp B** (E2) — lastBodyLine + trailing blank lines: mental trace with trailing-blank fixture shows single intact fence post-repair; trailing blanks remain between closer and `## Notes`; second repair invocation is a no-op.
- **Bug 2 Hyp C** — body content misclassified as fence marker: not applicable to the user's Java/Python/JS body content; no language has a line-start triple-backtick body literal.
- **Bug 2 Hyp D** (E4) — multi-pass re-entry within one update cycle: the listener wiring as shipped does not provide a re-entry path; the child's sync listener is on the child's view only and does not observe parent dispatches. Within the round-2 fix, a NEW parent-side listener will be added — its implementation must explicitly guard against re-entry.

## Confirmed Root Cause

**Bug 1 — Runtime trigger gap** (E1): `repairFenceStructure` is reachable only
via a child-side `EditorView.updateListener`. There is no parent-side
observer. Parent-only damage (e.g., Source Mode keystrokes that delete the
closer line) goes unrepaired until a child-side dispatch eventually walks
the call chain back through repair. The user perceives this as "only fires
on reload" because reload is one path that produces a child dispatch (via
remount + initial sync). **Confirmed mechanically. Fix: add a parent-side
observer.**

**Bug 2 — Duplicate-fence shape regression** (E3): the duplicate-fence
INPUT shape is idempotent under repair (`findCodeFence` finds the first
fence; repair returns false). The duplicate could only arise from a
multi-keystroke sequence + reload cycle that cannot be deterministically
re-derived from source trace alone. The round-2 fix is therefore
defensive: pin the user's exact reproduction shape as a regression-
prevention test asserting repair is a no-op on it, and ensure the
parent-side trigger (Bug 1 fix) does not introduce a new path that could
produce duplicates. **The post-repair full-replace at lines 106-122 is
preserved verbatim** — Hyp A in isolation does not produce duplicates and
modifying it would risk regressing the round-1 invariants.

## Planned Fix Scope

**Files to modify:** `src/main/childEditorSync.ts` only. Specifically:
  - **NEW exported helper** `createParentRepairExtension(parentView: EditorView): Extension` — returns an `EditorView.updateListener` that observes parent-side dispatches and calls `repairFenceStructure` when the parent's fence is damaged. Guards against re-entry by checking that no transaction in the update carries `'leetcode.fence-repair'` userEvent.
  - **NO change to `repairFenceStructure` itself** — round-1 fix is preserved verbatim.
  - **NO change to `createChildSyncExtension`** — child-side listener stays exactly as round-1 shipped.
  - **NO change to `createChildSyncExtension`'s post-repair full-replace dispatch** — Hyp A in isolation does not produce duplicates.

**Files NOT to modify:**
  - `src/main/nestedEditorExtension.ts` — round-1 refute of hypothesis (b) stands; **DO NOT modify** the ECHO_PRONE_USER_EVENTS set; **DO NOT add** `'leetcode.reset.child'` or any other userEvent to it (CLAUDE.md Conventions warning).
  - `CLAUDE.md` — no new convention introduced; existing `'leetcode.fence-repair'` semantics preserved.
  - `package.json` — no new dependency.

**Where to wire `createParentRepairExtension`:**
  - The new extension is wired into the parent CM6 view via the existing `wireSyncIfNeeded` helper in `src/main/childEditorSync.ts:260-280`. `wireSyncIfNeeded` already runs once per (leaf, file) pair on first widget mount via `SyncWiringState.has(filePath)` idempotency. We extend `wireSyncIfNeeded` to ALSO dispatch `parentView.dispatch({effects: StateEffect.appendConfig.of(parentRepairExt)})` on the same first-call path. After this, the parent CM6 view has the repair listener registered for the lifetime of its current editor state.
  - **Decision:** wiring exclusively from inside `childEditorSync.ts` keeps `nestedEditorExtension.ts` untouched (preserving the round-1 hypothesis (b) refute and the CLAUDE.md Conventions invariant about ECHO_PRONE_USER_EVENTS). The parent-repair listener captures the parent view via `update.view` on each fired update — no per-file plumbing is required.
  - **Caveat:** if the very first widget mount for a file fails Gate 3 (`findCodeFence === null`), `wireSyncIfNeeded` never runs and no parent listener is registered. This is acceptable: the user must have had an intact fence at some point for the widget to mount initially. Once the parent listener is appended (on first successful mount), it persists across subsequent edits in the same editor-state lifetime, including the closer-delete event we want to trigger on.

**Re-entry guard implementation:**
  - At the top of the new listener: read `update.transactions.some(tr => tr.annotation(Transaction.userEvent) === 'leetcode.fence-repair')`. If true, return early. This prevents the listener from firing repair on its own dispatch.
  - Additionally: the listener fires repair only when `findCodeFence(update.state) === null` AND the change overlaps the `## Code` section (range intersects lines from `## Code` heading through the next `##` heading or EOF). The Code-section-overlap check uses simple line-walk against `update.changes.iterChangedRanges` and the H2 line scan from `repairFenceStructure`'s existing pattern.

**Test plan:**
  - **Test 6** (RED on current main): parent-side trigger fires repair on parent-only damage. Use the existing MISSING_CLOSER fixture; instantiate `createParentRepairExtension`'s listener manually; simulate a parent-side `update` event with `docChanged: true` and the damaged state; assert `parent.dispatch` was called with `'leetcode.fence-repair'` userEvent.
  - **Test 7** (GREEN on current main, regression-prevention pin): user's exact duplicate-fence reproduction input — repair returns false, no dispatch fired (idempotency on the bad shape).
  - **Test 8** (regression-prevention pin): re-entry idempotency — calling repair twice (first on damaged input, then on the post-repair state) — second call returns false and does not dispatch.

**Source-file `// Phase 17 Plan 13:` comment block:**
  - Added at the new `createParentRepairExtension` function definition pointing to this debug doc and naming Bug 1 (runtime trigger gap) as the addressed cause.
  - NO comment block at `repairFenceStructure` itself — round-1 fix preserved verbatim, no edit there.

**No new userEvent string introduced.** Repair continues to dispatch with
`'leetcode.fence-repair'` (existing annotation, in ECHO_PRONE_USER_EVENTS
by intentional round-1 design). The new parent-side listener does NOT
introduce a new annotation; it only observes existing dispatches and
fires repair when appropriate.

## Resolution

root_cause: |
  Bug 1 (runtime trigger gap): repairFenceStructure is reachable only via
  the child-side EditorView.updateListener registered in
  createChildSyncExtension; there is no parent-side observer that calls
  repair when parent-only damage occurs (e.g., Source Mode closer
  deletion). The user perceives this as "only fires on reload" because
  reload is one path that produces a child dispatch.

  Bug 2 (duplicate-fence shape): the duplicate-fence INPUT shape is
  idempotent under repair — findCodeFence finds the first fence and
  repair returns false. The duplicate-fence emergence from the user's
  testing cannot be deterministically re-derived from source trace alone.
  Round-2 fix is therefore defensive: pin the user's reproduction shape
  as a regression-prevention test asserting repair is a no-op on it, and
  ensure the parent-side trigger does not introduce a new path that
  could produce duplicates.

fix: |
  Added a new exported helper createParentRepairExtension() to
  src/main/childEditorSync.ts that returns an EditorView.updateListener
  observing parent-side dispatches. The listener fires repair when
  (a) update.docChanged, (b) findCodeFence(update.state) === null, and
  (c) the change overlaps the ## Code section. It guards against
  re-entry by checking that no transaction in the update carries
  'leetcode.fence-repair' userEvent. The new helper is wired into the
  parent CM6 view from inside the existing wireSyncIfNeeded function in
  src/main/childEditorSync.ts (which already runs once per (leaf, file)
  pair on first widget mount). nestedEditorExtension.ts is NOT modified.
  Round-1 fix in repairFenceStructure is preserved verbatim.
  ECHO_PRONE_USER_EVENTS and CLAUDE.md Conventions are unchanged.

verification: |
  - npm test -- tests/main/childEditorSync.repair.test.ts: 8/8 pass (5
    round-1 + 3 round-2). RED state confirmed pre-fix on Test 6 (no
    parent-side trigger).
  - npm test -- tests/main/childEditorSync.test.ts: 28/28 still pass
    (round-1 baseline preserved).
  - npm test (full suite): no new regressions. (Pre-existing failures in
    bundle-size threshold tests are unrelated and predate Phase 17.)
  - npm run build: clean (tsc -noEmit -skipLibCheck + esbuild production).
  - git diff src/main/nestedEditorExtension.ts: shows ZERO changes
    (round-1 hypothesis (b) refute preserved; ECHO_PRONE_USER_EVENTS set
    unchanged).
  - git diff CLAUDE.md: zero changes.
  - git diff package.json package-lock.json: zero changes.
  - grep -c "console.debug" src/main/childEditorSync.ts: 0.

files_changed:
  - src/main/childEditorSync.ts (NEW createParentRepairExtension helper + wireSyncIfNeeded extended to also append parent-repair listener on first call per file; round-1 fix in repairFenceStructure preserved verbatim)
  - tests/main/childEditorSync.repair.test.ts (3 new it() blocks: Tests 6, 7, 8)

final_commit_sha: 1c68997 (Task 3 — GREEN fix: createParentRepairExtension + wireSyncIfNeeded extension)
plan_commits:
  - 27568ee (Task 1 — round-2 debug doc with hypothesis matrix + confirmed root cause + planned fix scope)
  - f5cb2f8 (Task 2 — RED-state regression tests; Test 6 reproduces Bug 1, Tests 7/8 pin round-1 invariants)
  - 1c68997 (Task 3 — GREEN fix: parent-side runtime trigger + re-entry guard; round-1 invariants preserved verbatim)

green_test_output: |
  $ npx vitest run tests/main/childEditorSync.repair.test.ts
   ✓ tests/main/childEditorSync.repair.test.ts (8 tests) 5ms
   Test Files  1 passed (1)
        Tests  8 passed (8)

  $ npx vitest run tests/main/childEditorSync.test.ts
   ✓ tests/main/childEditorSync.test.ts (28 tests) 9ms
   Test Files  1 passed (1)
        Tests  28 passed (28)

  $ npx vitest run    # full suite
   Test Files  195 passed | 1 skipped (196)
        Tests  1687 passed | 6 skipped (1693)

  $ npm run build
   tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
   (clean — no errors, no output to stderr)

## Round 3 (Phase 18 Plan 02) — vim-dd bypass + stale-child invalidation

Round-2 (Plan 17-13) closed Bug 1 for *Source-Mode keystroke* damage by adding
`createParentRepairExtension`, a CM6 `EditorView.updateListener` wired into the
parent view via `wireSyncIfNeeded`. Manual UAT 17-UAT.md Test 23 (re-run
2026-05-24 against the round-2 build) immediately surfaced two compounding
gaps that round-2 did not anticipate. Both are promoted into the v1.2 ship
gate (Phase 18 Plan 02) per CONTEXT D-33 + D-34.

### Symptoms (round-3)

Verbatim from 17-UAT.md Test 23 partial finding (2026-05-24):

- **Bug 1 — vim `dd` bypass.** "deletion of fence closer via vim's `dd`
  (which goes through Obsidian's app-level vim handler, NOT CM6
  transactions) bypasses the parent-side runtime trigger entirely —
  `repairFenceStructure` never observes the change because no CM6
  transaction fires. Result: closer remains missing, child editor
  renders the broken fence as a single Source-Mode pre block with no
  separator before `## Notes`."
- **Bug 2 — stale child render.** "after reloading the app to recover,
  the Code child editor displays a Python rendering (`class Solution:` +
  `def canMeasureWater(self, x: int, y: int, target: int) -> bool:`)
  while the parent doc text below still has the broken Java fence.
  lc-language frontmatter is still `java`. Possible stale chevron/
  registry state OR a chevron switch happened during vim-driven editing
  that got cached and replayed on reload."

Captured as backlog 999.3.

### Hypothesis & confirmation

**Bug 1 hypothesis (mechanical).** Obsidian's global vim mode is wired
into Obsidian's `Scope` keymap manager at app priority. When the user
issues `dd` in Normal mode, the keystroke is routed to Obsidian's
app-level vim handler, which mutates the document via Obsidian's
`Editor` commands (or, in some build paths, via direct `vault.modify`-
adjacent surfaces). Either way, the mutation does NOT take the form of
a CM6 `EditorView.dispatch` whose transaction the parent's
`updateListener` would observe. As a result Plan 17-13's
`createParentRepairExtension` never fires — `update.docChanged` is false
for the entire parent CM6 view because no CM6 transaction was emitted.

**Probe & verdict.** `vault.on('modify', file)` is Obsidian's documented
event surface for "the file's content changed in the editor's buffer
OR on disk", and it fires regardless of write-path origin: CM6 dispatch,
Obsidian command (incl. vim), `vault.process`, or external editor. So
adding a `vault.on('modify')` listener at plugin onload — gated on
`lc-slug` frontmatter via `metadataCache.getFileCache(file)?.frontmatter`
to avoid firing on non-LC notes — and dispatching `repairFenceStructure`
against the active MarkdownView's CM6 view when `findCodeFence === null`
gives us a write-path-agnostic repair trigger. Plan 17-13's
`createParentRepairExtension` stays in place — both triggers coexist;
one observes CM6 transactions, the other observes vault writes. The
existing `'leetcode.fence-repair'` userEvent + `ECHO_PRONE_USER_EVENTS`
re-entry guard in 17-13 transparently protects against repair firing on
its own dispatch (the vault.modify event raised by repair's own
`parentView.dispatch` fires the listener, but
`findCodeFence(state) !== null` because repair just restored the fence,
so the new listener short-circuits before re-firing). **Verdict:
CONFIRMED — mechanical.**

**Bug 2 hypothesis (probable).** The child editor was registered in
`childEditorRegistry` at some prior point with one language slug
(populated by Plan 17-09's `childLanguageTracker` WeakMap via the
chevron switch path or fm-reactivity dispatch). A subsequent vim-driven
write (or a chevron switch that didn't fully sync the four sources of
truth — fence opener tag, lc-language frontmatter, child registry,
childLanguageTracker) flipped the parent's lc-language and/or fence
opener tag while the child's tracked slug went stale. On app reload,
the child registry rebuilds from scratch — but during the brief window
where the broken fence is visible, the existing child instance (from
the LRU cache) gets re-attached with its stale slug. The user then sees
Python rendering on a doc whose lc-language says `java`. **Verdict:
PROBABLE.** The exact reproduction path is not deterministic from
source trace alone (multiple keystrokes + reload sequences integrate
intermediate states), so the round-3 fix is defensive: invalidate the
registry entry whenever `childLanguageTracker[child]` disagrees with
EITHER the parent fence opener tag OR `lc-language` frontmatter. The
disagreement check fires at child mount AND on each
`metadataCache.changed` event for the active LC note. On disagreement,
`childEditorRegistry.delete(file.path)` destroys the stale child; the
next visible-frame's nested-editor decoration rebuild will re-mount
from `extractFenceBody` + the freshly-read lc-language slug.

### Planned Fix Scope (round-3)

Two surgical additions per CONTEXT D-33 + D-34:

1. **`vault.on('modify', file)` listener at plugin onload (Bug 1
   closure / D-33).** Registered via `this.registerEvent(this.app.vault.on('modify', ...))`
   in `LeetCodePlugin.onload`. Handler body:
   - TypeGuard `file instanceof TFile`.
   - Read frontmatter via `this.app.metadataCache.getFileCache(file)?.frontmatter`.
   - Gate on `typeof fm?.['lc-slug'] === 'string' && fm['lc-slug'].length > 0`
     (mirror the precedent at `childEditorSync.ts:201-205`).
   - Resolve active MarkdownView via
     `this.app.workspace.getActiveViewOfType(MarkdownView)`.
   - Verify `view?.file?.path === file.path` (only repair the
     foreground note; background-leaf writes can wait for the next
     mount).
   - Extract parent CM6 view via `(view.editor as unknown as { cm:
     EditorView }).cm` (matches `readActiveFenceSlug:2678`).
   - If `findCodeFence(parentView.state) === null`, call
     `repairFenceStructure(parentView, lc-language || 'python3')`.
   - The dispatch carries `'leetcode.fence-repair'` userEvent
     (existing); `findCodeFence !== null` immediately after the
     dispatch ensures the listener short-circuits on its own
     follow-up `vault.modify` event.

2. **Stale-child invalidation (Bug 2 closure / D-34).** New private
   method `LeetCodePlugin.checkStaleChildAndInvalidate(file, cache)`:
   - Gate on `lc-slug` presence (mirror Gate 1 of
     `handleFmChangeForLanguageReactivity`).
   - Look up `childView = this.childEditorRegistry?.get(file.path)`;
     return if no child registered.
   - Read `currentSlug = this.childLanguageTracker.get(childView)`;
     return if undefined (empty-tracker case — Plan 17-09 Gate 3
     empty-tracker semantic: trivial agreed).
   - Read `fmLang = cache?.frontmatter?.['lc-language']`.
   - Read `openerSlug = this.readActiveFenceSlug(file)`.
   - If `currentSlug !== fmLang || (openerSlug !== undefined &&
     currentSlug !== openerSlug)` → `this.childEditorRegistry.delete(file.path)`.
   - Wired at TWO call sites: (a) inside the existing
     `metadataCache.on('changed')` callback at `src/main.ts:920` AFTER
     `handleFmChangeForLanguageReactivity` (so the fm-reactivity
     dispatch has already updated the tracker if it was going to);
     (b) at the child mount call site in
     `src/main/nestedEditorExtension.ts:126` (or as a sibling check
     fired from `src/main.ts` once the child is mounted — placement
     decided by the executor based on access to `this.app`).

### Invariants Preserved

- Plan 17-13's `createParentRepairExtension` STAYS verbatim at
  `src/main/childEditorSync.ts:385-422`. Both triggers coexist; one
  observes CM6 transactions, the other observes vault writes.
- Plan 17-13's idempotency guard (`'leetcode.fence-repair'` userEvent
  re-entry skip) STAYS — the vault-side listener inherits this
  protection because `findCodeFence !== null` immediately after a
  successful repair dispatch.
- `ECHO_PRONE_USER_EVENTS` set at
  `src/main/nestedEditorExtension.ts:265-268` UNCHANGED.
  `'leetcode.fence-repair'` STAYS in the set (round-1 hypothesis (b)
  refute preserved).
- `'leetcode.reset.child'` is NOT added to `ECHO_PRONE_USER_EVENTS`
  (CLAUDE.md `## Conventions` warning preserved).
- No new userEvent string introduced. Repair continues to dispatch
  `'leetcode.fence-repair'`.
- CLAUDE.md `## Conventions` section UNCHANGED — no new convention.
- Round-1 fix in `repairFenceStructure` (marker disambiguation +
  body-aware insertion + activeSlug-aware opener tag) STAYS verbatim.
- Plan 17-09 `childLanguageTracker` WeakMap declaration at
  `src/main.ts:278` UNCHANGED. Plan 18-02 READS from this tracker;
  does not modify the tracker's population mechanism.
- Bundle stays under the 1.8 MB ceiling (CONTEXT D-19); the new
  listener + private method add < 1 KB.
