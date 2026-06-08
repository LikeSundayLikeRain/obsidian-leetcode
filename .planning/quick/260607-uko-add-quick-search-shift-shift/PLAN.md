---
slug: add-quick-search-shift-shift
quick_id: 260607-uko
created: 2026-06-08
status: planned
---

# Quick Task: Add quick problem search (palette + double-shift)

## Description

Give users a JetBrains-style "search anything" launcher for LeetCode problems:

1. **Palette / hotkey command** — `addCommand({ id: 'quick-search', name: 'Quick search problems' })`. Lands in the
   Obsidian command palette under "LeetCode: Quick search problems" and is user-rebindable from Obsidian's hotkey
   settings (per the existing plugin-store rules — no default hotkey, generic id, sentence-case name).
2. **Double-shift trigger** — document-level keydown listener (`registerDomEvent(document, 'keydown', ...)`) that fires
   the same modal when the user taps `Shift` twice within 300ms. Idiomatic auto-cleanup via Obsidian's `Component`
   lifecycle.

Both surfaces open a `SuggestModal<IndexedProblem>` backed by the in-memory cache the browser already maintains
(`plugin.settings.getProblemIndex()`) — no network call on the hot path. Selecting a result delegates to the existing
`plugin.routeProblemClick(slug, status, 'preview')` router so it honors the user's "Click behavior" setting.

## Goal

Land in `1.3.0-beta.x` so dogfood users can hit Shift-Shift and search the problem index without leaving their note.

## Tasks

### Task 1 — pure shift-shift detector module (`src/main/shiftShiftDetector.ts`)

Create a pure factory `createShiftShiftDetector({ windowMs, onTrigger })` returning a `KeyHandler` (KeyboardEvent → void)
that the plugin attaches to `document` keydown. Internal state machine:

- Two consecutive `Shift` keydowns within `windowMs` (default 300) fire `onTrigger()`.
- Any non-Shift keydown disarms the sequence (so `Shift+A`, `A`, `Shift` does NOT trigger).
- `e.repeat === true` is ignored (held-down auto-repeat must not arm or trigger).
- Any modifier-held shift press (`Cmd+Shift`, `Ctrl+Shift`, `Alt+Shift`) is ignored — the user is composing a chord, not
  tapping shift solo.

Why pure: lets the test exercise the timing logic without happy-dom keyboard simulation. Uses an injectable `now()`
function (defaults to `Date.now`) so tests can advance time deterministically.

### Task 2 — `QuickProblemSearchModal` (`src/browse/QuickProblemSearchModal.ts`)

Extend `SuggestModal<IndexedProblem>`. Constructor takes `(app, problems: IndexedProblem[], onChoose: (p) => void)`.

- `getSuggestions(query)` — empty query returns first 50 rows verbatim (latest LC ordering preserved). Non-empty query:
  case-insensitive substring match on `"${id}. ${title} ${slug}"` plus a numeric-id-prefix shortcut (`"42"` matches
  problem 42 first). Cap at 50.
- `renderSuggestion(p, el)` — two-line item: bold `${id}. ${title}` line + dim `${diff} · ${slug}` line. Difficulty colored
  with the same `lc-diff-{easy,medium,hard}` class the browser view already styles. No icons (keep bundle silent).
- `onChooseSuggestion(p)` — calls the injected `onChoose(p)`.
- Empty-state copy when `problems.length === 0`: "Open the LeetCode problem browser at least once to populate the
  index." (matches the existing copy style.)

### Task 3 — wire it into `src/main.ts`

Three edits inside `LeetCodePlugin`:

1. Add `import { QuickProblemSearchModal } from './browse/QuickProblemSearchModal';` and
   `import { createShiftShiftDetector } from './main/shiftShiftDetector';`.
2. New private `openQuickSearch()` method:
   - Pull `plugin.settings.getProblemIndex()?.problems ?? []`.
   - If empty AND user has never opened the browser, show `new Notice('LeetCode: open the problem browser to populate the index.')` and return.
   - Otherwise open the modal; on choose, call `void this.routeProblemClick(p.slug, p.status, 'preview')`.
3. In the `addCommand` block (after `open-problem-browser`), register:
   ```ts
   this.addCommand({
     id: 'quick-search',
     name: 'Quick search problems',
     callback: () => this.openQuickSearch(),
   });
   ```
4. After the existing `registerDomEvent(window, 'beforeunload', ...)` block, attach:
   ```ts
   const shiftShift = createShiftShiftDetector({ onTrigger: () => this.openQuickSearch() });
   this.registerDomEvent(document, 'keydown', shiftShift, { capture: true });
   ```
   `capture: true` so we see the event before any modal/editor swallows it — but we never call `preventDefault`, so the
   editor still receives the shift normally.

### Task 4 — tests

- `tests/main/shiftShiftDetector.test.ts` — drives the pure detector with a mock `now()`:
  - Two shifts within window → trigger fires once.
  - Two shifts outside window → no trigger, second arms a fresh window.
  - `Shift, A, Shift` → no trigger.
  - `Cmd+Shift` press is ignored.
  - `e.repeat` press is ignored.
- `tests/browse/QuickProblemSearchModal.test.ts` — directly tests the suggestion-filtering logic. To avoid pulling
  the SuggestModal base class through happy-dom DOM construction, export a pure `filterProblems(problems, query, limit)`
  helper from the modal module and have `getSuggestions` delegate to it. Test:
  - Empty query → first `limit` rows.
  - Numeric query → exact-id match ranked first.
  - Title substring match (case-insensitive).
  - Slug substring match.
  - No match → empty array.

## Acceptance

- `npm test` passes (existing 2859 + 9 new = 2868+).
- `npm run lint` passes (no obsidianmd command-id rule violations: `quick-search` has no plugin-id or "command"
  substring; sentence-case name; no `hotkeys` field).
- `npm run build` passes (type-check clean, bundle within ceiling).
- Manual smoke (deferred to BRAT dogfood): `Shift, Shift` opens modal; typing filters; `Enter` opens the note; palette
  entry shows under "LeetCode: Quick search problems" and is user-rebindable.

## Notes

- Index is shared with the browser view via `SettingsStore.getProblemIndex()` — no duplication.
- We do NOT proactively refresh the index here. Users who haven't opened the browser yet get the explicit Notice.
  Keeping refresh out of the hot path means Shift-Shift is instant (sub-frame).
- `routeProblemClick` honors the user's preview-vs-open preference; no need to re-implement the routing decision.
- Cleanup is automatic — `registerDomEvent` ties the listener to the plugin's `Component` lifecycle.
