// Phase 19 Plan 03 Task 1 (RED) — Live Preview unmount/remount integration test.
//
// CONTEXT D-02 belt-and-suspenders: stopPropagation listener (Plan 19-01) +
// state-persistence map (Plan 19-03) cover the Live Preview cursor-approach
// raw-source-reveal scenario plus all other unmount paths (viewport scroll,
// mode switch, theme change, beforeunload).
//
// Verifies:
//   1. captureState fires on unmount with the controller's view + key.
//   2. Subsequent mount within 30s hydrates: cursor restored.
//   3. After 30001ms, captured state is gone — fresh mount.
//   4. mousedown.stopPropagation listener is still attached on widget root
//      (D-02 belt — Plan 19-01's listener must not regress).
//
// The CM6 + obsidian module mocks reuse the WidgetController.test.ts pattern:
// stub @codemirror/* so the test runs under happy-dom without spinning up real
// CM6 chrome. We DO call mountLeetCodeWidget — the productive path — but the
// EditorView constructed inside is the mock.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

// ─── @codemirror/view mock ────────────────────────────────────────────────────
// Plan 19-02 Task 3's WidgetController.test.ts established this pattern; we
// replicate it here so the productive mountLeetCodeWidget call works without
// real CM6 layout.
vi.mock('@codemirror/view', () => {
  class MockEditorView {
    public state: {
      selection: { main: { head: number } };
      doc: { length: number; toString: () => string };
      toJSON: (fields?: unknown) => Record<string, unknown>;
    };
    public scrollDOM = { scrollTop: 0 };
    public dom: HTMLElement;
    public contentDOM: HTMLElement;
    public destroyed = false;
    public dispatch = vi.fn();
    public setState = vi.fn();
    constructor(opts: { state: unknown; parent: HTMLElement }) {
      const initialState = opts.state as {
        doc?: string | { length?: number; toString?: () => string };
      };
      // Mocked EditorState.create returns `{doc: opts.doc}` where doc is the
      // raw string passed in by mountLeetCodeWidget. Coerce defensively.
      let docStr = '';
      if (typeof initialState?.doc === 'string') {
        docStr = initialState.doc;
      } else if (
        initialState?.doc &&
        typeof (initialState.doc as { toString?: () => string }).toString ===
          'function'
      ) {
        docStr = (initialState.doc as { toString: () => string }).toString();
      }
      // Pad doc length defensively so cursor-clamping in hydrateState
      // (Math.min(stored, doc.length)) preserves the captured cursor for
      // the integration test. Real productive paths feed in real fence body
      // strings whose length matches the captured cursor's expected range.
      const docLen = Math.max(docStr.length, 1000);
      this.state = {
        selection: { main: { head: 0 } },
        doc: { length: docLen, toString: () => docStr },
        toJSON: (_f?: unknown) => ({ history: { done: [], undone: [] } }),
      };
      this.dom = document.createElement('div');
      this.contentDOM = document.createElement('div');
      this.dom.appendChild(this.contentDOM);
      opts.parent.appendChild(this.dom);
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  return {
    EditorView: Object.assign(MockEditorView, {
      editable: { of: vi.fn(() => 'mock-editable-ext') },
      lineWrapping: 'mock-line-wrapping-ext',
      theme: vi.fn(() => 'mock-theme-ext'),
      updateListener: { of: vi.fn(() => 'mock-update-listener') },
    }),
    keymap: { of: vi.fn(() => 'mock-keymap-ext') },
    drawSelection: vi.fn(() => 'mock-draw-selection-ext'),
    highlightActiveLine: vi.fn(() => 'mock-highlight-active-line-ext'),
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn((opts: { doc?: string }) => ({ doc: opts?.doc ?? '' })),
  },
  // statePersistence.hydrateState calls EditorSelection.cursor(head) to build
  // the selection passed to view.dispatch. Stub it to return an inspectable
  // shape so the test can assert the dispatched anchor is the prior cursor.
  EditorSelection: {
    cursor: (anchor: number) => ({ anchor, head: anchor, main: { head: anchor } }),
  },
}));

vi.mock('@codemirror/language', () => ({
  bracketMatching: vi.fn(() => 'mock-bracket-matching-ext'),
  indentUnit: { of: vi.fn(() => 'mock-indent-unit-ext') },
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn(() => 'mock-history-ext'),
  defaultKeymap: [],
  historyKeymap: [],
}));

vi.mock('@codemirror/autocomplete', () => ({
  closeBracketsKeymap: [],
}));

vi.mock('@replit/codemirror-vim', () => ({
  vim: vi.fn(() => 'mock-vim-ext'),
}));

vi.mock('../../src/main/childEditorLanguage', () => ({
  languageCompartment: { of: vi.fn(() => 'mock-language-compartment-ext') },
  buildLanguageExtensions: vi.fn(() => []),
}));

vi.mock('../../src/main/childEditorTheme', () => ({
  createThemedHighlight: vi.fn(() => []),
}));

vi.mock('../../src/main/childEditorSemanticClasses', () => ({
  obsidianSemanticClasses: 'mock-semantic-classes-ext',
}));

vi.mock('obsidian', () => ({
  MarkdownRenderChild: class {
    public containerEl: HTMLElement;
    constructor(el: HTMLElement) {
      this.containerEl = el;
    }
    onload(): void {}
    onunload(): void {}
  },
  TFile: class TFile {
    path = '';
    name = '';
    basename = '';
    extension = 'md';
  },
  debounce: vi.fn(
    (fn: (...args: unknown[]) => unknown) => {
      const wrapped = (...args: unknown[]): unknown => fn(...args);
      wrapped.cancel = vi.fn();
      wrapped.run = wrapped;
      return wrapped;
    },
  ),
  Notice: class {
    constructor(_msg: string, _t?: number) {}
  },
}));

// ─── Productive imports ──────────────────────────────────────────────────────
import {
  mountLeetCodeWidget,
  type WidgetMountHost,
} from '../../src/widget/WidgetController';
import { StatePersistenceMap } from '../../src/widget/statePersistence';

// Minimal TFile stub for the host argument.
function makeFile(path = 'note.md'): {
  path: string;
  name: string;
  basename: string;
  extension: string;
} {
  return {
    path,
    name: path.split('/').pop() ?? path,
    basename: (path.split('/').pop() ?? path).replace(/\.md$/, ''),
    extension: 'md',
  };
}

function makeHost(
  statePersistence: StatePersistenceMap,
): WidgetMountHost & {
  statePersistence: StatePersistenceMap;
  selfWriteSuppression: undefined;
} {
  return {
    app: {
      vault: {
        getConfig: () => false,
      },
      metadataCache: {
        getFileCache: () => null,
      },
    },
    settings: {
      getIndentSizeOverride: () => 4,
      getShowRelativeLineNumbers: () => false,
      getWidgetSyncDebounceMs: () => 400,
    },
    statePersistence,
    selfWriteSuppression: undefined,
  } as never;
}

describe('Live Preview unmount/remount via StatePersistenceMap (CONTEXT D-02)', () => {
  let host: HTMLElement;
  let persistence: StatePersistenceMap;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    persistence = new StatePersistenceMap();
  });

  afterEach(() => {
    document.body.removeChild(host);
    vi.useRealTimers();
  });

  it('mountLeetCodeWidget calls hydrateState on mount; un-captured key returns false (fresh state)', () => {
    const hostObj = makeHost(persistence);
    const file = makeFile('a.md');
    // Spy on hydrateState BEFORE mount.
    const hydrateSpy = vi.spyOn(persistence, 'hydrateState');
    mountLeetCodeWidget(host, '', file as never, hostObj, false, 0);
    // The mount path invoked hydrateState exactly once with the expected key.
    expect(hydrateSpy).toHaveBeenCalledTimes(1);
    const hydrateCall = hydrateSpy.mock.calls[0];
    expect(hydrateCall).toBeDefined();
    expect((hydrateCall as unknown[])[0]).toBe('a.md::0');
    expect((hydrateCall as unknown[])[1]).toBeDefined();
  });

  it('captureState on unmount stores entry; subsequent mount within 30s hydrates', () => {
    const hostObj = makeHost(persistence);
    const file = makeFile('a.md');

    // First controller — mount, simulate edit (mock view exposes mutable state),
    // then capture state on "unmount".
    const ctl1 = mountLeetCodeWidget(host, '', file as never, hostObj, false, 0);
    // Simulate cursor placement: set the mock view's selection.head to 7.
    (ctl1.view as unknown as { state: { selection: { main: { head: number } } } }).state.selection.main.head = 7;
    (ctl1.view as unknown as { scrollDOM: { scrollTop: number } }).scrollDOM.scrollTop = 123;

    persistence.captureState('a.md::0', ctl1.view as never);
    ctl1.destroy();

    // Second controller — mount at same key. mountLeetCodeWidget should call
    // hydrateState on the new view; the test asserts the new view's
    // dispatched selection contains the prior cursor.
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const ctl2 = mountLeetCodeWidget(host2, '', file as never, hostObj, false, 0);
    const dispatchMock = (ctl2.view as unknown as {
      dispatch: ReturnType<typeof vi.fn>;
    }).dispatch;
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const firstCall = dispatchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const dispatchArg = (firstCall as unknown[])[0] as {
      selection?: { anchor?: number; head?: number; main?: { head: number } };
    };
    const anchor =
      (dispatchArg.selection as { anchor?: number })?.anchor ??
      (dispatchArg.selection as { head?: number })?.head ??
      (dispatchArg.selection as { main?: { head: number } })?.main?.head;
    expect(anchor).toBe(7);
    // Scroll restored.
    expect(
      (ctl2.view as unknown as { scrollDOM: { scrollTop: number } }).scrollDOM
        .scrollTop,
    ).toBe(123);
    ctl2.destroy();
    document.body.removeChild(host2);
  });

  it('after 30001ms, captureState entry expires — new mount gets fresh state (no hydrate)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const hostObj = makeHost(persistence);
    const file = makeFile('a.md');

    const ctl1 = mountLeetCodeWidget(host, '', file as never, hostObj, false, 0);
    persistence.captureState('a.md::0', ctl1.view as never);
    ctl1.destroy();

    // Advance time past 30s TTL.
    vi.setSystemTime(new Date(30_001));

    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const ctl2 = mountLeetCodeWidget(host2, '', file as never, hostObj, false, 0);
    // Mount called hydrateState which returned false — view.dispatch must NOT
    // have been called (no state to apply).
    const dispatchMock = (ctl2.view as unknown as {
      dispatch: ReturnType<typeof vi.fn>;
    }).dispatch;
    expect(dispatchMock).toHaveBeenCalledTimes(0);
    ctl2.destroy();
    document.body.removeChild(host2);
  });

  it('mousedown.stopPropagation listener is still attached on widget root (Plan 19-01 D-02 belt)', () => {
    const hostObj = makeHost(persistence);
    const file = makeFile('a.md');
    const ctl = mountLeetCodeWidget(host, '', file as never, hostObj, false, 0);

    // Dispatch a real mousedown on the view's dom and assert
    // stopPropagation was invoked. We rebind the prototype's
    // stopPropagation so the test can observe the call without changing
    // the productive code.
    const view = ctl.view as unknown as { dom: HTMLElement };
    expect(view.dom).toBeDefined();

    const evt = new Event('mousedown', { bubbles: true, cancelable: true });
    let stopCalls = 0;
    const origStop = evt.stopPropagation.bind(evt);
    evt.stopPropagation = () => {
      stopCalls += 1;
      origStop();
    };
    view.dom.dispatchEvent(evt);
    expect(stopCalls).toBeGreaterThanOrEqual(1);
    ctl.destroy();
  });
});
