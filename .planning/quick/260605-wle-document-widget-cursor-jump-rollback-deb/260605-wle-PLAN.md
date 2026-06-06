---
quick_id: 260605-wle
slug: document-widget-cursor-jump-rollback-deb
description: Document widget cursor-jump rollback debug findings (D and E followups)
date: 2026-06-06
mode: quick
must_haves:
  truths:
    - The full deep-debug analysis from workflow wf_b127f280-b9e currently exists only in the ephemeral transcript at /private/tmp/.../w6ntfx7op.output and will be GC'd. The shipped fixes (260605-vny) capture only what we did, not the full mechanism behind D/E.
  artifacts:
    - .planning/debug/widget-cursor-jump-and-char-rollback.md (new file — durable debug-session note)
---

# Document widget cursor-jump and 1-2 char rollback debug findings

## Why

The 32-agent debug workflow (`wf_b127f280-b9e`) produced detailed mechanism analysis for the BRAT cursor-jump and char-rollback bugs. We shipped fixes A/B/C in quick task `260605-vny` (commits `07e9ee2`, `0480178`, `6277362` on `main`), but two principled fixes — D (defer `writer.pending` reset until echo ack) and E (re-snapshot inside `vault.process` callback) — were deferred because they need event-ordering probes and broader test coverage.

The mechanism analysis backing D and E currently lives only in the workflow transcript at `/private/tmp/claude-504/.../tasks/w6ntfx7op.output`, which is session-scoped and will be garbage-collected. Without a durable record, a future session revisiting D/E would have to re-run the full workflow.

We also identified a third followup F (the dead `syncHandle` field in `WidgetController` that's never assigned in production) and a fourth G (adoption-failure stale-source-seed path). Neither is captured anywhere durable yet.

## What

Single deliverable: `.planning/debug/widget-cursor-jump-and-char-rollback.md` matching the style of existing debug session notes (e.g., `widget-thrash-on-type.md`, `self-write-remount-cycle.md`). Sections:
- Symptom + architecture context
- Root causes 1-4 with file:line evidence
- Shipped fixes A/B/C summary (cross-link to commit hashes)
- Followups D, E, F, G with mechanism, proposed change, risks, required test coverage
- Verification signals to monitor in BRAT
- Pointer back to the transcript path with note that it's ephemeral

## Tasks

### Task 1 — Write debug session note

**files:** `.planning/debug/widget-cursor-jump-and-char-rollback.md`

**action:** Write a comprehensive debug-session note following the style of `widget-thrash-on-type.md` and `self-write-remount-cycle.md`. Cross-link to:
- Commit hashes from quick task 260605-vny
- Quick task PLAN.md and SUMMARY.md
- Workflow run id `wf_b127f280-b9e`
- Related debug notes already in `.planning/debug/`

Capture every file:line citation for the four root causes; expand D and E to include the multi-hash arming alternative for E and the ack-based release sketch for D, plus the probe-test reference (`modifyEventOrdering.probe.test.ts` per `debouncedWriter.ts:212`).

**verify:** File exists at the target path; renders cleanly as markdown; cross-links resolve.

**done:** A future session can pick up D/E/F/G entirely from this file without re-running the workflow.

**commit:** `docs(debug): capture widget cursor-jump and char-rollback root causes + followups D/E/F/G`

## Followups

None — this task is purely documentation.
