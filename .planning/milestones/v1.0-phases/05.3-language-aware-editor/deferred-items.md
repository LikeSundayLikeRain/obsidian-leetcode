# Phase 05.3 — Deferred Items

Out-of-scope discoveries cataloged during plan execution; do NOT address inside the
plan that found them. Address in a dedicated maintenance plan or as part of a future
phase that touches the same surface.

## DEF-05.3-01-A: Pre-existing tsc strict-null-check errors in test files block `npm run build`

**Found during:** Plan 05.3-01 Task 3 (build verification)
**Severity:** Medium — blocks `npm run build` (which chains `tsc -noEmit -skipLibCheck && esbuild`).
Esbuild itself succeeds; the bundle artifact is correct (149,167 bytes / ~145 KB).

**Pre-existence proof:**
- At HEAD~1 (commit `757a03c`, before this plan started): `npx tsc -noEmit -skipLibCheck` reports **29 errors**
- At HEAD (commit `e18fe82`, after this plan's D-13 deletions): `npx tsc -noEmit -skipLibCheck` reports **18 errors**
- Wave 0 deletion REDUCED tsc errors by 11 (the `codeFenceLanguageExtension.ts` self-errors and FilterRule errors that referenced the deleted files); it introduced ZERO new errors.

**Affected test files (all pre-existing strict-null-check / FakePlugin shape):**
- `tests/main/codeActionsPostProcessor.test.ts` — 7 errors (TS2532, TS18048)
- `tests/main/python3Highlighter.test.ts` — 4 errors (TS2345 FakePlugin shape, TS2532)
- `tests/solve/RunModal.test.ts` — 1 error (TS2532)
- `tests/solve/SessionExpiredNotice.test.ts` — 6 errors (TS18048; explicitly noted as out-of-scope by 05.3-01-PLAN.md acceptance criteria)

**Why deferred not auto-fixed:**
Per executor SCOPE BOUNDARY: "Only auto-fix issues DIRECTLY caused by the current task's
changes. Pre-existing warnings, linting errors, or failures in unrelated files are out
of scope." The plan's acceptance criteria explicitly tolerates the
`tests/solve/SessionExpiredNotice.test.ts` errors as pre-existing UAT preflight noise.
The same logic applies to the other test files (codeActionsPostProcessor, python3Highlighter,
RunModal) — none were touched in Wave 0 and all match the same TS18048/TS2345 strict-null-check
patterns.

**How Plan 05.3-01 handled it for Task 3:**
Ran `node esbuild.config.mjs production` directly (bypassing the pre-existing tsc gate)
to produce `main.js` and confirm the post-revert bundle size. Esbuild succeeded; bundle
is 149,167 bytes — exact match to RESEARCH §A4 baseline prediction.

**Recommended fix path:**
A small dedicated maintenance plan that tightens test-file types — either:
- Add explicit `!` non-null assertions where the tests guarantee values are present, OR
- Loosen `tsconfig.json` `strictNullChecks` for `tests/**`, OR
- Update the `FakePlugin` test shape in `tests/main/python3Highlighter.test.ts` to satisfy
  the full `Plugin` interface (likely with a small `Partial<Plugin>` cast helper)

This unblocks `npm run build` end-to-end.
