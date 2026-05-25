// Phase 13 — Child EditorView factory.
// Creates a properly-configured child EditorView mounted into a provided
// parent HTMLElement.
//
// Phase 16 — Language is now Compartment-driven (D-11). The hardcoded
// `python()` LanguageSupport and `indentUnit.of('    ')` from Phase 13 have
// been replaced with `languageCompartment.of(buildLanguageExtensions(slug,
// override))` (16-01). The Compartment payload owns LanguageSupport,
// indentUnit, closeBrackets, and the Cmd-/ comment binding (D-11).
//
// Pitfall D (RESEARCH §12): `closeBracketsKeymap` is wired at the TOP LEVEL
// (outside the Compartment) and placed BEFORE the main keymap so its
// Backspace handler is consulted first. The keymap is language-agnostic so
// it does not need to live inside the Compartment.
//
// Pitfall B (RESEARCH §12): `closeBracketsKeymap` is imported from the
// `@codemirror/autocomplete` package root only — never a deep subpath.
//
// HIGHLIGHT-01 / D-15: `bracketMatching()` from Phase 13 is unchanged —
// don't remove or duplicate it.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
  ViewPlugin,
  type Command,
  type PluginValue,
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
import { bracketMatching, indentUnit } from '@codemirror/language';
import {
  history,
  indentMore,
  indentLess,
  defaultKeymap,
  historyKeymap,
  toggleLineComment,
} from '@codemirror/commands';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
// eslint-disable-next-line import/no-extraneous-dependencies -- direct dep added Phase 17 Plan 06 (D-18)
import { vim } from '@replit/codemirror-vim';
import type { App, Scope } from 'obsidian';
import { languageCompartment, buildLanguageExtensions } from './childEditorLanguage';
import { createScrollIntoViewExtension } from './childEditorSync';
import { createThemedHighlight } from './childEditorTheme';
import { obsidianSemanticClasses } from './childEditorSemanticClasses';
// Phase 18 Plan 01 (D-32) — Vim Scope intercept module. See
// src/main/childEditorVimScope.ts for the full design. Wired below in the
// extensions array, gated on `app && vimEnabled`.
import { createVimScopeExtension } from './childEditorVimScope';

// Phase 16 / debug session `cmd-slash-not-reaching-child`:
// Obsidian registers Mod-/ as `editor:toggle-comments` via its Scope-based
// keymap manager (app.keymap, app.scope). The hotkey is dispatched through
// Obsidian's internal queue, NOT a DOM event — DOM-level keydown listeners
// (capture phase on window/document/contentDOM) cannot prevent it.
//
// Fix: push an Obsidian Scope onto app.keymap when the child editor gains
// focus, with Mod-/ registered to run toggleLineComment on the child. Pop
// the scope on blur. This is the same mechanism Obsidian's Modal class
// uses to override hotkeys when modals are open. Returns false from the
// Scope handler tells Obsidian "I handled it, don't dispatch further."
function isMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

// Phase 17 Plan 03 (D-11/D-12) — Custom Tab handler that branches on cursor
// position. Replaces the bare `indentWithTab` keymap entry from Phase 15:
//
//   - Multi-line selection (sel spans >1 line) → ALWAYS indent all lines as
//     a single transaction (CM6 indentMore is single-tx → preserves the
//     Phase 15 INDENT-03 single-undo invariant).
//   - Cursor at or before first non-whitespace of line → indent the line
//     (delegates to indentMore — INDENT-01 preserved).
//   - Mid-line cursor (after at least one non-whitespace char) → insert
//     the indentUnit facet's string at cursor (D-11 NEW).
//
// IMPORTANT (Rule 1 deviation from RESEARCH.md): CM6's `insertTab` from
// `@codemirror/commands` HARDCODES a real `\t` character — it does NOT read
// the `indentUnit` facet. Verified by inspecting the bundled source:
//   `dispatch(state.update(state.replaceSelection("\t"), ...))`
// To honor INDENT-04 (4 spaces for Java/Python, 2 for JS, real \t for Go —
// per the per-language indentUnit map in childEditorLanguage.ts), we read
// the `indentUnit` facet ourselves and dispatch a replaceSelection with the
// right string. Single transaction → single undo step preserved.
//
// `indentMore` and `indentLess` are `StateCommand`-typed (target =
// {state, dispatch}). EditorView is a structural superset (has `state` and
// `dispatch`), so passing `view` directly to them works at runtime — but
// the duplicate `@codemirror/state` resolution (root @6.6.0 vs
// @codemirror/commands' transitive @6.5.0) makes the `state` types
// nominally distinct under tsc. We cast through the looser StateCommand
// signature to bypass the structural-equality TS2345 noise without leaving
// runtime behavior touched (same workaround used in Phase 16 behavioral
// test — see tests/main/childEditorLanguage.behavioral.test.ts §50-57).
//
// Phase 15 priority invariant: this command MUST be bound BEFORE
// defaultKeymap in keymap.of(...) so it takes precedence over CM6's stock
// Tab handler (which would otherwise trigger focus navigation per the Phase
// 15 D-05 cm-z scope isolation work).
type LooseStateCommand = (target: {
  state: EditorState;
  dispatch: (tr: ReturnType<EditorState['update']>) => void;
}) => boolean;
const indentMoreLoose = indentMore as unknown as LooseStateCommand;
const indentLessLoose = indentLess as unknown as LooseStateCommand;

export const customTabCommand: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  // Multi-line selection → always indent (preserves INDENT-03 single-undo).
  // We test by line number, not raw offsets, so a selection that ends right
  // at a line boundary (`\n` index) is still treated correctly.
  if (
    !sel.empty &&
    state.doc.lineAt(sel.from).number !== state.doc.lineAt(sel.to).number
  ) {
    return indentMoreLoose(view);
  }
  // Cursor at or before first non-whitespace of line → indent the line.
  const line = state.doc.lineAt(sel.head);
  const beforeCursor = line.text.slice(0, sel.head - line.from);
  if (/^\s*$/.test(beforeCursor)) {
    return indentMoreLoose(view);
  }
  // Mid-line → insert the indentUnit facet's string at cursor (real \t for
  // Go, N spaces otherwise). One dispatch → one undo entry.
  const unit = state.facet(indentUnit);
  view.dispatch(
    state.update(state.replaceSelection(unit), {
      scrollIntoView: true,
      userEvent: 'input',
    }),
  );
  return true;
};

// Shift-Tab dedents the current line (or all selected lines for multi-line
// selections) regardless of cursor position. Simple delegation to indentLess
// preserves the Phase 15 INDENT-02 invariant.
export const customShiftTabCommand: Command = (view) => indentLessLoose(view);

/**
 * ViewPlugin that pushes an Obsidian Scope on focus and pops on blur.
 * The Scope intercepts Mod-/ for the child editor and runs the language-
 * aware comment toggle. Without this, Obsidian's app-level
 * `editor:toggle-comments` hotkey wins and inserts `%% %%` into the parent.
 *
 * Returns the ViewPlugin extension. Pass `app` from the plugin instance via
 * the factory.
 */
function createCmdSlashScopeExtension(app: App): Extension {
  return ViewPlugin.define((view): PluginValue => {
    let activeScope: Scope | null = null;

    const runComment = toggleLineComment as unknown as (v: EditorView) => boolean;

    const onFocus = (): void => {
      if (activeScope !== null) return;
      // Obsidian's Scope class is a runtime construct exported from 'obsidian'.
      // We construct one with app.scope as parent so app-level hotkeys other
      // than our overrides still work as expected.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Scope } = require('obsidian') as typeof import('obsidian');
      const scope = new Scope(app.scope);
      // Register Mod-/ inside our scope. Returning false stops further
      // dispatch (Obsidian's app-level handler doesn't run).
      scope.register(['Mod'], '/', (event) => {
        if (!isMod(event as KeyboardEvent)) return true;
        runComment(view);
        return false;
      });
      app.keymap.pushScope(scope);
      activeScope = scope;
    };

    const onBlur = (): void => {
      if (activeScope === null) return;
      app.keymap.popScope(activeScope);
      activeScope = null;
    };

    view.contentDOM.addEventListener('focus', onFocus);
    view.contentDOM.addEventListener('blur', onBlur);
    if (document.activeElement === view.contentDOM) onFocus();

    return {
      destroy(): void {
        view.contentDOM.removeEventListener('focus', onFocus);
        view.contentDOM.removeEventListener('blur', onBlur);
        if (activeScope !== null) {
          app.keymap.popScope(activeScope);
          activeScope = null;
        }
      },
    };
  });
}

/**
 * Phase 18 Plan 03 (LINENUM-RELATIVE-01 / D-35) — pure formatter for the
 * line-number gutter when relative line numbers are enabled.
 *
 * Returns the absolute line number when `lineNo` matches the cursor's line
 * (vim relativenumber convention — cursor line shows its own number),
 * otherwise returns the absolute distance from the cursor as a string.
 *
 * Pure function: takes `lineNo` (1-indexed line number from CM6's
 * lineNumbers extension) and the current `state`, reads `state.selection
 * .main.head` and `state.doc.lineAt(...).number` to derive the cursor
 * line, and returns a formatted string. NO side effects, NO DOM access.
 * The lineNumbers extension's `formatNumber` callback fires on every
 * relevant render pass, so the gutter updates automatically when the
 * cursor moves — no listener / setInterval / requestAnimationFrame needed.
 *
 * Exported for unit tests (childEditorFactory.test.ts).
 */
export function relativeFormatter(lineNo: number, state: EditorState): string {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  if (lineNo === cursorLine) return String(cursorLine);
  return String(Math.abs(lineNo - cursorLine));
}

/**
 * Create a child EditorView with language-aware syntax highlighting and
 * standard editing extensions. The EditorView is mounted into the provided
 * parent HTMLElement.
 *
 * Phase 16 (D-07/D-11): the language pack, indent unit, closeBrackets, and
 * Cmd-/ comment binding are produced by `buildLanguageExtensions(slug,
 * override)` and wrapped in `languageCompartment.of(...)`. The chevron's
 * `Compartment.reconfigure` dispatch in 16-04 lands on this Compartment
 * key — no remount, no widget rebuild.
 *
 * Pitfall D: `closeBracketsKeymap` is registered at the top level BEFORE the
 * main keymap so its Backspace handler wins over `defaultKeymap`'s.
 *
 * @param content - Initial document content for the editor
 * @param parent - HTMLElement to mount the editor into
 * @param initialSlug - Canonical LC language slug for the initial language
 *   pack (e.g. 'python3', 'java', 'golang'). Drives `getLanguageSupport`
 *   inside `buildLanguageExtensions`. Unknown slugs fall back to Python (D-04).
 * @param indentOverride - User's `indentSizeOverride` setting from
 *   `SettingsStore` (16-02). `'auto'` defers to the per-language map (D-05);
 *   2/4/8 forces that many spaces, except for Go which always uses tab (D-06).
 * @param app - Obsidian App instance (used for Scope-based Mod-/ intercept;
 *   see debug session `cmd-slash-not-reaching-child.md`).
 * @param syncExtensions - Optional array of sync-related extensions
 *   (e.g., updateListener for child→parent sync)
 * @param showRelative - Phase 18 Plan 03 (LINENUM-RELATIVE-01 / D-35) —
 *   plugin-owned relative-line-numbers flag. Read-once-at-mount per Plan 17-12;
 *   toggling requires note remount (Cmd-E flip OR close+reopen). When true
 *   AND Obsidian's `showLineNumber` is also enabled, the gutter renders via
 *   `lineNumbers({ formatNumber: relativeFormatter })`; otherwise the existing
 *   Plan 17-12 baseline `lineNumbers()` is preserved verbatim. Defaults to
 *   `false` when omitted (legacy callsite shape preserved).
 * @returns The created EditorView instance
 */
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  initialSlug: string,
  indentOverride: 'auto' | 2 | 4 | 8,
  app?: App,
  syncExtensions?: Extension[],
  showRelative?: boolean,
): EditorView {
  // Phase 17 Plan 06 (D-18) — Vim mode conditional. Read Obsidian's global
  // `vimMode` setting ONCE at child mount; if true, prepend the vim() extension
  // so its keybindings + mode indicator activate. If false, exclude it (no
  // runtime keymap installed). Per CONTEXT D-21 the package is bundled either
  // way (esbuild CJS + nosplit cannot truly defer the import), so the
  // conditional only saves runtime cost, not bundle cost.
  //
  // `app.vault.getConfig('vimMode')` is undocumented — accessed via cast.
  // Returns true when "Editor → Vim key bindings" is enabled in Obsidian.
  const vimEnabled =
    !!app &&
    (app as unknown as { vault: { getConfig(key: string): unknown } }).vault.getConfig(
      'vimMode',
    ) === true;

  // Phase 17 Plan 12 (LINENUM-01) — Line-numbers gutter conditional. Mirrors
  // the D-18 vim mount pattern verbatim: read Obsidian's global
  // `showLineNumber` editor preference ONCE at child mount; if true,
  // include the lineNumbers() extension so the gutter renders. There is
  // NO plugin-level setting — this is purely a passthrough of Obsidian's
  // existing global "Editor → Show line numbers" preference.
  //
  // REACTIVITY CONTRACT (DO NOT ADD A LISTENER): toggling Obsidian's
  // showLineNumber setting while a child editor is open does NOT take
  // effect until the child remounts (close+reopen the note OR Cmd-E flip
  // in/out of Source/Live Preview). This is identical to the D-18 vim
  // contract and is intentional — keeps the factory legible by sharing
  // exactly one "conditional-extension-by-Obsidian-config" pattern.
  // A future contributor MUST NOT add a metadataCache or layout-change
  // listener to give this live reactivity; the locked design (per
  // 17-CONTEXT "Conditional extension loading pattern") is read-once-at-mount.
  //
  // VIM INTERACTION: when both `vimMode` and `showLineNumber` are ON, vim's
  // standard `:set nu` / `:set nonu` continues to work via @replit/codemirror-
  // vim's existing handler — vim toggles the gutter's display because the
  // lineNumbers extension is wired into the same extension array vim mounts
  // into. No additional wiring required.
  const lineNumbersEnabled =
    !!app &&
    (app as unknown as { vault: { getConfig(key: string): unknown } }).vault.getConfig(
      'showLineNumber',
    ) === true;

  // Phase 18 Plan 03 (LINENUM-RELATIVE-01 / D-35) — plugin-owned relative
  // line numbers gate. LAYERS ON TOP of the Plan 17-12 lineNumbersEnabled
  // gate above: when both are true, the lineNumbers extension is invoked
  // with `formatNumber: relativeFormatter` so the gutter renders relative
  // distance from the cursor; when only lineNumbersEnabled is true, the
  // bare `lineNumbers()` baseline (Plan 17-12 LINENUM-01) is preserved
  // verbatim. The existing showLineNumber gate wins when it's false — no
  // gutter renders regardless of this flag.
  //
  // Plugin-owned per D-35 — NOT a wrapper around any third-party plugin's
  // setting. Default false; surfaced via Settings → Code editor → "Show
  // relative line numbers in code editor" toggle (SettingsTab.ts).
  //
  // Read-once-at-mount semantic (CONTEXT D-18 / Plan 17-12) — the bool
  // arrived as a parameter, so this const is just a coerce-to-boolean. NO
  // listener, NO metadataCache subscription, NO live reactivity. Toggling
  // the setting at runtime requires note remount (Cmd-E flip OR close+
  // reopen). Mirrors the locked design from Plan 17-12 LINENUM-01.
  const relativeLineNumbersEnabled = !!showRelative;

  const state = EditorState.create({
    doc: content,
    extensions: [
      // 1. Language Compartment (D-11): owns LanguageSupport, indentUnit,
      //    closeBrackets, and the Cmd-/ comment binding. Reconfigured by the
      //    chevron in 16-04 via `languageCompartment.reconfigure(...)`.
      languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride)),
      // 1b. Vim mode (Phase 17 D-18) — conditionally prepended so vim's
      //     keymap precedes our Tab/Cmd-/ bindings (D-20: Esc Insert→Normal,
      //     Tab in Insert falls through to customTabCommand, Cmd-/ via the
      //     Obsidian Scope still wins because it's at app-level not editor-level).
      //     The `{ status: true }` option enables the .cm-vim-panel mode-
      //     indicator strip at the bottom of the child editor (Phase 17
      //     gap-closure 17-11, 17-UAT.md Issue 6 sibling — without this
      //     option vim ships without a visible mode indicator, breaking
      //     discoverability of NORMAL vs INSERT mode). The package's
      //     TypeScript .d.ts may not advertise the options object — cast
      //     through Parameters<typeof vim>[0] to keep tsc happy without
      //     touching runtime behavior.
      ...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
      // 1c. Line-numbers gutter (Phase 17 Plan 12 / LINENUM-01) —
      //     conditionally included when Obsidian's `showLineNumber`
      //     editor preference is ON at child mount. Mirrors the D-18 vim
      //     conditional shape exactly. Read-once-at-mount semantic — toggling
      //     the setting at runtime requires note remount (Cmd-E flip OR
      //     close+reopen). The .cm-gutters CSS rule below (lines 312-315 in
      //     the EditorView.theme block) already covers gutter styling
      //     (transparent background, no right border), so no styling change
      //     is needed when the gutter appears.
      //
      //     Phase 18 Plan 03 (LINENUM-RELATIVE-01 / D-35) — relative line
      //     numbers layer ON TOP of the showLineNumber gate. When both
      //     `lineNumbersEnabled` AND `relativeLineNumbersEnabled` are true,
      //     `lineNumbers({ formatNumber: relativeFormatter })` replaces the
      //     bare `lineNumbers()` call so the gutter renders relative-distance
      //     numbers (vim relativenumber convention). When only
      //     `lineNumbersEnabled` is true, the Plan 17-12 baseline shape is
      //     preserved verbatim.
      ...(lineNumbersEnabled
        ? [
            relativeLineNumbersEnabled
              ? lineNumbers({ formatNumber: relativeFormatter })
              : lineNumbers(),
          ]
        : []),
      // 2a. Mod-/ Obsidian Scope intercept — see debug session
      //     `cmd-slash-not-reaching-child.md`. Pushes a Scope on focus to
      //     override `editor:toggle-comments` for this child editor only.
      //     `app` is optional only to keep test fixtures simple — runtime
      //     callers MUST pass plugin.app or COMMENT-01 will silently regress.
      ...(app ? [createCmdSlashScopeExtension(app)] : []),
      // 2a.1. Vim navigation/edit Scope intercept — Phase 18 Plan 01 / D-32.
      //       Mirrors createCmdSlashScopeExtension shape: pushes a Scope on
      //       child focus that registers vim navigation/edit keys
      //       (h/j/k/l/d/y/p/o/i/a/x/w/b/e/u/Ctrl-r/Esc), each routing the
      //       keystroke to the child's vim instance via Vim.handleKey. Closes
      //       UAT Test 17 / VIM-01 (backlog 999.2) — without this, vim keys
      //       leak to the parent because Obsidian's app-level vim handler
      //       wins over CM6's local keymap. Gated on `app && vimEnabled` so
      //       plain (non-vim) child editors NEVER push a vim Scope.
      ...(app && vimEnabled
        ? [createVimScopeExtension(app, (view) => (view as unknown as { cm: unknown }).cm)]
        : []),
      // 2b. closeBracketsKeymap — top level, BEFORE main keymap (Pitfall D —
      //    Backspace handler wins over defaultKeymap). Language-agnostic so
      //    it lives outside the Compartment.
      keymap.of(closeBracketsKeymap),
      // 3. Syntax highlighting (Phase 17 D-15/D-16: themed via Obsidian CSS
      //    variables — see src/main/childEditorTheme.ts) + bracket matching
      //    (HIGHLIGHT-01 firing logic unchanged; Phase 17 D-16 bracket-match
      //    contrast theme is bundled inside createThemedHighlight).
      // Phase 17 Plan 10 round-3 (Test 13): emit Obsidian/CM5-compatible
      // semantic class names (cm-keyword, cm-type, cm-variable, cm-def,
      // cm-string, cm-comment, …) on syntax tokens so community theme
      // CSS rules scoped to `.HyperMD-codeblock` cascade to the child
      // editor's spans. The container also carries `HyperMD-codeblock`
      // (see nestedEditorExtension.ts:103) so descendant selectors
      // match. createThemedHighlight() now returns only the
      // bracket-match theme (D-16) — the prior themedHighlightStyle
      // entry was dropped because its inline `style="color: var(...)"`
      // beat class-scoped theme rules via CSS specificity. Default
      // colors come from Obsidian's app.css `.cm-keyword { color:
      // var(--code-keyword); }`; community-theme overrides scoped to
      // `.HyperMD-codeblock` win via natural cascade.
      obsidianSemanticClasses,
      ...createThemedHighlight(),
      bracketMatching(),
      // 4. Editing primitives.
      history(),
      drawSelection(),
      highlightActiveLine(),
      // 5. Main keymap. customTabCommand MUST be first — branches on cursor
      //    position per Phase 17 D-11 (line-start → indent line; mid-line →
      //    insert indentUnit at cursor; multi-line selection → indent all
      //    lines as one undo step). Phase 15 priority preserved (Tab does
      //    NOT trigger focus-nav).
      keymap.of([
        { key: 'Tab', run: customTabCommand, shift: customShiftTabCommand },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      // 6. Visual extensions.
      EditorView.lineWrapping,
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
      // 7. Sync helpers (Phase 13/14).
      createScrollIntoViewExtension(),
      ...(syncExtensions ?? []),
    ],
  });

  return new EditorView({ state, parent });
}
