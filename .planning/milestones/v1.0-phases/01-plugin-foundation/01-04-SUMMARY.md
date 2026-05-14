---
phase: 01-plugin-foundation
plan: 04
subsystem: settings-ui
tags: [settings, ui, plugin-setting-tab, accent-reservation, locked-copy]
requires:
  - SettingsStore (src/settings/SettingsStore.ts, Plan 02) — getUsername/getProblemsFolder/setProblemsFolder/getDefaultLanguage/setDefaultLanguage
  - AuthService (src/auth/AuthService.ts, Plan 03) — login/logout/loginManual/isLoggedIn
  - AuthCookies (src/auth/types.ts, Plan 01)
  - LeetCodePlugin field-stubs (src/main.ts, Plan 01) — settings!/auth!/client!/list!
provides:
  - LeetCodeSettingTab (full Phase-1 settings UI wired to AuthService + SettingsStore)
affects:
  - Plan 06 (main.ts onload) — must register via `plugin.addSettingTab(new LeetCodeSettingTab(this.app, this))`
tech_stack:
  added: []
  patterns:
    - single .setCta() rule enforced at file scope (UI-SPEC.md § Color accent reservation)
    - all user-visible strings LOCKED via inline eslint-disable on sentence-case rule where LeetCode brand or HTTP cookie field names appear
    - Setting.setHeading() used for all section headings (obsidianmd/settings-tab/no-manual-html-headings)
    - display() is canonical refresh hook — called after login/logout/loginManual button clicks
    - trailing-slash strip on problems-folder persist (D-10)
    - inline manual-cookie form (D-05 first-class; CookiePasteModal not used here)
key_files:
  created:
    - src/settings/SettingsTab.ts
  modified: []
decisions:
  - Used `new Setting(el).setName(...).setHeading()` for all three section headings (Authentication, Manual cookie (fallback), Notes) to satisfy `obsidianmd/settings-tab/no-manual-html-headings`. PATTERNS.md template used `createEl('h2'/'h3')` directly; that form is flagged by the rule. The Obsidian-recommended path (setHeading) renders the same visual heading with consistent styling.
  - Inline `eslint-disable-next-line obsidianmd/ui/sentence-case -- ... LOCKED` comments applied to four lines where the rule misfires on locked copy: the Logout tooltip ("Log out of LeetCode"), the Manual-cookie description (contains "LeetCode"), the csrftoken field label (HTTP protocol identifier), and the Problems-folder placeholder ("LeetCode/"). Each comment cites the UI-SPEC section that locks the string. Matches Plan 03's precedent.
  - Logout button uses `.setTooltip('Log out of LeetCode')` for accessibility (screen reader hint) without affecting visual copy; the button face text is verbatim `Logout` as required.
  - `display()` is the sole refresh mechanism. login/logout/loginManual all call `this.display()` after resolving so the UI reflects the new auth state (status line, button label).
  - Manual-cookie fallback inlined inside the Settings tab per D-05/D-09 — the existing `CookiePasteModal` export from Plan 03 remains available for future command-palette triggers but is NOT invoked here.
  - Cookie fields rendered with `input.type = 'password'` (T-04-01 mitigation). Eye-toggle (show/hide) deferred to Phase 5 polish; this matches Plan 03's CookiePasteModal approach.
  - Empty-field guard on Save cookies: non-empty check on both fields before `auth.loginManual()`; emits Notice `'Both fields are required.'` (T-04-02 mitigation).
  - `sessionVal` / `csrfVal` captured via `onChange` callbacks (let-bound in display()'s closure). Form state is per-render — each `display()` call creates fresh empty fields; saved values live in `data.json` via SettingsStore, never read back into the form.
metrics:
  duration_seconds: "~146"
  completed: 2026-05-07T23:53:31Z
  task_count: 1
  file_count: 1
---

# Phase 01 Plan 04: Settings Tab Summary

## One-liner

Full Phase-1 `PluginSettingTab` implementing D-09 layout verbatim (Authentication section with status line + primary button + inline manual-cookie fallback, then Notes section with problems folder + default language), wired to `AuthService.login/logout/loginManual` and `SettingsStore.getProblemsFolder/setProblemsFolder/getDefaultLanguage/setDefaultLanguage`, with the call-to-action accent modifier applied to exactly one button (the primary `Log in via embedded window`) per UI-SPEC.md § Color — Logout and Save cookies are neutral.

## What was built

### Source module (1 file, 151 lines)

- **`src/settings/SettingsTab.ts` (new):** Exports `LeetCodeSettingTab extends PluginSettingTab`. Constructor takes `(app, plugin)` and forwards to super. `display()` empties the container, adds the `.leetcode-settings` root class, then renders:
  - **Authentication section** (via `new Setting(containerEl).setName('Authentication').setHeading()`)
  - **Status** row with name `'Status'` and description `'Logged in as {username}'` or `'Not logged in'` based on `plugin.auth.isLoggedIn()` + `plugin.settings.getUsername()`.
  - **Primary auth button row** — branches on `loggedIn`:
    - Logged-out: `Setting.addButton(b => b.setButtonText('Log in via embedded window').setCta().onClick(...))` — the single accent-modified button in this file.
    - Logged-in: `Setting.addButton(b => b.setButtonText('Logout').setTooltip('Log out of LeetCode').onClick(...))` — neutral, no accent.
  - **Manual cookie (fallback) sub-section** (via `Setting.setName(...).setDesc(...).setHeading()`, D-05 first-class) with the locked description `"Paste your LeetCode session cookies if the embedded login doesn't work on your system."`
    - `LEETCODE_SESSION` field with `type='password'`, `.lc-cookie-input` class, `onChange` capture to local `sessionVal`.
    - `csrftoken` field with same treatment, capture to `csrfVal`.
    - **Save cookies button** — neutral (`setButtonText('Save cookies')`, no `.setCta()`). Validates both fields non-empty; on success calls `plugin.auth.loginManual({LEETCODE_SESSION, csrftoken})` and re-renders.
  - **Notes section** (via `new Setting(containerEl).setName('Notes').setHeading()`)
  - **Problems folder** text input — placeholder `'LeetCode/'`, value from `plugin.settings.getProblemsFolder()`, onChange strips trailing slash via `v.replace(/\/+$/, '')` before `setProblemsFolder()`.
  - **Default language** dropdown with options `{python3: 'Python', java: 'Java', cpp: 'C++', javascript: 'JavaScript', typescript: 'TypeScript'}`, default from `plugin.settings.getDefaultLanguage()`, onChange calls `setDefaultLanguage()`.

## Single `.setCta()` location (Accent-reservation audit)

Exactly **one** `.setCta()` call in the file, on the logged-out primary button:

```typescript
new Setting(containerEl)
  .addButton((b) => b
    .setButtonText('Log in via embedded window')
    .setCta()                         // ← the only accent modifier in this file
    .onClick(async () => {
      await this.plugin.auth.login();
      this.display();
    }),
  );
```

**Project-wide accent audit (UI-SPEC.md § Color Phase 1 reserved list = 1):**

| File | `.setCta()` count |
|------|-------------------|
| `src/settings/SettingsTab.ts` | **1** (the Log-in button) |
| `src/auth/CookiePasteModal.ts` | 0 |
| every other `src/**/*.ts` | 0 |
| **Total** | **1** |

Matches UI-SPEC.md § Color Phase 1 reserved list exactly.

## UI-SPEC.md LOCKED strings present verbatim (13/13)

| Element | Copy | Grep count |
|---|---|---|
| Auth section heading | `Authentication` | 1 |
| Status (logged-out branch) | `Not logged in` | 1 |
| Primary button (logged-out) | `Log in via embedded window` | 1 |
| Secondary button (logged-in) | `Logout` | 1 |
| Manual-cookie sub-heading | `Manual cookie (fallback)` | 1 |
| Manual-cookie description | `Paste your LeetCode session cookies if the embedded login doesn't work on your system.` | 1 |
| LEETCODE_SESSION label | `LEETCODE_SESSION` | 1 |
| csrftoken label | `csrftoken` | 1 |
| Save button | `Save cookies` | 1 |
| Notes section heading | `Notes` | 1 |
| Problems folder name | `Problems folder` | 1 |
| Problems folder description | `Vault folder where problem notes are created.` | 1 |
| Default language name | `Default language` | 1 |
| Default language description | `Starter code language for new problems.` | 1 |

All 13 required locked strings (plus the Manual-cookie description which is #14) appear verbatim. The logged-in Status line `Logged in as {username}` is generated from a template literal at render time.

## AUTH-03 and AUTH-05 go through AuthService

- **AUTH-03 (manual cookie paste):** Save cookies button → `await this.plugin.auth.loginManual({LEETCODE_SESSION: sessionVal, csrftoken: csrfVal})` → (Plan 03's `AuthService.loginManual`) persists cookies via `settings.setAuthCookies(...)`, rebuilds LC client via `client.reauthenticate()`, emits `'Cookies saved.'` Notice. Settings tab then re-renders via `this.display()` to update the status line.
- **AUTH-05 (logout, no confirmation):** Logout button → `await this.plugin.auth.logout()` → (Plan 03's `AuthService.logout`) clears cookies and username from `data.json`, reauthenticates empty client, emits `'Logged out of LeetCode.'` Notice. UI re-renders via `this.display()` and the primary button returns to the accented `Log in via embedded window` state. **No confirmation modal** — grep gate `grep -c "'Are you sure'" == 0` and `grep -c 'confirm(' == 0`.

## src/main.ts UNMODIFIED (BLOCKER 4 file-ownership gate)

```
$ git diff --name-only HEAD -- src/main.ts
(empty)
```

**PASS.** Plan 04 wrote exactly one file (`src/settings/SettingsTab.ts`). Plan 06 retains sole ownership of `src/main.ts`. The typed field stubs Plan 01 Task 3 wrote to `main.ts` (`settings!: SettingsStore`, `auth!: AuthService`, `client!: LeetCodeClient`, `list!: ProblemListService`) made every `this.plugin.settings.*` / `this.plugin.auth.*` reference in SettingsTab.ts type-check cleanly — no `main.ts` edit was required or attempted.

## Gate Results

| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| Build | `npm run build` | 0 | `tsc -noEmit` clean, esbuild produces `main.js` |
| Lint | `npm run lint` | 0 | Zero errors, zero warnings |
| Test | `npm test` | 0 | 26/26 pass across 5 files (no Plan-04 tests; Plan 04 is UI-only) |
| Accent reservation | `grep -c '\.setCta()' src/settings/SettingsTab.ts` | — | 1 (PASS) |
| Project-wide accent | `grep -rc '\.setCta()' src/` | — | 1 (only SettingsTab.ts) |
| File-ownership | `git diff --name-only HEAD -- src/main.ts` | — | empty (PASS) |
| No `innerHTML` | `grep -c 'innerHTML' src/settings/SettingsTab.ts` | — | 0 (PASS) |
| No inline style attr | `grep -cE "style\s*=" src/settings/SettingsTab.ts` | — | 0 (PASS) |
| No `confirm(` | `grep -c 'confirm(' src/settings/SettingsTab.ts` | — | 0 (PASS) |
| No `'Are you sure'` | `grep -c "'Are you sure'" src/settings/SettingsTab.ts` | — | 0 (PASS) |
| Trailing-slash strip | `grep -c "replace(/\\/+\$/, ''" src/settings/SettingsTab.ts` | — | 1 (PASS) |
| python3 option | `grep -c 'python3' src/settings/SettingsTab.ts` | — | 1 (PASS, ≥1 required) |
| javascript option | `grep -c 'javascript' src/settings/SettingsTab.ts` | — | 1 (PASS, ≥1 required) |
| LeetCodeSettingTab export | `grep -c 'export class LeetCodeSettingTab extends PluginSettingTab' src/settings/SettingsTab.ts` | — | 1 (PASS) |

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | feat | 1b2dd75 | implement LeetCodeSettingTab (Authentication + Notes) |

## Requirements Satisfied

- **AUTH-03** (manual cookie paste) — Save cookies button validates + calls `AuthService.loginManual()`; cookies persist via SettingsStore; UI re-renders.
- **AUTH-05** (logout, no confirmation) — Logout button calls `AuthService.logout()` directly, no confirmation modal, single Notice from AuthService.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PATTERNS.md template uses `createEl('h2'/'h3')` but `obsidianmd/settings-tab/no-manual-html-headings` rule fails the build**

- **Found during:** first `npm run lint` pass — three errors at `h2`/`h3` `createEl` sites (Authentication heading, Manual cookie sub-heading, Notes heading).
- **Issue:** PATTERNS.md § `src/settings/SettingsTab.ts` snippet and UI-SPEC.md § Layout both instruct `containerEl.createEl('h2', { text: ... })` for section headings. This form is flagged by `eslint-plugin-obsidianmd`'s `settings-tab/no-manual-html-headings` rule (auto-fixable). The rule's recommended replacement is `new Setting(containerEl).setName(...).setHeading()`, which renders the same visual heading but applies Obsidian's consistent settings-tab heading styling.
- **Fix:** Converted all three headings to `setHeading()` form. The Manual-cookie sub-heading additionally attaches the locked description via `.setDesc(...)` on the same `Setting` call, removing the need for a separate `createEl('p')` — cleaner DOM and one fewer element to style.
- **Files modified:** `src/settings/SettingsTab.ts`
- **Commit:** 1b2dd75

**2. [Rule 1 - Bug] `obsidianmd/ui/sentence-case` misfires on LeetCode brand + HTTP cookie fields + LeetCode/ default value**

- **Found during:** first `npm run lint` pass — four errors:
  1. Logout tooltip `'Log out of LeetCode'` — rule wants `'Log out of leetcode'`.
  2. Manual-cookie description — rule wants `"Paste your leetcode session cookies..."`.
  3. `csrftoken` field label — rule wants `'Csrftoken'`.
  4. Problems-folder placeholder `'LeetCode/'` — rule wants `'Leetcode/'`.
- **Issue:** The rule doesn't know "LeetCode" is a brand name (UI-SPEC.md LOCKED throughout), doesn't know `csrftoken` / `LEETCODE_SESSION` are HTTP cookie field names (protocol identifiers, not user-facing copy), and the rule has no allow-list. Plan 03's summary documented the same misfire and the same mitigation.
- **Fix:** Inline `// eslint-disable-next-line obsidianmd/ui/sentence-case -- ... LOCKED` comment on each of the four lines. Each comment cites the UI-SPEC / D-10 section that locks the string. `LEETCODE_SESSION` was not flagged (the rule recognizes all-caps identifiers as constants); only `csrftoken` (lowercase) triggered.
- **Files modified:** `src/settings/SettingsTab.ts`
- **Commit:** 1b2dd75

**3. [Rule 3 - Blocking issue] Documentation comment literally contained `.setCta()` and caused the grep gate to return 2**

- **Found during:** first grep-gate verification (`grep -c '\.setCta()' src/settings/SettingsTab.ts` returned 2).
- **Issue:** The file-level docstring explained the accent-reservation rule by writing `.setCta()` literally: `"Accent color (var(--interactive-accent) via .setCta())..."`. Grep counts comment matches. Plan 03 hit the identical issue in `CookiePasteModal.ts` and documented the same fix.
- **Fix:** Rephrased the docstring to describe the mechanism without the literal method name: `"Accent color (var(--interactive-accent) via the call-to-action modifier) is RESERVED..."`. The one true usage remains at the primary Log-in button's `.setCta()` call — now the only match.
- **Files modified:** `src/settings/SettingsTab.ts`
- **Commit:** 1b2dd75

### No Rule-2 (missing critical) or Rule-4 (architectural) deviations

No new dependencies, no pattern changes beyond what the plan specified, no file-ownership violations, no auth gates (plan is fully offline/unit-test).

## Threat Register Mitigations Confirmed

| Threat ID | Mitigation | Evidence |
|-----------|-----------|----------|
| T-04-01 | `input.type = 'password'` on both cookie fields | Lines 92–93, 102–103: `t.inputEl.type = 'password'` on both fields |
| T-04-02 | Non-empty check before `loginManual` | Lines 113–116: `if (!sessionVal || !csrfVal) { new Notice('Both fields are required.', 3000); return; }` |
| T-04-03 | No `console.*` calls in SettingsTab.ts | `grep -c 'console\.' src/settings/SettingsTab.ts` returns 0 |

## Hand-off to Plan 06 (main.ts)

Plan 06's `onload()` must register this tab (per PATTERNS.md `src/main.ts` reference):

```typescript
import { LeetCodeSettingTab } from './settings/SettingsTab';
// ... after settings/auth/client/list are constructed in the locked order ...
this.addSettingTab(new LeetCodeSettingTab(this.app, this));
```

Construction order (RESEARCH.md Pitfall 1 + Plan 02 Summary + Plan 03 Summary):

```typescript
this.settings = await SettingsStore.load(this);
installRequestUrlFetcher();                          // MUST run before any LC call
this.client = new LeetCodeClient(this.settings);
this.auth = new AuthService(this.settings, this.client);
this.list = new ProblemListService(this.client, this.settings);  // Plan 05 export
// register view, ribbon, command, then:
this.addSettingTab(new LeetCodeSettingTab(this.app, this));
```

The `SettingsTab.display()` method is safe to call before any LC call — it only reads from `SettingsStore` (local `data.json`) and `AuthService.isLoggedIn()` (a pure getter).

## Known Stubs

None. The Settings tab is a complete, user-facing surface wired to live SettingsStore + AuthService — all buttons and fields are functional. Eye-toggle (show/hide cookie values) is listed in UI-SPEC.md § Settings tab interactions as a polish item and is **deferred to Phase 5** (Known deferral, not a stub in this plan's scope — T-04-01 is already mitigated by `type='password'`).

## Self-Check: PASSED

- [x] `src/settings/SettingsTab.ts` exists (151 lines) — exports `LeetCodeSettingTab extends PluginSettingTab`
- [x] Commit 1b2dd75 present in `git log --oneline --all`
- [x] `npm run build` → exit 0 (tsc clean + esbuild produces main.js)
- [x] `npm run lint` → exit 0 (zero errors, zero warnings)
- [x] `npm test` → exit 0 (26/26 pass across 5 files; no new Plan-04 tests)
- [x] `grep -c '\.setCta()' src/settings/SettingsTab.ts` == 1 (the Log-in button only)
- [x] `grep -rc '\.setCta()' src/` total == 1 (project-wide Phase-1 accent reserved list)
- [x] All 13 UI-SPEC.md § Settings tab LOCKED strings appear verbatim (plus the 14th — the manual-cookie description)
- [x] `grep -c 'innerHTML' src/settings/SettingsTab.ts` == 0
- [x] `grep -cE "style\s*=" src/settings/SettingsTab.ts` == 0
- [x] `grep -c 'confirm(' src/settings/SettingsTab.ts` == 0
- [x] `grep -c "'Are you sure'" src/settings/SettingsTab.ts` == 0
- [x] `grep -c "replace(/\/+\$/, ''" src/settings/SettingsTab.ts` == 1 (D-10 trailing-slash strip)
- [x] `grep -c 'python3' src/settings/SettingsTab.ts` >= 1 AND `grep -c 'javascript' src/settings/SettingsTab.ts` >= 1
- [x] `grep -c 'export class LeetCodeSettingTab extends PluginSettingTab' src/settings/SettingsTab.ts` == 1
- [x] **BLOCKER 4 file-ownership gate:** `git diff --name-only HEAD -- src/main.ts` is empty
- [x] AUTH-03 wired through `AuthService.loginManual()` (not bypassed)
- [x] AUTH-05 wired through `AuthService.logout()` with no confirmation modal
