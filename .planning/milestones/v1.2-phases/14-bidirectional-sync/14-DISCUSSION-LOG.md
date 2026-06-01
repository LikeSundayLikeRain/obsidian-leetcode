# Phase 14: Bidirectional Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 14-Bidirectional Sync
**Areas discussed:** Sync timing, External write handling, Error & degradation, Sync scope boundary

---

## Sync Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Real-time (every transaction) | Each child dispatch immediately syncs to parent. Zero divergence window. | ✓ |
| Debounced (50-100ms) | Batch child changes and flush periodically. Reduces parent transaction churn. | |
| You decide | Claude picks the best approach. | |

**User's choice:** Real-time (every transaction)
**Notes:** User asked for clarification on what "more dispatch frequency" means in practice. After explanation that it's the same perf cost as normal Obsidian typing (one transaction per keystroke, StateField rebuild skipped via leetcode.* early-return), user confirmed real-time.

---

## External Write Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Full reset (loses undo) | Replace child doc via setState. Simple, always correct, but loses undo history. | |
| Dispatch replacement (preserves undo) | Replace child doc via dispatch transaction. Simple, always correct, AND preserves undo. | ✓ |

**User's choice:** Dispatch replacement
**Notes:** User asked if there's a hybrid approach that replaces content but keeps history. Explained the distinction between `setState()` (nukes undo) vs `dispatch({ changes: ... })` (records as undoable transaction). User confirmed — Ctrl-Z after copyToCode restores previous code.

---

## Error & Degradation

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-recover (full) | Re-insert missing opener and/or closer automatically. Undo-able. | ✓ |
| Auto-recover closer only | Auto-insert missing closer only; warning for missing opener. | |
| Warning + read-only (no auto-recover) | Never auto-modify. Show hint and auto-resume when user fixes it. | |
| Silent detach | Child stops syncing, no visual change. | |

**User's choice:** Full auto-recover
**Notes:** Extended discussion. User asked whether fence markers are even needed (could treat section between headings as code). Explained: fence is required for note portability (renders as code block everywhere — Reading Mode, GitHub, other apps), existing code depends on it (codeExtractor, starterCodeInjector, copyToCode), and heading-based boundary is ambiguous. User then asked about recovery from warning+read-only state, which led to the auto-recover option. User's reasoning: "the risks can be fixed by user once the fence is inserted and block becomes editable again" — and Ctrl-Z undoes the auto-recovery if wrong.

---

## Sync Scope Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Body only | Sync protocol only moves text content between child↔parent. Language tag managed separately. | ✓ |
| Body + language tag | Sync layer owns all fence mutations including language tag. | |

**User's choice:** Body only (settled by architecture)
**Notes:** User asked whether the fence tag is part of the child editor (since it's hidden). Clarified: child document only contains body text — `extractFenceBody()` excludes fence markers. The language tag lives in the parent's hidden opener line only. User noted this isn't really an open question — it's settled by the existing architecture. Acknowledged this was a poorly-identified gray area.

---

## Claude's Discretion

- Echo loop prevention mechanism details (Annotation vs StateEffect approach)
- Offset sanity validation before dispatching (defensive guard)

## Deferred Ideas

None — discussion stayed within phase scope
