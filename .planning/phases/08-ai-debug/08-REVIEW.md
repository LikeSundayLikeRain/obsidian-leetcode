---
phase: 08-ai-debug
reviewed: 2026-05-16T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - src/ai/types.ts
  - src/ai/AIClient.ts
  - src/ai/AIStreamModal.ts
  - src/ai/buildDebugPrompt.ts
  - src/ai/disclosure.ts
  - src/ai/providers/anthropic.ts
  - src/ai/providers/openai.ts
  - src/ai/providers/openaiCompatible.ts
  - src/ai/providers/ollama.ts
  - src/ai/providers/index.ts
  - src/main.ts
  - src/main/codeBlockButtonRow.ts
  - src/solve/lastVerdictStore.ts
  - src/solve/runArity.ts
  - src/solve/submissionOrchestrator.ts
  - src/solve/VerdictModal.ts
  - src/solve/verdictModalRenderer.ts
  - scripts/check-bundle-size.mjs
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-16
**Depth:** deep
**Files Reviewed:** 18 (plus styles.css scan)
**Status:** issues_found (4 warnings, 5 info — all non-blocking)

## Summary

Phase 08 source is unusually disciplined for the surface area it covers. All locked CONTEXT decisions verify clean: `## Notes` is excluded from the prompt; `LastVerdictStore` is in-memory only with no `loadData/saveData`; `withDebugBullet` uses spread (not `push`), so the frozen `DISCLOSURE_BASE_COPY` is preserved; cost-on-cancel is `addCost(0)`; `lc-isolation` regression is intact (zero `obsidianFetch` imports under `src/api/`, `src/auth/`, `src/browse/`, `src/notes/`, `src/solve/`, `src/graph/`, `src/preview/`); cookie-strip discipline preserved at the `obsidianFetch` seam; no `innerHTML` with AI content (uses `MarkdownRenderer.render` with `this.component` — Phase 06 precedent); no full-prompt or full-response logging anywhere in `src/ai/`; the Phase 07 `(req as { stream?: boolean }).stream === true` cast at AIClient.ts:147 is GONE (replaced with type-clean `req.stream === true`); `ai-debug` palette command is clean-ID, no plugin-id prefix, no default hotkey; the verdict-modal AI Debug button reuses `classifyStatus(code).kind` from `src/solve/statusMap.ts` (no new helper); single entrypoint `LeetCodePlugin.openAIDebug(slug)` services all three surfaces (fence-row, palette, verdict modal). The bundle-ceiling bump documents the architectural reason in detail and the new 1.2 MB hard limit is well-justified by the AI SDK's live consumption.

The defects are all minor: dead-code in a defensive branch, a brief blank-flash window between Thinking-placeholder removal and the first debounced render, a type-cast bypass between `LeetCodeProblemDetail` and `DetailCacheEntry`, and a few documentation/observability rough edges. None block phase completion; none threaten correctness or security.

## Warnings

### WR-01: `handleCancel` contains an explicitly unreachable dead-code branch

**File:** `src/ai/AIStreamModal.ts:461-465`
**Issue:** The `handleCancel` method ends with a defensive comment block:
```typescript
if (this.buffer.length === 0 && this.counterTimer == null) {
  // Defensive: this branch is unreachable on the buffered path because
  // counterTimer is non-null until resolution; left in place to make
  // the modal-close fallback explicit.
}
```
The branch body is empty — there's no fallback action, just a comment. This is genuinely dead code. The `if` produces no observable effect; future maintainers will read this as a placeholder waiting to be implemented. Either fill in the modal-close fallback the comment promises (`this.close();` if no partial output exists) OR delete the branch entirely.
**Fix:**
```typescript
// Option A — implement the fallback the comment describes:
if (this.buffer.length === 0 && this.counterTimer == null) {
  this.close();
}
// Option B — delete the dead branch and keep the prose comment elsewhere if
// it documents something useful.
```

### WR-02: Brief blank-flash between Thinking-placeholder removal and first debounced render

**File:** `src/ai/AIStreamModal.ts:246-253`
**Issue:** When the first stream chunk arrives, the code does:
```typescript
if (!firstChunkSeen) {
  firstChunkSeen = true;
  this.bodyEl.empty();      // <-- Thinking placeholder gone
  this.stopCounter();
}
this.buffer += chunk;
this.scheduleRender();      // <-- 100ms debounce; bodyEl is empty
```
The `RENDER_DEBOUNCE_MS = 100` window means for up to 100 ms the `bodyEl` is visually EMPTY (Thinking gone, no markdown yet). On a fast first-chunk arrival, this produces a visible flicker — empty modal body for ~100 ms before content appears. The 08-RESEARCH §"Pitfall 1" mitigation explicitly anticipates flicker concerns; the first-chunk case is the most user-visible instance.
**Fix:** Render synchronously on the first chunk, then debounce subsequent ones:
```typescript
if (!firstChunkSeen) {
  firstChunkSeen = true;
  this.stopCounter();
  this.buffer += chunk;
  await this.flushRender();   // immediate render, no 100ms blank window
  continue;
}
this.buffer += chunk;
this.scheduleRender();
```

### WR-03: `LeetCodeProblemDetail → DetailCacheEntry` type cast bypasses type safety

**File:** `src/main.ts:1108`
**Issue:**
```typescript
detail = fetched as unknown as DetailCacheEntry;
```
The `as unknown as` double-cast is a known TypeScript escape hatch. The comment claims "the two share contentHtml" — but `LeetCodeProblemDetail` (returned by `client.getProblemDetail`) and `DetailCacheEntry` (returned by `settings.getProblemDetail`) are independent types that could diverge silently. The immediate code only reads `detail.contentHtml` at line 1114, which works today, but if a maintainer later reads other fields (e.g., `detail.metaData`), they'll get whatever `LeetCodeProblemDetail` happens to contain — possibly `undefined` if the field exists in `DetailCacheEntry` but not in `LeetCodeProblemDetail`. This is a type-safety regression waiting to happen.
**Fix:** Either narrow access to just `contentHtml` directly:
```typescript
const contentHtml = detail?.contentHtml ?? fetched.contentHtml ?? '';
const problemMd = htmlToMarkdown(contentHtml);
```
or define an explicit adapter (`toDetailCacheEntry(fetched)`) that maps the fields and surfaces any divergence as a compile error.

### WR-04: `addCost` rejection on natural stream-end falls into the cancel/error branch with wrong UX

**File:** `src/ai/AIStreamModal.ts:255-282`
**Issue:** After natural stream-end, the code path is:
```typescript
this.completed = true;
await this.flushRender();
let cost = 0;
try {
  const usage = await (...).usage;
  if (usage) cost = estimateCostUsd(...);
} catch { cost = 0; }
await this.args.aiClient.addCost(cost);   // <-- if this throws, lands in outer catch (line 283)
this.swapToCompletionFooter();
```
If `addCost` throws (e.g., `SettingsStore.addCostLedger` fails — disk error during `saveData`), execution falls into the outer catch at line 283. There, `signal.aborted === false` (we already completed), so it falls into `handleStreamError(err)` — which renders "Couldn't reach {provider}." That's the WRONG message: the network call succeeded, the response is already rendered into the body, but the footer shows a network-error state and the body shows the successful response. User sees a confusing mixed state.
**Fix:** Wrap the post-completion calls in their own try/catch:
```typescript
this.completed = true;
await this.flushRender();
let cost = 0;
try {
  const usage = await (...).usage;
  if (usage) cost = estimateCostUsd(...);
  await this.args.aiClient.addCost(cost);
} catch (err) {
  // Cost ledger or usage Promise failed — log and proceed; the response is
  // already rendered. Don't repaint the body as an error.
  logger.debug('ai-stream.cost: non-fatal', err);
}
this.swapToCompletionFooter();
```

## Info

### IN-01: `?? this.settings.getDefaultLanguage() ?? 'plaintext'` chain has dead nullish coalescing

**File:** `src/main.ts:1090`
**Issue:**
```typescript
const language = extracted.lang ?? this.settings.getDefaultLanguage() ?? 'plaintext';
```
`getDefaultLanguage()` is typed to return `string` (per `OrchestratorSettings` and the production `SettingsStore`). The middle `?? 'plaintext'` is unreachable unless `getDefaultLanguage()` returns `undefined`/`null`, which the type system rules out. Defensive coding is fine, but this version makes the reader hunt for the case the fallback handles.
**Fix:**
```typescript
const language = extracted.lang ?? this.settings.getDefaultLanguage();
```
…or, if `'plaintext'` is meant as the absolute floor against an empty-string default, gate explicitly:
```typescript
const lang = extracted.lang ?? this.settings.getDefaultLanguage();
const language = lang.length > 0 ? lang : 'plaintext';
```

### IN-02: `startMs = 0` initialization yields nonsense duration if `onOpen` throws before line 170

**File:** `src/ai/AIStreamModal.ts:126`, `src/ai/AIStreamModal.ts:512-516`
**Issue:** `startMs` is class-initialized to `0` and only assigned the real `Date.now()` at line 170 (inside `onOpen`). If anything before line 170 throws (the DOM-create calls — unlikely but not impossible in a hostile or stub environment), the catch path that logs `'ai-stream.finish'` at line 512 would compute `Date.now() - 0` ≈ a 56-year duration. Harmless because logger.debug isn't user-visible, but it's a metrics polluter.
**Fix:** Initialize `startMs = Date.now()` at the field declaration, OR set it as the very first line of `onOpen` before any DOM work.

### IN-03: `handleInvokeError` falls through to "Couldn't reach {provider}." for non-cancel errors

**File:** `src/ai/AIStreamModal.ts:483-497`
**Issue:** The only message `handleInvokeError` distinguishes is `'AI call cancelled'`. Any other invokeStream error (e.g., `'No AI provider configured'` from AIClient.ts:225 — though `openAIDebug` gates this beforehand) renders the network-failure UX. The pre-gate in `openAIDebug:1132` makes this unreachable in practice today, but a future invokeStream error class (e.g., a cap-exceeded error in Phase 09) will silently render as a network failure.
**Fix:** Add an explicit branch for known error messages, OR pass through `handleStreamError` only for actual network errors:
```typescript
if (message === 'AI call cancelled') { ... return; }
if (message === 'No AI provider configured') { ... return; }
// Unknown error class — fall through.
this.handleStreamError(err);
```

### IN-04: Verdict-capture `try/catch` swallow at `submissionOrchestrator.ts:353-356` is too broad

**File:** `src/solve/submissionOrchestrator.ts:316-356`
**Issue:** The block:
```typescript
try {
  // 40 lines of verdict capture + onVerdict invocation
} catch {
  // Capture is best-effort — never propagate errors from the
  // user-supplied callback into the submit flow.
}
```
The 40-line body includes type-coercion logic and `firstNonEmptyString`/`asString` helpers; a runtime throw from any of those is silently swallowed. Catching just the `onVerdict(...)` callback is the documented intent. Pulling the `try` tight to the callback line gives better failure visibility:
**Fix:**
```typescript
const verdict: LastVerdict = { ... };  // build outside try
try {
  this.deps.onVerdict(slug, verdict);
} catch (err) {
  logger.debug('solve.submit.onVerdict: callback threw', err);
}
```

### IN-05: `streamInvoke` returns `StreamTextResult` synchronously — error during model construction is uncaught

**File:** `src/ai/providers/anthropic.ts:63-74` (and analogs in `openai.ts`, `openaiCompatible.ts`, `ollama.ts`)
**Issue:** The `streamX` exports are NOT `async`:
```typescript
export function streamAnthropic(cfg, fetcher, prompt, signal): StreamTextResult<...> {
  return streamText({ model: createAnthropicModel(cfg, fetcher), prompt, abortSignal: signal });
}
```
If `createAnthropic()` or `provider(model)` synchronously throws (e.g., malformed `baseURL`), the throw propagates out of the synchronous return path. In `AIClient.invokeStream` lines 254-266, the `try { ... streamInvoke ... }` catches it and falls through to the buffered path — which is the documented behavior. But the buffered path will likely throw the SAME way, and that throw propagates as the modal's outer-catch network-error UX. The synchronous-throw path is correct but subtle; an explicit unit test would harden this. (Found no `tests/ai/providers/abortSignal.test.ts` per RESEARCH §"Wave 0 Gaps", but this is a different defect.)
**Fix:** Either make `streamX` async (changes the interface) OR add a unit test that asserts a malformed cfg surfaces as the buffered fallback's error path. The current behavior is defensible; this is observability/test-coverage flag only.

## Per-File Notes

### `src/ai/types.ts`
- Empty-interface lint suppressions are removed; types now carry real fields verbatim from CONTEXT decision E. ✓
- `AIRequest.signal` correctly typed as `AbortSignal` (not `AbortController.signal`). ✓
- `AIResponse.usage` is optional with optional `inputTokens`/`outputTokens`. ✓ Matches AI SDK shape.

### `src/ai/AIClient.ts`
- Phase 07 `(req as { stream?: boolean }).stream === true` cast at line 147 is GONE — replaced with type-clean `req.stream === true` at line 173. ✓
- `invokeStream` mirrors `invoke`'s disclosure-gate prologue verbatim — every existing invoke() disclosure-gate test case has an analog (T-08-02-EoP mitigation). ✓
- AbortController cascade at lines 242-249 uses `{ once: true }` — listener auto-removes after firing. ✓ No leak.
- Discriminated tuple `InvokeStreamResult` cleanly separates streaming vs buffered modal paths. ✓
- `'No AI provider configured'` error string is locked verbatim. ✓
- Concern: see WR-04 (cost-add failure mode) and IN-03 (downstream error UX).

### `src/ai/AIStreamModal.ts`
- `MarkdownRenderer.render(this.app, ..., this.component)` 5th arg is a real `Component` instance — satisfies `obsidianmd/no-plugin-as-component` lint rule. ✓
- `Component.load()` fires before any `MarkdownRenderer.render` call (line 147); `unload()` fires in `onClose` (line 218). ✓ No CM6 child-component leaks.
- `onClose` aborts via the same controller as the Cancel button (anti-zombie AIDBG-03). ✓
- `addCost(0)` on cancel branch (Pitfall 6 mitigation). ✓
- `signal.aborted` check FIRST, not `err.name === 'AbortError'` (Pitfall 2 mitigation). ✓
- mm:ss counter clamps at 99:59+ defensively. ✓
- Apostrophe is U+2019 right-single-quote in error heading per UI-SPEC. ✓
- "Cancelled — partial response below." is U+2014 em-dash per UI-SPEC. ✓
- Issues: WR-01 (dead branch), WR-02 (first-chunk flicker), WR-04 (cost-throw mixed state), IN-02 (`startMs=0`), IN-03 (handleInvokeError fall-through).

### `src/ai/buildDebugPrompt.ts`
- Pure function, no I/O, type-only `LastVerdict` import — locked purity contract. ✓
- `## Notes` does NOT appear in output (verified by grep — only in comments). ✓
- Empty-store path emits the literal `'No verdict yet — review the code as-is.'` (U+2014 em-dash). ✓
- Optional verdict fields gate on `!== undefined` — empty-string fields still render but with empty value (acceptable; LC's wire format never returns empty strings for these). ✓
- Tasks list verbatim per RESEARCH §Pattern 3. ✓

### `src/ai/disclosure.ts`
- `withDebugBullet` uses SPREAD (line 103-106), NOT push/mutation. ✓ Frozen base preserved.
- Returns FRESH object whose `willSend` is a NEW array. ✓
- Bullet text locked verbatim per UI-SPEC. ✓
- `neverSends` passes through by reference (frozen, no copy needed). ✓
- Outer object frozen at module load (line 73). ✓ Inner arrays frozen inline (lines 56-67). ✓
- Phase 09/11 will mirror this factory shape (`withReviewBullet`, `withKgBullet`). Pattern documented in JSDoc.

### `src/ai/providers/anthropic.ts`, `openai.ts`, `openaiCompatible.ts`, `ollama.ts`, `index.ts`
- Phase 07 stub `'AIClient.invoke: Phase 08 wires the real call'` replaced with real `streamText`/`generateText` calls. ✓
- Each adapter exports `stream*` (synchronous, returns `StreamTextResult`) and `invoke*Buffered` (async, returns `{ text, usage? }`). ✓
- `abortSignal` propagates uniformly via `streamText({ abortSignal: signal })` / `generateText({ abortSignal: signal })`. ✓
- Cookie-strip discipline preserved at `obsidianFetch` seam (verified at obsidianFetch.ts:83 — `credentials: 'omit'` forced even when caller passes `'include'`). ✓
- `resolveAdapter` exhaustive switch covers all 5 providers — `anthropic`, `openai`, `openrouter`, `ollama`, `custom`. ✓
- Concern: see IN-05 (synchronous throw observability gap).

### `src/main.ts`
- Single entrypoint `openAIDebug(slug)` (line 1069) services all three surfaces:
  1. Fence-row button via `aiDebugFromActive` (line 1172 → 1186)
  2. Palette command `ai-debug` (line 489-501)
  3. Verdict modal footer via `onOpenAIDebug` callback (line 1212 + 1567)
  ✓ T-08-04-T-host single-host mitigation enforced.
- LastVerdictStore field declared at line 192; constructed at line 311; disposed in onunload at line 660. ✓
- `ai-debug` command ID has no plugin-id prefix (FOUND-03). ✓ Sentence-case name. ✓ NO `hotkeys` field (no default hotkey). ✓ `editorCheckCallback` gated by `isValidSlug(fm?.['lc-slug'])`. ✓
- `withDebugBullet(DISCLOSURE_BASE_COPY)` passed to AIStreamModal at line 1152 — composition factory output, frozen base never mutated. ✓
- `onVerdict` callback registered at line 1261 (Submit path) — consistent shape across both Submit and Run code paths.
- Concerns: WR-03 (type cast), IN-01 (dead `??`).

### `src/main/codeBlockButtonRow.ts`
- 3rd button "AI: Debug" appended LAST in DOM order (line 85-93), satisfying `[chevron-prefix?] [Run] [Submit] [AI: Debug]` lock. ✓
- Click handler mirrors Run/Submit verbatim: `preventDefault + stopPropagation + void plugin.aiDebugFromActive()`. ✓
- Class `leetcode-code-action-ai-debug` matches CSS selector group in styles.css. ✓
- Both Edit Mode (CM6 widget) and Reading Mode (post-processor) inherit the 3rd button via the shared factory. ✓

### `src/solve/lastVerdictStore.ts`
- In-memory `Map<slug, LastVerdict>` only — NO `loadData/saveData`. ✓ Decision B preserved.
- Plain Map; no Plugin constructor arg; no `layout-change` reconcile loop. ✓ Mirrors EphemeralTabStore-minus-reconcile by design.
- `set/get/clear/dispose` API — minimal, sufficient. ✓
- Field shape matches `RunCheckResponse`/`SubmitCheckResponse` — `runtimeMs`/`memoryMb` are LC's wire-format strings ('120 ms', '14.5 MB'), not parsed numbers. ✓ Documented.

### `src/solve/runArity.ts`
- New `extractRunFailureForVerdictStore` helper at lines 200-264.
- Reuses `splitInput` + `splitOutput` from same module — no re-implementation. ✓
- `compare_result` mask parsing matches `verdictModalRenderer.ts:170-179` pattern. ✓
- Defensive against missing fields, malformed compare_result, non-array `expected_code_answer`. ✓ NEVER throws.
- Returns partial extract — caller wraps with `kind`, `capturedAt`, `verdictText`. ✓

### `src/solve/submissionOrchestrator.ts`
- `onVerdict` callback registered at deps shape (line 85). ✓ Optional for back-compat with Wave 0 tests.
- Capture filter exact match for RESEARCH §"Code Examples" Example 6: `kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'`. ✓
- Type-only `LastVerdict` import (line 32) — orchestrator never holds a store reference. ✓ T-08-04-T-orch mitigation.
- Verdict capture in try/catch with swallowed error (line 316-356) — best-effort by design.
- Concern: see IN-04 (try/catch scope is too broad).

### `src/solve/VerdictModal.ts`
- `onOpenAIDebug?` callback in `VerdictModalArgs` (line 37). ✓ Optional.
- Close-then-fire ordering at line 139-144 (REVERSED from `onCopyFailingInput` fire-then-close) — prevents AIStreamModal stacking on closing verdict modal (T-08-05-T-stack mitigation). ✓
- Defensive `if (this.args.onOpenAIDebug)` gate at line 139 — passes `undefined` to the renderer when no callback provided, suppressing the button entirely (T-08-05-D-callback-undef). ✓

### `src/solve/verdictModalRenderer.ts`
- Conditional `AI: Debug` button in footer at lines 526-534.
- Visibility union LOCKED to `kind ∈ {wa, tle, mle, re, ce}` — RESEARCH §Pitfall 7 verbatim. ✓
- ABSENT for `ac` (Phase 09 territory), `ole`/`ie`/`unknown`/`unknown-lc` (no actionable failing case). ✓
- Neutral class `leetcode-ai-debug-action` — NO `.mod-cta` (UI-SPEC §Color: only one accent allowed, reserved for `setCta()` on Continue button). ✓
- Defensive truthy gate on `onOpenAIDebug` so the button never paints without a wired callback. ✓
- Reuses existing `classifyStatus(code, msg).kind` from statusMap — no new helper. ✓

### `scripts/check-bundle-size.mjs`
- Hard limit bumped from 1 MB → 1.2 MB (line 68). ✓
- Soft warn bumped from 0.9 MB → 1.08 MB (line 69) — preserves 90% proportional posture. ✓
- Comment block (lines 33-62) thoroughly documents the architectural reason: Phase 07 stubs were tree-shake-false-greens; Phase 08 is the first wave that actually consumes `streamText`/`generateText` so the AI SDK runtime now lands on the bundle graph. Measured `main.js` post-Plan-08-02: 1,010,121 bytes (~986 KB). ✓
- Mainstream Obsidian AI plugin sizes cited as upper-bound anchor (Smart Connections ~1.2 MB, Copilot ~800 KB). ✓
- Rule 3 architectural deviation properly documented (referenced in the comment + per-phase commit). ✓ The 1.2 MB ceiling gives meaningful regression headroom.

### `styles.css` (Phase 08 selectors)
- 5 new `.leetcode-ai-stream-*` selectors (lines 1351-1381). ✓
- `.leetcode-ai-stream-footer` comma-extends the existing `.leetcode-verdict-footer` rule at line 627-634 — zero net new layout, just adds the footer scoping selector to the already-styled token group. ✓
- All colors via Obsidian CSS variables (`--text-muted`, `--text-error`, etc.) — no raw hex/rgba. ✓
- Spacing values from `{4, 8, 16, 24}` only. ✓ Per UI-SPEC.

## Coverage / What I Did Not Review

- **Test files** (`tests/ai/*`, `tests/main/*`, `tests/solve/*`, `tests/helpers/*`, `tests/foundations/*`) — explicitly excluded from review scope.
- **Phase 07 carryovers** that are out-of-scope per `deferred-items.md` (e.g., pre-existing `logger.ts` issues).
- **Live network behavior** — `electron.net.fetch` and `streamText` are exercised behind injected mocks; the actual AbortSignal propagation through the AI SDK to `electron.net.fetch.init.signal` is asserted in tests/ai/providers/* (assumed green per phase-summary; not re-verified).
- **Live UAT** — Pitfall 1 (live Markdown re-render flicker on a 2000-token response) requires manual UAT; not part of source review.
- **Performance** — explicitly out-of-scope for v1 review (`<review_scope>`).
- **Runtime pricing rates** in `src/ai/pricing.ts` — vendor pricing changes; documented as "point-in-time" with ROT CAVEAT in the file header. Not a defect.
- **Bundle-size measurement validity** — the 1.2 MB ceiling is reasonable per cited mainstream AI plugin sizes; I did not re-run `npm run build` to verify the post-Plan-08-02 measurement of 1,010,121 bytes claimed in the comment block.

---

_Reviewed: 2026-05-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
