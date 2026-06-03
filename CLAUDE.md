<!-- GSD:project-start source:PROJECT.md -->
## Project

**Obsidian LeetCode**

An Obsidian community plugin that fetches LeetCode problems, lets users write and submit solutions without leaving Obsidian, and turns every solved problem into a linked note in their vault. Inspired by vscode-leetcode, but leans into what Obsidian does well: tags, backlinks, and the knowledge graph — so a solving session compounds into a personal, searchable reference library of techniques and patterns.

**Core Value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

### Constraints

- **Platform**: Desktop Obsidian only for v1 (macOS, Windows, Linux) — mobile deferred.
- **Target site**: leetcode.com only for v1 — leetcode.cn deferred.
- **Tech stack**: Obsidian plugin (TypeScript) — follows the official plugin API and community guidelines for store submission.
- **Dependencies**: Prefer a well-maintained existing LeetCode API library (e.g. `leetcode-query` or similar) over hand-rolling GraphQL calls. Selection during research phase.
- **Compatibility**: Must pass the Obsidian community plugin review criteria (no suspicious network calls, CSP-safe, honors user vault, no telemetry by default).
- **Offline**: Previously-fetched problem content must be readable without internet.
- **Security**: Session cookie lives in local plugin data only — never logged, never transmitted anywhere except LC.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^5.8.3` | Plugin language | Obsidian sample-plugin uses it; required for `obsidian.d.ts` types; strict null checks catch runtime errors early |
| obsidian (npm) | `latest` (1.12.3 as of 2026-02-23) | Type definitions + runtime API | Official type package; always pin to `latest` so `minAppVersion` can be set accurately |
| esbuild | `0.25.5` | Bundler | Official sample-plugin bundler; produces CJS output required by Obsidian; 10–100x faster than Rollup for watch mode; `electron` and `obsidian` stay external |
| @codemirror/state | `6.6.0` | CodeMirror peer dep | Obsidian 1.12.x peer-requires this exact major; must stay external in esbuild |
| @codemirror/view | `6.42.1` | CodeMirror peer dep | Same — external in esbuild; accessed via `view.editor.cm as EditorView` at runtime |
### LeetCode API
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@leetnotion/leetcode-api` | `3.0.0` (2026-04-03) | Problem list, problem detail, submissions, user auth | Fork of `leetcode-query` actively maintained in 2026; ESM + CJS dual; covers all read operations needed. **Does NOT cover run/submit — see hand-rolled section below.** |
| Hand-rolled REST for run/submit | — | `interpret_solution`, `submit`, `check` endpoints | No npm library covers these three LC REST endpoints; must be implemented directly using `requestUrl` |
### HTTP Client
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `requestUrl` (Obsidian built-in) | built-in | All HTTP calls to leetcode.com | Bypasses Electron's CORS restrictions that block `fetch` from plugin context; idiomatic for Obsidian plugins; no extra dependency |
### HTML → Markdown
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `turndown` | `7.2.4` (2026-04-03) | Convert LC problem HTML content to Markdown | Actively maintained; handles code blocks, tables, lists; lightweight; tree-shakeable |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eventemitter3` | (transitive via `@leetnotion/leetcode-api`) | Event bus for LC credential refresh | Only needed if extending the API client |
| `@codemirror/language` | per Obsidian peer | Language support for CM6 code blocks | If adding syntax highlighting to solution code blocks in notes |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `esbuild` watch mode (`npm run dev`) | Hot-compile on save | Outputs `main.js` into plugin folder; requires manual Obsidian reload or hot-reload plugin |
| `pjeby/hot-reload` (Obsidian community plugin) | Auto-reload plugin in dev vault without full Obsidian restart | v0.3.0 (2025-08-14); install in dev vault only; not a npm dep |
| `typescript-eslint` + `eslint-plugin-obsidianmd` | Lint for plugin-specific anti-patterns | `eslint-plugin-obsidianmd` 0.1.9 catches `innerHTML` misuse, `workspace.activeLeaf` direct access, etc. |
| `vitest` | `4.1.5` (2026-05-05) | Unit testing for pure logic (API wrappers, markdown conversion, cache, frontmatter helpers) | Use for business logic only — Obsidian plugin lifecycle cannot be unit tested without a live Obsidian instance |
## Installation
# Core (matches obsidian-sample-plugin baseline)
# LeetCode API
# HTML -> Markdown
# Dev dependencies (matches official sample)
## Detailed Decision Rationale
### 1. Obsidian Plugin Baseline
- `"module": "ESNext"` (for esbuild consumption), `"target": "ES6"`
- `"moduleResolution": "node"` (not `bundler` — esbuild handles resolution)
- `"strictNullChecks": true`, `"noImplicitAny": true` — essential for vault/API safety
- `"isolatedModules": true` — matches esbuild's single-file transform model
### 2. LeetCode API Integration
| Operation | `@leetnotion/leetcode-api` | `leetcode-query` | Hand-rolled |
|-----------|--------------------------|------------------|-------------|
| Problems list (with filters) | YES | YES | — |
| Problem detail by slug | YES | YES | — |
| Daily challenge | YES | YES | — |
| User submissions (authenticated) | YES | YES | — |
| Submission detail (code, percentiles) | YES | YES | — |
| User profile | YES | YES | — |
| **Run code** (`interpret_solution`) | NO | NO | **REQUIRED** |
| **Submit code** | NO | NO | **REQUIRED** |
| **Poll submission status** (`check`) | NO | NO | **REQUIRED** |
- `@leetnotion/leetcode-api` is a maintained fork of `leetcode-query` published 2026-04-03 (vs `leetcode-query` 2025-07-11). At 184 downloads/week vs 1,955, it has lower community adoption but is newer and the maintainer actively updates it for breaking LC API changes.
- Both libraries use identical architecture: `Credential` class accepting `LEETCODE_SESSION` cookie + `csrftoken`, `graphql()` base method, optional in-memory TTL cache, rate limiter (20 req/10 s), EventEmitter for CSRF refresh.
- The custom fetcher API (`fetcher.set(...)`) in both libraries lets you swap in `requestUrl` from Obsidian — critical for CORS bypass in the plugin context.
- Neither library wraps the three REST endpoints needed for code execution. These must be hand-rolled.
- `leetcode-cli` / `vsc-leetcode-cli` npm packages — these are CLI tools, not libraries; v2.6.2 last published 2019.
- `leetcode.js` — does not exist on npm.
- Direct `fetch()` in plugin context — blocked by Electron CORS for cross-origin requests to `leetcode.com`. Use `requestUrl` instead.
### 3. Authentication
- `vscode-leetcode`'s `authorize-login/vscode/` endpoint — bespoke LC-VSCode integration that redirects to `vscode://` URI scheme; no equivalent for Obsidian.
- OAuth/PKCE flows — LC does not offer a public OAuth API.
- `@electron/remote` shim — unnecessary in current Electron; adds a dependency for deprecated behavior.
### 4. HTTP Client
- `fetch()` — blocked by Electron's CORS policy for cross-origin requests from plugin renderer context to `leetcode.com`. This is the single most common mistake in new Obsidian plugins that call external APIs.
- `axios` — adds ~14 kB to bundle; same CORS problem as `fetch`; no benefit over `requestUrl`.
- `node-fetch` / `cross-fetch` — also subject to Electron CORS; bundling adds weight.
- `requestUrl` is Obsidian's own HTTP primitive, designed specifically to bypass Electron's CORS restrictions for plugin use. It is synchronous-API-compatible (returns a typed `RequestUrlResponse`) and handles both JSON and binary responses.
### 5. Offline Cache
- **Plugin settings + session credentials:** `this.loadData()` / `this.saveData()` — stored in `.obsidian/plugins/obsidian-leetcode/data.json`. Use for: auth tokens, user preferences, problem metadata index (slug→id mapping), cached problem HTML/content, solved status.
- **Problem notes:** Markdown files in a user-configured vault folder (e.g., `LeetCode/problems/`). Created/updated via `app.vault.create()` and `app.vault.modify()`. These are first-class vault citizens — searchable, linkable, offline-readable.
- **Do NOT use:** Separate files under `.obsidian/plugins/` for content that users should read — they are hidden from the vault UI.
- Problem content (HTML, metadata): Cache in `data.json` with a `cachedAt` timestamp. Re-fetch if older than 7 days or on explicit user refresh command.
- Problem list index (slug→title, difficulty, topics): Refresh on plugin load if older than 24 hours.
- Submission status: Never cache — always live poll.
- Session cookie: Store indefinitely; invalidate on 401/403 response and prompt re-login.
### 6. Markdown Rendering
- `innerHTML` for LC HTML — explicitly forbidden by the Obsidian plugin guidelines; XSS risk.
- `marked` / `remark` — wrong direction (Markdown → HTML); LC sends HTML that needs to go to Markdown.
- `rehype` pipeline — correct direction but heavier; `turndown` is sufficient for LC's HTML subset.
### 7. Code Editor Inside Notes
## Problem
## Solution
# Write your solution here
## Notes
- Obsidian's editor IS CodeMirror 6. The note's code block already has CM6 syntax highlighting via the `@codemirror/language` infrastructure.
- Building a separate editor pane duplicates Obsidian's editor, fights the UX model, and adds significant complexity.
- Access to CM6 `EditorView` from a plugin is possible (`view.editor.cm as EditorView`) but is undocumented/internal.
### 8. Community Plugin Store Requirements
| Requirement | Detail |
|-------------|--------|
| `manifest.json` valid | `id`, `name`, `author`, `description` (≤250 chars, ends with `.`), `version` (semver), `minAppVersion`, `isDesktopOnly: true` |
| `README.md` | Describes purpose, usage, screenshots; must explain network use (LeetCode API) |
| `LICENSE` file | Must be present |
| GitHub release | Tag must match `manifest.json` version; `main.js` + `manifest.json` attached as release assets |
| `community-plugins.json` PR | Add entry to `obsidianmd/obsidian-releases` with matching `id`, `name`, `author`, `description`, `repo` |
| No telemetry | No client-side analytics, tracking pixels, or data collection without explicit disclosure |
| No remote code eval | No `eval()`, `new Function()`, or dynamic `<script>` injection |
| No `innerHTML` with user data | Use `createEl()` / DOM API instead |
| No obfuscated code | Source must be readable |
| No auto-update mechanism | Obsidian handles plugin updates via GitHub releases |
| Network use disclosed | README must state: "This plugin communicates with leetcode.com to fetch problems and submit solutions." |
| No "obsidian" in plugin ID | Plugin ID cannot contain the word "obsidian" |
| No default hotkeys | Do not set default keyboard shortcuts for commands |
| Electron/Node APIs require `isDesktopOnly: true` | BrowserWindow usage mandates this flag |
| Resource cleanup | All event listeners registered via `registerEvent()`; custom views cleanup on `onClose()` |
| Use `this.app` not global `app` | Access app via plugin instance, not global |
### 9. Knowledge Graph Integration
## Alternatives Considered
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@leetnotion/leetcode-api` + hand-rolled REST | Pure hand-rolled GraphQL | Hand-rolling all queries is viable but adds 200–400 lines of boilerplate for operations the library covers well (problems, submissions, user profile) |
| `@leetnotion/leetcode-api` + hand-rolled REST | `leetcode-query` alone | `leetcode-query` also lacks run/submit; `@leetnotion/leetcode-api` is more recently maintained (April 2026 vs July 2025) |
| `requestUrl` (Obsidian built-in) | `axios` | Same CORS issue as `fetch`; adds bundle weight; no advantage in plugin context |
| `requestUrl` (Obsidian built-in) | `node-fetch` | Electron CORS applies to Node's `fetch` equivalent from renderer too; not idiomatic |
| `esbuild` | `rollup` | Both work; esbuild is faster and is the official sample-plugin default since 2022 |
| `turndown` | `rehype-remark` (unified) | Correct direction but heavier; `turndown` is 7 kB gzipped and handles all LC HTML patterns |
| Note's native code block | Custom CodeMirror editor pane | Enormous complexity; fights Obsidian's UX; CM6 is already there via note editor |
| `vitest` for unit tests | `jest` + `ts-jest` | Both work; vitest is faster, natively ESM, and doesn't require `ts-jest` config ceremony |
| Electron `require('electron').BrowserWindow` | `@electron/remote` | `remote` module is deprecated; direct `require('electron')` works in Obsidian's Electron host |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `fetch()` / `axios` for LC API calls | Blocked by Electron CORS in plugin renderer context; silent network failures | `requestUrl` from `obsidian` |
| `innerHTML` with LC HTML content | Flagged by `eslint-plugin-obsidianmd`; XSS risk; will fail plugin review | `turndown` to convert to Markdown; `createEl()` for UI elements |
| `@electron/remote` | Deprecated Electron API; requires extra shim package; older plugins used it, new ones should not | `require('electron')` directly — Electron is external, provided by Obsidian host |
| `eval()` or `new Function()` | Forbidden by Obsidian developer policies; causes immediate rejection from store | Build logic at compile time |
| Global `app` object | Considered a debugging API; may be removed; flagged in plugin review | `this.app` from `Plugin` instance |
| Pre-warming the full problem cache | 3,000+ problems × ~10–50 kB HTML = 30–150 MB; destroys `data.json` usability | Fetch on demand; index only (slug, id, title, difficulty, tags) |
| `workspace.activeLeaf` direct access | Deprecated pattern; flagged in plugin review | `app.workspace.getActiveViewOfType(MarkdownView)` |
| Bundling `obsidian` or `@codemirror/*` | They are runtime-provided by Obsidian; bundling them causes version conflicts and bloat | Mark as `external` in esbuild config (already done by sample-plugin) |
| `rollup` bundler | Not wrong, but not the official baseline; switching adds friction if contributors expect sample-plugin conventions | `esbuild` |
## Stack Patterns by Variant
- Use `ItemView` + DOM helpers (`createEl`, `createDiv`)
- No React, no Svelte — keeps bundle under 50 kB
- Register via `this.registerView(VIEW_TYPE, leaf => new ProblemBrowserView(leaf))`
- Use `PluginSettingTab` + `Setting` API
- Fields: login button, default language (dropdown), problems folder path, clear cache
- Use `setInterval` / `clearInterval` via `this.registerInterval()` so it auto-cleans on plugin unload
- Poll `check/` every 2 s; abort after 30 s (LC judge timeout)
- Use `app.fileManager.processFrontMatter()` — atomic, handles YAML parse errors
- Do NOT use `Vault.modify()` on active file — loses cursor position
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `obsidian@1.12.3` | `@codemirror/state@6.5.0`, `@codemirror/view@6.38.6` | Peer deps declared in `obsidian` npm package; mark both as external in esbuild |
| `esbuild@0.25.5` | `typescript@^5.8.3` | No direct dep; esbuild transpiles TS independently |
| `@leetnotion/leetcode-api@3.0.0` | Node ESM + browser fetch | Uses ESM; esbuild handles bundling; swap fetcher for `requestUrl` |
| `turndown@7.2.4` | Browser + Node | CJS/ESM dual; no peer deps |
| `vitest@4.1.5` | `typescript@^5.8.3` | Dev-only; not bundled into plugin |
## Sources
- `obsidianmd/obsidian-sample-plugin` — esbuild config, tsconfig, package.json (fetched 2026-05-07, confirmed current)
- `obsidianmd/obsidian-api` obsidian.d.ts — API surface, `requestUrl`, `MarkdownRenderer`, `FileManager.processFrontMatter` (fetched 2026-05-07)
- `obsidianmd/obsidian-developer-docs` via Context7 `/obsidianmd/obsidian-developer-docs` — `RequestUrlParam`, `Plugin.loadData/saveData`, `ItemView`, `processFrontMatter`, submission requirements (HIGH confidence)
- `obsidianmd/obsidian-releases` plugin-review.md + Developer policies raw GitHub — security requirements, no telemetry, no innerHTML, isDesktopOnly, manifest requirements (fetched 2026-05-07)
- `skygragon/leetcode-cli` lib/config.js — LC REST endpoints for interpret_solution, submit, check (MEDIUM confidence — this tool is old but endpoints are stable; corroborated by community usage)
- `codewithsathya/leetcode-api` README + source tree — API coverage matrix, custom fetcher API (fetched 2026-05-07, HIGH confidence)
- `JacobLinCool/LeetCode-Query` base-leetcode.ts — GraphQL architecture, credential model (fetched 2026-05-07)
- `hadynz/obsidian-kindle-plugin` — Electron BrowserWindow pattern (MEDIUM confidence — uses deprecated `remote` API; updated to direct `require('electron')` recommendation)
- npm registry — version/publish dates for all packages (verified 2026-05-07)
- npm download API — `leetcode-query` 1,955/week, `@leetnotion/leetcode-api` 184/week (verified 2026-05-07)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

**v1.3 inline-widget architecture (post-Phase-22).**

The plugin's editing model is a single `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` + `registerEditorExtension(leetCodeFenceViewPlugin)` pair (Reading mode + Live Preview, both calling `mountLeetCodeWidget`). The widget owns its own embedded CM6 `EditorView`; widget edits flow through `app.vault.process(file, fn)` — the only mutation primitive in the plugin. `lc-language` frontmatter is the single source of truth for Run / Submit / AI dispatch (read via `extractFirstFencedBlock(noteBody, frontmatter)` in `src/solve/codeExtractor.ts`).

`src/main/sectionProtectionExtension.ts` (narrow scope: `## Problem` body + `## Techniques` heading) is the only protection extension. Section locking on the fence opener / closer is moot — the widget owns the fence range via `EditorView.atomicRanges`, so the parent doc's cursor cannot enter the fence at all.

Migration infrastructure (`src/widget/fenceMigrator.ts`, `src/widget/legacyFenceBanner.ts`, `src/widget/migrationBackupGc.ts`, `autoMigrateOnOpen` setting) stays in tree indefinitely so users upgrading 1.2.x → 1.3.x late still get lazy single-fence migration. Backups land at `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/` with 30-day retention; the GC runs on plugin load.

`src/widget/widgetRegistry.ts` is a thin `Map<key, EditorView>` keyed by `${file.path}::${fenceIdentity}` — replaces v1.2's `childEditorRegistry`. Self-write echo suppression uses a per-path content-hash map with 2-second TTL (NOT a boolean flag). External edits arriving during local in-flight typing surface a conflict modal (`Keep mine / Keep external / View diff`).
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
