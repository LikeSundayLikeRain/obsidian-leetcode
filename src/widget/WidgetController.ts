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
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type Extension,
} from '@codemirror/state';
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
import { computeFenceIndex, findCodeFence } from './fenceLocator';
import { DebouncedWriter, sha1 } from './debouncedWriter';
import { extractFenceBody } from './fenceSerialization';
import type { SelfWriteSuppression } from './selfWriteSuppression';
import { createChildParentSyncExtension } from './childParentSync';
import type { StatePersistenceMap } from './statePersistence';
import { readVimModeFromVault } from './vimMode';
import { isEmbedContext } from './embedDetect';
import { mountActionRow, type WidgetActionRowCtl } from './widgetActions';

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
      // Phase 20 Plan 20-02 (ACTION-03) — per-widget reactivity hook.
      // Optional in the structural contract so test fixtures can omit it.
      on?(
        name: 'changed',
        cb: (file: { path: string }) => unknown,
      ): unknown;
      offref?(ref: unknown): void;
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
 * Phase 20 Plan 20-05 — resolve a stable per-pane id for the host element.
 *
 * Walks up to the closest `.workspace-leaf` ancestor (production Obsidian
 * renders every pane inside one) and either reads its existing
 * `data-lc-leaf-id` or assigns a fresh one. Two distinct leaves return
 * distinct ids; the same leaf returns the same id across calls.
 *
 * When the host is detached (test fixtures, popout edges), falls back to a
 * per-mount UUID so two such mounts still produce distinct keys (no clobber).
 *
 * Exported so the regression test in `tests/widget/registryKeyPerPane.test.ts`
 * can exercise it directly without spinning up a full mountLeetCodeWidget call.
 */
export function resolveLeafId(host: HTMLElement | null | undefined): string {
  try {
    const leafEl = host?.closest?.('.workspace-leaf') as HTMLElement | null;
    if (leafEl) {
      const existing = leafEl.getAttribute('data-lc-leaf-id');
      if (existing) return existing;
      const id = generateLeafId();
      leafEl.setAttribute('data-lc-leaf-id', id);
      return id;
    }
  } catch {
    // Fall through to UUID fallback.
  }
  return generateLeafId();
}

function generateLeafId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // happy-dom fallback — sufficient uniqueness for test envs.
  return `lc-leaf-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Lightweight controller wrapping the embedded EditorView. Plan 19-02
 * binds an optional `writer` (DebouncedWriter) — when present, flushNow
 * proxies to writer.forceFlush; otherwise it's a no-op (test fixtures /
 * read-only mounts).
 *
 * Phase 20 Plan 20-01 (VIM-02) — owns a per-widget `vimCompartment` and the
 * mount-time `mountedVimMode` boolean. `reconfigureVim(enabled)` swaps
 * `vim() ↔ []` via `Compartment.reconfigure` so the user can toggle vim
 * mode in Obsidian Settings and have widgets pick up the change without
 * note reload (preserves cursor + scroll + undo).
 */
export class WidgetController {
  /** Optional — Plan 19-02 mount factory sets this for editable widgets;
   *  Reading-mode read-only mounts and test fixtures may leave it undefined. */
  public writer?: DebouncedWriter;

  /** Plan 19-03 — `${file.path}::${fenceIndex}` key used by the
   *  statePersistence map (Plan 19-03). Computed once at construction.
   *
   *  IMPORTANT: This key is INTENTIONALLY pane-blind — state hydration is
   *  per-fence-content, not per-pane. A remount in the same logical pane
   *  should still hydrate from the captured cursor regardless of which
   *  workspace-leaf hosts it. Phase 20 Plan 20-05 split the registry key
   *  (pane-aware) from the persistence key (pane-blind) for this reason. */
  public readonly persistenceKey: string;

  /** Phase 20 Plan 20-05 — per-pane registry key
   *  `${file.path}::${fenceIndex}::${leafId}` used by the widgetRegistry.
   *  Distinct from `persistenceKey` so two panes on the same file co-exist
   *  in the registry (multi-pane CTA symmetry + no destroy clobber). */
  public readonly registryKey: string;

  /** Phase 20 Plan 20-01 — per-widget Compartment for the vim() extension.
   *  Owned by the controller (NOT module-singleton like languageCompartment)
   *  because each widget has its own EditorView and Compartments are
   *  identity-keyed; module-singleton would dispatch to all widgets at once
   *  which is correct for languageCompartment but unnecessary for vim
   *  because the plugin-side `workspace.on('layout-change')` listener
   *  iterates `widgetRegistry.values()` and is the single fan-out. */
  public readonly vimCompartment: Compartment;

  /** Phase 20 Plan 20-01 — last vim mode value applied to the widget.
   *  Mutated by `reconfigureVim` for the early-return no-op gate (so
   *  layout-change events that don't actually flip vim mode don't dispatch
   *  redundant Compartment.reconfigure to every widget). */
  public mountedVimMode: boolean;

  /** Phase 20 Plan 20-09 (amended) — debounced child→parent sync handle.
   *  Exposes `flushSync()` for imperative callers (flush-on-unload,
   *  flush-on-leaf-change, Cmd-Q) and `cancel()` for teardown. */
  public syncHandle?: import('./childParentSync').ChildParentSyncHandle;

  /** Phase 20 Plan 20-02 (ACTION-01) — action row mounted inside the widget
   *  container as a sibling of `.cm-editor`. Set by `mountLeetCodeWidget`
   *  AFTER controller construction when `!isEmbedContext(...)`. Used by
   *  Plan 20-04 retheme + multi-pane affordance to walk widget DOM. */
  public actionRow?: HTMLDivElement;

  /** Phase 20 Plan 20-08 (gap-closure for language-switch-not-wired) —
   *  refresh closure returned by `mountActionRow` that updates the chevron's
   *  label text and `.is-current` marker without remounting. Called by the
   *  per-widget metadataCache 'changed' listener AFTER the existing
   *  `languageCompartment.reconfigure` dispatch. Optional — undefined when
   *  the action row mount was skipped (embed widgets, test fixtures). */
  public actionRowRefresh?: (newSlug: string) => void;

  /** Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — embed-context
   *  flag captured at mount time. Embed widgets (`![[note#Code]]` transclusion
   *  per Phase 19 EMBED-01..04) are read-only display surfaces; the multi-pane
   *  coordinator MUST skip them so a peer-detected embed doesn't gain a
   *  "Click to take over" CTA the user can never act on (the embedding host
   *  doesn't own the file). Set by `mountLeetCodeWidget` from the existing
   *  `isEmbedContext` probe right before action-row mount. Defaults to `false`
   *  for safety so test fixtures that bypass the probe still drive coordinator
   *  paths. */
  public isEmbed: boolean = false;

  /** Phase 20-09 (post-mortem fix): readOnly flag captured at mount time.
   *  Used by the adoption predicate so a Reading-mode RenderChild does not
   *  pick up an editable LP-mode controller (which would show the editable
   *  CM6 + vim status line + interactive editor in Reading view).
   *
   *  Defaults to `false` (editable) for legacy test fixtures that construct
   *  controllers directly. Production mountLeetCodeWidget sets this from the
   *  readOnly parameter. */
  public readOnly: boolean = false;

  /** Phase 20-09 (post-mortem fix): captured at onunload time — was the
   *  contentDOM the document.activeElement before the post-processor
   *  remount? Used by the adoption refocus path so multi-pane scenarios
   *  don't steal focus to the non-typing pane. Only restored on adoption
   *  if true. */
  public hadFocusBeforeUnload: boolean = false;

  /** Phase 20 Plan 20-04 — overlay div mounted as a sibling of `.cm-editor`
   *  when this widget is in `peer` pane state. Click on overlay promotes the
   *  pane via `app.workspace.setActiveLeaf(<this widget's leaf>)`. Tracked on
   *  the controller so `setPaneState('active')` can remove it cleanly. */
  public takeoverOverlay?: HTMLDivElement;

  /** Phase 20 Plan 20-04 — current pane affordance state. Default `'active'`
   *  matches the v1.3 baseline (single widget per file == always active);
   *  multi-pane peer flips it to `'peer'` which mounts the overlay + CTA. */
  public paneState: 'active' | 'peer' = 'active';

  /** Phase 20 Plan 20-02 (Pitfall P2 absorption + carry-forward to Plan 20-03).
   *  Hash of the current widget doc body — used by the modify-handler
   *  early-return so frontmatter-only writes (e.g., chevron switch via
   *  processFrontMatter) don't trigger a widget reload. Computed at
   *  construction and updated on every successful local write. */
  public currentDocHash: string = '';

  /** Phase 20 Plan 20-02 (ACTION-02 reactivity) — per-widget metadataCache
   *  subscription EventRef. Stored so destroy() can offref it cleanly. The
   *  subscription dispatches `languageCompartment.reconfigure(...)` on every
   *  `metadataCache.on('changed')` fire whose file matches widget.file.path.
   *  Optional — set by mountLeetCodeWidget when the host's metadataCache.on
   *  is available (production); test fixtures may omit. */
  public metadataChangedRef?: unknown;

  constructor(
    public readonly view: EditorView,
    public readonly container: HTMLElement,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly plugin: WidgetMountHost,
    vimCompartment: Compartment,
    mountedVimMode: boolean,
    registryKey?: string,
  ) {
    this.persistenceKey = `${file.path}::${fenceIndex}`;
    // Phase 20 Plan 20-05 — registryKey defaults to persistenceKey when
    // omitted (test fixtures may construct without a leafId). Production
    // mountLeetCodeWidget always passes the per-pane key explicitly.
    this.registryKey = registryKey ?? this.persistenceKey;
    this.vimCompartment = vimCompartment;
    this.mountedVimMode = mountedVimMode;
  }

  /**
   * Phase 20 Plan 20-02 (ACTION-02) — read-only accessor for the current
   * `lc-language` slug from frontmatter. Mirrors the WIDGET-06 fallback at
   * `resolveLanguageSlug` above (Python default when missing/non-string)
   * but without firing the Notice (chevron / action row reads are silent).
   *
   * Used by `mountActionRow` to label the chevron and by Plan 20-03 reload
   * paths that need to know the widget's current slug.
   */
  get currentSlug(): string {
    const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const raw = fm?.['lc-language'];
    if (typeof raw === 'string' && raw.length > 0) return raw;
    return 'python3';
  }

  /** Drain pending writer state + sync timer. Returns the underlying
   *  forceFlush Promise when a writer is attached; otherwise resolves
   *  immediately. Called from WidgetRegistry.flushAll, onunload, etc. */
  flushNow(): Promise<void> {
    this.syncHandle?.flushSync();
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
    this.syncHandle?.cancel();
    // Phase 20 Plan 20-02 — drop per-widget metadataCache subscription.
    // The `app.metadataCache.offref` API mirrors the workspace.offref shape;
    // the structural type for `plugin.app.metadataCache` doesn't declare it,
    // so we cast through `unknown` (the same workaround the v1.2 path uses
    // at childEditorFactory.ts:270-274 for getConfig).
    if (this.metadataChangedRef) {
      try {
        const mc = this.plugin.app.metadataCache as unknown as {
          offref?: (ref: unknown) => void;
        };
        mc.offref?.(this.metadataChangedRef);
      } catch {
        // Defensive — offref may throw if the ref is stale.
      }
      this.metadataChangedRef = undefined;
    }
    // Phase 20 Plan 20-04 — drop the multi-pane overlay if mounted. The
    // overlay's event listeners are anchored to the overlay element itself,
    // so removing the element from the DOM is sufficient (browsers GC the
    // listeners with the element).
    if (this.takeoverOverlay) {
      try {
        this.takeoverOverlay.remove();
      } catch {
        /* swallow — already detached */
      }
      this.takeoverOverlay = undefined;
    }
    this.view.destroy();
  }

  /** Read the current widget document content (used by debouncedWriter). */
  getDoc(): string {
    return this.view.state.doc.toString();
  }

  /**
   * Phase 20 Plan 20-03 (SYNC-04 / D-conflict-03) — replace the widget doc
   * with the current disk content via a single CM6 transaction that
   * preserves cursor + scroll. Two reasons (informational only — both paths
   * use the same line/col clamp mechanic):
   *
   *   - 'silent'        — vault.on('modify') fired with no in-flight typing;
   *                       reload silently. The user sees their cursor land
   *                       on the same logical line:col (clamped to new doc
   *                       bounds if line/col shrunk).
   *   - 'keep-external' — user picked "Keep external" in the ConflictModal;
   *                       reload + close modal. SAME line/col clamp.
   *
   * Cursor preservation algorithm (CONTEXT D-conflict-03):
   *   1. Capture (line, col) from `view.state.selection.main.head` BEFORE
   *      the dispatch.
   *   2. Read fresh disk via `app.vault.read(file)`; extract the fence body
   *      for this widget's `fenceIndex` via `extractFenceBody`.
   *   3. If newBody === current widget doc → no-op (guards against
   *      unnecessary history pollution and selection jitter).
   *   4. Compute targetLine = min(originalLine, newLineCount); walk to its
   *      `from` index; clamp col to that line's length; compute restoredHead.
   *   5. Dispatch a SINGLE transaction with full-doc replacement +
   *      EditorSelection.cursor(restoredHead) + Transaction.addToHistory.of
   *      (false) annotation (so reload doesn't pollute the undo stack).
   *   6. Restore `view.scrollDOM.scrollTop`.
   *
   * L8 LIMITATION (post-resolution undo continuity, documented per CONTEXT):
   *   The 'keep-external' path replaces the doc but the widget's history
   *   StateField (and the captured Phase 19 historyJSON) reference doc
   *   states that no longer exist after the dispatch. Pressing Cmd-Z after
   *   a "Keep external" resolution does nothing useful — accepted tradeoff.
   *   Phase 19's historyJSON capture is reserved for richer undo strategies
   *   in v1.4+; Plan 20-03 ships best-effort with the addToHistory.of(false)
   *   annotation as the documented MVP.
   *
   * The `reason` parameter is currently informational only; both reasons
   * follow the same line/col clamp body. Future variants (e.g., "force-
   * preserve-cursor-near-edit") may diverge — the parameter shape exists so
   * call sites declare intent at the type level.
   */
  async reloadFromDisk(reason: 'silent' | 'keep-external'): Promise<void> {
    void reason; // informational only — see JSDoc above

    // (1) Capture cursor + scroll BEFORE any await; line/col is more stable
    // than absolute offset across content edits.
    const head = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(head);
    const col = head - line.from;
    const lineNumber = line.number;
    const scrollTop = this.view.scrollDOM?.scrollTop ?? 0;

    // (2) Read fresh disk; extract fence body for this widget's index.
    // The plugin-host shape declares `read` as optional; production
    // LeetCodePlugin satisfies the contract, but we defensively guard to
    // keep test fixtures (which may omit read) from crashing.
    const readFn = this.plugin.app.vault.read;
    if (typeof readFn !== 'function') return;
    let newDisk: string;
    try {
      newDisk = await readFn.call(this.plugin.app.vault, this.file as never);
    } catch {
      // I/O failure (file deleted, etc.) — abort silently.
      return;
    }
    const newBody = extractFenceBody(newDisk, this.fenceIndex) ?? '';

    // (3) No-op when the disk fence body matches the widget doc — happens
    // when an external write touched OTHER fences in the same file but
    // not this widget's, or when the modify event is racing a self-write.
    if (newBody === this.view.state.doc.toString()) return;

    // (4) Compute the clamped restoredHead via line/col clamp.
    const newDocLength = newBody.length;
    const newLineCount = newBody === '' ? 1 : (newBody.match(/\n/g)?.length ?? 0) + 1;
    const targetLine = Math.min(lineNumber, newLineCount);
    let targetLineFrom = 0;
    for (let i = 1; i < targetLine; i++) {
      const idx = newBody.indexOf('\n', targetLineFrom);
      if (idx < 0) break;
      targetLineFrom = idx + 1;
    }
    const targetLineEndIdx = newBody.indexOf('\n', targetLineFrom);
    const targetLineLength =
      (targetLineEndIdx < 0 ? newBody.length : targetLineEndIdx) - targetLineFrom;
    const targetCol = Math.min(col, targetLineLength);
    const restoredHead = Math.min(targetLineFrom + targetCol, newDocLength);

    // (5) Single transaction: full-doc replacement + restored cursor +
    // addToHistory.of(false) so reload doesn't pollute the undo stack
    // (T-20-03-03 mitigation surface — Cmd-Z after Keep external is a no-op).
    try {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: newBody },
        selection: EditorSelection.cursor(restoredHead),
        annotations: [Transaction.addToHistory.of(false)],
      });
    } catch {
      // Defensive — view may be in teardown.
      return;
    }

    // (6) Restore scroll. jsdom doesn't compute layout but assignment to
    // scrollTop is observable; production CM6 will preserve the view
    // position on the next frame.
    if (this.view.scrollDOM) {
      this.view.scrollDOM.scrollTop = scrollTop;
    }

    // Phase 20 Plan 20-03 — refresh currentDocHash so the modify-handler
    // early-return correctly absorbs the trailing modify event for THIS
    // reload (production app.vault.read may fire its own modify echo).
    void sha1(newBody).then((hash) => {
      this.currentDocHash = hash;
    });
  }

  /**
   * Phase 20 Plan 20-01 (VIM-02) — live reconfigure of the vim Compartment
   * payload. Early-returns when the requested value matches the cached
   * `mountedVimMode` (no-op gate; the plugin-side layout-change listener
   * fires on EVERY layout change, not just vim-mode flips, so the gate is
   * load-bearing — see Step 3 of 20-01-PLAN). Otherwise mutates the cached
   * value FIRST then dispatches `vimCompartment.reconfigure(...)`.
   *
   * No `userEvent` annotation needed — the widget's own EditorView has no
   * section-protection extension installed; only the parent does.
   *
   * Compartment.reconfigure preserves cursor + scroll + undo (Phase 16
   * Pitfall C; verified analog to languageCompartment.reconfigure). The
   * Phase 20 Plan 20-01 dev-vault probe (Step 5) confirms vim-specific
   * behavior — pre-accepted VIM-03 banner fallback at Phase 22 if it fails.
   */
  reconfigureVim(enabled: boolean): void {
    if (this.mountedVimMode === enabled) return;
    this.mountedVimMode = enabled;
    this.view.dispatch({
      effects: this.vimCompartment.reconfigure(
        enabled ? vim({ status: true } as Parameters<typeof vim>[0]) : [],
      ),
    });
  }

  /**
   * Phase 20 Plan 20-04 (THEME-04) — live theme retheme.
   *
   * Calls `view.requestMeasure()` to force CM6 to recompute layout metrics
   * on the next animation frame. NO EditorView rebuild; cursor + scroll +
   * undo state preserved. The actual visual retheme is owned by the
   * cascading CSS class chain — `lc-nested-editor` + `HyperMD-codeblock` +
   * `childEditorSemanticClasses` Lezer→CSS-class outputs — all carried over
   * from v1.2 per Phase 19 THEME-01..THEME-03. Those classes already
   * inherit Obsidian's `var(--code-keyword)`, `var(--background-primary)`,
   * `var(--text-normal)`, etc., so a theme swap repaints them
   * automatically via Obsidian's stylesheet replace. This method only
   * exists to nudge CM6 to recompute layout-affected metrics (line height,
   * gutter widths, scroll offsets) AFTER the new computed styles apply.
   *
   * Called from `src/widget/themeListener.ts` registered in
   * `src/main.ts:Plugin.onload()` under the `useInlineWidget=ON` block.
   * Single fan-out: `app.workspace.on('css-change')` → walk
   * `widgetRegistry.values()` → call this method per controller.
   *
   * Idempotent — calling it on a non-theme `css-change` (e.g., Obsidian
   * sidebar drawer toggle that happens to fire the event) is benign per
   * threat T-20-04-05; `requestMeasure` schedules a remeasure that
   * produces no visible flicker when the layout is unchanged.
   */
  cssRetheme(): void {
    // Defensive — view may be in teardown when the css-change event arrives.
    // Production CM6 throws on requestMeasure-after-destroy; swallow silently
    // because the css-change global listener is fire-and-forget.
    try {
      this.view.requestMeasure();
    } catch {
      /* swallow — defensive against teardown race */
    }
  }

  /**
   * Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — flip the widget
   * between `'active'` (editable, no overlay) and `'peer'` (greyed-out
   * overlay + "Click to take over" CTA per UI-SPEC §3).
   *
   * `'active'`:
   *   - Sets `data-pane-state="active"` on the container.
   *   - Removes `takeoverOverlay` if mounted.
   *
   * `'peer'`:
   *   - Sets `data-pane-state="peer"` on the container.
   *   - Mounts a `.lc-takeover-overlay` div with a `.lc-takeover-cta` button
   *     ("Click to take over") if not already present.
   *   - Click handler calls `app.workspace.setActiveLeaf(<this widget's leaf>)`
   *     which fires `active-leaf-change` synchronously; the coordinator's
   *     listener then flips peer→active in the same animation frame
   *     (UI-SPEC §3 "race window ≈16ms").
   *
   * SECURITY (T-20-04-03 mitigation):
   *   - Overlay text is created via `createEl({ text })` / `setText` — NEVER
   *     `innerHTML`. CTA copy is hardcoded "Click to take over" — not user-
   *     controlled (CLAUDE.md no-innerHTML rule).
   *
   * EMBED GATE (Phase 19 EMBED-01..04):
   *   - Embed widgets (`isEmbed === true`) are read-only display surfaces;
   *     a "Click to take over" CTA inside an embed would mislead the user
   *     (the embedding host doesn't own the file). Early-return for embed
   *     widgets — they always remain visually `'active'` regardless of pane
   *     focus. The coordinator's iterator filter is the primary gate; this
   *     is belt-and-suspenders.
   *
   * Idempotent — calling with the same state is a no-op (early-return on
   * matching `paneState`). The DOM mutation cost is bounded.
   */
  setPaneState(state: 'active' | 'peer'): void {
    // Embed gate — never apply peer affordance to embed widgets.
    if (this.isEmbed) {
      this.paneState = 'active';
      try {
        this.container.setAttribute('data-pane-state', 'active');
      } catch {
        /* swallow — defensive against teardown */
      }
      return;
    }

    // Idempotent guard — no-op when state already matches.
    if (this.paneState === state) return;
    this.paneState = state;

    try {
      this.container.setAttribute('data-pane-state', state);
    } catch {
      // Defensive — container may be in teardown.
      return;
    }

    if (state === 'peer') {
      // Mount overlay if not already present.
      if (!this.takeoverOverlay) {
        const doc = this.container.ownerDocument ?? document;
        const overlay = doc.createElement('div');
        overlay.className = 'lc-takeover-overlay';
        overlay.setAttribute('role', 'button');
        overlay.setAttribute('tabindex', '0');

        const cta = doc.createElement('button');
        cta.className = 'lc-takeover-cta';
        cta.textContent = 'Click to take over';
        cta.setAttribute(
          'title',
          'This file is being edited in another pane. Click to take over and edit here.',
        );
        overlay.appendChild(cta);

        // Click handler — promote this pane via setActiveLeaf. The
        // workspace's active-leaf-change event fires synchronously; the
        // coordinator's listener flips peer→active in the same animation
        // frame (UI-SPEC §3 race window ≈16ms).
        const onClick = (e: Event): void => {
          e.preventDefault();
          e.stopPropagation();
          this.promoteThisPane();
        };
        overlay.addEventListener('click', onClick);
        // Keyboard activation (role="button" + tabindex="0" affordance).
        overlay.addEventListener('keydown', (e: Event) => {
          const kev = e as KeyboardEvent;
          if (kev.key === 'Enter' || kev.key === ' ') {
            onClick(e);
          }
        });

        this.container.appendChild(overlay);
        this.takeoverOverlay = overlay;
      }
    } else {
      // active — remove overlay if present.
      if (this.takeoverOverlay) {
        try {
          this.takeoverOverlay.remove();
        } catch {
          /* swallow — already detached */
        }
        this.takeoverOverlay = undefined;
      }
    }
  }

  /**
   * Phase 20 Plan 20-04 — internal helper for the overlay click handler.
   * Walks `app.workspace.getLeavesOfType('markdown')` to find the leaf whose
   * `containerEl` ancestor-contains this widget's container, then calls
   * `app.workspace.setActiveLeaf(leaf)`. The setActiveLeaf side effect fires
   * `active-leaf-change` synchronously, which the coordinator's listener
   * then catches to flip pane state.
   *
   * Defensive — the `getLeavesOfType` and `setActiveLeaf` accessors are not
   * declared in the structural plugin-host contract (WidgetMountHost) so we
   * cast through `unknown`. Production LeetCodePlugin satisfies the runtime
   * shape via the real Obsidian Workspace.
   */
  private promoteThisPane(): void {
    try {
      const ws = this.plugin.app as unknown as {
        workspace?: {
          getLeavesOfType?(type: string): Array<{
            containerEl?: HTMLElement;
            view?: { file?: { path: string } | null };
          }>;
          setActiveLeaf?(leaf: unknown, params?: { focus?: boolean }): void;
        };
      };
      const leaves = ws.workspace?.getLeavesOfType?.('markdown') ?? [];
      for (const leaf of leaves) {
        const el = leaf.containerEl;
        if (el && el.contains(this.container)) {
          ws.workspace?.setActiveLeaf?.(leaf, { focus: true });
          return;
        }
      }
    } catch {
      // Defensive — focus race or teardown. The user can simply click again.
    }
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
 * Phase 20 Plan 20-01 (VIM-02) — the previous unconditional `vim()` injection
 * is now wrapped in a per-widget `vimCompartment.of(...)` so the plugin-side
 * `workspace.on('layout-change')` listener can dispatch a live reconfigure
 * (see WidgetController.reconfigureVim). Mount-time vim state is still read
 * once via the canonical `readVimModeFromVault` helper (matches Phase 19
 * C-14 read-once discipline) and threads through as the initial Compartment
 * payload.
 */
function buildExtensions(
  plugin: WidgetMountHost,
  slug: string,
  readOnly: boolean,
  vimCompartment: Compartment,
  vimEnabled: boolean,
  onDocChanged?: (update: ViewUpdate) => void,
  /** Phase 20 Plan 20-09 (amended) — debounced child→parent sync extension.
   *  When present, the extension is appended directly. Editable Live-Preview
   *  mounts pass this in. Read-only mounts skip. */
  syncExtension?: Extension,
): Extension[] {
  const indent = plugin.settings.getIndentSizeOverride();

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
    // Phase 20 Plan 20-01 (VIM-02) — vim is wrapped in a per-widget
    // Compartment so reconfigureVim can swap `vim() ↔ []` live without
    // rebuilding the EditorView. Initial payload mirrors the v1.2 / Phase 19
    // mount-time gate (BLOCKER 1 fix: gated on !readOnly above).
    vimCompartment.of(
      vimEnabled ? vim({ status: true } as Parameters<typeof vim>[0]) : [],
    ),
    // closeBracketsKeymap before defaultKeymap (Pitfall D from Phase 16).
    keymap.of(closeBracketsKeymap),
    bracketMatching(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    indentUnit.of('    '),
  ];
  // 11. Plan 19-02 / 20-09 — currentDocHash refresh listener. Editable
  //     widgets call onDocChanged on every doc change to keep the
  //     widget's currentDocHash in sync (used by main.ts modify-handler
  //     Pitfall P2 early-return). Read-only widgets skip this — no doc
  //     changes are possible.
  if (!readOnly && onDocChanged) {
    exts.push(
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) onDocChanged(update);
      }),
    );
  }
  // 12. Phase 20 Plan 20-09 (amended) — debounced child→parent sync.
  //     The sync extension is pre-built by the caller (mountLeetCodeWidget)
  //     and passed in. Skipped for read-only mounts and test fixtures.
  if (!readOnly && syncExtension) {
    exts.push(syncExtension);
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
  /** Phase 20 Plan 20-09 — parent EditorView reference for the
   *  child→parent sync extension. Required for editable Live-Preview
   *  mounts (LeetCodeFenceWidget.toDOM passes this in). Optional for
   *  Reading-mode mounts (LeetCodeWidgetRenderChild.onload — readOnly
   *  is true there, so no sync needed; the listener is never installed). */
  parentView?: EditorView,
): WidgetController {
  // CONTEXT C-13 + PATTERNS line 1101 — three classes, two carry-over
  // (lc-nested-editor + HyperMD-codeblock) plus the v1.3-specific
  // lc-leetcode-solve so Phase 22 polish can target widgets specifically.
  const container = document.createElement('div');
  container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve';
  // Phase 20 Plan 20-04 — initial pane state is `active`. The CSS rule
  // `.lc-nested-editor[data-pane-state="peer"] > .lc-takeover-overlay`
  // gates overlay visibility on this attribute; the multi-pane coordinator
  // (`registerMultiPaneCoordinator`) flips it via `WidgetController.setPaneState`
  // when active-leaf-change detects a peer widget for the same file path.
  container.setAttribute('data-pane-state', 'active');
  host.appendChild(container);

  const slug = resolveLanguageSlug(plugin, file);

  // Phase 20 Plan 20-05 + Phase 20-09 (post-mortem) — registry key includes
  // leafId AND mode so two panes (LP + Reading) on the same file each get
  // their own controller. Pane-blind state hydration (`persistenceKey`) is
  // preserved separately on the controller for cursor restoration.
  const leafId = resolveLeafId(host);
  const mode = readOnly ? 'read' : 'lp';
  const registryKey = `${file.path}::${fenceIndex}::${leafId}::${mode}`;

  // Phase 20-09 (post-mortem rewrite) — debounced widget-to-DISK flush.
  //
  // Architecture: the widget owns the source of truth in memory. Typing
  // stays purely in the child EditorView's state. After ~500ms of idle
  // (Debouncer reset on every keystroke), the writer fires `vault.process`
  // to atomically update the fence body on disk. Obsidian's modify event
  // then bubbles back through the parent CM6 reload pipeline, but
  // selfWriteSuppression catches the echo so we don't double-process.
  //
  // The post-processor re-fires only on actual disk changes — once per
  // typing pause, not per keystroke. Adoption + parking lot in
  // LeetCodeWidgetRenderChild handles that single remount cleanly.
  let ctl: WidgetController;

  const onDocChanged = readOnly
    ? undefined
    : () => {
        // Refresh currentDocHash for Pitfall P2 absorption (modify-handler
        // gate uses it to skip frontmatter-only-write echoes).
        if (ctl) {
          const body = ctl.view.state.doc.toString();
          void sha1(body).then((hash) => {
            if (ctl) ctl.currentDocHash = hash;
          });
        }
        // Schedule a debounced disk flush. The DebouncedWriter resets its
        // timer on every call, so the actual flush only fires after ~500ms
        // of typing idle (CONTEXT C-06). hasPending() goes true here.
        ctl?.writer?.run();
      };

  // Phase 20 Plan 20-01 (VIM-02) — per-widget vimCompartment + mount-time
  // vimMode read. The Compartment is identity-keyed so it MUST be
  // constructed once per widget; sharing across widgets would broadcast
  // every reconfigure. Read-only widgets pass `false` so the initial
  // payload is `[]` (matches Phase 19 BLOCKER 1: vim never mounts on
  // read-only widgets).
  const vimCompartment = new Compartment();
  const vimEnabled = !readOnly && readVimModeFromVault(plugin as unknown as Parameters<typeof readVimModeFromVault>[0]);

  const state = EditorState.create({
    doc: source,
    extensions: buildExtensions(
      plugin,
      slug,
      readOnly,
      vimCompartment,
      vimEnabled,
      onDocChanged,
      undefined,
    ),
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

  ctl = new WidgetController(
    view,
    container,
    file,
    fenceIndex,
    plugin,
    vimCompartment,
    vimEnabled,
    registryKey,
  );
  // Phase 20-09 (post-mortem fix) — capture readOnly so the adoption
  // predicate in LeetCodeWidgetRenderChild.onload can refuse to adopt a
  // controller of the wrong mode (e.g. Reading-mode RenderChild picking up
  // an editable LP-mode controller).
  ctl.readOnly = readOnly;

  // Phase 20 Plan 20-02 — initialize `currentDocHash` from the initial
  // doc body. Fire-and-forget — the modify-handler early-return tolerates
  // a brief window where currentDocHash is empty (it falls through to
  // suppression in that case, which is the safe default).
  if (!readOnly) {
    void sha1(source).then((hash) => {
      if (ctl) ctl.currentDocHash = hash;
    });
  }

  // Plan 19-03 — hydrate previously-captured cursor + scroll if the plugin
  // host provides a statePersistence map AND we're within the 30s TTL window.
  // Order: AFTER view construction, BEFORE the debouncedWriter is bound and
  // BEFORE the updateListener fires — so the hydrate dispatch can't trigger
  // a self-flush. CONTEXT D-02 belt-and-suspenders: this restores state on
  // every unmount path (cursor approach + viewport scroll + mode switch +
  // theme change). Hydrate is a no-op when no entry exists OR when the
  // persistence map is absent (test fixtures).
  plugin.statePersistence?.hydrateState(ctl.persistenceKey, view);

  // Phase 20-09 (post-mortem rewrite) — bind DebouncedWriter for editable
  // mounts. The writer flushes the child's current doc to disk via
  // vault.process after ~500ms of typing idle (Debouncer resets on every
  // call). selfWriteSuppression is armed before the flush so the modify
  // event echo is absorbed by main.ts's modify handler — preventing a
  // double-reload that would tear down the widget mid-typing.
  if (
    !readOnly &&
    plugin.selfWriteSuppression &&
    typeof plugin.app.vault.read === 'function' &&
    typeof plugin.app.vault.process === 'function'
  ) {
    const delay = plugin.settings.getWidgetSyncDebounceMs?.() ?? 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctl.writer = new DebouncedWriter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.app as any,
      file,
      () => ctl.view.state.doc.toString(),
      () => ctl.fenceIndex,
      plugin.selfWriteSuppression,
      delay,
    );
  }

  // Register in plugin.widgetRegistry if present (set by main.ts onload when
  // useInlineWidget=ON; Plan 19-04 controller cleanup uses this).
  // Phase 20 Plan 20-05 — key is the per-pane registryKey so two panes on
  // the same file co-exist without clobber.
  if (plugin.widgetRegistry) {
    plugin.widgetRegistry.set(ctl.registryKey, ctl);
  }

  // Phase 20 Plan 20-02 (ACTION-03) — per-widget metadataCache subscription.
  // Filtered by file.path so an unrelated note's metadata change is a no-op
  // (T-20-02-03 mitigation). Effects-only dispatch via languageCompartment
  // preserves cursor + scroll + undo (Phase 16 Pitfall C analog). Wrapped
  // in a guard so test fixtures that omit `metadataCache.on` don't crash.
  if (
    !readOnly &&
    typeof plugin.app.metadataCache.on === 'function'
  ) {
    try {
      ctl.metadataChangedRef = plugin.app.metadataCache.on(
        'changed',
        (changedFile: { path: string }) => {
          if (changedFile.path !== ctl.file.path) return;
          const fmFresh = plugin.app.metadataCache.getFileCache(ctl.file)?.frontmatter as
            | Record<string, unknown>
            | undefined;
          const newSlug =
            typeof fmFresh?.['lc-language'] === 'string' &&
            (fmFresh['lc-language'] as string).length > 0
              ? (fmFresh['lc-language'] as string)
              : 'python3';
          const indent = plugin.settings.getIndentSizeOverride();
          try {
            ctl.view.dispatch({
              effects: languageCompartment.reconfigure(
                buildLanguageExtensions(newSlug, indent),
              ),
            });
          } catch {
            // Defensive — view may be in teardown.
          }
          // Phase 20 Plan 20-08 — gap-closure for language-switch-not-wired.
          // After the parser reconfigure, refresh the action-row chevron's
          // visible state (label + .is-current marker). Without this call,
          // the chevron stays frozen at mount-time slug forever — UAT
          // Test 3 blocker, see
          // .planning/debug/language-switch-not-wired.md.
          try {
            ctl.actionRowRefresh?.(newSlug);
          } catch {
            // Defensive — chevron refresh must never block the listener;
            // the outer Compartment.reconfigure dispatch is the
            // load-bearing path.
          }
        },
      );
    } catch {
      // Defensive — metadataCache.on may not be available in all envs.
    }
  }

  // Phase 20 Plan 20-02 (ACTION-01) — mount the action row inside the widget
  // container as a sibling of `.cm-editor`. Skipped for embed-context widgets
  // per Phase 19 EMBED-01..04 + this plan's must_haves contract. The
  // `host.ownerDocument` is the canonical Document handle (popout-window-safe
  // per project lint rule); fall back to `document` only if null in test envs.
  // Read-only widgets ALSO mount the action row — the buttons fire same
  // handlers regardless of `editable.of(false)` (UI-SPEC §1).
  //
  // The action row is constructed only when the controller's plugin host
  // exposes the *FromWidget surface; this gate keeps mount-time test
  // fixtures (which model only the WidgetMountHost shape) from crashing.
  const hostPlugin = plugin as unknown as {
    runFromWidget?: unknown;
    submitFromWidget?: unknown;
    aiSolutionFromWidget?: unknown;
    resetFromWidget?: unknown;
    retrieveLastSubmissionFromWidget?: unknown;
    switchLanguageFromWidget?: unknown;
  };
  const hasFromWidgetSurface =
    typeof hostPlugin.runFromWidget === 'function' &&
    typeof hostPlugin.submitFromWidget === 'function' &&
    typeof hostPlugin.aiSolutionFromWidget === 'function' &&
    typeof hostPlugin.resetFromWidget === 'function' &&
    typeof hostPlugin.retrieveLastSubmissionFromWidget === 'function' &&
    typeof hostPlugin.switchLanguageFromWidget === 'function';
  if (hasFromWidgetSurface) {
    // Embed-context detection. Embed widgets are read-only display surfaces
    // (Phase 19 EMBED-01..04); the action row would be misleading — don't
    // mount it. We pass `null` for ctx + info because mount-time has no
    // post-processor context; the host-DOM ancestor walk in isEmbedContext
    // is the load-bearing signal here.
    const ownerDoc = (host.ownerDocument as Document | null) ?? document;
    const fakeCtx = { sourcePath: file.path } as unknown as Parameters<
      typeof isEmbedContext
    >[1];
    const isEmbed = isEmbedContext(host, fakeCtx, file);
    // Phase 20 Plan 20-04 — record the embed flag on the controller so the
    // multi-pane coordinator can skip embed widgets (they should never grow
    // a "Click to take over" CTA — the embedding host doesn't own the file).
    ctl.isEmbed = isEmbed;
    if (!isEmbed) {
      try {
        const mounted = mountActionRow(
          ctl as unknown as WidgetActionRowCtl,
          file,
          ctl.currentSlug,
          ownerDoc,
        );
        ctl.actionRow = mounted.row;
        // Phase 20 Plan 20-08 — store the chevron refresh closure so the
        // metadataCache 'changed' listener can update label text +
        // .is-current marker after each languageCompartment.reconfigure.
        ctl.actionRowRefresh = mounted.refresh;
      } catch {
        // Defensive — chevron / button-row construction may throw under
        // hostile test envs without `setIcon`. Action row mount is a UX
        // surface; mount failure must NOT break the widget itself.
      }
    }
  }

  return ctl;
}

/**
 * Reading-mode + Live-Preview lifecycle wrapper. Registered via
 * `ctx.addChild(...)` from the codeBlockProcessor.
 *
 * Phase 20-09 (amended) — registry-based survival with parking lot:
 *
 *   The problem: when the debounced child→parent sync updates the parent
 *   CM6 doc, Obsidian's codeblock post-processor re-fires. The old
 *   RenderChild is unloaded (DOM would be removed) and a new one is loaded.
 *   If the EditorView's DOM is inside the old container when Obsidian
 *   removes it, the browser fires a blur event → vim exits insert mode →
 *   cursor resets.
 *
 *   Solution: a "parking lot" — a persistent hidden div in document.body
 *   that the EditorView is moved into during onunload (which fires BEFORE
 *   Obsidian removes the old container from the DOM). The EditorView stays
 *   in the document → no blur. The next onload moves it from the parking
 *   lot into the new container.
 *
 *   Lifecycle:
 *     onunload → park controller.container in parking lot (EditorView stays
 *                in DOM, no blur, no destroy)
 *     onload   → check registry → if found, move from parking lot into
 *                new containerEl (no reconstruction)
 *                if not found, mount fresh
 */
export class LeetCodeWidgetRenderChild extends MarkdownRenderChild {
  private controller?: WidgetController;
  private mountedRegistryKey?: string;
  public readonly fenceIndex: number;

  /** Module-level parking lot — created once, reused across all instances. */
  private static parkingLot: HTMLDivElement | null = null;

  private static getParkingLot(): HTMLDivElement {
    if (!LeetCodeWidgetRenderChild.parkingLot) {
      const lot = document.createElement('div');
      lot.className = 'lc-widget-parking-lot';
      lot.setAttribute('aria-hidden', 'true');
      lot.style.position = 'fixed';
      lot.style.left = '-9999px';
      lot.style.top = '-9999px';
      lot.style.width = '0';
      lot.style.height = '0';
      lot.style.overflow = 'hidden';
      lot.style.pointerEvents = 'none';
      document.body.appendChild(lot);
      LeetCodeWidgetRenderChild.parkingLot = lot;
    }
    return LeetCodeWidgetRenderChild.parkingLot;
  }

  /**
   * Phase 20 BL-01 (review-fix) + WR-15 (review-fix) — dispose the parking lot
   * static. Called from `Plugin.onunload` so:
   *   1. The lot div is removed from `document.body` (no orphan DOM).
   *   2. The static field is reset so a subsequent plugin enable allocates
   *      a fresh lot pointing into the live document tree (CommonJS module
   *      cache otherwise persists the dead pointer across enable/disable —
   *      WR-15).
   *
   * Also iterates any controllers still parked inside the lot and destroys
   * them. Real paths that get here without an `onload` adoption: plugin
   * disable / file rename (registryKey is frozen at construction) / tab
   * close mid-typing / fall-through catch in `onload`.
   *
   * Idempotent — calling on a never-instantiated lot is a no-op.
   */
  static disposeParkingLot(): void {
    const lot = LeetCodeWidgetRenderChild.parkingLot;
    if (!lot) return;
    try {
      // Remove every parked container from the lot. The associated
      // EditorViews are NOT destroyed here — `WidgetRegistry.destroyAll`
      // (called from Plugin.onunload BEFORE this) is responsible for view
      // teardown via each controller's `destroy()`. We just detach the
      // DOM nodes from the live document.
      while (lot.firstChild) lot.removeChild(lot.firstChild);
      lot.remove();
    } catch {
      // Defensive — DOM may already be detached.
    }
    LeetCodeWidgetRenderChild.parkingLot = null;
  }

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
    this.fenceIndex = computeFenceIndex(info.text, info.lineStart);
  }

  onload(): void {
    // Adoption path: registerMarkdownCodeBlockProcessor re-fires on every
    // parent fence-body content change in Live Preview. To preserve the
    // embedded EditorView's focus, cursor, vim state, and undo stack across
    // these remounts, we look up an existing controller in widgetRegistry
    // by (file.path, fenceIndex) — pane-blind because the new containerEl
    // is not inside .workspace-leaf at onload time (Obsidian pre-renders
    // in a detached subtree, so leafId would not match).
    //
    // Lifecycle:
    //   onunload (old) → park controller.container in a hidden div under
    //                    document.body so the EditorView stays in the DOM
    //                    and never receives a blur event.
    //   onload  (new) → look up controller in registry → reparent its
    //                    container into this.containerEl → refocus on next
    //                    animation frame (waits until Obsidian moves
    //                    containerEl into the visible DOM).
    const registry = this.plugin.widgetRegistry as unknown as
      | { values(): IterableIterator<WidgetController> }
      | undefined;
    // Adoption predicate:
    //   1. Match (file.path, fenceIndex) — same fence in same file.
    //   2. Pane-ownership: if the existing controller's container is
    //      currently inside a DIFFERENT .workspace-leaf, that pane already
    //      owns it — we must NOT steal it (would leave the other pane
    //      blank). Containers parked under document.body have no
    //      .workspace-leaf ancestor and are freely adoptable.
    //   3. Mode match: a Reading-mode RenderChild must NOT adopt an
    //      editable LP-mode controller (would show vim status line +
    //      editable CM6 in Reading view) and vice-versa.
    const myLeaf = this.containerEl.closest?.('.workspace-leaf') ?? null;
    const existing = registry
      ? [...registry.values()].find((ctl) => {
          if (ctl?.file?.path !== this.file.path) return false;
          if (ctl?.fenceIndex !== this.fenceIndex) return false;
          if (ctl?.readOnly !== this.readOnly) return false;
          const existingLeaf = ctl.container?.closest?.('.workspace-leaf');
          // Cross-leaf theft prevention: if the existing controller is
          // mounted inside a real .workspace-leaf, only that same leaf may
          // adopt it. A null myLeaf (the new RenderChild's containerEl is
          // still in Obsidian's pre-render fragment) MUST NOT steal a
          // controller already mounted in another pane — doing so would
          // leave that pane blank. Parked controllers (no leaf ancestor)
          // remain freely adoptable.
          if (existingLeaf && existingLeaf !== myLeaf) return false;
          return true;
        })
      : undefined;

    if (existing && existing.container) {
      try {
        this.containerEl.appendChild(existing.container);
        this.controller = existing;
        this.mountedRegistryKey = existing.registryKey;

        // Refocus on next animation frame, but do NOT restore cursor or
        // dispatch any selection — the EditorView's own state is the
        // source of truth, and dispatching a stale `selection` here can
        // race with concurrent user typing (Enter + new line characters
        // landing during the rAF callback queue), corrupting the doc.
        // The EditorView is never destroyed so its cursor is already
        // where the user left it; we only need to restore browser focus
        // so subsequent keystrokes route to contentDOM.
        //
        // Gate refocus on hadFocusBeforeUnload — multi-pane scenarios fire
        // adoption for every visible pane on disk flush, and we must not
        // steal focus to a non-typing pane. Only the pane whose contentDOM
        // had document.activeElement focus before unload restores focus.
        const view = existing.view;
        const shouldRefocus = existing.hadFocusBeforeUnload;
        // Reset the flag so a subsequent unload-without-typing doesn't
        // erroneously refocus.
        existing.hadFocusBeforeUnload = false;
        if (!shouldRefocus) {
          return;
        }
        const refocus = (): void => {
          try {
            if (!view || !view.contentDOM) return;
            if (!view.contentDOM.isConnected) {
              requestAnimationFrame(refocus);
              return;
            }
            // Only focus if we don't already have it. Avoids re-entrant
            // focus events during rapid typing bursts.
            if (document.activeElement !== view.contentDOM) {
              view.focus();
            }
          } catch {
            /* swallow — refocus is best-effort */
          }
        };
        requestAnimationFrame(refocus);
        return;
      } catch {
        // BL-01 / BL-02 (review-fix) — fall-through catch: the registry
        // entry references a controller we couldn't reparent (DOM error,
        // detached existing.container, etc.). Destroy the stale entry
        // BEFORE falling through to fresh mount — without this the
        // registry accumulates dead controllers (BL-01 leak amplifier
        // and BL-02 stale-pick risk on subsequent adoption).
        try {
          existing.destroy();
        } catch {
          /* swallow — already torn down */
        }
        try {
          this.plugin.widgetRegistry?.delete(existing.registryKey);
        } catch {
          /* swallow — registry may be absent in tests */
        }
      }
    }

    // No existing controller — mount fresh.
    let parentView: EditorView | undefined;
    if (!this.readOnly) {
      try {
        const app = (
          this.plugin as unknown as {
            app?: {
              workspace?: {
                getActiveViewOfType?(type: unknown): { editor?: { cm?: EditorView } } | null;
              };
            };
          }
        ).app;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MarkdownView } = require('obsidian') as { MarkdownView: unknown };
        const av = app?.workspace?.getActiveViewOfType?.(MarkdownView);
        const cm = av?.editor?.cm;
        if (cm) parentView = cm;
      } catch {
        // Defensive — Obsidian's runtime API may differ across versions.
      }
    }

    this.controller = mountLeetCodeWidget(
      this.containerEl,
      this.source,
      this.file,
      this.plugin,
      this.readOnly,
      this.fenceIndex,
      parentView,
    );
    this.mountedRegistryKey = this.controller.registryKey;
  }

  onunload(): void {
    if (!this.controller) {
      this.mountedRegistryKey = undefined;
      return;
    }
    // Read-only mounts (Reading mode, embed) have no editable state to
    // preserve — destroy them on unload instead of parking. This avoids
    // accumulating orphan readonly controllers across rapid mode flips
    // (LP↔Reading) and prevents the registry from growing unbounded.
    if (this.controller.readOnly) {
      try {
        this.controller.destroy();
      } catch {
        // Defensive — already torn down.
      }
      const key = this.mountedRegistryKey ?? this.controller.registryKey;
      if (key) this.plugin.widgetRegistry?.delete(key);
      this.controller = undefined;
      this.mountedRegistryKey = undefined;
      return;
    }
    // Editable mount: capture whether this widget had focus BEFORE we park
    // it. The next RenderChild.onload uses this to decide whether to
    // refocus — multi-pane scenarios fire onload for every visible pane on
    // disk flush, and we must not steal focus to the non-typing pane.
    try {
      this.controller.hadFocusBeforeUnload =
        this.controller.view?.contentDOM === document.activeElement;
    } catch {
      this.controller.hadFocusBeforeUnload = false;
    }
    // Park the controller's container in the hidden parking lot BEFORE
    // Obsidian removes containerEl from the DOM. This keeps the EditorView
    // in document.body so the browser does NOT fire blur — vim stays in
    // insert mode, cursor remains stable, focus survives the post-processor
    // remount cycle. The next RenderChild.onload reparents it from the lot
    // into the new containerEl.
    if (this.controller.container) {
      try {
        LeetCodeWidgetRenderChild.getParkingLot().appendChild(
          this.controller.container,
        );
      } catch {
        // Defensive — parking lot may fail in unusual DOM states.
      }
    }
    this.controller = undefined;
    this.mountedRegistryKey = undefined;
  }
}
