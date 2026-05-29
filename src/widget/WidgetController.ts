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

/**
 * Plugin-host shape required by the widget mount factory. Structurally typed
 * so unit tests (which mock @codemirror/* and the v1.2 source modules) can
 * pass plain object literals without spinning up a real LeetCodePlugin.
 */
export interface WidgetMountHost {
  app: {
    vault: { getConfig(key: string): unknown };
    metadataCache: {
      getFileCache(file: { path: string }):
        | { frontmatter?: Record<string, unknown> }
        | null;
    };
  };
  settings: {
    getIndentSizeOverride(): 'auto' | 2 | 4 | 8;
    getShowRelativeLineNumbers?(): boolean;
  };
  widgetRegistry?: {
    get(key: string): unknown;
    set(key: string, ctl: unknown): void;
    has(key: string): boolean;
    delete(key: string): void;
  };
}

/**
 * Lightweight controller wrapping the embedded EditorView. Plan 19-01 ships
 * `flushNow` as a no-op stub (the debouncedWriter lands in Plan 19-02).
 * `getDoc` lets callers (debouncedWriter, tests) inspect current widget content.
 */
export class WidgetController {
  constructor(
    public readonly view: EditorView,
    public readonly container: HTMLElement,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly plugin: WidgetMountHost,
  ) {}

  /** Plan 19-01 stub — no-op. Plan 19-02 wires this to debouncedWriter.flush(). */
  flushNow(): void {
    /* Plan 19-01: no debouncedWriter yet; leave a no-op. */
  }

  /** Tear down the embedded EditorView. Idempotent. */
  destroy(): void {
    this.view.destroy();
  }

  /** Read the current widget document content (used by debouncedWriter in Plan 19-02). */
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
): Extension[] {
  const indent = plugin.settings.getIndentSizeOverride();
  // C-14: read vimMode once at mount time. Cast through unknown because
  // app.vault.getConfig is typed loosely on the structural host shape.
  const vimEnabled =
    (plugin.app.vault.getConfig('vimMode') as boolean | undefined) === true;

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
  const state = EditorState.create({
    doc: source,
    extensions: buildExtensions(plugin, slug, readOnly),
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

  const ctl = new WidgetController(view, container, file, fenceIndex, plugin);

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
    this.controller?.flushNow();
    this.controller?.destroy();
    this.plugin.widgetRegistry?.delete(`${this.file.path}::${this.fenceIndex}`);
  }
}
