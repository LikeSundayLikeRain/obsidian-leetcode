// tests/main/resetCommand.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-04 (D-05 remove Insert starter code,
// D-07 add Reset code + confirm gate).
//
// Wave 1 plan 05.2-04 performs two related changes in main.ts:
//   D-05: the `insert-starter-code` command is deleted.
//   D-07: a new `reset-code` command is added. On `lc-slug` notes:
//         - If the Code section has a non-empty fence → open
//           `ConfirmOverwriteModal` before writing.
//         - If no fence / empty fence → write directly, no confirm.
//         - On non-lc-slug files, editorCheckCallback returns false so
//           the command stays hidden from the palette.
//
// These tests exercise the command-registration contract (what ids exist)
// and the confirm-gate contract. All are `it.skip` pending 05.2-04 because
// main.ts today still registers `insert-starter-code` and has no reset path.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('Reset code command + confirm gate (RED until 05.2-04)', () => {
  // D-07 — reset-code command registered with id='reset-code', name='Reset code'.
  it.skip('D-07: reset-code command registered with expected id + name (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      getRegisteredCommandIds?: () => string[];
    };
    if (typeof mod.getRegisteredCommandIds !== 'function') {
      throw new Error(
        'getRegisteredCommandIds not exported — 05.2-04 must expose a test-only ' +
          'introspection helper OR this test must instantiate the plugin and read ' +
          'captured addCommand calls (planner picks the mechanism)',
      );
    }
    const ids = mod.getRegisteredCommandIds();
    expect(ids).toContain('reset-code');
  });

  // D-05 — insert-starter-code command is removed from the registration list.
  it.skip('D-05: insert-starter-code command is NOT registered (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      getRegisteredCommandIds?: () => string[];
    };
    if (typeof mod.getRegisteredCommandIds !== 'function') {
      throw new Error('getRegisteredCommandIds not exported — 05.2-04 must expose it');
    }
    const ids = mod.getRegisteredCommandIds();
    expect(ids).not.toContain('insert-starter-code');
  });

  // D-07 — Reset on a file with an existing non-empty fence opens the confirm
  // modal before writing.
  it.skip('D-07: Reset on file with existing fence opens ConfirmOverwriteModal (TODO(05.2-04): extract resetCode helper for testability)', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      resetCodeForActive?: (plugin: unknown, file: unknown) => Promise<void>;
    };
    if (typeof mod.resetCodeForActive !== 'function') {
      throw new Error('resetCodeForActive helper not exported — 05.2-04 must extract it');
    }
    // Body with a non-empty fence under ## Code — the gate should fire.
    const confirmCtorSpy = vi.fn();
    vi.doMock('../../src/solve/ConfirmOverwriteModal', () => ({
      ConfirmOverwriteModal: class {
        constructor(...args: unknown[]) {
          confirmCtorSpy(...args);
        }
        open(): void {
          /* test stub; would surface the modal in production */
        }
      },
    }));
    // The helper is expected to read the file body, detect the non-empty
    // fence via `hasExistingCodeBlock`, and open the confirm modal. We only
    // assert the confirm path was taken.
    const file = { path: 'LeetCode/1-two-sum.md' };
    const plugin = {
      app: {
        vault: {
          read: async () =>
            '## Problem\nfoo\n\n## Code\n```python3\nexisting code\n```\n',
          process: vi.fn(),
        },
      },
      settings: {
        getDefaultLanguage: () => 'python3',
        getProblemDetail: () => null,
      },
    };
    await mod.resetCodeForActive(plugin, file);
    expect(confirmCtorSpy).toHaveBeenCalledTimes(1);
  });

  // D-07 — Reset on a file without an existing non-empty fence proceeds without
  // the confirm modal (nothing destructive is being overwritten).
  it.skip('D-07: Reset on empty Code section proceeds without confirm (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      resetCodeForActive?: (plugin: unknown, file: unknown) => Promise<void>;
    };
    if (typeof mod.resetCodeForActive !== 'function') {
      throw new Error('resetCodeForActive helper not exported — 05.2-04 must extract it');
    }
    const confirmCtorSpy = vi.fn();
    vi.doMock('../../src/solve/ConfirmOverwriteModal', () => ({
      ConfirmOverwriteModal: class {
        constructor(...args: unknown[]) {
          confirmCtorSpy(...args);
        }
        open(): void {
          /* swallow */
        }
      },
    }));
    const file = { path: 'LeetCode/1-two-sum.md' };
    const plugin = {
      app: {
        vault: {
          read: async () => '## Problem\nfoo\n\n## Code\n```python3\n\n```\n',
          process: vi.fn(),
        },
      },
      settings: {
        getDefaultLanguage: () => 'python3',
        getProblemDetail: () => null,
      },
    };
    await mod.resetCodeForActive(plugin, file);
    expect(confirmCtorSpy).not.toHaveBeenCalled();
  });

  // D-07 — editorCheckCallback gate for non-lc-slug files. Reading-mode /
  // non-problem notes must not surface the command at all.
  it.skip('D-07: editorCheckCallback returns false for non-lc-slug files (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      resetCodeCheckCallback?: (
        checking: boolean,
        editor: unknown,
        view: { file: { path: string } | null },
        plugin: unknown,
      ) => boolean;
    };
    if (typeof mod.resetCodeCheckCallback !== 'function') {
      throw new Error('resetCodeCheckCallback not exported — 05.2-04 must export it');
    }
    const plugin = {
      app: {
        metadataCache: {
          getFileCache: () => ({ frontmatter: {} }),
        },
      },
    };
    const result = mod.resetCodeCheckCallback(
      true,
      {},
      { file: { path: 'Notes/random.md' } },
      plugin,
    );
    expect(result).toBe(false);
  });
});
