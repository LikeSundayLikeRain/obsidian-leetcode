---
phase: 02-problems-as-notes
plan: 04
subsystem: settings + api
tags: [cache, detail, data.json, lc-client, d-14, d-15]
dependency_graph:
  requires:
    - src/settings/SettingsStore.ts (Phase 1 shape-guard + load pattern)
    - src/api/LeetCodeClient.ts (Phase 1 fetchWhoami analog)
    - src/notes/types.ts (Wave 1 inline DetailCacheEntry interface)
  provides:
    - SettingsStore.DetailCacheEntry (canonical interface)
    - SettingsStore.PluginData.problemDetails map
    - SettingsStore.getProblemDetail/setProblemDetail/pruneProblemDetails
    - LeetCodeClient.LeetCodeProblemDetail interface
    - LeetCodeClient.getProblemDetail(slug)
  affects:
    - src/notes/NoteWriter.ts (Plan 02-03 consumer — now resolves to canonical DetailCacheEntry)
    - src/notes/NoteTemplate.ts (Plan 02-02 consumer — import path stays stable)
tech-stack:
  added: []
  patterns:
    - Shape-guard + sanitizer mirroring isValidIndexedProblem/isValidProblemIndex
    - Warn-without-leaking on malformed load entries (matches existing auth/problemIndex policy)
    - Type-cast-then-await pattern mirroring fetchWhoami with DIVERGENCE (re-throw on network)
key-files:
  created: []
  modified:
    - src/settings/SettingsStore.ts
    - src/api/LeetCodeClient.ts
    - src/notes/types.ts
decisions:
  - "DetailCacheEntry lives canonically in SettingsStore.ts; src/notes/types.ts re-exports (data.json ownership belongs to SettingsStore per CF-03)"
  - "getProblemDetail re-throws network errors (diverges from fetchWhoami) so D-13 NoteWriter can show the couldn't-fetch Notice"
  - "sanitizer drops malformed entries silently with a count-based logger.warn (no value leak)"
  - "optional fields (exampleTestcases, codeSnippets) are shape-guarded only when present"
metrics:
  duration: 4m
  completed_date: 2026-05-08
  tasks_completed: 2
  tests_passed: 105
  tests_regressed: 0
---

# Phase 02 Plan 04: SettingsStore + LeetCodeClient Extension Summary

Extended the two long-lived Phase 1 state modules to carry Phase 2's new surface: `SettingsStore` now owns the canonical `DetailCacheEntry` interface and a `problemDetails` cache with getters/setters/prune, and `LeetCodeClient` gained `getProblemDetail(slug)` — a thin wrapper over `lc.problem(slug)` that diverges from `fetchWhoami` by re-throwing network errors so `NoteWriter` (D-13) can distinguish offline from not-found.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1    | Extend SettingsStore with problemDetails map + shape-guard + getters/setters/prune + flip types.ts to re-export | `5de5a6d` | `src/settings/SettingsStore.ts`, `src/notes/types.ts` |
| 2    | Extend LeetCodeClient with getProblemDetail + LeetCodeProblemDetail interface | `6ed4005` | `src/api/LeetCodeClient.ts` |

## Canonical DetailCacheEntry Schema (D-14)

Exported from `src/settings/SettingsStore.ts`:

```typescript
// CF-03 compliance: contentHtml is LC public problem content — non-sensitive. Only
// auth.LEETCODE_SESSION (a sibling in PluginData) is a secret; logger.ts redaction
// patterns target that field. contentHtml is safely persisted in data.json without redaction.
/** Per-problem detail cache entry persisted in data.json.
 *  Schema locked by CONTEXT.md D-14. Keyed by slug inside PluginData.problemDetails.
 *  ~10–50 KB per entry; 7-day TTL enforced by callers (NoteWriter.CACHE_TTL_MS). */
export interface DetailCacheEntry {
  fetchedAt: number;
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}
```

## New SettingsStore Method Signatures (D-15)

```typescript
/** Read the cached detail for a slug. Returns null if missing. */
getProblemDetail(slug: string): DetailCacheEntry | null;

/** Persist a detail cache entry. Mutates in place + persists. */
async setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;

/** Remove cache entries older than `maxAgeMs`. Returns pruned count. Opportunistic. */
async pruneProblemDetails(maxAgeMs: number): Promise<number>;
```

Backed by `PluginData.problemDetails: Record<string, DetailCacheEntry>` field, `DEFAULT_DATA.problemDetails = {}`, and `sanitizeProblemDetails(raw)` + `isValidDetailCacheEntry(v)` shape-guards wired into `SettingsStore.load()`. Malformed entries dropped silently with a count-based `logger.warn(...)` (matches auth/problemIndex posture).

## New LeetCodeClient Method Signature

```typescript
/** Fetch problem detail by slug. Returns the LC `question` object or null.
 *
 *  On success: returns the detail.
 *  On LC null-data: returns null (caller checks isSessionExpired vs not-found).
 *  On network error: throws (caller catches, inspects via isSessionExpired,
 *  and shows an appropriate Notice).
 */
async getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null>;
```

Exported alongside:

```typescript
export interface LeetCodeProblemDetail {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
  topicTags?: Array<{ name: string; slug: string }>;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  stats?: string;
}
```

## types.ts Flip

`src/notes/types.ts` reduced from Wave 1's inline 17-line interface declaration to a single re-export:

```typescript
// src/notes/types.ts
// Barrel for notes-module types.
// DetailCacheEntry lives canonically in SettingsStore (data.json ownership),
// re-exported here so notes code imports from a single place.
export type { DetailCacheEntry } from '../settings/SettingsStore';
```

All Plan 02-02 / 02-03 consumers (`NoteTemplate`, `NoteWriter`, orchestrator) continue to import from `./types` — no consumer churn required. The inline declaration's shape was byte-identical to the canonical, so no consumer behavior changes.

## Verification

- `grep -c "export interface DetailCacheEntry" src/settings/SettingsStore.ts` → **1**
- `grep -c "CF-03 compliance" src/settings/SettingsStore.ts` → **1**
- `grep -c "problemDetails" src/settings/SettingsStore.ts` → **13** (well above the 6-minimum)
- `grep -c "isValidDetailCacheEntry" src/settings/SettingsStore.ts` → **2**
- `grep -c "sanitizeProblemDetails" src/settings/SettingsStore.ts` → **2**
- `grep -c "async pruneProblemDetails" src/settings/SettingsStore.ts` → **1**
- `grep -c "fetchedAt: number" src/notes/types.ts` → **0** (inline body removed, re-export only)
- `grep -c "export interface LeetCodeProblemDetail" src/api/LeetCodeClient.ts` → **1**
- `grep -c "async getProblemDetail" src/api/LeetCodeClient.ts` → **1**
- `grep -c "throw err" src/api/LeetCodeClient.ts` → **1**
- `grep -c "from '../notes" src/api/LeetCodeClient.ts` → **0** (no import loop)
- `grep -c "export function isSessionExpired" src/api/LeetCodeClient.ts` → **1** (unchanged)
- `npm test` → **30 test files / 105 tests passed, 0 regressions**
- `npm run build` → **exits 0**
- `npx eslint src/settings/SettingsStore.ts src/notes/types.ts src/api/LeetCodeClient.ts` → **clean** (0 errors on Plan 02-04 files)
- `./scripts/grep-no-vault-modify.sh` → **exits 0**

## Deviations from Plan

None on Rules 1-4. Plan executed exactly as written, with two minor mechanical adjustments:

1. **Removed redundant type cast in load()** — the plan's Edit 5 suggested `sanitizeProblemDetails((raw as Record<string, unknown>).problemDetails)`, but `raw` is already typed as `Record<string, unknown>` on line 146 of the existing file, so the cast was flagged by `@typescript-eslint/no-unnecessary-type-assertion`. Replaced with `sanitizeProblemDetails(raw.problemDetails)` (same runtime semantics; satisfies the lint gate that CLAUDE.md requires). Same simplification applied to the warn block's `rawMap`.

2. **Added single eslint-disable for intentional try/catch re-throw in getProblemDetail** — `no-useless-catch` flags the pattern `try { ... } catch (err) { throw err; }` as redundant. The try/catch is load-bearing for documenting the DIVERGENCE from `fetchWhoami` (the comment block above the block is the feature — a future refactor that removes the block would silently remove the D-13 contract). Added a targeted `// eslint-disable-next-line no-useless-catch` with a comment explaining why.

## Auth Gates

None encountered.

## Scope Boundaries Honored

- Did NOT touch any Plan 02-03 files (`src/notes/NoteWriter.ts`, `src/notes/BaseFile.ts`) even though lint reports pre-existing errors there — those are Wave 2 Plan 03's responsibility.
- Did NOT add a settings UI control for the cache (Phase 5 territory).
- Did NOT modify STATE.md or ROADMAP.md per objective instructions.

## Self-Check: PASSED

- Files created: (none) — verified
- Files modified: `src/settings/SettingsStore.ts`, `src/api/LeetCodeClient.ts`, `src/notes/types.ts` — all confirmed via `git log --stat 5de5a6d 6ed4005`
- Commits: `5de5a6d` (Task 1), `6ed4005` (Task 2) — both present in `git log --oneline`
- Acceptance grep counts: all met
- Full test suite: 105/105 GREEN
- Build: exits 0
- Lint on Plan 02-04 files: clean
