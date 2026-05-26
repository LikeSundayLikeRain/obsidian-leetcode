# Phase 15: Focus, Undo & Cursor - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 delivers: seamless user experience when interacting with the nested child CM6 editor — clicking in/out, pressing Tab, using Cmd-Z, and scrolling all work correctly without focus confusion, keyboard traps, or scroll jank. The child editor auto-grows with content and the parent note scrolls as a unified document with automatic scroll-into-view when typing at the bottom.

</domain>

<decisions>
## Implementation Decisions

### Focus Transitions
- **D-01:** Browser-native blur handles focus exit from the child editor. When the user clicks into `## Notes` or any parent area, the parent CM6 naturally gains focus and the child loses `.cm-focused` (cursor hides, selection dims). No custom focus management needed for click-out.
- **D-02:** Run/Submit buttons do NOT steal focus from the child editor. Buttons act on click but the child retains focus so the user can immediately continue typing. Implementation: `event.preventDefault()` on mousedown or `tabindex="-1"` on button elements.
- **D-03:** No Escape key exit hatch. Escape does nothing in the child editor — matches Obsidian and LeetCode web behavior. Users click to move focus elsewhere.
- **D-04:** The existing transactionFilter cursor-redirect (Phase 13 D-06) handles focus INTO the child. This phase does not modify that behavior.

### Tab Capture & Keyboard Routing
- **D-05:** `indentWithTab` keymap added to the child editor. Tab always indents, Shift-Tab always dedents. No conditional behavior.
- **D-06:** Multi-line indent (select lines → Tab) registers as a single undo operation. CM6's `indentMore`/`indentLess` already groups this naturally — no custom history grouping needed.
- **D-07:** Cmd-A in the child selects all child content only (not the entire note). Standard `selectAll` from `defaultKeymap` provides this behavior.
- **D-08:** All global Obsidian shortcuts (Cmd-P, Cmd-O, Cmd-E, Cmd-N, Cmd-W, Cmd-S, Cmd-Shift-F) bubble to Obsidian normally — the child does NOT intercept them.
- **D-09:** Cmd-/ (comment toggle) is deferred to Phase 16 where language-specific comment syntax is available.

### Undo Boundary & Propagation
- **D-10:** Child undo is isolated. Cmd-Z in the child undoes the last child edit only. The parent document updates via sync to reflect the reverted code.
- **D-11:** Child-sync dispatches to parent carry `addToHistory: false` (via Transaction.addToHistory annotation). Parent's undo history does NOT include child-sync changes. Cmd-Z in the parent (e.g., while editing `## Notes`) only undoes parent-originated edits.
- **D-12:** Copy to Code (vault.process) remains undo-able in the child — Phase 14 D-03 confirmed. Cmd-Z after Copy to Code restores the user's previous code.

### Auto-Grow & Scroll Integration
- **D-13:** Child editor grows unbounded — height equals content height, always. No inner scrollbar, no max-height cap. Parent note scrolls as one unified document.
- **D-14:** Auto-scroll into view: when typing in the child causes the cursor to move below the visible viewport, the parent note auto-scrolls to keep the cursor line visible. Solves existing pain point with manual scrolling.
- **D-15:** Height recalculation happens on every child document change (insert, delete, paste). The child's DOM naturally grows with content; the parent's scroll container adapts.

### Claude's Discretion
- Scroll-into-view implementation approach (whether to use CM6's `scrollIntoView` effect translated to parent coordinates, or direct `scrollIntoView()` DOM API on the cursor element, or `requestMeasure` + manual scroll calculation)
- Whether auto-grow uses CSS `height: auto` on the child's `.cm-editor` wrapper or explicit height calculation via `requestMeasure`
- How to prevent the child's own `scrollDOM` from scrolling (overflow: hidden vs. removing scroll listener)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13-14 Foundation (direct dependencies)
- `.planning/phases/13-nested-editor-foundation/13-CONTEXT.md` — Registry lifecycle (D-11 through D-13), widget pattern, cursor redirect (D-06), CSS-hide approach
- `.planning/phases/14-bidirectional-sync/14-CONTEXT.md` — Sync timing (D-01), echo prevention (D-09), addToHistory integration point, external write handling (D-03)
- `src/main/childEditorFactory.ts` — Child EditorView creation; extensions array where `indentWithTab` and scroll config are added
- `src/main/childEditorSync.ts` — `createChildSyncExtension` (where `addToHistory: false` annotation is added to parent dispatch), `syncAnnotation`
- `src/main/nestedEditorExtension.ts` — transactionFilter (cursor redirect), widget lifecycle, `NestedEditorWidget.toDOM()`

### Keyboard & Focus
- `src/main/sectionLockExtension.ts` — changeFilter that passes `leetcode.*` userEvent; transactionFilter pattern for cursor manipulation
- `src/main/codeActionsEditorExtension.ts` — `CodeActionsWidget` (button row below code); `findCodeFence()` SSoT

### Architecture
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Pitfall 7 (keyboard event propagation), Pitfall 9 (scroll containers), Pitfall 12 (focus management in nested views)
- `.planning/research/ARCHITECTURE.md` — v1.2 architecture context; integration points

### Requirements
- `.planning/REQUIREMENTS.md` — INDENT-01, INDENT-02, INDENT-03, INDENT-04 (Tab/Shift-Tab indentation)
- `.planning/ROADMAP.md` §Phase 15 — Success criteria (5 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `childEditorFactory.ts:21` — `history()` + `historyKeymap` already wired; `defaultKeymap` includes selectAll, standard editing
- `childEditorFactory.ts:47` — `EditorView.lineWrapping` already set (helps with auto-grow)
- `nestedEditorExtension.ts:240-282` — transactionFilter redirects cursor into child on fence zone entry; pattern to follow for any additional focus logic
- `codeActionsEditorExtension.ts` — `CodeActionsWidget` button row; buttons need `tabindex="-1"` or mousedown preventDefault to avoid stealing focus

### Established Patterns
- `keymap.of([...defaultKeymap, ...historyKeymap])` in child factory — extend with `indentWithTab` from `@codemirror/commands`
- `Transaction.userEvent.of('leetcode.child-sync')` — child-sync dispatches; add `Transaction.addToHistory.of(false)` alongside
- `queueMicrotask(() => childView.focus())` — deferred focus pattern used in cursor redirect; same pattern for Run/Submit focus-return

### Integration Points
- `childEditorFactory.ts` extensions array: add `indentWithTab` keymap, auto-grow CSS/extensions
- `childEditorSync.ts:151-153` (parentView.dispatch): add `addToHistory: false` annotation to prevent parent undo of child-sync changes
- `NestedEditorWidget.toDOM()`: configure child's scroll DOM to not create own scrollbar (overflow management)
- `CodeActionsWidget` in `codeActionsEditorExtension.ts`: add `tabindex="-1"` or mousedown handler to prevent focus steal

</code_context>

<specifics>
## Specific Ideas

- Auto-scroll into view is a current pain point in the implementation — user has to manually scroll when typing at the bottom of the code area
- Run/Submit keeping focus matches VSCode/Monaco behavior — click a toolbar button, cursor stays in editor
- The overall feel should be: the child editor IS the code area of the note, not a foreign embedded widget

</specifics>

<deferred>
## Deferred Ideas

- **Theme-aware syntax highlighting** — child editor should read Obsidian's theme CSS variables for syntax colors instead of CM6 `defaultHighlightStyle`. Belongs in Phase 16 (language packs & switching).
- **Vim mode support** — detect Obsidian's built-in Vim emulation and load equivalent CM6 Vim extension into child editor. Belongs in Phase 17 (polish & edge cases).
- **Modular panel layout (solving mode)** — LeetCode-web-style resizable panels (problem / code / run output) as a separate ItemView. Major UX rethink; deferred to future milestone (v1.3+). Idea not fully designed yet.
- **Cmd-/ comment toggle** — requires language-specific comment syntax. Deferred to Phase 16.

</deferred>

---

*Phase: 15-Focus, Undo & Cursor*
*Context gathered: 2026-05-21*
