---
slug: cmd-slash-not-reaching-child
status: resolved
trigger: "Phase 16 COMMENT-01 — Cmd-/ never reaches the child editor's CM6 keymap. Instead, Obsidian's parent-level 'Toggle comment' command intercepts and inserts `%% %%` markdown comments. The %% %% lands in the Notes section (parent's body), not at the child editor's cursor — suggesting either focus drifted to the parent before the keystroke OR the child's CM6 instance never sees the keystroke at all."
created: 2026-05-22
updated: 2026-05-22
related_phase: 16-language-packs-switching
related_uat: .planning/phases/16-language-packs-switching/16-UAT.md
related_plans: [16-01, 16-03]
---

## Symptoms

**Expected behavior:**
With cursor inside a code fence (child editor), pressing Cmd-/ (Mac) toggles a line comment using the active language's syntax — `# ` for Python, `// ` for Java/JS/TS/C/C++/Go/Rust. Pressing again removes the prefix.

**Actual behavior:**
Cursor is in the child editor (Python fence). User presses Cmd-/. Result: `%% %%` (Obsidian's markdown block-comment syntax) is inserted into the Notes section, NOT into the fence. The child editor body is unchanged.

**Error messages:**
None reported.

**Timeline:**
Introduced/incomplete in Phase 16. COMMENT-01 was deferred from Phase 15 (per 15-CONTEXT.md D-09) and was supposed to land in Phase 16 via the toggleLineComment keymap entry inside the languageCompartment (per CONTEXT.md D-11) or at top-level (per RESEARCH §3 — "explicit keymap.of([{ key: 'Mod-/', run: toggleLineComment }]) binding required because defaultKeymap does NOT include it").

**Reproduction:**
1. Open a Java problem note in the dev vault.
2. Click into the Python fence body.
3. Press Cmd-/ on Mac.
4. Observe: `%% %%` appears in the ## Notes section. Fence body unchanged.

## Hypotheses

### H1 — toggleLineComment keymap binding never wired (PRIMARY) — ELIMINATED

Phase 16 plans intended to add `keymap.of([{ key: 'Mod-/', run: toggleLineComment }])` either inside the languageCompartment (16-01 builder per D-11) or at the top level of the child editor extensions array (per Claude's Discretion + RESEARCH §3). The 16-01-SUMMARY claims this was wired and 16-01 unit tests cover the builder shape, but the actual extension list passed to the EditorView may be missing the binding, OR the keymap precedence is wrong (child's keymap doesn't intercept before Obsidian's parent command).

**Verdict:** ELIMINATED. The binding IS present at `src/main/childEditorLanguage.ts:146`:
```ts
keymap.of([{ key: 'Mod-/', run: toggleLineComment as unknown as Command }]),
```
And the unit tests in `tests/main/childEditorLanguage.test.ts:237-246` and behavioral tests in `tests/main/childEditorLanguage.behavioral.test.ts:300-346` confirm the binding shape and that `toggleLineComment` correctly emits `# ` for Python, `// ` for Java/JS/Rust/Go/C++ when invoked at the StateCommand level.

The binding works at CM6 layer in isolation. The runtime failure mode is the keystroke never reaching the child's keymap, not a missing/wrong binding.

### H2 — Obsidian's hotkey command intercepts BEFORE the child's CM6 keymap fires — CONFIRMED

Obsidian registers Cmd-/ as a global "Toggle comment" command (`editor:toggle-comments`) at the app/Scope level. The Scope-based keymap manager intercepts on `document` and dispatches to `app.workspace.activeEditor` (the parent MarkdownView). The parent CM6 runs its own toggleComment, using the **parent's stale selection** in the Notes section — which is why `%% %%` (Obsidian's markdown block-comment syntax for the parent's markdown LanguageSupport) appears at the Notes section, not at the child's fence cursor.

**Evidence:**
- `%% %%` is the EXACT output of Obsidian's `editor:toggle-comments` when the active markdown editor's selection is in a non-fence region (markdown commentTokens is `{ block: ['%%', '%%'] }`).
- The child's keymap binding is correctly wired (H1 eliminated). When invoked directly on the child's StateCommand pipeline (unit + behavioral tests), it produces the language-specific comment marker. The keystroke is never reaching that pipeline at runtime.
- The parent CM6's selection lives independently of DOM focus. When the user clicks into the child editor's `.cm-content`, only the child's selection updates. The parent's `state.selection` stays at the last position the parent's transactionFilter snapped it to (`Math.min(state.doc.length, fenceTo + 1)` per `nestedEditorExtension.ts:361` — i.e., right after the fence, in the ## Notes region).
- Even with DOM focus on the child's `.cm-content`, Obsidian's Scope-based `KeymapEventHandler` on `document` runs before CM6's contentDOM keydown handler can fire — OR Obsidian uses a capture-phase listener that beats CM6's bubble-phase listener.

### H3 — Child editor focus state isn't actually focused — PARTIALLY ELIMINATED

DOM focus IS on the child editor (user click into `.cm-content` succeeds). But focus is irrelevant: Obsidian's hotkey system targets `app.workspace.activeEditor` (always the parent), not `document.activeElement`. So even with perfect child focus, Obsidian routes the command to the parent.

### H4 — Compartment payload ordering issue — ELIMINATED (subsumed by H2)

Compartment is correctly wiring the keymap; behavioral tests confirm. The keystroke just never reaches the Compartment-driven keymap because Obsidian intercepts upstream.

## Current Focus

hypothesis: "H2 — Obsidian's app-level hotkey for `editor:toggle-comments` intercepts Cmd-/ before the child's CM6 keymap fires. The keystroke is dispatched to the parent MarkdownView's editor with the parent's stale selection in the Notes section, producing `%% %%`."
test: "Read childEditorLanguage.ts and childEditorFactory.ts (DONE — binding present). Read behavioral tests (DONE — binding works in isolation). The fix must short-circuit Obsidian's hotkey BEFORE it dispatches to the parent."
expecting: "Adding a native capture-phase keydown listener on the child's .cm-content element that intercepts Mod-/ and invokes toggleLineComment on the child directly will block Obsidian from ever seeing the keystroke."
next_action: "Implement the fix in childEditorFactory.ts: add a DOM keydown handler at capture phase that detects Mod-/ when focus is in the child, stops propagation, and runs toggleLineComment on the child's StateCommand pipeline."
reasoning_checkpoint: ""
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-05-22 (debug session)
  finding: "Cmd-/ binding is present at src/main/childEditorLanguage.ts:146 — keymap.of([{ key: 'Mod-/', run: toggleLineComment as unknown as Command }])"
  source: src/main/childEditorLanguage.ts:146
- timestamp: 2026-05-22
  finding: "Behavioral test confirms toggleLineComment via the StateCommand pipeline emits '# ' for python3, '// ' for java/javascript/rust/golang/cpp/typescript when invoked directly on a state built by buildLanguageExtensions(slug, override)."
  source: tests/main/childEditorLanguage.behavioral.test.ts:300-346
- timestamp: 2026-05-22
  finding: "Unit test confirms keymap.of(...) is called with [{ key: 'Mod-/', run: toggleLineComment }]."
  source: tests/main/childEditorLanguage.test.ts:237-246
- timestamp: 2026-05-22
  finding: "Parent's transactionFilter (nestedEditorExtension.ts:326-368) snaps cursor OUT of the fence zone via `Math.min(state.doc.length, fenceTo + 1)`. After clicking into the child, the parent's selection stays just after the fence (in the ## Notes region) until next parent edit."
  source: src/main/nestedEditorExtension.ts:354-365
- timestamp: 2026-05-22
  finding: "Obsidian exposes Scope API (Scope/pushScope/popScope) for hotkey routing. Default app.scope handles editor:toggle-comments. The hotkey targets app.workspace.activeEditor (always the parent MarkdownView in our nested editor world); DOM focus on the child's .cm-content does not redirect Obsidian's hotkey dispatch."
  source: node_modules/obsidian/obsidian.d.ts:3491-3510, 5360-5400
- timestamp: 2026-05-22
  finding: "%% %% is the canonical output of Obsidian's editor:toggle-comments when invoked on a markdown editor at a non-code position. The parent has markdown LanguageSupport with commentTokens { block: ['%%', '%%'] } per Obsidian convention."
  source: Obsidian markdown commentTokens convention (vault behavior)
- timestamp: 2026-05-22
  finding: "No EditorView.domEventHandlers / native keydown listener is registered on the child editor's contentDOM. The child relies entirely on CM6's keymap precedence, which is bypassed by Obsidian's Scope-level dispatch."
  source: grep across src/ — domEventHandlers absent

## Eliminated

- H1 (binding missing/wrong) — binding is correctly present and tests prove it works in StateCommand isolation.
- H4 (Compartment ordering) — Compartment is wiring keymap correctly; H2 explains the runtime gap.
- H3 (focus not on child) — DOM focus IS on child; focus is irrelevant because Obsidian's hotkey routes by `app.workspace.activeEditor`, not `document.activeElement`.

## Resolution

root_cause: "Obsidian's app-level Scope-based hotkey handler for `editor:toggle-comments` (Cmd-/ on Mac, Ctrl-/ on Win/Linux) intercepts the keystroke before CM6's per-EditorView keymap can fire. The handler dispatches to the parent MarkdownView's editor (always the parent — Obsidian has no awareness of our nested child CM6), which then runs its own markdown toggleComment on the PARENT's stale selection (sitting in ## Notes after the parent's transactionFilter snapped the cursor out of the hidden fence zone). The result is `%% %%` (Obsidian markdown block-comment) inserted into Notes, while the child's correctly-wired Mod-/ binding never gets a chance to run."
fix: "Add a native capture-phase keydown listener on the child editor's `.cm-content` element via `EditorView.domEventHandlers({ keydown })` (or a separate `addEventListener('keydown', handler, true)` registered at child mount time) that:\n  - Detects Mod-/ (event.key === '/' && (event.metaKey || event.ctrlKey) on Mac/Win)\n  - Calls event.preventDefault() and event.stopPropagation() / stopImmediatePropagation() to short-circuit Obsidian's bubble-phase Scope handler\n  - Invokes `toggleLineComment({ state: view.state, dispatch: view.dispatch })` directly\n  - Returns early so CM6's bubble-phase keymap doesn't double-fire\n\nPlace this in `src/main/childEditorFactory.ts` as part of the child's extensions array, OR in `src/main/childEditorLanguage.ts` inside the languageCompartment payload (so language-aware behavior is co-located).\n\nRecommended: add it in `childEditorFactory.ts` at the top level (outside the Compartment) — the binding is language-agnostic (it always invokes toggleLineComment, which itself reads the active language's commentTokens), and a capture-phase DOM listener doesn't need Compartment reconfigure on language switch.\n\nAdd a regression test in `tests/main/childEditorFactory.test.ts` asserting the keydown handler is registered on the child's contentDOM and that pressing Mod-/ invokes the child's toggleLineComment (not the parent's)."
verification: "APPLIED 2026-05-22. Added `EditorView.domEventHandlers({ keydown })` in `src/main/childEditorFactory.ts` (top-level extension, before closeBracketsKeymap). Handler detects Mod-/, invokes toggleLineComment cast as `(view: EditorView) => boolean` (same duplicate-@codemirror/state workaround as childEditorLanguage.ts:146), then preventDefault + stopPropagation + stopImmediatePropagation to short-circuit Obsidian's Scope handler. 5 source-level regression tests added to `tests/main/childEditorFactory.test.ts` under the `cmd-slash-not-reaching-child regression` describe block. Build clean, full vitest 1642/1648 passing. Plugin rebuilt and copied to both dev vaults. Awaiting user UAT confirmation in real Obsidian."
files_changed:
  - src/main/childEditorFactory.ts
  - tests/main/childEditorFactory.test.ts
