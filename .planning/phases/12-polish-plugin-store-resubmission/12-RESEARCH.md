# Phase 12: Polish + Plugin-Store Re-submission - Research

**Researched:** 2026-05-19
**Domain:** Obsidian plugin bug fixes, UX polish, release preparation
**Confidence:** HIGH

## Summary

Phase 12 is an operational phase with no new v1.1 base requirements — it addresses integration bugs from Phases 09/10/11, adds UX polish features, and prepares the 1.1.0 release for community plugin store re-submission. The work divides into three waves: contest bug fixes (scratch folder visibility, sidebar AC status, tab idempotency, AI review suppression during contest, finish lifecycle), verdict modal cleanup (Close button removal, pattern chip), note/navigation polish (H1 title, wikilink-to-preview), and release prep (README audit, version bump, manifest validation, GitHub release).

The codebase is well-structured for these changes. Each fix targets a specific, identifiable code location with established patterns to follow. The primary risk areas are: (1) the contest finish lifecycle where `handleContestEnd` may silently fail if the finalizer throws before completing all steps, and (2) the wikilink-to-preview interception which requires hooking into Obsidian's internal link resolution machinery (less well-documented API surface).

**Primary recommendation:** Execute bugs-first in parallel (contest fixes are independent of verdict modal fixes), then polish features, then release prep as a final sequential gate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Remove Close button from ALL verdict states. Obsidian's standard X button handles dismissal.
- D-02: AI review streams below the Accepted banner with no footer chrome.
- D-03: Pattern chip renders below the Accepted banner, above the AI review stream.
- D-04: Pattern chip is clickable — navigates to the hub note.
- D-05: Scratch files move to dot-prefixed folder `.leetcode-contest/`.
- D-06: Contest sidebar AC status — wire verdict callback from ContestSolveView to ContestSessionManager.
- D-07: Contest tab idempotency — reuse existing tabs via openOrReusePreview pattern.
- D-08: AI review deferred during active contest. No onStartReviewStream callback in contest VerdictModal.
- D-09: Contest finish lifecycle must complete end-to-end (notes, summary, AI analysis, THEN return to browser).
- D-10: First-load slowness is the primary concern. Lazy-import AI SDK.
- D-11: Problem notes include `# {Title}` H1 heading before `## Problem`.
- D-12: Wikilink-to-preview for unresolved problem links.
- D-13: Version bump to 1.1.0.
- D-14: README network/cost audit for v1.1 AI + contest endpoints.
- D-15: GitHub release artifacts (main.js + manifest.json), lint + bundle-size CI gates green.
- D-16: Batch migration UI is a stretch goal only.

### Claude's Discretion
- Exact CSS approach for pattern chip styling (match existing tag/chip patterns).
- Whether cold-start lazy-import uses dynamic `import()` or deferred construction.
- ContestFinalizer error handling strategy (whether to surface partial results on failure).
- Exact implementation of wikilink-to-preview hook (Obsidian's `resolveMarkdownLink` or workspace event).
- Wave breakdown for the plan (how to group items into parallel execution waves).

### Deferred Ideas (OUT OF SCOPE)
- AIKG-FUT-01 (batch migration UI) — stretch goal within Phase 12 only if everything else ships.
- CONTEST-FUT-01 (live contest participation) — v1.2.
- AIREV-06 (daily cost cap) — dropped from v1.1.
- AIPROV-FUT-02 (per-feature AI provider routing) — post-v1.1.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Close button removal | Frontend (Modal DOM) | -- | Pure DOM change in `verdictModalRenderer.ts` |
| Pattern chip | Frontend (Modal DOM) | API/Backend (frontmatter read) | DOM element reads `lc-pattern` from metadataCache |
| Scratch folder path | Storage (vault filesystem) | -- | Changes a constant in `ContestScratchManager.ts` |
| Contest sidebar AC | Frontend (state callback) | -- | Wire existing callback; re-render triggered by poll |
| Contest tab reuse | Frontend (workspace API) | -- | Leaf scan + setViewState pattern |
| Contest AI review deferral | Frontend (callback omission) | -- | Simply don't pass `onStartReviewStream` |
| Contest finish lifecycle | API/Backend (async orchestration) | Storage (vault writes) | Await finalizer + analysis before UI transition |
| Cold-start performance | Frontend (module loading) | -- | Deferred import/construction of AI SDK |
| H1 title in notes | Storage (note template) | -- | `buildNoteBody` string builder change |
| Wikilink-to-preview | Frontend (workspace event hook) | -- | Intercept unresolved link click, redirect to preview |
| Version bump + release | Build/CI | -- | manifest.json + GitHub release workflow |
| README audit | Documentation | -- | Text editing |

## Standard Stack

No new libraries are introduced in Phase 12. All work uses existing project dependencies.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| obsidian | 1.12.3 | Plugin API (Modal, workspace, vault, metadataCache) | Required runtime |
| typescript | ^5.8.3 | Language | Project standard |
| esbuild | 0.25.5 | Bundler | Official sample-plugin bundler |
| vitest | 4.1.5 | Unit testing | Project standard |

### No New Dependencies
Phase 12 introduces zero new npm packages. All functionality is built using existing Obsidian APIs and project code.

## Architecture Patterns

### System Architecture Diagram

```
User Action (click/submit)
        |
        v
+------------------+     +---------------------+
| VerdictModal     |---->| verdictModalRenderer |
| (Obsidian Modal) |     | (pure DOM builder)  |
+------------------+     +---------------------+
        |                          |
        |  on AC + lc-pattern      |  removes Close buttons
        v                          |  adds pattern chip
+------------------+               |
| metadataCache    |<--------------+
| (read lc-pattern)|
+------------------+
        |
        v  click chip
+------------------+
| previewRouter    |----> opens hub note
| (tab-reuse)     |
+------------------+

Contest Flow:
+---------------------+     +------------------+     +-----------------+
| ContestSolveView    |---->| VerdictModal     |---->| SessionManager  |
| (submit handler)    |     | (no review CB)   |     | .recordVerdict  |
+---------------------+     +------------------+     +-----------------+
        |                                                     |
        v  on Finish                                         v  onVerdictChange
+---------------------+     +------------------+     +-----------------+
| handleContestEnd    |---->| finalizeContest  |---->| vault writes    |
| (main.ts)           |     | (ContestFinalizer)|    | (notes+summary) |
+---------------------+     +------------------+     +-----------------+
        |
        v  after finalization
+---------------------+
| runContestAnalysis  |----> AI stream (if enabled)
+---------------------+

Wikilink Interception:
+------------------+     +--------------------+     +-----------------+
| User clicks      |---->| workspace event    |---->| previewRouter   |
| [[slug]] link    |     | (open-link or      |     | .openOrReuse    |
|                  |     |  file-open hook)    |     |                 |
+------------------+     +--------------------+     +-----------------+
```

### Recommended Project Structure (no changes)
```
src/
├── solve/VerdictModal.ts           # Modal adapter (Close removal + chip)
├── solve/verdictModalRenderer.ts   # Pure DOM (Close removal)
├── contest/ContestScratchManager.ts # Folder path change
├── contest/ContestSolveView.ts     # AC callback + AI review suppression
├── contest/ContestFinalizer.ts     # Await discipline
├── contest/ContestSessionManager.ts # onVerdictChange (existing, just needs calling)
├── preview/previewRouter.ts        # Tab-reuse (reusable for contest tabs)
├── notes/NoteTemplate.ts           # H1 title
├── main.ts                         # Wikilink hook + contest finish await + lazy AI
└── graph/PatternClusterEngine.ts   # lc-pattern source (read-only for chip)
```

### Pattern 1: Close Button Removal
**What:** Remove all `data-lc-role="close"` button elements and their enclosing footer divs from `verdictModalRenderer.ts`.
**When to use:** D-01 mandates removal from ALL verdict states.
**Example:**
```typescript
// BEFORE (5 locations in verdictModalRenderer.ts):
const closeBtn = appendEl(footer, 'button', 'mod-cta');
setText(closeBtn, 'Close');
closeBtn.setAttribute('data-lc-role', 'close');

// AFTER: Remove these 3 lines. Keep the footer div ONLY if other
// buttons remain (AI: Debug, Copy failing testcase, Copy error).
// For renderTimeout and renderUnknownVerdict, the footer is now
// empty — remove it entirely (Obsidian's X suffices).
```

**Impact locations (5 Close buttons):**
1. `renderTimeout` (line 138) — footer becomes empty, remove entire footer
2. `renderRunResult` (line 332) — footer keeps AI: Debug button if present
3. `renderRunErrorBlock` (line 381) — footer keeps AI: Debug button
4. `renderSubmitVerdict` (line 560) — footer keeps Copy/AI: Debug buttons
5. `renderUnknownVerdict` (line 650) — footer keeps Copy payload button

### Pattern 2: Pattern Chip in Verdict Modal
**What:** After AC, read `lc-pattern` from metadataCache and render a clickable chip.
**When to use:** On Accepted submission verdict, when `lc-pattern` frontmatter is set.
**Example:**
```typescript
// In VerdictModal.ts, after renderVerdict paints AC:
// The chip renders BETWEEN the Accepted banner and the AI review stream.
// lc-pattern is set by PatternClusterEngine.onAccepted which runs
// BEFORE renderVerdict (see main.ts line 1989 — knowledgeGraph.onAccepted
// is awaited, then modal.renderVerdict is called).

// Reading lc-pattern:
const cache = this.app.metadataCache.getFileCache(ctx.file);
const pattern = cache?.frontmatter?.['lc-pattern'] as string | undefined;

// Rendering chip (follows existing tag/chip CSS patterns):
if (pattern) {
  const chip = appendEl(body, 'span', 'leetcode-pattern-chip');
  setText(chip, pattern);
  chip.addEventListener('click', () => {
    this.close();
    // Navigate to hub note
    const hubPath = `${folder}/Patterns/${pattern}.md`;
    void app.workspace.openLinkText(hubPath, '', false);
  });
}
```

**Timing concern:** `knowledgeGraph.onAccepted` (which calls `PatternClusterEngine.onAccepted` and writes `lc-pattern` to frontmatter) is awaited BEFORE `modal.renderVerdict` in the submit flow (main.ts:1989-1996). So by the time the verdict modal renders AC, `lc-pattern` is already in the metadataCache. This ordering is load-bearing.

### Pattern 3: Tab Reuse (Contest + Wikilink)
**What:** Scan workspace leaves for matching view type + identifier, focus if found, create if not.
**When to use:** Opening contest problems (D-07) and wikilink-to-preview (D-12).
**Example:**
```typescript
// Existing pattern from src/preview/previewRouter.ts:
export async function openOrReusePreview(plugin, slug) {
  const existing = workspace.getLeavesOfType(PREVIEW_VIEW_TYPE);
  if (existing.length > 0 && existing[0]) {
    await existing[0].setViewState({ type, active: true, state: { slug } });
    await workspace.revealLeaf(existing[0]);
    return;
  }
  const leaf = workspace.getLeaf('tab');
  await leaf.setViewState({ type, active: true, state: { slug } });
  await workspace.revealLeaf(leaf);
}

// For contest: openContestProblem currently uses workspace.getLeaf('tab')
// unconditionally (line 946). Must scan for existing MarkdownView leaves
// whose file matches the scratch path before creating a new tab.
```

### Pattern 4: Wikilink-to-Preview Interception
**What:** Intercept clicks on unresolved wikilinks to problem slugs; open preview instead of blank note.
**When to use:** When a wikilink target matches a known problem slug but no vault file exists.
**Example:**
```typescript
// Obsidian's workspace 'file-open' event fires AFTER the file is opened.
// For interception BEFORE creation, use the 'open' event on the workspace
// or override the file-not-found behavior.
//
// Recommended approach: hook into workspace.on('file-open') and check if
// the opened file is empty + matches a problem slug pattern (id-slug.md).
// Alternative: Use app.workspace.onLayoutReady + monkey-patch or use the
// resolved metadataCache link checking.
//
// Obsidian API options (Claude's discretion):
// 1. app.workspace.on('file-open', handler) — fires after open, can close
//    blank + redirect to preview
// 2. Monkey-patch openLinkText (fragile, not recommended)
// 3. Custom MarkdownPostProcessorContext for wikilink elements (reading mode)
//
// Safest approach: register 'file-open' handler that detects newly-created
// empty files matching problem slug pattern, immediately deletes the blank
// file, and opens preview instead.
```

### Anti-Patterns to Avoid
- **Modifying vault.modify directly:** Use `vault.process` for body, `processFrontMatter` for frontmatter.
- **Stacking modals:** Close current modal BEFORE opening the next (chip click → close verdict → open hub note).
- **Eager AI SDK import at module top level:** Causes cold-start penalty. Use lazy construction or dynamic import wrapped in a function.
- **Unconditional `getLeaf('tab')` for contest problems:** Creates duplicate tabs. Must scan first.
- **Polling submission status from cache:** Submission verdicts are never cached; always live poll.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab reuse | Custom leaf tracking map | `workspace.getLeavesOfType()` + setViewState | Obsidian manages leaf lifecycle; external tracking goes stale |
| Link resolution | Manual vault path resolution | `app.metadataCache.getFirstLinkpathDest()` | Handles aliases, case insensitivity, path resolution correctly |
| H1 rendering in notes | Markdown heading injection via regex | String template in `buildNoteBody` | Template is the SSoT; regex on existing notes is fragile |
| Pattern name display | Re-classify on modal open | Read `lc-pattern` from metadataCache | Classification already ran and persisted to frontmatter |
| Cold-start optimization | Custom module loader | Defer `AIClient` construction until first AI call | esbuild CJS bundles cannot truly code-split; deferred construction is the only lever |

**Key insight:** Phase 12 fixes existing code paths — every capability either removes code (Close button), adds a constant change (scratch folder), or wires an existing but unconnected callback. No new architectural primitives are needed.

## Common Pitfalls

### Pitfall 1: Close Button Removal Leaves Empty Footers
**What goes wrong:** Removing the Close button but leaving the footer `<div>` creates empty whitespace at modal bottom.
**Why it happens:** The footer div is created unconditionally in some render paths.
**How to avoid:** After removing Close, check if the footer has any remaining children (AI: Debug, Copy). If not, remove the footer div entirely. For `renderTimeout` and AC-only states, the footer will be empty.
**Warning signs:** Visual gap at bottom of verdict modal in UAT.

### Pitfall 2: Pattern Chip Reads Stale metadataCache
**What goes wrong:** `lc-pattern` not yet in cache when chip renders.
**Why it happens:** If `processFrontMatter` write hasn't flushed to the metadata index yet.
**How to avoid:** The ordering in main.ts already guarantees this: `knowledgeGraph.onAccepted` (which writes `lc-pattern`) is fully awaited before `modal.renderVerdict`. Obsidian's `processFrontMatter` synchronously updates the cache. Verify this ordering is preserved.
**Warning signs:** Chip absent on first AC but appears on subsequent AC of same problem.

### Pitfall 3: Contest Finish Drops Silently on Error
**What goes wrong:** `handleContestEnd` calls `finalizeContest` which throws partway through (e.g., file creation fails for one problem). The catch block shows a Notice but the contest session is already cleared (`.finish()` already called at line 971).
**Why it happens:** `contestSessionManager.finish()` clears the session BEFORE `finalizeContest` runs. If finalization fails, there's no way to retry because the session data is gone.
**How to avoid:** Either: (a) capture the session snapshot before clearing, pass it to finalize, and only clear on success; or (b) wrap finalization in a try/catch that preserves the session on failure. Current code already captures the snapshot (line 969-971 returns it), so the issue is that the Notice fires but the user loses their session. The fix is to surface partial results (summary note path) when available, and ensure the error Notice is actionable.
**Warning signs:** User clicks Finish, sees error Notice, contest data is gone.

### Pitfall 4: Contest Tab Idempotency — Wrong Matching Criterion
**What goes wrong:** Leaf scan matches the wrong problem's tab because it checks only view type, not the specific problem.
**Why it happens:** `getLeavesOfType('markdown')` returns ALL markdown leaves; the contest uses regular MarkdownView (not ContestSolveView) for scratch files. Must match by file path.
**How to avoid:** After getting leaves of type 'markdown', filter by checking `(leaf.view as { file?: { path: string } }).file?.path === scratchPath`. Or switch contest to use the registered `ContestSolveView` exclusively and scan by `CONTEST_SOLVE_VIEW_TYPE` + state match.
**Warning signs:** Clicking a different contest problem refocuses the wrong tab.

### Pitfall 5: Wikilink Interception Creates Then Deletes Files
**What goes wrong:** Obsidian's default behavior on clicking an unresolved wikilink is to create a blank note. If the hook fires on 'file-open', the blank file already exists. Deleting it immediately may cause a flicker or race with Obsidian's file-create notification.
**Why it happens:** Obsidian creates the file before firing the event.
**How to avoid:** Consider intercepting at the DOM level (MarkdownPostProcessor for rendered wikilinks in Reading mode) or using `workspace.on('url-event')` if available. Alternatively, accept the create-then-delete approach with a check that the created file is truly empty (0 bytes) before deleting. The preview router can then open in the same leaf that was about to show the blank file.
**Warning signs:** Brief flash of empty note before preview appears; file-create notification appears transiently.

### Pitfall 6: Cold-Start — Dynamic Import is Ineffective with esbuild CJS
**What goes wrong:** Using `await import('./ai/AIClient')` as a lazy-load attempt has no effect because esbuild's CJS output (required for Obsidian plugins) bundles everything statically regardless of dynamic import syntax.
**Why it happens:** esbuild does not code-split CJS output (no `splitting: true` for CJS format). Dynamic imports are resolved at bundle time.
**How to avoid:** Lazy-load via deferred CONSTRUCTION, not deferred import. Keep the static import but delay `new AIClient(...)` until the first AI call is made. The module evaluation cost of the AI SDK is the real cold-start penalty.
**Warning signs:** Bundle still includes AI SDK at full weight; first-load still slow after adding dynamic import.

### Pitfall 7: Dot-Folder Still Visible in Some Obsidian Configurations
**What goes wrong:** `.leetcode-contest/` is visible if user has "Show hidden files" enabled in Obsidian settings or uses a file manager plugin that exposes dot-files.
**Why it happens:** Obsidian respects the dot-folder convention by default but allows override.
**How to avoid:** This is acceptable behavior — the convention is standard and documented. The folder contents are not user-facing regardless. No action needed beyond the rename.
**Warning signs:** None — this is expected edge-case behavior.

## Code Examples

### Close Button Removal — All 5 Sites

```typescript
// In verdictModalRenderer.ts, for each of the 5 render functions:
// Remove these lines (pattern repeats at lines 138, 332, 381, 560, 650):

// REMOVE:
const closeBtn = appendEl(footer, 'button', 'mod-cta');
setText(closeBtn, 'Close');
closeBtn.setAttribute('data-lc-role', 'close');

// In VerdictModal.ts, the focusCloseButton() method becomes dead code.
// Remove it entirely (lines 254-265). The button event listener wiring
// in that method is no longer needed.
```

### Contest AC Callback Wiring (D-06)

```typescript
// In ContestSolveView.ts handleSubmit(), line ~459:
// Current code already calls recordVerdict on AC:
if (info.kind === 'ac') {
  this.plugin.contestSessionManager.recordVerdict(this.problemIdx, 'accepted');
}

// The bug is that ContestSessionManager.recordVerdict DOES call
// this.callbacks.onVerdictChange(problemIdx, verdict) at line 159.
// But in main.ts line 396, the callback is a no-op:
//   onVerdictChange: () => { /* ProblemBrowserView polls ... */ },
//
// Fix: the onVerdictChange callback must trigger a re-render of the
// contest sidebar/status display. The ProblemBrowserView needs to
// observe this and update its badge state. This may already work via
// polling — verify in UAT whether the issue is the callback or the
// display component not re-reading session state.
```

### Scratch Folder Path Change (D-05)

```typescript
// In ContestScratchManager.ts, line 11:
// BEFORE:
const SCRATCH_FOLDER = 'LeetCode/contest-scratch';

// AFTER:
const SCRATCH_FOLDER = '.leetcode-contest';
```

### H1 Title in Note Template (D-11)

```typescript
// In NoteTemplate.ts buildNoteBody():
// BEFORE (line 196):
return `## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;

// AFTER:
return `# ${input.title}\n\n## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;

// NOTE: buildNoteBody currently does NOT receive `title`. The interface
// must be extended to include it, or the caller must prepend the H1.
// Recommended: extend the input interface with an optional `title` field.
```

### Contest Tab Idempotency (D-07)

```typescript
// In main.ts openContestProblem():
async openContestProblem(problemIdx: number): Promise<void> {
  // ... existing problem/session retrieval ...
  
  const scratchPath = `.leetcode-contest/${problem.slug}.md`;
  
  // Scan for existing leaf showing this scratch file
  const existing = this.app.workspace.getLeavesOfType('markdown')
    .find(leaf => {
      const file = (leaf.view as { file?: { path: string } }).file;
      return file?.path === scratchPath;
    });
  
  if (existing) {
    this.app.workspace.revealLeaf(existing);
    return;
  }

  // Create/update scratch file and open in new tab
  const file = await this.contestScratch.createOrUpdate(problem, contentHtml);
  const leaf = this.app.workspace.getLeaf('tab');
  await leaf.openFile(file);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Obsidian `Modal.close()` via Close button | Obsidian X button (modal title bar) | Standard since Obsidian 1.0 | Remove custom Close buttons; rely on native dismissal |
| Direct `require('electron')` for BrowserWindow | `activeWindow.require` shim | Phase 07 | No impact on Phase 12; pattern already established |
| Full problem cache pre-warm | On-demand fetch with TTL | v1.0 | Phase 12 cold-start fix targets AI SDK, not the cache |
| Static AI SDK import at top-level | Deferred construction (Phase 12) | Current phase | Reduces first-load from ~1.2 MB parse to ~400 KB initial |

**Deprecated/outdated:**
- `workspace.activeLeaf` — deprecated; use `getActiveViewOfType()` instead. Already banned in this project.
- `vault.modify` — banned in this project. Always use `vault.process`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Obsidian's `processFrontMatter` synchronously updates `metadataCache` | Pitfall 2 | Pattern chip may not show on first AC; would need a delay or callback |
| A2 | esbuild CJS cannot code-split with dynamic `import()` | Pitfall 6 | If splitting works, dynamic import would be simpler than deferred construction |
| A3 | Wikilink click creates blank file before any event fires | Pitfall 5 | If interception is possible before creation, the approach simplifies |
| A4 | Contest sidebar not updating is due to onVerdictChange being a no-op | Code Examples | If it's a rendering bug in ProblemBrowserView, fix location differs |
| A5 | Cold-start improvement from deferred AI construction is meaningful (~1-2s) | D-10 | If the bottleneck is elsewhere (index build, data.json parse), different fix needed |

## Open Questions

1. **Wikilink interception mechanism**
   - What we know: Obsidian creates blank files when clicking unresolved wikilinks. The `file-open` event fires after creation. Reading-mode links can be targeted via MarkdownPostProcessor.
   - What's unclear: Whether there's a pre-creation hook (e.g., `file-will-open` or `beforeCreate`) in the Obsidian API. Whether Edit-mode wikilink clicks can be intercepted at all.
   - Recommendation: Start with Reading-mode MarkdownPostProcessor for rendered `[[link]]` elements (covers hub notes and Related Variants sections which are read in Reading mode). For Edit mode, accept that clicking creates a blank file and use the `file-open` event to detect + redirect.

2. **Contest finish lifecycle — exact failure point**
   - What we know: `handleContestEnd` captures the session, calls `finalizeContest`, has a try/catch, but the session is already cleared by `.finish()` before finalization runs.
   - What's unclear: What specific step fails in production (note creation? summary write? folder creation?).
   - Recommendation: Add error boundary around each step in `finalizeContest` so partial completion is visible. The session snapshot is already captured, so retry is possible.

3. **Cold-start profiling — actual bottleneck**
   - What we know: Bundle is 1.2 MB. AI SDK contributes ~650 KB. First-load is noticeably slow.
   - What's unclear: Whether the bottleneck is module evaluation (esbuild output parsing) or constructor-time initialization (SettingsStore.load, index fetch).
   - Recommendation: Profile with `performance.now()` around onload steps. If AI SDK evaluation is not the bottleneck, focus on making the problem index fetch non-blocking instead.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Close button removed from all verdict states | unit | `npx vitest run tests/solve/verdictModalRenderer.test.ts` | Existing (update assertions) |
| D-03 | Pattern chip renders on AC when lc-pattern set | unit | `npx vitest run tests/solve/verdictModal-chip.test.ts` | Wave 0 |
| D-05 | Scratch folder is `.leetcode-contest` | unit | `npx vitest run tests/contest/ContestScratchManager.test.ts` | Wave 0 |
| D-06 | AC verdict propagates to session manager | unit | `npx vitest run tests/contest/contestVerdictCallback.test.ts` | Wave 0 |
| D-07 | Duplicate tabs not created for same problem | integration | Manual UAT | -- |
| D-09 | Finalization completes before UI transition | unit | `npx vitest run tests/contest/ContestFinalizer.test.ts` | Existing (extend) |
| D-11 | Notes have H1 title | unit | `npx vitest run tests/notes/NoteTemplate.test.ts` | Existing (extend) |
| D-13 | manifest.json version is 1.1.0 | unit | `npx vitest run tests/manifest.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/solve/verdictModal-chip.test.ts` — covers pattern chip render + click navigation
- [ ] `tests/contest/ContestScratchManager.test.ts` — covers new folder path
- [ ] `tests/contest/contestVerdictCallback.test.ts` — covers AC propagation
- [ ] `tests/manifest.test.ts` — asserts version = 1.1.0

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- (no auth changes in Phase 12) |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | yes | Existing T-10-10 contest slug validation preserved |
| V6 Cryptography | no | -- |

### Known Threat Patterns for Phase 12

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Scratch folder path traversal | Tampering | T-10-10 slug regex still applies; dot-folder is at vault root |
| Pattern chip XSS via lc-pattern value | Tampering | `setText()` (not innerHTML) for all DOM — already enforced |
| Hub note path injection via pattern name | Tampering | Pattern name comes from frozen 22-item taxonomy — validated at write time |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/solve/verdictModalRenderer.ts` — Close button at 5 locations confirmed
- Codebase inspection: `src/contest/ContestScratchManager.ts:11` — `SCRATCH_FOLDER` constant location confirmed
- Codebase inspection: `src/contest/ContestSolveView.ts:459` — AC verdict already calls `recordVerdict`
- Codebase inspection: `src/contest/ContestSessionManager.ts:159` — `onVerdictChange` callback already fires
- Codebase inspection: `src/main.ts:396` — `onVerdictChange` is a no-op comment
- Codebase inspection: `src/main.ts:958-1017` — `handleContestEnd` finalization flow
- Codebase inspection: `src/notes/NoteTemplate.ts:196` — `buildNoteBody` string template
- Codebase inspection: `src/preview/previewRouter.ts` — tab-reuse pattern reference
- Codebase inspection: `manifest.json` — current version 1.0.1
- Codebase inspection: `README.md:64-89` — current network usage section
- Codebase inspection: `main.js` bundle — 1,209,768 bytes (~1.18 MB)

### Secondary (MEDIUM confidence)
- CLAUDE.md — project conventions (vault.process, processFrontMatter, no innerHTML) [VERIFIED: codebase]
- Obsidian API behavior — metadataCache update timing after processFrontMatter [ASSUMED]
- esbuild CJS splitting limitation [ASSUMED — based on training knowledge of esbuild architecture]

### Tertiary (LOW confidence)
- Wikilink interception mechanism — no official Obsidian docs on pre-creation hooks [ASSUMED]
- Cold-start bottleneck attribution to AI SDK module evaluation [ASSUMED — needs profiling]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; all changes use existing APIs
- Architecture: HIGH - all code locations identified and verified in codebase
- Pitfalls: MEDIUM - wikilink interception and cold-start root cause need validation

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (stable — operational fixes, no moving targets)
