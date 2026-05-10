// tests/solve/mocks/fakeWorkspace.ts
//
// Phase 5 POLISH-07 / D-02 / D-09 / D-11 — lightweight Workspace + Plugin
// surface for Wave 0 test stubs. The ephemeralTabStore tests need to simulate
// open/close leaf transitions deterministically (so we can assert that slug
// state is wiped only when NO leaf shows the file). The
// codeActionsPostProcessor tests need a Plugin-like container that exposes
// `app.workspace`, `app.metadataCache`, `app.commands`, and `registerEvent`.
//
// This helper intentionally avoids importing anything from the real
// `obsidian` runtime — every Wave 0 test that uses it stays inside the
// happy-dom env. Callers that need richer behavior can still `vi.mock` the
// obsidian package (see tests/solve/throttled-request-url.test.ts for the
// module-level mock pattern).

import { vi } from 'vitest';

/** Minimal leaf shape exercised by EphemeralTabStore.reconcile() — the only
 *  piece Wave 0 / Wave 3 tests drive. Extend as real behavior lands. */
export interface FakeLeaf {
  view: {
    file?: { path: string } | null;
  };
}

/** Workspace event names the ephemeral-tab store subscribes to. Scoped to
 *  the two Phase 5 D-02/D-09 uses: `layout-change` (leaf shown / closed /
 *  moved) + `active-leaf-change` (visibility flip). */
export type FakeWorkspaceEventName = 'layout-change' | 'active-leaf-change';

/** Object returned by `workspace.on(...)`. Obsidian's real API returns an
 *  `EventRef`; Plugin.registerEvent then owns its cleanup. For the Wave 0
 *  tests we treat the ref as opaque — `off(ref)` simply drops the callback. */
export interface FakeEventRef {
  __fakeEventRef: true;
  name: FakeWorkspaceEventName;
}

/** Public facade returned by `createFakeWorkspace`. `setLeaves` + `fire`
 *  are the two test-only handles that let each test drive state changes. */
export interface FakeWorkspace {
  on(name: FakeWorkspaceEventName, cb: () => void): FakeEventRef;
  off(ref: FakeEventRef): void;
  getLeavesOfType(type: string): FakeLeaf[];
  /** Test-only: replace the leaves array returned by `getLeavesOfType`. */
  setLeaves(leaves: FakeLeaf[]): void;
  /** Test-only: synchronously invoke every callback registered for `name`. */
  fire(name: FakeWorkspaceEventName): void;
}

/** Build a Workspace-like double with deterministic event firing + leaf
 *  control. `getLeavesOfType(type)` ignores the `type` argument and returns
 *  whatever the last `setLeaves(...)` call stored — Wave 0 tests only need
 *  one leaf-type pool and the type argument is not a meaningful dimension. */
export function createFakeWorkspace(): FakeWorkspace {
  let leaves: FakeLeaf[] = [];
  const callbacks: Record<FakeWorkspaceEventName, Array<() => void>> = {
    'layout-change': [],
    'active-leaf-change': [],
  };

  return {
    on(name, cb) {
      callbacks[name].push(cb);
      return { __fakeEventRef: true, name } as FakeEventRef;
    },
    off(ref) {
      // No-op in the Wave 0 scope; ephemeralTabStore relies on
      // plugin.registerEvent() auto-cleanup on unload, not explicit off().
      void ref;
    },
    getLeavesOfType(_type: string) {
      return leaves;
    },
    setLeaves(next) {
      leaves = next;
    },
    fire(name) {
      for (const cb of callbacks[name]) cb();
    },
  };
}

/** Minimal MetadataCache used by the code-block postprocessor tests to
 *  gate on `lc-slug` frontmatter (D-12). */
export interface FakeMetadataCache {
  getFileCache(file: { path: string } | null): { frontmatter?: Record<string, unknown> } | null;
  /** Test-only: seed frontmatter for a given path. */
  setFrontmatter(path: string, fm: Record<string, unknown> | null): void;
}

export function createFakeMetadataCache(): FakeMetadataCache {
  const store = new Map<string, Record<string, unknown>>();
  return {
    getFileCache(file) {
      if (!file) return null;
      const fm = store.get(file.path);
      return fm ? { frontmatter: fm } : null;
    },
    setFrontmatter(path, fm) {
      if (fm === null) store.delete(path);
      else store.set(path, fm);
    },
  };
}

/** Minimal commands registry used by the code-block postprocessor tests
 *  (D-13 click handler dispatches `executeCommandById`). */
export interface FakeCommands {
  executeCommandById: ReturnType<typeof vi.fn>;
}

export function createFakeCommands(): FakeCommands {
  return {
    executeCommandById: vi.fn(),
  };
}

/** Minimal Plugin-like container for Wave 0 tests. Exposes:
 *  - `app.workspace` (FakeWorkspace)
 *  - `app.metadataCache` (FakeMetadataCache)
 *  - `app.commands` (FakeCommands — `executeCommandById` spy)
 *  - `registerEvent(ref)` spy for auto-cleanup assertions
 *  - `registerMarkdownPostProcessor(fn)` spy (D-11 registration test)
 *  - `addCommand(spec)` spy (D-01 command-set test)
 *  - `manifest.id` for D-13 fully-qualified command IDs (Pitfall 14) */
export interface FakePlugin {
  app: {
    workspace: FakeWorkspace;
    metadataCache: FakeMetadataCache;
    commands: FakeCommands;
  };
  registerEvent: ReturnType<typeof vi.fn>;
  registerMarkdownPostProcessor: ReturnType<typeof vi.fn>;
  addCommand: ReturnType<typeof vi.fn>;
  manifest: { id: string };
}

export interface FakePluginOverrides {
  workspace?: FakeWorkspace;
  metadataCache?: FakeMetadataCache;
  commands?: FakeCommands;
  manifestId?: string;
}

export function createFakePlugin(overrides: FakePluginOverrides = {}): FakePlugin {
  const workspace = overrides.workspace ?? createFakeWorkspace();
  const metadataCache = overrides.metadataCache ?? createFakeMetadataCache();
  const commands = overrides.commands ?? createFakeCommands();
  return {
    app: { workspace, metadataCache, commands },
    registerEvent: vi.fn((_ref: FakeEventRef) => undefined),
    registerMarkdownPostProcessor: vi.fn(),
    addCommand: vi.fn(),
    manifest: { id: overrides.manifestId ?? 'leetcode' },
  };
}
