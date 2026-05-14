---
phase: 02
plan: 01
subsystem: notes-test-infrastructure
tags: [wave-0, red-tests, test-infrastructure, manifest-bump, grep-gate]
dependency_graph:
  requires:
    - Phase 1 complete (requestUrl fetcher + LeetCodeClient + SettingsStore shipped)
    - vitest@4.1.5 installed
    - turndown@7.2.4 installed
  provides:
    - 20 RED vitest test files + 1 GREEN manifest-version test — frozen acceptance surface for Plans 02/03/04/05
    - 2 reusable mock helpers (makeMockVaultApp, makeMockLeetCodeClient + makeMockDetail)
    - 3 real LC HTML fixtures (two-sum, median, regex)
    - scripts/grep-no-vault-modify.sh — D-22 grep gate (executable, existence-guarded)
    - npm run grep:vault script
    - manifest.json minAppVersion bumped to 1.10.0 (D-19)
  affects:
    - Plans 02-02..02-05 (they turn these RED tests GREEN)
tech-stack:
  added: []
  patterns:
    - vitest factory pattern copied from tests/problems-pagination.test.ts (makeMockSettings / makeMockClient)
    - describe-block naming with REQ-ID + D-ID (PATTERNS.md Shared Pattern H)
    - existence-guarded grep loops in bash script (protects clean Wave 0 tree from set -euo pipefail ENOENT)
key-files:
  created:
    - scripts/grep-no-vault-modify.sh
    - tests/manifest-version.test.ts
    - tests/helpers/mock-vault.ts
    - tests/helpers/mock-leetcode-client.ts
    - tests/fixtures/lc-two-sum.html
    - tests/fixtures/lc-median.html
    - tests/fixtures/lc-regex.html
    - tests/htmlToMarkdown.test.ts
    - tests/htmlToMarkdown-determinism.test.ts
    - tests/htmlToMarkdown-snapshots.test.ts
    - tests/heading-region.test.ts
    - tests/heading-region-rename.test.ts
    - tests/heading-region-reinsert.test.ts
    - tests/note-filename.test.ts
    - tests/note-frontmatter-write.test.ts
    - tests/note-frontmatter-tags.test.ts
    - tests/note-frontmatter-preserve-user-tags.test.ts
    - tests/note-frontmatter-preserve-user-aliases.test.ts
    - tests/note-writer-folder.test.ts
    - tests/note-path-uses-settings.test.ts
    - tests/note-language-uses-settings.test.ts
    - tests/offline-regenerate.test.ts
    - tests/re-open-silent-offline.test.ts
    - tests/cache-ttl.test.ts
    - tests/new-note-fetch-failure.test.ts
    - tests/base-file-ship.test.ts
    - tests/base-file-preserve.test.ts
  modified:
    - manifest.json (minAppVersion 1.5.0 -> 1.10.0)
    - package.json (added grep:vault npm script)
decisions:
  - D-19 verified: minAppVersion bumped to 1.10.0 so Bases is available
  - D-22 enforced: scripts/grep-no-vault-modify.sh exits 0 on clean tree, 1 on any vault.modify( match in src/notes/ or src/browse/
  - Task 4 doc-edits confirmed already applied during planning-revision (idempotent — all 5 grep markers present before this plan ran)
metrics:
  duration_minutes: ~4
  completed_date: 2026-05-08
  total_tasks: 5
  total_commits: 4 (Task 4 was a no-op due to idempotency)
  test_files_created: 21
  new_fixtures: 3
  new_helpers: 2
---

# Phase 2 Plan 01: Wave 0 Test Infrastructure Summary

Wave 0 for Phase 2: froze the acceptance surface for problems-as-notes via 21 test files, 2 mock helpers, 3 LC HTML fixtures, and the D-22 grep gate — all without writing a line of production source. Plans 02-02..02-05 will turn these RED tests GREEN by implementing `src/notes/` modules.

## What Was Built

**21 test files** (20 RED + 1 GREEN):
- 1 GREEN: `tests/manifest-version.test.ts` (2 tests, both pass — validates manifest.json config rather than implementation)
- 11 RED utility tests (T3a): htmlToMarkdown (3 files), HeadingRegion (3 files), NoteTemplate filename/frontmatter (5 files)
- 9 RED orchestrator + cache tests (T3b): NoteWriter (5 files), cache-ttl, new-note-fetch-failure, BaseFile (2 files)

**2 reusable mock helpers** under `tests/helpers/`:
- `makeMockVaultApp()` — returns `{ app, state, spies, seedFrontmatter, getFrontmatter, getContent }` for NoteWriter / BaseFile / NoteOrchestrator tests. Implements a faithful subset of Obsidian's Vault + FileManager + workspace surface (vi.fn spies on every verb).
- `makeMockLeetCodeClient({ detail?, detailsBySlug?, throwOn? })` + `makeMockDetail(id, slug, overrides?)` — lets tests drive the (detail | null | throw 'network' | throw 'session-expiry') branches.

**3 real LC HTML fixtures** under `tests/fixtures/`:
- `lc-two-sum.html` — simple problem with examples + constraints (determinism primary)
- `lc-median.html` — math notation `O(log (m+n))` inside `<code>` (tests LaTeX-adjacent preservation path)
- `lc-regex.html` — `<pre><code class="language-python">` block (tests fenced-code-with-language extraction)

**Infrastructure**:
- `scripts/grep-no-vault-modify.sh` — D-22 grep gate. Existence-guarded (iterates `src/notes/` and `src/browse/` only if they exist, so `set -euo pipefail` doesn't abort on the clean Wave 0 tree). Exits 0 with `OK: no vault.modify() calls...` on success; exits 1 with forbidden message on match.
- `package.json` `grep:vault` npm script — invokes the bash script.
- `manifest.json` `minAppVersion: "1.10.0"` (was `1.5.0`) — per D-19, the version Bases was introduced.

## Task-by-Task

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1 | Manifest + grep gate + npm script + manifest-version test | 1e5b85e | manifest.json, scripts/grep-no-vault-modify.sh, package.json, tests/manifest-version.test.ts |
| T2 | Mock helpers + LC HTML fixtures | ee123b8 | tests/helpers/{mock-vault,mock-leetcode-client}.ts, tests/fixtures/lc-{two-sum,median,regex}.html |
| T3a | 11 utility RED tests | 989983a | tests/{htmlToMarkdown,htmlToMarkdown-determinism,htmlToMarkdown-snapshots,heading-region,heading-region-rename,heading-region-reinsert,note-filename,note-frontmatter-write,note-frontmatter-tags,note-frontmatter-preserve-user-tags,note-frontmatter-preserve-user-aliases}.test.ts |
| T3b | 9 orchestrator/cache RED tests | f542254 | tests/{note-writer-folder,note-path-uses-settings,note-language-uses-settings,offline-regenerate,re-open-silent-offline,cache-ttl,new-note-fetch-failure,base-file-ship,base-file-preserve}.test.ts |
| T4 | Doc edits (idempotent) | (no-op) | — no edits needed; all 5 grep markers already present from planning-revision |

## Verification Evidence

**Expected Wave 0 RED/GREEN split (observed):**
```
 Test Files  20 failed | 10 passed (30)
      Tests  64 passed (64)
```
- 10 passing files: 9 Phase 1 test files + `tests/manifest-version.test.ts` (our new GREEN gate)
- 20 failing files: every new Phase 2 test that imports `src/notes/*` — source modules don't exist yet, so vitest fails at module-resolution time. This is the exact required Wave 0 state per the plan.
- 64 tests pass because the 10 loading files contain 64 individual assertions; the 20 failing files never reach their `it()` bodies (import fails first).

**Plan-level success criteria — all green:**
- [x] `manifest.json` declares `minAppVersion: "1.10.0"` (D-19) — `grep -E '"minAppVersion":\s*"1\.10\.0"' manifest.json` matches
- [x] `scripts/grep-no-vault-modify.sh` exists, is executable, exits 0 on clean tree with `OK: no vault.modify() calls in src/notes/ or src/browse/`
- [x] `package.json` exposes `npm run grep:vault` — invokes the script; `grep -c '"grep:vault"' package.json` returns 1
- [x] 21 new test files on disk (20 new RED + 1 GREEN manifest-version). `find tests -maxdepth 1 -name "*.test.ts" | wc -l` returns 30 (9 Phase 1 + 21 Phase 2 new)
- [x] 2 mock helpers export `makeMockVaultApp` and `makeMockLeetCodeClient` + `makeMockDetail`
- [x] 3 LC HTML fixtures contain expected marker strings (`nums = [2,7,11,15]`, `O(log (m+n))`, `class="language-python"`)
- [x] `npm test` runs without "import is forbidden" / TS config errors — only fails at module-resolution for the expected 20 RED files
- [x] Task 4 idempotency verified: all 5 grep markers (`plugin re-inserts its own`, `(RESOLVED)`, `RESOLVED:` ≥ 3, `Topic tags like`, `Phase 2 scope = difficulty tag only`) present before this plan ran, so no doc edits were needed

**Commands run, output confirmed:**
```
$ ./scripts/grep-no-vault-modify.sh; echo "exit=$?"
OK: no vault.modify() calls in src/notes/ or src/browse/
exit=0

$ npm run grep:vault
OK: no vault.modify() calls in src/notes/ or src/browse/

$ npm test -- tests/manifest-version.test.ts
 ✓ tests/manifest-version.test.ts (2 tests) 4ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Deviations from Plan

### Task 4 — idempotent no-op (not a deviation, plan anticipated this)

**Found during:** Task 4 pre-check
**Finding:** Every one of Task 4's 5 grep markers was already present in the repo from the planning-revision pass:
- `plugin re-inserts its own` in `02-CONTEXT.md`: count 1 (D-09 already clarified)
- `(RESOLVED)` in `02-RESEARCH.md`: count 1 (Open Questions already renamed)
- `RESOLVED:` in `02-RESEARCH.md`: count 3 (all 3 Qs already marked)
- `Topic tags like` in `ROADMAP.md`: count 1 (Phase 2 S3 already aligned with D-05)
- `Phase 2 scope = difficulty tag only` in `REQUIREMENTS.md`: count 1 (NOTE-04 already split)

**Action taken:** None — Task 4 is specified as idempotent in the plan ("NOTE TO EXECUTOR: these edits may have already been applied during planning-revision. If the grep markers for each edit already return >=1, the edit is done — no further write needed."). No commit was generated for Task 4 since no bytes changed.

**Outcome:** All Task 4 acceptance criteria satisfied by the pre-existing state. No follow-up required.

### Auto-fixed Issues

None. All tasks executed exactly as written.

### Auth Gates

None triggered.

## Integration Points for Downstream Plans

- **Plan 02-02 (htmlToMarkdown + HeadingRegion + NoteTemplate utilities)** will turn these RED files GREEN: `htmlToMarkdown*.test.ts`, `heading-region*.test.ts`, `note-filename.test.ts`, `note-frontmatter-*.test.ts`. Imports are already anchored at `../src/notes/{htmlToMarkdown,HeadingRegion,NoteTemplate}`.
- **Plan 02-03 (NoteWriter orchestrator)** will turn GREEN: `note-writer-folder.test.ts`, `note-path-uses-settings.test.ts`, `note-language-uses-settings.test.ts`, `offline-regenerate.test.ts`, `re-open-silent-offline.test.ts`, `cache-ttl.test.ts`, `new-note-fetch-failure.test.ts`. The mock helpers expose exactly the Vault/FileManager/workspace surface these tests need.
  - `cache-ttl.test.ts` imports `CACHE_TTL_MS` from `../src/notes/NoteWriter` and asserts `=== 7 * 24 * 60 * 60 * 1000` — Plan 02-03 must export this constant.
  - Plan 02-03 T2 must implement the `vault.create → (tick-await + try/catch) → applyFrontmatter` race-guard that `note-frontmatter-write.test.ts` new-note path covers.
- **Plan 02-04 (LeetCodeClient + SettingsStore extensions)** — no test here depends on it directly, but the `DetailCacheEntry` shape in `mock-leetcode-client.ts` mirrors what Plan 02-04 must ship in `SettingsStore`.
- **Plan 02-05 (Bases file + wiring into ProblemBrowserView)** will turn GREEN: `base-file-ship.test.ts`, `base-file-preserve.test.ts`. Plan 02-05 must export `ensureLeetcodeBase(app, folder)` and `leetcodeBaseYaml(folder)` from `src/notes/BaseFile.ts`. The YAML must contain `lc-id` and `direction: DESC`.

## Known Stubs

None. This plan intentionally produces only tests + test infrastructure + config changes — no UI stubs or placeholder content. The 20 RED tests are the anticipated/desired state for Wave 0, not stubs: they exist to be turned GREEN by later plans.

## Threat Flags

None. New surface introduced:
- Grep gate bash script — no external inputs; content under version control; runs `set -euo pipefail`.
- Test fixtures — public LC problem HTML; no credentials.
- Mock helpers — test-scope only; never shipped in plugin bundle.

No threat surface beyond what was already in the plan's `<threat_model>`.

## Self-Check: PASSED

**Files created (spot-checked):**
- `/Users/moxu/projects/obsidian-leetcode/scripts/grep-no-vault-modify.sh` — FOUND (executable)
- `/Users/moxu/projects/obsidian-leetcode/tests/manifest-version.test.ts` — FOUND
- `/Users/moxu/projects/obsidian-leetcode/tests/helpers/mock-vault.ts` — FOUND
- `/Users/moxu/projects/obsidian-leetcode/tests/helpers/mock-leetcode-client.ts` — FOUND
- `/Users/moxu/projects/obsidian-leetcode/tests/fixtures/lc-two-sum.html` — FOUND
- `/Users/moxu/projects/obsidian-leetcode/tests/fixtures/lc-median.html` — FOUND
- `/Users/moxu/projects/obsidian-leetcode/tests/fixtures/lc-regex.html` — FOUND
- All 20 new RED test files — FOUND

**Commits verified (git log --oneline):**
- `1e5b85e chore(02-01): bump minAppVersion to 1.10.0 and add grep:vault gate` — FOUND
- `ee123b8 test(02-01): add mock helpers and LC HTML fixtures for Wave 0` — FOUND
- `989983a test(02-01): add 11 Wave 0 RED utility tests (htmlToMarkdown, HeadingRegion, NoteTemplate)` — FOUND
- `f542254 test(02-01): add 9 Wave 0 RED orchestrator + cache tests` — FOUND

All four task commits present; SUMMARY + STATE updates will land in the final metadata commit.
