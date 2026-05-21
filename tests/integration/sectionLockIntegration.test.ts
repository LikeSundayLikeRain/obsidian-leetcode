// Phase 05.5 (POLISH) — Wave 2 integration tests for sectionLockExtension.
//
// Plan 02 ships the unit-level filter + computeLockedRanges; Plan 03 verifies
// the lock interacts correctly with the existing plugin write paths under
// more realistic shapes — without modifying any production code.
//
// Four scenarios:
//   1. Phase 5.3 chevron switch (`userEvent: 'leetcode.lang-switch'`) survives
//      the lock — the dispatch threads through unfiltered even though the
//      change touches the locked fence-opener line (RESEARCH Pitfall 5;
//      CONTEXT D-04 escape hatch).
//   2. Malformed-fence note: `## Code` heading present but no opening ``` line
//      → only the heading is locked, the body falls through to editable
//      (CONTEXT D-09 fallthrough).
//   3. Non-`lc-slug` note → filter returns true universally regardless of body
//      shape (CONTEXT D-06 frontmatter gate).
//   4. Architectural assertion: `src/graph/copyToCode.ts` uses `vault.process`
//      + `processFrontMatter` exclusively (NEVER `cm.dispatch`). Vault writes
//      happen below CM6; the buffer reloads after the vault.process resolves;
//      the section lock is editor-side only, so copy-to-code is intentionally
//      outside the lock's scope (RESEARCH Pitfall 6; CONTEXT D-02).
//
// This plan does NOT modify any production source. The integration tests
// drive the existing exports `computeLockedRanges` and
// `buildSectionLockExtension` under realistic transaction shapes, and the
// copy-to-code assertion is a static file read.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
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
import {
  computeLockedRanges,
  buildSectionLockExtension,
} from '../../src/main/sectionLockExtension';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

interface CanonicalNoteOpts {
  fenceLang?: string;
  unterminatedFence?: boolean;
  missingOpener?: boolean;
  includeCustomTests?: boolean;
}

/**
 * Mirrors Plan 01's `canonicalNoteBody` helper; duplicated here to avoid
 * cross-test coupling between the unit-test file and this integration file.
 *
 * Layout follows Phase 2 D-03 + Phase 4 D-14 anchor order: ## Problem →
 * ## Code → ## Techniques → ## Notes (## Custom Tests appended optionally).
 *
 * - `unterminatedFence: true` → omit the closing ``` (D-09 fallthrough case
 *   where findCodeFence returns null and the opener exists but no closer).
 * - `missingOpener: true` → emit `## Code` heading then `## Techniques`
 *   directly with no fence at all (D-09 fallthrough where there is no fence
 *   to detect; only the heading line is locked).
 */
function canonicalNoteBody(opts: CanonicalNoteOpts = {}): string {
  const lang = opts.fenceLang ?? 'python';
  const includeFence = !opts.missingOpener;
  const closer = opts.unterminatedFence ? '' : '```\n';
  const codeBlock = includeFence
    ? `\n` + '```' + lang + '\n' + `class Solution: pass\n` + closer + `\n`
    : `\n`;
  const customTests = opts.includeCustomTests
    ? `\n${CUSTOM_TESTS_HEADING_LINE}\n\n### Case 1\n\nuser-owned content\n`
    : '';
  return (
    `${PROBLEM_HEADING_LINE}\n` +
    `Given an array, return two indices.\n` +
    `\n` +
    `${CODE_HEADING_LINE}\n` +
    codeBlock +
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
 * return the callable changeFilter callback.
 *
 * If Plan 02 changes the order or shape of the returned Extension array, this
 * helper updates here only — production code stays stable. CM6 facet `.of()`
 * results expose the registered value at `.value` (or `.fn` / `.callback` in
 * historical shapes); we probe a few likely fields and fall through to
 * direct-function entries.
 *
 * Throws a clear error if no callable is found ("Plan 02 contract violation").
 */
function getChangeFilterCallback(plugin: unknown): (tr: unknown) => unknown {
  const ext = buildSectionLockExtension(plugin as never);
  const flat: unknown[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const sub of node) visit(sub);
      return;
    }
    flat.push(node);
  };
  visit(ext);

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
    'Plan 02 contract violation: buildSectionLockExtension did not return a callable changeFilter facet.',
  );
}

/**
 * Predicate: is the line `[lineFrom, lineTo)` fully covered by ANY locked
 * range pair `[rangeFrom, rangeTo]` in `ranges`? Used by the malformed-fence
 * scenario to assert that body lines are NOT in any locked pair.
 */
function lineIsLocked(
  ranges: readonly number[],
  lineFrom: number,
  lineTo: number,
): boolean {
  // Skip zero-width lines (e.g., the empty trailing line of the doc).
  if (lineTo <= lineFrom) return false;
  for (let i = 0; i < ranges.length; i += 2) {
    const from = ranges[i] as number;
    const to = ranges[i + 1] as number;
    if (from <= lineFrom && to >= lineTo) {
      return true;
    }
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — Phase 5.3 chevron switch survives the lock
//   (CONTEXT D-04 + RESEARCH Pitfall 5)
// ────────────────────────────────────────────────────────────────────────

describe('chevron switch dispatches survive the lock', () => {
  const filePath = 'LeetCode/0001-two-sum.md';

  it('chevron-shaped transaction with userEvent="leetcode.lang-switch" returns true (fence-opener rewrite path)', () => {
    // The chevron's `cm.dispatch({ changes: [openerChange, bodyChange],
    // userEvent: 'leetcode.lang-switch' })` writes the fence opener line —
    // a locked range under D-09. RESEARCH Pitfall 5 + D-04 escape hatch:
    // the leading `'leetcode.'` userEvent prefix MUST bypass the filter,
    // otherwise the chevron is silently broken.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(filePath, { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody({ fenceLang: 'python' }),
      filePath,
    });
    const tr = makeFakeTransaction(state, {
      userEvent: 'leetcode.lang-switch',
    });

    const filter = getChangeFilterCallback(plugin);
    expect(filter(tr)).toBe(true);
  });

  it('chevron-shaped transaction with same userEvent passes through for the fence-body rewrite half', () => {
    // The chevron dispatches a SINGLE transaction containing TWO changes
    // (opener + body); both halves of that transaction inherit the same
    // `userEvent: 'leetcode.lang-switch'` annotation. The filter is invoked
    // ONCE per transaction (not per change), so both halves pass through
    // together. This it-block models the body-rewrite half by pointing the
    // fake transaction at a state whose locked ranges include the body
    // (here, by using the `## Problem` body which is universally locked
    // under D-03/Problem) — the userEvent gate fires FIRST, so the filter
    // returns true regardless of which range the change touches.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(filePath, { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody({ fenceLang: 'python' }),
      filePath,
    });
    const tr = makeFakeTransaction(state, {
      userEvent: 'leetcode.lang-switch',
    });

    const filter = getChangeFilterCallback(plugin);
    expect(filter(tr)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — Malformed-fence body remains editable (D-09 fallthrough)
// ────────────────────────────────────────────────────────────────────────

describe('malformed fence (no opener) — body is not locked', () => {
  it('## Code heading is locked even when no fence opener exists between Code and Techniques', () => {
    // Build a body with `## Code` heading present but NO opening ``` line
    // before the next H2. Per CONTEXT D-09 fallthrough: heading line stays
    // locked (D-08 trailing-newline lock applies unconditionally on any
    // canonical heading), but the body region between `## Code` and
    // `## Techniques` falls through to editable.
    const body = canonicalNoteBody({ missingOpener: true });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Locate ## Code and ## Techniques lines.
    let codeLine = -1;
    let techLine = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (t === CODE_HEADING_LINE) codeLine = i;
      if (t === TECHNIQUES_HEADING_LINE) {
        techLine = i;
        break;
      }
    }
    expect(codeLine).toBeGreaterThan(0);
    expect(techLine).toBeGreaterThan(codeLine);

    // ## Code heading line MUST be locked (D-08).
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

    // No range may fully contain ANY line strictly between codeLine and
    // techLine (the fall-through region must be editable).
    for (let n = codeLine + 1; n < techLine; n++) {
      const lineFrom = state.doc.line(n).from;
      const lineTo = state.doc.line(n).to;
      expect(lineIsLocked(ranges, lineFrom, lineTo)).toBe(false);
    }
  });

  it('unterminated fence (opener exists, no closer) — only ## Code heading is locked; opener line falls through', () => {
    // Per CONTEXT D-09 + the Plan 02 implementation: when findCodeFence
    // returns null (the case for an unterminated fence), the `## Code`
    // heading is still locked, but the opener line is NOT locked
    // end-to-end. The body falls through to "everything else editable" —
    // matches the "note that pre-dates Phase 3" defensive case.
    const body = canonicalNoteBody({ unterminatedFence: true });
    const state = makeStateForLockTests({ body });
    const ranges = computeLockedRanges(state);

    // Locate the (lone) opener line.
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

    // Opener line MUST NOT be locked end-to-end (D-09 fallthrough). Use
    // lineIsLocked which already filters out zero-width / boundary cases.
    const openerFrom = state.doc.line(openerLine).from;
    const openerTo = state.doc.line(openerLine).to;
    expect(lineIsLocked(ranges, openerFrom, openerTo)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Non-lc-slug note is universally unaffected (D-06)
// ────────────────────────────────────────────────────────────────────────

describe('non-lc-slug note: filter returns true regardless of body', () => {
  const filePath = 'Daily/journal-2026-05-13.md';

  it('filter returns true when frontmatter has no lc-slug key — even if body has all four canonical headings', () => {
    // Build a body that WOULD lock if it were an lc-slug note (canonical
    // four-section layout with valid fence). Per CONTEXT D-06 frontmatter
    // gate, non-lc-slug notes bypass computeLockedRanges entirely — the
    // filter returns true and the lock has no effect.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(filePath, { foo: 'bar' }); // no lc-slug
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody({ fenceLang: 'python' }),
      filePath,
    });
    const tr = makeFakeTransaction(state); // no userEvent

    const filter = getChangeFilterCallback(plugin);
    expect(filter(tr)).toBe(true);
  });

  it("filter returns true when lc-slug is the empty string '' (Plan 02 contract: length === 0 → bypass)", () => {
    // The Plan 02 frontmatter gate explicitly checks
    // `typeof slug !== 'string' || slug.length === 0` → return true. An
    // empty-string `lc-slug` is treated as "not an LC note" — the lock
    // does not apply.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(filePath, { 'lc-slug': '' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateForLockTests({
      body: canonicalNoteBody({ fenceLang: 'python' }),
      filePath,
    });
    const tr = makeFakeTransaction(state);

    const filter = getChangeFilterCallback(plugin);
    expect(filter(tr)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — copy-to-code architectural assertion
//   (CONTEXT D-02 + RESEARCH Pitfall 6)
// ────────────────────────────────────────────────────────────────────────

describe('copy-to-code uses vault.process (architectural — bypasses lock by design)', () => {
  it('src/graph/copyToCode.ts uses vault.process and processFrontMatter — never cm.dispatch', () => {
    // CONTEXT D-02: plugin keeps overwriting silently. RESEARCH Pitfall 6:
    // vault writes happen at the vault layer, BELOW CM6; the buffer reloads
    // after `vault.process` resolves, so the section lock has no input to
    // filter for the copy-to-code path. This is intentional asymmetry —
    // the lock is editor-side (CM6 transaction filter) and copy-to-code is
    // vault-side (vault.process + processFrontMatter).
    //
    // If a future PR refactors copy-to-code to use cm.dispatch directly,
    // that PR MUST set `userEvent: 'leetcode.copy-to-code'` (or similar
    // `'leetcode.*'` annotation) to bypass the lock — failing this
    // assertion is the early warning that the question must be re-examined.
    const sourcePath = `${process.cwd()}/src/graph/copyToCode.ts`;
    const content = readFileSync(sourcePath, 'utf8');

    // Positive assertions — the two SSoT vault-layer write APIs.
    expect(content).toContain('app.vault.process(');
    expect(content).toContain('app.fileManager.processFrontMatter(');

    // Negative assertion — copy-to-code MUST NOT route through CM6.
    expect(content).not.toContain('cm.dispatch');
  });
});
