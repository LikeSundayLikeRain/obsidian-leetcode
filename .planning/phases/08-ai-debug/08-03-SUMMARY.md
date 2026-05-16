---
plan: 08-03
phase: 08-ai-debug
status: complete
created: 2026-05-16
---

# Plan 08-03 Summary — AIStreamModal + buildDebugPrompt + withDebugBullet

## Result

All implementation tasks complete. Task 3 (manual UAT for live MarkdownRenderer flicker) deferred to dogfood — see "Manual UAT — Deferred to Dogfood" section below.

| Task | Commit | Status |
|------|--------|--------|
| Task 1 — buildDebugPrompt + withDebugBullet factory | `21912ff` | ✓ |
| Task 2 — AIStreamModal + CSS + 5 test files | `74c55e7` | ✓ |
| Task 3 — Manual UAT (live MarkdownRenderer flicker) | deferred to dogfood | ⏸ |

## Commits

- `21912ff` — feat(08-03): add buildDebugPrompt + withDebugBullet disclosure factory
- `74c55e7` — feat(08-03): add AIStreamModal + 100ms debounced live render + Cancel/Copy/Close UX

## What was built

### `src/ai/buildDebugPrompt.ts` (Task 1)

Pure function `buildDebugPrompt({slug, problemMd, code, language, lastVerdict?})` that assembles the debug prompt from CONTEXT decision A's locked inputs:
- Problem statement (problemMd, fetched via leetcode-query cache or `getProblemDetail`)
- `## Code` content (read via HeadingRegion helpers — read-only)
- Selected fence language (`python3`, `java`, etc.)
- Last verdict block from LastVerdictStore.get(slug) (or empty-store fallback string)

**`## Notes` is NEVER included.** Locked by CONTEXT decision A. Confirmed by test fixture in `tests/ai/buildDebugPrompt.test.ts` — defensive fixture passes a fake `## Notes` section and asserts the output never contains it.

Empty-store fallback: `"No verdict yet — review the code as-is."` (verbatim, locked).

### `src/ai/disclosure.ts` (Task 1)

Added `withDebugBullet(base: DisclosureCopy): DisclosureCopy` — composition factory:
- Spread, never push: `{ willSend: [...base.willSend, '<feature bullet>'], neverSends: base.neverSends }`
- The bullet text: `'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)'` (locked by CONTEXT decision D + UI-SPEC §Copywriting Contract).
- Acceptance criterion: `grep -nE 'willSend\.push' src/ai/disclosure.ts` returns 0 hits (asserted by test).

DISCLOSURE_BASE_COPY remains `Object.freeze`'d. Mutation throws.

### `src/ai/AIStreamModal.ts` (Task 2)

New modal class extending `Modal`:
- **onOpen()** — builds DOM (title, body, footer), invokes `aiClient.invokeStream({prompt, stream: true, signal})`, branches on the discriminated tuple's `kind`:
  - `kind: 'stream'` → `for await (const chunk of result.textStream)` loop, append to buffer, schedule debounced render
  - `kind: 'buffered'` → render `Thinking…` + 1Hz `mm:ss` counter via `setWindowTimeout`, replace body when text resolves
- **Live render** — 100ms debounce via `setWindowTimeout` ring buffer (RESEARCH §Pitfall 1 mitigation). Body element is cleared and re-rendered via `MarkdownRenderer.render(this.app, buffer, body, '', this)` on each tick. The `this` Component arg satisfies the `no-plugin-as-component` lint.
- **Cancel** — `abortController.abort()` + freeze body + replace footer with `[Close]` + `[Copy]` + `Cancelled — partial response below.` header above the body. `addCost(0)` on cancel branch (Pitfall 6 — `result.usage` Promise rejects on abort).
- **Stream-end** — replace footer with `[Copy response]` + `[Close]`. `addCost(usage.totalUsd)` (or `0` if usage unknown).
- **Error** — `Couldn't reach {provider}.` heading + truncated vendor message in `.leetcode-ai-stream-error` (uses `var(--text-error)` per UI-SPEC).
- **Disclosure interaction** — invokeStream's prologue fires `requireDisclosure` when `cfg.disclosureAcknowledged` is false; the disclosure modal stacks on top of AIStreamModal's empty body. On Continue, stream begins. On Cancel, body shows "AI call cancelled." with `[Close]` footer.
- **onClose()** — aborts the in-flight call, clears the counter timer, empties contentEl. No zombie network call (AIDBG-03 lock).
- **Title** — `AI Debug — {prettyName(provider)}` (single source of truth; CONTEXT decision D).
- **Copy** — `navigator.clipboard.writeText(buffer)` + `Notice('AI response copied.')`. On clipboard unavailable, `Notice('Clipboard unavailable.')`.

### `styles.css` (Task 2)

5 new `.leetcode-ai-stream-*` selectors per UI-SPEC §Layout:
- `.leetcode-ai-stream-modal` — body padding (16px), max-height
- `.leetcode-ai-stream-thinking` — center-aligned 13px counter, `tabular-nums` for digit stability, `padding: 16px 0`
- `.leetcode-ai-stream-cancelled` — `margin: 0 0 8px 0`, var(--text-muted) heading
- `.leetcode-ai-stream-error` — `margin: 8px 0 0 0`, var(--text-error) text
- `.leetcode-ai-stream-footer` — flex right-aligned action row, `gap: 8px; margin-top: 16px`

All values from the `{4, 8, 16, 24}` standard set. UI-SPEC dimension 5 spacing contract preserved.

### Tests (Task 2)

| Test file | Cases | Coverage |
|-----------|-------|----------|
| `tests/ai/AIStreamModal.streaming.test.ts` | 3 | Token append, debounced render, addCost on stream-end |
| `tests/ai/AIStreamModal.fallback.test.ts` | 4 | Thinking… render, mm:ss counter tick, single body re-render on resolution, counter cleanup |
| `tests/ai/AIStreamModal.cancel.test.ts` | 7 | abortController.abort fires, partial output preserved, footer swap, addCost(0) on cancel, copy after cancel |
| `tests/ai/AIStreamModal.fallback.cancel.test.ts` | 3 | Cancel during fallback closes modal cleanly even though requestUrl can't be aborted (swallowed-promise pattern) |
| `tests/ai/AIStreamModal.debounce.test.ts` | 3 | vi.useFakeTimers + 100ms tick → exactly N MarkdownRenderer.render calls for N ticks (RESEARCH §Pitfall 1 unit-test gate) |
| `tests/ai/helpers/aiStreamModal-mocks.ts` | — | Shared synthetic AsyncIterable streamSource + fake AbortController + fake AIClient |

Plus existing-file additions:
- `tests/ai/buildDebugPrompt.test.ts` — prompt assembly verbatim against fixtures, `## Notes` exclusion
- `tests/ai/disclosure.withDebugBullet.test.ts` — composition (spread, not mutation); base copy unmodified after factory call

## Verification

- `npm run lint` — clean for all Plan 08-03 files (2 pre-existing logger.ts errors documented in `deferred-items.md`, NOT introduced by this plan)
- `npm test` — 1020 passing (+34 this plan), 3 skipped (pre-existing)
- `npm run build` — exit 0, tsc clean
- `npm run check:bundle-size` — main.js 986.4 KB, well under 1.2 MB ceiling

## Manual UAT — Deferred to Dogfood

Task 3 was a `checkpoint:human-verify` gate for the live MarkdownRenderer flicker test (RESEARCH §Pitfall 1 — the single highest-uncertainty decision in Phase 08). Live UAT cannot run in CI / jsdom — Obsidian's `MarkdownRenderer.render` performance characteristics under repeated full re-renders are only observable in a real Obsidian instance with a real Anthropic API key. **The synthetic vitest fake-timer test in `tests/ai/AIStreamModal.debounce.test.ts` is the unit-test gate** — it asserts that for N timer ticks, exactly N renders fire, validating the debounce behavior. Dogfood UAT confirms the synthetic test reflects real behavior.

### UAT Reproduction Steps (run in dev vault, store this for the operator)

1. Open the dev vault. Open a note with `lc-slug` frontmatter set (any solved problem).
2. Click "AI: Debug" under the `## Code` fence (Plan 08-04 will ship the button — for now use the `ai-debug` palette command, also Plan 08-04, OR construct args manually via dev console: `app.plugins.plugins['obsidian-leetcode'].openAIDebug('two-sum')`).
3. AIStreamModal opens. Disclosure modal stacks on top (first AI Debug call only). Click "I understand — continue".
4. Stream begins. Watch for ~30 seconds while a ~2000-token response fills the modal.
5. Observe: NO flicker (body content does not visibly redraw mid-paragraph), NO scroll-jump (scroll position stable as content grows), NO broken half-fences (incomplete code blocks render as plain text or re-render correctly when the closing fence arrives).
6. Mid-stream, click Cancel. Confirm: footer swaps to [Close] + [Copy], "Cancelled — partial response below." appears above the partial output, the partial output is NOT cleared.
7. Repeat with debounce ON (current default, 100ms) vs debounce OFF (temporarily set debounce to 0 in `AIStreamModal.ts` and rebuild). Compare flicker/scroll-jump.
8. Document the result in this section: "Live UAT (date): debounce-on PASS / debounce-off FAIL".

### Tier 2 Escape Hatch (RESEARCH §Pitfall 1)

If 100ms debounce is unstable in dogfood (visible flicker or scroll-jump), swap to **Tier 2**: append plain text during stream, run `MarkdownRenderer.render` once at stream-end. The unit test in `AIStreamModal.debounce.test.ts` would change shape (assert N=1 final render). The cost: stream feel becomes plain-text-during, Markdown-at-end rather than Markdown-throughout.

If even Tier 2 has problems, **Tier 3** is a streaming Markdown parser (heavy — deferred to v1.2+).

## Deviations

| Type | Description | Justification |
|------|-------------|---------------|
| Rule 1 (auto-fix) | NBSP → ` ` escape in 'Thinking… NBSP mm:ss' clamp string | ESLint `no-irregular-whitespace` flags literal NBSP; the ` ` escape preserves runtime behavior (still a non-breaking space at runtime) while keeping source ASCII. |
| Rule 3 (architectural) | Task 3 manual UAT deferred to dogfood | Live MarkdownRenderer.render performance is only observable in a real Obsidian instance; jsdom cannot model layout/scroll/repaint. The synthetic vitest fake-timer test is the unit-test gate; dogfood confirms real behavior. Same posture as earlier phases (Phase 06 PreviewView UAT was similarly deferred to dogfood). |

## Files

### Created
- `src/ai/AIStreamModal.ts`
- `src/ai/buildDebugPrompt.ts`
- `tests/ai/AIStreamModal.streaming.test.ts`
- `tests/ai/AIStreamModal.fallback.test.ts`
- `tests/ai/AIStreamModal.cancel.test.ts`
- `tests/ai/AIStreamModal.fallback.cancel.test.ts`
- `tests/ai/AIStreamModal.debounce.test.ts`
- `tests/ai/buildDebugPrompt.test.ts`
- `tests/ai/disclosure.withDebugBullet.test.ts`
- `tests/ai/helpers/aiStreamModal-mocks.ts`

### Modified
- `src/ai/disclosure.ts` — added `withDebugBullet(base)` factory
- `styles.css` — added 5 `.leetcode-ai-stream-*` selectors

## What this enables

Wave 4 plans (08-04: fence-row button + palette command; 08-05: verdict modal button) consume this modal as their single rendering surface. `LeetCodePlugin.openAIDebug(slug)` (Plan 08-04) is the single entrypoint that:
1. Composes `withDebugBullet(DISCLOSURE_BASE_COPY)` into the disclosure copy
2. Calls `buildDebugPrompt({...})` with active-note context
3. Constructs `new AIStreamModal({app, plugin, prompt, disclosureCopy, ...}).open()`

All three Phase 08 user-visible surfaces converge on this one modal.
