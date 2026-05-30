// Phase 19 Plan 01 + Plan 04 — CM6 WidgetType subclass for Live Preview mount.
//
// `LeetCodeFenceWidget` is wrapped by Decoration.replace and contributed via
// the leetCodeFenceViewPlugin's ViewPlugin (separate file). The widget's
// identity contract is content-hash-based per CONTEXT D-01 + RESEARCH
// Pitfall 19-F:
//
//   eq(other) === true iff (file.path, fenceIndex, sourceHash) all match
//
// Plan 19-04 — `sourceHash` is supplied by the caller (Live Preview
// ViewPlugin) so the hash function used for identity is consistent across
// rebuilds. The ViewPlugin uses `djb2(source)` from `src/widget/hash.ts`;
// callers that want hash-of-source semantics can use the convenience
// `LeetCodeFenceWidget.fromSource(...)` factory below.
//
// CM6 reuses the DOM across rebuilds when eq() returns true — preventing
// remount on every keystroke. NEVER include the WidgetController instance
// in eq() (instances are per-render; eq must be content-based).
//
// `ignoreEvent()` returns true so parent CM6 lets the embedded EditorView
// consume keyboard/mouse events natively (CONTEXT D-02 + PATTERNS lines 158-163).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { WidgetType, type EditorView } from '@codemirror/view';
import type { TFile } from 'obsidian';
import { mountLeetCodeWidget, type WidgetMountHost } from './WidgetController';
import { djb2 } from './hash';

export class LeetCodeFenceWidget extends WidgetType {
  /**
   * Phase 20 Plan 20-05 — registry key for the controller this widget mounted.
   * Set in `toDOM` from the returned WidgetController's `registryKey` so
   * `destroy(_dom)` can delete only its own entry without recomputing a
   * (now lossy) `${file.path}::${fenceIndex}` content key. Null when toDOM
   * has not run yet (impossible in practice — destroy never fires before
   * toDOM).
   */
  private mountedCtlKey: string | null = null;

  /**
   * Plan 19-04 constructor — explicit sourceHash argument. The Live Preview
   * ViewPlugin passes `djb2(source)` (synchronous, RESEARCH Pitfall 19-F).
   * Tests that exercise eq() identity in isolation supply hashes directly
   * so they can verify content-changed vs. content-unchanged transitions.
   */
  constructor(
    public readonly plugin: WidgetMountHost,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly sourceHash: string,
    public readonly source: string,
  ) {
    super();
  }

  /**
   * Convenience factory matching the Plan 19-01 four-arg call signature
   * `(plugin, file, fenceIndex, source)`. Computes `djb2(source)` for the
   * sourceHash internally — keeps backwards compatibility for callers that
   * don't already have a hash on hand.
   */
  static fromSource(
    plugin: WidgetMountHost,
    file: TFile,
    fenceIndex: number,
    source: string,
  ): LeetCodeFenceWidget {
    return new LeetCodeFenceWidget(plugin, file, fenceIndex, djb2(source), source);
  }

  /**
   * Content-hash identity (RESEARCH Pitfall 19-F). Returns true when both
   * widgets render the same fence body for the same file + index — letting
   * CM6 reuse the existing DOM instead of remounting on every keystroke.
   *
   * Phase 20 Plan 20-06 — when the strict sourceHash compare fails (two
   * widgets differ ONLY by sourceHash), peek the suppression map. If the
   * armed expected hash matches EITHER widget's sourceHash, treat as equal
   * so CM6 reuses the existing DOM. This is the primary mechanism for
   * next-build DOM reuse after a self-write echo: the ViewPlugin's gate
   * keeps `this.decorations` stable for the echo transaction itself; this
   * eq() clause keeps the DOM stable on the SUBSEQUENT genuine-keystroke
   * rebuild while the suppression entry is still armed (5s TTL).
   */
  eq(other: WidgetType): boolean {
    if (!(other instanceof LeetCodeFenceWidget)) return false;
    if (other.plugin !== this.plugin) return false;
    if (other.file !== this.file) return false;
    if (other.fenceIndex !== this.fenceIndex) return false;
    if (other.sourceHash === this.sourceHash) return true;

    // Phase 20 Plan 20-06 — suppression-map peek. When mid-self-write
    // echo, the on-screen widget's hash is the pre-flush value AND the
    // candidate widget's hash is the post-flush value; peek matches one
    // of them (the armed expected hash equals the post-flush content).
    // See .planning/debug/self-write-remount-cycle.md.
    try {
      const sup = this.plugin.selfWriteSuppression;
      if (sup) {
        const peeked = sup.peekExpectedHash(this.file.path);
        if (
          peeked !== null &&
          (peeked === this.sourceHash || peeked === other.sourceHash)
        ) {
          return true;
        }
      }
    } catch {
      // Defensive — peek must never throw; if it does, fall through to false.
    }
    return false;
  }

  /**
   * Returns true so parent CM6 ignores all events on this widget — letting
   * the embedded EditorView consume them natively (PATTERNS lines 158-163).
   */
  ignoreEvent(): boolean {
    return true;
  }

  /**
   * Mount the embedded EditorView via the shared factory. The `_view`
   * argument is the parent CM6 EditorView (not used here; mountLeetCodeWidget
   * works against the host element directly).
   *
   * Phase 20 Plan 20-05 — capture the controller's per-pane registryKey so
   * destroy() can delete only its own entry. Without this, the v1.3 destroy
   * path reverse-resolved via `${file.path}::${fenceIndex}` and could delete
   * a sibling pane's controller in a multi-pane scenario.
   */
  toDOM(_view: EditorView): HTMLElement {
    const host = document.createElement('div');
    const ctl = mountLeetCodeWidget(
      host,
      this.source,
      this.file,
      this.plugin,
      /*readOnly=*/false,
      this.fenceIndex,
    );
    this.mountedCtlKey = ctl.registryKey;
    return host;
  }

  /**
   * Tear down the widget's controller via widgetRegistry lookup. The
   * controller's `destroy()` calls `view.destroy()` and the registry entry
   * is removed in the LeetCodeWidgetRenderChild.onunload path. Live-Preview
   * destroy is symmetric — Plan 19-03 captures state (CONTEXT D-02 belt
   * fallback for cursor-approach + viewport-scroll unmounts), then flush
   * (Plan 19-02) + destroy + unregister.
   *
   * Phase 20 Plan 20-05 — looks up by the per-pane key stored on this widget
   * instance (`mountedCtlKey`), NOT a recomputed `${file.path}::${fenceIndex}`
   * content key. In a two-pane scenario, destroying widget A leaves widget B's
   * registry entry intact.
   */
  destroy(_dom: HTMLElement): void {
    const key = this.mountedCtlKey;
    if (!key) return; // Defensive — toDOM never ran (impossible in practice).
    const ctl = this.plugin.widgetRegistry?.get(key) as
      | {
          flushNow(): void;
          destroy(): void;
          persistenceKey?: string;
          view?: import('@codemirror/view').EditorView;
        }
      | undefined;
    if (ctl) {
      // Plan 19-03 — capture BEFORE flush + destroy so cursor + scroll
      // (and historyJSON) survive the Live-Preview unmount path. The
      // mousedown.stopPropagation listener (Plan 19-01) handles cursor-
      // approach reveal directly; this map handles viewport-scroll, mode-
      // switch, theme-change, and the case where stopPropagation didn't
      // fully prevent the reveal (D-02 belt-and-suspenders).
      if (this.plugin.statePersistence && ctl.persistenceKey && ctl.view) {
        try {
          this.plugin.statePersistence.captureState(ctl.persistenceKey, ctl.view);
        } catch {
          // Defensive — capture is best-effort; never block destroy.
        }
      }
      ctl.flushNow();
      ctl.destroy();
      this.plugin.widgetRegistry?.delete(key);
    }
    this.mountedCtlKey = null;
  }
}
