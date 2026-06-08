---
slug: add-quick-search-shift-shift
quick_id: 260607-uko
created: 2026-06-08
status: complete
---

# Summary: Quick problem search (palette + double-shift)

## Outcome

Shipped JetBrains-style "search anything" quick launcher for the LeetCode problem index. Two surfaces:

1. **Command palette** — `Quick search problems` (id `quick-search`) lands in the palette and is user-rebindable from
   Obsidian's hotkey settings. No default hotkey.
2. **Document-level double-shift** — `registerDomEvent(activeDocument, 'keydown', ...)` with a pure detector that
   triggers when the user taps `Shift` twice within 300ms. `e.repeat`, modifier-held shifts (`Cmd+Shift`, etc.), and
   intervening non-Shift keys all disarm correctly.

Both surfaces open `QuickProblemSearchModal`, a `SuggestModal<IndexedProblem>` backed by the in-memory
`SettingsStore.getProblemIndex()` cache. Selecting a row delegates to `routeProblemClick(slug, status, 'preview')`,
honoring the user's existing "Click behavior" preference.

If the cache is empty (user has never opened the browser), the modal is skipped and a Notice prompts the user to open
the browser once to populate the index — keeps the hot path zero-network and instant.

## Files added

- `src/main/shiftShiftDetector.ts` — pure factory (`createShiftShiftDetector`) returning a keydown handler. Injectable
  `now()` for deterministic test timing.
- `src/browse/QuickProblemSearchModal.ts` — `SuggestModal` subclass + exported pure `filterProblems(problems, query, limit)`
  helper. Empty query → first N rows. Numeric query → exact-id-first → id-prefix → text fallback. Otherwise
  case-insensitive substring on title and slug. Cap at 50.
- `tests/main/shiftShiftDetector.test.ts` — 6 tests (window edges, disarm-on-other-key, modifier guard, repeat guard,
  default 300ms).
- `tests/browse/QuickProblemSearchModal.test.ts` — 8 tests covering ranking and limit semantics.

## Files modified

- `src/main.ts` — added imports, `quick-search` palette command, `openQuickSearch()` method, and the document-level
  shift-shift listener (capture phase, never `preventDefault` so the editor still receives shift normally).
- `tests/helpers/obsidian-stub.ts` — added `SuggestModal` stub class so the new modal's module resolves under vitest.

## Verification

- `npx vitest run` (new files): 14/14 pass.
- `npm test` (full suite): **2873 passing** (+14 new on top of prior 2859), 7 skipped, 0 failing.
- `npx tsc -noEmit`: clean.
- `npm run lint`: 0 errors (10 pre-existing unused-disable warnings, untouched).
- `npm run build`: clean.
- `npm run check:bundle-size`: 1,764,505 B (1,723 KB) — within the 1.8 MB v1.2 ceiling.

## Manual smoke (deferred to BRAT dogfood)

- `Shift, Shift` opens the modal.
- Palette → "LeetCode: Quick search problems" opens it as well.
- Empty index → Notice instead of empty modal.
- Selecting a row honors Click-behavior preview-vs-open.
- Hotkey rebind via Obsidian settings works (no default hotkey is set).

## Notes / non-goals

- We do NOT proactively refresh the index here — instant Shift-Shift is the contract. Users with stale indexes refresh
  via the browser view.
- We do NOT swallow the Shift key (no `preventDefault`) — capitalization in the active editor still works as expected
  while the detector is armed.
- Mobile is N/A — plugin remains `isDesktopOnly`.
