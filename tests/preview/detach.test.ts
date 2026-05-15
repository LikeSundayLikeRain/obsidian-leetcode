// tests/preview/detach.test.ts
//
// Phase 06 Plan 03 — locks the post-Start detach lifecycle (CONTEXT.md
// decision B): after `plugin.openProblem(slug)` resolves, the preview
// view schedules `setWindowTimeout(() => leaf.detach(), 100)`. After the
// 100 ms tick, `leaf.detach()` MUST fire exactly once.
//
// Uses vi.useFakeTimers() to advance the timer deterministically. The
// test mounts the view via the same Object.create-the-prototype path as
// start-button.test.ts so we don't have to stand up a real ItemView.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { ProblemPreviewView } from '../../src/preview/ProblemPreviewView';
import type { DetailCacheEntry } from '../../src/notes/types';

function makeDetail(): DetailCacheEntry {
  return {
    fetchedAt: 1700000000000,
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/two-sum/',
    contentHtml: '<p>…</p>',
    topicSlugs: [],
  };
}

describe('Preview post-Start detach (Phase 06 Plan 03 CONTEXT.md decision B)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules leaf.detach() ~100 ms after a successful Start Problem click', async () => {
    const detail = makeDetail();
    const detachSpy = vi.fn();
    const fakeLeaf = { detach: detachSpy };
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div'));
    const root = document.createElement('div');
    containerEl.appendChild(root);
    const fakeApp = {
      workspace: {
        getLeavesOfType: vi.fn(() => []),
      },
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const plugin = {
      app: fakeApp,
      settings: {
        getProblemDetail: () => detail,
        setProblemDetail: vi.fn(async () => undefined),
        getProblemsFolder: () => 'LeetCode',
      },
      client: {
        getProblemDetail: vi.fn(async () => null),
      },
      openProblem: vi.fn(async () => undefined),
    };
    const view = Object.create(ProblemPreviewView.prototype) as ProblemPreviewView;
    (view as unknown as { containerEl: HTMLElement }).containerEl = containerEl;
    (view as unknown as { leaf: { detach: () => void } }).leaf = fakeLeaf;
    (view as unknown as { app: typeof fakeApp }).app = fakeApp;
    (view as unknown as { plugin: typeof plugin }).plugin = plugin;

    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    const btn = root.querySelector<HTMLButtonElement>('button.lc-preview__action');
    expect(btn).not.toBeNull();
    btn!.click();
    // Allow microtasks to drain: openProblem.await + post-await synchronous
    // setWindowTimeout call.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // BEFORE the 100ms tick: detach has not yet fired.
    expect(detachSpy).not.toHaveBeenCalled();

    // Advance the fake clock past 100ms.
    vi.advanceTimersByTime(100);

    expect(detachSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT schedule detach when openProblem rejects (button restored, error Notice surfaced)', async () => {
    const detail = makeDetail();
    const detachSpy = vi.fn();
    const fakeLeaf = { detach: detachSpy };
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div'));
    const root = document.createElement('div');
    containerEl.appendChild(root);
    const fakeApp = {
      workspace: {
        getLeavesOfType: vi.fn(() => []),
      },
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const plugin = {
      app: fakeApp,
      settings: {
        getProblemDetail: () => detail,
        setProblemDetail: vi.fn(async () => undefined),
        getProblemsFolder: () => 'LeetCode',
      },
      client: {
        getProblemDetail: vi.fn(async () => null),
      },
      openProblem: vi.fn(async () => {
        throw new Error('NoteWriter rejected');
      }),
    };
    const view = Object.create(ProblemPreviewView.prototype) as ProblemPreviewView;
    (view as unknown as { containerEl: HTMLElement }).containerEl = containerEl;
    (view as unknown as { leaf: { detach: () => void } }).leaf = fakeLeaf;
    (view as unknown as { app: typeof fakeApp }).app = fakeApp;
    (view as unknown as { plugin: typeof plugin }).plugin = plugin;

    await view.setState({ slug: 'two-sum' }, { history: false } as Parameters<ProblemPreviewView['setState']>[1]);

    const btn = root.querySelector<HTMLButtonElement>('button.lc-preview__action');
    btn!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Tick 100ms — but no detach should have been scheduled because
    // openProblem rejected.
    vi.advanceTimersByTime(100);
    expect(detachSpy).not.toHaveBeenCalled();
    // Button has been restored to its label/disabled state.
    expect(btn!.disabled).toBe(false);
  });
});
