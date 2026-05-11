// Phase 5.1 (POLISH-07 / 05-UAT G1) — Edit-mode inline Run/Submit buttons.
// RED-state unit tests. Pins the behavioral contract the Wave 1 implementation
// module `src/main/codeActionsEditorExtension.ts` must satisfy: frontmatter gate,
// `## Code` fence detection, decoration idempotency via WidgetType.eq(), and
// click dispatch via direct `plugin.runFromActive()` / `submitFromActive()` calls
// (D-05 — avoids editorCheckCallback gate regression from 05-05 live smoke).
//
// WAVE 0 LINT NOTE: the rules disabled below fire solely because
// `../../src/main/codeActionsEditorExtension` does not yet exist (TDD Wave 0
// RED contract — the imports below resolve to `any`/`error` until Wave 1 ships
// the module). When Wave 1 (Plan 02) creates the real module with typed exports,
// TypeScript will infer concrete types, the no-unsafe-* cascade will evaporate,
// and these disables can be removed.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, obsidianmd/prefer-active-doc -- Wave 0 RED-state scaffolding; removed when Wave 1 ships the implementation module */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import type { EditorState } from '@codemirror/state';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// MUST fail to resolve at Wave 0 time; becomes resolvable when Wave 1 (Plan 02) ships the module.
import {
  findCodeFence,
  buildDecorations,
  CodeActionsWidget,
  buildCodeActionsEditorExtension,
} from '../../src/main/codeActionsEditorExtension';

// --- Test fixture shared across buildDecorations tests (mirrors analog FULL_NOTE) ---
const FULL_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Problem',
  '',
  'Given an array, return two indices.',
  '',
  'Example:',
  '```text',
  'Input: [2,7,11,15], target = 9',
  'Output: [0,1]',
  '```',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {}',
  '```',
  '',
  '## Techniques',
  '',
  '- [[Hash Table]]',
  '',
].join('\n');

// --- Minimal EditorState stub for findCodeFence pure-function tests ---
// Drawn from RESEARCH.md lines 476-491.
function makeState(text: string): EditorState {
  const lines = text.split('\n');
  return {
    doc: {
      get lines() {
        return lines.length;
      },
      line(n: number) {
        const t = lines[n - 1] ?? '';
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, to, number: n };
      },
    },
  } as unknown as EditorState;
}

// --- Helper to attach runFromActive + submitFromActive spies to a fake plugin ---
// Mirrors analog `withHostMethods` at codeActionsPostProcessor.test.ts lines 78-83.
type HostOverrides = {
  runFromActive?: ReturnType<typeof vi.fn>;
  submitFromActive?: ReturnType<typeof vi.fn>;
};
function withHostMethods(
  plugin: ReturnType<typeof createFakePlugin>,
  overrides: HostOverrides = {},
) {
  const host = plugin as unknown as Record<string, unknown>;
  host.runFromActive = overrides.runFromActive ?? vi.fn();
  host.submitFromActive = overrides.submitFromActive ?? vi.fn();
  return plugin;
}

// --- Helper: build a state with a file reference + frontmatter plumbed through metadataCache ---
// buildDecorations reads `state.field(editorInfoField)?.file` and then looks up frontmatter
// via `plugin.app.metadataCache.getFileCache(file)`. Tests provide a state adapter that
// returns { file: { path } } for editorInfoField and a noop for editorLivePreviewField.
function makeStateWithFile(text: string, path: string): EditorState {
  const lines = text.split('\n');
  // `field` is callable; returns the relevant test value by checking identity
  // against the stubbed exports. This avoids depending on the real StateField
  // internals and keeps tests hermetic per 05.1-PATTERNS.md guidance.
  const fakeState = {
    doc: {
      get lines() {
        return lines.length;
      },
      line(n: number) {
        const t = lines[n - 1] ?? '';
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, to, number: n };
      },
      get length() {
        return text.length;
      },
    },
    field(_f: unknown) {
      // Tests supply a fake state that always reports the configured file.
      // We do not discriminate between editorInfoField and editorLivePreviewField
      // here; the buildDecorations path only reads editorInfoField, and the
      // StateField object stored in the stub is the marker we hand back.
      return { file: { path } };
    },
  };
  return fakeState as unknown as EditorState;
}

describe('findCodeFence', () => {
  it('returns null when no ## Code section exists', () => {
    const state = makeState('## Problem\n\nExample:\n```text\nfoo\n```\n');
    expect(findCodeFence(state)).toBeNull();
  });

  it('locates the first fence under ## Code', () => {
    const state = makeState(
      '## Problem\n\n## Code\n\n```java\nclass Solution {}\n```\n\n## Techniques',
    );
    expect(findCodeFence(state)).toEqual({ openerLine: 5, closerLine: 7 });
  });

  it('returns null when fence is unterminated', () => {
    const state = makeState('## Code\n\n```java\nclass Solution {}\n');
    expect(findCodeFence(state)).toBeNull();
  });
});

describe('buildDecorations — lc-slug gate', () => {
  let metadataCache: ReturnType<typeof createFakeMetadataCache>;

  beforeEach(() => {
    metadataCache = createFakeMetadataCache();
  });

  it('lc-slug gate — returns empty set when frontmatter is missing', () => {
    metadataCache.setFrontmatter('Notes/random.md', null);
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const state = makeStateWithFile(FULL_NOTE, 'Notes/random.md');

    const set = buildDecorations(state, plugin as never);

    expect(set.size).toBe(0);
  });

  it('targets only ## Code fence — returns empty set when note has fences but no ## Code section', () => {
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const noCodeSection = [
      '## Problem',
      '',
      '```text',
      'Input / Output example',
      '```',
      '',
      '## Techniques',
    ].join('\n');
    const state = makeStateWithFile(noCodeSection, 'LeetCode/0001-two-sum.md');

    const set = buildDecorations(state, plugin as never);

    expect(set.size).toBe(0);
  });
});

describe('buildDecorations — widget emits .leetcode-code-actions', () => {
  it('produces exactly one widget when lc-slug present AND ## Code fence exists (idempotent across updates — part 1)', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const state = makeStateWithFile(FULL_NOTE, 'LeetCode/0001-two-sum.md');

    const set = buildDecorations(state, plugin as never);

    expect(set.size).toBe(1);
  });

  it('widget emits .leetcode-code-actions container with Run + Submit buttons', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const widget = new CodeActionsWidget(plugin as never);
    // WidgetType.toDOM expects an EditorView; for this DOM-shape assertion we only
    // need the view.dom.ownerDocument hook the helper reads.
    const fakeView = { dom: { ownerDocument: document } } as unknown as Parameters<
      CodeActionsWidget['toDOM']
    >[0];

    const root = widget.toDOM(fakeView);

    expect(root.classList.contains('leetcode-code-actions')).toBe(true);
    const buttons = Array.from(root.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].classList.contains('leetcode-code-action-run')).toBe(true);
    expect(buttons[0].textContent).toBe('Run');
    expect(buttons[1].classList.contains('leetcode-code-action-submit')).toBe(true);
    expect(buttons[1].textContent).toBe('Submit');
  });
});

describe('CodeActionsWidget — idempotent across updates', () => {
  it('eq returns true for widgets with the same plugin reference (idempotent across updates — part 2)', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const a = new CodeActionsWidget(plugin as never);
    const b = new CodeActionsWidget(plugin as never);

    expect(a.eq(b)).toBe(true);
  });

  it('eq returns false for widgets with different plugin references', () => {
    const m1 = createFakeMetadataCache();
    const m2 = createFakeMetadataCache();
    const p1 = withHostMethods(createFakePlugin({ metadataCache: m1 }));
    const p2 = withHostMethods(createFakePlugin({ metadataCache: m2 }));
    const a = new CodeActionsWidget(p1 as never);
    const b = new CodeActionsWidget(p2 as never);

    expect(a.eq(b)).toBe(false);
  });
});

describe('click dispatches runFromActive / submitFromActive (direct call)', () => {
  it('dispatches runFromActive — Run click invokes plugin.runFromActive (NOT executeCommandById)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(
      createFakePlugin({ metadataCache, manifestId: 'leetcode' }),
      { runFromActive, submitFromActive },
    );
    const widget = new CodeActionsWidget(plugin as never);
    const fakeView = { dom: { ownerDocument: document } } as unknown as Parameters<
      CodeActionsWidget['toDOM']
    >[0];

    const root = widget.toDOM(fakeView);
    const runBtn = root.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(runFromActive).toHaveBeenCalledTimes(1);
    expect(submitFromActive).not.toHaveBeenCalled();
    // D-05 regression guard: Run must NOT dispatch through the command palette.
    // executeCommandById is NOT called — direct method call only.
    const commands = (plugin.app as unknown as { commands?: { executeCommandById?: unknown } })
      .commands;
    if (commands?.executeCommandById && vi.isMockFunction(commands.executeCommandById)) {
      expect(commands.executeCommandById).not.toHaveBeenCalled();
    }
  });

  it('dispatches submitFromActive — Submit click invokes plugin.submitFromActive (NOT executeCommandById)', () => {
    const runFromActive = vi.fn();
    const submitFromActive = vi.fn();
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(
      createFakePlugin({ metadataCache, manifestId: 'leetcode' }),
      { runFromActive, submitFromActive },
    );
    const widget = new CodeActionsWidget(plugin as never);
    const fakeView = { dom: { ownerDocument: document } } as unknown as Parameters<
      CodeActionsWidget['toDOM']
    >[0];

    const root = widget.toDOM(fakeView);
    const submitBtn = root.querySelector<HTMLButtonElement>(
      'button.leetcode-code-action-submit',
    );
    expect(submitBtn).not.toBeNull();
    submitBtn!.click();

    expect(submitFromActive).toHaveBeenCalledTimes(1);
    expect(runFromActive).not.toHaveBeenCalled();
  });
});

describe('buildCodeActionsEditorExtension — public API exists', () => {
  it('exports a function that returns a CM6 Extension (StateField)', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const ext = buildCodeActionsEditorExtension(plugin as never);
    // A StateField is an Extension; asserting truthy is sufficient for the public-API
    // sanity check. Real behavioral coverage lives in the buildDecorations tests above.
    expect(ext).toBeTruthy();
  });
});
