# Phase 10: Contest (virtual + analysis) - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/contest/types.ts` | model | — | `src/browse/types.ts` | exact |
| `src/contest/ContestListService.ts` | service | CRUD | `src/browse/ProblemListService.ts` | exact |
| `src/contest/ContestSessionManager.ts` | service | event-driven | `src/solve/pollingOrchestrator.ts` | role-match |
| `src/contest/ContestSolveView.ts` | component | request-response | `src/preview/ProblemPreviewView.ts` | exact |
| `src/contest/ContestPreview.ts` | component | request-response | `src/preview/ProblemPreviewView.ts` | exact |
| `src/contest/ContestFinalizer.ts` | service | batch | `src/notes/NoteWriter.ts` | role-match |
| `src/contest/buildContestAnalysisPrompt.ts` | utility | transform | `src/ai/buildReviewPrompt.ts` | exact |
| `src/contest/mergeAIContestAnalysisSection.ts` | utility | transform | `src/ai/mergeAIReviewSection.ts` | exact |
| `src/browse/ProblemBrowserView.ts` (MODIFIED) | component | request-response | self (existing) | exact |
| `src/ai/disclosure.ts` (MODIFIED) | utility | — | self (`withReviewBullet`) | exact |
| `src/notes/NoteTemplate.ts` (MODIFIED) | model | — | self (existing) | exact |
| `src/settings/SettingsStore.ts` (MODIFIED) | config | CRUD | self (shape-guard pattern) | exact |
| `src/main.ts` (MODIFIED) | controller | request-response | self (addCommand pattern) | exact |
| `src/api/LeetCodeClient.ts` (MODIFIED) | service | request-response | self (existing methods) | exact |

## Pattern Assignments

### `src/contest/types.ts` (model)

**Analog:** `src/browse/types.ts`

**Imports pattern** (lines 1-3 of analog):
```typescript
// src/browse/types.ts — type-only module, no runtime imports.
// Exported interfaces consumed by ProblemListService + ProblemBrowserView.
```

**Core pattern:** Pure interface declarations exported for cross-module consumption. No runtime code, no side effects. Mirror the `IndexedProblem` / `ProblemIndex` shape for contest equivalents:
```typescript
// Contest domain types — consumed by ContestListService, ContestSessionManager,
// ContestFinalizer, ContestSolveView, ProblemBrowserView (contests mode).

export interface CachedContest {
  slug: string;
  title: string;
  startTime: number; // epoch seconds
  duration: number; // seconds
  type: 'weekly' | 'biweekly';
}

export interface ContestIndex {
  fetchedAt: number;
  contests: CachedContest[];
}

export interface ContestSession { /* D-08 shape from CONTEXT.md */ }
export interface ContestProblemState { /* per-problem ephemeral state */ }
```

---

### `src/contest/ContestListService.ts` (service, CRUD)

**Analog:** `src/browse/ProblemListService.ts`

**Imports pattern** (lines 10-12):
```typescript
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore, CompoundFilter, FilterRule } from '../settings/SettingsStore';
import type { IndexedProblem, ProblemIndex } from './types';
```

**TTL + cache pattern** (lines 14-15):
```typescript
export const INDEX_TTL_MS = 24 * 60 * 60 * 1000; // D-07: 24h TTL
export const PAGE_SIZE = 50; // D-07: page size (anti-bulk gate)
```

**Single-flight guard pattern** (lines 58-79):
```typescript
export class ProblemListService {
  private refreshPromise: Promise<IndexedProblem[]> | null = null;

  constructor(
    private readonly client: LeetCodeClient,
    private readonly settings: SettingsStore,
  ) {}

  async refresh(force = false, onProgress?: RefreshProgressCallback): Promise<IndexedProblem[]> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._doRefresh(force, onProgress).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
```

**TTL check + cache-hit early return** (lines 86-100):
```typescript
  private async _doRefresh(force: boolean, onProgress?: RefreshProgressCallback): Promise<IndexedProblem[]> {
    const cached = this.settings.getProblemIndex();
    if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL_MS) {
      if (onProgress) {
        onProgress({ loaded: cached.problems.length, total: cached.problems.length, rows: cached.problems, done: true });
      }
      return cached.problems;
    }
    // ... fetch from API, persist via settings.setProblemIndex(index)
  }
```

**In-memory search pattern** (lines 157-163):
```typescript
  search(idx: IndexedProblem[], term: string): IndexedProblem[] {
    const q = term.trim().toLowerCase();
    if (!q) return idx;
    return idx.filter((p) =>
      p.title.toLowerCase().includes(q) || String(p.id).startsWith(q),
    );
  }
```

---

### `src/contest/ContestSessionManager.ts` (service, event-driven)

**Analog:** `src/solve/pollingOrchestrator.ts`

**Imports pattern** (lines 19-20):
```typescript
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
```

**Timer registration pattern** (lines 38-39):
```typescript
export type RegisterIntervalFn = (fn: () => void, ms: number) => unknown;
```

**Date.now() baseline for time calculation** (lines 105-106):
```typescript
export function pollSubmission(args: PollSubmissionArgs): Promise<TerminalCheckResponse> {
  const { fetcher, submissionId, registerInterval, abortSignal, headers } = args;
  const startedAt = Date.now();
```

**Custom error classes** (lines 76-90):
```typescript
export class AbortError extends Error {
  constructor() {
    super('Submission aborted by user');
    this.name = 'AbortError';
  }
}

export class JudgeTimeoutError extends Error {
  constructor() {
    super('LeetCode judge timed out');
    this.name = 'JudgeTimeoutError';
  }
}
```

**Key adaptation:** Contest timer uses `registerInterval` for periodic tick (display refresh) but computes remaining time from epoch math (no drift). Shape:
```typescript
function getRemainingMs(session: ContestSession): number {
  const elapsed = session.isPaused
    ? (session.pausedAt! - session.startedAt - session.pausedDuration)
    : (Date.now() - session.startedAt - session.pausedDuration);
  return Math.max(0, (session.duration * 1000) - elapsed);
}
```

---

### `src/contest/ContestSolveView.ts` (component, request-response)

**Analog:** `src/preview/ProblemPreviewView.ts`

**Imports pattern** (lines 30-49):
```typescript
import {
  ItemView,
  MarkdownRenderer,
  Notice,
  Scope,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import type LeetCodePlugin from '../main';
import type { DetailCacheEntry } from '../notes/types';
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';
import { logger } from '../shared/logger';
```

**View type constant** (line 55):
```typescript
export const PREVIEW_VIEW_TYPE = 'leetcode-preview';
```

**ItemView class skeleton** (lines 183-221):
```typescript
export class ProblemPreviewView extends ItemView {
  private slug: string | null = null;
  private renderToken = 0;
  private rootEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
  }

  getViewType(): string { return PREVIEW_VIEW_TYPE; }
  getIcon(): string { return 'eye'; }
  getDisplayText(): string { /* dynamic title */ }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-preview');
    this.rootEl = root;
    // ... keyboard scope registration, initial render
  }

  async onClose(): Promise<void> {
    // Cancel timers, bump renderToken, null refs
    this.renderToken += 1;
    this.rootEl = null;
  }

  async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    // Parse state, store slug, trigger render
  }

  getState(): { slug: string | null } { return { slug: this.slug }; }
```

**Render-token stale-fetch guard** (lines 332-356):
```typescript
  private async renderForSlug(slug: string): Promise<void> {
    if (!this.rootEl) return;
    const root = this.rootEl;
    this.renderToken += 1;
    const myToken = this.renderToken;
    // ... fetch
    if (myToken !== this.renderToken) return; // discard stale
  }
```

---

### `src/contest/ContestPreview.ts` (component, request-response)

**Analog:** `src/preview/ProblemPreviewView.ts` + `src/preview/previewRouter.ts`

**Tab-reuse router pattern** (previewRouter.ts lines 36-59):
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
  await leaf.setViewState({ type: PREVIEW_VIEW_TYPE, active: true, state: { slug } });
  await workspace.revealLeaf(leaf);
}
```

**Header render pattern** (ProblemPreviewView.ts lines 123-166):
```typescript
export function renderHeader(
  container: HTMLElement,
  detail: DetailCacheEntry,
  noteExists: boolean,
): HTMLButtonElement {
  container.empty();
  container.addClass('leetcode-preview__header');
  container.addClass('is-sticky');
  // Title, difficulty pill, action button via createEl
  const button = container.createEl('button', { cls: actionCls, text: actionLabel });
  return button;
}
```

---

### `src/contest/ContestFinalizer.ts` (service, batch)

**Analog:** `src/notes/NoteWriter.ts`

**Imports pattern** (lines 35-49):
```typescript
import { Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { isSessionExpired } from '../api/LeetCodeClient';
import { logger } from '../shared/logger';
import { showSessionExpiredNotice } from '../solve/SessionExpiredNotice';
import {
  applyFrontmatter,
  buildFrontmatterInput,
  buildNoteBody,
  buildNotePath,
  mapStatusDisplay,
} from './NoteTemplate';
import { htmlToMarkdown } from './htmlToMarkdown';
import { rewriteProblemSection } from './HeadingRegion';
```

**Structural client interface** (lines 62-64):
```typescript
export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}
```

**Key adaptation:** ContestFinalizer iterates `session.problems[]`, calling NoteWriter pipeline per-problem with `lc-contest-id` frontmatter. Uses `vault.process` for body writes and `processFrontMatter` for metadata. Follows D-13 merge strategy (AC overwrites, non-AC skips existing).

---

### `src/contest/buildContestAnalysisPrompt.ts` (utility, transform)

**Analog:** `src/ai/buildReviewPrompt.ts`

**Imports pattern** (lines 1-2 — zero deps):
```typescript
// No imports — pure function, no external deps.
```

**Interface + pure assembler** (lines 25-67):
```typescript
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
    // ... structured instructions
  ].join('\n');
}
```

**Purity contract (header comment):**
```typescript
// Purity:
//   - No imports (zero external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args → byte-identical output across calls.
```

---

### `src/contest/mergeAIContestAnalysisSection.ts` (utility, transform)

**Analog:** `src/ai/mergeAIReviewSection.ts`

**Imports pattern** (line 18):
```typescript
import { AI_REVIEW_HEADING_LINE } from '../notes/NoteTemplate';
```

**Full idempotent merge pattern** (lines 30-54):
```typescript
export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines);

  if (headingIdx >= 0) {
    // Replacement path: discard from heading to EOF, insert new content.
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
  }

  // First-write path: append after all existing content.
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
}

function findExactHeading(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === AI_REVIEW_HEADING_LINE) return i;
  }
  return -1;
}
```

**Key adaptation for contest:** Contest analysis heading is `## AI Analysis` (placed between `## Results` and `## Notes`). First-write inserts before `## Notes`; replacement discards from heading to next H2 or EOF (mirrors RESEARCH.md Example 4 exactly).

---

### `src/browse/ProblemBrowserView.ts` (MODIFIED — add contests mode toggle)

**Analog:** Self — existing shell rendering pattern

**onOpen shell pattern** (lines 103-146):
```typescript
  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-browser');
    // Load persisted filter
    this.filter = this.plugin.settings.getFilter();
    // ... auth gate, then renderEmptyState + refreshAndRender
  }
```

**renderShell progressive pattern** (lines 184-199):
```typescript
  private async refreshAndRender(root: HTMLElement): Promise<void> {
    root.empty();
    const progressEl = this.createProgressBar(root);
    this.index = [];
    this.renderShell(root);
    // ... progressive load
  }
```

**Key adaptation:** Add a `private mode: 'problems' | 'contests' = 'problems'` field. On `onOpen`, check if an active contest session exists in PluginData — if so, auto-switch to contests mode. Render a toggle bar above the search area. In contests mode, delegate to a `renderContestList` / `renderActiveContest` method instead of `refreshAndRender`.

---

### `src/ai/disclosure.ts` (MODIFIED — add `withContestAnalysisBullet`)

**Analog:** Self — `withReviewBullet` (lines 130-140)

**Composition factory pattern:**
```typescript
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

**Phase 10 addition:** Clone this pattern exactly with contest-specific bullet text:
```typescript
export function withContestAnalysisBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'Contest analysis sends contest metadata, per-problem summary (slug, difficulty, verdict, time, your code)',
    ],
    neverSends: base.neverSends,
  };
}
```

---

### `src/notes/NoteTemplate.ts` (MODIFIED — extend headings)

**Analog:** Self — heading constant declarations (lines 43-84)

**Heading constant pattern** (lines 63-66):
```typescript
export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;
```

**LOCKED_HEADINGS tuple** (lines 78-84):
```typescript
export const LOCKED_HEADINGS = [
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  AI_REVIEW_HEADING_LINE,
] as const;
```

**Phase 10 addition:** Add `AI_ANALYSIS_HEADING_LINE = '## AI Analysis' as const`. Note: this heading applies to SUMMARY notes only (not problem notes), so it does NOT go into `LOCKED_HEADINGS` (which gates the section lock on problem notes).

---

### `src/settings/SettingsStore.ts` (MODIFIED — add contest fields)

**Analog:** Self — shape-guard pattern at load time

**PluginData interface extension** (line 50+):
```typescript
export interface PluginData {
  version: 1;
  auth: AuthCookies | null;
  // ... existing fields
  autoAIReviewOnAC: boolean;  // Phase 09
  // Phase 10 additions:
  // contestSession: ContestSession | null;
  // autoAIContestAnalysis: boolean;
  // contestIndex: ContestIndex | null;
}
```

**Shape-guard pattern** (lines 609-614):
```typescript
      // Phase 09 AIREV-01 — autoAIReviewOnAC shape-guard (T-09-04).
      autoAIReviewOnAC: typeof raw.autoAIReviewOnAC === 'boolean'
        ? raw.autoAIReviewOnAC
        : DEFAULT_DATA.autoAIReviewOnAC,
```

**Phase 10 shape-guards follow same pattern:**
```typescript
      // Phase 10 — contestSession shape-guard
      contestSession: isValidContestSession(raw.contestSession)
        ? raw.contestSession
        : null,
      // Phase 10 — autoAIContestAnalysis shape-guard
      autoAIContestAnalysis: typeof raw.autoAIContestAnalysis === 'boolean'
        ? raw.autoAIContestAnalysis
        : false,
      // Phase 10 — contestIndex shape-guard
      contestIndex: isValidContestIndex(raw.contestIndex)
        ? raw.contestIndex
        : null,
```

---

### `src/main.ts` (MODIFIED — register commands + view)

**Analog:** Self — `addCommand` + `registerView` patterns

**View registration** (lines 325-334):
```typescript
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this));
    this.registerView(PREVIEW_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemPreviewView(leaf, this));
```

**Global command** (lines 398-402):
```typescript
    this.addCommand({
      id: 'test-ai-connection',
      name: 'Test AI connection',
      callback: () => { void this.testActiveAIConnection(); },
    });
```

**editorCheckCallback command** (lines 519-536 — AI review command):
```typescript
    this.addCommand({
      id: 'generate-ai-review',
      name: 'Generate AI review',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const fm: Record<string, unknown> | undefined = cache?.frontmatter;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) {
          void this.generateAIReview(file);
        }
        return true;
      },
    });
```

**Phase 10 commands:**
- `start-random-contest` — global callback (no editorCheckCallback)
- `generate-contest-analysis` — editorCheckCallback gated on `lc-contest-id` frontmatter
- `pause-contest` / `abort-contest` — global callback (checks active session internally)

---

### `src/api/LeetCodeClient.ts` (MODIFIED — upgrade to LeetCodeAdvanced)

**Analog:** Self — existing method pattern

**Import + class instantiation** (lines 8-57):
```typescript
import { LeetCode, Credential } from '@leetnotion/leetcode-api';
import type { SettingsStore } from '../settings/SettingsStore';

export class LeetCodeClient {
  public lc!: InstanceType<typeof LeetCode>;
  private settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    this.lc = new LeetCode();
  }

  async reauthenticate(): Promise<void> {
    const cookies = this.settings.getAuthCookies();
    if (!cookies) { this.lc = new LeetCode(); return; }
    const cred = new Credential();
    await cred.init(cookies.LEETCODE_SESSION);
    this.lc = new LeetCode(cred);
  }
```

**Phase 10 adaptation:** Change `LeetCode` to `LeetCodeAdvanced` (drop-in). Add two new methods following the `getProblemDetail` pattern (line 120-129):
```typescript
  async getPastContests(opts?: { limit?: number; skip?: number }): Promise<PastContests> {
    return (this.lc as LeetCodeAdvanced).getPastContests(opts ?? {});
  }

  async getContestQuestions(contestSlug: string): Promise<ContestQuestions> {
    return (this.lc as LeetCodeAdvanced).getContestQuestions(contestSlug);
  }
```

---

## Shared Patterns

### Authentication Gate
**Source:** `src/browse/ProblemBrowserView.ts` lines 133-139
**Apply to:** `ContestListService`, `ContestSessionManager` (before API calls), `ProblemBrowserView` contests mode
```typescript
    if (!this.plugin.auth.isLoggedIn()) {
      this.renderLoggedOutState(root, {
        heading: 'Log in to browse problems',
        body: 'Sign in to LeetCode to load the problem list.',
      });
      return;
    }
```

### Vault Write via `vault.process`
**Source:** `src/ai/mergeAIReviewSection.ts` (full file) + NoteWriter pattern
**Apply to:** `ContestFinalizer` (summary note body write), `mergeAIContestAnalysisSection`
```typescript
// Called inside: await app.vault.process(file, (body) => mergeAIContestAnalysisSection(body, content));
```

### Frontmatter Write via `processFrontMatter`
**Source:** `src/notes/NoteTemplate.ts` `applyFrontmatter` + NoteWriter usage
**Apply to:** `ContestFinalizer` (problem notes + summary note frontmatter)
```typescript
// Called inside: await app.fileManager.processFrontMatter(file, (fm) => { fm['lc-contest-id'] = slug; });
```

### Timer via `registerInterval`
**Source:** `src/solve/pollingOrchestrator.ts` lines 38-39, 166
**Apply to:** `ContestSessionManager` (1-second display tick)
```typescript
export type RegisterIntervalFn = (fn: () => void, ms: number) => unknown;
// Usage: registerInterval(() => { this.tick(); }, 1000);
```

### AI Streaming + Cost Ledger
**Source:** `src/ai/AIStreamModal.ts` lines 68-80, `src/settings/SettingsStore.ts` line 865
**Apply to:** Contest analysis (manual command triggers AIStreamModal with contest prompt)
```typescript
export interface AIStreamModalArgs {
  provider: AIProvider;
  prompt: string;
  aiClient: AIClient;
  model?: string;
}
// After stream completes: await settings.addCostLedger(estimatedUsd);
```

### Disclosure Composition
**Source:** `src/ai/disclosure.ts` lines 101-140
**Apply to:** Contest analysis call site (compose `withContestAnalysisBullet(DISCLOSURE_BASE_COPY)`)
```typescript
// Pattern: NEVER mutate DISCLOSURE_BASE_COPY (frozen). Compose:
const disclosure = withContestAnalysisBullet(DISCLOSURE_BASE_COPY);
```

### Error Classes
**Source:** `src/shared/errors.ts` + `src/solve/pollingOrchestrator.ts` lines 76-90
**Apply to:** `ContestSessionManager` (session-expired during contest, unfetchable problems)
```typescript
export class AbortError extends Error {
  constructor() { super('...'); this.name = 'AbortError'; }
}
```

### Command ID Rules
**Source:** `src/main.ts` lines 342-346 (comment block)
**Apply to:** All new commands registered in Phase 10
```typescript
// - id does NOT contain the plugin id ('leetcode') or the word 'command'
// - name is sentence case and does NOT start with the plugin name
// - NO hotkeys field (commands/no-default-hotkeys)
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 10 files have close analogs in the existing codebase |

Every new file maps directly to an existing pattern. The contest state machine (`ContestSessionManager`) is the most novel piece, but it maps well to the polling orchestrator's timer + abort + error handling patterns combined with PluginData persistence.

## Metadata

**Analog search scope:** `src/` (all 80 TypeScript files)
**Files scanned:** 80
**Pattern extraction date:** 2026-05-18
