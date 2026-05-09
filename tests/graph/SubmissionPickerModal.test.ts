// tests/graph/SubmissionPickerModal.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-03, D-05, D-06.
// Target: src/graph/SubmissionPickerModal.ts (Wave 2).
//
// The picker has three red-baseline render states:
//   1. Session-expired → fires locked Phase 1 Notice + closes modal (D-06).
//   2. Empty list (LC returned `submissions_dump: []`) → inline "No submissions yet." placeholder.
//   3. Network error (4xx/5xx) → inline error in modal (NOT a Notice per D-06).
//
// Notice copy is LOCKED by 04-UI-SPEC.md §Notice strings — Wave 2 must assert
// the exact string 'LeetCode session expired. Log in again.' (CF-19).

import { describe, it, expect, vi } from 'vitest';
import { SessionExpiredError } from '../../src/shared/errors';
// Target — does not exist until Wave 2 ships it.
import { SubmissionPickerModal } from '../../src/graph/SubmissionPickerModal';

// Very light App stub — the modal never touches real Obsidian internals in
// these happy-path-only assertions.
function makeMinimalAppStub(): unknown {
  return {
    workspace: {
      getActiveViewOfType: () => null,
    },
  };
}

function makeStubFile(): unknown {
  return { path: 'LeetCode/1-two-sum.md', name: '1-two-sum.md', extension: 'md', parent: null };
}

describe('SubmissionPickerModal (D-03, D-05, D-06)', () => {
  it('session expired fires locked Notice', async () => {
    const NoticeSpy = vi.fn();
    (globalThis as { Notice?: unknown }).Notice = NoticeSpy;

    const fetchHistory = vi.fn(async () => {
      throw new SessionExpiredError();
    });
    const modal = new SubmissionPickerModal(makeMinimalAppStub() as never, {
      file: makeStubFile() as never,
      slug: 'two-sum',
      title: 'Two Sum',
      fetchHistory,
      openDetailModal: () => undefined,
    });

    // Drive the same codepath onOpen would invoke — load submissions +
    // handle the SessionExpiredError path.
    await expect((modal as unknown as { loadAndRender(): Promise<void> }).loadAndRender()).resolves.toBeUndefined();

    // Notice copy locked per CF-19 / UI-SPEC §Notice strings.
    expect(NoticeSpy).toHaveBeenCalledWith(
      'LeetCode session expired. Log in again.',
      expect.any(Number),
    );
  });

  it('empty state renders placeholder', async () => {
    const fetchHistory = vi.fn(async () => []);
    const modal = new SubmissionPickerModal(makeMinimalAppStub() as never, {
      file: makeStubFile() as never,
      slug: 'two-sum',
      title: 'Two Sum',
      fetchHistory,
      openDetailModal: () => undefined,
    });

    await (modal as unknown as { loadAndRender(): Promise<void> }).loadAndRender();

    // The picker's empty-state DOM must contain the exact placeholder string.
    const contentEl = (modal as unknown as { contentEl: { textContent: string } }).contentEl;
    expect(contentEl.textContent).toContain('No submissions yet.');
  });

  it('network error renders inline', async () => {
    const fetchHistory = vi.fn(async () => {
      throw new Error('HTTP 500');
    });
    const modal = new SubmissionPickerModal(makeMinimalAppStub() as never, {
      file: makeStubFile() as never,
      slug: 'two-sum',
      title: 'Two Sum',
      fetchHistory,
      openDetailModal: () => undefined,
    });

    await (modal as unknown as { loadAndRender(): Promise<void> }).loadAndRender();

    const contentEl = (modal as unknown as { contentEl: { textContent: string } }).contentEl;
    // D-06: inline error, NOT a Notice. UI-SPEC pins the copy.
    expect(contentEl.textContent).toContain("Couldn't load submissions.");
  });
});
