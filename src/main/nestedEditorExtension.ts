// Phase 13 Plan 02 — Nested Editor Extension.
//
// CM6 StateField that produces:
//   1. CSS-hide line decorations on all fence lines (opener through closer)
//   2. A block widget containing the child EditorView (NestedEditorWidget)
//   3. A transactionFilter that redirects cursor out of the hidden zone
//      and focuses the child editor (D-06)
//
// Depends on:
//   - findCodeFence (from codeActionsEditorExtension.ts — SSoT for fence detection)
//   - ChildEditorRegistry (from childEditorRegistry.ts — Plan 01 output)
//   - createChildEditor (from childEditorFactory.ts — Plan 01 output)
//
// Lifecycle:
//   - Widget.toDOM() attaches child from registry or creates new via factory
//   - Widget.destroy() detaches child DOM but does NOT destroy the EditorView (D-13)
//   - True destruction only on LRU eviction, explicit file close, or plugin unload

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  StateField,
  Transaction,
  RangeSetBuilder,
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';
import { ChildEditorRegistry } from './childEditorRegistry';
import { createChildEditor } from './childEditorFactory';
import { wireSyncIfNeeded, detectAndPropagateExternalChange } from './childEditorSync';

/**
 * Structural type for the plugin host required by this extension.
 * Minimal surface — only what buildNestedDecorations needs.
 */
type PluginHost = Plugin & {
  childEditorRegistry: ChildEditorRegistry;
  app: {
    metadataCache: {
      getFileCache(file: { path: string }): { frontmatter?: Record<string, unknown> } | null;
    };
  };
};

/**
 * NestedEditorWidget — block widget that mounts a child EditorView.
 *
 * Lifecycle contract (D-13):
 *   - eq() compares ONLY filePath (stable identity — prevents rebuild on doc edits)
 *   - toDOM() attaches child from registry or creates new via factory
 *   - destroy() detaches child DOM but keeps EditorView alive in registry
 *   - ignoreEvent() returns false (child receives all pointer/keyboard events)
 */
export class NestedEditorWidget extends WidgetType {
  constructor(
    readonly filePath: string,
    readonly registry: ChildEditorRegistry,
    readonly fenceContent: string,
  ) {
    super();
  }

  eq(other: NestedEditorWidget): boolean {
    // STABLE identity — only compare immutable file path (D-13)
    // Do NOT compare fenceContent (changes every edit, would cause rebuild)
    return other.filePath === this.filePath;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lc-nested-editor';

    // Get or create child EditorView from registry
    let childView = this.registry.get(this.filePath);
    if (!childView) {
      childView = createChildEditor(this.fenceContent, container);
      this.registry.set(this.filePath, childView);
    } else {
      // Re-attach existing child DOM to new container
      container.appendChild(childView.dom);
      // Force geometry recalculation after reparenting (CM6 caches layout metrics)
      if (typeof childView.requestMeasure === 'function') childView.requestMeasure();
    }
    // Wire child→parent sync if not already wired (idempotent)
    wireSyncIfNeeded(view, childView, this.filePath, this.registry);
    return container;
  }

  destroy(dom: HTMLElement): void {
    // DETACH only — do NOT destroy the child EditorView (D-13)
    // The child lives in the registry until LRU eviction or plugin unload
    const childView = this.registry.get(this.filePath);
    if (childView && childView.dom.parentElement === dom) {
      dom.removeChild(childView.dom);
    }
  }

  get estimatedHeight(): number {
    // Approximate: lineCount * lineHeight. Better than -1.
    const lines = this.fenceContent.split('\n').length;
    return Math.max(lines * 20, 60); // 20px per line, minimum 60px
  }

  ignoreEvent(): boolean {
    // Let ALL events pass through to the child editor
    return false;
  }
}

/**
 * Extract the body text between fence opener and closer (exclusive of both).
 * Returns empty string if closerLine - openerLine <= 1 (empty fence).
 */
export function extractFenceBody(
  state: EditorState,
  fence: { openerLine: number; closerLine: number },
): string {
  if (fence.closerLine - fence.openerLine <= 1) return '';
  const from = state.doc.line(fence.openerLine + 1).from;
  const to = state.doc.line(fence.closerLine - 1).to;
  return state.doc.sliceString(from, to);
}

/**
 * Build the DecorationSet for the nested editor.
 *
 * Gates (all must pass):
 *   1. editorInfoField yields a file
 *   2. File's frontmatter contains non-empty `lc-slug` string
 *   3. findCodeFence(state) returns a valid fence
 *
 * When all gates pass: emit Decoration.line({ class: 'lc-fence-hidden' }) on
 * every line from openerLine to closerLine inclusive, plus a block widget
 * anchored at openerLine.to.
 */
export function buildNestedDecorations(
  state: EditorState,
  plugin: PluginHost,
  registry: ChildEditorRegistry,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Gate 1: file from editorInfoField
  const file = state.field(editorInfoField)?.file;
  if (!file) return builder.finish();

  // Gate 2: lc-slug frontmatter
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return builder.finish();
  }

  // Gate 3: code fence exists
  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  // Build decorations in sorted order (RangeSetBuilder requires ascending positions).
  // Opener line decoration (at openerLine.from) comes first,
  // then the block widget (at openerLine.to, side: 1),
  // then the remaining line decorations (openerLine+1 through closerLine).
  const hideLine = Decoration.line({ class: 'lc-fence-hidden' });
  const fenceContent = extractFenceBody(state, fence);

  // 1. Opener line-hide
  builder.add(state.doc.line(fence.openerLine).from, state.doc.line(fence.openerLine).from, hideLine);

  // 2. Block widget anchored at opener line end (side: 1 = renders after)
  const anchor = state.doc.line(fence.openerLine).to;
  builder.add(anchor, anchor, Decoration.widget({
    widget: new NestedEditorWidget(file.path, registry, fenceContent),
    block: true,
    side: 1,
  }));

  // 3. Remaining line-hide decorations (body + closer)
  for (let i = fence.openerLine + 1; i <= fence.closerLine; i++) {
    builder.add(state.doc.line(i).from, state.doc.line(i).from, hideLine);
  }

  return builder.finish();
}

/**
 * Build the complete nested editor CM6 extension.
 *
 * Returns [StateField, transactionFilter]:
 *   - StateField: produces DecorationSet (CSS-hide lines + widget)
 *   - transactionFilter: redirects cursor out of hidden zone → child focus
 */
export function buildNestedEditorExtension(plugin: PluginHost): Extension {
  const registry = plugin.childEditorRegistry;

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildNestedDecorations(state, plugin, registry);
    },
    update(old, tr) {
      // Skip rebuild for plugin-internal dispatches (WR-03 fix)
      const userEvent = tr.annotation(Transaction.userEvent);
      if (userEvent && userEvent.startsWith('leetcode.')) {
        return old.map(tr.changes);
      }
      // Rebuild on doc change OR reconfigure (file switch triggers reconfigure without docChanged)
      if (tr.docChanged || tr.reconfigured) {
        return buildNestedDecorations(tr.state, plugin, registry);
      }
      return old.map(tr.changes);
    },
    provide(f) {
      return EditorView.decorations.from(f);
    },
  });

  // CR-03 fix: detect external fence-body changes via updateListener (side-effect-safe)
  // instead of inside StateField.update() which must be pure.
  const externalChangeListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const ev = update.transactions[0]?.annotation(Transaction.userEvent);
    if (ev && ev.startsWith('leetcode.')) return;
    for (const tr of update.transactions) {
      if (tr.docChanged) {
        detectAndPropagateExternalChange(tr, plugin, registry);
        break;
      }
    }
  });

  const transactionFilter = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection) return tr;

    // Gate: only on lc-slug notes
    const file = tr.startState.field(editorInfoField)?.file;
    if (!file) return tr;
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return tr;

    // Only snap on collapsed cursor (not text selections)
    const sel = tr.selection;
    if (!sel.ranges.every(r => r.head === r.anchor)) return tr;

    const fence = findCodeFence(tr.state);
    if (!fence) return tr;

    const fenceFrom = tr.state.doc.line(fence.openerLine).from;
    const fenceTo = tr.state.doc.line(fence.closerLine).to;
    const head = sel.main.head;

    if (head >= fenceFrom && head <= fenceTo) {
      // Cursor landed in hidden fence zone — redirect to child
      const childView = registry.get(file.path);
      if (childView) {
        // Defer focus to next microtask (avoid re-entrancy in filter)
        queueMicrotask(() => childView.focus());
      }
      // Snap cursor: if coming from above, go to just before fence;
      // if from below, go to just after fence.
      const prevHead = tr.startState.selection.main.head;
      const snapTarget = prevHead < fenceFrom
        ? Math.max(0, fenceFrom - 1)
        : Math.min(tr.state.doc.length, fenceTo + 1);
      return {
        ...tr,
        selection: EditorSelection.cursor(snapTarget),
      };
    }
    return tr;
  });

  return [field, transactionFilter, externalChangeListener];
}
