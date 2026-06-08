// tests/helpers/obsidian-stub.ts
// Minimal runtime stub for the `obsidian` package so Vitest can resolve
// `import { Notice } from 'obsidian'` (and friends) from source modules.
//
// The real `obsidian` npm package ships types ONLY (`main: ""`) — it has no
// runtime entry, which is why Vite fails with "Failed to resolve entry for
// package obsidian" when a source file statically imports a runtime value
// (e.g. `Notice`, `TFile`) from it.
//
// Tests that actually EXERCISE Notice / TFile behavior still use `vi.mock`
// to substitute richer fakes (see re-open-silent-offline.test.ts,
// new-note-fetch-failure.test.ts). This stub just makes `import` resolution
// succeed so tests that never touch Notice can still run.
//
// Wired into vitest.config.ts via `resolve.alias`.

export class Notice {
  constructor(public readonly message: string, public readonly timeout?: number) {
    // no-op; tests that care about Notice behavior replace this class via vi.mock.
  }
}

// TFile is used purely as a type in our source today, but we export a class
// stub anyway so `import { TFile }` resolves and `instanceof TFile` doesn't
// crash (it simply returns false for mocked plain-object files).
export class TFile {
  path!: string;
  name!: string;
  extension!: string;
  parent!: unknown;
}

export class TFolder {
  path!: string;
  name!: string;
  children!: unknown[];
}

// requestUrl is used by src/api/requestUrlFetcher.ts; tests that hit that path
// (fetcher-install.test.ts) override this via vi.mock.
export const requestUrl = async (_arg: unknown): Promise<unknown> => {
  throw new Error('obsidian-stub: requestUrl called without a test-level vi.mock');
};

// Phase 5.4 D-12b — setIcon stub. Source modules (languageChevronWidget,
// FilterModal, VerdictModal) import setIcon from 'obsidian' to mount Lucide
// glyphs into spans. Under happy-dom there's no Lucide registry; we render
// nothing and let tests assert that the icon-host span exists (presence,
// not pixel content). Tests that need icon-rendering behavior override
// this via per-test vi.mock factories.
export function setIcon(_el: HTMLElement, _name: string): void {
  /* no-op in tests */
}

// Phase 06 Plan 03 — Menu stub for the right-click context menu in
// ProblemBrowserView (PREVIEW-01). Tests that exercise the menu wiring
// override this via vi.mock factories with a per-test capture array; this
// stub keeps `import { Menu } from 'obsidian'` resolution happy for source
// modules that don't directly exercise the menu under test.
export interface MenuItemBuilder {
  setTitle(title: string): MenuItemBuilder;
  setIcon(name: string): MenuItemBuilder;
  onClick(cb: (evt?: MouseEvent | KeyboardEvent) => unknown): MenuItemBuilder;
}
export class Menu {
  private items: Array<{ title?: string; icon?: string; onClick?: () => unknown }> = [];
  addItem(cb: (item: MenuItemBuilder) => unknown): this {
    const record: { title?: string; icon?: string; onClick?: () => unknown } = {};
    const builder: MenuItemBuilder = {
      setTitle(t: string) { record.title = t; return builder; },
      setIcon(n: string) { record.icon = n; return builder; },
      onClick(fn: () => unknown) { record.onClick = fn; return builder; },
    };
    cb(builder);
    this.items.push(record);
    return this;
  }
  showAtMouseEvent(_e: MouseEvent): void {
    /* no-op in tests; tests assert via vi.mock factories */
  }
}

// Plugin / PluginSettingTab / Modal / Setting / WorkspaceLeaf / App /
// MarkdownView — all used as type imports in source today. Exporting class
// stubs keeps `import { X }` resolution happy for future tests that might
// import concrete values.
export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class Setting {}
export class WorkspaceLeaf {}
export class App {}
export class MarkdownView {}

// SuggestModal stub — base class for QuickProblemSearchModal. Tests that
// only exercise the pure `filterProblems` helper never instantiate the
// modal, but module resolution still needs the export. Tests that DO
// drive modal behavior should override via per-test vi.mock factories.
export class SuggestModal<T = unknown> {
  inputEl!: HTMLInputElement;
  resultContainerEl!: HTMLElement;
  limit = 0;
  emptyStateText = '';
  constructor(_app?: unknown) {
    /* no-op stub */
  }
  setPlaceholder(_p: string): void {
    /* no-op */
  }
  setInstructions(_i: unknown[]): void {
    /* no-op */
  }
  open(): void {
    /* no-op */
  }
  close(): void {
    /* no-op */
  }
  // Subclass hooks — declared so TypeScript is happy with abstract overrides.
  getSuggestions(_q: string): T[] | Promise<T[]> {
    return [];
  }
  renderSuggestion(_v: T, _el: HTMLElement): void {
    /* override */
  }
  onChooseSuggestion(_v: T, _evt: MouseEvent | KeyboardEvent): void {
    /* override */
  }
}

// Phase 06 Plan 05 (gap closure) — Scope stub for the preview's Enter-key
// registration. The real Obsidian `Scope` exposes `register(modifiers, key,
// callback)` that returns a handler reference; tests can introspect the
// captured `handlers` array (and pull the Enter callback by `key`) to drive
// the keyboard-activation paths without standing up a real Workspace.
// Additive only — existing tests that never touch `scope` remain unaffected.
export interface ScopeHandler {
  mods: string[];
  key: string;
  cb: (evt?: KeyboardEvent) => unknown;
}
export class Scope {
  handlers: ScopeHandler[] = [];
  // The real Scope constructor accepts an optional parent scope; tests
  // never inspect it, so we accept-and-ignore for shape compatibility.
  constructor(_parent?: Scope) {
    /* no-op stub */
  }
  register(
    mods: string[],
    key: string,
    cb: (evt?: KeyboardEvent) => unknown,
  ): ScopeHandler {
    const handler: ScopeHandler = { mods, key, cb };
    this.handlers.push(handler);
    return handler;
  }
  unregister(_handler: unknown): void {
    /* no-op stub; tests reset handlers directly when needed */
  }
}

// Phase 06 Plan 05 — ItemView gains a `scope` field so production code can
// call `this.scope.register(...)` from the test path. The real Obsidian
// ItemView inherits scope from View → Component; mirroring it here keeps
// `this.scope` defined even when the view is constructed via
// `Object.create(prototype)` (the start-button + enter-key test patterns).
// Existing tests that never touch scope remain unaffected because they
// also never construct an ItemView via `new`.
export class ItemView {
  scope: Scope = new Scope();
}

export class FileManager {}
export class Vault {}

// Phase 5.2 Plan 01 (D-06) — Workspace stub gains a minimal event registry for
// the `file-open` hook. Test code uses `fireFileOpen(workspace, file)` to
// synchronously invoke all registered listeners. Additive — existing tests
// that `new Workspace()` without touching events stay unaffected.
export type FileOpenHandler = (file: TFile | null) => void;
export class Workspace {
  _fileOpenHandlers: FileOpenHandler[] = [];
  on(name: string, cb: FileOpenHandler): { __stubEventRef: true; name: string } {
    if (name === 'file-open') {
      this._fileOpenHandlers.push(cb);
    }
    return { __stubEventRef: true, name };
  }
  offref(_ref: unknown): void {
    /* no-op — stub; tests that care can reset _fileOpenHandlers directly. */
  }
}

/** Test helper — synchronously fire every `file-open` listener attached to
 *  `ws`. Returns the count of handlers invoked so tests can assert wiring. */
export function fireFileOpen(ws: Workspace, file: TFile | null): number {
  for (const cb of ws._fileOpenHandlers) cb(file);
  return ws._fileOpenHandlers.length;
}

// Phase 5 Plan 05 (D-31) — SubmissionDetailModal uses Component + MarkdownRenderer
// to render the code fence with Obsidian's CM6 syntax highlighting. Tests that
// care about the render args override MarkdownRenderer.render via vi.mock;
// the stub class shape keeps module resolution and `new Component()` calls
// working for tests that only care about lifecycle side-effects (load / unload).
export class Component {
  load(): void {
    /* no-op stub; tests that care replace via vi.mock */
  }
  unload(): void {
    /* no-op stub */
  }
  addChild<T extends Component>(child: T): T {
    return child;
  }
}

// Phase 19 — MarkdownRenderChild stub. Used by `LeetCodeWidgetRenderChild`
// from src/widget/WidgetController.ts. The real Obsidian class extends
// Component and stores the host element on `containerEl`; tests construct
// instances via `new` (not `Object.create`), so the constructor body must
// actually persist the host element. onload/onunload are subclass hooks
// — base class provides no-op shells.
export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
  onload(): void {
    /* override in subclass */
  }
  onunload(): void {
    /* override in subclass */
  }
}

export const MarkdownRenderer = {
  // Signature matches Obsidian 1.x: render(app, markdown, el, sourcePath, component)
  async render(
    _app: unknown,
    _markdown: string,
    _el: unknown,
    _sourcePath: string,
    _component: Component,
  ): Promise<void> {
    // Test stub — tests that assert on call args override via vi.mock.
  },
};

// Phase 5.1 (POLISH-07 / 05-UAT G1) — CM6 editor-extension imports.
// `codeActionsEditorExtension.ts` reads the active file via `state.field(editorInfoField)`
// and rebuilds decorations on `editorLivePreviewField` flips (per RESEARCH.md Pattern 1
// + Pitfall 5). Tests that mock 'obsidian' need these exports present so module
// resolution doesn't fail when the implementation file is imported under vi.mock.
// Actual field behavior is exercised only in integration tests that construct a real
// EditorView; pure unit tests of findCodeFence stub state.doc directly.
// @codemirror/state is a transitive peer of `obsidian@1.12.3` (resolvable at runtime
// via node_modules); we don't declare it in package.json because esbuild marks it
// external and Obsidian supplies it at runtime. The lint rule reports this as a
// false-positive for the transitive-peer case.

import { StateField } from '@codemirror/state';

export const editorInfoField = StateField.define<{ file: { path: string } | null }>({
  create: () => ({ file: null }),
  update: (v) => v,
});

export const editorLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (v) => v,
});

// Phase 05.5 (POLISH) — sectionLockExtension test helpers. The lock filter
// takes a Transaction whose startState is an EditorState; tests synthesize
// both without a real EditorView. Mirrors the inline factories from Phase 5.1
// `tests/main/codeActionsEditorExtension.test.ts:67-83 + 114-144` — factored
// out so the new lock-extension test file (and any future filter-driven
// extension test) can reuse the shape. Additive only; existing exports
// unchanged.
import type { EditorState, Transaction } from '@codemirror/state';

export interface LockTestStateOpts {
  /** Document body the synthetic state.doc should report. */
  body: string;
  /**
   * Surfaced for caller ergonomics — the helper itself does not consult this;
   * frontmatter wiring is plumbed via `createFakeMetadataCache.setFrontmatter`
   * on the same `filePath`. Including it here lets callers thread the slug
   * value through one options bag without juggling two helpers.
   */
  lcSlug?: string;
  /** Path for the fake `state.field(editorInfoField).file`. Defaults to a
   *  canonical LC note path. */
  filePath?: string;
}

/**
 * Build a minimal EditorState-shape adapter compatible with:
 *   - `state.doc.lines` / `state.doc.line(n)` — line scan for computeLockedRanges
 *   - `state.doc.length` — for changeFilter return-shape sanity
 *   - `state.field(editorInfoField)` — Phase 5.1 frontmatter-gate path returns
 *     `{ file: { path: filePath } }` regardless of the field key supplied.
 *
 * Per-line offset math mirrors the analog `makeStateWithFile` exactly:
 *   from = (n === 1) ? 0 : lines.slice(0, n - 1).join('\n').length + 1
 *   to   = lines.slice(0, n).join('\n').length
 *
 * The helper is a pure shape adapter — it does NOT call EditorState.create.
 * Intended for filter-callback unit tests per RESEARCH §Pattern 2.
 */
export function makeStateForLockTests(opts: LockTestStateOpts): EditorState {
  const lines = opts.body.split('\n');
  const path = opts.filePath ?? 'LeetCode/0001-two-sum.md';
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
        return opts.body.length;
      },
      sliceString(from: number, to: number) {
        return opts.body.slice(from, to);
      },
    },
    field(_f: unknown) {
      // Tests supply a fake state that always reports the configured file.
      return { file: { path } };
    },
  };
  return fakeState as unknown as EditorState;
}

/**
 * Wrap a synthesized EditorState in a minimal Transaction-shape adapter that
 * the changeFilter callback consumes. `userEvent` lets tests exercise the
 * RESEARCH Pitfall 5 plugin-event escape hatch (e.g., 'leetcode.lang-switch').
 *
 *   tr.startState                === state
 *   tr.annotation(Transaction.userEvent) === opts.userEvent (or undefined)
 */
export function makeFakeTransaction(
  state: EditorState,
  opts: { userEvent?: string } = {},
): Transaction {
  const fakeTx = {
    startState: state,
    annotation(_kind: unknown) {
      return opts.userEvent;
    },
  };
  return fakeTx as unknown as Transaction;
}
