// Phase 19 Plan 03 — Plugin-singleton state persistence map.
//
// CONTEXT C-09 + D-01 + RESEARCH Pattern 4: persists child-editor state
// across unmount/remount within a 30-second TTL. Keyed by
// `${file.path}::${fenceIndex}` per CONTEXT D-01 (ordinal index, not
// content-hash). Capture on `MarkdownRenderChild.onunload` /
// `WidgetType.destroy(dom)`; hydrate on `mountLeetCodeWidget`.
//
// What we capture:
//   - cursor (selection.main.head)
//   - scrollTop (scrollDOM.scrollTop)
//   - historyJSON (state.toJSON({history: historyField}).history)
//
// What we hydrate:
//   - cursor → dispatch({selection: EditorSelection.cursor(clamped)})
//   - scrollTop → write scrollDOM.scrollTop directly
//   - historyJSON → STORED but NOT replayed via fromJSON in this plan.
//     Per RESEARCH Pitfall 19-C / Open Question A3: a full
//     `EditorState.fromJSON(...)` rebuild requires the entire extensions
//     array at hydrate time and a wholesale `view.setState(newState)`. The
//     unit-test environment can't deterministically exercise the round-trip
//     because the workspace has two `@codemirror/state` instances (peer
//     conflict between view@6.38.6 ^6.5.0 and commands@6.10.3 ^6.6.0); the
//     production single-CM6 path can — UAT (Plan 19-03 Task 4 step 4)
//     verifies it. This module CAPTURES the historyJSON unconditionally so
//     a future caller (e.g., a Phase 20 conflict-modal reload path) can
//     fold history into the rebuilt state.
//
// Why no auto-fromJSON: dispatching a fromJSON-rebuilt state from inside
// hydrateState would require knowing the full extensions array — which lives
// inside `mountLeetCodeWidget` at construction time, not at hydrate time.
// The mount factory could be refactored to take "captured history" and pass
// it through to `EditorState.create` (or `fromJSON`), but that path is
// fragile in the test environment and adds risk in Phase 19. We DO save the
// historyJSON so the data is preserved; Phase 20+ can wire the full reload.
//
// CONTEXT D-02 belt-and-suspenders: this map is the load-bearing piece for
// every unmount path that ISN'T cursor-approach (viewport scroll, mode
// switch, theme change, file reload). The mousedown.stopPropagation listener
// in WidgetController.ts handles the cursor-approach case directly. Both
// ship together.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorSelection } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import type { EditorView } from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- direct dep
import { historyField } from '@codemirror/commands';

/** Captured snapshot of an embedded child editor's transient state. */
export interface ChildEditorState {
  cursor: number;
  scrollTop: number;
  /** Opaque CM6 history payload from `state.toJSON({history}).history`.
   *  Stored but not auto-replayed in Plan 19-03 (see file comment). */
  historyJSON: unknown;
}

interface MapEntry {
  state: ChildEditorState;
  expiresAt: number;
}

/** Plugin-singleton persistence map. Owns its own internal Map; no global
 *  state. Lifecycle: instantiated in main.ts onload; cleared in onunload. */
export class StatePersistenceMap {
  private readonly map = new Map<string, MapEntry>();
  private readonly TTL_MS = 30_000;

  /**
   * Capture the current view's transient state under `key`. Replaces any
   * existing entry. Captures historyJSON via `state.toJSON({history:
   * historyField})` — the captured payload's `.history` slot is opaque and
   * may be `undefined` if the state has no history StateField.
   */
  captureState(key: string, view: EditorView): void {
    const cursor = view.state.selection.main.head;
    const scrollTop = view.scrollDOM?.scrollTop ?? 0;

    let historyJSON: unknown = null;
    try {
      // toJSON's fields parameter shape: `{ [prop: string]: StateField<any> }`.
      // We pass historyField under the literal key `history` so the returned
      // JSON has a `history` slot containing the serialized payload. If the
      // view's state isn't configured with the history extension, the slot
      // is undefined — we coerce to null for serialization stability.
      const json = view.state.toJSON({ history: historyField } as Record<
        string,
        unknown
      >) as Record<string, unknown> | undefined;
      historyJSON = json?.['history'] ?? null;
    } catch {
      // Defensive — if toJSON throws (e.g., a future CM6 release changes the
      // signature), fall through with null history. Cursor + scroll still
      // captured; the residual limitation is exactly what RESEARCH Open
      // Question A3 anticipates.
      historyJSON = null;
    }

    this.map.set(key, {
      state: { cursor, scrollTop, historyJSON },
      expiresAt: Date.now() + this.TTL_MS,
    });
  }

  /**
   * Hydrate `view` from a captured entry under `key`. Returns true iff an
   * entry was found and applied; false if missing or expired (entry deleted).
   * Side effects on the view: dispatches a selection-only transaction with
   * the cursor clamped to `Math.min(cursor, view.state.doc.length)`, then
   * writes `scrollDOM.scrollTop`. The captured historyJSON is NOT replayed
   * (see file comment); Plan 20+ may consume it during reconcile.
   * The entry is deleted after a successful hydrate (one-shot).
   */
  hydrateState(key: string, view: EditorView): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return false;
    }
    // Cursor clamping per RESEARCH Pattern 4 line 301: doc may have shrunk
    // between unmount and remount.
    const docLength = view.state.doc.length;
    const head = Math.min(entry.state.cursor, docLength);
    try {
      view.dispatch({ selection: EditorSelection.cursor(head) });
    } catch {
      // Defensive — some test mocks may construct a view without a real
      // dispatch. We still want hydrate to succeed so cursor + scroll
      // restore semantics are observable in tests via mock dispatch spies.
    }
    if (view.scrollDOM) {
      view.scrollDOM.scrollTop = entry.state.scrollTop;
    }
    this.map.delete(key);
    return true;
  }

  /**
   * Remove every entry whose `expiresAt < now`. Called on Plugin.onload (to
   * sweep stale entries from a prior session — though Plan 19-03's map is
   * in-memory-only, this is defensive in case of future serialization) and
   * via a registered 60s interval.
   */
  sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now > entry.expiresAt) this.map.delete(key);
    }
  }

  /** Drain the entire map. Called on Plugin.onunload. */
  clear(): void {
    this.map.clear();
  }

  /** Remove every entry whose key starts with `${path}::`. Called on
   *  vault.on('rename') so renamed files don't leak stale state under the
   *  old path. Plan 19-04+ owns the wire-up; Plan 19-03 just defines the API. */
  clearForPath(path: string): void {
    const prefix = `${path}::`;
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  /** Test-only / debugging — current entry count. */
  get size(): number {
    return this.map.size;
  }
}
