// Phase 19 Plan 01 — CM6 WidgetType subclass for Live Preview mount.
//
// `LeetCodeFenceWidget` is wrapped by Decoration.replace and contributed via
// the leetCodeFenceViewPlugin's ViewPlugin (separate file). The widget's
// identity contract is content-hash-based per CONTEXT D-01 + RESEARCH
// Pitfall 19-F:
//
//   eq(other) === true iff (file.path, fenceIndex, sourceHash) all match
//
// `sourceHash` is a stable hash of the fence body string. CM6 reuses the DOM
// across rebuilds when eq() returns true — preventing remount on every
// keystroke. NEVER include the WidgetController instance in eq() (instances
// are per-render; eq must be content-based).
//
// `ignoreEvent()` returns true so parent CM6 lets the embedded EditorView
// consume keyboard/mouse events natively (CONTEXT D-02 + PATTERNS lines 158-163).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { WidgetType, type EditorView } from '@codemirror/view';
import type { TFile } from 'obsidian';
import { mountLeetCodeWidget, type WidgetMountHost } from './WidgetController';

/**
 * Compute a small, stable hash of a string. SHA-1-strength is unnecessary
 * for widget identity — we just need a fast, deterministic non-cryptographic
 * hash with low collision rate over typical LC code-fence bodies.
 *
 * Uses djb2 — 32-bit unsigned arithmetic; identical inputs produce identical
 * 8-char hex strings.
 */
function djb2Hash(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class LeetCodeFenceWidget extends WidgetType {
  public readonly sourceHash: string;

  constructor(
    public readonly plugin: WidgetMountHost,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly source: string,
  ) {
    super();
    this.sourceHash = djb2Hash(source);
  }

  /**
   * Content-hash identity (RESEARCH Pitfall 19-F). Returns true when both
   * widgets render the same fence body for the same file + index — letting
   * CM6 reuse the existing DOM instead of remounting on every keystroke.
   */
  eq(other: WidgetType): boolean {
    return (
      other instanceof LeetCodeFenceWidget &&
      other.plugin === this.plugin &&
      other.file === this.file &&
      other.fenceIndex === this.fenceIndex &&
      other.sourceHash === this.sourceHash
    );
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
   */
  toDOM(_view: EditorView): HTMLElement {
    const host = document.createElement('div');
    mountLeetCodeWidget(
      host,
      this.source,
      this.file,
      this.plugin,
      /*readOnly=*/false,
      this.fenceIndex,
    );
    return host;
  }

  /**
   * Tear down the widget's controller via widgetRegistry lookup. The
   * controller's `destroy()` calls `view.destroy()` and the registry entry
   * is removed in the LeetCodeWidgetRenderChild.onunload path. Live-Preview
   * destroy is symmetric — flush (Plan 19-02) + destroy + unregister.
   */
  destroy(_dom: HTMLElement): void {
    const key = `${this.file.path}::${this.fenceIndex}`;
    const ctl = this.plugin.widgetRegistry?.get(key) as
      | { flushNow(): void; destroy(): void }
      | undefined;
    if (ctl) {
      ctl.flushNow();
      ctl.destroy();
      this.plugin.widgetRegistry?.delete(key);
    }
  }
}
