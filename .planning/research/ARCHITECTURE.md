# Architecture Research

**Domain:** Obsidian community plugin — LeetCode integration (desktop, Electron, TypeScript)
**Researched:** 2026-05-07
**Confidence:** HIGH (Obsidian Plugin API official docs, sibling research fully read, constraints cross-checked)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OBSIDIAN HOST PROCESS                        │
│                                                                      │
│  ┌───────────────────────── UI LAYER ──────────────────────────┐    │
│  │  ProblemBrowserView   VerdictModal   SettingsTab   Ribbon   │    │
│  │       (ItemView)       (Modal)    (PluginSettingTab) (item) │    │
│  └───────────────────┬─────────────────────────────────────────┘    │
│                       │  Commands + Event Callbacks                  │
│  ┌────────────────────▼─────── PLUGIN CORE ──────────────────────┐  │
│  │              LeetCodePlugin  (extends Plugin)                  │  │
│  │   onload()  onunload()  registerCommand()  registerView()     │  │
│  └──────┬───────────┬──────────────┬──────────────┬─────────────┘  │
│         │           │              │              │                  │
│  ┌──────▼───┐ ┌─────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐          │
│  │ Auth     │ │ LeetCode   │ │  Vault   │ │  Cache     │          │
│  │ Service  │ │ Client     │ │ Service  │ │  Service   │          │
│  │          │ │ (facade)   │ │          │ │            │          │
│  └──────┬───┘ └─────┬──────┘ └────┬─────┘ └─────┬──────┘          │
│         │           │              │              │                  │
│  ┌──────▼───────────▼──────────────▼──────────────▼─────────────┐  │
│  │                    INFRASTRUCTURE LAYER                        │  │
│  │   requestUrlAdapter    RateLimiter    PollingScheduler         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────────┐
         ▼                 ▼                     ▼
  ┌─────────────┐  ┌──────────────┐   ┌──────────────────┐
  │ leetcode.com │  │ Vault Files  │   │  data.json        │
  │  GraphQL +   │  │ {id}-{slug}  │   │  (auth tokens,   │
  │  REST API    │  │   .md notes  │   │   settings,      │
  └─────────────┘  └──────────────┘   │   problem index) │
                                      └──────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Owns |
|-----------|---------------|------|
| `LeetCodePlugin` | Plugin lifecycle, command registration, service wiring | `onload`, `onunload`, all `registerX()` calls |
| `AuthService` | Session cookie storage/retrieval, BrowserWindow login, expiry detection | `data.json` auth block, CSRF refresh, re-login prompt |
| `LeetCodeClient` | Single facade over all LC API interactions | `@leetnotion/leetcode-api` GraphQL reads + hand-rolled REST run/submit/check |
| `VaultService` | Note creation, atomic content/frontmatter writes, filename resolution | `vault.create`, `vault.process`, `processFrontMatter`, `normalizePath` |
| `CacheService` | Problem index TTL cache, in-memory LRU, disk persistence | JSON index file in vault config dir, `loadData`/`saveData` guard |
| `PollingScheduler` | Submit/run result polling with exponential backoff, timeout | `registerInterval`, backoff logic, cancellation |
| `RateLimiterAdapter` | 20 req/10 s, 2 concurrent limit wrapping `requestUrl` | Queue, token bucket |
| `ProblemBrowserView` | Problem list UI — filter, search, open problem | `ItemView`, DOM helpers (`createEl`) |
| `VerdictModal` | Display run/submit verdict, runtime, memory, error message | `Modal`, verdict rendering |
| `SettingsTab` | Plugin configuration UI | `PluginSettingTab`, `Setting` components |

---

## Recommended Project Structure

```
src/
├── main.ts                     # LeetCodePlugin class — entry point only
│
├── auth/
│   ├── AuthService.ts          # Cookie storage, expiry detection, re-login trigger
│   ├── BrowserWindowLogin.ts   # Electron BrowserWindow flow, cookie capture
│   └── types.ts                # AuthState, Credential interfaces
│
├── client/
│   ├── LeetCodeClient.ts       # Facade: exposes all LC operations as async methods
│   ├── graphql/
│   │   └── GraphQLReader.ts    # Wraps @leetnotion/leetcode-api; injects requestUrl adapter
│   ├── rest/
│   │   ├── RunSubmitClient.ts  # Hand-rolled interpret_solution, submit, check
│   │   └── endpoints.ts        # URL constants for all three REST endpoints
│   └── adapters/
│       ├── requestUrlAdapter.ts  # fetcher.set() bridge: requestUrl → Fetch-compatible
│       └── rateLimiter.ts        # Token-bucket wrapper: 20 req/10 s, 2 concurrent
│
├── vault/
│   ├── VaultService.ts         # Note creation, content append, filename resolution
│   ├── FrontmatterService.ts   # processFrontMatter wrappers, schema constants
│   ├── NoteTemplate.ts         # Note body template with frontmatter + code block
│   └── FilenameUtils.ts        # {id}-{slug} construction, sanitize, normalizePath
│
├── cache/
│   ├── CacheService.ts         # Problem index TTL + in-memory LRU + disk write
│   └── types.ts                # ProblemMeta, ProblemIndex, CacheEntry
│
├── polling/
│   └── PollingScheduler.ts     # Exponential backoff: 1s→2s→4s→8s, 30s timeout
│
├── ui/
│   ├── ProblemBrowserView.ts   # ItemView: problem list, search, filter
│   ├── VerdictModal.ts         # Modal: run/submit result display
│   └── SettingsTab.ts          # PluginSettingTab: auth, language, folder, prefix
│
├── types/
│   ├── problem.ts              # Problem, ProblemDetail, TopicTag, CodeSnippet
│   ├── submission.ts           # SubmitResult, RunResult, VerdictStatus
│   └── settings.ts             # PluginSettings interface, DEFAULT_SETTINGS
│
└── utils/
    ├── errors.ts               # AuthExpiredError, RateLimitError, NetworkError
    └── html.ts                 # turndown instance + LC-specific rules
```

### Structure Rationale

- **`auth/`:** Isolated from `client/` so auth can be replaced or extended (e.g., cookie-paste-only path on future mobile) without touching LC API code. `BrowserWindowLogin.ts` is the one file that `require('electron')` — quarantining Electron imports makes the rest of the codebase testable in vitest without an Electron environment.
- **`client/`:** `LeetCodeClient.ts` is the single seam the rest of the plugin talks to. `graphql/` and `rest/` are implementation details hidden behind it. `adapters/` is separately testable: unit-test the `requestUrl` bridge without touching LC, and mock it in tests for the client.
- **`vault/`:** Separating `VaultService` (file I/O) from `FrontmatterService` (YAML schema) keeps vault writes testable as pure functions. `NoteTemplate.ts` owns the full note shape — all frontmatter field names are defined exactly once here.
- **`cache/`:** Keeps `data.json` clean. The problem index lives on disk as a separate JSON file (not in `saveData()`), avoiding the bloat pitfall.
- **`polling/`:** `PollingScheduler` is pure async logic — no Obsidian API references — making it easily unit-tested with vitest mocked timers.
- **`ui/`:** All UI classes import from `client/` and `vault/` but never from each other. Views are stateless renderers driven by service calls.
- **`types/`:** Central type definitions prevent circular imports between `client/`, `vault/`, and `ui/`.

---

## Architectural Patterns

### Pattern 1: Facade Client with Injected Adapter

**What:** `LeetCodeClient` is the only public interface for all LC operations. It internally delegates to `GraphQLReader` (backed by `@leetnotion/leetcode-api`) for reads and `RunSubmitClient` for mutations. Both sub-clients receive the `requestUrl` adapter at construction time, not at call time.

**When to use:** Always. This is the primary seam for testing (inject a mock adapter), for extension (swap GraphQL endpoint for leetcode.cn), and for future refactoring.

**Trade-offs:** Slightly more indirection than calling the library directly. The payoff is that the entire rest of the plugin is decoupled from the specific HTTP mechanism.

```typescript
// client/LeetCodeClient.ts
export class LeetCodeClient {
  private graphql: GraphQLReader;
  private rest: RunSubmitClient;

  constructor(private auth: AuthService, fetcher: FetchAdapter) {
    this.graphql = new GraphQLReader(fetcher);
    this.rest = new RunSubmitClient(fetcher);
  }

  async getProblemList(filters?: ProblemFilters): Promise<ProblemMeta[]> {
    return this.graphql.problemList(filters);
  }

  async getProblemDetail(slug: string): Promise<ProblemDetail> {
    const cred = this.auth.requireCredential(); // throws AuthExpiredError if missing
    return this.graphql.problemDetail(slug, cred);
  }

  async submitSolution(slug: string, code: string, lang: string): Promise<SubmitResult> {
    const cred = this.auth.requireCredential();
    return this.rest.submitAndPoll(slug, code, lang, cred);
  }
}
```

### Pattern 2: Atomic Vault Writes via `process()` + `processFrontMatter()`

**What:** All writes to vault notes go through either `vault.process()` (for note body changes) or `fileManager.processFrontMatter()` (for frontmatter changes). Direct `vault.modify()` on any problem note is forbidden.

**When to use:** Any time the plugin writes to a note that the user may have open in an editor. This covers accepted-submission appends, frontmatter status updates, and backlink section writes.

**Trade-offs:** Slightly more verbose than `vault.modify()`. The trade-off is zero TOCTOU data loss — `process()` provides the content at write time, not at read time (Pitfall 5).

```typescript
// vault/VaultService.ts

// Append accepted solution block atomically
async appendSolution(file: TFile, code: string, lang: string): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  await this.app.vault.process(file, (current) => {
    const block = `\n\n## Solution (${date})\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    return current + block;
  });
}

// Update frontmatter on accept — never touches note body
async markSolved(file: TFile, result: AcceptedResult): Promise<void> {
  await this.app.fileManager.processFrontMatter(file, (fm) => {
    fm["lc-status"] = "solved";
    fm["lc-solved-date"] = new Date().toISOString().split("T")[0];
    fm["lc-runtime-ms"] = result.statusRuntime;
    fm["lc-memory-mb"] = result.statusMemory;
    fm["lc-language"] = result.lang;
  });
}
```

### Pattern 3: Polling with Exponential Backoff and Hard Timeout

**What:** After posting to `/interpret_solution/` or `/submit/`, the verdict is polled from `/check/` using a fixed delay sequence rather than a `setInterval`. The polling is cancellable and surfaces a user-visible "Judging..." notice.

**When to use:** All run-code and submit flows. The same scheduler handles both, since the check endpoint is identical.

**Trade-offs:** Slightly more code than `setInterval`. Prevents the 429-rate-limit pitfall and provides clean cancellation (Pitfall 13).

```typescript
// polling/PollingScheduler.ts
const DELAYS_MS = [1000, 2000, 4000, 8000, 8000, 8000]; // 30s total max

export async function pollUntilDone(
  checkFn: () => Promise<CheckResult>,
  onStatus: (msg: string) => void,
): Promise<CheckResult> {
  for (const delay of DELAYS_MS) {
    await sleep(delay);
    const result = await checkFn();
    if (result.state === "SUCCESS" || result.state === "FAILED") {
      return result;
    }
    onStatus(`Judging... (${result.state})`);
  }
  throw new Error("Submission check timed out after 30 seconds");
}
```

### Pattern 4: Lazy Problem Index — Load on Browse, Never on Startup

**What:** The problem list index (slug → id, title, difficulty, tags) is loaded from disk cache only when the user opens the problem browser. `onload()` only loads plugin settings and verifies auth. The full 3,300-entry index is never in `data.json`.

**When to use:** Always. Prevents the UI-blocking startup pitfall (Pitfall 8) and `data.json` bloat (Pitfall 9).

**Trade-offs:** First browse after a cold start may take 1–2 seconds while the index loads. Show a loading indicator in the browser view.

```typescript
// cache/CacheService.ts
export class CacheService {
  private indexPath: string;   // vault configDir + "/obsidian-leetcode-index.json"
  private lru: LRUCache<string, ProblemDetail>; // max 200 entries

  async loadIndex(): Promise<ProblemIndex> {
    // reads from disk, NOT from data.json
    const raw = await this.app.vault.adapter.read(this.indexPath);
    return JSON.parse(raw);
  }

  async saveIndex(index: ProblemIndex): Promise<void> {
    await this.app.vault.adapter.write(this.indexPath, JSON.stringify(index));
  }
}
```

### Pattern 5: Auth Guard Wrapper on Every LC Call

**What:** `AuthService.requireCredential()` is called at the top of every method in `LeetCodeClient` that needs authentication. It throws `AuthExpiredError` synchronously if no credential is stored. The plugin's command handlers catch `AuthExpiredError` and trigger the re-login UI.

**When to use:** Any method that talks to an authenticated LC endpoint. Problem-list reads (which are public) skip the guard.

**Trade-offs:** Slightly repetitive. The benefit is that auth-expiry is caught at the service layer, not scattered across UI command handlers (Pitfall 3).

```typescript
// auth/AuthService.ts
export class AuthService {
  requireCredential(): Credential {
    if (!this.data.auth) {
      throw new AuthExpiredError("Not authenticated — please log in");
    }
    return new Credential(this.data.auth.session, this.data.auth.csrf);
  }

  isAuthError(e: unknown): boolean {
    return e instanceof AuthExpiredError
      || (e instanceof GraphQLError && /login|authenticat/i.test(e.message));
  }
}
```

---

## Data Flow

### Full Submit Flow (Happy Path)

```
User presses "Submit" command
         │
         ▼
LeetCodePlugin.executeCommand("submit")
         │  reads active MarkdownView to extract code block content
         ▼
VaultService.extractCodeBlock(editor)      ← strips Markdown, returns {code, lang}
         │
         ▼
LeetCodeClient.submitSolution(slug, code, lang)
         │  AuthService.requireCredential()  → throws AuthExpiredError if no session
         │
         ├─► RestClient.postSubmit(slug, code, lang, cred)
         │         requestUrlAdapter → POST /problems/{slug}/submit/
         │         ← { submission_id: 12345 }
         │
         └─► PollingScheduler.pollUntilDone( checkFn, onStatus )
                   backoff loop: 1s→2s→4s→8s
                   requestUrlAdapter → GET /submissions/detail/12345/check/
                   ← { state: "SUCCESS", status_msg: "Accepted", ... }
                          │
                          ▼
                   returns SubmitResult
         │
         ▼
Plugin.onVerdictReceived(result)
         │
         ├─► VerdictModal.open(result)          ← show Accepted / WA / TLE etc.
         │
         └─[if Accepted]─►
              VaultService.appendSolution(file, code, lang)    ← vault.process()
              VaultService.markSolved(file, result)            ← processFrontMatter()
              VaultService.ensureBacklinks(file, topicTags)    ← vault.process()
```

### Problem Open Flow

```
User selects problem in ProblemBrowserView
         │
         ▼
LeetCodePlugin.executeCommand("open-problem", slug)
         │
         ▼
VaultService.findNoteByProblemId(frontendId)
         │  scans metadataCache for frontmatter["lc-id"] === frontendId
         │  returns TFile | null
         │
         ├─[file exists]─► workspace.getLeaf().openFile(file)   ← done
         │
         └─[file missing]─►
              LeetCodeClient.getProblemDetail(slug)
                   CacheService.getLRU(slug) → hit? return cached
                   GraphQLReader.problemDetail(slug, cred)
                        requestUrlAdapter → POST /graphql (problemData query)
                        ← { content: "<p>...</p>", codeSnippets, topicTags, ... }
                   CacheService.setLRU(slug, detail)
                   ← ProblemDetail
              │
              VaultService.createProblemNote(detail)
                   html.ts: turndown(detail.content) → markdown body
                   FilenameUtils.build(id, slug)     → "0001-two-sum.md"
                   normalizePath(folder + "/" + filename)
                   vault.create(path, NoteTemplate.render(detail, markdown))
                   processFrontMatter(file, fm => { set all lc-* fields })
                   ← TFile
              │
              workspace.getLeaf().openFile(newFile)
```

### Auth Flow (BrowserWindow Path)

```
User clicks "Log in" in SettingsTab
         │
         ▼
AuthService.startLogin()
         │
         ▼
BrowserWindowLogin.open()
         │  require('electron').BrowserWindow (external — Obsidian host provides)
         │  webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
         │  partition: 'persist:lc-session'
         │  loadURL('https://leetcode.com/accounts/login/')
         │
         │  listens: session.cookies.on('changed', handler)
         │  waits for LEETCODE_SESSION cookie to appear on .leetcode.com
         │
         ├─► on LEETCODE_SESSION change:
         │       win.webContents.session.cookies.get({ domain: '.leetcode.com' })
         │       extract LEETCODE_SESSION + csrftoken
         │       win.close()
         │
         ▼
AuthService.storeCredential({ session, csrf })
         │  this.plugin.saveData(data)   ← persists to data.json
         │
         ▼
UI: Notice("Logged in as {username}")
SettingsTab re-renders with session display + Logout button
```

### Auth Flow (Cookie-Paste Fallback)

```
User pastes LEETCODE_SESSION value into SettingsTab text field
         │
         ▼
AuthService.storeSessionFromPaste(sessionValue)
         │  fetches csrftoken via GET /graphql/ (requestUrl)
         │  stores { session: sessionValue, csrf: extractedCsrf }
         │
         ▼
AuthService.verifySession()
         │  LeetCodeClient.whoami()  →  GraphQL { userStatus { username } }
         │  checks response.errors for auth-failure pattern
         │
         ├─[success]─► Notice("Logged in as {username}")
         └─[fail]────► Notice("Invalid session — check your cookie value")
```

### State Update Lifecycle

```
data.json (persistent)
    ├── auth: { session, csrf } | null       ← AuthService owns
    ├── settings: { language, folder, tagPrefix, ... }  ← SettingsTab owns
    └── (nothing else — index and content live elsewhere)

vault configDir / obsidian-leetcode-index.json (disk, not data.json)
    └── { problems: ProblemMeta[], updatedAt: number }  ← CacheService owns

In-memory LRU (session-scoped)
    └── Map<slug, ProblemDetail>  max 200 entries  ← CacheService owns

Vault notes: LeetCode/{id}-{slug}.md (permanent, user-owned)
    └── frontmatter + problem body + solution blocks  ← VaultService owns
```

---

## Module Dependency Graph

```
main.ts
  └── LeetCodePlugin
        ├── AuthService          (no deps on other services)
        ├── CacheService         (depends on: Obsidian vault adapter only)
        ├── LeetCodeClient
        │     ├── GraphQLReader  (depends on: requestUrlAdapter, AuthService)
        │     ├── RunSubmitClient(depends on: requestUrlAdapter, PollingScheduler)
        │     └── requestUrlAdapter (depends on: Obsidian requestUrl only)
        ├── VaultService         (depends on: Obsidian vault + fileManager + metadataCache)
        └── UI (views / modals / settingsTab)
              └── depend on: LeetCodeClient, VaultService, AuthService
                  (never depend on each other; never depend on CacheService directly)
```

No circular dependencies. Test seam: inject mock `FetchAdapter` into `LeetCodeClient` to unit-test all service logic without network or Obsidian runtime.

---

## Build Order and Phase Rationale

### Phase 1: Scaffold + Auth + `requestUrl` Adapter + LC Client (GraphQL reads only) + Settings

**What to build:**
- Plugin class skeleton (`main.ts`, manifest, tsconfig, esbuild config, `isDesktopOnly: true`)
- ESLint with `eslint-plugin-obsidianmd` — zero violations from day one (Pitfall 2, 10)
- `AuthService` + `BrowserWindowLogin` + cookie-paste fallback (Pitfall 3, 6, 7, 18)
- `requestUrlAdapter` bridging `fetcher.set()` for `@leetnotion/leetcode-api` (Pitfall 1)
- `LeetCodeClient` facade with GraphQL reads only (problem list, problem detail, whoami)
- `RateLimiterAdapter` (20 req/10 s, 2 concurrent) around `requestUrl`
- `SettingsTab` with: login button, default language, problems folder, tag prefix
- Status bar item showing current LC username

**Why first:** Nothing else works without auth and the HTTP adapter. These are unblocked prerequisites for every subsequent phase. Establishing ESLint config and `isDesktopOnly` here avoids retroactive fixes. The cookie-paste fallback must be first-class (not added later) because BrowserWindow may fail on some configurations.

**Testable output:** Can authenticate, call `whoami`, fetch the problem list, see session status in the settings tab.

---

### Phase 2: Problem Detail → Note Creation + Frontmatter Schema + Tag Import

**What to build:**
- `VaultService.createProblemNote()` — `{id}-{slug}.md` naming, `normalizePath`, Windows-safe sanitization (Pitfall 11)
- `NoteTemplate.ts` — full frontmatter schema defined here, once (Pitfall 12, 16)
  - `lc-id`, `lc-slug`, `lc-title`, `lc-difficulty`, `lc-status`
  - `lc-tags: [lc/array, lc/dynamic-programming, ...]` — namespaced `lc/` prefix (Pitfall 16)
  - `lc-url`, `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, `lc-language`
  - `user-tags: []` — separate field, never overwritten (Pitfall 16)
- `FrontmatterService` wrapping `processFrontMatter` (Pitfall 12)
- `html.ts` — turndown instance with LC-specific code-block rule
- `ProblemBrowserView` (ItemView) — problem list, search, difficulty/tag filter, "Open as note" action
- `CacheService` — on-demand problem index with TTL, separate JSON file on disk (Pitfall 8, 9)
- Note creation is explicit user action, never automatic on browse (Pitfall 15)

**Why second:** Note creation is the core Obsidian-native value. The frontmatter schema is load-bearing for all downstream phases — defining it here means it never needs retroactive migration. Tag namespace must be baked in from the first note ever created (Pitfall 16 recovery cost = HIGH).

**Testable output:** Can browse problems, open one as a note, see correct frontmatter with `lc/` prefixed tags, read problem markdown offline after first fetch.

---

### Phase 3: Run Code + Submit + Polling + Verdict Display

**What to build:**
- `RunSubmitClient.ts` — hand-rolled POST to `/interpret_solution/` and `/submit/` (Pitfall 4: CSRF re-fetch on 403)
- `PollingScheduler.ts` — exponential backoff 1s→2s→4s→8s, 30s timeout (Pitfall 13)
- CSRF refresh-on-403 retry in `RunSubmitClient`
- `VerdictModal` — show status, runtime ms + percentile, memory + percentile, WA test case, compile error
- "Run Code" command — extract code block from active note, POST, poll, show result
- "Submit" command — same flow, different endpoint
- Code-block extraction from note: strips all non-code content; warns if no fenced block found (UX pitfall from PITFALLS.md)
- "Judging..." notice with live state updates during polling

**Why third:** Run/submit have no dependencies on Phase 2's note creation beyond "a note must be open." Separating them keeps Phase 2 deliverable independently. The polling scheduler is a non-trivial async component best built and tested before the Phase 4 write-back wires into it.

**Testable output:** Can run code against sample test cases and see output vs expected; can submit and see Accepted/WA/TLE verdict with runtime and memory.

---

### Phase 4: Post-Accept Write-Back (Solution Append + Frontmatter Update + Backlinks)

**What to build:**
- `VaultService.appendSolution()` — `vault.process()` to append `## Solution (YYYY-MM-DD)` section (Pitfall 5)
- `VaultService.markSolved()` — `processFrontMatter()` to write solved date, runtime, memory, language, status
- `VaultService.ensureBacklinks()` — map LC topic tags → technique names, write `[[Two Pointers]]` wikilinks to `## Techniques` section via `vault.process()`, create stub technique notes only if they don't exist (Pitfall 15)
- Wire Phase 3's `onVerdictReceived(Accepted)` to trigger all three writes
- Settings toggle: "Auto-create technique backlinks" (default: on; off for users who dislike stub notes)
- Stub technique notes created in a configurable `techniques/` subfolder

**Why fourth:** These writes depend on Phase 3's verdict flow. All three use `vault.process()` / `processFrontMatter()` established in Phase 2. The backlink logic is the most complex write because it must read the current `## Techniques` section, check for existing links, and write only additions — hence it comes last in the sequence.

**Testable output:** After an Accepted submission: note has a new Solution section, frontmatter shows solved date/runtime/memory, `## Techniques` has `[[Two Pointers]]` wikilinks, graph view shows connections.

---

### Phase 5: Polish — Settings UI Refinement, Error Handling, README, Store Submission

**What to build:**
- Graceful error surface for all error types: rate limit (429), LC downtime (503), auth expiry, network timeout
- `AuthExpiredError` caught at plugin level → show "Session expired — click to log in again" Notice
- Settings: "Clear cache" button, "Re-sync problem index" button, tag prefix configuration
- README with: install instructions, usage screenshots, network disclosure ("communicates with leetcode.com"), Dataview example queries, vscode-leetcode attribution
- LICENSE file (MIT)
- Pre-submission ESLint audit (`npm run lint` zero errors)
- Community plugin JSON PR preparation

**Why fifth:** Error handling and polish don't gate core functionality but are required for store submission. Doing this last avoids polishing paths that may be redesigned in earlier phases.

**Testable output:** Plugin passes `eslint-plugin-obsidianmd` with zero Required violations; README is complete; all error states have user-visible messages; ready for community plugin PR.

---

## Extension Seams

These are deliberate abstraction points — each one is where a deferred feature hooks in without requiring a rewrite.

### leetcode.cn (v2)

**Where:** `client/rest/endpoints.ts` and `GraphQLReader.ts` constructor.

**How:** `endpoints.ts` exports `BASE_URL = "https://leetcode.com"` as a configurable constant. `LeetCodeClient` constructor accepts a `baseUrl` parameter. A `LeetCodeCNClient` subclass overrides `baseUrl = "https://leetcode.cn"`. Auth changes (WeChat/phone) extend `AuthService` — the plugin core wires the correct `AuthService` implementation based on a settings "site" toggle.

**What doesn't change:** `VaultService`, `CacheService`, `ProblemBrowserView`, `VerdictModal`, all vault write logic. The facade boundary makes the swap surgical.

### Mobile (v2)

**Where:** `auth/BrowserWindowLogin.ts` and `main.ts` command registration.

**How:** `BrowserWindowLogin.ts` is already behind a `Platform.isDesktop` guard. On mobile, `AuthService.startLogin()` falls through to the cookie-paste path directly. The `manifest.json` `isDesktopOnly: true` flag is removed when mobile support is added, and BrowserWindow code is conditionally imported.

**What doesn't change:** Everything except `BrowserWindowLogin.ts`. The cookie-paste fallback is a first-class path (not an afterthought) specifically for this reason.

### Spaced Repetition (v2)

**Where:** `vault/FrontmatterService.ts` schema and `VaultService.markSolved()`.

**How:** The frontmatter schema already has `lc-solved-date` and `lc-status`. Reserving `lc-last-reviewed` and `lc-ease-factor` as defined but unpopulated fields (set to `null` on note creation) means an SR plugin can read them via Obsidian's `metadataCache` without any plugin-side changes. Alternatively, emit a custom event on `onVerdictReceived(Accepted)` that an SR extension listener can consume.

**What doesn't change:** Core plugin. SR is an opt-in extension, not a core concern.

### AI Tagging (v2)

**Where:** `vault/VaultService.ensureBacklinks()` — the step that writes technique links.

**How:** `ensureBacklinks()` currently derives technique names from LC's `topicTags`. An AI-tagging module would hook in at the same point: before writing wikilinks, call an LLM endpoint with the solution code and get back additional technique tags. The write path (`processFrontMatter` + `vault.process()` for the Techniques section) is unchanged — only the source of tag names differs. Guard behind a settings toggle "AI tagging (requires API key)".

**What doesn't change:** Vault write logic, note structure, frontmatter schema.

---

## Anti-Patterns

### Anti-Pattern 1: Services Calling Each Other Directly

**What people do:** `VaultService` imports `LeetCodeClient` to re-fetch problem data during a note update. `CacheService` imports `VaultService` to look up notes.

**Why it's wrong:** Creates circular dependencies and makes unit testing impossible — you can't instantiate `VaultService` in a test without also setting up `LeetCodeClient`.

**Do this instead:** Services only call down (UI → Plugin → Services → Infra). Data is passed as arguments, never re-fetched from within a service. If `VaultService.ensureBacklinks()` needs tag data, the caller (plugin command handler) fetches it from `LeetCodeClient` first and passes it in.

### Anti-Pattern 2: Storing Problem Content in `data.json`

**What people do:** Cache the full problem HTML/Markdown in the `saveData()` object alongside settings and auth tokens.

**Why it's wrong:** `data.json` is loaded synchronously on every plugin init. A 3,000-problem cache bloats it to tens of MB, making every Obsidian startup slow. `saveData()` serializes the entire object — one large write on every change.

**Do this instead:** Problem content lives in vault notes (permanent, user-visible). The problem index (metadata only) lives in a separate JSON file written via `vault.adapter.write()`. `data.json` contains only: auth tokens, settings, and nothing else.

### Anti-Pattern 3: Eager Note Creation on Browse

**What people do:** When the problem list loads, create a note for every problem the user scrolls past — or import all previously-solved problems at once.

**Why it's wrong:** Creates 3,300 orphan nodes in the graph view; degrades Obsidian performance; violates user expectations (they didn't ask to create notes).

**Do this instead:** Notes are created exactly once: when the user clicks "Open as note" on a specific problem. The problem list is a read-only browser; note creation is a deliberate user action.

### Anti-Pattern 4: Polling with `setInterval` at Fixed Short Intervals

**What people do:** `setInterval(() => checkSubmission(id), 500)` in the submit handler.

**Why it's wrong:** LeetCode rate-limits the `/check/` endpoint. Aggressive polling returns 429 responses, leaves state stuck in "PENDING", and degrades the user's LC account standing.

**Do this instead:** Use the `PollingScheduler` with `[1000, 2000, 4000, 8000, 8000, 8000]` delay sequence and a 30-second hard timeout. Register via `this.registerInterval()` if you must use interval, so it's cleaned up on plugin unload.

### Anti-Pattern 5: `Vault.modify()` on Active Notes During Async Operations

**What people do:** After submit completes (3–10 seconds), read the note file, mutate the string, and call `vault.modify(file, newContent)`.

**Why it's wrong:** The user may have typed in the note during the submission wait. `vault.modify()` replaces the entire file — those edits are silently lost.

**Do this instead:** `vault.process(file, cb)` where `cb` receives the current content at write time, eliminating the TOCTOU window. For frontmatter, always `fileManager.processFrontMatter()`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `leetcode.com` GraphQL | `@leetnotion/leetcode-api` with injected `requestUrl` adapter | All reads; 200 can mask auth errors — always check `response.errors` |
| `leetcode.com` REST (`/interpret_solution/`, `/submit/`, `/check/`) | Hand-rolled `requestUrl` calls in `RunSubmitClient` | Requires session cookie + `x-csrftoken` header; poll `/check/` with backoff |
| Electron `BrowserWindow` | `require('electron')` (external, Obsidian host-provided) | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` always |

### Internal Boundaries

| Boundary | Communication Pattern | Notes |
|----------|----------------------|-------|
| UI → Plugin | Obsidian command callbacks, event handlers | Views never call services directly; they invoke plugin commands |
| Plugin → Services | Direct method calls with typed parameters | Plugin owns service instances; services don't hold refs to each other |
| Services → Infrastructure | `LeetCodeClient` receives adapter at construction; all `requestUrl` calls go through it | Enables mock injection in vitest |
| VaultService → Obsidian API | `vault.create`, `vault.process`, `fileManager.processFrontMatter`, `normalizePath` | Never `vault.modify` on problem notes |
| CacheService → Obsidian API | `vault.adapter.read/write` for index file; `loadData/saveData` for settings+auth only | Index file outside `data.json` |
| AuthService → Electron | `require('electron').BrowserWindow` inside `BrowserWindowLogin.ts` only | Quarantined to single file for testability and mobile isolation |

---

## Frontmatter Schema (Canonical)

All field names defined once in `NoteTemplate.ts`. Prefixed `lc-` to avoid collision with Dataview or user fields.

```yaml
---
lc-id: "0001"                          # questionFrontendId — canonical lookup key
lc-slug: "two-sum"
lc-title: "Two Sum"
lc-difficulty: "Easy"
lc-status: "unsolved"                  # unsolved | attempted | solved
lc-url: "https://leetcode.com/problems/two-sum/"
lc-tags:                               # LC-sourced, namespaced lc/ prefix (Pitfall 16)
  - lc/array
  - lc/hash-table
lc-solved-date:                        # ISO date, filled on first Accepted
lc-runtime-ms:                         # e.g. "24" (number as string for Dataview)
lc-memory-mb:                          # e.g. "16.4"
lc-language:                           # e.g. "python3"
user-tags: []                          # user-owned, never overwritten by plugin
---
```

---

## Sources

- Obsidian Plugin API (`obsidian.d.ts`) — `Plugin`, `ItemView`, `Modal`, `PluginSettingTab`, `requestUrl`, `vault.process`, `fileManager.processFrontMatter`, `metadataCache` (HIGH confidence — official types)
- `obsidianmd/obsidian-developer-docs` via Context7 — `registerEvent`, `registerInterval`, `registerView`, `addStatusBarItem`, submission requirements (HIGH confidence — official)
- `obsidianmd/eslint-plugin-obsidianmd` README — `innerHTML` rule, `activeLeaf` rule, floating promise rule (HIGH confidence — official)
- `@leetnotion/leetcode-api` / `leetcode-query` source — `fetcher.set()` API, `Credential` class, rate limiter 20 req/10 s (HIGH confidence — primary source)
- `skygragon/leetcode-cli` lib/config.js — REST endpoint paths for interpret/submit/check (MEDIUM confidence — old CLI, endpoints confirmed stable)
- Electron Cookies API docs — `cookies.on('changed')`, `flushStore()`, partition isolation (HIGH confidence — official)
- Sibling research: `STACK.md`, `FEATURES.md`, `PITFALLS.md` — all constraints and patterns derived from these documents (HIGH confidence)

---

*Architecture research for: Obsidian community plugin — LeetCode integration*
*Researched: 2026-05-07*
