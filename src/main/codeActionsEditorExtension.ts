// Phase 5.1 (POLISH-07 / 05-UAT G1) — Edit-mode inline Run/Submit buttons.
//
// Mounts a CM6 StateField<DecorationSet> that paints a widget below the
// `## Code` fence in Live Preview + Source Mode on `lc-slug` notes. Gated on
// `lc-slug` frontmatter via editorInfoField (D-06). Widget uses
// `Decoration.widget({ side: 1 })` — NEVER the block-widget flag — to avoid
// the Live Preview layout corruption observed in the 05-UAT G1 first attempt
// (RESEARCH Pitfall 1).
//
// WidgetType.eq() returns true for same-plugin widgets so CM6 reuses the
// rendered DOM across transactions — no flicker, no handler re-attachment
// (RESEARCH Pitfall 2).
//
// Click handlers call `plugin.runFromActive()` / `plugin.submitFromActive()`
// directly via the shared `buildCodeBlockButtonRow` helper — bypasses the
// `editorCheckCallback` gate regression fixed in 05-05 live smoke (D-05 /
// RESEARCH Pitfall 6).
//
// Reading-mode path (`codeActionsPostProcessor.ts`) stays untouched — this
// module is purely additive per D-11.
// @codemirror/state + @codemirror/view are transitive peers of obsidian@1.12.3;
// both are marked external in esbuild.config.mjs and supplied by the Obsidian
// host at runtime. They are not declared in package.json dependencies — the
// lint rule reports this as a false-positive for the transitive-peer case.
// Same suppression pattern as tests/helpers/obsidian-stub.ts (Wave 0).
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  StateField,
  RangeSetBuilder,
  type EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import {
  editorInfoField,
  editorLivePreviewField,
  type Plugin,
} from 'obsidian';
import {
  buildCodeBlockButtonRow,
  type CodeBlockButtonRowHost,
} from './codeBlockButtonRow';

type PluginHost = Plugin & CodeBlockButtonRowHost;

/**
 * Inline widget that paints a Run + Submit button row. Reuses the shipped
 * reading-mode helper verbatim so the `.leetcode-code-actions` DOM contract
 * stays centralized (zero CSS drift, CF-07 `createEl` compliance transitive).
 */
export class CodeActionsWidget extends WidgetType {
  constructor(readonly plugin: PluginHost) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    // Per RESEARCH Pitfall 10: use the editor's own Document (popout-window
    // safe) rather than the global `document`.
    return buildCodeBlockButtonRow(view.dom.ownerDocument, this.plugin);
  }

  eq(other: CodeActionsWidget): boolean {
    // RESEARCH Pitfall 2: same-plugin widgets are equivalent, so CM6 reuses
    // the existing DOM across transactions.
    return other instanceof CodeActionsWidget && other.plugin === this.plugin;
  }

  ignoreEvent(): boolean {
    // Let click events reach the button handlers inside the row. The helper
    // already calls preventDefault + stopPropagation so CM6's selection
    // behavior doesn't interfere (RESEARCH Pitfall 3).
    return false;
  }
}

/**
 * Locate the first fenced code block under a `## Code` H2 heading.
 *
 * Parity with reading-mode `codeActionsPostProcessor::findCodeSectionPre`:
 * first fence under `## Code` wins; fences outside the `## Code` section are
 * ignored (example fences in `## Problem` stay bare per D-02). Returns null
 * for empty documents, docs with no `## Code` section, and unterminated
 * fences.
 *
 * Line numbers are 1-indexed per CM6's `state.doc.line()` API.
 */
export function findCodeFence(
  state: EditorState,
): { openerLine: number; closerLine: number } | null {
  // RESEARCH Pitfall 8: state.doc.line(1) throws on an empty doc.
  if (state.doc.lines === 0) return null;

  const FENCE_RE = /^\s*```/;
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;

  let inCodeSection = false;
  const total = state.doc.lines;

  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;

    if (H2_CODE_RE.test(text)) {
      inCodeSection = true;
      continue;
    }
    if (H2_ANY_RE.test(text)) {
      inCodeSection = false;
      continue;
    }
    if (inCodeSection && FENCE_RE.test(text)) {
      // Found opener — walk forward for matching closer.
      for (let j = i + 1; j <= total; j++) {
        if (FENCE_RE.test(state.doc.line(j).text)) {
          return { openerLine: i, closerLine: j };
        }
      }
      return null; // unterminated fence
    }
  }
  return null;
}

/**
 * Build the DecorationSet for the current editor state.
 *
 * Returns an empty set unless:
 *   1. `editorInfoField` yields a file (RESEARCH Pitfall 4: metadataCache may
 *      be cold immediately on file open — docChanged transactions rebuild
 *      once the cache populates; no special wiring needed).
 *   2. The file's frontmatter contains a non-empty `lc-slug` string (D-06 /
 *      CF-13 — parity with reading-mode).
 *   3. A `## Code` fence exists in the document (D-02).
 *
 * When all three hold, the set contains exactly one inline widget anchored
 * at the end-of-line position of the closing fence's line, with `side: 1`
 * (renders AFTER the position, flowing in-line; the block-widget flag is
 * strictly forbidden per 05-UAT G1).
 */
export function buildDecorations(
  state: EditorState,
  plugin: PluginHost,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  const file = state.field(editorInfoField)?.file;
  if (!file) return builder.finish();

  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return builder.finish();
  }

  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  const anchor = state.doc.line(fence.closerLine).to;
  builder.add(
    anchor,
    anchor,
    Decoration.widget({
      widget: new CodeActionsWidget(plugin),
      side: 1, // after the position; inline (never the block-widget flag — 05-UAT G1 lock)
    }),
  );

  return builder.finish();
}

/**
 * Build the CM6 editor extension to register via
 * `Plugin.registerEditorExtension`.
 *
 * The StateField rebuilds the DecorationSet deterministically on:
 *   - `tr.docChanged` — user edited the doc (fence may have moved, Code
 *     section may have been added/removed, fence may have become
 *     terminated/unterminated)
 *   - `editorLivePreviewField` flip — Cmd-E toggled Source↔LivePreview;
 *     rebuild ensures we don't stash stale decorations tied to the previous
 *     mode (RESEARCH Pitfall 5)
 *
 * Other transactions (selection change, focus change) skip the rebuild and
 * map the old set through `tr.changes` (identity map when doc didn't change).
 */
export function buildCodeActionsEditorExtension(
  plugin: PluginHost,
): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, plugin);
    },
    update(old, tr) {
      const modeFlipped =
        tr.state.field(editorLivePreviewField) !==
        tr.startState.field(editorLivePreviewField);
      if (tr.docChanged || modeFlipped) {
        return buildDecorations(tr.state, plugin);
      }
      return old.map(tr.changes);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}
