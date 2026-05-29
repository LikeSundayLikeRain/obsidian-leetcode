// Phase 19 Plan 01 — CM6 / Obsidian test helpers for widget tests.
//
// Builds on tests/helpers/obsidian-stub.ts (makeStateForLockTests / makeFakeTransaction)
// and adds widget-specific factories:
//   - makeFakeMarkdownPostProcessorContext: ctx for registerMarkdownCodeBlockProcessor
//   - makeFakeApp: minimal app with vault.getConfig (vimMode / showLineNumber)
//   - makeFakeUpdateForViewPlugin: ViewUpdate-shape adapter for ViewPlugin tests
//
// All factories are pure shape adapters — they do not call EditorState.create
// (the productive widget tests construct real CM6 state where needed; pure-function
// tests never touch CM6 at all).

import { vi } from 'vitest';

interface FakeSectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface FakeMarkdownPostProcessorContextOpts {
  sourcePath: string;
  sectionInfo?: FakeSectionInfo | null;
  frontmatter?: unknown;
}

export interface FakeMarkdownPostProcessorContext {
  sourcePath: string;
  frontmatter: unknown;
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
  addChild: ReturnType<typeof vi.fn>;
}

/**
 * Minimal MarkdownPostProcessorContext shape used by codeBlockProcessor tests.
 * `addChild` is a vi.fn so tests can assert ctx.addChild was called with the
 * LeetCodeWidgetRenderChild instance.
 */
export function makeFakeMarkdownPostProcessorContext(
  opts: FakeMarkdownPostProcessorContextOpts,
): FakeMarkdownPostProcessorContext {
  return {
    sourcePath: opts.sourcePath,
    frontmatter: opts.frontmatter,
    getSectionInfo: () => opts.sectionInfo ?? null,
    addChild: vi.fn(),
  };
}

interface FakeAppOpts {
  vimMode?: boolean;
  showLineNumber?: boolean;
}

/**
 * Minimal Obsidian App with vault.getConfig only — used by the WidgetController
 * vim-mount test (VIM-01 / CONTEXT C-14) and any future probe of getConfig flags.
 */
export function makeFakeApp(opts: FakeAppOpts = {}): {
  vault: { getConfig: (key: string) => unknown };
  workspace: { getActiveViewOfType: ReturnType<typeof vi.fn> };
  metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  scope: undefined;
  keymap: { pushScope: ReturnType<typeof vi.fn>; popScope: ReturnType<typeof vi.fn> };
} {
  return {
    vault: {
      getConfig(key: string) {
        if (key === 'vimMode') return opts.vimMode === true;
        if (key === 'showLineNumber') return opts.showLineNumber === true;
        return undefined;
      },
    },
    workspace: { getActiveViewOfType: vi.fn(() => null) },
    metadataCache: { getFileCache: vi.fn(() => null) },
    scope: undefined,
    keymap: { pushScope: vi.fn(), popScope: vi.fn() },
  };
}

interface FakeViewUpdateOpts {
  docChanged?: boolean;
  viewportChanged?: boolean;
}

/**
 * ViewUpdate-shape adapter for ViewPlugin update() tests. Tests can drive
 * docChanged / viewportChanged flags without standing up a real EditorView.
 */
export function makeFakeUpdateForViewPlugin(
  state: unknown,
  opts: FakeViewUpdateOpts = {},
): { docChanged: boolean; viewportChanged: boolean; view: { state: unknown } } {
  return {
    docChanged: opts.docChanged ?? false,
    viewportChanged: opts.viewportChanged ?? false,
    view: { state },
  };
}
