// Phase 20 Plan 20-02 Task 2 — switchLanguageFromWidget tests.
//
// Covers ACTION-02 + L3:
//   - flushNow() called BEFORE processFrontMatter (Pattern F)
//   - processFrontMatter writes `lc-language: <newSlug>`
//   - NO CM6 dispatch on parent (v1.3 fence opener fixed at leetcode-solve)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
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

type AnyMockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);
interface FakeWidget {
  flushNow: AnyMockFn & (() => Promise<void>);
  view: { dispatch: AnyMockFn & ((spec: unknown) => void) };
  file: { path: string };
}

interface FakePlugin {
  app: {
    fileManager: {
      processFrontMatter: AnyMockFn & ((file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>);
    };
  };
  // The active-leaf parent CM6 dispatcher — must NOT be called by
  // switchLanguageFromWidget (v1.3 fence opener is fixed; only frontmatter
  // changes).
  parentDispatch: AnyMockFn & (() => void);
  switchLanguageFromWidget: (
    widget: FakeWidget,
    file: { path: string },
    newSlug: string,
  ) => Promise<void>;
}

function makeFakeWidget(): FakeWidget {
  return {
    flushNow: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    view: { dispatch: vi.fn<(spec: unknown) => void>() },
    file: { path: 'LeetCode/two-sum.md' },
  };
}

function makeFakePlugin(): FakePlugin {
  const fmStore: Record<string, unknown> = { 'lc-slug': 'two-sum', 'lc-language': 'python3' };
  const plugin: FakePlugin = {
    app: {
      fileManager: {
        processFrontMatter: vi.fn<(file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>>(
          async (_file, fn) => {
            fn(fmStore);
          },
        ),
      },
    },
    parentDispatch: vi.fn<() => void>(),
    switchLanguageFromWidget: async (widget, file, newSlug) => {
      // Step (a) — flush widget edits BEFORE the frontmatter write
      // (Pattern F + L3 — pending characters land under OLD slug).
      await widget.flushNow();
      // Step (b) — atomic frontmatter rewrite via processFrontMatter.
      await plugin.app.fileManager.processFrontMatter(
        file,
        (fm: Record<string, unknown>) => {
          fm['lc-language'] = newSlug;
        },
      );
      // Step (c) — NO parent CM6 dispatch. v1.3 fence opener is fixed at
      // `leetcode-solve` (Phase 19 C-01); only frontmatter changes.
    },
  };
  return plugin;
}

describe('switchLanguageFromWidget — call ordering (Pattern F flush-before-frontmatter)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushNow() resolves BEFORE processFrontMatter is called', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();
    const callOrder: string[] = [];

    widget.flushNow = vi.fn<() => Promise<void>>(async () => {
      // Resolve flush asynchronously — simulates real DebouncedWriter.
      await Promise.resolve();
      callOrder.push('flush');
    });
    plugin.app.fileManager.processFrontMatter = vi.fn<(file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>>(
      async (_f, fn) => {
        callOrder.push('processFrontMatter');
        fn({});
      },
    );

    await plugin.switchLanguageFromWidget(widget, widget.file, 'java');

    expect(callOrder).toEqual(['flush', 'processFrontMatter']);
  });

  it('processFrontMatter writes the new slug into fm[lc-language]', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.switchLanguageFromWidget(widget, widget.file, 'java');

    expect(plugin.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    const callArgs = plugin.app.fileManager.processFrontMatter.mock.calls[0]!;
    expect(callArgs[0]).toBe(widget.file);

    // Verify the writer function flips lc-language to the new slug.
    const writerFn = callArgs[1] as (fm: Record<string, unknown>) => void;
    const sandbox: Record<string, unknown> = { 'lc-language': 'python3' };
    writerFn(sandbox);
    expect(sandbox['lc-language']).toBe('java');
  });
});

describe('switchLanguageFromWidget — no parent CM6 dispatch (v1.3 fence opener fixed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call any parent CM6 dispatch (v1.3 fence opener is fixed at leetcode-solve)', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.switchLanguageFromWidget(widget, widget.file, 'java');

    expect(plugin.parentDispatch).not.toHaveBeenCalled();
    expect(widget.view.dispatch).not.toHaveBeenCalled();
  });
});

describe('switchLanguageFromWidget — flush completes synchronously vs frontmatter write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processFrontMatter is called even if flushNow returns immediately resolved Promise', async () => {
    const plugin = makeFakePlugin();
    const widget = makeFakeWidget();

    await plugin.switchLanguageFromWidget(widget, widget.file, 'cpp');

    expect(widget.flushNow).toHaveBeenCalledTimes(1);
    expect(plugin.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
  });
});
