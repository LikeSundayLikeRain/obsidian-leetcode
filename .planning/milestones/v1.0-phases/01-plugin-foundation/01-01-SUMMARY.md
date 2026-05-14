---
phase: 01-plugin-foundation
plan: 01
subsystem: plugin-foundation
tags: [scaffold, build-tooling, types, logger]
requires: []
provides:
  - AuthCookies
  - IndexedProblem
  - ProblemIndex
  - logger
  - SessionExpiredError
  - RateLimitError
  - NetworkError
  - LeetCodePlugin (field-stubbed)
  - SettingsStore (brand stub)
  - AuthService (brand stub)
  - LeetCodeClient (brand stub)
  - ProblemListService (brand stub)
affects: []
tech_stack:
  added:
    - typescript@5.8.3
    - esbuild@0.25.5
    - "@leetnotion/leetcode-api@3.0.0"
    - turndown@7.2.4
    - vitest@4.1.5
    - eslint-plugin-obsidianmd@0.2.9
    - typescript-eslint@8.35.1
    - "@eslint/js@9.30.1"
    - globals@14.0.0
    - jiti@2.6.1
    - tslib@2.4.0
    - "@types/node@22.19.18"
    - obsidian@1.12.3
  patterns:
    - feature-first src/ layout (auth/, browse/, api/, settings/, shared/)
    - typed field-stub pattern in main.ts (Plan 06 rewrites)
    - brand-stub module pattern for forward type references
    - redacting logger facade (session|csrf|cookie|token masked)
key_files:
  created:
    - manifest.json
    - package.json
    - package-lock.json
    - tsconfig.json
    - esbuild.config.mjs
    - eslint.config.mts
    - vitest.config.ts
    - versions.json
    - version-bump.mjs
    - styles.css
    - README.md
    - LICENSE
    - src/main.ts
    - src/auth/types.ts
    - src/auth/AuthService.ts (brand stub)
    - src/browse/types.ts
    - src/browse/ProblemListService.ts (brand stub)
    - src/api/LeetCodeClient.ts (brand stub)
    - src/settings/SettingsStore.ts (brand stub)
    - src/shared/logger.ts
    - src/shared/errors.ts
  modified:
    - .gitignore (replaced planning-only scope with full sample-plugin baseline plus .planning/)
decisions:
  - pinned typescript 5.8.3 exact (not ^5.8.3) to satisfy typescript-eslint 8.35.1 peer constraint (<5.9.0)
  - bumped @types/node to ^22.0.0 to satisfy vitest 4.1.5 peer constraint (^20 || ^22 || >=24)
  - added Wave-1 brand-stub modules under src/{settings,auth,api,browse}/ so Plan 01's main.ts typed field declarations compile before Plans 02/03/05 ship the real implementations; Plans 02/03/05 replace each stub file with real class definitions using the same export name
  - vitest test script uses --passWithNoTests so empty-suite runs exit 0
  - scoped eslint-disable obsidianmd/rule-custom-message in src/shared/logger.ts — that file IS the redacting logger facade; the no-console rule is meant for callers
  - allowDefaultProject in eslint.config.mts expanded to include vitest.config.ts and eslint.config.mts so project-service lint works across the repo root
metrics:
  duration_seconds: "~240"
  completed: 2026-05-07T23:40:00Z
  task_count: 3
  file_count: 21
  lines_added: 7759
---

# Phase 01 Plan 01: Plugin Foundation Summary

## One-liner

Greenfield Obsidian plugin scaffold with locked tech stack, passing build/lint/test gates on an empty-but-valid repo, and shared types + redacting logger + field-stubbed main.ts that downstream plans consume without editing.

## What was built

- **Scaffold (12 files):** `manifest.json` (isDesktopOnly true, id `leetcode`, description period-terminated), `package.json` (pinned deps), `tsconfig.json` (sample-plugin baseline, strict nulls, isolatedModules), `esbuild.config.mjs` (externalizes obsidian/electron/@codemirror/\*/@lezer/\*/builtinModules, CJS, banner), `eslint.config.mts` (flat config with `obsidianmd.configs.recommended`), `vitest.config.ts` (node environment, tests/ include), `versions.json`, `version-bump.mjs`, `.gitignore`, `styles.css` (scoped under `.leetcode-browser` / `.leetcode-settings`, zero hex, zero `!important`), `README.md`, `LICENSE` (MIT).
- **Shared types (2 files):** `src/auth/types.ts` exports `AuthCookies { LEETCODE_SESSION, csrftoken }`; `src/browse/types.ts` exports `IndexedProblem` (with optional `status` field) and `ProblemIndex`.
- **Shared utilities (2 files):** `src/shared/logger.ts` exports a redacting `logger` that masks any key matching `/session|csrf|cookie|token/i`; `src/shared/errors.ts` exports `SessionExpiredError`, `RateLimitError`, `NetworkError` classes.
- **Plugin entry (1 file):** `src/main.ts` declares `LeetCodePlugin extends Plugin` with four typed field stubs (`settings!: SettingsStore`, `auth!: AuthService`, `client!: LeetCodeClient`, `list!: ProblemListService`). `onload()` is intentionally empty — Plan 06 wires construction.
- **Wave-1 brand-stub modules (4 files):** `src/settings/SettingsStore.ts`, `src/auth/AuthService.ts`, `src/api/LeetCodeClient.ts`, `src/browse/ProblemListService.ts` each export a brand-typed empty class. Plans 02/03/05 overwrite these files with real implementations; in the meantime they satisfy TypeScript's resolver so Plan 01's typed field declarations compile.

## Installed Dependencies (npm ls --depth=0)

```
obsidian-leetcode@0.1.0
├── @eslint/js@9.30.1
├── @leetnotion/leetcode-api@3.0.0
├── @types/node@22.19.18
├── esbuild@0.25.5
├── eslint-plugin-obsidianmd@0.2.9
├── globals@14.0.0
├── jiti@2.6.1
├── obsidian@1.12.3
├── tslib@2.4.0
├── turndown@7.2.4
├── typescript-eslint@8.35.1
├── typescript@5.8.3
└── vitest@4.1.5
```

414 packages audited, 0 vulnerabilities.

## Gate Results

| Gate | Command | Exit code | Evidence |
|------|---------|-----------|----------|
| Build | `npm run build` | 0 | `main.js` produced (665 B, esbuild banner on line 1, `require("obsidian")` kept external not inlined) |
| Lint | `npm run lint` | 0 | Zero errors, zero warnings after fixes (eslint-plugin-obsidianmd `configs.recommended`) |
| Test | `npm test` | 0 | vitest runs; `No test files found, exiting with code 0` via `--passWithNoTests` |

Additional grep gates (all pass):

- `manifest.isDesktopOnly === true` and `manifest.id` does not contain `obsidian`: PASS (`id=leetcode`).
- `esbuild.config.mjs` externalizes `"obsidian", "electron"`: 1 match.
- `eslint.config.mts` loads `obsidianmd.configs.recommended`: 1 match.
- `styles.css` hex colors (stripping comments): 0.
- `styles.css` `!important` count: 0.
- `node_modules/obsidian`, `node_modules/@leetnotion/leetcode-api`, `node_modules/vitest` all present.
- Typed field stubs present in `src/main.ts`: `settings!: SettingsStore` (1), `auth!: AuthService` (1), `client!: LeetCodeClient` (1), `list!: ProblemListService` (1).
- AUTH-06 cookie-in-logs grep gate: 0 matches in `src/`.

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | chore | 3c48551 | scaffold Obsidian plugin repo (manifest, build, lint, test configs) — 12 files |
| 2 | feat | ed8d407 | add shared auth/browse types and logger/errors utilities — 4 files |
| 3 | feat | 10bae6a | add main.ts typed field stub + Wave-1 dependency bridges — 6 new files + 4 modified |

## Requirements Satisfied

- **FND-01** (plugin installs + loads) — deferred manual smoke (Wave 0 is static-only).
- **FND-02** (isDesktopOnly true) — manifest.json gate passes.
- **FND-03** (zero Required lint violations) — `npm run lint` exits 0.
- **FND-05** (enable/disable without crashes) — deferred manual smoke; `onload()` is empty so nothing can throw.
- **AUTH-06** (cookies never logged) — `src/shared/logger.ts` redaction + grep gate empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] npm install failed on typescript peer-range conflict**

- **Found during:** Task 1 (`npm install`)
- **Issue:** `package.json` specified `"typescript": "^5.8.3"` which npm resolved to 5.9.3, but `typescript-eslint@8.35.1` peer-requires `typescript@<5.9.0`.
- **Fix:** Pinned typescript to exact `"5.8.3"`.
- **Files modified:** package.json
- **Commit:** 10bae6a

**2. [Rule 3 - Blocking issue] npm install failed on @types/node peer-range conflict**

- **Found during:** Task 1 (`npm install` retry)
- **Issue:** `@types/node@^16.11.6` resolved to 16.x but `vitest@4.1.5` peer-requires `@types/node@^20.0.0 || ^22.0.0 || >=24.0.0`. The sample-plugin pins 16.x because it doesn't use vitest; this project does.
- **Fix:** Bumped to `"@types/node": "^22.0.0"` (resolved to 22.19.18).
- **Files modified:** package.json
- **Commit:** 10bae6a

**3. [Rule 3 - Blocking issue] tsc errors on type-only imports of not-yet-existing modules**

- **Found during:** Task 3 (`npm run build`)
- **Issue:** Plan 01's `src/main.ts` uses `import type` to reference `SettingsStore` / `AuthService` / `LeetCodeClient` / `ProblemListService` — modules created by Plans 02/03/05. With `isolatedModules: true`, TypeScript still refuses to resolve a missing module path even when only its type is used, surfacing `TS2307: Cannot find module`. The plan's fallback to `any` types would fail the grep acceptance criteria (`settings!: SettingsStore` etc.).
- **Fix:** Added minimal brand-stub class files at the four forward-referenced paths. Each stub exports `class <Name> { readonly __brand!: '<Name>'; }` — enough to satisfy tsc and lint; enforces name identity. Plans 02/03/05 overwrite the stub with the real implementation under the same export name, and Plan 06 rewrites `main.ts` to use value imports. This preserves the plan's non-negotiable invariants (field names + types LOCKED, typed variant required).
- **Files added:** `src/settings/SettingsStore.ts`, `src/auth/AuthService.ts`, `src/api/LeetCodeClient.ts`, `src/browse/ProblemListService.ts`
- **Commit:** 10bae6a

**4. [Rule 3 - Blocking issue] ESLint `obsidianmd/rule-custom-message` flagged `console.info` in logger.ts**

- **Found during:** Task 3 (`npm run lint`)
- **Issue:** `eslint-plugin-obsidianmd`'s recommended set includes a guidance rule against `console.*` calls. `src/shared/logger.ts` is the redacting facade — its whole purpose is to funnel console output through a single masking layer. The rule is meant for callers, not the wrapper itself.
- **Fix:** Added scoped `/* eslint-disable obsidianmd/rule-custom-message */` to the top of `src/shared/logger.ts` with a doc comment explaining why.
- **Files modified:** src/shared/logger.ts
- **Commit:** 10bae6a

**5. [Rule 3 - Blocking issue] ESLint project-service couldn't parse `vitest.config.ts`**

- **Found during:** Task 3 (`npm run lint`)
- **Issue:** `vitest.config.ts` is not in tsconfig.json's include (`src/**/*.ts`), so the project-service parser rejected it with "not found by the project service".
- **Fix:** Expanded `allowDefaultProject` in `eslint.config.mts` from `['eslint.config.js', 'manifest.json']` to `['eslint.config.js', 'eslint.config.mts', 'vitest.config.ts', 'manifest.json']`.
- **Files modified:** eslint.config.mts
- **Commit:** 10bae6a

**6. [Rule 3 - Blocking issue] Unused eslint-disable directives surfaced as warnings**

- **Found during:** Task 3 (`npm run lint`)
- **Issue:** The plan's template for `src/main.ts` included `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on each type-only import. Once the brand-stub modules exist, the type-only imports ARE used, so the disables fire as "unused directive" warnings.
- **Fix:** Removed the four unused disable directives from `src/main.ts`.
- **Files modified:** src/main.ts
- **Commit:** 10bae6a

**7. [Rule 3 - Blocking issue] .gitignore preservation**

- **Found during:** Task 1 (file Write)
- **Issue:** Pre-existing `.gitignore` contained only `.planning/`, which is how the orchestrator keeps its planning state out of tracked commits while explicitly `git add -f`-ing specific planning artifacts. My initial Write lost that line, then re-added it back.
- **Fix:** Final `.gitignore` is the sample-plugin baseline (`node_modules`, `main.js`, `main.js.map`, `data.json`, `.DS_Store`, `*.log`, `dist`) plus `.planning/`.
- **Files modified:** .gitignore
- **Commit:** 10bae6a

No architectural (Rule 4) deviations. No authentication gates (plan is offline scaffolding only).

## Confirmations

- `src/auth/types.ts`, `src/browse/types.ts`, `src/shared/logger.ts`, `src/shared/errors.ts`, and `src/main.ts` (stub) all compile cleanly under `tsc -noEmit -skipLibCheck` (included in the build gate).
- The four typed field stubs are present on `LeetCodePlugin` with the exact locked names and types:
  - `settings!: SettingsStore`
  - `auth!: AuthService`
  - `client!: LeetCodeClient`
  - `list!: ProblemListService`
- `main.js` contains the esbuild banner on line 1 and `require("obsidian")` (externalized, not inlined).
- AUTH-06 grep gate (no cookie values in console.* calls) returns empty.

## Pitfalls Encountered

- **vitest 4.1.5 + empty-suite handling:** vitest 4.x exits non-zero when there are no tests unless `--passWithNoTests` is passed. Plan 01 has zero tests so the test script was authored as `"test": "vitest run --passWithNoTests"` from the start (not a correction).
- **Typed-import vs `any`-fallback dilemma:** the plan documents two variants of `src/main.ts` — typed (preferred) and `any` fallback. The typed variant was chosen; the missing-module resolution problem was solved by creating minimal brand-stub source files rather than falling back to `any`. This preserves the plan's grep acceptance criteria which key on `settings!: SettingsStore` verbatim.

## Known Stubs

Four Wave-1 brand-stub modules exist intentionally:

| File | Class | Replaced by | Reason |
|------|-------|-------------|--------|
| src/settings/SettingsStore.ts | `SettingsStore` | Plan 05 | typed field `settings!: SettingsStore` needs a type identity in Wave 1 |
| src/auth/AuthService.ts | `AuthService` | Plan 03 | typed field `auth!: AuthService` needs a type identity in Wave 1 |
| src/api/LeetCodeClient.ts | `LeetCodeClient` | Plan 02 | typed field `client!: LeetCodeClient` needs a type identity in Wave 1 |
| src/browse/ProblemListService.ts | `ProblemListService` | Plan 05 | typed field `list!: ProblemListService` needs a type identity in Wave 1 |

Each stub is a 3-line class with a `__brand` phantom field so the type identities don't accidentally match each other. Plans 02/03/05 are expected to overwrite the entire file with the real implementation (same export name).

## Self-Check: PASSED

- [x] manifest.json, package.json, tsconfig.json, esbuild.config.mjs, eslint.config.mts, vitest.config.ts, styles.css, .gitignore, versions.json, version-bump.mjs, README.md, LICENSE all exist at repo root.
- [x] src/main.ts, src/auth/types.ts, src/browse/types.ts, src/shared/logger.ts, src/shared/errors.ts all exist and compile.
- [x] Task commits 3c48551, ed8d407, 10bae6a all present in `git log --oneline --all`.
- [x] `npm run build` → exit 0, main.js produced.
- [x] `npm run lint` → exit 0.
- [x] `npm test` → exit 0.
- [x] All typed-field-stub grep checks return 1.
- [x] AUTH-06 grep gate returns 0.
