// Phase 16 Plan 04 — Unit tests for the child reconfigure dispatch path that
// extends `switchFenceLanguage` (LANG-01, D-12).
//
// Strategy (per 16-04-PLAN <action> option (b)): the dispatch logic is
// extracted into a thin private helper `dispatchChildLanguageReconfigure`
// on the LeetCodePlugin class so it can be unit-tested without spinning up
// the full plugin (network, vault, app workspace, metadataCache, CM6 parent).
// Each test invokes the helper directly with a fake plugin context and
// asserts the resulting `childView.dispatch` invocation shape.
//
// Coverage targets:
//   - dispatch fires when registry.get() returns an EditorView (>= 1 test)
//   - buildLanguageExtensions called with (newSlug, currentOverride)        (>= 1 test)
//   - silent no-op when registry.get() returns undefined                    (>= 1 test)
//   - try/catch swallows dispatch throws (child in teardown)                (>= 1 test)
//   - userEvent: 'leetcode.lang-switch' (CLAUDE.md convention)              (>= 1 test)
//   - effects-only — no `changes` field on the dispatch                     (>= 1 test)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mocks (must be declared before SUT import per vitest hoisting model).
// We mock the language builder so the test can verify which slug + override
// pair is forwarded into it without bringing the full @codemirror module
// graph into scope.
// ─────────────────────────────────────────────────────────────────────────

vi.mock('../../src/main/childEditorLanguage', () => {
  return {
    languageCompartment: {
      reconfigure: vi.fn().mockReturnValue('mock-reconfigure-effect'),
    },
    buildLanguageExtensions: vi.fn().mockReturnValue('mock-extensions-array'),
  };
});

import {
  languageCompartment,
  buildLanguageExtensions,
} from '../../src/main/childEditorLanguage';

// We import the helper directly off the LeetCodePlugin class. Importing
// `LeetCodePlugin` at module top level pulls the entire `src/main.ts` graph
// into vitest, which loads the obsidian stub correctly via the vitest alias.
// All transitive imports are either stubbed (obsidian alias) or external
// (CM6 packages already resolved in node_modules).
import LeetCodePlugin from '../../src/main';

// Helper: build a minimal fake "this" context that exposes only the fields
// the helper touches.
interface FakePlugin {
  childEditorRegistry: { get: ReturnType<typeof vi.fn> };
  settings: { getIndentSizeOverride: ReturnType<typeof vi.fn> };
}

function makeFakePlugin(opts: {
  childView?: { dispatch: ReturnType<typeof vi.fn> } | undefined;
  override?: 'auto' | 2 | 4 | 8;
}): FakePlugin {
  return {
    childEditorRegistry: {
      get: vi.fn().mockReturnValue(opts.childView),
    },
    settings: {
      getIndentSizeOverride: vi.fn().mockReturnValue(opts.override ?? 'auto'),
    },
  };
}

const helper = (
  LeetCodePlugin.prototype as unknown as {
    dispatchChildLanguageReconfigure(filePath: string, newSlug: string): void;
  }
).dispatchChildLanguageReconfigure;

describe('dispatchChildLanguageReconfigure (LANG-01, D-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches a Compartment.reconfigure effect on the child when registry returns a view', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({ childView: { dispatch: dispatchMock } });

    helper.call(fake as unknown as object, '/notes/two-sum.md', 'java');

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: 'mock-reconfigure-effect',
        userEvent: 'leetcode.lang-switch',
      }),
    );
  });

  it('passes newSlug + current indentSizeOverride to buildLanguageExtensions', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      override: 4,
    });

    helper.call(fake as unknown as object, '/notes/two-sum.md', 'java');

    expect(buildLanguageExtensions).toHaveBeenCalledTimes(1);
    expect(buildLanguageExtensions).toHaveBeenCalledWith('java', 4);
  });

  it('passes the freshly-read override on each call (not a cached value)', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      override: 'auto',
    });

    helper.call(fake as unknown as object, '/notes/two-sum.md', 'python3');
    fake.settings.getIndentSizeOverride.mockReturnValueOnce(2);
    helper.call(fake as unknown as object, '/notes/two-sum.md', 'javascript');

    expect(buildLanguageExtensions).toHaveBeenNthCalledWith(1, 'python3', 'auto');
    expect(buildLanguageExtensions).toHaveBeenNthCalledWith(2, 'javascript', 2);
  });

  it('is a silent no-op when registry returns undefined (no child editor)', () => {
    const fake = makeFakePlugin({ childView: undefined });

    expect(() => {
      helper.call(fake as unknown as object, '/notes/two-sum.md', 'rust');
    }).not.toThrow();

    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  it('catches dispatch errors silently (child in teardown)', () => {
    const dispatchMock = vi.fn().mockImplementation(() => {
      throw new Error('child editor in teardown');
    });
    const fake = makeFakePlugin({ childView: { dispatch: dispatchMock } });

    expect(() => {
      helper.call(fake as unknown as object, '/notes/two-sum.md', 'cpp');
    }).not.toThrow();

    // dispatch was attempted — confirms the try block ran
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('uses userEvent leetcode.lang-switch (CLAUDE.md convention)', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({ childView: { dispatch: dispatchMock } });

    helper.call(fake as unknown as object, '/notes/two-sum.md', 'golang');

    const arg = dispatchMock.mock.calls[0]?.[0] as
      | { userEvent?: string; effects?: unknown; changes?: unknown }
      | undefined;
    expect(arg?.userEvent).toBe('leetcode.lang-switch');
  });

  it('emits an effects-only transaction (no `changes` field — child sync skips it via docChanged guard)', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({ childView: { dispatch: dispatchMock } });

    helper.call(fake as unknown as object, '/notes/two-sum.md', 'typescript');

    const arg = dispatchMock.mock.calls[0]?.[0] as
      | { userEvent?: string; effects?: unknown; changes?: unknown; selection?: unknown }
      | undefined;
    expect(arg).toBeDefined();
    expect('changes' in (arg as object)).toBe(false);
    expect('selection' in (arg as object)).toBe(false);
    expect(arg?.effects).toBe('mock-reconfigure-effect');
  });

  it('looks up the child by the provided file path', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({ childView: { dispatch: dispatchMock } });

    helper.call(fake as unknown as object, '/some/other/path.md', 'java');

    expect(fake.childEditorRegistry.get).toHaveBeenCalledTimes(1);
    expect(fake.childEditorRegistry.get).toHaveBeenCalledWith('/some/other/path.md');
  });
});
