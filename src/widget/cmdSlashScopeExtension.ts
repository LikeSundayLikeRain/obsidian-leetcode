// Debug session cmd-slash-widget-toggle-comment — Mod-/ Obsidian Scope intercept
// for the v1.3 widget's embedded CM6 editor.
//
// Background
// ----------
// Obsidian registers Cmd-/ (Mac) / Ctrl-/ (Win/Linux) as the global hotkey
// `editor:toggle-comments` via its app-level Scope-based keymap manager.
// That Scope dispatcher runs UPSTREAM of any per-EditorView CM6 keymap,
// so a `keymap.of([{ key: 'Mod-/', run: toggleLineComment }])` registered
// inside the widget's CM6 extensions is bypassed. The keystroke is routed
// to the PARENT MarkdownView's editor with its stale selection (sitting
// in `## Notes` after the parent's transactionFilter snapped the cursor
// out of the fence range), producing `%% %%` in the parent's body.
//
// This is the v1.3 port of the Phase 16 fix that originally lived in
// `src/main/childEditorFactory.ts:createCmdSlashScopeExtension`. The
// implementation follows the same Scope-push-on-focus / Scope-pop-on-blur
// pattern Obsidian's own Modal class uses to override hotkeys while a
// modal is open — the only mechanism that reliably pre-empts app-level
// hotkeys.
//
// Lifecycle
// ---------
//   1. ViewPlugin attaches focus/blur listeners on `view.contentDOM` at
//      construction.
//   2. On focus: build a fresh `Scope` parented to `app.scope`, register
//      Mod-/ to run `toggleLineComment` on THIS view, push it onto
//      `app.keymap`. Track the active scope so we don't double-push.
//   3. On blur: pop the same scope handle.
//   4. On ViewPlugin destroy: detach listeners + pop any still-active
//      scope (defensive; covers the edge case where the EditorView is
//      torn down while focused).
//   5. If the contentDOM is ALREADY the activeElement at construction
//      (mount-then-focus race / parking-lot adoption with restored focus),
//      run the focus path immediately.
//
// SECURITY / NO-LEAK
// ------------------
//   - Listeners are anchored to `view.contentDOM`; teardown removes both.
//   - The scope handle is local to the closure; never escapes.
//   - `popScope` is a no-op if the same scope is no longer at the top of
//     Obsidian's stack — but we only ever push it once and pop it once,
//     so the contract is safe under normal operation.
//
// REGRESSION GUARD (prior-art Phase 16 — `cmd-slash-not-reaching-child.md`)
// -------------------------------------------------------------------------
// Iterations 1 (bubble-phase EditorView.domEventHandlers) and 2 (DOM-level
// capture-phase listeners) were both proven insufficient by the Phase 16
// debug session — Obsidian dispatches its hotkey via the Scope manager,
// NOT via DOM events. ONLY the Scope-based intercept works. Do not
// "simplify" this back to a DOM listener.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { toggleLineComment } from '@codemirror/commands';
import type { App, Scope as ScopeType } from 'obsidian';
import { Scope } from 'obsidian';

/**
 * `app.keymap` shape used by this extension. The full `Keymap` type is
 * declared in obsidian.d.ts but `App.keymap` returns it directly; we
 * narrow to the two methods we use so the structural cast in
 * `WidgetController.WidgetMountHost` stays minimal.
 */
interface AppKeymapLike {
  pushScope(scope: ScopeType): void;
  popScope(scope: ScopeType): void;
}

/**
 * Minimal slice of obsidian.App needed by this extension. We accept this
 * structural shape (rather than the concrete `App`) so the WidgetMountHost
 * structural type can satisfy it without requiring a full obsidian.App
 * instance in unit tests. Production LeetCodePlugin's `this.app` satisfies
 * this contract via the real `App` runtime instance.
 */
export interface AppForCmdSlashScope {
  scope: ScopeType;
  keymap: AppKeymapLike;
}

/**
 * Detect Cmd (Mac) or Ctrl (Win/Linux) at the KeyboardEvent level. Mirrors
 * the Phase 16 helper in `childEditorFactory.ts:isMod`.
 */
function isMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * Build the ViewPlugin extension. Returns `[]` when `app` is null/undefined
 * so test fixtures + read-only mounts that lack a real App instance can
 * skip the wire-up cleanly (no Notice, no throw).
 *
 * @param app - The Obsidian App slice. Production caller is `plugin.app`.
 */
export function createCmdSlashScopeExtension(
  app: AppForCmdSlashScope | null | undefined,
): Extension {
  if (!app) return [];

  // Cast `toggleLineComment` (StateCommand) to a EditorView-runner shape.
  // The pre-existing @codemirror/state version skew (commands brings 6.6.0,
  // the rest resolve 6.5.0) makes the structural-but-not-nominal mismatch
  // a tsc-only quirk; runtime types are identical. Same workaround
  // childEditorLanguage.ts:146 uses for the in-Compartment keymap entry.
  const runComment = toggleLineComment as unknown as (v: EditorView) => boolean;

  return ViewPlugin.define((view: EditorView): PluginValue => {
    let activeScope: ScopeType | null = null;

    const onFocus = (): void => {
      if (activeScope !== null) return;
      try {
        const scope = new Scope(app.scope);
        // Register Mod-/ inside our scope. Returning false stops further
        // dispatch (Obsidian's app-level handler doesn't run).
        scope.register(['Mod'], '/', (event) => {
          if (!isMod(event)) return true;
          runComment(view);
          return false;
        });
        app.keymap.pushScope(scope);
        activeScope = scope;
      } catch {
        // Defensive — Scope construction or pushScope may throw in
        // unusual host states (e.g. plugin teardown racing focus event).
        // Failure is acceptable: the user simply gets the legacy
        // app-level behavior for that one keystroke.
      }
    };

    const onBlur = (): void => {
      if (activeScope === null) return;
      try {
        app.keymap.popScope(activeScope);
      } catch {
        // Defensive — popScope on a stale scope is a no-op in Obsidian
        // 1.12.x but the contract is unspecified across versions.
      }
      activeScope = null;
    };

    view.contentDOM.addEventListener('focus', onFocus);
    view.contentDOM.addEventListener('blur', onBlur);

    // Mount-then-focus race / parking-lot adoption with restored focus —
    // when the contentDOM is already focused at ViewPlugin construction
    // (the focus event fired BEFORE the listener was attached), run the
    // focus path immediately so the scope is active for the very next
    // keystroke.
    if (
      typeof activeDocument !== 'undefined' &&
      activeDocument.activeElement === view.contentDOM
    ) {
      onFocus();
    }

    return {
      destroy(): void {
        try {
          view.contentDOM.removeEventListener('focus', onFocus);
          view.contentDOM.removeEventListener('blur', onBlur);
        } catch {
          /* swallow — contentDOM may already be detached */
        }
        if (activeScope !== null) {
          try {
            app.keymap.popScope(activeScope);
          } catch {
            /* swallow — defensive against stale scope handle */
          }
          activeScope = null;
        }
      },
    };
  });
}

// `App` re-export for callers that want the strict obsidian.App type without
// re-importing from 'obsidian'. Not strictly required (the structural type
// `AppForCmdSlashScope` is the one consumers use) but documents intent.
export type { App };
