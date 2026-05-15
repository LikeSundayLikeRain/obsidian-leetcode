---
phase: 06-foundations-preview-mode
plan: 04
subsystem: docs
tags:
  - documentation
  - readme
  - bundle-size
  - FOUND-02

# Dependency graph
requires:
  - 06-01  # CI workflow + scripts/check-bundle-size.mjs (cited verbatim by README)
  - 06-02  # 'Preview > Click behavior' settings dropdown (referenced by README copy)
  - 06-03  # Right-click 'Preview problem' + 'Open in preview' palette command (referenced by README copy)
provides:
  - "README.md '## Previewing problems' section — user-facing docs for the v1.1 click-default change"
  - "README.md '## Development > ### Bundle size' subsection — contributor-facing docs for the 500 KB hard / 400 KB soft thresholds + verified baseline"
  - "FOUND-02 baseline doc requirement — closes the documentation half of FOUND-02 (the runtime gate landed in 06-01)"
affects:
  - "README.md (only file modified)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promote nested '### Development' under '## Contributing' to top-level '## Development' to host contributor-facing subsections (Bundle size, future build/test pages)"
    - "Verbatim-copy of locked UI strings from 06-UI-SPEC into README to keep the docs and the UI in lockstep (Preview first / Open note directly / Preview problem / Open in preview)"
    - "Cite the actual byte count + KB rounding in README ('~165.0 KB (168,953 bytes)') rather than a vague '~163 KB' — gives contributors a precise drift signal"

key-files:
  created: []
  modified:
    - "README.md (3 deltas: Features bullet for preview affordance; new '## Previewing problems' section between Usage walkthrough and Network usage; promoted '## Development' top-level section + new '### Bundle size' subsection)"

key-decisions:
  - "Promote '### Development' (was under '## Contributing') to top-level '## Development' so '### Bundle size' has a natural parent. Plan instructed: 'If README has no '## Development' section, create one and place '### Bundle size' under it.' — there was only a nested '### Development', so promotion is the cleanest fit."
  - "Cite the verified byte count from Task 1's `npm run build && npm run check:bundle-size` (168,953 bytes / 165.0 KB) instead of CONTEXT.md's planning-time estimate (~163 KB). The 6 KB drift is fully accounted for by Plan 06-03's preview view + CSS chrome additions; well within the 50 KB investigation threshold the plan called out."
  - "Use verbatim-copy for the four locked strings (06-UI-SPEC §Copywriting Contract): 'Preview problem' (right-click menu), 'Open in preview' (palette command), 'Preview first' / 'Open note directly' (settings dropdown options). Tests in 06-02 / 06-03 already pin these in source; README staying verbatim keeps the docs and the UI in sync without a separate test gate."
  - "Add a Features bullet for preview to give the v1.1 behavior change top-of-page visibility, in addition to the dedicated section. Existing Features bullets describe the v1.0 capabilities; preview gets one bullet to signal that single-click is now non-destructive."
  - "Leave '## Network usage', '## Configuration', '## Troubleshooting', '## License', '## Contributing' UNCHANGED — Phase 06 introduces zero new endpoints (preview reuses the existing v1.0 LeetCodeClient HTTP path) and no new auth surface. CONTEXT.md decision E confirms."

patterns-established:
  - "Top-level '## Development' section now exists in README.md as the home for contributor-facing concerns. Future plans that add contributor docs (e.g., release process, lint/test/typecheck commands) should add subsections under '## Development' rather than creating new top-level sections."
  - "Bundle-size citation pattern: state the actual byte count (with thousand-separator commas) AND the KB rounded to one decimal, with the script path and the CI workflow path inline. Future bundle baseline updates should follow the same shape so contributors can grep for either form."

requirements-completed:
  - FOUND-02

# Metrics
duration: ~5 min
completed: 2026-05-15
---

# Phase 06 Plan 04: README docs (v1.1 click-default + bundle-size policy) Summary

**Updated `README.md` to document the v1.1 single-click-previews change, the right-click `Preview problem` + `Open in preview` palette affordances, and a contributor-facing `### Bundle size` subsection citing the verified 165.0 KB / 168,953 byte baseline against the 500 KB hard / 400 KB soft thresholds enforced by `scripts/check-bundle-size.mjs` as the last step of `.github/workflows/ci.yml`.**

Closes FOUND-02 (README baseline doc — the runtime gate itself landed in 06-01). Phase 06 now ends in a documentation state that matches the shipped behavior.

## Performance

- **Duration:** ~5 min (full pipeline: read plan + CONTEXT, run build + size check, edit README, run final phase gate, write summary)
- **Tasks:** 2 / 2 (Task 1 captured the baseline number; Task 2 wrote it into README)
- **Files modified:** 1 (README.md)
- **Files created:** 1 (this SUMMARY.md)

## Task Commits

Task 1 captured the baseline byte count but produced no source changes (per plan: "no source changes — this task only captures a number"). Both behavior changes are bundled in Task 2's single README commit.

1. **Task 1: Capture verified bundle baseline** — no commit (number-capture only). Verified output: `main.js: 168953 bytes (165.0 KB) → BUNDLE CHECK OK`. Exit 0. Used in Task 2's README copy.
2. **Task 2: Update README.md** — `32e7f10` (`docs(06-04): document v1.1 click-default change + bundle-size policy in README`)

## README sections touched

- **`## Features` (line 8-17 area):** added one bullet — `Preview any problem in a read-only tab before committing — single-click previews by default; shift-click still opens the note directly`. (1 insertion)
- **`## Previewing problems` (NEW, lines 54-62 area):** placed after the `## Usage walkthrough` numbered list and before `## Network usage`. Documents:
  - Single-click previews / shift-click opens (default behavior).
  - Tab is read-only; no `.md` file created until `Start Problem` is clicked or shift-click is used.
  - Right-click `Preview problem` (verbatim from 06-UI-SPEC).
  - `Open in preview` palette command (verbatim from 06-UI-SPEC).
  - `Preview › Click behavior` settings dropdown with `Preview first` / `Open note directly` options (verbatim).
  - One-tab-at-a-time reuse + post-Start detach behavior.
- **`## Development` (PROMOTED, was `### Development` under `## Contributing`):** now top-level so `### Bundle size` has a natural parent. The dev-quickstart codeblock + local-testing instructions are unchanged.
- **`### Bundle size` (NEW, under `## Development`):** states 500 KB hard ceiling, 400 KB soft warning, current baseline `~165.0 KB (168,953 bytes)`, the script path (`scripts/check-bundle-size.mjs`), the CI workflow path (`.github/workflows/ci.yml`), and the local re-run command.

## Captured bundle baseline

```
$ npm run build && npm run check:bundle-size
> obsidian-leetcode@1.0.1 check:bundle-size
> node scripts/check-bundle-size.mjs
main.js: 168953 bytes (165.0 KB)
BUNDLE CHECK OK
$ echo $?
0
```

- **Bytes:** 168,953
- **KB (rounded):** 165.0
- **Hard ceiling:** 500,000 bytes (well clear, ~33% utilization)
- **Soft warning:** 400,000 bytes (well clear, ~42% utilization)
- **Drift since CONTEXT.md planning-time estimate (~163 KB / 162,229 bytes):** +1.7 KB / +6,724 bytes — fully accounted for by Plan 06-03's preview view + CSS chrome additions. Well within the 50 KB investigation threshold the plan called out.

## Phase 06 final gate (all four plans' artifacts at HEAD)

```
$ npm run lint && npm test && npm run build && npm run check:bundle-size
```

| Step | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | 0 errors / 0 warnings |
| `npm test` | 0 | **731 passed / 3 skipped** across 106 test files (22.5 s) |
| `npm run build` | 0 | tsc clean + production esbuild |
| `npm run check:bundle-size` | 0 | `main.js: 168953 bytes (165.0 KB) → BUNDLE CHECK OK` |

All four exit 0 simultaneously. Phase 06 is shippable.

## Acceptance criteria — verified

| Criterion | Result |
|---|---|
| `grep -n 'Bundle size' README.md` | 1 match (line 134) |
| `grep -n '500' README.md` | 1 match (line 138 — hard ceiling) |
| `grep -n '400' README.md` | 1 match (line 139 — soft warning) |
| `grep -n 'Preview problem' README.md` | 1 match (line 58 — right-click menu copy verbatim) |
| `grep -n 'Open in preview' README.md` | 1 match (line 59 — palette command copy verbatim) |
| `grep -nE 'Preview first\|Open note directly' README.md` | 1 match (line 60 — both labels in one line, verbatim) |
| `grep -ni 'shift-click' README.md` | 2 matches (line 10 Features bullet, line 56 section paragraph) |
| `grep -nE 'check:bundle-size\|check-bundle-size' README.md` | 2 matches (lines 136, 145 — script citation + local-run command) |
| Captured byte count appears in Bundle size subsection | line 140: `~165.0 KB (168,953 bytes)` |
| `git diff manifest.json` | empty — UNCHANGED |
| `git diff package.json \| grep '"version"'` | empty — UNCHANGED |
| `ls bundle-baseline.txt 2>/dev/null` | empty — file NOT committed |
| `git diff versions.json` | empty — UNCHANGED |
| `grep -ni 'onboarding modal' README.md` | empty — phrase does NOT appear |
| `## Network usage` section content | UNCHANGED (still lists only `leetcode.com`) |

## Out-of-scope files — confirmed untouched

`git diff main..HEAD --name-only` for this plan's commit shows ONLY `README.md`:

```
README.md
```

No source files, no manifest, no package.json, no versions.json, no `.github/`, no test files modified by Task 2.

## Deviations from Plan

None. Plan executed exactly as written.

The plan's Task 1 specifically said "no source changes — this task only captures a number", so the absence of a Task 1 commit is by design, not a deviation. Task 2 incorporated the captured baseline (168,953 bytes / 165.0 KB) into the README copy verbatim.

## Issues Encountered

- **Worktree branch lacked `.planning/phases/06-foundations-preview-mode/`** — the worktree branch `worktree-agent-af4df58843db54bf5` was forked from `f79f993` (release v1.0.1), which predates the phase-06 plan-creation commits on `main`. Resolved at agent startup by `git show main:.planning/phases/06-foundations-preview-mode/{06-04-PLAN.md,06-CONTEXT.md} > local copies` so the executor could read the plan documents in-tree. This SUMMARY.md is the only file under `.planning/` that this commit creates; the rehydrated PLAN + CONTEXT files remain untracked in the worktree and are NOT part of any commit. On merge back to the integration branch, git's three-way merge will combine the planning artifacts (from `main`) with the SUMMARY (from this branch) — exactly the same pattern that Plans 06-01 and 06-03 followed.

## User Setup Required

None — Phase 06 surfaces no new external services or auth flows.

## Phase 06 sign-off note (for STATE.md update by orchestrator)

Phase 06 is **shippable** with the following artifacts at HEAD:

- **Foundations:** `eslint-plugin-obsidianmd@^0.3.0` baseline green; portable Node bundle-size gate (`scripts/check-bundle-size.mjs`); first GitHub Actions workflow (`.github/workflows/ci.yml`) running `lint → test → build → check:bundle-size` on push-to-main + every PR. (Plan 06-01)
- **Preview routing seam:** `routeProblemClick(slug, status, intent, opts?)` on `LeetCodePlugin`; `Preview › Click behavior` settings dropdown (`preview` | `open` with safe-default shape-guard); `decideClickIntent(e)` exported pure helper; shift-aware row click handler. (Plan 06-02)
- **Preview ItemView:** `ProblemPreviewView` with sticky header + body via `MarkdownRenderer`; `openOrReusePreview(plugin, slug)` tab-reuse helper; `detectExistingNote(app, settings, slug)` pure helper; cache-then-fetch with mandatory `setProblemDetail` persist; right-click `Preview problem` context menu; `Open in preview` palette command (clean ID per FOUND-03); CSS chrome under `.leetcode-preview*` reusing Obsidian variables; regression-grep test gate locking the no-vault-create / no-cm-dispatch / Component-arg / tab-reuse-primitive contracts. (Plan 06-03)
- **Documentation:** README documents the v1.1 click-default change, the shift-click escape, the right-click `Preview problem` affordance, the `Open in preview` palette command, the `Preview › Click behavior` settings toggle, and a contributor-facing `### Bundle size` subsection with the verified 165.0 KB / 168,953 byte baseline. (Plan 06-04 — this plan)
- **Requirements closed:** FOUND-01, FOUND-02, FOUND-03, PREVIEW-01, PREVIEW-02, PREVIEW-03, PREVIEW-04, PREVIEW-05 — all 8 of Phase 06's targeted requirements.
- **Phase final gate (lint + test + build + check:bundle-size):** all four exit 0 at HEAD; **731 tests pass / 3 skipped**; bundle 168,953 bytes (~33% of the 500 KB hard ceiling, ~42% of the 400 KB soft warning).

Bundle headroom for Phases 07+ (AI Coach, Contest, etc.): **~331 KB** under the soft warning, **~331 KB** under the hard ceiling. RESEARCH §11's planning-time prediction (~163 KB) confirmed; observed drift is +1.7 KB.

---

*Phase: 06-foundations-preview-mode*
*Plan: 04 (final plan of Phase 06)*
*Completed: 2026-05-15*

## Self-Check

**Files claimed modified — verified via git log:**
- `README.md` (commit `32e7f10`): FOUND

**Commit claimed — verified in git log:**
- `32e7f10`: FOUND (`docs(06-04): document v1.1 click-default change + bundle-size policy in README`)

**Phase 06 final gate at HEAD:**
- `npm run lint`: PASS (exit 0, 0 errors / 0 warnings)
- `npm test`: PASS (exit 0, 731 / 3 skipped across 106 files)
- `npm run build`: PASS (exit 0, tsc clean + production bundle)
- `npm run check:bundle-size`: PASS (exit 0, 168,953 bytes / 165.0 KB — well under both thresholds)

**README acceptance grep gates (all required strings present):**
- `Bundle size`: line 134
- `500 KB`: line 138
- `400 KB`: line 139
- `Preview problem`: line 58
- `Open in preview`: line 59
- `Preview first`: line 60
- `Open note directly`: line 60
- `shift-click` (case-insensitive): lines 10, 56
- `scripts/check-bundle-size.mjs` script citation: line 136
- `168,953 bytes` baseline: line 140
- `~165.0 KB` baseline: line 140

**Forbidden strings absent:**
- `onboarding modal`: NOT FOUND (decision A — locked rejection honored)
- `bundle-baseline.txt`: file does NOT exist (decision E — locked rejection honored)

**Network usage section unchanged:** confirmed — still lists only `leetcode.com`.

**Out-of-scope files untouched:** confirmed — `git diff` for this plan's commit shows only `README.md`.

## Self-Check: PASSED
