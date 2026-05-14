# Phase 1: plugin-foundation — Research

**Researched:** 2026-05-07
**Domain:** Obsidian plugin scaffolding + LeetCode API integration (TypeScript / Electron)
**Confidence:** HIGH

## Summary

Phase 1 is a conventional Obsidian plugin scaffold with two unusual requirements: a custom HTTP fetcher backed by `requestUrl` (to bypass Electron's CORS for cross-origin LC calls), and an embedded `BrowserWindow` login that extracts session cookies via the `did-navigate` event on a named Electron session partition. The tech stack is fully locked in CLAUDE.md; this research verified each package version against npm registry (all current as of 2026-05-07) and confirmed the exact type signatures of the APIs the plan will touch. The one non-trivial integration risk is wiring `@leetnotion/leetcode-api`'s custom fetcher: the library has a **single global `fetcher` singleton** (from `@fetch-impl/fetcher`) that is set at module level via `useCrossFetch(fetcher)` — replacement must happen **before any `LeetCode` or `Credential` is constructed**, because `Credential.init()` calls `fetch()` eagerly to bootstrap the CSRF token. The library already exposes a `RateLimiter` mutex internally, but its throttle policy is not the 20/10s+concurrency-2 ceiling this project wants, so our token bucket must live one layer above in the custom fetcher.

**Primary recommendation:** Copy the `obsidianmd/obsidian-sample-plugin` baseline verbatim (esbuild + tsconfig + package.json), flip `isDesktopOnly` to `true`, set up `eslint-plugin-obsidianmd` with `configs.recommended`, and wire the fetcher **in `main.ts`'s `onload()` before constructing any `LeetCode` or `Credential`**. Everything else is a straightforward Obsidian plugin.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Plugin lifecycle / onload / unload | Obsidian Plugin (runtime) | — | Standard plugin entry; `registerView` / `addSettingTab` / `addRibbonIcon` hooks |
| HTTP transport to leetcode.com | Obsidian Plugin → `requestUrl` | Electron host | `requestUrl` runs in Obsidian's main process, bypassing renderer CORS |
| Embedded LC login | Electron (main-process `BrowserWindow`) | Obsidian Plugin (orchestrator) | Only Electron can open a cross-origin window with cookie access |
| Session cookie storage | Obsidian Plugin (`data.json`) | — | `loadData()/saveData()` is the only first-class persistence Obsidian gives plugins |
| Problem-index cache | Obsidian Plugin (`data.json`) | — | ~250 KB; fits plugin data comfortably; no need for vault files |
| Problem list UI | Obsidian Workspace (right-leaf `ItemView`) | — | `ItemView` is the idiomatic dockable sidebar view |
| Settings UI | Obsidian Workspace (`PluginSettingTab`) | — | Only legitimate way to add controls to Obsidian's Settings app |
| Rate limiting | Obsidian Plugin (custom fetcher) | — | Must live inside the fetcher so all LC calls go through it by construction (D-12) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | 5.8.3 (verified 2026-04-16) | Plugin language | Sample-plugin baseline; strict-null-checks catches auth edge cases |
| obsidian | 1.12.3 (verified 2026-02-23) | Type defs + runtime API | Official type package; pinned as `latest` per sample-plugin convention |
| esbuild | 0.25.5 (project-locked, latest npm 0.28.0 2026-04-02) | Bundler | Sample-plugin default; CJS output; keeps `obsidian`/`electron`/`@codemirror/*` external |
| @leetnotion/leetcode-api | 3.0.0 (verified 2026-04-03) | LC GraphQL client | Maintained fork; custom-fetcher hook via module-level `fetcher` singleton |
| turndown | 7.2.4 (verified 2026-04-03) | HTML→Markdown | Used in Phase 2; install now to keep `package.json` stable |
| eslint-plugin-obsidianmd | 0.2.9 (verified 2026-04-30) | Plugin-review lint | Implements the community-store Required rules as `configs.recommended` |
| typescript-eslint | 8.35.1 (sample-plugin locked) | TS parser/rules | Sample-plugin baseline; needed for eslint-plugin-obsidianmd |
| @eslint/js | 9.30.1 (sample-plugin locked) | ESLint flat config | Sample-plugin baseline |
| globals | 14.0.0 (sample-plugin locked) | Global defs for flat config | Required by sample-plugin eslint.config |
| jiti | 2.6.1 (sample-plugin locked) | ESLint `.mts` loader | Sample-plugin `eslint.config.mts` needs this |
| tslib | 2.4.0 | TS helpers (`importHelpers: true`) | Sample-plugin default |

### Supporting (dev-only, for this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.5 (verified 2026-05-05) | Unit testing | Pure-logic tests (throttle, cookie-parse, slug utils, data.json migration) |
| @types/node | ^16.11.6 (sample-plugin pin) | Node types for esbuild config | Dev-only; NOT shipped in `main.js` |

**Note on esbuild version.** Sample-plugin pins 0.25.5; latest is 0.28.0. Stick with 0.25.5 for fidelity with sample-plugin — upgrading doesn't buy us anything here and the plan-check gate compares against sample-plugin defaults. [VERIFIED: npm registry + sample-plugin package.json]

### Alternatives Considered (all rejected by locked decisions)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@leetnotion/leetcode-api` | `leetcode-query` | Rejected by CLAUDE.md — leetnotion is newer-maintained; both lack run/submit anyway |
| `requestUrl` | `fetch` / `axios` | Rejected by CF-01 — CORS-blocked in Electron renderer |
| Hand-rolled GraphQL | Library | Rejected — 200-400 lines of boilerplate for operations the lib covers |
| Ship without ESLint plugin | Plain ESLint | Rejected by FND-03 / CF-05 — Required rules drive store-review |

**Installation:**
```bash
npm install --save-dev typescript@^5.8.3 esbuild@0.25.5 \
  eslint-plugin-obsidianmd@0.2.9 typescript-eslint@8.35.1 \
  @eslint/js@9.30.1 globals@14.0.0 jiti@2.6.1 tslib@2.4.0 \
  @types/node@^16.11.6 vitest@4.1.5
npm install obsidian@latest
npm install @leetnotion/leetcode-api@3.0.0 turndown@7.2.4
```

**Version verification.** All versions probed via `npm view <pkg> version time.modified` on 2026-05-07. `@leetnotion/leetcode-api` registry dependencies: `@fetch-impl/cross-fetch ^1.0.0`, `@fetch-impl/fetcher ^1.0.0`, `cross-fetch ^4.1.0`, `eventemitter3 ^5.0.4` — these install transitively; **we do not directly depend on them**, but `@fetch-impl/fetcher` is the object we mutate (see §4). [VERIFIED: npm registry 2026-05-07]

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────── Obsidian (Electron) ────────────────────────────────────┐
│                                                                          │
│  ┌──────── main.ts onload() ────────┐                                   │
│  │   1. loadSettings()              │                                   │
│  │   2. wire requestUrlFetcher      │   ← replaces @fetch-impl global   │
│  │   3. new LeetCodeClient()        │                                   │
│  │   4. registerView(BROWSER_VIEW)  │                                   │
│  │   5. addRibbonIcon + addCommand  │                                   │
│  │   6. addSettingTab               │                                   │
│  └──────────────────────────────────┘                                   │
│                │                                                         │
│                ▼                                                         │
│   ┌── user opens login ──┐                                              │
│   │ AuthService.login()  │──► BrowserWindowLogin.open('persist:leetcode')│
│   │   (shared)           │        │                                     │
│   └──────────────────────┘        ▼                                     │
│                │        did-navigate → session.cookies.get('.leetcode.com')│
│                │        ► on {LEETCODE_SESSION,csrftoken} found:        │
│                │          SettingsStore.save; emit 'auth-success'       │
│                │          win.close()                                   │
│                │        ► on window closed without cookies: Notice(cancel)│
│                │                                                         │
│                ▼                                                         │
│   ┌── ProblemBrowserView (right leaf) ──────────────────────────┐      │
│   │   onOpen:  if index stale → ProblemListService.refresh()    │      │
│   │   render:  virtualized rows from cached index               │      │
│   │   search:  in-memory title/id filter                        │      │
│   │   filter:  difficulty + status (status from user-profile)   │      │
│   └──────────────────────────────────────────────────────────────┘      │
│                │                                                         │
│                ▼                                                         │
│   ┌── LeetCodeClient (wraps @leetnotion/leetcode-api) ──────────┐      │
│   │   problems({limit, skip}), user(username)                   │      │
│   │      │                                                      │      │
│   │      ▼                                                      │      │
│   │   @fetch-impl/fetcher.fetch  (replaced at onload)          │      │
│   │      │                                                      │      │
│   │      ▼                                                      │      │
│   │   requestUrlFetcher = async (url, init) => {               │      │
│   │      await bucket.take()            // 20 tokens / 10s      │      │
│   │      return limiter.run(() => requestUrl({...}))  // max 2  │      │
│   │   }                                                         │      │
│   │      │                                                      │      │
│   │      ▼                                                      │      │
│   │   requestUrl  (Obsidian main-process, CORS-free)            │      │
│   └──────────────────────────────────────────────────────────────┘      │
│                │                                                         │
│                ▼                                                         │
│        https://leetcode.com/graphql                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (matches CONTEXT.md D-01)
```
obsidian-leetcode/
├── manifest.json              # id, name, version, minAppVersion, isDesktopOnly: true
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── eslint.config.mts          # sample-plugin's format (note .mts — needs jiti)
├── styles.css                 # .leetcode-browser scoped rules
├── versions.json              # { "<plugin-version>": "<min-obsidian-version>" }
├── version-bump.mjs           # copied from sample-plugin
├── main.js                    # BUILT — gitignored
├── README.md
├── LICENSE
├── src/
│   ├── main.ts                # Plugin class; onload() wires everything
│   ├── auth/
│   │   ├── AuthService.ts         # login(), logout(), status
│   │   ├── BrowserWindowLogin.ts  # ONLY file with `require('electron')`
│   │   ├── CookiePasteModal.ts    # fallback form (or just settings section)
│   │   └── types.ts               # { LEETCODE_SESSION, csrftoken }
│   ├── browse/
│   │   ├── ProblemBrowserView.ts  # extends ItemView
│   │   ├── ProblemListService.ts  # refresh(), search(), filter()
│   │   └── types.ts               # IndexedProblem shape
│   ├── api/
│   │   ├── LeetCodeClient.ts      # thin wrapper over @leetnotion/leetcode-api
│   │   ├── requestUrlFetcher.ts   # the shim — replaces fetcher internals
│   │   └── throttle.ts            # TokenBucket + ConcurrencyLimit
│   ├── settings/
│   │   ├── SettingsTab.ts         # extends PluginSettingTab
│   │   └── SettingsStore.ts       # loadData/saveData wrapper
│   └── shared/
│       ├── logger.ts              # console.debug gate; NO session-cookie logging (CF-03)
│       └── errors.ts              # SessionExpiredError, RateLimitError, etc.
└── tests/
    ├── throttle.test.ts
    ├── cookie-parse.test.ts
    └── slug-utils.test.ts
```

### Pattern 1: Plugin class skeleton
**What:** Top-level `Plugin` subclass orchestrating load order — settings → fetcher → client → views.
**When to use:** Every plugin `main.ts`.
**Key rule:** Fetcher replacement MUST happen before any `new Credential()` / `new LeetCode()` — `Credential.init()` calls `fetch()` eagerly.

```typescript
// src/main.ts — Source: obsidianmd/obsidian-sample-plugin/main.ts + CONTEXT.md D-01
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
    this.auth = new AuthService(this.settings);
    this.client = new LeetCodeClient(this.settings);
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this.client, this.settings));
    this.addRibbonIcon('code-2', 'Open LeetCode browser', () => this.activateBrowser());
    this.addCommand({
      id: 'open-leetcode-browser',                     // rule-compliant: no plugin id, no 'command'
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
    if (leaf) { await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true }); workspace.revealLeaf(leaf); }
  }
}
```

### Pattern 2: Fetcher replacement (the critical integration)
**What:** Replace `@leetnotion/leetcode-api`'s global `fetcher.fetch` with one that routes through `requestUrl` + our throttle.
**When to use:** Once, in `onload()`, before any `Credential` / `LeetCode` is constructed.

```typescript
// src/api/requestUrlFetcher.ts
// Source: codewithsathya/leetcode-api/src/fetch.ts + obsidian.d.ts requestUrl
import { requestUrl } from 'obsidian';
// The library ships a single module-level Fetcher instance.
// `@fetch-impl/fetcher` exposes `.fetch` that's called as fetch(input, init).
// Import-side-effect warning: importing @leetnotion/leetcode-api already calls
// useCrossFetch(fetcher). Our replacement overwrites .fetch after that ran.
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
        throw: false,             // IMPORTANT: let 4xx/5xx flow to library for parsing
      });
      // Adapt RequestUrlResponse → Fetch Response
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

### Pattern 3: Throttle (hand-rolled, D-12)
```typescript
// src/api/throttle.ts — Source: CONTEXT.md D-12 canonical pattern
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
    // Refill token bucket
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillMs) {
      this.tokens = this.cap;
      this.lastRefill = now;
    }
    // Wait for token + concurrency slot
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
**Note:** Refill is "reset to full every 10s", matching CONTEXT.md D-12 wording. Alternative (smooth refill at 2/s) is acceptable; either meets BROWSE-05.

### Pattern 4: BrowserWindow login (the only Electron import)
**What:** Open LC login in a named-partition `BrowserWindow`; poll cookies on `did-navigate` until both cookies are present.
**Key rules:** partition name `persist:leetcode` isolates cookies from any other plugin BrowserWindow; `did-navigate` fires AFTER the post-login redirect lands.

```typescript
// src/auth/BrowserWindowLogin.ts — the ONLY file allowed to import electron (D-02, CF-06)
// Source: electronjs.org BrowserWindow docs + CONTEXT.md D-03
import type { AuthCookies } from './types';

// Types-only import — actual module fetched via require() at runtime (Electron is external)
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
    win.webContents.on('did-navigate-in-page', tryCapture);  // SPA route change on LC

    win.on('closed', () => {
      if (!resolved) resolve(null);                          // D-04 silent-cancel
    });

    win.loadURL('https://leetcode.com/accounts/login/');
  });
}
```
**Notes:**
- `did-navigate-in-page` also included because LC's login success sometimes reroutes via `history.pushState` rather than a full navigation.
- Cookie persistence: `persist:leetcode` survives Obsidian restarts. To force a fresh login on logout, explicitly call `win.webContents.session.clearStorageData({ storages: ['cookies'] })` — but CONTEXT.md AUTH-05 only requires clearing our stored copy; LC cookie jar cleanup is an optional nicety for Phase 5.

### Pattern 5: ItemView (right-sidebar problem browser)
```typescript
// src/browse/ProblemBrowserView.ts — Source: obsidian.d.ts ItemView class
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore } from '../settings/SettingsStore';

export const BROWSER_VIEW_TYPE = 'leetcode-browser';

export class ProblemBrowserView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private client: LeetCodeClient, private settings: SettingsStore) {
    super(leaf);
    this.navigation = false;          // static dock view, like File Explorer (CONTEXT.md D-06)
  }
  getViewType(): string { return BROWSER_VIEW_TYPE; }
  getDisplayText(): string { return 'LeetCode problems'; }
  getIcon(): string { return 'code-2'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1];    // [0] is header, [1] is content
    root.empty();
    root.addClass('leetcode-browser');
    // ... render search box, filter bar, virtualized list ...
  }
  async onClose(): Promise<void> { /* cleanup */ }
}
```

### Anti-Patterns to Avoid
- **`workspace.activeLeaf`** — flagged by `no-unsupported-api`; use `getActiveViewOfType()` / `getRightLeaf()` instead.
- **`innerHTML = ...`** — flagged by `no-forbidden-elements` + `prefer-create-el`. Use `createEl()` for every DOM node.
- **Hotkey defaults on commands** — flagged by `commands/no-default-hotkeys`. Never pass `hotkeys:` to `addCommand()`.
- **`require('electron')` outside `BrowserWindowLogin.ts`** — enforced by D-02. Plan should include a grep gate.
- **Instantiating `LeetCode` before `installRequestUrlFetcher()`** — `Credential.init()` fires an eager `fetch()` call that will hit the raw `cross-fetch` and fail on CORS. Order matters.
- **`Object.assign(a, b)` with two args** — flagged by `object-assign`.
- **Setting styles inline** — flagged by `no-static-styles-assignment`. Use CSS class toggles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL problem/submissions queries | Query strings | `@leetnotion/leetcode-api` | 200+ lines saved; maintained |
| CORS-bypassing HTTP | Proxy/shim | `requestUrl` | Obsidian-native; zero cost |
| DOM helpers (`createEl` etc.) | Vanilla DOM + innerHTML | Obsidian `createEl` / `createDiv` | ESLint rule + XSS safety |
| Cookie parsing for auth response | Regex | `session.cookies.get()` in BrowserWindow | Electron API gives structured cookie objects |
| HTML→Markdown (later phases) | Hand-roll | `turndown` | Rejected alternatives in CLAUDE.md |
| Settings form widgets | Custom UI | `Setting` builder chain | Styles correctly + plays with Obsidian theme |

**Key insight:** Every hand-rolled piece in Phase 1 (throttle, cookie polling loop, virtualized list) is small (<50 LOC) and lives behind a single surface. Anything larger has a first-party or stack-locked library.

## Common Pitfalls

### Pitfall 1: Fetcher replaced too late
**What goes wrong:** `Credential.init()` runs eagerly on construction; if `installRequestUrlFetcher()` hasn't replaced `fetcher.fetch` yet, the init call hits `cross-fetch` directly and fails with CORS.
**Why it happens:** Common instinct is to construct services in field initializers.
**How to avoid:** Fetcher install is step 2 of `onload()`, before any `new LeetCodeClient()` / `new Credential()`. Add a unit test asserting `installRequestUrlFetcher` is called before the first LC call.
**Warning signs:** `TypeError: Failed to fetch` or `net::ERR_FAILED` in console on plugin load.

### Pitfall 2: `did-navigate` fires before cookies land
**What goes wrong:** LC sets `LEETCODE_SESSION` via `Set-Cookie` on the login POST; the subsequent redirect triggers `did-navigate` but cookie store may not yet reflect the new cookies on some OS/Electron builds.
**Why it happens:** Cookie commit and navigation event are racy on Electron for Set-Cookie on POST responses.
**How to avoid:** (a) also listen for `did-navigate-in-page` and `dom-ready`; (b) on each event, poll once — if cookies absent, just return and wait for the next event; (c) don't require a single-shot grab.
**Warning signs:** User logs in successfully but plugin never fires `onSuccess`; window remains open.

### Pitfall 3: Partition leakage
**What goes wrong:** If `partition` is omitted or reused across plugins, login cookies bleed into other `BrowserWindow` instances (e.g., a user's Kindle-sync plugin).
**Why it happens:** Default partition is shared.
**How to avoid:** Always pass `webPreferences.partition: 'persist:leetcode'`. `persist:` prefix = survives restarts.
**Warning signs:** User reports login state "sticks" after uninstalling the plugin, or appears in unrelated plugins.

### Pitfall 4: esbuild bundles obsidian / electron / CM6
**What goes wrong:** Without the `external: [...]` list, esbuild inlines the runtime-provided modules, blowing up `main.js` and causing version conflicts.
**Why it happens:** Default esbuild bundling.
**How to avoid:** Copy `obsidianmd/obsidian-sample-plugin`'s `external` array verbatim — it already excludes `obsidian`, `electron`, all `@codemirror/*`, `@lezer/*`, and `builtinModules`.
**Warning signs:** `main.js` over 500 KB unminified, or `require is not defined` at runtime.

### Pitfall 5: Session cookie logged to console
**What goes wrong:** Debug `console.log(this.settings)` dumps `LEETCODE_SESSION` to dev tools.
**Why it happens:** Inexperienced logging hygiene.
**How to avoid:** `shared/logger.ts` MUST redact any object key matching `/session|csrf|cookie/i`. Enforce via a grep gate: `grep -r LEETCODE_SESSION src/ --include='*.ts' | grep -v 'settings-key\|auth\|type-definitions'` should be empty outside the auth module.
**Warning signs:** Session token visible in developer console or in exported log files.

### Pitfall 6: ESLint `--fix` rewrites sentence-case text
**What goes wrong:** `ui/sentence-case` is autofixable. Running `eslint --fix` rewrites user-facing strings in ways that may break translations or grammar.
**Why it happens:** Rule defaults to `fixable`.
**How to avoid:** Set `"obsidianmd/ui/sentence-case": "warn"` or gate `--fix` behind review. Use sentence case in source from day 1.
**Warning signs:** Strings unexpectedly change casing after a lint pass.

### Pitfall 7: `manifest.json` not yet valid for plugin review
**What goes wrong:** Missing `fundingUrl`, description ending without period, or `id` containing 'obsidian' causes rejection.
**Why it happens:** Forgot Review rules.
**How to avoid:** `validate-manifest` rule in the ESLint plugin catches these. Run `npm run lint` before every commit.
**Warning signs:** ESLint reports `validate-manifest` failure; community-store PR bot rejects.

## Code Examples

### `esbuild.config.mjs` (copy verbatim from sample-plugin)
```javascript
// Source: obsidianmd/obsidian-sample-plugin/esbuild.config.mjs — verified 2026-05-07
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from 'node:module';

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

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
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) { await context.rebuild(); process.exit(0); }
else { await context.watch(); }
```

### `tsconfig.json` (copy verbatim from sample-plugin)
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "strictBindCallApply": true,
    "allowSyntheticDefaultImports": true,
    "useUnknownInCatchVariables": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

### `eslint.config.mts` (adapt from sample-plugin)
```typescript
// Source: obsidianmd/obsidian-sample-plugin/eslint.config.mts — verified 2026-05-07
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

### `manifest.json` (project-specific)
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
**Critical:** `"isDesktopOnly": true` — FND-02. `id` does not contain the word "obsidian" — enforced by `validate-manifest`.

### `requestUrl` adapter signature (reference)
```typescript
// Source: obsidianmd/obsidian-api/obsidian.d.ts:5275 — verbatim
export function requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise;
export interface RequestUrlParam {
  url: string;
  method?: string;
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  /** Whether to throw an error when the status code is 400+ (default true) */
  throw?: boolean;
}
export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: any;
  text: string;
}
```
**For our fetcher:** pass `throw: false` — the library already inspects response status and may want to parse error bodies (e.g., a 401 page). Returning a `Response` with the right status lets the library's HTTP error path fire normally.

### `@leetnotion/leetcode-api` — verified call shapes
```typescript
// Source: codewithsathya/leetcode-api/src/leetcode.ts — verbatim method signatures
class LeetCode extends BaseLeetCode {
  constructor(credential: Credential | null = null, cache = new Cache());

  async problems({ category = '', offset = 0, limit = 100, filters = {} }: QueryParams = {})
    : Promise<ProblemList>;  // NOTE: param is `offset`, not `skip`. README examples use both; source uses offset.

  async user(username: string): Promise<UserProfile>;
  async whoami(): Promise<Whoami>;
  async submissions({ limit = 20, offset = 0 }): Promise<Submission[]>;  // auth required
}

interface ProblemList {
  total: number;
  questions: Array<{
    acRate: number;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    freqBar: null;
    questionFrontendId: string;    // this is the user-visible LC id ("1", "2", "2349")
    isFavor: boolean;
    isPaidOnly: boolean;
    status: string | null;          // 'ac' | 'notac' | null (for auth'd calls)
    title: string;
    titleSlug: string;
    topicTags: { name: string; id: string; slug: string }[];
    hasSolution: boolean;
    hasVideoSolution: boolean;
  }>;
}

// Credential usage
import { LeetCode, Credential } from '@leetnotion/leetcode-api';
const cred = new Credential();
await cred.init('YOUR_LEETCODE_SESSION');  // session-cookie string, NOT an object
// NOTE: cred.init() calls fetch() internally to bootstrap csrf — our fetcher MUST be installed first.
const lc = new LeetCode(cred);
```

### GraphQL error detection (CF-04, AUTH-04)
```typescript
// Source: codewithsathya/leetcode-api/src/base-leetcode.ts + src/types.ts
// LeetCodeGraphQLResponse type only declares `data: any` in the lib's types.ts,
// BUT GraphQL responses contain `errors` alongside `data` when the server rejects a query.
// On expired session, LC returns 200 OK with shape:
//   { data: null, errors: [{ message: 'You must be logged in.', ... }] }
// Detection pattern:
function isSessionExpired(resp: unknown): boolean {
  const r = resp as { errors?: Array<{ message?: string }> };
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e.message ?? '')
  );
}
```
**Library caveat:** `graphql()` returns `{ data: any }`; the lib strips/ignores `errors`. To detect expiry we must either (a) wrap the fetcher to inspect the raw response body before handing back, OR (b) check `data === null` inside the client wrapper. Option (b) is simpler and equivalent for our use case. [ASSUMED: exact LC error message text — multi-source reports converge but not verified against live service this session]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@electron/remote` for `BrowserWindow` | `require('electron')` direct | Electron ≥14 (2021) | No extra dep; works in Obsidian's current host |
| ESLint v8 `.eslintrc` | Flat config `eslint.config.mts` | sample-plugin migrated 2025 | Needs `jiti` for `.mts`; `typescript-eslint` 8.x |
| `leetcode-query` | `@leetnotion/leetcode-api` 3.x | 2026-03-28 | Newer maintainer; API-compatible |
| esbuild 0.17.x target `es2018` | Same | Stable | Sample-plugin still pins 0.25.5 |

**Deprecated/outdated:**
- `@electron/remote` — don't use.
- `workspace.activeLeaf` direct access — deprecated, flagged by ESLint plugin.
- `Vault.modify()` on active file — use `processFrontMatter()` / `vault.process()` (Phases 2/4 concern).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LC session-expiry GraphQL error contains phrases like "logged in" / "authenticated" | Pattern 5 / Pitfall discussion | Session-expiry detection may miss; fallback: treat `data === null` as expired |
| A2 | `did-navigate-in-page` fires on LC's SPA login success | Pattern 4 | Users may hit window-close-without-cookies path; redo with `dom-ready` polling |
| A3 | `persist:leetcode` partition is unused by other Obsidian plugins (no collision) | §4 partition isolation | Very low risk — plugins rarely choose this exact string |
| A4 | `@leetnotion/leetcode-api` module-eval calls `useCrossFetch(fetcher)` once, mutation persists | Pattern 2 | If the lib resets fetcher internally per request, our shim is defeated — mitigation: wrap `LeetCodeClient` to install fetcher in its constructor too |

## Project Constraints (from CLAUDE.md)

- **Tech stack locked:** TypeScript 5.8.3, esbuild 0.25.5, `@leetnotion/leetcode-api` 3.0.0, `turndown` 7.2.4, `vitest` 4.1.5, `eslint-plugin-obsidianmd` 0.2.9.
- **HTTP:** only `requestUrl`. `fetch`/`axios` forbidden.
- **DOM:** `createEl()` only. `innerHTML` forbidden.
- **Electron imports:** only in `src/auth/BrowserWindowLogin.ts`.
- **Desktop-only:** `"isDesktopOnly": true`.
- **Data storage:** `this.loadData()` / `this.saveData()` — NOT custom files under `.obsidian/plugins/`.
- **Cache sizing:** problem index only (~250 KB) — never pre-warm full HTML (destroys `data.json`).
- **Plugin ID:** must NOT contain 'obsidian'. Recommended: `"leetcode"`.
- **No default hotkeys** — do not set `hotkeys:` on `addCommand()`.
- **CodeMirror externals:** mark all `@codemirror/*` and `@lezer/*` as external in esbuild.
- **GSD workflow enforcement:** all file-changing tools go through a GSD command — applies to Phase 1 execution.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build / vitest | ✓ | 24.13.1 (via mise) | — |
| npm | package install | ✓ | 11.8.0 | — |
| TypeScript (project-local) | build | ✗ (not installed yet) | — | `npm install` pulls it |
| ESLint (project-local) | lint gate | ✗ (not installed yet) | — | `npm install` pulls it |
| Obsidian 1.5+ (desktop) | smoke test | not probed (user's machine) | — | Required for FND-01/FND-05 manual gate |

**Missing dependencies with no fallback:** None — all toolchain comes from `npm install` once `package.json` is authored.

**Desktop Obsidian for smoke testing:** the planner should require manual validation that the plugin loads in Obsidian 1.5+ on macOS (author's platform). Cross-platform smoke tests (Windows, Linux) are tracked as a blocker in STATE.md — can defer to Phase 5 if too costly, but BrowserWindow timing is platform-specific (STATE.md blocker).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` (to create — see Wave 0) |
| Quick run command | `npx vitest run --reporter=default` |
| Full suite command | `npm test` (alias to `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | Plugin installs + loads in desktop Obsidian 1.5+ | manual-only (smoke) | Load in dev vault + verify no console errors | ❌ Wave 0 |
| FND-02 | `manifest.json` has `"isDesktopOnly": true` | static | `node -e "process.exit(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).isDesktopOnly ? 0 : 1)"` | ❌ Wave 0 |
| FND-03 | Lint passes with zero Required violations | static | `npm run lint` (must exit 0) | ❌ Wave 0 |
| FND-04 | All HTTP goes through `requestUrl` | static + unit | `grep -rE "(fetch\|axios)\(" src/ --include='*.ts' \| grep -v 'fetcher.fetch\|cross-fetch'` returns empty; unit test verifies `installRequestUrlFetcher` replaces `fetcher.fetch` | ❌ Wave 0 |
| FND-05 | Enable/disable without crashes | manual-only (smoke) | Toggle plugin off/on in Obsidian; verify no Electron errors | — |
| AUTH-01 | Embedded login opens LC `/accounts/login/` | manual-only (smoke) | Click Login button, observe BrowserWindow; cannot unit test Electron window | — |
| AUTH-02 | Cookies captured + persisted | manual + unit | Manual: successful login persists state across restart; unit: `parseLeetCodeCookies()` extracts LEETCODE_SESSION and csrftoken from a fixture cookie list | ❌ Wave 0 |
| AUTH-03 | Manual cookie paste works | manual + unit | Manual: paste cookies in settings, confirm state=logged-in; unit: `SettingsStore.setAuthCookies()` persists via `saveData()` | ❌ Wave 0 |
| AUTH-04 | Session expiry detected | unit | `isSessionExpired({data:null, errors:[{message:'You must be logged in.'}]})` → true; false for `{data: {...}, errors: undefined}` | ❌ Wave 0 |
| AUTH-05 | Logout clears creds | unit | `AuthService.logout()` then `SettingsStore.getAuthCookies()` returns null | ❌ Wave 0 |
| AUTH-06 | Cookies never logged | static | `grep -rE "console\\.(log\|debug\|info).*\\b(session\|LEETCODE_SESSION\|csrftoken)\\b" src/` returns empty | ❌ Wave 0 |
| BROWSE-01 | Ribbon icon + command open browser | manual-only (smoke) | Click ribbon icon; verify right-sidebar view opens | — |
| BROWSE-02 | Lazy load — no bulk download | unit | Mock `client.problems()`; confirm `ProblemListService.refresh()` pages with `limit=50` + `offset` cursor | ❌ Wave 0 |
| BROWSE-03 | Title/id search | unit | `searchProblems(['two-sum','add-two-numbers'], 'two')` returns both; `searchProblems(idx, '1')` matches id-1 | ❌ Wave 0 |
| BROWSE-04 | Difficulty + status filter | unit | `filterProblems(idx, {difficulty:'Easy'})` returns only Easy | ❌ Wave 0 |
| BROWSE-05 | Throttle 20 req / 10s, max 2 concurrent | unit | Fake-timers test: 25 `throttle.acquire()` calls complete in ≥10s with ≤2 in-flight at any time | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=default` + `npm run lint`
- **Per wave merge:** `npm run build && npm test && npm run lint` (full gate)
- **Phase gate:** full suite green, `tsc --noEmit` clean (implicit in `npm run build`), manual smoke pass on macOS Obsidian 1.5+

### Wave 0 Gaps
- [ ] `vitest.config.ts` — project-local test config, `environment: 'node'`, exclude `main.js`
- [ ] `tests/throttle.test.ts` — covers BROWSE-05
- [ ] `tests/cookie-parse.test.ts` — covers AUTH-02 pure parser
- [ ] `tests/session-expiry.test.ts` — covers AUTH-04
- [ ] `tests/search-filter.test.ts` — covers BROWSE-03 + BROWSE-04
- [ ] `tests/problems-pagination.test.ts` — covers BROWSE-02 (mocked client)
- [ ] `tests/settings-store.test.ts` — covers AUTH-03 + AUTH-05
- [ ] `tests/fetcher-install.test.ts` — covers FND-04 unit portion (mocks `fetcher` object)
- [ ] Framework install: `npm install --save-dev vitest@4.1.5`
- [ ] Package.json script: `"test": "vitest run"`
- [ ] Static gates scripts: `"lint": "eslint ."` (ESLint flat config), `"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"`

**Cannot unit-test without live Obsidian:** plugin `onload()`, `ItemView` DOM rendering, Electron `BrowserWindow`, ribbon/command-palette wiring. These are validated manually via desktop Obsidian smoke testing per the roadmap success criteria.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session cookies stored in `data.json` only (CF-03); never transmitted off leetcode.com |
| V3 Session Management | yes | Session-expiry detection + re-auth prompt (CF-04, AUTH-04) |
| V4 Access Control | n/a | No multi-user / no privilege tiers in plugin |
| V5 Input Validation | yes | Cookie-paste field: validate string shape (non-empty, ≤ reasonable length) before `saveData` |
| V6 Cryptography | yes (negative) | **Do not** hand-roll crypto; cookies are opaque tokens treated as strings |
| V7 Error Handling | yes | Errors never surface cookie values (logger redacts session/csrf keys) |

### Known Threat Patterns for {Obsidian plugin + LC}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via LC-returned HTML | Tampering | `turndown` HTML→MD (Phase 2); `createEl` in Phase 1; `no-forbidden-elements` rule |
| Session exfiltration via debug log | Info disclosure | Logger redaction; grep-gate on cookie names outside `auth/`; POLISH-03 manifest |
| Credential leakage via unrelated plugin | Info disclosure | `persist:leetcode` partition isolates cookie jar; Electron imports confined to one file |
| CSRF on LC-origin calls | Tampering | Library sends `x-csrftoken` header from stored csrf cookie — standard LC protocol |
| Malicious store-submitted plugin mimicking | Spoofing | Out of Phase 1 scope; handled at store-review time |
| `innerHTML` injection from LC HTML | Tampering | `prefer-create-el` + `no-forbidden-elements` rules |
| Rate-limit bypass / ban risk | Repudiation | 20 req/10s + concurrency 2 ceiling (BROWSE-05); 429 one-shot Notice (D-14) |

**Phase 1 specific:** the auth flow writes one secret (`LEETCODE_SESSION`) to `data.json` on disk in plaintext. This matches the Obsidian plugin norm (all plugins that store API keys do the same) and is acceptable per PROJECT.md §Constraints ("Session cookie lives in local plugin data only"). No additional encryption layer needed; `data.json` is already outside the vault content folder tree.

## Sources

### Primary (HIGH confidence)
- `obsidianmd/obsidian-api/obsidian.d.ts` (GitHub raw, master) — extracted requestUrl, Plugin, ItemView, Setting, Notice signatures (lines 5275–5312, 4467, 5528, 7252) — fetched 2026-05-07
- `obsidianmd/obsidian-sample-plugin` — esbuild.config.mjs, tsconfig.json, manifest.json, package.json, eslint.config.mts (master branch) — fetched 2026-05-07
- `obsidianmd/eslint-plugin` (npm name `eslint-plugin-obsidianmd`) README — full Required rules list, flat-config recipe — fetched 2026-05-07
- `codewithsathya/leetcode-api` src/fetch.ts, src/credential.ts, src/base-leetcode.ts, src/leetcode.ts, src/types.ts, src/mutex.ts, src/cache.ts — verified problems() signature, fetcher singleton model, graphql() error flow — fetched 2026-05-07
- npm registry (`npm view <pkg> version time.modified`) for all package versions — verified 2026-05-07
- electronjs.org BrowserWindow docs — webPreferences.partition, close/closed events — fetched 2026-05-07

### Secondary (MEDIUM confidence)
- electron session.cookies.get() shape — inferred from multiple community code samples; Electron docs page not fully fetched this session. Cookie object shape (`name`, `value`, `domain`, `path`, `expirationDate`) is stable and well-documented elsewhere.
- `did-navigate-in-page` behavior on SPA redirects — community-reported, not formally specified by Electron for cross-origin POST redirect flows.

### Tertiary (LOW confidence, flagged ASSUMED)
- Exact LC GraphQL expiry error message text (Assumption A1) — `/logged in|authenticated|CSRF/i` pattern derived from community plugin sources; not verified against live service in this session. Mitigation: use `data === null` as the primary signal.

## Open Questions (RESOLVED)

1. **Does `@leetnotion/leetcode-api` re-apply `useCrossFetch(fetcher)` on any later operation?**
   - What we know: module-load calls it once; no evidence of re-application.
   - What's unclear: whether any code path inside Credential.refresh() or a reset method calls it again.
   - Recommendation: Plan includes a lightweight integration test that constructs a `LeetCode`, calls `problems({limit:1})`, and verifies the request arrived at our `requestUrl` shim (not `cross-fetch`).
   - RESOLVED — Plan 02 installRequestUrlFetcher is idempotent; re-import safety handled by closure scoping.

2. **Should `persist:leetcode` cookies be cleared on logout?**
   - What we know: CONTEXT.md AUTH-05 only requires clearing *our* stored copy. But if user logs out then logs back in, the BrowserWindow will auto-login from its persisted cookies, which is user-confusing.
   - What's unclear: whether users expect a "full logout" or a "plugin forgets you".
   - Recommendation: Phase 1 does the minimum (clear `data.json` only). Plan a follow-up in Phase 5 (POLISH) to also clear the Electron partition on logout.
   - RESOLVED — Phase 1 clears data.json cookies only per AUTH-05; Electron `persist:leetcode` partition cleanup deferred to Phase 5 polish.

3. **Best icon name for the ribbon?**
   - What we know: Obsidian uses Lucide icons. `code-2` is a reasonable LC-adjacent icon.
   - What's unclear: whether a better icon exists for "problem list".
   - Recommendation: `code-2` in Phase 1; revisit in Phase 5 polish.
   - RESOLVED — `code-2` Lucide icon per UI-SPEC.md.

4. **Virtualized list implementation: hand-rolled IntersectionObserver vs tiny lib?**
   - What we know: CONTEXT.md "Claude's Discretion" — prefer hand-rolled.
   - What's unclear: performance on 3,300-row list in production Electron.
   - Recommendation: Ship hand-rolled IntersectionObserver-based virtualization in Phase 1. Only swap if dogfooding shows jank.
   - RESOLVED — hand-rolled render-all per Claude's Discretion; IntersectionObserver virtualization deferred to dogfooding-driven polish.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified via npm registry, every file's contents verified against GitHub raw master
- Architecture patterns: HIGH — all type signatures extracted verbatim from `obsidian.d.ts`; all behavior verified against sample-plugin source and leetcode-api source
- Integration (fetcher wiring): MEDIUM-HIGH — we've read the source; integration test needed to confirm mutation persistence (Open Question 1)
- Pitfalls: MEDIUM — most are general Obsidian-plugin lore with community evidence; "did-navigate race" is community-reported but platform-variable
- Security domain: HIGH — straightforward application of Obsidian norms; no custom crypto
- Validation architecture: HIGH — vitest + manual smoke is the canonical Obsidian plugin gate

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — Obsidian + ecosystem is stable; only `esbuild` has had a minor release recently)

---

## RESEARCH COMPLETE

**Phase:** 1 — plugin-foundation
**Confidence:** HIGH

### Key Findings
- Sample-plugin baseline is copy-paste ready; `esbuild.config.mjs`, `tsconfig.json`, and `eslint.config.mts` need no modification beyond adding `isDesktopOnly: true` and the plugin id.
- `@leetnotion/leetcode-api` exposes its custom fetcher via a **module-level `fetcher` singleton from `@fetch-impl/fetcher`** — the integration point is `fetcher.fetch = async (input, init) => { ... }`. Replacement MUST run before any `Credential` / `LeetCode` is constructed (Credential.init() fires an eager fetch).
- `requestUrl({url, method, headers, body, throw: false})` returns `{status, headers, text, json, arrayBuffer}` — adapt by wrapping in `new Response(res.text, { status, headers })` to satisfy the library's Fetch-API expectation.
- `eslint-plugin-obsidianmd@0.2.9` ships a `configs.recommended` that enables 30+ Required rules covering the Obsidian store-review criteria (manifest validation, no default hotkeys, no forbidden elements, prefer-create-el, platform/API version checks).
- Electron `BrowserWindow` with `webPreferences.partition: 'persist:leetcode'` + dual `did-navigate` / `did-navigate-in-page` listeners is the canonical login-cookie-capture pattern; isolates cookie jar from other plugins.
- Session expiry is most reliably detected by checking `response.data === null` on GraphQL replies (LC's expired-session error shape is consistent; message text not verified in this session — flagged as Assumption A1).

### File Created
`.planning/phases/01-plugin-foundation/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | npm versions + sample-plugin files verified verbatim |
| Architecture | HIGH | All API signatures extracted from obsidian.d.ts and leetcode-api source |
| Fetcher integration | MEDIUM-HIGH | Source read; live-integration smoke test recommended in plan |
| Pitfalls | MEDIUM | Community-documented; BrowserWindow timing is platform-variable |
| Validation | HIGH | Vitest + manual smoke is the canonical Obsidian plugin gate |

### Open Questions
1. Does `@leetnotion/leetcode-api` ever re-apply its internal `useCrossFetch(fetcher)`? (Mitigation: lightweight integration test in plan.)
2. On logout, clear Electron `persist:leetcode` cookies or leave them? (Phase 1 does minimum; Phase 5 polish candidate.)
3. Ribbon icon name. (`code-2` default; polish later.)
4. Virtualized list: hand-rolled vs tiny lib. (Hand-rolled default per CONTEXT.md discretion.)

### Ready for Planning
Research complete. Planner can now create PLAN.md files mapping these 16 requirements (FND-01..05, AUTH-01..06, BROWSE-01..05) to concrete task waves, with Wave 0 creating the scaffold + test framework, Wave 1 wiring fetcher + client + throttle, Wave 2 building auth service + settings tab, and Wave 3 assembling the browser view.
