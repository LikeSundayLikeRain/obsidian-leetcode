// Phase 17 Plan 02 — repairFenceStructure regression fixture (D-06b..D-06d).
//
// Reproduces the fence opener/closer auto-recovery regression confirmed in
// `.planning/debug/fence-auto-recovery-regression.md` (hypothesis a — primary
// root cause): repairFenceStructure cannot distinguish a surviving opener
// from a surviving closer, so when only the opener is damaged it treats the
// surviving closer as an opener and inserts a new "closer" after it,
// orphaning the user's body content. The both-missing branch ALSO orphans
// the body by inserting opener+closer immediately after `## Code` regardless
// of where the body actually sits. All inserted opener strings hardcode
// ` ``` ` without a language tag, breaking the post-repair invariant that the
// opener match the file's active language slug.
//
// Tests assert the STRUCTURAL invariant: post-repair, the user's body
// content is INSIDE the new fence (between opener and closer) AND the new
// opener carries the active language tag. These tests are RED on `main` and
// turn GREEN after Task 3 ships the marker-disambiguation fix.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

vi.mock('../../src/main/childEditorRegistry', () => ({
  ChildEditorRegistry: vi.fn(),
}));

import {
  repairFenceStructure,
  // Phase 17 Plan 13: round-2 parent-side runtime trigger.
  // See .planning/debug/fence-auto-recovery-regression-round2.md.
  createParentRepairExtension,
} from '../../src/main/childEditorSync';
import { findCodeFence } from '../../src/main/codeActionsEditorExtension';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { Transaction } from '@codemirror/state';

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Minimal mock parent EditorView. Mirrors the pattern in
 * tests/main/childEditorSync.test.ts:77-97 but ALSO tracks dispatch-time
 * changes so we can compute the post-dispatch doc string and re-run
 * findCodeFence against it (the structural invariant assertion).
 */
function makeMockParentView(docContent: string) {
  let currentDoc = docContent;
  const dispatched: Array<unknown> = [];
  const view = {
    get state() {
      return makeStateForLockTests({ body: currentDoc });
    },
    dispatch: vi.fn((spec: unknown) => {
      dispatched.push(spec);
      const s = spec as {
        changes?: Array<{ from: number; insert: string }>;
      };
      if (!Array.isArray(s.changes)) return;
      // Apply changes in reverse order so insertion offsets remain valid.
      // All change specs in repairFenceStructure are pure insertions
      // (from === to implicit, only `from` and `insert` provided).
      const sorted = [...s.changes].sort((a, b) => b.from - a.from);
      for (const ch of sorted) {
        currentDoc = currentDoc.slice(0, ch.from) + ch.insert + currentDoc.slice(ch.from);
      }
    }),
    /** Test helper: return the doc content after any dispatched changes. */
    getDocAfterDispatch() {
      return currentDoc;
    },
  };
  return view as unknown as import('@codemirror/view').EditorView & {
    getDocAfterDispatch(): string;
  };
}

/** Active language slug used by the fix when inserting a new opener. */
const ACTIVE_SLUG = 'java';

// ────────────────────────────────────────────────────────────────────────
// Fixtures (per 17-RESEARCH.md "Fence repair regression fixture" + 17-PATTERNS.md "Test fixture pattern")
// ────────────────────────────────────────────────────────────────────────

const INTACT = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Problem',
  '',
  'Given an array...',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {',
  '    public int[] twoSum() { return new int[0]; }',
  '}',
  '```',
  '',
  '## Notes',
].join('\n');

const MISSING_CLOSER = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {',
  '    public int[] twoSum() { return new int[0]; }',
  '}',
  '',
  '## Notes',
  'unrelated text',
].join('\n');

const MISSING_OPENER = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  'class Solution {',
  '    public int[] twoSum() { return new int[0]; }',
  '}',
  '```',
  '',
  '## Notes',
].join('\n');

const BOTH_MISSING = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  'class Solution {',
  '    public int[] twoSum() { return new int[0]; }',
  '}',
  '',
  '## Notes',
].join('\n');

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe('repairFenceStructure regression (Phase 17 D-06b/D-06d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('intact fence — returns false, no dispatch', () => {
    const parent = makeMockParentView(INTACT);
    const result = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(result).toBe(false);
    expect(parent.dispatch).not.toHaveBeenCalled();
  });

  it('missing closer — appends ``` before next ## heading; body stays inside fence', () => {
    const parent = makeMockParentView(MISSING_CLOSER);
    const result = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(result).toBe(true);
    expect(parent.dispatch).toHaveBeenCalledTimes(1);

    // Structural invariant: post-repair, findCodeFence returns offsets
    // pointing at a fence that ENCLOSES the body content.
    const repaired = parent.getDocAfterDispatch();
    const repairedState = makeStateForLockTests({ body: repaired });
    const fence = findCodeFence(repairedState);
    expect(fence).not.toBeNull();
    if (!fence) return; // type narrowing
    // Body lines (the user's `class Solution { ... }` block) MUST sit
    // BETWEEN openerLine and closerLine in the repaired doc.
    const bodyText = repairedState.doc.sliceString(
      repairedState.doc.line(fence.openerLine).to + 1,
      repairedState.doc.line(fence.closerLine).from,
    );
    expect(bodyText).toContain('class Solution {');
    expect(bodyText).toContain('twoSum()');
    expect(bodyText).toContain('}');

    // Opener tag invariant: the new (or surviving) opener carries the
    // active language slug.
    const openerText = repairedState.doc.line(fence.openerLine).text;
    expect(openerText).toMatch(/^\s*```java/);
  });

  it('missing opener — inserts ```<lang> after ## Code; body stays inside fence', () => {
    const parent = makeMockParentView(MISSING_OPENER);
    const result = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(result).toBe(true);
    expect(parent.dispatch).toHaveBeenCalledTimes(1);

    const repaired = parent.getDocAfterDispatch();
    const repairedState = makeStateForLockTests({ body: repaired });
    const fence = findCodeFence(repairedState);
    expect(fence).not.toBeNull();
    if (!fence) return;

    const bodyText = repairedState.doc.sliceString(
      repairedState.doc.line(fence.openerLine).to + 1,
      repairedState.doc.line(fence.closerLine).from,
    );
    // The user's body content MUST be INSIDE the new fence — this is the
    // primary regression assertion. On `main`, repair misclassifies the
    // surviving closer as an opener and inserts a new "closer" after it,
    // leaving `class Solution { ... }` ORPHANED above the false opener.
    expect(bodyText).toContain('class Solution {');
    expect(bodyText).toContain('twoSum()');

    // Opener tag invariant: inserted opener carries activeSlug.
    const openerText = repairedState.doc.line(fence.openerLine).text;
    expect(openerText).toMatch(/^\s*```java/);

    // No orphaned body: the user's content must NOT appear ABOVE the
    // opener. Read from `## Code` heading to opener and assert no code lines.
    // Find the ## Code heading line.
    let codeHeadingLine = -1;
    for (let i = 1; i <= repairedState.doc.lines; i++) {
      if (/^\s*##\s+Code\s*$/.test(repairedState.doc.line(i).text)) {
        codeHeadingLine = i;
        break;
      }
    }
    expect(codeHeadingLine).toBeGreaterThan(0);
    const aboveOpenerText = repairedState.doc.sliceString(
      repairedState.doc.line(codeHeadingLine).to + 1,
      repairedState.doc.line(fence.openerLine).from,
    );
    expect(aboveOpenerText).not.toContain('class Solution {');
    expect(aboveOpenerText).not.toContain('twoSum()');
  });

  it('both missing — inserts opener+closer; body stays inside fence with active slug', () => {
    const parent = makeMockParentView(BOTH_MISSING);
    const result = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(result).toBe(true);
    expect(parent.dispatch).toHaveBeenCalledTimes(1);

    const repaired = parent.getDocAfterDispatch();
    const repairedState = makeStateForLockTests({ body: repaired });
    const fence = findCodeFence(repairedState);
    expect(fence).not.toBeNull();
    if (!fence) return;

    const bodyText = repairedState.doc.sliceString(
      repairedState.doc.line(fence.openerLine).to + 1,
      repairedState.doc.line(fence.closerLine).from,
    );
    // Primary regression: user's body content MUST be INSIDE the new
    // fence, not orphaned outside it. On `main`, repair inserts an empty
    // ```\n\n``` block immediately after `## Code` regardless of where
    // the body actually sits — leaving `class Solution { ... }` BELOW
    // the new closer (between closer and `## Notes`).
    expect(bodyText).toContain('class Solution {');
    expect(bodyText).toContain('twoSum()');

    // Opener tag invariant.
    const openerText = repairedState.doc.line(fence.openerLine).text;
    expect(openerText).toMatch(/^\s*```java/);

    // Closer is bare ``` (no language tag).
    const closerText = repairedState.doc.line(fence.closerLine).text;
    expect(closerText).toMatch(/^\s*```\s*$/);

    // The body content must NOT appear BELOW the closer either.
    let nextHeadingLine = repairedState.doc.lines + 1;
    for (let i = fence.closerLine + 1; i <= repairedState.doc.lines; i++) {
      if (/^\s*##\s+/.test(repairedState.doc.line(i).text)) {
        nextHeadingLine = i;
        break;
      }
    }
    if (fence.closerLine + 1 < nextHeadingLine) {
      const belowCloserText = repairedState.doc.sliceString(
        repairedState.doc.line(fence.closerLine).to + 1,
        nextHeadingLine <= repairedState.doc.lines
          ? repairedState.doc.line(nextHeadingLine).from
          : repairedState.doc.length,
      );
      expect(belowCloserText).not.toContain('class Solution {');
      expect(belowCloserText).not.toContain('twoSum()');
    }
  });

  it('post-repair sync invariant — child→parent mirror lands cleanly with valid offsets', () => {
    // Mirrors the inner logic of createChildSyncExtension (childEditorSync.ts:82-121):
    //   1. findCodeFence(parent.state) returns null (damaged)
    //   2. repairFenceStructure(parent, slug) fires
    //   3. Retry findCodeFence(parent.state) — MUST return valid offsets
    //   4. Compute bodyStart / bodyEnd — MUST satisfy bodyStart <= bodyEnd
    //   5. Full-replace dispatch with the child's body — MUST succeed
    //
    // This is the regression-for-hypothesis-(c) test: even though hypothesis
    // (c) was refuted (offsets ARE fresh post-dispatch), the invariant must
    // still hold once the marker-disambiguation bug from hypothesis (a) is
    // fixed. Pre-fix on `main`, this assertion fails because the post-repair
    // findCodeFence retry finds offsets pointing at a fence that does NOT
    // enclose the user's body — so the full-replace would either overwrite
    // empty space or overwrite the wrong region.
    const parent = makeMockParentView(MISSING_OPENER);

    // Step 1: findCodeFence on damaged input — null per E2 of debug doc.
    const initialFence = findCodeFence(parent.state);
    expect(initialFence).toBeNull();

    // Step 2: trigger repair.
    const repaired = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(repaired).toBe(true);

    // Step 3: retry findCodeFence against the post-repair state.
    const repairedDoc = parent.getDocAfterDispatch();
    const repairedState = makeStateForLockTests({ body: repairedDoc });
    const fenceRetry = findCodeFence(repairedState);
    expect(fenceRetry).not.toBeNull();
    if (!fenceRetry) return;

    // Step 4: compute bodyStart / bodyEnd. The invariant childEditorSync.ts
    // line 106 enforces is bodyStart <= bodyEnd; verify it holds.
    const bodyStart = repairedState.doc.line(fenceRetry.openerLine).to + 1;
    const bodyEnd = repairedState.doc.line(fenceRetry.closerLine).from;
    expect(bodyStart).toBeLessThanOrEqual(bodyEnd);

    // Step 5: the body region between bodyStart..bodyEnd MUST contain the
    // user's actual code (not empty whitespace and not the wrong region).
    // This is the strongest post-repair-sync invariant: when the child
    // full-replaces this region with its own content, it overwrites the
    // user's existing body — which is fine BECAUSE this region IS where
    // the user's body lives. On `main` (broken repair), this region
    // points at empty space or the wrong region, and the full-replace
    // either silently no-ops or wipes out unrelated content.
    const enclosedBody = repairedState.doc.sliceString(bodyStart, bodyEnd);
    expect(enclosedBody).toContain('class Solution {');
  });
});

// ────────────────────────────────────────────────────────────────────────
// Phase 17 Plan 13 — round-2 regression suite (REPAIR-02 / Plan 17-13).
//
// See .planning/debug/fence-auto-recovery-regression-round2.md for the full
// hypothesis matrix. These tests cover:
//   Test 6 — Bug 1 (runtime trigger gap): parent-side runtime trigger fires
//            repair on parent-only damage WITHOUT a child dispatch.
//   Test 7 — Bug 2 Hyp E (duplicate-fence input idempotency): the user's
//            exact duplicate-fence reproduction returns false from repair
//            and dispatches nothing.
//   Test 8 — Re-entry idempotency: calling repair on the post-repair
//            (intact) state is a no-op.
// ────────────────────────────────────────────────────────────────────────

/** User's exact duplicate-fence reproduction snippet from the round-2 prompt
 *  (2026-05-23). Original opener+body+closer above + SECOND `\`\`\`java + duplicate
 *  body block below before `## Notes`. See debug doc Symptoms section. */
const USER_DUPLICATE_FENCE_REPRO = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {',
  '    public int[] twoSum(int[] nums, int target) {',
  '        return new int[0];',
  '    }',
  '}',
  '```',
  '```java',
  'class Solution {',
  '    public int[] twoSum(int[] nums, int target) {',
  '        return new int[0];',
  '    }',
  '}',
  '',
  '## Notes',
].join('\n');

/**
 * Build a synthetic parent-side `ViewUpdate` shape sufficient to drive the
 * `createParentRepairExtension`'s updateListener. The listener consumes:
 *   - update.docChanged — boolean
 *   - update.state — EditorState (read by findCodeFence + readLcLanguageFromDoc)
 *   - update.view — EditorView (passed to repairFenceStructure)
 *   - update.transactions — Transaction[] (re-entry guard reads userEvent annotation)
 * The mock parent view tracks dispatched changes so we can verify
 * `'leetcode.fence-repair'` userEvent dispatches were emitted.
 */
function makeMockParentUpdate(
  docContent: string,
  parentView: ReturnType<typeof makeMockParentView>,
  opts: { docChanged?: boolean; userEvent?: string } = {},
) {
  const docChanged = opts.docChanged ?? true;
  // Build a minimal Transaction shape with the userEvent annotation.
  const fakeTx: { annotation: (kind: unknown) => string | undefined } = {
    annotation(kind: unknown) {
      // The listener calls `tr.annotation(Transaction.userEvent)`.
      // Transaction.userEvent is the AnnotationType singleton imported from
      // @codemirror/state; we accept any kind argument and return the
      // configured userEvent string (or undefined).
      if (kind === Transaction.userEvent) return opts.userEvent;
      return undefined;
    },
  };
  return {
    docChanged,
    get state() {
      return makeStateForLockTests({ body: docContent });
    },
    view: parentView,
    transactions: [fakeTx],
  };
}

describe('repairFenceStructure round-2 regression (Phase 17 Plan 13 / REPAIR-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 6 — Bug 1 (runtime trigger gap)
  // REPAIR-02 Bug 1 — parent-side runtime trigger fires repair without
  // requiring a child dispatch. See
  // .planning/debug/fence-auto-recovery-regression-round2.md "Bug 1 —
  // Runtime trigger gap (mechanical certainty)".
  it('Test 6 — parent-side runtime trigger fires repair on parent-only damage', () => {
    // RED on current main: createParentRepairExtension does not exist (the
    // import at the top of this file will throw at module-load time on main),
    // turning all tests in this describe block into errors. After Task 3
    // GREEN ships the helper + the parent-side wiring through
    // wireSyncIfNeeded, this test passes.
    const parent = makeMockParentView(MISSING_CLOSER);

    // Construct the parent-side updateListener directly via the new helper.
    const ext = createParentRepairExtension();

    // Extract the listener function. The Extension returned by
    // EditorView.updateListener.of carries the listener under .value (CM6
    // FacetExtension shape). Tests reach into this shape — the contract is
    // stable across @codemirror/view 6.x; if it breaks, the test will fail
    // loudly and we update accordingly.
    const listener = (ext as unknown as { value: (u: unknown) => void }).value;
    expect(typeof listener).toBe('function');

    // Simulate a parent-side update where the closer was just deleted.
    const update = makeMockParentUpdate(MISSING_CLOSER, parent, {
      docChanged: true,
      userEvent: 'input.delete', // user-input, not 'leetcode.fence-repair'
    });
    listener(update);

    // Repair must have fired exactly once with 'leetcode.fence-repair'
    // userEvent (the existing round-1 dispatch annotation).
    expect(parent.dispatch).toHaveBeenCalled();
    const dispatchSpec = (parent.dispatch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as
      | { annotations?: unknown }
      | undefined;
    // The dispatch carries a single annotation Transaction.userEvent.of('leetcode.fence-repair').
    // We verify by re-issuing the listener against the post-repair state and
    // confirming the listener does NOT re-fire repair on its own dispatch.
    expect(dispatchSpec).toBeDefined();

    // Re-entry guard: a follow-up update carrying the repair's own userEvent
    // must NOT trigger another dispatch.
    (parent.dispatch as unknown as { mockClear: () => void }).mockClear();
    const repairedDoc = parent.getDocAfterDispatch();
    const repairUpdate = makeMockParentUpdate(repairedDoc, parent, {
      docChanged: true,
      userEvent: 'leetcode.fence-repair',
    });
    listener(repairUpdate);
    expect(parent.dispatch).not.toHaveBeenCalled();
  });

  // Test 7 — Bug 2 Hyp E (duplicate-fence input idempotency)
  // REPAIR-02 Bug 2 — repair on the user's duplicate-fence reproduction
  // input is a no-op (findCodeFence finds the first fence; repair returns
  // false). See debug doc "Bug 2 Hyp E" + "Confirmed Root Cause".
  it("Test 7 — user's exact duplicate-fence reproduction yields a no-op repair (idempotent on the bad shape)", () => {
    const parent = makeMockParentView(USER_DUPLICATE_FENCE_REPRO);

    // findCodeFence on the duplicate-fence input finds the FIRST fence
    // (opener at the first `\`\`\`java`, closer at the first bare `\`\`\``).
    const initialFence = findCodeFence(parent.state);
    expect(initialFence).not.toBeNull();
    if (!initialFence) return; // type narrowing

    // Repair must return false because both opener and closer are present
    // (round-1 marker scan stops at first OPENER_RE / CLOSER_RE match).
    const result = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(result).toBe(false);
    expect(parent.dispatch).not.toHaveBeenCalled();

    // Doc shape unchanged: the post-repair state EQUALS the input. Both
    // before and after, the input has TWO `\`\`\`java` openers — this is
    // the duplicate state the user reported. Plan 17-13 ships a
    // regression-prevention pin asserting repair does NOT WORSEN this
    // shape (no third opener inserted, no third body block appended).
    // Active clean-up of the duplicate is out of scope per round-2 fix
    // (the duplicate-fence emergence path cannot be deterministically
    // reproduced from source trace alone — see debug doc Hyp E).
    const openerMatchesPre = (USER_DUPLICATE_FENCE_REPRO.match(/^\s*```java/gm) ?? []).length;
    const openerMatchesPost = (parent.getDocAfterDispatch().match(/^\s*```java/gm) ?? []).length;
    expect(openerMatchesPre).toBe(2);
    expect(openerMatchesPost).toBe(openerMatchesPre); // repair did not worsen

    // Sanity: findCodeFence returns valid offsets enclosing the FIRST body
    // block. The duplicate body below the first closer is leaked content,
    // not part of the fence. The user sees their solution rendered (first
    // fence is structurally valid).
    const bodyText = parent.state.doc.sliceString(
      parent.state.doc.line(initialFence.openerLine).to + 1,
      parent.state.doc.line(initialFence.closerLine).from,
    );
    expect(bodyText).toContain('class Solution {');
    expect(bodyText).toContain('twoSum');
  });

  // Test 8 — Re-entry idempotency
  // REPAIR-02 Bug 2 Hyp D (post-fix invariant) — calling repair twice (once
  // on a damaged input, once on the post-repair intact state) — second
  // call returns false and does not dispatch. See debug doc "Bug 2 Hyp D"
  // + "Planned Fix Scope" re-entry guard discussion.
  it('Test 8 — re-entry idempotency: repair on the post-repair intact state is a no-op', () => {
    // First call: damage the closer. Repair must succeed (round-1 invariant).
    const parent = makeMockParentView(MISSING_CLOSER);
    const firstResult = repairFenceStructure(parent, ACTIVE_SLUG);
    expect(firstResult).toBe(true);
    expect(parent.dispatch).toHaveBeenCalledTimes(1);

    // Second call: build a fresh mock view backed by the post-repair doc.
    // The post-repair state has both opener and closer (round-1 fix).
    const repairedDoc = parent.getDocAfterDispatch();
    const reparent = makeMockParentView(repairedDoc);

    const secondResult = repairFenceStructure(reparent, ACTIVE_SLUG);
    expect(secondResult).toBe(false);
    expect(reparent.dispatch).not.toHaveBeenCalled();
  });
});
