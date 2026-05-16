---
phase: 08-ai-debug
verified: 2026-05-16T01:45:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live UAT — MarkdownRenderer.render flicker / scroll-jump at 100ms debounce on a real 2000-token Anthropic stream"
    expected: "Body content fills progressively with no visible blank-flash, no scroll-jump, no sustained paint warnings in devtools. Footer swaps Cancel → [Copy response] [Close] on completion. Cancel mid-stream freezes body + shows 'Cancelled — partial response below.' header."
    why_human: "jsdom cannot model Obsidian's layout/scroll/repaint. The 100ms debounce ring buffer is unit-tested (AIStreamModal.debounce.test.ts) but first-chunk blank-flash (WR-02) and scroll-jump stability are only observable in a live Obsidian instance with a real provider."
  - test: "End-to-end smoke — all 3 AI Debug surfaces open AIStreamModal correctly"
    expected: "(1) Click 'AI: Debug' under ## Code in Edit Mode → modal opens. (2) Cmd-P → 'AI: Debug current code' → modal opens. (3) Submit wrong solution → WA verdict modal → click 'AI: Debug' → verdict modal closes → AIStreamModal opens. Disclosure modal fires on first use only."
    why_human: "Full plugin lifecycle (onload, vault access, live LC API, Obsidian workspace) cannot be exercised in vitest/jsdom."
---

# Phase 08: AI Debug — Verification Report

**Phase Goal:** User can trigger AI Debug from a button under `## Code` (or from the Run/Submit verdict modal on a non-Accepted verdict), see a streaming modal fill in real time (or a "Thinking…" indicator with elapsed-time counter on the `requestUrl` fallback), and Cancel mid-flight without leaving the modal in a bad state.
**Verified:** 2026-05-16T01:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can click "AI: Debug" under `## Code` fence and a modal opens with prompt assembled from problem statement + `## Code` + last run/submit failure | ✓ VERIFIED | `buildCodeBlockButtonRow` appends 3rd button `leetcode-code-action-ai-debug` (`src/main/codeBlockButtonRow.ts:86-91`). Both Edit Mode CM6 widget and Reading Mode post-processor inherit it via shared factory. Click → `aiDebugFromActive()` → `openAIDebug(slug)` (`src/main.ts:1172-1186`). `openAIDebug` builds prompt via `buildDebugPrompt({problemMd, code, language, lastVerdict})` and opens `new AIStreamModal(...)` (`src/main.ts:1069-1153`). Tests: `codeBlockButtonRow.test.ts` (3 children no-prefix, 4 with chevron), `aiDebugCommand.test.ts` (22 cases). |
| 2 | AI Debug modal shows streaming output progressively (debounced 100ms re-render per chunk) | ✓ VERIFIED | `AIStreamModal.ts`: `RENDER_DEBOUNCE_MS = 100`; `for await` loop appends to buffer and calls `scheduleRender()` which fires `MarkdownRenderer.render(this.app, buffer, bodyEl, '', this.component)` after debounce window. Tests: `AIStreamModal.streaming.test.ts` (token append, debounced render), `AIStreamModal.debounce.test.ts` (5 chunks within 100ms → 1 flush call). |
| 3 | Fallback path shows "Thinking…" indicator + mm:ss counter when streaming is unavailable | ✓ VERIFIED | `AIStreamModal.ts:159-163`: initial body shows `'Thinking…'` text. `COUNTER_TICK_MS = 1000`; `startCounter()` ticks via `setWindowTimeout`. On `kind: 'buffered'` result, counter runs until `result.text` Promise resolves, then single `MarkdownRenderer.render` call. Tests: `AIStreamModal.fallback.test.ts` (Thinking… render, mm:ss ticks 00:01/00:02/00:03, clamped at 99:59+, counter cleanup). |
| 4 | User can Cancel mid-flight; partial output preserved; no zombie network call | ✓ VERIFIED | Cancel button → `abortController.abort()`. `onClose()` (lines 201-220) checks `!this.completed && !this.cancelled` and aborts. `signal.aborted` checked FIRST before `err.name` (Pitfall 2 mitigation). `addCost(0)` on cancel (Pitfall 6 mitigation). `swapToCancelledFooter()` prepends "Cancelled — partial response below." above partial output. Tests: `AIStreamModal.cancel.test.ts` (7 cases: abort fires, signal.aborted true, addCost(0), footer swap, partial preserved, onClose anti-zombie, timer cleanup). |
| 5 | Verdict modal footer shows "AI: Debug" button on non-Accepted verdicts and fires openAIDebug | ✓ VERIFIED | `verdictModalRenderer.ts:527`: locked union `kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce'`. Button renders with class `leetcode-ai-debug-action`, label `AI: Debug`. `VerdictModal.ts:139-144`: close-then-fire ordering (`this.close()` BEFORE `this.args.onOpenAIDebug?.()`) prevents modal stacking. Wired at both `VerdictModal` construction sites: `main.ts:1212` (submitFromActive) and `main.ts:1567` (runInterpretedInput). Tests: `VerdictModal.aiDebugButton.test.ts` (21 cases: 5 present, 5 absent, click semantics, DOM order, close-then-fire ordering). |
| 6 | Palette command `ai-debug` fires openAIDebug and is guarded by lc-slug frontmatter | ✓ VERIFIED | `main.ts:490`: `id: 'ai-debug'`, `name: 'AI: Debug current code'`. `editorCheckCallback` validates `isValidSlug(fm?.['lc-slug'])`, returns `false` for non-LC notes. No `hotkeys` field (no default hotkey). No plugin-id prefix (FOUND-03). Tests: `aiDebugCommand.test.ts` (9 edge cases for the callback guard). |
| 7 | LastVerdictStore is in-memory only; per-slug; no data.json writes; captures non-Accepted verdicts | ✓ VERIFIED | `lastVerdictStore.ts`: `private readonly state = new Map<string, LastVerdict>()`. No `loadData`/`saveData` references, no Plugin constructor arg, no workspace reconcile loop. `submissionOrchestrator.ts:322-325`: filter `kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'`. Tests: `lastVerdictStore.test.ts` (7 cases), `submissionOrchestrator.onVerdict.test.ts` (11 cases). |
| 8 | AIRequest/AIResponse carry real fields; eslint-disable suppressions removed; AIClient.invoke cast gone | ✓ VERIFIED | `types.ts`: `AIRequest = { prompt, maxTokens?, stream?, signal? }`, `AIResponse = { text, usdCost, usage? }`. Zero `@typescript-eslint/no-empty-object-type` in file. `AIClient.ts:173`: `const wantStream = req.stream === true;` (cast gone). |
| 9 | Provider stubs replaced with real streamText/generateText; AbortSignal propagated; Phase 07 stub string gone | ✓ VERIFIED | `providers/index.ts`: `streamInvoke` + `bufferedInvoke` on all 5 cases; no `'AIClient.invoke: Phase 08 wires the real call'` in repo. `anthropic.ts:69-72`: `streamText({ abortSignal: signal })` / `generateText({ abortSignal: signal })`. Confirmed across all 4 provider files. Tests: `abortSignal.test.ts` (9 cases), `electronNet.signal.test.ts` (5 cases). |
| 10 | withDebugBullet uses spread (not push); DISCLOSURE_BASE_COPY frozen base unchanged | ✓ VERIFIED | `disclosure.ts:103-106`: `willSend: [...base.willSend, '...bullet...']`. Zero `willSend.push` in file. Bullet verbatim: `'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)'`. Tests: `disclosure.withDebugBullet.test.ts` (5 cases). |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/types.ts` | AIRequest/AIResponse with real fields, no eslint-disable | ✓ VERIFIED | 4-field AIRequest, 3-field AIResponse, 0 lint suppressions |
| `src/solve/lastVerdictStore.ts` | LastVerdict + LastVerdictStore, in-memory only, no Plugin arg | ✓ VERIFIED | 87 lines, Map-only, set/get/clear/dispose |
| `src/ai/AIClient.ts` | invokeStream returning discriminated tuple, disclosure-gate mirrored | ✓ VERIFIED | Lines 222-274; kind:'stream' and kind:'buffered'; gate prologue verbatim |
| `src/ai/providers/anthropic.ts` | streamAnthropic + invokeAnthropicBuffered with abortSignal | ✓ VERIFIED | streamText/generateText from 'ai' (core); abortSignal at lines 72/91 |
| `src/ai/providers/index.ts` | ResolvedAdapter with streamInvoke + bufferedInvoke; no stub string | ✓ VERIFIED | 5 cases × 2 methods; stub string gone |
| `src/ai/buildDebugPrompt.ts` | Pure function; locked "No verdict yet" string; ## Notes excluded | ✓ VERIFIED | 53+ lines; locked literal at line 56; ## Notes only in comments |
| `src/ai/disclosure.ts` | withDebugBullet factory via spread; verbatim bullet | ✓ VERIFIED | Lines 97-108; spread not push; verbatim bullet |
| `src/ai/AIStreamModal.ts` | Modal with stream+fallback+cancel+copy; RENDER_DEBOUNCE_MS=100; anti-zombie onClose | ✓ VERIFIED | 200+ lines; constants at lines 53/60; onClose at lines 201-220 |
| `src/main/codeBlockButtonRow.ts` | 3rd button AI:Debug; aiDebugFromActive on host interface | ✓ VERIFIED | Lines 86-91; CodeBlockButtonRowHost extended at line 13 |
| `src/main.ts` | openAIDebug single-entrypoint; lastVerdictStore field; ai-debug command; onVerdict wiring | ✓ VERIFIED | Field at line 192; command at line 490; openAIDebug at line 1069; onVerdict at line 1261 |
| `src/solve/verdictModalRenderer.ts` | Conditional AI:Debug button; locked visibility union | ✓ VERIFIED | Lines 527-534; union `wa\|tle\|mle\|re\|ce`; class `leetcode-ai-debug-action` |
| `src/solve/VerdictModal.ts` | onOpenAIDebug in args; close-then-fire ordering | ✓ VERIFIED | Lines 37, 139-144; close() before args.onOpenAIDebug?.() |
| `styles.css` | 5 new .leetcode-ai-stream-* selectors | ✓ VERIFIED | 7 hits in file; lines 629, 1361, 1364, 1371, 1377; .leetcode-ai-stream-footer comma-extends .leetcode-verdict-footer at line 629 |
| `scripts/check-bundle-size.mjs` | Ceiling bumped to 1.2MB hard / 1.08MB soft; Rule 3 documented | ✓ VERIFIED | Lines 68-69; comment block lines 33-62 documents architectural rationale |
| `tests/helpers/electronNetStub.ts` | Signal-honoring mock; 40+ lines | ✓ VERIFIED | Created in Plan 08-02; reused by abort signal tests |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/main/codeBlockButtonRow.ts` | `plugin.aiDebugFromActive()` | click handler on 3rd button | ✓ WIRED | `void plugin.aiDebugFromActive()` at line 91 |
| `src/main.ts:openAIDebug` | `new AIStreamModal(app, { ..., disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY) })` | single-entrypoint method | ✓ WIRED | `main.ts:1147-1153`; withDebugBullet composed at call site |
| `src/main.ts:onload` | `this.lastVerdictStore = new LastVerdictStore()` | field instantiation alongside ephemeralTabs | ✓ WIRED | `main.ts:311`; disposed at line 660 |
| `src/ai/AIStreamModal.ts:onOpen` | `aiClient.invokeStream({ prompt, stream: true, signal })` | constructor arg AIClient + AbortController | ✓ WIRED | `AIStreamModal.ts` onOpen invokes invokeStream; discriminated on result.kind |
| `src/ai/AIStreamModal.ts:flushRender` | `MarkdownRenderer.render(this.app, buffer, bodyEl, '', this.component)` | Modal extends Component | ✓ WIRED | Line 358; `this.component` (not `this`) satisfies no-plugin-as-component |
| `src/ai/AIStreamModal.ts:scheduleRender` | `setWindowTimeout(flushRender, 100)` | 100ms debounce ring buffer | ✓ WIRED | Line 346; `RENDER_DEBOUNCE_MS` constant |
| `src/solve/verdictModalRenderer.ts` | `args.onOpenAIDebug?.()` | click handler on conditional button | ✓ WIRED | Line 532; gated by `if (showAIDebugButton && onOpenAIDebug)` |
| `src/solve/VerdictModal.ts` | `this.close()` then `this.args.onOpenAIDebug?.()` | lambda in renderVerdict | ✓ WIRED | Lines 141-143; close-then-fire ordering verified |
| `src/main.ts:VerdictModal construction` | `() => this.openAIDebug(ctx.slug)` | callback at both construction sites | ✓ WIRED | `main.ts:1212` (submitFromActive) and `main.ts:1567` (runInterpretedInput) |
| `src/solve/submissionOrchestrator.ts` | `deps.onVerdict?.(slug, LastVerdict)` | post-pollSubmission capture | ✓ WIRED | Lines 322-351; filter `kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'` |
| `src/ai/providers/anthropic.ts:streamAnthropic` | `streamText({ abortSignal })` | import from 'ai' (core) | ✓ WIRED | Line 69; `from 'ai'` at line 24 |
| `src/ai/AIClient.ts:invokeStream` | `obsidianFetch('stream')` | fetcher injection on createAnthropic({ fetch }) | ✓ WIRED | Line 256 (stream path); line 269 (fallback path) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `AIStreamModal.ts` | `this.buffer` (rendered in bodyEl) | `aiClient.invokeStream(req)` → `result.textStream` async iterable | Yes — real streamText calls; buffered fallback via generateText | ✓ FLOWING |
| `AIStreamModal.ts` | `result.text` (buffered fallback) | `adapter.bufferedInvoke(prompt, signal).then(r => r.text)` | Yes — generateText response | ✓ FLOWING |
| `openAIDebug` in `main.ts` | `lastVerdict` (optional, fed into prompt) | `this.lastVerdictStore.get(slug)` ← `onVerdict` callback ← `submissionOrchestrator` | Yes — populated from LC API terminal response | ✓ FLOWING (undefined on first call — graceful-degrade to "No verdict yet" confirmed) |
| `openAIDebug` in `main.ts` | `problemMd` | `htmlToMarkdown(detail.contentHtml)` — DetailCache or fresh fetch | Yes — same path as ProblemPreviewView | ✓ FLOWING |
| `buildDebugPrompt` | prompt string | `problemMd + code + language + lastVerdict?` (pure function) | Yes — deterministic assembly | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — No runnable entry points outside Obsidian plugin lifecycle. All behavioral contracts are covered by vitest tests (1065 passing, 3 pre-existing skips).

---

### Probe Execution

Step 7c: No probe scripts declared for Phase 08. No `scripts/*/tests/probe-*.sh` files found.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AIDBG-01 | 08-01, 08-03, 08-04, 08-05 | AI Debug trigger from ## Code fence button; sends problem + code + last failure | ✓ SATISFIED | 3rd button in codeBlockButtonRow; openAIDebug single-entrypoint; buildDebugPrompt pure assembly; verdict modal button. Full test coverage. |
| AIDBG-02 | 08-02, 08-03 | Modal progressively fills when streaming; "Thinking…" + elapsed counter on fallback | ✓ SATISFIED (pending live UAT) | AIStreamModal stream path: debounced MarkdownRenderer.render per chunk. Fallback path: Thinking… + setWindowTimeout 1Hz counter. Unit tests cover both paths. Live render flicker UAT deferred to dogfood — see Human Verification section. |
| AIDBG-03 | 08-02, 08-03 | User can cancel in-flight request without leaving modal in bad state | ✓ SATISFIED (pending live UAT) | abortController.abort() on Cancel click; onClose anti-zombie guard; addCost(0) on cancel; partial output preserved; no zombie network call via signal propagation to streamText({ abortSignal }). Unit tested in AIStreamModal.cancel.test.ts (7 cases). Live fallback-Cancel UAT (requestUrl non-abortable path) unit-tested in AIStreamModal.fallback.cancel.test.ts. |

Note: REQUIREMENTS.md traceability table still shows AIDBG-02 and AIDBG-03 as "Pending" — this is a documentation state reflecting that UAT has not yet been run, not a code gap. The implementation is complete and unit-tested.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/ai/AIStreamModal.ts:461-465` | Dead `if` branch with empty body (WR-01 from code review) | ⚠️ Warning | No behavioral impact; cosmetic/maintenance concern |
| `src/ai/AIStreamModal.ts:246-253` | First-chunk 100ms blank window (WR-02 from code review) | ⚠️ Warning | Cosmetic UX flicker; only observable live — deferred to dogfood UAT |
| `src/main.ts:1108` | `as unknown as DetailCacheEntry` double-cast (WR-03 from code review) | ⚠️ Warning | Type-safety gap; runtime currently correct; maintenance risk if field shapes diverge |
| `src/ai/AIStreamModal.ts:255-282` | `addCost` rejection falls into network-error UX handler (WR-04 from code review) | ⚠️ Warning | Wrong error message if cost ledger throws post-stream-success; edge case |
| `src/solve/submissionOrchestrator.ts:316-356` | try/catch scope too broad (IN-04 from code review) | ℹ️ Info | Silently swallows errors in verdict-building logic; debugging opacity only |

No `TBD`, `FIXME`, or `XXX` debt markers found in any Phase 08 source files (debt-marker gate: CLEAN).

The 4 warnings (WR-01..WR-04) are quality-polish items noted in the code review (08-REVIEW.md). None block correctness, security, or the phase goal. All are deferred to Phase 09 cleanup or follow-up commits per the reviewer's non-blocking classification. This verification does NOT mark the phase `gaps_found` on the basis of these advisory items.

---

### Human Verification Required

#### 1. Live MarkdownRenderer.render Flicker Check (Pitfall 1 gate)

**Test:** Open dev vault. Configure Anthropic provider (`sk-ant-...` key, `claude-haiku-4-5` model, confirm Test connection passes). Open a Medium-difficulty problem note with code in `## Code`. Click `AI: Debug` under the fence (or run `app.plugins.plugins['obsidian-leetcode'].openAIDebug('two-sum')` from devtools console). Click "I understand — continue" on the disclosure modal. Observe the ~2000-token stream for ~30-60 seconds.

**Expected:** Body content fills progressively with no visible blank-flash between the Thinking… placeholder disappearing and the first rendered content appearing (WR-02). No scroll-jump as DOM rebuilds with each debounced flush. No broken half-fences during stream. No sustained >100ms `requestAnimationFrame` handler warnings in devtools console. After stream-end, footer shows `[Copy response] [Close]`. Cancel mid-stream: body freezes at current point, "Cancelled — partial response below." appears above partial output, footer becomes `[Copy response] [Close]`.

**Why human:** `jsdom` cannot model Obsidian's layout/scroll/repaint pipeline. The 100ms debounce ring buffer is unit-tested but its visual effect on a real 2000-token stream in a real Obsidian window is only observable live. WR-02 (first-chunk blank window) may or may not be perceptible in practice — this UAT decides whether a fix is needed before AIDBG-02 is fully validated.

**Decision gate:** If smooth (no flicker, no scroll-jump, no sustained paint warnings) → APPROVE Tier 1 (100ms debounce ships). If jank observed → apply Tier 2 swap per RESEARCH §Pitfall 1 (append-text during stream, single MarkdownRenderer.render at end) and re-run UAT.

#### 2. End-to-End Smoke — All 3 AI Debug Surfaces

**Test:** Run the Phase 08 closeout smoke protocol:
1. Open a LeetCode problem note with valid `lc-slug` frontmatter and code in `## Code`.
2. Click `AI: Debug` in the fence button row (Edit Mode) → verify AIStreamModal opens with correct title `AI Debug — Anthropic`.
3. Cmd-P → `AI: Debug current code` → verify same modal opens.
4. Submit a wrong solution to a LeetCode problem → WA verdict modal appears → verify `AI: Debug` button is present in footer → click it → verify verdict modal closes cleanly THEN AIStreamModal opens.
5. Submit an Accepted solution → verify NO `AI: Debug` button appears in the verdict modal footer.

**Expected:** All 3 surfaces open AIStreamModal. Accepted verdict has no AI Debug button. Disclosure modal fires on first use only; subsequent invocations skip it. Cancel works on all 3 invocation paths.

**Why human:** Full Obsidian plugin lifecycle (workspace, vault, live LC API, real modal orchestration) cannot be tested in vitest. The close-then-fire ordering (verdict modal must fully close before AIStreamModal opens) and real disclosure modal stacking are only verifiable in a live session.

---

### Gaps Summary

No actionable gaps found. All 10 must-haves verified. The 4 code-review warnings (WR-01..WR-04) are advisory polish items that do not prevent goal achievement and are deferred to Phase 09 cleanup per the reviewer's non-blocking classification.

The only blocking action before AIDBG-02 and AIDBG-03 can be marked "Complete" in REQUIREMENTS.md is the live UAT described above (Human Verification items 1 and 2). REQUIREMENTS.md should be updated to reflect completion after the operator runs and approves the UAT.

---

_Verified: 2026-05-16T01:45:00Z_
_Verifier: Claude (gsd-verifier)_
