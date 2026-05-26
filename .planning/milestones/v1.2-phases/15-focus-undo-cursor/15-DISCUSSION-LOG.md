# Phase 15: Focus, Undo & Cursor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 15-Focus, Undo & Cursor
**Areas discussed:** Focus transitions, Tab capture & keyboard routing, Undo boundary & propagation, Auto-grow & scroll integration

---

## Focus Transitions

### Q1: How should focus leave the child editor?

| Option | Description | Selected |
|--------|-------------|----------|
| Browser-native blur | Let parent CM6 naturally gain focus when clicked — child blurs via standard DOM behavior | ✓ |
| Explicit handoff on click | Listen for pointerdown on parent DOM and explicitly call parentView.focus() | |
| You decide | Claude picks the cleanest approach | |

**User's choice:** Browser-native blur
**Notes:** User asked how blur looks — confirmed it's standard CM6 behavior (cursor hides, selection dims), same as Obsidian's own multi-pane focus switching.

### Q2: Standard CM6 blur behavior sufficient?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, standard blur is fine | Browser-native focus/blur handles the transition | ✓ |
| Keep active-line highlight on blur | Preserve highlighted line when child loses focus | |
| You decide | Claude picks based on Obsidian's editing model | |

**User's choice:** Standard blur is fine

### Q3: Run/Submit button focus behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Child keeps focus | Buttons act on click but don't steal focus. Matches VSCode/Monaco. | ✓ |
| Button takes focus | Standard browser button behavior — focus moves to clicked button | |
| You decide | Claude picks based on existing code-actions widget | |

**User's choice:** Child keeps focus

### Q4: Escape key exit hatch

| Option | Description | Selected |
|--------|-------------|----------|
| Skip it — no Escape handling | Match Obsidian/LeetCode behavior. Escape does nothing. | ✓ |
| Double-Escape exits to parent | Less accidental, still provides keyboard escape route | |
| Keep single Escape exit | Per original success criteria. Accessibility-first. | |

**User's choice:** Skip it — no Escape handling
**Notes:** User pointed out neither Obsidian nor LeetCode web use Escape to exit the code editor. No reason to diverge from established behavior.

---

## Tab Capture & Keyboard Routing

### Q1: Add indentWithTab?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always capture Tab | Tab always indents, Shift-Tab dedents. Matches all code editors. | ✓ |
| Conditional — only with selection | Tab indents only when text is selected | |
| You decide | Claude picks based on code editor conventions | |

**User's choice:** Yes, always capture Tab

### Q2: Multi-line indent as single undo?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, single undo | Select 5 lines, Tab → one Cmd-Z reverts all. CM6 default. | ✓ |
| Per-line undo | Each line's indent is separate undo step | |
| You decide | Claude uses CM6 default grouping | |

**User's choice:** Yes, single undo

### Q3: Other keyboard shortcuts to intercept?

| Option | Description | Selected |
|--------|-------------|----------|
| No — only Tab and standard editing | All other shortcuts bubble to Obsidian normally | ✓ |
| Capture Cmd-/ for comment toggle | Add comment toggling inside child (Phase 16 territory) | |
| You decide | Claude determines which keys child should own | |

**User's choice:** No — only Tab and standard editing
**Notes:** User agreed Cmd-/ is a good idea but belongs in Phase 16 with language-specific comment syntax. No other shortcuts identified.

### Q4: Cmd-A selects child content only?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — Cmd-A selects child content only | Matches code editor convention | ✓ |
| No — Cmd-A should select entire note | Bubble to parent for full note selection | |
| You decide | Claude picks most natural behavior | |

**User's choice:** Yes — Cmd-A selects child content only

---

## Undo Boundary & Propagation

### Q1: Cmd-Z in child editor behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Child undo only | Cmd-Z undoes last child edit. Parent updates via sync. Clean separation. | ✓ |
| Dual undo (child + parent) | Cmd-Z undoes in both simultaneously. Complex coordination. | |
| You decide | Claude picks cleanest undo model | |

**User's choice:** Child undo only

### Q2: Parent undo and child-sync entries

| Option | Description | Selected |
|--------|-------------|----------|
| No — parent skips child-sync entries | Child-sync dispatches don't participate in parent undo history | ✓ |
| Yes — parent can undo child-sync changes | Parent history includes child-sync entries. Risky for consistency. | |
| You decide | Claude picks based on desync avoidance | |

**User's choice:** No — parent skips child-sync entries

### Q3: Copy to Code undo-ability

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — Cmd-Z restores previous code | Already decided in Phase 14 D-03. Confirms no change needed. | ✓ |
| No — Copy to Code resets undo history | Hard reset, cannot undo back | |
| You decide | Claude confirms Phase 14 D-03 carries forward | |

**User's choice:** Yes — Cmd-Z restores previous code

---

## Auto-Grow & Scroll Integration

### Q1: Max height or unbounded growth?

| Option | Description | Selected |
|--------|-------------|----------|
| Grow unbounded | Height = content height. No inner scrollbar. Parent scrolls as one page. | ✓ |
| Max height then inner scroll | Cap at ~500px then inner scrollbar | |
| You decide | Claude picks based on unified-document model | |

**User's choice:** Grow unbounded
**Notes:** User explored the idea of a modular panel layout (like LeetCode web) but agreed to defer it and keep the note-embedded approach for v1.2.

### Q2: Auto-scroll into view when typing at bottom?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — scroll into view | Parent note auto-scrolls to keep cursor line visible | ✓ |
| No — user scrolls manually | Don't interfere with parent scroll position | |
| You decide | Claude picks most natural behavior | |

**User's choice:** Yes — auto-scroll into view
**Notes:** User confirmed this is a current pain point in the implementation — has to manually scroll when typing at the bottom.

---

## Claude's Discretion

- Scroll-into-view implementation approach (CM6 effect vs. DOM API vs. requestMeasure)
- Auto-grow CSS strategy (height: auto vs. explicit calculation)
- Child scroll DOM overflow management (overflow: hidden vs. removing scroll listener)

## Deferred Ideas

- **Theme-aware syntax highlighting** → Phase 16 (language packs)
- **Vim mode support** → Phase 17 (polish)
- **Modular panel layout (solving mode)** → Future milestone (v1.3+), idea not fully designed
- **Cmd-/ comment toggle** → Phase 16 (language-specific)
