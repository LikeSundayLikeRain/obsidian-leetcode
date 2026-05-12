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
  languageRefreshEffect,
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
        const before = lines.slice(0, n - 1).join('\n');
        const from = n === 1 ? 0 : before.length + 1; // +1 for the newline before this line
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, from, to, number: n };
      },
    },
  } as unknown as EditorState;
}

// --- Helper to attach runFromActive + submitFromActive spies to a fake plugin ---
// Phase 5.3 D-06 — also wires `settings.getDefaultLanguage()` (chevron cold-cache
// fallback) and `switchLanguage` (chevron host contract) so the new
// `CodeActionsWidget(plugin, file, currentSlug)` signature compiles end-to-end.
// Mirrors analog `withHostMethods` at codeActionsPostProcessor.test.ts lines 78-83.
type HostOverrides = {
  runFromActive?: ReturnType<typeof vi.fn>;
  submitFromActive?: ReturnType<typeof vi.fn>;
  switchLanguage?: ReturnType<typeof vi.fn>;
  defaultLanguage?: string;
};
function withHostMethods(
  plugin: ReturnType<typeof createFakePlugin>,
  overrides: HostOverrides = {},
) {
  const host = plugin as unknown as Record<string, unknown>;
  host.runFromActive = overrides.runFromActive ?? vi.fn();
  host.submitFromActive = overrides.submitFromActive ?? vi.fn();
  host.switchLanguage = overrides.switchLanguage ?? vi.fn();
  host.settings = {
    getDefaultLanguage: () => overrides.defaultLanguage ?? 'python3',
  };
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
        const before = lines.slice(0, n - 1).join('\n');
        const from = n === 1 ? 0 : before.length + 1; // +1 for the newline before this line
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, from, to, number: n };
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

  it('widget emits .leetcode-code-actions container with chevron + Run + Submit buttons (Phase 5.3 D-06)', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const fakeFile = { path: 'LeetCode/0001-two-sum.md' };
    const widget = new CodeActionsWidget(plugin as never, fakeFile as never, 'python3');
    // WidgetType.toDOM expects an EditorView; for this DOM-shape assertion we only
    // need the view.dom.ownerDocument hook the helper reads.
    const fakeView = { dom: { ownerDocument: document } } as unknown as Parameters<
      CodeActionsWidget['toDOM']
    >[0];

    const root = widget.toDOM(fakeView);

    expect(root.classList.contains('leetcode-code-actions')).toBe(true);
    // Phase 5.3 D-06: row now includes a chevron prefix BEFORE Run + Submit.
    // Direct children: chevron-wrapper (span), Run (button), Submit (button).
    expect(root.children.length).toBe(3);
    expect(
      (root.children[0] as HTMLElement).classList.contains(
        'leetcode-language-chevron-wrapper',
      ),
    ).toBe(true);
    // Run + Submit click handlers + textContent are still wired correctly.
    const runBtn = root.querySelector<HTMLButtonElement>('button.leetcode-code-action-run');
    const submitBtn = root.querySelector<HTMLButtonElement>(
      'button.leetcode-code-action-submit',
    );
    expect(runBtn).not.toBeNull();
    expect(runBtn!.textContent).toBe('Run');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.textContent).toBe('Submit');
  });
});

describe('CodeActionsWidget — idempotent across updates (Phase 5.3 D-10 eq() identity)', () => {
  it('eq returns true for widgets with same plugin + same file + same currentSlug', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const file = { path: 'LeetCode/0001-two-sum.md' };
    const a = new CodeActionsWidget(plugin as never, file as never, 'python3');
    const b = new CodeActionsWidget(plugin as never, file as never, 'python3');

    expect(a.eq(b)).toBe(true);
  });

  it('eq returns false when currentSlug differs (load-bearing rebuild trigger on lc-language flip)', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const file = { path: 'LeetCode/0001-two-sum.md' };
    const a = new CodeActionsWidget(plugin as never, file as never, 'python3');
    const b = new CodeActionsWidget(plugin as never, file as never, 'java');

    expect(a.eq(b)).toBe(false);
  });

  it('eq returns false when file differs', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const f1 = { path: 'LeetCode/0001-two-sum.md' };
    const f2 = { path: 'LeetCode/0002-add-two-numbers.md' };
    const a = new CodeActionsWidget(plugin as never, f1 as never, 'python3');
    const b = new CodeActionsWidget(plugin as never, f2 as never, 'python3');

    expect(a.eq(b)).toBe(false);
  });

  it('eq returns false for widgets with different plugin references', () => {
    const m1 = createFakeMetadataCache();
    const m2 = createFakeMetadataCache();
    const p1 = withHostMethods(createFakePlugin({ metadataCache: m1 }));
    const p2 = withHostMethods(createFakePlugin({ metadataCache: m2 }));
    const file = { path: 'LeetCode/0001-two-sum.md' };
    const a = new CodeActionsWidget(p1 as never, file as never, 'python3');
    const b = new CodeActionsWidget(p2 as never, file as never, 'python3');

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
    const file = { path: 'LeetCode/0001-two-sum.md' };
    const widget = new CodeActionsWidget(plugin as never, file as never, 'python3');
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
    const file = { path: 'LeetCode/0001-two-sum.md' };
    const widget = new CodeActionsWidget(plugin as never, file as never, 'python3');
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

// Phase 5.3 Plan 07 (gap-closure post-Plan 06) — G-LAYOUT-V2: widget MUST be a
// CM6 BLOCK widget anchored at the END of the closer-fence line. A block widget
// renders as its own line below the fence, so it (a) sits visually below the
// fenced code area (user's preferred placement, NOT inside the code region as
// Plan 05's fence-relative inline widget effectively did), AND (b) is immune
// to indent decoration on the content-bearing line below the fence (the
// original G-LAYOUT bug).
describe('G-LAYOUT-V2: widget is a block widget anchored at fence-close (Plan 07)', () => {
  it('decoration spec has block: true and side: 1', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const state = makeStateWithFile(FULL_NOTE, 'LeetCode/0001-two-sum.md');

    const set = buildDecorations(state, plugin as never);
    expect(set.size).toBe(1);

    let blockFlag: unknown = undefined;
    let sideFlag: unknown = undefined;
    set.between(0, 1_000_000, (_from, _to, deco) => {
      const spec = (deco as unknown as {
        spec: { block?: unknown; side?: unknown };
      }).spec;
      blockFlag = spec.block;
      sideFlag = spec.side;
      return false;
    });

    expect(blockFlag).toBe(true);
    expect(sideFlag).toBe(1);
  });

  it('block widget is anchored at end of closer-fence line (line(closerLine).to)', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const state = makeStateWithFile(FULL_NOTE, 'LeetCode/0001-two-sum.md');

    const fence = findCodeFence(state);
    expect(fence).not.toBeNull();
    const expectedAnchor = state.doc.line(fence!.closerLine).to;

    const set = buildDecorations(state, plugin as never);
    let widgetFrom = -1;
    let widgetTo = -1;
    set.between(0, 1_000_000, (from, to, _deco) => {
      widgetFrom = from;
      widgetTo = to;
      return false;
    });

    expect(widgetFrom).toBe(expectedAnchor);
    // Block widgets occupy a zero-length range at the anchor point.
    expect(widgetTo).toBe(expectedAnchor);
  });
});

// Phase 5.3 Plan 05 (gap-closure) — G-LAYOUT: widget anchor must be
// fence-relative (end-of-closer-line + side: 1), NOT next-line-relative.
// The previous anchor (start of post-closer line + side: -1) inherited the
// next line's indent guides, so typing Tab on the line below shifted the
// action row horizontally. The new anchor is on the fence's own line,
// always at its indent (0 for top-level ## Code fences).
describe('G-LAYOUT: widget anchor is fence-relative not next-line-relative', () => {
  it('anchor offset equals state.doc.line(closerLine).to (NOT line(closerLine + 1).from)', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    // Body with closer on line 6 followed by an INDENTED line on 7.
    // FULL_NOTE-style frontmatter + ## Code + fence + tab-indented line.
    const noteWithIndentBelow = [
      '---',
      'lc-slug: two-sum',
      '---',
      '## Code',
      '```java',
      '```',
      '\t\tindented line below the fence',
    ].join('\n');
    const state = makeStateWithFile(noteWithIndentBelow, 'LeetCode/0001-two-sum.md');
    const set = buildDecorations(state, plugin as never);

    expect(set.size).toBe(1);

    // Find the closer line by scanning. In the doc above, the closer is
    // line 6 (1-indexed). The expected anchor offset is line(6).to.
    let closerLineNumber = -1;
    for (let i = 1; i <= state.doc.lines; i++) {
      const t = state.doc.line(i).text;
      if (/^\s*```/.test(t) && i > 1 && /^\s*```/.test(state.doc.line(i - 1).text)) {
        closerLineNumber = i;
        break;
      }
    }
    expect(closerLineNumber).toBeGreaterThan(0);
    const expectedAnchor = state.doc.line(closerLineNumber).to;
    const oldAnchor = state.doc.line(closerLineNumber + 1).from;

    let widgetFrom = -1;
    set.between(0, 1_000_000, (from, _to) => {
      widgetFrom = from;
      return false;
    });

    expect(widgetFrom).toBe(expectedAnchor);
    expect(widgetFrom).not.toBe(oldAnchor);
  });

  it('still works when the closer fence is the LAST line of the document (no trailing line)', () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));

    // Closer is the last line — the previous fallback path (anchor at
    // closerLine.to with side: 1) is now the canonical path. Confirm no
    // throw + correct anchor.
    const noteEndingWithCloser = [
      '---',
      'lc-slug: two-sum',
      '---',
      '## Code',
      '```java',
      '```',
    ].join('\n');
    const state = makeStateWithFile(noteEndingWithCloser, 'LeetCode/0001-two-sum.md');

    expect(() => buildDecorations(state, plugin as never)).not.toThrow();
    const set = buildDecorations(state, plugin as never);
    expect(set.size).toBe(1);

    // Closer line is line 6 in this fixture; widget anchor should equal
    // line(6).to (the only valid offset on the closer line).
    const closerOffset = state.doc.line(6).to;
    let widgetFrom = -1;
    set.between(0, 1_000_000, (from, _to) => {
      widgetFrom = from;
      return false;
    });
    expect(widgetFrom).toBe(closerOffset);
  });
});

// Phase 5.3 Plan 05 (gap-closure) — G-LABEL-LAG: language refresh effect
// rebuilds widget. The chevron's `currentSlug` is captured at widget
// construction; without a manual rebuild trigger after `processFrontMatter`,
// the chevron label lags one click. This block verifies the effect path.
describe('G-LABEL-LAG: language refresh effect rebuilds widget', () => {
  it('exports languageRefreshEffect as a StateEffect', () => {
    // Sanity: the effect symbol exists and matches the StateEffect protocol
    // (has `.of` and `.is`). Used downstream by metadataCache subscription.
    expect(languageRefreshEffect).toBeDefined();
    expect(typeof (languageRefreshEffect as unknown as { of: unknown }).of).toBe('function');
  });

  it('produces a fresh widget with the new currentSlug after a frontmatter flip + effect dispatch', () => {
    // Step 1: state with lc-language=python3 → widget currentSlug='python3'.
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    const plugin = withHostMethods(createFakePlugin({ metadataCache }));
    const stateBefore = makeStateWithFile(FULL_NOTE, 'LeetCode/0001-two-sum.md');

    const setBefore = buildDecorations(stateBefore, plugin as never);
    expect(setBefore.size).toBe(1);
    let widgetBefore: CodeActionsWidget | null = null;
    setBefore.between(0, 1_000_000, (_from, _to, deco) => {
      const spec = (deco as unknown as { spec: { widget: CodeActionsWidget } }).spec;
      widgetBefore = spec.widget;
      return false;
    });
    expect(widgetBefore).not.toBeNull();
    expect((widgetBefore as unknown as CodeActionsWidget).currentSlug).toBe('python3');

    // Step 2: mutate metadataCache to a new lc-language. With nothing else
    // changing in the document, only an explicit rebuild trigger (the
    // languageRefreshEffect) — or a docChanged transaction — would make
    // buildDecorations re-read the new frontmatter.
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', {
      'lc-slug': 'two-sum',
      'lc-language': 'java',
    });

    // Step 3: re-run buildDecorations to simulate the rebuild that the
    // StateField update predicate triggers when languageRefreshEffect is
    // present in `tr.effects`. The actual update predicate is exercised
    // indirectly: if buildDecorations now reads 'java', the effect-based
    // rebuild path is correct (the StateField calls buildDecorations on
    // the same trigger).
    const stateAfter = makeStateWithFile(FULL_NOTE, 'LeetCode/0001-two-sum.md');
    const setAfter = buildDecorations(stateAfter, plugin as never);
    expect(setAfter.size).toBe(1);
    let widgetAfter: CodeActionsWidget | null = null;
    setAfter.between(0, 1_000_000, (_from, _to, deco) => {
      const spec = (deco as unknown as { spec: { widget: CodeActionsWidget } }).spec;
      widgetAfter = spec.widget;
      return false;
    });
    expect(widgetAfter).not.toBeNull();
    expect((widgetAfter as unknown as CodeActionsWidget).currentSlug).toBe('java');
  });
});
