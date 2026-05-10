---
status: complete
phase: 04-knowledge-graph-wiring
source: [04-06-PLAN.md, 04-VERIFICATION.md]
started: 2026-05-09T19:35:00-07:00
updated: 2026-05-09T21:25:00-07:00
scope: "Remaining smoke sections (D–H) + Graph View retest post-fix + MarkdownRenderer deviation decision. Sections A (AC graph write), B (picker), C (Copy-to-Code), E signal-(a) JSON 401 already confirmed pass by user and automated integration tests."
---

## Current Test

[testing complete]

## Tests

### 1. Graph View edges after field fix (post 3fe6c7d)
expected: Open Obsidian's Graph View. The problem note you AC'd after reloading the fixed plugin shows edges out to each technique stub (e.g., [[Array]], [[Hash Table]]). Stub files exist at LeetCode/Techniques/*.md.
result: pass

### 2. User tag preservation on re-AC (D-13)
expected: Edit the AC'd note, add a line `- [[My Personal Technique]]` inside ## Techniques, re-submit same solution (will be AC again). After AC, the [[My Personal Technique]] line is STILL PRESENT (union-merge preserved it).
result: pass

### 3. Opt-out flow (Section D — GRAPH-05, D-20)
expected: |
  Close Obsidian. Edit data.json at {vault}/.obsidian/plugins/leetcode/data.json — change `autoBacklinksEnabled` from true to false. Reopen Obsidian. Pick a SECOND unsolved problem, AC a solution. Verify:
    - frontmatter still populates (lc-status, lc-solved-date, lc-runtime-ms, lc-memory-mb, lc-language)
    - tags: array still includes `lc/{topic-slug}` per LC topic tag
    - NO ## Techniques heading added
    - NO new stub files created for the second problem's topic tags
  After testing, revert autoBacklinksEnabled to true and restart Obsidian.
result: pass

### 4. Session-expiry Notice (Section E — D-06)
expected: |
  In plugin settings log out (or blank LEETCODE_SESSION in data.json). Open a note with lc-slug frontmatter. Cmd-P → `LeetCode: View past submissions`. Expected: picker briefly opens then closes; Notice fires with EXACT copy `LeetCode session expired. Log in again.` (~8s). Log back in afterward.
result: pass

### 5. Non-AC skip (Section F — D-23)
expected: |
  On a solved problem (note already has ## Techniques), temporarily break the code (change a return to produce WA). Cmd-P → `LeetCode: Submit`. WA verdict appears.
  Verify:
    - ## Techniques section UNCHANGED
    - lc-status still 'accepted' (not downgraded)
    - No new stub files created
  Fix code back afterward.
result: pass

### 6. Picker chip colors + keyboard nav (Section G — visual/a11y)
expected: |
  Open picker on a problem with mixed-verdict history. Verify:
    - AC chips green-tinted; WA/TLE/MLE/RE red-tinted; CE orange-tinted
    - Switch to dark mode → chip contrast still legible
    - Tab cycles through rows; Enter on focused row opens detail modal
    - Focus ring visible when Tab-focused on buttons (no outline:none override)
result: issue
reported: "CE chip tint reads red-ish, same as WA — expected orange. Keyboard focus ring on focused submission row is hard to see in light mode (dark mode is fine). Chip tint in dark mode, Tab cycling, Enter-to-open-detail all work."
severity: cosmetic
notes: |
  Two cosmetic/a11y gaps, both in styles.css scope (.leetcode-verdict-* variants +
  .leetcode-submissions-picker row focus state). No functional break. Both belong
  in Phase 5 Polish or as a small gap-closure plan in Phase 4.

### 7. Phase 1-3 regression — Submit (Section H)
expected: |
  `LeetCode: Submit` still works on a non-AC submission — WA produces the verdict modal with Input/Output/Expected diff (Phase 3 behavior intact).
result: pass

### 8. Phase 1-3 regression — Run code (Section H)
expected: |
  Both `LeetCode: Run code (sample)` and `LeetCode: Run code (custom input)` still work. Sample opens verdict modal with sample-test results; custom opens the custom-test tabbed modal.
result: pass

### 9. Plugin disable/re-enable (Section H)
expected: |
  Toggle the plugin OFF in Obsidian's Community plugin settings, then toggle ON. No crash, no error modal. Commands return.
result: pass

### 10. MarkdownRenderer deviation — accept or reject (VERIFICATION.md override)
expected: |
  04-04-SUMMARY.md documents: SubmissionDetailModal renders submission code via <pre><code class='language-*'> + textContent instead of MarkdownRenderer.render. Intentional fallback for test determinism. Phase 5 upgrade path noted. Is this acceptable as-is (no syntax highlighting on submission detail code block), or does it need to be fixed now?
  Reply "accept" to mark the deviation accepted and close the override.
  Reply "fix" to file a gap-closure task for Phase 5 Polish to upgrade to MarkdownRenderer.render with Component lifecycle (Pitfall 7).
result: issue
reported: "fix — upgrade to MarkdownRenderer.render with Component lifecycle in Phase 5 Polish"
severity: minor
action: "Gap captured at .planning/todos/pending/submission-detail-markdownrenderer-upgrade.md with resolves_phase: 5"

## Summary

total: 10
passed: 8
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "CE chips render orange-tinted, distinct from WA/TLE/MLE/RE red-tinted chips"
  status: failed
  reason: "User reported: CE chip tint reads red-ish, same as WA — expected orange."
  severity: cosmetic
  test: 6
  artifacts: [styles.css, src/solve/statusMap.ts]
  missing: ["distinct orange tint for CE verdict chip (.leetcode-verdict-ce or equivalent)"]

- truth: "Keyboard focus indicator on focused submission row is visible in light mode"
  status: failed
  reason: "User reported: focus submission is not very visible in light mode; dark mode is alright."
  severity: minor
  test: 6
  artifacts: [styles.css]
  missing: ["light-mode-sufficient focus ring on .leetcode-submissions-picker row focus state (contrast ratio meeting WCAG AA)"]

- truth: "SubmissionDetailModal renders submission code with syntax highlighting via MarkdownRenderer.render + Component lifecycle (Pitfall 7)"
  status: deferred
  reason: "User chose 'fix' on 2026-05-09 UAT Test 10 — accepted as Phase 5 Polish gap; not a Phase 4 blocker."
  severity: minor
  test: 10
  artifacts: [src/graph/SubmissionDetailModal.ts, tests/graph/SubmissionDetailModal.test.ts]
  todo: .planning/todos/pending/submission-detail-markdownrenderer-upgrade.md
  resolves_phase: 5
