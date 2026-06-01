// tests/main/switchLanguageFromWidget.test.ts
//
// Phase 20 Plan 20-10 (gap-closure T3 — language switch silent regression).
//
// Per .planning/debug/widget-plugin-handoff-cluster.md, the v1.3 widget's
// chevron click hits switchLanguageFromWidget which (post-Plan 20-09) used to:
//   1. Look up the active MarkdownView via getActiveViewOfType (silent-bail
//      on multi-pane / popout / non-active-pane / Reading-mode chevron clicks).
//   2. Dispatch the new starter into the PARENT CM6 — but per 20-09
//      post-mortem the WIDGET (registered child editor) owns the canonical
//      body. Parent dispatch + parking lot adoption produce inconsistent
//      visible state; chevron + parser don't update.
//
// Plan 20-10 Task 4 rewrites the function to:
//   - Dispatch via childEditorRegistry.get(file.path) PRIMARY target
//     (canonical write-path per CLAUDE.md §Conventions Phase 17 D-05).
//   - Fall back to widget.view only when the registry returns null (rare
//     embed-context race).
//   - REMOVE the parent-active-view guard (`view.file !== file`) that
//     silently bailed on multi-pane / popout scenarios.
//   - userEvent: 'leetcode.lang-switch' set defensively on the dispatch.
//
// The metadataCache 'changed' listener at WidgetController.ts:1126-1166
// continues to fire languageCompartment.reconfigure + actionRowRefresh
// after processFrontMatter writes lc-language; this test does NOT exercise
// that listener directly (it's owned by tests/widget/widgetActionRow.test.ts
// + tests/widget/languageReactivity.test.ts) — we only assert the
// frontmatter write fires so the listener can run downstream.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
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
  return { ...actual, Notice, __noticeCalls: noticeCalls };
});

// LeetCodePlugin import pulls the entire src/main.ts graph; the mocked
// 'obsidian' alias ensures Notice / TFile / MarkdownView / Plugin resolve
// without a real Obsidian runtime.
import LeetCodePlugin from '../../src/main';

async function getNoticeCalls(): Promise<Array<{ message: string; timeout?: number }>> {
  const obsidian = (await import('obsidian')) as unknown as {
    __noticeCalls: Array<{ message: string; timeout?: number }>;
  };
  return obsidian.__noticeCalls;
}

interface MockEditorView {
  state: { doc: { length: number; toString: () => string } };
  dispatch: ReturnType<typeof vi.fn>;
}

function makeMockView(initialDoc: string): MockEditorView {
  return {
    state: {
      doc: {
        length: initialDoc.length,
        toString: () => initialDoc,
      },
    },
    dispatch: vi.fn(),
  };
}

interface FakeWidget {
  flushNow: ReturnType<typeof vi.fn>;
  view: MockEditorView;
  file: { path: string };
  fenceIndex: number;
  actionRowRefresh: ReturnType<typeof vi.fn>;
}

function makeFakeWidget(opts: { code?: string; path?: string } = {}): FakeWidget {
  return {
    flushNow: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    view: makeMockView(opts.code ?? 'OLD_CODE'),
    file: { path: opts.path ?? 'LeetCode/two-sum.md' },
    fenceIndex: 0,
    actionRowRefresh: vi.fn(),
  };
}

// Helper: build a minimal `this` context for switchLanguageFromWidget that
// satisfies the function's structural needs (app.metadataCache, fileManager,
// childEditorRegistry, client.getProblemDetail).
interface FakeThis {
  app: {
    metadataCache: {
      getFileCache: ReturnType<typeof vi.fn>;
    };
    fileManager: {
      processFrontMatter: ReturnType<typeof vi.fn>;
    };
    workspace: {
      getActiveViewOfType: ReturnType<typeof vi.fn>;
    };
  };
  client: {
    getProblemDetail: ReturnType<typeof vi.fn>;
  };
  childEditorRegistry: {
    get: ReturnType<typeof vi.fn>;
  };
}

interface FakeOpts {
  fmGetter?: () => Record<string, unknown> | null;
  registryGetter?: (path: string) => MockEditorView | undefined;
  detail?: { codeSnippets?: Array<{ langSlug: string; code: string }> } | null;
  detailRejects?: boolean;
  // For Test 7 — multi-pane / popout — active view returns wrong file or null.
  activeViewOverride?: { file: { path: string } | null } | null;
}

function makeFakeThis(opts: FakeOpts = {}): FakeThis {
  const fmGetter =
    opts.fmGetter ??
    (() => ({
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
      'lc-title': 'Two Sum',
    }));
  return {
    app: {
      metadataCache: {
        getFileCache: vi.fn((file: unknown) => {
          void file;
          const fm = fmGetter();
          return fm ? { frontmatter: fm } : null;
        }),
      },
      fileManager: {
        processFrontMatter: vi.fn(
          async (
            _file: unknown,
            fn: (fm: Record<string, unknown>) => void,
          ) => {
            const fm: Record<string, unknown> = {};
            fn(fm);
          },
        ),
      },
      workspace: {
        getActiveViewOfType: vi.fn(() =>
          opts.activeViewOverride === undefined ? null : opts.activeViewOverride,
        ),
      },
    },
    client: {
      getProblemDetail: vi.fn(async (_slug: string) => {
        if (opts.detailRejects) {
          throw new Error('network failure');
        }
        return (
          opts.detail ?? {
            codeSnippets: [
              { langSlug: 'python3', code: 'class Solution: pass' },
              { langSlug: 'java', code: 'class Solution { /* JAVA */ }' },
              { langSlug: 'cpp', code: 'class Solution { /* CPP */ };' },
            ],
          }
        );
      }),
    },
    childEditorRegistry: {
      get: vi.fn((path: string) => opts.registryGetter?.(path) ?? undefined),
    },
  };
}

// The function under test — called via prototype.call so we don't have to
// construct a real LeetCodePlugin instance.
// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional; bound via .call
const switchFn = (LeetCodePlugin.prototype as unknown as {
  switchLanguageFromWidget(
    widget: unknown,
    file: unknown,
    newSlug: string,
  ): Promise<void>;
}).switchLanguageFromWidget;

describe('switchLanguageFromWidget — registered child as PRIMARY dispatch target (Plan 20-10 T3)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('Test 1: dispatches the new starter into the registered child view (NOT widget.view)', async () => {
    const widget = makeFakeWidget({ code: 'OLD_CODE' });
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      registryGetter: (path) =>
        path === widget.file.path ? registeredView : undefined,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    // Registered child receives the dispatch.
    expect(registeredView.dispatch).toHaveBeenCalledTimes(1);
    const call = registeredView.dispatch.mock.calls[0]![0] as {
      changes: { from: number; to: number; insert: string };
      userEvent: string;
    };
    expect(call.changes.from).toBe(0);
    expect(call.changes.to).toBe('OLD_CODE'.length);
    expect(call.changes.insert).toBe('class Solution { /* JAVA */ }');
    // widget.view's dispatch is NOT called when registry returns a child.
    expect(widget.view.dispatch).not.toHaveBeenCalled();
  });

  it('Test 2: processFrontMatter writes lc-language = newSlug atomically', async () => {
    const widget = makeFakeWidget();
    const registeredView = makeMockView('');
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(fake.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    const fnArg = fake.app.fileManager.processFrontMatter.mock
      .calls[0]![1] as (fm: Record<string, unknown>) => void;
    const fm: Record<string, unknown> = {};
    fnArg(fm);
    expect(fm['lc-language']).toBe('java');
  });

  it('Test 3: chevron-refresh path is observable (processFrontMatter called) — listener fires downstream', async () => {
    // The actual chevron refresh + Compartment.reconfigure happens inside
    // the metadataCache 'changed' listener at WidgetController.ts:1126-1166,
    // not inside switchLanguageFromWidget. We assert the precondition that
    // makes that listener fire: processFrontMatter writes lc-language. The
    // listener is unit-tested in tests/widget/languageReactivity.test.ts.
    const widget = makeFakeWidget();
    const registeredView = makeMockView('');
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(fake.app.fileManager.processFrontMatter).toHaveBeenCalled();
  });

  it('Test 4: client.getProblemDetail rejection → user-visible Notice + NO dispatch + NO frontmatter write', async () => {
    const widget = makeFakeWidget();
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
      detailRejects: true,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    const calls = await getNoticeCalls();
    expect(calls.some((c) => c.message.includes("Couldn't fetch starter code"))).toBe(true);
    expect(registeredView.dispatch).not.toHaveBeenCalled();
    expect(widget.view.dispatch).not.toHaveBeenCalled();
    expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });

  it('Test 5: codeSnippets missing requested langSlug → empty body dispatched + frontmatter still updates', async () => {
    const widget = makeFakeWidget({ code: 'OLD_CODE' });
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
      // Detail missing the 'rust' snippet.
      detail: { codeSnippets: [{ langSlug: 'python3', code: 'class S: pass' }] },
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'rust');

    expect(registeredView.dispatch).toHaveBeenCalledTimes(1);
    const call = registeredView.dispatch.mock.calls[0]![0] as {
      changes: { insert: string };
    };
    expect(call.changes.insert).toBe('');
    // Frontmatter still updates so the parser swap can run.
    expect(fake.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
  });

  it('Test 6: missing lc-slug frontmatter → silent no-op (no dispatch, no Notice)', async () => {
    const widget = makeFakeWidget();
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      fmGetter: () => ({ 'lc-language': 'python3' }),
      registryGetter: () => registeredView,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(registeredView.dispatch).not.toHaveBeenCalled();
    expect(widget.view.dispatch).not.toHaveBeenCalled();
    expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    const calls = await getNoticeCalls();
    expect(calls).toHaveLength(0);
  });

  it('Test 7: multi-pane / popout — active view = DIFFERENT file → dispatch STILL lands on registered child', async () => {
    // The new path does NOT consult getActiveViewOfType. Even when the
    // active view points at a different file (multi-pane scenario) or is
    // null (popout / non-MarkdownView focused leaf), the registry lookup
    // by file.path still finds the right child to dispatch on. Closes T3.
    const widget = makeFakeWidget();
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      registryGetter: (path) =>
        path === widget.file.path ? registeredView : undefined,
      activeViewOverride: { file: { path: 'LeetCode/some-other.md' } },
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(registeredView.dispatch).toHaveBeenCalledTimes(1);
    expect(fake.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
  });

  it('Test 7b: popout — active view = null → dispatch STILL lands on registered child', async () => {
    const widget = makeFakeWidget();
    const registeredView = makeMockView('OLD_CODE');
    const fake = makeFakeThis({
      registryGetter: (path) =>
        path === widget.file.path ? registeredView : undefined,
      activeViewOverride: null,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(registeredView.dispatch).toHaveBeenCalledTimes(1);
  });

  it('Test 8: dispatch shape — single transaction with userEvent leetcode.lang-switch', async () => {
    const widget = makeFakeWidget({ code: 'X' });
    const registeredView = makeMockView('X');
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    const call = registeredView.dispatch.mock.calls[0]![0] as {
      changes?: { from: number; to: number; insert: string };
      userEvent?: string;
    };
    expect(call.changes).toEqual({
      from: 0,
      to: 1,
      insert: 'class Solution { /* JAVA */ }',
    });
    expect(call.userEvent).toBe('leetcode.lang-switch');
  });

  it('Test 9 (registry-vs-widget.view discrimination): dispatch lands on registered child, NOT on widget.view, when they are distinct', async () => {
    const widget = makeFakeWidget({ code: 'WIDGET_DOC' });
    const registeredView = makeMockView('REGISTERED_DOC');
    // Sanity check — distinct objects.
    expect(registeredView).not.toBe(widget.view);
    const fake = makeFakeThis({
      registryGetter: () => registeredView,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(registeredView.dispatch).toHaveBeenCalledTimes(1);
    // The full-doc replace ranges 0..registered.doc.length — proves the
    // dispatch consulted the REGISTERED view's state.doc, not widget.view's.
    const call = registeredView.dispatch.mock.calls[0]![0] as {
      changes: { from: number; to: number };
    };
    expect(call.changes.to).toBe('REGISTERED_DOC'.length);
    expect(widget.view.dispatch).not.toHaveBeenCalled();
  });

  it('Test 10: fallback path — childEditorRegistry returns null → dispatch on widget.view with same userEvent', async () => {
    const widget = makeFakeWidget({ code: 'WIDGET_DOC' });
    const fake = makeFakeThis({
      registryGetter: () => undefined,
    });

    await switchFn.call(fake as unknown as object, widget, widget.file, 'java');

    expect(widget.view.dispatch).toHaveBeenCalledTimes(1);
    const call = widget.view.dispatch.mock.calls[0]![0] as {
      changes: { from: number; to: number; insert: string };
      userEvent: string;
    };
    expect(call.changes.from).toBe(0);
    expect(call.changes.to).toBe('WIDGET_DOC'.length);
    expect(call.changes.insert).toBe('class Solution { /* JAVA */ }');
    expect(call.userEvent).toBe('leetcode.lang-switch');
  });

  it('Test 11: post-rewrite — no parent-active-view guard remains in the function body', async () => {
    // Source-level invariant: switchLanguageFromWidget must not bail on
    // (view.file !== file) because that is the silent-bail anti-pattern at
    // the heart of T3. The new function uses the registry lookup which is
    // keyed on file.path — independent of which leaf is active.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    // Find the switchLanguageFromWidget function body and check it does
    // NOT bail on (view.file !== file). The pattern matches the previous
    // bail at line 2943 (`if (!view || view.file !== file) return;`).
    const start = src.indexOf('async switchLanguageFromWidget(');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('private async openAISolution(', start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).not.toMatch(/view\.file\s*!==\s*file/);
  });
});
