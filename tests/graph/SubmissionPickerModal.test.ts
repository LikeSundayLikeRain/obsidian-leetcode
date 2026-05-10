// tests/graph/SubmissionPickerModal.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-03, D-05, D-06.
// Target: src/graph/SubmissionPickerModal.ts (Wave 2).
//
// The picker has three red-baseline render states:
//   1. Session-expired → fires locked Phase 5 D-21 sticky Notice + closes modal (D-06).
//   2. Empty list (LC returned `submissions_dump: []`) → inline "No submissions yet." placeholder.
//   3. Network error (4xx/5xx) → inline error in modal (NOT a Notice per D-06).
//
// Notice copy is LOCKED by 04-UI-SPEC.md §Notice strings + CF-04 — the
// "LeetCode session expired. Log in again." string must appear verbatim in
// the DocumentFragment handed to new Notice(...) (Phase 5 Plan 03 D-21
// migrated all plain-string Notices to showSessionExpiredNotice).

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
  it('session expired fires locked Notice (Phase 5 D-21 DocumentFragment form)', async () => {
    // Phase 5 Plan 03 D-21 migration: the picker's session-expired path now
    // calls `showSessionExpiredNotice(login)` which constructs a Notice with
    // a DocumentFragment containing the CF-04 locked copy + a Log in button.
    // The spy captures the DocumentFragment so we can assert the verbatim
    // copy appears inside it.
    const captured: Array<{ arg: unknown; timeout: unknown }> = [];
    const NoticeSpy = vi.fn(function MockNotice(arg: unknown, timeout?: unknown) {
      captured.push({ arg, timeout });
      return { hide: vi.fn() };
    });
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

    // Notice copy locked per CF-04 / CF-19 / UI-SPEC §Notice strings.
    // Accept either legacy plain-string OR Phase 5 DocumentFragment form —
    // whichever the picker chose for its session-expired branch. The CF-04
    // copy must appear verbatim either way.
    expect(NoticeSpy).toHaveBeenCalled();
    const first = captured[0];
    expect(first).toBeDefined();
    const arg = first!.arg;
    const hasLockedCopy =
      (typeof arg === 'string' && arg.includes('LeetCode session expired. Log in again.')) ||
      (arg instanceof DocumentFragment && (() => {
        const host = document.createElement('div');
        host.appendChild(arg.cloneNode(true));
        return host.textContent?.includes('LeetCode session expired. Log in again.') === true;
      })());
    expect(hasLockedCopy).toBe(true);
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
