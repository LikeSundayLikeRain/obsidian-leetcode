// tests/preview/enter-key.test.ts
//
// Phase 06 Plan 05 (gap closure) — Locks the Enter-key activation contract
// for the preview tab's action button (06-UAT.md gap #3).
//
// Contracts under test:
//   1. Pressing Enter while a Start Problem button is rendered fires the
//      same handler as a click — `plugin.openProblem(slug, undefined)`.
//   2. Pressing Enter while an Open Problem button is rendered (note
//      exists) fires the same handler — same call shape.
//   3. Pressing Enter before any setState (loading/empty state, no
//      `activeAction`) is a no-op — no openProblem call, no error thrown.
//   4. Pressing Enter after onClose (the view has been torn down) is a
//      no-op — the captured Scope handler still exists in the test stub
//      (Obsidian releases registrations via Component.onunload in real
//      runtime), but `this.activeAction === null` makes the callback a
//      no-op.
//
// Mirrors the import + view-mount shape of tests/preview/start-button.test.ts.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { ProblemPreviewView } from '../../src/preview/ProblemPreviewView';
import { Scope, type ScopeHandler } from '../helpers/obsidian-stub';
import type { DetailCacheEntry } from '../../src/notes/types';

function makeDetail(overrides: Partial<DetailCacheEntry> = {}): DetailCacheEntry {
  return {
    fetchedAt: 1700000000000,
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/two-sum/',
    contentHtml: '<p>Given an array …</p>',
    topicSlugs: ['array'],
    ...overrides,
  };
}

interface FakeLeaf {
  detach: ReturnType<typeof vi.fn>;
}

function makePluginStub(opts: {
  detail: DetailCacheEntry | null;
  noteFile: { path: string } | null;
}) {
  const openProblem = vi.fn(async () => undefined);
  const setProblemDetail = vi.fn(async () => undefined);
  const getProblemDetail = vi.fn((_slug: string) => opts.detail);
  const fakeWorkspace = {
    getLeavesOfType: vi.fn(() => []),
    getLeaf: vi.fn(() => ({ setViewState: vi.fn(async () => undefined) })),
    revealLeaf: vi.fn(async () => undefined),
  };
  const fakeApp = {
    workspace: fakeWorkspace,
    vault: {
      getAbstractFileByPath: vi.fn((_path: string) => opts.noteFile),
    },
  };
  const plugin = {
    app: fakeApp,
    settings: {
      getProblemDetail,
      setProblemDetail,
      getProblemsFolder: () => 'LeetCode',
    },
    client: {
      getProblemDetail: vi.fn(async () => null),
    },
    openProblem,
  };
  return { plugin, openProblem };
}

/** Hand-roll a ProblemPreviewView with the same shape as start-button.test.ts.
 *  Returns the view + the Scope stub instance so tests can locate the Enter
 *  callback and invoke it directly. */
function mountView(opts: {
  detail: DetailCacheEntry | null;
  noteFile: { path: string } | null;
}) {
  const fakeLeaf: FakeLeaf = { detach: vi.fn() };
  const containerEl = document.createElement('div');
  containerEl.appendChild(document.createElement('div')); // children[0]
  const root = document.createElement('div');
  containerEl.appendChild(root); // children[1] — the canonical view content slot
  const stub = makePluginStub(opts);

  const view = Object.create(ProblemPreviewView.prototype) as ProblemPreviewView;
  const scope = new Scope();
  (view as unknown as { containerEl: HTMLElement }).containerEl = containerEl;
  (view as unknown as { leaf: FakeLeaf }).leaf = fakeLeaf;
  (view as unknown as { app: typeof stub.plugin.app }).app = stub.plugin.app;
  (view as unknown as { plugin: typeof stub.plugin }).plugin = stub.plugin;
  (view as unknown as { scope: Scope }).scope = scope;
  return { view, root, scope, openProblem: stub.openProblem, fakeLeaf };
}

function findEnterHandler(scope: Scope): ScopeHandler | undefined {
  return scope.handlers.find((h) => h.key === 'Enter' && h.mods.length === 0);
}

describe('Preview Enter-key activation (Phase 06 Plan 05 gap closure)', () => {
  it('Test 1: Enter on a rendered Start Problem fires plugin.openProblem(slug, undefined)', async () => {
    const detail = makeDetail();
    const { view, scope, openProblem } = mountView({ detail, noteFile: null });

    await view.onOpen();
    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    // The Enter handler is now wired and `activeAction` points at the
    // rendered Start Problem button.
    const handler = findEnterHandler(scope);
    expect(handler, 'Enter handler missing — onOpen did not register it').toBeDefined();

    handler?.cb();
    // The click handler is async — flush microtasks so openProblem is called.
    await Promise.resolve();
    await Promise.resolve();

    expect(openProblem).toHaveBeenCalledTimes(1);
    expect(openProblem).toHaveBeenCalledWith('two-sum', undefined);
  });

  it('Test 2: Enter on a rendered Open Problem (note exists) fires the same delegate', async () => {
    const detail = makeDetail();
    const noteFile = { path: 'LeetCode/0001-two-sum.md' };
    const { view, scope, openProblem } = mountView({ detail, noteFile });

    await view.onOpen();
    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    // detectExistingNote should resolve to fileExists=true via the
    // getAbstractFileByPath stub returning a non-null file. The button
    // now reads "Open Problem" — but Enter still calls the same click
    // handler, which still routes to plugin.openProblem.
    const handler = findEnterHandler(scope);
    handler?.cb();
    await Promise.resolve();
    await Promise.resolve();

    expect(openProblem).toHaveBeenCalledTimes(1);
    expect(openProblem).toHaveBeenCalledWith('two-sum', undefined);
  });

  it('Test 3: Enter while no action button is rendered (loading/empty) is a no-op', async () => {
    const { view, scope, openProblem } = mountView({ detail: null, noteFile: null });

    // onOpen registers the Enter handler but does NOT render any action
    // button (slug is null → renderEmpty path). activeAction stays null.
    await view.onOpen();

    const handler = findEnterHandler(scope);
    expect(handler).toBeDefined();

    // Invoking Enter must NOT throw and must NOT call plugin.openProblem.
    expect(() => handler?.cb()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(openProblem).not.toHaveBeenCalled();
  });

  it('Test 4: Enter after onClose is a no-op (activeAction cleared)', async () => {
    const detail = makeDetail();
    const { view, scope, openProblem } = mountView({ detail, noteFile: null });

    await view.onOpen();
    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    // Tear the view down. Real Obsidian releases the scope registration via
    // Component.onunload; the test stub keeps the handler in the array but
    // `this.activeAction = null` makes the callback a no-op when invoked.
    await view.onClose();

    const handler = findEnterHandler(scope);
    expect(handler).toBeDefined();
    expect(() => handler?.cb()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(openProblem).not.toHaveBeenCalled();
  });
});
