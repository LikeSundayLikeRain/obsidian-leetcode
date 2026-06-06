---
quick_id: 260605-wle
slug: document-widget-cursor-jump-rollback-deb
status: complete
date: 2026-06-06
commits:
  - <docs commit short hash, filled in by orchestrator>
---

# Quick Task 260605-wle: Document widget cursor-jump rollback debug findings

## One-liner

Captures the full mechanism analysis from debug workflow `wf_b127f280-b9e` as a durable debug-session note at `.planning/debug/widget-cursor-jump-and-char-rollback.md`, so the deferred followups D/E/F/G can be picked up in a future session without re-running the workflow.

## Files added

| File | Purpose |
|------|---------|
| `.planning/debug/widget-cursor-jump-and-char-rollback.md` | Durable debug-session note: symptom, architecture context, four root causes with file:line evidence, shipped fixes A/B/C summary, followups D/E/F/G with mechanism + risks + required test coverage |

## Followups documented (now durable)

- **D** — defer `writer.pending = false` reset until echo ack (principled fix for Cause 1; needs `modifyEventOrdering.probe.test.ts` ordering verification + 5 test scenarios before shipping).
- **E** — re-snapshot `getDoc()` inside the `vault.process` callback (principled fix for steady-state child-vs-disk lag; needs the same ordering probe + multi-hash arming extension to `SelfWriteSuppression`).
- **F** — wire or remove the dead `syncHandle` field on `WidgetController` (Cause 2; recommended: removal — `WidgetController.ts:251`, `:1487`, `liveModeViewPlugin.ts:159`, plus `childParentSync.ts` factory).
- **G** — adoption-failure stale-source-seed path at `WidgetController.ts:2041-2073` (lower priority; instrument first to measure frequency before fixing).

Plus an out-of-scope note about the multi-pane race window (originator vs typing peer).

## Source-of-truth pointer

The original 32-agent workflow transcript is ephemeral (lives at `/private/tmp/claude-504/.../tasks/w6ntfx7op.output`, GC'd on session expiry). The new debug note is the durable record going forward.

## Verification

- File created at target path: `.planning/debug/widget-cursor-jump-and-char-rollback.md`.
- Cross-links resolve: commit hashes (`07e9ee2`, `0480178`, `6277362`, `064d0ce`, `8f28617`), quick task path, debug-note siblings (`widget-thrash-on-type.md`, `self-write-remount-cycle.md`), file:line citations against current `main`.
- No source code changes. No tests required. No build run.
