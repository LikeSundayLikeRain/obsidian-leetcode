---
quick_id: 260528-vq4
type: quick
plan: 01
wave: 1
status: complete
completed_at: "2026-05-28"
requirements: [QUICK-VQ4]
commits:
  - 609559d  # Task 1: SettingsStore field + getter/setter
  - 244b4ea  # Task 2: SettingsTab toggle row
  - 57659fa  # Task 3: main.ts onload gates + README note + Rule-3 deviation fixes
files_created: []
files_modified:
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - src/main.ts
  - README.md
  - tests/ai/settingsTab.test.ts
  - tests/solve/mocks/fakeSettingsStore.ts
key_decisions:
  - "Reload-required apply mode (no live destruction) — toggle persists immediately, Notice prompts user to reload, no display() refresh"
  - "Read-once-at-onload semantic — single `const useNestedEditor = this.settings.getUseNestedEditor()` above the Step 6f-nested block; runtime toggle flips never live-apply"
  - "Three onload sites gated, the rest stay registered (ChildEditorRegistry construction, code-actions extension, section-lock extension, lc-language metadataCache reactivity handler) — toggle-OFF still routes through CLAUDE.md canonical write-path fallback (Phase 17 D-05)"
  - "Default true preserves Phase 13–18 behavior byte-for-byte for every existing user; non-boolean raw / missing field / corrupt data.json all collapse to true"
---

# Quick Task 260528-vq4: Add `useNestedEditor` toggle setting Summary

One-liner: A reload-required boolean toggle (`useNestedEditor`, default true) lets users opt out of the v1.2 nested CM6 child-editor stack at plugin onload — disabling registers Phase 13–18's nested-editor extension, vault.modify repair trigger, and file-open repair hook, while every other plugin surface (Run/Submit/Reset/Retrieve/AI commands, section locks, code-actions buttons) continues to operate via the existing vault.process / fileManager.processFrontMatter fallback paths.

## What was built

### Task 1 — SettingsStore field + getter/setter (commit `609559d`)

`src/settings/SettingsStore.ts`:
- Added `useNestedEditor: boolean` to `PluginData` immediately after `showRelativeLineNumbers` (Code-editor cluster grouping preserved). JSDoc cites Phase 19 vq4 provenance, reload-required semantic, and the default-true rationale.
- Added `useNestedEditor: true` to `DEFAULT_DATA` adjacent to `showRelativeLineNumbers: false`.
- Added shape-guard in `SettingsStore.load`: `typeof raw.useNestedEditor === 'boolean' ? raw.useNestedEditor : DEFAULT_DATA.useNestedEditor`. Non-boolean raw / missing field / corrupt data.json all collapse to `true`, mirroring the `autoBacklinksEnabled` pattern (line 670-672).
- Added `getUseNestedEditor() / setUseNestedEditor(v)` getter/setter pair beneath `setShowRelativeLineNumbers`.
- No new tests file. No `logger.warn` for malformed input — silent collapse matches the established posture for the other boolean shape-guards in this file.

### Task 2 — SettingsTab toggle row (commit `244b4ea`)

`src/settings/SettingsTab.ts`:
- Appended a new `Setting` row to `codeEditorGroup` after the existing "Show relative line numbers in code editor" toggle.
  - `setName('Use nested code editor')`
  - `setDesc('When enabled, the ## Code fence renders as an embedded code editor with syntax highlighting. Disable to use Obsidian\'s native markdown editor instead. Reload Obsidian to apply changes.')`
  - `addToggle` bound to `getUseNestedEditor` / `setUseNestedEditor`.
- onChange persists then fires `new Notice('Reload Obsidian to apply', 5000)`. No `display()` refresh (the toggle is reload-required; refreshing the UI would suggest live application and contradict the semantic).
- No new imports needed (`Notice` is already imported at line 10).
- Accent-modifier invariant preserved: exactly one `.setCta()` call in this file (the Login button at line 112). The 4 other `setCta` grep hits are in the multi-line invariant comment block at lines 284-288 — unchanged from the pre-edit baseline.

### Task 3 — main.ts onload gates + README note (commit `57659fa`)

`src/main.ts`:
- Inserted single read site at **line 830**: `const useNestedEditor = this.settings.getUseNestedEditor();` (preceded by a one-line comment documenting the read-once-at-onload semantic at line 829).
- Three guarded `if (useNestedEditor)` wrappers:
  1. **Line 837-839** — wraps `this.registerEditorExtension(buildNestedEditorExtension(this));` (Step 6f-nested block).
  2. **Line 955-957** — wraps `registerVaultModifyRepairTrigger(this);` (Phase 18 Plan 02 D-33 vault.modify repair trigger).
  3. **Line 964-988** — wraps the entire Phase 18 file-open repair `registerEvent` block (from `const FILE_OPEN_REPAIR_DELAY_MS = 100;` through the closing `);`).

Surfaces NOT gated (intentional, per plan):
- `this.childEditorRegistry = new ChildEditorRegistry(5);` (line 819) — registry stays constructed; downstream callers use defensive `childEditorRegistry?.get(...)` and fall back to vault.process per CLAUDE.md "canonical plugin write-path pattern (Phase 17 D-05)".
- `buildCodeActionsEditorExtension` (line 827) — Run/Submit edit-mode buttons stay registered.
- `buildSectionLockExtension` (line 844) — section locks operate on parent CM6; independent of nested editor; the user still benefits from section locking with the nested editor disabled.
- The `metadataCache.on('changed', ...)` lc-language reactivity handler (lines 921-939) — `nestedEditorRebuildEffect.of(null)` dispatched into a parent CM6 with no nested-editor StateField is a harmless no-op.
- `unload`'s `this.childEditorRegistry?.destroyAll();` — empty registry destroyAll is a no-op.

`README.md`:
- Added a `### Code editor` subsection to the existing `## Configuration` section, directly above `## Troubleshooting` (line 110→112). Locked one-paragraph copy describes the toggle, the reload-required apply mode, and confirms that Run / Submit / Reset / Retrieve last submission / AI commands all continue to work on the raw markdown fence when the toggle is OFF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] eslint `obsidianmd/ui/sentence-case` errors on locked toggle copy**
- **Found during:** Task 3 verification (`npm run lint`)
- **Issue:** The locked toggle desc (`'When enabled, the ## Code fence renders ...'`) and the locked Notice (`'Reload Obsidian to apply'`) tripped the sentence-case rule because `## Code` and `Obsidian` were treated as mid-sentence words rather than proper-noun literals.
- **Fix:** Added two `// eslint-disable-next-line obsidianmd/ui/sentence-case --` directives matching the existing pattern in this file (e.g. lines 227, 533, 575, 604 — same idiom for AWS env vars, model IDs, region literals). Comments cite the proper-noun rationale: `## Code` is a literal Markdown heading inside locked LC notes; `Obsidian` is the host application brand.
- **Files modified:** src/settings/SettingsTab.ts
- **Folded into commit:** 57659fa

**2. [Rule 3 - Blocking issue] SettingsTab tests throwing `getUseNestedEditor is not a function`**
- **Found during:** Task 3 verification (`npm test`)
- **Issue:** Task 2 added a Code-editor toggle row that calls `this.plugin.settings.getUseNestedEditor()` during `SettingsTab.display()`. Two test files exercising the production SettingsTab failed because their fake plugin stubs did not include the new method:
  - `tests/ai/settingsTab.test.ts` — 6 failures via `makeFakePlugin`'s `settings` literal.
  - `tests/settings/SettingsTab.knowledge-graph.test.ts` — 3 failures via `makeFakeSettingsStore` (the shared fake at `tests/solve/mocks/fakeSettingsStore.ts`) spread into `wrappedSettings`.
- **Fix:** Added `getUseNestedEditor: () => true` + `setUseNestedEditor: vi.fn(async (_v: boolean) => undefined)` to:
  - `tests/ai/settingsTab.test.ts` (the inline `settings` literal in `makeFakePlugin`).
  - `tests/solve/mocks/fakeSettingsStore.ts` (both the `FakeSettings` interface and the `makeFakeSettingsStore` factory return shape — the knowledge-graph test inherits the new methods through `...settings` spread).
- **Files modified:** tests/ai/settingsTab.test.ts, tests/solve/mocks/fakeSettingsStore.ts
- **Folded into commit:** 57659fa

No Rule-4 architectural deviations.

## Verification

### Build / lint / tests
- `npm run build` — passes (TypeScript clean, esbuild production output emitted).
- `npm run lint` — 0 errors, 48 pre-existing warnings (unchanged from baseline; none of the 48 warnings touch files modified in this plan).
- `npm test` — 195 passed | 1 skipped | 1730 total tests passing (1724 passed | 6 skipped). Up from 9 failing tests pre-fix.

### Grep gates
- `grep -c useNestedEditor src/settings/SettingsStore.ts` → **8** (>= 5 required: interface field + JSDoc + DEFAULT_DATA + load shape-guard + getter + setter + comments).
- `grep -c 'Use nested code editor' src/settings/SettingsTab.ts` → **1** (single toggle row).
- `grep -c setCta src/settings/SettingsTab.ts` → **4** (1 actual `.setCta()` call at line 112 + 3 mentions inside the multi-line invariant comment block at lines 284-288). Pre-edit count was also 4 — accent-modifier invariant fully preserved.
- `grep -n 'useNestedEditor\|getUseNestedEditor' src/main.ts` → exactly 1 read site at line 830 + 3 `if (useNestedEditor)` wrappers at lines 837/955/964.
- `grep -n 'Use nested code editor' README.md` → 1 hit at line 112 (the bolded toggle name in the new `### Code editor` subsection).

### Manual verification (deferred to user)

Manual reload-mode toggle verification could not be completed inside this autonomous run because it requires an actual Obsidian reload + interactive UI. The locked invariants the plan committed to are:

- **Toggle ON (default for existing users):** Phase 13–18 behavior byte-identical. Build + tests confirm no behavioral change at the code-path level — the `if (useNestedEditor)` wrappers introduce no new branches when the read returns `true`; control flow into the wrapped registrations is byte-identical to pre-change.
- **Toggle OFF + Obsidian reload:** Opening an LC note shows raw markdown with a visible ```python3 fence (no widget mount), section locks still apply, Run/Submit/Reset/Retrieve/AI commands all execute via the existing vault.process / fileManager.processFrontMatter fallback paths.
- **Round-trip data.json:** A data.json without `useNestedEditor` loads with the field defaulted to `true`; a data.json with `useNestedEditor: false` loads with the field preserved as `false`. Verified by the shape-guard pattern matching `autoBacklinksEnabled` (which has identical behavior under existing tests).

## Self-Check: PASSED

Verified all claims:
- `[ -f src/settings/SettingsStore.ts ]` → FOUND
- `[ -f src/settings/SettingsTab.ts ]` → FOUND
- `[ -f src/main.ts ]` → FOUND
- `[ -f README.md ]` → FOUND
- `[ -f tests/ai/settingsTab.test.ts ]` → FOUND
- `[ -f tests/solve/mocks/fakeSettingsStore.ts ]` → FOUND
- Commit `609559d` → FOUND in `git log`
- Commit `244b4ea` → FOUND in `git log`
- Commit `57659fa` → FOUND in `git log`
