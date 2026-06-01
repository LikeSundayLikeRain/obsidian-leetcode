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
import { makeReadingModeMigrationHandler } from '../../src/main/readingModeMigrationHook';

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
}): (file: TFile | null) => void {
  const { plugin, migrate, isMigrationCandidate, logDebug } = args;
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
  // Two await ticks cover .then chain + .finally + microtask flush.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

  it('Test 2 [CR-01-fix master gate] useInlineWidget=OFF short-circuits before any I/O', async () => {
    const file = { path: 'LeetCode/two-sum.md' } as unknown as TFile;
    const app = makeApp({
      fmByPath: {
        'LeetCode/two-sum.md': { 'lc-slug': 'two-sum' },
      },
      textByPath: { 'LeetCode/two-sum.md': V12_LEGACY_NOTE },
    });
    const plugin = makeMockPlugin(app, {
      useInlineWidget: false,
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    const handler = wireHook({ plugin, migrate, isMigrationCandidate, logDebug });

    handler(file);
    await flushPromises();

    expect(migrate).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    // metadataCache should not be consulted either — the master gate
    // returns BEFORE the per-note gate.
    expect(app.metadataCache.getFileCache).not.toHaveBeenCalled();
  });

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
