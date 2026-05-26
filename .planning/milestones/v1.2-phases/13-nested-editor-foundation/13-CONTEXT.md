# Phase 13: Nested Editor Foundation - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 delivers: a child CM6 EditorView renders inside the `## Code` fence region with Python syntax highlighting (Lezer-based), mounted via `Decoration.widget({ block: true })` with the full fence (opener + body + closer) hidden via CSS line decorations. The child editor is editable (but unsynced to the parent document — sync is Phase 14). A plugin-level LRU registry manages child EditorView lifecycle across note switches and widget rebuilds.

</domain>

<decisions>
## Implementation Decisions

### Child Editability
- **D-01:** Child editor is editable from Phase 13 — user can type, move cursor, and see syntax highlighting. Edits live in child state only; no parent sync until Phase 14.
- **D-02:** No warning or visual cue about unsaved state. Phase 14 follows immediately with sync. Accept the temporary gap.
- **D-03:** Child editor is pre-populated with the current fence body content from the parent document on creation.

### CSS Hide + Cursor Blocking
- **D-04:** The entire fence is hidden — opener (`\`\`\`python3`), body lines, and closer (`\`\`\``). The nested editor replaces the full visual area. The language chevron dropdown (in button row) serves as the language indicator.
- **D-05:** The child editor has a darker background matching Obsidian's existing fenced code block styling (`.cm-line` code block background).
- **D-06:** Cursor entering the hidden fence zone from the parent redirects focus to the child editor (transactionFilter-based). Arrow-down from above → child gains focus at top. NOT atomicRanges skip.
- **D-07:** Prioritize Source Mode. Target both Source Mode + Live Preview for Phase 13. If Live Preview adds excessive scope, it can slip to Phase 17, but Source Mode is non-negotiable.

### Widget + Code-Actions Coexistence
- **D-08:** Separate StateFields. New `nestedEditorExtension.ts` with its own `StateField<DecorationSet>` for CSS-hide line decorations + nested editor widget. Existing `codeActionsEditorExtension.ts` stays unchanged.
- **D-09:** Visual stacking: nested editor widget renders in the fence body area (anchored at opener line end), button row (Run/Submit/chevron) stays at fence closer end below the code. Code above, actions below — matching current layout.
- **D-10:** No pin/sticky behavior for the button row in Phase 13. Noted as potential Phase 17 enhancement if scrolling long code becomes an issue.

### Registry Key + Cleanup
- **D-11:** Registry key is `TFile.path` (file path only). One fence per LC note invariant means file path uniquely identifies the child. Split-view edge case (same note in two panes sharing one child) is acceptable.
- **D-12:** LRU cache with cap of 5. Child editors persist across note switches preserving undo/cursor/scroll. When cap is exceeded, least-recently-used entry is destroyed. Plugin `onunload()` destroys all.
- **D-13:** Widget `destroy()` detaches child DOM but keeps EditorView alive in registry (for re-attach on widget rebuild). True destruction only on LRU eviction, explicit file close, or plugin unload.

### Claude's Discretion
- Widget + code-actions coexistence approach (separate StateFields chosen based on separation-of-concerns best practice and minimal regression risk to existing button row)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Pitfalls
- `.planning/research/ARCHITECTURE.md` — Full v1.2 architecture: guarded keymaps, Compartment pattern, extension ordering, component boundaries (NOTE: describes Path A heuristic approach — Phase 13 uses Path B nested EditorView instead, but integration points and anti-patterns remain relevant)
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — 18 pitfalls for nested EditorView approach; decoration type decision (Option B chosen), lifecycle registry, sync protocol, section lock interaction

### Existing Code (SSoT)
- `src/main/codeActionsEditorExtension.ts` — `findCodeFence()` SSoT, `languageRefreshEffect`, `CodeActionsWidget` block-widget pattern (the proven pattern to follow), `buildDecorations()` StateField architecture
- `src/main/sectionLockExtension.ts` — changeFilter + atomicRanges pattern; fence body is UNLOCKED; `userEvent: 'leetcode.*'` bypass convention; cursor-snap transactionFilter (reference for focus-redirect implementation)
- `src/main.ts:787-797` — Extension registration order (code-actions → section-lock); new nested editor extension registers BETWEEN them

### Requirements
- `.planning/REQUIREMENTS.md` — 16 requirements for v1.2; Phase 13 is foundation enabling all of them
- `.planning/ROADMAP.md` §Phase 13 — Success criteria (5 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `findCodeFence(state)` (`codeActionsEditorExtension.ts:177`): Returns `{openerLine, closerLine}` for the first fence under `## Code`. SSoT for fence detection — reuse in nested editor for positioning + content extraction.
- `CodeActionsWidget` pattern (`codeActionsEditorExtension.ts:124`): Proven block widget with `eq()`, `toDOM()`, `estimatedHeight`. Follow this pattern for the nested editor widget.
- `editorInfoField` + `lc-slug` frontmatter gate: Standard gating pattern used by both existing extensions. New extension must gate identically.
- `languageRefreshEffect` (`codeActionsEditorExtension.ts:85`): StateEffect dispatched on language change. New extension can listen for this to know when language switches (Phase 16 integration point).

### Established Patterns
- Block widget at line boundary: `Decoration.widget({ widget, block: true, side: 1 })` anchored at a line's end. Renders cleanly in both Source + Live Preview.
- `StateField.define<DecorationSet>` with `provide: f => EditorView.decorations.from(f)`: Canonical pattern for decoration-producing extensions.
- `userEvent: 'leetcode.*'` bypass: Any plugin dispatch targeting a locked range must use this annotation. Child-to-parent sync (Phase 14) should use `'leetcode.child-sync'`.
- `@codemirror/state` + `@codemirror/view` are external (runtime-provided by Obsidian). `@codemirror/lang-python` is a bundled dependency (already in package.json).

### Integration Points
- Registration in `src/main.ts`: New extension registers between `buildCodeActionsEditorExtension` (line 787) and `buildSectionLockExtension` (line 797).
- `@codemirror/lang-python` already in `package.json` dependencies — Python LanguageSupport available for the child EditorView.
- Section lock changeFilter: Child editor dispatches to parent fence body (unlocked range) will pass Gate 0 without bypass. No modification to sectionLockExtension needed.

</code_context>

<specifics>
## Specific Ideas

- Darker background on child editor matching Obsidian's `.HyperMD-codeblock-bg` / `.cm-line` code styling
- Focus redirect feels like "entering the code area" rather than cursor skipping over it — arrow-down transitions smoothly into child editor top

</specifics>

<deferred>
## Deferred Ideas

- Sticky/pinned button row for long code — Phase 17 polish
- Live Preview handling if it adds too much scope — Phase 17
- Split-view (same note in two panes) proper handling — future if requested

</deferred>

---

*Phase: 13-Nested Editor Foundation*
*Context gathered: 2026-05-21*
