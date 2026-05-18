# Phase 09: AI ACed Review - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

First AI feature that writes to the vault. When the user opts in (settings toggle, default OFF), an Accepted submission triggers a single combined-dimensions AI review (Approach + Efficiency + Code Style) that lands as a new locked-heading `## AI Review` section inside the problem note. The review streams live in the VerdictModal on auto-run, or in an AIStreamModal on manual re-run. Idempotent on re-AC (replaces, never appends). A palette command provides manual re-run.

Phase 09 ships 5 of the 6 AIREV requirements. **AIREV-06 (daily cost cap) is dropped from v1.1** — users monitor spend via provider dashboards.

Requirements covered: **AIREV-01, AIREV-02, AIREV-03, AIREV-04, AIREV-05** (5 of v1.1's 39).

</domain>

<decisions>
## Implementation Decisions

### A. Review output shape — 3 H3 dimensions + attribution

- **D-01: Three H3 sub-headings under `## AI Review`:** `### Approach`, `### Efficiency`, `### Code Style`. Each dimension is a self-contained block. Clean, scannable, follows Obsidian heading hierarchy.
- **D-02: No hard length constraint in the prompt.** AI writes what it deems helpful per dimension. Reviews on Hard problems may be longer than Easy. Natural length produces better insight.
- **D-03: Attribution line includes provider + model + date.** Format: `*Reviewed by {prettyName} ({model}) — {YYYY-MM-DD}*`. Example: `*Reviewed by Anthropic (claude-haiku-4-5) — 2026-05-18*`. Uses `prettyName(provider)` from `src/ai/types.ts` (Phase 07 D-04 SSoT).
- **D-04: Suggested code only when a fundamentally different approach exists.** AIREV-04 says suggested code lands in a separate fence inside `## AI Review`. The prompt instructs: only include a code fence under `### Approach` when the AI identifies a meaningfully different algorithm or technique (e.g., brute-force → hash map). Minor style tweaks get prose only. Keeps `## AI Review` concise on problems where the user already found the optimal approach.

### B. Cost cap — AIREV-06 dropped from v1.1

- **D-05: AIREV-06 (daily cost cap) is dropped from v1.1.** The cost ledger (`SettingsStore.addCostLedger`) continues to accumulate usage (Phase 07 infrastructure) but no cap check gates AI calls. Users monitor their own AI spend via provider dashboards. The cap feature is a future-milestone candidate if dogfood surfaces cost-surprise concerns.

### C. Auto-run trigger + streaming in VerdictModal

- **D-06: Auto-review is opt-in via settings toggle (default OFF).** `PluginData` gains `autoAIReviewOnAC: boolean` (shape-guarded, default `false`). Toggle lives in the AI Settings section.
- **D-07: Auto-review fires after `classifyStatus` confirms AC.** Hooks alongside `KnowledgeGraphWriter.onAccepted` in `main.ts:1291`. NOT inside KnowledgeGraphWriter (that module is graph-only; CF-06 posture preserved).
- **D-08: Review streams live in VerdictModal on AC.** After "Accepted!" renders, the VerdictModal expands with the review streaming below the verdict. User watches the review fill in. Footer gains Close (during stream = cancel + close). On completion, footer shows Copy + Close. Review simultaneously writes to the note via `vault.process`.
- **D-09: Disclosure gate fires via AIClient.invokeStream.** Same as AI Debug — the disclosure modal opens before the first AI call if `disclosureAcknowledged` is false. Review inherits the Phase 07 gate for free.
- **D-10: Disclosure copy extension follows `withDebugBullet` pattern.** `withReviewBullet(DISCLOSURE_BASE_COPY)` factory in `src/ai/disclosure.ts`. Bullet describes what AI Review sends (problem text + `## Code` + solution language). `## Notes` is NEVER sent (locked decision from Phase 08 — same posture applies to Review).

### D. Failure posture — subtle Notice, non-blocking

- **D-11: On auto-review failure (network error, provider down, rate limit), show a subtle Notice.** Text: `'AI review skipped — {reason}'`. The AC celebration is not blocked — VerdictModal already shows "Accepted!" before the review stream starts. The review section is simply not written.
- **D-12: Failure does NOT retry automatically.** User can re-run manually via the palette command if they want the review.
- **D-13: Failure does NOT block the AC flow.** `KnowledgeGraphWriter.onAccepted` (frontmatter + Techniques) runs independently of the AI review. If the AI call fails, the graph write still completes.

### E. Manual re-run command (AIREV-05)

- **D-14: Palette command `rerun-ai-review`.** `editorCheckCallback`-guarded: only fires inside notes with `lc-slug` frontmatter. Label: `'Re-run AI review on current note'`.
- **D-15: Manual re-run opens AIStreamModal (reuses Phase 08 infrastructure).** No VerdictModal available in this context. The review streams in the modal, then writes to the note on completion. Same `withReviewBullet` disclosure copy.
- **D-16: Manual re-run is idempotent.** If `## AI Review` already exists, it is replaced. Same idempotency logic as the auto-run path — single code path for the vault write.

### F. Section placement + template

- **D-17: `## AI Review` placed after `## Notes` (last section in the note).** Order: `## Problem` → `## Code` → `## Techniques` → `## Notes` → `## AI Review`. User's personal notes stay above the AI content. Natural reading flow: solve → reflect → AI feedback.
- **D-18: `## AI Review` injected on first review, not in the note template.** New notes have no `## AI Review` section. `vault.process` appends it after `## Notes` on the first AC review (or manual re-run). Notes without AI review stay clean.
- **D-19: `## AI Review` H2 is locked via `LOCKED_HEADINGS`.** Added to the tuple in `src/notes/NoteTemplate.ts:74`. The H3 sub-headings (### Approach, ### Efficiency, ### Code Style) are NOT locked — user can rename, delete, or annotate them. Body text under the H2 is fully editable.
- **D-20: Idempotent replacement on re-AC (AIREV-03).** `vault.process` finds the `## AI Review` heading, replaces everything from that heading to end-of-file (since it's the last section) with the new review. Never appends a second `## AI Review` block.
- **D-21: All review writes via `app.vault.process`.** NEVER `cm.dispatch`, NEVER `vault.modify`. Matches the locked CF-06 convention. The review is written to the note file directly — safe even when the note is not the active editor tab.

### Claude's Discretion

- Prompt assembly helper name and location (e.g., `buildReviewPrompt` in `src/ai/` or colocated with the review writer).
- Exact prompt wording for the 3 dimensions and the "only suggest code when fundamentally different" instruction.
- VerdictModal streaming implementation: whether to extend VerdictModal directly or compose with a streaming-render helper extracted from AIStreamModal.
- `maxTokens` default for the review call (planner picks based on cost modeling; no user-facing setting).
- Whether the review writer lives in `src/ai/` (close to AIClient) or `src/graph/` (close to KnowledgeGraphWriter). Recommendation: `src/ai/` — the review is an AI feature, not a graph feature.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state
- `.planning/PROJECT.md` — v1.1 milestone scope, BYO key posture, vault-write conventions.
- `.planning/REQUIREMENTS.md` — AIREV-01..05 wording (AIREV-06 dropped). Out-of-Scope rows: AI rewriting `## Notes`, auto-apply AI suggested code.
- `.planning/ROADMAP.md` — Phase 09 goal + success criteria.
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time.

### v1.1 prior phase context (load-bearing precedents)
- `.planning/phases/07-ai-provider-foundation/07-CONTEXT.md` — AIClient seam, disclosure gate, obsidianFetch contract, cost ledger, `prettyName` SSoT.
- `.planning/phases/08-ai-debug/08-CONTEXT.md` — AIStreamModal pattern, `buildDebugPrompt` as prompt-assembly precedent, `withDebugBullet` composition factory, `LastVerdictStore`, `DISCLOSURE_BASE_COPY` extension contract (spread, never mutate).
- `.planning/phases/08.1-streaming-transport-fix-bedrock-provider/08.1-CONTEXT.md` — 3-tier streaming transport chain (native fetch → electron.net → requestUrl-buffered). Phase 09 inherits this for free.
- `.planning/phases/08.2-bedrock-canonical-default-chain/08.2-CONTEXT.md` — AWS credential resolver. No direct bearing on Phase 09 but confirms no AIClient contract changes.

### Project conventions (from `CLAUDE.md`)
- All HTTP to `leetcode.com` via `requestUrl` — absolute, no exceptions. AI calls via `obsidianFetch(mode)`.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden.
- Plugin-internal CM6 dispatches use `userEvent: 'leetcode.*'` to bypass section-lock. Phase 09's `vault.process` writes bypass the lock by design (below CM6).
- `LOCKED_HEADINGS` lives in `src/notes/NoteTemplate.ts:74`; Phase 09 extends with `## AI Review`.
- Plugin ID prefix and "command" word forbidden in command IDs. Phase 09 adds `rerun-ai-review` (clean ID).
- No `innerHTML` with AI-returned content — `MarkdownRenderer.render(this.app, md, el, '', this)` only.

### v1.1 code references (read before editing)
- `src/main.ts:1291` — `classifyStatus` AC gate + `knowledgeGraph.onAccepted()` invocation site. Phase 09 hooks alongside here for auto-review.
- `src/main.ts:1157-1165` — `AIStreamModal` construction in `openAIDebug`. Precedent for review modal on manual re-run.
- `src/ai/AIClient.ts` — `invokeStream(req)` returns `{ kind: 'stream' | 'buffered', ... }`. Phase 09 calls this for the review.
- `src/ai/AIStreamModal.ts` — live streaming modal. Reused for manual re-run (D-15).
- `src/ai/disclosure.ts` — `DISCLOSURE_BASE_COPY` (frozen) + `withDebugBullet` factory. Phase 09 adds `withReviewBullet`.
- `src/ai/types.ts` — `AIRequest`, `AIResponse`, `AIProvider`, `prettyName()`, `AICostLedger`.
- `src/ai/buildDebugPrompt.ts` — prompt assembly precedent. Phase 09 mirrors with `buildReviewPrompt`.
- `src/notes/NoteTemplate.ts:74` — `LOCKED_HEADINGS` tuple. Phase 09 extends.
- `src/main/sectionLockExtension.ts` — imports `LOCKED_HEADINGS`. Adding `## AI Review` to the tuple auto-locks it.
- `src/graph/KnowledgeGraphWriter.ts` — `onAccepted(ctx, terminal)` pipeline. Phase 09's review runs alongside, not inside.
- `src/solve/VerdictModal.ts` — modal where AC is displayed. Phase 09 extends to stream the review on AC.
- `src/solve/verdictModalRenderer.ts` — renders verdict content. Phase 09 extends with review streaming area.
- `src/settings/SettingsStore.ts:844` — `addCostLedger(usd)`. Phase 09 calls this after review completes.
- `src/settings/SettingsStore.ts:103` — `PluginData` shape. Phase 09 adds `autoAIReviewOnAC: boolean`.
- `tests/ai/lc-isolation.test.ts` — MUST stay green. Phase 09 stays inside the AI / graph / solve / main boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AIClient.invokeStream(req)`** — the streaming seam. Phase 09 calls this for both auto-review (in VerdictModal) and manual re-run (in AIStreamModal). Disclosure gate fires automatically.
- **`AIStreamModal`** — full streaming modal with live Markdown render, Cancel, Copy, Close. Reused for AIREV-05 manual re-run.
- **`withDebugBullet(DISCLOSURE_BASE_COPY)` in `src/ai/disclosure.ts`** — composition factory. Phase 09 adds `withReviewBullet` following the same pattern (spread, never mutate the frozen base).
- **`buildDebugPrompt` in `src/ai/buildDebugPrompt.ts`** — prompt assembly precedent. Phase 09 mirrors with `buildReviewPrompt` (problem text + `## Code` + language; no verdict, no `## Notes`).
- **`SettingsStore.addCostLedger(usd)`** — cost ledger accumulation. Phase 09 calls after review completes.
- **`classifyStatus` in `src/solve/statusMap.ts`** — AC classification. Already used at `main.ts:1291`.
- **`prettyName(provider)` in `src/ai/types.ts`** — provider display name SSoT for attribution line.

### Established Patterns
- **`vault.process` for all vault writes** (CF-06) — Phase 09 follows this exclusively.
- **`LOCKED_HEADINGS` tuple extension** — add `## AI Review` to `src/notes/NoteTemplate.ts:74`; section lock auto-applies.
- **`KnowledgeGraphWriter.onAccepted` invocation pattern** (main.ts:1291-1298) — Phase 09 hooks alongside with the same try/catch + debug-log posture for the AI review call.
- **Disclosure extension via composition** — `withReviewBullet` mirrors `withDebugBullet`. Phase 11 will follow with `withKgBullet`.
- **editorCheckCallback guard on palette commands** — `lc-slug` frontmatter check. Same as `ai-debug`.

### Integration Points
- **`main.ts:1291` AC gate** — Phase 09 adds a new code block alongside `knowledgeGraph.onAccepted` for the auto-review.
- **`VerdictModal` footer** — extended with streaming review area on AC. Phase 08 already added the AI Debug button to the non-AC footer; Phase 09 adds the review stream to the AC footer.
- **`PluginData` shape** — new `autoAIReviewOnAC: boolean` field with shape-guard defaulting to `false`.
- **`LOCKED_HEADINGS` array** — gains `'## AI Review'` as the 5th entry.
- **Settings tab AI section** — new toggle for auto-review.

</code_context>

<specifics>
## Specific Ideas

- The user chose streaming the review directly in VerdictModal as the primary UX for auto-review on AC. This is the richest experience — the user watches the review fill in immediately after seeing "Accepted!".
- Attribution line format is precisely: `*Reviewed by {prettyName} ({model}) — {YYYY-MM-DD}*` (italicized Markdown).
- The `## AI Review` section is always the last section in the note, placed after `## Notes`.
- Code suggestions in `### Approach` appear only when AI identifies a fundamentally different algorithm — not for minor style tweaks.

</specifics>

<deferred>
## Deferred Ideas

- **AIREV-06 (daily cost cap)** — dropped from v1.1 by user decision. The cost ledger (`addCostLedger`) continues to accumulate but no cap check gates AI calls. Future-milestone candidate.
- **Re-run button in VerdictModal / AIStreamModal** — deferred from Phase 08 (no cap to prevent double-spend). Still deferred — cap was dropped from v1.1.
- **`## Notes` send toggle** — rejected in Phase 08 decision A. Same posture for Review: `## Notes` is never sent to AI.
- **Per-feature provider routing** — AIPROV-FUT-02. Review uses the same active provider as Debug.
- **Apply-patch / auto-apply suggested code to `## Code`** — AIPROV-FUT-03. Explicitly out of scope (REQUIREMENTS.md).
- **Token estimation before call** — deferred; natural-length reviews make pre-estimation less useful.
- **Multi-turn review conversation** — post-v1.1 if at all. Phase 09 is single-shot.

</deferred>

---

*Phase: 09-ai-aced-review*
*Context gathered: 2026-05-18*
