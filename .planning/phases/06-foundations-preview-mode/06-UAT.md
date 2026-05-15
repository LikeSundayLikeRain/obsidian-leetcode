---
status: partial
phase: 06-foundations-preview-mode
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-VERIFICATION.md]
started: 2026-05-15T19:30:00Z
updated: 2026-05-15T20:15:00Z
---

## Current Test

[testing paused — gap closure planned for preview body & header chrome]

## Tests

### 1. Right-click → Preview problem
expected: Right-click any problem row → context menu shows "Preview problem" → clicking opens a `leetcode-preview` tab → no new file in `LeetCode/` (or your configured problems folder).
result: [pending]

### 2. Single-click vs shift-click default behavior
expected: With default settings (Click behavior = Preview first), single-clicking a problem opens a preview tab. Holding shift while clicking opens the v1.0 note (creates if missing, opens if it exists) — NOT a preview.
result: pass
notes: "All UI gaps closed by Plan 06-05 + follow-up CSS fixes. Header is single-row (title + pill + right-anchored button), examples render as fenced code blocks with reading-mode parity, Enter activates the button, Esc detaches the preview tab."

### 3. Settings toggle persists across plugin reload
expected: Open Settings → Preview → Click behavior. Switch to "Open note directly". Click a problem — v1.0 note path fires (no preview tab). Switch back to "Preview first". Reload Obsidian (Cmd/Ctrl+R or restart). Open settings again — toggle still says "Preview first".
result: [pending]

### 4. Start Problem creates note + preview auto-detaches
expected: Preview a problem you have NOT created a note for. Action button reads "Start Problem" with a primary accent. Click it. A note is created at `LeetCode/{id}-{slug}.md` (or your configured folder) via the v1.0 pipeline. Within ~100ms after the note tab takes focus, the preview tab disappears.
result: [pending]

### 5. Open Problem jumps to existing note without overwriting
expected: Preview a problem you HAVE already created a note for (e.g., one of your previously solved problems). Action button reads "Open Problem" (neutral, no accent). Click it. Existing note tab opens. The note's content (your code, notes, frontmatter) is unchanged.
result: [pending]

### 6. Tab reuse — only one preview at a time
expected: Single-click problem A → preview tab opens for A. Single-click problem B (different slug) → SAME preview tab updates to B (header + body re-render). At no point do two preview tabs coexist. `workspace.getLeavesOfType('leetcode-preview').length === 1` throughout.
result: [pending]

### 7. Command palette "Open in preview" gates on lc-slug
expected: Open a problem note that has `lc-slug` in frontmatter → run command palette → "Open in preview" appears and opens the preview tab for that slug, even if Click behavior = "Open note directly". Open any non-LeetCode note (no `lc-slug`) → "Open in preview" does NOT appear in the palette.
result: [pending]

### 8. Network error fallback shows retry UI
expected: Trigger an offline preview (e.g., disable network or kill a previously-cached entry). Preview a problem. The body shows an empty/error state with a "Couldn't load problem" message and a Retry button. A Notice fires (~4 second toast). Re-enabling network and clicking Retry loads the problem.
result: [pending]

## Summary

total: 8
passed: 1
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

- truth: "Preview tab body should match Obsidian reading-mode rendering — examples in fenced code blocks with grey background, reading-mode font size for prose, inline `code` styled with rounded grey pills."
  status: resolved
  reason: "User reported: examples render as plain text with stray copy icons instead of fenced code blocks; body font is smaller than reading-mode; visual mismatch with the user's reference screenshot."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing:
    - "Wrap LeetCode example <pre> blocks (already converted by turndown) in ```text fenced code blocks before passing to MarkdownRenderer"
    - "Drop CSS overrides that shrink body font below var(--font-text-size); rely on .markdown-rendered defaults like reading mode"
    - "Verify turndown output for LC HTML — confirm <pre> → indented-code-block (4-space) is being mistaken for plain text; switch to fenced (```) via turndown.codeBlockStyle = 'fenced'"
  debug_session: ""

- truth: "Preview header chrome should be a single sticky strip: title (left), difficulty pill, action button (right). Topic chips should NOT appear."
  status: resolved
  reason: "User reported: topic chips 'ArrayHash Table' run together with no separator; user wants topic chips removed entirely; action button floats below chips row instead of sitting in the sticky header strip."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing:
    - "Remove topic chip rendering from ProblemPreviewView.renderHeader"
    - "Restructure header to single flex row: [title + id] [Easy/Medium/Hard pill] [spacer] [action button]"
    - "Ensure header is position: sticky; top: 0; with body scrolling underneath"
    - "Drop .lc-preview__chips and .lc-preview__topic CSS classes"
  debug_session: ""

- truth: "Preview tab supports Enter key to fire the action button (Start Problem / Open Problem)."
  status: resolved
  reason: "User requested: Enter key should activate the action button without requiring mouse click."
  severity: minor
  test: 2
  root_cause: ""
  artifacts: []
  missing:
    - "Add scope.register([], 'Enter', () => this.handleActionClick()) in ProblemPreviewView.onOpen"
    - "Or attach a keydown listener to the view's containerEl that gates on event.key === 'Enter' and !shiftKey/!ctrlKey"
  debug_session: ""
