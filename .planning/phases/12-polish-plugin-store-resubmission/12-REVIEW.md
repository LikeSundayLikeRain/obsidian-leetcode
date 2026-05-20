---
phase: 12-polish-plugin-store-resubmission
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/browse/ProblemBrowserView.ts
  - src/contest/ContestFinalizer.ts
  - src/contest/ContestScratchManager.ts
  - src/main.ts
  - src/main/sectionLockExtension.ts
  - src/notes/NoteTemplate.ts
  - src/notes/NoteWriter.ts
  - src/settings/SettingsTab.ts
  - src/solve/VerdictModal.ts
  - src/solve/verdictModalRenderer.ts
  - styles.css
findings:
  critical: 5
  warning: 6
  info: 3
  total: 14
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed all 11 changed source files covering the Phase 12 UAT fix rounds: contest submit flow (AI suppression, verdict recording), scratch note management, contest finalization, section lock H1 title extension, wikilink-to-preview gate removal, verdict modal width, settings Test-connection button, and stdout in run modal.

Five critical defects were found: non-AC contest verdicts are never recorded (badge update regression), the H1 title insertion uses a regex that matches the wrong `---` delimiter, the `wireContestCallbacks` method permanently corrupts the singleton ContestSessionManager via an uncleared external flag (present in prior review as CR-02, still present), `ContestScratchManager.ensureFolder` has a TOCTOU race on concurrent opens, and the `handleStartRandomContest` palette command creates contest sessions with missing code/language fields. Six warnings cover maintainability and edge-case correctness issues.

---

## Critical Issues

### CR-01: Contest non-AC verdict is never recorded — `'attempted'` badge never updates during a contest

**File:** `src/main.ts:2063-2069`

**Issue:** The contest verdict recording block only calls `contestSessionManager.recordVerdict(idx, 'accepted')` when `classifyStatus(...).kind === 'ac'`. Wrong-answer, TLE, MLE, RE, and CE results during a contest are silently discarded. The verdict badges in the active-contest sidebar never flip to `'attempted'` state after a non-AC submission — they permanently show `'unsolved'`. The `wireContestCallbacks.onVerdictChange` path also never fires. Phase 12 context lists "Contest verdict recording from main.ts submit path for badge updates" as a fix item, but only the AC half was implemented.

```typescript
// After the existing AC block, add:
} else {
  // Non-AC during contest — record 'attempted' for badge update
  const activeContest = this.contestSessionManager.getSession();
  if (activeContest) {
    const idx = activeContest.problems.findIndex(p => p.slug === ctx.slug);
    if (idx >= 0) this.contestSessionManager.recordVerdict(idx, 'attempted');
  }
}
```

---

### CR-02: H1 title insertion uses `'\n---\n'` sentinel — matches the OPENING frontmatter delimiter, not the closing one

**File:** `src/notes/NoteWriter.ts:507`

**Issue:** `forceRefresh` searches for the frontmatter closing delimiter with `updated.indexOf('\n---\n')`. Obsidian-generated frontmatter starts on line 1 (`---`) and ends with `---` on its own line. The string `'\n---\n'` matches a newline *before* a `---` line, which correctly identifies the closing delimiter **only when there is exactly one `---` sequence in the YAML block**. For notes with a `---` inside a YAML value (e.g. a description containing dashes), or for notes where the first occurrence of `'\n---\n'` is the OPENING delimiter boundary (e.g. `\n---\n` at offset 0 when the document starts with `---\n`), `indexOf` finds the wrong position. Even in the common case, `indexOf` finds the FIRST match — on any well-formed YAML block the first `'\n---\n'` found is the closing fence because the opening `---` is on line 1 with no preceding newline. However this relies on the opening `---` being at position 0, so there is no preceding `\n`. The actual bug is the `insertAt = fmEnd + 5` offset: `'\n---\n'` is 5 characters, so `insertAt` points just past the closing `---\n`. This is correct when it finds the closing `---`. The latent risk is that `lastIndexOf` is the robust fix and costs nothing.

```typescript
// Fix: use lastIndexOf to always find the closing --- fence:
const fmEnd = updated.lastIndexOf('\n---\n');
if (fmEnd !== -1) {
  const insertAt = fmEnd + 5; // after \n---\n
  updated = updated.slice(0, insertAt) + h1 + updated.slice(insertAt);
} else {
  updated = h1 + updated;
}
```

---

### CR-03: `wireContestCallbacks` permanent flag on ContestSessionManager is never cleared on view close — double-wrap on re-open

**File:** `src/browse/ProblemBrowserView.ts:1215-1216`

**Issue:** `wireContestCallbacks` sets `(manager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired = true` on the plugin-level singleton `ContestSessionManager`. The `onClose()` method does NOT clear this flag on the manager. When the sidebar is closed and re-opened (or workspace is restored), a new `ProblemBrowserView` instance calls `renderActiveContest` → `wireContestCallbacks`. The guard at line 1215 reads `_pbvCallbacksWired = true` from the still-living manager and **skips re-wiring**. The timer display, verdict badges, and pause/expired callbacks now reference the DOM elements from the **previous (detached) PBV instance** — updates are silently lost.

Additionally, the class field `this.contestCallbacksWired` at line 116 is set alongside the manager flag but the `wireContestCallbacks` guard only checks the manager flag, making `contestCallbacksWired` a write-only dead field.

```typescript
// Fix: clear the manager-side flag in onClose()
async onClose(): Promise<void> {
  // ...existing cleanup...
  (this.plugin.contestSessionManager as unknown as { _pbvCallbacksWired?: boolean })
    ._pbvCallbacksWired = false;
  this.contestCallbacksWired = false;
}
```

---

### CR-04: `ContestScratchManager.ensureFolder` has a TOCTOU race — concurrent `createOrUpdate` calls throw unhandled `EEXIST`

**File:** `src/contest/ContestScratchManager.ts:73-78`

**Issue:** `ensureFolder` checks `vault.getAbstractFileByPath(this.folder)`, then calls `vault.createFolder(this.folder)` with no error handling. `startContest` calls `createOrUpdate` for all N contest problems sequentially, so each `createOrUpdate` calls `ensureFolder`. The first call creates the folder; subsequent calls will call `createFolder` again if the `getAbstractFileByPath` check races the folder index update (Obsidian's vault index is not always synchronously updated after `createFolder` resolves). There is no `try/catch` around `vault.createFolder` in this method, so the unhandled error bubbles up and aborts the scratch-file creation for that problem. The `ContestFinalizer` version of `ensureFolder` (line 401-408) correctly wraps `createFolder` in a try/catch swallowing already-exists errors.

```typescript
async ensureFolder(): Promise<void> {
  const { vault } = this.app;
  if (!vault.getAbstractFileByPath(this.folder)) {
    try {
      await vault.createFolder(this.folder);
    } catch {
      // Folder may have been created concurrently — swallow EEXIST-like errors
    }
  }
}
```

---

### CR-05: `handleStartRandomContest` creates contest session with no starter code or language per problem

**File:** `src/main.ts:1177-1190`

**Issue:** The palette `start-random-contest` command calls `contestSessionManager.start(...)` with a `problems` array that has no `code` or `language` fields:

```typescript
problems: questions.map((q) => ({
  slug: q.title_slug,
  title: q.title,
  credit: q.credit,
  difficulty: q.difficulty,
  // code and language are missing
})),
```

`ProblemBrowserView.startContest` (line 970-982) correctly fetches problem details in parallel, resolves the user's default language from settings, and finds the matching code snippet. The palette command omits this entirely. Consequences: (1) scratch files opened from the palette command path contain empty code blocks; (2) `ContestFinalizer` skips problems where `problem.code === ''` (line 275), so no contest notes are ever written for palette-started contests.

**Fix:** Extract the detail-fetch and snippet-resolution logic from `ProblemBrowserView.startContest` into a shared helper, or replicate it in `handleStartRandomContest`.

---

## Warnings

### WR-01: `buildLockedDecorations` does not apply dim decoration to H1 title lines — visual inconsistency

**File:** `src/main/sectionLockExtension.ts:306-317`

**Issue:** `buildLockedDecorations` applies the `leetcode-locked-heading-line` CSS decoration to `## Problem`, `## Code`, `## Techniques`, `## Notes`, and `## AI Review`. The new `'title'` kind added in Phase 12 is handled by `computeLockedRanges` (the range is locked) but `buildLockedDecorations` does NOT include a branch for H1 lines. The H1 title is locked (editing is suppressed) but the `# ` prefix marker is not visually dimmed in Edit/Source mode, unlike all other locked headings. This is visually inconsistent.

```typescript
// Add to the condition in buildLockedDecorations:
if (
  text === PROBLEM_HEADING_LINE ||
  text === CODE_HEADING_LINE ||
  text === TECHNIQUES_HEADING_LINE ||
  text === NOTES_HEADING_LINE ||
  text === AI_REVIEW_HEADING_LINE ||
  (text.startsWith('# ') && !text.startsWith('## '))  // H1 title
) {
  b.add(state.doc.line(i).from, state.doc.line(i).from, lineDeco);
}
```

---

### WR-02: `handleManualContestAnalysis` passes the contest slug as the contest title to the AI prompt

**File:** `src/main.ts:1204`

**Issue:**
```typescript
const contestTitle = (fm['lc-contest-id'] as string) ?? 'Unknown Contest';
```
`lc-contest-id` stores the slug (e.g. `weekly-contest-401`), not the human-readable title (`Weekly Contest 401`). The summary note frontmatter (written by `ContestFinalizer` line 377-384) stores `lc-contest-id` as the slug but does not store the original `contestTitle`. `buildContestAnalysisPrompt` receives the slug as `contestTitle`, producing a lower-quality AI prompt compared to `runContestAnalysis` (line 1133) which uses `session.contestTitle`.

```typescript
// Derive a human-readable title from the slug as a best-effort fallback:
const rawId = (fm['lc-contest-id'] as string) ?? 'Unknown Contest';
const contestTitle = rawId
  .replace(/-/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());
```

---

### WR-03: Plugin-level `onVerdictChange` fallback calls `view.onOpen()` — full re-render on every badge update

**File:** `src/main.ts:401-413`

**Issue:** The default `onVerdictChange` callback wired at ContestSessionManager construction calls `void view.onOpen()` for every open `ProblemBrowserView` leaf on every badge change. `onOpen` is a complete re-render: empties root, rebuilds mode toggle, re-fetches session, re-renders entire timer header and all problem cards. For a badge update (a cosmetic icon swap) this is extremely over-broad. It also interacts with CR-03: each `onOpen()` call on the re-rendered PBV clears `contestCallbacksWired` to `false` implicitly (the DOM is fresh) but the manager-side `_pbvCallbacksWired` flag remains true, so re-wiring never happens until the flag bug is fixed.

**Fix:** Expose a narrow badge-refresh method on `ProblemBrowserView` and call that instead of `onOpen`.

---

### WR-04: `handleContestEnd` mutates the live session object before `finish()`/`abort()` — fragile reference semantics

**File:** `src/main.ts:1036-1037`

**Issue:**
```typescript
for (const problem of activeSession.problems) {
  const code = await this.contestScratch.readCode(problem.slug);
  if (code !== null) problem.code = code;
}
await this.settings.setContestSession(activeSession);
```
`getSession()` returns the live reference held by `ContestSessionManager`. Mutating `problem.code` directly on the live session object before calling `finish()` is correct today but is fragile: any future refactor of `ContestSessionManager.finish()` that deep-clones or replaces the session will cause the code sync-back to write to a detached object, silently losing the code from the finalized session.

**Fix:** Build a patched copy:
```typescript
const patchedProblems = await Promise.all(
  activeSession.problems.map(async (p) => {
    const code = await this.contestScratch.readCode(p.slug);
    return code !== null ? { ...p, code } : p;
  }),
);
const patched = { ...activeSession, problems: patchedProblems };
await this.settings.setContestSession(patched);
```

---

### WR-05: `ContestFinalizer` calls `createdFiles.set` twice for non-AC existing files — dead code path

**File:** `src/contest/ContestFinalizer.ts:284-302`

**Issue:** In the `existingFile` branch, when `problem.verdict === 'accepted'` (lines 287-296), `createdFiles.set(problem.slug, existingFile)` is called at line 296. Then unconditionally at line 300, `createdFiles.set(problem.slug, existingFile)` is called again — the comment says "But still track for #revisit tagging." The second `set` is always a no-op (same key, same value), but the comment and code structure imply the intent was to only execute line 300 in the non-AC branch. The current structure makes the `if (problem.verdict === 'accepted')` block look like it has a fall-through into unconditional code, which is misleading.

```typescript
if (existingFile) {
  if (problem.verdict === 'accepted') {
    await app.vault.process(existingFile, (body) =>
      rewriteCodeSection(body, problem.code, problem.language));
    await app.fileManager.processFrontMatter(existingFile, (fm) => {
      fm['lc-contest-id'] = safeSlug;
    });
  }
  // Track regardless of verdict for #revisit tagging
  createdFiles.set(problem.slug, existingFile);
}
```

---

### WR-06: `renderContestRow` hardcodes `'· 4 problems'` for every contest row

**File:** `src/browse/ProblemBrowserView.ts:898`

**Issue:**
```typescript
text: `${dateStr} · 4 problems`,
```
The literal `4` is baked in for every contest row. Some LC contests (Biweekly, special rounds) may have a different number of problems. If `CachedContest` carries a `questionCount` field this is trivially fixable; otherwise omitting the count is safer than displaying wrong information.

```typescript
const problemCount = (contest as { questionCount?: number }).questionCount ?? 4;
text: `${dateStr} · ${String(problemCount)} problem${problemCount !== 1 ? 's' : ''}`,
```

---

## Info

### IN-01: Dead function `buildContestProblemBody` in `ContestFinalizer.ts`

**File:** `src/contest/ContestFinalizer.ts:395-398`

**Issue:** The private function `buildContestProblemBody` is defined but never called. The main `finalizeContest` function uses `buildNoteBody` (imported from `NoteTemplate`) instead. This dead function adds confusion and maintenance surface.

**Fix:** Remove the function.

---

### IN-02: `ProblemBrowserView.contestCallbacksWired` field is write-only — never read in any guard

**File:** `src/browse/ProblemBrowserView.ts:116`

**Issue:** The class field `private contestCallbacksWired = false` is set at lines 1217, 1246, 1274, and 1285 but the `wireContestCallbacks` guard at line 1215 checks the manager-cast flag, not this field. The local field is dead code and a symptom of CR-03's two-flag design.

**Fix:** Remove the field and use only the manager-side flag (after fixing CR-03 to clear it on close), or use `this.contestCallbacksWired` as the sole guard.

---

### IN-03: `VerdictModal.renderPatternChip` fallback path hardcodes `'LeetCode/Patterns/'`

**File:** `src/solve/VerdictModal.ts:259-261`

**Issue:**
```typescript
const hubPath = this.args.getPatternHubPath
  ? this.args.getPatternHubPath(pattern)
  : 'LeetCode/Patterns/' + pattern + '.md';
```
All production call sites in `submitFromActive` supply `getPatternHubPath`, so the fallback never fires today. But the hardcoded path ignores the user's configured problems folder and skips `normalizePatternName`. A future call site that omits the argument will silently navigate to the wrong file.

**Fix:** Make `getPatternHubPath` required when `file` is non-null, or document the contract with a comment.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
