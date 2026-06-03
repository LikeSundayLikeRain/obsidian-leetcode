// tests/main/readingModeMigrationTrigger.test.ts
//
// Phase 21 Plan 21-05 Task 3 — Reading-mode integration test for the new
// workspace.on('file-open') trigger introduced by Task 2 (CR-01 closure)
// and the cross-mode dedupe Set hoisted in Task 1 (WR-01 closure).
//
// The handler is extracted into src/main/readingModeMigrationHook.ts so
// the test can drive it without instantiating a full Obsidian Plugin
// lifecycle. The factory accepts dependency-injected migrate +
// isMigrationCandidate + logDebug + migrateInFlight Set so each branch
// can be exercised in isolation.
//
// Coverage matrix (8 tests):
//   1. CR-01-fix HAPPY PATH — legacy v1.2 note + autoMigrateOnOpen=ON +
//      lc-slug → migrate called with autoMigrateOnOpen + defaultLanguage.
//   2. CR-01-fix MASTER GATE — useInlineWidget=OFF → no I/O.
//   3. CR-01-fix AUTO=OFF → vault.read + isMigrationCandidate; on
//      candidate, logger.debug fires; migrate NOT invoked.
//   4. CR-01-fix NON-LC NOTE — no lc-slug → no I/O.
//   5. NULL FILE — file=null short-circuit; no I/O, no throw.
//   6. WR-01-fix CROSS-MODE DEDUPE — pre-populating migrateInFlight with
//      the file path makes the hook short-circuit (Live Preview won the
//      race); clearing the entry then retriggering does invoke migrate.
//   7. CR-01-fix IDEMPOTENCY — already-migrated note: the orchestrator's
//      isMigrationCandidate returns false (clause 5 short-circuit), so
//      migrate returns false; no exception; migrateInFlight is empty
//      after the call (.finally clears).
//   8. registerEvent CLEANUP CONTRACT — hook is registered via
//      this.registerEvent(this.app.workspace.on(...)) (proxied via the
//      mock plugin's registerEvent spy).
//
// Tests run in <5s (pure mocks; no real I/O).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App, TFile } from 'obsidian';
import { MarkdownView } from 'obsidian';
import {
  makeReadingModeMigrationHandler,
  rerenderReadingModePanes,
} from '../../src/main/readingModeMigrationHook';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    parent: unknown = null;
    constructor(path: string) {
      this.path = path;
      const slash = path.lastIndexOf('/');
      this.name = slash >= 0 ? path.slice(slash + 1) : path;
      const dot = this.name.lastIndexOf('.');
      this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
      this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    }
  }
  return { ...actual, TFile };
});

interface FakeSettings {
  useInlineWidget: boolean;
  autoMigrateOnOpen: boolean;
  defaultLanguage: string;
}

interface FakeAppOpts {
  fmByPath: Record<string, Record<string, unknown> | null>;
  textByPath: Record<string, string>;
  vaultReadShouldThrow?: boolean;
}

function makeApp(opts: FakeAppOpts): App {
  const onFileOpen = vi.fn(); // captured registerer
  const handlerHolder: { handler?: (file: TFile | null) => void } = {};
  return {
    workspace: {
      on: vi.fn((evt: string, cb: (file: TFile | null) => void) => {
        if (evt === 'file-open') {
          handlerHolder.handler = cb;
          onFileOpen(cb);
        }
        return { __ref: true } as unknown;
      }),
      __getCapturedHandler: () => handlerHolder.handler,
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile | null) => {
        if (!file) return null;
        const fm = opts.fmByPath[file.path];
        return fm ? { frontmatter: fm } : null;
      }),
    },
    vault: {
      read: vi.fn(async (file: TFile) => {
        if (opts.vaultReadShouldThrow) {
          throw new Error('synthetic vault.read failure');
        }
        return opts.textByPath[file.path] ?? '';
      }),
    },
  } as unknown as App;
}

interface MockPluginShape {
  app: App;
  settings: {
    getUseInlineWidget(): boolean;
    getAutoMigrateOnOpen(): boolean;
    getDefaultLanguage(): string;
  };
  migrateInFlight: Set<string>;
  registerEvent: ReturnType<typeof vi.fn> & ((ref: unknown) => unknown);
}

function makeMockPlugin(app: App, settings: FakeSettings): MockPluginShape {
  return {
    app,
    settings: {
      getUseInlineWidget: () => settings.useInlineWidget,
      getAutoMigrateOnOpen: () => settings.autoMigrateOnOpen,
      getDefaultLanguage: () => settings.defaultLanguage,
    },
    migrateInFlight: new Set<string>(),
    registerEvent: vi.fn((ref: unknown) => ref),
  };
}

/** Wires the handler the same way main.ts does, then returns the captured
 *  handler. Mirrors `this.registerEvent(this.app.workspace.on('file-open',
 *  makeReadingModeMigrationHandler({...})))` from src/main.ts. */
function wireHook(args: {
  plugin: MockPluginShape;
  migrate: ReturnType<typeof vi.fn>;
  isMigrationCandidate: ReturnType<typeof vi.fn>;
  logDebug: ReturnType<typeof vi.fn>;
  rerenderPreviewLeaves?: ReturnType<typeof vi.fn>;
  repair?: ReturnType<typeof vi.fn>;
}): (file: TFile | null) => void {
  const { plugin, migrate, isMigrationCandidate, logDebug } = args;
  const rerenderPreviewLeaves = args.rerenderPreviewLeaves ?? vi.fn();
  // Plan 21-09 — repair DI added to ReadingModeMigrationHookDeps. Default
  // resolves to false so existing tests that omit the spy continue to
  // exercise the migrate-only path.
  const repair = args.repair ?? vi.fn(async () => false);
  const handler = makeReadingModeMigrationHandler({
    app: plugin.app,
    settings: plugin.settings,
    migrateInFlight: plugin.migrateInFlight,
    migrate: migrate as unknown as Parameters<
      typeof makeReadingModeMigrationHandler
    >[0]['migrate'],
    isMigrationCandidate:
      isMigrationCandidate as unknown as Parameters<
        typeof makeReadingModeMigrationHandler
      >[0]['isMigrationCandidate'],
    logDebug: logDebug as unknown as Parameters<
      typeof makeReadingModeMigrationHandler
    >[0]['logDebug'],
    rerenderPreviewLeaves: rerenderPreviewLeaves as unknown as Parameters<
      typeof makeReadingModeMigrationHandler
    >[0]['rerenderPreviewLeaves'],
    repair: repair as unknown as Parameters<
      typeof makeReadingModeMigrationHandler
    >[0]['repair'],
  });
  const ref = (
    plugin.app.workspace as unknown as {
      on: (evt: string, cb: (file: TFile | null) => void) => unknown;
    }
  ).on('file-open', handler);
  plugin.registerEvent(ref);
  // Capture-via-spy proves the wiring is correct AND returns the same fn.
  const captured = (
    plugin.app.workspace as unknown as {
      __getCapturedHandler: () => (file: TFile | null) => void;
    }
  ).__getCapturedHandler();
  return captured;
}

async function flushPromises(): Promise<void> {
  // Several await ticks cover .then → .catch → .finally → trailing .then
  // (Phase 21 Plan 21-08 added a trailing rerender hop after .finally) plus
  // microtask flush slack.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

const V12_LEGACY_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Code',
  '',
  '```python',
  'def solve(): pass',
  '```',
  '',
].join('\n');

describe('Phase 21 Plan 21-05 — Reading-mode workspace.on(file-open) trigger', () => {
  let migrate: ReturnType<typeof vi.fn>;
  let isMigrationCandidate: ReturnType<typeof vi.fn>;
  let logDebug: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    migrate = vi.fn(async () => true);
    isMigrationCandidate = vi.fn(() => true);
    logDebug = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1 [CR-01-fix happy path] legacy v1.2 note + autoMigrateOnOpen=ON triggers migrate exactly once', async () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    const app = makeApp({
      fmByPath: {
        'LeetCode/two-sum.md': {
          'lc-slug': 'two-sum',
          'lc-language': 'python3',
        },
      },
      textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    expect(migrate).toHaveBeenCalledTimes(1);
    const [appArg, fileArg, opts] = migrate.mock.calls[0] as unknown as [
      App,
      TFile,
      { autoMigrateOnOpen?: boolean; defaultLanguage?: string },
    ];
    expect(appArg).toBe(app);
    expect(fileArg).toBe(file);
    expect(opts.autoMigrateOnOpen).toBe(true);
    expect(opts.defaultLanguage).toBe('python3');
    // After .finally runs the dedupe entry is cleared so subsequent
    // file-opens of the same path are not silently dropped.
    expect(plugin.migrateInFlight.has(file.path)).toBe(false);
  });

  // Test 2 [CR-01-fix master gate] useInlineWidget=OFF — REMOVED in Phase 22
  // Plan 22-01-E. The v1.2 nested-editor path was deleted; the widget is the
  // only path; useInlineWidget setting no longer exists; the master gate
  // short-circuit it pinned was removed from
  // src/main/readingModeMigrationHook.ts. PIN_DEAD_BEHAVIOR.

  it('Test 3 [CR-01-fix auto=OFF] candidate accepted → vault.read + logger.debug; migrate NOT called', async () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    const app = makeApp({
      fmByPath: {
        'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
      },
      textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: false,
      defaultLanguage: 'python3',
    });
    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    expect(migrate).not.toHaveBeenCalled();
    expect(app.vault.read).toHaveBeenCalledTimes(1);
    expect(isMigrationCandidate).toHaveBeenCalledTimes(1);
    // logger.debug fires with a string containing 'autoMigrateOnOpen=OFF'.
    expect(logDebug).toHaveBeenCalledTimes(1);
    const [msg] = logDebug.mock.calls[0] as unknown as [string, unknown];
    expect(msg).toMatch(/autoMigrateOnOpen=OFF/);
  });

  it('Test 4 [CR-01-fix non-LC note] no lc-slug short-circuits at the per-note gate', async () => {
    const file = { path: 'Random/notes.md' } as unknown as TFile;
    const app = makeApp({
      fmByPath: {
        // Frontmatter present but no lc-slug → not an LC plugin-owned note.
        'Random/notes.md': { tag: 'misc' },
      },
      textByPath: {},
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    expect(migrate).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(isMigrationCandidate).not.toHaveBeenCalled();
  });

  it('Test 5 [null file] short-circuits without exception or I/O', async () => {
    const app = makeApp({ fmByPath: {}, textByPath: {} });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    expect(() => handler(null)).not.toThrow();
    await flushPromises();

    expect(migrate).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.metadataCache.getFileCache).not.toHaveBeenCalled();
  });

  it('Test 6 [WR-01-fix cross-mode dedupe] pre-populated entry blocks Reading-mode trigger; clearing it re-enables', async () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    const app = makeApp({
      fmByPath: {
        'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
      },
      textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    // Simulate a Live-Preview-initiated migration in flight: claim the entry.
    plugin.migrateInFlight.add(file.path);

    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    // First trigger short-circuited at the dedupe check.
    expect(migrate).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();

    // Clear the dedupe entry (simulating Live Preview's .finally clearing
    // it) and retrigger — this time the migration runs.
    plugin.migrateInFlight.delete(file.path);
    handler(file);
    await flushPromises();

    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it('Test 7 [CR-01-fix idempotency] already-migrated note returns false from migrate; migrateInFlight cleared', async () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    // Note text contains a leetcode-solve fence already (idempotency
    // short-circuit clause 5 of isMigrationCandidate).
    const ALREADY_MIGRATED = [
      '---',
      'lc-slug: two-sum',
      'lc-language: python3',
      '---',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'def solve(): pass',
      '```',
      '',
    ].join('\n');
    const app = makeApp({
      fmByPath: {
        'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
      },
      textByPath: { 'LeetCode/two-sum.md': ALREADY_MIGRATED },
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    // The orchestrator's isMigrationCandidate returns false on
    // already-migrated; mirror that here.
    migrate = vi.fn(async () => false);

    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    // migrate IS called (the hook does not pre-check; it delegates to the
    // orchestrator which short-circuits internally on idempotency).
    expect(migrate).toHaveBeenCalledTimes(1);
    // The .finally clears the dedupe entry regardless of return value.
    expect(plugin.migrateInFlight.has(file.path)).toBe(false);
  });

  describe('Reading-mode rerender after auto-migration (Gap 1)', () => {
    it('Test G1.1 [ON path migrated=true] rerenderPreviewLeaves invoked exactly once with file.path', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => true);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(rerenderPreviewLeaves).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).toHaveBeenCalledWith(file.path);
    });

    it('Test G1.2 [ON path migrated=false] rerenderPreviewLeaves NOT invoked', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => false);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
    });

    it('Test G1.3 [ON path rejection] rerenderPreviewLeaves NOT invoked AND logDebug records non-fatal failure', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => {
        throw new Error('boom');
      });
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
      expect(logDebug).toHaveBeenCalled();
      const matched = logDebug.mock.calls.some((call) =>
        /non-fatal failure/.test(String(call[0])),
      );
      expect(matched).toBe(true);
    });

    it('Test G1.4 [ON path ordering] rerender invoked AFTER migrateInFlight is cleared', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => true);

      // Observe the state of migrateInFlight at the moment rerender fires.
      let inFlightWhenRerendered: boolean | null = null;
      const rerenderPreviewLeaves = vi.fn((_path: string) => {
        inFlightWhenRerendered = plugin.migrateInFlight.has(file.path);
      });
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      // The .finally must have run BEFORE rerender (rerender observes the
      // dedupe entry already cleared) so a re-entrant file-open echo would
      // not see the lock held.
      expect(rerenderPreviewLeaves).toHaveBeenCalledTimes(1);
      expect(inFlightWhenRerendered).toBe(false);
      expect(plugin.migrateInFlight.has(file.path)).toBe(false);
    });

    it('Test G1.5 [OFF path] rerenderPreviewLeaves never invoked under autoMigrateOnOpen=OFF', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: false,
        defaultLanguage: 'python3',
      });
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
      expect(migrate).not.toHaveBeenCalled();
    });
  });

  describe('rerenderReadingModePanes (Plan 21-08 Task 2)', () => {
    // Construct a leaf-shaped object whose `view` is an instance of the
    // mocked MarkdownView class so the production helper's `instanceof`
    // gate passes. Each leaf carries a `previewMode.rerender` mock + a
    // `getMode()` callback + a `file` ref so the (path,mode) filter can
    // be exercised independently.
    function makeLeaf(args: {
      mode: 'preview' | 'source';
      filePath: string | null;
      previewModeProvided?: boolean;
      rerenderThrows?: boolean;
    }): { view: unknown; rerender: ReturnType<typeof vi.fn> } {
      // Use the mocked MarkdownView class imported at the top of the
      // file. vi.mock('obsidian') replaces the module with the
      // helpers/obsidian-stub export, so `instanceof MarkdownView` will
      // pass for instances we construct here. The stub class has a
      // 0-arg constructor; cast to bypass the real Obsidian
      // MarkdownView(leaf) signature in obsidian.d.ts.
      const Ctor = MarkdownView as unknown as { new (): unknown };
      const view = new Ctor() as Record<string, unknown>;
      const rerender = vi.fn(() => {
        if (args.rerenderThrows) throw new Error('rerender threw');
      });
      view.file =
        args.filePath !== null
          ? ({ path: args.filePath } as unknown)
          : null;
      view.getMode = () => args.mode;
      if (args.previewModeProvided !== false) {
        view.previewMode = { rerender } as unknown;
      }
      return { view, rerender };
    }

    function makeAppWithLeaves(
      leaves: Array<{ view: unknown }>,
    ): App {
      return {
        workspace: {
          getLeavesOfType: vi.fn((type: string) => {
            if (type !== 'markdown') return [];
            return leaves;
          }),
        },
      } as unknown as App;
    }

    it('Test T2.1 [happy path] walks leaves, rerenders only matching preview leaves with true', () => {
      const target = 'LeetCode/two-sum.md';
      const leafA = makeLeaf({ mode: 'preview', filePath: target });
      const leafB = makeLeaf({ mode: 'source', filePath: target });
      const leafC = makeLeaf({ mode: 'preview', filePath: 'LeetCode/other.md' });
      const app = makeAppWithLeaves([
        { view: leafA.view },
        { view: leafB.view },
        { view: leafC.view },
      ]);

      rerenderReadingModePanes(app, target);

      expect(leafA.rerender).toHaveBeenCalledTimes(1);
      expect(leafA.rerender).toHaveBeenCalledWith(true);
      expect(leafB.rerender).not.toHaveBeenCalled();
      expect(leafC.rerender).not.toHaveBeenCalled();
    });

    it('Test T2.2 [defensive] undefined previewMode + throwing rerender swallowed; remaining match still rerenders', () => {
      const target = 'LeetCode/two-sum.md';
      // Leaf D: matching path + preview mode, but previewMode is undefined.
      const leafD = makeLeaf({
        mode: 'preview',
        filePath: target,
        previewModeProvided: false,
      });
      // Leaf E: matching path + preview mode, but rerender throws.
      const leafE = makeLeaf({
        mode: 'preview',
        filePath: target,
        rerenderThrows: true,
      });
      // Leaf F: matching path + preview mode + healthy previewMode.
      const leafF = makeLeaf({ mode: 'preview', filePath: target });
      const app = makeAppWithLeaves([
        { view: leafD.view },
        { view: leafE.view },
        { view: leafF.view },
      ]);

      expect(() => rerenderReadingModePanes(app, target)).not.toThrow();

      // Leaf D's rerender mock was never wired (previewMode missing) — so
      // it cannot have been called.
      expect(leafD.rerender).not.toHaveBeenCalled();
      // Leaf E threw but exception was swallowed.
      expect(leafE.rerender).toHaveBeenCalledTimes(1);
      // Leaf F still gets its rerender call.
      expect(leafF.rerender).toHaveBeenCalledTimes(1);
      expect(leafF.rerender).toHaveBeenCalledWith(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Phase 21 Plan 21-09 — Reading-mode hook invokes `repair` AFTER `migrate`
  // returns false (closes UAT Gap 2 / Test 2 — asymmetric "v1.3 body +
  // missing lc-language" shape).
  // ───────────────────────────────────────────────────────────────────────
  describe('Plan 21-09 — repair invoked after migrate returns false', () => {
    it('Test R1 [migrate=false → repair invoked once with autoMigrateOnOpen=true + defaultLanguage]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'java',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => true);
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
      });

      handler(file);
      await flushPromises();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(repair).toHaveBeenCalledTimes(1);
      const [appArg, fileArg, opts] = repair.mock.calls[0] as unknown as [
        App,
        TFile,
        { autoMigrateOnOpen?: boolean; defaultLanguage?: string },
      ];
      expect(appArg).toBe(app);
      expect(fileArg).toBe(file);
      expect(opts.autoMigrateOnOpen).toBe(true);
      expect(opts.defaultLanguage).toBe('java');
    });

    it('Test R2 [migrate=true → repair NOT invoked (migrator already injected lc-language)]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => true);
      const repair = vi.fn(async () => true);
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
      });

      handler(file);
      await flushPromises();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(repair).not.toHaveBeenCalled();
    });

    it('Test R3 [autoMigrateOnOpen=OFF → repair NOT invoked]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: false,
        defaultLanguage: 'python3',
      });
      const repair = vi.fn(async () => true);
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
      });

      handler(file);
      await flushPromises();

      expect(repair).not.toHaveBeenCalled();
      expect(migrate).not.toHaveBeenCalled();
    });

    it('Test R4 [migrate=false + repair=true → rerenderPreviewLeaves invoked once]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'java',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => true);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(repair).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).toHaveBeenCalledWith(file.path);
    });

    it('Test R5 [migrate=false + repair=false → rerenderPreviewLeaves NOT invoked]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => false);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(repair).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
    });

    it('Test R6 [repair rejection → no throw; logDebug records non-fatal failure]', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => {
        throw new Error('repair boom');
      });
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      expect(() => handler(file)).not.toThrow();
      await flushPromises();

      expect(repair).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
      // logDebug records a non-fatal failure message.
      const matched = logDebug.mock.calls.some((call) =>
        /non-fatal failure/.test(String(call[0])),
      );
      expect(matched).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-14 — R2 (UAT re-test gap closure) regression lock.
  //
  // No source change required: the existing implementation at
  // src/main/readingModeMigrationHook.ts:151-200 (Plan 21-09 GREEN commit
  // da8513f) already captures `repairedFlag` and fires
  // `rerenderPreviewLeaves(file.path)` when `migratedFlag || repairedFlag`
  // is true. These five tests lock that behavior in so a future refactor
  // cannot regress it. Test descriptions explicitly note "Plan 21-14
  // regression lock" so future maintainers know they are anti-regression
  // assertions, NOT the original 21-09 acceptance tests.
  // ───────────────────────────────────────────────────────────────────────
  describe('R2 — repair hand-off rerender (Plan 21-14 regression lock)', () => {
    it('Test R2.HOOK.1 [migrate=false + repair=true] rerenderPreviewLeaves invoked exactly once with file.path', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'java',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => true);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(rerenderPreviewLeaves).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).toHaveBeenCalledWith(file.path);
    });

    it('Test R2.HOOK.2 [migrate=false + repair=false] rerenderPreviewLeaves NOT invoked', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => false);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(repair).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
    });

    it('Test R2.HOOK.3 [migrate=false + repair rejects] rerenderPreviewLeaves NOT invoked; logDebug records non-fatal failure', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => false);
      const repair = vi.fn(async () => {
        throw new Error('repair regression boom');
      });
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      expect(repair).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).not.toHaveBeenCalled();
      const matched = logDebug.mock.calls.some((call) =>
        /non-fatal failure/.test(String(call[0])),
      );
      expect(matched).toBe(true);
    });

    it('Test R2.HOOK.4 [migrate=true] rerenderPreviewLeaves invoked exactly once; repair NOT called (does not double-fire from a phantom repair branch)', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      migrate = vi.fn(async () => true);
      const repair = vi.fn(async () => true);
      const rerenderPreviewLeaves = vi.fn();
      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      // Migrator returned true → early return; repair must NOT be called.
      expect(migrate).toHaveBeenCalledTimes(1);
      expect(repair).not.toHaveBeenCalled();
      // rerender fires from the migrate path (Plan 21-08 R1) exactly once
      // — NOT double-fired by a phantom repair branch.
      expect(rerenderPreviewLeaves).toHaveBeenCalledTimes(1);
      expect(rerenderPreviewLeaves).toHaveBeenCalledWith(file.path);
    });

    it('Test R2.HOOK.5 [ordering] migrate → repair → migrateInFlight cleared → rerenderPreviewLeaves (in that strict order)', async () => {
      const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
      const app = makeApp({
        fmByPath: {
          'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
        },
        textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
      });
      const plugin = makeMockPlugin(app, {
        useInlineWidget: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });

      let counter = 0;
      let migrateAt = 0;
      let repairAt = 0;
      let rerenderAt = 0;
      let inFlightWhenRerendered: boolean | null = null;

      migrate = vi.fn(async () => {
        migrateAt = ++counter;
        return false;
      });
      const repair = vi.fn(async () => {
        repairAt = ++counter;
        return true;
      });
      const rerenderPreviewLeaves = vi.fn((_path: string) => {
        rerenderAt = ++counter;
        inFlightWhenRerendered = plugin.migrateInFlight.has(file.path);
      });

      const handler = wireHook({
        plugin,
        migrate,
        isMigrationCandidate,
        logDebug,
        repair,
        rerenderPreviewLeaves,
      });

      handler(file);
      await flushPromises();

      // Strict ordering: migrate first, repair second, rerender LAST.
      expect(migrateAt).toBeGreaterThan(0);
      expect(repairAt).toBeGreaterThan(migrateAt);
      expect(rerenderAt).toBeGreaterThan(repairAt);
      // The in-flight lock must already be cleared when rerender observes
      // it — the trailing .then runs AFTER the .finally per Plan 21-08 G1.4.
      expect(inFlightWhenRerendered).toBe(false);
      expect(plugin.migrateInFlight.has(file.path)).toBe(false);
    });
  });

  it('Test 8 [registerEvent cleanup contract] hook registered via this.registerEvent(workspace.on(...))', () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    void file;
    const app = makeApp({ fmByPath: {}, textByPath: {} });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    // workspace.on('file-open', handler) was called once.
    expect(app.workspace.on).toHaveBeenCalledTimes(1);
    const [evtName, handlerArg] = (
      app.workspace.on as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0] as [string, unknown];
    expect(evtName).toBe('file-open');
    expect(typeof handlerArg).toBe('function');
    // plugin.registerEvent was called with the EventRef returned by
    // workspace.on — the cleanup contract that lets Plugin.unload() drop
    // the listener automatically.
    expect(plugin.registerEvent).toHaveBeenCalledTimes(1);
    const refArg = (
      plugin.registerEvent.mock.calls[0] as unknown[]
    )[0] as { __ref?: boolean };
    expect(refArg.__ref).toBe(true);
  });
});
