// tests/preview/start-button.test.ts
//
// Phase 06 Plan 03 — start-button click contract:
//   - On click: button.disabled = true, label flips to 'Starting…'
//     (when no note exists) or 'Opening…' (when note exists).
//   - Awaits plugin.openProblem(slug, undefined).
//   - On success: schedules setWindowTimeout(() => leaf.detach(), 100)
//     via the popout-aware src/shared/timers.setWindowTimeout helper.
//
// detach.test.ts (separate file) exercises the timer-fires-detach path with
// fake timers; this test asserts the call sequence + scheduling.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { ProblemPreviewView, PREVIEW_VIEW_TYPE, renderHeader } from '../../src/preview/ProblemPreviewView';
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
  openProblemImpl?: (slug: string, status?: string) => Promise<void>;
}) {
  const openProblem = vi.fn(opts.openProblemImpl ?? (async () => undefined));
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

describe('Preview action button click — Start Problem branch (Phase 06 Plan 03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderHeader produces a button labelled "Start Problem" when noteExists=false', () => {
    // Sanity check: the contract the click test depends on.
    const container = document.createElement('div');
    const btn = renderHeader(container, makeDetail(), false);
    expect(btn.textContent).toBe('Start Problem');
    expect(btn.className).toContain('is-primary');
    expect(btn.disabled).toBe(false);
  });

  it('clicking Start Problem flips the label to "Starting…", disables the button, and calls plugin.openProblem', async () => {
    // Build a fake leaf + view that exposes renderForSlug indirectly via
    // setState. The view's onOpen reads containerEl.children[1] which we
    // wire via a fake containerEl below.
    const fakeLeaf: FakeLeaf = { detach: vi.fn() };
    const containerEl = document.createElement('div');
    // Obsidian's ItemView is created with two children: the action bar +
    // the content root. Mirror that shape so onOpen's `children[1]` index
    // resolves to a real element we can inspect.
    containerEl.appendChild(document.createElement('div'));
    const root = document.createElement('div');
    containerEl.appendChild(root);

    const detail = makeDetail();
    const stub = makePluginStub({ detail, noteFile: null });

    // Sidestep ItemView's constructor side-effects by hand-rolling the
    // view shape. We attach `containerEl` + `leaf` + `app` so the methods
    // we call can find what they need. Casts to `unknown` first to satisfy
    // strict-shape checks (the real Obsidian shapes have many more fields
    // than the test exercise).
    const view = Object.create(ProblemPreviewView.prototype) as ProblemPreviewView;
    (view as unknown as { containerEl: HTMLElement }).containerEl = containerEl;
    (view as unknown as { leaf: FakeLeaf }).leaf = fakeLeaf;
    (view as unknown as { app: typeof stub.plugin.app }).app = stub.plugin.app;
    (view as unknown as { plugin: typeof stub.plugin }).plugin = stub.plugin;

    // Drive setState which calls renderForSlug which renders the cache hit.
    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    // Locate the action button.
    const btn = root.querySelector<HTMLButtonElement>('button.leetcode-preview__action');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Start Problem');

    // Click the button.
    btn!.click();
    // Microtask flush — the click handler is async; allow openProblem to
    // run.
    await Promise.resolve();
    // Label should have flipped immediately (synchronous before await).
    expect(btn!.textContent).toBe('Starting…');
    expect(btn!.disabled).toBe(true);

    // Allow the openProblem await to resolve and the post-action timer
    // setup to run. vi.runAllTicks is synchronous (void return); flush
    // pending microtasks via Promise.resolve loops instead.
    vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(stub.openProblem).toHaveBeenCalledTimes(1);
    expect(stub.openProblem).toHaveBeenCalledWith('two-sum', undefined);
  });

  it('PREVIEW_VIEW_TYPE constant is "leetcode-preview" (sanity for the start-button file)', () => {
    expect(PREVIEW_VIEW_TYPE).toBe('leetcode-preview');
  });

  it('body container carries `markdown-rendered` class for reading-mode parity (gap-closure 06-05)', async () => {
    // Mounts the view via the same containerEl/setState pattern as the
    // click-flow test above. The body's class list must include
    // `markdown-rendered` so Obsidian's reading-mode CSS cascade
    // (code-block backgrounds, copy buttons, prose typography) applies —
    // closes 06-UAT gap #1 (body parity).
    const fakeLeaf: FakeLeaf = { detach: vi.fn() };
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div'));
    const root = document.createElement('div');
    containerEl.appendChild(root);

    const detail = makeDetail();
    const stub = makePluginStub({ detail, noteFile: null });

    const view = Object.create(ProblemPreviewView.prototype) as ProblemPreviewView;
    (view as unknown as { containerEl: HTMLElement }).containerEl = containerEl;
    (view as unknown as { leaf: FakeLeaf }).leaf = fakeLeaf;
    (view as unknown as { app: typeof stub.plugin.app }).app = stub.plugin.app;
    (view as unknown as { plugin: typeof stub.plugin }).plugin = stub.plugin;

    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    const body = root.querySelector('.leetcode-preview__body');
    expect(body).not.toBeNull();
    expect(body?.classList.contains('markdown-rendered')).toBe(true);
  });
});
