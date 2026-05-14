---
phase: 05-polish-ship
plan: 06
subsystem: release-prep
status: complete
tags: [readme, license, prerelease-gate, versions, complete]
dependency_graph:
  requires:
    - 05-01 (Phase 5 wave-0 test stubs + fake fixtures)
    - 05-02 (Knowledge Graph settings section)
    - 05-03 (error-handling Notices + 429 retry + 10s timeout)
    - 05-04 (RunModal + ephemeralTabStore + run command)
    - 05-05 (code-block action buttons + SubmissionDetailModal upgrade)
  provides:
    - scripts/prerelease-check.sh (POLISH-03 enforcement tool — 12 gates)
    - README.md community-store submission-ready (POLISH-04)
    - versions.json bumped 1.5.0 → 1.10.0 (unblocks Plan 07)
  affects:
    - next: Plan 05-07 (version bump to 0.1.0 + GitHub release + community-plugin PR)
    - next: capture 4 README screenshots (docs/*.png) — pending user action at checkpoint
tech-stack:
  added:
    - bash/jq-python3 for prerelease-check.sh (no new runtime deps)
  patterns:
    - anchored-grep (\bfetch\(, \beval\(, innerHTML\s*=) per Pitfall 12
    - set +e / set -e wrapping around greps so pipefail does not surface grep-no-match as gate failure
    - jq-with-python3-fallback for manifest/package/versions JSON reads
    - gate 10 scoped to `eslint src/` (shipped code only; tests/ do not ship)
key-files:
  created:
    - scripts/prerelease-check.sh (12-gate mechanical validator, executable)
  modified:
    - README.md (full rewrite per D-25, 10 sections, verbatim network disclosure, 4 image links)
    - versions.json ({ "0.1.0": "1.10.0" })
  pending-from-user:
    - docs/problem-browser.png (Task 3 checkpoint)
    - docs/problem-note.png (Task 3 checkpoint)
    - docs/verdict-accepted.png (Task 3 checkpoint)
    - docs/graph-view.png (Task 3 checkpoint)
decisions:
  - "gate 2 (fetch) uses tight `\\bfetch\\(` (no intervening whitespace) so prose comments like `the picker's fetch (D-03)` do not false-positive — real TS call sites never have a space between the identifier and `(`"
  - "gate 10 scoped to `eslint src/` (not `eslint .`) — the prerelease gate's intent is 'shipped code is lint-clean'; tests/ are not bundled into main.js, so linting them is a separate developer-workflow concern. Plan's own must_haves wording 'all 12 gates pass on clean src/' anchors this interpretation."
  - "versions.json fixed from 1.5.0 to 1.10.0 in this plan (not deferred to Plan 07) so Plan 07 can be a cosmetic manifest version bump + CI-verified prerelease re-run"
  - "README.md disclosure line uses VERBATIM copy from D-25: 'This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.' (no rewording, terminal period, single paragraph)"
metrics:
  duration: ~15 minutes (scriptable portion; checkpoint portion awaits user)
  tasks_committed: 2 of 3
  files_committed: 3 (scripts/prerelease-check.sh, versions.json, README.md)
  completed: 2026-05-10 (partial — Task 3 checkpoint outstanding)
---

# Phase 5 Plan 6: Polish & Ship — Community-Store Submission Prep Summary

**One-liner:** Shipped the POLISH-03 prerelease-check.sh (12-gate mechanical validator), POLISH-04 README.md rewrite (10 sections per D-25 with verbatim network disclosure + 4 image links), and versions.json bump (1.5.0 → 1.10.0); POLISH-05 LICENSE already present from phase 1 and unchanged. Stopped at Task 3 human checkpoint because Claude cannot render Obsidian UI pixels — user must capture 4 PNG screenshots into `docs/`.

## Status: CHECKPOINT

Plan is **partially complete**. Scriptable work (Tasks 1 + 2) is committed; Task 3 (capture 4 README screenshots) requires user action at a `checkpoint:human-verify` gate.

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Prerelease script + versions.json fix | `610e1a1` | `scripts/prerelease-check.sh` (new, executable), `versions.json` |
| 2 | README.md rewrite per D-25 | `9fca83a` | `README.md` |

### Task 1 — `scripts/prerelease-check.sh` + `versions.json`

**Script shape:** 12-gate mechanical validator per CONTEXT §D-27 + RESEARCH §Example 3.

| Gate | Rule | Current result |
|------|------|---------------|
| 1 | no `innerHTML` assignment in src/ | **OK** |
| 2 | no `fetch(` in src/ | **OK** |
| 3 | no `eval(` or `new Function(` in src/ | **OK** |
| 4 | no telemetry identifiers in src/ | **OK** |
| 5 | no `vault.modify(` in `src/graph/` or `src/main.ts` | **OK** |
| 6 | `manifest.json` valid (id sans 'obsidian'; semver; description ≤250c + terminal period; isDesktopOnly:true) | **OK** — id=`leetcode`, version=`0.1.0`, desc=69c ending `.`, desktopOnly=`true` |
| 7 | version consistency (manifest == package == versions.json latest) | **OK** — `0.1.0` across all three (after versions.json fix) |
| 8 | LICENSE present + non-empty | **OK** |
| 9 | README.md has `leetcode.com` mention + ≥4 image links | **OK** — disclosure present + 4 image links |
| 10 | `eslint src/` exit 0 | **FAIL** (see Deferred Issues) |
| 11 | `npm test -- --run` exit 0 | not reached; validated separately green |
| 12 | `main.js` ≤ 200 kB | not reached; validated separately (bundle = 148 kB / 144 kB of 200 kB budget) |

**Anchored grep patterns** (Pitfall 12): tight `\bfetch\(` / `\beval\(` / `innerHTML\s*=` avoid false positives on prose comments while catching every real call site. `set +e/-e` wraps each grep so `-eo pipefail` does not mistake grep-no-match (exit 1) for gate failure.

**Negative smoke test (Task 1 step 5, plan requirement):** Injected `src/test-regression.ts` with `(x as any).innerHTML = 'probe'`. Gate 1 fired with `PRERELEASE FAIL: innerHTML assignment found in src/` and the offending line/column. Deleted the probe; script returned to OK on gate 1. Confirms the anchored pattern catches assignments in real code, not just in quoted docs.

**versions.json fix:** `{ "0.1.0": "1.5.0" }` → `{ "0.1.0": "1.10.0" }`. Phase 2 locked `minAppVersion: 1.10.0`; this repairs the drift. Enables Plan 07 to be a cosmetic version bump only.

### Task 2 — `README.md` rewrite

**D-25 10 sections in locked order:** (1) What it is, (2) Features, (3) Install, (4) Usage walkthrough, (5) Screenshots (inline in walkthrough), (6) Network usage, (7) Configuration, (8) Troubleshooting, (9) License, (10) Contributing.

**Verbatim network disclosure (D-25, D-27 gate 9):** `This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.` Single sentence, terminal period, no rewording.

**4 image links per D-24:**
- `![Problem browser](docs/problem-browser.png)` — step 3 of walkthrough
- `![Problem note](docs/problem-note.png)` — step 4 (must show Run + Submit buttons below code block per D-11)
- `![Verdict — Accepted](docs/verdict-accepted.png)` — step 6 (AC modal with runtime/memory/percentile)
- `![Graph view](docs/graph-view.png)` — step 7 (technique edges)

**Troubleshooting section** maps all 4 locked Notice copies (CF-19 lock): session-expired (D-21), 429 rate-limit (D-18), offline (D-19), slow response (D-20), plus a note about the Reading-mode-only button rendering (D-11).

### LICENSE (POLISH-05) — unchanged

LICENSE already present at repo root from commit `3c48551` (phase 1 scaffold). Contains MIT text + `Copyright (c) 2026 moxu` per D-26. Verified non-empty (1.1 kB); passes gate 8 as-is. No plan-06 commit needed.

## CHECKPOINT — Action Required

**Type:** `human-verify` (truly manual — Claude cannot render Obsidian UI)
**Gate:** blocking
**Plan:** 05-06 Task 3

**What the user needs to do:**

Capture 4 light-mode PNG screenshots from a live Obsidian desktop session with the plugin enabled + an Accepted submission on a multi-topic problem, and save them under `docs/`:

| Path | Content |
|------|---------|
| `docs/problem-browser.png` | LC problem list in the plugin's side pane; search bar + ≥3 rows visible; ribbon icon or filter badge visible to attribute the pane |
| `docs/problem-note.png` | Problem note in **Reading mode** showing frontmatter + rendered `## Problem` + fenced `## Code` block **with Run + Submit buttons visible below (D-11)** |
| `docs/verdict-accepted.png` | Verdict modal in green AC state with runtime + memory + percentile lines |
| `docs/graph-view.png` | Obsidian Graph view with the problem note connected to 2–3 technique stub nodes via edges; ~100% zoom |

**Per-file constraints (Task 3 spec):** PNG format, ≤500 kB each, `docs/` total ≤2 MB.

**Verification after upload:**
1. `ls -la docs/*.png` — expect 4 non-empty files
2. `bash scripts/prerelease-check.sh` — gates 1-9 + 11 + 12 should already pass; gate 10 will still show the pre-existing lint debt (see Deferred Issues below)
3. Push the branch, view README on GitHub — all 4 images should render inline

## Deferred Issues (Known Gate Failure)

### Gate 10 (`eslint src/`) fails — 53 pre-existing lint errors from plans 05-01..05-05

**Status:** BLOCKER for `bash scripts/prerelease-check.sh` exit 0 end-to-end, but out-of-scope for plan 05-06 per deviation Rule 3 scope boundary.

**What is happening:** The prerelease script (Task 1) correctly implements gate 10 as `eslint src/`. Running it reveals 53 lint errors spread across files owned by earlier Phase 5 plans:

- `src/main.ts` — several `obsidianmd/prefer-active-doc` + `obsidianmd/prefer-active-window-timers` violations (Plan 05-04 run-command wiring, Plan 05-05 postprocessor)
- `src/notes/NoteWriter.ts` — 9 `obsidianmd/no-tfile-tfolder-cast` violations (predates Phase 5 — Phase 2 code)
- `src/settings/SettingsTab.ts` — 1 `obsidianmd/ui/sentence-case` (`Knowledge Graph` → expected `Knowledge graph`) from Plan 05-02 D-14
- `src/solve/VerdictModal.ts` — 1 sentence-case (`Polling LeetCode for verdict…`) + 4 `@typescript-eslint/no-unnecessary-type-assertion` + 3 `obsidianmd/prefer-active-doc` (Phase 3 code + Plan 05-03 additions)
- `src/solve/verdictModalRenderer.ts` — 2 `obsidianmd/prefer-active-doc` (Phase 3 code)
- Plus a handful of warnings (unused eslint-disable directives, unused vars) that also count against the gate

**Why deferred, not fixed:** Per executor rule `SCOPE BOUNDARY`: "Only auto-fix issues DIRECTLY caused by the current task's changes." Plan 05-06's changes are confined to `README.md`, `versions.json`, and `scripts/prerelease-check.sh` — it does not touch `src/`. Fixing 53 lint errors across src/ means modifying files owned by 5 other plans (05-01..05-05) already merged on main, which violates atomic plan ownership.

**Recommended cleanup path before Plan 07:**
1. Run `npm run lint -- --fix` (auto-fixes ~33 of 53 errors)
2. Manual pass for remaining: TFile cast → instanceof narrow; sentence-case UI strings; prefer-active-doc substitutions
3. A dedicated "Phase 5 cleanup" micro-plan between 05-06 and 05-07, OR absorb into 05-07's pre-release hardening
4. Once `eslint src/` is clean, `bash scripts/prerelease-check.sh` will exit 0 end-to-end (gates 1-12)

**Workaround to validate gates independently in the meantime:**
- `bash scripts/prerelease-check.sh` cleanly reports gates 1-9 OK and stops at gate 10 with the exact failing-file list
- `npm test -- --run` passes independently (verified during plan 05-06 execution)
- `wc -c main.js` confirms bundle = 147809 B = 144 kB, within 200 kB ceiling (and under 100 kB soft-warn border)

### Gate 10 scope decision recorded

The script scopes gate 10 to `eslint src/` rather than `eslint .`. Rationale: the gate's intent per D-27 is "shipped code is lint-clean." `tests/` are not bundled into `main.js` and are not submitted to the Obsidian community store. The plan's own `must_haves` wording — "all 12 gates pass on **clean src/**" — anchors this interpretation. A separate developer workflow (CI on PR) can enforce `tests/` lint without coupling it to the release-blocking gate.

## Threat Model Check

No new threat surface introduced. The script is shell + grep + jq/python3, runs locally, reads files only, no network. README is pure markdown. versions.json is a 1-line JSON fix. All three artifacts are within Plan 05-06's threat model T-05-06-01/02/03.

## Self-Check: PASSED

- [x] `scripts/prerelease-check.sh` exists and is executable (`ls -la` shows `rwxr-xr-x`)
- [x] `scripts/prerelease-check.sh` commit `610e1a1` present in `git log`
- [x] `versions.json` content = `{ "0.1.0": "1.10.0" }` (committed in `610e1a1`)
- [x] `README.md` commit `9fca83a` present in `git log`
- [x] `README.md` contains verbatim disclosure sentence (grep match count = 1)
- [x] `README.md` contains 4 `![...](docs/*.png)` image links (grep count = 4)
- [x] `README.md` contains 8 locked D-25 section headings (grep count = 8: Features, Install, Usage walkthrough, Network usage, Configuration, Troubleshooting, License, Contributing)
- [x] `LICENSE` present at repo root with MIT text + `Copyright (c) 2026 moxu` (from phase 1 commit `3c48551`)
- [x] Negative smoke test for gate 1 (innerHTML) confirmed gate fires then recovers on probe deletion
- [x] `main.js` (built via `node esbuild.config.mjs production`) = 147809 bytes, within the 200 kB ceiling gate 12 enforces

## Next Steps

1. **User:** capture 4 screenshots at the checkpoint and drop them into `docs/`.
2. **Before Plan 07 release:** address the 53 src/ lint errors (auto-fix + manual pass) so `bash scripts/prerelease-check.sh` exits 0 across all 12 gates.
3. **Plan 07:** cosmetic manifest version bump (already 0.1.0) + GitHub release tagging + PR to `obsidianmd/obsidian-releases`.

---

## Completion note (2026-05-10 22:50)

Checkpoint resolved. Three resolutions:

1. **Task 3 (4 screenshots)** — shipped in commit `4c8994c` (docs(05-06) add 4 README screenshots). User captured in ~/Documents/Leetcode vault, light theme, downscaled to 1600px wide via `sips`, each under 330 kB (total 1.1 MB, well within 2 MB budget).

2. **Lint gate 10 (53 pre-existing errors)** — resolved in commit `07610b2` (fix(05-06) clean 53 eslint errors). Auto-fix handled 33; manual fixes covered TFile guards (via documented eslint-disable for test compatibility), inline styles → `setCssStyles`, `globalThis.navigator` → `activeWindow.navigator`, `setTimeout` global preserved with documented rationale for fake-timers compat.

3. **Reading-Mode button fix (05-05 regression caught during 05-06 live smoke)** — shipped separately in commit `c7c360c` (fix(05-05) gate reading-mode buttons via ctx.getSectionInfo on ## Code heading). Reading-Mode click dispatch verified live.

Prerelease-check.sh gates 1–12 all green on current main. Bundle 144 kB.

## Deferred to Phase 5.1

Two items captured in `05-UAT.md` gap section:
- **G1 (ship-blocker)** Edit-Mode inline Run/Submit buttons anchored below `## Code` fenced block. Phase 5.1 must ship via `registerEditorExtension` correctly integrated with Obsidian's Live Preview widget layer. Two session attempts (CM6 ViewPlugin with `Decoration.widget({block:true})`, floating toolbar) both rejected by user during live smoke. 05-07 release held until 5.1 lands.
- **G2 (medium-polish)** Past Submissions picker modal verdict-pill labels missing for non-CE rows (WA / TLE / MLE / RE all render as blank red pills). Pre-existing Phase 4 bug surfaced during 05-06 live smoke.
