// tests/widget/languageSwitch.test.ts
//
// Failure B (Phase 22 follow-up) — switchLanguageFromWidget contract tests.
//
// Covers the 16-step algorithm documented in
// .planning/debug/language-switch-body-not-swapped.md and the design contract
// for restoring v1.2's body-swap-on-language-change UX inside v1.3's
// inline-widget architecture.
//
// IMPORTANT: these tests exercise the REAL production helper
// (`runLanguageSwitch` in src/main/runLanguageSwitch.ts) — the same code path
// that `LeetCodePlugin.switchLanguageFromWidget` delegates to. Every Obsidian
// and plugin-internal dependency is wired through fakes; the SUT itself is
// the production module. A regression in the algorithm (e.g., armed
// suppression after dispatch instead of before, forgot peer fan-out, wrong
// order of operations) WILL break these tests.
//
// Categories:
//   1. Pattern F (flush-before-fm) — preserved from v1.3's prior contract.
//   2. Same-slug short-circuit — no writes when fm['lc-language'] === newSlug.
//   3. Read-only / teardown defensive guard — fm-only path on read-only mounts.
//   4. Clean fence body+parser swap — combined atomic write fires.
//   5. Dirty branch — preserve user code; differentiated Notice copy.
//   6. Manual-paste-of-old-starter (hasEverBeenDirtySinceMount latch).
//   7. Race-window — typing during cache-miss network awaits flips to dirty.
//   8. IME composition deferral — switch deferred until compositionend; the
//      registered handler actually re-fires the body+fm write on compositionend.
//   9. Snippet unavailable / network failure — differentiated Notice copy.
//  10. Multi-pane fan-out — peers receive direct dispatch + acknowledge.

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

import { runLanguageSwitch, type LanguageSwitchDeps } from '../../src/main/runLanguageSwitch';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';
import type { WidgetController } from '../../src/widget/WidgetController';

type AnyMockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);

interface FakeWidget {
  flushNow: AnyMockFn;
  view: {
    dispatch: AnyMockFn;
    state: { doc: { length: number; toString(): string } };
    contentDOM?: { addEventListener: AnyMockFn };
  };
  file: { path: string };
  registryKey: string;
  readOnly: boolean;
  isEmbed: boolean;
  childDirty: boolean;
  hasEverBeenDirtySinceMount: boolean;
  isComposing: boolean;
  dispatchAuthoritativeBodySwap: AnyMockFn;
  acknowledgeAuthoritativeBody: AnyMockFn;
}

function makeFakeWidget(overrides: Partial<FakeWidget> = {}): FakeWidget {
  const base: FakeWidget = {
    flushNow: vi.fn(() => Promise.resolve()) as unknown as AnyMockFn,
    view: {
      dispatch: vi.fn() as unknown as AnyMockFn,
      state: { doc: { length: 0, toString: () => '' } },
      contentDOM: { addEventListener: vi.fn() as unknown as AnyMockFn },
    },
    file: { path: 'LeetCode/two-sum.md' },
    registryKey: 'LeetCode/two-sum.md::0::leaf-0',
    readOnly: false,
    isEmbed: false,
    childDirty: false,
    hasEverBeenDirtySinceMount: false,
    isComposing: false,
    dispatchAuthoritativeBodySwap: vi.fn() as unknown as AnyMockFn,
    acknowledgeAuthoritativeBody: vi.fn() as unknown as AnyMockFn,
  };
  return { ...base, ...overrides };
}

interface FakeApp {
  metadataCache: { getFileCache: AnyMockFn };
  fileManager: { processFrontMatter: AnyMockFn };
  vault: { read: AnyMockFn };
}

function makeFakeApp(opts: {
  fmAtEntry?: Record<string, unknown> | null;
  diskBody?: string;
}): FakeApp {
  const { fmAtEntry, diskBody } = opts;
  const fmStore: Record<string, unknown> = { ...(fmAtEntry ?? {}) };
  return {
    metadataCache: {
      getFileCache: vi.fn(() => (fmAtEntry ? { frontmatter: fmStore } : null)) as unknown as AnyMockFn,
    },
    fileManager: {
      processFrontMatter: vi.fn(async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => {
        fn(fmStore);
      }) as unknown as AnyMockFn,
    },
    vault: {
      read: vi.fn(async () => diskBody ?? '') as unknown as AnyMockFn,
    },
  };
}

interface DepsBundle {
  app: FakeApp;
  suppression: SelfWriteSuppression;
  notifyCalls: Array<{ msg: string; timeout: number }>;
  debugCalls: Array<{ msg: string; args: unknown[] }>;
  deps: LanguageSwitchDeps;
}

/**
 * Build a full LanguageSwitchDeps bundle wired to fakes. Production wiring
 * lives in `LeetCodePlugin.switchLanguageFromWidget`; this mirrors it for
 * test consumption.
 */
function makeDeps(opts: {
  app: FakeApp;
  settings: LanguageSwitchDeps['settings'];
  client: LanguageSwitchDeps['client'];
  peers?: FakeWidget[];
  /** Bytes the helper sees when it calls `extractFenceBodyFromFullNote` on
   *  whatever vault.read returns. Tests pin this directly so they don't have
   *  to construct a fence-shaped diskBody for every case. */
  fenceBody?: string;
}): DepsBundle {
  const suppression = new SelfWriteSuppression();
  const notifyCalls: Array<{ msg: string; timeout: number }> = [];
  const debugCalls: Array<{ msg: string; args: unknown[] }> = [];
  const peers = opts.peers ?? [];
  const deps: LanguageSwitchDeps = {
    app: opts.app as unknown as LanguageSwitchDeps['app'],
    settings: opts.settings,
    client: opts.client,
    suppression,
    iterateWidgets: () => peers as unknown as Iterable<WidgetController>,
    extractFenceBodyFromFullNote: () => opts.fenceBody ?? '',
    notify: (msg, timeout) => {
      notifyCalls.push({ msg, timeout });
    },
    logDebug: (msg, ...args) => {
      debugCalls.push({ msg, args });
    },
  };
  return { app: opts.app, suppression, notifyCalls, debugCalls, deps };
}

const STARTER_CACHE_FRESH = (snippets: Array<{ langSlug: string; code: string }>) => ({
  fetchedAt: Date.now(),
  codeSnippets: snippets.map((s) => ({ lang: s.langSlug, langSlug: s.langSlug, code: s.code })),
});

describe('runLanguageSwitch — Pattern F flush-before-fm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flushNow resolves BEFORE processFrontMatter is called', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const callOrder: string[] = [];

    widget.flushNow = vi.fn(async () => {
      await Promise.resolve();
      callOrder.push('flush');
    }) as unknown as AnyMockFn;
    app.fileManager.processFrontMatter = vi.fn(
      async (_f, fn: (fm: Record<string, unknown>) => void) => {
        callOrder.push('processFrontMatter');
        fn({});
      },
    ) as unknown as AnyMockFn;

    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD_BODY' },
        { langSlug: 'java', code: 'JAVA_BODY' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const client = { getProblemDetail: vi.fn() as unknown as AnyMockFn };

    const { deps } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: client as unknown as LanguageSwitchDeps['client'],
      fenceBody: 'OLD_BODY',
    });

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(callOrder[0]).toBe('flush');
    expect(callOrder).toContain('processFrontMatter');
  });
});

describe('runLanguageSwitch — same-slug short-circuit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns immediately without flushNow / processFrontMatter / dispatch', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    });
    const { deps } = makeDeps({
      app,
      settings: {
        getProblemDetail: vi.fn() as unknown as AnyMockFn,
        setProblemDetail: vi.fn() as unknown as AnyMockFn,
      } as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
    });
    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );
    expect(widget.flushNow).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
  });
});

describe('runLanguageSwitch — read-only defensive guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('read-only widget routes to fm-only (no flush, no dispatch)', async () => {
    const widget = makeFakeWidget({ readOnly: true });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { deps } = makeDeps({
      app,
      settings: {
        getProblemDetail: vi.fn() as unknown as AnyMockFn,
        setProblemDetail: vi.fn() as unknown as AnyMockFn,
      } as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
    });
    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );
    expect(widget.flushNow).not.toHaveBeenCalled();
    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
  });
});

describe('runLanguageSwitch — clean fence body+parser swap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clean widget triggers dispatchAuthoritativeBodySwap + suppression.arm + acknowledge', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'def hello(): pass' },
        { langSlug: 'java', code: 'class Solution {}' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const client = { getProblemDetail: vi.fn() as unknown as AnyMockFn };

    const armSpy = vi.fn();
    const { deps, suppression, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: client as unknown as LanguageSwitchDeps['client'],
      fenceBody: '',
    });
    // Spy on suppression.arm without replacing the suppression instance the
    // helper passes through to applyAuthoritativeBodyAndFrontmatter.
    const origArm = suppression.arm.bind(suppression);
    suppression.arm = ((path: string, hash: string, key?: string) => {
      armSpy(path, hash, key);
      origArm(path, hash, key);
    }) as typeof suppression.arm;

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(armSpy).toHaveBeenCalledTimes(1);
    expect(armSpy).toHaveBeenCalledWith(
      widget.file.path,
      expect.any(String),
      widget.registryKey,
    );
    expect(widget.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith(
      'class Solution {}',
      'java',
    );
    expect(widget.acknowledgeAuthoritativeBody).toHaveBeenCalledTimes(1);
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls).toHaveLength(0);
  });
});

describe('runLanguageSwitch — dirty branch preserves user code', () => {
  beforeEach(() => vi.clearAllMocks());

  it('childDirty=true preserves buffer, fires Notice with reset breadcrumb', async () => {
    const widget = makeFakeWidget({ childDirty: true });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\nuser typed\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD' },
        { langSlug: 'java', code: 'NEW' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const armSpy = vi.fn();
    const { deps, suppression, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
      fenceBody: 'user typed',
    });
    suppression.arm = ((..._args: unknown[]) => {
      armSpy(..._args);
    }) as typeof suppression.arm;

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(armSpy).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls.length).toBeGreaterThan(0);
    expect(notifyCalls[0]!.msg).toContain('Cmd-Shift-P');
    expect(notifyCalls[0]!.msg).toContain('Reset code');
  });
});

describe('runLanguageSwitch — manual-paste-of-old-starter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hasEverBeenDirtySinceMount=true + body bytes-equal oldStarter does NOT trigger silent swap', async () => {
    const widget = makeFakeWidget({
      childDirty: false,
      hasEverBeenDirtySinceMount: true,
    });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\nOLD\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD' },
        { langSlug: 'java', code: 'NEW' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const armSpy = vi.fn();
    const { deps, suppression, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
      fenceBody: 'OLD',
    });
    suppression.arm = ((..._args: unknown[]) => {
      armSpy(..._args);
    }) as typeof suppression.arm;

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(armSpy).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls.length).toBeGreaterThan(0);
  });
});

describe('runLanguageSwitch — race-window: typing during cache-miss network awaits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('childDirty becoming true during network await flips to dirty branch', async () => {
    const widget = makeFakeWidget({ childDirty: false, hasEverBeenDirtySinceMount: false });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    let networkResolve: (() => void) | null = null;
    const networkGate = new Promise<void>((r) => {
      networkResolve = r;
    });
    const client = {
      getProblemDetail: vi.fn(async () => {
        await networkGate;
        return {
          questionFrontendId: '1',
          titleSlug: 'two-sum',
          title: 'Two Sum',
          content: '<p/>',
          difficulty: 'Easy' as const,
          isPaidOnly: false,
          codeSnippets: [
            { lang: 'Python3', langSlug: 'python3', code: 'OLD' },
            { lang: 'Java', langSlug: 'java', code: 'NEW' },
          ],
        };
      }) as unknown as AnyMockFn,
    };
    const settings = {
      getProblemDetail: vi.fn(() => null) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const armSpy = vi.fn();
    const { deps, suppression, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: client as unknown as LanguageSwitchDeps['client'],
      fenceBody: '',
    });
    suppression.arm = ((..._args: unknown[]) => {
      armSpy(..._args);
    }) as typeof suppression.arm;

    const switchPromise = runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    // While the network is in-flight, simulate a docChange flipping the latch.
    widget.childDirty = true;
    widget.hasEverBeenDirtySinceMount = true;

    networkResolve!();
    await switchPromise;

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(armSpy).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls.length).toBeGreaterThan(0);
  });
});

describe('runLanguageSwitch — IME composition deferral', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isComposing=true defers the entire switch; no dispatch / fm during composition', async () => {
    const widget = makeFakeWidget({ isComposing: true });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { deps } = makeDeps({
      app,
      settings: {
        getProblemDetail: vi.fn() as unknown as AnyMockFn,
        setProblemDetail: vi.fn() as unknown as AnyMockFn,
      } as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
    });
    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    expect(widget.view.contentDOM!.addEventListener).toHaveBeenCalledWith(
      'compositionend',
      expect.any(Function),
      expect.objectContaining({ once: true }),
    );
  });

  // Issue #4 (2026-06-10) — extend the IME deferral coverage. The previous
  // assertion only checked that addEventListener was called; a regression
  // that registered the wrong handler (or never re-fired the switch) would
  // pass that test. Capture the handler from the addEventListener mock,
  // simulate compositionend (clear isComposing + invoke handler), and
  // assert that the deferred re-invocation drives dispatchAuthoritativeBody-
  // Swap + processFrontMatter end-to-end.
  it('compositionend handler re-fires the switch end-to-end', async () => {
    const widget = makeFakeWidget({ isComposing: true });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD' },
        { langSlug: 'java', code: 'NEW' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const { deps } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
      fenceBody: '',
    });

    // First call — composition active; handler is registered, switch defers.
    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.view.contentDOM!.addEventListener).toHaveBeenCalledTimes(1);
    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();

    // Capture the handler that was registered.
    const calls = (widget.view.contentDOM!.addEventListener as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls;
    const [eventName, handler] = calls[0]!;
    expect(eventName).toBe('compositionend');
    expect(typeof handler).toBe('function');

    // Simulate compositionend — clear the flag, fire the handler.
    // The production handler is `() => { void runLanguageSwitch(...) }` — it
    // returns void synchronously but kicks an async chain. We invoke it,
    // then poll until the deferred path's observable side effects land
    // (dispatchAuthoritativeBodySwap is the most reliable terminal signal).
    widget.isComposing = false;
    (handler as () => void)();
    const deadline = Date.now() + 1000;
    while (
      (widget.dispatchAuthoritativeBodySwap as unknown as { mock: { calls: unknown[] } })
        .mock.calls.length === 0 &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 0));
    }

    // The deferred path must drive the body+fm write.
    expect(widget.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith('NEW', 'java');
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(widget.acknowledgeAuthoritativeBody).toHaveBeenCalledTimes(1);
  });
});

describe('runLanguageSwitch — snippet unavailable / network failure differentiated Notice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('LC has no starter for newSlug (reason=unavailable) shows specific Notice and proceeds with fm-only', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    const settings = {
      // Cache has python3 but NOT java.
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const { deps, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
      fenceBody: '',
    });

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls.length).toBeGreaterThan(0);
    expect(notifyCalls[0]!.msg).toContain('LeetCode has no');
    expect(notifyCalls[0]!.msg).not.toContain('offline');
  });

  it('network failure with empty cache (reason=network) shows offline Notice and proceeds with fm-only', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => null) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const client = {
      getProblemDetail: vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as AnyMockFn,
    };
    const { deps, notifyCalls } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: client as unknown as LanguageSwitchDeps['client'],
      fenceBody: '',
    });

    await runLanguageSwitch(
      deps,
      widget as unknown as WidgetController,
      widget.file as never,
      'java',
    );

    expect(widget.dispatchAuthoritativeBodySwap).not.toHaveBeenCalled();
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notifyCalls.length).toBeGreaterThan(0);
    expect(notifyCalls[0]!.msg).toContain('offline');
    expect(notifyCalls[0]!.msg).toContain('try again when online');
  });
});

describe('runLanguageSwitch — multi-pane fan-out', () => {
  beforeEach(() => vi.clearAllMocks());

  it('peers receive direct dispatch + acknowledgeAuthoritativeBody (no reload-from-disk)', async () => {
    const originator = makeFakeWidget({
      registryKey: 'LeetCode/two-sum.md::0::leaf-0',
    });
    const peer = makeFakeWidget({
      registryKey: 'LeetCode/two-sum.md::0::leaf-1',
    });
    const app = makeFakeApp({
      fmAtEntry: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      diskBody: '## Code\n```leetcode-solve\n\n```\n',
    });
    const settings = {
      getProblemDetail: vi.fn(() => STARTER_CACHE_FRESH([
        { langSlug: 'python3', code: 'OLD' },
        { langSlug: 'java', code: 'NEW' },
      ])) as unknown as AnyMockFn,
      setProblemDetail: vi.fn() as unknown as AnyMockFn,
    };
    const armSpy = vi.fn();
    // iterateWidgets must yield both originator and peer (the helper filters
    // out the originator by registryKey).
    const { deps, suppression } = makeDeps({
      app,
      settings: settings as unknown as LanguageSwitchDeps['settings'],
      client: { getProblemDetail: vi.fn() } as unknown as LanguageSwitchDeps['client'],
      peers: [originator, peer],
      fenceBody: '',
    });
    const origArm = suppression.arm.bind(suppression);
    suppression.arm = ((path: string, hash: string, key?: string) => {
      armSpy(path, hash, key);
      origArm(path, hash, key);
    }) as typeof suppression.arm;

    await runLanguageSwitch(
      deps,
      originator as unknown as WidgetController,
      originator.file as never,
      'java',
    );

    expect(originator.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith('NEW', 'java');
    expect(peer.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith('NEW', 'java');
    expect(originator.acknowledgeAuthoritativeBody).toHaveBeenCalledTimes(1);
    expect(peer.acknowledgeAuthoritativeBody).toHaveBeenCalledTimes(1);
    expect(armSpy).toHaveBeenCalledTimes(1);
    expect(armSpy).toHaveBeenCalledWith(
      originator.file.path,
      expect.any(String),
      originator.registryKey,
    );
  });
});
