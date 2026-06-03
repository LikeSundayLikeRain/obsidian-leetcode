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

// =============================================================================
// Phase 20 Plan 20-10 (gap-closure T10 — DATA CORRUPTION).
//
// resetCodeWithConfirm now accepts an async `resolveFenceKind` seam. When the
// resolver returns 'leetcode-solve', forceInjectCodeSection short-circuits to
// rewriteFenceBody and the v1.3 fence opener stays verbatim. The resolver in
// production reads from disk via vault.read — NOT via getActiveViewOfType —
// so popout / non-active-pane / command-palette-from-other-file scenarios
// hold T10.
// =============================================================================
describe('resetCodeWithConfirm — fenceKind seam (Plan 20-10 T10)', () => {
  it('T10-1: leetcode-solve fence — opener preserved verbatim, body replaced, no langSlug sibling fence', async () => {
    const initial =
      '---\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```leetcode-solve\nOLD_CODE\n```\n\n## Notes\nuser notes\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings(
      {
        codeSnippets: [
          { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
        ],
      },
      'python3',
    );

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      resolveActiveLangSlug: () => 'python3',
      // The resolver under test reads via vault.read — but our mock vault's
      // read returns the seeded content, so this resolver replicates the
      // production path verbatim (vault.read + countLeetCodeSolveFenceOpeners).
      resolveFenceKind: async (f: never) => {
        const text = await m.app.vault.read(f as never);
        return text.includes('```leetcode-solve') ? 'leetcode-solve' : 'legacy';
      },
    } as never);

    const body = m.getContent('LeetCode/1-two-sum.md')!;
    // Opener preserved verbatim.
    expect(body).toMatch(/^```leetcode-solve$/m);
    // No sibling langSlug fence grafted.
    expect(body).not.toMatch(/^```python\d?$/m);
    // Starter landed in body.
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD_CODE');
    // Notes preserved.
    expect(body).toContain('user notes');
  });

  it('T10-2: active view = DIFFERENT file — vault.read-driven resolver still detects v1.3 fence', async () => {
    const initial =
      '---\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```leetcode-solve\nOLD_CODE\n```\n\n## Notes\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings(
      {
        codeSnippets: [
          { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
        ],
      },
      'python3',
    );

    // Mock workspace.getActiveViewOfType returns a DIFFERENT file's view.
    // The resolver must NOT consult this — it reads from disk.
    (m.spies.getActiveViewOfType as ReturnType<typeof vi.fn>).mockReturnValue({
      file: { path: 'LeetCode/2-other-problem.md' },
    } as never);

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      resolveActiveLangSlug: () => 'python3',
      resolveFenceKind: async (f: never) => {
        // Pure vault.read — no getActiveViewOfType.
        const text = await m.app.vault.read(f as never);
        return text.includes('```leetcode-solve') ? 'leetcode-solve' : 'legacy';
      },
    } as never);

    const body = m.getContent('LeetCode/1-two-sum.md')!;
    // T10 holds: leetcode-solve opener preserved verbatim even though the
    // active view points at a different file.
    expect(body).toMatch(/^```leetcode-solve$/m);
    expect(body).not.toMatch(/^```python\d?$/m);
    expect(body).toContain('class S: pass');
  });

  it('T10-3: active view = null (popout / non-MarkdownView focused) — leetcode-solve still detected', async () => {
    const initial =
      '---\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```leetcode-solve\nOLD_CODE\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings(
      {
        codeSnippets: [
          { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
        ],
      },
      'python3',
    );

    (m.spies.getActiveViewOfType as ReturnType<typeof vi.fn>).mockReturnValue(null);

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      resolveActiveLangSlug: () => 'python3',
      resolveFenceKind: async (f: never) => {
        const text = await m.app.vault.read(f as never);
        return text.includes('```leetcode-solve') ? 'leetcode-solve' : 'legacy';
      },
    } as never);

    const body = m.getContent('LeetCode/1-two-sum.md')!;
    expect(body).toMatch(/^```leetcode-solve$/m);
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD_CODE');
  });

  it('T10-5: malformed v1.3 fence (unterminated opener) — rewriteFenceBody returns input unchanged, no spurious starter graft', async () => {
    // Unterminated leetcode-solve fence at EOF (no closer line). The
    // rewriteFenceBody primitive's contract returns input unchanged in this
    // case (per Plan 19-04 property tests). The reset must NOT corrupt the
    // file by appending a starter — better to no-op than to fabricate
    // content.
    const initial =
      '---\nlc-slug: two-sum\n---\n\n## Code\n```leetcode-solve\nNO_CLOSER';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    const settings = makeSettings({
      codeSnippets: [
        { lang: 'Python3', langSlug: 'python3', code: 'class S: pass' },
      ],
    });

    await resetCodeWithConfirm({
      app: m.app as never,
      file: file as never,
      slug: 'two-sum',
      settings,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      resolveFenceKind: async (f: never) => {
        const text = await m.app.vault.read(f as never);
        return text.includes('```leetcode-solve') ? 'leetcode-solve' : 'legacy';
      },
    } as never);

    const body = m.getContent('LeetCode/1-two-sum.md')!;
    // Body unchanged — no starter graft on a malformed fence.
    expect(body).toBe(initial);
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
