# Phase 1: Plugin Foundation - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a runnable Obsidian plugin that (a) installs on desktop Obsidian 1.5+ without crashes, (b) logs the user into leetcode.com via an embedded BrowserWindow or cookie-paste fallback, (c) exposes a sidebar problem-browser with search and filters backed by a cached problem index, and (d) routes every LC call through `requestUrl` behind a rate-limited fetcher. Passes `eslint-plugin-obsidianmd` with zero Required violations. Covers 16 requirements: FND-01..05, AUTH-01..06, BROWSE-01..05.

Everything beyond "list + open problem" (note creation, run/submit, backlinks, polish) is deferred to Phases 2-5.

</domain>

<decisions>
## Implementation Decisions

### Source Layout
- **D-01:** `src/` uses a **feature-first** layout. Each feature folder owns its view + service + local types. Phases 2-5 add sibling folders (e.g., `notes/`, `solve/`, `graph/`) without reorg.
  ```
  src/
    main.ts
    auth/       AuthService.ts, BrowserWindowLogin.ts, CookiePasteModal.ts, types.ts
    browse/     ProblemBrowserView.ts, ProblemListService.ts, types.ts
    api/        LeetCodeClient.ts, requestUrlFetcher.ts, throttle.ts
    settings/   SettingsTab.ts, SettingsStore.ts
    shared/     logger.ts, errors.ts
  ```
- **D-02:** All Electron imports (`require('electron').BrowserWindow`) are confined to `src/auth/BrowserWindowLogin.ts` — enforced by `eslint-plugin-obsidianmd`'s platform rules and a repo-level grep gate in Phase 5.

### BrowserWindow Login UX
- **D-03:** Login success is detected via **cookie-poll on `did-navigate`**. On each navigation event inside the embedded window, read the session partition's cookie jar for `.leetcode.com`; when both `LEETCODE_SESSION` and `csrftoken` are present, persist both, close the window, and fire success. Canonical shape:
  ```ts
  win.webContents.on('did-navigate', async () => {
    const cookies = await win.webContents.session.cookies.get({ domain: '.leetcode.com' });
    const lcSession = cookies.find(c => c.name === 'LEETCODE_SESSION');
    const csrf      = cookies.find(c => c.name === 'csrftoken');
    if (lcSession && csrf) { onSuccess({ LEETCODE_SESSION: lcSession.value, csrftoken: csrf.value }); win.close(); }
  });
  ```
- **D-04:** Window-closed without cookies = **silent cancel**. Show exactly one Obsidian `Notice`: "LeetCode login cancelled." Auth state unchanged. No modal stacking, no auto-pivot to the paste fallback. User re-triggers from settings tab or command palette.
- **D-05:** The cookie-paste fallback is **first-class**, not nested under "advanced". It lives in the settings tab alongside the embedded-login button (see D-09).

### Problem Browser
- **D-06:** Browser is a **right-sidebar `ItemView`** (not a main-pane tab, not a modal). Persistent surface; opening a problem routes to the main pane while the browser stays docked. Mirrors File Explorer / Outline ergonomics.
- **D-07:** Problem list uses **index-once + paged render**. On first load, fetch a slim index (`id`, `slug`, `title`, `diff`, `paid`) across paged `problems({ limit: 50, skip })` calls and persist in `data.json` with a 24h TTL. Background-refresh on plugin load if stale. Virtualized row render (only visible rows mount). Per-problem detail fetched on click (handled in Phase 2).
  ```ts
  // data.json shape
  {
    problemIndex: {
      fetchedAt: 1730000000000,
      problems: [ { id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }, ... ]
    }
  }
  // ~250 KB for 3,300 problems — within data.json comfort zone
  ```
- **D-08:** Search is in-memory against the cached index (instant). Filters are difficulty (Easy/Medium/Hard) and status (solved/attempted/untouched) — status derived from authenticated user-profile query cached with shorter TTL (≤1h) in Phase 1's scope.

### Settings (Phase 1 scope only)
- **D-09:** Settings tab is **minimal-to-function**: only controls required to use Phase 1. Layout:
  ```
  Authentication
    Status: Logged in as <username> / Not logged in
    [ Log in via embedded window ]     [ Logout ]
    Manual cookie (fallback)
      LEETCODE_SESSION: _______________
      csrftoken:        _______________
      [ Save cookies ]

  Notes
    Problems folder:   [ LeetCode/         ]   (default)
    Default language:  [ Python      v ]       (dropdown of LC-supported languages)
  ```
- **D-10:** Default `problems folder` value is `LeetCode/`. Default language is **Python**. (Author is primary user; Java/Python are primary solving languages per PROJECT.md, and Python is the more common LC teaching default. Changing the default is one click.)
- **D-11:** **Deferred to Phase 4:** Technique folder, auto-backlink toggle. **Deferred to Phase 5:** Error-handling copy polish, network-disclosure copy in settings.

### Rate Limit & Throttle UX
- **D-12:** Throttle lives in `src/api/throttle.ts` and is **wired inside `requestUrlFetcher`** — the fetcher passed into `@leetnotion/leetcode-api` via `fetcher.set(...)`. Token bucket (20 tokens, refill 20/10s) + concurrency limit (max 2). Every LC call goes through it by construction; no view can bypass.
  ```
  TokenBucket(capacity: 20, refill: 20 per 10_000 ms)
  ConcurrencyLimit(2)

  requestUrlFetcher(req):
    await bucket.take()
    return limiter.run(() => requestUrl(req))
  ```
- **D-13:** Throttle UX is **silent queue**. No `Notice`, no modal. If queue depth > 0 for longer than 2 seconds, the browser view footer shows `⋯ Fetching from LeetCode…`; it disappears when the queue drains. Routine throttling stays invisible.
- **D-14:** 429s from LC (if ever received despite the ceiling) surface a one-shot `Notice`: "LeetCode rate-limited — slowing down." Retry-after honored by the fetcher. Full 429-handling polish lives in POLISH-02 (Phase 5).

### Carried Forward from PROJECT.md / STATE.md (not re-asked)
- **CF-01:** `requestUrl` adapter is wired **before** any LC call; `fetch`/`axios` are CORS-blocked and permanently forbidden in the plugin context.
- **CF-02:** `manifest.json` declares `"isDesktopOnly": true` before first commit.
- **CF-03:** Session cookie + CSRF live only in `data.json`; never logged, never sent off leetcode.com.
- **CF-04:** Session-expiry detection via GraphQL `response.errors` check; prompt re-auth via a `Notice` with a "Log in" button.
- **CF-05:** `eslint-plugin-obsidianmd` Required rules must be zero-violation at phase completion.
- **CF-06:** Electron imports live only in `src/auth/BrowserWindowLogin.ts`.
- **CF-07:** Rate ceiling is 20 req / 10 s with max 2 concurrent (BROWSE-05).

### Claude's Discretion
- Exact token-bucket implementation (custom 40-line class vs a tiny dep like `limiter`). Prefer hand-rolled in `shared/` to avoid a dep for something this small, but planner/researcher can revisit if a well-maintained dep is nil-overhead.
- Virtualized list rendering mechanism (hand-rolled IntersectionObserver-based vs a tiny lib). Prefer hand-rolled to keep bundle small.
- CSS approach for the sidebar view (scoped `.leetcode-browser` class + plain CSS in `styles.css` vs CSS modules). Default: plain class-scoped CSS per Obsidian plugin conventions.
- Precise shape of `data.json` persisted structure (nested vs flat); either is fine provided a migration guard on version mismatch.
- Whether the ribbon icon is the activating surface or if a command-palette entry is primary; both must exist per BROWSE-01.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — Core value, constraints, key decisions (auth strategy, desktop-only, `requestUrl`-only)
- `.planning/REQUIREMENTS.md` §v1 Foundation / Authentication / Problem Browsing — FND-01..05, AUTH-01..06, BROWSE-01..05
- `.planning/ROADMAP.md` §Phase 1 — Goal, success criteria, requirement mapping
- `.planning/STATE.md` §Accumulated Context — Decisions already locked for Phase 1 (CF-01..07 above)

### Tech stack (locked in CLAUDE.md)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Technology Stack — TypeScript 5.8.3, esbuild 0.25.5, `@leetnotion/leetcode-api` 3.0.0, `turndown` 7.2.4, `vitest` 4.1.5, peer CM6 externals
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Installation / Decision Rationale — Why `requestUrl` (CORS), why `@leetnotion/leetcode-api` (fork w/ custom fetcher API), what to mark external in esbuild

### Obsidian & LC docs (researcher should fetch and verify)
- `obsidianmd/obsidian-sample-plugin` — baseline `esbuild.config.mjs`, `tsconfig.json`, `manifest.json`, `package.json`
- `obsidianmd/obsidian-api` — `requestUrl`, `ItemView`, `Plugin.loadData/saveData`, `PluginSettingTab`, `Setting`, `Notice`
- `obsidianmd/obsidian-developer-docs` — Community plugin review criteria, `isDesktopOnly` semantics
- `@leetnotion/leetcode-api` README + source — `Credential`, `fetcher.set()`, GraphQL error shape for session-expiry detection

### What to avoid (from CLAUDE.md §What NOT to Use)
- `fetch()` / `axios` for any LC call — CORS-blocked in Electron renderer
- `innerHTML` anywhere — plugin-review blocker (relevant from Phase 2, but `createEl()` discipline starts Phase 1)
- `@electron/remote` — deprecated; use `require('electron')` directly
- Global `app` — use `this.app` from the `Plugin` instance
- Bundling `obsidian` or `@codemirror/*` — must be `external` in esbuild
- Pre-warming full problem cache — violates BROWSE-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
Greenfield — no existing code. All modules created in this phase become the "existing" assets for Phases 2-5.

### Established Patterns
To be established in Phase 1 and carried forward:
- Feature-first folder layout (D-01) — Phase 2 adds `src/notes/`, Phase 3 adds `src/solve/`, Phase 4 adds `src/graph/`
- All LC calls through `api/throttle.ts → requestUrlFetcher → @leetnotion/leetcode-api` — no direct HTTP in feature code
- `data.json` writes via `Plugin.loadData()` / `saveData()` only, through `SettingsStore` / future `CacheStore` wrappers
- `createEl()` for all DOM — never `innerHTML`

### Integration Points
- `main.ts` wires: settings load → auth service → API client (with fetcher injected) → register `ProblemBrowserView` → register settings tab → register ribbon + command-palette entries
- Phase 2 will hook into `ProblemBrowserView`'s row-click handler (currently a stub opening a Notice with the slug) to fetch and render the problem note
- Phase 3 will add a `submit/run` surface that reuses the same `api/throttle.ts` queue

</code_context>

<specifics>
## Specific Ideas

- vscode-leetcode is the **feature benchmark**, but not the UX benchmark. Replicate submit/run/tag *capabilities*; the UX is Obsidian-native (sidebar, note-first, graph-first).
- The embedded-login partition must be separate from any other `BrowserWindow` usage so cookies don't leak across contexts. Use a named Electron `session` partition (e.g., `persist:leetcode`).
- "Notes folder" default is `LeetCode/` (trailing slash omitted in stored value; UI shows it for clarity).
- Author dogfoods first. Phase 1 is complete when the author can log in, browse problems, search, filter, and the sidebar feels snappy on a 3,300-row list.

</specifics>

<deferred>
## Deferred Ideas

None emerged during discussion — stayed within Phase 1 scope.

Standing deferrals (already in PROJECT.md / REQUIREMENTS.md):
- Technique folder setting + auto-backlink toggle → Phase 4
- Error-copy polish + network-disclosure text → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI enhancements → v2

</deferred>

---

*Phase: 1-plugin-foundation*
*Context gathered: 2026-05-07*
