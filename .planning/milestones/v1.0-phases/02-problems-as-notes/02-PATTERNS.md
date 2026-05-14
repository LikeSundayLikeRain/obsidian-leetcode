# Phase 2: Problems as Notes - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 12 new / 5 modified / ~22 test files + helpers + scripts
**Analogs found:** 9 / 12 new files with in-repo analog; 5 / 5 modified files with exact analog (they ARE their own analog — extend-in-place). Test helpers + htmlToMarkdown + BaseFile have no in-repo analog.

## File Classification

### New source files under `src/notes/`

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/notes/NoteTemplate.ts` | model / schema single-source | transform (detail → template input) | `src/browse/types.ts` (types-only module) + `src/settings/SettingsStore.ts` DEFAULT_DATA pattern | role-match (no exact analog for "schema SSoT module") |
| `src/notes/htmlToMarkdown.ts` | utility | transform (HTML string → Markdown string) | **no in-repo analog** — closest structural sibling is `src/shared/logger.ts` (module-scoped cached singleton + pure functions) | partial — pattern shape only |
| `src/notes/NoteWriter.ts` | service / orchestrator | CRUD (create / process / read vault) | `src/browse/ProblemListService.ts` (pure-logic service; constructor DI of client + settings; orchestrates network + persistence; no DOM) | role-match |
| `src/notes/HeadingRegion.ts` (optional helper; planner may inline) | utility | transform (markdown string → markdown string) | **no in-repo analog** — closest is `src/browse/ProblemListService.ts` `evaluateRule` (pure function at module scope) | partial — pattern shape only |
| `src/notes/BaseFile.ts` | utility / ship-on-first-use | file-I/O (vault.create) | **no in-repo analog** — Phase 1 never writes vault files | new pattern; document constraints |
| `src/notes/types.ts` (if planner splits) | model | none (types) | `src/browse/types.ts` | exact |
| `src/notes/NoteOrchestrator.ts` (if planner picks service route over plugin-method route) | service / orchestrator | event-driven (row click) → CRUD | `src/auth/AuthService.ts` (service constructed from main.ts, holds deps, exposes a small verb surface) | role-match |

### Modified existing files

| Modified File | Role | Change Shape | Analog / Self-Reference | Notes |
|---------------|------|--------------|-------------------------|-------|
| `src/settings/SettingsStore.ts` | store | extend `PluginData` + add guard + getters/setters | **self** — mirror the in-file `isValidProblemIndex` / `isValidCompoundFilter` / `isValidIndexedProblem` shape-guards and `DEFAULT_DATA` pattern | exact |
| `src/api/LeetCodeClient.ts` | client wrapper | add `getProblemDetail(slug)` method | **self** — mirror the existing `fetchWhoami()` method's shape: cast via `as unknown as { method: () => Promise<Shape \| null> }`, catch + return null on throw | exact |
| `src/browse/ProblemBrowserView.ts` | view | replace two `new Notice('Phase 1 stub: would open ${slug}.')` call sites (lines 425 and 549) | **self** — see lines 548-550 (row click) and 423-425 (pickRandom) | exact; two known call sites to change |
| `src/main.ts` | plugin entry | wire NoteWriter (or orchestrator) after `ProblemListService` construction (current line 49) | **self** — follow the locked 6-step ordering in existing `onload()` | exact |
| `manifest.json` | config | bump `minAppVersion` `"1.5.0"` → `"1.10.0"` | **self** — single-field edit | exact |

### New test files under `tests/`

| Test File | Role | Data Flow | Closest Analog | Match Quality |
|-----------|------|-----------|----------------|---------------|
| `tests/note-frontmatter-write.test.ts` | unit test | request-response (mock processFrontMatter) | `tests/settings-store.test.ts` (mock of `plugin.loadData/saveData`; describe-it-expect + vi.fn factory + shape-assertion pattern) | role-match |
| `tests/note-frontmatter-tags.test.ts` | unit test | same | same as above | role-match |
| `tests/note-frontmatter-preserve-user-tags.test.ts` | unit test | same | same | role-match |
| `tests/note-frontmatter-preserve-user-aliases.test.ts` | unit test | same | same | role-match |
| `tests/heading-region.test.ts` | unit test | transform (string → string) | `tests/settings-store.test.ts` pure shape-guard tests (e.g. `rejects problemsFolder containing ..`) | role-match |
| `tests/heading-region-rename.test.ts` | unit test | same | same | role-match |
| `tests/heading-region-reinsert.test.ts` | unit test | same | same | role-match |
| `tests/htmlToMarkdown.test.ts` | unit test | transform | `tests/settings-store.test.ts` describe-it structure; **no in-repo snapshot-test precedent** | role-match; snapshot is new pattern |
| `tests/htmlToMarkdown-determinism.test.ts` | unit test | transform | same | role-match |
| `tests/htmlToMarkdown-snapshots.test.ts` | snapshot test | transform | **no in-repo analog** — Phase 1 never used `toMatchSnapshot`/`toMatchInlineSnapshot` | new pattern |
| `tests/cache-ttl.test.ts` | unit test | CRUD with fake timer | `tests/problems-pagination.test.ts` (fake cache + mock client + TTL assertion — `INDEX_TTL_MS` cached-vs-stale branch test) | exact |
| `tests/offline-regenerate.test.ts` | unit test | request-response (mocked client throws) | `tests/problems-pagination.test.ts` (makeMockClient factory) + `tests/session-expiry.test.ts` (error path) | role-match |
| `tests/re-open-silent-offline.test.ts` | unit test | same | same | role-match |
| `tests/new-note-fetch-failure.test.ts` | unit test | same | same | role-match |
| `tests/note-writer-folder.test.ts` | unit test | file-I/O (mocked Vault) | **no in-repo analog** — Phase 1 never mocked Vault | new pattern |
| `tests/note-filename.test.ts` | unit test | pure transform | `tests/settings-store.test.ts` pure tests | exact |
| `tests/note-path-uses-settings.test.ts` | unit test | same | same | exact |
| `tests/note-language-uses-settings.test.ts` | unit test | same | same | exact |
| `tests/base-file-ship.test.ts` | unit test | file-I/O (mocked Vault) | new pattern (see mock-vault helper) | new pattern |
| `tests/base-file-preserve.test.ts` | unit test | same | same | new pattern |
| `tests/manifest-version.test.ts` | unit test | transform (read JSON, assert) | `tests/settings-store.test.ts` structure; **reads a real project file** | role-match |
| `tests/fixtures/lc-*.html` | fixture | n/a — data files | **no in-repo analog** — `tests/` has no `fixtures/` subdir in Phase 1 | new pattern |
| `tests/helpers/mock-vault.ts` | test helper | request-response | factory pattern from `tests/problems-pagination.test.ts` `makeMockClient` + `makeMockSettings` | role-match |
| `tests/helpers/mock-leetcode-client.ts` | test helper | request-response | same | exact |
| `scripts/grep-no-vault-modify.sh` | grep gate | CI-step | **no in-repo analog** — Phase 1 wires lint gates in eslint.config.mts, not as bash scripts | new pattern |

---

## Pattern Assignments

### `src/notes/NoteTemplate.ts` (model / schema SSoT)

**Analog:** `src/settings/SettingsStore.ts` (DEFAULT_DATA pattern, validation constants at module top) + `src/browse/types.ts` (types-first module).

**Module-top constants pattern** (from `SettingsStore.ts:41-53`):

```typescript
const DEFAULT_DATA: PluginData = {
  version: 1,
  auth: null,
  username: null,
  isPremium: null,
  problemsFolder: 'LeetCode',
  defaultLanguage: 'python3',
  problemIndex: null,
  filter: null,
};

const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const VALID_STATUSES = new Set(['solved', 'attempted', 'untouched']);
```

**What to copy:**
1. Put the plugin-owned key list as a module-top `as const` array, e.g. `const PLUGIN_LC_KEYS = ['lc-id','lc-slug',...] as const;` — it is the canonical SSoT (D-03).
2. Put the tag-namespace prefix as a module-top const `const LC_TAG_PREFIX = 'lc/' as const;` so Phase 4 can import and extend without duplicating the string.
3. Put `VALID_DIFFICULTIES` exactly as in SettingsStore — re-use the Set for the status → tag mapping (`'lc/' + d.toLowerCase()`).
4. Keep this file PURE — no Obsidian imports beyond `type { TFile }`. Types module posture, like `browse/types.ts`.

**Locked by CONTEXT.md D-03:** no other module may hardcode `lc-*` key names or the `lc/` tag namespace. Planner must flag any second occurrence of the string literal `'lc-'` outside this file in `/gsd-verify-work`.

---

### `src/notes/htmlToMarkdown.ts` (utility, transform)

**Analog:** **No in-repo analog.** Closest structural sibling is `src/shared/logger.ts` — a module with module-scoped state plus an exported facade. Copy its *shape*, not its behavior.

**Module-scoped singleton pattern** (from `logger.ts:11-16`):

```typescript
const REDACT = /session|csrf|cookie|token/i;
const SECRET_VALUE_PATTERN = /\b(LEETCODE_SESSION|...)\s*[=:]\s*[^\s;,"'&}\]]+/gi;
// ... module-scoped state + an exported `logger` facade that closes over it
```

**Apply to htmlToMarkdown:**

```typescript
// Module-scoped singleton, same posture as logger.ts
let cachedService: TurndownService | null = null;
function getService(): TurndownService { /* lazy init + cache */ }
export function htmlToMarkdown(html: string): string { /* typed facade */ }
```

**Determinism gate (CONTEXT.md D-20 / RESEARCH.md Pattern 3):** The module-scoped cache is fine because the service has no per-call mutable state. Tests MUST assert byte-identical output across 100 invocations.

**Imports pattern (new — matches Phase 1 import style):**

```typescript
import TurndownService from 'turndown';    // default export, runtime dep
// NO Obsidian imports — this is a pure transform.
// NO logger import — the caller (NoteWriter) logs on empty output, per D-21.
```

---

### `src/notes/NoteWriter.ts` (service orchestrator)

**Analog:** `src/browse/ProblemListService.ts` — exact shape for a pure-logic service with DI of client + settings, orchestrating network + persistence without DOM.

**Imports pattern** (from `ProblemListService.ts:10-12`):

```typescript
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore, CompoundFilter, FilterRule } from '../settings/SettingsStore';
import type { IndexedProblem, ProblemIndex } from './types';
```

For NoteWriter, the shape becomes:

```typescript
import type { App, TFile } from 'obsidian';
import { Notice, TFile as TFileCtor } from 'obsidian';   // TFileCtor for instanceof narrowing
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore, DetailCacheEntry } from '../settings/SettingsStore';
import { htmlToMarkdown } from './htmlToMarkdown';
import { /* schema SSoT */ } from './NoteTemplate';
import { ensureLeetcodeBase } from './BaseFile';
import { logger } from '../shared/logger';
```

**Class shape** (from `ProblemListService.ts:51-65`):

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
  // ... private helpers below
}
```

**Apply to NoteWriter:**
- DI three deps (`app`, `client`, `settings`) via `private readonly` constructor params — same posture as ProblemListService's two-dep constructor.
- Single public verb (`openProblem(slug)`) — same posture as ProblemListService's `refresh`/`search`/`filter`/`applyCompoundFilter` public surface.
- **Consider single-flight guard** for concurrent `openProblem(slug)` calls on the SAME slug (user double-clicks a row): follow WR-03 comment block at `ProblemListService.ts:55-59` — a `Map<slug, Promise<void>>` rather than a single field. Planner discretion; not strictly required for Phase 2 since the reveal-first path is idempotent.

**Cache-TTL branch pattern** (from `ProblemListService.ts:86-100`):

```typescript
const cached = this.settings.getProblemIndex();
if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL_MS) {
  if (onProgress) {
    onProgress({ loaded: cached.problems.length, total: cached.problems.length, rows: cached.problems, done: true });
  }
  return cached.problems;
}
// ... network path
```

**Apply to NoteWriter's background-refresh (D-11):**

```typescript
const cached = this.settings.getProblemDetail(slug);
const cacheStale = !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;
if (!cacheStale) return;   // reveal-first already ran; no refresh needed
// ... silent background fetch
```

**Core error-handling pattern** (from `ProblemListService.ts` public API):
- Pure-logic services DO NOT catch errors themselves — they `throw` and let the view/orchestrator decide. `ProblemBrowserView.refreshAndRender` wraps the call in try/catch and dispatches Notice from there (lines 180-218).

**Apply to NoteWriter:**
- `openProblem(slug)` is both the orchestrator AND the user-facing error surface (there's no outer view between row-click and note-write). So Notice calls happen HERE, following the `ProblemBrowserView.refreshAndRender` error-handling shape from lines 180-218 — see "Shared Patterns → Notice copy + session-expiry dispatch" below.

---

### `src/notes/HeadingRegion.ts` (utility, pure transform) — optional helper

**Analog:** `ProblemListService.ts` module-scope pure function `evaluateRule` (lines 225-265) — single-responsibility, pure, branch-by-field, returns immutable result, no side effects.

**Function shape** (from `ProblemListService.ts:225-265`):

```typescript
function evaluateRule(p: IndexedProblem, r: FilterRule): boolean | undefined {
  switch (r.field) {
    case 'status': { /* ... */ }
    case 'difficulty': { /* ... */ }
    // ...
  }
}
```

**Apply to HeadingRegion:**

```typescript
// Pure function; no Obsidian imports needed (operates on a string).
export function rewriteProblemSection(current: string, newMarkdown: string): string {
  // Line-scan for `## Problem`; see RESEARCH.md Pattern 2 for the exact algorithm.
  // CRITICAL (RESEARCH.md Pitfall 4): keep this function PURE — no captured
  // mutable state — so it is safe to pass as the `Vault.process` callback which
  // may retry on conflict.
}
```

**Caller wraps with `vault.process`** (separated to keep the transform pure and testable without a Vault):

```typescript
await app.vault.process(file, (current) => rewriteProblemSection(current, newMarkdown));
```

---

### `src/notes/BaseFile.ts` (utility / lazy ship-on-first-use)

**Analog:** **No in-repo analog.** Closest posture: the `DEFAULT_DATA` constant in `SettingsStore.ts:41-50` followed by the `SettingsStore.load()` "initialise if missing" pattern.

**"Ship if missing" pattern from CONTEXT.md D-18** (new — document invariants in the file header):

```typescript
// src/notes/BaseFile.ts
// Ship LeetCode.base on first Phase-2 problem open. NEVER overwrites (D-18).
// If user deletes it, plugin does NOT auto-recreate.
// Uses vault.create() only — vault.modify() is forbidden per D-22.

import type { App } from 'obsidian';

export function leetcodeBaseYaml(folder: string): string { /* ... */ }

export async function ensureLeetcodeBase(app: App, folder: string): Promise<void> {
  const trimmed = folder.replace(/\/+$/, '');
  const path = `${trimmed}/LeetCode.base`;
  if (app.vault.getAbstractFileByPath(path)) return;   // D-18 never-overwrite
  const folderExists = app.vault.getAbstractFileByPath(trimmed);
  if (!folderExists) await app.vault.createFolder(trimmed);
  await app.vault.create(path, leetcodeBaseYaml(trimmed));
}
```

**Folder-strip convention** (from `SettingsStore.ts:66-76` `sanitizeFolder`):

```typescript
function sanitizeFolder(raw: unknown): string {
  // ...
  return trimmed.replace(/[\\/]+$/, '');
}
```

Copy the `.replace(/[\\/]+$/, '')` trailing-slash strip verbatim so both modules canonicalize folder strings identically.

---

### `src/settings/SettingsStore.ts` — extend (MODIFIED)

**Analog:** SELF — mirror existing shape-guards `isValidProblemIndex` / `isValidCompoundFilter` / `isValidIndexedProblem`.

**Shape-guard pattern to mirror** (from `SettingsStore.ts:81-102`):

```typescript
function isValidIndexedProblem(v: unknown): v is IndexedProblem {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<IndexedProblem>;
  return (
    typeof p.id === 'number' &&
    typeof p.slug === 'string' &&
    typeof p.title === 'string' &&
    typeof p.diff === 'string' && VALID_DIFFICULTIES.has(p.diff) &&
    typeof p.paid === 'boolean' &&
    (p.status === undefined || (typeof p.status === 'string' && VALID_STATUSES.has(p.status))) &&
    (p.acRate === undefined || (typeof p.acRate === 'number' && p.acRate >= 0 && p.acRate <= 100)) &&
    (p.topics === undefined ||
      (Array.isArray(p.topics) && p.topics.every((t) => typeof t === 'string')))
  );
}

function isValidProblemIndex(v: unknown): v is ProblemIndex {
  if (!v || typeof v !== 'object') return false;
  const idx = v as Partial<ProblemIndex>;
  if (typeof idx.fetchedAt !== 'number' || !Array.isArray(idx.problems)) return false;
  return idx.problems.every(isValidIndexedProblem);
}
```

**Apply to DetailCacheEntry:**

```typescript
function isValidDetailCacheEntry(v: unknown): v is DetailCacheEntry {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DetailCacheEntry>;
  return (
    typeof d.fetchedAt === 'number' &&
    typeof d.id === 'number' &&
    typeof d.title === 'string' &&
    typeof d.difficulty === 'string' && VALID_DIFFICULTIES.has(d.difficulty) &&
    typeof d.url === 'string' &&
    typeof d.contentHtml === 'string' &&
    Array.isArray(d.topicSlugs) && d.topicSlugs.every((s) => typeof s === 'string')
    // exampleTestcases / codeSnippets are optional — same posture as acRate/topics above
  );
}

function sanitizeProblemDetails(raw: unknown): Record<string, DetailCacheEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DetailCacheEntry> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (typeof slug === 'string' && isValidDetailCacheEntry(entry)) {
      out[slug] = entry;
    }
  }
  return out;
}
```

**Warn-without-leaking pattern** (from `SettingsStore.ts:161-172`):

```typescript
if (raw.auth !== undefined && raw.auth !== null && !isValidAuthCookies(raw.auth)) {
  logger.warn('settings.load: ignoring malformed auth; reverting to logged-out state');
}
if (raw.problemIndex !== undefined && raw.problemIndex !== null && !isValidProblemIndex(raw.problemIndex)) {
  logger.warn('settings.load: ignoring malformed problemIndex; will re-fetch');
}
```

**Apply to problemDetails:** same shape; log `'settings.load: dropped N malformed problemDetails entries'` where N is the delta between input keys and accepted keys (planner discretion on whether to log the count or just a categorical warn — mirror whichever existing message is closest).

**Getter/setter pattern** (from `SettingsStore.ts:181-215`):

```typescript
getProblemsFolder(): string { return this.data.problemsFolder; }
async setProblemsFolder(v: string): Promise<void> {
  this.data.problemsFolder = v;
  await this.persist();
}
```

**Apply to problemDetails (D-15):**

```typescript
getProblemDetail(slug: string): DetailCacheEntry | null {
  return this.data.problemDetails[slug] ?? null;
}
async setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void> {
  this.data.problemDetails[slug] = detail;
  await this.persist();
}
async pruneProblemDetails(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;
  for (const [slug, entry] of Object.entries(this.data.problemDetails)) {
    if (entry.fetchedAt < cutoff) {
      delete this.data.problemDetails[slug];
      pruned++;
    }
  }
  if (pruned > 0) await this.persist();
  return pruned;
}
```

**PluginData extension** (extend the interface at `SettingsStore.ts:10-23`):

```typescript
// Add to PluginData:
problemDetails: Record<string, DetailCacheEntry>;
// Add to DEFAULT_DATA:
problemDetails: {},
// Add to load()'s data object:
problemDetails: sanitizeProblemDetails(raw.problemDetails),
```

---

### `src/api/LeetCodeClient.ts` — extend (MODIFIED)

**Analog:** SELF — mirror existing `fetchWhoami()` method (lines 59-74).

**Type-cast-then-catch pattern** (from `LeetCodeClient.ts:59-74`):

```typescript
async fetchWhoami(): Promise<{ username: string; isPremium: boolean | null } | null> {
  try {
    const resp = await (this.lc as unknown as {
      whoami: () => Promise<
        { username?: string; isSignedIn?: boolean; isPremium?: boolean | null } | null
      >;
    }).whoami();
    if (!resp || !resp.isSignedIn || !resp.username) return null;
    return {
      username: resp.username,
      isPremium: typeof resp.isPremium === 'boolean' ? resp.isPremium : null,
    };
  } catch {
    return null;
  }
}
```

**Apply to getProblemDetail:**

```typescript
async getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null> {
  try {
    const q = await (this.lc as unknown as {
      problem: (s: string) => Promise<LeetCodeProblemDetail | null>;
    }).problem(slug);
    if (!q || !q.questionFrontendId) return null;
    return q;
  } catch (err) {
    // DIVERGENCE from fetchWhoami: Phase 2 callers need to distinguish
    // "LC returned null" (treated as not-found) from "network threw" (treated
    // as offline). fetchWhoami conflates the two because it's only ever used
    // for display. NoteWriter's D-13 needs the distinction, so RE-THROW here.
    throw err;
  }
}
```

**CRITICAL — session-expiry interaction (RESEARCH.md Pitfall 7):** Session expiry surfaces via `data === null` → library returns `null`, not throw. So `!q` short-circuits to `return null` and the caller ALSO treats that as "not found" for now. If Phase 2 needs to distinguish session-expiry from not-found, wire `isSessionExpired(err)` in the catch block BEFORE re-throwing (same import as `ProblemBrowserView.ts:9`).

---

### `src/browse/ProblemBrowserView.ts` — modify two call sites (MODIFIED)

**Analog:** SELF — exact call sites identified.

**Call site 1: row click** (lines 548-550):

```typescript
row.addEventListener('click', () => {
  new Notice(`Phase 1 stub: would open ${p.slug}.`, 3000);
});
```

**Replace with:**

```typescript
row.addEventListener('click', () => {
  void this.plugin.openProblem(p.slug);
  // OR, if planner chooses NoteOrchestrator service route:
  // void this.plugin.notes.openProblem(p.slug);
});
```

**Call site 2: pickRandom** (lines 423-425):

```typescript
const pick = visible[Math.floor(Math.random() * visible.length)];
if (!pick) return;
new Notice(`Phase 1 stub: would open ${pick.slug}.`, 3000);
```

**Replace with:**

```typescript
const pick = visible[Math.floor(Math.random() * visible.length)];
if (!pick) return;
void this.plugin.openProblem(pick.slug);
```

**DO NOT** change anything else in this file — no new imports beyond what the planner's chosen route demands, no refactor of the error-handling path. Phase 2 keeps the view minimal.

---

### `src/main.ts` — wire NoteWriter/NoteOrchestrator (MODIFIED)

**Analog:** SELF — existing 6-step onload ordering (lines 25-76).

**Wiring pattern** (from `main.ts:48-49`):

```typescript
// Step 5 — list service (depends on client + settings).
this.list = new ProblemListService(this.client, this.settings);
```

**Apply — two planner-discretion options:**

**Option A: NoteOrchestrator service (separate module):**

```typescript
// Step 5.5 — note orchestrator (depends on app + client + settings).
this.notes = new NoteWriter(this.app, this.client, this.settings);
```

Add field: `notes!: NoteWriter;` mirroring `list!: ProblemListService;` at line 23.

**Option B: plugin method (no new field):**

```typescript
// Add a public method on LeetCodePlugin:
async openProblem(slug: string): Promise<void> {
  await new NoteWriter(this.app, this.client, this.settings).openProblem(slug);
}
// (Or cache the writer as a private field and call method on it.)
```

**CONTEXT.md Claude's Discretion:** planner picks based on dependency cleanliness. Option A matches Phase 1's `list: ProblemListService` field; Option B is leaner.

---

### `manifest.json` — bump minAppVersion (MODIFIED)

**Current state** (line 5): `"minAppVersion": "1.5.0"`

**Target** (D-19, verified in RESEARCH.md as the version introducing Bases): `"minAppVersion": "1.10.0"`

**Single-field edit. No other changes. No touching `version`, `description`, `isDesktopOnly` (CF-02).**

---

### Test files — copy from Phase 1 test patterns

**Analog:** `tests/settings-store.test.ts` + `tests/problems-pagination.test.ts` are the canonical Phase 1 test shapes.

**Imports pattern** (from `tests/problems-pagination.test.ts:1-3`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProblemListService, PAGE_SIZE, INDEX_TTL_MS } from '../src/browse/ProblemListService';
import type { ProblemIndex } from '../src/browse/types';
```

**Mock-factory-at-top pattern** (from `tests/problems-pagination.test.ts:5-41`):

```typescript
function makeMockQuestion(n: number, diff: 'Easy' | 'Medium' | 'Hard' = 'Easy', ...) { /* ... */ }
function makeMockClient(pages: number[]) { /* ... returns { lc: { problems: vi.fn(...) } } */ }
function makeMockSettings(initial: ProblemIndex | null = null) {
  let index: ProblemIndex | null = initial;
  return {
    getProblemIndex: vi.fn(() => index),
    setProblemIndex: vi.fn(async (i: ProblemIndex) => { index = i; }),
  };
}
```

**Apply to `tests/helpers/mock-leetcode-client.ts`:**

```typescript
// Reusable mocked LC client that NoteWriter tests depend on.
export function makeMockLeetCodeClient(opts: {
  detail?: LeetCodeProblemDetail | null;
  throwOn?: 'network' | 'session-expiry' | null;
}) {
  return {
    getProblemDetail: vi.fn(async (_slug: string) => {
      if (opts.throwOn === 'network') throw new Error('ENOTFOUND');
      if (opts.throwOn === 'session-expiry') throw { response: { data: null } };
      return opts.detail ?? null;
    }),
  };
}
```

**Apply to `tests/helpers/mock-vault.ts`** (new pattern — no Phase 1 analog):

Document the surface area NoteWriter needs: `app.vault.create`, `app.vault.process`, `app.vault.getAbstractFileByPath`, `app.vault.createFolder`, `app.fileManager.processFrontMatter`, `app.workspace.openLinkText`, `app.workspace.getActiveViewOfType`. Build a factory returning `{ app, vault, fileManager, workspace, recordedWrites: [...] }` where each verb is a `vi.fn` the test can assert against. No dependency on real Obsidian runtime.

**Describe-it-expect pattern** (from `tests/settings-store.test.ts:12-20`):

```typescript
describe('SettingsStore (AUTH-03, AUTH-05, D-07, D-10)', () => {
  it('defaults: problemsFolder="LeetCode", defaultLanguage="python3", auth=null', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
    expect(s.getProblemsFolder()).toBe('LeetCode');
    // ...
  });
});
```

**Apply:** every Phase 2 test `describe` block names the requirement ID in parens (e.g. `describe('NoteWriter.openProblem (NOTE-01, D-13, D-16)', () => ...)`). Each `it()` sentence describes the exact behavior being asserted in plain English — the convention is rigid in Phase 1; keep it.

**TTL branching pattern** (from `tests/problems-pagination.test.ts:82-108`):

```typescript
it('returns cached index when fresh (<24h) without calling network', async () => {
  const fresh: ProblemIndex = {
    fetchedAt: Date.now() - 1000,
    problems: [...]
  };
  const client = makeMockClient([50]);
  const settings = makeMockSettings(fresh);
  const svc = new ProblemListService(client as never, settings as never);
  const result = await svc.refresh(false);
  expect(result).toEqual(fresh.problems);
  expect(client.lc.problems).toHaveBeenCalledTimes(0);
});

it('re-fetches when cache is stale (>24h)', async () => {
  const stale: ProblemIndex = {
    fetchedAt: Date.now() - INDEX_TTL_MS - 1000,
    problems: [...]
  };
  // ... expect client to be called exactly once
});
```

**Apply to `tests/cache-ttl.test.ts`:** structurally identical — swap `INDEX_TTL_MS` for Phase 2's `CACHE_TTL_MS`, swap `getProblemIndex`/`setProblemIndex` for `getProblemDetail`/`setProblemDetail`, swap `lc.problems` for `client.getProblemDetail`.

---

### `scripts/grep-no-vault-modify.sh` (new — grep gate)

**Analog:** **No in-repo analog.** Phase 1 does gating via `eslint.config.mts` rules, not bash.

**Pattern to establish:** per CONTEXT.md D-22 grep command literal:

```bash
#!/usr/bin/env bash
# scripts/grep-no-vault-modify.sh
# Fail CI if vault.modify() appears in files that own problem-note writes.
# Aligned with STATE.md "All vault writes via vault.process() + processFrontMatter() only"
# and CONTEXT.md D-22.
set -euo pipefail
if grep -rE "vault\.modify\s*\(" src/notes/ src/browse/ --include='*.ts'; then
  echo "ERROR: vault.modify() is forbidden in src/notes/ and src/browse/ — use vault.process() instead."
  exit 1
fi
```

**Wire into CI:** add a npm script in `package.json` (`"grep:vault": "./scripts/grep-no-vault-modify.sh"`) and invoke it from the phase-gate command. Planner picks whether this runs as a vitest test (shelled out) or as a top-level npm script.

---

## Shared Patterns

These apply across multiple Phase 2 files — planner must ensure each applicable file references the right one.

### Shared Pattern A: Constructor DI + `readonly` deps

**Source:** `src/browse/ProblemListService.ts:61-64` + `src/api/LeetCodeClient.ts:15-26` + `src/auth/AuthService.ts` (Phase 1 pattern, not re-read).

```typescript
constructor(
  private readonly client: LeetCodeClient,
  private readonly settings: SettingsStore,
) {}
```

**Apply to:** `NoteWriter`, `NoteOrchestrator` (if chosen).

### Shared Pattern B: `vault.modify()` is forbidden on problem notes

**Source:** CONTEXT.md D-22 + STATE.md all-writes-via-process() rule + grep gate below.

**Apply to:** All files in `src/notes/` + `src/browse/`. All body writes go through `app.vault.process(file, (current) => mutated)`. All frontmatter writes go through `app.fileManager.processFrontMatter(file, (fm) => mutate(fm))`.

**Gate:** `scripts/grep-no-vault-modify.sh` returns non-zero if `vault.modify(` appears in those directories.

### Shared Pattern C: Notice copy + session-expiry dispatch

**Source:** `src/browse/ProblemBrowserView.ts:180-218` — the canonical Phase 1 error-handling dispatch.

```typescript
// AUTH-04 end-to-end: detect → Notice → logout → re-open.
const maybeResp = (typeof err === 'object' && err !== null)
  ? (err as { response?: unknown }).response
  : undefined;
if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
  // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
  new Notice('LeetCode session expired. Log in again.', SESSION_EXPIRED_NOTICE_MS);
  await this.plugin.auth.logout().catch(() => undefined);
  // ... render logged-out state
  return;
}
```

**Apply to NoteWriter.openProblem error branches:**

```typescript
} catch (err) {
  // Session expiry takes precedence — route through the same detector + copy.
  const maybeResp = (typeof err === 'object' && err !== null)
    ? (err as { response?: unknown }).response : undefined;
  if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
    new Notice('LeetCode session expired. Log in again.', 8000);
    // Don't create a partial note; don't swallow — let caller or orchestrator re-render logged-out state.
    return;
  }
  // Generic network failure (D-13): Notice + abort, no partial file.
  // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice LOCKED
  new Notice(`Couldn't fetch ${title}. Check your connection.`, 4000);
  return;
}
```

**Background-refresh branch (D-12 silent):** NO Notice, only `logger.debug(...)`:

```typescript
this.backgroundRefresh(existing, slug).catch((err) => {
  logger.debug('notes.backgroundRefresh: swallowed failure', err);
});
```

### Shared Pattern D: Logger use — debug/warn only, redaction already free

**Source:** `src/shared/logger.ts` (the logger exported instance) + usage in `SettingsStore.ts:161-172`.

```typescript
import { logger } from '../shared/logger';
logger.warn('settings.load: ignoring malformed auth; reverting to logged-out state');
logger.debug('notes.backgroundRefresh: swallowed failure', err);
```

**Apply to all Phase 2 files that log.** NO `console.*` direct calls. Logger handles redaction of any incidental session/cookie/token fields — just pass the error through.

### Shared Pattern E: Feature-first folder layout

**Source:** CONTEXT.md "Established Patterns" / Phase 1 layout — `src/api/`, `src/auth/`, `src/browse/`, `src/settings/`, `src/shared/`.

**Apply:** `src/notes/` is a sibling folder. Nothing note-related goes into `browse/` (except the two stubs being replaced), `settings/` (except the PluginData extension), or `api/` (except the getProblemDetail method).

### Shared Pattern F: `eslint-plugin-obsidianmd` gates + locked comment directives

**Source:** `src/browse/ProblemBrowserView.ts:52`, `:186`, `:195`, `:448` — every eslint-disable comment must cite the UI-SPEC.md locked string or the Plan-NN acceptance grep.

**Apply:** Every Phase 2 Notice copy (`Couldn't fetch …`, `LeetCode problem not found: …`) that begins with "LeetCode" needs the `eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name` line. Every command (none in Phase 2 by default) needs the `no-plugin-id-in-command-id` + `no-default-hotkeys` posture from `main.ts:67-72`.

### Shared Pattern G: `innerHTML` forbidden — but Phase 2 writes to files, not DOM

**Source:** CLAUDE.md §6 + RESEARCH.md.

**Apply:** `src/notes/` has no DOM surface by default. If the planner proposes one (e.g. a modal preview), the `createEl()` rule from `ProblemBrowserView.ts` (every occurrence in that file, e.g. line 263 `wrap.createEl('h3', ...)`) applies. Turndown's OUTPUT is a string and is written to a file — it never touches `innerHTML`.

### Shared Pattern H: Test describe blocks name the requirement IDs

**Source:** `tests/settings-store.test.ts:12`, `:65` + `tests/problems-pagination.test.ts:43`.

```typescript
describe('SettingsStore (AUTH-03, AUTH-05, D-07, D-10)', () => { /* ... */ });
describe('SettingsStore.load — untrusted-disk validation (CR-02 / WR-04)', () => { /* ... */ });
describe('ProblemListService.refresh (BROWSE-02)', () => { /* ... */ });
```

**Apply to every Phase 2 test file.** Each `describe` block lists the NOTE-0X / D-NN identifiers it covers.

---

## No Analog Found

Files where Phase 1 has no close match — planner should use RESEARCH.md patterns (Patterns 1-4) as the primary reference:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/notes/htmlToMarkdown.ts` | utility, transform | Turndown wrapper | Phase 1 never used turndown or any HTML→MD library — RESEARCH.md Pattern 3 is the primary reference |
| `src/notes/BaseFile.ts` | utility, file-I/O | Ship-on-first-use | Phase 1 never wrote vault files — RESEARCH.md Pattern 4 is the primary reference |
| `src/notes/HeadingRegion.ts` (or inline helper) | utility, transform | Heading-based ownership regenerator | Phase 1 has no in-vault file mutation — RESEARCH.md Pattern 2 is the primary reference |
| `tests/htmlToMarkdown-snapshots.test.ts` | snapshot test | Transform | Phase 1 uses `toEqual` / `toBeNull` — no `toMatchSnapshot` / `toMatchInlineSnapshot` precedent; vitest supports both — planner picks snapshot strategy |
| `tests/helpers/mock-vault.ts` | test helper | Mock factory | Phase 1 only mocks `plugin.loadData/saveData` — see `tests/settings-store.test.ts:4-10` makeMockPlugin — but never mocks Vault/FileManager/workspace. Planner must design this helper from scratch using the Phase 1 factory style as a posture reference |
| `tests/fixtures/lc-*.html` | data fixtures | n/a | Phase 1 has no fixtures folder; planner creates `tests/fixtures/` and captures from real LC (two-sum, median-of-two-sorted-arrays, regular-expression-matching per RESEARCH.md) |
| `scripts/grep-no-vault-modify.sh` | CI gate | n/a | Phase 1 uses eslint; Phase 2 introduces bash grep gate per D-22 |

---

## Metadata

**Analog search scope:** `/Users/moxu/projects/obsidian-leetcode/src/**`, `/Users/moxu/projects/obsidian-leetcode/tests/**`, `/Users/moxu/projects/obsidian-leetcode/manifest.json`, `/Users/moxu/projects/obsidian-leetcode/vitest.config.ts`

**Files read (full):**
- `src/main.ts` (101 lines)
- `src/api/LeetCodeClient.ts` (91 lines)
- `src/settings/SettingsStore.ts` (221 lines)
- `src/browse/ProblemBrowserView.ts` (553 lines — includes both Phase 1 stub call sites being modified)
- `src/browse/ProblemListService.ts` (266 lines)
- `src/browse/types.ts` (29 lines)
- `src/shared/logger.ts` (74 lines)
- `tests/settings-store.test.ts` (153 lines)
- `tests/problems-pagination.test.ts` (143 lines)
- `manifest.json` (11 lines)
- `vitest.config.ts` (11 lines)

**Files enumerated but not read (structure-only; not load-bearing for Phase 2 patterns):**
- `src/api/requestUrlFetcher.ts`, `src/api/throttle.ts` (used transitively via `client.lc.problem(slug)` — no new call pattern needed)
- `src/auth/*` (session-expiry flow referenced via `isSessionExpired` import from `LeetCodeClient.ts` — no new auth code in Phase 2)
- `src/browse/FilterModal.ts`, `src/settings/SettingsTab.ts` (no Phase 2 modifications)
- `src/shared/errors.ts`, `src/shared/timers.ts` (no Phase 2 modifications expected)
- `tests/cookie-parse.test.ts`, `tests/fetcher-install.test.ts`, `tests/logger-redact.test.ts`, `tests/problem-filter-status.test.ts`, `tests/search-filter.test.ts`, `tests/session-expiry.test.ts`, `tests/throttle.test.ts` (same-shape test files; no new patterns to extract beyond what `settings-store.test.ts` + `problems-pagination.test.ts` already cover)

**Pattern extraction date:** 2026-05-08
