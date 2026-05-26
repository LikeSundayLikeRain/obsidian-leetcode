# Phase 13: Nested Editor Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 13-nested-editor-foundation
**Areas discussed:** Child editability, CSS hide + cursor blocking, Widget + code-actions coexistence, Registry key + cleanup

---

## Child Editability

### Q1: Should the Phase 13 child editor be editable or read-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Editable (unsynced) | User can type in the child editor immediately — good for feel-testing. Edits live only in child state and vanish on note close. | ✓ |
| Read-only | Child renders fence content with highlighting but prevents input. | |
| You decide | Claude picks. | |

**User's choice:** Editable (unsynced)
**Notes:** None

### Q2: How should the user know edits aren't being saved?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual cue (subtle) | Faint badge or border color. | |
| No warning | Phase 13 is dev-facing foundation — sync arrives in Phase 14 immediately after. | ✓ |
| Console log only | Dev-facing message on first keystroke. | |

**User's choice:** No warning
**Notes:** None

### Q3: Should the child editor initialize with current fence body content?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pre-populate | Child starts with the fence body text from parent document. | ✓ |
| Empty editor | Child starts blank. | |

**User's choice:** Yes, pre-populate
**Notes:** None

---

## CSS Hide + Cursor Blocking

### Q1: Which lines should be hidden?

**User's clarification (free-text):** "Since it's a nested editor, we don't really need the opener and closer tag ```, and the language next to the opener is not needed either — we have a dropdown already. Regarding the body, it should have a darker background like the current fenced block does."

**Outcome:** Full fence hidden (opener + body + closer). Darker background on child editor matching Obsidian's code block styling.

### Q2: How should the parent cursor handle the hidden fence zone?

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to child | Cursor entering the hidden zone triggers focus transfer to child editor. Arrow-down = enter code editor from top. | ✓ |
| Atomic skip | Cursor jumps over hidden zone entirely. | |
| You decide | Claude picks. | |

**User's clarification:** Asked about difficulty of not skipping. Explained that without blocking, cursor lands on invisible lines. Redirect is the natural middle ground — more complex (~20-30 lines transactionFilter) but seamless UX.

**User's choice:** Redirect to child
**Notes:** None

### Q3: Source Mode and Live Preview support?

| Option | Description | Selected |
|--------|-------------|----------|
| Both modes day one | CSS hide + nested editor works in both Source Mode and Live Preview. | ✓ |
| Live Preview only | Nested editor only in Live Preview for Phase 13. | |
| You decide | Claude picks. | |

**User's choice:** Both — prioritize Source Mode. If Live Preview adds too much scope, limit to Source Mode (edit) for this phase.
**Notes:** "def prioritize source mode, i think if we have source mode done, read mode should be low hanging fruit"

---

## Widget + Code-Actions Coexistence

### Q1: Same or separate StateFields?

| Option | Description | Selected |
|--------|-------------|----------|
| Same StateField | Merge into one StateField. Single buildDecorations(). | |
| Separate StateFields | New nestedEditorExtension.ts with its own StateField. | ✓ |
| You decide | Claude picks based on minimal regression risk. | |

**User's choice:** "I don't have a good sense on this, I'll let you pick whichever follows best practice."
**Notes:** Claude chose separate StateFields — minimal regression risk, separation of concerns.

### Q2: Visual stacking order?

| Option | Description | Selected |
|--------|-------------|----------|
| Editor above, buttons below | Code editor in fence area, button row below. | ✓ |
| Buttons above, editor below | Button row at top like a toolbar. | |
| Keep current layout | Same as option 1 effectively. | |

**User's choice:** Editor above, buttons below
**Notes:** "Unless we want to pin the button row, otherwise if the code is long, we have to scroll all the way up to run and submit, which is silly." Noted pinning as potential Phase 17 enhancement.

---

## Registry Key + Cleanup

### Q1: What should key the registry?

| Option | Description | Selected |
|--------|-------------|----------|
| File path only | Key = TFile.path. One fence per LC note invariant. | ✓ |
| File path + leaf ID | Handles split-view edge case. | |
| You decide | Claude picks. | |

**User's choice:** File path only
**Notes:** None

### Q2: When should child editors be destroyed?

| Option | Description | Selected |
|--------|-------------|----------|
| On file close only | Destroy when last leaf showing file closes. | |
| LRU with cap (5) | Keep at most 5 alive, evict least-recently-used. | ✓ |
| You decide | Claude picks. | |

**User's clarification:** Asked about pros/cons of caching. Explained that the registry is needed for correctness (widget rebuilds happen on every parent transaction), not just speed. LRU preserves undo/cursor/scroll across note switches.

**User's choice:** LRU cache
**Notes:** "Switch away and back is a big deal, I don't want undo and redo just disappeared"

---

## Claude's Discretion

- Widget + code-actions coexistence: Chose separate StateFields (user deferred to Claude's judgment on best practice)

## Deferred Ideas

- Sticky/pinned button row for long code scrolling — Phase 17 polish
- Live Preview support if it adds excessive scope — Phase 17
- Split-view (same note in two panes) proper handling — future if requested
