// tests/main/resetCommand.test.ts
//
// Phase 5.2 Plan 04 — D-05 + D-07 Reset code command.
//
// Contracts:
//   - `Insert starter code` command is removed from src/main.ts (D-05).
//   - A new `Reset code` command (id=`reset-code`) is registered via
//     `this.addCommand({ id: 'reset-code', name: 'Reset code', ... })` (D-07).
//   - The helper that the command invokes — `resetCodeWithConfirm` —
//     gates the destructive force-inject behind ConfirmOverwriteModal
//     when a non-empty fence exists; proceeds silently when the fence
//     is empty/absent.
//   - Successful reset fires a Notice with copy "Code reset to starter."
//   - ConfirmOverwriteModal.ts file remains in src/graph/ (D-11).
//
// The helper is extracted to src/solve/resetCodeWithConfirm.ts so we can
// exercise the confirm gate deterministically without spinning up a real
// Obsidian Plugin.

import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { resetCodeWithConfirm } from '../../src/solve/resetCodeWithConfirm';
import type { DetailCacheEntry } from '../../src/settings/SettingsStore';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();

function makeSettings(
  detail: Partial<DetailCacheEntry> | null = null,
  defaultLang = 'python3',
) {
  return {
    getProblemDetail: vi.fn(
      (_slug: string): DetailCacheEntry | null =>
        detail as DetailCacheEntry | null,
    ),
    getDefaultLanguage: vi.fn((): string => defaultLang),
  };
}

describe('resetCodeWithConfirm helper (D-07)', () => {
  it('when fence is non-empty, resets without confirmation (confirm gate removed)', async () => {
    const initial = '---\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings({
      codeSnippets: [{ lang: "Python3", langSlug: "python3", code: "class S: pass" }],
    });
    const confirm = vi.fn(async () => false);

    const notices: string[] = [];
    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm,
      notify: (msg) => notices.push(msg),
    });

    // confirm gate removed — confirm is never called regardless of fence content
    expect(confirm).not.toHaveBeenCalled();
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md')!;
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD');
    expect(notices).toEqual(['Code reset to starter.']);
  });

  it('when fence is non-empty, force-injects starter + fires success Notice', async () => {
    const initial = '---\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings({
      codeSnippets: [{ lang: "Python3", langSlug: "python3", code: "class S: pass" }],
    });
    const confirm = vi.fn(async () => true);

    const notices: string[] = [];
    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm,
      notify: (msg) => notices.push(msg),
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md')!;
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD');
    expect(notices).toEqual(['Code reset to starter.']);
  });

  it('when fence is empty, writes starter immediately (no confirm)', async () => {
    const initial = '---\nlc-slug: two-sum\n---\n\n## Code\n```python3\n\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings({
      codeSnippets: [{ lang: "Python3", langSlug: "python3", code: "class S: pass" }],
    });
    const confirm = vi.fn(async () => true);

    const notices: string[] = [];
    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm,
      notify: (msg) => notices.push(msg),
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md')!;
    expect(body).toContain('class S: pass');
    expect(notices).toEqual(['Code reset to starter.']);
  });

  it('when detail is null, falls back to empty starter (still fires Notice)', async () => {
    const initial = '---\nlc-slug: two-sum\n---\n\n## Code\n```python3\n\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings(null);
    const confirm = vi.fn(async () => true);

    const notices: string[] = [];
    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm,
      notify: (msg) => notices.push(msg),
    });

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(notices).toEqual(['Code reset to starter.']);
  });
});

describe('src/main.ts wiring (D-05, D-07 grep gates)', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src/main.ts'), 'utf-8');

  it('D-05: does NOT register the `insert-starter-code` command', () => {
    expect(src).not.toMatch(/'insert-starter-code'/);
    expect(src).not.toMatch(/Insert starter code/);
  });

  it('D-07: registers `reset-code` command with name "Reset code"', () => {
    // id is quoted in the addCommand literal
    expect(src).toMatch(/id:\s*'reset-code'/);
    expect(src).toMatch(/name:\s*'Reset code'/);
  });

  it('D-06: registers workspace.on("file-open") via registerEvent', () => {
    expect(src).toMatch(/workspace\.on\(\s*'file-open'/);
    expect(src).toMatch(/registerEvent/);
  });

  it('D-11: ConfirmOverwriteModal.ts still exists in src/graph/', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'src/graph/ConfirmOverwriteModal.ts'))).toBe(true);
  });
});
