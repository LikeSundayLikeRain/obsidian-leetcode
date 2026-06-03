# Phase 22 — Deferred Items

Out-of-scope discoveries logged during execution per Rule 3 SCOPE BOUNDARY.

## Pre-existing test failure (not caused by Phase 22)

- **File**: `tests/widget/liveModeBannerStateField.test.ts:683`
- **Test**: `Plan 21-11 Task 2 — legacyBannerStateField + leetCodeWidgetStateField > R2 — post-repair StateField recompute (Plan 21-14) > post-repair scheduled dispatch fires leetcodeRefreshAnnotation against each known EditorView for the file path`
- **Symptom**: `expected "vi.fn()" to be called 1 times, but got 0 times`
- **Verification**: Reproduced with Phase 22 changes stashed (clean Phase-21.1 baseline) — failure is pre-existing.
- **Discovered during**: Plan 22-01 Task A (default flip) test verification.
- **Disposition**: Out of scope for Phase 22. File a follow-up under v1.3.x backlog if not already tracked.

## Pre-existing eslint baseline (not caused by Phase 22)

- **Discovered during**: Plan 22-03 Task 22-03-02 (POLISH-03 / D-gate-02 verification gate, 2026-06-03).
- **Symptom**: `npm run lint` reports `161 problems (81 errors, 80 warnings)`.
- **Verification of pre-existing baseline**: re-ran `npm run lint` against commit `245f45b` (Plan 22-01 close, before any 22-03 work) — produced the **identical** `161 problems (81 errors, 80 warnings)` output. The baseline existed at Phase 22's entry; Phase 22 did not introduce any of these issues. RESEARCH §7's "baseline already passing per Phase 21.1 close" claim was stale — the lint regression predates 22-01.
- **Categories of pre-existing errors** (sample, not exhaustive):
  - `obsidianmd/prefer-window-timers` — bare `setTimeout` / `clearTimeout` instead of `window.setTimeout` / `window.clearTimeout`. Spans `src/` and `tests/widget/`. Plugin-store reviewer lint surface; not a runtime bug.
  - `@typescript-eslint/no-unnecessary-type-assertion` — many `as Foo` assertions where the inferred type already matches. Concentrated in `src/main.ts` (~9 sites) and `src/widget/ConflictModal.ts`. Type-system-only finding.
  - `@typescript-eslint/no-floating-promises` — one site at `src/main.ts:417`.
  - `@typescript-eslint/no-misused-promises` — one site at `src/main.ts:1631`.
  - `obsidianmd/prefer-file-manager-trash-file` — warnings only; non-blocking.
  - `@typescript-eslint/no-empty-object-type` — `src/types/obsidian-globals.d.ts:51`.
  - `@typescript-eslint/no-base-to-string` — `tests/widget/legacyFenceBanner.test.ts:308`.
  - `obsidianmd/hardcoded-config-path` — `tests/widget/migrationBackupGc.test.ts:57`.
- **Scope-boundary application**: per executor SCOPE BOUNDARY rule, "Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing warnings, linting errors, or failures in unrelated files are out of scope." 81 errors across `src/main.ts`, `src/widget/`, `src/contest/`, `src/types/`, and `tests/widget/` are not Plan 22-03 task outputs. Fixing them inline would balloon Plan 22-03 well past its "release gates" framing.
- **What Plan 22-03 DID verify (the operative gate)**: D-gate-02's actual concern is plugin-store rejection on `innerHTML` in widget code (RESEARCH §7 + Pitfall 13). `grep -rn 'innerHTML' src/widget/` returned 7 hits — all comment lines explaining the no-innerHTML rule (`// Pattern S-07 — no innerHTML`, etc.). **Zero active `.innerHTML =` assignments anywhere in `src/widget/`.** The plugin-store-rejection guard is intact; the broader eslint cleanup is a separate concern.
- **Disposition**: Out of scope for Phase 22. File a v1.3.x cleanup phase to bring `npm run lint` to zero errors before the next plugin-store re-review wave (or before any feature ship that touches the affected files). The Phase 22-03 BRAT alpha (D-gate-04) is unaffected — BRAT does not run lint, and the plugin-store reviewer's auto-checks are scoped to runtime-observable concerns (innerHTML, eval, isDesktopOnly), not the strictly-typed assertions and timer-namespace lint rules above.

## Eslint pre-existing baseline — recommended phase scope (for v1.3.x or v1.4 planning)

Suggested mini-phase: "Phase 22.5 — eslint baseline reset" (~3 hours, single plan):
1. Apply `npm run lint -- --fix` (auto-fixes 55 errors and 32 warnings per the `--fix` hint in the lint output).
2. Hand-fix the remaining ~26 errors (mostly type assertions, floating promises, hardcoded-config-path).
3. Add a `lint:check-baseline` script that fails on any regression.
4. Wire the gate into `npm run ci` so future feature work cannot drift the baseline.

