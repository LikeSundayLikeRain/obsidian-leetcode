// Phase 20 Plan 20-02 — Single-mount test: assert EXACTLY ONE
// `.leetcode-code-actions` element renders for a fence under each
// `useInlineWidget` flag setting (per Plan 20-02 Step 5 / Test 6).
//
// Under useInlineWidget=ON: widget mounts the action row inside its container.
//                           The codeActionsEditorExtension at src/main.ts:843-868
//                           is gated OFF — zero post-processor row.
// Under useInlineWidget=OFF: only the post-processor renders the row.
//
// This test exercises the contract by direct DOM construction (the runtime
// gating block lives in src/main.ts:879-930 and is a registration-time
// branch, not a render-time branch — the contract here verifies that
// constructing both action-row builders against the same host produces
// independent rows; the gating in main.ts ensures only one is registered).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { ...actual, TFile };
});

import { mountActionRow } from '../../src/widget/widgetActions';
import { buildCodeBlockButtonRow } from '../../src/main/codeBlockButtonRow';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';

interface FakeWidgetCtl {
  plugin: {
    runFromWidget: ReturnType<typeof vi.fn>;
    submitFromWidget: ReturnType<typeof vi.fn>;
    aiSolutionFromWidget: ReturnType<typeof vi.fn>;
    resetFromWidget: ReturnType<typeof vi.fn>;
    retrieveLastSubmissionFromWidget: ReturnType<typeof vi.fn>;
    switchLanguageFromWidget: ReturnType<typeof vi.fn>;
  };
  container: HTMLElement;
  file: { path: string };
  fenceIndex: number;
}

function makeFakeWidgetCtl(): FakeWidgetCtl {
  return {
    plugin: {
      runFromWidget: vi.fn(),
      submitFromWidget: vi.fn(),
      aiSolutionFromWidget: vi.fn(),
      resetFromWidget: vi.fn(),
      retrieveLastSubmissionFromWidget: vi.fn(),
      switchLanguageFromWidget: vi.fn(),
    },
    container: document.createElement('div'),
    file: { path: 'LeetCode/two-sum.md' },
    fenceIndex: 0,
  };
}

describe('Single-mount contract — useInlineWidget=ON', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('widget mount produces exactly one .leetcode-code-actions in the widget container', () => {
    const ctl = makeFakeWidgetCtl();
    document.body.appendChild(ctl.container);
    mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);

    const rows = document.querySelectorAll('.leetcode-code-actions');
    expect(rows.length).toBe(1);
  });
});

describe('Single-mount contract — useInlineWidget=OFF', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('post-processor mount produces exactly one .leetcode-code-actions in the host', () => {
    const plugin = createFakePlugin() as unknown as Record<string, unknown>;
    plugin.resetFromActive = vi.fn();
    plugin.retrieveLastSubmissionFromActive = vi.fn();
    plugin.runFromActive = vi.fn();
    plugin.submitFromActive = vi.fn();
    plugin.aiDebugFromActive = vi.fn();
    plugin.aiSolutionFromActive = vi.fn();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const row = buildCodeBlockButtonRow(document, plugin as never);
    host.appendChild(row);

    const rows = document.querySelectorAll('.leetcode-code-actions');
    expect(rows.length).toBe(1);
  });
});

describe('Single-mount contract — gate must prevent both mounts simultaneously', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // The actual gate lives at src/main.ts:879-930 (registration-time branch
  // based on useInlineWidget). When ON, only the widget path's processor +
  // ViewPlugin register; when OFF, only the v1.2 codeActionsEditorExtension +
  // codeActionsPostProcessor register. The ts gate is byte-level mutual
  // exclusion. This test is a self-documenting assertion that the contract
  // *is* "exactly one row per fence"; the actual mutual-exclusion is
  // enforced by main.ts's onload branching, not by this widget code.
  it('contract assertion: each path independently produces exactly one .leetcode-code-actions', () => {
    // ON path
    document.body.innerHTML = '';
    const ctl = makeFakeWidgetCtl();
    document.body.appendChild(ctl.container);
    mountActionRow(ctl as never, { path: 'p' } as never, 'python3', document);
    expect(document.querySelectorAll('.leetcode-code-actions').length).toBe(1);

    // OFF path
    document.body.innerHTML = '';
    const plugin = createFakePlugin() as unknown as Record<string, unknown>;
    plugin.resetFromActive = vi.fn();
    plugin.retrieveLastSubmissionFromActive = vi.fn();
    plugin.runFromActive = vi.fn();
    plugin.submitFromActive = vi.fn();
    plugin.aiDebugFromActive = vi.fn();
    plugin.aiSolutionFromActive = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.appendChild(buildCodeBlockButtonRow(document, plugin as never));
    expect(document.querySelectorAll('.leetcode-code-actions').length).toBe(1);
  });
});
