# Phase 08 — Deferred Items (out-of-scope discoveries)

## Pre-existing lint errors (not introduced by this phase)

### `src/shared/logger.ts:70` — `no-useless-escape`

- **Discovered during:** Plan 08-01 verification (`npm run lint`)
- **Pre-existing:** Yes — last touched by commit `cd908ad` (Plan 07-08 Task 1, "preserve separator + reject Bearer keyword in logger redaction").
- **Errors:**
  - `70:52   error  Unnecessary escape character: \[  no-useless-escape`
  - `70:194  error  Unnecessary escape character: \[  no-useless-escape`
- **Cause:** Inside the `SECRET_VALUE_PATTERN` regex character class
  `[^\s;,"'&}\]\[]`, the `\[` escape is unnecessary inside `[...]` (only `]`
  needs escaping). ESLint's `no-useless-escape` flags this even though the
  pattern is correct.
- **Status:** Out of scope for Plan 08-01 per gsd-executor SCOPE BOUNDARY rule
  ("Only auto-fix issues DIRECTLY caused by the current task's changes").
- **Recommended fix:** Remove the `\` before `[` in the character class. Should
  be a one-line fix in a future Phase-07-followup commit or rolled into a
  later 08-XX plan.
