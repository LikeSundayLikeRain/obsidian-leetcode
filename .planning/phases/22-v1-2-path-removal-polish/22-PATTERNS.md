# Phase 22: v1.2 Path Removal + Polish - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 24 (5 deletion targets + 8 dead test deletions + 11 modified)
**Analogs found:** 11 / 11 modified (deletion targets are documented as "deletion-only — no analog needed")

## Phase Shape Notice

Phase 22 is unusual: most "files touched" are **DELETED**, not edited. For deleted files, the pattern question is inverted — instead of "what to copy," the question is "what export surface must callers stop importing." For modified files, the modification is **subtractive** (delete branches, strip annotations, lower constants), so the closest analog is almost always **the file's own current state** (self-analog) — the pattern to copy is the surrounding code that survives the deletion.

## File Classification

### Deletion Targets (no analog needed)

| File | Role | Data Flow | LOC | Export Surface (callers must stop importing) |
|------|------|-----------|-----|-----------------------------------------------|
| `src/main/childEditorSync.ts` | editor-extension | event-driven | 809 | `wireSyncIfNeeded`, `unwireSync`, `detectAndPropagateExternalChange`, `createScrollIntoViewExtension`, `createChildSyncExtension` |
| `src/main/sectionLockExtension.ts` | editor-extension | event-driven | 527 | `buildSectionLockExtension` (replaced by `sectionProtectionExtension.ts`) |
| `src/main/nestedEditorExtension.ts` | editor-extension | event-driven | 395 | `buildNestedEditorExtension`, `nestedEditorRebuildEffect`, `ECHO_PRONE_USER_EVENTS` |
| `src/main/childEditorRegistry.ts` | registry | request-response | 114 | `ChildEditorRegistry` (replaced by `widgetRegistry.ts`) |
| `src/main/codeActionsEditorExtension.ts` | editor-extension | event-driven | 401 | `buildCodeActionsEditorExtension` (replaced by `widgetActions.ts`; `findCodeFence` already lifted to `fenceLocator.ts`) |

| Dead Test File | Reason for Deletion |
|----------------|---------------------|
| `tests/main/childEditorSync.test.ts` | tests DELETE-01 |
| `tests/main/childEditorSync.repair.test.ts` | tests DELETE-01 |
| `tests/main/sectionLockExtension.test.ts` | tests DELETE-02 |
| `tests/main/nestedEditorExtension.test.ts` | tests DELETE-03 |
| `tests/main/codeActionsEditorExtension.test.ts` | tests DELETE-05 |
| `tests/main/childEditorRegistry.test.ts` | tests DELETE-04 |
| `tests/main/resetCommand.childDispatch.test.ts` | tests v1.2 reset child-dispatch path (dies with DELETE-04) |
| `tests/main/tabMidLine.test.ts` | tests v1.2 nested-editor Tab handling (dies with DELETE-03) |

**Audit-expand candidates** (per RESEARCH §14 — planner verifies):
- `tests/main/mutualExclusion.test.ts` — likely DELETE (mutual-exclusion logic dies in sub-step E).
- `tests/main/childEditorFactory.test.ts` — VERIFY (factory imports `createScrollIntoViewExtension` from deleted `childEditorSync.ts`).
- `tests/main/fileOpenRetrofit.test.ts` — VERIFY (legacy retrofit path dies).
- `tests/main/switchFenceLanguage.test.ts` — VERIFY.
- `tests/integration/sectionLockIntegration.test.ts` — likely DELETE (imports `sectionLockExtension`).
- `tests/main/lifecycle.test.ts` — VERIFY (imports `ChildEditorRegistry`).

### Modified Files

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/main.ts` | plugin lifecycle / wiring | event-driven | self-analog (subtractive edits) | exact |
| `src/settings/SettingsStore.ts` | settings persistence | CRUD | self-analog (`autoMigrateOnOpen` field shows the keep-pattern; `useNestedEditor` mapper at lines 711-713 shows the delete-pattern shape) | exact |
| `src/settings/SettingsTab.ts` | settings UI | request-response | self-analog (existing toggle UI blocks at adjacent settings show the keep-pattern) | exact |
| `src/widget/WidgetController.ts` | CM6 widget controller | event-driven | self-analog (existing Tab handler at lines 1071-1095 + `@replit/codemirror-vim` `Vim.handleKey` API) | exact |
| `styles.css` | CSS | n/a | self-analog (existing `.lc-nested-editor` rules at lines 1950-1955; existing `.leetcode-code-actions` rules at lines 943-971; existing `:hover` rules in file as scoping reference) | exact |
| `scripts/check-bundle-size.mjs` | CI gate script | batch | self-analog (existing `HARD_LIMIT` / `SOFT_WARN` constants — edit values, no structural change) | exact |
| `CLAUDE.md` | docs | n/a | self-analog (paragraphs at lines 195 + 197 are deletion targets; `## Architecture` placeholder is fill target) | exact |
| `README.md` | docs | n/a | self-analog (existing version section + feature sections show the keep-pattern) | exact |
| `manifest.json` | plugin manifest | n/a | self-analog (single-field version bump) | exact |
| `package.json` | npm manifest | n/a | self-analog (single-field version bump in lockstep) | exact |
| `src/solve/codeExtractor.ts` + `src/solve/starterCodeInjector.ts` + `src/notes/NoteTemplate.ts` + `src/notes/NoteWriter.ts` + `src/contest/ContestFinalizer.ts` + `src/widget/codeBlockProcessor.ts` + `src/widget/liveModeBannerStateField.ts` + `src/widget/liveModeViewPlugin.ts` + `src/widget/{themeListener,multiPaneCoordinator,WidgetController,migrationBackupGc,fenceMigrator}.ts` + `src/main/readingMode{MigrationHook,LegacyBannerPostProcessor}.ts` | various (consumers) | various | self-analog (each file: delete `useInlineWidget` gate, branch collapses to v1.3-only) | exact |

## Pattern Assignments

### Plan 22-01 sub-step A — Default flip + mutual-exclusion inversion

**File 1: `src/settings/SettingsStore.ts`**

**Self-analog — single-line literal flip.** Pattern is "flip a boolean default value in `DEFAULT_DATA`."

Line 287 (verbatim from RESEARCH §1 + Code Examples):
```typescript
// BEFORE
useInlineWidget: false,
// AFTER
useInlineWidget: true,
```

**File 2: `src/main.ts`**

**Self-analog — invert predicate + change Notice text + flip setter target.** Pattern is "invert the mutual-exclusion guard so 1.2.x users carrying `useInlineWidget: false` get force-flipped on boot."

Lines 1128-1144 (verbatim from RESEARCH §1):
```typescript
// BEFORE
let useNestedEditor = this.settings.getUseNestedEditor();
const useInlineWidget = this.settings.getUseInlineWidget();

if (useInlineWidget && useNestedEditor) {
  new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)', 5000);
  await this.settings.setUseNestedEditor(false);
  useNestedEditor = false;
}

// AFTER (sub-step A — same commit as DEFAULT_DATA flip)
if (!useInlineWidget && useNestedEditor) {
  new Notice('v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget', 5000);
  await this.settings.setUseInlineWidget(true);
}
```

**Notice invocation shape pattern** (preserved from existing code):
```typescript
new Notice('<message>', 5000);  // 5-second timeout standard
```

---

### Plan 22-01 sub-steps C+D — Source + test deletions

**No analog needed.** Pattern is `git rm <file>` per the deletion target table above. Atomic commit per sub-step (one for sources, one for tests). After deletions, verify no orphan imports via `npm run build` (tsc is the enforcement mechanism).

**Verification pattern**: between commits, `npm run build` must succeed. If it fails, an importer was missed — track it down in the post-deletion grep audit.

---

### Plan 22-01 sub-step E — `src/main.ts` atomic unwire + 16-file `useInlineWidget` strip + userEvent annotation strip + CLAUDE.md Conventions delete

**File 1: `src/main.ts` (heaviest unwiring site — ~26 hits)**

**Self-analog — gate-removal pattern.** Every `if (useInlineWidget) { ... }` becomes the unconditional block; every `if (!useInlineWidget) { ... }` is deleted; every `else` arm of a `useInlineWidget` ternary collapses to the v1.3 arm.

**Branch-collapse pattern** (from RESEARCH Code Examples):
```typescript
// BEFORE
if (useNestedEditor) {
  this.registerEditorExtension(buildNestedEditorExtension(this));
}
if (useInlineWidget) {
  this.widgetRegistry = new WidgetRegistry();
  // ... (v1.3 widget registration block)
  this.registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this));
  registerLegacyBannerPostProcessor(this);
  this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);
}

// AFTER (sub-step E)
this.widgetRegistry = new WidgetRegistry();
// ... (entire v1.3 widget registration block — unconditional)
this.registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this));
registerLegacyBannerPostProcessor(this);
this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);
```

**`register*` lifecycle shape (must be preserved unchanged)**:
- `this.registerEditorExtension(...)` — registers a CM6 extension; auto-cleaned on plugin unload.
- `this.registerMarkdownCodeBlockProcessor('<id>', <fn>)` — registers a Reading-mode processor.
- `this.registerInterval(setInterval(...))` — auto-cleared interval.
- `this.registerEvent(this.app.vault.on('modify', ...))` — auto-removed listener.
- `this.addCommand({...})` — registered command; matched in `onunload` via `removeCommand` if needed.

**`childEditorRegistry` deletion pattern**: every `this.childEditorRegistry?.get(file.path)` lookup branch deletes wholesale (the whole `if (childEditor) { dispatch on child }` arm dies — Reset goes through `widgetRegistry` directly).

**`ECHO_PRONE_USER_EVENTS` deletion pattern**: import line + any reference (`if (ECHO_PRONE_USER_EVENTS.has(...))`) deletes.

**`nestedEditorRebuildEffect` deletion pattern**: import line + every `cm.dispatch({ effects: nestedEditorRebuildEffect.of(...) })` site deletes.

**File 2: `src/main.ts` userEvent annotation strip (D-unwire-02)**

**Self-analog — object-property deletion within `cm.dispatch({...})` calls.** Strip `userEvent: 'leetcode.<verb>',` from the dispatch spec object; preserve the `changes` and `selection` keys.

Active dispatch sites per RESEARCH §3:
- Line 3395 — `'leetcode.lang-switch'` (parent-CM6 dispatch in `switchFenceLanguage`).
- Line 3905 — `'leetcode.lang-switch'` (child-CM6 dispatch in `dispatchChildLanguageReconfigure`).
- Line 3963 — `'leetcode.lang-switch'` (second child-CM6 dispatch).
- Line 4546 — `'leetcode.reset.child'` (DEAD — entire enclosing `childEditorRegistry?.get(file.path)` branch deletes anyway).

Strip pattern (from RESEARCH Code Examples §sub-step E):
```typescript
// BEFORE
view.editor.cm.dispatch({
  changes: { from: bodyFrom, to: bodyTo, insert: newCodeBlock },
  selection: ...,
  userEvent: 'leetcode.lang-switch',
});

// AFTER
view.editor.cm.dispatch({
  changes: { from: bodyFrom, to: bodyTo, insert: newCodeBlock },
  selection: ...,
});
```

Plus 3 doc-comment references to retire:
- `src/widget/childParentSync.ts:15` — rewrite without userEvent reference.
- `src/solve/resetCodeWithConfirm.ts:114` — rewrite.
- `src/main/sectionProtectionExtension.ts:25` — rewrite.
- `src/main.ts:3384` and similar prose comments — rewrite.

**File 3: `src/settings/SettingsStore.ts` field deletions**

**Self-analog — typed-mapper deletion (RESEARCH §10).** Pattern is "delete the field literal from the type, `DEFAULT_DATA`, the `loadFromRaw` return-object literal, and the getter/setter."

Existing `loadFromRaw` shape (verbatim from RESEARCH §10, lines 711-713):
```typescript
useNestedEditor: typeof raw.useNestedEditor === 'boolean'
  ? raw.useNestedEditor
  : DEFAULT_DATA.useNestedEditor,
```

**Read-and-ignore deletion pattern** (the entire 3-line block above is deleted from the return-object literal — no replacement). Persisted `data.json` field disappears on next `saveData`.

Targets in `SettingsStore.ts`:
- Line 86 — `useNestedEditor: boolean;` field on `LeetCodeSettings` interface (DELETE).
- Line 287 — `useNestedEditor: true,` in `DEFAULT_DATA` (DELETE).
- Lines 711-713 — `useNestedEditor:` mapper block in `loadFromRaw` (DELETE).
- `getUseNestedEditor()` getter (DELETE).
- `setUseNestedEditor()` setter (DELETE).
- Same shape for `useInlineWidget` deletions (line 86 type, line 287 `DEFAULT_DATA`, lines 715-720 mapper, lines 913+919 getter/setter).

**File 4: `src/settings/SettingsTab.ts`**

**Self-analog — UI block deletion.** Adjacent `Setting` chains in the same file are the keep-pattern; the `useInlineWidget` toggle UI block (lines 278-305) and the `useNestedEditor` toggle UI block delete wholesale.

**`Setting` chain shape** (preserved by surviving toggles):
```typescript
new Setting(containerEl)
  .setName('<name>')
  .setDesc('<description>')
  .addToggle((toggle) =>
    toggle
      .setValue(this.plugin.settings.get<X>())
      .onChange(async (value) => {
        await this.plugin.settings.set<X>(value);
      }),
  );
```

Delete the entire `new Setting(...)` chain for the deleted toggles.

**Files 5-16: 14 consumer files with `useInlineWidget` references**

Per RESEARCH §2 enumeration. Pattern per file is identical: **gate-removal — `if (useInlineWidget)` body becomes unconditional; `if (!useInlineWidget)` body deletes; ternary `getUseInlineWidget?.() === true ? A : B` collapses to `A`.**

Specific high-impact callsites:

- **`src/notes/NoteTemplate.ts:237-241`** — `BuildNoteBodyInput.useInlineWidget?: boolean` field DELETES; ternary `input.useInlineWidget ? codeBlockForV13(...) : codeBlockFor(...)` collapses to `codeBlockForV13(...)` (or rename `codeBlockForV13` → `codeBlockFor` and delete the legacy emitter).

- **`src/notes/NoteWriter.ts:582-597`** — `if (!useInlineWidget) { retrofitStarterCode(...) }` legacy retrofit guard DELETES entirely (Phase 21 plan 21-13 already gated on `useInlineWidget=ON`; the unreachable `!` branch dies).

- **`src/solve/starterCodeInjector.ts:284-290`** — `getUseInlineWidget?(): boolean` arg in `SettingsHost` interface DELETES; ternary `settings.getUseInlineWidget?.() === true ? 'leetcode-solve' : 'legacy'` collapses to `'leetcode-solve'`.

- **`src/contest/ContestFinalizer.ts:308, 315`** — drop `useInlineWidget: settings.getUseInlineWidget?.() ?? false` from call site arg.

- **`src/widget/liveModeBannerStateField.ts:276`** — `getUseInlineWidget?.() !== false` gate becomes unconditional `true` (or remove gate).

- **Comment-only sites** (10+ files in RESEARCH §2 table): rewrite the comment to drop the `useInlineWidget` reference; do not delete the surrounding code.

**File 17: `CLAUDE.md`**

**Self-analog — Markdown bullet deletion.** Delete both bullets at lines 195 + 197 (multi-line paragraphs); delete the `## Conventions` heading itself (per RESEARCH §11 — the section becomes empty).

---

### Plan 22-02 sub-tasks — Carry-over polish

**D-polish-01: Vim-Tab cursor-marker sync (`src/widget/WidgetController.ts:1071-1095`)**

**Self-analog — extend existing Tab handler with `Vim.handleKey` probe.**

Existing handler shape (verbatim from RESEARCH §4):
```typescript
keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const cm5 = getCM(view);
      if (cm5 && !cm5.state.vim?.insertMode) return false;
      const sel = view.state.selection.main;
      const target = view as unknown as Parameters<typeof insertTab>[0];
      if (!sel.empty) return indentMore(target);
      return insertTab(target);
    },
  },
]),
```

**`@replit/codemirror-vim@6.3.0` API** (verified — `node_modules/@replit/codemirror-vim/dist/index.d.ts:11`):
```typescript
handleKey: (cm: CodeMirror, key: string, origin: string) => undefined | boolean;
```

**Probe shape (5-LOC change if probe succeeds, per RESEARCH §4)**:
```typescript
import { Vim, getCM } from '@replit/codemirror-vim';

run: (view) => {
  const cm5 = getCM(view);
  if (cm5 && !cm5.state.vim?.insertMode) return false;
  // PROBE: route Tab through Vim.handleKey so block-cursor marker tracks
  if (cm5 && cm5.state.vim?.insertMode) {
    const handled = Vim.handleKey(cm5, '<Tab>', 'mapping');
    if (handled === true) return true;
  }
  // Existing fallthrough — insertTab / indentMore unchanged
  const sel = view.state.selection.main;
  const target = view as unknown as Parameters<typeof insertTab>[0];
  if (!sel.empty) return indentMore(target);
  return insertTab(target);
},
```

**Time-box**: 30 min in dev vault. If probe doesn't update marker, defer to v1.3.x backlog (file GitHub issue + README note).

**D-polish-02: Widget hover border removed (`styles.css`)**

**Self-analog — existing `.lc-nested-editor` rules at lines 1950-1955.**

Existing rule shapes (RESEARCH §5):
```css
/* Lines 1950-1952 — outer transparent wrapper */
.cm-editor .lc-nested-editor { ... }

/* Lines 1953-1955 — inner grey-paint wrapper */
.cm-editor .lc-nested-editor .leetcode-widget-codeblock { ... }
```

**New rule pattern** (insert near lines 1955; respects cursor-marker rules at 2014-2035):
```css
/* Phase 22 D-polish-02 — suppress Obsidian's default :hover border bleed.
 * Scoped to outer wrapper; leaves inner CM6 cursor-marker / focus-ring
 * rules at lines 2014-2035 unaffected. */
.cm-editor .lc-nested-editor:hover,
.cm-editor .lc-nested-editor .leetcode-widget-codeblock:hover {
  border: none;
  outline: none;
}
```

**MUST NOT** set `background-color` (would defeat the hover-aware grey paint at lines 1953-1955).

**D-polish-03: Action row font (`styles.css`)**

**Self-analog — existing `.leetcode-code-actions` rules at lines 943-971.**

Existing rule shapes (RESEARCH §5):
```css
/* Lines 943-956 */
.leetcode-code-actions { display: flex; ... }

/* Lines 961-971 — !important to defeat .cm-content cascade */
.cm-editor .cm-content > .leetcode-code-actions,
.cm-content > .leetcode-code-actions {
  display: flex !important;
  ...
}
```

**New rule pattern** (insert near line 956 or 971):
```css
/* Phase 22 D-polish-03 — action row chrome reads as UI, not as code.
 * Override inherited monospace from .cm-editor / .cm-content. */
.leetcode-code-actions,
.leetcode-code-actions * {
  font-family: var(--font-text);
}
```

**Variable convention**: `var(--font-text)` is canonical (per CSS variables already used in file; see `var(--background-modifier-hover)`, `var(--text-muted)` precedents).

---

### Plan 22-03 sub-tasks — Release gates

**D-gate-01: Bundle-size gate (`scripts/check-bundle-size.mjs`)**

**Self-analog — edit constants, no structural change.**

Existing constants (RESEARCH §6):
```javascript
const HARD_LIMIT = 1_800_000;      // current — Phase 17 vim ceiling
const SOFT_WARN = 1_710_000;       // 95% of HARD
const PATH = 'main.js';
```

**Phase 22 edit pattern** (lower thresholds; no logic change — exit-1 on `size > HARD_LIMIT` is preserved):
```javascript
// Phase 22 D-gate-01 — v1.2 baseline cap (POLISH-02).
// Net deletion ~−2,400 LOC; expected post-Phase-22 ~1.5 MB.
const HARD_LIMIT = 1_706_000;     // FAILS CI on regression past v1.2 baseline.
const SOFT_WARN = 1_500_000;      // ~88% of HARD; bites earlier than 95%.
```

**Ordering invariant** (per RESEARCH Pitfall §5): merge or rebase Plan 22-01 onto current branch FIRST, run `npm run build && wc -c main.js` to confirm post-deletion size, THEN lower constants. Otherwise CI fails immediately.

**`package.json` hookup unchanged**: `scripts.check:bundle-size` → `node scripts/check-bundle-size.mjs`; `scripts.ci` chains it after build; `.github/workflows/ci.yml` consumes exit code.

**D-gate-02: eslint clean run + `innerHTML` scan**

**Self-analog — verification only; baseline is already passing per RESEARCH §7.** Zero active `innerHTML` assignments in `src/widget/` (5 hits, all comments). Pattern is "run `npm run lint` and `grep -rn 'innerHTML' src/widget/` and verify clean."

**D-gate-03: Manual theme-regression checklist (THEME-05)**

**No code analog.** Pattern is the procedural checklist in RESEARCH §8 — `git checkout 2411f8e` (v1.2 ship commit), rebuild, capture 5 themes × 3 views screenshots into `baseline-screenshots/`, restore Phase 22 branch, capture comparison set, document in `22-VERIFICATION.md`.

**D-gate-04: BRAT alpha + plugin-store re-review**

**Self-analog — existing release workflow at `.github/workflows/release.yml:32-72`.**

Existing automation (RESEARCH §9):
- Tag pattern `[0-9]+.[0-9]+.[0-9]+*` triggers release.
- Auto-detects pre-release via `-` separator.
- Auto-patches `manifest.json` from tag.
- Attaches `main.js`, `manifest.json`, `styles.css` (if present).

**Tag command pattern** (no workflow changes needed):
```bash
git tag -a 1.3.0-beta.1 -m "v1.3.0-beta.1 — BRAT alpha (POLISH-06)"
git push origin 1.3.0-beta.1
# 7-day dogfood window
git tag -a 1.3.0 -m "v1.3.0 — Inline Widget Architecture (milestone close)"
git push origin 1.3.0
```

**D-manifest-01: `manifest.json` + `package.json` lockstep version bump**

**Self-analog — single-field JSON edit.**

Current state (RESEARCH §9):
- `manifest.json` `"version": "1.0.1"` (stale; auto-patched by release workflow at ship time).
- `package.json` `"version": "1.2.0"`.

**Pattern**: bump both to `1.3.0-beta.1` for BRAT, then `1.3.0` for GA. Lockstep is enforced by Pitfall §6 — divergence creates dev-vault confusion.

**`manifest.json` field-preserve invariants** (must NOT change in the bump commits):
- `"isDesktopOnly": true` — community-plugin requirement.
- `"id": "leetcode"` — community-plugins.json registration key.
- `"description"` — 60 chars, well under 250 limit; ends with `.`.

**D-readme-01: `README.md` v1.3 update**

**Self-analog — existing version + feature sections.** Pattern is "add v1.3 callout to existing version section; add migration / sync / Cmd-Z / Cmd-F subsections in feature-section style."

Required content per CONTEXT D-readme-01 (5 items: a–e). No specific code analog — standard Markdown edit.

**D-claude-02: `CLAUDE.md` `## Architecture` fill**

**Self-analog — existing empty `## Architecture` placeholder ("Architecture not yet mapped. Follow existing patterns found in the codebase.").**

Recommended fill content verbatim from RESEARCH §11 — ~5-10 lines describing widget-only path, `vault.process` mutation primitive, `lc-language` frontmatter as canonical Run/Submit dispatch, `sectionProtectionExtension` narrow scope, migration infrastructure retention.

## Shared Patterns

### Pattern S-01: Atomic commit per concern (Phase 19/20/21 carry-over)

**Source**: established discipline; visible in `git log` history of phases 19-21.
**Apply to**: every Phase 22 sub-step.
**Shape**:
- Sub-step A → 1 commit `feat(22-01): flip useInlineWidget default to true`.
- Sub-step C → 1 commit `chore(22-01): delete v1.2 source files (DELETE-01..05)`.
- Sub-step D → 1 commit `chore(22-01): delete dead v1.2 test files (DELETE-07)`.
- Sub-step E → 1 commit `chore(22-01): unwire v1.2 path from src/main.ts + retire 'leetcode.*' userEvent convention (DELETE-06, DELETE-08, PROTECT-03)`.
- Polish: 1 commit per polish item (`fix`, `style`, `style`).
- Release gates: 1 commit per artifact.

### Pattern S-02: Read-and-ignore for deprecated settings fields (NEW pattern, established in Phase 22)

**Source**: D-settings-01.
**Apply to**: `useNestedEditor` deletion (sub-step E); future deprecations.
**Shape**: drop field from type / `DEFAULT_DATA` / `loadFromRaw` mapper / accessors. No active migration code. Persisted field disappears on next `saveData`.

### Pattern S-03: Gate-removal (`useInlineWidget` master gate dies)

**Source**: D-unwire-01.
**Apply to**: every `if (useInlineWidget) { ... }` site across 16 files (RESEARCH §2 table).
**Shape**:
- `if (useInlineWidget) { A }` → `A` (unconditional).
- `if (!useInlineWidget) { B }` → delete entirely.
- `useInlineWidget ? A : B` → `A`.
- `getUseInlineWidget?.() === true ? A : B` → `A`.
- `getUseInlineWidget?.() !== false` → `true` (or remove gate).
- Optional `getUseInlineWidget?(): boolean` field on `SettingsHost` interfaces → delete the optional method declaration.

### Pattern S-04: `cm.dispatch` shape minus userEvent annotation

**Source**: D-unwire-02 (PROTECT-03).
**Apply to**: 4 active dispatch sites in `src/main.ts` + 3 doc-comment references.
**Shape**: delete `userEvent: 'leetcode.<verb>',` property from the dispatch spec object; preserve `changes` and `selection` keys; preserve `addToHistory.of(false)` annotation if present (Phase 17 D-05 child→parent mirror pattern, which itself is being retired with the convention).

### Pattern S-05: TypeScript-enforced atomic commit for `src/main.ts` unwire

**Source**: D-unwire-01 + Pitfall §1.
**Apply to**: sub-step E.
**Shape**: half-unwired `main.ts` doesn't compile. Run `npm run build` after each substantive deletion within working state (no commits between); commit only when full suite + tsc clean. Single commit per the "moment tsc passes" rule.

### Pattern S-06: Notice invocation (preserved unchanged)

**Source**: existing `src/main.ts` Notice pattern at line 1141 (and elsewhere).
**Apply to**: D-cutover-02 inversion Notice in sub-step A.
**Shape**: `new Notice('<message>', 5000);` — 5-second timeout standard.

## No Analog Found

None. Every modified file in Phase 22 has either a self-analog (subtractive edit) or an existing infrastructure to extend (`scripts/check-bundle-size.mjs`, `.github/workflows/release.yml`). Deleted files are documented in the deletion table above with their export surface so the planner can verify orphan-import elimination.

## Metadata

**Analog search scope**: `src/`, `tests/`, `scripts/`, `styles.css`, `CLAUDE.md`, `manifest.json`, `package.json`, `node_modules/@replit/codemirror-vim/dist/`.
**Files scanned**: 24 (via CONTEXT.md + RESEARCH.md §1-§14 enumerations).
**Pattern extraction date**: 2026-06-02.
**Pattern extraction strategy**: self-analog dominant — Phase 22 is subtractive, not additive. The "what to copy" question reduces to "what surrounding code survives."
