---
slug: run-modal-output-first-line-only
status: resolved
trigger: "User reports: the output in the Run modal can only display the first line — multi-line stdout/output from LeetCode `interpret_solution` (Run code) is truncated or only the first line is rendered to the modal."
created: 2026-06-05
updated: 2026-06-05
related_milestone: v1.3
---

## Symptoms

**Expected behavior:**
When the user runs code via the LeetCode "Run" action (Cmd-Enter / Run button) and the solution prints multiple lines of stdout, OR LeetCode returns a multi-line `code_output` / expected output / wrong-answer diff, the Run modal should show ALL lines of output, preserving newlines.

**Actual behavior:**
Only the first line of multi-line output is displayed in the Run modal. Subsequent lines are missing/truncated.

**Error messages:**
None — silently truncated.

**Timeline:**
Introduced 2026-05-19 in commit `0589f76` ("fix(12): UAT round 3 — stdout in run modal, H1 gap removal, title lock extension"). The Stdout section was added by reusing `splitOutput()` — a per-case slicer designed for `code_answer` (one element per case). LC's `code_output` array is shaped differently (one element per *line* of combined stdout), so the slicer truncated to one line.

**Reproduction:**
1. Open any LeetCode problem note that prints multiple lines (e.g., a problem where the solution does `for x in arr: print(x)` over an input with >1 element).
2. Click Run / Cmd-Enter from the widget.
3. Wait for LeetCode judge to return.
4. Observe Run modal: only first line of `code_output` is rendered.

## Hypotheses

1. **H1 (CONFIRMED)** — The renderer routes `res.code_output` through `splitOutput(arr, arity)` which treats the array as per-case strings. LC's actual wire format is per-line (each array element = one line of stdout), causing line-2..N to be stranded.
2. H2 (rejected) — `<pre>` strips newlines via CSS. Rejected: `<pre>` preserves whitespace by default, and the `setText`/`textContent` path does not strip `\n`.
3. H3 (rejected) — `setText(stdout)` only writes first line. Rejected: `textContent =` writes the whole string verbatim regardless of embedded `\n`.
4. H4 (rejected) — JSON parser drops fields. Rejected: `requestUrl` returns the raw JSON unchanged; `code_output` arrives intact.

## Current Focus

hypothesis: "H1 confirmed — `splitOutput(res.code_output, arity)` misinterprets LC's per-line array as per-case slots, dropping lines 2..N."
test: "Render the renderer with a fixture where `code_output: ['line one','line two','line three']` and arity=1 (single-case run)."
expecting: "All three lines visible in the rendered DOM."
next_action: "Resolved — fix shipped at src/solve/verdictModalRenderer.ts:283-296."
reasoning_checkpoint: "passed"
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-06-05T23:00Z — Read `src/solve/verdictModalRenderer.ts:283-292`. Stdout section calls `splitOutput(res.code_output, arity)` and renders only `stdoutChunks[activeIdx]`.
- timestamp: 2026-06-05T23:02Z — Read `src/solve/runArity.ts:273-297` (`splitOutput`). Logic: when input is a `string[]`, returns `Array.from({length: arity}, (_, i) => source[i] ?? '')`. For a single-case Run (`arity=1`) with `code_output=["a","b","c"]`, this returns `["a"]`. Lines 2 and 3 are silently dropped. For a 3-case Run with `code_output=["debug1","debug2","debug3","debug4"]`, it returns `["debug1","debug2","debug3"]` and only the active tab's first element shows.
- timestamp: 2026-06-05T23:04Z — Read `node_modules/@leetnotion/leetcode-api/lib/index.js:1886-1895` (`formatTestOutput`). The library treats `code_output` as `string | string[]` and joins arrays with `'\n'` for stdout: `output = output.join("\n")`. This confirms LC's wire format: array elements are LINES of combined stdout, not per-case.
- timestamp: 2026-06-05T23:05Z — Read live LC fixture `tests/solve/fixtures/run-multi-case.json` (LIVE-CAPTURED 2026-05-13). `code_output: []` (empty when no print). Per-case stdout LC actually offers is `std_output_list: ["", "", "", ""]` (one element per case, observed empty in the captured run). Confirms `code_output` is run-scoped, not case-scoped.
- timestamp: 2026-06-05T23:06Z — `git show 0589f76 -- src/solve/verdictModalRenderer.ts` confirms the bug was introduced when copy-pasting `splitOutput(res.code_answer, arity)` (correct for code_answer because LC IS per-case for that field) onto `res.code_output` (incorrect — different LC wire shape).

## Eliminated

- H2 — `<pre>` strips newlines. Eliminated by reading the renderer and observing all sibling sections (Output, Expected) are rendered via the same `<pre>` + `setText` path and DO show newlines on the working WA fixture path.
- H3 — `setText` only writes first line. Eliminated by inspection of `setText(el, text) { el.textContent = text; }` — assigns the whole string.
- H4 — JSON drops fields. Eliminated by inspection of `leetcodeRest.checkSubmission` (returns `res.json` unchanged) and the `RunCheckResponse` type (`code_output?: string | string[]`, no transformation).

## Resolution

root_cause: |
  The Run-modal Stdout section was wired to `splitOutput(res.code_output, arity)` in commit
  0589f76 (2026-05-19). `splitOutput` treats array elements as per-case strings (correct for
  `code_answer`), but LC's `code_output` wire format is the opposite: when LC returns it as
  `string[]`, each element is one LINE of the user's combined stdout across all cases (verified
  against the upstream `@leetnotion/leetcode-api` `formatTestOutput` helper at
  `node_modules/@leetnotion/leetcode-api/lib/index.js:1887`, which joins the array with '\n').
  Result: a single-case Run printing 3 lines lost lines 2-3; a multi-case Run with 4 stdout lines
  showed only line 1 on the active tab and stranded the rest under unrelated case slots.

fix: |
  Replaced `splitOutput(res.code_output, arity) → stdoutChunks[activeIdx]` with
  `asString(res.code_output)` — the same coercion `submissionOrchestrator.ts:411` already uses
  for `LastVerdict.actualOutput` (Submit path). `asString` joins array forms on '\n' and passes
  string forms through, producing a single combined stdout string that the existing
  `<pre>`-based `renderValueSection` paints with all newlines preserved.

  File: `src/solve/verdictModalRenderer.ts:283-302` (was lines 283-293; +9 lines for the BRAT
  comment block citing the leetnotion source).

verification: |
  - `npm run lint` → 0 errors, 9 pre-existing warnings (all in `src/main.ts`, unrelated).
  - `npm run build` → tsc + esbuild both clean (exit 0).
  - `npm test -- tests/solve/` → 319 tests pass, 1 skipped, 0 fail (full solve suite).
  - `npm test -- tests/solve/verdictModalRenderer.test.ts` → 31 tests pass (28 prior + 3 new
    BRAT #2 regression tests added in this commit).
  - `npm test` (full repo) → 5 timeout flakes in `tests/preview/router.test.ts` and
    `tests/ai/reset-disclosures-command.test.ts` — verified pre-existing by running each in
    isolation on a stash of pre-fix tree (both pass at ~1.7s each; flake is suite-pressure
    timeout, not caused by this fix).
  - Plugin deployed to `~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/`
    (`main.js` + `manifest.json` + `styles.css` copied 2026-06-05T19:03).

  New regression tests pin the contract:
    1. Single-case run with `code_output=['line one','line two','line three']` → all three
       lines appear in DOM.
    2. Multi-case run with `code_output=['debug1','debug2','debug3','debug4']` → all four
       lines appear in DOM.
    3. String form `code_output='first\nsecond\nthird'` → all three lines appear in same `<pre>`.

files_changed:
  - src/solve/verdictModalRenderer.ts
  - tests/solve/verdictModalRenderer.test.ts
