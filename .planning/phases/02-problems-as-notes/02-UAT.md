---
status: resolved
phase: 02-problems-as-notes
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-VERIFICATION.md]
started: 2026-05-08T15:15:40Z
updated: 2026-05-08T14:45:00Z
resolution_summary: |
  All 3 diagnosed gaps resolved via Phase 2.1 gap closures (plans 02-06..02-11):
    - GAP-2a (lc-status accuracy) → 02-06
    - GAP-2b (example block rendering, Shapes A + B) → 02-07 + 02-11
    - GAP-2c (sup/sub rendering) → 02-07 + 02-09 (superseded) + 02-10 (Unicode final form)
    - GAP-6 (empty Bases view) → 02-08
    - GAP-11 ("Refresh current problem" command) → 02-10
  Deferred to Phase 5: GAP-9 (logged-out silent degradation).
  Test 10 (minAppVersion enforcement) skipped — no Obsidian 1.9.x install available.
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Fully quit Obsidian (Cmd+Q, not just close window). Reopen the vault at ~/Documents/Obsidian Vault. In Settings → Community plugins, the LeetCode plugin shows version 0.1.0 and is toggled on. No red error toast appears on load. The ribbon icon for LeetCode is visible in the left sidebar.
result: pass

### 2. First-Open Creates Note
expected: Open the LeetCode problem browser (ribbon icon or command palette → "Open LeetCode problems"). Click any problem row (e.g., Two Sum). A new note opens at LeetCode/1-two-sum.md with frontmatter containing lc-id, lc-slug, lc-title, lc-difficulty, lc-url, lc-status, lc-language, aliases, and tags (including lc/easy). Below the frontmatter: ## Problem (rendered LeetCode content), then ## Notes (empty).
result: issue
reported: "(1) lc-status is inaccurate — Two Sum is already Accepted on LC but frontmatter shows 'untouched'; (2) LC renders example blocks as styled indented boxes with bold Input/Output/Explanation labels — our turndown output is not rendering them as code blocks; should match LC's visual treatment; (3) HTML <sup>...</sup> tags (used in complexity expressions like O(n<sup>2</sup>)) are not rendered — they appear as raw literal text inside the Markdown instead of being converted to Unicode superscript or a LaTeX-style ^2 form"
severity: major

### 3. Re-Open Reveals Instantly
expected: Close the note tab you just opened. Click the same problem row again in the browser. The existing note reveals in the current pane in under 100 ms with no loading spinner and no blocking fetch indicator.
result: pass

### 4. User Notes Preserved
expected: Under the ## Notes heading of the opened note, type something like "This is a two-pointer problem. Need to review." Save (Cmd+S), close the note, then re-open the same problem from the browser. Your notes text is still present, untouched, below the ## Notes heading.
result: pass

### 5. Manual #revisit Tag Preserved
expected: Open a problem note. In the frontmatter tags array, manually add a tag like revisit: tags: [lc/easy, revisit]. Save. Close the note. Re-open the same problem from the browser. The revisit tag is still present in the frontmatter tags array (union-merged, not overwritten by the plugin's pass).
result: pass

### 6. LeetCode.base Renders as Bases View
expected: In the File Explorer, open the LeetCode/ folder. A file LeetCode.base exists. Clicking it opens a Bases view (sortable table) listing all opened problem notes, sorted by lc-id descending (most recent first). Columns show problem id, title, difficulty.
result: issue
reported: "The base file exists, but there's no content in the table — zero rows shown, even though multiple problem notes exist in the LeetCode/ folder with fully-populated frontmatter"
severity: major

### 7. Offline Cached Note Reveals Silently
expected: Disconnect your network (Wi-Fi off or airplane mode). In the LeetCode browser, click a problem you previously opened (one you just tested in test 2 or 3). The note reveals instantly from cache. No "couldn't fetch" or network-error Notice appears. No stale-data warning. Silent as designed.
result: pass

### 8. Offline Uncached Problem Shows Notice
expected: Keep the network disconnected. In the browser, click a problem you have NEVER opened before. A Notice toast appears at the top of the screen reading "Couldn't fetch [Problem Title]. Check your connection." No file is created in LeetCode/ for that problem. Your vault state is unchanged.
result: pass

### 9. Session Expiry Detection
expected: Reconnect network. In Settings → LeetCode, clear the session cookie (or log out if that control exists in Phase 1 UI). Click a problem in the browser. An existing Phase 1 session-expired Notice fires (prompting re-auth). No partial note file is created. After logging back in, the click works normally.
result: issue
reported: "After log out, user is still able to click on problems and it creates a note — no session-expired Notice fires. The underlying behavior is technically correct (LC's problem-detail GraphQL works without auth for public problem content), but users have no signal that their logged-out state is degraded: lc-status, personalized topic tags (Phase 4), and submission sync will all silently fail."
severity: minor

### 10. minAppVersion Enforcement
expected: (SKIP-IF-UNAVAILABLE) If you have access to an older Obsidian install (< 1.10.0), attempt to install this plugin there. Obsidian refuses the install with a "requires a newer version" message. If you only have Obsidian 1.10+, answer "skip" for this test — it is not critical.
result: closed
reason: "Non-critical SKIP-IF-UNAVAILABLE test. User has no Obsidian 1.9.x install; enforcement is Obsidian-owned behavior on a correctly-formatted manifest. Closed 2026-05-09."

## Summary

total: 10
passed: 6
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "LeetCode.base renders as a populated Bases view — rows show every note in the LeetCode/ folder with frontmatter lc-id, sorted by lc-id DESC"
  status: failed
  reason: "User reported: the .base file exists but the table is empty — zero rows shown even though multiple problem notes with full lc-* frontmatter exist in LeetCode/"
  severity: major
  test: 6
  artifacts: []
  missing: []
  diagnosis_hint: |
    src/notes/BaseFile.ts leetcodeBaseYaml emits a `filters:` block with a nested `and:` plus three string expressions
    (`file.inFolder("LeetCode")`, `file.ext == "md"`, `lc-id != null`). This is RESEARCH.md's A1 risk (MEDIUM
    confidence) — the BasesConfigFile* TypeScript interfaces in obsidian.d.ts declare the shape but the exact YAML
    serialization was not confirmed from a live Bases example.

    Likely causes (investigate before choosing a fix):
      (A) Obsidian 1.10 Bases expects the filter in a different key name or nesting — e.g., top-level single-expression
          vs list, or `formula:` vs `filters:`. Check Obsidian 1.10+ docs + decompile a Bases file created in the UI.
      (B) The filter expressions use an unsupported syntax — e.g., `file.inFolder(...)` may need to be `file.folder`
          or `file.path.startsWith(...)`. `lc-id != null` may need `note["lc-id"]` accessor form.
      (C) The `views:` > `order:` key may be `columns:` in the official schema; empty table could reflect the view
          being silently rejected.
      (D) The sort clause (A1 — flagged MEDIUM confidence in RESEARCH.md) may need the whole view dropped on schema
          mismatch.

    Recommended fix path:
      1. In the user's vault, create a working Bases file via the Obsidian UI (right-click folder → New base → add a
         filter "has frontmatter lc-id" + a table view). Open the resulting .base file and copy its exact YAML.
      2. Update `leetcodeBaseYaml` to match the UI-produced schema verbatim (swap our string-expression form for
         whatever Obsidian actually wrote).
      3. Keep D-18 preservation: never overwrite an existing file; users who customized keep their changes. To help
         users already on the broken v0.1.0 schema: print a one-time Notice on plugin load if the existing .base is
         our v0.1.0 signature AND rows would otherwise populate — "LeetCode.base may need to be regenerated. Delete
         it to get the updated view."

- truth: "lc-status reflects the user's actual LeetCode submission status (accepted/attempted/untouched), not a hardcoded default"
  status: failed
  reason: "User reported: lc-status is inaccurate — Two Sum is already Accepted on LC but the plugin wrote 'untouched' on first open"
  severity: major
  test: 2
  artifacts: []
  missing: []
  diagnosis_hint: |
    Phase 2 currently hardcodes `lc-status: untouched` in buildFrontmatterInput (see src/notes/NoteTemplate.ts). Per D-04,
    solve-time status change is Phase 4's responsibility — but D-04 assumes a pristine user who hasn't solved the
    problem before. For users with existing LC submission history, we need to read the status_display field from the
    LC problem list (@leetnotion/leetcode-api exposes `problemset` with statusDisplay per row) and map:
      statusDisplay: "ac" → "accepted"
      statusDisplay: "notac" → "attempted"
      statusDisplay: null/"" → "untouched"
    This is a Phase 2.1 scope adjustment — Phase 2 should honor existing user status at first-note creation.

- truth: "Logging out shows a one-time Notice indicating that problem browsing still works but user-specific data (status, submissions) won't sync until re-auth — preventing silent degradation"
  status: deferred
  deferred_to: Phase 5 Polish
  reason: "User reported: after log out, clicking problems still creates notes with no signal that auth-required features are degraded. Deferred to Phase 5 — genuinely cross-phase polish; bundles with other UX-refinement work rather than Phase 2.1 gap closure."
  severity: minor
  test: 9
  artifacts: []
  missing: []
  diagnosis_hint: |
    LC's problem(slug) GraphQL endpoint returns public problem content without auth — so NoteWriter.openProblem
    succeeds even when the session cookie is cleared. This is correct behavior technically but creates a UX gap:
    users who logged out see notes being created normally and have no way to know that lc-status, personalized
    topic tags (Phase 4), and submission sync will all silently fail when they eventually solve the problem.

    Two clean fix options:
      (A) LOGOUT-TIME NOTICE (simpler): In whatever Phase 1 "log out" action lives (likely SettingsTab or a command),
          fire a one-time Notice: "Logged out. Problem browsing still works but status and submissions won't sync
          until you log back in." No NoteWriter change needed.
      (B) DEGRADED-MODE BADGE (richer): Add a small badge to the ProblemBrowserView header showing "Logged out —
          status sync disabled" when the session cookie is absent. More visible but more UI work.

    Recommend option A for Phase 2.1 polish — directly addresses the silent-degradation concern; defer option B
    to Phase 5 polish if users report the Notice is easy to miss.

- truth: "LeetCode's styled example blocks (bold Input/Output/Explanation labels, monospace indent) render as visually distinct blocks in the vault note — either a styled callout, a code fence, or bold-labeled indented text"
  status: failed
  reason: "User reported: LC renders examples as styled indented boxes with bold Input/Output/Explanation labels; our turndown output flattens them into plain paragraphs, losing the visual structure"
  severity: minor
  test: 2
  artifacts: []
  missing: []
  diagnosis_hint: |
    LC problem HTML wraps examples in `<pre><code>` or `<div class="example-block">` patterns (varies per problem).
    The current turndown config uses default rules which strip the outer wrapper. Options:
      (A) Custom turndown rule: detect LC's example wrapper (class names or `<strong>Input:</strong>` pattern) and
          convert to a Markdown code fence with a language hint (e.g., ```text). Simple, preserves monospace.
      (B) Convert to an Obsidian callout: > [!example] Example 1 / Input: ... — more native but requires multi-line
          detection.
      (C) Render as bold-labeled blockquote: > **Input:** ... / > **Output:** ... — simplest, no fencing.
    RESEARCH.md D-20 determinism gate must still pass — pick option A for simplicity; revisit if users prefer B.

- truth: "HTML <sup>...</sup> tags in LC problem content (complexity expressions like O(n<sup>2</sup>), constraints like 10<sup>5</sup>) render as Unicode superscript or LaTeX-style ^{...} in the vault note — not as raw literal text"
  status: failed
  reason: "User reported: <sup>2</sup> appears as literal '<sup>2</sup>' text in the note instead of being converted to either Unicode superscript (²) or LaTeX ^2 form"
  severity: minor
  test: 2
  artifacts: []
  missing: []
  diagnosis_hint: |
    Turndown 7.2.4's default rules treat <sup>/<sub> as keep-tags — they pass through as literal HTML in the
    Markdown output. Three clean fix options:

    (A) LaTeX-style caret form (recommended — matches math-heavy LC content):
        Custom turndown rule for `<sup>` → `^{content}` and `<sub>` → `_{content}`.
        When wrapped in Obsidian's math-mode delimiters (`$...$`), the caret renders as true superscript.
        For the complexity case O(n^2): output `$O(n^2)$` instead of literal `O(n<sup>2</sup>)`. Consistent with
        the LaTeX-preservation rule already present for `\(...\)` / `$...$` sequences (D-20 spec).

    (B) Unicode superscript (simpler but limited):
        Map specific common characters: `<sup>2</sup>` → `²`, `<sup>3</sup>` → `³`, `<sup>n</sup>` → `ⁿ`.
        Works for digits 0-9 and a few letters; fails for arbitrary expressions like `<sup>i+1</sup>`.
        Fall back to option A for anything unmappable.

    (C) HTML passthrough (minimal):
        Keep the `<sup>` literal but change turndown rule to preserve it intact (already the case).
        Obsidian's reading view renders `<sup>` correctly. Least effort, but the source-view Markdown looks messy.

    Recommend option A — consistent with D-20's math-preservation posture, handles arbitrary expressions, renders
    cleanly in both source and preview modes. Same custom-rule mechanism extends to `<sub>` for free.
