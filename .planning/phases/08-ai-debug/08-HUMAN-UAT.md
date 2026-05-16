---
status: partial
phase: 08-ai-debug
source: [08-VERIFICATION.md]
started: 2026-05-16
updated: 2026-05-16
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live MarkdownRenderer.render flicker check on a real ~2000-token Anthropic stream
expected: 100ms debounced render produces no visible flicker, no scroll-jump, no broken half-fences as content streams in. WR-02 (first-chunk blank window) is acceptable if <100ms; if visible, swap to Tier 2 (append plain text during stream + final Markdown swap).

**Reproduction:**
1. Open dev vault with a note carrying `lc-slug` frontmatter (any solved problem).
2. Configure an Anthropic API key in plugin settings.
3. Click the `AI: Debug` button under the `## Code` fence (or run the `ai-debug` palette command).
4. Disclosure modal appears (first run only) → click `I understand — continue`.
5. AIStreamModal opens. Watch as ~2000-token response streams in.
6. Observe: NO flicker (body content does not visibly redraw mid-paragraph), NO scroll-jump (scroll position stable as content grows), NO broken half-fences (incomplete code blocks render as plain text or re-render correctly when the closing fence arrives).
7. Mid-stream, click Cancel. Confirm: footer swaps to `[Close] + [Copy response]`, "Cancelled — partial response below." appears, partial output is NOT cleared.
8. Repeat with debounce ON (current default 100ms) vs debounce OFF (temporarily set `RENDER_DEBOUNCE_MS = 0` in `AIStreamModal.ts` and rebuild). Compare flicker/scroll-jump.

result: [pending]

### 2. End-to-end smoke on all 3 AI Debug surfaces
expected: All three surfaces (fence-row button, palette command, verdict modal footer) successfully open AIStreamModal via `LeetCodePlugin.openAIDebug(slug)`. Disclosure modal sequencing correct (disclosure stacks first; on Continue, stream begins; on Cancel, modal shows "AI call cancelled."). Close-then-fire ordering on verdict modal does not stack two modals.

**Reproduction:**
1. **Fence-row** (Edit Mode) — open a note with `lc-slug` frontmatter, place cursor in `## Code` fence, click `AI: Debug`. Modal opens.
2. **Fence-row** (Reading Mode) — switch to Reading Mode on the same note, click `AI: Debug`. Modal opens.
3. **Palette command** — open the command palette (`Cmd/Ctrl+P`), search `AI: Debug current code`, select. Modal opens.
4. **Palette command guard** — open the command palette in a note WITHOUT `lc-slug` frontmatter. The `ai-debug` command should NOT appear (editorCheckCallback gate).
5. **Verdict modal footer (Submit failure)** — submit a known-wrong solution. After verdict modal appears with `Wrong Answer`, click `AI: Debug` in footer. Verdict modal CLOSES, AIStreamModal opens (no double-modal stack).
6. **Verdict modal footer (Run failure)** — click Run with a known-failing test case. After verdict modal appears, confirm `AI: Debug` button visible, click it. Same flow.
7. **Verdict modal footer (Accepted)** — submit a correct solution. Verdict modal shows Accepted; AI: Debug button MUST NOT appear.

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

(none yet — all 10 automated must-haves passed)

## Code Review Follow-ups (advisory, non-blocking)

From `08-REVIEW.md` (0 critical, 4 warnings, 5 info):

| ID | Severity | File | Issue | Suggested Fix |
|----|----------|------|-------|---------------|
| WR-01 | Warning | `src/ai/AIStreamModal.ts:461` | Dead-code empty `if` branch in `handleCancel` | Delete branch or implement the documented modal-close fallback |
| WR-02 | Warning | `src/ai/AIStreamModal.ts:246` | Brief blank-flash between Thinking placeholder removal and first debounced render | Render synchronously on first chunk, then debounce subsequent |
| WR-03 | Warning | `src/main.ts:1108` | `as unknown as DetailCacheEntry` double-cast bypasses type safety | Narrow access to `contentHtml` directly OR define explicit adapter |
| WR-04 | Warning | `src/ai/AIStreamModal.ts:255-282` | `addCost` rejection on natural stream-end falls into error UX | Wrap post-completion calls in their own try/catch |
| IN-01 | Info | `src/main.ts:1090` | Dead `?? 'plaintext'` fallback (getDefaultLanguage already returns string) | Drop the fallback or gate explicitly on empty string |
| IN-02 | Info | `src/ai/AIStreamModal.ts:126` | `startMs = 0` initialization yields nonsense duration if onOpen throws early | Initialize `startMs = Date.now()` at field declaration |
| IN-03 | Info | `src/ai/AIStreamModal.ts:483` | `handleInvokeError` falls through to "Couldn't reach {provider}." for non-cancel errors | Add explicit branch for known error messages |
| IN-04 | Info | `src/solve/submissionOrchestrator.ts:316-356` | Verdict-capture try/catch swallow is too broad (40-line body) | Tighten try/catch around `onVerdict(...)` callback only |
| IN-05 | Info | `src/ai/providers/*.ts` | `streamX` returns `StreamTextResult` synchronously — model-construction throw uncaught path | Add unit test for malformed cfg surfacing as buffered fallback error |

These are advisory follow-ups, not phase blockers. They can be addressed in a Phase 08 polish pass or rolled into Phase 09 cleanup.
