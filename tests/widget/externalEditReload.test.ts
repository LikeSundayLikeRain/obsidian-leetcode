// Phase 20 Plan 20-03 Task 2 — WidgetController.reloadFromDisk tests (RED).
//
// Covers SYNC-04 + CONTEXT D-conflict-03 line/col cursor clamp:
//   - Reload Test 1: captures (line, col) from view.state.selection.main.head
//     BEFORE the dispatch; reads disk via app.vault.read; extracts fence body;
//     no-op when newBody === current doc.
//   - Reload Test 2: line shrunk → cursor clamps to last line in new doc.
//   - Reload Test 3: col shrunk on target line → clamps to end-of-line.
//   - Reload Test 4: dispatch carries Transaction.addToHistory.of(false)
//     annotation (no undo-stack pollution).
//   - Reload Test 5: scrollDOM.scrollTop captured + restored.
//
// Uses real @codemirror/state + @codemirror/view per the existing test
// fixture pattern (e.g., tests/widget/WidgetController.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import { EditorState, EditorSelection, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { WidgetController } from '../../src/widget/WidgetController';
import { Compartment } from '@codemirror/state';

interface FakePlugin {
  app: {
    vault: {
      read: ReturnType<typeof vi.fn> & ((file: { path: string }) => Promise<string>);
    };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
  settings: { getIndentSizeOverride: () => 'auto' | 2 | 4 | 8 };
}

function makeFakePlugin(diskContent: string): FakePlugin {
  return {
    app: {
      vault: {
        read: vi.fn<(file: { path: string }) => Promise<string>>(() => Promise.resolve(diskContent)),
      },
      metadataCache: { getFileCache: vi.fn(() => null) },
    },
    settings: { getIndentSizeOverride: () => 4 },
  };
}

function makeWidgetView(initialDoc: string): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const state = EditorState.create({ doc: initialDoc, extensions: [] });
  return new EditorView({ state, parent: container });
}

function makeController(
  view: EditorView,
  plugin: FakePlugin,
  fenceIndex = 0,
  filePath = 'note.md',
): WidgetController {
  const file = { path: filePath } as never;
  const vimComp = new Compartment();
  return new WidgetController(view, view.dom, file, fenceIndex, plugin as never, vimComp, false);
}

const FENCE_NOTE = (body: string): string =>
  ['## Code', '', '```leetcode-solve', body, '```', ''].join('\n');

describe('WidgetController.reloadFromDisk — Reload Test 1: captures cursor + reads disk', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads disk via app.vault.read and extracts fence body for fenceIndex', async () => {
    const view = makeWidgetView('old');
    const plugin = makeFakePlugin(FENCE_NOTE('externalNew'));
    const ctl = makeController(view, plugin);

    await ctl.reloadFromDisk('silent');

    expect(plugin.app.vault.read).toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('externalNew');
  });

  it('no-op when fresh disk body === current widget doc', async () => {
    const view = makeWidgetView('same');
    const plugin = makeFakePlugin(FENCE_NOTE('same'));
    const ctl = makeController(view, plugin);

    const dispatchSpy = vi.spyOn(view, 'dispatch');
    await ctl.reloadFromDisk('silent');

    // No dispatch when body is unchanged — guards against unnecessary
    // history pollution and selection jitter.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('WidgetController.reloadFromDisk — Reload Test 2: line shrunk → cursor clamps to last line', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('cursor on line 5 → clamped to last line of new (shorter) doc', async () => {
    // Initial doc has 5 lines; place cursor on line 5
    const initial = 'a\nb\nc\nd\ne';
    const view = makeWidgetView(initial);
    // Line 5 starts at index 8 (a\n=2, b\n=4, c\n=6, d\n=8). 'e' is at idx 8.
    view.dispatch({ selection: EditorSelection.cursor(8) });

    const plugin = makeFakePlugin(FENCE_NOTE('only-one'));
    const ctl = makeController(view, plugin);

    await ctl.reloadFromDisk('silent');

    // After reload, doc is just 'only-one' (1 line). Cursor should clamp
    // to the only line; targetLine = min(5, 1) = 1; targetLineLength = 8;
    // restoredHead = min(0 + min(0,8), 8) = 0. Original col on line 5 was 0.
    // Verify cursor is within new doc bounds.
    expect(view.state.selection.main.head).toBeLessThanOrEqual(view.state.doc.length);
    expect(view.state.doc.toString()).toBe('only-one');
  });
});

describe('WidgetController.reloadFromDisk — Reload Test 3: col shrunk → clamps to EOL', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('cursor at col 10 on line 1, but new doc has line 1 length 3 → clamp to col 3', async () => {
    const view = makeWidgetView('hello world\nbye');
    // Cursor at col 10 on line 1
    view.dispatch({ selection: EditorSelection.cursor(10) });

    const plugin = makeFakePlugin(FENCE_NOTE('abc\ndef'));
    const ctl = makeController(view, plugin);

    await ctl.reloadFromDisk('silent');

    // New doc 'abc\ndef': line 1 = 'abc' (length 3); col 10 clamps to 3.
    expect(view.state.selection.main.head).toBe(3);
    expect(view.state.doc.toString()).toBe('abc\ndef');
  });
});

describe('WidgetController.reloadFromDisk — Reload Test 4: addToHistory.of(false) annotation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reload dispatch carries Transaction.addToHistory.of(false) annotation', async () => {
    const view = makeWidgetView('old');
    const plugin = makeFakePlugin(FENCE_NOTE('newBody'));
    const ctl = makeController(view, plugin);

    let capturedAnnotation: unknown = undefined;
    const origDispatch = view.dispatch.bind(view);
    vi.spyOn(view, 'dispatch').mockImplementation((spec: never) => {
      const s = spec as { annotations?: unknown[] };
      // The annotation should carry addToHistory.of(false) — match by type.
      if (Array.isArray(s.annotations)) {
        for (const a of s.annotations) {
          // Transaction.addToHistory.of(false) returns an Annotation
          // whose .type === Transaction.addToHistory.
          const annotation = a as { type?: unknown; value?: unknown };
          if (annotation.type === Transaction.addToHistory && annotation.value === false) {
            capturedAnnotation = annotation;
          }
        }
      }
      origDispatch(spec);
    });

    await ctl.reloadFromDisk('silent');

    expect(capturedAnnotation).toBeDefined();
  });
});

describe('WidgetController.reloadFromDisk — Reload Test 5: scrollTop captured + restored', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('scrollDOM.scrollTop is preserved across the reload dispatch', async () => {
    const view = makeWidgetView('a\nb\nc\nd\ne');
    // Force a scroll position. jsdom doesn't compute layout so we set
    // scrollTop manually; reloadFromDisk should preserve whatever value is
    // captured at the start of the call.
    view.scrollDOM.scrollTop = 42;

    const plugin = makeFakePlugin(FENCE_NOTE('newBody'));
    const ctl = makeController(view, plugin);

    await ctl.reloadFromDisk('silent');

    expect(view.scrollDOM.scrollTop).toBe(42);
  });
});

describe('WidgetController.reloadFromDisk — keep-external reason path uses same line/col clamp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reloadFromDisk("keep-external") replaces doc and preserves cursor (informational reason param)', async () => {
    const view = makeWidgetView('hello');
    view.dispatch({ selection: EditorSelection.cursor(2) });

    const plugin = makeFakePlugin(FENCE_NOTE('externalContent'));
    const ctl = makeController(view, plugin);

    await ctl.reloadFromDisk('keep-external');

    expect(view.state.doc.toString()).toBe('externalContent');
    // col 2 fits within 'externalContent' length 15; cursor at col 2.
    expect(view.state.selection.main.head).toBe(2);
  });
});
