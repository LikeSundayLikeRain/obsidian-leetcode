# Stack Research

**Domain:** Obsidian community plugin — LeetCode integration (desktop, Electron-based)
**Researched:** 2026-05-07
**Confidence:** HIGH (all major choices verified against official docs, npm registry, and primary source code)

---

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

---

## Installation

```bash
# Core (matches obsidian-sample-plugin baseline)
npm install obsidian@latest

# LeetCode API
npm install @leetnotion/leetcode-api

# HTML -> Markdown
npm install turndown
npm install --save-dev @types/turndown

# Dev dependencies (matches official sample)
npm install -D typescript@^5.8.3 esbuild@0.25.5 tslib@2.4.0
npm install -D @types/node@^16.11.6
npm install -D typescript-eslint@8.35.1 eslint-plugin-obsidianmd@0.1.9 @eslint/js@9.30.1 globals@14.0.0 jiti@2.6.1
npm install -D vitest
```

---

## Detailed Decision Rationale

### 1. Obsidian Plugin Baseline

**Template:** `obsidian-sample-plugin` (official). Clone it directly — it ships the correct `manifest.json` shape, `esbuild.config.mjs`, `tsconfig.json`, `version-bump.mjs`, and `versions.json`.

**Bundler: esbuild (not Rollup, not webpack)**
esbuild is the official sample-plugin choice. The config marks `obsidian`, `electron`, all `@codemirror/*` packages, and Node builtins as `external` — they are provided by the Obsidian runtime and must NOT be bundled. Output format is `cjs` (CommonJS), which Obsidian's plugin loader requires. The `target: "es2018"` matches Obsidian's Electron JS engine.

**TypeScript config key settings:**
- `"module": "ESNext"` (for esbuild consumption), `"target": "ES6"`
- `"moduleResolution": "node"` (not `bundler` — esbuild handles resolution)
- `"strictNullChecks": true`, `"noImplicitAny": true` — essential for vault/API safety
- `"isolatedModules": true` — matches esbuild's single-file transform model

**manifest.json required fields:**
```json
{
  "id": "obsidian-leetcode",
  "name": "LeetCode",
  "author": "...",
  "description": "...",
  "version": "0.1.0",
  "minAppVersion": "1.2.0",
  "isDesktopOnly": true
}
```
`isDesktopOnly: true` is **mandatory** — this plugin uses `electron` (BrowserWindow for login) and Node.js APIs (`fs`/path for file caching). The Obsidian reviewer will flag its absence.

**Hot-reload dev workflow:**
1. Symlink or copy the plugin folder into a dev vault's `.obsidian/plugins/obsidian-leetcode/`.
2. Install the community plugin `pjeby/hot-reload` in the dev vault.
3. Run `npm run dev` (esbuild watch). Changes trigger auto-reload via hot-reload plugin.

**Testing framework: vitest (not jest)**
Jest + `ts-jest` works (obsidian-dataview uses it) but vitest is faster, natively ESM-compatible, and has identical API surface. Neither framework can test Obsidian plugin lifecycle (no JSDOM for Obsidian's workspace). Test pure functions only: LC API wrappers, markdown conversion, cache logic, frontmatter helpers, polling logic.

---

### 2. LeetCode API Integration

**Winner: `@leetnotion/leetcode-api` v3.0.0 for read operations + hand-rolled REST for run/submit**

**Coverage matrix:**

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

`@leetnotion/leetcode-api` vs `leetcode-query`:
- `@leetnotion/leetcode-api` is a maintained fork of `leetcode-query` published 2026-04-03 (vs `leetcode-query` 2025-07-11). At 184 downloads/week vs 1,955, it has lower community adoption but is newer and the maintainer actively updates it for breaking LC API changes.
- Both libraries use identical architecture: `Credential` class accepting `LEETCODE_SESSION` cookie + `csrftoken`, `graphql()` base method, optional in-memory TTL cache, rate limiter (20 req/10 s), EventEmitter for CSRF refresh.
- The custom fetcher API (`fetcher.set(...)`) in both libraries lets you swap in `requestUrl` from Obsidian — critical for CORS bypass in the plugin context.
- Neither library wraps the three REST endpoints needed for code execution. These must be hand-rolled.

**Hand-rolled run/submit endpoints (verified from vsc-leetcode-cli source):**
```
POST https://leetcode.com/problems/{slug}/interpret_solution/   → returns { interpret_id, interpret_expected_id }
POST https://leetcode.com/problems/{slug}/submit/               → returns { submission_id }
GET  https://leetcode.com/submissions/detail/{id}/check/        → poll until state != "STARTED"
```

Request body for run/submit:
```json
{
  "lang": "python3",
  "question_id": 1,
  "test_mode": false,
  "typed_code": "class Solution:\n    ..."
}
```
All three require session cookie + `x-csrftoken` header. Poll `check/` every ~2 s until `state` is `"SUCCESS"` or `"FAILURE"`.

**What NOT to use:**
- `leetcode-cli` / `vsc-leetcode-cli` npm packages — these are CLI tools, not libraries; v2.6.2 last published 2019.
- `leetcode.js` — does not exist on npm.
- Direct `fetch()` in plugin context — blocked by Electron CORS for cross-origin requests to `leetcode.com`. Use `requestUrl` instead.

---

### 3. Authentication

**Primary: Embedded Electron BrowserWindow (desktop-only)**
**Fallback: Cookie paste (Settings UI text field)**

Obsidian plugins can access Electron's APIs at runtime via `require('electron')` because `electron` is listed as `external` in esbuild — it's provided by the Obsidian host process. Access pattern:

```typescript
// In plugin code — electron is external, resolved at runtime by Obsidian
const { BrowserWindow } = require('electron') as typeof import('electron');

const win = new BrowserWindow({
  width: 480,
  height: 700,
  webPreferences: {
    partition: 'persist:lc-session',  // isolated session, not shared with Obsidian
    nodeIntegration: false,
    contextIsolation: true,
  },
  show: false,
});

win.once('ready-to-show', () => win.show());

win.webContents.on('did-navigate', (_event, url) => {
  if (url.startsWith('https://leetcode.com/') && !url.includes('/accounts/login/')) {
    // Logged in — extract cookies
    win.webContents.session.cookies
      .get({ domain: '.leetcode.com' })
      .then(cookies => {
        const session = cookies.find(c => c.name === 'LEETCODE_SESSION')?.value;
        const csrf   = cookies.find(c => c.name === 'csrftoken')?.value;
        // store in plugin data.json
        win.close();
      });
  }
});

win.loadURL('https://leetcode.com/accounts/login/');
```

The `remote` module approach (used by older plugins like `obsidian-kindle-plugin`) is **deprecated** — `remote` was removed from Electron and requires `@electron/remote` shim. Use `require('electron')` directly with `BrowserWindow` from the main process API, which Obsidian exposes to renderer plugins.

**Cookie-paste fallback:** A settings tab text field for `LEETCODE_SESSION` cookie value. Users copy it from browser DevTools → Application → Cookies. This is the only path that works if LC ever restricts the embedded browser flow.

**What to store:** Only `LEETCODE_SESSION` + `csrftoken` in `data.json`. Never log, never transmit to any endpoint except `leetcode.com`. This satisfies both the developer policy (no telemetry) and the disclosure requirement (network use limited to LC).

**What NOT to use:**
- `vscode-leetcode`'s `authorize-login/vscode/` endpoint — bespoke LC-VSCode integration that redirects to `vscode://` URI scheme; no equivalent for Obsidian.
- OAuth/PKCE flows — LC does not offer a public OAuth API.
- `@electron/remote` shim — unnecessary in current Electron; adds a dependency for deprecated behavior.

---

### 4. HTTP Client

**Winner: Obsidian's built-in `requestUrl`**

```typescript
import { requestUrl } from 'obsidian';

const response = await requestUrl({
  url: 'https://leetcode.com/graphql',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'cookie': `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
    'x-csrftoken': csrf,
    'origin': 'https://leetcode.com',
    'referer': 'https://leetcode.com',
  },
  body: JSON.stringify({ query, variables }),
  throw: false,  // handle non-2xx manually for graceful error UX
});
```

**Why `requestUrl` over alternatives:**
- `fetch()` — blocked by Electron's CORS policy for cross-origin requests from plugin renderer context to `leetcode.com`. This is the single most common mistake in new Obsidian plugins that call external APIs.
- `axios` — adds ~14 kB to bundle; same CORS problem as `fetch`; no benefit over `requestUrl`.
- `node-fetch` / `cross-fetch` — also subject to Electron CORS; bundling adds weight.
- `requestUrl` is Obsidian's own HTTP primitive, designed specifically to bypass Electron's CORS restrictions for plugin use. It is synchronous-API-compatible (returns a typed `RequestUrlResponse`) and handles both JSON and binary responses.

**Integrating with `@leetnotion/leetcode-api`:** Override the library's fetcher to use `requestUrl`:

```typescript
import { fetcher } from '@leetnotion/leetcode-api';
import { requestUrl } from 'obsidian';

fetcher.set(async (url, init) => {
  const res = await requestUrl({
    url: String(url),
    method: (init?.method as string) || 'GET',
    headers: init?.headers as Record<string, string>,
    body: init?.body as string,
    throw: false,
  });
  return new Response(res.text, {
    status: res.status,
    headers: res.headers,
  });
});
```

---

### 5. Offline Cache

**Where data lives:**
- **Plugin settings + session credentials:** `this.loadData()` / `this.saveData()` — stored in `.obsidian/plugins/obsidian-leetcode/data.json`. Use for: auth tokens, user preferences, problem metadata index (slug→id mapping), cached problem HTML/content, solved status.
- **Problem notes:** Markdown files in a user-configured vault folder (e.g., `LeetCode/problems/`). Created/updated via `app.vault.create()` and `app.vault.modify()`. These are first-class vault citizens — searchable, linkable, offline-readable.
- **Do NOT use:** Separate files under `.obsidian/plugins/` for content that users should read — they are hidden from the vault UI.

**Cache invalidation strategy:**
- Problem content (HTML, metadata): Cache in `data.json` with a `cachedAt` timestamp. Re-fetch if older than 7 days or on explicit user refresh command.
- Problem list index (slug→title, difficulty, topics): Refresh on plugin load if older than 24 hours.
- Submission status: Never cache — always live poll.
- Session cookie: Store indefinitely; invalidate on 401/403 response and prompt re-login.

**`data.json` structure sketch:**
```typescript
interface PluginData {
  auth: { session: string; csrf: string } | null;
  settings: { language: string; problemsFolder: string };
  problemCache: Record<string, { content: string; cachedAt: number; metadata: ProblemMeta }>;
  problemIndex: { slugToId: Record<string, number>; updatedAt: number } | null;
}
```

**Size concern:** LC has ~3,000 problems. Full content cache would be large (~30–100 MB). Cache only viewed problems on-demand; do not pre-warm all 3,000.

---

### 6. Markdown Rendering

**Strategy: Convert LC HTML to Markdown at cache time, store in note**

LeetCode problem `content` is returned as HTML. Convert it once on fetch using `turndown`, store the Markdown in the note. Do not attempt to render HTML directly in the note.

```typescript
import TurndownService from 'turndown';

const td = new TurndownService({
  codeBlockStyle: 'fenced',
  fence: '```',
});

// Preserve <pre><code> blocks as fenced code blocks
td.addRule('codeBlock', {
  filter: ['pre'],
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector('code');
    const lang = code?.className.match(/language-(\w+)/)?.[1] ?? '';
    return `\`\`\`${lang}\n${code?.textContent ?? ''}\n\`\`\`\n`;
  },
});

const markdown = td.turndown(html);
```

**For rendering existing Markdown within a custom view** (e.g., a problem browser pane), use Obsidian's `MarkdownRenderer.render()`:
```typescript
import { MarkdownRenderer } from 'obsidian';
await MarkdownRenderer.render(app, markdownContent, containerEl, sourcePath, component);
```

**What NOT to use:**
- `innerHTML` for LC HTML — explicitly forbidden by the Obsidian plugin guidelines; XSS risk.
- `marked` / `remark` — wrong direction (Markdown → HTML); LC sends HTML that needs to go to Markdown.
- `rehype` pipeline — correct direction but heavier; `turndown` is sufficient for LC's HTML subset.

---

### 7. Code Editor Inside Notes

**Recommendation: Use the note's native code block — do not embed a separate editor**

The problem note contains a fenced code block for the solution. Users write code directly in Obsidian's standard editor. This is the correct Obsidian-native pattern.

For the problem note template:
```markdown
---
title: "Two Sum"
difficulty: Easy
topics: [Array, Hash Table]
status: unsolved
---

## Problem

{problem content as markdown}

## Solution

```python
# Write your solution here
```

## Notes

```

**Why not a custom CodeMirror editor pane:**
- Obsidian's editor IS CodeMirror 6. The note's code block already has CM6 syntax highlighting via the `@codemirror/language` infrastructure.
- Building a separate editor pane duplicates Obsidian's editor, fights the UX model, and adds significant complexity.
- Access to CM6 `EditorView` from a plugin is possible (`view.editor.cm as EditorView`) but is undocumented/internal.

**For the problem browser sidebar** (listing problems, showing metadata): use `ItemView` with standard Obsidian DOM helpers (`createEl`, `createDiv`). No React, no custom framework — keeps bundle small and avoids conflicts with Obsidian's own DOM management.

---

### 8. Community Plugin Store Requirements

**Mandatory checklist for submission:**

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

**CSP:** Obsidian does not use a restrictive Content Security Policy in the plugin sandbox — inline scripts and styles work — but `innerHTML` with untrusted content is still a security anti-pattern flagged during review.

---

### 9. Knowledge Graph Integration

**Wikilinks:** Write `[[Two Pointers]]` literally into note Markdown content. Obsidian's metadata cache automatically indexes all `[[...]]` links — no API call needed. Just write the Markdown file with wikilinks and the graph updates on next vault scan.

```typescript
// Generate backlinks section programmatically
const techniqueLinks = topics.map(t => `[[${t}]]`).join(', ');
const content = `...\n\n## Techniques\n\n${techniqueLinks}\n`;
await app.vault.modify(file, content);
```

**Frontmatter / Tags:** Use `app.fileManager.processFrontMatter()` for atomic frontmatter updates (avoids race conditions with concurrent saves):

```typescript
await app.fileManager.processFrontMatter(file, (fm) => {
  fm['title'] = problem.title;
  fm['difficulty'] = problem.difficulty;
  fm['tags'] = problem.topicTags.map(t => t.slug);
  fm['status'] = 'solved';
  fm['solved-date'] = new Date().toISOString().split('T')[0];
  fm['language'] = lang;
  fm['runtime'] = `${runtime}ms`;
  fm['memory'] = `${memory}MB`;
});
```

Frontmatter tags (YAML list) are picked up by Obsidian's tag pane automatically. For user-added personal tags like `#revisit`, they can edit the note normally — no plugin intervention needed.

**Backlinks:** Backlinks to `[[Two Pointers]]`, `[[Binary Search]]`, etc. are created by writing the wikilink to the note file. Obsidian resolves them in the graph even if the target note doesn't exist yet (shows as unresolved link, creates when user clicks).

**MetadataCache API for reading existing notes:**
```typescript
const cache = app.metadataCache.getFileCache(file);
const tags = cache?.frontmatter?.tags ?? [];
const links = cache?.links ?? [];
```

---

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

---

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

---

## Stack Patterns by Variant

**For the problem browser sidebar (ItemView):**
- Use `ItemView` + DOM helpers (`createEl`, `createDiv`)
- No React, no Svelte — keeps bundle under 50 kB
- Register via `this.registerView(VIEW_TYPE, leaf => new ProblemBrowserView(leaf))`

**For the settings tab:**
- Use `PluginSettingTab` + `Setting` API
- Fields: login button, default language (dropdown), problems folder path, clear cache

**For submission status polling:**
- Use `setInterval` / `clearInterval` via `this.registerInterval()` so it auto-cleans on plugin unload
- Poll `check/` every 2 s; abort after 30 s (LC judge timeout)

**For frontmatter updates on accepted submission:**
- Use `app.fileManager.processFrontMatter()` — atomic, handles YAML parse errors
- Do NOT use `Vault.modify()` on active file — loses cursor position

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `obsidian@1.12.3` | `@codemirror/state@6.5.0`, `@codemirror/view@6.38.6` | Peer deps declared in `obsidian` npm package; mark both as external in esbuild |
| `esbuild@0.25.5` | `typescript@^5.8.3` | No direct dep; esbuild transpiles TS independently |
| `@leetnotion/leetcode-api@3.0.0` | Node ESM + browser fetch | Uses ESM; esbuild handles bundling; swap fetcher for `requestUrl` |
| `turndown@7.2.4` | Browser + Node | CJS/ESM dual; no peer deps |
| `vitest@4.1.5` | `typescript@^5.8.3` | Dev-only; not bundled into plugin |

---

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

---

*Stack research for: Obsidian community plugin — LeetCode integration*
*Researched: 2026-05-07*
