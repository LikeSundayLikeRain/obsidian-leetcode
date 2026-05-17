# Deferred Items — Phase 08.1

Pre-existing issues out of scope per execute-plan SCOPE BOUNDARY rule.
Surfaced during Plan 08.1-01 execution; left for a future maintenance pass.

## Pre-existing Lint Errors

- `src/shared/logger.ts:70:52` — `no-useless-escape` on `\[` inside character class
- `src/shared/logger.ts:70:194` — `no-useless-escape` on `\[` inside character class
  - Both are present on the Plan 08.1-01 base commit (verified via
    `git checkout HEAD~1 && eslint src/shared/logger.ts` returns the
    same 2 errors).
  - Originated in commit `cd908ad` (Plan 07-08 Task 1 — separator preservation).
  - Fix: change `[^\s;,"'&}\]\[]+` → `[^\s;,"'&}\][]+` (drop the backslash
    before `[` inside the character class — `[` doesn't need escaping
    inside `[...]` per the regex grammar). Should be a one-line edit on
    line 70 of `src/shared/logger.ts`.

## Pre-existing Lint Warnings

- `src/main.ts:27:15` — `'DetailCacheEntry' is defined but never used`
  - Pre-existing import; cleanup is out of scope for Plan 08.1-01.
