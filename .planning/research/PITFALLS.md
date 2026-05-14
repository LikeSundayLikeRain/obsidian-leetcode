# Pitfalls Research

**Domain:** Obsidian community plugin integrating with LeetCode (desktop, TypeScript, Electron)
**Researched:** 2026-05-07
**Confidence:** HIGH (official Obsidian docs + official eslint-plugin rules + leetcode-query source + vscode-leetcode issue history + Electron docs)

---

## Critical Pitfalls

### Pitfall 1: Using `fetch` / `XMLHttpRequest` Instead of `requestUrl` for LeetCode API Calls

**What goes wrong:**
The plugin calls `fetch()` or `XMLHttpRequest` to hit `leetcode.com/graphql`. Obsidian's renderer process enforces CORS — LC's `Access-Control-Allow-Origin` headers do not whitelist `app://obsidian.md`. Every unauthenticated request fails with a CORS error, and authenticated requests (which need cookies or `x-csrftoken` headers) are blocked entirely because `fetch` in the renderer cannot send arbitrary headers cross-origin.

**Why it happens:**
`leetcode-query` defaults to `cross-fetch` (standard Fetch API). Developers assume Electron bypasses CORS like Node.js would. It does not — Obsidian's renderer runs with web security enabled, and the renderer's `fetch` is the browser `fetch`, not Node's.

**How to avoid:**
Replace `leetcode-query`'s default fetcher with Obsidian's `requestUrl` (from the `obsidian` package). `requestUrl` runs in the main process and is not subject to CORS. The library exposes a `fetcher.set()` hook exactly for this purpose:

```typescript
import { requestUrl } from "obsidian";
import { fetcher } from "leetcode-query";

fetcher.set(async (input, init) => {
  const url = typeof input === "string" ? input : (input as Request).url;
  const res = await requestUrl({
    url,
    method: (init?.method as string) ?? "GET",
    headers: (init?.headers as Record<string, string>) ?? {},
    body: init?.body as string,
    throw: false,
  });
  return new Response(res.text, { status: res.status, headers: res.headers });
});
```

**Warning signs:**
- `TypeError: Failed to fetch` in the developer console
- CORS errors when testing any LC endpoint
- `leetcode-query` works in a plain Node script but fails inside Obsidian

**Phase to address:** Phase 1 (Auth + API scaffolding). Must be solved before any LC call works.

---

### Pitfall 2: Obsidian Plugin Store Rejection — Automated ESLint Bot Blockers

**What goes wrong:**
The Obsidian plugin store runs an automated code scan (via `eslint-plugin-obsidianmd`) on every PR. The bot posts "Required" violations as blocking issues. Common blockers observed in real PRs (confirmed from obsidianmd/obsidian-releases PR review comments):

- **`innerHTML` / `outerHTML` / `insertAdjacentHTML` with user-derived or external data** (XSS risk — reviewer flags as security violation)
- **`element.style.color = ...` / `element.style.background = ...`** (hardcoded styles — must use CSS classes and CSS variables)
- **Unhandled Promise rejections** (floating promises — must be `await`ed, `.catch()`-ed, or explicitly `void`-ed)
- **Sample code left in** (placeholder class names like `MyPlugin`, `SampleSettingTab`)
- **Node.js built-in imports (`fs`, `path`, `crypto`, `os`) without `isDesktopOnly: true` in manifest.json** — automatic rejection
- **`window.app` / global `app` usage** instead of `this.app`
- **No LICENSE file** — automatic rejection
- **`manifest.json` id mismatch** between `community-plugins.json` entry and `manifest.json`
- **`fundingUrl` present when no donations accepted** (or absent when they are)
- **UI text not in sentence case** (e.g., "Open Problem" → "Open problem")
- **Default hotkeys set on commands** — conflicts with other plugins
- **`detachLeaves()` called in `onunload`**

**Why it happens:**
Developers copy patterns from non-Obsidian web code. The eslint-plugin rules are Obsidian-specific and not obvious without reading the guidelines.

**How to avoid:**
Install and run `eslint-plugin-obsidianmd` locally before submitting. Treat all "Required" violations as blocking. Set `"isDesktopOnly": true` in `manifest.json` since this plugin uses Node/Electron APIs (BrowserWindow, fs). Never use `innerHTML` with any LC-sourced content — use `createEl()` / `createDiv()` / `el.empty()`.

**Warning signs:**
- Bot comment on the PR with "Required" section populated
- Any use of `innerHTML` to render problem descriptions (LC returns HTML)
- Any hardcoded color values in plugin code

**Phase to address:** Phase 1 scaffold (configure ESLint from day one). Phase final (pre-submission audit).

---

### Pitfall 3: LeetCode Session Cookie Expiry — Silent Auth Death

**What goes wrong:**
The `LEETCODE_SESSION` cookie has a finite lifetime (roughly 2 weeks for cookie-paste auth; longer for SSO-based). When it expires, LC returns HTTP 403 or a GraphQL response with `data: null` and `errors: [{ message: "You are not authenticated" }]` — not an HTTP 401. Code that checks only the HTTP status code misses this and silently serves stale data or crashes with a null-dereference.

**Why it happens:**
GraphQL APIs commonly return `200 OK` even for auth failures — the error lives in the response body. Developers write `if (res.status === 200) return data` without checking the `errors` field.

**How to avoid:**
After every GraphQL response, check for `response.errors` before accessing `response.data`. Treat `errors[0].message` containing "authenticated" or "login" as an auth-expired signal and surface a re-login prompt immediately. Store a `lastVerified` timestamp and re-verify the session on plugin load (using the cheap `whoami` endpoint).

```typescript
if (result.errors?.some(e => /login|authenticat/i.test(e.message))) {
  throw new AuthExpiredError("LeetCode session expired — please log in again");
}
```

**Warning signs:**
- `data: null` from GraphQL with no HTTP error
- Submissions failing with no feedback after a period of inactivity
- `leetcode.whoami()` returning `null` for `userId`

**Phase to address:** Phase 1 (auth layer). Every GraphQL call must go through a response-checking wrapper.

---

### Pitfall 4: CSRF Token Staleness Causing 403 on Mutations

**What goes wrong:**
LeetCode requires a fresh `csrftoken` cookie and matching `x-csrftoken` header on state-changing requests (run code, submit). `leetcode-query` fetches the CSRF token once during `credential.init()` by hitting `GET /graphql/` and parsing the `set-cookie` header. If the session is long-lived, this token can become stale. On mutation, LC returns `HTTP 403` with body `{"detail": "CSRF Failed: ..."}`.

**Why it happens:**
The CSRF token is treated as a one-time setup value rather than a potentially-rotating credential.

**How to avoid:**
- On any 403 response from a mutation, automatically refresh the CSRF token and retry once.
- Watch for `set-cookie: csrftoken=...` on every response and update the stored value (leetcode-query already does this via the `update-csrf` event — make sure you listen to it and persist the new value).
- Never cache the CSRF token in plugin `data.json` between sessions; always re-fetch it on plugin load.

**Warning signs:**
- `HTTP 403` only on run/submit operations, not on queries
- Run code worked once then stopped after a long idle period

**Phase to address:** Phase 2 (run/submit implementation).

---

### Pitfall 5: Overwriting User Edits on Auto-Append After Accepted Submission

**What goes wrong:**
On accepted submission, the plugin reads the note file, appends the solution code block and updates frontmatter, then writes the file back. If the user has typed anything in the note since the last read, those edits are silently overwritten by the stale file content that was read before submission.

**Why it happens:**
`Vault.modify()` replaces the entire file content. A read-then-write pattern with any delay (submission polling can take 3-10 seconds) creates a TOCTOU window.

**How to avoid:**
Use `Vault.process()` (the atomic file modifier introduced in Obsidian API) instead of `Vault.modify()`. `process()` provides a callback with the current file content at modification time, eliminating the TOCTOU window. For frontmatter specifically, use `FileManager.processFrontMatter()`.

```typescript
await this.app.vault.process(file, (content) => {
  // content is always current at time of write
  return appendSolutionBlock(content, solution);
});
```

**Warning signs:**
- Users reporting lost notes after submitting
- Any code path that does `read → transform → write` with an `await` between read and write on the active file

**Phase to address:** Phase 3 (note write-back on accepted submission).

---

### Pitfall 6: Electron BrowserWindow Security Misconfiguration

**What goes wrong:**
The embedded login window is opened with `nodeIntegration: true` or `contextIsolation: false`. This allows any JavaScript running inside the LeetCode page (including injected scripts via XSS, or malicious LC page changes) to execute arbitrary Node.js code with full filesystem access.

**Why it happens:**
Older Electron tutorials and some plugin examples set `nodeIntegration: true` for convenience. The BrowserWindow is just for login so it "seems harmless."

**How to avoid:**
Always create BrowserWindows with:
```typescript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  }
});
```
Extract cookies from `session.defaultSession.cookies.get({ domain: 'leetcode.com' })` after successful navigation — do not inject a preload script to extract them from page context.

**Warning signs:**
- Any `nodeIntegration: true` in BrowserWindow options anywhere in the codebase
- Any `preload` script that runs in the LC page and communicates back via IPC

**Phase to address:** Phase 1 (login window implementation).

---

### Pitfall 7: Cookie Extraction Reliability — Timing and Partition Issues

**What goes wrong:**
After the user logs in to LeetCode in the BrowserWindow, the plugin calls `session.cookies.get({ domain: 'leetcode.com' })` immediately on navigation-complete, but the `LEETCODE_SESSION` cookie hasn't been written to disk yet. The get call returns an empty array. The plugin treats this as "not logged in" and shows an error.

Additionally, if the BrowserWindow uses a separate `partition` (isolated session), cookies are not shared with `session.defaultSession`, so `session.defaultSession.cookies` returns nothing.

**Why it happens:**
Electron writes cookies to disk asynchronously (every 30 seconds or 512 ops per the Electron docs). The `session.cookies.get` API reads from the in-memory store, but timing of when the `set-cookie` response header is processed can lag navigation events. Also, developers sometimes create a `partition`-based session for isolation without realizing it splits the cookie jar.

**How to avoid:**
- Listen to `session.cookies.on('changed', ...)` and wait for the `LEETCODE_SESSION` cookie to appear rather than polling after `did-navigate`.
- If using a custom partition, read cookies from that session's `cookies` object, not `defaultSession.cookies`.
- Call `session.cookies.flushStore()` before reading if you need guaranteed disk persistence.

**Warning signs:**
- Login appears to succeed (user sees their LC dashboard) but the plugin reports "not authenticated"
- Cookie extraction works on fast machines but fails on slow ones (timing-dependent)

**Phase to address:** Phase 1 (login window + cookie extraction).

---

### Pitfall 8: Blocking the Obsidian UI with Synchronous or Long-Running Operations

**What goes wrong:**
Loading the full LeetCode problem list (~3,300+ problems) into memory in one GraphQL call, or processing it synchronously, freezes the Obsidian UI thread for several seconds. Users see Obsidian become unresponsive.

**Why it happens:**
The `problems` GraphQL query can return all problems in a single paginated call. Developers fetch the full list at plugin startup for search/browse to work offline. `leetcode-query`'s RateLimiter defaults to 20 requests per 10 seconds with 2 concurrent — a full list fetch triggers that limit.

**How to avoid:**
- Never load the full problem list on plugin startup. Load lazily on first browse/search.
- Paginate: fetch 50-100 problems at a time.
- Cache the full list to a local JSON file in `app.vault.configDir` after first load; use the cache on subsequent startups.
- All network calls must be `async` — never block the main thread waiting on I/O.
- Use Obsidian's `Notice` API to show progress on long operations; do not block the UI.

**Warning signs:**
- Any `await` on a full-list fetch at the top of `onload()`
- Any loop over all 3,300 problems in the main thread without chunking
- `requestUrl` calls that return > 1MB of data

**Phase to address:** Phase 2 (problem browse/search). The full-list cache strategy must be designed up front.

---

### Pitfall 9: Unbounded Cache Growing Without Eviction

**What goes wrong:**
Problem content (HTML description, code stubs) is cached in memory as a `Map<slug, content>`. After browsing many problems in a session, this map grows to hold thousands of entries. On plugin reload, if the cache is serialized to `data.json`, the settings file bloats to megabytes. Obsidian loads `data.json` on every plugin init.

**Why it happens:**
Developers add a map cache without considering eviction. `leetcode-query` includes its own `Cache` class but it is also unbounded by default.

**How to avoid:**
- Use an LRU cache with a fixed size (e.g., 200 problems in memory).
- Store the full problem list index (title, slug, difficulty, tags — but not full content) in a local flat JSON file, not `data.json`.
- Store individual problem content as separate files in the vault's problem folder, not in memory or `data.json`.
- Never put large data structures in `this.data` (which is serialized to `data.json` on every `saveData()` call).

**Warning signs:**
- `data.json` file size exceeding 100KB
- Obsidian startup time increasing with plugin usage
- `saveData()` / `loadData()` calls taking > 50ms

**Phase to address:** Phase 2 (problem list caching). Design the cache storage format before writing any cache code.

---

### Pitfall 10: Leaking Event Listeners on Plugin Reload

**What goes wrong:**
The plugin registers event listeners on Obsidian workspace events, vault events, or DOM events without using `registerEvent()`. When Obsidian reloads the plugin (e.g., after the user updates it), the old listeners remain attached. This causes duplicate event firing, memory leaks, and ghost behavior where old plugin code still runs.

**Why it happens:**
Developers call `this.app.vault.on('modify', handler)` directly instead of `this.registerEvent(this.app.vault.on('modify', handler))`. The `registerEvent` wrapper automatically removes the listener when the plugin unloads.

**How to avoid:**
- Always use `this.registerEvent()` for vault and workspace events.
- Always use `this.registerDomEvent()` for DOM event listeners.
- Always use `this.registerInterval()` for `setInterval` timers.
- The ESLint rule `no-view-references-in-plugin` and resource management guidelines both flag this pattern — enable the eslint-plugin in CI.

**Warning signs:**
- An event handler firing twice
- Memory usage growing over multiple plugin reloads without restart
- `onunload` not cleaning up something the plugin creates

**Phase to address:** Phase 1 scaffold (set up ESLint rules before any feature code is written).

---

### Pitfall 11: Filename Collisions and Broken References When Users Move Notes

**What goes wrong:**
Two LeetCode problems have similar titles (e.g., "Two Sum" → `two-sum.md` and "Two Sum II" → `two-sum-ii.md` but user renames to `two-sum-2.md`). The plugin uses a hardcoded path derived from the problem slug to find the note. After the user renames or moves the note, the plugin can't find it and creates a duplicate.

Additionally, problems with special characters in their titles (e.g., parentheses, slashes, colons) produce invalid filenames on Windows.

**Why it happens:**
Plugins store references as file paths rather than using Obsidian's link resolution. Path construction doesn't sanitize for cross-platform filename rules.

**How to avoid:**
- Use the problem's `questionFrontendId` (the numeric problem number, e.g., `0001`) as the canonical identifier, stored in frontmatter.
- Find existing notes by scanning vault files for `lc-id: 0001` in frontmatter, not by constructing a path.
- Generate filenames as `{id}-{slug}.md` (e.g., `0001-two-sum.md`) — the id prefix prevents collisions and makes sorting natural.
- Always pass user-defined or constructed paths through `normalizePath()` before file operations.
- Sanitize filenames: replace `:`, `?`, `*`, `"`, `<`, `>`, `|`, `\` with `-` before creating files (Windows-safe).

**Warning signs:**
- Any code that does `vault.getFileByPath(constructedPath)` without a fallback search
- Filenames containing parentheses, colons, or question marks
- No `questionFrontendId` stored in frontmatter

**Phase to address:** Phase 2 (note creation). Define the naming scheme and frontmatter schema before creating the first note.

---

### Pitfall 12: Frontmatter Mangling

**What goes wrong:**
The plugin reads a note, extracts frontmatter by splitting on `---`, modifies a YAML field with string manipulation, and writes it back. This corrupts multi-line YAML values, breaks YAML with special characters, or produces invalid YAML that Obsidian refuses to parse as frontmatter.

**Why it happens:**
YAML is not trivially parseable with string operations. LC problem metadata (e.g., descriptions containing colons, quotes, or multi-line content) breaks naive string-based frontmatter writers.

**How to avoid:**
Use `FileManager.processFrontMatter()` exclusively for all frontmatter reads and writes. It handles parsing, serialization, and atomic writes internally:

```typescript
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm["lc-id"] = problem.questionFrontendId;
  fm["lc-difficulty"] = problem.difficulty;
  fm["lc-solved-date"] = new Date().toISOString().split("T")[0];
  fm["lc-tags"] = problem.topicTags.map(t => t.slug);
});
```

Never write raw YAML strings. Never call `Vault.modify()` on a file that has frontmatter you want to preserve.

**Warning signs:**
- Any `yaml.stringify()` or `yaml.parse()` calls in the codebase paired with `Vault.modify()`
- Frontmatter containing values with colons (LC topic names often do)
- Tests that create files with frontmatter and then read them back show corruption

**Phase to address:** Phase 2 (note creation) and Phase 3 (submission write-back).

---

### Pitfall 13: Submission Polling Without Backoff — Rate Limit Triggering

**What goes wrong:**
After posting a submission to `POST /problems/{slug}/submit/`, LC returns a `submission_id`. The verdict is not immediate — the plugin must poll `GET /submissions/detail/{submission_id}/check/` until `state` becomes `SUCCESS` or `FAILED`. Polling every 500ms causes LC to return HTTP 429 (rate limit) or silently drop requests, leaving the user with a spinner that never resolves.

**Why it happens:**
vscode-leetcode polls aggressively. Developers copy the polling loop without adding backoff. LC's rate limit on the check endpoint is lower than on GraphQL queries.

**How to avoid:**
Implement exponential backoff on the check endpoint: start at 1s, double each attempt, cap at 8s, timeout after 30s total:

```typescript
const delays = [1000, 2000, 4000, 8000, 8000, 8000]; // ms
for (const delay of delays) {
  await sleep(delay);
  const result = await checkSubmission(submissionId);
  if (result.state === "SUCCESS" || result.state === "FAILED") return result;
}
throw new Error("Submission check timed out");
```

Note: `leetcode-query` does not currently implement a submit/check endpoint — this must be implemented directly using `requestUrl` against LC's REST API (not the GraphQL endpoint), with the session cookie and csrf token headers.

**Warning signs:**
- HTTP 429 responses from LC during submission flow
- Submission result never arriving (state stuck at "PENDING")
- Any `setInterval` with a fixed short interval on a check endpoint

**Phase to address:** Phase 3 (run/submit implementation).

---

### Pitfall 14: LeetCode GraphQL Schema Drift

**What goes wrong:**
LC's GraphQL schema is undocumented and changes without notice. A field that exists today (`freqBar`, `hasSolution`, `isPaidOnly`) may be renamed or removed. When that happens, the GraphQL query returns `null` for that field or throws a resolver error, which surfaces as a plugin crash or silent data loss.

Confirmed drift pattern: `leetcode-query` issues history shows `submissions` returning `null` after an LC backend change, and `whoami` breaking entirely after a schema update.

**Why it happens:**
Third-party LC clients are reverse-engineering an internal API. LC does not version it or publish a changelog.

**How to avoid:**
- Never assume a field is non-null in a GraphQL response. Always use optional chaining (`?.`) and provide fallback values.
- Pin `leetcode-query` to a specific version and monitor its GitHub issues for schema-drift reports before upgrading.
- Separate the data-access layer (all LC API calls) from the rest of the plugin so schema changes require only one file to update.
- Write a lightweight integration test (manual, not CI) that checks core endpoints still return expected shapes.

**Warning signs:**
- `leetcode-query` open issues with titles like "API not working" or "null response"
- LC deploys a frontend update (visible from the site) — usually accompanied by backend changes
- Any GraphQL field accessed without `?.`

**Phase to address:** Phase 1 (API client setup). Establish defensive data-access patterns from the start.

---

### Pitfall 15: Graph Flooding with 3,300+ Isolated Nodes

**What goes wrong:**
The plugin creates one note per LeetCode problem automatically as the user browses, or imports the user's full solve history at once. The user's Obsidian graph fills with 3,300 isolated nodes (no links to technique notes yet), making the graph view unusable and degrading Obsidian's performance.

**Why it happens:**
The plugin creates notes eagerly. Tags alone don't create links — only `[[wikilinks]]` in note body create graph edges. Problems without backlinks to technique notes are orphan nodes.

**How to avoid:**
- Only create notes when the user explicitly opens a problem ("open as note" action), not on browse.
- Create technique notes (`[[Two Pointers]]`, `[[Dynamic Programming]]`) as stubs with links only when at least one problem note references them — use `vault.getFileByPath()` to check existence before creating.
- Add a settings toggle: "Auto-create technique backlinks" (default: off for new users).
- Document in the README that the graph grows organically with use, not all at once.

**Warning signs:**
- Any code that iterates the full problem list and calls `vault.create()` in a loop
- No check for an existing technique note before creating one

**Phase to address:** Phase 2 (note creation) and Phase 4 (tagging/backlink system). Explicit "create note" must be a user action, not automatic.

---

### Pitfall 16: Tag Soup Cluttering the Tag Pane

**What goes wrong:**
The plugin auto-imports all of LC's topic tags as Obsidian tags (e.g., `#array`, `#dynamic-programming`, `#tree`, `#breadth-first-search`, etc.). With 3,300 problems each having 3-7 tags, the user's Obsidian tag pane fills with ~70+ LC-sourced tags that co-mingle with their personal tags, making personal tags like `#revisit` or `#project` hard to find.

**Why it happens:**
It's natural to map LC topic tags directly to Obsidian tags. The naming collision with personal workflows is not obvious until a user has accumulated hundreds of tagged notes.

**How to avoid:**
- Namespace all LC-sourced tags with a configurable prefix (default: `lc/`). Example: `lc/array`, `lc/dynamic-programming`.
- Store LC difficulty as `lc/easy`, `lc/medium`, `lc/hard` — not bare `#easy`.
- Allow users to configure the prefix or disable auto-tagging entirely in settings.
- Personal tags (user-added) must be stored separately and never overwritten by the plugin's frontmatter updates.

**Warning signs:**
- LC topic tags stored without any namespace prefix
- User-defined tags (e.g., `#revisit`) in the same frontmatter field as LC-sourced tags
- No tag prefix setting in the settings tab

**Phase to address:** Phase 2 (note creation schema) and Phase 4 (tagging system). The prefix scheme must be in the first note ever created — retroactively changing all tags is painful.

---

### Pitfall 17: LeetCode ToS and Legal Risk from Automation

**What goes wrong:**
LeetCode's Terms of Service prohibit automated scraping and bots. An Obsidian plugin that fetches all 3,300 problems, stores them locally, and auto-submits code is legally grey. Potential consequences: LC banning the user's account, DMCA takedown of the plugin's problem content cache, or removal from the community plugin store if Obsidian reviewers flag it.

**Why it happens:**
Developers treat LC's GraphQL API (which is used by the LC website itself) as a public API. It is not — it is an internal API for the LC frontend.

**How to avoid (risk mitigation, not elimination):**
- **Never store LC problem descriptions as note body content by default.** Store only metadata (title, slug, difficulty, tags, your own solution). Fetch the full description on demand.
- **Do not bulk-download the full problem list.** Fetch only what the user explicitly requests.
- **Submit only with explicit user action.** Never auto-submit.
- **Disclose in the README** that the plugin uses LC's internal API, and that LC may change or restrict access.
- **Do not store LC's problem content in the public GitHub repo** as test fixtures.
- Attribution: vscode-leetcode uses the MIT license. If any LC interaction patterns are borrowed from its source, the README must attribute it per the MIT license requirements (and per Obsidian's developer policy requiring attribution for reused code).

**Warning signs:**
- Problem HTML description saved verbatim into vault notes by default
- Any code that fetches all problems in a startup loop
- Reused vscode-leetcode code without attribution in README

**Phase to address:** Phase 1 (design decisions). Establish the "no bulk-download, no content storage" policy before any LC call is written.

---

### Pitfall 18: macOS Sandbox Blocking the Embedded Login Window

**What goes wrong:**
On macOS, when Obsidian is distributed via the Mac App Store (sandboxed), `require('electron').remote.BrowserWindow` or direct Electron API access from the renderer is blocked. Even on non-MAS Obsidian, the plugin runs in the renderer process and cannot directly instantiate a `BrowserWindow` — that requires the main process.

**Why it happens:**
Plugins run in the renderer process. `BrowserWindow` is a main-process API. In modern Obsidian builds, `remote` (the Electron remote module) may not be available or may be restricted.

**How to avoid:**
- Check how current Obsidian versions expose `BrowserWindow`. As of Obsidian 1.x, `require('electron').remote.BrowserWindow` still works on desktop builds distributed outside MAS, but this is not guaranteed to remain stable.
- Implement the cookie-paste fallback as a first-class path, not an afterthought. If BrowserWindow becomes unavailable in a future Obsidian update, the plugin must still work.
- Test the login window on all three platforms (macOS, Windows, Linux) in CI before submission.
- Use `Platform.isDesktop` guard before any Electron API call.

**Warning signs:**
- `require('electron').remote` returning `undefined` at runtime
- Login window failing silently on one platform but not others
- No fallback when BrowserWindow fails to open

**Phase to address:** Phase 1 (login window). The fallback must be designed in parallel with the BrowserWindow path.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store problem descriptions in note body by default | Rich offline notes immediately | ToS risk, storage bloat, stale content when LC updates a problem | Never in v1; defer to opt-in setting |
| Use `Vault.modify()` instead of `Vault.process()` | Simpler API | Silent data loss when user edits note during submission polling | Never — `process()` is always better for background writes |
| Hardcode tag names without namespace prefix | Less config surface | Impossible to distinguish LC tags from user tags without breaking existing notes | Never — namespace from day one |
| Load full problem list at startup | Browse works immediately without waiting | UI freeze, rate limit trigger, slow startup | Never — lazy load with cache |
| Skip `requestUrl` adapter, use Node `http` in a worker | Avoids CORS complexity | Blocks desktop-only use of built-in fetch, obscure debugging | Never — `requestUrl` is the right approach |
| Skip ESLint setup, fix before submission | Faster initial development | Automated bot finds 20+ violations at PR time; retroactive fixes are painful | Never — set up ESLint on day one |
| `innerHTML` for rendering LC problem HTML | Fast to implement | XSS risk + guaranteed ESLint bot rejection | Never — use a sanitized Markdown renderer or `createEl()` |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LeetCode GraphQL | Using standard `fetch` in renderer | Replace fetcher with `requestUrl` wrapper in leetcode-query |
| LeetCode GraphQL | Treating 200 OK as success | Always check `response.errors` before accessing `response.data` |
| LeetCode submit/check | Polling every 500ms | Exponential backoff: 1s → 2s → 4s → 8s, timeout at 30s |
| LeetCode CSRF | Caching csrftoken between sessions | Re-fetch csrftoken on every plugin load via GET /graphql/ |
| Obsidian frontmatter | YAML string manipulation | Use `FileManager.processFrontMatter()` exclusively |
| Obsidian vault writes | `Vault.modify()` for active file | Use `Editor` API for active file; `Vault.process()` for background writes |
| Electron BrowserWindow | Reading cookies immediately after login | Wait for `cookies.changed` event, not `did-navigate` |
| Electron BrowserWindow | `nodeIntegration: true` for convenience | Always `nodeIntegration: false`, `contextIsolation: true` |
| Obsidian event listeners | `vault.on('modify', fn)` directly | Always `this.registerEvent(vault.on('modify', fn))` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full problem list in memory | Startup freeze, high RAM usage | Paginate + LRU cache + disk-backed index file | At first load if ~3,300 entries fetched at once |
| `data.json` bloat | Slow plugin init, sluggish settings | Never put large data in `saveData()` — use vault files | When `data.json` exceeds ~100KB |
| Iterating all vault files to find a note | Slow note lookup in large vaults | Use `vault.getFileByPath()` or scan frontmatter once and cache | At ~1,000+ vault files |
| Unbounded in-memory cache | Memory growth over long sessions | LRU with max ~200 entries | After ~200 problem opens in one session |
| Synchronous JSON.parse on large cache file | UI jank on plugin load | Load cache async after `onload()` returns | Cache file > 500KB |
| React/Svelte bundled unnecessarily | Bundle size > 500KB | Use Obsidian's native UI APIs; avoid UI frameworks | Bundle bloat is permanent |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `innerHTML` with LC problem HTML content | XSS — LC content could contain `<script>` tags or malicious markup | Use `MarkdownRenderer.render()` for markdown, `createEl()` for DOM building; never trust raw HTML from LC |
| Logging session cookie to console | Credential exposure in developer console | Never `console.log` anything containing the `LEETCODE_SESSION` value |
| Storing session cookie in `data.json` unencrypted | Readable by other plugins | Acceptable tradeoff on desktop (no alternative), but document clearly; never transmit it anywhere except `leetcode.com` |
| `nodeIntegration: true` in BrowserWindow | Remote code execution if LC page is compromised | Always use `nodeIntegration: false`, `contextIsolation: true` |
| Obfuscated or minified-only bundle | Automatic rejection from plugin store | Provide unminified `main.js` (or source map) in the release |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Login window that doesn't close after success | User confusion, stuck session | Auto-close the window and surface a success notice after cookie is captured |
| No feedback during submission polling (3-10s wait) | User thinks the plugin crashed | Show a "Judging..." notice with a spinner; update it with the verdict |
| Expired session shows generic error | User doesn't know to re-login | Detect auth-expired errors specifically and show "Session expired — click to log in again" |
| Auto-creating notes for every problem browsed | Graph flooded, user didn't ask for this | Only create notes on explicit "Open as note" action |
| LC tags mixed with personal tags in tag pane | Users can't find their own tags | Namespace prefix (`lc/`) on all LC-sourced tags |
| Submitting code that includes Obsidian markdown (headers, bullet points) | Submission fails with syntax error | Strip everything outside the code fence before submitting; warn user if no code fence found |

---

## "Looks Done But Isn't" Checklist

- [ ] **Login flow:** Cookie captured but not persisted to `data.json` — plugin shows logged in until restart, then loses session
- [ ] **Note creation:** File created but no frontmatter written — tags and metadata are missing
- [ ] **Submission:** Solution appended to note but frontmatter not updated with solve date/runtime/memory
- [ ] **Backlinks:** `[[Two Pointers]]` link written to note but the technique note stub not created — link shows as unresolved in graph
- [ ] **Offline mode:** Problem list loads from cache but individual problem content (code stub, description) requires network — offline browsing silently fails
- [ ] **Plugin reload:** Event listeners not cleaned up — second load results in double-firing handlers
- [ ] **ESLint:** Plugin works locally but eslint-plugin-obsidianmd finds "Required" violations — PR bot blocks submission
- [ ] **`isDesktopOnly`:** Missing from `manifest.json` — plugin appears in mobile plugin list and crashes on install
- [ ] **Network disclosure:** README doesn't mention LC network access — store reviewer flags for policy violation
- [ ] **LICENSE file:** Missing or wrong license — automatic rejection

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CORS/fetch failure deployed to users | HIGH | Hotfix release with `requestUrl` adapter; users must update manually |
| Tag namespace missing from shipped notes | HIGH | Requires vault-wide frontmatter migration script; users with existing notes need a one-time migration tool |
| Frontmatter corruption | HIGH | Provide a repair command that re-parses notes using `processFrontMatter()`; damaged YAML may be unrecoverable |
| Plugin store rejection (Required violations) | LOW | Fix ESLint violations, push to branch, bot re-scans within 6 hours; no new PR needed |
| Session cookie persistence bug (lost on restart) | MEDIUM | Hotfix to persist cookie in `data.json` on capture; users must re-login once |
| Graph flooding (notes created for all problems) | MEDIUM | Add a vault cleanup command; cannot undo automatically without risk of deleting user-edited notes |
| LeetCode API schema drift (field removed) | MEDIUM | Update GraphQL query + update `leetcode-query` version; hotfix release |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CORS / `requestUrl` adapter | Phase 1 — API scaffolding | Integration test: `requestUrl`-based fetch to LC returns 200 from within Obsidian |
| ESLint bot violations | Phase 1 — project scaffold | `npm run lint` passes with zero errors before any feature code |
| Session expiry detection | Phase 1 — auth layer | Test: expired session cookie surfaces re-login prompt, not crash |
| CSRF staleness | Phase 2 — run/submit | Test: 403 on mutation triggers csrf refresh and retry |
| `Vault.process()` for note writes | Phase 2 — note creation | Code review: zero uses of `Vault.modify()` on any file the user might have open |
| Electron BrowserWindow security | Phase 1 — login window | Code review: `nodeIntegration: false` and `contextIsolation: true` in BrowserWindow options |
| Cookie extraction timing | Phase 1 — login window | Manual test: login, verify cookie captured correctly on all 3 platforms |
| UI blocking / pagination | Phase 2 — problem list | Manual test: problem list loads without Obsidian freezing |
| Cache eviction | Phase 2 — caching layer | Test: memory usage stable after opening 500 problems |
| Event listener leaks | Phase 1 scaffold | Code review: all event listeners via `registerEvent()` / `registerDomEvent()` |
| Filename collisions / path safety | Phase 2 — note creation | Test: create notes for problems with special characters; test on Windows |
| Frontmatter mangling | Phase 2 — note creation | Test: round-trip frontmatter with colons and quotes in values |
| Submission polling backoff | Phase 3 — run/submit | Test: check endpoint called at most once per second during polling |
| GraphQL schema drift | Phase 1 — API client | All field accesses via optional chaining; data-access layer isolated |
| Graph flooding | Phase 2 — note creation | Manual test: browse 20 problems; verify no notes auto-created |
| Tag namespace | Phase 2 — note schema | Verify first created note has `lc/` prefix on all LC-sourced tags |
| ToS / legal | Phase 1 — design | README includes network disclosure; no bulk problem content storage by default |
| macOS sandbox / BrowserWindow | Phase 1 — login | Manual test: login window opens on macOS, Windows, Linux; cookie-paste fallback works on all |
| `isDesktopOnly` in manifest | Phase 1 scaffold | `manifest.json` has `"isDesktopOnly": true` before first commit |

---

## Sources

- Official Obsidian Developer Policies: `https://publish-01.obsidian.md/access/caa27d6312fe5c26ebc657cc609543be/Developer%20policies.md` (HIGH confidence — official)
- Official Obsidian Plugin Guidelines: `https://publish-01.obsidian.md/access/caa27d6312fe5c26ebc657cc609543be/Plugins/Releasing/Plugin%20guidelines.md` (HIGH confidence — official)
- Official Obsidian Submission Requirements: `https://publish-01.obsidian.md/access/caa27d6312fe5c26ebc657cc609543be/Plugins/Releasing/Submission+requirements+for+plugins.md` (HIGH confidence — official)
- obsidianmd/eslint-plugin README — complete rules list (HIGH confidence — official)
- obsidianmd/obsidian-releases PR review bot comments — real rejection patterns (HIGH confidence — observed)
- leetcode-query source: `credential.ts`, `mutex.ts`, `leetcode.ts`, `graphql/problems.graphql` (HIGH confidence — primary source)
- leetcode-query GitHub issues — 403 errors, CORS errors, null submissions, schema drift (MEDIUM confidence — community reports)
- LeetCode-OpenSource/vscode-leetcode GitHub issues — bug patterns in LC integration (MEDIUM confidence — community reports)
- Electron Cookies API docs — timing and `flushStore()` behavior (HIGH confidence — official)

---
*Pitfalls research for: Obsidian LeetCode community plugin*
*Researched: 2026-05-07*
