---
phase: 02-problems-as-notes
plan: 03
subsystem: notes
tags: [note-writer, base-file, orchestrator, cache-ttl, obsidian-vault]
requires:
  - 02-01 (NoteTemplate, HeadingRegion, DetailCacheEntry types)
  - 02-02 (htmlToMarkdown)
  - 01 (isSessionExpired, logger)
provides:
  - "NoteWriter class with openProblem(slug) orchestrator"
  - "CACHE_TTL_MS constant (7 days)"
  - "NoteWriterClient / NoteWriterSettings structural interfaces"
  - "ensureLeetcodeBase / leetcodeBaseYaml (via 02-03 T1)"
  - "tests/helpers/obsidian-stub.ts runtime stub for vitest"
affects:
  - "Future Plan 02-04: LeetCodeClient.getProblemDetail + SettingsStore detail-cache getters structurally satisfy NoteWriterClient / NoteWriterSettings"
  - "Future Plan 02-05: main.ts + ProblemBrowserView wire NoteWriter to row-click"
tech-stack:
  added: []
  patterns:
    - "Structural DI (NoteWriterClient / NoteWriterSettings interfaces) so tests can pass bare object mocks"
    - "Duck-type file check (typeof extension === 'string') instead of `instanceof TFile` — works for both real TFile and mocked file-shaped objects"
    - "Fire-and-forget background refresh wrapped in .catch swallow (D-12 silent offline)"
    - "Metadata-cache-race guard: tick-await + try/catch+50ms-retry between vault.create and applyFrontmatter"
    - "Vitest resolve.alias routing `obsidian` → tests/helpers/obsidian-stub.ts (npm obsidian ships types only)"
key-files:
  created:
    - src/notes/BaseFile.ts
    - src/notes/NoteWriter.ts
    - tests/helpers/obsidian-stub.ts
  modified:
    - vitest.config.ts
decisions:
  - "D-11 reveal-first: existing cached note reveals via workspace.openLinkText before any network"
  - "D-12 silent offline: backgroundRefresh failures routed to logger.debug — no user Notice"
  - "D-13 new-note-fetch-failure: Notice fires (\"Couldn't fetch {slug}...\") and no partial file is created"
  - "D-14 cache schema: toDetailCacheEntry maps LC's NoteWriterDetail → DetailCacheEntry with fetchedAt stamp"
  - "D-17 (via 02-03 T1): LeetCode.base ships with sort by lc-id direction: DESC"
  - "D-18 lazy ship: ensureLeetcodeBase called opportunistically on every openProblem; never overwrites existing file"
  - "D-22 no vault.modify: body rewrites via vault.process, frontmatter via processFrontMatter"
  - "BLOCKER-3 / Open Q2: metadata-cache-race guard (microtask tick + single 50ms retry) ships to work around Obsidian's async indexing of vault.create-returned TFile"
metrics:
  duration: "Task 1: committed previously at 2829963; Task 2: resumed and completed"
  tasks: 2
  files: 4
  completed: 2026-05-08
---

# Phase 02 Plan 03: Note Writer + BaseFile Summary

One-liner: `NoteWriter.openProblem(slug)` orchestrator with reveal-first / cache-TTL / silent-offline / new-note-fetch-failure branching, plus the lazy `LeetCode.base` YAML ship — wired in under 250 lines with a duck-type TFile accommodation so tests run without Obsidian.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | BaseFile.ts — `leetcodeBaseYaml` + `ensureLeetcodeBase` | `2829963` | `src/notes/BaseFile.ts` |
| 2 | NoteWriter.ts — `openProblem` orchestrator + vitest wiring | `def2c3f` | `src/notes/NoteWriter.ts`, `tests/helpers/obsidian-stub.ts`, `vitest.config.ts` |

## Public Surface

### From `src/notes/NoteWriter.ts`

```typescript
export const CACHE_TTL_MS: number;  // 7 * 24 * 60 * 60 * 1000 = 604_800_000

export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}

export interface NoteWriterDetail {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags?: Array<{ name: string; slug: string }>;
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}

export interface NoteWriterSettings {
  getProblemsFolder(): string;
  getDefaultLanguage(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;
}

export class NoteWriter {
  constructor(app: App, client: NoteWriterClient, settings: NoteWriterSettings);
  async openProblem(slug: string): Promise<void>;
}
```

### From `src/notes/BaseFile.ts`

```typescript
export function leetcodeBaseYaml(folder: string): string;
export async function ensureLeetcodeBase(app: App, folder: string): Promise<void>;
```

## Orchestration Flow (`openProblem`)

| Branch | Trigger | Behavior |
|--------|---------|----------|
| Reveal-only | file exists + cached fresh | `workspace.openLinkText` + opportunistic `ensureLeetcodeBase`; no network |
| Reveal + background refresh | file exists + cached stale (>7d) | Reveal immediately, then fire-and-forget `backgroundRefresh` (swallowed on failure per D-12) |
| New-note success | file missing + fetch OK | `setProblemDetail` → auto-create folder → `vault.create(body)` → tick+retry `applyFrontmatter` → reveal + lazy base-file ship |
| New-note session-expired | fetch throws session-expired | Notice: `"LeetCode session expired. Log in again."` (8000ms); abort — no partial file |
| New-note network failure | fetch throws non-session error | Notice: `"Couldn't fetch {slug}. Check your connection."` (4000ms); abort |
| New-note null/no-content | fetch returns null or `!content` | Notice: `"LeetCode problem not found: {slug}."` (4000ms); abort |

## Notice Copy Inventory (live in NoteWriter)

| Line | Copy | Timeout | Source |
|------|------|---------|--------|
| 143 | `LeetCode session expired. Log in again.` | 8000 | Shared Pattern C, Phase 1 UI-SPEC |
| 147 | `` Couldn't fetch ${slug}. Check your connection. `` | 4000 | D-13 |
| 154 | `LeetCode problem not found: ${slug}.` | 4000 | D-13 new-plus-null branch |

The `LeetCode` proper-noun casing triggers `obsidianmd/ui/sentence-case`; the two rule-exempt lines carry matching `eslint-disable-next-line` directives with a UI-SPEC lock justification.

## Key Design Decisions Honored

- **D-11 Reveal-first**: the existing-file branch calls `workspace.openLinkText` BEFORE any network call — guarantees sub-frame reveal of cached notes.
- **D-12 Silent offline**: every `backgroundRefresh` rejection routes to `logger.debug`; no Notice ever fires on a refresh failure.
- **D-13 New-note fetch failure**: Notice + `return` — no partial file lands on disk because we compute the cache entry and call `setProblemDetail` only on the happy path, AFTER validating `detail && detail.content`.
- **D-14 DetailCacheEntry**: `toDetailCacheEntry` populates the full schema (id, title, difficulty, url, contentHtml, topicSlugs, exampleTestcases, codeSnippets, fetchedAt).
- **D-17/D-18 BaseFile lazy ship**: `ensureLeetcodeBase` called in both the reveal branch and the new-note branch; both sites `.catch(logger.debug)` so a base-file write failure NEVER blocks a user's note-open.
- **D-22 No `vault.modify`**: body refresh uses `vault.process` (atomic), frontmatter uses `applyFrontmatter` → `processFrontMatter`. Grep gate `./scripts/grep-no-vault-modify.sh` passes.
- **BLOCKER-3 / Open Q2**: the race-guard is a 0ms microtask yield (to let Obsidian's `MetadataCache` index the newly-created TFile) followed by a single 50ms retry if the first `applyFrontmatter` throws. Comment block on line 179 anchors the `Metadata-cache-race guard` marker the grep gate searches for.

## `instanceof TFile` → Duck-Type Switch (as anticipated)

The plan anticipated this under T2 note 4. Implementation uses:

```typescript
interface FileLike { path: string; extension?: unknown; }
function isFileLike(v: unknown): v is FileLike {
  return !!v && typeof v === 'object'
    && typeof (v as { extension?: unknown }).extension === 'string'
    && typeof (v as { path?: unknown }).path === 'string';
}
```

Rationale: the mocked Vault in `tests/helpers/mock-vault.ts` returns plain objects shaped `{ path, name, extension, parent }` that do NOT pass `instanceof TFile`. Real Obsidian TFile also has `.path` and `.extension` strings, so the duck-type check is truthful for both environments. `TFile` remains a `import type` (lines 28) because no runtime reference is needed once the duck-check replaces `instanceof`.

## Vitest Wiring (scope expansion, justified by Rule 3)

The plan originally assumed tests could import from `'obsidian'` out of the box, but the npm package ships types only (`main: ""`). Without a runtime stub, every test that transitively imports `NoteWriter.ts` fails with `Failed to resolve entry for package obsidian`.

Fix:
- `tests/helpers/obsidian-stub.ts` — class stubs for `Notice`, `TFile`, `TFolder`, `Plugin`, `PluginSettingTab`, `Modal`, `Setting`, `WorkspaceLeaf`, `App`, `MarkdownView`, `ItemView`, `FileManager`, `Vault`, `Workspace`, plus a `requestUrl` that throws until `vi.mock`'d.
- `vitest.config.ts` — added `resolve.alias` routing `obsidian` → the stub file.

This is Rule 3 (blocking issue in test infrastructure), not a plan deviation — tests that need real `Notice` / `requestUrl` behavior continue to override via `vi.mock('obsidian', …)` as planned.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm test -- tests/note-writer-folder.test.ts tests/offline-regenerate.test.ts tests/re-open-silent-offline.test.ts tests/cache-ttl.test.ts tests/new-note-fetch-failure.test.ts tests/note-path-uses-settings.test.ts tests/note-language-uses-settings.test.ts` | 7 files / 10 tests passed |
| `npm test` (full suite) | 30 files / 105 tests passed — no regressions |
| `./scripts/grep-no-vault-modify.sh` | `OK: no vault.modify() calls in src/notes/ or src/browse/` |
| `grep -c "Metadata-cache-race guard" src/notes/NoteWriter.ts` | `1` |
| `grep -rE "fetch\s*\(|axios|node-fetch" src/notes/` | no matches |
| `npm run build` | exit 0 (tsc -noEmit + esbuild production) |

## Downstream Dependencies Now Satisfied

- **Plan 02-04 (LeetCodeClient + SettingsStore detail-cache extensions)** can structurally-implement `NoteWriterClient` and `NoteWriterSettings`. No additional type wiring required — just add the four methods.
- **Plan 02-05 (main.ts + ProblemBrowserView row-click)** can `new NoteWriter(app, client, settings)` and call `openProblem(slug)` directly.

## Deviations from Plan

| Rule | Type | Description |
|------|------|-------------|
| Rule 3 | Blocking issue | Added `tests/helpers/obsidian-stub.ts` + `vitest.config.ts` alias so tests importing `obsidian` resolve (npm `obsidian` ships types only). Three-file scope expansion, justified by the alternative being "every downstream test file mocks `obsidian` from scratch". |

None of the Task 1/Task 2 `acceptance_criteria` were relaxed or skipped. The plan itself did not call for the vitest wiring, but every downstream test requires it to function.

## Deferred Items

None. All 10 plan-owned tests are GREEN; all grep gates hold; the project builds.

## Self-Check: PASSED

Verified on-disk:
- `src/notes/BaseFile.ts` — FOUND (from commit 2829963)
- `src/notes/NoteWriter.ts` — FOUND (from commit def2c3f)
- `tests/helpers/obsidian-stub.ts` — FOUND (from commit def2c3f)
- `vitest.config.ts` — FOUND (modified in def2c3f)

Verified commits:
- `2829963` — FOUND (Task 1: BaseFile)
- `def2c3f` — FOUND (Task 2: NoteWriter + vitest wiring)
