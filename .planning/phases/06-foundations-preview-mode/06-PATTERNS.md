# Phase 06: Foundations + Preview Mode — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 17 (8 NEW + 9 MODIFIED)
**Analogs found:** 17 / 17 (every NEW file has a strong codebase analog)

---

## File Classification

| File (NEW or MODIFIED) | Status | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `src/preview/ProblemPreviewView.ts` | NEW | view (ItemView) | request-response (slug → render) | `src/browse/ProblemBrowserView.ts` (ItemView lifecycle) + `src/graph/SubmissionDetailModal.ts` (MarkdownRenderer.render call shape) | exact (composite) |
| `src/preview/previewRouter.ts` | NEW | utility (free-function) | event-driven (intent dispatch) | `src/main.ts:489-504` `activateBrowser` (`getLeavesOfType` + `setViewState` + `revealLeaf`) | exact |
| `src/preview/previewExistingNote.ts` | NEW | utility (pure helper) | request-response (slug → {fileExists, file?, id?}) | `src/notes/NoteWriter.ts:218-225` (cache + `buildNotePath` + `getAbstractFileByPath` chain) | exact |
| `src/notes/detailCacheHelpers.ts` *(or `export` `toDetailCacheEntry` from NoteWriter)* | NEW | utility (pure mapper) | transform | `src/notes/NoteWriter.ts:527-548` (`toDetailCacheEntry` private helper) | exact |
| `scripts/check-bundle-size.mjs` | NEW | config (build script) | batch (file → exit code) | `scripts/check-bundle-size.sh` (existing bash version) | exact (rewrite-in-Node) |
| `.github/workflows/ci.yml` | NEW | config (CI) | event-driven (push/PR) | none — `.github/` directory does not exist; first workflow file in repo | NO ANALOG (use RESEARCH §Example 7) |
| `tests/preview/*.test.ts` (router, click-behavior, header-render, start-button, existing-note-detection, tab-reuse, detach, regression-grep, command-ids, right-click) | NEW | test (vitest unit) | request-response | `tests/browse/ProblemBrowserView.badge.test.ts` (`vi.mock('obsidian')` + pure-helper export) + `tests/settings/SettingsTab.test.ts` (RED-shell pattern) | exact |
| `tests/foundations/eslint-config.test.ts` | NEW | test | unit | `tests/settings/SettingsStore.techniques-override.test.ts` (loader-introspection style) | role-match |
| `tests/foundations/check-bundle-size.test.ts` | NEW | test | unit | none (new script under test) | partial (use mock-vault `fs` shape from `tests/helpers/`) |
| `tests/foundations/ci-workflow.test.ts` | NEW | test | unit (YAML parse + assert) | none in repo | NO ANALOG |
| `tests/settings/preview-click-behavior.test.ts` | NEW | test | unit | `tests/settings/SettingsStore.techniques-override.test.ts` | exact |
| `src/main.ts` | MODIFIED | controller (plugin lifecycle) | event-driven | self (existing onload Step 6a/c registers) | self-edit |
| `src/browse/ProblemBrowserView.ts` | MODIFIED | view | request-response | self (line 605-609 row-click handler) | self-edit |
| `src/settings/SettingsStore.ts` | MODIFIED | persistence | CRUD | self (lines 49-87 PluginData; 81-86 `techniquesFolderOverride` shape-guard precedent) | self-edit |
| `src/settings/SettingsTab.ts` | MODIFIED | view (settings UI) | event-driven | self (lines 149-173 Notes section; 182-213 Knowledge graph section) | self-edit |
| `package.json` | MODIFIED | config | static | self (line 21: `eslint-plugin-obsidianmd@0.2.9` → `^0.3.0`; line 11: `check:bundle-size` script registration) | self-edit |
| `styles.css` | MODIFIED | style | static | self (lines 184-186 `.lc-diff--*` cluster; lines 303-313 `.lc-empty` rule) | self-edit |

---

## Pattern Assignments

### `src/preview/ProblemPreviewView.ts` (view, ItemView)

**Primary analog (lifecycle):** `src/browse/ProblemBrowserView.ts`
**Secondary analog (MarkdownRenderer call):** `src/graph/SubmissionDetailModal.ts`

#### Imports pattern (copy from `src/browse/ProblemBrowserView.ts:1-22`)

```typescript
// src/browse/ProblemBrowserView.ts:5-22
import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type LeetCodePlugin from '../main';
// WR-02: route all timers through the popout-aware helpers used by Throttle …
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';
```

For preview, add: `MarkdownRenderer` from `'obsidian'`, `type ViewStateResult` from `'obsidian'`, and `htmlToMarkdown` from `'../notes/htmlToMarkdown'`, `buildNotePath` from `'../notes/NoteTemplate'`.

#### View-type constant + class declaration (copy from `src/browse/ProblemBrowserView.ts:23, 62-86`)

```typescript
// src/browse/ProblemBrowserView.ts:23
export const BROWSER_VIEW_TYPE = 'leetcode-browser';

// src/browse/ProblemBrowserView.ts:62-86
export class ProblemBrowserView extends ItemView {
  // ... private state ...

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
    this.navigation = false;   // D-06: static dock view
  }

  getViewType(): string { return BROWSER_VIEW_TYPE; }

  getDisplayText(): string { return 'LeetCode problems'; }
  getIcon(): string { return 'code-2'; }
```

For preview: `export const PREVIEW_VIEW_TYPE = 'leetcode-preview';`, `getIcon()` returns `'eye'` (fallback `'book-open'`), `getDisplayText()` reads `this.plugin.settings.getProblemDetail(this.slug)` to compose `Preview: {id}. {title}` (RESEARCH §Pattern 2 example).

#### `setState` / `getState` for slug persistence (NEW — RESEARCH Pattern 2 sketch)

No exact in-repo analog (no other ItemView in v1.0 persists state across reload). Use the RESEARCH.md §Code Examples §Example 6 skeleton verbatim. Anchor to the existing constructor + `navigation = false` pattern from `ProblemBrowserView.ts:78-81`.

#### `MarkdownRenderer.render` call (copy from `src/graph/SubmissionDetailModal.ts:124-143`)

```typescript
// src/graph/SubmissionDetailModal.ts:124-143
// D-31 — Code body rendered via MarkdownRenderer.render so Obsidian's
// CM6 syntax highlighter lights up the fenced block. The container is a
// <div> wrapper styled under .leetcode-submissions-code (NOT a raw <pre>)
// so Obsidian's rendered <pre><code> sits inside our scoped block.
// Pitfall 6: component.load() was called in onOpen before this runs.
const codeContainer = appendEl(
  this.contentEl,
  'div',
  'leetcode-submissions-code',
);
const fenced =
  '```' + (this.deps.lang || 'text') + '\n' + this.deps.code + '\n```\n';
await MarkdownRenderer.render(
  this.app,
  fenced,
  codeContainer,
  this.deps.file.path,
  this.component,
);
```

**Adaptation for preview (the critical change):** the modal passes `this.component` (a *child* `Component` it owns) and `this.deps.file.path` as `sourcePath`. The preview passes `this` (the view itself, which extends `ItemView extends View extends Component`) and `''` as `sourcePath` (no file backing the preview). RESEARCH §3 confirms this satisfies `obsidianmd/no-plugin-as-component`. Final shape:

```typescript
const md = htmlToMarkdown(detail.contentHtml);
await MarkdownRenderer.render(this.app, md, body, '', this);
```

#### `onOpen` / `onClose` lifecycle + cleanup (copy from `src/browse/ProblemBrowserView.ts:88-167`)

```typescript
// src/browse/ProblemBrowserView.ts:88-91
async onOpen(): Promise<void> {
  const root = this.containerEl.children[1] as HTMLElement;
  root.empty();
  root.addClass('leetcode-browser');
  // ... render ...
}

// src/browse/ProblemBrowserView.ts:155-167
async onClose(): Promise<void> {
  if (this.searchDebounce !== null) {
    clearWindowTimeout(this.searchDebounce);
    this.searchDebounce = null;
  }
  // Tear down throttle subscription + pending timer (D-13 cleanup).
  this.clearThrottleFooterTimer();
  // ...
}
```

For preview: `onClose` should clear any in-flight cache-miss timer handle (none expected currently), and detach any DOM listeners. The preview view does NOT need a `Component.load()/.unload()` pair (unlike the modal — `ItemView` is itself a Component, the lifecycle is automatic).

#### Empty/Loading/Error state pattern (copy from `src/browse/ProblemBrowserView.ts:303-314`)

```typescript
// src/browse/ProblemBrowserView.ts:303-314
private renderEmptyState(
  root: HTMLElement,
  opts: { heading: string; body: string; buttonText?: string; onAction?: () => void | Promise<void> },
): void {
  const wrap = root.createDiv({ cls: 'lc-empty' });
  wrap.createEl('h3', { text: opts.heading });
  wrap.createEl('p', { text: opts.body, cls: 'lc-empty__body' });
  if (opts.buttonText && opts.onAction) {
    const btn = wrap.createEl('button', { text: opts.buttonText, cls: 'lc-empty__btn' });
    btn.addEventListener('click', () => { void opts.onAction?.(); });
  }
}
```

UI-SPEC §Layout locks the loading copy ("Loading problem…" / "Fetching {id}. {title}…") and the fetch-failure copy. Reuse `renderEmptyState` shape verbatim with new copy (loading + error variants).

#### DOM construction discipline (copy from `src/browse/ProblemBrowserView.ts:560-603`)

```typescript
// src/browse/ProblemBrowserView.ts:560-603 (renderRow excerpt)
const row = container.createDiv({
  cls: `lc-row lc-row--${status}`,
  attr: { role: 'option' },
});
// ...
const titleBlock = row.createDiv({ cls: 'lc-row__titleblock' });
titleBlock.createSpan({ cls: 'lc-row__id', text: `${String(p.id)}. ` });
titleBlock.createSpan({ cls: 'lc-row__title', text: p.title });
// ...
const meta = row.createDiv({ cls: 'lc-row__meta' });
// ...
const diffLabel = p.diff === 'Medium' ? 'Med.' : p.diff;
meta.createSpan({
  cls: `lc-row__diff lc-diff--${p.diff.toLowerCase()}`,
  text: diffLabel,
});
```

**Reuse the `lc-diff--{easy|medium|hard}` class** for the difficulty pill in the preview header (UI-SPEC §Color confirms; `styles.css:184-186` already defines color tokens for this cluster — the new preview-scoped override adds `color-mix` background).

**For the topic-chip row in preview**, mirror the `meta.createSpan({ cls: 'lc-row__diff lc-diff--…', text })` shape with `lc-preview__topic` class (UI-SPEC §Component Inventory).

---

### `src/preview/previewRouter.ts` (utility, event-driven)

**Analog:** `src/main.ts:489-504` (`activateBrowser`)

#### `getLeavesOfType` + `setViewState` + `revealLeaf` pattern (copy from `src/main.ts:489-504`)

```typescript
// src/main.ts:489-504
private async activateBrowser(): Promise<void> {
  const { workspace } = this.app;
  const existing = workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
  if (existing[0]) {
    // revealLeaf is a Promise<void> in Obsidian 1.7.2+; we await it. For older Obsidian it
    // returns void (Promise semantics still safe to await via microtask).
    await workspace.revealLeaf(existing[0]);
    return;
  }
  const leaf = workspace.getRightLeaf(false);
  if (!leaf) return;
  await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}
```

**Adaptation for preview (RESEARCH §Pattern 2):**
1. Call `workspace.getLeaf('tab')` (NEW center tab) instead of `workspace.getRightLeaf(false)` (right sidebar). UI-SPEC.md §Layout locks center-tab placement.
2. When existing leaf is found, `setViewState({ type: PREVIEW_VIEW_TYPE, active: true, state: { slug } })` to swap content (NOT just reveal).
3. The `state: { slug }` arg fires the view's own `setState` lifecycle to re-render for the new slug.

```typescript
// NEW — src/preview/previewRouter.ts (synthesized from main.ts:489-504 + RESEARCH §Pattern 2)
export async function openOrReusePreview(plugin: LeetCodePlugin, slug: string): Promise<void> {
  const ws = plugin.app.workspace;
  const existing = ws.getLeavesOfType(PREVIEW_VIEW_TYPE);
  if (existing.length > 0 && existing[0]) {
    await existing[0].setViewState({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug },
    });
    await ws.revealLeaf(existing[0]);
    return;
  }
  const leaf = ws.getLeaf('tab');
  await leaf.setViewState({
    type: PREVIEW_VIEW_TYPE,
    active: true,
    state: { slug },
  });
  await ws.revealLeaf(leaf);
}
```

---

### `src/preview/previewExistingNote.ts` (utility, pure helper)

**Analog:** `src/notes/NoteWriter.ts:218-229` (cache lookup → path build → `getAbstractFileByPath` chain)

#### Existing-note detection pattern (copy from `src/notes/NoteWriter.ts:218-229`)

```typescript
// src/notes/NoteWriter.ts:218-229
const folder = this.settings.getProblemsFolder();
const cached = this.settings.getProblemDetail(slug);

// Re-open path (D-11): existing file + cached detail → reveal first, optionally background-refresh.
const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
const existingFile = existingPath
  ? narrowToTFile(this.app.vault.getAbstractFileByPath(existingPath))
  : null;

if (existingFile) {
  // Reveal immediately — no await on any network (D-11).
  await this.app.workspace.openLinkText(existingFile.path, '', false);
```

**Adaptation for preview:** the helper is a *read-only* check (no `openLinkText` — that's destructive in preview's contract). Returns `{ fileExists: boolean; file?: TFile; id?: number }` so the header can pick `Start Problem` vs `Open Problem`.

```typescript
// NEW — src/preview/previewExistingNote.ts (synthesized from NoteWriter:218-225)
export interface ExistingNoteState {
  fileExists: boolean;
  file?: TFile;
  id?: number;
}

export function detectExistingNote(
  app: App,
  settings: { getProblemsFolder(): string; getProblemDetail(s: string): DetailCacheEntry | null },
  slug: string,
): ExistingNoteState {
  const cached = settings.getProblemDetail(slug);
  if (!cached) return { fileExists: false };
  const path = buildNotePath(settings.getProblemsFolder(), cached.id, slug);
  const f = app.vault.getAbstractFileByPath(path);
  if (f && f instanceof TFile) {
    return { fileExists: true, file: f, id: cached.id };
  }
  return { fileExists: false, id: cached.id };
}
```

**Critical:** Preview module MUST NOT call `app.vault.create` or `app.workspace.openLinkText` (UI-SPEC.md §Acceptance grep gates). Detection only — Start/Open delegate to `plugin.openProblem(slug, status)`.

---

### `src/notes/detailCacheHelpers.ts` *or* exported `toDetailCacheEntry` (utility, transform)

**Analog:** `src/notes/NoteWriter.ts:527-548` (private `toDetailCacheEntry`)

```typescript
// src/notes/NoteWriter.ts:527-548 — currently NOT exported
function toDetailCacheEntry(raw: NoteWriterDetail): DetailCacheEntry {
  return {
    fetchedAt: Date.now(),
    id: Number(raw.questionFrontendId) || 0,
    title: raw.title,
    difficulty: raw.difficulty,
    url: `https://leetcode.com/problems/${raw.titleSlug}/`,
    contentHtml: raw.content ?? '',
    topicSlugs: Array.isArray(raw.topicTags)
      ? raw.topicTags.map((t) => String(t?.slug ?? '')).filter((s) => s.length > 0)
      : [],
    exampleTestcases: raw.exampleTestcases,
    metaData: raw.metaData,
    sampleTestCase: raw.sampleTestCase,
    codeSnippets: raw.codeSnippets,
    internalQuestionId: typeof raw.questionId === 'string' ? raw.questionId : undefined,
  };
}
```

**Plan 06.03 action (RESEARCH §Open Q6):** Either (a) add `export` keyword to the existing function in `NoteWriter.ts:527`, OR (b) move it into `src/notes/detailCacheHelpers.ts` (preferred — cleaner scoping). Preview's cache-miss path uses this to persist the freshly-fetched detail (then re-renders from the freshly-cached entry).

---

### `src/main.ts` MODIFIED — `routeProblemClick` method + `registerView` for preview

**Analog (registration pattern):** `src/main.ts:223-225` (`registerView(BROWSER_VIEW_TYPE, …)`)
**Analog (command registration):** `src/main.ts:239-242` (`open-problem-browser` command — clean ID baseline)

#### Registration pattern (insert after line 225)

```typescript
// src/main.ts:223-225
// Step 6a — register the browser view.
this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
  new ProblemBrowserView(leaf, this));

// NEW addition for Phase 06 — register the preview view alongside.
this.registerView(PREVIEW_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
  new ProblemPreviewView(leaf, this));
```

#### Clean-command-id baseline (copy form from `src/main.ts:239-273` — already 0.3.0-clean)

```typescript
// src/main.ts:239-273 — exemplary clean ID + name shape
this.addCommand({
  id: 'open-problem-browser',
  name: 'Open problem browser',
  callback: () => { void this.activateBrowser(); },
});

this.addCommand({
  id: 'refresh-current-problem',
  name: 'Refresh current problem',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm: Record<string, unknown> | undefined = cache?.frontmatter;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) return false;
    if (!checking) {
      void this.refreshProblem(slug);
    }
    return true;
  },
});
```

**Rules enforced (RESEARCH §Open Q7 — verified all 7 v1.0 IDs already pass 0.3.0):**
- `id` does NOT contain plugin-id (`obsidian-leetcode:` / `leetcode:`)
- `id` does NOT contain the word `command`
- `name` is sentence case (`Open problem browser`, NOT `LeetCode: Open Problem Browser`)
- NO `hotkeys` field

**New Phase 06 command** (RESEARCH §Code Examples §Example 1) — `id: 'open-in-preview'`, `name: 'Open in preview'`, gated via `editorCheckCallback` against `lc-slug` frontmatter (same shape as `refresh-current-problem` above).

#### `routeProblemClick` placement (analog: `openProblem` at lines 471-476)

```typescript
// src/main.ts:471-476 — existing entry, UNCHANGED
async openProblem(
  slug: string,
  initialStatus?: 'solved' | 'attempted' | 'untouched',
): Promise<void> {
  return this.notes.openProblem(slug, initialStatus);
}
```

**NEW method (RESEARCH §Code Examples §Example 2):** sits adjacent to `openProblem`. Same naming convention (verb + Problem-noun), same return type (`Promise<void>`), same signature posture (slug + status + extra args).

---

### `src/browse/ProblemBrowserView.ts` MODIFIED

**Single-edit-site analog:** lines 605-609 (current row-click handler)

```typescript
// src/browse/ProblemBrowserView.ts:605-609 — CURRENT
row.addEventListener('click', () => {
  // GAP-2a: forward the row's IndexedProblem.status so the on-first-write
  // lc-status reflects the user's real LC submission status.
  void this.plugin.openProblem(p.slug, p.status);
});
```

**Becomes (RESEARCH §Example 5):**

```typescript
row.addEventListener('click', (e) => {
  const intent: 'preview' | 'open' = (e as MouseEvent).shiftKey ? 'open' : 'preview';
  void this.plugin.routeProblemClick(p.slug, p.status, intent);
});

// ADDITION (right-click context menu — PREVIEW-01)
row.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle('Preview problem')
      .setIcon('eye')
      .onClick(() => {
        void this.plugin.routeProblemClick(p.slug, p.status, 'preview', { force: true });
      }),
  );
  menu.showAtMouseEvent(e);
});
```

**Imports to add:** `Menu` from `'obsidian'` (currently only `ItemView, WorkspaceLeaf, Notice, setIcon` are imported per line 5).

**Do NOT touch:** `pickRandom()` at lines 471-484 — CONTEXT.md decision: random pick = open intent, not preview. Keep `void this.plugin.openProblem(pick.slug, pick.status)` as-is.

---

### `src/settings/SettingsStore.ts` MODIFIED — `previewClickBehavior` field

**Analog:** `techniquesFolderOverride` (Phase 5 POLISH-01) — same shape (string with shape-guard fallback)
**Analog (boolean precedent):** `autoBacklinksEnabled` (Phase 4 D-21)

#### `PluginData` field declaration (insert near lines 78-87)

```typescript
// src/settings/SettingsStore.ts:71-87 — EXISTING fields with shape-guard precedent
/** Phase 4 GRAPH-05, D-21 — master toggle for on-AC auto-backlink creation. … */
autoBacklinksEnabled: boolean;
/** Phase 5 POLISH-01 D-15 — user-visible override for the technique folder. … */
techniquesFolderOverride: string;
```

**Add (per RESEARCH §Example 3):**

```typescript
/** Phase 06 PREVIEW-02 — click-default behavior for ProblemBrowserView rows.
 *  'preview' = single-click previews (default for fresh installs and v1.1 upgraders);
 *  'open' = single-click creates/opens the note (v1.0 behavior). Shift-click always
 *  opens regardless of this setting (CONTEXT.md decision A). */
previewClickBehavior: 'preview' | 'open';
```

#### `DEFAULT_DATA` entry (insert near lines 119-120)

```typescript
// src/settings/SettingsStore.ts:108-121 — EXISTING DEFAULT_DATA shape
const DEFAULT_DATA: PluginData = {
  // ...
  autoBacklinksEnabled: true,  // D-21 default ON
  techniquesFolderOverride: '',  // D-15 '' = use derived default
};
```

**Add:** `previewClickBehavior: 'preview',  // CONTEXT.md decision A — single default`

#### Shape-guard in `load()` (insert near lines 314-325 alongside `autoBacklinksEnabled` / `techniquesFolderOverride`)

```typescript
// src/settings/SettingsStore.ts:310-325 — EXISTING shape-guard precedent
autoBacklinksEnabled: typeof raw.autoBacklinksEnabled === 'boolean'
  ? raw.autoBacklinksEnabled
  : DEFAULT_DATA.autoBacklinksEnabled,
techniquesFolderOverride: typeof raw.techniquesFolderOverride === 'string'
  ? raw.techniquesFolderOverride
  : DEFAULT_DATA.techniquesFolderOverride,
```

**Add (RESEARCH §Pitfall 7 — locked schema):**

```typescript
previewClickBehavior:
  raw.previewClickBehavior === 'open' ? 'open' : 'preview',
// 'preview' is the safe default for both 'preview' and any malformed/missing value
```

#### Getter / setter (analog: `getAutoBacklinksEnabled` / `setAutoBacklinksEnabled` at lines 396-403)

```typescript
// src/settings/SettingsStore.ts:393-403 — EXISTING getter/setter shape
getAutoBacklinksEnabled(): boolean { return this.data.autoBacklinksEnabled; }
async setAutoBacklinksEnabled(v: boolean): Promise<void> {
  this.data.autoBacklinksEnabled = v;
  await this.persist();
}
```

**Add:**

```typescript
getPreviewClickBehavior(): 'preview' | 'open' { return this.data.previewClickBehavior; }
async setPreviewClickBehavior(v: 'preview' | 'open'): Promise<void> {
  this.data.previewClickBehavior = v;
  await this.persist();
}
```

---

### `src/settings/SettingsTab.ts` MODIFIED — new "Preview" section

**Analog (section heading):** `Notes` (line 149), `Knowledge graph` (line 182)
**Analog (dropdown row):** `Default language` (lines 164-173) — closest dropdown precedent

#### Section heading pattern (copy from `src/settings/SettingsTab.ts:149, 182`)

```typescript
// src/settings/SettingsTab.ts:149 — EXISTING
new Setting(containerEl).setName('Notes').setHeading();

// src/settings/SettingsTab.ts:182 — EXISTING
new Setting(containerEl).setName('Knowledge graph').setHeading();
```

**Add (insert between `Notes` block at line 173 and `Knowledge graph` heading at line 182):**

```typescript
// =============================
//   Preview section (Phase 06 PREVIEW-02)
// =============================
new Setting(containerEl).setName('Preview').setHeading();
```

#### Dropdown row pattern (copy from `src/settings/SettingsTab.ts:164-173`)

```typescript
// src/settings/SettingsTab.ts:164-173 — EXISTING dropdown precedent
new Setting(containerEl)
  .setName('Default language')
  .setDesc('Starter code language for new problems.')
  .addDropdown((d) => d
    .addOptions(LANGUAGE_OPTIONS)
    .setValue(this.plugin.settings.getDefaultLanguage())
    .onChange(async (v) => {
      await this.plugin.settings.setDefaultLanguage(v);
    }),
  );
```

**Adapt for preview (UI-SPEC §Copywriting locks all strings):**

```typescript
new Setting(containerEl)
  .setName('Click behavior')
  .setDesc('What happens when you click a problem in the LeetCode browser. Shift-click always opens the note directly.')
  .addDropdown((d) => d
    .addOption('preview', 'Preview first')
    .addOption('open', 'Open note directly')
    .setValue(this.plugin.settings.getPreviewClickBehavior())
    .onChange(async (v) => {
      await this.plugin.settings.setPreviewClickBehavior(v as 'preview' | 'open');
    }),
  );
```

**Note:** uses `addOption(value, label)` calls (matches Obsidian's two-option dropdown idiom), NOT `addOptions(LANGUAGE_OPTIONS)` (which uses a `Record` literal — overkill for two values).

---

### `package.json` MODIFIED

**Analog:** self at lines 6-13 (existing `scripts` block) and lines 17-29 (existing `devDependencies`)

```json
// package.json:6-13 — EXISTING scripts
"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
  "lint": "eslint .",
  "test": "vitest run --passWithNoTests",
  "grep:vault": "./scripts/grep-no-vault-modify.sh",
  "version": "node version-bump.mjs && git add manifest.json versions.json"
}
```

**Add (RESEARCH §Example 7 — script naming):**

```json
"check:bundle-size": "node scripts/check-bundle-size.mjs"
```

**Bump (FOUND-01):**

```json
// package.json:21 — CURRENT
"eslint-plugin-obsidianmd": "0.2.9",

// CHANGE TO
"eslint-plugin-obsidianmd": "^0.3.0"
```

(RESEARCH §Open Q4 verifies no co-bumps required for `@eslint/js`, `typescript-eslint`, or `eslint`.)

---

### `scripts/check-bundle-size.mjs` (NEW)

**Analog:** `scripts/check-bundle-size.sh` (existing bash variant) — REUSE the threshold-cascade structure (HARD_LIMIT + SOFT_WARN), but rewrite in Node for cross-platform portability (RESEARCH §Pitfall 6).

```bash
# scripts/check-bundle-size.sh:28-40 — EXISTING bash threshold logic
MAIN_BYTES=$(wc -c < "$MAIN" | tr -d ' ')
MAIN_KB=$((MAIN_BYTES / 1024))
LIMIT_BYTES=$((250 * 1024))
WARN_BYTES=$((200 * 1024))

if [ "$MAIN_BYTES" -gt "$LIMIT_BYTES" ]; then
  echo "BUNDLE CHECK FAIL: main.js is ${MAIN_KB} KB (>250 KB ceiling; …)" >&2
  exit 1
fi
if [ "$MAIN_BYTES" -gt "$WARN_BYTES" ]; then
  echo "BUNDLE CHECK WARN: main.js is ${MAIN_KB} KB (>200 KB soft warning; …)"
fi
echo "BUNDLE CHECK OK: main.js ${MAIN_KB} KB within budget"
```

**NEW Node version (RESEARCH §Pitfall 6 / §Example 6):**

```javascript
// scripts/check-bundle-size.mjs
import fs from 'node:fs';
const HARD_LIMIT = 500_000;  // CONTEXT.md §E — 500 KB hard gate
const SOFT_WARN = 400_000;   // CONTEXT.md §E — 400 KB soft warning
const PATH = 'main.js';

if (!fs.existsSync(PATH)) {
  console.error(`BUNDLE CHECK FAIL: ${PATH} missing — run 'npm run build' first`);
  process.exit(1);
}
const size = fs.statSync(PATH).size;
const kb = (size / 1024).toFixed(1);
console.log(`main.js: ${size} bytes (${kb} KB)`);
if (size > HARD_LIMIT) {
  console.error(`BUNDLE CHECK FAIL: main.js exceeds ${HARD_LIMIT} bytes`);
  process.exit(1);
}
if (size > SOFT_WARN) {
  console.warn(`BUNDLE CHECK WARN: main.js > ${SOFT_WARN} bytes — heading toward the gate`);
}
console.log('BUNDLE CHECK OK');
```

**Threshold note (CONTEXT.md §E):** Phase 06 thresholds are **500 KB hard / 400 KB soft**, NOT the existing bash script's 250 KB / 200 KB (those were Phase 5.3-specific). Plan 06.01 picks the looser thresholds because Phase 06's bundle baseline is ~163 KB and v1.1 must allow headroom for AI/contest features.

**Decide at planning time:** keep existing bash script for back-compat, OR replace it entirely with the new Node script (preferred — Plan 06.01 deletes the bash script after CI workflow lands).

---

### `.github/workflows/ci.yml` (NEW)

**No analog in the repo** — `.github/` directory does not exist (verified via `ls`). Use RESEARCH §Example 7 verbatim.

```yaml
# RESEARCH §Example 7 — adopt verbatim
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run check:bundle-size
```

---

### Test files — `tests/preview/*.test.ts` and `tests/foundations/*.test.ts` (NEW)

**Primary analog:** `tests/browse/ProblemBrowserView.badge.test.ts` (pure-helper export pattern + `vi.mock('obsidian')` + RED-shell)
**Secondary analog:** `tests/settings/SettingsTab.test.ts` (it.skip RED-shell pattern)

#### `vi.mock('obsidian')` boilerplate (copy from `tests/browse/ProblemBrowserView.badge.test.ts:21-26`)

```typescript
// tests/browse/ProblemBrowserView.badge.test.ts:21-26 — EXISTING
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

**Apply to every Phase 06 test file.** The stub at `tests/helpers/obsidian-stub.ts` already exports `ItemView`, `MarkdownRenderer.render` (no-op), `setIcon` (no-op), `Component` with `load()` / `unload()` no-ops, `WorkspaceLeaf`, `App`, `Plugin`, `Notice`, `TFile`. **No new stub additions required for Phase 06.**

#### Pure-helper export-and-test idiom (copy from `tests/browse/ProblemBrowserView.badge.test.ts:32-45`)

```typescript
// tests/browse/ProblemBrowserView.badge.test.ts:32-45 — EXISTING
it('D-04: fresh install with only auto-default premium rule → badge count is 0 (TODO(05.2-03): export computeFilterBadgeCount)', async () => {
  const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
    computeFilterBadgeCount?: (f: unknown) => number;
  };
  if (typeof mod.computeFilterBadgeCount !== 'function') {
    throw new Error('computeFilterBadgeCount not exported — 05.2-03 must export it');
  }
  // ... assertions ...
});
```

**Adapt for preview tests:** the planner exposes pure helpers (`detectExistingNote`, `openOrReusePreview`, `routeProblemClick`-decision-table) at module top level so tests assert them without standing up a full `ItemView` (which is happy-dom-incompatible per `ProblemBrowserView.badge.test.ts:14-19` comment).

#### Regression-grep test (UI-SPEC §Acceptance grep gates)

NEW pattern — first regression-grep test in repo. Synthesize via `fs.readFileSync` + RegExp:

```typescript
// tests/preview/regression-grep.test.ts — NEW (no exact analog)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('preview module — no destructive vault calls', () => {
  it('vault.create / openLinkText forbidden in src/preview/', () => {
    const dir = 'src/preview';
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src).not.toMatch(/vault\.create\(/);
      expect(src).not.toMatch(/workspace\.openLinkText\(/);
    }
  });
});
```

#### `SettingsStore` round-trip test (analog: `tests/settings-store.test.ts`)

Existing settings tests at `tests/settings-store.test.ts` exercise `SettingsStore.load()` against a fake plugin with `loadData/saveData`. The new `previewClickBehavior` round-trip test follows the same shape verbatim — set value → persist → re-`load` → assert.

---

## Shared Patterns

### Authentication / authorization

**N/A for Phase 06** — preview is read-only; no auth surface added. Existing `editorCheckCallback` pattern from `src/main.ts:261-273` is reused as-is for any new commands gating on `lc-slug` frontmatter.

### Error handling

**Source:** `src/main.ts:655-687` (`submitFromActive` catch ladder)

```typescript
// src/main.ts:655-687 — EXISTING error-routing template (reuse on cache-miss fetch in preview)
} catch (err) {
  if ((err as Error).name === 'AbortError' || err instanceof PollAbortError) {
    try { modal.close(); } catch { /* headless */ }
  } else if (err instanceof SessionExpiredError || (err as Error).name === 'SessionExpiredError') {
    showSessionExpiredNotice(() => { void this.auth.login(); });
  } else if (isNetworkError(err)) {
    new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
  } else if (err instanceof TimeoutError) {
    new Notice('LeetCode is slow to respond. Try again.', 8000);
  } else if (err instanceof RateLimitError) {
    const seconds = Math.ceil(err.retryAfterMs / 1000);
    new Notice(`LeetCode rate limit reached. Wait ${String(seconds)}s before retrying.`, 6000);
  } else {
    logger.debug('solve.submit: unexpected error', err);
  }
}
```

**Apply to:** preview's cache-miss `getProblemDetail` fetch path. UI-SPEC §Copywriting locks the preview-specific copy ("Couldn't fetch {id}. Check your connection.") — surface via `new Notice(..., 4000)` and render the in-tab error state with `[Retry]` button. Use `isNetworkError`, `SessionExpiredError`, `TimeoutError`, `RateLimitError` from `src/shared/errors`.

### Validation

**N/A for Phase 06** — no input forms beyond the existing settings dropdown. The `previewClickBehavior` shape-guard at load time (RESEARCH §Pitfall 7) is the only validation point; pattern documented under SettingsStore section above.

### Timer discipline

**Source:** `src/shared/timers.ts` (entire file — 19 lines)
**Apply to:** Preview's post-`Start Problem` `leaf.detach()` 100ms delay.

```typescript
// src/shared/timers.ts:13-19 — REUSE
export function setWindowTimeout(fn: () => void, ms: number): TimerHandle {
  return activeWindow.setTimeout(fn, ms) as unknown as TimerHandle;
}
export function clearWindowTimeout(handle: TimerHandle): void {
  activeWindow.clearTimeout(handle as unknown as number);
}
```

**Critical (RESEARCH §State of the Art):** Bare `setTimeout(...)` is forbidden in src — `obsidianmd/prefer-active-window-timers` (already enforced in v1.0). Preview's detach delay must use `setWindowTimeout(() => this.leaf.detach(), 100)`.

### Logging

**Source:** `src/shared/logger` (used at `src/notes/NoteWriter.ts:186, 213, 247, …`)
**Apply to:** silent-failure paths inside preview (e.g., the `metaData` shape variation, cache-miss fetch swallow on retry).

```typescript
// src/notes/NoteWriter.ts:213 — existing usage
logger.debug('graph.prefetch: non-fatal (silent-offline per D-02/D-12)', err);
```

### Notice copy + duration

**UI-SPEC.md §Notice messages** locks all preview Notices verbatim:

| Trigger | Copy | Duration (ms) |
|---|---|---|
| Cache miss + fetch failed | `Couldn't fetch {id}. Check your connection.` | 4000 |
| Start Problem → note creation fails | `Couldn't create note. {error reason}.` | 6000 |
| Open Problem → note gone (raced) | `Couldn't find the note for {id}. Click Start Problem to recreate.` | 6000 |

**Re-use existing helper:** `showSessionExpiredNotice(login)` from `src/solve/SessionExpiredNotice` for any 401/403 surfacing on cache-miss fetch.

### CSS scoping

**Source:** `styles.css:184-186` (`.lc-diff--easy/medium/hard`) and `styles.css:303` (`.lc-empty`)
**Apply to:** Preview's `.leetcode-preview__*` CSS additions.

```css
/* styles.css:184-186 — EXISTING; preview REUSES the class names with parallel selector cluster */
.leetcode-browser .lc-diff--easy   { color: var(--color-green); }
.leetcode-browser .lc-diff--medium { color: var(--color-yellow); }
.leetcode-browser .lc-diff--hard   { color: var(--color-red); }
```

**Add (UI-SPEC §CSS conventions):** `.leetcode-preview .lc-diff--{easy|medium|hard}` with same color tokens + new `color-mix` background. Do NOT modify the existing `.leetcode-browser .lc-diff--*` rules.

**No raw hex anywhere in styles.css additions** (acceptance grep at UI-SPEC §Acceptance grep gates).

### Section-lock userEvent annotation

**Verdict:** **Not triggered for Phase 06.** Preview renders into a plain `HTMLElement` via `MarkdownRenderer.render` — never dispatches a CM6 transaction. Acceptance grep `grep -n "cm.dispatch" src/preview/` MUST return zero (RESEARCH §Project Constraints). If a future preview feature DOES call `cm.dispatch` against a locked range, it must set `userEvent: 'leetcode.<verb>'` per CLAUDE.md.

---

## No Analog Found

| File | Role | Data Flow | Reason | Action |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | config | event-driven | First GitHub Actions workflow in this repo | Use RESEARCH §Example 7 verbatim (4 steps + bundle-size gate) |
| `tests/foundations/ci-workflow.test.ts` | test | unit (YAML parse) | No prior YAML-shape test in repo | Use RESEARCH §Validation Architecture spec — load YAML with `js-yaml` (devDep) and assert step-name list shape |
| `tests/preview/regression-grep.test.ts` | test | unit (FS scan) | First regression-grep test in repo | Synthesize from `node:fs` + RegExp; UI-SPEC §Acceptance grep gates lists the exact patterns |
| `tests/foundations/check-bundle-size.test.ts` | test | unit (FS scan) | First test for a build-time script | Use the new `check-bundle-size.mjs` as a pure module; spawn it via `child_process.execSync` against a synthesized `main.js` of varying size; assert `exit code` + stderr |

For all four, executor reads RESEARCH.md sections directly. No copy-from-codebase pattern to lift.

---

## Metadata

**Analog search scope:** `src/`, `tests/`, `scripts/`, `.github/` (does not exist), `package.json`, `eslint.config.mts`, `esbuild.config.mjs`, `vitest.config.ts`, `styles.css`
**Files scanned:** 17 source files, 7 test files, 3 build configs, 1 styles file
**Pattern extraction date:** 2026-05-15
**Strong-match coverage:** 13/17 files have an exact in-codebase analog; 4/17 use research-only patterns (CI workflow + 3 first-of-kind tests).

---

## PATTERN MAPPING COMPLETE

**Phase:** 06 - Foundations + Preview Mode
**Files classified:** 17 (8 NEW src/test, 9 MODIFIED)
**Analogs found:** 13 / 17 strong; 4 / 17 use RESEARCH.md examples (no codebase analog)

### Coverage
- Files with exact analog: 13
- Files with role-match analog: 0
- Files with no analog (use RESEARCH.md): 4

### Key Patterns Identified
- **ItemView lifecycle:** copy `ProblemBrowserView`'s constructor (`navigation = false`), `getViewType` / `getDisplayText` / `getIcon`, `onOpen` / `onClose`, and DOM construction via `createDiv`/`createSpan`/`createEl`. Preview adds `setState`/`getState` for slug persistence (RESEARCH §Pattern 2) — no exact analog in v1.0.
- **Tab open + reuse:** copy the `getLeavesOfType + setViewState + revealLeaf` shape from `main.ts:489-504`. Adapt for `getLeaf('tab')` (center) instead of `getRightLeaf(false)` (sidebar) and pass `state: { slug }` to drive the view's `setState` lifecycle.
- **MarkdownRenderer.render:** copy from `SubmissionDetailModal.ts:136-143` but pass `this` (the view) as the 5th arg (`Component`) and `''` as `sourcePath` — satisfies `obsidianmd/no-plugin-as-component` (new in 0.3.0).
- **Settings field shape:** copy `techniquesFolderOverride` precedent from `SettingsStore.ts:81-87, 119-120, 314-325, 408-419`. New `previewClickBehavior` is a `'preview' | 'open'` string union; shape-guard defaults malformed/missing values to `'preview'`.
- **Settings UI section:** copy section heading + dropdown row idiom from `SettingsTab.ts:149` (`Notes`), `:182` (`Knowledge graph`), and `:164-173` (`Default language` dropdown). Insert new `Preview` section between `Notes` (line 173) and `Knowledge graph` (line 182).
- **Existing-note detection:** copy 3-call chain from `NoteWriter.ts:218-225` — `settings.getProblemDetail(slug)` → `buildNotePath(folder, id, slug)` → `app.vault.getAbstractFileByPath(path)`. Extract as pure helper `detectExistingNote` so preview's header can pick `Start Problem` vs `Open Problem`.
- **Clean command IDs:** every existing v1.0 command ID at `main.ts:239-348` already passes the new 0.3.0 rules (`no-plugin-id-in-command-id`, `no-command-in-command-id/name`, `no-default-hotkeys`). New `open-in-preview` follows the same convention.
- **Timer discipline:** all timeouts go through `setWindowTimeout` from `src/shared/timers.ts` (popout-aware + lint-clean for `prefer-active-window-timers`). Preview's post-Start `leaf.detach()` 100ms delay uses this.
- **Test pattern:** export pure helpers (`computeFilterBadgeCount` precedent at `ProblemBrowserView.ts:39-53`) and assert via `vi.mock('obsidian')` against `tests/helpers/obsidian-stub.ts`. No new stub additions required — `ItemView`, `MarkdownRenderer.render`, `Component`, `setIcon` are all already stubbed.

### File Created
`/Users/moxu/projects/obsidian-leetcode/.planning/phases/06-foundations-preview-mode/06-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files for each of the 4-5 plans (Foundations / Router + Settings / Preview View / [Right-click fold-in] / README).
