---
phase: 09-ai-aced-review
reviewed: 2026-05-18T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/ai/buildReviewPrompt.ts
  - src/ai/mergeAIReviewSection.ts
  - src/ai/disclosure.ts
  - src/ai/AIStreamModal.ts
  - src/main.ts
  - src/main/sectionLockExtension.ts
  - src/notes/NoteTemplate.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - src/solve/VerdictModal.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-18
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 09 adds AI-powered code review triggered on Accepted submissions, a manual re-run palette command, disclosure copy extension, section locking for the new `## AI Review` heading, and settings persistence for the opt-in toggle. The implementation is architecturally sound: vault writes use `vault.process`, AI responses are rendered via `MarkdownRenderer.render` (never `innerHTML`), `## Notes` is excluded from the prompt, and the cost ledger is updated on all code paths.

Two blockers surface on deeper inspection: a duplicated SSoT constant creates a silent drift risk, and a stale editor body captured at modal construction time means the auto-review can encode code the user edited after clicking submit but before the AC verdict lands. Four warnings cover a missed abort check on the buffered stream path, a `renderTimer` leak on abort, double `addCost(0)` calls in the abort catch handler, and a layout position bug for the AI toggle setting. Three info items cover dead code, a missing purity comment, and a magic constant.

---

## Critical Issues

### CR-01: Duplicate `AI_REVIEW_HEADING_LINE` constant violates SSoT and will silently drift

**File:** `src/ai/mergeAIReviewSection.ts:21`

**Issue:** `mergeAIReviewSection.ts` declares its own `export const AI_REVIEW_HEADING_LINE = '## AI Review' as const` independently of the canonical definition at `src/notes/NoteTemplate.ts:66`. The SSoT rule in CLAUDE.md (Phase 2 D-03) explicitly forbids any module other than `NoteTemplate.ts` from hardcoding plugin-owned H2 heading strings. The lock extension (`sectionLockExtension.ts`) correctly imports from `NoteTemplate.ts`; `mergeAIReviewSection.ts` does not. If the heading string is ever changed in `NoteTemplate.ts` (e.g., renamed to `## AI Code Review`), `mergeAIReviewSection.ts` will silently use the old string, searching the wrong heading and appending a second section instead of replacing. The `void NOTES_HEADING_LINE` comment on line 26 acknowledges the import pattern for future anchor logic but does NOT resolve the duplicate declaration.

**Fix:**
```typescript
// src/ai/mergeAIReviewSection.ts — replace lines 18-26 with:
import { AI_REVIEW_HEADING_LINE, NOTES_HEADING_LINE } from '../notes/NoteTemplate';

/** Re-exported for downstream consumers (Plan 03/04 wiring). */
export { AI_REVIEW_HEADING_LINE };

// Suppress unused-import lint on NOTES_HEADING_LINE (future anchor-point logic).
void NOTES_HEADING_LINE;
```
Then remove the local `export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;` on line 21.

---

### CR-02: `startAutoReview` reads note body at submission time, not at vault-write time — stale code risk

**File:** `src/main.ts:1229`

**Issue:** In `startAutoReview`, the code and language for the prompt are resolved at Step 2 via `ctx.currentBody()` which reads `view.editor.getValue()`. This call happens **inside the async IIFE**, but it executes synchronously at the start, before the `invokeStream` await. The critical window is:

1. User clicks Submit.
2. Submission is in-flight (30 s+ for slow judges).
3. User edits their code while waiting.
4. AC arrives, `startAutoReview` is called — `ctx.currentBody()` reads the *edited* body, not the version that was submitted.
5. The AI review is generated for the edited code, but the attribution says it was an Accepted solution. The mismatch is silent and misleading.

The vault write on line 1320-1322 merges the review using `vault.process`, which is correct — but the prompt was built from a stale/future body. In the worst case, the user's post-submission edits introduce a bug; the AI reviews the broken code as if it were the Accepted solution.

The same pattern exists in `runAIReview` (line 1367: `view.editor.getValue()`), but there the user explicitly triggers re-run on the current file, so reading the current editor state is correct. For `startAutoReview`, the correct body is the one that was *submitted*, which is already available via `SubmissionOrchestrator`'s `getCurrentBody` capture at submit time.

**Fix:** Capture the body snapshot at submit time and pass it as a string into `startAutoReview` rather than a live getter:

```typescript
// In submitFromActive, capture body before awaiting orch.submit():
const submittedBody = ctx.currentBody();

// Pass the snapshot to startAutoReview:
onStartReviewStream: this.settings.getAutoAIReviewOnAC() && this.settings.getActiveAIProvider()
  ? (reviewAreaEl, component) =>
      this.startAutoReview(
        { ...ctx, currentBody: () => submittedBody },
        reviewAreaEl,
        component,
      )
  : undefined,
```

---

## Warnings

### WR-01: Buffered stream path in `startAutoReview` does not check `abortController.signal.aborted` after `await flushRender()`

**File:** `src/main.ts:1304-1308`

**Issue:** The buffered fallback path (lines 1303-1309) does check `signal.aborted` on line 1305 after `await handle.text`, before updating `buffer` and calling `flushRender`. However, `flushRender` itself calls `MarkdownRenderer.render` (an async Obsidian call). If the signal is aborted *during* `flushRender`'s `MarkdownRenderer.render` await, the code proceeds to `await this.aiClient.addCost(0)` and then falls through to the vault write on lines 1311-1322. This means a user who closes the VerdictModal during the buffered render phase can still trigger a vault write. The stream path at line 1276 checks `signal.aborted` per-chunk (correct), but the buffered path only checks once.

**Fix:**
```typescript
} else {
  const text = await handle.text;
  if (abortController.signal.aborted) throw new Error('aborted');
  buffer = text;
  await flushRender();
  if (abortController.signal.aborted) throw new Error('aborted'); // add this check
  await this.aiClient.addCost(0);
}
```

---

### WR-02: `renderTimer` leaked when abort fires between `scheduleRender` and its callback

**File:** `src/main.ts:1251-1258`

**Issue:** `startAutoReview` creates a `renderTimer` local variable to debounce `MarkdownRenderer.render` calls. The `scheduleRender` closure captures it correctly. However, when the abort fires mid-stream (e.g., user closes VerdictModal), the catch block on line 1323 calls `addCost(0)` and returns — it never clears `renderTimer`. If a `setWindowTimeout` callback fires after the IIFE has exited, `flushRender()` is called on a `reviewAreaEl` that may have been removed from the DOM (VerdictModal's `onClose` calls `contentEl.empty()`). This results in a `MarkdownRenderer.render` call against a detached DOM node.

AIStreamModal solves this by clearing its `renderTimer` in `onClose` (line 221). `startAutoReview` has no equivalent cleanup path because the timer handle is scoped inside the IIFE and inaccessible to VerdictModal's `onClose`.

**Fix:** Expose the timer to the abort callback:
```typescript
let renderTimer: TimerHandle | null = null;
// ...in catch:
if (abortController.signal.aborted) {
  if (renderTimer != null) {
    clearWindowTimeout(renderTimer);
    renderTimer = null;
  }
  void this.aiClient.addCost(0);
  return;
}
```

---

### WR-03: Double `addCost(0)` on abort path in `startAutoReview`

**File:** `src/main.ts:1323-1332`

**Issue:** When the stream is aborted mid-stream, the `catch` block inside the stream consumer (line 1325-1327) calls `void this.aiClient.addCost(0)`. Control then propagates to the outer `.catch` handler on the IIFE (line 1323) — but the `Error('aborted')` thrown on line 1276 IS caught by the inner `try/catch` around the `for await` loop (lines 1271-1309), which itself re-throws only if `signal.aborted` is false (line 1302, `handleStreamError`). Wait — re-reading: the inner catch at line 1303-1318 of `consumeStream` in AIStreamModal is the *modal* version. In `startAutoReview`'s IIFE, the stream loop has no inner try/catch — the single try/catch covers the entire IIFE. So on abort, the throw on line 1276 is caught by the outer `.catch` on line 1323. The outer catch checks `signal.aborted` (line 1325) and calls `void this.aiClient.addCost(0)`. That is one call — correct.

However, if the *buffered path* aborts after `await this.aiClient.addCost(0)` on line 1308 (which already logged 0), AND then the post-`addCost` abort check is added per WR-01's fix, the abort throw would be caught by the outer `.catch`, which calls `addCost(0)` again. That doubles the ledger entry (zero + zero — no monetary impact but the double-write creates unnecessary I/O and flush on `data.json`).

More concretely without the WR-01 fix, the existing buffered path calls `addCost(0)` on line 1308, then proceeds to vault write. If vault.process throws (e.g. file locked), the outer catch fires `addCost(0)` again. This is a real double-write on vault error.

**Fix:** In the outer `.catch`, only call `addCost(0)` when the abort fired before the inner `addCost` call was reached. The simplest guard is a flag:
```typescript
let costLogged = false;
// set costLogged = true after each aiClient.addCost call
// in outer catch: if (!costLogged) void this.aiClient.addCost(0);
```

---

### WR-04: "Auto AI review on Accept" toggle rendered AFTER the Knowledge Graph section, not inside the AI section

**File:** `src/settings/SettingsTab.ts:272-280`

**Issue:** The `autoAIReviewOnAC` toggle is added to `containerEl` at lines 272-280, which is positioned **after** `renderAIProviderForm` is called (line 269) but **before** the "Knowledge graph" heading (line 289). This means the toggle appears visually between the AI provider sub-form and the Knowledge Graph heading — it is not grouped inside the AI section block where a user would expect to find it. Additionally, if `active === null` (no provider configured), line 268-270 skips `renderAIProviderForm` but the toggle still renders at lines 272-280 directly after the provider dropdown. A user can enable auto AI review when no provider is configured; the setting will silently do nothing on the next AC until they configure a provider. At minimum, the toggle should be inside the `if (active !== null)` block or show a warning description.

**Fix:** Move the toggle inside the `if (active !== null)` block so it only renders when a provider is configured, or add a `.setDesc()` note:
```typescript
new Setting(containerEl)
  .setName('Auto AI review on Accept')
  .setDesc(
    active
      ? 'When enabled, an AI review is generated automatically each time you get Accepted.'
      : 'Configure an AI provider above to enable auto review.',
  )
  .addToggle((toggle) => toggle
    .setValue(this.plugin.settings.getAutoAIReviewOnAC())
    .setDisabled(active === null)
    .onChange(async (value) => {
      await this.plugin.settings.setAutoAIReviewOnAC(value);
    }),
  );
```

---

## Info

### IN-01: `NOTES_HEADING_LINE` import in `mergeAIReviewSection.ts` is dead code suppressed with `void`

**File:** `src/ai/mergeAIReviewSection.ts:18,26`

**Issue:** `NOTES_HEADING_LINE` is imported and immediately suppressed with `void NOTES_HEADING_LINE` with a comment saying it is "imported for future anchor-point logic if needed." The import is not used, the `void` is a lint-bypass hack, and the comment describes speculative future behavior. This is dead code. If the future anchor-point logic is ever needed, the import can be added then. Keeping an unused import suppressed with `void` is an anti-pattern that obscures real unused-import warnings.

**Fix:** Remove the import and the `void` line. Re-add when the anchor logic is actually implemented.

---

### IN-02: Attribution line format string duplicated verbatim in `startAutoReview` and `runAIReview`

**File:** `src/main.ts:1317` and `src/main.ts:1413`

**Issue:** The attribution line format `*Reviewed by ${prettyName(provider)} (${providerCfg.model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*` and the associated date-building logic (4 lines) are copy-pasted identically in both `startAutoReview` (lines 1312-1318) and `runAIReview` (lines 1408-1414). Any change to the attribution format (e.g. adding the model ID for Bedrock) must be made in two places. This is a quality concern that will cause inconsistent attribution as the feature evolves.

**Fix:** Extract a shared helper:
```typescript
private buildReviewAttribution(provider: AIProvider, model: string | undefined): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `*Reviewed by ${prettyName(provider)} (${model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*`;
}
```

---

### IN-03: Magic constant `RENDER_DEBOUNCE_MS = 100` re-declared as a local in `startAutoReview`

**File:** `src/main.ts:1210`

**Issue:** `startAutoReview` re-declares `const RENDER_DEBOUNCE_MS = 100` as a local variable inside the method body. `AIStreamModal.ts` already exports a module-level `const RENDER_DEBOUNCE_MS = 100` at line 53. The value is not imported — it is duplicated. If the debounce value is tuned in `AIStreamModal`, `startAutoReview` silently diverges. The duplication also makes it harder to audit "what is the debounce value for streaming AI output?"

**Fix:** Export `RENDER_DEBOUNCE_MS` from `AIStreamModal.ts` (or a shared constants module) and import it in `main.ts`.

---

_Reviewed: 2026-05-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
