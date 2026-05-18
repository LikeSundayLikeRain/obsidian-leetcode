# Phase 09: AI ACed Review - Research

**Researched:** 2026-05-17
**Domain:** AI-driven vault writing (Obsidian plugin), streaming modal UX, prompt engineering
**Confidence:** HIGH

## Summary

Phase 09 is the first AI feature that **writes to the vault**. When the user opts in via a settings toggle (default OFF), an Accepted submission triggers a single AI review call covering three dimensions (Approach, Efficiency, Code Style). The response lands as a new locked `## AI Review` section at the end of the problem note. The phase reuses nearly all Phase 07/08 infrastructure (AIClient, AIStreamModal, disclosure, cost ledger) and introduces one new pure prompt assembler (`buildReviewPrompt`), one vault-write transform (`mergeAIReviewSection`), and wiring in two existing modals (VerdictModal for auto-run, AIStreamModal for manual re-run).

All code paths are well-precedented: `buildReviewPrompt` mirrors `buildDebugPrompt`, the vault write mirrors `mergeTechniquesSection`, the disclosure extension mirrors `withDebugBullet`, and the palette command mirrors `ai-debug`. The primary novelty is streaming inside VerdictModal alongside an already-rendered "Accepted!" verdict, which requires extending VerdictModal with a review-streaming area below the verdict chrome.

**Primary recommendation:** Build Phase 09 as 4-5 incremental plans: (1) `buildReviewPrompt` + `mergeAIReviewSection` pure helpers + `withReviewBullet` disclosure factory, (2) `LOCKED_HEADINGS` extension + `PluginData.autoAIReviewOnAC` field + settings toggle, (3) VerdictModal streaming extension for auto-review on AC, (4) `rerun-ai-review` palette command using AIStreamModal, (5) integration wiring in main.ts + tests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Three H3 sub-headings under `## AI Review`: `### Approach`, `### Efficiency`, `### Code Style`
- D-02: No hard length constraint in the prompt — AI writes what it deems helpful per dimension
- D-03: Attribution line: `*Reviewed by {prettyName} ({model}) -- {YYYY-MM-DD}*`
- D-04: Suggested code only when AI identifies a fundamentally different algorithm/technique
- D-05: AIREV-06 (daily cost cap) DROPPED from v1.1 — cost ledger accumulates, no cap gates calls
- D-06: Auto-review opt-in via settings toggle (default OFF) — `autoAIReviewOnAC: boolean`
- D-07: Auto-review fires after `classifyStatus` confirms AC, hooks alongside `knowledgeGraph.onAccepted`
- D-08: Review streams live in VerdictModal on AC — user watches review fill in below "Accepted!"
- D-09: Disclosure gate fires via AIClient.invokeStream (inherited from Phase 07)
- D-10: Disclosure copy extension: `withReviewBullet(DISCLOSURE_BASE_COPY)` in `src/ai/disclosure.ts`
- D-11: On auto-review failure, show subtle Notice: `'AI review skipped -- {reason}'`; non-blocking
- D-12: Failure does NOT retry automatically
- D-13: Failure does NOT block the AC flow — KnowledgeGraphWriter runs independently
- D-14: Palette command `rerun-ai-review` — `editorCheckCallback`-guarded (lc-slug frontmatter)
- D-15: Manual re-run opens AIStreamModal (reuses Phase 08 infrastructure)
- D-16: Manual re-run is idempotent (replaces existing `## AI Review`)
- D-17: `## AI Review` placed after `## Notes` (last section in the note)
- D-18: `## AI Review` injected on first review, not in the note template
- D-19: `## AI Review` H2 locked via `LOCKED_HEADINGS` — H3 sub-headings NOT locked
- D-20: Idempotent replacement on re-AC: vault.process finds `## AI Review`, replaces to EOF
- D-21: All review writes via `app.vault.process` — NEVER `cm.dispatch`, NEVER `vault.modify`

### Claude's Discretion
- Prompt assembly helper name and location (recommend: `buildReviewPrompt` in `src/ai/`)
- Exact prompt wording for the 3 dimensions and "only suggest code when fundamentally different"
- VerdictModal streaming: whether to extend directly or compose with a helper from AIStreamModal
- `maxTokens` default for the review call (recommend: 2048 — covers detailed Hard reviews)
- Whether review writer lives in `src/ai/` or `src/graph/` (recommend: `src/ai/` per CONTEXT)

### Deferred Ideas (OUT OF SCOPE)
- AIREV-06 (daily cost cap) — dropped from v1.1
- Re-run button in VerdictModal/AIStreamModal
- `## Notes` send toggle — rejected; `## Notes` is never sent to AI
- Per-feature provider routing — AIPROV-FUT-02
- Apply-patch / auto-apply suggested code — AIPROV-FUT-03
- Token estimation before call
- Multi-turn review conversation
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIREV-01 | Opt-in auto AI review on AC via settings toggle (default OFF); combined-dimensions LLM call writes review | Settings field `autoAIReviewOnAC`, `buildReviewPrompt` assembler, VerdictModal streaming extension |
| AIREV-02 | Review written to locked `## AI Review` section via `app.vault.process` | `mergeAIReviewSection` pure transform, `LOCKED_HEADINGS` tuple extension |
| AIREV-03 | Idempotent on re-AC — replaces prior review block, never appends | `mergeAIReviewSection` finds heading, replaces to EOF |
| AIREV-04 | Suggested code in separate fence inside `## AI Review` (never auto-applied) | Prompt instruction: only include code fence under `### Approach` when fundamentally different algorithm |
| AIREV-05 | "Re-run AI review on current note" palette command refreshes stale review | `rerun-ai-review` palette command with `editorCheckCallback` guard, opens AIStreamModal |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt assembly | Frontend Server (Plugin logic) | -- | Pure function, no I/O; mirrors `buildDebugPrompt` |
| AI API call (streaming) | Frontend Server (Plugin logic) | -- | AIClient.invokeStream already handles transport |
| Vault write (`## AI Review`) | Frontend Server (Plugin logic) | -- | `vault.process` operates on the file system via Obsidian's vault API |
| Streaming UX in VerdictModal | Browser / Client (DOM) | -- | Modal DOM manipulation, MarkdownRenderer.render |
| Streaming UX in AIStreamModal | Browser / Client (DOM) | -- | Reuses Phase 08 modal entirely |
| Settings toggle | Browser / Client (DOM) | -- | Obsidian `PluginSettingTab` + `Setting` API |
| Section locking | Browser / Client (CM6 extension) | -- | Extends `LOCKED_HEADINGS` tuple; CM6 filter auto-applies |

## Standard Stack

### Core (all existing -- no new npm dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (built-in) | 1.12.3 | `app.vault.process`, `MarkdownRenderer.render`, `Modal`, `Notice` | Runtime API; all vault writes and DOM rendering |
| `AIClient.invokeStream` (internal) | Phase 08 | Streaming AI call with disclosure gate + abort | Already built; Phase 09 calls it identically to AI Debug |
| `AIStreamModal` (internal) | Phase 08 | Full streaming modal (manual re-run) | Reused directly for AIREV-05 |
| `@ai-sdk/*` (transitive) | Phase 07 | Provider adapters | Already bundled; no additional install |

### Supporting (all existing)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `estimateCostUsd` (internal) | Phase 08 | Cost estimation from token usage | After review completes, before addCost |
| `prettyName` (internal) | Phase 07 | Provider display name for attribution line | D-03 attribution format |
| `DISCLOSURE_BASE_COPY` (internal) | Phase 07 | Frozen disclosure copy base | `withReviewBullet` composition |

**Installation:** No new packages required. Phase 09 is pure internal code.

## Package Legitimacy Audit

> Not applicable -- Phase 09 installs zero external packages. All functionality is built using existing internal infrastructure from Phases 07-08.

## Architecture Patterns

### System Architecture Diagram

```
AC Submission
     |
     v
classifyStatus === 'ac'  ──────────────────────────────────────────┐
     |                                                              |
     ├── knowledgeGraph.onAccepted(ctx, terminal)  [independent]    |
     |                                                              |
     └── if (autoAIReviewOnAC) ─────────────────────────────────────┤
              |                                                      |
              v                                                      |
     buildReviewPrompt(problemMd, code, language)                   |
              |                                                      |
              v                                                      |
     aiClient.invokeStream({ prompt, stream: true })                |
              |                                                      |
              ├── [stream chunks] ──> VerdictModal streaming area    |
              |                                                      |
              v                                                      |
     on stream complete:                                            |
       1. mergeAIReviewSection(noteBody, reviewMd)                  |
       2. vault.process(file, transform)                            |
       3. addCost(estimated)                                        |
              |                                                      |
              v                                                      |
     Footer: [Close]                                                |
                                                                     |
"Re-run AI review" palette command ──────────────────────────────────┘
     |
     v
buildReviewPrompt(problemMd, code, language)
     |
     v
new AIStreamModal({ prompt, aiClient, ... }).open()
     |
     v
on stream complete:
  1. mergeAIReviewSection(noteBody, reviewMd)
  2. vault.process(file, transform)
  3. addCost(estimated)
```

### Recommended Project Structure
```
src/ai/
├── buildReviewPrompt.ts     # Pure prompt assembler (mirrors buildDebugPrompt.ts)
├── mergeAIReviewSection.ts  # Pure vault-write transform (mirrors mergeTechniquesSection.ts)
├── disclosure.ts            # +withReviewBullet factory (alongside withDebugBullet)
├── AIClient.ts              # Unchanged — Phase 09 calls invokeStream as-is
├── AIStreamModal.ts         # Unchanged — reused for manual re-run
└── types.ts                 # Unchanged
src/notes/
└── NoteTemplate.ts          # +AI_REVIEW_HEADING_LINE constant + LOCKED_HEADINGS extension
src/solve/
└── VerdictModal.ts          # Extended: streaming review area on AC
src/settings/
└── SettingsStore.ts         # +autoAIReviewOnAC field + shape-guard
src/main.ts                  # Wiring: AC hook, palette command, settings toggle
```

### Pattern 1: Pure Vault-Write Transform (mergeAIReviewSection)
**What:** A pure function that takes the full note body and the review markdown, and returns the new body with `## AI Review` replaced (or appended after `## Notes`).
**When to use:** Inside `vault.process` callback for idempotent section replacement.
**Example:**
```typescript
// Source: mirrors src/graph/mergeTechniquesSection.ts pattern
export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const AI_REVIEW_HEADING = '## AI Review';
  
  // Find existing ## AI Review
  const start = lines.findIndex(l => l === AI_REVIEW_HEADING);
  
  if (start >= 0) {
    // D-20: Replace from heading to EOF (last section)
    const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_REVIEW_HEADING + '\n\n' + reviewContent + '\n';
  }
  
  // D-17: Insert after ## Notes (last section position)
  // Find ## Notes, then find the next H2 after it (or EOF)
  const notesIdx = lines.findIndex(l => l === '## Notes');
  let insertionIdx = lines.length;
  if (notesIdx >= 0) {
    for (let i = notesIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) { insertionIdx = i; break; }
    }
  }
  
  const before = lines.slice(0, insertionIdx).join('\n').replace(/\n+$/, '');
  const after = lines.slice(insertionIdx).join('\n');
  const gluePost = after.length > 0 ? '\n\n' : '\n';
  return before + '\n\n' + AI_REVIEW_HEADING + '\n\n' + reviewContent + '\n' + gluePost + after;
}
```

### Pattern 2: Prompt Assembly (buildReviewPrompt)
**What:** Pure function assembling the AI review prompt from problem + code + language.
**When to use:** Before both auto-review and manual re-run calls.
**Example:**
```typescript
// Source: mirrors src/ai/buildDebugPrompt.ts pattern
export interface BuildReviewPromptArgs {
  problemMd: string;
  code: string;
  language: string;
}

export function buildReviewPrompt(args: BuildReviewPromptArgs): string {
  return [
    'You are reviewing an Accepted LeetCode solution. Provide constructive feedback in three sections.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Review instructions',
    'Write your review under exactly three headings:',
    '',
    '### Approach',
    'Evaluate the algorithm choice. If a fundamentally different approach (e.g., brute-force replaced by hash map, O(n^2) by O(n log n)) exists AND would be meaningfully better, include the alternative in a fenced code block. Do NOT include code for minor style tweaks.',
    '',
    '### Efficiency',
    'State time and space complexity. Note if optimal or if improvement is possible.',
    '',
    '### Code Style',
    'Comment on readability, naming, edge-case handling, and idiomatic usage for the language.',
    '',
    'Be concise. Do not restate the problem. Do not congratulate.',
  ].join('\n');
}
```

### Pattern 3: Disclosure Copy Extension (withReviewBullet)
**What:** Composition factory that creates a fresh disclosure copy object with the review-specific bullet appended.
**When to use:** Before any AIClient call in the review path.
**Example:**
```typescript
// Source: mirrors withDebugBullet in src/ai/disclosure.ts
export function withReviewBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI Review sends the problem statement and your accepted solution code',
    ],
    neverSends: base.neverSends,
  };
}
```

### Pattern 4: VerdictModal Review Streaming Extension
**What:** After rendering "Accepted!", VerdictModal appends a streaming area below the verdict chrome where the AI review fills in progressively.
**When to use:** Only when `autoAIReviewOnAC` is enabled AND `classifyStatus === 'ac'`.
**Key design choices:**
- The review streaming area is a separate div below the verdict content
- Uses the same `MarkdownRenderer.render` + debounce pattern as AIStreamModal
- Footer transitions: verdict shows [Close] initially; during review stream shows [Close (cancel review)]; on completion shows [Close]
- Failure is non-blocking: if the stream fails, show a subtle Notice and leave the modal in its "Accepted!" state

### Pattern 5: Palette Command Guard
**What:** `editorCheckCallback` that enables the command only when the active note has `lc-slug` frontmatter.
**When to use:** For the `rerun-ai-review` command registration.
**Example:**
```typescript
// Source: mirrors ai-debug palette command pattern in src/main.ts:486-505
this.addCommand({
  id: 'rerun-ai-review',
  name: 'Re-run AI review on current note',
  editorCheckCallback: (checking, editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm?.['lc-slug']) return false;
    if (!checking) { void this.runAIReview(fm['lc-slug'] as string, file); }
    return true;
  },
});
```

### Anti-Patterns to Avoid
- **Never use `vault.modify` for the review write** — CF-06 convention; `vault.process` is atomic and retry-safe
- **Never use `cm.dispatch` for the review write** — the review is written to the file, not the editor; `vault.process` operates below CM6 and bypasses the section lock by design
- **Never send `## Notes` to AI** — locked decision from Phase 08, same posture for Review
- **Never block AC flow on review failure** — D-13 is explicit; the review is best-effort
- **Never mutate `DISCLOSURE_BASE_COPY` in place** — frozen object; use composition factory
- **Never auto-apply suggested code to `## Code`** — out of scope (REQUIREMENTS.md)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming AI call | Custom fetch + SSE parser | `AIClient.invokeStream` | Already handles 3-tier transport, disclosure, abort |
| Streaming modal for re-run | Custom streaming modal | `AIStreamModal` (Phase 08) | Full debounced render + cancel + copy already built |
| Cost estimation | Manual token counting | `estimateCostUsd` (Phase 08) | Handles per-model pricing tables |
| Provider display name | Inline switch | `prettyName` (Phase 07) | SSoT for brand strings |
| Section lock | Custom CM6 filter for `## AI Review` | Extend `LOCKED_HEADINGS` tuple | Auto-applies via existing `sectionLockExtension.ts` |
| Disclosure gate | Manual modal open before call | `AIClient.invokeStream` internal gate | Disclosure fires automatically via `requireAIDisclosure` |

**Key insight:** Phase 09 is 90% wiring of existing Phase 07/08 infrastructure. The novel code is the prompt assembler, the vault-write transform, and the VerdictModal streaming extension. Everything else is a reuse story.

## Common Pitfalls

### Pitfall 1: Race Between KnowledgeGraphWriter and AI Review Write
**What goes wrong:** Both `knowledgeGraph.onAccepted` and the AI review write call `vault.process` on the same file. If they run concurrently, one may overwrite the other's changes.
**Why it happens:** Both fire at the same AC gate in main.ts. If the AI review starts streaming immediately while KnowledgeGraphWriter is writing frontmatter + Techniques, the vault.process calls may race.
**How to avoid:** Fire them sequentially: `await knowledgeGraph.onAccepted(...)` FIRST (it's fast -- local-only writes), THEN start the AI review stream. The review stream is async (network-dependent) so the ordering is: graph write (ms) -> review stream start (seconds). Alternatively, the review `vault.process` call happens only AFTER the stream completes (seconds later), by which time KnowledgeGraphWriter is long done.
**Warning signs:** `## Techniques` section disappears after AI review writes; frontmatter reverts.

### Pitfall 2: VerdictModal Closed Before Stream Completes
**What goes wrong:** User clicks Close while the review is streaming. If the abort + cleanup isn't handled, the vault.process write fires on a stale file reference or the modal's DOM references are null.
**Why it happens:** VerdictModal's `onClose()` fires on Esc/X/overlay-click.
**How to avoid:** Mirror AIStreamModal's anti-zombie pattern: `onClose()` aborts the review stream via AbortController. The vault.process write is gated by a `completed` flag that only flips on natural stream end. If aborted, the review simply isn't written (D-11 posture: non-blocking failure).
**Warning signs:** Unhandled promise rejections in console; partial `## AI Review` section in the note.

### Pitfall 3: Idempotent Replacement Edge Cases
**What goes wrong:** `mergeAIReviewSection` fails to find the existing `## AI Review` heading because of trailing whitespace, extra newlines, or the heading being at different positions.
**Why it happens:** Users may manually edit below `## AI Review`; whitespace drift between writes.
**How to avoid:** Match the heading EXACTLY as `'## AI Review'` (same as `mergeTechniquesSection` matches `TECHNIQUES_HEADING_LINE`). Since `## AI Review` is the LAST section (D-17), replacement is from the heading line to EOF. This is simpler than the Techniques case (no "find next H2" needed for the end boundary).
**Warning signs:** Duplicate `## AI Review` sections in notes; test assertions on idempotency.

### Pitfall 4: Attribution Line Date Uses Wrong Timezone
**What goes wrong:** The attribution date `{YYYY-MM-DD}` doesn't match the user's local date.
**Why it happens:** Using `new Date().toISOString().slice(0,10)` gives UTC date, which may differ from local date.
**How to avoid:** Use a local-date formatter: `new Date().toLocaleDateString('en-CA')` (returns YYYY-MM-DD in ISO format) or manually construct from `getFullYear()/getMonth()/getDate()`.
**Warning signs:** Review dated "tomorrow" for users in UTC+ timezones.

### Pitfall 5: Section Lock Not Auto-Applied After Adding to LOCKED_HEADINGS
**What goes wrong:** Adding `'## AI Review'` to the `LOCKED_HEADINGS` array but the section lock doesn't actually lock it in the editor.
**Why it happens:** The `sectionLockExtension.ts` imports `LOCKED_HEADINGS` from `NoteTemplate.ts` and iterates it. However, the lock extension's `computeLockedRanges` function has a `HeadingKind` type discriminator with a fixed set: `'problem' | 'code' | 'techniques' | 'notes'`. Adding a 5th heading requires extending this type AND the per-kind range emission logic.
**How to avoid:** Add a new `'ai-review'` kind to `HeadingKind` with the same lock semantics as `'notes'` (heading line locked, body editable). The H3 sub-headings are NOT in `LOCKED_HEADINGS` and remain editable (D-19).
**Warning signs:** User can delete the `## AI Review` heading line in the editor; test for lock coverage.

### Pitfall 6: Cost Ledger Omitted on Buffered Fallback
**What goes wrong:** When the stream falls through to TIER 3 (buffered), the `kind: 'buffered'` branch returns `text: Promise<string>` with no usage info. If the review writer forgets to call `addCost(0)`, the cost ledger logic is inconsistent.
**Why it happens:** AIStreamModal already handles this (calls `addCost(0)` on buffered path). But the VerdictModal streaming extension is new code that must replicate this discipline.
**How to avoid:** Both code paths (VerdictModal auto-review + AIStreamModal manual re-run) must call `addCost(estimatedCost)` on stream completion and `addCost(0)` on cancel/buffered. Mirror AIStreamModal's existing pattern exactly.
**Warning signs:** Missing `addCost` calls in the VerdictModal extension code.

## Code Examples

### Vault Write: Idempotent ## AI Review Section
```typescript
// Source: mirrors src/graph/mergeTechniquesSection.ts architecture
// Pure function safe inside vault.process retry semantics.

import { NOTES_HEADING_LINE } from '../notes/NoteTemplate';

export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;
const H2 = /^## /;

export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex(l => l === AI_REVIEW_HEADING_LINE);

  if (start >= 0) {
    // D-20: ## AI Review is the LAST section -- replace from heading to EOF.
    const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
  }

  // D-17/D-18: First review -- insert after ## Notes (or EOF).
  let insertionIdx = lines.length;
  const notesIdx = lines.findIndex(l => l === NOTES_HEADING_LINE);
  if (notesIdx >= 0) {
    // Walk past Notes content to the next H2 (or EOF).
    for (let i = notesIdx + 1; i < lines.length; i++) {
      if (H2.test(lines[i])) { insertionIdx = i; break; }
    }
  }

  const before = lines.slice(0, insertionIdx).join('\n').replace(/\n+$/, '');
  const after = lines.slice(insertionIdx).join('\n');
  const gluePost = after.trim().length > 0 ? '\n\n' : '\n';
  return before + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + gluePost + after;
}
```

### Attribution Line Construction
```typescript
// Source: D-03 locked format
function buildAttributionLine(provider: AIProvider, model: string): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `*Reviewed by ${prettyName(provider)} (${model}) — ${yyyy}-${mm}-${dd}*`;
}
```

### VerdictModal Review Streaming (Concept)
```typescript
// Conceptual extension to VerdictModal for AC review streaming.
// Called AFTER renderVerdict paints "Accepted!" chrome.
async startReviewStream(ctx: { file: TFile; slug: string }, aiClient: AIClient): Promise<void> {
  const reviewAreaEl = this.contentEl.createDiv({ cls: 'leetcode-ai-review-stream' });
  const component = new Component();
  component.load();
  
  const prompt = buildReviewPrompt({ problemMd, code, language });
  const handle = await aiClient.invokeStream({ prompt, stream: true, signal: this.reviewAbort.signal });
  
  if (handle.kind === 'stream') {
    // Consume stream, debounced render into reviewAreaEl
    // On complete: vault.process(file, body => mergeAIReviewSection(body, fullText))
  } else {
    // Buffered: await text, then single render + vault write
  }
  
  component.unload();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 08 disclosure copy mutation | Composition factory (frozen base + spread) | Phase 07 Plan 07 | `withReviewBullet` MUST spread, never mutate |
| electron.net.fetch streaming | Native window.fetch TIER 1 | Phase 08.1 | Review streaming works via TIER 1 by default |
| Single-purpose streaming modal | Reusable AIStreamModal | Phase 08 Plan 03 | Manual re-run reuses it directly |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `maxTokens: 2048` is sufficient for detailed Hard problem reviews across all 3 dimensions | Architecture Patterns | Review may be truncated; increase to 4096 if dogfood shows truncation |
| A2 | VerdictModal can be extended with a streaming area without breaking existing AC/WA/TLE render states | Pitfall 2 | May need a wrapper or a separate "ReviewVerdictModal" subclass |
| A3 | The `## AI Review` section being last in the note means "replace from heading to EOF" is always correct | Pitfall 3 | If user adds content after `## AI Review` manually, that content would be lost on re-AC. Acceptable per D-19 (body is editable but heading is locked; replacement is the idempotency contract) |

## Open Questions

1. **VerdictModal extension approach**
   - What we know: VerdictModal renders terminal states via `verdictModalRenderer.ts`. Phase 09 needs to append a streaming review area AFTER the AC state renders.
   - What's unclear: Whether to extend VerdictModal class directly (add `startReviewStream` method) or compose with a helper extracted from AIStreamModal (debounce + render logic).
   - Recommendation: Extend VerdictModal directly. The streaming logic is simple enough (buffer + debounce + MarkdownRenderer.render) that extracting a shared helper adds indirection without clarity benefit. Keep the review stream code contained in a single method on VerdictModal (or a new `VerdictModalReviewExtension` helper class that receives the modal's DOM elements).

2. **maxTokens for review call**
   - What we know: Debug prompts use provider defaults. Review should be longer (3 dimensions).
   - What's unclear: Optimal token budget that balances completeness vs cost.
   - Recommendation: Default 2048. This allows ~1500 words across 3 dimensions -- generous for most problems. Can be tuned during dogfood.

3. **Section lock HeadingKind extension**
   - What we know: `sectionLockExtension.ts` uses a `HeadingKind` type union with per-kind range emission logic.
   - What's unclear: Whether adding `'ai-review'` requires significant refactoring of `computeLockedRanges`.
   - Recommendation: Add `'ai-review'` with the same semantics as `'notes'` (heading line locked, body editable). The existing code structure supports this with a single `case` addition in the switch.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/ai/buildReviewPrompt.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIREV-01 | Settings toggle + auto-review on AC | unit + integration | `npx vitest run tests/ai/aiReview.settings.test.ts` | Wave 0 |
| AIREV-02 | `## AI Review` written via vault.process, heading locked | unit | `npx vitest run tests/ai/mergeAIReviewSection.test.ts` | Wave 0 |
| AIREV-03 | Idempotent replacement on re-AC | unit | `npx vitest run tests/ai/mergeAIReviewSection.test.ts` | Wave 0 |
| AIREV-04 | Suggested code in separate fence (prompt instruction) | unit | `npx vitest run tests/ai/buildReviewPrompt.test.ts` | Wave 0 |
| AIREV-05 | Palette command `rerun-ai-review` | unit | `npx vitest run tests/ai/rerunAIReview.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/ai/buildReviewPrompt.test.ts tests/ai/mergeAIReviewSection.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ai/buildReviewPrompt.test.ts` -- covers AIREV-04 prompt structure
- [ ] `tests/ai/mergeAIReviewSection.test.ts` -- covers AIREV-02, AIREV-03 idempotency
- [ ] `tests/ai/disclosure.withReviewBullet.test.ts` -- covers D-10 composition pattern
- [ ] `tests/ai/aiReview.settings.test.ts` -- covers AIREV-01 shape-guard + default
- [ ] `tests/ai/rerunAIReview.test.ts` -- covers AIREV-05 palette command guard

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | yes | AI response rendered via `MarkdownRenderer.render` (never `innerHTML`); prompt input sanitized (trim only) |
| V6 Cryptography | no | -- |

### Known Threat Patterns for AI Vault Write

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AI response containing malicious markdown/HTML | Tampering | `MarkdownRenderer.render` is CSP-safe; no raw HTML injection into DOM |
| AI response with `<script>` tags | Elevation of Privilege | Obsidian's `MarkdownRenderer` strips script tags; `innerHTML` is never used |
| Prompt injection via problem content | Information Disclosure | Problem content is user-visible LC data; AI response stays in vault only; no exfiltration vector |
| Cost abuse (repeated auto-reviews) | Denial of Service | Cost ledger tracks spend; AIREV-06 cap deferred but ledger accumulates; user must opt in |
| `## Notes` content leaking to AI | Information Disclosure | Locked decision: `## Notes` is NEVER included in the prompt; `buildReviewPrompt` never reads it |

## Sources

### Primary (HIGH confidence)
- `src/ai/AIClient.ts` -- `invokeStream` contract, disclosure gate, abort cascade [VERIFIED: codebase]
- `src/ai/AIStreamModal.ts` -- streaming modal lifecycle, debounce, footer state machine [VERIFIED: codebase]
- `src/ai/buildDebugPrompt.ts` -- prompt assembly precedent [VERIFIED: codebase]
- `src/ai/disclosure.ts` -- `DISCLOSURE_BASE_COPY` frozen contract, `withDebugBullet` factory [VERIFIED: codebase]
- `src/graph/mergeTechniquesSection.ts` -- vault.process pure transform precedent [VERIFIED: codebase]
- `src/graph/KnowledgeGraphWriter.ts` -- on-AC pipeline, `vault.process` usage [VERIFIED: codebase]
- `src/notes/NoteTemplate.ts` -- `LOCKED_HEADINGS` tuple, heading constants [VERIFIED: codebase]
- `src/main/sectionLockExtension.ts` -- `HeadingKind` type, lock computation [VERIFIED: codebase]
- `src/solve/VerdictModal.ts` -- modal structure, renderVerdict flow [VERIFIED: codebase]
- `src/main.ts:1291` -- AC gate + knowledgeGraph invocation site [VERIFIED: codebase]
- `src/settings/SettingsStore.ts` -- `PluginData` shape, `addCostLedger`, `DEFAULT_DATA` [VERIFIED: codebase]
- `.planning/phases/09-ai-aced-review/09-CONTEXT.md` -- all locked decisions [VERIFIED: planning artifact]

### Secondary (MEDIUM confidence)
- Phase 07/08 CONTEXT.md files -- precedent decisions referenced in CONTEXT canonical_refs [CITED: planning artifacts]

### Tertiary (LOW confidence)
- None -- all claims verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages; all infrastructure exists
- Architecture: HIGH -- all patterns directly precedented in Phase 07/08 code
- Pitfalls: HIGH -- identified from direct code reading of existing transforms and modals

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (stable -- internal codebase, no external API changes)
