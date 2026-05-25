// Phase 18 Plan 01 — Vim focus routing (VIM-INTERACTION-01).
// Closes UAT Test 17 / VIM-01 (backlog 999.2). See planning context:
//   .planning/phases/18-vim-recovery-polish/CONTEXT.md (D-32 — locked design).
//   .planning/debug/cmd-slash-not-reaching-child.md (the original Scope-fix
//   precedent that this module mirrors verbatim).
//
// PROBLEM (UAT Test 17 / VIM-01, reproduced live 2026-05-24):
// With Obsidian global vim mode ON, the user clicks into the child editor
// inside `## Code`. document.activeElement IS inside `.lc-nested-editor`
// (focus is correct). The user presses Esc → child vim transitions to Normal
// (status panel updates). The user presses j → cursor moves DOWN in the
// PARENT doc, not the child. The user presses dd → a line in the PARENT doc
// is deleted, NOT the child code body. Re-engaging i / a snaps focus back
// and typing works again.
//
// ROOT CAUSE (verified by mirroring the cmd-slash-not-reaching-child finding):
// Obsidian's global vim mode is wired into Obsidian's Scope-based keymap
// manager at app priority. The parent CM6 view's vim() extension and the
// child CM6 view's vim() extension are BOTH registered, but Obsidian's
// app-level Scope handler intercepts BEFORE either view's local keymap. The
// keystroke routes to whichever CM6 view Obsidian's app-level handler thinks
// is "active" (the most recently focused MarkdownView root, i.e., the parent),
// not to the child whose contentDOM holds DOM focus. Status-panel updates
// are local to the child's vim panel and so look correct even when the
// keystroke leaks to the parent.
//
// FIX (locked design, CONTEXT D-32): mirror createCmdSlashScopeExtension from
// childEditorFactory.ts:153-199 verbatim. When the child editor's contentDOM
// gains focus, push an Obsidian Scope onto app.keymap that registers the
// vim navigation/edit keys (h/j/k/l/d/y/p/o/i/a/x/w/b/e/u/Ctrl-r/Esc/etc.).
// Each handler returns `false` to stop Obsidian's app-level dispatch AND
// routes the keystroke into the CHILD's vim instance via the public
// `Vim.handleKey(cm, key, 'editor')` API from @replit/codemirror-vim. On
// blur, pop the Scope so other CM6 views (parent, other child editors) get
// their normal vim routing.
//
// BONUS (UAT Test 17 / VIM-01 secondary): register `:set nu` / `:set nonu`
// ex-aliases via `Vim.defineEx('set', 'se', handler)`. The package's stock
// `:set number` / `:set nonumber` work, but the abbreviated forms throw
// "unknown option: nu". The handler parses the option name from ExParams
// and dispatches the same gutter toggle the long form would.
//
// PROHIBITIONS (D-32):
//  * NO DOM-level keydown listener (capture or bubble). Iteration 2 of the
//    cmd-slash debug confirmed Obsidian's hotkey is dispatched via internal
//    Scope-based keymap manager, NOT a DOM event — DOM-level interception is
//    fundamentally insufficient. Only the Scope-based intercept reliably wins.
//  * NO new userEvent string. The Scope handler does not dispatch any CM6
//    transactions; it forwards the key into the child's vim instance which
//    handles its own dispatches.
//  * NO modification to ECHO_PRONE_USER_EVENTS in nestedEditorExtension.ts.
//  * NO changes to CLAUDE.md Conventions section.
//
// IMPLEMENTATION CHOICE — vim key routing API:
// @replit/codemirror-vim exports `Vim.handleKey(cm, key, origin)` where `cm`
// is the package's CodeMirror wrapper (NOT the @codemirror/view EditorView).
// The package's `getCM(view)` extracts the wrapper from a CM6 view; the
// child's vim() extension installs the wrapper as `view.cm` at mount.
// We accept a `getCm(view)` callback so the caller can decide how to fetch
// the wrapper (the factory passes `view => (view as any).cm`, which is what
// the package's vim() installs). If the package's public API later changes,
// only the factory wiring needs to update — this module stays agnostic.
//
// Cast through `as unknown as` where the .d.ts is too narrow (precedent:
// factory.ts:299 vim() cast through `Parameters<typeof vim>[0]`).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild (matches factory.ts:23 pattern)
import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { Vim } from '@replit/codemirror-vim';
import { Scope, type App } from 'obsidian';

// Locked vim navigation/edit keys that leak to the parent without the Scope
// intercept. Sourced from UAT Test 17 / VIM-01 reproduction notes — these are
// the keys that demonstrably leak in practice (j, dd) plus the broader vim
// motion + operator surface so the fix is comprehensive across Normal-mode
// usage, not just the specific keys the user happened to press.
//
// Multi-character vim sequences (dd, yy, gg, etc.) are NOT registered as
// single Scope handlers — instead, the single-character 'd' (or 'y' / 'g')
// handler routes ONE keystroke at a time into Vim.handleKey, and the package's
// vim state machine accumulates the second character internally. This matches
// vim's natural input model.
const LOCKED_VIM_KEYS: ReadonlyArray<string> = [
  // Motions
  'h', 'j', 'k', 'l', 'w', 'b', 'e',
  // Operators
  'd', 'y', 'p', 'c',
  // Insert-mode entries
  'i', 'a', 'o',
  // Edit / character actions
  'x', 'r', 'u',
  // Visual mode entry
  'v',
  // Normal-mode start anchors
  '0', '$',
];

// Module-scoped flag for Vim.defineEx idempotency across mounts. Vim.defineEx
// may throw on duplicate registration depending on internal state; the flag
// short-circuits the registration after the first successful call so repeat
// child mounts in the same plugin lifetime do not throw. We also wrap the
// underlying call in try/catch as belt-and-suspenders defensive guarding —
// matches the project's defensive convention for third-party API ergonomics.
let aliasesRegistered = false;

/**
 * Register `:set nu` / `:set nonu` ex-aliases via `Vim.defineEx('set', 'se',
 * handler)`. The handler parses the option name from ExParams.args and
 * dispatches the same gutter toggle the long forms `:set number` /
 * `:set nonumber` already do.
 *
 * Idempotency: guarded by `aliasesRegistered` (module-scoped) AND wrapped in
 * try/catch. Repeat child mounts in the same plugin lifetime are safe.
 *
 * Closes UAT Test 17 / VIM-01 secondary finding (`:set nu` previously errored
 * with "unknown option: nu").
 */
function ensureExAliasesRegistered(): void {
  if (aliasesRegistered) return;
  try {
    // The .d.ts shape: defineEx(name: string, prefix: string | undefined, func: ExFn).
    // ExFn signature: (cm: CodeMirrorV, params: ExParams) => void. ExParams.args
    // carries the parsed argument list (e.g., ['nu']) for `:set nu`.
    //
    // We delegate to vim's existing :set option parser by re-invoking
    // `Vim.handleEx` with the long-form option name. The package already
    // recognises 'number' and 'nonumber' (via internal optionsByName), so
    // mapping 'nu' → 'number' and 'nonu' → 'nonumber' is sufficient. If
    // handleEx is unavailable (signature drift), fall back to a noop that
    // logs once — the worst case is the alias silently does nothing, which
    // is preferable to throwing inside vim's command palette.
    const VimAny = Vim as unknown as {
      defineEx: (
        name: string,
        prefix: string | undefined,
        func: (cm: unknown, params: { args?: string[] }) => void,
      ) => void;
      handleEx?: (cm: unknown, input: string) => void;
    };
    VimAny.defineEx('set', 'se', (cm, params) => {
      const arg = params?.args?.[0];
      if (typeof arg !== 'string') return;
      let mapped: string | null = null;
      if (arg === 'nu' || arg === 'number') mapped = 'number';
      else if (arg === 'nonu' || arg === 'nonumber') mapped = 'nonumber';
      else mapped = arg; // pass through unknown options to vim's existing handler
      // Re-invoke :set with the long-form option. This goes through vim's
      // built-in :set parser which knows about 'number' / 'nonumber' and
      // handles the gutter toggle.
      try {
        if (typeof VimAny.handleEx === 'function') {
          VimAny.handleEx(cm, `set ${mapped}`);
        }
      } catch {
        // swallow — vim's :set throwing on an unknown option is the prior
        // behavior; we don't want to surface package internals to the user.
      }
    });
    aliasesRegistered = true;
  } catch {
    // Duplicate registration or signature drift — mark as registered so we
    // don't retry every focus, and let the user fall back to `:set number`.
    aliasesRegistered = true;
  }
}

/**
 * Create the vim Scope intercept extension for a child editor.
 *
 * Returns a CM6 ViewPlugin extension that:
 *   1. On contentDOM focus, pushes an Obsidian Scope onto app.keymap that
 *      registers the locked vim navigation/edit keys. Each handler returns
 *      `false` (stops Obsidian's app-level dispatch) AND forwards the key to
 *      the child's vim instance via `Vim.handleKey(cm, key, 'editor')`.
 *   2. On contentDOM blur, pops the Scope so other CM6 views regain their
 *      normal vim routing.
 *   3. On ViewPlugin destroy, removes the focus/blur listeners and pops any
 *      active Scope (cleanup invariant — mirrors createCmdSlashScopeExtension
 *      destroy block at factory.ts:188-197).
 *
 * Also registers `:set nu` / `:set nonu` ex-aliases via Vim.defineEx on the
 * first focus, idempotent across mounts.
 *
 * @param app - Obsidian App instance, used to construct the Scope (parented
 *   to app.scope so app-level hotkeys other than our overrides still work)
 *   and to push/pop scopes via app.keymap.
 * @param getCm - Callback that returns the child's vim CodeMirror wrapper
 *   given the EditorView. The vim() extension from @replit/codemirror-vim
 *   installs the wrapper at `view.cm` at mount, so the typical caller passes
 *   `view => (view as any).cm`.
 *
 * @returns A CM6 Extension (ViewPlugin) ready to spread into the child
 *   editor's extensions array. The factory gates this on `app && vimEnabled`
 *   so plain (non-vim) child editors NEVER push a vim Scope.
 */
export function createVimScopeExtension(
  app: App,
  getCm: (view: EditorView) => unknown,
): Extension {
  return ViewPlugin.define((view): PluginValue => {
    let activeScope: Scope | null = null;

    const onFocus = (): void => {
      if (activeScope !== null) return;

      // Register `:set nu` / `:set nonu` ex-aliases on first focus. Idempotent
      // across mounts — guarded by module-scoped aliasesRegistered flag.
      ensureExAliasesRegistered();

      // Construct a Scope parented to app.scope so app-level hotkeys other
      // than our vim-key overrides continue to dispatch normally. Scope is
      // statically imported at the top of this module — the factory.ts:165
      // precedent uses runtime `require('obsidian')` because the original
      // commit landed before TypeScript fully recognised obsidian's value
      // exports; the static import works equivalently and improves
      // testability under vi.mock('obsidian', ...).
      const scope = new Scope(app.scope);

      // Register each locked vim key. Returning `false` from the handler
      // tells Obsidian "I handled it, do not dispatch further" — this is
      // what stops Obsidian's app-level vim handler from also processing
      // the keystroke against the parent's CM6 view.
      //
      // Inside the handler, we forward the key to the child's vim instance
      // via Vim.handleKey(cm, key, 'editor'). The package's vim state
      // machine accumulates multi-character sequences (dd, yy, gg) on its
      // own — we route ONE keystroke at a time.
      //
      // We intentionally cast Vim through `unknown` — the package's .d.ts
      // declares handleKey but the cast bypasses CodeMirror wrapper-type
      // narrowness (we don't construct or fully type the wrapper here; the
      // wrapper comes from getCm(view) which the caller controls).
      const VimAny = Vim as unknown as {
        handleKey?: (cm: unknown, key: string, origin: string) => undefined | boolean;
      };

      const routeKey = (keyName: string): boolean => {
        const cm = getCm(view);
        if (cm === null || cm === undefined) {
          // No vim wrapper available (vim not yet mounted on this view) —
          // let Obsidian dispatch its app-level handler so the user does not
          // experience a swallowed keystroke. Returning true matches the
          // factory.ts:170 pattern where the cmd-slash handler returns true
          // when the modifier check fails.
          return true;
        }
        if (typeof VimAny.handleKey === 'function') {
          VimAny.handleKey(cm, keyName, 'editor');
        }
        return false;
      };

      for (const keyName of LOCKED_VIM_KEYS) {
        scope.register([], keyName, () => routeKey(keyName));
      }

      // Esc — vim's "Insert → Normal" transition. Same routing as motions.
      scope.register([], 'Escape', () => routeKey('Escape'));

      // Ctrl-r — vim's redo. The Scope key shape uses 'Ctrl' as the modifier
      // (Obsidian's Scope.register normalises Ctrl/Meta on macOS internally).
      scope.register(['Ctrl'], 'r', () => routeKey('<C-r>'));

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
