---
phase: 02-problems-as-notes
plan: 08
subsystem: notes/BaseFile + main.onload
tags:
  - obsidian
  - bases
  - yaml
  - leetcode
  - gap-closure
  - migration
dependency-graph:
  requires:
    - 02-06 (ensureLeetcodeBase writer + D-18 never-overwrite guard)
  provides:
    - leetcodeBaseYaml Obsidian 1.10+ wire-format YAML (populated Bases view)
    - isLegacyLeetcodeBaseV010 pure detector (v0.1.0 signature match)
    - runLegacyBaseCheck pure three-condition gate (testable outside Obsidian)
    - SettingsStore.hasShownLegacyBaseNotice / markLegacyBaseNoticeShown (one-time flag)
    - one-time migration Notice wired into onload()
  affects:
    - any Obsidian vault still carrying the v0.1.0 empty-rendering LeetCode.base
tech-stack:
  added: []
  patterns:
    - "Three-condition AND-gate (flag unset + file exists + signature matches) surfaced as a pure exported helper with an injectable deps interface (settings/readBaseFile/showNotice) — no Plugin/Vault/Notice dependency in tests"
    - "instanceof TFile narrowing (obsidianmd/no-tfile-tfolder-cast compliant) — no unsafe casts from TAbstractFile"
    - "Fire-and-forget non-blocking invocation from onload() via `void this.checkLegacyLeetcodeBase().catch(() => undefined)` — never blocks plugin activation on slow vault I/O"
    - "Persisted one-time flag via SettingsStore.saveData roundtrip (same PluginData pattern as other preferences)"
    - "Folder-agnostic filter expression `!note[\"lc-id\"].isEmpty()` — survives user relocating a problem note to a sub-folder"
key-files:
  created:
    - tests/base-file-detect-stale.test.ts
  modified:
    - src/notes/BaseFile.ts
    - src/settings/SettingsStore.ts
    - src/main.ts
    - tests/base-file-ship.test.ts
    - tests/base-file-preserve.test.ts
decisions:
  - "Replaced v0.1.0 top-level `filters:` with view-scoped `filters:` (Obsidian 1.10+ actually reads per-view filters; top-level filters in 0.1.0 were silently ignored — root cause of the empty Bases view)"
  - "Switched filter expression from `file.inFolder(\"LeetCode\") + lc-id != null` to `!note[\"lc-id\"].isEmpty()` — folder-agnostic; if a user moves a problem note to a sub-folder it still shows up in the Bases view"
  - "Retained `folder` parameter on leetcodeBaseYaml() even though the new filter does not reference folder path — API-compat with pre-GAP-6 callers; eslint-disable the unused arg locally"
  - "isLegacyLeetcodeBaseV010 gates on BOTH substrings (`file.inFolder(\"` AND `lc-id != null`) — single-token overlap on a user-customised file must NOT false-positive trigger the Notice"
  - "Extracted runLegacyBaseCheck as an exported pure helper with a deps interface instead of testing the private method — keeps the Notice/Vault/Plugin integration thin and lets the three-condition gate be exercised deterministically without a real Obsidian runtime"
  - "Notice copy `LeetCode.base may need to be regenerated. Delete it to get the updated view.` starts with a proper noun — verified lint-clean without an eslint-disable directive (obsidianmd/ui/sentence-case does not flag leading proper nouns)"
  - "One-time gating via persisted `legacyBaseNoticeShown` bool — even if contents still match signature on a future reload, the Notice does not re-fire (D-22 spam-prevention)"
  - "D-18 preservation unchanged — the Notice advises the user to DELETE manually; plugin never auto-writes over a user-touched LeetCode.base even when it detects the legacy signature"
requirements:
  - NOTE-01
  - NOTE-07
metrics:
  duration_iso: "PT45M"
  completed_date: "2026-05-08"
  tasks_completed: 3
  commits: 2
  notes: "Task 4 is a human-verify checkpoint — awaiting manual QA in user's Obsidian install."
gap_closure:
  - GAP-6 (LeetCode.base renders empty in Obsidian 1.10+)
---

# Phase 02 Plan 08: GAP-6 Bases View Fix Summary

Close GAP-6 (the shipped `LeetCode.base` renders as an empty Bases view in Obsidian 1.10+) by replacing the broken v0.1.0 YAML with a reverse-engineered Obsidian 1.10 UI wire format, adding a pure `isLegacyLeetcodeBaseV010` signature detector, plumbing a one-time `legacyBaseNoticeShown` flag through SettingsStore, and wiring a non-blocking migration Notice into `onload()`. The Notice advises users to manually delete their old `.base` file; D-18 preservation holds — the plugin never auto-overwrites.

## Outcome

- **Root cause found (the 02-RESEARCH.md A1 assumption was wrong as suspected):** the v0.1.0 file used a TOP-LEVEL `filters:` block and folder-scoped expressions (`file.inFolder("LeetCode")`, `lc-id != null`). Obsidian 1.10 Bases actually reads `filters:` per-view and uses the expression grammar `!note["lc-id"].isEmpty()` for property-presence probes. The top-level filters were silently ignored, leaving the default view with nothing to draw and rendering an empty table.
- **New YAML renders populated** — pending Task 4 human-verify in the user's target Obsidian install, but the schema was copied verbatim from a working UI-generated Base the user constructed in the Task 1 checkpoint. All unit tests (snapshot + preservation + detector + three-condition gate) pass locally.
- **Existing installs get a migration pathway** — on plugin load, if a `LeetCode.base` exists at the configured problems folder AND its contents contain both v0.1.0 tokens AND the one-time flag is unset, a Notice fires exactly once per install telling the user to delete the file. They reload the vault, open any problem, `ensureLeetcodeBase` recreates with the fixed schema.
- **D-18 posture preserved** — the Notice is advisory only. `ensureLeetcodeBase`'s `if (existing) return` early-exit is untouched; a user-customised `.base` is never clobbered regardless of whether it matches the v0.1.0 signature.

## Reverse-engineered YAML (the canonical new schema)

Parameterised by `folder` (retained for API compat even though the new filter is folder-agnostic):

```yaml
# Auto-generated by the LeetCode plugin on first problem open.
# Feel free to customise views, columns, filters, and sort — the plugin
# will NOT overwrite this file. Delete it to regenerate on next open.
views:
  - type: table
    name: Problems
    filters:
      and:
        - '!note["lc-id"].isEmpty()'
    order:
      - file.name
      - lc-id
      - lc-title
      - lc-difficulty
      - lc-status
      - lc-language
    sort:
      - property: lc-id
        direction: DESC
```

### Schema deltas from the broken v0.1.0 shipped YAML

| Aspect | v0.1.0 (broken) | v0.1.1 (GAP-6 fix) |
|---|---|---|
| `filters:` scope | top-level sibling of `views:` | nested inside each view |
| Presence probe | `lc-id != null` | `!note["lc-id"].isEmpty()` |
| Folder scope | `file.inFolder("LeetCode")` (hard-coded) | folder-agnostic; presence probe does the work |
| Extension filter | `file.ext == "md"` (redundant — Bases only reads md) | removed |
| Column 1 | `lc-id` | `file.name` added as first column (note-name is Base-view convention) |

The v0.1.0 filter expressions were syntactically valid but SCOPED wrong — top-level `filters:` are not consulted by Obsidian 1.10 Bases. Candidate addendum for `02-RESEARCH.md` assumption A1 below.

## Detector invariants (exercised by tests)

`isLegacyLeetcodeBaseV010(contents: string): boolean` fires true iff BOTH literal substrings are present:
- `file.inFolder("` (folder-scoped expression, unique to v0.1.0)
- `lc-id != null` (property-null probe, unique to v0.1.0)

Neither substring survives into the new schema, so a post-migration user never false-positives. Single-token overlap (a user-crafted filter that happens to include just one of the two) also does not trigger. The defensive runtime guard tolerates null/undefined/non-string input without throwing.

## Three-condition Notice gate (exercised by `runLegacyBaseCheck`)

All three must hold for the Notice to fire:
1. `settings.hasShownLegacyBaseNotice()` is false (one-time-per-install)
2. `{folder}/LeetCode.base` exists in the vault
3. Its contents match `isLegacyLeetcodeBaseV010`

On fire, the Notice shows for 8000 ms and `markLegacyBaseNoticeShown()` persists the flag via saveData. On subsequent loads the flag short-circuits before any vault read.

Notice copy (locked verbatim):
> `LeetCode.base may need to be regenerated. Delete it to get the updated view.`

Starts with the proper noun "LeetCode"; the obsidianmd/ui/sentence-case lint rule does not flag proper-noun openings, so no eslint-disable directive is needed (confirmed by lint run — adding one produced an "unused eslint-disable" warning).

## Files changed

### Task 2 (commit `b92c8cb`): fix schema + add detector + plumb flag

- **`src/notes/BaseFile.ts`** — replaced `leetcodeBaseYaml()` body with the reverse-engineered YAML; added exported `isLegacyLeetcodeBaseV010` pure detector; `ensureLeetcodeBase` untouched (D-18 preserved).
- **`src/settings/SettingsStore.ts`** — added `legacyBaseNoticeShown: boolean` to PluginData interface + DEFAULT_DATA; defensive `load()` sanitization; getter `hasShownLegacyBaseNotice()` and async setter `markLegacyBaseNoticeShown()` mirroring other boolean-flag patterns in the file.
- **`tests/base-file-ship.test.ts`** — updated snapshot assertions to match new schema (folder substitution still works; all 5 columns present; sort clause references `lc-id` DESC; trailing newline preserved).
- **`tests/base-file-preserve.test.ts`** — verified D-18 never-overwrite guard still passes unchanged under new YAML body.
- **`tests/base-file-detect-stale.test.ts`** (new) — 7 tests on `isLegacyLeetcodeBaseV010`: legacy-YAML-true, new-YAML-false, custom-folder-false, empty-string-false, unrelated-text-false, user-customised-extends-new-schema-false, single-token-overlap-false, non-string-defensive-false.

### Task 3 (commit `c9d5ba3`): wire one-time legacy Notice into onload

- **`src/main.ts`** — imported `isLegacyLeetcodeBaseV010` and `TFile`; added private `checkLegacyLeetcodeBase()` that delegates to the exported pure helper `runLegacyBaseCheck(deps)`; narrowed vault lookup via `instanceof TFile` (no unsafe casts — obsidianmd/no-tfile-tfolder-cast compliant); fire-and-forget invocation in `onload()` after settings tab registration; exported `runLegacyBaseCheck(deps)` pure helper (three-condition gate, injectable deps for testability).
- **`tests/base-file-detect-stale.test.ts`** — added 7 tests on `runLegacyBaseCheck`: fires Notice + marks flag on v0.1.0 contents; idempotent across invocations; flag-already-set short-circuits before any vault read; missing file no-ops; new-schema contents no-ops; custom folder with trailing slash stripped before path composition.

## Verification evidence

| Gate | Command | Result |
|---|---|---|
| Full unit test suite | `npm test` | **153 passed** (33 files) — no regressions |
| TypeScript + esbuild prod build | `npm run build` | **clean** (no TS errors, prod bundle emitted) |
| Lint baseline invariant | `npm run lint` | **35 errors, 5 warnings** — matches pre-02-08 baseline exactly; zero NEW violations introduced by 02-08 |
| D-22 grep gate | `./scripts/grep-no-vault-modify.sh` | **exit 0** (no `vault.modify` in `src/notes/` or `src/browse/`) |
| Notice copy presence | `grep -c "LeetCode.base may need to be regenerated" src/main.ts` | **1** (exact match) |
| Flag wired | `grep -c "markLegacyBaseNoticeShown" src/main.ts` | **2** (deps-type + helper call) |
| Detector imported | `grep -c "isLegacyLeetcodeBaseV010" src/main.ts` | **3** (import + 2 usages) |
| TFile narrowing applied | `grep -c "instanceof TFile" src/main.ts` | **1** (replaces the removed `as unknown as TFile` cast) |
| D-18 guard intact | `grep -q "if (existing) return" src/notes/BaseFile.ts` | **match** |

## Task 4: awaiting human-verify checkpoint

Task 4 is a `checkpoint:human-verify` and CANNOT be executed by the automated agent — it requires the user to:

1. Build the plugin (`npm run build`) and load the new `main.js` into their target Obsidian vault.
2. Reopen Obsidian. On the first reload with the new build, if they still have the old `LeetCode/LeetCode.base`, they should see a Notice reading exactly: `LeetCode.base may need to be regenerated. Delete it to get the updated view.`
3. Reload once more and confirm the Notice does NOT re-fire (one-time gate).
4. Manually delete `LeetCode/LeetCode.base` from the File Explorer.
5. Click any problem in the browser — `ensureLeetcodeBase` recreates the file with the new schema.
6. Double-click the new `LeetCode.base` — Obsidian opens it as a Bases view (not a YAML text file) with a populated table of all notes carrying frontmatter `lc-id`, sorted by `lc-id` DESC.

**Resume signal:** reply with `approved` (GAP-6 closed) or `issue: {description}` (re-run Task 1 or Task 2 as needed).

## Unexpected Obsidian 1.10 schema quirks (candidate 02-RESEARCH.md updates)

Promote these from assumption A1 (MEDIUM confidence) to verified behaviour:

- **`filters:` are per-view, not top-level.** A top-level `filters:` block adjacent to `views:` is silently ignored in 1.10 — this is the single cause of the empty-rendering v0.1.0 ship. Update RESEARCH assumption A1 accordingly.
- **Presence probe grammar is `!note["lc-id"].isEmpty()`, not `lc-id != null`.** The latter does not match any row in Obsidian 1.10's Bases expression grammar (the grammar uses explicit `note[…]` indexing plus `.isEmpty()` / `.contains()` method calls, not bare-property with SQL-style NULL). Update RESEARCH evaluator table.
- **`file.name` is conventionally the first column.** Obsidian's UI auto-prepends it when constructing a Base via the New base command; keeping it matches idiomatic user expectations for table views.
- **`file.ext == "md"` is redundant on `.base` files.** Bases only enumerate markdown notes by default; the extension filter was dead weight in the v0.1.0 schema.

## Self-Check: PASSED

Claimed files verified to exist on disk:
- `src/main.ts` — modified (has `instanceof TFile` narrowing, `runLegacyBaseCheck` export, Notice copy at exact string)
- `src/notes/BaseFile.ts` — modified (has `isLegacyLeetcodeBaseV010` export, new YAML body)
- `src/settings/SettingsStore.ts` — modified (has `legacyBaseNoticeShown` flag plumbing)
- `tests/base-file-detect-stale.test.ts` — created (14 tests, all passing)
- `tests/base-file-ship.test.ts` — modified (new-schema assertions)
- `tests/base-file-preserve.test.ts` — modified (regression-checked)

Claimed commits verified in `git log`:
- `b92c8cb feat(02-08): fix LeetCode.base schema + add v0.1.0 legacy detector (GAP-6)`
- `c9d5ba3 feat(02-08): wire one-time legacy Bases Notice in onload`
