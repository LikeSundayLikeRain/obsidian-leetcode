# Phase 08 Context — AI Debug

**Phase:** 08 — AI Debug
**Milestone:** v1.1 (Contest, AI Coach, and Preview)
**Date:** 2026-05-15
**Goal:** User can trigger AI Debug from a button under `## Code` (or from the Run/Submit verdict modal on a non-Accepted verdict), see a streaming modal fill in real time (or a "Thinking…" indicator with elapsed-time counter on the `requestUrl` fallback), and Cancel mid-flight without leaving the modal in a bad state.

---

<domain>

This phase delivers the **first user-invokable AI feature** of v1.1:

- A new **AI Debug button** appended to the existing Run/Submit row under `## Code` (3rd button, both Edit Mode CM6 widget AND Reading Mode post-processor — same dual surface as Run/Submit). Mirrors v1.0 D-09 chevron+Run+Submit precedent.
- A **second AI Debug button inside the existing Run/Verdict modal** that appears only when the verdict is non-Accepted (Run with failing test cases, Submit WA/TLE/MLE/RE/CE). Zero-friction "Run failed → Debug" flow without leaving the modal.
- A new **`ai-debug` palette command**, `editorCheckCallback`-guarded so it only fires inside notes with `lc-slug` frontmatter.
- A new **`AIStreamModal`** that opens immediately when AI Debug fires, renders the AI response live as tokens stream in (Markdown re-render per chunk), shows a `Thinking…` + `mm:ss` elapsed-time counter on the `requestUrl` fallback path, and exposes a single Cancel button (immediate-kill, partial output preserved) plus a Copy-to-clipboard button after the stream completes.
- A new **`LastVerdictStore`** — an in-memory `Map<slug, LastVerdict>` on the `LeetCodePlugin` instance — that captures the last non-Accepted verdict from BOTH Run failures AND Submit failures, scoped per-slug. Cleared on plugin reload (mirrors `ephemeralTabStore` precedent).
- The first non-trivial expansion of the **`AIRequest` / `AIResponse` types** Phase 07 left as empty-but-named interfaces. Phase 08 fills in the prompt-assembly fields the streaming path consumes.
- The first feature to **append a feature-specific bullet** to `DISCLOSURE_BASE_COPY.willSend` (composition contract per 07-CONTEXT decision; the Phase 07 commit froze the constant for mutation safety, so Phase 08 extends via spread, not push).
- The first live exercise of the `obsidianFetch('stream')` branch — **Phase 07 wired the seam, Phase 08 actually streams through it**.

Phase 08 ships a single user-visible AI feature; Phase 09 (AI ACed Review) and Phase 11 (Knowledge Graph) reuse the same modal pattern, the same prompt-assembly helpers, the same disclosure-extension contract, and the same LastVerdictStore (Phase 09 reads the AC verdict to decide whether to fire Review).

Requirements covered: **AIDBG-01, AIDBG-02, AIDBG-03** (3 of v1.1's 39).

</domain>

---

<canonical_refs>

Downstream agents (researcher, planner, executor) MUST read these before acting. All paths are repo-relative.

**Project state**
- `.planning/PROJECT.md` — v1.1 milestone scope and decisions.
- `.planning/REQUIREMENTS.md` — AIDBG-01/02/03 wording. Out-of-Scope rows: AI rewriting `## Notes`, auto-debug on every WA, auto-apply AI suggested code, plugin-hosted AI proxy.
- `.planning/ROADMAP.md` — Phase 08 goal + success criteria.
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time:
  - `electron.net.fetch` default with `requestUrl` fallback for streaming AI calls only.
  - Streaming UX cliff is a known concern: validate during Phase 08 dogfood whether the `Thinking…` indicator feels acceptable.

**v1.1 prior phase context (read in full — these are the load-bearing precedents)**
- `.planning/phases/07-ai-provider-foundation/07-CONTEXT.md` — AIClient seam, disclosure gate, obsidianFetch contract, cost ledger.
- `.planning/phases/07-ai-provider-foundation/07-RESEARCH.md` — Vercel AI SDK streaming through `electron.net.fetch`, disclosure persistence, cost-cap scaffolding.
- `.planning/phases/07-ai-provider-foundation/07-PATTERNS.md` — facade + per-provider adapter pattern that Phase 08 must NOT duplicate.
- `.planning/phases/06-foundations-preview-mode/06-CONTEXT.md` — `routeProblemClick` precedent (delegation pattern AI Debug button mirrors), `MarkdownRenderer.render` discipline (preview view as the v1.1 first user of this API).

**Project conventions (from `CLAUDE.md`)**
- All HTTP to `leetcode.com` via `requestUrl` — absolute, no exceptions. AI Debug calls go through `obsidianFetch(mode)` only; the AIPROV-05 grep gate (`scripts/check-no-obsidianfetch-in-lc.sh`) + runtime regression test (`tests/ai/lc-isolation.test.ts`) MUST stay green.
- Plugin-internal CM6 dispatches (if any) use `userEvent: 'leetcode.*'`. Phase 08's modal does NOT write to the editor — no cm.dispatch needed.
- All vault writes use `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden. Phase 08 has **NO vault writes** (the modal is read-only / user-copy-only — AI output never lands in the note; that's Phase 09's job).
- Plugin ID prefix and "command" word forbidden in command IDs. Phase 08 adds `ai-debug` (clean ID, no prefix).
- No `innerHTML` with AI-returned content — `MarkdownRenderer.render(this.app, md, el, '', this)` only, with `this` being the modal (satisfies `no-plugin-as-component`).

**v1.0 / v1.1 code references (read before editing)**
- `src/main.ts:152-310` — `LeetCodePlugin.onload()`. AI Debug button has no new onload wiring (palette command via `addCommand`); LastVerdictStore is a `new Map()` field initialized in onload.
- `src/main.ts:162` — `aiClient!: AIClient;` field. AI Debug invokes `this.aiClient.invoke(req)` — disclosure gate fires automatically per 07-CONTEXT decision D.
- `src/main.ts:854-872` — `requireAIDisclosure(provider, cfg)` already injected into AIClient at onload. No new injection needed; disclosure flow is free for Phase 08.
- `src/main/codeBlockButtonRow.ts:29-66` — `buildCodeBlockButtonRow(doc, plugin, opts)` is the load-bearing precedent. Phase 08 extends with a 3rd button. **Critical**: extension MUST keep the no-prefix Reading-Mode contract (D-09 lock — `tests/main/codeBlockButtonRow.test.ts` asserts no-prefix path produces exactly 2 children today; Phase 08 bumps the assertion to **3** but keeps the no-prefix invariant).
- `src/main/codeActionsEditorExtension.ts` — the CM6 widget that calls `buildCodeBlockButtonRow` with the `prefix` (chevron) factory. AI Debug button rides along automatically once `buildCodeBlockButtonRow` is extended.
- `src/main/codeActionsPostProcessor.ts` — Reading Mode post-processor. Same — gets the 3rd button for free.
- `src/solve/VerdictModal.ts:27-86` — `VerdictModalArgs` + footer construction at the `appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row')` line. Phase 08 adds a conditional **AI Debug button** to the footer when verdict is non-Accepted. Uses the existing `setVerdict` callback / `VerdictModalHandle` so the visibility check fires after the verdict resolves.
- `src/solve/RunModal.ts` — same pattern for Run failures (sample/custom test failures). Add the AI Debug button on the failure footer surface.
- `src/solve/submissionOrchestrator.ts` + `src/solve/pollingOrchestrator.ts` — these resolve the verdict. Phase 08 adds a hook so non-Accepted verdicts call `lastVerdictStore.set(slug, verdict)`.
- `src/notes/HeadingRegion.ts` + `src/notes/NoteTemplate.ts` — `## Code` region detection. AI Debug prompt assembly reads the active note's `## Code` content via these helpers (no cm.dispatch, no `vault.modify` — read-only).
- `src/ai/AIClient.ts:130-160` — `invoke(req)` already routes through `obsidianFetch(req.stream ? 'stream' : 'request')`. Phase 08 sets `req.stream = true` and CONSUMES the streaming Response. The `(req as { stream?: boolean }).stream === true` cast at AIClient line 147 stays — Phase 08 expands `AIRequest` so the cast is no longer needed (planner cleans this up).
- `src/ai/types.ts:60-72` — `AIRequest` and `AIResponse` are empty-but-named interfaces with eslint-disable comments. Phase 08 fills them in (the comments come off; the types now carry real fields).
- `src/ai/disclosure.ts:55-73` — `DISCLOSURE_BASE_COPY` is `Object.freeze`'d (Phase 07 Plan 07 WR-02 mitigation). Phase 08 extension MUST be by composition (spread + append), NEVER by push/mutation. Pattern: `const debugDisclosure = { willSend: [...DISCLOSURE_BASE_COPY.willSend, '<feature line>'], neverSends: DISCLOSURE_BASE_COPY.neverSends };` — passed as a constructor arg if AIDisclosureModal accepts one, or via a small factory in `disclosure.ts` (planner picks the seam shape).
- `src/ai/providers/*.ts` — each adapter wraps a `@ai-sdk/*` provider. The streaming `invoke` path uses `streamText({ model, prompt, abortSignal })` from the AI SDK — researcher confirms exact import surface against the pinned versions.
- `src/shared/timers.ts` — `setWindowTimeout` / `clearWindowTimeout`. The `mm:ss` counter on the fallback path uses these (also satisfies `prefer-window-timers` lint rule).
- `src/preview/ProblemPreviewView.ts` (Phase 06) — load-bearing precedent for `MarkdownRenderer.render(this.app, md, el, '', this)` usage in a non-MarkdownView context. AIStreamModal mirrors.
- `tests/ai/lc-isolation.test.ts` — Phase 07's regression. Phase 08 must NOT trip it (no `obsidianFetch` import from `src/api/`, `src/auth/`, `src/browse/`, `src/notes/`, `src/solve/`, `src/graph/`, `src/preview/`).

**External (researcher to verify against current state at planning time)**
- Vercel AI SDK `streamText` API — return shape (`textStream` async iterable, `usage` for cost tally, `experimental_providerMetadata`); `abortSignal` semantics; behavior when the underlying `fetch` (our `obsidianFetch('stream')`) returns a non-streaming Response (the `requestUrl` fallback path).
- `electron.net.fetch` — confirm the streaming Response's `body` is a real `ReadableStream` consumable by the AI SDK's iterator. Confirm AbortController integration (does `electron.net.fetch` honor `init.signal`?).
- AbortController + `requestUrl` — `requestUrl` does NOT accept a signal. On the fallback path, "cancel" means: ignore the response when it arrives + close the modal. Researcher to confirm whether requestUrl can be aborted at all (likely NOT) and document the user-visible difference.
- Anthropic / OpenAI / OpenRouter / Ollama streaming chat completion endpoints — each one's SSE / chunk format is normalized by the AI SDK; researcher confirms `streamText` works uniformly across all 4 adapters via the `fetch` injection.
- `MarkdownRenderer.render` performance characteristics under repeated re-renders (the live-render-per-chunk decision in C below) — researcher confirms whether re-render N times for a 2000-token response causes flicker / scroll-jump / fence-rendering instability. If it does, the planner adds a debounce window or falls back to in-place text-append + final Markdown swap. **This is the single most uncertain piece of Phase 08 and the planner's verification gate must catch it.**

</canonical_refs>

---

<decisions>

### A. Prompt scope — what AI sees

- **Mandatory inputs** (locked by AIDBG-01):
  1. Problem text — the full statement, examples, constraints (the same Markdown the `## Problem` section of the note holds; assembled via `getProblemDetail(slug)` cache or fresh fetch — same path Preview uses).
  2. `## Code` content — the active fence's text, read via `HeadingRegion` helpers (no cm.dispatch).
  3. Last verdict + failing test — pulled from `LastVerdictStore.get(slug)`.
- **Plus one extra input** (locked):
  4. **Selected code language** — the fence info-string (`python3`, `java`, etc.). The chevron's resolved language at the moment Debug fires. Cheap; lets AI skip a guess.
- **Excluded** (locked):
  - **`## Notes` is NEVER sent.** REQUIREMENTS.md lists "AI rewriting `## Notes`" as out-of-scope; the same posture extends to "AI reading `## Notes`". `## Notes` is the user's reflection scratch space; sending it bleeds personal hypotheses to the provider. The disclosure willSend list for AI Debug must NOT mention `## Notes`.
  - Topic tags + difficulty (deferred — small tokens but unsupported by the user-locked decision; can be added later if dogfood shows AI struggles to calibrate).
  - Problem URL / slug (deferred — same reasoning).
- **Empty-store path** (locked): when `LastVerdictStore.get(slug)` returns undefined (no Run/Submit failure yet), Phase 08 STILL sends the prompt — the failure block becomes a literal `"No verdict yet — review the code as-is."` line. AI Debug gracefully degrades to general code review. Button stays visible (decision C below).
- **Why over per-call `## Notes` toggle / settings toggle**: extra UI surface, leak risk if user forgets they enabled it, and the disclosure copy becomes harder to reason about. Hard rule "never send `## Notes`" matches the project's broader posture and keeps the disclosure modal honest.

### B. LastVerdictStore — capture, scope, persistence

- **Captured on**: BOTH Run failures (any non-pass sample/custom test) AND Submit failures (judge WA / TLE / MLE / RE / CE). Anything that is NOT "Accepted (all tests pass)" populates the store. Mirrors the real debugging flow — user runs sample, sees a fail, hits Debug.
- **NOT captured on**: Accepted submissions (Phase 09's domain — AI Review, not AI Debug).
- **Scope**: per-slug. The store is a `Map<slug, LastVerdict>` on the `LeetCodePlugin` instance. Two problems can be debugged in parallel without their verdicts colliding. Mirrors `EphemeralTabStore` (`src/solve/ephemeralTabStore.ts`).
- **Persistence**: **in-memory only** — cleared on plugin reload. No `data.json` field. Rationale:
  - Debugging is a hot-loop; the verdict is a transient artifact, not a record.
  - No data.json bloat, no shape-guards, no expiry policy to design.
  - Plugin reload is a "fresh start" mental model.
- **`LastVerdict` shape** (illustrative — planner / researcher locks the exact field set):
  ```
  type LastVerdict = {
    kind: 'run-failure' | 'submit-failure';
    capturedAt: number;          // Date.now() — useful only for "was this the most recent action" checks
    verdictText: string;         // human-readable verdict (e.g. 'Wrong Answer', 'Time Limit Exceeded')
    failingInput?: string;       // the input string the judge / sample failed on (when available)
    expectedOutput?: string;     // judge's expected output (when LC returns it)
    actualOutput?: string;       // what the user's code produced
    runtimeMs?: number;          // for TLE
    memoryMb?: number;           // for MLE
    errorMessage?: string;       // for RE / CE — full vendor message
  };
  ```
  Researcher pins the exact shape against what `pollingOrchestrator.ts` + `submissionOrchestrator.ts` actually return today; Plan 08-XX (TBD) writes the type adapter.
- **Why over data.json persistence**: data.json bloat per problem solved, expiry-policy complexity, no real user benefit (a 24-hour-old verdict is probably not the right context anyway).
- **Why over single global last-verdict**: parallel-debugging breaks; user iterating on Two Sum and Add Two Numbers in tabs side-by-side gets a stale prompt.

### C. Button placement — three surfaces

- **Surface 1 — `## Code` button row** (Edit Mode + Reading Mode):
  - The 3rd button in the existing Run/Submit row, label `'AI: Debug'`, appended to `buildCodeBlockButtonRow` (`src/main/codeBlockButtonRow.ts`).
  - **Both Edit Mode (CM6 widget) and Reading Mode (post-processor)** render it — symmetry with Run/Submit. Edit Mode users hit it in flow; Reading Mode users hit it from a solved-but-stale note (Phase 09 will write `## AI Review` near here too).
  - DOM order: `[chevron-prefix?] [Run] [Submit] [AI: Debug]`. CSS layout from D-09 keeps Run/Submit right-aligned; AI Debug rides the right cluster.
  - **Always visible when fence is under `## Code`** — same visibility rules as Run/Submit. No conditional show/hide based on LastVerdictStore (graceful-degrade in decision A handles the empty case in-modal). Predictable, no flicker as CM6 widgets rebuild.
  - Test contract update: `tests/main/codeBlockButtonRow.test.ts` no-prefix path goes from "exactly 2 children" → "exactly 3 children". The no-prefix invariant survives.
- **Surface 2 — Run/Verdict modal footer** (conditional on non-Accepted verdict):
  - When `RunModal` shows a sample-test failure OR `VerdictModal` shows a non-Accepted judge verdict, the footer gains an **'AI: Debug'** button.
  - Click → close the verdict modal, open `AIStreamModal` immediately. Zero-friction "I just saw the failure → ask AI" flow.
  - On Accepted submissions the button is NOT rendered (Phase 09's territory). The check fires in `setVerdict` / `VerdictModalHandle` after the verdict resolves; the button is added or not added — no transition / animation.
  - The button delegates to the SAME `LeetCodePlugin.openAIDebug(slug)` method the fence-row button calls — single entry point.
- **Surface 3 — palette command**:
  - `ai-debug` (clean ID, no prefix). Label: `'AI: Debug current code'` (or planner's call).
  - `editorCheckCallback` guards: only fires when active note has `lc-slug` frontmatter.
  - Mirrors Phase 07 palette-command precedent (`test-ai-connection`, `reset-ai-disclosures`, `clear-ai-key`).
- **Why over Edit-Mode-only**: solved/closed problems are read in Reading Mode; user revisiting an old solve to debug a regression deserves the same affordance.
- **Why over palette-only**: AI Debug is a v1.1 hero feature; surfacing it visually is the whole point.

### D. Modal UX — AIStreamModal

- **Class**: new `src/ai/AIStreamModal.ts` extending `Modal`. Constructor takes `app`, `args` (provider, prompt, abort signal owner, callbacks).
- **Title**: `AI Debug — {provider name}` (e.g. `AI Debug — Anthropic`). `prettyName(provider)` from `src/ai/types.ts` is the single source of truth (Phase 07 D-04).
- **Body render strategy** — **Live Markdown re-render per chunk** (locked, but flagged for verification):
  - Each streamed chunk appends to an internal `responseText` buffer.
  - On every chunk, body element is cleared and re-rendered via `MarkdownRenderer.render(this.app, responseText, body, '', this)`.
  - **Risk**: flicker, scroll-jump, broken half-fences, perf cost on long answers.
  - **Mitigation, planner-led** — researcher MUST validate live-per-chunk vs debounced (e.g. 100 ms throttle) vs append-text-render-at-end before the planner locks. If live-per-chunk is unstable, fall back to append-plain-text-during-stream + final Markdown swap. The user-locked preference is live-per-chunk; engineering reality is the tiebreaker. Document the chosen path in PLAN.md.
- **Footer actions during stream**:
  - One button: **Cancel** (always visible during streaming).
  - Click Cancel → `abortController.abort()` + freeze the response body where it is + replace footer with `[Close]` + `[Copy]` + a "Cancelled" header above the body. Modal stays open. User can copy partial output.
- **Footer actions on stream completion**:
  - Two buttons: **Copy response to clipboard** + **Close**.
  - Copy: `navigator.clipboard.writeText(responseText)` + Notice "AI response copied". On clipboard unavailable, Notice the error (mirrors `VerdictModal.ts:207` precedent).
  - No Re-run button (cost-surprise risk; Phase 09 wires the cap, until then we don't make accidental double-spend trivial).
  - No "Copy code only" button (apply-patch is AIPROV-FUT-03 — explicit out-of-scope for v1.1).
- **Fallback path** (`obsidianFetch('stream')` resolves but the underlying transport is non-streaming, OR `electron.net.fetch` is unavailable):
  - On modal open, body shows literal `'Thinking…'` text + a `mm:ss` counter that ticks once per second via `setWindowTimeout`.
  - When the response arrives (single buffered chunk), counter freezes, body clears, MarkdownRenderer.render runs once.
  - Cancel during fallback: aborts the in-flight call where possible (electron.net.fetch supports `AbortController`; `requestUrl` does NOT — researcher confirms; on `requestUrl` the cancel is "ignore the response when it arrives + close modal" only). The user-visible Cancel button MUST work in both cases — the network call may complete in the background but the modal closes immediately.
- **Lifecycle / cleanup**:
  - `onOpen()` builds DOM + invokes `aiClient.invoke({ ..., stream: true, signal })`.
  - `onClose()` aborts the in-flight call if not already done + clears the counter timer + empties contentEl.
  - No zombie network call at modal close (AIDBG-03 lock).
- **Disclosure modal interaction**:
  - Opening AIStreamModal calls `aiClient.invoke()` which fires `requireDisclosure` if the active provider's `disclosureAcknowledged` is false. The disclosure modal opens FIRST; only on Continue does AIStreamModal start streaming. On Cancel, AIClient.invoke throws `Error('AI call cancelled')` (Plan 07-05 contract); AIStreamModal catches, shows "AI call cancelled" body, footer becomes `[Close]`.
  - There is **no double-modal-stacking** UX concern: the disclosure modal is modal (blocks), and only after it resolves does AIStreamModal's content populate. The stream modal is open during the disclosure (acceptable — its body is empty / `Thinking…` until the disclosure resolves).
- **Disclosure copy extension** (locked):
  - Phase 08 appends ONE feature-specific bullet to `DISCLOSURE_BASE_COPY.willSend` via composition (NOT mutation — the constant is frozen).
  - Bullet text (illustrative; planner finalizes against 08-UI-SPEC if generated): `'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)'`.
  - Composition seam: planner picks between "AIStreamModal accepts a `disclosureCopy` constructor arg" vs "small factory in `src/ai/disclosure.ts` named `withDebugBullet(base) → DisclosureCopy`". Recommended: factory in `disclosure.ts` so Phase 09 / 11 follow the same pattern.
- **Cost ledger**: AIStreamModal calls `aiClient.addCost(usd)` after stream completes (or in the catch on partial-cancel — the AI SDK's `usage` field on the stream-end event is the source of truth; cancel mid-stream usually means usage is unknown and we add `0` per a conservative "don't bill the user for what they cancelled" stance OR add a rough estimate — researcher confirms what `streamText` exposes in the cancelled case and the planner picks). No cap enforcement (Phase 09).

### E. AIRequest / AIResponse expansion

- Phase 07 left `AIRequest` and `AIResponse` as empty-but-named interfaces with `// eslint-disable-next-line @typescript-eslint/no-empty-object-type` on each. Phase 08 fills them in.
- **`AIRequest`** (illustrative shape; researcher / planner confirm against `streamText` API):
  ```
  interface AIRequest {
    /** Single-shot prompt assembled by buildDebugPrompt(...). */
    prompt: string;
    /** Optional: provider-side max tokens. Default: provider-specific cheap-tier value. */
    maxTokens?: number;
    /** When true, route through obsidianFetch('stream'). When false/undefined, requestUrl. */
    stream?: boolean;
    /** AbortController.signal — propagated into streamText({ abortSignal }). */
    signal?: AbortSignal;
  }
  ```
- **`AIResponse`** for non-streaming callers:
  ```
  interface AIResponse {
    text: string;
    /** USD cost added to the daily ledger; zero on Ollama / unknown. */
    usdCost: number;
    /** Optional usage object for diagnostics. */
    usage?: { inputTokens?: number; outputTokens?: number };
  }
  ```
- For streaming callers, `AIClient.invoke({ ..., stream: true })` MUST return an iterable / observable shape — researcher / planner picks between:
  - **Option 1**: separate method `AIClient.invokeStream(req): AsyncIterable<string>` + `getCost()` after stream-end (cleaner separation).
  - **Option 2**: `invoke()` returns `AIResponse | AsyncIterable<string>` discriminated on `req.stream` (one method, type widening).
  - Recommended: **Option 1** — invokeStream is its own method. Mirrors LeetCodeClient's posture (fetchUsername / getProblemDetail are distinct methods, not one polymorphic call). The planner / researcher own this final call.
- The `(req as { stream?: boolean }).stream === true` cast at `src/ai/AIClient.ts:147` (Phase 07 stub) goes away — invokeStream(req) doesn't need the cast.
- Empty-interface lint suppressions in `src/ai/types.ts:60-72` come off; the types now carry real fields.

### F. Streaming transport plumbing

- AIClient.invokeStream (or AIClient.invoke with `stream: true`) → `obsidianFetch('stream')` → `electron.net.fetch` (with `credentials: 'omit'` enforced by Phase 07 Plan 02 T-07-02 mitigation).
- The `@ai-sdk/*` provider's `streamText` is invoked with the cfg's apiKey + baseUrl + model + the **injected `fetch` option** = our `obsidianFetch('stream')`. This is the load-bearing seam Phase 07 wired.
- `streamText` returns an async iterable of text chunks; AIStreamModal consumes via `for await (const chunk of result.textStream)`.
- AbortController owned by AIStreamModal; passed into `streamText({ abortSignal })`. Cancel button calls `controller.abort()`.
- **Fallback path detection**: if `loadElectronNet()` throws (renderer can't access Node require — mobile or sandbox edge cases), `obsidianFetch('stream')` itself throws on first call. AIClient.invokeStream catches, falls back to `obsidianFetch('request')` + non-streaming `generateText()` from the AI SDK, sets a flag the modal reads to render `Thinking…` UX.
- Researcher MUST verify `streamText` works with a non-streaming injected `fetch` (degrades gracefully into a single chunk) — if not, the planner adds an explicit `generateText` call on the fallback path. The success criterion AIDBG-02 explicitly mentions both branches.

### G. Out of scope for this phase (locked)

- **Daily cost cap enforcement** — Phase 09 (AIREV-06). Phase 08 calls `aiClient.addCost(usd)` so the ledger is correct, but does NOT consult `aiDailyCapUsd`.
- **AI ACed Review write to `## AI Review`** — Phase 09. AI Debug NEVER writes to the note. User copies output from the modal manually.
- **Pattern-cluster classification / hub notes** — Phase 11.
- **Auto-debug on every WA** — explicit Out-of-Scope (REQUIREMENTS.md). User must click the button.
- **Auto-apply AI suggested code** — explicit Out-of-Scope. AI suggestions stay in the modal; never overwrite `## Code`.
- **Re-run button in the modal** — deferred to Phase 09 (when cap is enforced) or beyond.
- **"Copy code only" / extract first fence** — apply-patch territory (AIPROV-FUT-03), explicit defer.
- **Per-feature provider routing** — AIPROV-FUT-02, deferred.
- **Sending `## Notes`** — locked decision A; never in v1.1.
- **Token estimation before call** for accurate pre-call cap math — Phase 09 polish.
- **Multi-turn / conversational debug** — Phase 08 is single-shot. The user copies the response or asks again from scratch. Multi-turn is post-v1.1 if at all.

</decisions>

---

<deferred>

Captured here, NOT implemented. These came up during analysis but are out of scope for Phase 08.

- **`## Notes` send toggle** — explicitly rejected in decision A. If user feedback shows debugging needs the user's hypothesis as input, revisit in v1.2. For now, copy-paste from `## Notes` into a follow-up question is the workaround.
- **Topic tags + difficulty in the prompt** — small token cost but rejected in decision A. Could be revisited if dogfood shows AI struggles to calibrate framing.
- **Problem URL / slug in the prompt** — same as above.
- **Re-run button in the modal** — Phase 09 (after cost cap exists).
- **Multi-turn debug** — post-v1.1.
- **Apply-patch / Cursor-style diff** — AIPROV-FUT-03.
- **LastVerdictStore persistence to data.json** — explicitly rejected in decision B for in-memory simplicity.
- **Streaming Markdown render perf optimizations** (debounce / throttle / virtualization) — only adopted if researcher / planner finds the live-per-chunk path unstable in dogfood.
- **AbortController-aware `requestUrl`** — currently `requestUrl` does not honor signals; "cancel" on the fallback path is "ignore response + close modal." If Obsidian later adds signal support, simplify the fallback cancel.
- **Provider-side rate-limit awareness (429 backoff)** — same as Phase 07's open question; no rate limiter shipped here either. Deferred until dogfood surfaces it.

</deferred>

---

<code_context>

Key existing assets new code should reuse (read before writing anything new):

- **`src/ai/AIClient.ts`** — facade; Phase 08 may add `invokeStream(req)` alongside `invoke(req)`. The disclosure gate already wraps both probe + invoke; invokeStream inherits the gate at the seam (same body shape: read cfg → check disclosureAcknowledged → call requireDisclosure if needed → resolve adapter → consume).
- **`src/ai/disclosure.ts`** — `DISCLOSURE_BASE_COPY` is `Object.freeze`'d at module load. Phase 08 extends via composition. Recommended seam: a `withDebugBullet(base)` factory exported from `disclosure.ts`. Same pattern Phase 09/11 will follow (`withReviewBullet`, `withKgBullet`).
- **`src/ai/obsidianFetch.ts`** — the `mode === 'stream'` branch is the streaming seam Phase 07 stubbed; Phase 08 is its first live customer. T-07-02 cookie-strip is enforced — Phase 08 trusts this discipline.
- **`src/ai/providers/*.ts`** — each adapter's `invoke()` currently throws `'AIClient.invoke: Phase 08 wires the real call'` (Phase 07 Plan 02 closing log). Phase 08 replaces these stubs with `streamText` / `generateText` calls. Researcher confirms exact AI SDK import surface against pinned versions (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, plus the `ai` core if needed for `streamText`).
- **`src/ai/types.ts`** — empty `AIRequest` / `AIResponse` interfaces with eslint-disable comments. Phase 08 fills them in; the comments come off; the named brand types now carry real fields.
- **`src/main/codeBlockButtonRow.ts`** — `buildCodeBlockButtonRow` is the load-bearing precedent. Phase 08 extends with a 3rd button. Test contract: `tests/main/codeBlockButtonRow.test.ts` no-prefix path bumps from 2 → 3 children. The host interface adds `aiDebugFromActive(): void | Promise<void>`.
- **`src/main/codeActionsEditorExtension.ts`** + **`src/main/codeActionsPostProcessor.ts`** — both call `buildCodeBlockButtonRow`. Once the row factory adds the AI button, both surfaces inherit it for free.
- **`src/solve/VerdictModal.ts`** + **`src/solve/RunModal.ts`** — modal footer gets a conditional **AI Debug** button when verdict is non-Accepted. The classification helper lives in `src/solve/verdictGuard.ts` (or near it — researcher confirms which file owns the "is this verdict Accepted?" check).
- **`src/solve/submissionOrchestrator.ts`** + **`src/solve/pollingOrchestrator.ts`** — these resolve verdicts. Phase 08 hooks in here so non-Accepted verdicts populate `LastVerdictStore`. Hook posture: a single post-resolve callback (`onVerdict(slug, verdict)`) on the orchestrator, registered by `LeetCodePlugin.onload()`. NOT a runtime side-effect baked into the orchestrator — keep orchestrators pure.
- **`src/notes/HeadingRegion.ts`** + **`src/notes/NoteTemplate.ts`** — `## Code` region detection. Prompt assembly reads the active note's `## Code` content via these helpers (read-only, no cm.dispatch, no `vault.modify`).
- **`src/preview/ProblemPreviewView.ts`** (Phase 06) — the v1.1 first user of `MarkdownRenderer.render(this.app, md, el, '', this)` in a non-MarkdownView context. AIStreamModal mirrors this exact call shape.
- **`src/shared/timers.ts`** — `setWindowTimeout` / `clearWindowTimeout`. The `mm:ss` counter on the fallback path uses these (also satisfies `prefer-window-timers`).
- **`src/shared/logger.ts`** — extend redaction patterns? The AI prompt + response text ARE potentially logged at debug verbosity. The logger already redacts AI keys (Phase 07). The PROMPT itself contains user code — should debug-level logs redact code blocks? Recommended: do NOT log full prompts/responses at any verbosity; log only metadata (provider, model, token-count, duration, ok/err). Researcher confirms whether existing logger calls inside Phase 07's adapters log payloads.
- **`addCommand` patterns in `src/main.ts`** — clean command IDs (no `obsidian-leetcode:` prefix, no "command" word) per Phase 06 FOUND-03. Phase 08 adds: `ai-debug`.
- **`src/solve/ephemeralTabStore.ts`** — load-bearing precedent for `LastVerdictStore`. Both are `Map`-on-Plugin-instance, in-memory only, slug-keyed, cleared on plugin unload.
- **`tests/main/codeBlockButtonRow.test.ts`** + **`tests/solve/VerdictModal.test.ts`** + **`tests/ai/lc-isolation.test.ts`** — test contracts to update / extend / preserve respectively.

</code_context>

---

<plan_hints>

For the planner — likely plan boundaries (researcher / planner have final say):

1. **Plan 08-01: AIRequest/AIResponse expansion + LastVerdictStore + orchestrator hook.** Fills in the empty types (`src/ai/types.ts`), adds `LastVerdictStore` (`src/solve/lastVerdictStore.ts` or `src/ai/lastVerdictStore.ts` — placement TBD), and wires the orchestrator post-resolve callback so non-Accepted verdicts populate the store. Tests cover: capture on Run failure, capture on Submit failure, NO capture on Accepted, per-slug isolation, in-memory clear on plugin unload. **Gates plans 08-02..08-05.**
2. **Plan 08-02: AIClient.invokeStream + provider adapter streaming.** Replaces the per-provider `invoke` stubs with `streamText` (streaming) and (if planner picks Option 1 in decision E) adds `AIClient.invokeStream(req): AsyncIterable<string>`. Validates AI SDK version pin and confirms `streamText` works through `obsidianFetch('stream')`'s injected fetch. Tests cover: each adapter streams via mock electron.net.fetch; fallback to non-streaming generateText when stream unavailable; AbortController propagation; cost ledger updated on stream-end / on-cancel.
3. **Plan 08-03: AIStreamModal + buildDebugPrompt + disclosure copy extension.** Builds `src/ai/AIStreamModal.ts` (live Markdown re-render per chunk OR debounced — researcher's verification gate informs the planner), the prompt-assembly helper (`buildDebugPrompt(slug, code, language, lastVerdict?, problemMd)`), and the `withDebugBullet(DISCLOSURE_BASE_COPY)` composition factory. Tests cover: empty-store path produces "No verdict yet" text; buildDebugPrompt verbatim against fixtures; modal stream-render flow via injected AsyncIterable; Cancel during stream aborts + freezes output; Cancel on fallback path closes modal; modal cleanup on close; disclosure copy extension does NOT mutate base.
4. **Plan 08-04: Fence-row AI Debug button (Edit + Reading) + palette command.** Extends `buildCodeBlockButtonRow` with the 3rd button + `aiDebugFromActive()` host method on the plugin + `ai-debug` palette command. Tests cover: row has 3 children with no-prefix; row has 4 children with chevron-prefix; Edit Mode + Reading Mode parity; palette command guarded by `lc-slug` frontmatter check.
5. **Plan 08-05: Verdict modal AI Debug button (conditional on non-Accepted).** Adds the AI Debug button to `VerdictModal` footer + `RunModal` failure footer; wires the click to `LeetCodePlugin.openAIDebug(slug)` (closes the verdict modal first). Tests cover: button present on WA / TLE / MLE / RE / CE / Run-fail; button absent on Accepted; click closes verdict modal + opens AIStreamModal.

Plan numbering is illustrative; planner's split is authoritative. Plans 08-04 and 08-05 are independent of each other and may execute in parallel after 08-03 lands.

</plan_hints>

---

<success_criteria>

(Mirrors ROADMAP.md Phase 08 success criteria, restated for downstream.)

1. User can click `'AI: Debug'` under the `## Code` fence (Edit Mode AND Reading Mode) and a modal opens with the prompt assembled from problem text + `## Code` + selected language + last run/submit failure (or a "No verdict yet" line when LastVerdictStore is empty).
2. User sees AI output progressively fill the modal when streaming is available (`obsidianFetch('stream')` succeeds); otherwise sees a literal `'Thinking…'` indicator with an `mm:ss` elapsed-time counter that ticks once per second.
3. User can click Cancel at any time during an in-flight AI request; the modal stays open with partial output preserved (when streaming had started) or closes immediately on the fallback path; no zombie network call survives the modal close.
4. User can also trigger AI Debug from the Run/Verdict modal footer when verdict is non-Accepted (Run sample failure OR Submit WA / TLE / MLE / RE / CE).
5. User can run the `ai-debug` palette command from a note with `lc-slug` frontmatter and the same AIStreamModal opens.

Verification: each success criterion maps to an integration test or a manual UAT step, planner to enumerate. Test #2's fallback path specifically requires a manual UAT (the `electron.net.fetch` unavailable case is hard to reproduce in CI; researcher / planner identifies the canonical reproduction).

</success_criteria>

---

<open_questions_for_planning>

Items the researcher / planner should resolve before execution. Not blockers for this CONTEXT.md.

- **Live Markdown re-render-per-chunk stability**: validate against `MarkdownRenderer.render` performance with a 2000-token response. If unstable, plan a debounced render (~100 ms) or append-text-render-at-end fallback. **Single most uncertain decision in Phase 08.**
- Exact AI SDK import for streaming: `streamText` from `ai` (core), or per-provider `streamText` from `@ai-sdk/anthropic` etc.? Pin against current major.
- Whether `streamText({ abortSignal })` propagates abort to the injected `fetch` correctly across all 4 providers.
- Whether `requestUrl` can be aborted at all on the fallback path (likely NO). If NO, the user-visible Cancel on fallback is "close modal + ignore response when it arrives" — confirm + document.
- Cost-ledger posture on cancel mid-stream: `streamText`'s `usage` may be undefined when aborted. Add `0` (don't bill cancelled calls) or estimate from input-tokens-only? Recommended: add `0` to keep posture conservative; document in 08-CONTEXT or plan.
- `AIRequest` shape: prompt + maxTokens + stream + signal — confirm against `streamText` API. Add `temperature`? Probably no (we're not exposing tuning to users in v1.1).
- `AIResponse` vs `AIClient.invokeStream`: Option 1 (separate method) vs Option 2 (one polymorphic method). Recommended Option 1 for symmetry with LeetCodeClient.
- LastVerdictStore file location: `src/solve/lastVerdictStore.ts` (close to orchestrators that populate it) vs `src/ai/lastVerdictStore.ts` (close to consumer). Recommended: `src/solve/`. The solve orchestrators populate; the AI module consumes via injected reference.
- Verdict-classification helper for "is verdict Accepted?": new helper in `src/solve/verdictGuard.ts` or extend `src/solve/statusMap.ts`? Researcher reads both, picks the cleanest seam.
- Exact `LastVerdict` field set: confirm against what `pollingOrchestrator.ts` + `submissionOrchestrator.ts` already produce. Avoid inventing fields they don't surface.
- `withDebugBullet` factory location: `src/ai/disclosure.ts` (recommended) vs colocated with AIStreamModal.
- Whether the AIStreamModal title should include the model name (`AI Debug — Anthropic (claude-haiku-4-5)`) or just the provider. Recommended: provider only, for shorter title and less rot when default model strings update.
- Whether the fence-row button label is `'AI: Debug'`, `'AI Debug'`, or `'Debug'` (alone). UI-SPEC will lock; CONTEXT recommends `'AI: Debug'` for parity with the palette label.
- README "Network use" subsection update — Phase 08 uses the same provider URLs Phase 07 already enumerated. No new hosts. README probably needs no edit for Phase 08; planner confirms.
- Whether `tests/ai/lc-isolation.test.ts` needs any updates (it should NOT — Phase 08 stays inside the AI / solve / main / preview boundary; `obsidianFetch` MUST NOT bleed into solve's existing requestUrl callsites).

</open_questions_for_planning>

---

*Phase 08 context captured: 2026-05-15. Ready for `/gsd-plan-phase 8`.*
