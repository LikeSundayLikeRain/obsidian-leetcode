---
status: testing
phase: 11-ai-knowledge-graph
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md]
started: "2026-05-19T00:00:00Z"
updated: "2026-05-19T00:00:00Z"
---

## Current Test

number: 1
name: Settings UI — KG toggles visible
expected: |
  Open Settings → AI section. Below the "Auto AI review on Accept" toggle, you should see:
  1. "AI pattern classification on Accept" toggle (default ON)
  2. "Look-ahead edges (experimental)" toggle (default OFF)
awaiting: user response

## Tests

### 1. Settings UI — KG toggles visible
expected: Open Settings → AI section. Two new toggles visible: "AI pattern classification on Accept" (ON) and "Look-ahead edges (experimental)" (OFF).
result: [pending]

### 2. AI Classification on AC — pattern assigned
expected: Solve a problem and get Accepted. After AC, the note's frontmatter should gain `lc-pattern: <Pattern Name>` (e.g., "Two Pointers", "Hash Table", etc.). The ## Techniques section should show a single wikilink like `[[Two Pointers]]` replacing any prior lc-tag links.
result: [pending]

### 3. Hub note created at LeetCode/Patterns/
expected: After the AC classification in test 2, check your vault for `LeetCode/Patterns/<Pattern Name>.md`. It should exist with difficulty-grouped tables (### Easy / ### Medium / ### Hard) and a row for the solved problem.
result: [pending]

### 4. Related Variants section added (if AI suggests any)
expected: After AC, check the problem note for a `## Related Variants` section (appears after ## Techniques, before ## AI Review if present). If AI found cross-cluster structural twins, you'll see up to 2 entries like `- [[Problem Name]] — brief reason`. If AI found none, the section may be absent (that's OK).
result: [pending]

### 5. Reconcile palette command works
expected: Open command palette → type "Reconcile pattern hubs" → run it. A Notice "Pattern hubs reconciled" should appear. Hub notes should be rebuilt from all notes with `lc-pattern` frontmatter.
result: [pending]

### 6. OTHER classification prompts user
expected: If AI returns "OTHER" for a classification (rare — may need to test with an unusual problem), a modal should appear asking you to name the pattern or accept "OTHER". The choice persists to `lc-pattern` frontmatter and is never re-asked for that problem.
result: [pending]

### 7. Look-ahead edges gated by feature flag
expected: With "Look-ahead edges" toggle OFF (default), ## Related Variants should never contain wikilinks to unsolved problems. Toggle it ON, then solve another problem — AI may now suggest unsolved problems in ## Related Variants (if it judges them relevant).
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
