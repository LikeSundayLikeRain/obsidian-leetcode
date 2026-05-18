# Phase 10: Contest (virtual + analysis) - Research

**Researched:** 2026-05-18
**Domain:** Virtual contest mode with timer, ephemeral sandbox, and AI performance analysis
**Confidence:** HIGH

## Summary

Phase 10 adds a virtual contest mode to the Obsidian LeetCode plugin. Users pick a past LeetCode contest from a searchable list (or "Surprise me" for random), solve 4 problems under a timed sandbox, and receive a summary note with scoring and AI-generated performance analysis. The editing surface is ephemeral (PluginData-persisted, no vault files during the contest), with canonical notes written to the vault on contest end.

The implementation builds on two strong foundations: (1) the existing `@leetnotion/leetcode-api` package already exports `LeetCodeAdvanced.getPastContests()` and `LeetCodeAdvanced.getContestQuestions()` — both route through the project's patched fetcher (CORS-free via `requestUrl`); (2) Phase 09's AI Review pattern (`AIStreamModal` + `vault.process` + `withXBullet` disclosure composition) maps directly to the contest analysis feature.

**Primary recommendation:** Upgrade `LeetCodeClient.lc` from `LeetCode` to `LeetCodeAdvanced` (drop-in — same constructor) to gain contest API methods without hand-rolling GraphQL. Build the contest session as a state machine persisted in `PluginData.contestSession`, with a dedicated `ContestView` ItemView as the editing surface for solving problems during the contest.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Contests live in the same sidebar tab as problems — ProblemBrowserView gains a toggle.
- **D-02:** Contest list fetched live from LC API on tab open, cached in PluginData. Same caching pattern as `problemIndex` — refresh on explicit pull or after 24h TTL.
- **D-03:** "Surprise me" via both button (in contest tab) and palette command.
- **D-04:** Clicking a contest opens a preview pane (contest details, problems, duration). A "Start Contest" button begins the session. Reuses Phase 06 preview pattern.
- **D-05:** Timer displayed in a sticky header bar within the contest tab. Not a global status bar item.
- **D-06:** Pause stops the clock. Paused time doesn't count. Summary records actual solving time.
- **D-07:** Abort requires confirmation modal.
- **D-08:** Timer persisted in PluginData with Date.now() baseline. Shape: `{ contestId, startedAt, pausedDuration, isPaused, pausedAt, problems[] }`.
- **D-09:** Contest solving is ephemeral — no .md file during the contest. Code lives in PluginData.
- **D-10:** Problem details fetched upfront on contest start. Editing surface created only when user navigates to a problem.
- **D-11:** Canonical notes written on contest end for all attempted problems. Even unsolved get their last code attempt.
- **D-12:** Contest notes in `{problemsFolder}/Contests/{contest-slug}/`. Uses NoteWriter pipeline. `lc-contest-id` frontmatter.
- **D-13:** Merge strategy — AC overwrites existing note's Code; non-AC leaves existing note alone, failed attempt in summary only.
- **D-14:** Rich frontmatter on summary note.
- **D-15:** Summary note location: `{problemsFolder}/Contests/{date}-{contest-id}.md`.
- **D-16:** Score uses LC's per-question credit values from contest API.
- **D-17:** Body sections: Results table, AI Analysis (locked), Notes (user).
- **D-18:** Missed problems auto-tagged with `#revisit`.
- **D-19:** AI gives holistic debrief + 1-2 sentence per-problem commentary.
- **D-20:** Triggered automatically (gated by `autoAIContestAnalysis` toggle, default OFF) and via manual palette command.
- **D-21:** `## AI Analysis` is a locked heading in summary notes. Idempotent.
- **D-22:** Disclosure gate + cost ledger apply. `withContestAnalysisBullet` factory.

### Claude's Discretion
- Exact editing surface for contest solving (dedicated ItemView pane vs hidden scratch .md).
- Contest list API discovery (resolved — `LeetCodeAdvanced.getPastContests`).
- How the ProblemBrowserView toggle is implemented (tabs, dropdown, segmented control).
- `maxTokens` for the contest analysis AI call.
- Whether "Surprise me" validates fetchability before starting.
- Exact contest preview pane implementation.

### Deferred Ideas (OUT OF SCOPE)
- Random-problem button bypass bug (file as separate quick-task).
- CONTEST-FUT-01 (live participation).
- CONTEST-FUT-02 (difficulty-weighted Surprise me).
- CONTEST-FUT-03 (upcoming contest schedule).
- AIPROV-FUT-02 (per-feature AI provider routing).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONTEST-01 | Searchable list of weekly + biweekly contests | `LeetCodeAdvanced.getPastContests({limit, skip})` returns `PastContests` with `totalNum` + paginated `contests[]`. Title slug encodes type (weekly/biweekly). |
| CONTEST-02 | "Surprise me" selects random past contest, skipping unfetchable | Random selection from cached contest index; validate by attempting `getContestQuestions(slug)` — if it throws, skip and retry (max 3 attempts). |
| CONTEST-03 | Timer with original duration; survives plugin reloads via Date.now()-baseline | `PastContest.duration` field (seconds) gives authentic per-contest duration. Persistence via `PluginData.contestSession` with epoch timestamps. |
| CONTEST-04 | Four contest problems fetched as notes with `lc-contest-id` frontmatter | `LeetCodeAdvanced.getContestQuestions(slug)` returns `ContestQuestion[]` with credit, title, title_slug, difficulty. Problem details fetched via existing `LeetCodeClient.getProblemDetail(title_slug)`. |
| CONTEST-05 | Remaining time + per-problem verdict status visible | Sticky header in contest tab rendering countdown + verdict badges. Timer tick via `registerInterval`. |
| CONTEST-06 | Pause and abort | Pause: set `isPaused=true, pausedAt=Date.now()`. Resume: add `Date.now()-pausedAt` to `pausedDuration`. Abort: confirmation modal, then finalize. |
| CONTEST-07 | Summary note on contest end | `mergeAIContestAnalysisSection` (mirrors `mergeAIReviewSection`); `vault.process` for body, `processFrontMatter` for rich metadata. |
| CONTEST-08 | Missed problems tagged `#revisit` | `processFrontMatter` on each problem note that wasn't AC'd — append `#revisit` to tags array. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contest list + search | Frontend (Plugin ItemView) | API/Network | UI rendering in ProblemBrowserView; data from LC API via LeetCodeAdvanced |
| Timer/pause/abort state machine | Frontend (Plugin runtime) | Storage (PluginData) | Timer logic runs in plugin JS; state persisted for reload survival |
| Ephemeral code editing | Frontend (Plugin ItemView) | Storage (PluginData) | Dedicated editing surface; code buffers in PluginData |
| Problem fetch (4 problems) | API/Network | Storage (PluginData cache) | Network calls through LeetCodeClient; cached in problemDetails |
| Summary note creation | Storage (Vault) | — | vault.process + processFrontMatter on contest end |
| AI contest analysis | API/Network (AI provider) | Storage (Vault) | AIClient.invokeStream sends prompt to provider; result written to vault |
| Score calculation | Frontend (Pure logic) | — | Sum credit values of solved problems; pure function |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@leetnotion/leetcode-api` (LeetCodeAdvanced) | `3.0.0` | Contest list + contest questions API | Already installed; LeetCodeAdvanced extends LeetCode (drop-in); exports `getPastContests`, `getContestQuestions` |
| `obsidian` (requestUrl, ItemView, Modal) | `1.12.3` | All HTTP, UI surfaces, vault writes | Standard plugin API; CORS bypass via requestUrl already wired |

### Supporting (already in project — no new installs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `turndown` | `7.2.4` | Problem HTML to Markdown | Converting fetched problem content for contest notes |
| `AIClient.invokeStream` | internal | AI contest analysis | Streaming AI response for the analysis section |

**No new npm packages needed.** Phase 10 uses only existing dependencies.

## Package Legitimacy Audit

> No new packages to install. Phase 10 uses `@leetnotion/leetcode-api` (already installed, v3.0.0) and existing project infrastructure.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
User clicks "Contests" tab in ProblemBrowserView
         |
         v
+-------------------+         +-----------------------+
| ProblemBrowserView|-------->| ContestListService    |
| (Contests mode)   |         | .refresh() → cache    |
+-------------------+         | .search()             |
         |                    +-----------------------+
         |                              |
         | click contest                | LeetCodeAdvanced.getPastContests()
         v                              v
+-------------------+         +-----------------------+
| Contest Preview   |         | requestUrl → LC API   |
| (Modal or View)   |         +-----------------------+
+-------------------+
         | "Start Contest"
         v
+-----------------------------------+
| ContestSessionManager             |
| - state machine (idle→active→end) |
| - timer tick via registerInterval |
| - persists to PluginData          |
+-----------------------------------+
         |                          |
         | user navigates to Q      | contest ends (timer/finish/abort)
         v                          v
+-------------------+     +---------------------------+
| ContestSolveView  |     | ContestFinalizer          |
| (ItemView)        |     | - batch write problem notes|
| - code editor     |     | - write summary note      |
| - run/submit      |     | - AI analysis (if enabled)|
+-------------------+     | - tag missed with #revisit|
                          +---------------------------+
```

### Recommended Project Structure

```
src/
├── contest/                    # NEW — all contest logic
│   ├── types.ts                # ContestSession, ContestProblemState interfaces
│   ├── ContestListService.ts   # Fetch + cache + search contest index
│   ├── ContestSessionManager.ts # State machine + timer + persistence
│   ├── ContestSolveView.ts     # ItemView for solving (code editor surface)
│   ├── ContestFinalizer.ts     # Batch note creation + summary write
│   ├── ContestPreview.ts       # Preview pane/modal before starting
│   ├── buildContestAnalysisPrompt.ts  # Pure prompt assembly
│   └── mergeAIContestAnalysisSection.ts # Idempotent vault write transform
├── browse/
│   └── ProblemBrowserView.ts   # MODIFIED — add contests mode toggle
├── ai/
│   └── disclosure.ts           # MODIFIED — add withContestAnalysisBullet
├── notes/
│   └── NoteTemplate.ts         # MODIFIED — extend LOCKED_HEADINGS for summary
├── settings/
│   └── SettingsStore.ts        # MODIFIED — add contestSession + settings
└── main.ts                     # MODIFIED — register commands + view
```

### Pattern 1: Contest Session State Machine

**What:** A state machine managing the contest lifecycle (idle → active → paused → ended).
**When to use:** Core pattern — drives all timer, persistence, and finalization logic.

```typescript
// Source: project convention (PluginData persistence pattern from Phase 07+)
interface ContestSession {
  contestSlug: string;
  contestTitle: string;
  contestType: 'weekly' | 'biweekly';
  duration: number; // seconds (from PastContest.duration)
  startedAt: number; // epoch ms
  pausedDuration: number; // cumulative ms paused
  isPaused: boolean;
  pausedAt: number | null; // epoch ms when pause began
  problems: ContestProblemState[];
}

interface ContestProblemState {
  slug: string;
  title: string;
  credit: number;
  difficulty: number; // 1=Easy, 2=Medium, 3=Hard
  verdict: 'unsolved' | 'attempted' | 'accepted';
  code: string; // ephemeral code buffer
  language: string; // user's selected language for this problem
  solvedAt: number | null; // epoch ms when AC'd
}
```

### Pattern 2: Timer with Pause/Resume via Date.now() Baseline

**What:** Compute remaining time from wall clock minus paused intervals — no interval drift.
**When to use:** Contest countdown display.

```typescript
// Source: CONTEXT.md D-08 locked shape
function getRemainingMs(session: ContestSession): number {
  const elapsed = session.isPaused
    ? (session.pausedAt! - session.startedAt - session.pausedDuration)
    : (Date.now() - session.startedAt - session.pausedDuration);
  const remaining = (session.duration * 1000) - elapsed;
  return Math.max(0, remaining);
}
```

### Pattern 3: Batch Note Write on Contest End (ContestFinalizer)

**What:** On contest end, iterate all attempted problems and write canonical notes + summary.
**When to use:** Contest finalization (timer expiry, user finish, abort).

```typescript
// Source: NoteWriter.openOrCreateProblemNote pattern (Phase 2)
// + vault.process (Phase 09 mergeAIReviewSection pattern)
async function finalizeContest(session: ContestSession, app: App, settings: SettingsStore): Promise<void> {
  // 1. For each problem with code !== '':
  //    - If note exists AND verdict === 'accepted': overwrite ## Code via vault.process
  //    - If note exists AND verdict !== 'accepted': skip (D-13 merge strategy)
  //    - If note doesn't exist: create via NoteWriter pipeline with lc-contest-id
  // 2. Tag missed problems with #revisit via processFrontMatter
  // 3. Write summary note to {problemsFolder}/Contests/{date}-{slug}.md
}
```

### Pattern 4: AI Contest Analysis (mirrors Phase 09 AI Review)

**What:** Build prompt from contest results, stream to AI, write to `## AI Analysis` locked heading.
**When to use:** Auto-trigger on contest end (if toggle ON) or manual palette command.

```typescript
// Source: Phase 09 Plan 01 buildReviewPrompt + mergeAIReviewSection pattern
function buildContestAnalysisPrompt(args: {
  contestTitle: string;
  problems: Array<{
    slug: string;
    difficulty: string;
    verdict: string;
    timeToSolve: number | null;
    code: string;
  }>;
}): string {
  // System: "You are analyzing a virtual LeetCode contest performance..."
  // Per-problem: slug + difficulty + verdict + time + code
  // Instructions: holistic patterns, technique gaps, what to practice next
  //              + 1-2 sentence per-problem commentary (NOT full review)
}
```

### Pattern 5: ProblemBrowserView Toggle (Problems/Contests)

**What:** A segmented control or tab bar at the top of ProblemBrowserView switching between two modes.
**When to use:** Entry point for contest discovery.

```typescript
// Source: existing ProblemBrowserView.renderShell pattern
// Add a mode toggle above the search/filter bar
private mode: 'problems' | 'contests' = 'problems';

private renderModeToggle(root: HTMLElement): void {
  const toggle = root.createDiv({ cls: 'lc-mode-toggle' });
  const problemsBtn = toggle.createEl('button', { text: 'Problems', cls: 'lc-mode-toggle__btn' });
  const contestsBtn = toggle.createEl('button', { text: 'Contests', cls: 'lc-mode-toggle__btn' });
  // Active state CSS class; click handler swaps mode + re-renders
}
```

### Anti-Patterns to Avoid

- **Writing vault files during a contest:** Per D-09, contest state is ephemeral in PluginData. Creating .md files mid-contest clutters the vault and creates orphans if aborted.
- **Using setInterval directly for the timer:** Must use `registerInterval` (or `setWindowTimeout` from shared/timers) so the timer auto-cancels on plugin unload.
- **Storing large HTML blobs in contest session:** Fetch problem details into the existing `problemDetails` cache; contest session stores only code + verdict state.
- **Mutating DISCLOSURE_BASE_COPY:** Use `withContestAnalysisBullet` composition factory (frozen arrays throw on mutation per WR-02 mitigation).
- **Using `vault.modify` for any write:** All body writes via `vault.process`; all frontmatter via `processFrontMatter`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Contest list from LC | Custom GraphQL query | `LeetCodeAdvanced.getPastContests()` | Already implemented, tested, paginated; shares project's patched fetcher |
| Contest questions | REST parser | `LeetCodeAdvanced.getContestQuestions(slug)` | Returns credit, title_slug, difficulty; uses patched fetcher (CORS-free) |
| Problem detail fetch | Custom fetch | Existing `LeetCodeClient.getProblemDetail(slug)` | Handles caching, session-expiry detection, error paths |
| HTML to Markdown | Custom parser | `turndown` (existing) | Already handles LC's HTML subset |
| AI streaming modal | Custom streaming UI | `AIStreamModal` (existing) | Handles debounced rendering, cancel, copy, cost ledger |
| Vault section merge | String manipulation | `mergeAIContestAnalysisSection` (new, mirroring `mergeAIReviewSection`) | Idempotent insert/replace pattern |
| Cost tracking | Manual ledger | `SettingsStore.addCostLedger(usd)` | Already wired from Phase 07 |

**Key insight:** Phase 10's AI feature is a thin adapter over the Phase 08/09 AI infrastructure. The real engineering challenge is the contest state machine + timer + ephemeral editing surface — none of which need external libraries.

## Common Pitfalls

### Pitfall 1: Timer Drift from setInterval

**What goes wrong:** Using `setInterval(1000)` to count down seconds accumulates drift (each tick can be late by 10-50ms; over 90 minutes this compounds to 5+ seconds of error).
**Why it happens:** JavaScript's event loop doesn't guarantee exact timing; GC pauses and heavy DOM work delay callbacks.
**How to avoid:** Store `startedAt` epoch and compute remaining = `duration*1000 - (now - startedAt - pausedDuration)` on every render tick. The display interval (1s or 500ms) only drives re-render cadence, NOT time accounting.
**Warning signs:** Timer shows different remaining time after a plugin reload (should be identical since both compute from epoch).

### Pitfall 2: Contest Session Lost on Crash

**What goes wrong:** User's code buffers vanish if Obsidian crashes mid-contest because state was only in-memory.
**Why it happens:** Plugin unload (`onunload`) doesn't fire on crash; only `loadData`/`saveData` with periodic persistence survives.
**How to avoid:** Save `contestSession` to `PluginData` on every significant state change: code edit (debounced, e.g., every 30s), verdict change, pause/resume. Use `this.saveData()` (which goes through PluginData).
**Warning signs:** After force-quit, contest state is stale or missing.

### Pitfall 3: LeetCodeAdvanced Constructor Breaks Auth

**What goes wrong:** Switching from `new LeetCode(cred)` to `new LeetCodeAdvanced(cred)` changes something in the auth flow.
**Why it happens:** `LeetCodeAdvanced extends LeetCode` — same constructor, same credential handling. This is unlikely but must be verified.
**How to avoid:** The switch is a one-line change in `LeetCodeClient.ts`. Run existing auth tests after the swap. If any break, the fallback is hand-rolling the two REST/GraphQL calls.
**Warning signs:** Existing problem-list or submission fetches fail after the class swap.

### Pitfall 4: Race Between Contest End and Active Submit

**What goes wrong:** User submits code, timer expires while judge is polling, contest finalizes with stale verdict (shows "attempted" instead of the AC that just came back).
**Why it happens:** The timer end fires the finalizer while pollingOrchestrator is still awaiting a terminal response.
**How to avoid:** On timer expiry, if an active solve is in flight for a contest problem, await its resolution (with a short timeout, e.g., 10s) before finalizing. Alternatively, mark the problem as "pending" and re-check after poll returns.
**Warning signs:** Final summary shows "attempted" for a problem the user saw "Accepted" for.

### Pitfall 5: Unfetchable Problems in "Surprise Me"

**What goes wrong:** Random contest selection picks a contest whose problems have been removed/deprecated from LC (404 on problem detail fetch).
**Why it happens:** Very old contests (2018-era) may have problems that LC removed or restructured.
**How to avoid:** On contest start, validate all 4 problem slugs by calling `getContestQuestions(slug)`. If any slug fails `getProblemDetail`, skip this contest in "Surprise me" (retry with a different random pick, max 3 retries). For direct picks, show a Notice explaining which problems are unavailable.
**Warning signs:** Contest starts successfully but one or more problem panes show "Problem unavailable."

### Pitfall 6: Bundle Size Pressure

**What goes wrong:** Phase 10 pushes the bundle past the 1.2 MB hard ceiling.
**Why it happens:** Current bundle is 1.11 MB with ~63 KB headroom.
**How to avoid:** Phase 10 adds no new npm packages — all logic is hand-written TypeScript. Estimated delta: 10-20 KB for the contest module + AI prompt. Keep functions small and avoid importing heavy runtime modules. Monitor with `npm run check:bundle-size` after each plan.
**Warning signs:** `BUNDLE CHECK WARN` in CI output. Target: stay under 1.15 MB (keep 50 KB buffer for Phase 11).

### Pitfall 7: Contest Tab State Desync After Plugin Reload

**What goes wrong:** After reload, ProblemBrowserView opens in "Problems" mode but a contest is active — user doesn't see the timer.
**Why it happens:** The view's `mode` state is in-memory; PluginData has the contest session but the view doesn't read it on open.
**How to avoid:** In `ProblemBrowserView.onOpen()`, check `settings.getContestSession()`. If non-null and not ended, auto-switch to contests mode and render the active contest timer.
**Warning signs:** After reload, no visible indication that a contest is running.

## Code Examples

### Example 1: Upgrading LeetCodeClient to use LeetCodeAdvanced

```typescript
// Source: existing src/api/LeetCodeClient.ts pattern
import { LeetCodeAdvanced, Credential } from '@leetnotion/leetcode-api';
import type { PastContests, ContestQuestions } from '@leetnotion/leetcode-api';

export class LeetCodeClient {
  public lc!: InstanceType<typeof LeetCodeAdvanced>;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    this.lc = new LeetCodeAdvanced();  // Drop-in replacement
  }

  async reauthenticate(): Promise<void> {
    const cookies = this.settings.getAuthCookies();
    if (!cookies) { this.lc = new LeetCodeAdvanced(); return; }
    const cred = new Credential();
    await cred.init(cookies.LEETCODE_SESSION);
    this.lc = new LeetCodeAdvanced(cred);
  }

  // New contest methods:
  async getPastContests(opts?: { limit?: number; skip?: number }): Promise<PastContests> {
    return (this.lc as LeetCodeAdvanced).getPastContests(opts ?? {});
  }

  async getContestQuestions(contestSlug: string): Promise<ContestQuestions> {
    return (this.lc as LeetCodeAdvanced).getContestQuestions(contestSlug);
  }
}
```

### Example 2: Contest Session PluginData Extension

```typescript
// Source: existing PluginData shape-guard pattern (Phase 07+)
// Addition to src/settings/SettingsStore.ts PluginData interface:

export interface ContestSession {
  contestSlug: string;
  contestTitle: string;
  contestType: 'weekly' | 'biweekly';
  duration: number; // seconds
  startedAt: number; // epoch ms
  pausedDuration: number; // ms
  isPaused: boolean;
  pausedAt: number | null;
  problems: ContestProblemState[];
}

export interface ContestProblemState {
  slug: string;
  title: string;
  credit: number;
  difficulty: number;
  verdict: 'unsolved' | 'attempted' | 'accepted';
  code: string;
  language: string;
  solvedAt: number | null;
}

// In PluginData interface:
contestSession: ContestSession | null;
autoAIContestAnalysis: boolean;
contestIndex: { fetchedAt: number; contests: CachedContest[] } | null;
```

### Example 3: Disclosure Extension (withContestAnalysisBullet)

```typescript
// Source: existing src/ai/disclosure.ts withDebugBullet / withReviewBullet pattern
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

### Example 4: mergeAIContestAnalysisSection (mirrors mergeAIReviewSection)

```typescript
// Source: existing src/ai/mergeAIReviewSection.ts pattern
export const AI_ANALYSIS_HEADING_LINE = '## AI Analysis' as const;

export function mergeAIContestAnalysisSection(body: string, analysisContent: string): string {
  const lines = body.split('\n');
  const headingIdx = lines.findIndex(l => l === AI_ANALYSIS_HEADING_LINE);

  if (headingIdx >= 0) {
    // Replacement path: discard from heading to next H2 or EOF
    const nextH2 = lines.findIndex((l, i) => i > headingIdx && /^## /.test(l));
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    const after = nextH2 >= 0 ? '\n\n' + lines.slice(nextH2).join('\n') : '';
    return before + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + after + '\n';
  }

  // First write: insert before ## Notes (user section stays last)
  const notesIdx = lines.findIndex(l => l === '## Notes');
  if (notesIdx >= 0) {
    const before = lines.slice(0, notesIdx).join('\n').replace(/\n+$/, '');
    const after = '\n\n' + lines.slice(notesIdx).join('\n');
    return before + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + after;
  }

  // Fallback: append at EOF
  return body.replace(/\n+$/, '') + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + '\n';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `LeetCode` class only | `LeetCodeAdvanced` (extends LeetCode) | Available since @leetnotion/leetcode-api 3.0.0 (2026-04) | Gives access to contest methods without hand-rolling |
| Manual GraphQL for contest data | Library methods (`getPastContests`, `getContestQuestions`) | Same | No need to discover/maintain raw GraphQL queries |
| Frozen DISCLOSURE_BASE_COPY with mutation | Composition factories (`withXBullet`) | Phase 07 Plan 07 WR-02 | Must use `withContestAnalysisBullet` composition, not push() |

**Deprecated/outdated:**
- Direct `DISCLOSURE_BASE_COPY.willSend.push(...)` — will throw at runtime (Object.freeze'd since Phase 07 Plan 07).
- `vault.modify` for any write — forbidden since v1.0; always use `vault.process`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `LeetCodeAdvanced` is a true drop-in replacement for `LeetCode` (same constructor, same credential flow) | Standard Stack | If it changes behavior, auth or problem fetching breaks; fallback is hand-rolling 2 API calls |
| A2 | The library's `getContestQuestions` REST endpoint (`/contest/api/info/{slug}/`) does not require authentication | Architecture Patterns | If auth required, user must be logged in to browse contests (acceptable — they need auth to submit anyway) |
| A3 | `PastContest.duration` is in seconds (not minutes) | Pattern 1 | If in minutes, timer would be 60x too long; easy to verify at runtime |
| A4 | Very old contests (pre-2019) may have unfetchable problem slugs | Pitfall 5 | "Surprise me" could fail silently; mitigated by retry logic |
| A5 | The `## AI Analysis` heading placement (after Results, before Notes) matches user expectation for summary notes | Pattern 4 | Low risk — locked by D-17/D-21; layout is user-tested in CONTEXT |

## Open Questions

1. **Editing Surface for Contest Solving**
   - What we know: D-09 says ephemeral (no .md file); D-10 says editing surface created on navigate.
   - What's unclear: Whether a dedicated `ItemView` (like ProblemPreviewView) or a hidden scratch file in `.obsidian/plugins/` is simpler.
   - Recommendation: Use a dedicated `ContestSolveView` (ItemView) with a bare CodeMirror editor. Rationale: (1) avoids vault clutter, (2) gives full control over the editing chrome, (3) doesn't create orphan files on abort. The view gets state from `PluginData.contestSession.problems[i].code` and writes back on every change (debounced).

2. **Run/Submit During Contest**
   - What we know: Users need to test/submit their code during the contest.
   - What's unclear: Whether existing `run` and `submit` commands work without a .md note file.
   - Recommendation: The `ContestSolveView` should provide Run/Submit buttons that use the existing `leetcodeRest.ts` infrastructure directly (it needs slug, code, language, internalQuestionId — all available from PluginData). The verdict is recorded back into `ContestProblemState.verdict`.

3. **How to Handle `getContestQuestions` When Unauthenticated**
   - What we know: The REST endpoint `/contest/api/info/{slug}/` injects cookies from credentials.
   - What's unclear: Whether the endpoint requires authentication or is public.
   - Recommendation: Test empirically at implementation time. If auth required, gate contest start on login status (same as problem browser).

## Environment Availability

> Step 2.6: SKIPPED (no external dependencies identified). Phase 10 uses only existing project infrastructure and installed npm packages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/contest/ --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONTEST-01 | Contest list fetched + searchable | unit | `npx vitest run tests/contest/ContestListService.test.ts` | Wave 0 |
| CONTEST-02 | Surprise me selects random, skips unfetchable | unit | `npx vitest run tests/contest/surpriseMe.test.ts` | Wave 0 |
| CONTEST-03 | Timer computes remaining correctly with pause | unit | `npx vitest run tests/contest/timer.test.ts` | Wave 0 |
| CONTEST-04 | Problem notes get lc-contest-id frontmatter | unit | `npx vitest run tests/contest/ContestFinalizer.test.ts` | Wave 0 |
| CONTEST-05 | Timer display renders remaining + badges | unit | `npx vitest run tests/contest/timerDisplay.test.ts` | Wave 0 |
| CONTEST-06 | Pause/abort state transitions | unit | `npx vitest run tests/contest/ContestSessionManager.test.ts` | Wave 0 |
| CONTEST-07 | Summary note written with correct shape | unit | `npx vitest run tests/contest/summaryNote.test.ts` | Wave 0 |
| CONTEST-08 | Missed problems tagged #revisit | unit | `npx vitest run tests/contest/revisitTag.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/contest/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/contest/` directory — all test files listed above
- [ ] Timer unit tests (pure function, no DOM)
- [ ] ContestListService tests (mock client)
- [ ] ContestFinalizer tests (mock vault)
- [ ] ContestSessionManager state transition tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (contest actions require LC session) | Existing auth gate (isLoggedIn check before contest API calls) |
| V3 Session Management | yes (session cookie used for contest API) | Existing session-expiry detection via `isSessionExpired` |
| V4 Access Control | no | — |
| V5 Input Validation | yes (contest slugs from LC API) | Validate slug format before interpolating into URLs |
| V6 Cryptography | no | — |

### Known Threat Patterns for Contest

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Code buffer exfiltration via AI call | Information Disclosure | `withContestAnalysisBullet` disclosure gate; user must acknowledge before AI sends code |
| Contest slug injection in REST URL | Tampering | Validate slug matches `/^(weekly\|biweekly)-contest-\d+$/` before interpolation |
| Stale contest session after cookie rotation | Denial of Service | Check `isSessionExpired` on contest API calls; abort contest gracefully if session lost |

## Sources

### Primary (HIGH confidence)
- `@leetnotion/leetcode-api` v3.0.0 `lib/index.d.ts` — `LeetCodeAdvanced`, `getPastContests`, `getContestQuestions`, `PastContest`, `ContestQuestion` interfaces (verified in `node_modules`)
- `@leetnotion/leetcode-api` v3.0.0 `lib/index.js` lines 1650-1700 — actual REST/GraphQL implementation of contest methods (verified in `node_modules`)
- `src/api/requestUrlFetcher.ts` — patched fetcher shim confirming `fetch_default` routes through `requestUrl` (verified in codebase)
- `src/ai/disclosure.ts` — `withDebugBullet` / `withReviewBullet` frozen composition pattern (verified in codebase)
- `src/ai/mergeAIReviewSection.ts` — idempotent vault-write transform pattern (verified in codebase)
- `src/ai/AIStreamModal.ts` — streaming modal for AI output (verified in codebase)
- `src/solve/pollingOrchestrator.ts` — `registerInterval` timer pattern (verified in codebase)
- `src/notes/NoteTemplate.ts` — `LOCKED_HEADINGS` tuple and heading constants (verified in codebase)
- `scripts/check-bundle-size.mjs` — hard limit 1,200,000 bytes; current 1,137,109 bytes (verified)

### Secondary (MEDIUM confidence)
- CONTEXT.md D-08 timer shape specification (from user discuss session)
- STATE.md bundle size history (986 KB Phase 08-04 -> 1.11 MB current)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs verified in installed node_modules; no new packages
- Architecture: HIGH — all patterns are direct extensions of existing Phase 06-09 code
- Pitfalls: HIGH — derived from codebase analysis and concrete implementation details

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable — no fast-moving dependencies)
