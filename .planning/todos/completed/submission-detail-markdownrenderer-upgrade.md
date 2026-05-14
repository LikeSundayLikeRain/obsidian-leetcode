---
title: Upgrade SubmissionDetailModal to MarkdownRenderer.render with Component lifecycle
captured: 2026-05-09
resolves_phase: 5
tags: [phase-5, polish, ui, graph-01, pitfall-7]
references:
  - .planning/phases/04-knowledge-graph-wiring/04-04-SUMMARY.md
  - .planning/phases/04-knowledge-graph-wiring/04-VERIFICATION.md (override entry)
  - .planning/phases/04-knowledge-graph-wiring/04-UAT.md (Test 10)
---

# Upgrade SubmissionDetailModal to MarkdownRenderer.render with Component lifecycle

## Current state

`src/graph/SubmissionDetailModal.ts` renders the submission code block as plain
monospace text via `<pre><code class='language-*'>` + `textContent`. No syntax
highlighting. This was an intentional fallback shipped in Phase 4 Wave 3 (Plan
04-04) because the test harness's Modal stub has no live Obsidian
`MarkdownRenderer` — using the real API would break unit tests.

The deviation is recorded in `04-VERIFICATION.md` `overrides[]` as
`accepted_by: "pending — suggested override, not yet accepted"`. User decision
on 2026-05-09 UAT (Test 10): **reject deviation, file Phase 5 gap-closure**.

## What Phase 5 should ship

Rewrite the code-block rendering inside `SubmissionDetailModal.onOpen` to:

1. Use `MarkdownRenderer.render(app, code, container, sourcePath, component)`
   with a proper Obsidian `Component` lifecycle (Pitfall 7 from
   `04-RESEARCH.md`).
2. Wrap the code string in a fenced block ```` ``` + langSlug ```` so
   Obsidian's native highlighting engages.
3. Tie the `Component`'s lifecycle to the modal: create on `onOpen`,
   `component.unload()` on `onClose`. Prevents leaked children (Pitfall 7).
4. Update `tests/graph/SubmissionDetailModal.test.ts`:
   - Replace the mock that asserts `<pre><code>` with an assertion that
     `MarkdownRenderer.render` was called with the expected code and a
     Component instance.
   - Update the mock Modal / obsidian-stub to expose a stub
     `MarkdownRenderer.render` that just writes to the container
     (or `vi.fn()` that records the call args).

## Why this matters

The submission detail modal is a read-only code viewer — syntax highlighting
is the headline UX affordance. Without it the modal reads as a plain-text
dump. Graph View edges + stub creation already ship; polishing this final
rendering step gets Phase 4's "read-only detail viewer" promise fully over
the line.

## Acceptance

- Open the picker on any problem with AC history → click an AC row → the
  code block renders with highlighted tokens matching the submission's
  language (e.g., Java keywords colored, Python strings colored).
- Unit test `SubmissionDetailModal.test.ts` still passes with MarkdownRenderer
  properly mocked.
- After modal close, no orphaned Component children remain (verifiable via
  the stub's unload spy).
- `04-VERIFICATION.md` override entry can be flipped from
  `accepted_by: "pending"` to `accepted_by: "resolved in Phase 5"`.
