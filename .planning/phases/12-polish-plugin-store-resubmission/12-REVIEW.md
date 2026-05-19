---
phase: 12-polish-plugin-store-resubmission
reviewed: 2026-05-19T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/browse/ProblemBrowserView.ts
  - src/contest/ContestScratchManager.ts
  - src/graph/PatternClusterEngine.ts
  - src/main.ts
  - src/notes/NoteTemplate.ts
  - src/notes/NoteWriter.ts
  - src/solve/VerdictModal.ts
  - src/solve/verdictModalRenderer.ts
  - styles.css
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-19
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 12 delivers verdict modal polish (Close button removal), contest scratch folder dot-prefix, tab idempotency, AI review suppression during contest, AC pattern chip, H1 title in notes, wikilink-to-preview interception, deferred AIClient, and a version bump. The changes are generally well-structured. Three critical defects were found: a hardcoded hub-note path in `VerdictModal` that diverges from the `ClusterHubWriter` path (causing chip navigation to a wrong or non-existent file), `vault.modify` used in `ContestScratchManager` on an active file in violation of the project's own guidance, and a callback-patching pattern in `ProblemBrowserView.wireContestCallbacks` that permanently mutates the singleton `ContestSessionManager` callbacks — meaning a second `onOpen` call on a different `ProblemBrowserView` instance (e.g., after workspace restore) will double-wrap the callbacks, causing double side-effects on every tick/expire/verdict event.

---

## Critical Issues

### CR-01: Pattern chip navigates to hardcoded `LeetCode/Patterns/` — diverges from user-configured folder

**File:** `src/solve/VerdictModal.ts:249`

**Issue:** `renderPatternChip` constructs the hub note path as the literal string `'LeetCode/Patterns/' + pattern + '.md'`. The actual hub notes are written by `ClusterHubWriter` at `{problemsFolder}/Patterns/{normalized}.md` where `problemsFolder` is the user-configurable setting (default `'LeetCode'`). Two defects compound:

1. A user who changes their problems folder (e.g., to `'Coding/LeetCode'`) will get a chip that navigates to a non-existent file.
2. Even with the default folder, `ClusterHubWriter` normalises `patternName` via `normalizePatternName()` before constructing the file path, but `VerdictModal` uses the raw `lc-pattern` frontmatter value directly. If `normalizePatternName` transforms the name (e.g., casing changes, spaces-to-hyphens), the chip navigates to the wrong file.

The VerdictModal does not receive the `app` dependency needed to call settings, but the `file` arg already exists for metadataCache reads; the fix is to pass a resolved hub path from the caller in `main.ts` where `settings.getProblemsFolder()` and `normalizePatternName()` are both available, or to accept a `getHubPath: (pattern: string) => string` resolver in `VerdictModalArgs`.

**Fix:**
```typescript
// In VerdictModalArgs, add:
getPatternHubPath?: (rawPattern: string) => string;

// In main.ts submitFromActive(), pass:
getPatternHubPath: (raw) => {
  const { normalizePatternName } = require('./graph/patternTaxonomy');
  return `${this.settings.getProblemsFolder()}/Patterns/${normalizePatternName(raw)}.md`;
},

// In VerdictModal.renderPatternChip(), replace:
void this.app.workspace.openLinkText(
  'LeetCode/Patterns/' + pattern + '.md',
  '',
  false,
);
// with:
const hubPath = this.args.getPatternHubPath
  ? this.args.getPatternHubPath(pattern)
  : `LeetCode/Patterns/${pattern}.md`;
void this.app.workspace.openLinkText(hubPath, '', false);
```

---

### CR-02: `wireContestCallbacks` permanently mutates singleton `ContestSessionManager` callbacks — double-wrap on re-open

**File:** `src/browse/ProblemBrowserView.ts:1223-1263`

**Issue:** `wireContestCallbacks()` reaches into the `ContestSessionManager`'s private `callbacks` object via an `as unknown` cast and overwrites `onTick`, `onExpired`, and `onVerdictChange` in-place with wrapper functions that capture `origTick`, `origExpired`, `origVerdict`. The guard `if (this.contestCallbacksWired) return` prevents re-entry within one PBV instance's lifecycle, but this guard is **instance-local**. The `ContestSessionManager` is a **plugin-level singleton** shared across all `ProblemBrowserView` instances and persists through view closes/reopens.

Scenario that reproduces double-wrap:
1. User opens sidebar → `wireContestCallbacks()` runs, `contestCallbacksWired = true` on instance A; the singleton's `onTick` now wraps the original.
2. User closes + reopens the sidebar (or workspace restore creates a second PBV instance B). `onOpen` → `renderActiveContest` → `wireContestCallbacks()` on instance B (its own `contestCallbacksWired` starts `false`). The singleton's `onTick` is now wrapped a second time, wrapping the already-wrapped version.
3. Every tick fires the UI update twice; every expire fires `handleContestEnd(false)` twice — the second call on an already-finished session may attempt double vault writes or emit duplicate Notices.

The `onExpired` path is especially dangerous: `origExpired()` calls `handleContestEnd(false)`, which calls `contestSessionManager.finish()`. The second invocation of the double-wrapped `onExpired` sees a null session from `finish()` (already cleared) and bails with `return`, so finalization doesn't double-run — but the `onOpen()` call after it does run a second time, re-rendering the now-empty contest UI before `handleContestEnd` has finished the vault writes.

**Fix:** Attach the wrapper flag to the manager itself (not the view instance), or use a stable function reference so re-assignment is idempotent:
```typescript
// Option A — flag on manager (simplest):
private wireContestCallbacks(): void {
  const WIRED_KEY = '__pbvWired';
  const manager = this.plugin.contestSessionManager as unknown as Record<string, unknown>;
  if (manager[WIRED_KEY]) return;
  manager[WIRED_KEY] = true;
  // ... rest of patching ...
  // In onExpired wrapper:
  originalCallbacks.onExpired = () => {
    delete manager[WIRED_KEY];  // allow re-wire after session ends
    origExpired();
    // ...
  };
}
```

---

### CR-03: `vault.modify` used on contest scratch files — violates Obsidian plugin guidance and can corrupt open editor state

**File:** `src/contest/ContestScratchManager.ts:87` and `src/contest/ContestScratchManager.ts:96`

**Issue:** `createOrUpdate()` calls `this.app.vault.modify(existing, content)` when the scratch file already exists. The project's own `CLAUDE.md` states: **"Do NOT use Vault.modify() on active file — loses cursor position."** Contest scratch files are opened in a native `MarkdownView` tab (`openContestProblem` calls `leaf.openFile(file)`) and are expected to remain open while the user edits code. Calling `vault.modify` on a file open in an editor tab loses the user's cursor position and can discard unsaved CM6 edit history on Obsidian 1.4+ where the vault layer and the CM6 layer are not always in sync.

The correct pattern per CLAUDE.md is `app.vault.process(file, (current) => newContent)`, which is atomic and cursor-preserving.

**Fix:**
```typescript
// Replace vault.modify calls with vault.process:
if (existing) {
  await this.app.vault.process(existing, () => content);
  return existing;
}
// And in the race-condition catch:
if (file) {
  await this.app.vault.process(file, () => content);
  return file;
}
```

---

## Warnings

### WR-01: Contest sidebar `onVerdictChange` callback calls `view.onOpen()` — re-enters full render on every badge update

**File:** `src/main.ts:406-412`

**Issue:** The plugin-level `onVerdictChange` fallback registered at `ContestSessionManager` construction calls `void view.onOpen()` on every badge update for every open `ProblemBrowserView` leaf. `onOpen()` is a full re-render: it empties the root, rebuilds the mode toggle, re-fetches the contest session, re-renders the timer header, re-creates all DOM nodes, and re-wires callbacks. For a badge update (a purely cosmetic change) this is enormously over-broad. It also interacts badly with CR-02: each `onOpen()` call sets `contestCallbacksWired = false` on the instance (because `onOpen` re-creates the view shell) and then calls `wireContestCallbacks()` again, triggering the double-wrap on the next re-open.

**Fix:** The fallback should call a narrow badge-refresh method rather than `onOpen`:
```typescript
onVerdictChange: (idx, verdict) => {
  const leaves = this.app.workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
  for (const leaf of leaves) {
    const view = leaf.view as ProblemBrowserView;
    // Use a narrow refresh if available, not full re-render
    if (typeof (view as { refreshVerdictBadge?: unknown }).refreshVerdictBadge === 'function') {
      (view as { refreshVerdictBadge: (idx: number, v: unknown) => void }).refreshVerdictBadge(idx, verdict);
    }
  }
},
```

---

### WR-02: `ContestSolveView` submit path passes no `onStartReviewStream` or `file` to `VerdictModal` — AC pattern chip silently suppressed, but D-08 intent is implicit

**File:** `src/contest/ContestSolveView.ts:399-402`

**Issue:** The contest submit `VerdictModal` is constructed with only `problemTitle` and `onCancel` — no `onStartReviewStream`, no `file`. The `file: null` / absent field correctly suppresses both the AI auto-review (D-08) and the pattern chip (D-03/D-04) during a contest, which is the intended behavior per the phase context. However, this is achieved by **omission** with no comment, making it invisible to future maintainers. If someone adds `onStartReviewStream` for a different reason, they may inadvertently re-enable AI review in contest mode.

The `onStartReviewStream` suppression in `main.ts` at line 1989 has an explicit guard (`this.settings.getAutoAIReviewOnAC() && this.settings.getActiveAIProvider()`), but the contest path bypasses that guard entirely. There is no guard asserting "never wire AI review in contest context" — only the absent field.

**Fix:** Add an explicit comment at the VerdictModal construction in ContestSolveView:
```typescript
const modal = new VerdictModal(this.app, {
  problemTitle: problem.title,
  onCancel: () => { abort.aborted = true; },
  // D-08: AI review and pattern chip intentionally omitted in contest context.
  // onStartReviewStream and file are not passed — contest problems are ephemeral
  // scratch files without a vault TFile at modal construction time.
});
```
This is a documentation/maintainability warning, not a current functional bug.

---

### WR-03: `handleContestEnd` mutates `problem.code` on a session object read from `getSession()` before `finish()`/`abort()`

**File:** `src/main.ts:1036-1037`

**Issue:**
```typescript
for (const problem of activeSession.problems) {
  const code = await this.contestScratch.readCode(problem.slug);
  if (code !== null) problem.code = code;
}
await this.settings.setContestSession(activeSession);
```
`getSession()` returns the live session reference held by `ContestSessionManager`. The code mutates `problem.code` directly on that reference before calling `finish()` or `abort()`, and then calls `setContestSession` to persist it. This is functional, but if `ContestSessionManager.finish()` or `abort()` internally deep-clones or replaces the session object before returning it (any future refactor could do this), the sync-back code would write to a detached object and the code changes would be lost from the finalized session.

**Fix:** Read the session, build a mutated copy, set the copy, then pass to finish/abort:
```typescript
const patchedProblems = await Promise.all(
  activeSession.problems.map(async (p) => {
    const code = await this.contestScratch.readCode(p.slug);
    return code !== null ? { ...p, code } : p;
  }),
);
const patchedSession = { ...activeSession, problems: patchedProblems };
await this.settings.setContestSession(patchedSession);
```

---

### WR-04: `PatternClusterEngine.onAccepted` writes `lc-pattern` frontmatter then immediately calls `vault.process` for the Techniques section — two separate async writes with a TOCTOU gap

**File:** `src/graph/PatternClusterEngine.ts:222-237`

**Issue:** The engine calls `app.fileManager.processFrontMatter(file, ...)` to write `lc-pattern`, then immediately calls `app.vault.process(file, ...)` to rewrite the Techniques section. These are two separate sequential vault writes with no lock between them. If Obsidian's metadata cache has not yet indexed the frontmatter write before the `vault.process` callback reads `file.frontmatter`, a concurrent call to `onAccepted` (e.g., a fast double-AC) could see stale frontmatter and re-classify, overwriting the first write's result. The persistence check at line 151 reads `metadataCache.getFileCache(file)` which is synchronous and reflects the state at check time — it does not block re-entry.

The never-throw posture means neither error surfaces. The practical impact is low (double-AC is rare), but the window exists.

**Fix:** Move the Techniques rewrite inside the same `processFrontMatter` callback using `vault.process` after `processFrontMatter` resolves — or add a per-file in-flight guard using a `Set<string>` keyed on `file.path`.

---

## Info

### IN-01: `ContestScratchManager` swallows all errors in `ensureFolder` — true failures are silent

**File:** `src/contest/ContestScratchManager.ts:72-78`

**Issue:** The folder-creation loop catches every error with a bare `catch` and a comment "Folder already exists — continue." However, other errors (permission denied, vault path rejected by Obsidian's sanitizer, out-of-disk-space) will also be silently swallowed, causing a confusing failure when `vault.create` subsequently fails with a "parent folder does not exist" error. The caller (`createOrUpdate`) does not surface this either.

**Fix:** Narrow the catch to distinguish concurrent-create races from true failures:
```typescript
try {
  await vault.createFolder(current);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('already exists') && !msg.includes('Folder already exists')) {
    throw err;  // re-throw real failures
  }
}
```

---

### IN-02: `renderContestRow` hardcodes `'· 4 problems'` regardless of actual problem count

**File:** `src/browse/ProblemBrowserView.ts:898`

**Issue:**
```typescript
text: `${dateStr} · 4 problems`,
```
The literal `4` is baked in and displayed for every contest row regardless of the actual number of problems in the contest. Some LC contests (Biweekly, special events) have 3 or 6 problems. This is a magic number that will display incorrect information.

**Fix:** Use the actual problem count from the `CachedContest` type if available, or omit the count if the data is unavailable:
```typescript
const problemCount = contest.questionCount ?? 4;
text: `${dateStr} · ${String(problemCount)} problem${problemCount !== 1 ? 's' : ''}`,
```

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
