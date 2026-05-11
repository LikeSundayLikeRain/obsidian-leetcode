// tests/graph/SubmissionDetailModal.silent-copy.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-04 (Copy-to-Code silent overwrite D-10).
//
// Wave 1 behavior change: SubmissionDetailModal.handleCopyToCode must call
// `performCopy` DIRECTLY — no consultation of any confirm gate. The
// `ConfirmOverwriteModal` class stays in the codebase for Reset (D-07 / D-11),
// but the Copy-to-Code call site is decoupled from it entirely.
//
// Why a fresh file: `tests/graph/SubmissionDetailModal.test.ts` currently
// asserts the confirm-gate semantics (`copy-to-code confirms overwrite`); the
// confirm path is intentional today. Deleting / mutating that test mid-Wave-0
// would pre-commit Wave 1 decisions. We add the new contract in a sibling
// file; 05.2-04 reshapes the legacy test when the silent overwrite lands.
// TODO(05.2-04): reshape SubmissionDetailModal.test.ts confirm assertions after
// silent-overwrite lands.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';

// We assert on two invariants:
//   (a) ConfirmOverwriteModal's constructor is never invoked.
//   (b) performCopy (the private vault-write path) IS invoked once.
// Spy on the constructor via module-level vi.mock so the detail modal's
// lazy `await import('./ConfirmOverwriteModal')` resolves to our fake.
const hoisted = vi.hoisted(() => ({
  confirmCtorSpy: vi.fn(),
}));
vi.mock('../../src/graph/ConfirmOverwriteModal', () => ({
  ConfirmOverwriteModal: class {
    constructor(...args: unknown[]) {
      hoisted.confirmCtorSpy(...args);
    }
    open(): void {
      /* swallow */
    }
  },
}));
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { SubmissionDetailModal } from '../../src/graph/SubmissionDetailModal';

describe('SubmissionDetailModal silent copy (RED until 05.2-04)', () => {
  beforeEach(() => {
    hoisted.confirmCtorSpy.mockClear();
  });

  // D-10 — handleCopyToCode on a file with an existing non-empty fence must
  // NOT open the confirm modal. It calls performCopy directly and the vault
  // is rewritten in one step.
  it.skip('D-10: handleCopyToCode with non-empty existing fence — no ConfirmOverwriteModal constructed (TODO(05.2-04): delete confirm gate in handleCopyToCode)', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Problem\nfoo\n\n## Code\n```python3\nold starter\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution:\n    pass\n',
      lang: 'python3',
      // NOTE: deliberately NOT passing `confirmOverwriteForTest`. Today's
      // production path would open ConfirmOverwriteModal in this branch; the
      // Wave 1 fix skips the branch entirely.
    });

    const performCopySpy = vi.spyOn(
      modal as unknown as { performCopy: () => Promise<void> },
      'performCopy',
    ).mockResolvedValue(undefined);

    await (modal as unknown as { handleCopyToCode: () => Promise<void> }).handleCopyToCode();

    expect(hoisted.confirmCtorSpy).not.toHaveBeenCalled();
    expect(performCopySpy).toHaveBeenCalledTimes(1);
  });
});
