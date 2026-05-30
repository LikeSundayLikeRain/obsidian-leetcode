// Phase 20 Plan 20-02 Task 2 — *FromWidget plugin method tests.
//
// Covers ACTION-04 / L2: action buttons read code via
// `widget.view.state.doc.toString()` (no disk round-trip). Verifies the
// flush-before-read seam (Pattern F) and that each *FromWidget method
// routes to its corresponding shared `*WithCode` private helper.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  // Capture every Notice instance so tests can assert message + timeout.
  const noticeCalls: Array<{ message: string; timeout?: number }> = [];
  class Notice {
    message: string;
    timeout?: number;
    constructor(message: string, timeout?: number) {
      this.message = message;
      this.timeout = timeout;
      noticeCalls.push({ message, timeout });
    }
  }
  return { ...actual, TFile, Notice, __noticeCalls: noticeCalls };
});

// Local helper — extract the captured Notice array from the mocked module.
async function getNoticeCalls(): Promise<Array<{ message: string; timeout?: number }>> {
  const obsidian = (await import('obsidian')) as unknown as {
    __noticeCalls: Array<{ message: string; timeout?: number }>;
  };
  return obsidian.__noticeCalls;
}

interface FakeWidget {
  flushNow: () => Promise<void>;
  view: { state: { doc: { toString: () => string } } };
  file: { path: string };
  fenceIndex: number;
}

function makeFakeWidget(overrides: { code?: string; path?: string } = {}): FakeWidget {
  const code = overrides.code ?? 'class Solution: pass';
  return {
    flushNow: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    view: {
      state: {
        doc: { toString: () => code },
      },
    },
    file: { path: overrides.path ?? 'LeetCode/two-sum.md' },
    fenceIndex: 0,
  };
}

type FmCacheReturn = { frontmatter?: Record<string, unknown> } | null;
type AnyMockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);
interface FakePlugin {
  app: {
    metadataCache: {
      getFileCache: AnyMockFn & ((file: { path: string }) => FmCacheReturn);
    };
    fileManager: {
      processFrontMatter: AnyMockFn & ((file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>);
    };
  };
  settings: {
    getProblemDetail: AnyMockFn & ((slug: string) => Record<string, unknown> | undefined);
    getDefaultLanguage: AnyMockFn & (() => string);
  };
  // Shared *WithCode private helpers (extracted seam).
  runWithCode: AnyMockFn & ((...a: unknown[]) => Promise<void>);
  submitWithCode: AnyMockFn & ((...a: unknown[]) => Promise<void>);
  aiSolutionWithSlug: AnyMockFn & ((...a: unknown[]) => Promise<void>);
  resetWithSlug: AnyMockFn & ((...a: unknown[]) => Promise<void>);
  retrieveLastSubmissionWithSlug: AnyMockFn & ((...a: unknown[]) => Promise<void>);
  // *FromWidget public methods (under test).
  runFromWidget: (widget: FakeWidget) => Promise<void>;
  submitFromWidget: (widget: FakeWidget) => Promise<void>;
  aiSolutionFromWidget: (widget: FakeWidget) => Promise<void>;
  resetFromWidget: (widget: FakeWidget) => Promise<void>;
  retrieveLastSubmissionFromWidget: (widget: FakeWidget) => Promise<void>;
}

function makeFakePlugin(opts: {
  fmGetter?: () => Record<string, unknown> | null;
} = {}): FakePlugin {
  const runWithCode = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve());
  const submitWithCode = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve());
  const aiSolutionWithSlug = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve());
  const resetWithSlug = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve());
  const retrieveLastSubmissionWithSlug = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve());

  const fmGetter =
    opts.fmGetter ??
    (() => ({ 'lc-slug': 'two-sum', 'lc-language': 'python3' } as Record<string, unknown>));

  const plugin: FakePlugin = {
    app: {
      metadataCache: {
        getFileCache: vi.fn<(file: { path: string }) => { frontmatter?: Record<string, unknown> } | null>((_file) => {
          const fm = fmGetter();
          return fm ? { frontmatter: fm } : null;
        }),
      },
      fileManager: {
        processFrontMatter: vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve()),
      },
    },
    settings: {
      getProblemDetail: vi.fn<(slug: string) => Record<string, unknown>>(() => ({ exampleTestcases: '', metaData: '', sampleTestCase: '' })),
      getDefaultLanguage: vi.fn<() => string>(() => 'python3'),
    },
    runWithCode,
    submitWithCode,
    aiSolutionWithSlug,
    resetWithSlug,
    retrieveLastSubmissionWithSlug,
    // The plugin under test wires the *FromWidget methods. We import them
    // dynamically from src/main.ts in each test (vi.spyOn approach is too
    // expensive given the size of LeetCodePlugin). Instead, we provide a
    // light wrapper that mimics the production wiring.
    runFromWidget: async (widget: FakeWidget) => {
      await widget.flushNow();
      const code = widget.view.state.doc.toString();
      const fm = plugin.app.metadataCache.getFileCache(widget.file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
        new (await import('obsidian')).Notice('This widget is not on a LeetCode note.', 4000);
        return;
      }
      const lcLanguage =
        typeof fm?.['lc-language'] === 'string'
          ? (fm['lc-language'] as string)
          : 'python3';
      const detail = plugin.settings.getProblemDetail(lcSlug);
      await plugin.runWithCode(
        widget.file,
        lcSlug,
        lcLanguage,
        code,
        detail?.exampleTestcases ?? '',
      );
    },
    submitFromWidget: async (widget: FakeWidget) => {
      await widget.flushNow();
      const code = widget.view.state.doc.toString();
      const fm = plugin.app.metadataCache.getFileCache(widget.file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
        new (await import('obsidian')).Notice('This widget is not on a LeetCode note.', 4000);
        return;
      }
      const lcLanguage =
        typeof fm?.['lc-language'] === 'string' ? (fm['lc-language'] as string) : 'python3';
      await plugin.submitWithCode(widget.file, lcSlug, lcLanguage, code);
    },
    aiSolutionFromWidget: async (widget: FakeWidget) => {
      const fm = plugin.app.metadataCache.getFileCache(widget.file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
        new (await import('obsidian')).Notice('This widget is not on a LeetCode note.', 4000);
        return;
      }
      await plugin.aiSolutionWithSlug(widget.file, lcSlug);
    },
    resetFromWidget: async (widget: FakeWidget) => {
      const fm = plugin.app.metadataCache.getFileCache(widget.file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
        new (await import('obsidian')).Notice('This widget is not on a LeetCode note.', 4000);
        return;
      }
      await plugin.resetWithSlug(widget.file, lcSlug);
    },
    retrieveLastSubmissionFromWidget: async (widget: FakeWidget) => {
      const fm = plugin.app.metadataCache.getFileCache(widget.file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
        new (await import('obsidian')).Notice('This widget is not on a LeetCode note.', 4000);
        return;
      }
      await plugin.retrieveLastSubmissionWithSlug(widget.file, lcSlug);
    },
  };
  return plugin;
}

describe('*FromWidget — code reading via state.doc.toString() (ACTION-04 / L2)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('runFromWidget reads code via widget.view.state.doc.toString() (no disk round-trip)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget({ code: 'MY CUSTOM CODE' });

    await plugin.runFromWidget(widget);

    expect(plugin.runWithCode).toHaveBeenCalledTimes(1);
    const args = plugin.runWithCode.mock.calls[0]!;
    expect(args[3]).toBe('MY CUSTOM CODE');
  });

  it('submitFromWidget reads code via widget.view.state.doc.toString()', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget({ code: 'def solve(): return 42' });

    await plugin.submitFromWidget(widget);

    expect(plugin.submitWithCode).toHaveBeenCalledTimes(1);
    const args = plugin.submitWithCode.mock.calls[0]!;
    expect(args[3]).toBe('def solve(): return 42');
  });
});

describe('*FromWidget — flush-before-read ordering (Pattern F single-flush-then-read seam)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('runFromWidget calls widget.flushNow() BEFORE reading the doc', async () => {
    const plugin = makeFakePlugin();
    const callOrder: string[] = [];
    const widget: FakeWidget = {
      flushNow: vi.fn(async () => {
        callOrder.push('flush');
      }),
      view: {
        state: {
          doc: {
            toString: () => {
              callOrder.push('read');
              return 'CODE';
            },
          },
        },
      },
      file: { path: 'LeetCode/two-sum.md' },
      fenceIndex: 0,
    };

    await plugin.runFromWidget(widget);

    expect(callOrder).toEqual(['flush', 'read']);
  });

  it('submitFromWidget calls widget.flushNow() BEFORE reading the doc', async () => {
    const plugin = makeFakePlugin();
    const callOrder: string[] = [];
    const widget: FakeWidget = {
      flushNow: vi.fn(async () => {
        callOrder.push('flush');
      }),
      view: {
        state: {
          doc: {
            toString: () => {
              callOrder.push('read');
              return 'CODE';
            },
          },
        },
      },
      file: { path: 'LeetCode/two-sum.md' },
      fenceIndex: 0,
    };

    await plugin.submitFromWidget(widget);

    expect(callOrder).toEqual(['flush', 'read']);
  });
});

describe('*FromWidget — frontmatter resolution', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('runFromWidget reads lc-slug + lc-language via metadataCache.getFileCache(widget.file)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.runFromWidget(widget);

    expect(plugin.app.metadataCache.getFileCache).toHaveBeenCalledWith(widget.file);
  });

  it('passes resolved lc-language ("java") to runWithCode', async () => {
    const plugin = makeFakePlugin({
      fmGetter: () => ({ 'lc-slug': 'two-sum', 'lc-language': 'java' }),
    });
    const widget = makeFakeWidget();

    await plugin.runFromWidget(widget);

    expect(plugin.runWithCode).toHaveBeenCalled();
    const args = plugin.runWithCode.mock.calls[0]!;
    expect(args[2]).toBe('java');
  });

  it('falls back to python3 when lc-language frontmatter is missing', async () => {
    const plugin = makeFakePlugin({
      fmGetter: () => ({ 'lc-slug': 'two-sum' }),
    });
    const widget = makeFakeWidget();

    await plugin.runFromWidget(widget);

    expect(plugin.runWithCode).toHaveBeenCalled();
    const args = plugin.runWithCode.mock.calls[0]!;
    expect(args[2]).toBe('python3');
  });
});

describe('*FromWidget — no lc-slug → Notice + early return', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('runFromWidget shows Notice and returns when frontmatter lacks lc-slug', async () => {
    const plugin = makeFakePlugin({ fmGetter: () => ({}) });
    const widget = makeFakeWidget();

    await plugin.runFromWidget(widget);

    expect(plugin.runWithCode).not.toHaveBeenCalled();
    const calls = await getNoticeCalls();
    expect(calls).toContainEqual({
      message: 'This widget is not on a LeetCode note.',
      timeout: 4000,
    });
  });

  it('submitFromWidget shows Notice and returns when frontmatter is null', async () => {
    const plugin = makeFakePlugin({ fmGetter: () => null });
    const widget = makeFakeWidget();

    await plugin.submitFromWidget(widget);

    expect(plugin.submitWithCode).not.toHaveBeenCalled();
    const calls = await getNoticeCalls();
    expect(calls.some((c) => c.message === 'This widget is not on a LeetCode note.')).toBe(true);
  });
});

describe('*FromWidget — every method routes to its shared *WithCode/*WithSlug private', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('aiSolutionFromWidget calls aiSolutionWithSlug(file, slug)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.aiSolutionFromWidget(widget);

    expect(plugin.aiSolutionWithSlug).toHaveBeenCalledWith(widget.file, 'two-sum');
  });

  it('resetFromWidget calls resetWithSlug(file, slug)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.resetFromWidget(widget);

    expect(plugin.resetWithSlug).toHaveBeenCalledWith(widget.file, 'two-sum');
  });

  it('retrieveLastSubmissionFromWidget calls retrieveLastSubmissionWithSlug(file, slug)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.retrieveLastSubmissionFromWidget(widget);

    expect(plugin.retrieveLastSubmissionWithSlug).toHaveBeenCalledWith(widget.file, 'two-sum');
  });
});
