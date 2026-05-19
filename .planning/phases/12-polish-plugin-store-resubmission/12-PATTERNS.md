# Phase 12: Polish + Plugin-Store Re-submission - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/solve/VerdictModal.ts` | component | event-driven | self (existing file) | exact |
| `src/solve/verdictModalRenderer.ts` | component | event-driven | self (existing file) | exact |
| `src/contest/ContestScratchManager.ts` | service | file-I/O | self (existing file) | exact |
| `src/contest/ContestSolveView.ts` | component | request-response | self (existing file) | exact |
| `src/contest/ContestSessionManager.ts` | service | event-driven | self (existing file) | exact |
| `src/contest/ContestFinalizer.ts` | service | file-I/O | self (existing file) | exact |
| `src/notes/NoteTemplate.ts` | utility | transform | self (existing file) | exact |
| `src/preview/previewRouter.ts` | utility | request-response | self (existing file) | exact |
| `src/main.ts` | controller | event-driven | self (existing file) | exact |
| `manifest.json` | config | -- | self (existing file) | exact |
| `README.md` | config | -- | self (existing file) | exact |

## Pattern Assignments

### `src/solve/verdictModalRenderer.ts` (component, event-driven)

**Analog:** Self — modification to 5 existing Close button sites.

**Close button pattern to REMOVE** (lines 137-139, 331-333, 380-382, 559-561, 649-651):
```typescript
// REMOVE these 3 lines at each of the 5 sites:
const closeBtn = appendEl(footer, 'button', 'mod-cta');
setText(closeBtn, 'Close');
closeBtn.setAttribute('data-lc-role', 'close');
```

**Footer cleanup pattern** — after removing Close, check if footer has remaining children:
```typescript
// renderTimeout (line 136): footer becomes EMPTY — remove entire footer div.
// renderRunResult (line 318): footer keeps AI: Debug if !aggregatePass — keep.
// renderRunErrorBlock (line 370): footer keeps AI: Debug — keep.
// renderSubmitVerdict (line 524): footer keeps Copy/AI: Debug buttons — keep.
// renderUnknownVerdict (line 643): footer keeps Copy payload button — keep.
```

**DOM builder pattern** (lines 660-668 — reuse for any new elements):
```typescript
function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const el = (parent.ownerDocument ?? activeDocument).createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  el.textContent = text;
}
```

---

### `src/solve/VerdictModal.ts` (component, event-driven)

**Analog:** Self — remove `focusCloseButton` method, add pattern chip.

**Dead code to remove** (lines 254-265):
```typescript
// ENTIRE focusCloseButton() method becomes dead code after Close removal.
private focusCloseButton(): void {
  const buttons = Array.from(
    this.contentEl?.querySelectorAll<HTMLButtonElement>('button[data-lc-role="close"]') ?? [],
  );
  for (const btn of buttons) {
    btn.addEventListener('click', () => { this.close(); });
  }
  const first = buttons[0];
  if (first && typeof first.focus === 'function') {
    try { first.focus(); } catch { /* headless */ }
  }
}
```

**Remove all `this.focusCloseButton()` call sites** (lines 175, 202, 212).

**Pattern chip insertion point** — after `renderVerdict` in the AC branch (line 181-183):
```typescript
// Existing pattern: startReviewStream appends to contentEl AFTER renderVerdict:
if (this.args.onStartReviewStream && this.isAccepted(res)) {
  this.startReviewStream();
}
```

**Pattern chip — NEW code to add between AC check and review stream** (follows `appendEl` pattern from line 305):
```typescript
// Pattern chip — reads lc-pattern from metadataCache, renders clickable badge.
// Insert BEFORE startReviewStream so chip appears above the AI review area.
if (this.isAccepted(res)) {
  // chip will be rendered here — need app + file context from args
}
```

**Review stream insertion pattern** (lines 226-231 — shows how to append DOM to contentEl):
```typescript
private startReviewStream(): void {
  const reviewAreaEl = appendEl(this.contentEl, 'div', 'leetcode-ai-review-stream');
  const component = new Component();
  component.load();
  // ...
}
```

---

### `src/contest/ContestScratchManager.ts` (service, file-I/O)

**Analog:** Self — single constant change.

**Constant to change** (line 11):
```typescript
// BEFORE:
const SCRATCH_FOLDER = 'LeetCode/contest-scratch';

// AFTER:
const SCRATCH_FOLDER = '.leetcode-contest';
```

**Folder creation pattern** (lines 66-78 — already handles nested paths):
```typescript
async ensureFolder(): Promise<void> {
  const { vault } = this.app;
  const parts = this.folder.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await vault.createFolder(current);
    } catch {
      // Folder already exists — continue
    }
  }
}
```

---

### `src/contest/ContestSolveView.ts` (component, request-response)

**Analog:** Self + `src/main.ts:1898-1919` (normal VerdictModal construction with onStartReviewStream suppression).

**Current contest VerdictModal construction — Run path** (lines 322-326):
```typescript
const modal = new VerdictModal(this.app, {
  problemTitle: problem.title,
  onCancel: () => { abort.aborted = true; },
  // NOTE: no onStartReviewStream, no onOpenAIDebug — contest path
});
```

**Current contest VerdictModal construction — Submit path** (lines 398-402):
```typescript
const modal = new VerdictModal(this.app, {
  problemTitle: problem.title,
  onCancel: () => { abort.aborted = true; },
  // NOTE: no onStartReviewStream — D-08 requires AI review suppression during contest
});
```

**AC verdict recording** (lines 459-461 — already wired correctly):
```typescript
if (info.kind === 'ac') {
  this.plugin.contestSessionManager.recordVerdict(this.problemIdx, 'accepted');
}
```

---

### `src/contest/ContestSessionManager.ts` (service, event-driven)

**Analog:** Self — the `onVerdictChange` callback already fires at line 159.

**recordVerdict fires the callback** (lines 143-159):
```typescript
recordVerdict(problemIdx: number, verdict: 'attempted' | 'accepted'): void {
  const session = this.settings.getContestSession();
  if (!session) return;
  const problem = session.problems[problemIdx];
  if (!problem) return;
  const rank = { unsolved: 0, attempted: 1, accepted: 2 } as const;
  if (rank[verdict] <= rank[problem.verdict]) return;
  problem.verdict = verdict;
  if (verdict === 'accepted') {
    problem.solvedAt = Date.now();
  }
  this.settings.setContestSession(session);
  this.callbacks.onVerdictChange(problemIdx, verdict);
}
```

**The no-op callback in main.ts** (line 396 — this is the bug site):
```typescript
onVerdictChange: () => { /* ProblemBrowserView polls getSession() for badge updates */ },
```

---

### `src/contest/ContestFinalizer.ts` (service, file-I/O)

**Analog:** Self — the finalization pipeline (lines 241-350).

**Current flow that must complete end-to-end** (from `src/main.ts` lines 958-1017):
```typescript
private async handleContestEnd(aborted: boolean): Promise<void> {
  // 1. Sync code from scratch files back to session
  // 2. session = contestSessionManager.finish() — clears session FIRST
  // 3. summaryPath = await finalizeContest({...}) — may throw
  // 4. Notice
  // 5. Close leaves + cleanup scratch
  // 6. AI analysis (fire-and-forget)
}
```

**Error handling pattern** (lines 982-986):
```typescript
} catch (err) {
  logger.debug('contest.finalize: failed', err);
  new Notice('Contest finalization failed. Check the console for details.', 6000);
  return;
}
```

---

### `src/notes/NoteTemplate.ts` (utility, transform)

**Analog:** Self — `buildNoteBody` function (line 187-196).

**Current body template** (line 195):
```typescript
return `## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;
```

**After adding H1 title** (D-11):
```typescript
// Extend the input interface to include `title`:
export function buildNoteBody(input: {
  problemMarkdown: string;
  langSlug?: string;
  starterCode?: string;
  title?: string;  // NEW — Phase 12 D-11
}): string {
  const langSlug = input.langSlug ?? 'python3';
  const starter = input.starterCode ?? '';
  const codeBlock = codeBlockFor(langSlug, starter);
  const h1 = input.title ? `# ${input.title}\n\n` : '';
  return `${h1}## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;
}
```

---

### `src/preview/previewRouter.ts` (utility, request-response)

**Analog:** Self — the canonical tab-reuse pattern (lines 36-59).

**Tab-reuse pattern** (lines 36-59 — reuse for contest tab idempotency AND wikilink-to-preview):
```typescript
export async function openOrReusePreview(
  plugin: LeetCodePlugin,
  slug: string,
): Promise<void> {
  const { workspace } = plugin.app;
  const existing = workspace.getLeavesOfType(PREVIEW_VIEW_TYPE);
  if (existing.length > 0 && existing[0]) {
    const leaf = existing[0];
    await leaf.setViewState({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug },
    });
    await workspace.revealLeaf(leaf);
    return;
  }
  const leaf = workspace.getLeaf('tab');
  await leaf.setViewState({
    type: PREVIEW_VIEW_TYPE,
    active: true,
    state: { slug },
  });
  await workspace.revealLeaf(leaf);
}
```

---

### `src/main.ts` (controller, event-driven)

**Analog:** Self — multiple modification sites.

**Contest tab idempotency — openContestProblem** (lines 932-948):
```typescript
async openContestProblem(problemIdx: number): Promise<void> {
  const session = this.contestSessionManager.getSession();
  if (!session) return;
  const problem = session.problems[problemIdx];
  if (!problem) return;
  const detail = this.settings.getProblemDetail(problem.slug);
  const contentHtml = detail?.contentHtml;
  const file = await this.contestScratch.createOrUpdate(problem, contentHtml);
  // BUG: unconditional new tab — must scan existing leaves first
  const leaf = this.app.workspace.getLeaf('tab');
  await leaf.openFile(file);
}
```

**Leaf scan by file path pattern** (from handleContestEnd lines 1004-1008):
```typescript
// Existing pattern for matching leaves by file path:
this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
  if ((leaf.view as { file?: { path: string } }).file?.path === file.path) {
    leaf.detach();
  }
});
```

**Wikilink interception — file-open hook registration pattern** (lines 786-795):
```typescript
this.registerEvent(
  this.app.workspace.on(
    'file-open',
    makeFileOpenHandler({
      app: this.app,
      settings: this.settings,
      retrofit: retrofitStarterCode,
    }),
  ),
);
```

**AI client construction (lazy-import target)** (lines 331-346):
```typescript
// Step 5.9 — Phase 07 AI client. Constructed AFTER SettingsStore.load
this.aiClient = new AIClient(
  this.settings,
  (provider, cfg) => this.requireAIDisclosure(provider, cfg),
);
```

**onVerdictChange callback (no-op bug site)** (line 396):
```typescript
onVerdictChange: () => { /* ProblemBrowserView polls getSession() for badge updates */ },
```

---

### `manifest.json` (config)

**Analog:** Self — version bump.

**Current state** (lines 1-9):
```json
{
  "id": "leetcode",
  "name": "LeetCode",
  "version": "1.0.1",
  "minAppVersion": "1.10.0",
  "description": "Browse, solve, and note LeetCode problems inside your vault.",
  "author": "Mo Xu",
  "authorUrl": "https://github.com/LikeSundayLikeRain",
  "isDesktopOnly": true
}
```

---

### `README.md` (config)

**Analog:** Self — network/cost audit of existing network usage section. No code pattern extraction needed; this is a documentation change.

---

## Shared Patterns

### DOM Element Creation (CF-07 Compliant)
**Source:** `src/solve/verdictModalRenderer.ts` lines 660-668
**Apply to:** VerdictModal pattern chip, any new DOM elements

```typescript
function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const el = (parent.ownerDocument ?? activeDocument).createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  el.textContent = text;  // Safe — never innerHTML
}
```

### Chip/Badge CSS Pattern
**Source:** `styles.css` lines 798-811
**Apply to:** Pattern chip in VerdictModal (new `.leetcode-pattern-chip` class)

```css
/* Existing chip pattern — pill shape with Obsidian CSS vars: */
.leetcode-submissions .leetcode-submissions-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  background: var(--background-modifier-border);
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 60px;
  justify-content: center;
}
```

### Tab-Reuse Pattern (Leaf Scan + setViewState)
**Source:** `src/preview/previewRouter.ts` lines 36-59
**Apply to:** Contest tab idempotency (D-07), Wikilink-to-preview (D-12)

```typescript
const existing = workspace.getLeavesOfType(VIEW_TYPE);
if (existing.length > 0 && existing[0]) {
  const leaf = existing[0];
  await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { slug } });
  await workspace.revealLeaf(leaf);
  return;
}
const leaf = workspace.getLeaf('tab');
await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { slug } });
await workspace.revealLeaf(leaf);
```

### Workspace Event Registration
**Source:** `src/main.ts` lines 786-795
**Apply to:** Wikilink-to-preview interception hook

```typescript
this.registerEvent(
  this.app.workspace.on(
    'file-open',
    makeFileOpenHandler({ /* deps */ }),
  ),
);
```

### Vault Write Convention
**Source:** `src/contest/ContestFinalizer.ts` lines 283-284
**Apply to:** All vault body mutations in Phase 12

```typescript
// Body writes: vault.process (never vault.modify)
await app.vault.process(existingFile, (body) =>
  rewriteCodeSection(body, problem.code, problem.language),
);

// Frontmatter writes: processFrontMatter
await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
  fm['lc-contest-id'] = safeSlug;
});
```

### Error Handling (Contest/Silent Pattern)
**Source:** `src/main.ts` lines 982-986
**Apply to:** ContestFinalizer error boundary, wikilink-to-preview failures

```typescript
} catch (err) {
  logger.debug('contest.finalize: failed', err);
  new Notice('Contest finalization failed. Check the console for details.', 6000);
  return;
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| -- | -- | -- | All files have exact analogs (all are modifications to existing code) |

Phase 12 introduces zero new files. Every change targets an existing source file with established patterns to follow.

## Metadata

**Analog search scope:** `src/solve/`, `src/contest/`, `src/preview/`, `src/notes/`, `src/main.ts`, `styles.css`, project root
**Files scanned:** 11 targets (all self-analog — modification phase)
**Pattern extraction date:** 2026-05-19
