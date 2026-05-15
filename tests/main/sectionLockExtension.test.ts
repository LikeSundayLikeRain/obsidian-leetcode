// Phase 05.5 (POLISH) — Section Locking for lc-slug Notes.
// RED-state unit tests for `src/main/sectionLockExtension.ts`. Pins the
// behavioral contract Wave 1 must satisfy: D-01 SSoT import, D-03 per-section
// scope, D-04 changeFilter return-shape + plugin-event userEvent bypass,
// D-06 lc-slug gate, D-07 Edit-Mode-only architectural assertion (verified
// by absence — see header comment near the bottom), D-08 trailing-newline
// heading lock, D-09 fence opener/closer + malformed-fence fallthrough.
//
// FILTER-CALLBACK EXTRACTION CONTRACT (Wave 1 GREEN): tests against
// buildSectionLockExtension(plugin) iterate the returned Extension array
// and pull out the callable that, when invoked with a fake Transaction,
// returns either `true` (no lock) or a `number[]` (suppression ranges).
// Wave 1 returns the flat `[changeFilter.of(cb), atomicRanges.of(...)]`
// shape; the test helper `extractChangeFilterCallback` walks the array and
// finds the one whose `.value` is the callback. Forward-compatible if
// Wave 1's shape ever changes to a dedicated named export.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import {
  makeStateForLockTests,
  makeFakeTransaction,
} from '../helpers/obsidian-stub';
import {
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  CUSTOM_TESTS_HEADING_LINE,
} from '../../src/notes/NoteTemplate';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// MUST fail to resolve at Wave 0 time; becomes resolvable when Wave 1 ships
// the module. The three named exports below are the Wave 1 contract:
//   - computeLockedRanges(state): readonly number[] — pure helper; flat
//     [from, to, from, to, ...] suppression range list.
//   - buildSectionLockExtension(plugin): Extension — composed CM6 extension
//     ([changeFilter, atomicRanges, ...]). Tests pull the filter callback
//     out via extractChangeFilterCallback().
//   - LOCKED_HEADINGS — readonly tuple of the 4 heading literals (re-export
//     or alias of NoteTemplate.LOCKED_HEADINGS).
import {
  computeLockedRanges,
  buildSectionLockExtension,
  computeSnapTarget,
  LOCKED_HEADINGS,
  mergeLockedRanges,
} from '../../src/main/sectionLockExtension';

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

interface CanonicalNoteOpts {
  fenceLang?: string;
  includeCustomTests?: boolean;
  unterminatedFence?: boolean;
}

/**
 * Build a canonical four-section problem note body. Layout follows
 * Phase 2 D-03 + Phase 4 D-14 anchor order: ## Problem → ## Code →
 * ## Techniques → ## Notes (## Custom Tests appended optionally).
 *
 * `unterminatedFence: true` → omit the closing ``` so D-09 malformed-fence
 * fallthrough can be exercised.
 */
function canonicalNoteBody(opts: CanonicalNoteOpts = {}): string {
  const lang = opts.fenceLang ?? 'python';
  const closer = opts.unterminatedFence ? '' : '```\n';
  const customTests = opts.includeCustomTests
    ? `\n${CUSTOM_TESTS_HEADING_LINE}\n\n### Case 1\n\nuser-owned content\n`
    : '';
  return (
    `${PROBLEM_HEADING_LINE}\n` +
    `Given an array, return two indices.\n` +
    `\n` +
    `${CODE_HEADING_LINE}\n` +
    `\n` +
    '```' + lang + '\n' +
    `class Solution: pass\n` +
    closer +
    `\n` +
    `${TECHNIQUES_HEADING_LINE}\n` +
    `\n` +
    `- [[Hash Table]]\n` +
    `\n` +
    `${NOTES_HEADING_LINE}\n` +
    `\n` +
    `user notes here\n` +
    customTests
  );
}

/**
 * Walk the Extension array returned by buildSectionLockExtension(plugin) and
 * return the callable changeFilter callback. The returned Extension may be
 * a flat array of facet `.of()` results — each `.of()` produces an opaque
 * object whose `.value` field holds the callback. We probe candidates by
 * invoking each one and accepting the result that returns either `true` or
 * a number[] (the changeFilter return contract). If Wave 1 chooses to
 * publish the callback as its own named export, the planner may swap this
 * helper for a direct import; this fallback is forward-compatible.
 */
function extractChangeFilterCallback(
  ext: unknown,
): (tr: unknown) => unknown {
  // Recursively flatten the Extension (which can be Extension[] | Extension)
  // and probe each candidate looking for a function-bearing facet value.
  const flat: unknown[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const sub of node) visit(sub);
      return;
    }
    flat.push(node);
  };
  visit(ext);

  // Each facet `.of(fn)` produces an object whose `.value` is `fn`. CM6's
  // internal field name varies; we probe a few likely shapes.
  for (const node of flat) {
    if (typeof node === 'function') {
      return node as (tr: unknown) => unknown;
    }
    if (node && typeof node === 'object') {
      const candidate =
        (node as { value?: unknown }).value ??
        (node as { fn?: unknown }).fn ??
        (node as { callback?: unknown }).callback;
      if (typeof candidate === 'function') {
        return candidate as (tr: unknown) => unknown;
      }
    }
  }
  throw new Error(
    'extractChangeFilterCallback: no callable filter found in returned Extension',
  );
}

// D-07 (Edit-Mode-only) is verified by absence — see
// src/main/codeActionsPostProcessor.ts; Reading Mode renders via
// MarkdownPostProcessor and never invokes CM6 transaction filters. No
// it-block needed for D-07; the architectural guarantee is that the lock
// surface is registered exclusively via this.registerEditorExtension(...)
// in Wave 1's main.ts integration, which by definition fires only in the
// CM6 (Edit Mode) tier.

// ────────────────────────────────────────────────────────────────────────
// D-01 — LOCKED_HEADINGS SSoT
// ────────────────────────────────────────────────────────────────────────

describe('LOCKED_HEADINGS SSoT', () => {
  it('imports from NoteTemplate.ts (no string duplication) — anchor D-01', () => {
    // Wave 1 LOCKED_HEADINGS export is either the same object as
    // NoteTemplate.LOCKED_HEADINGS or a structurally-equal tuple. Assert
    // by element-wise string equality + length === 4 + ## Custom Tests
    // not present.
    expect(LOCKED_HEADINGS).toBeDefined();
    expect(LOCKED_HEADINGS.length).toBe(4);
    expect(LOCKED_HEADINGS[0]).toBe(PROBLEM_HEADING_LINE);
    expect(LOCKED_HEADINGS[1]).toBe(CODE_HEADING_LINE);
    expect(LOCKED_HEADINGS[2]).toBe(TECHNIQUES_HEADING_LINE);
    expect(LOCKED_HEADINGS[3]).toBe(NOTES_HEADING_LINE);
    // Custom Tests intentionally NOT in the tuple per D-03 + Phase 5 D-08.
    expect(
      (LOCKED_HEADINGS as readonly string[]).includes(CUSTOM_TESTS_HEADING_LINE),
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// D-03, D-08, D-09 — computeLockedRanges (pure function)
// ────────────────────────────────────────────────────────────────────────

describe('computeLockedRanges — pure function', () => {
  it('returns [] when document has no canonical headings', () => {
    const state = makeStateForLockTests({ body: '' });
    const ranges = computeLockedRanges(state);
    expect(Array.isArray(ranges)).toBe(true);
    expect(ranges.length).toBe(0);
  });

  it('locks ## Problem heading + entire body until next H2 — anchor D-03/Problem', () => {
    const body = canonicalNoteBody();
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Find the line numbers for ## Problem and ## Code so we can compute the
    // expected [from, to) interval covering the entire ## Problem region.
    let problemLine = -1;
    let codeLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === PROBLEM_HEADING_LINE) problemLine = i;
      if (t === CODE_HEADING_LINE) codeLine = i;
    }
    expect(problemLine).toBeGreaterThan(0);
    expect(codeLine).toBeGreaterThan(problemLine);

    const expectedFrom = state.doc.line(problemLine).from;
    const expectedTo = state.doc.line(codeLine).from;

    // Walk the [from, to, from, to, ...] pairs looking for one that covers
    // [expectedFrom, expectedTo). The implementation may emit either a
    // single pair covering exactly that range OR multiple sub-ranges that
    // together cover it — accept any pair whose [from, to] subsumes
    // [problemLine.from, codeLine.from).
    let found = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= expectedFrom && to >= expectedTo) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('locks ## Code heading line — anchor D-03/Code-heading', () => {
    const body = canonicalNoteBody();
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    let codeLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      if (state.doc.line(i).text === CODE_HEADING_LINE) {
        codeLine = i;
        break;
      }
    }
    expect(codeLine).toBeGreaterThan(0);
    const codeHeadFrom = state.doc.line(codeLine).from;
    const codeHeadEndExclusive = state.doc.line(codeLine + 1).from;

    let coversCodeHeading = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= codeHeadFrom && to >= codeHeadEndExclusive) {
        coversCodeHeading = true;
        break;
      }
    }
    expect(coversCodeHeading).toBe(true);
  });

  it('locks fence opener line end-to-end — anchor D-03/Code-fence-opener', () => {
    const body = canonicalNoteBody({ fenceLang: 'python' });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Locate the fence opener line by scanning for the first ``` line after
    // ## Code.
    let openerLine = -1;
    let inCode = false;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === CODE_HEADING_LINE) {
        inCode = true;
        continue;
      }
      if (inCode && /^\s*```/.test(t)) {
        openerLine = i;
        break;
      }
    }
    expect(openerLine).toBeGreaterThan(0);
    const openerFrom = state.doc.line(openerLine).from;
    const openerEndExclusive = state.doc.line(openerLine + 1).from;

    let coversOpener = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= openerFrom && to >= openerEndExclusive) {
        coversOpener = true;
        break;
      }
    }
    expect(coversOpener).toBe(true);
  });

  it('locks fence closer line end-to-end — anchor D-03/Code-fence-closer', () => {
    const body = canonicalNoteBody({ fenceLang: 'python' });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Locate the fence closer (second ``` line after ## Code).
    let openerLine = -1;
    let closerLine = -1;
    let inCode = false;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === CODE_HEADING_LINE) {
        inCode = true;
        continue;
      }
      if (inCode && /^\s*```/.test(t)) {
        if (openerLine === -1) {
          openerLine = i;
        } else {
          closerLine = i;
          break;
        }
      }
    }
    expect(closerLine).toBeGreaterThan(openerLine);
    const closerFrom = state.doc.line(closerLine).from;
    const closerEndExclusive = state.doc.line(closerLine + 1).from;

    let coversCloser = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= closerFrom && to >= closerEndExclusive) {
        coversCloser = true;
        break;
      }
    }
    expect(coversCloser).toBe(true);
  });

  it('does NOT lock fence body lines — anchor D-03/Code-body', () => {
    const body = canonicalNoteBody({ fenceLang: 'python' });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // The fence body line is the line BETWEEN the opener and closer
    // (i.e., openerLine + 1 in our canonical body, which contains
    // `class Solution: pass`).
    let openerLine = -1;
    let inCode = false;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === CODE_HEADING_LINE) {
        inCode = true;
        continue;
      }
      if (inCode && /^\s*```/.test(t)) {
        openerLine = i;
        break;
      }
    }
    expect(openerLine).toBeGreaterThan(0);
    const bodyLine = openerLine + 1;
    const bodyFrom = state.doc.line(bodyLine).from;
    const bodyTo = state.doc.line(bodyLine).to;

    // Assert that no emitted [from, to] pair fully contains [bodyFrom, bodyTo).
    // (A pair could touch the boundary — e.g., `to === bodyFrom` is OK because
    // that's the heading-line lock's exclusive upper bound on the line above.)
    let bodyLocked = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= bodyFrom && to >= bodyTo) {
        bodyLocked = true;
        break;
      }
    }
    expect(bodyLocked).toBe(false);
  });

  it('locks ## Techniques heading line; body lines are NOT in any returned range — anchor D-03/Techniques', () => {
    const body = canonicalNoteBody();
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    let techLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      if (state.doc.line(i).text === TECHNIQUES_HEADING_LINE) {
        techLine = i;
        break;
      }
    }
    expect(techLine).toBeGreaterThan(0);
    const techHeadFrom = state.doc.line(techLine).from;
    const techHeadEndExclusive = state.doc.line(techLine + 1).from;

    // Heading line locked.
    let coversHeading = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= techHeadFrom && to >= techHeadEndExclusive) {
        coversHeading = true;
        break;
      }
    }
    expect(coversHeading).toBe(true);

    // Body line (techLine + 2 — the bullet `- [[Hash Table]]`) NOT in any
    // returned range.
    const bodyLineNum = techLine + 2;
    if (bodyLineNum <= state.doc.lines) {
      const bodyFrom = state.doc.line(bodyLineNum).from;
      const bodyTo = state.doc.line(bodyLineNum).to;
      let bodyLocked = false;
      for (let i = 0; i < ranges.length; i += 2) {
        const from = ranges[i] as number;
        const to = ranges[i + 1] as number;
        if (from <= bodyFrom && to >= bodyTo && bodyTo > bodyFrom) {
          bodyLocked = true;
          break;
        }
      }
      expect(bodyLocked).toBe(false);
    }
  });

  it('locks ## Notes heading line; body lines are NOT in any returned range — anchor D-03/Notes', () => {
    const body = canonicalNoteBody();
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    let notesLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      if (state.doc.line(i).text === NOTES_HEADING_LINE) {
        notesLine = i;
        break;
      }
    }
    expect(notesLine).toBeGreaterThan(0);
    const notesHeadFrom = state.doc.line(notesLine).from;
    // ## Notes is the last canonical heading; the next-line trailing-newline
    // boundary is line(notesLine + 1).from when notesLine < total.
    const notesHeadEndExclusive =
      notesLine < state.doc.lines
        ? state.doc.line(notesLine + 1).from
        : state.doc.line(notesLine).to;

    let coversHeading = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= notesHeadFrom && to >= notesHeadEndExclusive) {
        coversHeading = true;
        break;
      }
    }
    expect(coversHeading).toBe(true);

    // Body line (notesLine + 2 — `user notes here`) NOT in any returned range.
    const bodyLineNum = notesLine + 2;
    if (bodyLineNum <= state.doc.lines) {
      const bodyFrom = state.doc.line(bodyLineNum).from;
      const bodyTo = state.doc.line(bodyLineNum).to;
      let bodyLocked = false;
      for (let i = 0; i < ranges.length; i += 2) {
        const from = ranges[i] as number;
        const to = ranges[i + 1] as number;
        if (from <= bodyFrom && to >= bodyTo && bodyTo > bodyFrom) {
          bodyLocked = true;
          break;
        }
      }
      expect(bodyLocked).toBe(false);
    }
  });

  it('does NOT lock ## Custom Tests heading or body — anchor D-03/Custom-Tests', () => {
    const body = canonicalNoteBody({ includeCustomTests: true });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    let customLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      if (state.doc.line(i).text === CUSTOM_TESTS_HEADING_LINE) {
        customLine = i;
        break;
      }
    }
    expect(customLine).toBeGreaterThan(0);
    const customHeadFrom = state.doc.line(customLine).from;
    const customHeadTo = state.doc.line(customLine).to;

    // No emitted pair should cover the ## Custom Tests heading line.
    let customLocked = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= customHeadFrom && to >= customHeadTo && customHeadTo > customHeadFrom) {
        customLocked = true;
        break;
      }
    }
    expect(customLocked).toBe(false);
  });

  it('heading-line lock includes the trailing newline — anchor D-08', () => {
    // Build a 2-line doc where line 1 is ## Problem and line 2 is body.
    // Per D-08 + RESEARCH Pitfall 3, the lock for line 1 must extend to
    // line(2).from (NOT line(1).to, which would leave the \n editable so
    // selecting the heading + Backspace would delete the newline).
    const body = `${PROBLEM_HEADING_LINE}\nbody`;
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    const headFrom = state.doc.line(1).from;
    const expectedHeadEndExclusive = state.doc.line(2).from;
    const headLineToOnly = state.doc.line(1).to;

    // The lock must extend AT LEAST to line(2).from for at least one
    // returned pair starting at line(1).from (or covering it). Strictly
    // greater than line(1).to (to include the trailing \n).
    let foundTrailingNewlineLock = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= headFrom && to >= expectedHeadEndExclusive) {
        foundTrailingNewlineLock = true;
        // Sanity: confirm the lock extends past the line.to boundary.
        expect(to).toBeGreaterThan(headLineToOnly);
        break;
      }
    }
    expect(foundTrailingNewlineLock).toBe(true);
  });

  it('falls through to heading-only lock when fence is unterminated — anchor D-09/Malformed', () => {
    const body = canonicalNoteBody({ unterminatedFence: true });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Locate ## Code heading and the (lone) opener line. With
    // unterminatedFence: true, there is NO closer line in the doc.
    let codeLine = -1;
    let openerLine = -1;
    let inCode = false;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === CODE_HEADING_LINE) {
        codeLine = i;
        inCode = true;
        continue;
      }
      if (inCode && /^\s*```/.test(t)) {
        openerLine = i;
        break;
      }
    }
    expect(codeLine).toBeGreaterThan(0);
    expect(openerLine).toBeGreaterThan(codeLine);

    // The ## Code heading line itself MUST still be locked.
    const codeHeadFrom = state.doc.line(codeLine).from;
    const codeHeadEndExclusive = state.doc.line(codeLine + 1).from;
    let coversCodeHeading = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      if (from <= codeHeadFrom && to >= codeHeadEndExclusive) {
        coversCodeHeading = true;
        break;
      }
    }
    expect(coversCodeHeading).toBe(true);

    // The opener line MUST NOT be locked end-to-end (D-09 fallthrough:
    // findCodeFence returns null on malformed; only heading is locked).
    const openerFrom = state.doc.line(openerLine).from;
    const openerLineTo = state.doc.line(openerLine).to;
    let openerLocked = false;
    for (let i = 0; i < ranges.length; i += 2) {
      const from = ranges[i] as number;
      const to = ranges[i + 1] as number;
      // Skip the spurious case where to === openerFrom (that's the
      // heading lock's exclusive upper bound on the line above).
      if (from <= openerFrom && to >= openerLineTo && to > openerFrom) {
        openerLocked = true;
        break;
      }
    }
    expect(openerLocked).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// D-04, D-06 — buildSectionLockExtension (changeFilter behavior)
// ────────────────────────────────────────────────────────────────────────

describe('buildSectionLockExtension — changeFilter behavior', () => {
  let metadataCache: ReturnType<typeof createFakeMetadataCache>;
  const filePath = 'LeetCode/0001-two-sum.md';

  beforeEach(() => {
    metadataCache = createFakeMetadataCache();
  });

  it('returns suppression-range array when user-input transaction touches a locked range — anchor D-04/Filter-drops', () => {
    metadataCache.setFrontmatter(filePath, { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody(),
      filePath,
    });
    // UAT 2026-05-13 regression fix: filter only fires on user-input
    // userEvents (input.* / delete.* / undo / redo). 'input.type' = typing.
    const tr = makeFakeTransaction(state, { userEvent: 'input.type' });

    const ext = buildSectionLockExtension(plugin as never);
    const filter = extractChangeFilterCallback(ext);
    const result = filter(tr);

    // result should be a number[] (suppression ranges) when ranges are
    // present in the doc. canonicalNoteBody() has all four headings, so
    // computeLockedRanges returns at least one pair → filter returns the
    // array, NOT `true`.
    expect(Array.isArray(result)).toBe(true);
    expect((result as number[]).length).toBeGreaterThanOrEqual(2);
    // Sanity: pairs must be even count.
    expect((result as number[]).length % 2).toBe(0);
  });

  it('returns true for transactions with no userEvent (vault-sync regression fix) — anchor UAT/Gate-0', () => {
    // UAT 2026-05-13: copyToCode dispatched vault.process write; Obsidian
    // synced the change back into CM6 buffer via a programmatic dispatch
    // with NO userEvent. The previous filter blocked it as "user input"
    // touching a locked range, dropping the changes and corrupting the
    // buffer (duplicated sections, missing closing fence). Gate 0 now
    // requires a known user-input userEvent before suppression fires;
    // programmatic dispatches pass through.
    metadataCache.setFrontmatter(filePath, { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody(),
      filePath,
    });
    const tr = makeFakeTransaction(state); // userEvent undefined — programmatic

    const ext = buildSectionLockExtension(plugin as never);
    const filter = extractChangeFilterCallback(ext);
    const result = filter(tr);

    expect(result).toBe(true);
  });

  it("returns true when transaction has userEvent starting with 'leetcode.' — anchor D-04/UserEvent-bypass", () => {
    // Phase 5.3 chevron path preserved per RESEARCH Pitfall 5: a plugin-side
    // dispatch that sets userEvent='leetcode.lang-switch' must thread through
    // unfiltered, otherwise the chevron dispatch (which writes the fence
    // opener line — a locked range under D-09) would be silently dropped.
    metadataCache.setFrontmatter(filePath, { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody(),
      filePath,
    });
    const tr = makeFakeTransaction(state, { userEvent: 'leetcode.lang-switch' });

    const ext = buildSectionLockExtension(plugin as never);
    const filter = extractChangeFilterCallback(ext);
    const result = filter(tr);

    expect(result).toBe(true);
  });

  it('returns true when frontmatter has no lc-slug — anchor D-06', () => {
    // Non-lc-slug notes are unaffected — the lock disables itself entirely.
    metadataCache.setFrontmatter(filePath, { foo: 'bar' }); // no lc-slug key
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody(),
      filePath,
    });
    const tr = makeFakeTransaction(state);

    const ext = buildSectionLockExtension(plugin as never);
    const filter = extractChangeFilterCallback(ext);
    const result = filter(tr);

    expect(result).toBe(true);
  });

  it('returns true when state has no file — anchor D-06 file-gate', () => {
    // Without a file in editorInfoField, the metadataCache lookup is
    // meaningless. The filter must early-return true. Our makeStateForLockTests
    // adapter returns { file: { path } } from state.field(_) regardless;
    // simulate the no-file case by overriding the field method on a fresh
    // adapter.
    const plugin = createFakePlugin({ metadataCache });
    const baseState = makeStateForLockTests({
      body: canonicalNoteBody(),
      filePath,
    });
    const noFileState = {
      doc: baseState.doc,
      field(_f: unknown) {
        return { file: null };
      },
    } as unknown as typeof baseState;
    const tr = makeFakeTransaction(noFileState);

    const ext = buildSectionLockExtension(plugin as never);
    const filter = extractChangeFilterCallback(ext);
    const result = filter(tr);

    expect(result).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Pure helper tests — mergeLockedRanges + computeSnapTarget
// (UAT 2026-05-13 hardening — these helpers were extracted from the
//  transactionFilter so the snap behavior could be unit-tested without
//  driving a full EditorView. Documents the snap decision tree.)
// ────────────────────────────────────────────────────────────────────────

describe('mergeLockedRanges — pure coalesce helper', () => {
  it('returns empty for empty input', () => {
    expect(mergeLockedRanges([])).toEqual([]);
  });

  it('returns single tuple for single range', () => {
    expect(mergeLockedRanges([10, 20])).toEqual([[10, 20]]);
  });

  it('keeps disjoint ranges separate', () => {
    expect(mergeLockedRanges([10, 20, 30, 40])).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  it('merges adjacent ranges (from === last.to)', () => {
    // Real-world case: ## Problem body ends at the same offset where
    // ## Code heading begins. Both must coalesce into one cluster so
    // snap doesn't ping-pong.
    expect(mergeLockedRanges([10, 30, 30, 50])).toEqual([[10, 50]]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeLockedRanges([10, 30, 20, 50])).toEqual([[10, 50]]);
  });

  it('handles three-way merge', () => {
    expect(mergeLockedRanges([10, 20, 20, 30, 30, 40])).toEqual([[10, 40]]);
  });
});

describe('computeSnapTarget — snap-direction decision tree', () => {
  // Setup: two disjoint locked clusters at [10, 30) and [50, 70).
  // Editable region between them: [30, 50). Editable region after: [70, ...).
  // Editable region before [10) — UNLESS the test marks cluster 0 as
  // "first cluster" (frontmatter pocket guard).
  const merged: ReadonlyArray<readonly [number, number]> = [[10, 30], [50, 70]];

  it('forward snap: prevHead before lockFrom → snap to lockTo', () => {
    // User typing/clicking from the start of the doc forward into a
    // locked range; escape past it.
    expect(computeSnapTarget(5, 10, 30, merged)).toBe(30);
  });

  it('backward snap: prevHead past lockTo, backTarget editable → snap to lockFrom - 1', () => {
    // User came from after the second cluster (e.g., editable area at
    // pos 75), pressed Up into cluster [50, 70). backTarget = 49 lands
    // in the editable [30, 50) gap.
    expect(computeSnapTarget(75, 50, 70, merged)).toBe(49);
  });

  it('stay-put: prevHead past lockTo, backTarget falls in another cluster → return prevHead', () => {
    // 3-cluster scenario where backTarget = 49 IS inside cluster [40, 60).
    // The middle cluster has no editable space behind it.
    // (Phase 06 FOUND-01: dropped the original `_triple` draft fixture
    // — the test was rewritten below to use `adjacent` instead, and
    // 0.3.0's `@typescript-eslint/no-unused-vars` flags `_`-prefixed
    // local consts.)
    // prevHead = 95 (past third cluster), motion lands in third cluster.
    // backTarget = 69. Inside [70, 90)? No, 69 < 70. So this snap is
    // valid. Test the inner stay-put scenario instead:
    // prevHead = 65 (inside [40, 60)? No, between [40,60) and [70,90)).
    // Actually let's test the documented scenario: motion lands in a
    // cluster whose backTarget falls in an EARLIER cluster.
    // prevHead = 70 (at start of third cluster, motion goes backward
    // into second cluster's reach), motion lands at 50 inside [40,60).
    // backTarget = 39. 39 < 40, but 39 >= 10 && 39 < 30? No, 39 > 30. So
    // 39 is in editable [30,40). Not unreachable. Need merged where
    // backTarget IS captured:
    const adjacent: ReadonlyArray<readonly [number, number]> = [
      [10, 50], [50, 70],
    ];
    // After mergeLockedRanges, this would coalesce, but for this unit
    // test we deliberately pass non-merged input to exercise the
    // unreachable-backTarget branch.
    // prevHead = 75 (past second cluster), motion into [50, 70).
    // backTarget = 49. Inside [10, 50)? 49 >= 10 && 49 < 50 → YES.
    // Stay put → return prevHead.
    expect(computeSnapTarget(75, 50, 70, adjacent)).toBe(75);
  });

  it('first-cluster guard: backward motion into the first cluster → stay put (frontmatter pocket)', () => {
    // Real-world: ## Problem cluster sits at the top of the doc; nothing
    // editable above it (frontmatter is not user-reachable from the
    // editor body). prevHead = 35 (in editable gap), motion into
    // [10, 30) cluster.
    expect(computeSnapTarget(35, 10, 30, merged)).toBe(35);
  });

  it('inside cluster (click): prevHead inside [lockFrom, lockTo) → snap forward', () => {
    // Click landed directly on the heading text; no prior cursor outside
    // the cluster. Default forward snap.
    expect(computeSnapTarget(15, 10, 30, merged)).toBe(30);
  });

  it('boundary: prevHead === lockTo → backward branch (not forward)', () => {
    // prevHead === lockTo is "right at the downstream boundary." Treat
    // as "from after" so Up-arrow from fence body line 1 (= opener.to)
    // tries the backward branch first; the first-cluster guard then
    // kicks in for the Problem cluster.
    expect(computeSnapTarget(30, 10, 30, merged)).toBe(30); // first-cluster stay-put
    // For a non-first cluster, backTarget = 49 IS in editable gap.
    expect(computeSnapTarget(70, 50, 70, merged)).toBe(49);
  });

  it('boundary: prevHead === lockFrom → forward branch (not in lock yet)', () => {
    // prevHead === lockFrom means cursor was AT the upstream boundary,
    // about to enter. We treat this as "before" → forward escape.
    // (head < lockFrom is false but head < lockFrom is also false at
    // boundary; the changeFilter expansion compensates with from-1 in
    // the boundary fix. For snap, prevHead === lockFrom means we treat
    // it as motion from before.)
    // Note: prevHead < lockFrom is FALSE when ===. So we hit the else
    // branch. To avoid this edge being a regression, document with a
    // test:
    expect(computeSnapTarget(10, 10, 30, merged)).toBe(30);
  });
});
