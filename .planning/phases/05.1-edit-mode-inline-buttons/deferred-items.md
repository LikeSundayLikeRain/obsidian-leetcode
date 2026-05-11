# Phase 5.1 Deferred Items

Out-of-scope issues discovered during Plan 05.1-02 execution. These exist in
files NOT touched by this plan and were present BEFORE any Phase 5.1 work.
Per GSD scope-boundary rule: pre-existing issues in unrelated files are NOT
auto-fixed.

## Pre-existing TypeScript errors (22 total) — present at base commit efb5ec9

- `src/main/codeActionsPostProcessor.ts`:43,44 — `Object is possibly 'undefined'`
  on regex match group destructuring (`noUncheckedIndexedAccess: true`).
  File is D-11 regression surface; MUST NOT be modified by Phase 5.1.

- `tests/main/codeActionsPostProcessor.test.ts` — 8 errors from
  `noUncheckedIndexedAccess` on `Array.from(...)` destructuring and optional
  button `runBtn!.click()` / `submitBtn!.click()` shapes.

- `tests/solve/RunModal.test.ts`:158 — one indexed-access error.

- `tests/solve/SessionExpiredNotice.test.ts` — 6 errors on `notice` accesses.

- `tests/main/codeActionsEditorExtension.test.ts` — 4 errors at test lines
  216-219. This test file ships on the Wave 0 commit with a file-level
  `eslint-disable` block scoped to Wave 0 RED-state (to be removed once Wave 1
  lands). The tsc errors were NOT within that eslint scope (TypeScript is a
  separate toolchain); they pre-date this plan's work and are in the test
  file authored by Wave 0, not by Wave 1.

## Impact on `npm run build`

`npm run build` is defined as `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`
— the tsc step fails on the 22 pre-existing errors, so esbuild never runs.
**This is a pre-existing baseline state, not a regression introduced by Plan 05.1-02.**

Verified by:
- `git show efb5ec9:src/main/codeActionsPostProcessor.ts` == current file on disk (zero diff)
- Stashing Task 2's `src/main.ts` edit still shows 22 identical tsc errors

## Impact on `npm run lint`

`npm run lint` reports 72 problems (59 errors + 13 warnings), all in files
NOT touched by this plan. Same scope-boundary logic: these are pre-existing
and out of scope for Plan 05.1-02.

## Required Follow-up

A dedicated cleanup plan (or a `/gsd-quick fix` pass) should address the 22
tsc errors before any release that requires `npm run build` to succeed end-
to-end. Phase 5.1's own acceptance is preserved by verifying esbuild compiles
the Plan 05.1-02 module independently:
`npx esbuild --bundle --platform=browser --external:obsidian --external:@codemirror/state --external:@codemirror/view src/main/codeActionsEditorExtension.ts --outfile=/tmp/cae-bundle.js`
