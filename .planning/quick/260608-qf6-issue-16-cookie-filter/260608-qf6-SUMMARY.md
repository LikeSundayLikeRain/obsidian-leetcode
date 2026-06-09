---
phase: quick-260608-qf6
plan: 01
type: execute
wave: 1
subsystem: auth
tags: [auth, cookies, electron, issue-16, regression-guard]
requires: []
provides:
  - URL-based cookie filter (captures host-only csrftoken — issue #16)
  - 30s capture-timeout watchdog (surfaces silent-failure mode)
  - tagged-union OpenLoginResult type (success/cancelled/timeout)
  - exported tryCaptureCookies helper for unit testability
affects:
  - src/auth/BrowserWindowLogin.ts
  - src/auth/AuthService.ts
key-files-created:
  - tests/browser-window-login-filter.test.ts
key-files-modified:
  - src/auth/BrowserWindowLogin.ts
  - src/auth/AuthService.ts
decisions:
  - "Use { url: 'https://leetcode.com/' } cookie filter (Electron's URL filter returns all cookies that would be sent to that URL — includes host-only)"
  - "30s timeout watchdog: bounded, cleared via centralized settle() helper, no timer leak"
  - "Extracted tryCaptureCookies as exported testable seam — ~5 LOC export, no new src/ files, runtime test catches semantic regressions a grep gate misses"
  - "Notice copy adjusted to sentence case (Settings → settings) per obsidianmd/ui/sentence-case lint rule — minor copy deviation from plan, project convention takes precedence"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tests_added: 4
  test_total_passing: 2878
  files_modified: 2
  files_created: 1
  loc_delta: "+115 / -36"
  completed: 2026-06-08
---

# Phase quick-260608-qf6 Plan 01: Issue #16 — Cookie Filter Fix Summary

Switched embedded-login cookie filter from `{ domain: '.leetcode.com' }` to `{ url: 'https://leetcode.com/' }` so Electron returns host-only cookies, added a 30s capture-timeout watchdog with tagged-union return shape, and locked the filter contract with a 4-case unit test.

## What Changed

### `src/auth/BrowserWindowLogin.ts` (+93 / -27 LOC)

1. **Widened `ElectronCookiesApi.get` filter type** to `{ url?: string; domain?: string }` (both optional). Exported the interface so the test can type the fake.
2. **New exported `tryCaptureCookies(cookies)` helper** — calls `cookies.get({ url: 'https://leetcode.com/' })`, runs `extractAuthCookies`, returns null on rejection. AUTH-06 catch is bare. JSDoc explains the URL-vs-domain rationale and references issue #16.
3. **New exported `OpenLoginResult` tagged union** — `{ kind: 'success'; cookies } | { kind: 'cancelled' } | { kind: 'timeout' }`.
4. **`openLogin()` return type changed** from `Promise<AuthCookies | null>` to `Promise<OpenLoginResult>`.
5. **`settle(result)` local helper** — clears `timeoutHandle`, sets `resolved`, resolves the promise. Single resolution sink; prevents timer leaks.
6. **30s watchdog** — `window.setTimeout(() => { settle({ kind: 'timeout' }); safeClose(); }, 30_000)`. Started immediately after the BrowserWindow is constructed; cleared in every settle path. Uses `window.setTimeout` per project convention (`obsidianmd/prefer-window-timers`).
7. **Inline `tryCapture` closure** now delegates to `tryCaptureCookies(win.webContents.session.cookies)` so the unit-test path covers the production filter shape.
8. All previous `resolve(null)` paths converted: `closed` event → `cancelled`, `loadURL().catch()` → `cancelled`, success → `{kind:'success',cookies}`.
9. `extractAuthCookies` and `clearLeetCodePartitionCookies` UNCHANGED (verified — `tests/cookie-parse.test.ts` still passes without modification).
10. `nodeRequire` shim, `loadElectron`, `loadElectronRemote`, all `eslint-disable` comments UNCHANGED.

### `src/auth/AuthService.ts` (+22 / -9 LOC)

1. **`login()` now switches on `result.kind`**:
   - `'cancelled'` → `new Notice('LeetCode login cancelled.', 4000)` (LOCKED copy preserved)
   - `'timeout'` → `new Notice('Login appeared to succeed but cookies could not be captured — try the manual paste fallback in settings.', 7000)` (NEW copy — pending UI-SPEC.md review; sentence case per lint rule)
   - `'success'` → falls through to existing persist + reauthenticate + whoami flow
2. Return type unchanged — `Promise<boolean>`. Returns `true` only on `'success'`.
3. All four existing `eslint-disable` comments around `new Notice(...)` lines preserved in their original form.

### `tests/browser-window-login-filter.test.ts` (+115 LOC, NEW)

Four cases driving the exported `tryCaptureCookies` helper with a fake cookies API:

1. **calls cookies.get with { url } not { domain } — issue #16 regression** — deep-equals `{ url: 'https://leetcode.com/' }` and explicitly asserts `.domain === undefined`.
2. **captures host-only csrftoken (no Domain attribute)** — the actual issue #16 scenario; csrftoken returned without a `domain` field.
3. **returns null when csrftoken missing** — integrated extractAuthCookies path.
4. **swallows transient cookies.get rejections (AUTH-06 — never log)** — spies on `console.error/warn/log` and asserts zero calls.

## Filter Shape Now in Production

```ts
const list = await cookies.get({ url: 'https://leetcode.com/' });
```

`{ domain: '.leetcode.com' }` no longer appears at any call site (verified via grep on non-comment, non-JSDoc lines = 0). The string still appears in one JSDoc comment (line 80) explaining the migration — this is intentional and explicitly allowed by the plan.

## Verification Output

### `npx tsc --noEmit`
```
(no output — clean)
```

### `npm test` (full suite)
```
 Test Files  244 passed | 1 skipped (245)
      Tests  2878 passed | 7 skipped (2885)
   Start at  19:12:31
   Duration  61.75s
```

### `npm run lint` (touched files)
```
0 errors, 10 warnings
```
All 10 warnings are pre-existing `Unused eslint-disable directive (no problems were reported from 'no-console')` findings in `src/main.ts` — out of scope per POLISH-03 baseline (deferred). Zero errors and zero warnings on the three files modified by this fix.

### `npm run build`
```
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
(clean exit)
```

### Grep Gates
- `grep -c "url: 'https://leetcode.com/'" src/auth/BrowserWindowLogin.ts` → **2** (one in JSDoc, one at the cookies.get call site)
- `grep -v '^\s*//' src/auth/BrowserWindowLogin.ts | grep -v '^\s*\*' | grep -c "domain: '\.leetcode\.com'"` → **0** (no non-comment matches)
- `grep -c "kind: 'timeout'"` in BrowserWindowLogin.ts → **1**, in AuthService.ts → **1** (case label only — counted via the literal in code; the actual behavioral switch case is line 39 of AuthService.ts)
- `grep -c "tryCaptureCookies" src/auth/BrowserWindowLogin.ts` → **2** (export + delegation in `openLogin`'s tryCapture closure)

## Confirmation: tests/cookie-parse.test.ts NOT Modified

`extractAuthCookies` signature, exports, and behavior are unchanged. The 5 existing `cookie-parse.test.ts` cases pass without modification (verified in the targeted vitest run: 5/5 green; full suite shows the file unchanged).

## New Notice Copy — Pending UI-SPEC.md Ratification

Proposed copy (now in src/auth/AuthService.ts, line 43):

> Login appeared to succeed but cookies could not be captured — try the manual paste fallback in settings.

**Duration:** 7000ms (vs the standard 4000ms — message is longer and more actionable).

**Note:** Plan specified `Settings` (capital S) but lint rule `obsidianmd/ui/sentence-case` requires sentence case. Lowercased to `settings` to comply with project lint baseline. CLAUDE.md / project lint conventions take precedence over plan-specified verbatim copy per Rule 3.

**User action before merge:** Review the proposed string. If approved as-is, add a "timeout" row to UI-SPEC.md § Notice messages. If different copy preferred, single-line edit in `src/auth/AuthService.ts` case `'timeout'` branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Lint] Replaced `setTimeout` / `clearTimeout` with `window.setTimeout` / `window.clearTimeout`**
- **Found during:** Lint pass after Task 1 implementation
- **Issue:** ESLint rule `obsidianmd/prefer-window-timers` requires `window.*` for popout-window compatibility. Plain `setTimeout` was 2 lint errors.
- **Fix:** Used `window.setTimeout` and `window.clearTimeout`; typed `timeoutHandle` as `number | null` to match the renderer-context return type (matches existing convention in `src/widget/childParentSync.ts`, `src/widget/debouncedWriter.ts`).
- **Files modified:** src/auth/BrowserWindowLogin.ts
- **Threat impact:** None — same bounded-timer behavior, T-qf6-02 mitigation still holds.

**2. [Rule 3 - Lint] Adjusted Notice copy to sentence case**
- **Found during:** Lint pass after Task 1 implementation
- **Issue:** Plan specified `… in Settings.` (capital S); ESLint rule `obsidianmd/ui/sentence-case` requires lowercase.
- **Fix:** Changed to `… in settings.`
- **Files modified:** src/auth/AuthService.ts
- **Threat impact:** None — UX copy concern only (T-qf6-05 already flagged for user UI-SPEC review).

**3. [Rule 1 - TS] Fixed strict-undefined access in test**
- **Found during:** Initial tsc check
- **Issue:** `handle.calls[0].domain` triggered TS2532 "Object is possibly 'undefined'" under strict-checking.
- **Fix:** Destructured `const filter = handle.calls[0]` and used optional chaining `filter?.domain`. The preceding `expect(handle.calls).toHaveLength(1)` makes this safe at runtime; the change just satisfies TS strict mode.
- **Files modified:** tests/browser-window-login-filter.test.ts
- **Threat impact:** None.

No Rule 4 architectural deviations.

## Stub Tracking

None — all behaviors are wired end-to-end.

## Threat Flags

None — no new security-relevant surface introduced beyond what the plan's `<threat_model>` covered. The new `tryCaptureCookies` export is unit-tested for AUTH-06 compliance.

## Self-Check: PASSED

- ✅ `src/auth/BrowserWindowLogin.ts` exists and modified
- ✅ `src/auth/AuthService.ts` exists and modified
- ✅ `tests/browser-window-login-filter.test.ts` exists and contains 4 test cases
- ✅ `tests/cookie-parse.test.ts` exists and is byte-for-byte unchanged
- ✅ All grep gates pass
- ✅ tsc clean
- ✅ Full test suite green (2878 / 2878 + 7 skipped)
- ✅ Build clean
- ✅ Lint clean on touched files (10 pre-existing warnings on main.ts are out of scope)
