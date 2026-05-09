---
status: complete
phase: 03-run-submit
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md]
started: 2026-05-08T19:00:00Z
updated: 2026-05-08T19:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pre-flight — plugin loaded, logged in
expected: Plugin active in dev vault, logged in to leetcode.com, Phase-2-era note open. Ready to test.
result: pass

### 2. Retrofit on re-open — ## Code inserted between ## Problem and ## Notes
expected: On a Phase-2-era note (created BEFORE Phase 3), `## Code` section is now present BETWEEN `## Problem` and `## Notes`, with a fenced block tagged `python3` (or your default language) containing LC's canonical starter. `## Notes` content is preserved verbatim.
result: pass

### 3. Retrofit is idempotent
expected: Re-open the same note via the browser or file explorer. The body is unchanged — no duplicate `## Code`, no body churn.
result: pass

### 4. User edits to code survive re-open
expected: Type some custom code inside the `## Code` fenced block. Save. Close and re-open the note. Your edits are preserved verbatim — retrofit did not clobber them.
result: pass

### 5. Insert starter code command unconditionally replaces
expected: Run command "LeetCode: Insert starter code" from palette. The fenced block under `## Code` is replaced with a fresh starter in your default language. A Notice "Starter code inserted." appears briefly.
result: issue
reported: "mostly works, just 1 minor issue: when I click the problem to create a markdown, there's no empty line between heading (## Code, ## Problem) and the fenced block/description. When I run Insert starter code, it has an empty line. Prefer the blank-line form everywhere for consistency. Functionality works. Fine to defer to polish phase."
severity: cosmetic
defer_to: polish-phase

### 6. Run sample — pending modal with backoff indicator
expected: Open Two Sum note with a correct solution. Run "LeetCode: Run code (sample)". A verdict modal opens immediately in pending state with a spinner, the text "Polling LeetCode for verdict…", a "Backoff: 1s → 2s → 4s → 8s" indicator, and a Cancel button.
result: issue
reported: "Works. Functionality is correct. UX polish: don't need the backoff indicator (`Backoff: 1s → 2s → 4s → 8s`), and want to revise the pending text. Defer to Phase 5."
severity: cosmetic
defer_to: phase-5

### 7. Run sample — correct solution shows success
expected: Within ~10s, the modal transitions to a success view with a runtime and memory line (e.g., "Runtime: 48 ms", "Memory: 14.2 MB").
result: pass
notes: "Passed after fix — extractFirstFencedBlock was grabbing the first fence in the body, which matched the ```text example block inside ## Problem instead of the ## Code block. Fix: scope extraction to the ## Code section first, fall back to whole-body fence only when ## Code heading absent. Regression tests added."

### 8. Run sample — wrong solution shows wrong-answer
expected: Edit the solution to be wrong (e.g., return []). Re-run sample. Modal transitions to a WA-like verdict (for run, `correct_answer: false` — different from submit-WA but the modal handles it).
result: pass
notes: "WA path renders correctly. Flagged a happy-path layout issue (separate gap): when Run passes all samples, modal still shows the side-by-side Output/Expected diff panes with red/green borders — misleading since Output == Expected. Should collapse to a compact success view. Deferred to Phase 5."

### 9. Run sample — language switch (python3 → java) works
expected: Change the fence tag from `python3` to `java`. Paste a Java Two Sum solution into the fenced block. Run sample. Verdict uses the Java runtime.
result: pass
notes: "Tested by switching the inverse direction (java → python3). Language switch works — new language's runtime used. Separate issue logged: `python3` fence tag is not recognized by Obsidian's CodeMirror, so Python code renders unhighlighted. Defer to Phase 5 — need fence-tag map (python3 → python for display, keep python3 for LC runtime)."

### 10. Run custom — CustomTestModal opens with tabs
expected: Run "LeetCode: Run code (custom input)". A modal opens with tabs at the top ("Case 1"). If the problem has exampleTestcases, Case 1 is pre-filled with the first sample.
result: pass
notes: "Modal opens with tabs, + button works, textarea seeded. Two bugs found + fixed during this test (commit fb03fd0): VerdictModal Close-button click ignored, and CustomTestModal ran only the active tab. Both resolved."

### 11. Run custom — add/switch/remove tabs
expected: Click `+` to add Case 2, type some custom input. Switch back to Case 1 — it's preserved. Hover Case 2's tab — an `×` icon appears. Click `×` — Case 2 tab is removed, Case 1 becomes active.
result: pass
notes: "All four behaviors work. Cosmetic: on hover the tab widens to accommodate the × icon, causing layout shift. Standard fix: reserve space with visibility:hidden, toggle to visible on hover. Defer to Phase 5."

### 12. Run custom — execute a case and see verdict
expected: With input in Case 1, click Run. The verdict modal opens in pending state, then transitions to the run result.
result: pass
notes: "Verified multi-case end-to-end: 3 cases sent, 3 outputs returned, all correct. Same cosmetic layout issue as Test 7 (red/green diff panes on passing Run) — already logged."

### 13. Run custom — cases persist to note
expected: Close the verdict modal. Open the note in the editor. A `## Custom Tests` section exists with `### Case 1` followed by a ```text fenced block matching what you typed.
result: pass
notes: "Persistence works as specified. User flagged the persist-by-default design as unwanted — prefers ephemeral in-memory cases with an opt-in 'Pin to note' button, AND wants to merge Run-sample + Run-custom into a single 'Run' command that pre-fills from exampleTestcases. Design change logged for Phase 5 (see Gaps)."

### 14. Run custom — cases re-populate from note
expected: Re-open "LeetCode: Run code (custom input)". The tabs are pre-populated from the `## Custom Tests` section in the note.
result: closed
reason: "Stale — persist-to-note flow is being replaced in Phase 5 with the ephemeral+pin model (see ROADMAP.md Phase 5 POLISH-07). Validating re-population from a persisted note validates behavior that is scheduled for removal. Closed 2026-05-09."

### 15. Run custom — inter-case text preserved (D-19)
expected: In the note editor, type some text between `### Case 1` and `### Case 2` in the `## Custom Tests` section (e.g., "covers empty array"). Close and re-open CustomTestModal, run a case. Open the note again — the inter-case text is preserved; only the case blocks were re-written.
result: closed
reason: "Stale — same Phase 5 rework as Test 14. D-19 pure-transform preservation covered by tests/solve/CaseRegion.test.ts (14 tests GREEN); integration-level verification moot once persist-to-note is removed. Closed 2026-05-09."

### 16. Submit — correct solution shows Accepted
expected: With a correct Two Sum solution, run "LeetCode: Submit". Modal opens pending. Within 60s, transitions to an Accepted state with a big green "Accepted" heading and a percentile row.
result: pass
notes: "Accepted state renders correctly — 'Accepted — Two Sum' title, Runtime/Memory line, big green 'Accepted' heading, 'Beats 100.0% (runtime) · 43.0% (memory)' percentile row, Close button."

### 17. Submit — wrong solution shows WA with diff + Copy button
expected: Edit the solution to be wrong. Submit. The verdict modal shows a WA state with Input / Output / Expected diff panes (expected green-ish, actual red-ish) and a "Copy failing testcase to custom input" button.
result: pass
notes: "WA state renders correctly — title 'Wrong Answer — Two Sum', Input pane, Output ([0,0] red-bordered), Expected ([0,1] green-bordered), Copy failing testcase button, Close button."

### 18. Submit — Copy failing testcase opens CustomTestModal seeded
expected: Click "Copy failing testcase to custom input" on the WA verdict. The verdict modal closes. CustomTestModal opens with the failing input added as a new tab.
result: pass
notes: "Flow works. Fixed (commit 70b3ac0): seeded tab is now auto-activated on open instead of staying on Case 1. Also logged as Phase 5 gap: empty Case 1 auto-seeded on first open of custom-test modal even when user hasn't typed — should only create Case 1 on first keystroke or prefill from exampleTestcases."

### 19. Submit — compile error shows compile_error text + Copy
expected: Submit a solution with a syntax error (e.g., remove a colon). Verdict modal shows a CE state with compile_error text in monospace and a "Copy error" button. Click Copy — paste elsewhere to confirm clipboard received the error.
result: pass
notes: "Tested with Java (missing semicolon). Verdict shows 'Compile Error — Two Sum' title, `Line 3: error: ';' expected` with source pointer in monospace, Copy error + Close buttons. Note: Python SyntaxError does NOT trigger this path — LC wraps it as Runtime Error (covered in Test 20), which is standard LC behavior."

### 20. Submit — runtime error shows runtime_error + Input
expected: Submit a solution that raises an exception (e.g., `raise Exception('x')` as the first line). Verdict modal shows an RE state with runtime_error text and the failing Input section.
result: pass
notes: "Tested incidentally with Python SyntaxError (LC wraps SyntaxError as RE). Verdict shows 'Runtime Error — Two Sum' title, monospace `SyntaxError: expected ':'` + source context + Input section `[2,7,11,15] / 9` + Copy failing testcase + Close buttons. Covers the RE render path; intentional exception test would produce the same layout."

### 21. (Optional) Submit — TLE shows timeout verdict
expected: Submit a brute-force O(n²) solution against a large-input problem. Verdict shows TLE with failing input and copy button. (Skip-able if you don't want to wait.)
result: pass
notes: "Submit TLE render path works. Observed cosmetic gap on Run-sample TLE path: Input section renders empty because the interpret response doesn't echo data_input back — see Gaps section."

### 22. Single-flight gate — double-submit blocked
expected: Submit a solution. While it's pending, immediately run "LeetCode: Submit" again. A Notice appears: "A submission is already in progress. Cancel it first or wait for the verdict." No second network call is made.
result: pass
notes: "Functional single-flight path verified — ESC-and-resubmit sequence works cleanly (no 'already in progress' Notice because the ESC cancel propagates to orchestrator before the resubmit). Two related findings: (a) fix landed mid-UAT — ESC on pending modal now invokes onCancel (commit pending); (b) pending modal blocks palette + hotkeys, so the D-24 Notice-path is hard to reach in practice. Design concern logged for Phase 5 (see Gaps)."

### 23. Cancel from modal
expected: While a submit is pending, click the Cancel button in the modal. The modal closes silently (no Notice). Immediately re-running "LeetCode: Submit" works.
result: pass
notes: "Cancel button dismisses cleanly; re-submit works. ESC path verified earlier via same handler (VerdictModal.onClose pending guard)."

### 24. Cancel command from palette
expected: Start a submit. From the command palette, run "LeetCode: Cancel running submission". The pending modal closes. When nothing is in flight, the command is greyed out / disabled.
result: pass
notes: "Verified the disabled-state branch — when no submission is in flight, the command does not appear in the palette (checkCallback returns false). The 'cancel while pending' path is gated by the pending-modal-blocks-palette design concern (logged under Test 22 Gaps for Phase 5)."

### 25. Session expiry — clear cookies, submit, see Notice
expected: Clear cookies (use the plugin's Logout button). Invoke "LeetCode: Submit". Within ~2s, a Notice fires: "LeetCode session expired. Log in again." The modal closes. The plugin does not crash. (Log back in afterward to continue testing.)
result: pass

### 26. Error path — missing fenced block
expected: Open a problem note. Delete the ```python3 fenced block under `## Code`. Run "LeetCode: Submit". A Notice fires: "No code block found. Add a fenced block with your solution." No network call is made.
result: pass
notes: "Verified after fixing a bug found during this test (commit aca6faa): extractFirstFencedBlock was falling back to a body-wide search when ## Code section was empty, picking up example fences inside ## Problem and submitting example prose to LC. Now returns null when ## Code exists but has no fence, so the D-04 gate fires the Notice correctly."

### 27. Error path — non-problem note
expected: Open a non-problem note (any note without `lc-slug` frontmatter). Open the command palette. "LeetCode: Submit" is either greyed out / missing from palette, or shows Notice "Open a LeetCode problem note first." (Either behavior is acceptable.)
result: pass
notes: "Command hidden from palette (editorCheckCallback returned false because no lc-slug frontmatter on active note)."

### 28. No default hotkeys (FND-03 / D-10)
expected: Open Obsidian Settings → Hotkeys. Search "LeetCode". All 5 Phase 3 commands appear (Run code (sample), Run code (custom input), Submit, Insert starter code, Cancel running submission) with NO default hotkey set.
result: pass

## Summary

total: 28
passed: 26
issues: 10
pending: 0
skipped: 2
blocked: 0

## Gaps

- truth: "`## Code` heading-to-fence spacing is consistent between the initial note-create path and the Insert-starter-code command"
  status: failed
  reason: "User reported: when clicking a problem to create the markdown note, there's no empty line between `## Code` (and also `## Problem`) and the content below. But `LeetCode: Insert starter code` produces a blank line between heading and fence. Prefer the blank-line form everywhere for consistency."
  severity: cosmetic
  test: 5
  defer_to: polish-phase
  artifacts: []
  missing:
    - "Normalize heading-to-content spacing in NoteTemplate.buildNoteBody — ensure blank line between each `## …` heading and its content (## Problem → description, ## Code → fenced block, ## Notes → body, ## Custom Tests → sections)"
  debug_session: ""

- truth: "Verdict modal pending state has clean, minimal chrome with appropriate messaging"
  status: failed
  reason: "User reported: Works. Functionality correct. UX polish: remove the `Backoff: 1s → 2s → 4s → 8s` indicator (too technical); revise the pending text. Defer to Phase 5."
  severity: cosmetic
  test: 6
  defer_to: phase-5
  artifacts: []
  missing:
    - "Remove backoff-cadence indicator from VerdictModal pending state (verdictModalRenderer)"
    - "Revise pending-state text copy — user-facing, less technical than 'Polling LeetCode for verdict…'"
  debug_session: ""

- truth: "Run-sample passed verdict collapses to a compact success view (no diff panes when Output == Expected)"
  status: failed
  reason: "Run-pass title says 'Run — all samples passed' but the body still renders the side-by-side Output (red left border) / Expected (green left border) diff panes. Looks like a failure even though the output matched. Should show a compact success-style layout (just Output or runtime/memory line) when correct_answer is true."
  severity: cosmetic
  test: 7
  defer_to: phase-5
  artifacts:
    - path: "src/solve/verdictModalRenderer.ts"
      issue: "renderRunSuccess (or equivalent) reuses the diff-pane layout; should branch on correct_answer=true → compact layout"
  missing:
    - "Add a passed-Run render branch in verdictModalRenderer that omits the Expected pane and uses neutral borders when Output == Expected"
  debug_session: ""

- truth: "Rate-limited submit/run keeps the modal open with a Retry + Close affordance"
  status: failed
  reason: "Current behavior (after commit 62c80dd): Notice fires + modal closes silently. User wants the rate-limit state to render as a dedicated verdict-modal state with: (a) title 'LeetCode rate-limit reached', (b) message with wait-time in seconds, (c) Retry button wired to the Submit command (honors the user's configured hotkey — in their case Cmd+Enter), (d) Close button + ESC-to-close. Keeps the user in the modal workflow instead of bouncing them back to the note with just a transient Notice."
  severity: cosmetic
  test: 22
  defer_to: phase-5
  artifacts:
    - path: "src/solve/verdictModalRenderer.ts"
      issue: "No render state for rate-limit yet; current catch in main.ts dismisses the modal and fires a Notice"
    - path: "src/main.ts"
      issue: "RateLimitError catch branch closes the modal; should call modal.renderRateLimit(retrySeconds, onRetry) instead"
    - path: "src/solve/VerdictModal.ts"
      issue: "Needs a renderRateLimit(retrySeconds, onRetry) method similar to renderTimeout"
  missing:
    - "Add renderRateLimit render branch to verdictModalRenderer (title + countdown + Retry + Close)"
    - "Add VerdictModal.renderRateLimit(retrySeconds, onRetry) method"
    - "main.ts submit/run catch: if RateLimitError, call modal.renderRateLimit(seconds, retry handler) instead of closing"
    - "Retry handler re-invokes the same command (submitFromActive / runSampleFromActive / runInterpretedInput) after the wait window — could also just close and let user re-invoke"
    - "Consider a small visible countdown that decrements each second so user knows when they can retry"
  debug_session: ""

- truth: "VerdictModal does not block access to the command palette while pending"
  status: failed
  reason: "User reported: while the VerdictModal is in pending state (spinner visible, waiting on LC judge), the command palette + hotkeys are inaccessible because Obsidian's Modal base class applies a blocking overlay. This makes D-24 single-flight gate's Notice path unreachable in practice — users can't even invoke a second Submit. Options: (a) make the pending modal non-blocking (use a floating widget / status-bar item instead of Modal), (b) expose a footer 'keep running in background' button that closes the modal but leaves the orchestrator polling, (c) accept that pending modal is blocking and treat the D-24 guard as dead code (removing the Notice). Decide in Phase 5."
  severity: major
  test: 22
  defer_to: phase-5
  artifacts:
    - path: "src/solve/VerdictModal.ts"
      issue: "extends Obsidian's Modal, which applies a document-level blocking overlay — users cannot invoke any command while the modal is open"
    - path: "src/solve/submissionOrchestrator.ts"
      issue: "D-24 'already in progress' Notice path only triggers if a second invocation reaches guardSingleFlight while inFlight=true — unreachable when the modal blocks palette"
  missing:
    - "Phase 5 design decision: pending-UI component type (blocking modal vs. floating widget vs. status-bar progress) + reconcile with D-24 guard expectations"
    - "If non-blocking: swap Modal → an ItemView or floating div; keep the Cancel affordance"
    - "If blocking stays: remove or de-emphasize the D-24 Notice code path (it's dead)"
  debug_session: ""

- truth: "Run-sample TLE state renders the input the user submitted"
  status: failed
  reason: "Run-sample TLE verdict shows 'Time Limit Exceeded — Two Sum' title + Close button, but the Input section is empty. LC's /interpret_solution/ response does not echo `data_input` back on TLE, so the modal renders a blank Input pane. We have the data_input in scope when we dispatch — plumb it into the renderer so the Input section either shows what was sent or collapses when unavailable."
  severity: cosmetic
  test: 21
  defer_to: phase-5
  artifacts:
    - path: "src/solve/verdictModalRenderer.ts"
      issue: "Input section rendered unconditionally on TLE/RE/CE states; no fallback to the submitted data_input"
    - path: "src/main.ts"
      issue: "runInterpretedInput passes dataInput to interpretSolution but not to modal.renderVerdict"
  missing:
    - "Thread the dispatched data_input through modal.renderVerdict (e.g., via a context object) so verdictModalRenderer can fall back to it when LC's response omits input"
    - "OR: hide the Input section when empty (simpler, less informative)"
  debug_session: ""

- truth: "CustomTestModal doesn't pre-create an empty Case 1 when opened fresh"
  status: failed
  reason: "User reported: opening `Run code (custom input)` on a note with no existing `## Custom Tests` section creates an empty Case 1 tab + textarea even though the user hasn't typed anything. Feels like clutter. Should either lazily create the first case on first keystroke OR pre-fill from exampleTestcases when available."
  severity: cosmetic
  test: 18
  defer_to: phase-5
  artifacts:
    - path: "src/solve/CustomTestModal.ts"
      issue: "constructor hard-seeds `[{input: ''}]` when initialCases empty — should check if we should pre-fill from detail.exampleTestcases instead (Tab 1 sample), or defer case creation to first keystroke"
  missing:
    - "Change initial empty seeding to pull from exampleTestcases when available (via a new args.fallbackInputs?: string[] from main.ts)"
    - "OR: render a placeholder tab that spawns a real case only on first keystroke"
    - "Decide which in Phase 5 design alongside the ephemeral+pin rework"
  debug_session: ""

- truth: "Phase 3 commands work in Read mode (preview) for paths that don't need editor state"
  status: failed
  reason: "User reported: in Read mode (preview), all Phase 3 commands except browsing are disabled. They use editorCheckCallback which requires an active MarkdownView editor. Commands that only need the file (Insert starter code, Submit, Run sample/custom) could use checkCallback instead — the code is in the note body, not the editor. Cancel is already global checkCallback. Browser works because it's a View, not a command."
  severity: major
  test: 'read-mode-finding'
  defer_to: phase-5
  artifacts:
    - path: "src/main.ts"
      issue: "editorCheckCallback gate on run-sample, run-custom, submit, insert-starter-code means Read mode disables all of them"
  missing:
    - "Migrate the 4 commands from editorCheckCallback → checkCallback; gate on `getActiveFile` + lc-slug frontmatter instead of active editor"
    - "SubmissionOrchestrator.getCurrentBody currently closes over editor.getValue() — refactor to read from vault.read(file) when editor absent"
    - "SOLVE-09 (current-content-at-submit) still guaranteed via file read in Read mode — file is on disk; no unsaved-edits race because Read mode cannot edit"
  debug_session: ""

- truth: "Custom tests are ephemeral by default + opt-in pinning; Run command is unified (sample + custom merged)"
  status: failed
  reason: "User preference surfaced during UAT: (a) persist-to-note-by-default feels heavy — prefer ephemeral in-memory cases with a 'Pin to note' button that writes `## Custom Tests` on demand. (b) Two separate commands 'Run code (sample)' and 'Run code (custom input)' should merge into one 'LeetCode: Run' command — it opens the tabbed modal pre-filled from exampleTestcases, user can edit / add / remove, Run executes all tabs. Sample is just a pre-filled custom case."
  severity: major
  test: 13
  defer_to: phase-5
  artifacts:
    - path: "src/solve/CustomTestModal.ts"
      issue: "onClose persists unconditionally; no pin/unpin state; no sample pre-fill on open"
    - path: "src/main.ts"
      issue: "Two commands (run-sample, run-custom) to collapse into one; openCustomTestModalFromActive should seed from exampleTestcases when ## Custom Tests section absent"
  missing:
    - "Remove persist-on-close from CustomTestModal.onClose — cases stay in memory only"
    - "Add 'Pin to note' button in CustomTestModal footer that invokes the current persist() helper on demand"
    - "If note has `## Custom Tests` section, hydrate tabs from it on open (existing behavior); if not, seed Tab 1 from detail.exampleTestcases"
    - "Merge commands: delete 'run-sample' command; rename 'run-custom' → 'Run'; keyboard shortcut left unbound per FND-03"
    - "Decide if merged command still auto-opens the modal (opt-in) or auto-runs the first sample tab (faster happy path)"
  debug_session: ""

- truth: "CustomTestModal tabs don't shift width on hover"
  status: failed
  reason: "User reported: hovering a tab widens it to show the × close icon, causing neighboring tabs to shift. Should reserve the × slot with visibility:hidden and toggle to visibility:visible on hover to prevent layout thrash."
  severity: cosmetic
  test: 11
  defer_to: phase-5
  artifacts:
    - path: "styles.css"
      issue: ".leetcode-custom-test-tab hover shows × by mounting/unmounting, not by visibility toggle"
  missing:
    - "Always render the × element in the tab DOM; toggle visibility:hidden/visible on :hover (or .is-hovered) to preserve layout"
  debug_session: ""

- truth: "Fenced code blocks under `## Code` have syntax highlighting in Obsidian's editor"
  status: failed
  reason: "````python3` fence tag is not recognized by Obsidian's CodeMirror highlighter, so Python starter code renders as plain text. Other LC langSlugs with version numbers or unusual names likely have the same issue (e.g., `cpp`, `csharp` may or may not work)."
  severity: cosmetic
  test: 9
  defer_to: phase-5
  artifacts:
    - path: "src/solve/languages.ts"
      issue: "LC langSlug is used verbatim as the fence tag, but Obsidian expects canonical editor language names (python, cpp, typescript, etc.)"
    - path: "src/solve/starterCodeInjector.ts"
      issue: "writes ````\\${langSlug}` without mapping to an editor-friendly fence tag"
  missing:
    - "Add a fence-tag map: {python3 → python, python → python, python2 → python, pythondata → python, javascript → javascript, typescript → typescript, cpp → cpp, java → java, csharp → csharp, golang → go, kotlin → kotlin, swift → swift, scala → scala, racket → racket, ruby → ruby, rust → rust, bash → bash, mysql → sql, mssql → sql, oraclesql → sql, postgresql → sql, php → php, elixir → elixir, dart → dart, erlang → erlang} and apply at every fence-write site (starterCodeInjector + buildNoteBody)"
    - "Preserve the LC langSlug separately (frontmatter `lc-lang` or implicit from default-language setting) so Run/Submit still send the correct LC identifier"
  debug_session: ""
