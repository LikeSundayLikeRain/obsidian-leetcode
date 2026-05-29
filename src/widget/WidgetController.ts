// Phase 19 Plan 01 — Widget mount factory + lifecycle wrapper.
//
// Exports:
//   - mountLeetCodeWidget(host, source, file, plugin, readOnly): WidgetController
//     Builds a child CM6 EditorView mounted into `host`, with carry-over
//     extensions from v1.2 (language packs, theme, semantic classes,
//     conditional vim, theme block) plus the readOnly gate (Reading-mode).
//   - WidgetController — lightweight wrapper over the EditorView with
//     `flushNow` / `destroy` / `getDoc` methods. Plan 19-01 ships flushNow
//     as a no-op stub; Plan 19-02 wires it into debouncedWriter.
//   - LeetCodeWidgetRenderChild — MarkdownRenderChild subclass for Reading
//     mode mounts. onload calls mountLeetCodeWidget; onunload calls
//     controller.flushNow + controller.destroy + widgetRegistry.delete.
//
// CONTEXT references:
//   - C-12: 8 v1.2 language packs via languageCompartment + buildLanguageExtensions
//   - C-13: lc-nested-editor + HyperMD-codeblock container classes (theme
//     integration carry-over) + obsidianSemanticClasses ViewPlugin
//   - C-14: vim mounted only when app.vault.getConfig('vimMode') === true
//   - C-17: imports from `../main/childEditor*.ts` paths — those v1.2 files
//     stay reachable behind the useNestedEditor flag through Phase 21
//   - D-02: `mousedown.stopPropagation` listener on view.dom (Live Preview
//     raw-source-reveal mitigation; persistence map is the load-bearing
//     fallback in Plan 19-03)

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  type ViewUpdate,
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
import { bracketMatching, indentUnit } from '@codemirror/language';
import {
  history,
  defaultKeymap,
  historyKeymap,
} from '@codemirror/commands';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
// eslint-disable-next-line import/no-extraneous-dependencies -- direct dep
import { vim } from '@replit/codemirror-vim';
import {
  MarkdownRenderChild,
  type MarkdownPostProcessorContext,
  type MarkdownSectionInformation,
  type TFile,
} from 'obsidian';
import {
  languageCompartment,
  buildLanguageExtensions,
} from '../main/childEditorLanguage';
import { createThemedHighlight } from '../main/childEditorTheme';
import { obsidianSemanticClasses } from '../main/childEditorSemanticClasses';
import { computeFenceIndex } from './fenceLocator';
import { DebouncedWriter } from './debouncedWriter';
import type { SelfWriteSuppression } from './selfWriteSuppression';

/**
 * Plugin-host shape required by the widget mount factory. Structurally typed
 * so unit tests (which mock @codemirror/* and the v1.2 source modules) can
 * pass plain object literals without spinning up a real LeetCodePlugin.
 *
 * Note: `app.vault.getConfig` is an UNDOCUMENTED Obsidian internal that the
 * real `Vault` type does not declare. Real LeetCodePlugin instances satisfy
 * this contract at runtime (Obsidian provides it on every Vault instance);
 * callers that hold a Plugin reference should `as unknown as WidgetMountHost`
 * cast to bypass the static type mismatch (the same workaround the v1.2 path
 * uses at `childEditorFactory.ts:270-274`). The type stays optional in the
 * structural contract so test fixtures can omit it without TS complaining.
 */
export interface WidgetMountHost {
  app: {
    vault: {
      getConfig?(key: string): unknown;
      // Plan 19-02: DebouncedWriter consumes app.vault.read + app.vault.process.
      // Optional in the structural contract so test fixtures that exercise
      // mount-only paths can omit them.
      read?(file: unknown): Promise<string>;
      process?(file: unknown, fn: (body: string) => string): Promise<string>;
      on?(name: string, cb: (...args: unknown[]) => unknown): unknown;
    };
    metadataCache: {
      getFileCache(file: { path: string }):
        | { frontmatter?: Record<string, unknown> }
        | null;
    };
  };
  settings: {
    getIndentSizeOverride(): 'auto' | 2 | 4 | 8;
    getShowRelativeLineNumbers?(): boolean;
    /** Plan 19-02 — debounced writer delay. Optional so test fixtures may
     *  omit it; mount factory falls back to 400 (CONTEXT C-06 default). */
    getWidgetSyncDebounceMs?(): number;
  };
  widgetRegistry?: {
    get(key: string): unknown;
    set(key: string, ctl: unknown): void;
    has(key: string): boolean;
    delete(key: string): void;
  };
  /** Plan 19-02 — plugin-singleton suppression map. Optional so test fixtures
   *  for mount-only paths can omit it; mount factory creates a temporary
   *  no-op suppression when absent (test-mode-only). */
  selfWriteSuppression?: SelfWriteSuppression;
}

/**
 * Lightweight controller wrapping the embedded EditorView. Plan 19-02
 * binds an optional `writer` (DebouncedWriter) — when present, flushNow
 * proxies to writer.forceFlush; otherwise it's a no-op (test fixtures /
 * read-only mounts).
 */
export class WidgetController {
  /** Optional — Plan 19-02 mount factory sets this for editable widgets;
   *  Reading-mode read-only mounts and test fixtures may leave it undefined. */
  public writer?: DebouncedWriter;

  constructor(
    public readonly view: EditorView,
    public readonly container: HTMLElement,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly plugin: WidgetMountHost,
  ) {}

  /** Drain pending writer state. Returns the underlying forceFlush Promise
   *  when a writer is attached; otherwise resolves immediately. Called from
   *  WidgetRegistry.flushAll, MarkdownRenderChild.onunload, etc. */
  flushNow(): Promise<void> {
    if (this.writer) return this.writer.forceFlush();
    return Promise.resolve();
  }

  /** Tear down the embedded EditorView. Cancels any pending writer state
   *  first (registry callers always flushNow BEFORE destroy, so this is a
   *  defensive guard against re-entry / shutdown races). Idempotent. */
  destroy(): void {
    this.writer?.cancel();
    this.view.destroy();
  }

  /** Read the current widget document content (used by debouncedWriter). */
  getDoc(): string {
    return this.view.state.doc.toString();
  }
}

/**
 * Resolve the lc-language frontmatter slug, falling back to 'python' (Plan 19-01).
 * Plan 19-04 adds the Notice + observable fallback (WIDGET-06).
 */
function resolveLanguageSlug(plugin: WidgetMountHost, file: TFile): string {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const raw = fm?.['lc-language'];
  return typeof raw === 'string' && raw.length > 0 ? raw : 'python';
}

/**
 * Build the complete extensions array for the embedded EditorView. Lifted
 * from src/main/childEditorFactory.ts:252-416 with two intentional drops
 * (Plan 19-01 PATTERNS lines 222-223):
 *   - createScrollIntoViewExtension (lives in soon-deleted childEditorSync.ts)
 *   - syncExtensions parameter (Plan 19-02 will wire updateListener inline)
 *
 * NOTE: The conditional vim() injection follows the C-14 / VIM-01 contract —
 * read once at mount time; toggling `vimMode` at runtime requires a remount.
 */
function buildExtensions(
  plugin: WidgetMountHost,
  slug: string,
  readOnly: boolean,
  onDocChanged?: (update: ViewUpdate) => void,
): Extension[] {
  const indent = plugin.settings.getIndentSizeOverride();
  // C-14: read vimMode once at mount time. `getConfig` is an undocumented
  // Obsidian internal — call it defensively so test fixtures (and any future
  // host that omits it) don't crash at mount.
  const getConfig = plugin.app.vault.getConfig;
  const vimEnabled =
    typeof getConfig === 'function' &&
    (getConfig.call(plugin.app.vault, 'vimMode') as boolean | undefined) === true;

  const exts: Extension[] = [
    // 1. Language Compartment (C-12 — 8 packs).
    languageCompartment.of(buildLanguageExtensions(slug, indent)),
    // 2. Conditional vim — only when Obsidian's vim setting is on.
    ...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
    // 3. Top-level closeBracketsKeymap (Pitfall D from Phase 16 — Backspace
    //    handler must precede defaultKeymap's).
    keymap.of(closeBracketsKeymap),
    // 4. Themed highlight + bracket matching (THEME-01..03 carry-over).
    obsidianSemanticClasses,
    ...createThemedHighlight(),
    bracketMatching(),
    // 5. Editing primitives.
    history(),
    drawSelection(),
    highlightActiveLine(),
    // 6. Main keymap — defaultKeymap + historyKeymap.
    keymap.of([...defaultKeymap, ...historyKeymap]),
    // 7. Indent unit per language pack.
    indentUnit.of('    '),
    // 8. Theme block lifted verbatim from childEditorFactory.ts:381-395.
    EditorView.theme({
      '&': {
        background: 'var(--code-background, var(--background-secondary))',
        borderRadius: '4px',
        padding: '8px 0',
      },
      '.cm-content': {
        fontFamily: 'var(--font-monospace)',
        fontSize: 'var(--font-text-size)',
      },
      '.cm-gutters': {
        background: 'transparent',
        borderRight: 'none',
      },
    }),
    // 9. Read-only gate (WIDGET-07): Reading mode passes readOnly=true so
    //    EditorView.editable.of(false) makes the embedded editor read-only.
    EditorView.editable.of(!readOnly),
    // 10. Line wrapping carry-over.
    EditorView.lineWrapping,
  ];
  // 11. Plan 19-02 — debouncedWriter binding via updateListener.of. Only
  //     editable widgets register the listener; read-only widgets skip it
  //     (no doc changes are possible).
  if (!readOnly && onDocChanged) {
    exts.push(
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) onDocChanged(update);
      }),
    );
  }
  return exts;
}

/**
 * Mount factory shared by Reading-mode (LeetCodeWidgetRenderChild.onload) and
 * Live-Preview (LeetCodeFenceWidget.toDOM). Builds the container DOM, the
 * embedded EditorView with carry-over extensions, attaches the
 * mousedown.stopPropagation defense (CONTEXT D-02), and registers the
 * controller in plugin.widgetRegistry.
 *
 * Plan 19-01: fenceIndex defaults to 0 when computeFenceIndex isn't reachable
 * (no MarkdownSectionInformation context). The mount-on-Live-Preview path
 * (Plan 19-04) computes fenceIndex from CM6's findCodeFence; the Reading-mode
 * path uses the wrapper's onload-stage MarkdownSectionInformation.
 */
export function mountLeetCodeWidget(
  host: HTMLElement,
  source: string,
  file: TFile,
  plugin: WidgetMountHost,
  readOnly: boolean,
  fenceIndex = 0,
): WidgetController {
  // CONTEXT C-13 + PATTERNS line 1101 — three classes, two carry-over
  // (lc-nested-editor + HyperMD-codeblock) plus the v1.3-specific
  // lc-leetcode-solve so Phase 22 polish can target widgets specifically.
  const container = document.createElement('div');
  container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve';
  host.appendChild(container);

  const slug = resolveLanguageSlug(plugin, file);

  // Plan 19-02 — declare controller upfront so the updateListener closure can
  // call into ctl.writer (which is set after view construction).
  let ctl: WidgetController;
  const onDocChanged = readOnly
    ? undefined
    : () => { ctl?.writer?.run(); };

  const state = EditorState.create({
    doc: source,
    extensions: buildExtensions(plugin, slug, readOnly, onDocChanged),
  });

  const view = new EditorView({ state, parent: container });

  // CONTEXT D-02: stopPropagation FIRST (raw-source-reveal mitigation), THEN
  // click-to-focus (carry-over from childEditorFactory.ts:405-413). Order
  // matters — stopPropagation must execute before parent handlers see the event.
  if (view.dom) {
    view.dom.addEventListener('mousedown', (e: Event) => {
      e.stopPropagation();
    });
    view.dom.addEventListener('mousedown', () => {
      window.requestAnimationFrame(() => {
        if (document.activeElement !== view.contentDOM) {
          view.contentDOM.focus();
        }
      });
    });
  }

  ctl = new WidgetController(view, container, file, fenceIndex, plugin);

  // Plan 19-02 — wire the DebouncedWriter for editable widgets when the
  // plugin host provides the required app.vault.read/process methods AND a
  // selfWriteSuppression instance. Read-only mounts skip the writer entirely.
  if (
    !readOnly &&
    plugin.app.vault.read &&
    plugin.app.vault.process &&
    plugin.selfWriteSuppression
  ) {
    const delayMs = plugin.settings.getWidgetSyncDebounceMs?.() ?? 400;
    ctl.writer = new DebouncedWriter(
      plugin.app as never,
      file as never,
      () => view.state.doc.toString(),
      // Plan 19-02 — flush-time fenceIndex is stored on the controller and
      // passed verbatim. Drift detection (Pitfall 19-E) happens INSIDE
      // DebouncedWriter.flush() by counting openers in fresh disk content.
      () => ctl.fenceIndex,
      plugin.selfWriteSuppression,
      delayMs,
    );
  }

  // Register in plugin.widgetRegistry if present (set by main.ts onload when
  // useInlineWidget=ON; Plan 19-04 controller cleanup uses this).
  if (plugin.widgetRegistry) {
    plugin.widgetRegistry.set(`${file.path}::${fenceIndex}`, ctl);
  }

  return ctl;
}

/**
 * Reading-mode lifecycle wrapper. Registered via `ctx.addChild(...)` from
 * the codeBlockProcessor. Lifecycle: onload mounts the widget; onunload
 * flushes (no-op in Plan 19-01) + destroys + unregisters.
 */
export class LeetCodeWidgetRenderChild extends MarkdownRenderChild {
  private controller?: WidgetController;
  public readonly fenceIndex: number;

  constructor(
    host: HTMLElement,
    private readonly source: string,
    _ctx: MarkdownPostProcessorContext,
    private readonly plugin: WidgetMountHost,
    private readonly file: TFile,
    info: MarkdownSectionInformation,
    private readonly readOnly: boolean,
  ) {
    super(host);
    // CONTEXT D-01 — count prior `\`\`\`leetcode-solve` openers in the
    // section text. info.lineStart is 0-indexed line of the fence opener.
    this.fenceIndex = computeFenceIndex(info.text, info.lineStart);
  }

  onload(): void {
    this.controller = mountLeetCodeWidget(
      this.containerEl,
      this.source,
      this.file,
      this.plugin,
      this.readOnly,
      this.fenceIndex,
    );
  }

  onunload(): void {
    // Plan 19-02 — flushNow returns a Promise; fire-and-forget here because
    // MarkdownRenderChild.onunload is sync-shaped. Race-safe: destroy()
    // cancels the writer, so the in-flight write either lands or aborts
    // cleanly. The widgetRegistry.flushAll path (Plugin.onunload) is the
    // load-bearing one for graceful shutdown — see RESEARCH Pitfall 19-B.
    const p = this.controller?.flushNow();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
    this.controller?.destroy();
    this.plugin.widgetRegistry?.delete(`${this.file.path}::${this.fenceIndex}`);
  }
}
