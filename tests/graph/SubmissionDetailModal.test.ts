// tests/graph/SubmissionDetailModal.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-04 + GRAPH-01-revised (copy uses
// submission language, copy does NOT create ## Solution, copy confirms
// overwrite when ## Code non-empty).
// Target: src/graph/SubmissionDetailModal.ts (Wave 2).

import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
// Target — does not exist until Wave 2 ships it.
import { SubmissionDetailModal } from '../../src/graph/SubmissionDetailModal';

describe('SubmissionDetailModal (D-04)', () => {
  it('copy to code does not create ## Solution', async () => {
    // GRAPH-01 revised (D-01): Copy-to-Code writes the submitted code into
    // ## Code via vault.process. NEVER creates a ## Solution heading.
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Problem\nfoo\n\n## Code\n```python3\nstarter\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution:\n    def twoSum(self, nums, target): return [0, 1]\n',
      lang: 'python3',
      // Test-only hook — auto-confirm the overwrite dialog so we exercise
      // the final vault write deterministically.
      confirmOverwriteForTest: async () => true,
    });

    await (modal as unknown as { performCopy(): Promise<void> }).performCopy();

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).not.toContain('## Solution');
    expect(body).toContain('## Code');
    expect(body).toContain('class Solution:');
  });

  it('copy-to-code confirms overwrite', async () => {
    // When ## Code currently has a non-empty fenced block, the detail modal
    // must gate the vault.process on a user confirmation. Cancel → no write.
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD CODE\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const confirm = vi.fn(async () => false);   // user cancels
    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'NEW CODE',
      lang: 'python3',
      confirmOverwriteForTest: confirm,
    });

    await (modal as unknown as { handleCopyToCode(): Promise<void> }).handleCopyToCode();

    expect(confirm).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('OLD CODE');      // user-cancelled — original intact
    expect(body).not.toContain('NEW CODE');
    expect(m.spies.process).not.toHaveBeenCalled();
  });

  it('copy uses submission language', async () => {
    // D-04: the replacement fence's language tag = submitted language (not
    // the current fence's tag).
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'class Solution {}',
      lang: 'java',                            // submitted language differs
      confirmOverwriteForTest: async () => true,
    });

    await (modal as unknown as { performCopy(): Promise<void> }).performCopy();

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('```java');
    expect(body).toContain('class Solution {}');
    expect(body).not.toContain('```python3\nOLD');
  });
});
