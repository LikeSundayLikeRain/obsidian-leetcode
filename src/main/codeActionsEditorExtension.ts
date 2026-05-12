// Phase 5.1 (POLISH-07 / 05-UAT G1) — Edit-mode inline Run/Submit buttons.
//
// Mounts a CM6 StateField<DecorationSet> that paints a widget below the
// `## Code` fence in Live Preview + Source Mode on `lc-slug` notes. Gated on
// `lc-slug` frontmatter via editorInfoField (D-06). Widget uses
// `Decoration.widget({ side: 1 })` — NEVER the block-widget flag — to avoid
// the Live Preview layout corruption observed in the 05-UAT G1 first attempt
// (RESEARCH Pitfall 1).
//
// WidgetType.eq() returns true for same-plugin + same-file + same-currentSlug
// widgets so CM6 reuses the rendered DOM across transactions — no flicker, no
// handler re-attachment (RESEARCH Pitfall 2). Phase 5.3 D-10 added file +
// currentSlug to the eq() identity so flipping `lc-language` rebuilds the
// chevron label without a docChanged trigger (UI-SPEC §"Coexistence with
// Phase 5.1 Run/Submit buttons").
//
// Click handlers call `plugin.runFromActive()` / `plugin.submitFromActive()`
// directly via the shared `buildCodeBlockButtonRow` helper — bypasses the
// `editorCheckCallback` gate regression fixed in 05-05 live smoke (D-05 /
// RESEARCH Pitfall 6).
//
// Phase 5.3 D-06 / D-09 — Edit-Mode-only language chevron is mounted as a
// LEFT-aligned prefix in the same row via `opts.prefix` factory; Reading-Mode
// path (`codeActionsPostProcessor.ts`) stays untouched and does NOT pass the
// factory (Reading-Mode chevron is out of scope per D-09).
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
  type TFile,
} from 'obsidian';
import { buildCodeBlockButtonRow } from './codeBlockButtonRow';
import {
  buildLanguageChevron,
  type LanguageChevronHost,
} from './languageChevronWidget';

/**
 * Phase 5.3 D-06 — the plugin host must satisfy `LanguageChevronHost` so the
 * chevron's click handler can call `plugin.switchLanguage(file, slug)`.
 * `LanguageChevronHost` extends `CodeBlockButtonRowHost`, so Run/Submit
 * dispatch is preserved transitively.
 *
 * Plugins also need a `settings.getDefaultLanguage()` accessor for the cold-cache
 * fallback when `lc-language` frontmatter is absent (RESEARCH §Pitfall 3).
 * Structural typing keeps tests free of full SettingsStore imports.
 */
type PluginHost = Plugin & LanguageChevronHost & {
  settings: { getDefaultLanguage(): string };
};

/**
 * Inline widget that paints a chevron + Run + Submit row. Reuses the shipped
 * reading-mode helper (with an Edit-Mode-only `opts.prefix` factory) so the
 * `.leetcode-code-actions` DOM contract stays centralized (zero CSS drift,
 * CF-07 `createEl` compliance transitive).
 *
 * Phase 5.3 D-06 / D-10 — `file` and `currentSlug` are captured at widget
 * construction so the chevron can render the right label and so `eq()` can
 * detect a `lc-language` flip and force a DOM rebuild.
 */
export class CodeActionsWidget extends WidgetType {
  constructor(
    readonly plugin: PluginHost,
    readonly file: TFile,
    readonly currentSlug: string,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    // Per RESEARCH Pitfall 10: use the editor's own Document (popout-window
    // safe) rather than the global doc.
    const doc = view.dom.ownerDocument;
    return buildCodeBlockButtonRow(doc, this.plugin, {
      // D-09 — Edit-Mode only. The Reading-Mode call site
      // (codeActionsPostProcessor.ts) MUST NOT pass opts.prefix.
      prefix: () =>
        buildLanguageChevron(doc, this.plugin, this.file, this.currentSlug),
    });
  }

  eq(other: CodeActionsWidget): boolean {
    // RESEARCH Pitfall 2: same-plugin widgets are equivalent. Phase 5.3 D-10
    // extends the identity to include the active file and the current LC
    // language so flipping `lc-language` rebuilds the chevron label without
    // requiring a docChanged transaction.
    return (
      other instanceof CodeActionsWidget &&
      other.plugin === this.plugin &&
      other.file === this.file &&
      other.currentSlug === this.currentSlug
    );
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
 * Phase 5.3 D-06: the active `lc-language` (chevron currentSlug) is sourced
 * from frontmatter with a `settings.getDefaultLanguage()` cold-cache fallback
 * (RESEARCH §Pitfall 3 — first paint may precede metadataCache population).
 *
 * When all three hold, the set contains exactly one inline widget anchored
 * at the line AFTER the closing fence (or end-of-doc fallback at the closer's
 * line end with side: 1 — the block-widget flag is strictly forbidden per
 * 05-UAT G1).
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

  // Phase 5.3 D-06 — chevron current-language source. Pulls from `lc-language`
  // frontmatter; falls back to the user's default language when absent
  // (cold-cache mitigation per RESEARCH §Pitfall 3 — keeps the chevron from
  // briefly painting "▼ undefined" the first ~100 ms after file open).
  const lcLanguageRaw = fm?.['lc-language'];
  const currentSlug =
    typeof lcLanguageRaw === 'string' && lcLanguageRaw.length > 0
      ? lcLanguageRaw
      : plugin.settings.getDefaultLanguage();

  // Reading-mode parity (D-01, 05-05 D-13): the button row is a *sibling after*
  // the <pre> block, not inside it. In CM6 Live Preview, the closing fence line
  // is still part of the rendered code-block widget; a widget anchored at that
  // line's end gets clipped visually inside the block. Anchor the widget at the
  // start of the line AFTER the closer so it renders on its own line between
  // the fence and the next content (matches reading-mode's `insertAdjacentElement('afterend', ...)`).
  // When the closing fence is the last line of the document, fall back to the
  // closer line's end with side: 1 — there's no next line to anchor to.
  const hasLineAfterCloser = fence.closerLine < state.doc.lines;
  const anchor = hasLineAfterCloser
    ? state.doc.line(fence.closerLine + 1).from
    : state.doc.line(fence.closerLine).to;
  builder.add(
    anchor,
    anchor,
    Decoration.widget({
      widget: new CodeActionsWidget(plugin, file as TFile, currentSlug),
      // side: -1 at the start of the next line places the widget before that
      // line's rendered content, visually outside the fenced-block widget.
      // side: 1 at end-of-doc fallback (no following line to anchor to).
      side: hasLineAfterCloser ? -1 : 1,
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
