# Phase 1: plugin-foundation — Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 27 new files (scaffold + src/ + tests/)
**Analogs found:** 27 / 27 (external canonical sources — greenfield repo)

**Greenfield note.** The repo has no `src/` yet. Instead of in-repo analogs, each file is keyed to an **external canonical source** (verified verbatim in RESEARCH.md) or a **locked decision excerpt** (CONTEXT.md D-NN / UI-SPEC.md). Planner should treat the excerpts below as the literal pattern to copy.

---

## File Classification

| New File | Role | Data Flow | Closest Analog (external) | Match |
|---|---|---|---|---|
| `manifest.json` | manifest (config) | static | `obsidianmd/obsidian-sample-plugin/manifest.json` | exact |
| `package.json` | config | static | `obsidianmd/obsidian-sample-plugin/package.json` | exact |
| `tsconfig.json` | config | static | `obsidianmd/obsidian-sample-plugin/tsconfig.json` | exact |
| `esbuild.config.mjs` | build config | static | `obsidianmd/obsidian-sample-plugin/esbuild.config.mjs` | exact |
| `eslint.config.mts` | lint config | static | `obsidianmd/obsidian-sample-plugin/eslint.config.mts` | exact |
| `versions.json` | config | static | `obsidianmd/obsidian-sample-plugin/versions.json` | exact |
| `version-bump.mjs` | build util | static | `obsidianmd/obsidian-sample-plugin/version-bump.mjs` | exact |
| `vitest.config.ts` | test config | static | vitest 4.1.5 default + CLAUDE.md env=node guidance | role-match |
| `.gitignore` | config | static | `obsidianmd/obsidian-sample-plugin/.gitignore` | exact |
| `styles.css` | view (CSS) | static | UI-SPEC.md § CSS conventions | role-match |
| `README.md` | docs | static | Obsidian plugin-review criteria + CLAUDE.md §8 | role-match |
| `LICENSE` | legal | static | MIT template | role-match |
| `src/main.ts` | plugin entry | event-driven (Obsidian lifecycle) | RESEARCH.md Pattern 1 + sample-plugin `main.ts` | exact |
| `src/api/requestUrlFetcher.ts` | adapter | request-response | RESEARCH.md Pattern 2 (`@fetch-impl/fetcher` shim) | exact |
| `src/api/throttle.ts` | utility | queue (token-bucket + concurrency) | RESEARCH.md Pattern 3 + CONTEXT.md D-12 | exact |
| `src/api/LeetCodeClient.ts` | service (API wrapper) | request-response | RESEARCH.md § `@leetnotion/leetcode-api` verified call shapes | exact |
| `src/auth/BrowserWindowLogin.ts` | adapter (Electron) | event-driven (did-navigate) | RESEARCH.md Pattern 4 + CONTEXT.md D-02/D-03 | exact |
| `src/auth/AuthService.ts` | service | state-transition (login/logout) | RESEARCH.md § architecture diagram (AuthService row) | role-match |
| `src/auth/CookiePasteModal.ts` | view (settings-embedded form) | form-submit | UI-SPEC.md § Settings tab interactions (manual-cookie form) | role-match |
| `src/auth/types.ts` | types | static | RESEARCH.md § Pattern 4 (`AuthCookies`) | exact |
| `src/browse/ProblemBrowserView.ts` | view (Obsidian ItemView) | event-driven (DOM) + request-response | RESEARCH.md Pattern 5 + UI-SPEC.md § Layout — Problem Browser | exact |
| `src/browse/ProblemListService.ts` | service | CRUD (paged fetch + cache) | CONTEXT.md D-07 + RESEARCH.md `problems({limit,offset})` | role-match |
| `src/browse/types.ts` | types | static | CONTEXT.md D-07 `IndexedProblem` shape | exact |
| `src/settings/SettingsTab.ts` | view (PluginSettingTab) | event-driven (form) | `obsidianmd/obsidian-api` `PluginSettingTab` / `Setting` + UI-SPEC.md § Layout — Settings | exact |
| `src/settings/SettingsStore.ts` | store | CRUD (loadData/saveData) | Obsidian `Plugin.loadData/saveData` + CLAUDE.md §5 | role-match |
| `src/shared/logger.ts` | utility | static | RESEARCH.md Pitfall 5 (redaction) | role-match |
| `src/shared/errors.ts` | utility (types) | static | RESEARCH.md § security-domain + CLAUDE.md §What NOT to Use | role-match |
| `tests/throttle.test.ts` | test (unit) | test | vitest 4.1.5 + fake-timers | role-match |
| `tests/cookie-parse.test.ts` | test (unit) | test | vitest + AUTH-02 test row | role-match |
| `tests/session-expiry.test.ts` | test (unit) | test | vitest + RESEARCH.md § session-expiry snippet | role-match |
| `tests/search-filter.test.ts` | test (unit) | test | vitest + BROWSE-03/04 | role-match |
| `tests/problems-pagination.test.ts` | test (unit) | test | vitest + BROWSE-02 | role-match |
| `tests/settings-store.test.ts` | test (unit) | test | vitest + AUTH-03/05 | role-match |
| `tests/fetcher-install.test.ts` | test (unit) | test | vitest + FND-04 unit portion | role-match |

---

## Pattern Assignments

### `manifest.json` (manifest, static)

**Analog:** `obsidianmd/obsidian-sample-plugin/manifest.json` + plugin-review criteria (CLAUDE.md §8).

**Copy verbatim from RESEARCH.md § Code Examples / `manifest.json`:**
```json
{
  "id": "leetcode",
  "name": "LeetCode",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Browse, solve, and note LeetCode problems inside your Obsidian vault.",
  "author": "moxu",
  "authorUrl": "https://github.com/moxu",
  "isDesktopOnly": true
}
```

**Rules enforced here (CLAUDE.md §8 + RESEARCH.md Pitfall 7):**
- `"id"` MUST NOT contain the word "obsidian".
- `"isDesktopOnly": true` is mandatory (FND-02, CF-02).
- `description` ≤ 250 chars and ends with a period.
- `version` is semver and MUST match the GitHub release tag.

---

### `package.json` (config, static)

**Analog:** `obsidianmd/obsidian-sample-plugin/package.json`.

**Dependencies (RESEARCH.md § Standard Stack, versions verified 2026-05-07):**
```bash
# devDependencies
typescript@^5.8.3 esbuild@0.25.5 eslint-plugin-obsidianmd@0.2.9 \
  typescript-eslint@8.35.1 @eslint/js@9.30.1 globals@14.0.0 \
  jiti@2.6.1 tslib@2.4.0 @types/node@^16.11.6 vitest@4.1.5
# runtime dependencies (peer-external at build but npm-installed for types)
obsidian@latest
# runtime bundled
@leetnotion/leetcode-api@3.0.0 turndown@7.2.4
```

**Scripts (RESEARCH.md § Validation Architecture Wave 0):**
```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "lint": "eslint .",
    "test": "vitest run",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  }
}
```

---

### `tsconfig.json` (config, static)

**Analog:** `obsidianmd/obsidian-sample-plugin/tsconfig.json` — **copy verbatim** (RESEARCH.md § Code Examples):

```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "inlineSourceMap": true, "inlineSources": true,
    "module": "ESNext", "target": "ES6",
    "allowJs": true, "noImplicitAny": true, "noImplicitThis": true,
    "noImplicitReturns": true, "moduleResolution": "node",
    "importHelpers": true, "noUncheckedIndexedAccess": true,
    "isolatedModules": true, "strictNullChecks": true,
    "strictBindCallApply": true, "allowSyntheticDefaultImports": true,
    "useUnknownInCatchVariables": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

Rationale: `moduleResolution: "node"` (not `bundler` — esbuild handles resolution). `isolatedModules: true` matches esbuild's single-file transform model.

---

### `esbuild.config.mjs` (build config, static)

**Analog:** `obsidianmd/obsidian-sample-plugin/esbuild.config.mjs` — **copy verbatim** (RESEARCH.md § Code Examples):

```javascript
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from 'node:module';

const banner = `/*\nTHIS IS A GENERATED/BUNDLED FILE BY ESBUILD\n*/\n`;
const prod = (process.argv[2] === "production");

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian", "electron",
    "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
    "@codemirror/language", "@codemirror/lint", "@codemirror/search",
    "@codemirror/state", "@codemirror/view",
    "@lezer/common", "@lezer/highlight", "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs", target: "es2018", logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true, outfile: "main.js", minify: prod,
});
if (prod) { await context.rebuild(); process.exit(0); }
else { await context.watch(); }
```

**Critical rule (RESEARCH.md Pitfall 4):** the `external` list above must be copied intact. Inlining `obsidian`, `electron`, or any `@codemirror/*` / `@lezer/*` blows up `main.js` and causes runtime version conflicts.

---

### `eslint.config.mts` (lint config, static)

**Analog:** `obsidianmd/obsidian-sample-plugin/eslint.config.mts` — **adapt** (RESEARCH.md § Code Examples):

```typescript
import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  globalIgnores([
    "node_modules", "dist", "esbuild.config.mjs", "eslint.config.js",
    "version-bump.mjs", "versions.json", "main.js",
  ]),
);
```

**Rule override (RESEARCH.md Pitfall 6):** set `"obsidianmd/ui/sentence-case": "warn"` if autofix causes grammar churn; UI-SPEC.md already mandates sentence case at authoring time.

---

### `vitest.config.ts` (test config, static)

**Analog:** vitest 4.x default + RESEARCH.md § Validation Architecture Wave 0 guidance.

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'main.js', 'dist'],
    reporters: ['default'],
  },
});
```

---

### `styles.css` (view CSS, static)

**Analog:** UI-SPEC.md § CSS conventions — **copy class scaffold**:

```css
.leetcode-browser { padding: 16px; }
.leetcode-browser .lc-search { margin-bottom: 8px; font-size: var(--font-ui-small); }
.leetcode-browser .lc-chip {
  display: inline-flex; align-items: center; height: 24px;
  padding: 0 8px; margin-right: 4px; border-radius: 4px;
  font-size: 12px; font-weight: 500;
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
}
.leetcode-browser .lc-chip.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.leetcode-browser .lc-row {
  display: flex; align-items: center; min-height: 32px;
  padding: 0 8px; gap: 8px; cursor: pointer;
}
.leetcode-browser .lc-row:hover { background: var(--background-secondary); }
.leetcode-browser .lc-row__id {
  color: var(--text-muted); min-width: 40px; text-align: right;
}
.leetcode-browser .lc-diff--easy {
  color: var(--color-green);
  background: color-mix(in srgb, var(--color-green) 15%, transparent);
}
/* medium / hard follow the same template with --color-yellow / --color-red */
.leetcode-browser .lc-footer {
  padding: 8px; font-size: 12px;
  color: var(--text-muted);
  border-top: 1px solid var(--background-modifier-border);
}
```

**Hard rules (UI-SPEC.md § Color):**
- Zero raw hex / `rgba()` — every value via Obsidian CSS var.
- No inline `style=` (flagged by `no-static-styles-assignment`).
- No `!important`.
- Root class `.leetcode-browser` on the view root; `.leetcode-settings` on settings-tab root.

---

### `src/main.ts` (plugin entry, event-driven)

**Analog:** RESEARCH.md § Pattern 1 + `obsidianmd/obsidian-sample-plugin/main.ts`.

**Copy verbatim (RESEARCH.md lines 174–213):**
```typescript
import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemBrowserView, BROWSER_VIEW_TYPE } from './browse/ProblemBrowserView';
import { LeetCodeSettingTab } from './settings/SettingsTab';

export default class LeetCodePlugin extends Plugin {
  settings!: SettingsStore;
  client!: LeetCodeClient;
  auth!: AuthService;

  async onload(): Promise<void> {
    this.settings = await SettingsStore.load(this);
    installRequestUrlFetcher();                        // MUST run before any LC call
    // BLOCKER 2 fix: LeetCodeClient MUST be constructed BEFORE AuthService, because
    // AuthService's constructor takes (settings, client) — two-arg. Ordering:
    //   settings → fetcher → client → auth → list → views.
    this.client = new LeetCodeClient(this.settings);
    this.auth = new AuthService(this.settings, this.client);
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this.client, this.settings));
    this.addRibbonIcon('code-2', 'Open LeetCode browser', () => this.activateBrowser());
    this.addCommand({
      id: 'open-leetcode-browser',                     // no plugin id prefix, no 'command' suffix
      name: 'Open problem browser',                    // sentence case
      callback: () => this.activateBrowser(),
    });
    this.addSettingTab(new LeetCodeSettingTab(this.app, this));
  }

  private async activateBrowser(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
    if (existing[0]) { workspace.revealLeaf(existing[0]); return; }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }
}
```

**Non-negotiable ordering (RESEARCH.md Pitfall 1 + BLOCKER 2):** step 1 `loadSettings` → step 2 `installRequestUrlFetcher()` → step 3 `new LeetCodeClient(this.settings)` → step 4 `new AuthService(this.settings, this.client)` → step 5 `new ProblemListService(this.client, this.settings)` → step 6 register view/ribbon/command/settings-tab. Constructing the client before the fetcher is replaced fires an eager `Credential.init()` fetch and silently fails via CORS. Constructing AuthService before the client is a type error — the constructor is two-arg.

**Command rules (RESEARCH.md Anti-Patterns):**
- No `hotkeys:` on `addCommand()` (`commands/no-default-hotkeys`).
- `id` must not contain the plugin id or the word "command".
- `name` must be sentence case and must not start with the plugin name.

---

### `src/api/requestUrlFetcher.ts` (adapter, request-response)

**Analog:** RESEARCH.md § Pattern 2 — **the critical integration**.

**Copy verbatim (RESEARCH.md lines 220–255):**
```typescript
import { requestUrl } from 'obsidian';
// The library ships a single module-level Fetcher instance.
// Importing @leetnotion/leetcode-api already calls useCrossFetch(fetcher).
// Our replacement overwrites .fetch after that ran.
import { fetcher } from '@fetch-impl/fetcher';
import { Throttle } from './throttle';

const throttle = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 2 });

export function installRequestUrlFetcher(): void {
  (fetcher as unknown as { fetch: typeof fetch }).fetch = async (input, init) => {
    await throttle.acquire();
    try {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const res = await requestUrl({
        url,
        method: (init?.method as string) ?? 'GET',
        headers: (init?.headers as Record<string, string>) ?? undefined,
        body: init?.body as string | ArrayBuffer | undefined,
        throw: false,  // IMPORTANT: let 4xx/5xx flow to library for parsing
      });
      return new Response(res.text, {
        status: res.status,
        statusText: '',
        headers: res.headers,
      });
    } finally {
      throttle.release();
    }
  };
}
```

**Critical points:**
- `throw: false` on `requestUrl` — the library inspects `response.status`; letting it see raw 4xx/5xx is what unlocks GraphQL-error parsing (RESEARCH.md § `requestUrl` adapter signature).
- `@fetch-impl/fetcher` is pulled transitively via `@leetnotion/leetcode-api`; do NOT add as a direct dep — import and mutate the library's singleton.
- Install side effect must happen exactly once, in `main.ts` before any `new LeetCode()` / `new Credential()` (RESEARCH.md Pitfall 1, Assumption A4).

---

### `src/api/throttle.ts` (utility, queue)

**Analog:** RESEARCH.md § Pattern 3 + CONTEXT.md D-12 — token bucket + concurrency limit.

**Copy verbatim (RESEARCH.md lines 259–298):**
```typescript
export interface ThrottleOpts { capacity: number; refillMs: number; maxConcurrent: number; }

export class Throttle {
  private tokens: number;
  private readonly cap: number;
  private readonly refillMs: number;
  private readonly maxConc: number;
  private running = 0;
  private waiters: Array<() => void> = [];
  private lastRefill = Date.now();

  constructor(o: ThrottleOpts) {
    this.cap = o.capacity; this.tokens = o.capacity;
    this.refillMs = o.refillMs; this.maxConc = o.maxConcurrent;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefill >= this.refillMs) {
      this.tokens = this.cap;
      this.lastRefill = now;
    }
    while (this.tokens <= 0 || this.running >= this.maxConc) {
      await new Promise<void>((r) => this.waiters.push(r));
    }
    this.tokens--;
    this.running++;
  }

  release(): void {
    this.running--;
    const w = this.waiters.shift();
    if (w) setTimeout(w, 0);
  }
}
```

**Parameters locked by CF-07 / D-12:** `capacity: 20`, `refillMs: 10_000`, `maxConcurrent: 2`. Hand-rolled (CONTEXT.md Claude's Discretion) rather than a dep.

**Test contract (BROWSE-05, RESEARCH.md Wave 0 `throttle.test.ts`):** fake-timers — 25 sequential `acquire()` calls must take ≥10 s; at no point may `running > 2`.

---

### `src/api/LeetCodeClient.ts` (service, request-response)

**Analog:** RESEARCH.md § `@leetnotion/leetcode-api` verified call shapes (lines 584–621).

**Verified method signatures (copy into wrapper):**
```typescript
import { LeetCode, Credential } from '@leetnotion/leetcode-api';

// LC library (verbatim signatures from codewithsathya/leetcode-api/src/leetcode.ts):
//   problems({ category?, offset?, limit?, filters? }): Promise<ProblemList>
//     NOTE: param is `offset`, not `skip`. CONTEXT.md D-07 wording uses `skip` — normalize to `offset` here.
//   user(username): Promise<UserProfile>
//   whoami(): Promise<Whoami>
//   submissions({ limit, offset }): Promise<Submission[]>   // auth required

// Credential usage (RESEARCH.md lines 615–621):
const cred = new Credential();
await cred.init('YOUR_LEETCODE_SESSION');   // session-cookie STRING, not an object
// cred.init() fires an eager fetch — fetcher MUST already be installed.
const lc = new LeetCode(cred);
```

**Session-expiry detection (RESEARCH.md lines 624–638, CF-04, AUTH-04):**
```typescript
function isSessionExpired(resp: unknown): boolean {
  const r = resp as { data?: unknown; errors?: Array<{ message?: string }> };
  // Primary signal (more reliable): data === null on a GraphQL response.
  if (r.data === null) return true;
  // Secondary: error-message pattern.
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e.message ?? '')
  );
}
```

**Library caveat (RESEARCH.md Assumption A1):** `graphql()` returns `{ data: any }` and strips `errors`. Wrap the fetcher to inspect the raw response body OR check `data === null` on typed-response boundary. Prefer `data === null` — simpler and equivalent.

---

### `src/auth/BrowserWindowLogin.ts` (adapter, event-driven — THE ONLY ELECTRON FILE)

**Analog:** RESEARCH.md § Pattern 4 + CONTEXT.md D-02/D-03 + electronjs.org BrowserWindow docs.

**Copy verbatim (RESEARCH.md lines 306–349):**
```typescript
// src/auth/BrowserWindowLogin.ts — ONLY file allowed to import electron (D-02, CF-06)
import type { AuthCookies } from './types';

// Types-only import — actual module via require() at runtime (Electron is external).
type BrowserWindowCtor = typeof import('electron').BrowserWindow;

export function openLogin(): Promise<AuthCookies | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BrowserWindow } = require('electron') as { BrowserWindow: BrowserWindowCtor };

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 980, height: 720, show: true, autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:leetcode',   // D-03 — isolated cookie jar
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    let resolved = false;

    const tryCapture = async () => {
      const cookies = await win.webContents.session.cookies.get({ domain: '.leetcode.com' });
      const lcSession = cookies.find((c) => c.name === 'LEETCODE_SESSION');
      const csrf      = cookies.find((c) => c.name === 'csrftoken');
      if (lcSession && csrf && !resolved) {
        resolved = true;
        resolve({ LEETCODE_SESSION: lcSession.value, csrftoken: csrf.value });
        win.close();
      }
    };

    win.webContents.on('did-navigate', tryCapture);
    win.webContents.on('did-navigate-in-page', tryCapture);   // SPA route change

    win.on('closed', () => {
      if (!resolved) resolve(null);   // D-04 silent-cancel
    });

    win.loadURL('https://leetcode.com/accounts/login/');
  });
}
```

**Non-negotiable (CONTEXT.md D-02):** this is the ONE file with `require('electron')`. Plan must include a grep gate: `grep -r "require('electron')" src/ --include='*.ts'` returns exactly this file.

**Dual listener rationale (RESEARCH.md Pitfall 2):** `did-navigate` fires on full navigation; `did-navigate-in-page` fires on SPA `history.pushState`. Both needed because LC's post-login redirect pattern is platform/route variable. Polling pattern — if cookies missing on first fire, just return and wait for next event.

**Partition isolation (RESEARCH.md Pitfall 3):** `partition: 'persist:leetcode'` — `persist:` prefix makes cookies survive Obsidian restarts; the unique string prevents collision with any other plugin's BrowserWindow.

---

### `src/auth/AuthService.ts` (service, state-transition)

**Analog:** RESEARCH.md § architecture diagram (`AuthService.login()` row) + CONTEXT.md D-04/D-05.

**Pattern:**
```typescript
import { Notice } from 'obsidian';
import type { SettingsStore } from '../settings/SettingsStore';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import { openLogin } from './BrowserWindowLogin';
import type { AuthCookies } from './types';

// BLOCKER 2 fix: AuthService is TWO-ARG — (settings, client). `client.reauthenticate()`
// is called after every cookie change so the LC client rebuilds with the new credentials.
export class AuthService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly client: LeetCodeClient,
  ) {}

  async login(): Promise<boolean> {
    const cookies = await openLogin();
    if (!cookies) {
      new Notice('LeetCode login cancelled.');     // D-04, UI-SPEC.md Notice table
      return false;
    }
    await this.settings.setAuthCookies(cookies);
    await this.client.reauthenticate();
    new Notice('Logged in to LeetCode.');
    return true;
  }

  async loginManual(cookies: AuthCookies): Promise<void> {
    await this.settings.setAuthCookies(cookies);    // AUTH-03
    await this.client.reauthenticate();
    new Notice('Cookies saved.');
  }

  async logout(): Promise<void> {
    await this.settings.setAuthCookies(null);        // AUTH-05: clear data.json only
    await this.settings.setUsername(null);
    await this.client.reauthenticate();
    new Notice('Logged out of LeetCode.');
  }

  isLoggedIn(): boolean {
    return this.settings.getAuthCookies() !== null;
  }
}
```

**Rules:**
- Notice copy is LOCKED by UI-SPEC.md § Notice messages — do not paraphrase.
- `logout()` does NOT clear the Electron `persist:leetcode` partition (RESEARCH.md Open Question 2 — deferred to Phase 5).

---

### `src/auth/CookiePasteModal.ts` (view, form-submit)

**Analog:** UI-SPEC.md § Settings tab interactions — manual-cookie form.

**Note:** CONTEXT.md D-09 puts the manual-cookie form *inside* the Settings tab (not a modal). If the planner keeps a separate modal file as a named export, it must be invoked from the settings form; but the simpler path is to inline the `Setting.addText()` rows in `SettingsTab.ts` per UI-SPEC.md § Layout — Settings tab.

**If implemented as Modal** (Obsidian `Modal` primitive):
```typescript
import { App, Modal, Setting } from 'obsidian';
import type { AuthCookies } from './types';

export class CookiePasteModal extends Modal {
  private session = '';
  private csrf = '';
  constructor(app: App, private onSave: (cookies: AuthCookies) => void) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Manual cookie (fallback)' });
    new Setting(contentEl).setName('LEETCODE_SESSION')
      .addText((t) => t.onChange((v) => { this.session = v; }));
    new Setting(contentEl).setName('csrftoken')
      .addText((t) => t.onChange((v) => { this.csrf = v; }));
    new Setting(contentEl).addButton((b) =>
      // W1: NO .setCta() on Save — accent color reserved for the primary Log-in button
      // (UI-SPEC.md § Color). Save-cookies is a NEUTRAL action.
      b.setButtonText('Save cookies').onClick(() => {
        if (this.session && this.csrf) {
          this.onSave({ LEETCODE_SESSION: this.session, csrftoken: this.csrf });
          this.close();
        }
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}
```

---

### `src/auth/types.ts` (types, static)

**Analog:** RESEARCH.md § Pattern 4 `AuthCookies` usage.

```typescript
export interface AuthCookies {
  LEETCODE_SESSION: string;
  csrftoken: string;
}
```

---

### `src/browse/ProblemBrowserView.ts` (view, event-driven + request-response)

**Analog:** RESEARCH.md § Pattern 5 + UI-SPEC.md § Layout — Problem Browser + § Interaction Contracts.

**Skeleton (RESEARCH.md lines 356–379):**
```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore } from '../settings/SettingsStore';

export const BROWSER_VIEW_TYPE = 'leetcode-browser';

export class ProblemBrowserView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private client: LeetCodeClient, private settings: SettingsStore) {
    super(leaf);
    this.navigation = false;   // static dock view (D-06)
  }
  getViewType(): string { return BROWSER_VIEW_TYPE; }
  getDisplayText(): string { return 'LeetCode problems'; }
  getIcon(): string { return 'code-2'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1];   // [0] header, [1] content
    root.empty();
    root.addClass('leetcode-browser');
    // Render: search input → filter chips → virtualized row list → footer.
    // All DOM via createEl/createDiv — never innerHTML.
  }
  async onClose(): Promise<void> { /* cleanup observers */ }
}
```

**Interaction contract (UI-SPEC.md § Interaction Contracts — Problem Browser view):**
- Search: debounce 150 ms, in-memory filter over cached index, no LC call.
- Filter chips: toggle membership in active-filter set; multi-select.
- Row click (Phase 1 stub): `new Notice(`Phase 1 stub: would open ${slug}.`)`.
- Virtualized mount: IntersectionObserver-based, render window of ~50 rows (CONTEXT.md Claude's Discretion).
- Footer throttle indicator: show `⋯ Fetching from LeetCode…` only when queue > 0 for > 2 s (D-13).

**Copy (UI-SPEC.md § Problem Browser strings — LOCKED):**
- View header: `LeetCode problems`
- Search placeholder: `Search by title or number`
- Difficulty filter chips: `Easy` / `Medium` / `Hard`
- Status filter chips: `Solved` / `Attempted` / `Untouched`
- Reset: `Clear filters`
- Empty states per UI-SPEC.md table — do not paraphrase.

**Accessibility (UI-SPEC.md § Accessibility):**
- Search input `aria-label="Search by title or number"`.
- Chips `role="button" aria-pressed="..."`.
- Row list `role="listbox"`, rows `role="option"` with hidden `aria-label` = `{id}. {title}, {difficulty}, {status}`.
- Never set `outline: none` — keep Obsidian default focus ring.

---

### `src/browse/ProblemListService.ts` (service, CRUD)

**Analog:** CONTEXT.md D-07 (index-once + paged render) + RESEARCH.md verified `problems({limit, offset})` shape.

**Pattern:**
```typescript
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore } from '../settings/SettingsStore';
import type { IndexedProblem } from './types';

const INDEX_TTL_MS = 24 * 60 * 60 * 1000;   // 24h (D-07)
const PAGE_SIZE = 50;                        // D-07

export class ProblemListService {
  constructor(private client: LeetCodeClient, private settings: SettingsStore) {}

  async refresh(force = false): Promise<IndexedProblem[]> {
    const cached = this.settings.getProblemIndex();
    if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL_MS) {
      return cached.problems;
    }
    const all: IndexedProblem[] = [];
    let offset = 0;
    while (true) {
      const page = await this.client.lc.problems({ limit: PAGE_SIZE, offset });
      for (const q of page.questions) {
        all.push({
          id: Number(q.questionFrontendId),
          slug: q.titleSlug,
          title: q.title,
          diff: q.difficulty,
          paid: q.isPaidOnly,
        });
      }
      if (page.questions.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    await this.settings.setProblemIndex({ fetchedAt: Date.now(), problems: all });
    return all;
  }

  search(idx: IndexedProblem[], term: string): IndexedProblem[] {
    const q = term.trim().toLowerCase();
    if (!q) return idx;
    return idx.filter((p) =>
      p.title.toLowerCase().includes(q) || String(p.id).startsWith(q));
  }

  filter(idx: IndexedProblem[], opts: { difficulty?: string[]; status?: string[] }): IndexedProblem[] {
    return idx.filter((p) => {
      if (opts.difficulty?.length && !opts.difficulty.includes(p.diff)) return false;
      // status pulled from separate user-profile cache — see Phase 1 D-08
      return true;
    });
  }
}
```

**Rules:**
- `data.json` shape locked by CONTEXT.md D-07 — `{ problemIndex: { fetchedAt, problems: [...] } }`.
- `limit: 50` + `offset` cursor (not `skip`) — library's verified param name (RESEARCH.md).
- Background refresh on plugin load if stale; foreground refresh only on explicit user action.

---

### `src/browse/types.ts` (types, static)

**Analog:** CONTEXT.md D-07.

```typescript
export interface IndexedProblem {
  id: number;                       // questionFrontendId parsed to number
  slug: string;                     // titleSlug
  title: string;
  diff: 'Easy' | 'Medium' | 'Hard';
  paid: boolean;
}

export interface ProblemIndex {
  fetchedAt: number;
  problems: IndexedProblem[];
}
```

---

### `src/settings/SettingsTab.ts` (view, event-driven)

**Analog:** Obsidian `PluginSettingTab` + `Setting` builder + UI-SPEC.md § Layout — Settings tab (D-09 verbatim).

**Pattern:**
```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import type LeetCodePlugin from '../main';

export class LeetCodeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LeetCodePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('leetcode-settings');

    // --- Authentication section ---
    containerEl.createEl('h2', { text: 'Authentication' });

    const statusText = this.plugin.auth.isLoggedIn()
      ? `Logged in as ${this.plugin.settings.getUsername() ?? '…'}`
      : 'Not logged in';
    new Setting(containerEl).setName('Status').setDesc(statusText);

    new Setting(containerEl)
      .addButton((b) => b
        .setButtonText(this.plugin.auth.isLoggedIn() ? 'Logout' : 'Log in via embedded window')
        .setCta()  // primary button → accent color (UI-SPEC.md § Color: accent reserved list)
        .onClick(async () => {
          if (this.plugin.auth.isLoggedIn()) await this.plugin.auth.logout();
          else await this.plugin.auth.login();
          this.display();   // re-render
        }));

    // Manual cookie (fallback) — first-class per D-05
    containerEl.createEl('h3', { text: 'Manual cookie (fallback)' });
    containerEl.createEl('p', {
      text: "Paste your LeetCode session cookies if the embedded login doesn't work on your system.",
      cls: 'setting-item-description',
    });
    let sessionVal = '', csrfVal = '';
    new Setting(containerEl).setName('LEETCODE_SESSION')
      .addText((t) => t.inputEl.type = 'password' as never);   // masked; pair with eye-toggle
    // ... (full impl per UI-SPEC.md § Settings tab interactions)

    // --- Notes section ---
    containerEl.createEl('h2', { text: 'Notes' });

    new Setting(containerEl)
      .setName('Problems folder')
      .setDesc('Vault folder where problem notes are created.')
      .addText((t) => t
        .setPlaceholder('LeetCode/')
        .setValue(this.plugin.settings.getProblemsFolder())
        .onChange(async (v) => { await this.plugin.settings.setProblemsFolder(v.replace(/\/+$/, '')); }));

    new Setting(containerEl)
      .setName('Default language')
      .setDesc('Starter code language for new problems.')
      .addDropdown((d) => d
        .addOptions({ python3: 'Python', java: 'Java', cpp: 'C++', javascript: 'JavaScript', typescript: 'TypeScript' })
        .setValue(this.plugin.settings.getDefaultLanguage())
        .onChange(async (v) => { await this.plugin.settings.setDefaultLanguage(v); }));
  }
}
```

**Rules (UI-SPEC.md):**
- Copy locked — sentence case, no periods on button labels, periods on descriptions/Notices.
- Accent color (`--interactive-accent`) ONLY on the primary auth button (`.setCta()`). Logout stays neutral (no `.setCta()`).
- Monospace `var(--font-monospace)` on the two cookie input fields.
- Default problems folder value: `LeetCode/` (D-10). Default language: `Python` (D-10).
- Section ordering: Authentication first (with manual-cookie fallback inside it — D-05), then Notes.
- No Confirm modal on Logout (UI-SPEC.md § Destructive actions).

---

### `src/settings/SettingsStore.ts` (store, CRUD)

**Analog:** Obsidian `Plugin.loadData()` / `Plugin.saveData()` (CLAUDE.md §5 Offline Cache).

**Pattern:**
```typescript
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { ProblemIndex } from '../browse/types';

interface PluginData {
  version: 1;
  auth: AuthCookies | null;
  username: string | null;
  problemsFolder: string;
  defaultLanguage: string;
  problemIndex: ProblemIndex | null;
}

const DEFAULT_DATA: PluginData = {
  version: 1,
  auth: null,
  username: null,
  problemsFolder: 'LeetCode',       // D-10; stored without trailing slash
  defaultLanguage: 'python3',       // D-10 — Python is LC's python3 slug
  problemIndex: null,
};

export class SettingsStore {
  private constructor(private plugin: Plugin, private data: PluginData) {}

  static async load(plugin: Plugin): Promise<SettingsStore> {
    const raw = (await plugin.loadData()) as Partial<PluginData> | null;
    const data: PluginData = { ...DEFAULT_DATA, ...(raw ?? {}), version: 1 };
    return new SettingsStore(plugin, data);
  }

  getAuthCookies(): AuthCookies | null { return this.data.auth; }
  async setAuthCookies(c: AuthCookies | null): Promise<void> {
    this.data.auth = c;
    await this.persist();
  }

  getProblemsFolder(): string { return this.data.problemsFolder; }
  async setProblemsFolder(v: string): Promise<void> { this.data.problemsFolder = v; await this.persist(); }

  getDefaultLanguage(): string { return this.data.defaultLanguage; }
  async setDefaultLanguage(v: string): Promise<void> { this.data.defaultLanguage = v; await this.persist(); }

  getProblemIndex(): ProblemIndex | null { return this.data.problemIndex; }
  async setProblemIndex(i: ProblemIndex): Promise<void> { this.data.problemIndex = i; await this.persist(); }

  getUsername(): string | null { return this.data.username; }
  async setUsername(u: string | null): Promise<void> { this.data.username = u; await this.persist(); }

  private async persist(): Promise<void> { await this.plugin.saveData(this.data); }
}
```

**Rules (CLAUDE.md §5):**
- ONLY use `plugin.loadData()` / `plugin.saveData()` for settings + session + problem index.
- NEVER write hidden files under `.obsidian/plugins/obsidian-leetcode/` manually.
- NEVER log `this.data` wholesale — session cookie is inside (RESEARCH.md Pitfall 5).
- Version field enables migration guards (CONTEXT.md Claude's Discretion).

---

### `src/shared/logger.ts` (utility, static)

**Analog:** RESEARCH.md § Pitfall 5 — mandatory key redaction.

**Pattern:**
```typescript
const REDACT = /session|csrf|cookie|token/i;

function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

export const logger = {
  debug: (msg: string, ctx?: unknown): void => console.debug(`[leetcode] ${msg}`, ctx ? redact(ctx) : ''),
  info:  (msg: string, ctx?: unknown): void => console.info(`[leetcode] ${msg}`,  ctx ? redact(ctx) : ''),
  warn:  (msg: string, ctx?: unknown): void => console.warn(`[leetcode] ${msg}`,  ctx ? redact(ctx) : ''),
  error: (msg: string, err?: unknown): void => console.error(`[leetcode] ${msg}`, err),
};
```

**Rules (AUTH-06, CF-03):**
- Any object key matching `/session|csrf|cookie|token/i` is redacted before logging.
- Grep gate: `grep -rE "console\.(log|debug|info).*\\b(session|LEETCODE_SESSION|csrftoken)\\b" src/` must return empty (RESEARCH.md Wave 0 FND-04 / AUTH-06 row).

---

### `src/shared/errors.ts` (utility types, static)

**Analog:** RESEARCH.md § Security Domain threat patterns.

**Pattern:**
```typescript
export class SessionExpiredError extends Error {
  constructor(msg = 'LeetCode session expired') { super(msg); this.name = 'SessionExpiredError'; }
}
export class RateLimitError extends Error {
  constructor(public retryAfterMs: number, msg = 'LeetCode rate-limited') {
    super(msg); this.name = 'RateLimitError';
  }
}
export class NetworkError extends Error {
  constructor(msg: string, public cause?: unknown) { super(msg); this.name = 'NetworkError'; }
}
```

---

### `tests/throttle.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture BROWSE-05 row.

**Contract:**
- Fake-timers (`vi.useFakeTimers()`).
- 25 sequential `throttle.acquire()` calls must complete in ≥10 s when `capacity=20, refillMs=10_000`.
- At no point during the run may the in-flight count exceed `maxConcurrent=2`.
- `release()` after each `acquire()` (simulate request round-trip).

---

### `tests/cookie-parse.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture AUTH-02 row.

**Contract:** `parseLeetCodeCookies([{name:'LEETCODE_SESSION',value:'X'},{name:'csrftoken',value:'Y'},{name:'foo',value:'bar'}])` returns `{LEETCODE_SESSION:'X',csrftoken:'Y'}`. Missing either cookie → `null`.

---

### `tests/session-expiry.test.ts` (unit test)

**Analog:** RESEARCH.md § Code Examples / session-expiry snippet (AUTH-04).

**Contract:**
- `isSessionExpired({data:null, errors:[{message:'You must be logged in.'}]})` → `true`.
- `isSessionExpired({data:{questions:[...]}, errors: undefined})` → `false`.
- `isSessionExpired({data:null})` → `true` (primary `data === null` signal).

---

### `tests/search-filter.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture BROWSE-03/04 rows.

**Contract:**
- `searchProblems([{id:1,title:'Two Sum',slug:'two-sum',…},{id:2,title:'Add Two Numbers',…}], 'two')` returns both.
- `searchProblems(idx, '1')` returns the problem with id=1 (id-prefix match).
- `filterProblems(idx, {difficulty:['Easy']})` returns only Easy rows.

---

### `tests/problems-pagination.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture BROWSE-02 row.

**Contract:** mock `LeetCodeClient.lc.problems({limit, offset})` to return 50, 50, 7 questions across three pages. Assert `ProblemListService.refresh()` calls with `limit=50` and `offset=0, 50, 100`, accumulates 107 items, stops after short page.

---

### `tests/settings-store.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture AUTH-03 + AUTH-05 rows.

**Contract:** in-memory `loadData`/`saveData` stub; `SettingsStore.setAuthCookies({LEETCODE_SESSION:'X',csrftoken:'Y'})` then `getAuthCookies()` returns those cookies; `setAuthCookies(null)` then `getAuthCookies()` returns `null` (AUTH-05).

---

### `tests/fetcher-install.test.ts` (unit test)

**Analog:** RESEARCH.md § Validation Architecture FND-04 row (unit portion).

**Contract:** mock `@fetch-impl/fetcher` export as `{ fetch: jest.fn() }`; call `installRequestUrlFetcher()`; assert `fetcher.fetch` has been replaced and that calling it invokes a mocked `requestUrl` with the right args (method, headers, body, `throw: false`).

---

## Shared Patterns

### Shared Pattern 1: Fetcher-before-client ordering

**Source:** RESEARCH.md § Pattern 1 + Pitfall 1.
**Apply to:** `src/main.ts` `onload()`, and any future code that constructs a `LeetCode` / `Credential`.

```typescript
// ALWAYS in this order:
this.settings = await SettingsStore.load(this);
installRequestUrlFetcher();            // step 2 — must precede any LC construction
this.client = new LeetCodeClient(this.settings);   // step 3
```

**Why:** `Credential.init()` is eager — it fires `fetch()` during construction. If the fetcher hasn't been replaced yet, the call hits `cross-fetch` and CORS-fails silently.

---

### Shared Pattern 2: `requestUrl`-only HTTP

**Source:** CLAUDE.md §4 + CF-01 + FND-04.
**Apply to:** Everywhere a remote call goes out.

- Only `src/api/requestUrlFetcher.ts` calls `requestUrl`.
- Everywhere else uses `LeetCodeClient` (which routes through the fetcher shim).
- `fetch()` / `axios` / `node-fetch` are forbidden — CORS-blocked and will be caught by grep:
  `grep -rE "(^|[^a-zA-Z_])fetch\\(|axios" src/ --include='*.ts' | grep -v 'fetcher.fetch\\|cross-fetch'` must be empty.

---

### Shared Pattern 3: DOM via `createEl()` only

**Source:** RESEARCH.md § Anti-Patterns + UI-SPEC.md § Design System + CLAUDE.md §6.
**Apply to:** `ProblemBrowserView`, `SettingsTab`, `CookiePasteModal` — every file that touches the DOM.

- `innerHTML = ...` is forbidden (`obsidianmd/prefer-create-el` + `no-forbidden-elements`).
- Inline `style="..."` is forbidden (`obsidianmd/no-static-styles-assignment`).
- Icons via `setIcon(el, 'lucide-name')` — never inline SVG in Phase 1.
- Use `containerEl.createEl(...)` / `createDiv(...)` / `createSpan(...)`.

---

### Shared Pattern 4: Notice copy is LOCKED

**Source:** UI-SPEC.md § Copywriting Contract (Notice table).
**Apply to:** `AuthService`, `LeetCodeClient`, `ProblemBrowserView`, `SettingsTab`.

| Trigger | Copy | Duration |
|---|---|---|
| login cancelled | `LeetCode login cancelled.` | 4s |
| session expired | `LeetCode session expired. Log in again.` | 8s |
| 429 received | `LeetCode rate-limited — slowing down.` | 6s |
| login success | `Logged in to LeetCode.` | 4s |
| logout success | `Logged out of LeetCode.` | 4s |
| manual cookies saved | `Cookies saved.` | 3s |
| Phase-1 row-click stub | `Phase 1 stub: would open {slug}.` | 3s |

Sentence case, terminal period on full sentences. Never stack multiple Notices for the same event class (D-04).

---

### Shared Pattern 5: Electron-import confinement

**Source:** CONTEXT.md D-02 + CF-06.
**Apply to:** Repo-wide grep gate; only `src/auth/BrowserWindowLogin.ts` may contain `require('electron')` or an `electron` type import.

Plan must include:
```bash
grep -rE "require\\('electron'\\)|from 'electron'" src/ --include='*.ts' \
  | grep -v 'BrowserWindowLogin.ts'   # must return empty
```

---

### Shared Pattern 6: Session-cookie never logged

**Source:** RESEARCH.md Pitfall 5 + AUTH-06 + CF-03.
**Apply to:** All files.

- `shared/logger.ts` redacts keys matching `/session|csrf|cookie|token/i`.
- Grep gate (RESEARCH.md Wave 0 row AUTH-06):
  `grep -rE "console\\.(log|debug|info).*\\b(session|LEETCODE_SESSION|csrftoken)\\b" src/` must return empty.

---

### Shared Pattern 7: Obsidian CSS variables only

**Source:** UI-SPEC.md § Color (hard rule) + § CSS conventions.
**Apply to:** `styles.css` and any `setAttr('style', ...)` (which shouldn't exist anyway).

- Zero raw hex. Zero `rgba()` with literals. Zero `!important`.
- Accent (`var(--interactive-accent)`) reserved for: (1) primary Log-in button, (2) active-filter chip. No other element uses accent in Phase 1.
- Difficulty tags use `color-mix(in srgb, var(--color-{green|yellow|red}) 15%, transparent)` for background.

---

### Shared Pattern 8: Command registration rules

**Source:** RESEARCH.md § Anti-Patterns + UI-SPEC.md § Copywriting.
**Apply to:** `src/main.ts` `addCommand()`.

- No `hotkeys:` field on `addCommand()` (`commands/no-default-hotkeys`).
- `id` must not contain the plugin id or the word "command". Example: `'open-leetcode-browser'`.
- `name` sentence case, no leading plugin name. Example: `'Open problem browser'`.

---

## No Analog Found

None. Every file in Phase 1 has either a locked sample-plugin source, a verified external library pattern, or an explicit CONTEXT.md / UI-SPEC.md decision. The planner has full coverage.

---

## Metadata

**Analog search scope:** repo root (greenfield — no `src/` yet), CONTEXT.md, RESEARCH.md, UI-SPEC.md, CLAUDE.md.
**External canonical sources (verified 2026-05-07 per RESEARCH.md):**
- `obsidianmd/obsidian-sample-plugin` — esbuild config, tsconfig, manifest, package.json, eslint config
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `requestUrl`, `Plugin`, `ItemView`, `Setting`, `Notice`, `PluginSettingTab`, `Modal` signatures
- `codewithsathya/leetcode-api` source — `problems({limit,offset})`, `Credential.init()`, fetcher-singleton model
- `@leetnotion/leetcode-api@3.0.0` README — `Credential` + `LeetCode` usage
- `eslint-plugin-obsidianmd@0.2.9` `configs.recommended` — Required rules list
- electronjs.org BrowserWindow docs — `webPreferences.partition`, `did-navigate` events
- vitest 4.1.5 defaults

**Pattern extraction date:** 2026-05-07
