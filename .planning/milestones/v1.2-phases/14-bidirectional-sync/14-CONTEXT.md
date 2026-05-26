# Phase 14: Bidirectional Sync - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 delivers: edits in the child CM6 EditorView flow into the parent document at the correct fence offset in real-time, and external changes to the parent fence content (vault.process from copyToCode, AI review, etc.) propagate into the child — with no echo loops, offset corruption, or data loss. Includes degradation handling when fence structure breaks.

</domain>

<decisions>
## Implementation Decisions

### Sync Timing (Child→Parent)
- **D-01:** Real-time sync — every child transaction immediately dispatches to the parent. No debouncing. Same performance cost as normal Obsidian typing (one fence scan + one doc splice + one decoration map per keystroke; buildNestedDecorations rebuild is skipped via the `leetcode.*` early-return).
- **D-02:** Child→parent dispatches use `userEvent: 'leetcode.child-sync'` annotation to prevent echo loops (parent StateField recognizes this and skips re-propagating back to child).

### External Write Handling (Parent→Child)
- **D-03:** When an external write (vault.process) replaces fence body content, the child receives the update via a dispatched transaction (`childView.dispatch({ changes: { from: 0, to: doc.length, insert: newContent } })`), NOT via `setState()`. This preserves the child's undo history — user can Ctrl-Z back to their previous code after a copyToCode operation.
- **D-04:** When an external write modifies sections OTHER than the fence body (AI review writing to `## AI Review`, frontmatter changes), the child content is unchanged — only parent offsets shift. Re-derive offsets via `findCodeFence()` on next child→parent sync; no child update needed.

### Degradation & Auto-Recovery
- **D-05:** Full auto-recover when `findCodeFence()` returns null. Detect which fence marker(s) are missing (opener, closer, or both) and re-insert them at the correct positions within the `## Code` section via parent dispatch with `userEvent: 'leetcode.fence-repair'`.
- **D-06:** Auto-recovery is undo-able (Ctrl-Z). Once fence structure is restored, child editor resumes normal sync automatically.
- **D-07:** Detection: find `## Code` heading (section-lock-protected, always present), find next `## ` heading or EOF, scan for opener/closer within that range.

### Sync Scope
- **D-08:** Sync covers fence BODY text only (lines between opener and closer). The language tag in the opener is not part of the child document and is managed separately by the chevron/switchFenceLanguage pathway. This is settled by architecture — `extractFenceBody()` excludes fence markers from the child.

### Echo Loop Prevention
- **D-09:** CM6 split-view pattern: a `syncAnnotation` marks the origin of each dispatch. Parent→child dispatches carry a sync annotation; child→parent dispatches carry `userEvent: 'leetcode.child-sync'`. Each side checks for the annotation before propagating, preventing infinite loops.

### Offset Derivation
- **D-10:** Always re-derive offsets at sync time via `findCodeFence(parentState)`. Never cache offsets across transactions. Compute `bodyStart = openerLine.to + 1` and `bodyEnd = closerLine.from` fresh before each parent dispatch.

### Claude's Discretion
- Echo loop prevention mechanism details (Annotation vs StateEffect approach — both are valid CM6 patterns; pick based on what integrates cleanest with existing `Transaction.userEvent` convention)
- Whether to validate offset sanity (bodyStart < bodyEnd, within doc bounds) before dispatching — recommended as a defensive guard but implementation detail

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Pitfalls
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Pitfalls 2 (offset drift) and 3 (vault.process conflicts) are directly relevant to this phase's sync implementation
- `.planning/research/ARCHITECTURE.md` — v1.2 architecture context; integration points and anti-patterns

### Phase 13 Foundation (direct dependency)
- `.planning/phases/13-nested-editor-foundation/13-CONTEXT.md` — Registry lifecycle (D-11 through D-13), widget pattern, cursor redirect, CSS-hide approach
- `src/main/nestedEditorExtension.ts` — StateField, widget, `extractFenceBody()`, `buildNestedDecorations()`, transactionFilter (the code this phase extends)
- `src/main/childEditorFactory.ts` — Child EditorView creation (extensions, theme); sync listeners attach here
- `src/main/childEditorRegistry.ts` — LRU registry; sync needs to look up child by file path

### Existing Sync-Adjacent Code
- `src/main/codeActionsEditorExtension.ts` — `findCodeFence()` SSoT (line 177), `languageRefreshEffect` StateEffect pattern
- `src/main/sectionLockExtension.ts` — changeFilter that passes non-`input.*` userEvent dispatches (Gate 0); confirms child-sync dispatches pass through
- `src/graph/copyToCode.ts` — Primary external write caller; vault.process replaces entire fence body via `forceInjectCodeSection`
- `src/main.ts:799-805` — `switchFenceLanguage` dispatch pattern with `userEvent: 'leetcode.lang-switch'`

### Requirements
- `.planning/REQUIREMENTS.md` — INDENT-01, INDENT-02, ENTER-01 depend on sync working (basic editing must round-trip)
- `.planning/ROADMAP.md` §Phase 14 — Success criteria (3 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `findCodeFence(state)` (`codeActionsEditorExtension.ts:177`): Returns `{openerLine, closerLine}`. SSoT for offset derivation at sync time.
- `extractFenceBody(state, fence)` (`nestedEditorExtension.ts:120-128`): Extracts body text between opener and closer. Use to detect external content changes.
- `Transaction.userEvent` annotation convention: `'leetcode.*'` prefix bypasses section lock and triggers early-return in nested editor StateField update.
- `languageRefreshEffect` (`codeActionsEditorExtension.ts:112`): Existing StateEffect pattern to follow if a custom sync effect is needed.

### Established Patterns
- `userEvent: 'leetcode.child-sync'` — pre-declared convention (Phase 13 context) for child-originated parent dispatches.
- `vault.process` is the only vault mutation primitive on problem notes (CF-06 convention). All external writes use it.
- Parent StateField `update()` (line 206-216): already has `leetcode.*` early-return path that `map()`s decorations without rebuilding. Child-sync dispatches will follow this path.

### Integration Points
- Child editor's `dispatch` listener: attach an `updateListener` extension to the child that fires on every child transaction and propagates to parent.
- Parent StateField `update()`: detect external changes to fence body (docChanged + change overlaps fence range + NOT from child-sync) and propagate to child.
- `createChildEditor()` in `childEditorFactory.ts`: sync extensions (updateListener, sync annotation) are added to the child's extension array here.

</code_context>

<specifics>
## Specific Ideas

- Real-time sync should feel invisible — typing in the child editor should be indistinguishable from typing directly in a normal note
- Auto-recovery should be seamless: fence repair happens, child resumes, user may not even notice the brief disruption
- Ctrl-Z after copyToCode brings back previous code — this is a quality-of-life win for the "try old submission, nah go back" workflow

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-Bidirectional Sync*
*Context gathered: 2026-05-21*
