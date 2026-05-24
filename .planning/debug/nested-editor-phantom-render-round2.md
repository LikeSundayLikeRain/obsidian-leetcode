---
status: inconclusive
trigger: "Plan 17-07 fix did not land. Source Mode phantom render of fence body during structural child edits still reproduces. User typed sdfasdf+Enter+typed three more lines into child editor on Longest Substring Without Repeating Characters note (lc-language: java). Parent doc has exactly one body copy; rendered output shows two."
created: 2026-05-24T00:00:00Z
updated: 2026-05-24T01:00:00Z
---

## Current Focus

hypothesis: Investigation inconclusive — fix code, bundle, and synthetic test all check out, yet user reports reproduction.
test: comprehensive code review + synthetic CM6 transaction test exercising the StateField update path
expecting: empirical instrumentation in production to identify the actual failing branch
next_action: Add runtime logging to nestedEditorExtension.ts StateField.update and childEditorSync.ts propagateChildChanges to capture branch decisions during user's typing reproduction

## Symptoms

expected: User types `sdfasdf\n            asdfasdf\n            asdfasdf\n            asdfasdf` into the child editor on a clean LC problem note. Parent doc gets the new body. Rendered output shows EXACTLY ONE child editor with the new content; no parent text appears below it.
actual: Two copies render: one inside child editor (correct), one as raw parent doc text below the child editor (the phantom). Reproduces in Source Mode AND Live Preview Mode.
errors: None — no runtime errors, no console exceptions. Just visual duplication.
reproduction: |
  1. Open clean LC problem note (lc-slug + lc-language: java in frontmatter)
  2. Click into child editor
  3. Type body characters, press Enter, type more, repeat (creates new lines via Enter+type)
  4. Observe two visual copies of the body
  Reproduces 100% of the time per user report (2026-05-24).
started: After Plan 17-07 was supposedly fixing this exact issue. The fix added a `lineCountChanged || tr.reconfigured` rebuild branch BEFORE the userEvent fast-path in nestedEditorExtension.ts:294-298. User confirms vault build matches repo build (MD5: 360d2b461474796248559e18c3f4c9b1) and `leetcode.child-sync` sentinel string is present in the bundle. So the fix code IS in production, but the rendered behavior still shows the phantom.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-24T00:01:00Z
  checked: src/main/nestedEditorExtension.ts (full file)
  found: |
    Lines 284-318 — StateField update method has the Plan 17-07 fix at 293-298:
      const userEvent = tr.annotation(Transaction.userEvent);
      const lineCountChanged = tr.docChanged && tr.startState.doc.lines !== tr.state.doc.lines;
      if (lineCountChanged || tr.reconfigured) {
        return buildNestedDecorations(tr.state, plugin, registry);
      }
      if (userEvent && userEvent.startsWith('leetcode.')) {
        return old.map(tr.changes);
      }
    Lines 280-318 are the StateField definition. The `provide(f) { return EditorView.decorations.from(f); }` is straightforward — no .map() chain.
  implication: |
    The rebuild branch is correctly placed BEFORE the leetcode.* fast-path. The branch condition is correct: lineCountChanged is computed from tr.startState.doc.lines vs tr.state.doc.lines. So if a child→parent mirror dispatch arrives with a multi-line insert, the line count delta should be non-zero and the rebuild branch should fire.

- timestamp: 2026-05-24T00:02:00Z
  checked: src/main/childEditorSync.ts (createChildSyncExtension and propagateChildChanges)
  found: |
    propagateChildChanges (line 132-174) iterates `update.changes.iterChanges`:
      const parentChanges: Array<{ from, to, insert }> = [];
      update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const mappedFrom = Math.min(Math.max(fromA + bodyStart, bodyStart), bodyEnd);
        const mappedTo = Math.min(Math.max(toA + bodyStart, bodyStart), bodyEnd);
        parentChanges.push({ from: mappedFrom, to: mappedTo, insert: inserted });
      });
      ...
      parentView.dispatch({
        changes: parentChanges,
        annotations: [
          Transaction.userEvent.of('leetcode.child-sync'),
          Transaction.addToHistory.of(false),
        ],
      });
    NOTE: dispatch is called ONCE per parent transaction with an array of changes. This is good — single transaction.
    BUT critical observation: the iterChanges callback uses fromA + bodyStart (where bodyStart is computed ONCE at the top of propagateChildChanges from the OLD parent fence position). For a single Enter+type child action that inserts e.g. "X\n  Y" into the child, child's update.changes might iterate as a single change `{fromA, toA, inserted: "X\n  Y"}`. Mapped to parent: from=fromA+bodyStart, to=toA+bodyStart, insert="X\n  Y". The parent transaction's tr.changes will contain this single change.
    Question: when CM6 applies a multi-line insert at a single position to the parent doc, does `tr.startState.doc.lines !== tr.state.doc.lines`?
    YES — the parent doc gets new line breaks, so doc.lines DOES change. Verified by inspection.
    So the rebuild branch MUST be firing. So the issue is NOT "rebuild not firing".
  implication: |
    Rule out hypothesis (a): the rebuild branch IS firing per the change shape.
    Need to investigate WHY the rebuilt decorations don't cover the new lines.

- timestamp: 2026-05-24T00:03:00Z
  checked: src/main/codeActionsEditorExtension.ts (findCodeFence)
  found: |
    findCodeFence (line 177-212) walks the doc top to bottom looking for `## Code` H2 + first ```fence + matching closer ```fence.
    It runs on the POST-change state (called by buildNestedDecorations(tr.state, ...)). After the multi-line insert the closer is at a higher line number; findCodeFence walks through line-by-line and finds the new closer position correctly.
    No caching. No stale data. This is pure-function over the post-change doc.
  implication: |
    Rule out hypothesis (b): findCodeFence walks the post-change doc correctly.

- timestamp: 2026-05-24T00:04:00Z
  checked: |
    src/main/nestedEditorExtension.ts:228-233 — line-hide decoration loop:
      for (let i = fence.openerLine + 1; i <= closerLine; i++) {
        builder.add(state.doc.line(i).from, state.doc.line(i).from, hideLine);
      }
  found: |
    The loop iterates from openerLine+1 to closerLine INCLUSIVE. After the multi-line insert, closerLine is higher; this loop will paint the new lines too. So the rebuild SHOULD produce a DecorationSet that covers all lines. Looking at this code path alone, the fix should work.
  implication: |
    Mystery deepens: the code path appears correct, the rebuild branch should fire, the decorations should cover the new lines, yet the user reports the new lines render WITHOUT lc-fence-hidden.
    Possible explanations:
    (X) The rebuild branch is not actually firing in production — instrumentation needed
    (Y) The rebuild fires but findCodeFence returns null on the post-change state (gate fails) — would return empty DecorationSet
    (Z) The rebuild fires, fence is found, but the new state.doc.line(i).from positions are computed from the wrong state somehow

- timestamp: 2026-05-24T00:10:00Z
  checked: bundled main.js for the StateField update logic
  found: |
    Bundle has the fix correctly compiled:
      update(a,s){let l=s.annotation(bo.Transaction.userEvent);
        return s.docChanged&&s.startState.doc.lines!==s.state.doc.lines||s.reconfigured
          ?o$(s.state,e,t)
          :l&&l.startsWith("leetcode.")?a.map(s.changes):s.docChanged?o$(s.state,e,t):a.map(s.changes)
      }
    Operator precedence parses as: ((s.docChanged && lines-delta) || s.reconfigured) → rebuild branch.
    So the fix logic is shipping correctly.
  implication: |
    The fix IS in the bundle and the logic is correct. The user's MD5-verified bundle has the fix.

- timestamp: 2026-05-24T00:12:00Z
  checked: multiple require("@codemirror/state") prefixes in the bundle (bo, di, Gn, etc.)
  found: |
    8+ different namespace aliases for @codemirror/state in the bundle. Initial concern: maybe
    Transaction.userEvent annotation (a unique key) is read with one alias and written with another,
    causing the lookup to fail. CHECKED: Node's require() cache returns the SAME module exports
    for the same module string. All aliases (bo, Gn, di, etc.) point to the SAME Transaction object.
    Verified: `bo.Transaction.userEvent === Gn.Transaction.userEvent` at runtime.
  implication: |
    Module aliasing is not the bug. They all resolve to the same singleton.

- timestamp: 2026-05-24T00:13:00Z
  checked: |
    Test passes (35/35). Fix logic is correct. Bundle has the fix.
    Yet user reports the bug reproduces. The test fixture inserts a SINGLE clean line-adding
    transaction. Production user types many keystrokes that fire multiple chained mirror dispatches.
  found: |
    Reasoning trace:
    - For each line-adding mirror (Enter+autoindent), lineCountChanged === true → rebuild → correct.
    - For each same-line edit (single char), lineCountChanged === false, userEvent === 'leetcode.child-sync'
      → fast-path → old.map(tr.changes) → preserves existing decorations correctly.
    - At rest, decorations should cover [openerLine, current closerLine].
    Cannot reason a path where the StateField produces empty/incomplete decorations after a sequence
    of valid mirror dispatches.
  implication: |
    Need empirical test that drives multiple chained transactions to verify the StateField
    behaves correctly under sequential pressure. If that test passes, the bug is NOT in the
    StateField but somewhere else (e.g., the widget DOM, the child registry, mismatched offsets
    in the mirror's bodyStart/bodyEnd computation when applied to a doc the parent is already
    modifying).

- timestamp: 2026-05-24T00:30:00Z
  checked: production-faithful chained-keystroke test in tests/main/nestedEditorExtension.test.ts
  found: |
    Wrote a test that synthesizes the EXACT shape of `propagateChildChanges`'s
    parent dispatch when the child cursor is at end of body (cursorPos === body.length).
    The mirror computes mappedFrom = mappedTo = bodyEnd = closerLine.from. Inserting
    a non-newline character at this position puts the character BEFORE the closer's
    first backtick on the SAME line — closer becomes 'X```' instead of '```'.
    Test FAILS:
      AssertionError: expected 'X```' to be '```'
    findCodeFence then returns null (no closer matches /^\\s*```/ alone). Subsequent
    decoration rebuilds produce empty DecorationSets (gate 3 fails). Parent fence
    body lines render as plain text — the user's reported phantom.
  implication: |
    ROOT CAUSE IDENTIFIED. The Round-1 17-07 fix to the StateField was correct
    but addresses a different layer. The actual bug is in the mirror's clamping:
    `Math.min(Math.max(toA + bodyStart, bodyStart), bodyEnd)` allows mappedTo
    to equal bodyEnd, which corrupts the closer on every cursor-at-end keystroke.

- timestamp: 2026-05-24T00:32:00Z
  checked: user's exact reproduction sequence (sdfasdf<Enter>            asdfasdf...)
  found: |
    Tracing the user's typing:
    1. User clicks into Java starter body. Body ends with `}` (no trailing newline).
       Cursor lands at click position. If they clicked at end (after `}`), cursor === body.length.
    2. User types 'sdfasdf' — each char insert lands at child cursor position.
       For cursor === body.length, first char ('s') inserts at parent bodyEnd → corrupts closer.
    3. EVEN IF cursor lands mid-body initially, after each Enter the cursor
       advances to the new line's end. After autoindent, cursor === new line's body.length.
       The NEXT character typed (e.g., 'a' in 'asdfasdf') inserts at parent's bodyEnd
       (since this new line is the LAST line of the body), corrupting the closer.
    4. The closer line becomes `s\`\`\`` or `a\`\`\`` etc. findCodeFence returns null.
       Parent's createParentRepairExtension fires. Repair scans for opener/closer:
       neither matches the strict OPENER_RE/CLOSER_RE patterns (the corrupted line
       has 'X```' which doesn't match either). Repair treats the corrupted line as
       body content. Inserts new opener and new closer around it.
    5. Result is messy and depends on timing — but in any case, the phantom render
       appears because for at least one update cycle, decorations are empty.
  implication: |
    The user's described bug is precisely the cursor-at-end corruption. The
    round-1 fix is necessary but insufficient. We need a Round-2 fix to
    propagateChildChanges that prevents inserts from landing at bodyEnd.

- timestamp: 2026-05-24T00:45:00Z
  checked: re-checking the cursor-at-end corruption hypothesis with exact arithmetic
  found: |
    Concrete arithmetic for canonical 3-body-line fence (lines 13/14/15 with text
    'class Solution:'/' def...'/' pass'):
      - bodyStart = line(13).from = openerLine.to + 1
      - bodyEnd = closerLine.from = line(16).from
      - bodyEnd - bodyStart = sum of body line lengths + 3 newlines = 50 + 1 = 51
      - body content length (via extractFenceBody slicing line(13).from to line(15).to) = 50
        (50 = 15 + 1 + 21 + 1 + 12 — sum of body chars + 2 internal newlines, NO trailing newline)
    Discrepancy: bodyEnd - bodyStart === body.length + 1. The +1 is the trailing
    newline between the body's last char and the closer's first char.

    For child cursor at body.length === 50:
      - mappedFrom = Math.min(50 + bodyStart, bodyEnd) = Math.min(bodyStart + 50, bodyStart + 51)
                   = bodyStart + 50 = closerLine.from - 1
      - mappedFrom === closerLine.from - 1, NOT bodyEnd.
      - Inserting at closerLine.from - 1 puts the inserted char BEFORE the newline
        that precedes the closer. The newline + closer line stay intact.

    The Math.min clamp on bodyEnd is DEFENSIVE — it only kicks in when fromA > body.length,
    which doesn't happen with valid CM6 child positions. So the production mirror
    correctly inserts at closerLine.from - 1, not at closerLine.from. NO CORRUPTION.
  implication: |
    My earlier "cursor-at-end corruption" hypothesis was wrong. The mirror's clamping
    arithmetic is correct: mappedFrom for a normal child position is in [bodyStart, bodyEnd-1],
    never equal to bodyEnd. The closer is preserved. My synthetic test that inserted at
    closerLine.from did NOT replicate production behavior — it was an invalid test.

- timestamp: 2026-05-24T00:50:00Z
  checked: comprehensive review of all reasoning paths
  found: |
    Summary of investigation:
    - StateField.update fix code: correct
    - Bundle has the fix (verified via grep + minified extraction)
    - Synthetic single-transaction test: passes
    - Multi-prefix module aliases (bo., Gn., di.) for @codemirror/state: all resolve
      to the same singleton at runtime via Node's require cache — NOT a bug
    - findCodeFence: walks post-state doc correctly; no caching
    - childEditorSync.propagateChildChanges: arithmetic correct; doesn't corrupt closer
    - sectionLockExtension.changeFilter: bypasses leetcode.child-sync correctly (Gate 0)
    - parent's createParentRepairExtension: only fires on findCodeFence === null
    - decoration coverage in buildNestedDecorations: covers [opener..closer] inclusive
    - widget eq() and DOM lifecycle: stable, no rebuild on body changes (filePath only)
  implication: |
    Cannot identify a code defect that explains the user's reported bug given the
    code as it stands. Either:
      (a) The fix is actually working and the user is observing a DIFFERENT bug
          that LOOKS similar (e.g., a Code Styler interaction even though they
          said it was disabled, or a stale plugin cache, or a different code
          path entirely)
      (b) There's a code path I haven't traced (e.g., obsidian's internal
          markdown view dispatches transactions in a way that bypasses the
          StateField's userEvent gate)
      (c) The user's reproduction has additional details not communicated
          (specific cursor position, specific timing, etc.)

## Resolution

root_cause: |
  Investigation inconclusive. The Round-1 17-07 fix code is correct, the bundle
  has the fix correctly compiled, the synthetic regression test passes, and I
  cannot reproduce the bug in unit tests with production-faithful synthetic
  transactions.

  However, the user reports the bug reproduces with MD5-verified bundle. This
  means EITHER:
    (a) There is a production code path my investigation did not cover, OR
    (b) The user is observing a different bug that has similar symptoms.

  Recommend the user add runtime instrumentation (console.log inside the
  StateField update method, logging tr.docChanged, tr.startState.doc.lines,
  tr.state.doc.lines, tr.annotation(Transaction.userEvent), and which branch
  was taken) to determine whether the rebuild branch is firing in production.

  Specifically: add temporary logging at src/main/nestedEditorExtension.ts:
    - Line 293: log `userEvent`
    - Line 295: log `lineCountChanged`, `tr.startState.doc.lines`, `tr.state.doc.lines`
    - Line 296-297: log "REBUILD: line-count delta"
    - Line 305-306: log "FAST-PATH: leetcode.* userEvent"
    - Line 310-311: log "REBUILD: docChanged fall-through"
    - Line 313: log "IDENTITY: no docChanged"

  Also recommend logging from src/main/childEditorSync.ts propagateChildChanges
  (line 147-174) the actual mappedFrom/mappedTo values and the parent dispatch
  to confirm the dispatched transaction shape.

  The instrumentation will reveal which branch fires during the user's typing
  reproduction. If the rebuild branch fires correctly but decorations are still
  empty, the bug is in the slug-frontmatter gate or the fence-detection step.
  If a different branch fires, we have a new clue.

fix: |
  No code fix proposed. Investigation inconclusive — recommend runtime
  instrumentation to verify the fix path is firing in production. The synthetic
  test coverage demonstrates the StateField rebuild branch produces correct
  decorations when invoked with a line-count-changing leetcode.child-sync
  transaction; we need empirical evidence from production to confirm whether
  this branch is actually being reached.

verification: not-applicable
files_changed: []
