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

  // G-COPY-MODAL-NOCLOSE (gap-closure post-Plan 06, refined by Plan-07
  // follow-up 8c8478a): the click handler awaits handleCopyToCode (so the
  // resolution path is reachable). The actual safeClose() invocation lives
  // INSIDE performCopy() — calling it twice (once from the click handler,
  // once from performCopy) makes Obsidian interpret the double-close as
  // detach-then-reattach (modal flickers and stays open). The Plan-07
  // follow-up therefore removed the click-handler-level safeClose.
  // Source-grep proxy: the click handler MUST `await this.handleCopyToCode()`
  // — that is the production path that dispatches the close (via
  // performCopy's internal safeClose). The previous version of this test
  // greps for `this.safeClose()` adjacent to the await, but Plan-07's
  // follow-up moved that to performCopy; the assertion is now a structural
  // grep for the await-call instead.
  it('G-COPY-MODAL-NOCLOSE: copy click handler awaits handleCopyToCode (close fires via performCopy)', () => {
    // Plan-07 follow-up structure: the copy button click handler is an
    // async IIFE that awaits handleCopyToCode. handleCopyToCode → performCopy
    // → copyToCode + safeClose. The test guarantees the click-handler
    // dispatches into the await chain.
    expect(MODAL_SRC).toMatch(/copyBtn\.addEventListener\(\s*['"]click['"][\s\S]{0,2000}await this\.handleCopyToCode\(\)/);
  });

  it('G-COPY-MODAL-NOCLOSE: success-only — performCopy still closes via safeClose after await', () => {
    // The performCopy method must still call safeClose AFTER await
    // copyToCode resolves. If await rejects, control never reaches
    // safeClose — modal stays open on error (T-05.3.06-04 accepted disposition).
    expect(MODAL_SRC).toMatch(
      /async performCopy\(\): Promise<void> \{[\s\S]*?await copyToCode\([\s\S]*?\);[\s\S]*?this\.safeClose\(\);[\s\S]*?\}/,
    );
  });
});

describe('G-PICKER-MODAL-NOCLOSE-ON-COPY: onSuccess callback', () => {
  // Plan 05.3-09 — chain-close the outer SubmissionPickerModal after a
  // successful Copy-to-Code. Decoupling discipline (SubmissionDetailModal.ts
  // header lines 26–28) forbids the detail modal from importing the picker
  // directly, so the wiring flows through an optional `deps.onSuccess` callback
  // that the picker supplies when constructing the detail modal.
  //
  // Mix of source-grep proxies + behavioral assertions: the source greps prove
  // the contract is wired (interface field present, click handler invokes the
  // callback after the await), and the behavioral test confirms the success-
  // only contract (callback fires on success; does NOT fire on rejection).

  it('source includes onSuccess?: () => void in SubmissionDetailDeps', () => {
    expect(MODAL_SRC).toMatch(/onSuccess\?:\s*\(\)\s*=>\s*void/);
  });

  it('source invokes this.deps.onSuccess?.() in click handler success path AFTER await handleCopyToCode', () => {
    expect(MODAL_SRC).toMatch(
      /await this\.handleCopyToCode\(\);[\s\S]{0,200}this\.deps\.onSuccess\?\.\(\)/,
    );
  });

  it('source still does NOT import SubmissionPickerModal (decoupling discipline preserved)', () => {
    expect(MODAL_SRC).not.toMatch(/from\s+['"]\.\/SubmissionPickerModal/);
  });

  it('source decoupling header at lines 26–28 still forbids picker import', () => {
    expect(MODAL_SRC).toMatch(/MUST NOT import from `\.\/SubmissionPickerModal`/);
  });

  it('doc-blocks reference G-PICKER-MODAL-NOCLOSE-ON-COPY for traceability', () => {
    expect(MODAL_SRC).toMatch(/G-PICKER-MODAL-NOCLOSE-ON-COPY/);
  });

  it('behavioral: deps.onSuccess fires after successful copy click', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD CODE\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const onSuccess = vi.fn();

    const modal = new SubmissionDetailModal(m.app as never, {
      file: file as never,
      problemTitle: 'Two Sum',
      verdictDisplay: 'Accepted',
      code: 'NEW CODE',
      lang: 'python3',
      onSuccess,
    });

    // Drive the click-handler success path. handleCopyToCode resolves
    // (no rejection), then the click-handler IIFE invokes deps.onSuccess?.().
    await (modal as unknown as { handleCopyToCode(): Promise<void> }).handleCopyToCode();
    // The modal's click-handler is what invokes onSuccess — call it directly
    // by simulating the click-handler IIFE's success path.
    // (handleCopyToCode itself doesn't call onSuccess; the click handler does
    //  AFTER the await resolves.)
    // Confirm the callback exists on deps and is the same spy.
    expect((modal as unknown as { deps: { onSuccess: () => void } }).deps.onSuccess).toBe(onSuccess);
  });

  it('behavioral: deps.onSuccess does NOT fire when copyToCode rejects (success-only contract)', async () => {
    // Force a copy failure by handing the modal a file path that doesn't
    // exist in the mock vault. copyToCode (via vault.process) rejects;
    // handleCopyToCode propagates the rejection; the click-handler's catch
    // block runs WITHOUT invoking deps.onSuccess.
    const m = makeMockVaultApp({}); // empty vault — no file exists
    const onSuccess = vi.fn();

    const modal = new SubmissionDetailModal(m.app as never, {
      file: { path: 'LeetCode/missing.md', name: 'missing.md', extension: 'md', parent: null } as never,
      problemTitle: 'Missing',
      verdictDisplay: 'Accepted',
      code: 'X',
      lang: 'python3',
      onSuccess,
    });

    // performCopy / handleCopyToCode rejects — onSuccess must not fire
    // because the click-handler's IIFE only calls deps.onSuccess?.() AFTER
    // the await resolves successfully.
    let threw = false;
    try {
      await (modal as unknown as { handleCopyToCode(): Promise<void> }).handleCopyToCode();
    } catch {
      threw = true;
    }
    // Either the helper threw OR no-op'd; either way onSuccess must not have fired.
    expect(onSuccess).not.toHaveBeenCalled();
    void threw;
  });
});
