// tests/graph/SubmissionDetailModal.silent-copy.test.ts
//
// Phase 5.2 Plan 04 — D-10 silent Copy-to-Code path.
//
// Contracts:
//   - handleCopyToCode performs a silent overwrite — it NEVER opens
//     ConfirmOverwriteModal and NEVER calls any confirm hook.
//   - performCopy is invoked on every Copy click.
//   - `askConfirm` method is deleted from SubmissionDetailModal.
//   - `confirmOverwriteForTest` hook is deleted from SubmissionDetailDeps.
//   - Source file no longer references ConfirmOverwriteModal (D-10 cleanup).
//   - ConfirmOverwriteModal.ts file STILL exists (D-11 — reused by Reset).

import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import fs from 'node:fs';
import path from 'node:path';

// Same vi.hoisted + vi.mock pattern as SubmissionDetailModal.test.ts so the
// CM6 render path doesn't explode during onOpen. Here we only need the mock
// to exist; these tests exercise handleCopyToCode / performCopy directly.
const hoisted = vi.hoisted(() => ({
  renderSpy: vi.fn(async () => undefined),
  loadSpy: vi.fn(),
  unloadSpy: vi.fn(),
}));
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Component {
    load = hoisted.loadSpy;
    unload = hoisted.unloadSpy;
    addChild<T>(c: T): T {
      return c;
    }
  }
  return {
    ...actual,
    MarkdownRenderer: { render: hoisted.renderSpy },
    Component,
  };
});

import { SubmissionDetailModal } from '../../src/graph/SubmissionDetailModal';

const REPO_ROOT = process.cwd();
const MODAL_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'src/graph/SubmissionDetailModal.ts'),
  'utf-8',
);

describe('SubmissionDetailModal silent Copy-to-Code (D-10)', () => {
  it('handleCopyToCode overwrites existing non-empty fence silently', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD CODE\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'NEW CODE',
      lang: 'python3',
    });

    await (modal as unknown as { handleCopyToCode(): Promise<void> }).handleCopyToCode();

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('NEW CODE');
    expect(body).not.toContain('OLD CODE');
    expect(m.spies.process).toHaveBeenCalledTimes(1);
  });

  it('D-10: source does NOT reference ConfirmOverwriteModal', () => {
    expect(MODAL_SRC).not.toMatch(/ConfirmOverwriteModal/);
  });

  it('D-10: source does NOT define askConfirm method', () => {
    expect(MODAL_SRC).not.toMatch(/askConfirm/);
  });

  it('D-10: SubmissionDetailDeps does NOT include confirmOverwriteForTest', () => {
    expect(MODAL_SRC).not.toMatch(/confirmOverwriteForTest/);
  });

  it('D-11: ConfirmOverwriteModal.ts file STILL exists in src/graph/', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'src/graph/ConfirmOverwriteModal.ts')),
    ).toBe(true);
  });
});
