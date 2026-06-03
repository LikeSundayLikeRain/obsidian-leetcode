# Phase 22 — Deferred Items

Out-of-scope discoveries logged during execution per Rule 3 SCOPE BOUNDARY.

## Pre-existing test failure (not caused by Phase 22)

- **File**: `tests/widget/liveModeBannerStateField.test.ts:683`
- **Test**: `Plan 21-11 Task 2 — legacyBannerStateField + leetCodeWidgetStateField > R2 — post-repair StateField recompute (Plan 21-14) > post-repair scheduled dispatch fires leetcodeRefreshAnnotation against each known EditorView for the file path`
- **Symptom**: `expected "vi.fn()" to be called 1 times, but got 0 times`
- **Verification**: Reproduced with Phase 22 changes stashed (clean Phase-21.1 baseline) — failure is pre-existing.
- **Discovered during**: Plan 22-01 Task A (default flip) test verification.
- **Disposition**: Out of scope for Phase 22. File a follow-up under v1.3.x backlog if not already tracked.
