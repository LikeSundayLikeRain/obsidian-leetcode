// Phase 5.1 (POLISH-07 / 05-UAT G1) — Edit-mode inline Run/Submit buttons.
//
// Mounts a CM6 StateField<DecorationSet> that paints a widget below the
// `## Code` fence in Live Preview + Source Mode on `lc-slug` notes. Gated on
// `lc-slug` frontmatter via editorInfoField (D-06).
//
// G-LAYOUT-V2 (gap-closure post-Plan 06): widget is now a CM6 BLOCK widget
// (`Decoration.widget({ widget, block: true, side: 1 })`) anchored at the END
// of the fence-close line. A block widget renders as its OWN line below the
// fence, so it (a) sits visually below the fence area (NOT inside the code
// region — the Plan 05 G-LAYOUT fix had moved it inside, which the user
// rejected) AND (b) is not subject to indent decoration of any
// content-bearing line (the original G-LAYOUT bug — Tab on the line below
// the fence dragged the chevron+buttons horizontally). The earlier
// constraint that `block: true` caused Live Preview corruption (Phase 5.1
// RESEARCH Pitfall 1) traced to anchoring at the START of a content line;
// anchoring at the closer-fence line's END (with side: 1) treats the widget
// as a post-line block and renders cleanly in Live Preview + Source Mode.
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
  StateEffect,
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
  MarkdownView,
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
 * G-LABEL-LAG fix (gap-closure 05.3-05): a manual rebuild trigger for the
 * StateField when nothing in the document changed but the chevron's source
 * data (frontmatter `lc-language`) has. Two equivalent paths exist for
 * surfacing this signal:
 *   PATH A (chosen) — the extension owns a `metadataCache.on('changed')`
 *     subscription and dispatches this effect on the active view when the
 *     subscribed file matches. Minimal surface; keeps src/main.ts unaware
 *     of the StateField's rebuild contract.
 *   PATH B (alternative) — `switchFenceLanguage` in src/main.ts dispatches
 *     this effect on its own EditorView after `processFrontMatter` resolves.
 *     Cleaner causality but couples main.ts to the editor extension.
 *
 * PATH A chosen: keeps the chevron-label freshness contract local to the
 * editor extension that owns the chevron rendering. The metadataCache
 * listener already fires whenever frontmatter changes — including for
 * external edits that bypass `switchFenceLanguage` (e.g., user edits the
 * property panel manually) — so PATH A also closes that secondary refresh
 * gap automatically.
 */
/**
 * Phase 05.5 chevron-staleness hardening: the effect now carries an optional
 * override slug. When a dispatcher already knows the new `lc-language` value
 * (e.g., the chevron switch path knows it post-processFrontMatter), it passes
 * the slug directly so `buildDecorations` doesn't have to re-read a cold
 * metadataCache. Callers that don't know (e.g., the metadataCache 'changed'
 * subscription, where the cache IS the source of truth) pass `undefined` and
 * the read-from-frontmatter path in `buildDecorations` still applies.
 */
export const languageRefreshEffect = StateEffect.define<string | undefined>();

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
 * When all three hold, the set contains exactly one BLOCK widget anchored
 * at the END of the closer-fence line with side: 1 + block: true
 * (G-LAYOUT-V2 — gap-closure post-Plan 06). The widget renders as its own
 * line below the fence, immune to indent decoration of any content-bearing
 * line (the Plan 05 G-LAYOUT inline-widget anchor was vulnerable to Tab on
 * the line below shifting the chevron+buttons horizontally; Plan 05's fix
 * moved the widget INTO the fence which the user rejected). Block-widget
 * placement at fence-close-end is the canonical solution.
 */
export function buildDecorations(
  state: EditorState,
  plugin: PluginHost,
  overrideSlug?: string,
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
  //
  // Phase 05.5 chevron-staleness fix: when an `overrideSlug` is supplied (the
  // chevron switch path knows the new slug after processFrontMatter resolves
  // but BEFORE metadataCache flushes), it wins over the frontmatter read.
  // This eliminates the "metadataCache lag → chevron paints old language
  // until user types" regression.
  const lcLanguageRaw = fm?.['lc-language'];
  const currentSlug =
    overrideSlug && overrideSlug.length > 0
      ? overrideSlug
      : typeof lcLanguageRaw === 'string' && lcLanguageRaw.length > 0
        ? lcLanguageRaw
        : plugin.settings.getDefaultLanguage();

  // G-LAYOUT-V2 fix (gap-closure post-Plan 06): BLOCK widget anchored at
  // end of closer-fence line with side: 1. A block widget renders as its
  // own line BELOW the fence, so it (a) sits visually below the fenced
  // code area (user's preferred placement), AND (b) escapes the indent
  // decoration of any content-bearing line — typing Tab on the line below
  // the fence no longer shifts the chevron+buttons horizontally.
  // The closer-fence line is always at the fence's own indent (0 for
  // top-level ## Code fences), and `block: true` makes the widget render
  // as a standalone block following that line.
  const anchor = state.doc.line(fence.closerLine).to;
  const side = 1;
  builder.add(
    anchor,
    anchor,
    Decoration.widget({
      widget: new CodeActionsWidget(plugin, file, currentSlug),
      side,
      block: true,
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
 *   - `languageRefreshEffect` — Phase 5.3 Plan 05 G-LABEL-LAG fix:
 *     metadataCache 'changed' subscription dispatches this effect after
 *     `processFrontMatter` lands, so the chevron label re-renders on the
 *     same click instead of lagging until the next docChanged transaction
 *
 * Other transactions (selection change, focus change) skip the rebuild and
 * map the old set through `tr.changes` (identity map when doc didn't change).
 */
export function buildCodeActionsEditorExtension(
  plugin: PluginHost,
): Extension {
  // G-LABEL-LAG fix (PATH A): subscribe to metadataCache 'changed' once at
  // extension build time. When the active MarkdownView's file matches the
  // changed file, dispatch the languageRefreshEffect on its EditorView so
  // the StateField below rebuilds the chevron label synchronously — no
  // user-typing transaction required to flush the new lc-language value.
  // plugin.registerEvent owns auto-cleanup on unload (no manual off()).
  try {
    plugin.registerEvent(
      plugin.app.metadataCache.on('changed', (file) => {
        try {
          const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || view.file !== file) return;
          // `view.editor.cm` is the same undocumented internal handle the
          // chevron switch path uses (see src/main.ts switchFenceLanguage).
          const cm = (view.editor as unknown as { cm: EditorView }).cm;
          // Phase 05.5 chevron-staleness fix: pass the fresh `lc-language`
          // value directly as the effect payload. By the time `'changed'`
          // fires Obsidian's cache reflects the new frontmatter — but
          // `buildDecorations`'s subsequent re-read may race against any
          // intermediate listener; threading the value through the effect
          // payload guarantees the right slug regardless of read ordering.
          const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
            | Record<string, unknown>
            | undefined;
          const lcLanguageRaw = fm?.['lc-language'];
          const freshSlug =
            typeof lcLanguageRaw === 'string' && lcLanguageRaw.length > 0
              ? lcLanguageRaw
              : undefined;
          cm.dispatch({ effects: languageRefreshEffect.of(freshSlug) });
        } catch {
          // Silently ignore — the editor may be in teardown, the active view
          // may not be a MarkdownView, or `editor.cm` may be missing in test
          // contexts. The next docChanged transaction will rebuild anyway.
        }
      }),
    );
  } catch {
    // Defensive: if metadataCache isn't yet wired (test fixtures sometimes
    // omit it), fall through to the StateField — extension still builds.
  }

  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, plugin);
    },
    update(old, tr) {
      const modeFlipped =
        tr.state.field(editorLivePreviewField) !==
        tr.startState.field(editorLivePreviewField);
      // G-LABEL-LAG: rebuild when the manual refresh effect lands, in
      // addition to the existing docChanged + modeFlipped triggers.
      // Phase 05.5: when the effect carries an override slug payload, pass
      // it through to buildDecorations so the chevron paints the new
      // language immediately even if metadataCache hasn't flushed yet.
      let overrideSlug: string | undefined;
      for (const e of tr.effects) {
        if (e.is(languageRefreshEffect)) {
          overrideSlug = e.value;
        }
      }
      const refreshEffect = overrideSlug !== undefined ||
        tr.effects.some((e) => e.is(languageRefreshEffect));
      if (tr.docChanged || modeFlipped || refreshEffect) {
        return buildDecorations(tr.state, plugin, overrideSlug);
      }
      return old.map(tr.changes);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}
