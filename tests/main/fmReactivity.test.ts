// Phase 17 Plan 04 — Unit tests for the external `lc-language` frontmatter
// reactivity listener (D-13 / D-14, Wave 2).
//
// Strategy mirrors `tests/main/switchFenceLanguage.test.ts`: the listener
// body is extracted into a thin private helper
// `handleFmChangeForLanguageReactivity` on the LeetCodePlugin class so it can
// be unit-tested without spinning up a full plugin (registerEvent +
// metadataCache wiring is left to the production `onload` integration). Each
// test invokes the helper directly with a fake plugin context (via
// `helper.call(fakePlugin, file, cache)`) and asserts the resulting
// `childView.dispatch` shape.
//
// Coverage targets (Plan 17-04 Task 1 acceptance criteria):
//   1. external lc-language change dispatches Compartment.reconfigure on child
//   2. fm change to same slug — no dispatch (Pitfall 3 dedupe via Gate 3)
//   3. note without lc-slug — no dispatch (Gate 1)
//   4. file not in registry — no dispatch (Gate 2)
//   5. listener does NOT call vault.process or processFrontMatter (D-14 guard,
//      exhaustive across all four scenarios above)
//   6. dispatch has no userEvent annotation AND no `changes:` payload —
//      effect-only path (CLAUDE.md §Conventions guard against future regression)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mocks (must be declared before SUT import per vitest hoisting model).
// We mock the language builder so the test can verify what slug is forwarded
// without bringing the full @codemirror module graph into scope.
// ─────────────────────────────────────────────────────────────────────────

vi.mock('../../src/main/childEditorLanguage', () => {
  return {
    languageCompartment: {
      reconfigure: vi.fn().mockReturnValue('mock-fm-reconfigure-effect'),
    },
    buildLanguageExtensions: vi.fn().mockReturnValue('mock-fm-extensions-array'),
  };
});

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  languageCompartment,
  buildLanguageExtensions,
} from '../../src/main/childEditorLanguage';

// Importing LeetCodePlugin pulls the entire src/main.ts graph — same approach
// as switchFenceLanguage.test.ts. Transitive imports resolve via the obsidian
// alias (vitest.config.ts) and CM6 packages already in node_modules.
import LeetCodePlugin from '../../src/main';

// ─────────────────────────────────────────────────────────────────────────
// Fake plugin context — exposes only the fields the helper touches.
// ─────────────────────────────────────────────────────────────────────────

interface FakeFile {
  path: string;
}

interface FakePluginShape {
  childEditorRegistry: { get: ReturnType<typeof vi.fn> };
  settings: { getIndentSizeOverride: ReturnType<typeof vi.fn> };
  app: {
    workspace: { getActiveViewOfType: ReturnType<typeof vi.fn> };
    vault: { process: ReturnType<typeof vi.fn> };
    fileManager: { processFrontMatter: ReturnType<typeof vi.fn> };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
}

function makeFakePlugin(opts: {
  childView?: { dispatch: ReturnType<typeof vi.fn> } | undefined;
  /** The slug currently applied in the parent fence opener (D-13 Gate 3). */
  activeFenceSlug?: string;
  override?: 'auto' | 2 | 4 | 8;
}): FakePluginShape {
  const childView = opts.childView;
  // We stand up a minimal active MarkdownView whose CM6 state.doc reports a
  // single line containing the opener for the configured `activeFenceSlug`.
  // The helper consults `readActiveFenceSlug(file)` which (per impl) falls
  // through to checking the active view's parent CM6. For the unit-test,
  // we shortcut by stubbing `getActiveViewOfType` to return undefined and
  // expose the active-fence slug via the metadataCache fallback path.
  return {
    childEditorRegistry: {
      get: vi.fn().mockReturnValue(childView),
    },
    settings: {
      getIndentSizeOverride: vi.fn().mockReturnValue(opts.override ?? 'auto'),
    },
    app: {
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(undefined),
      },
      vault: {
        process: vi.fn(),
      },
      fileManager: {
        processFrontMatter: vi.fn(),
      },
      metadataCache: {
        // Some impls re-read frontmatter to derive the active fence slug.
        // Return a synthetic cache reflecting the configured fence slug so
        // the helper can perform Gate 3 dedupe correctly.
        getFileCache: vi.fn().mockReturnValue({
          frontmatter: opts.activeFenceSlug
            ? { 'lc-slug': 'two-sum', 'lc-language': opts.activeFenceSlug }
            : { 'lc-slug': 'two-sum' },
        }),
      },
    },
  };
}

// Pull the helper off the prototype — same indirection as switchFenceLanguage.
// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional; bound via .call
const helper = (LeetCodePlugin.prototype as unknown as {
  handleFmChangeForLanguageReactivity(
    file: FakeFile,
    cache: { frontmatter?: Record<string, unknown> } | null | undefined,
  ): void;
}).handleFmChangeForLanguageReactivity;

describe('handleFmChangeForLanguageReactivity (D-13 / D-14, Wave 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 1 — happy path: external lc-language change dispatches reconfigure
  // ───────────────────────────────────────────────────────────────────────
  it('external lc-language change dispatches Compartment.reconfigure on child', () => {
    const dispatchMock = vi.fn();
    // Parent fence currently says `java`; fm now says `python` → mismatch.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    // Effect-only dispatch — assert the spec carries a reconfigure effect.
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.anything(),
      }),
    );
    // languageCompartment.reconfigure(buildLanguageExtensions(...)) chain
    expect(buildLanguageExtensions).toHaveBeenCalledWith('python', 'auto');
    expect(languageCompartment.reconfigure).toHaveBeenCalledWith(
      'mock-fm-extensions-array',
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 2 — Pitfall 3: fm change to same slug does NOT dispatch
  // ───────────────────────────────────────────────────────────────────────
  it('fm change to same slug — no dispatch (Pitfall 3 dedupe via Gate 3)', () => {
    const dispatchMock = vi.fn();
    // Parent fence says `python`; fm `python` → already in sync, Gate 3 trips.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'python',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 3 — Gate 1: note without lc-slug — no dispatch
  // ───────────────────────────────────────────────────────────────────────
  it('note without lc-slug — no dispatch (Gate 1)', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'random.md' };
    // No `lc-slug` in cache → not a LeetCode note.
    const cache = {
      frontmatter: { 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 4 — Gate 2: file not in registry — no dispatch
  // ───────────────────────────────────────────────────────────────────────
  it('file not in registry — no dispatch (Gate 2)', () => {
    // No childView wired into registry → registry.get returns undefined.
    const fake = makeFakePlugin({
      childView: undefined,
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    // Registry was consulted (Gate 2) but no dispatch fired.
    expect(fake.childEditorRegistry.get).toHaveBeenCalledWith(
      'LeetCode/1-two-sum.md',
    );
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 5 — D-14: listener never calls vault.process or processFrontMatter.
  // Exhaustive across all four scenarios — frontmatter is SoT in passive
  // listener mode; the fence opener tag is NOT rewritten.
  // ───────────────────────────────────────────────────────────────────────
  it('D-14 — listener does NOT call vault.process or processFrontMatter (exhaustive)', () => {
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    // Scenario A: happy path
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario B: same-slug dedupe
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'python',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario C: missing lc-slug
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario D: not in registry
    {
      const fake = makeFakePlugin({
        childView: undefined,
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 6 — D-13 dispatch carries no `userEvent` annotation AND no
  // `changes:` payload (effect-only path). Effect-only dispatches (no
  // changes: payload) are not subject to the section-lock changeFilter per
  // CLAUDE.md §Conventions — this assertion guards that no changes payload
  // was accidentally added.
  // ───────────────────────────────────────────────────────────────────────
  it('D-13 dispatch is effect-only — no userEvent, no changes payload', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const dispatchSpec = dispatchMock.mock.calls[0]![0] as Record<string, unknown>;
    // Effect-only dispatches (no changes: payload) are not subject to the
    // section-lock changeFilter per CLAUDE.md §Conventions — this assertion
    // guards that no changes payload was accidentally added.
    expect(dispatchSpec.changes).toBeUndefined();
    expect(dispatchSpec.userEvent).toBeUndefined();
    // Effects key MUST be present (the whole point of the dispatch).
    expect(dispatchSpec.effects).toBeDefined();
  });
});
