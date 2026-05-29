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
  Notice,
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
import type { StatePersistenceMap } from './statePersistence';

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
  /** Plan 19-03 — plugin-singleton state persistence map (CONTEXT C-09 +
   *  D-01 + RESEARCH Pattern 4). Optional so test fixtures may omit it;
   *  mount factory falls through gracefully when absent (no hydrate, no
   *  capture). Set in main.ts onload behind useInlineWidget=ON. */
  statePersistence?: StatePersistenceMap;
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

  /** Plan 19-03 — `${file.path}::${fenceIndex}` key used by both the
   *  widgetRegistry (Plan 19-01) and statePersistence map (Plan 19-03).
   *  Computed once at construction; readers (capture-on-unmount in
   *  LeetCodeWidgetRenderChild.onunload + LeetCodeFenceWidget.destroy) use
   *  this so they don't have to recompute the key shape. */
  public readonly persistenceKey: string;

  constructor(
    public readonly view: EditorView,
    public readonly container: HTMLElement,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly plugin: WidgetMountHost,
  ) {
    this.persistenceKey = `${file.path}::${fenceIndex}`;
  }

  /** Drain pending writer state. Returns the underlying forceFlush Promise
   *  when a writer is attached; otherwise resolves immediately. Called from
   *  WidgetRegistry.flushAll, MarkdownRenderChild.onunload, etc. */
  flushNow(): Promise<void> {
    if (this.writer) return this.writer.forceFlush();
    return Promise.resolve();
  }

  /** Tear down the embedded EditorView. Plan 19-03 — capture state into the
   *  plugin-singleton statePersistence map BEFORE destroying the view, so
   *  callers that bypass the lifecycle wrappers (LeetCodeWidgetRenderChild
   *  onunload / LeetCodeFenceWidget.destroy(dom)) still get the belt-and-
   *  suspenders coverage. The wrappers also captureState explicitly — the
   *  duplicate calls are idempotent (a re-arm with the latest state).
   *  Cancels any pending writer state (registry callers always flushNow
   *  BEFORE destroy, so this is a defensive guard against re-entry /
   *  shutdown races). Idempotent. */
  destroy(): void {
    if (this.plugin.statePersistence) {
      try {
        this.plugin.statePersistence.captureState(this.persistenceKey, this.view);
      } catch {
        // Defensive — capture is best-effort.
      }
    }
    this.writer?.cancel();
    this.view.destroy();
  }

  /** Read the current widget document content (used by debouncedWriter). */
  getDoc(): string {
    return this.view.state.doc.toString();
  }
}

/**
 * Plan 19-04 — KNOWN_SLUGS allowlist for `lc-language` frontmatter
 * (WIDGET-06). Mirrors the slugs handled by `buildLanguageExtensions` in
 * `src/main/childEditorLanguage.ts:90-114`. Anything outside this list
 * triggers the Notice + Python fallback.
 *
 * NOTE: The list keeps the original v1.2 chevron slugs (`python3`, `golang`,
 * etc.) as canonical entries. Common synonyms (`python`, `js`, `ts`, `go`)
 * are also accepted because users hand-author frontmatter and these aliases
 * are intuitive — Plan 19-04 PLAN's KNOWN_SLUGS list explicitly includes them.
 */
const KNOWN_SLUGS: ReadonlyArray<string> = [
  'python',
  'python3',
  'java',
  'cpp',
  'c',
  'javascript',
  'js',
  'typescript',
  'ts',
  'golang',
  'go',
  'rust',
];

/**
 * Resolve the lc-language frontmatter slug for a file. Plan 19-04 (WIDGET-06):
 * unknown / missing → Python fallback + Notice exactly once per mount call.
 *
 * Per VALIDATION row 19-04-03 the Notice fires PER MOUNT — there is no
 * cross-mount deduplication. Re-mounting the same widget DOES fire a fresh
 * Notice; that's the contract.
 */
function resolveLanguageSlug(plugin: WidgetMountHost, file: TFile): string {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const raw = fm?.['lc-language'];

  if (typeof raw === 'string' && raw.length > 0) {
    const lower = raw.toLowerCase();
    if (KNOWN_SLUGS.includes(lower)) {
      return lower;
    }
    // Plan 19-04 — unknown lc-language → Python + Notice.
    new Notice(
      `LeetCode widget: lc-language '${raw}' not supported; falling back to Python.`,
      5000,
    );
    return 'python';
  }

  // Plan 19-04 — missing lc-language → Python + Notice.
  new Notice(
    'LeetCode widget: lc-language frontmatter missing; falling back to Python.',
    5000,
  );
  return 'python';
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

  // Shared visual extensions (both editable and read-only).
  const visual: Extension[] = [
    languageCompartment.of(buildLanguageExtensions(slug, indent)),
    obsidianSemanticClasses,
    ...createThemedHighlight(),
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
    EditorView.editable.of(!readOnly),
    EditorView.lineWrapping,
  ];

  // Read-only mode: only syntax highlighting + theme — no editing chrome.
  if (readOnly) return visual;

  // Editable mode: full interactive extensions.
  const exts: Extension[] = [
    ...visual,
    // Conditional vim (BLOCKER 1 fix: gated on !readOnly above).
    ...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
    // closeBracketsKeymap before defaultKeymap (Pitfall D from Phase 16).
    keymap.of(closeBracketsKeymap),
    bracketMatching(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    indentUnit.of('    '),
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

  // Plan 19-03 — hydrate previously-captured cursor + scroll if the plugin
  // host provides a statePersistence map AND we're within the 30s TTL window.
  // Order: AFTER view construction, BEFORE the debouncedWriter is bound and
  // BEFORE the updateListener fires — so the hydrate dispatch can't trigger
  // a self-flush. CONTEXT D-02 belt-and-suspenders: this restores state on
  // every unmount path (cursor approach + viewport scroll + mode switch +
  // theme change). Hydrate is a no-op when no entry exists OR when the
  // persistence map is absent (test fixtures).
  plugin.statePersistence?.hydrateState(ctl.persistenceKey, view);

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
    // Plan 19-03 — capture cursor + scroll + history JSON BEFORE flushing
    // and destroying. The state is preserved in the plugin-singleton
    // statePersistence map (30s TTL) so a subsequent remount within the
    // window restores cursor and scroll. CONTEXT D-02 belt-and-suspenders.
    // Capture even on read-only mounts (legitimate UX: scrolling through
    // an embed and reopening should restore scroll position).
    if (this.controller && this.plugin.statePersistence) {
      try {
        this.plugin.statePersistence.captureState(
          this.controller.persistenceKey,
          this.controller.view,
        );
      } catch {
        // Defensive — capture is best-effort; never block unmount on it.
      }
    }
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
