---
phase: 01-plugin-foundation
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/main.ts
  - src/api/LeetCodeClient.ts
  - src/api/requestUrlFetcher.ts
  - src/api/throttle.ts
  - src/auth/AuthService.ts
  - src/auth/BrowserWindowLogin.ts
  - src/auth/CookiePasteModal.ts
  - src/auth/types.ts
  - src/browse/ProblemBrowserView.ts
  - src/browse/ProblemListService.ts
  - src/browse/types.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - src/shared/errors.ts
  - src/shared/logger.ts
findings:
  critical: 5
  warning: 6
  info: 4
  total: 15
status: fixed
fixes_applied_at: 2026-05-07T20:38:00Z
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

The plugin foundation is structurally sound — lifecycle ordering, cookie isolation, CORS bypass via `requestUrl`, and the DOM/no-innerHTML discipline are all correctly implemented. However, five issues rise to BLOCKER level: two security problems (credentials can leak via `logger.error` and `SettingsStore.load` merges untrusted disk data without type-guarding sensitive fields), two correctness bugs in the throttle (token decrement races with refill, `running` can go negative on excess `release()` calls), and one liveness bug (the `BrowserWindowLogin` window is never closed after a successful cookie capture that closes the window before the `closed` event fires the resolver). Six warnings cover missing error propagation, an unguarded timer type mismatch, and several silent-failure paths.

---

## Critical Issues

### CR-01: `logger.error` does not redact — auth objects passed as `err` are logged in plaintext

**File:** `src/shared/logger.ts:33`
**Issue:** The `logger.error` method passes `err` directly to `console.error` without calling `redact()`. Every other method (`debug`, `info`, `warn`) routes the context argument through `redact()`, but `error` bypasses it. If any call site passes an error whose `.message`, `.config`, or `.response` contains a CSRF token or session cookie value, the raw value appears in the browser console (visible to any devtools-open session) and in Obsidian's debug log file. This is a direct violation of AUTH-06 ("cookies never logged").

**Fix:**
```typescript
// src/shared/logger.ts
error: (msg: string, err?: unknown): void => {
  // Route through redact to satisfy AUTH-06; error objects carry request configs
  // that may include Authorization / Cookie headers.
  console.error(`[leetcode] ${msg}`, err !== undefined ? redact(err) : '');
},
```

Note: `redact()` only walks one level of object keys. If `err` is an `Error` instance, `Object.entries` returns nothing (Error properties are non-enumerable), so the `Error` object itself would be returned unmodified. The fix must also handle `Error` instances:

```typescript
function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  // Unwrap Error so its enumerable-equivalent message/stack surface for redaction.
  const plain: Record<string, unknown> = obj instanceof Error
    ? { name: obj.name, message: obj.message, stack: obj.stack, ...(obj as unknown as Record<string, unknown>) }
    : (obj as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plain)) {
    out[k] = REDACT.test(k) ? '[REDACTED]' : v;
  }
  return out;
}
```

---

### CR-02: `SettingsStore.load` spreads raw disk data directly into `PluginData` — malicious `data.json` can override `version` type and inject unexpected fields

**File:** `src/settings/SettingsStore.ts:32`
**Issue:** `{ ...DEFAULT_DATA, ...(raw ?? {}), version: 1 }` spreads the entire raw object from `plugin.loadData()` with no type validation. `loadData()` deserializes whatever JSON is on disk. An attacker (or corrupt file) can set `auth` to a non-`AuthCookies` shape (e.g. an object containing a `toString` override), set `problemIndex` to a multi-megabyte blob, or inject extra keys that downstream code coerces unexpectedly. Concretely:

- `auth` is spread without checking that it is `{ LEETCODE_SESSION: string, csrftoken: string } | null`. A crafted `data.json` with `"auth": { "LEETCODE_SESSION": 1234 }` passes TypeScript's spread silently (type assertion on line 31 is `Partial<PluginData> | null`) and flows into `Credential.init()` as a non-string.
- `problemsFolder` is spread without stripping path traversal characters. A value of `"../../.ssh"` would be persisted and later used to create vault files (Phase 5) under an attacker-controlled path.

**Fix:** Validate each field individually on load:

```typescript
static async load(plugin: Plugin): Promise<SettingsStore> {
  const raw = (await plugin.loadData()) as Record<string, unknown> | null ?? {};
  const data: PluginData = {
    version: 1,
    auth: isValidAuthCookies(raw.auth) ? raw.auth : DEFAULT_DATA.auth,
    username: typeof raw.username === 'string' ? raw.username : DEFAULT_DATA.username,
    problemsFolder: typeof raw.problemsFolder === 'string' && raw.problemsFolder.trim()
      ? raw.problemsFolder.replace(/\/+$/, '')
      : DEFAULT_DATA.problemsFolder,
    defaultLanguage: typeof raw.defaultLanguage === 'string' && raw.defaultLanguage.trim()
      ? raw.defaultLanguage
      : DEFAULT_DATA.defaultLanguage,
    problemIndex: isValidProblemIndex(raw.problemIndex) ? raw.problemIndex : DEFAULT_DATA.problemIndex,
  };
  return new SettingsStore(plugin, data);
}

function isValidAuthCookies(v: unknown): v is AuthCookies {
  return (
    v !== null && typeof v === 'object' &&
    typeof (v as AuthCookies).LEETCODE_SESSION === 'string' &&
    typeof (v as AuthCookies).csrftoken === 'string'
  );
}
```

---

### CR-03: Token bucket refill races with `tokens--` — tokens can go below zero and one-slot budget is silently consumed by the refill check

**File:** `src/api/throttle.ts:55-98`
**Issue:** In `acquire()`, the refill check on lines 57-60 runs only once at the top of the method before entering the `while` loop. After a waiter is woken from inside the loop (line 90-94), the refill re-check runs again correctly. However, between exiting the loop at line 95 and reaching `this.tokens--` at line 96, no re-check of `this.tokens <= 0` occurs outside the loop guard. If two concurrent `acquire()` calls both exit the `while` loop simultaneously (possible because `release()` on line 104 calls `_setTimeout(w, 0)` which schedules two wakers in the same microtask tick via back-to-back `shift()`-then-`setTimeout`), both could see `this.tokens === 1`, both pass the `while` condition, and both execute `this.tokens--` — resulting in `tokens === -1`. Subsequent requests then require a full refill window even though capacity exists.

Additionally, on line 91-94, after being woken by the timer path, `this.tokens` is set to `this.cap` but then falls through to `this.tokens--` at line 96 immediately, which is correct. However, if `maxConc` blocked (not the token bucket), the refill branch still fires and wastes the full-bucket reset. This is a semantic bug: a concurrency-blocked waiter should not trigger a token refill.

**Fix:** Move the `tokens--` / `running++` increment inside a re-validated critical section, or use the existing `while` loop as the single gate:

```typescript
// After the while loop exits, tokens > 0 AND running < maxConc.
// No concurrent path can sneak in between because JS is single-threaded
// EXCEPT if release() dispatches via setTimeout(w, 0) and two waiters
// are both sitting in the await. Guard with a re-check:
if (this.tokens <= 0 || this.running >= this.maxConc) {
  // Spurious wake — re-enter loop (the while condition handles this already,
  // but making it explicit prevents the double-decrement).
  // In practice the while loop above already handles this; the real fix is
  // to NOT call _setTimeout in release() — call w() directly:
}
```

The simplest correct fix is in `release()`: replace `_setTimeout(w, 0)` with a direct `w()` call. Scheduling via `setTimeout` introduces a tick gap during which a second concurrent `acquire()` can also exit the while loop with the same token count:

```typescript
release(): void {
  this.running--;
  const w = this.waiters.shift();
  this.emitDepthChange();
  if (w) w();  // synchronous wake keeps single-threaded invariant intact
}
```

---

### CR-04: `running` counter can go negative — `release()` has no guard against over-release

**File:** `src/api/throttle.ts:100-105`
**Issue:** `release()` unconditionally decrements `this.running` on line 101 without checking that `this.running > 0`. If `release()` is called more times than `acquire()` has returned (e.g. due to an exception thrown after `acquire()` but before the request increments, or if the `finally` in `requestUrlFetcher.ts` fires on a code path that never fully completed `acquire()`), `running` goes negative. A negative `running` means `this.running >= this.maxConc` is false even when `maxConc` concurrent requests are actually in flight, so the concurrency cap is silently bypassed.

Looking at `requestUrlFetcher.ts` lines 33-61: `throttle.acquire()` is called at line 33, and `throttle.release()` in `finally` at line 59. If `acquire()` itself throws (though currently it does not), the `finally` would still run against a `running` value that was never incremented. This is a latent bug today but a correctness guarantee that should be encoded defensively.

**Fix:**
```typescript
release(): void {
  if (this.running > 0) this.running--;
  const w = this.waiters.shift();
  this.emitDepthChange();
  if (w) w();
}
```

---

### CR-05: `BrowserWindowLogin` — `win.close()` is called before the `closed` event; the `closed` listener then resolves `null` over the already-resolved promise (harmless in JS but signals a logic error), AND the window is NOT closed on the cancel path if the user never triggers navigation

**File:** `src/auth/BrowserWindowLogin.ts:103-126`
**Issue:** In `tryCapture()` (line 97), when cookies are captured: `resolved = true`, `resolve(extracted)`, then `win.close()`. This is correct for the success path. However, on the `closed` event handler (line 121), the guard is `if (!resolved) resolve(null)`. Because `resolved` is set synchronously before `win.close()`, the `closed` event handler fires after `resolved === true` and does nothing — this part is fine.

The actual bug is on the `win.close()` call inside `tryCapture()`: if `win.close()` throws (e.g. the window was already destroyed by the OS), the error propagates out of the `async tryCapture()` function into the `void tryCapture()` fire-and-forget call at line 115. Because it is `void`-cast, the rejection is unhandled. The `closed` listener never fires (window already gone), so the promise hangs forever — the caller's `await openLogin()` never settles, permanently blocking the auth flow.

Additionally, the `loadURL` call on line 125 is `void`-cast. If `loadURL` rejects (network down, invalid URL), the error is swallowed and the window sits blank with no feedback and no way to close programmatically.

**Fix:**
```typescript
const tryCapture = async (): Promise<void> => {
  try {
    const cookies = await win.webContents.session.cookies.get({ domain: '.leetcode.com' });
    const extracted = extractAuthCookies(cookies);
    if (extracted && !resolved) {
      resolved = true;
      resolve(extracted);
      try { win.close(); } catch { /* already destroyed — closed event will fire */ }
    }
  } catch {
    // Ignore transient cookie-get errors.
  }
};

// For loadURL:
win.loadURL('https://leetcode.com/accounts/login/').catch(() => {
  // If the initial load fails, surface it so the window doesn't hang silently.
  if (!resolved) { resolved = true; resolve(null); }
  try { win.close(); } catch { /* ignore */ }
});
```

---

## Warnings

### WR-01: `rebuildClientSync` calls `cred.init()` with `void` — init failure is permanently silenced

**File:** `src/api/LeetCodeClient.ts:28`
**Issue:** `void cred.init(cookies.LEETCODE_SESSION)` discards the promise. If `Credential.init()` rejects (network error, malformed cookie), the rejection becomes an unhandled promise rejection. Worse, `this.lc` is set to `new LeetCode(cred)` on line 27 before `cred.init()` is called, so the client is handed to the rest of the plugin in a partially-initialised state (credential not yet bootstrapped). The async `reauthenticate()` on line 32 does this correctly — `rebuildClientSync` should be replaced or clearly documented as intentionally fire-and-forget.

The real risk: if `rebuildClientSync` is the only path taken at plugin load when cookies already exist (e.g. on a non-first run), and `cred.init()` silently fails, all subsequent API calls are issued with an unauthenticated client that returns null `data` fields — indistinguishable from session expiry, causing a spurious logout notice.

**Fix:** Either convert the constructor to an async factory, or call `reauthenticate()` from `onload()` instead of relying on `rebuildClientSync`:

```typescript
// In main.ts onload(), replace:
this.client = new LeetCodeClient(this.settings);
// with:
this.client = new LeetCodeClient(this.settings);
await this.client.reauthenticate(); // ensures Credential.init() is fully awaited
```

And simplify `rebuildClientSync` to only the unauthenticated path:

```typescript
private rebuildClientSync(): void {
  this.lc = new LeetCode(); // unauthenticated baseline; reauthenticate() called by caller
}
```

---

### WR-02: `ProblemBrowserView.onClose` uses `window.clearTimeout` but timer was set with `window.setTimeout` — inconsistency with `activeWindow` usage in `Throttle`

**File:** `src/browse/ProblemBrowserView.ts:81,159,233`
**Issue:** The view uses `window.clearTimeout` / `window.setTimeout` for `searchDebounce` and `throttleFooterTimer`. The `Throttle` class uses its own `_setTimeout` / `_clearTimeout` helpers that route through `activeWindow` for popout-window safety. The inconsistency means that if the problem browser is opened in an Obsidian popout window, the search debounce timer and footer indicator timer are bound to the main window's event loop rather than the popout's. When the popout is closed, the main window's `clearTimeout` may receive an ID from the popout's timer system — in Electron/Chromium this is harmless in practice, but the pattern contradicts the documented reason `activeWindow` helpers exist.

**Fix:** Use `activeWindow?.setTimeout ?? window.setTimeout` consistently in `ProblemBrowserView`, or extract the `_setTimeout`/`_clearTimeout` helpers from `throttle.ts` into a shared `src/shared/timers.ts` module and import them everywhere.

---

### WR-03: `ProblemListService.refresh()` has no concurrency guard — parallel calls fetch duplicate pages

**File:** `src/browse/ProblemListService.ts:49`
**Issue:** If `refresh()` is called twice concurrently (e.g. user opens two panels, or a retry fires while the first fetch is still in flight), both calls will observe a stale/null cache and proceed to paginate independently, issuing duplicate LC API requests for all 3,300 problems. Each call then independently writes to `setProblemIndex`, meaning the final stored index is whichever completed last — possibly incomplete if one fetch was interrupted.

**Fix:** Add an in-flight guard:

```typescript
private refreshPromise: Promise<IndexedProblem[]> | null = null;

async refresh(force = false): Promise<IndexedProblem[]> {
  if (this.refreshPromise) return this.refreshPromise;
  this.refreshPromise = this._doRefresh(force).finally(() => {
    this.refreshPromise = null;
  });
  return this.refreshPromise;
}

private async _doRefresh(force: boolean): Promise<IndexedProblem[]> {
  // ... existing implementation
}
```

---

### WR-04: `SettingsStore.load` spread can silently corrupt `problemIndex` with partially-migrated data

**File:** `src/settings/SettingsStore.ts:32`
**Issue:** `{ ...DEFAULT_DATA, ...(raw ?? {}), version: 1 }` will happily accept a `problemIndex` object that has the right top-level shape (`fetchedAt`, `problems`) but whose `problems` array contains objects missing required fields (e.g. `diff` or `slug`). `ProblemListService.filter()` calls `p.diff` and `p.status` without null checks — if a legacy or corrupted index entry is missing `diff`, `p.diff.toLowerCase()` in `ProblemBrowserView.renderRow` (line 311) throws a TypeError that crashes the entire view render cycle.

**Fix:** In `SettingsStore.load`, validate `problemIndex` before accepting it (see CR-02 fix for `isValidProblemIndex` guard). At minimum, set `problemIndex: null` if `raw.problemIndex` fails a shallow structural check, forcing a clean re-fetch.

---

### WR-05: `refreshAndRender` calls `this.onOpen()` recursively on session-expired path — can recurse if expiry fires repeatedly

**File:** `src/browse/ProblemBrowserView.ts:115`
**Issue:** On detecting session expiry, the code calls `await this.plugin.auth.logout()` then `await this.onOpen()` (line 115). `onOpen()` in turn may call `refreshAndRender()` again (line 76). If the logout fails silently (`.catch(() => undefined)`) but the session state is not actually cleared (e.g. `setAuthCookies(null)` fails because `saveData` throws), `isLoggedIn()` may still return `true`, causing `onOpen()` to skip the empty state and go straight back into `refreshAndRender()`, which throws session-expired again — infinite recursion until stack overflow.

**Fix:** After logout, check `isLoggedIn()` before re-entering the fetch path:

```typescript
await this.plugin.auth.logout().catch(() => undefined);
// Force a clean re-render via the empty-state branch, not the fetch branch:
root.empty();
this.renderEmptyState(root, {
  heading: 'Log in to browse problems',
  body: 'Your session expired. Sign in again to continue.',
  buttonText: 'Log in',
  onAction: async () => {
    const ok = await this.plugin.auth.login();
    if (ok) void this.refreshAndRender(root);
  },
});
```

---

### WR-06: `CookiePasteModal` and `SettingsTab` accept cookies with only whitespace — passes non-empty check but produces non-functional credentials

**File:** `src/auth/CookiePasteModal.ts:62`, `src/settings/SettingsTab.ts:109`
**Issue:** Both files guard with `if (!this.sessionValue || !this.csrfValue)` / `if (!sessionVal || !csrfVal)`. A string of spaces is truthy. The user could accidentally paste a value with only whitespace (e.g. trailing newline from a copy-paste), which passes the guard, gets persisted as-is, and silently fails all subsequent API calls. The user sees "Cookies saved." / "Logged in." but nothing works.

**Fix:**
```typescript
// CookiePasteModal.ts
if (!this.sessionValue.trim() || !this.csrfValue.trim()) return;
// Use trimmed values:
LEETCODE_SESSION: this.sessionValue.trim(),
csrftoken: this.csrfValue.trim(),

// SettingsTab.ts
if (!sessionVal.trim() || !csrfVal.trim()) {
  new Notice('Both fields are required.', 3000);
  return;
}
const cookies: AuthCookies = {
  LEETCODE_SESSION: sessionVal.trim(),
  csrftoken: csrfVal.trim(),
};
```

---

## Info

### IN-01: `isSessionExpired` treats any response with `data === null` as expired — may misclassify network errors

**File:** `src/api/LeetCodeClient.ts:52`
**Issue:** `if (r.data === null) return true` will fire on any GraphQL response where `data` is explicitly `null`. The LC API returns `{ data: null, errors: [...] }` for auth failures, but also for other server-side errors (e.g. rate limits, internal errors). This could cause a spurious logout when the issue is transient. The secondary error-message check below it is more precise. Consider requiring the `errors` array to be non-empty and matching the auth pattern before returning `true` on the `data === null` branch.

---

### IN-02: `NetworkError` class declares `cause` as a public field but `Error` has a built-in `cause` property in ES2022+

**File:** `src/shared/errors.ts:17`
**Issue:** `public readonly cause?: unknown` shadows the standard `Error.cause` (introduced in ES2022, available in Chromium 93+/Node 16.9+). The field is declared as a constructor parameter rather than passed to `super(msg, { cause })`, which means `.cause` is set but the native error chain is broken. Debugging tools that follow `Error.cause` chains won't see it.

**Fix:**
```typescript
export class NetworkError extends Error {
  constructor(msg: string, cause?: unknown) {
    super(msg, { cause });
    this.name = 'NetworkError';
  }
}
```

---

### IN-03: `ProblemBrowserView.renderRows` "Clear filters" handler removes the throttle footer element reference without removing the element from the DOM if it exists

**File:** `src/browse/ProblemBrowserView.ts:282`
**Issue:** `this.throttleFooterEl = null` is set on line 282 but `this.throttleFooterEl.remove()` is not called first. If the footer is currently displayed, the DOM element remains as an orphan after `root.empty()` → `renderShell(root)` recreates the container. In practice `root.empty()` on line 283 removes all children including the footer, so there is no visual leak — but the missing `.remove()` call means the pattern is not self-documenting and differs from `clearThrottleFooterTimer`'s teardown in `onClose()`, creating a maintenance trap.

---

### IN-04: `ProblemListService.refresh` casts through `unknown` twice with a comment noting the mismatch

**File:** `src/browse/ProblemListService.ts:59-64`
**Issue:** The double `as unknown as ...` cast and comment "LC lib param is `offset` (not `skip`)" indicate the library's TypeScript types do not match its runtime behaviour. This should be tracked as a known library quirk; if `@leetnotion/leetcode-api` updates its types, the cast will silently become wrong and the compiler will not catch it. A thin typed wrapper function (or a minimal declaration merging the correct parameter type) would make this safer and remove the cast comment.

---

_Reviewed: 2026-05-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
