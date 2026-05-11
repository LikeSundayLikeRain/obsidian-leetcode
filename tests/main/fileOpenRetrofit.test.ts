// tests/main/fileOpenRetrofit.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-04 (D-06 starter-code auto-insert on
// `workspace.on('file-open')`).
//
// Wave 1 plan 05.2-04 introduces a new helper in main.ts that the file-open
// event fires through:
//
//   handleFileOpenForStarterCode(plugin, file): void | Promise<void>
//
// Contract:
//   - No-op when `file` is null (Obsidian fires null on workspace empty).
//   - No-op when the file has no `lc-slug` frontmatter (gate per CF-13).
//   - Invokes `retrofit(app, file, detail, { getDefaultLanguage })` from
//     starterCodeInjector when the frontmatter carries `lc-slug`.
//   - Swallows errors thrown by retrofit (D-09: silent-on-failure).
//
// Tests are `it.skip` because `handleFileOpenForStarterCode` does not exist
// yet — 05.2-04 extracts it. The `fireFileOpen` helper landed in Task 1 of
// this plan (obsidian-stub extension), so the end-to-end event wiring is
// ready; only the plugin-side handler is missing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireFileOpen } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// Spy on the retrofit side-effect function — we want to assert invocation
// count / args without really running vault.process.
const hoisted = vi.hoisted(() => ({
  retrofitSpy: vi.fn(async () => undefined),
}));
vi.mock('../../src/solve/starterCodeInjector', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/solve/starterCodeInjector')
  >('../../src/solve/starterCodeInjector');
  return {
    ...actual,
    retrofit: hoisted.retrofitSpy,
  };
});

describe('handleFileOpenForStarterCode (RED until 05.2-04)', () => {
  beforeEach(() => {
    hoisted.retrofitSpy.mockClear();
  });

  // D-06 — retrofit fires when frontmatter has lc-slug.
  it.skip('D-06: fires retrofit when frontmatter has lc-slug (TODO(05.2-04): export handleFileOpenForStarterCode from main.ts)', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      handleFileOpenForStarterCode?: (plugin: unknown, file: unknown) => Promise<void>;
    };
    if (typeof mod.handleFileOpenForStarterCode !== 'function') {
      throw new Error('handleFileOpenForStarterCode not exported — 05.2-04 must extract it');
    }

    const file = { path: 'LeetCode/1-two-sum.md' };
    const plugin = {
      app: {
        metadataCache: {
          getFileCache: (_f: unknown) => ({ frontmatter: { 'lc-slug': 'two-sum' } }),
        },
        vault: {
          process: vi.fn(async () => undefined),
        },
      },
      settings: {
        getDefaultLanguage: () => 'python3',
        getProblemDetail: (_slug: string) => null,
      },
    };

    await mod.handleFileOpenForStarterCode(plugin, file);
    expect(hoisted.retrofitSpy).toHaveBeenCalledTimes(1);
  });

  // D-06 — skip path when lc-slug missing.
  it.skip('D-06: no-op when frontmatter has no lc-slug (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      handleFileOpenForStarterCode?: (plugin: unknown, file: unknown) => Promise<void>;
    };
    if (typeof mod.handleFileOpenForStarterCode !== 'function') {
      throw new Error('handleFileOpenForStarterCode not exported — 05.2-04 must extract it');
    }

    const file = { path: 'Notes/random.md' };
    const plugin = {
      app: {
        metadataCache: {
          getFileCache: (_f: unknown) => ({ frontmatter: {} }),
        },
      },
      settings: {
        getDefaultLanguage: () => 'python3',
        getProblemDetail: (_slug: string) => null,
      },
    };

    await mod.handleFileOpenForStarterCode(plugin, file);
    expect(hoisted.retrofitSpy).not.toHaveBeenCalled();
  });

  // D-06 / D-09 — swallows retrofit errors silently.
  it.skip('D-06: swallows retrofit errors silently (no throw) (TODO(05.2-04))', async () => {
    const mod = (await import('../../src/main')) as unknown as {
      handleFileOpenForStarterCode?: (plugin: unknown, file: unknown) => Promise<void>;
    };
    if (typeof mod.handleFileOpenForStarterCode !== 'function') {
      throw new Error('handleFileOpenForStarterCode not exported — 05.2-04 must extract it');
    }

    hoisted.retrofitSpy.mockRejectedValueOnce(new Error('vault write failed'));
    const file = { path: 'LeetCode/1-two-sum.md' };
    const plugin = {
      app: {
        metadataCache: {
          getFileCache: (_f: unknown) => ({ frontmatter: { 'lc-slug': 'two-sum' } }),
        },
        vault: { process: vi.fn() },
      },
      settings: {
        getDefaultLanguage: () => 'python3',
        getProblemDetail: (_slug: string) => null,
      },
    };

    await expect(mod.handleFileOpenForStarterCode(plugin, file)).resolves.toBeUndefined();
  });

  // D-06 — end-to-end wiring: workspace.on('file-open') + fireFileOpen helper.
  // Relies on Task 1's obsidian-stub extension. Included here as the
  // forward-looking smoke test that the `file-open` hook is registered by
  // onload().
  it.skip('D-06: workspace.on(file-open) registered by onload — fireFileOpen reaches handler (TODO(05.2-04): register in main.ts onload())', async () => {
    // When 05.2-04 wires the hook, `fireFileOpen(workspace, file)` should
    // ultimately call retrofitSpy. We assert the end-to-end by driving the
    // workspace stub directly. Wave 1 plan owns the wiring code.
    const { Workspace } = await import('../helpers/obsidian-stub');
    const ws = new Workspace();
    // Placeholder: the real plugin onload would register here.
    let invoked = false;
    ws.on('file-open', () => {
      invoked = true;
    });
    fireFileOpen(ws, null);
    expect(invoked).toBe(true);
  });
});
