// Phase 5.3 (POLISH-09 / D-11 PRIMARY) — Language-aware edit-mode fence.
//
// Per-view CM6 Compartment that holds the currently-active LanguageSupport
// for the `## Code` fence on `lc-slug` notes. A StateField<FenceState> tracks
// whether the caret is inside the fence and what language the fence declares.
// A ViewPlugin observes StateField changes and dispatches
// `Compartment.reconfigure(...)` transactions — installing a LanguageSupport
// when the caret enters a supported fence, installing whitespace-copy for
// unsupported fences (D-06), and emptying the compartment when the caret
// leaves the fence.
//
// This is the canonical CM6 pattern for runtime-switched language-per-view.
// RESEARCH §Pitfall 1 documents why D-10 Plan A (markdown codeLanguages
// augmentation) is not publicly achievable; D-11 Plan B (this file) is the
// primary implementation path.
//
// Reuses Phase 5.1's `findCodeFence` (D-13 scoping) and `lc-slug` gate
// (D-12). 5.1's StateField + button widget continues to operate independently
// on the same EditorView (RESEARCH Pattern 1 architecture diagram).
//
// CF-19 silent posture: pack-load failures fall back to whitespace-copy
// without surfacing a Notice. View-destroyed-during-async-load is guarded
// (RESEARCH Pitfall 3). prev !== next guard (RESEARCH Pitfall 5) collapses
// redundant compartment reconfigures triggered by phantom selection events.

// @codemirror/state + @codemirror/view are transitive peers of obsidian@1.12.3;
// both are marked external in esbuild.config.mjs and supplied by the Obsidian
// host at runtime. They are not declared in package.json dependencies — the
// lint rule reports this as a false-positive for the transitive-peer case.
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  StateField,
  Compartment,
  type EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  ViewPlugin,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  editorInfoField,
  editorLivePreviewField,
  type Plugin,
} from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';
import { resolveLangSlug } from '../solve/languages';
import { getLanguagePack, type PackId } from './languagePackRegistry';
import { whitespaceCopyIndentExtension } from './whitespaceCopyIndent';

/**
 * Pack the compartment should be configured to:
 *   - 'none'      → empty compartment (markdown default behavior).
 *   - 'fallback'  → whitespace-copy indent (D-06 unsupported-language path).
 *   - PackId      → resolved LanguageSupport from the registry (lazy import).
 */
export type DesiredPack = 'none' | 'fallback' | PackId;

/**
 * StateField shape: every transaction that mutates the doc, the selection,
 * or flips Live-Preview/Source mode recomputes this from scratch via
 * `computeFenceState`. The ViewPlugin then diffs `prev.desiredPack` against
 * `next.desiredPack` and dispatches a compartment swap only when they differ
 * (RESEARCH Pitfall 5).
 */
export interface FenceState {
  caretInCodeFence: boolean;
  langSlug: string | null;
  desiredPack: DesiredPack;
}

/** Sentinel returned when any gate fails — no fence behavior, empty compartment. */
const EMPTY: FenceState = {
  caretInCodeFence: false,
  langSlug: null,
  desiredPack: 'none',
};

/**
 * Map an LC langSlug to a DesiredPack.
 *
 * Differs from `slugToPackId` (in languagePackRegistry.ts) by returning
 * 'fallback' for unsupported slugs instead of `null` — this layer drives the
 * compartment swap, where 'fallback' selects whitespaceCopyIndentExtension
 * (D-06) and 'none' selects an empty compartment.
 */
export function mapSlugToPack(slug: string): DesiredPack {
  switch (slug) {
    case 'python':
      return 'python';
    case 'python3':
      return 'python';
    case 'java':
      return 'java';
    case 'cpp':
      return 'cpp';
    case 'c':
      return 'cpp';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'golang':
      return 'go';
    case 'rust':
      return 'rust';
    default:
      return 'fallback';
  }
}

/**
 * Compute the FenceState for a given EditorState. Pure: no I/O, no async.
 *
 * Gates (in order, short-circuit returns EMPTY on first failure):
 *   1. `editorInfoField` yields a file (D-12 + 5.1 parity).
 *   2. The file's frontmatter contains a non-empty `lc-slug` string (D-12).
 *   3. A `## Code` fence exists in the document (D-13, via 5.1 `findCodeFence`).
 *   4. The caret is strictly between the fence's opener and closer lines
 *      (boundary lines do not count — RESEARCH Open Question 4).
 *
 * On success: extracts the fence-tag from the opener line, resolves to an
 * LC langSlug via `resolveLangSlug`, and routes to a DesiredPack via
 * `mapSlugToPack`.
 */
export function computeFenceState(state: EditorState, plugin: Plugin): FenceState {
  // Gate 1 — file present.
  const file = state.field(editorInfoField)?.file;
  if (!file) return EMPTY;

  // Gate 2 — lc-slug frontmatter (parity with 5.1 buildDecorations).
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) return EMPTY;

  // Gate 3 — `## Code` fence present.
  const fence = findCodeFence(state);
  if (!fence) return EMPTY;

  // Gate 4 — caret strictly inside the fence (RESEARCH Open Question 4).
  const caretPos = state.selection.main.head;
  const caretLine = state.doc.lineAt(caretPos).number;
  const inFence = caretLine > fence.openerLine && caretLine < fence.closerLine;
  if (!inFence) return EMPTY;

  // Extract fence tag (the language name immediately after the opening
  // backticks) and resolve to a canonical LC langSlug.
  const openerText = state.doc.line(fence.openerLine).text;
  const tagMatch = /^\s*```\s*(\S+)?/.exec(openerText);
  const fenceTag = tagMatch?.[1] ?? null;
  // Pass empty-string fallback for parity with 5.1; computeFenceState is a
  // pure function and must not couple to SettingsStore internals (the
  // settings accessor is captured in main.ts when warming the default pack).
  const langSlug = resolveLangSlug(fenceTag, '');
  const desiredPack = mapSlugToPack(langSlug);

  return { caretInCodeFence: true, langSlug, desiredPack };
}

/**
 * Build the Phase 5.3 editor extension. Returns a 3-tuple Extension:
 *   - `fenceStateField`: tracks caret-in-fence + desired pack across transactions.
 *   - `viewPlugin`: dispatches compartment swaps async on prev !== next.
 *   - `languageCompartment.of([])`: initial empty compartment value (markdown
 *     default behavior until the caret enters a fence).
 *
 * Each call returns a FRESH compartment instance — `registerEditorExtension`
 * invokes the factory per view, so each EditorView gets its own compartment
 * (RESEARCH Anti-Pattern §"Storing the compartment globally").
 */
export function buildCodeFenceLanguageExtension(plugin: Plugin): Extension {
  const languageCompartment = new Compartment();

  const fenceStateField = StateField.define<FenceState>({
    create(state) {
      return computeFenceState(state, plugin);
    },
    update(old, tr) {
      // Mode-flip detection: Cmd-E toggles Live-Preview ↔ Source. Force a
      // recompute so we don't carry stale state across modes.
      const modeFlipped =
        tr.state.field(editorLivePreviewField) !==
        tr.startState.field(editorLivePreviewField);
      if (tr.docChanged || tr.selection || modeFlipped) {
        return computeFenceState(tr.state, plugin);
      }
      return old;
    },
  });

  const viewPlugin = ViewPlugin.fromClass(
    class {
      constructor(private readonly view: EditorView) {
        // First-render: if the caret is already inside a fence on mount
        // (e.g. user reopens a note with the cursor saved inside the fence),
        // kick a swap so the language pack installs immediately. async via
        // void — never inline-dispatch from a view-plugin lifecycle method.
        const s = view.state.field(fenceStateField);
        if (s.desiredPack !== 'none') void this.swap(s);
      }

      update(vu: ViewUpdate): void {
        const prev = vu.startState.field(fenceStateField);
        const next = vu.state.field(fenceStateField);
        // RESEARCH Pitfall 5 — load-bearing equality check. `tr.selection`
        // fires on phantom selection events (scroll, focus, internal
        // setSelection); collapsing every change to "same desiredPack ⇒
        // no-op" prevents redundant compartment reconfigures that would
        // otherwise re-highlight the entire fence on every keystroke.
        if (prev.desiredPack !== next.desiredPack) {
          void this.swap(next);
        }
      }

      private async swap(target: FenceState): Promise<void> {
        let ext: Extension = [];
        if (target.desiredPack === 'fallback') {
          ext = whitespaceCopyIndentExtension;
        } else if (target.desiredPack !== 'none') {
          try {
            ext = await getLanguagePack(target.desiredPack);
          } catch {
            // CF-19 silent posture: pack-load failures fall back to
            // whitespace-copy without a Notice. Same discipline as 5.2's
            // python3Highlighter Prism alias.
            ext = whitespaceCopyIndentExtension;
          }
        }
        // RESEARCH Pitfall 3 — view may have been destroyed during async
        // pack load (user closed the note). Dispatching on a destroyed
        // view throws; guard before dispatch.
        if ((this.view as EditorView & { destroyed?: boolean }).destroyed) return;
        this.view.dispatch({
          effects: languageCompartment.reconfigure(ext),
        });
      }
    },
  );

  return [
    fenceStateField,
    viewPlugin,
    languageCompartment.of([]),
  ];
}
