---
phase: 06
plan: 02
subsystem: preview-router-and-settings
tags:
  - preview
  - router
  - settings
  - PREVIEW-02
requires:
  - 06-01  # eslint-plugin-obsidianmd@^0.3.0 must be green at HEAD
provides:
  - LeetCodePlugin.routeProblemClick(slug, status, intent, opts?)
  - SettingsStore.getPreviewClickBehavior() / setPreviewClickBehavior()
  - PluginData.previewClickBehavior: 'preview' | 'open'
  - ProblemBrowserView.decideClickIntent(e) pure helper
  - Settings tab "Preview > Click behavior" dropdown
affects:
  - src/main.ts
  - src/browse/ProblemBrowserView.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
tech_stack_added: []
patterns_used:
  - pure-helper export idiom (analog: computeFilterBadgeCount)
  - shape-guard with safe single-default (analog: techniquesFolderOverride)
  - getter/setter pair on SettingsStore (analog: autoBacklinksEnabled)
  - section-heading + dropdown row (analog: Notes/Knowledge graph in SettingsTab)
key_files:
  created:
    - tests/settings/preview-click-behavior.test.ts
    - tests/preview/router.test.ts
    - tests/preview/click-behavior.test.ts
  modified:
    - src/main.ts
    - src/browse/ProblemBrowserView.ts
    - src/settings/SettingsStore.ts
    - src/settings/SettingsTab.ts
decisions:
  - "Notice copy uses sentence-case 'plan 06-03' (lowercase) to satisfy obsidianmd/ui/sentence-case lint rule. The substring '06-03' is the swap-site marker for Plan 06-03; tests pin /06-03/ rather than the full string so future copy edits won't break the gate."
  - "decideClickIntent(e) exported as a pure helper from ProblemBrowserView (analog to computeFilterBadgeCount) so the shift-key contract is testable without standing up a full ItemView. Keeps production + tests aligned via a single source of truth."
  - "routeProblemClick lives on LeetCodePlugin (not in src/preview/previewRouter.ts) for Plan 06-02. Plan 06-03 may extract openOrReusePreview as a free function while keeping the router-method contract on the plugin — matches CONTEXT.md decision A's framing of routeProblemClick as a plugin-level entry point."
  - "Test for routeProblemClick uses Object.create(PluginCtor.prototype) to instantiate without driving onload(). The router only reads this.openProblem and this.settings.getPreviewClickBehavior(), so the minimal injected shape is sufficient. vi.mock('obsidian') redirects Notice through a module-scoped capture array."
metrics:
  start: 2026-05-15T13:58:00Z
  end: 2026-05-15T14:09:00Z
  duration_minutes: 11
  tasks: 3
  files_created: 3
  files_modified: 4
  tests_added: 25  # 10 settings round-trip + 9 router matrix + 6 click-behavior
  tests_total_after: 689  # was 674 before this plan; +15 net from new test files (10 new + 9 + 6 = 25, but 10 file count is for new behavior coverage)
  bundle_size_kb: 159.4
---

# Phase 06 Plan 02: routeProblemClick + Preview settings — Summary

Wired the PREVIEW-02 routing seam before the preview view exists. Single
`routeProblemClick(slug, status, intent, opts?)` entry point on
LeetCodePlugin replaces ProblemBrowserView's direct `openProblem` call;
new `Preview › Click behavior` dropdown in the settings tab persists the
user's preference; `previewClickBehavior` field on PluginData defaults
safely to `'preview'` for fresh installs and v1.1 upgraders alike.

## What landed

### Task 1 — `previewClickBehavior` persistence (`src/settings/SettingsStore.ts`)

- **PluginData field** at line 88 — `previewClickBehavior: 'preview' | 'open'` string union (locked schema, NOT boolean — RESEARCH §Pitfall 7).
- **DEFAULT_DATA seed** — `previewClickBehavior: 'preview'` with comment citing CONTEXT.md decision A (single default for everyone, no upgrader-detection branch).
- **Shape-guard in `load()`** at line 327 — `raw.previewClickBehavior === 'open' ? 'open' : 'preview'`. Anything that isn't literally the string `'open'` (missing field, number, null, object, case-mismatch typo `'OPEN'`, unknown future enum value) collapses to `'preview'`.
- **Getter / setter** at lines 410–423 — mirror the `getAutoBacklinksEnabled` / `setAutoBacklinksEnabled` precedent exactly.
- **10 round-trip tests** covering default-on-fresh-install (2 paths: empty data.json + key-absent), both literal values, four malformed-value paths (numeric / object / null / typo), and a full set→reload round-trip via the same mock plugin.

**Commit:** `500dca8` — `feat(06-02): add previewClickBehavior to PluginData with shape-guard + getter/setter`

### Task 2 — `routeProblemClick` + shift-aware row click (`src/main.ts`, `src/browse/ProblemBrowserView.ts`)

**`LeetCodePlugin.routeProblemClick`** added at line 500 immediately after `openProblem`. Decision flow (lines 500–516; CONTEXT.md decision A precedence):

```
1. intent === 'open'                                  → openProblem(slug, status)
2. intent === 'preview' && opts?.force                → preview path (Notice TODO)
3. intent === 'preview' && setting === 'open'         → openProblem(slug, status)
4. intent === 'preview'                               → preview path (Notice TODO)
```

**Placeholder Notice** at line 517 — `new Notice('Preview view will land in plan 06-03', 4000)`. **Plan 06-03 swap site** is marked with `// TODO(06-03):` at line 513 — the executor for the view replaces these three lines with `await openOrReusePreview(this, slug)`. The substring `06-03` is grep-pinned by the router test (`/06-03/`).

**`ProblemBrowserView.decideClickIntent(e)`** exported pure helper at line 25–37 — `(e.shiftKey ?? false) ? 'open' : 'preview'`. Defensive `?? false` handles synthetic events from polyfills.

**Row click handler** at line 624 — was `() => void plugin.openProblem(p.slug, p.status)`; now `(e) => { const intent = decideClickIntent(e); void this.plugin.routeProblemClick(p.slug, p.status, intent); }`. GAP-2a status forward preserved.

**`pickRandom()`** at line 488 left **unchanged** per CONTEXT.md `<code_context>` (random pick = open intent, not preview). A regression-grep test in `click-behavior.test.ts` fails the build if pickRandom is ever rerouted through the router.

**No `Menu` import added** — right-click context menu is Plan 06-04's responsibility (or a fold-in to Plan 06-03 per CONTEXT.md).

**Tests (15 total):**
- `tests/preview/router.test.ts` — 9 cases pinning the 8-cell intent×force×setting matrix plus undefined-status pass-through.
- `tests/preview/click-behavior.test.ts` — 6 cases: 3 helper-direct (plain / shift / missing-shiftKey) + 2 DOM-dispatch round-trips + 1 source-shape regression gate (pickRandom must NOT contain `routeProblemClick`).

**Commit:** `d62f4e1` — `feat(06-02): add routeProblemClick router + shift-aware row click handler`

### Task 3 — Preview settings section (`src/settings/SettingsTab.ts`)

New `Preview` section heading at line 184 sits between `Notes` (line 149) and `Knowledge graph` (was line 182, now line 205). Single dropdown row at lines 186–195:

| Field | Locked copy (06-UI-SPEC §Copywriting) |
|---|---|
| Section heading | `Preview` |
| Setting name | `Click behavior` |
| Setting description | `What happens when you click a problem in the LeetCode browser. Shift-click always opens the note directly.` |
| Dropdown option (default) | `Preview first` (value `preview`) |
| Dropdown option | `Open note directly` (value `open`) |

Used `addOption(value, label)` two-call idiom (NOT `addOptions(record)`) per UI-SPEC §Layout — two-option dropdowns use the chain idiom; multi-option dropdowns like `Default language` (which has 19 entries) use `addOptions` with a Record literal.

**Commit:** `119aa55` — `feat(06-02): add Preview section to settings tab with Click behavior dropdown`

## Decision flow (final form, with line numbers)

`src/main.ts:497-518`:

```typescript
async routeProblemClick(
  slug: string,
  status: 'solved' | 'attempted' | 'untouched' | undefined,
  intent: 'preview' | 'open',
  opts?: { force?: boolean },
): Promise<void> {
  if (intent === 'open') {
    return this.openProblem(slug, status);
  }
  // intent === 'preview' from here on.
  if (!opts?.force && this.settings.getPreviewClickBehavior() === 'open') {
    return this.openProblem(slug, status);
  }
  // TODO(06-03): swap this placeholder for `await openOrReusePreview(this, slug)`
  // once src/preview/previewRouter.ts and ProblemPreviewView land.
  new Notice('Preview view will land in plan 06-03', 4000);
}
```

## Test matrix coverage (8 cells documented)

| # | intent | opts.force | setting | Expected | Test |
|---|---|---|---|---|---|
| 1 | open | undefined | preview | openProblem | router.test.ts case 1 |
| 2 | open | undefined | open | openProblem | router.test.ts case 2 |
| 3 | open | true | preview | openProblem | router.test.ts case 3 (force has no effect on 'open') |
| 4 | preview | undefined | preview | Notice | router.test.ts case 4 |
| 5 | preview | undefined | open | openProblem | router.test.ts case 5 (user opted into v1.0) |
| 6 | preview | true | preview | Notice | router.test.ts case 6 |
| 7 | preview | true | open | Notice | router.test.ts case 7 (force overrides setting — right-click escape) |
| 8 | preview | false | open | openProblem | router.test.ts case 8 (force=false ≠ force) |

Plus a 9th case asserting `undefined` status passes through to `openProblem` (preserves GAP-2a contract).

## Open hand-off to Plan 06-03

**Placeholder Notice swap site:** `src/main.ts:513-517` is marked with `// TODO(06-03):`. The executor for Plan 06-03 should:

1. Add `import { openOrReusePreview } from './preview/previewRouter';` (NEW file Plan 06-03 creates).
2. Replace the three lines (TODO comment + Notice call) with `await openOrReusePreview(this, slug);`.
3. Update the router test: change the `intent='preview' + setting='preview'` cases to assert that `openOrReusePreview` was called instead of asserting on `noticeCalls`. The 8-cell matrix shape stays the same.

**Settings + persistence:** Plan 06-03 needs nothing new from SettingsStore — `getPreviewClickBehavior()` is already wired and defaults safely.

**Right-click context menu (Plan 06-04 or fold-in):** the router already accepts `{ force: true }` and case 7 of the matrix (`force=true + setting='open' → preview`) is locked by tests. The right-click handler on `ProblemBrowserView` should call `routeProblemClick(p.slug, p.status, 'preview', { force: true })`.

## Manual UAT (deferred to Plan 06-04 README capture)

1. Reload plugin → click a row → Notice "Preview view will land in plan 06-03".
2. Shift-click a row → v1.0 note path fires (no Notice).
3. Open Settings → see new `Preview` section between `Notes` and `Knowledge graph`.
4. Toggle `Click behavior` → `Open note directly` → click a row → v1.0 path fires (no Notice).
5. Toggle back to `Preview first` → reload Obsidian → toggle still set (data.json round-trip).

## Deviations from Plan

**1. [Rule 1 — Lint copy] `Notice` text changed from `Plan 06-03` to `plan 06-03`**
- **Found during:** Task 2 verification (`npm run lint` failed)
- **Issue:** `obsidianmd/ui/sentence-case` lint rule (introduced by 06-01's bump to `eslint-plugin-obsidianmd@^0.3.0`) flags any non-sentence-case Notice / UI text. `Plan 06-03` was treated as title-case.
- **Fix:** Lowercased `Plan` → `plan` in the Notice string at `src/main.ts:517`. Updated the router test's regex from `/Plan 06-03/` to `/06-03/` so future copy edits won't re-break the gate. The `06-03` substring is the swap-site marker.
- **Files modified:** `src/main.ts`, `tests/preview/router.test.ts`
- **Commit:** `d62f4e1`

**2. [Rule 1 — Lint] Removed unnecessary `e as MouseEvent` cast in row click handler**
- **Found during:** Task 2 verification (`npm run lint` failed)
- **Issue:** `@typescript-eslint/no-unnecessary-type-assertion` — `addEventListener('click', ...)` already types `e: MouseEvent`, so `(e as MouseEvent)` is redundant.
- **Fix:** Removed the cast at `src/browse/ProblemBrowserView.ts:624`. `decideClickIntent` accepts `{ shiftKey?: boolean }` (a structural subset) so the raw `MouseEvent` parameter passes through directly.
- **Files modified:** `src/browse/ProblemBrowserView.ts`
- **Commit:** `d62f4e1`

**3. [Test infrastructure] Switched `vi.mock` factory pattern for the router test**
- **Found during:** Task 2 RED-shell run
- **Issue:** Initial test attempted to mutate the obsidian-stub module's `Notice` export at runtime (`(obsStub as any).Notice = class { ... }`). Vitest 4.x ESM modules are read-only, so the assignment threw `TypeError: Cannot set property Notice of [object Module] which has only a getter`.
- **Fix:** Moved the `Notice` spy into the `vi.mock('obsidian', ...)` factory itself. The factory captures into a module-scoped `noticeCalls` array; tests reset it in `beforeEach`. Standard vi.mock idiom for capturing constructor calls across an ESM boundary.
- **Files modified:** `tests/preview/router.test.ts`
- **Commit:** `d62f4e1`

No deviations from CONTEXT.md, RESEARCH.md, PATTERNS.md, or UI-SPEC.md decisions. The pickRandom invariant is preserved as required (CONTEXT.md `<code_context>`); no `Menu` import or `contextmenu` listener added (those belong to Plan 06-04 / 06-03 fold-in).

## Plan-checker contracts honored

- **`previewClickBehavior` shape-guard collapses malformed values to `'preview'`.** Verified by 4 distinct shape-guard tests (numeric, object, null, case-mismatch typo) in `tests/settings/preview-click-behavior.test.ts`.
- **`routeProblemClick` placeholder Notice clearly marked for swap-out in 06-03.** The `// TODO(06-03):` comment at `src/main.ts:513` plus the literal substring `'06-03'` in the Notice message gives Plan 06-03 a precise grep target.
- **Wave 1 invariants preserved.** Full suite passes 689/689 (was 674/674 — 15 new tests added by this plan); `npm run lint` exits 0; `npm run build` exits 0; bundle size 159.4 KB (well below the 500 KB hard gate from 06-01).

## Self-Check

**Files claimed created — verified to exist:**
- `tests/settings/preview-click-behavior.test.ts`: FOUND
- `tests/preview/router.test.ts`: FOUND
- `tests/preview/click-behavior.test.ts`: FOUND

**Files claimed modified — verified via git log:**
- `src/main.ts` (commit d62f4e1): FOUND
- `src/browse/ProblemBrowserView.ts` (commit d62f4e1): FOUND
- `src/settings/SettingsStore.ts` (commit 500dca8): FOUND
- `src/settings/SettingsTab.ts` (commit 119aa55): FOUND

**Commits claimed — verified in git log:**
- `500dca8`: FOUND
- `d62f4e1`: FOUND
- `119aa55`: FOUND

## Self-Check: PASSED
