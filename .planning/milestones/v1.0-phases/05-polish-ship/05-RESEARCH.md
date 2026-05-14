# Phase 5: Polish & Ship - Research

**Researched:** 2026-05-09
**Domain:** Obsidian community plugin polish + store submission + Run UX rework
**Confidence:** HIGH (all API claims verified against local `node_modules/obsidian@1.12.3/obsidian.d.ts` + raw GitHub markdown of `obsidian-developer-docs` and `obsidian-releases`; npm versions freshly confirmed 2026-05-09)

## Summary

Phase 5 is a polish + ship phase spanning five distinct work surfaces (settings UI, error handling, Run UX rework, reading-mode code-block buttons, and store-submission checklist). Nothing in this phase requires new external dependencies — everything is implementable against the APIs already in `obsidian@1.12.3` and the existing `requestUrl` / `throttle` / `SettingsStore` plumbing. However, **three of the 32 user decisions make technically-incorrect assumptions about the Obsidian API** that the planner must resolve before cutting PLAN.md files:

1. **`Notice.addAction()` does NOT exist in Obsidian 1.12.3** (D-21). The `Notice` class exposes only `constructor`, `setMessage`, `hide`, and three `HTMLElement` properties (`noticeEl`, `messageEl`, `containerEl`). An action-button Notice must be built by `createEl()`-ing a button into `notice.messageEl` (or passing a `DocumentFragment` to the constructor). The CONTEXT's "fallback if unavailable" path is the implementation path.
2. **`workspace.on('file-close')` does NOT exist** (D-02, D-09). The emitted workspace events are `'file-open'`, `'active-leaf-change'`, `'layout-change'`, `'window-open'`, `'window-close'`, `'quick-preview'`, `'resize'`, plus editor/menu/CSS events — but NOT `file-close`. The ephemeral-tab-store lifecycle must instead be driven by `'layout-change'` + `'active-leaf-change'` + `workspace.getLeavesOfType('markdown')`-based reference counting.
3. **`RequestUrlParam` does NOT expose a `timeout` field** (D-20). The interface has exactly five fields: `url`, `method?`, `contentType?`, `body?`, `headers?`, `throw?`. A 10s timeout must be implemented by `Promise.race` with a rejecting `setTimeout`.

None of these three discoveries invalidate the Phase 5 goal — they reshape the implementation approach. The rest of the 32 decisions are implementable as written.

**Primary recommendation:** Implement with the corrected API approaches above (DocumentFragment Notice, layout-change+ref-count ephemeral store, Promise.race timeout). Ship 0.1.0 as locked by D-23. All mechanical prerelease gates (innerHTML/fetch/eval/telemetry greps, manifest validity, lint/test) pass as shell-script greps + exit-code chains (no JSON schema tooling required). Do NOT introduce `MarkdownRenderer.render` in the Phase 4 deferred D-31 work unless Component lifecycle is wired correctly (`new Component()` → `component.load()` on `onOpen` → `component.unload()` on `onClose`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings UI section rendering | Obsidian plugin UI (`PluginSettingTab.display()`) | — | Owned by Obsidian; Phase 5 extends existing `LeetCodeSettingTab` |
| `techniquesFolderOverride` persistence | `SettingsStore` (data.json) | — | Existing persistence layer; D-15 adds one field + shape guard |
| `autoBacklinksEnabled` toggle state | `SettingsStore` (data.json) | — | Field exists (Phase 4 D-21); Phase 5 adds only the UI |
| 429 auto-retry + 10s timeout | `src/api/throttle.ts` (inside `throttledRequestUrl`) | `src/shared/errors.ts` for `isNetworkError` helper | All LC calls route through throttle (CF-01); extension is mechanical |
| Expired-session Notice with action | UI layer (wherever the Notice fires) | `AuthService.login()` callback target | Notice DOM is plugin UI; session detection happens at REST layer |
| Run UX (RunModal + ephemeralTabStore) | `src/solve/` | Workspace events for lifecycle | In-memory only; no vault writes (D-02 / D-08) |
| Reading-mode Run/Submit buttons | Reading Mode `MarkdownPostProcessor` | `App.commands.executeCommandById` for click handlers | Per Obsidian docs, the idiomatic surface for "add decoration to rendered markdown" |
| Frontmatter-gated button visibility | `MetadataCache.getFileCache(file).frontmatter` | `ctx.sourcePath` → `Vault.getAbstractFileByPath` | Canonical pattern per obsidian-developer-docs |
| `SubmissionDetailModal` code render | `MarkdownRenderer.render` (static) + `Component` lifecycle | — | D-31 + Phase 4 Pitfall 7 |
| Prerelease gate execution | Shell script `scripts/prerelease-check.sh` | `npm run lint` + `npm test` inside the script | Mechanical; no runtime dependency on Obsidian |
| Community-plugin PR to `obsidianmd/obsidian-releases` | GitHub PR against `community-plugins.json` | README + LICENSE + GitHub release assets | Per official `Submit your plugin` docs |

## Standard Stack

### Core (already committed — NO changes in Phase 5)

| Library | Version (verified 2026-05-09) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| obsidian (types) | `1.12.3` | Type definitions; runtime API provided by Obsidian host | `npm view obsidian version` → `1.12.3`; committed to package.json; `minAppVersion: 1.10.0` in manifest stays |
| @leetnotion/leetcode-api | `3.0.0` | LeetCode GraphQL client | Phase 1 lock |
| turndown | `7.2.4` | HTML→MD | Phase 2 lock |
| typescript | `5.8.3` | Plugin language | Locked in package.json; Phase 5 doesn't bump |
| esbuild | `0.25.5` | Bundler | Locked in package.json |
| vitest | `4.1.5` | Unit tests | Locked in package.json |
| eslint-plugin-obsidianmd | `0.2.9` | Obsidian lint rules | Locked in package.json |

**npm version verification** (`npm view X version` run 2026-05-09):
- `obsidian@1.12.3` ✓ matches committed
- `turndown@7.2.4` ✓ matches committed
- `esbuild@0.28.0` — upstream is ahead; committed `0.25.5` is fine (no Phase 5 driver to bump)
- `vitest@4.1.5` ✓ matches committed
- `typescript@6.0.3` — upstream is ahead; committed `5.8.3` is fine
- `eslint-plugin-obsidianmd@0.2.9` ✓ matches committed

**Conclusion:** Phase 5 ships zero dependency bumps. All additions are pure TS against the obsidian@1.12.3 surface.

### Supporting (no new adds)

Phase 5 adds no new npm dependencies. Every required capability (DocumentFragment Notice, MarkdownPostProcessor, MarkdownRenderer, Component, Setting, Promise.race timeout, shell-script prerelease greps) is available from `obsidian` types + Node/browser platform APIs.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shell-script `prerelease-check.sh` | Node.js script (`scripts/prerelease-check.mjs`) | Shell + grep is already the idiomatic Phase 1-4 pattern (`grep-no-vault-modify.sh` already ships). Shell keeps the script grep-visible and dependency-free. Node script would require adding a JSON-schema validator for manifest. |
| `Promise.race` timeout wrapper | Extending `throttledRequestUrl` to accept `timeoutMs` | Same outcome; function-signature extension is slightly cleaner (caller specifies). Recommend caller-specified + default 10_000 per D-20. |
| `DocumentFragment` Notice with action | Plain Notice + separate Notice chain | Fragment approach is one visual unit; the separate-Notice chain would violate the single-message UX and re-arm on dismiss. |
| MarkdownRenderer in SubmissionDetailModal | Keep the current `<pre><code>` + textContent | Current already ships (Phase 4 shortcut); D-31 wants the upgrade because `<pre><code>` misses Obsidian's CM6 fence syntax highlighting — the visual gap is the bug. |

**Installation:** No installs required. Run `npm install` only if node_modules drift.

**Version verification:** Already completed above. No pins change.

## Architecture Patterns

### System Architecture Diagram

```
User invokes command / edits note
        │
        ▼
┌───────────────────────────┐       ┌──────────────────────────┐
│  Command palette (Phase 1-4│       │  Reading-mode render     │
│  + Phase 5 'run')          │       │  of .md with lc-slug     │
└──────────┬─────────────────┘       └─────────┬────────────────┘
           │                                    │
           │                                    ▼
           │                          ┌──────────────────────────┐
           │                          │ MarkdownPostProcessor    │
           │                          │ (Phase 5 new — Wave 4)   │
           │                          │  - checks ctx.sourcePath │
           │                          │    → getFileCache.front- │
           │                          │    matter['lc-slug']     │
           │                          │  - scans pre>code blocks │
           │                          │  - appends 2 buttons     │
           │                          └─────────┬────────────────┘
           │                                    │
           │                          click ────┘  (executeCommandById)
           │                                    │
           ▼                                    ▼
  ┌─────────────────────────────────────────────────────┐
  │ main.ts command dispatcher (Phase 5 — Wave 3)       │
  │  - 'run' (NEW)                                      │
  │  - 'submit' (Phase 3, unchanged)                    │
  │  - 'view-past-submissions' (Phase 4, unchanged)     │
  │  - 'refresh-current-problem', 'insert-starter-code' │
  └───────┬────────────────┬────────────────┬───────────┘
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌────────────┐    ┌────────────────────┐
    │ RunModal │    │ Submission │    │ SubmissionPicker + │
    │ (Phase 5 │    │ Orchestr.  │    │ SubmissionDetail   │
    │  Wave 3) │    │ (Phase 3)  │    │ (Phase 4 + D-31    │
    └─────┬────┘    └──────┬─────┘    │  rewrite Wave 4)   │
          │                │          └────────────────────┘
          │                │                     │
          │                ▼                     │
          │      ┌──────────────────────┐        │
          │      │ KnowledgeGraphWriter │        │
          │      │ (Phase 4)            │        │
          │      └──────────────────────┘        │
          ▼                                      │
    ┌──────────────────┐                         │
    │ ephemeralTab-    │                         │
    │ Store (Phase 5   │                         │
    │ Wave 3 NEW)      │                         │
    │  - Map<slug,Tab[]│                         │
    │  - layout-change │                         │
    │    + ref-count   │                         │
    └────────┬─────────┘                         │
             │                                   │
             ▼                                   ▼
  ┌──────────────────────────────────────────────────┐
  │ src/api/throttle.ts → throttledRequestUrl        │
  │  - 20 req/10s + max-2 concurrent (unchanged)     │
  │  - D-18 429 auto-retry (Phase 5 Wave 2 NEW)      │
  │  - D-20 10s Promise.race timeout (Phase 5 W2 NEW)│
  └────────────────┬─────────────────────────────────┘
                   │
                   ▼
          https://leetcode.com/*

  Out-of-band:
  ┌──────────────────────────┐      ┌──────────────────────────┐
  │ LeetCodeSettingTab       │      │ scripts/prerelease-check │
  │  (extended Wave 1):      │      │  (Wave 5):               │
  │  + Knowledge Graph       │      │  - grep innerHTML, fetch,│
  │    section heading       │      │    eval, telemetry       │
  │  + techniquesFolder-     │      │  - manifest validity     │
  │    Override text field   │      │  - lint + test + bundle  │
  │  + autoBacklinks toggle  │      │    size                  │
  └──────────────────────────┘      └──────────────────────────┘
```

**Data flow for Run UX (the biggest Phase 5 change):**
1. User invokes `LeetCode: Run` via palette OR clicks `Run` button from Reading-mode postprocessor
2. Command handler calls `ephemeralTabStore.getOrSeed(slug, exampleTestcases)` — returns `TabState[]`
3. `RunModal` opens with those tabs; user edits / adds / deletes / Reset-re-seeds
4. On Run click, modal sends **only the active tab's input** to `interpretSolution` (D-07)
5. `VerdictModal` renders the single-tab result
6. On modal close, tab state stays in `ephemeralTabStore` — ONLY wiped when `layout-change` reveals zero leaves still showing the slug's file

### Recommended Project Structure

Phase 5 adds no new top-level folder. All changes extend existing feature folders:

```
src/
├── main.ts                          # 6 touchpoints (commands, MDP register, store construction, onunload cleanup)
├── api/
│   ├── throttle.ts                  # NO changes (class-level)
│   └── requestUrlFetcher.ts         # extend throttledRequestUrl with D-18/D-20
├── solve/
│   ├── RunModal.ts                  # NEW — rewrite of CustomTestModal (D-10 rename path)
│   ├── ephemeralTabStore.ts         # NEW — in-memory Map<slug, Tab[]> + layout-change listener
│   ├── CustomTestModal.ts           # DELETE (or keep as thin re-export during transition)
│   ├── customTestStore.ts           # DELETE (no remaining callers after D-01/D-08)
│   └── codeExtractor.ts, …          # UNCHANGED
├── settings/
│   ├── SettingsTab.ts               # EXTEND — third section, two new controls (D-14..D-17)
│   └── SettingsStore.ts             # EXTEND — techniquesFolderOverride field + shape guard + getter/setter + getTechniquesFolder() override-aware
├── graph/
│   ├── CodeBlockActionProcessor.ts  # NEW — MarkdownPostProcessor (D-11..D-13)
│   └── SubmissionDetailModal.ts     # REWRITE — MarkdownRenderer.render + Component (D-31)
├── shared/
│   └── errors.ts                    # EXTEND — isNetworkError(err) helper (D-19)
styles.css                           # EXTEND — .leetcode-code-actions + verdict-ce + focus-ring
scripts/
├── grep-no-vault-modify.sh          # EXISTING
└── prerelease-check.sh              # NEW — mechanical gate per D-27
tests/
├── solve/
│   ├── RunModal.test.ts             # NEW
│   └── ephemeralTabStore.test.ts    # NEW (leaf-count-goes-to-zero wipe)
├── settings/
│   └── SettingsTab.knowledge-graph.test.ts  # NEW
├── api/
│   ├── throttle.rate-limit-retry.test.ts    # NEW (D-18)
│   └── throttle.timeout.test.ts             # NEW (D-20)
└── graph/
    ├── CodeBlockActionProcessor.test.ts     # NEW
    └── SubmissionDetailModal.test.ts        # REWRITE (D-31)
README.md, LICENSE                           # NEW files
manifest.json, package.json, versions.json   # version bump 0.1.0
```

### Pattern 1: `Notice` with clickable action button (D-21 CORRECTED)

**What:** A Notice that contains a text message + an inline action button.
**When to use:** Session-expired notification with `Log in` affordance (D-21).
**Critical finding:** `Notice.addAction()` does **NOT exist** in `obsidian@1.12.3`. The exact `Notice` class surface (verified from local `node_modules/obsidian/obsidian.d.ts` lines 4467–4504):

```typescript
export class Notice {
    noticeEl: HTMLElement;     // @deprecated Use `messageEl` instead (@since 0.9.7)
    containerEl: HTMLElement;  // @since 1.8.7
    messageEl: HTMLElement;    // @since 1.8.7
    constructor(message: string | DocumentFragment, duration?: number);
    setMessage(message: string | DocumentFragment): this;
    hide(): void;
}
```

No `addAction`. No `addButton`. No `setIcon`. **The only sanctioned extension path is the `DocumentFragment` constructor overload.**

**Example (implementation pattern):**
```typescript
// Source: obsidian@1.12.3 obsidian.d.ts line 4491 (DocumentFragment overload)
// + Dev docs HTML elements guide (createEl() only; no innerHTML)
function showSessionExpiredNotice(login: () => void): void {
  const frag = document.createDocumentFragment();
  const msgSpan = frag.createEl('span', {
    // D-21 copy (CF-04 LOCKED)
    text: 'LeetCode session expired. Log in again.',
  });
  const btn = frag.createEl('button', {
    cls: 'leetcode-notice-action mod-cta',  // neutral or CTA per UI-SPEC (accent reserved for primary auth; D-13)
    text: 'Log in',
  });
  const notice = new Notice(frag, 0); // duration 0 = manual dismiss until action
  btn.addEventListener('click', () => {
    notice.hide();
    void login();
  });
}
```

**Why this works:** Obsidian renders a DocumentFragment into `notice.messageEl` as-is; our `<button>` stays interactive. The Notice's auto-dismiss is bypassed by `duration=0`; we manually `hide()` on click.

**Fallback if `DocumentFragment` approach hits rendering issues:** Construct the plain-string Notice, then manually append the button to `notice.messageEl`:
```typescript
const notice = new Notice('LeetCode session expired. Log in again.', 0);
const btn = notice.messageEl.createEl('button', { text: 'Log in', cls: 'mod-cta' });
btn.addEventListener('click', () => { notice.hide(); void login(); });
```
`messageEl` is `@since 1.8.7`; the committed `minAppVersion: 1.10.0` covers it.

### Pattern 2: Reading-mode `MarkdownPostProcessor` with frontmatter gate (D-11, D-12)

**What:** Add a rendered decoration (our Run + Submit buttons) below each fenced code block, but only when the current note has `lc-slug` frontmatter.
**When to use:** D-11 / D-12 — Reading Mode only; Live Preview deferred.
**Example:**
```typescript
// Source: obsidianmd/obsidian-developer-docs en/Plugins/Editor/Markdown post processing.md
// + obsidian@1.12.3 obsidian.d.ts MarkdownPostProcessor(Context) interfaces (lines 3846-3891)
import type { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';

export function registerCodeBlockActionProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    // Frontmatter gate per D-12. ctx.sourcePath is the TFile.path (string).
    // The ctx.frontmatter field is available but per Obsidian docs can be null/undefined
    // for fragments without frontmatter blocks. Use metadataCache as the authoritative source.
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    const slug = cache?.frontmatter?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;  // non-LC note — skip

    // Find every <pre><code> block and append our action row after it.
    // Per docs: element may be the whole note OR a single block re-rendered on scroll;
    // idempotency must be ensured (see Pitfall 3).
    const codeBlocks = element.querySelectorAll('pre > code');
    codeBlocks.forEach((code) => {
      const pre = code.parentElement;
      if (!pre || pre.nextElementSibling?.classList.contains('leetcode-code-actions')) {
        return; // already decorated (idempotent re-run during partial re-renders)
      }
      const row = pre.createDiv({ cls: 'leetcode-code-actions' });
      // Right-aligned via CSS; both buttons neutral (UI-SPEC accent lock).
      const runBtn = row.createEl('button', { text: 'Run', cls: 'leetcode-code-action-run' });
      const submitBtn = row.createEl('button', { text: 'Submit', cls: 'leetcode-code-action-submit' });
      runBtn.addEventListener('click', () => {
        // D-22 — command-palette-style invocation. The trailing ':' boundary is important:
        // Obsidian prefixes command IDs with the plugin manifest id at registration time.
        // executeCommandById takes the fully qualified id.
        plugin.app.commands.executeCommandById(`${plugin.manifest.id}:run`);
      });
      submitBtn.addEventListener('click', () => {
        plugin.app.commands.executeCommandById(`${plugin.manifest.id}:submit`);
      });
      pre.insertAdjacentElement('afterend', row);
    });
  });
}
```

**Important notes:**
- `MarkdownPostProcessorContext` (obsidian.d.ts line 3862) exposes `{ docId, sourcePath, frontmatter, addChild, getSectionInfo }`. `frontmatter` can be `any | null | undefined` — prefer `metadataCache.getFileCache(file).frontmatter` as the authoritative source per the community lint `obsidian/prefer-frontmatter-cache` rule.
- `app.commands.executeCommandById` is a documented surface of `App.commands`; the exact ID format is `{manifest.id}:{command.id}` (Obsidian auto-prefixes at `addCommand` time; see current `main.ts:195` which registers `id: 'open-leetcode-browser'` and expects the palette to render it as `leetcode:open-leetcode-browser`).

### Pattern 3: `MarkdownRenderer.render` + Component lifecycle for SubmissionDetailModal (D-31)

**What:** Replace the current `<pre><code class="language-X">` + `textContent` approach in `SubmissionDetailModal` with `MarkdownRenderer.render(app, fenced, el, sourcePath, component)` so the code is rendered through Obsidian's CM6 pipeline (real syntax highlighting).
**When to use:** D-31 + Phase 4 Pitfall 7 deferred item.
**Example:**
```typescript
// Source: obsidian@1.12.3 obsidian.d.ts lines 4013 (render) + 1830-1908 (Component)
import { Modal, Component, MarkdownRenderer, type App, type TFile } from 'obsidian';

export class SubmissionDetailModal extends Modal {
  private readonly component = new Component();

  constructor(app: App, private readonly deps: SubmissionDetailDeps) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.component.load();  // MUST load before render so renderer's own children attach correctly
    // ... render chrome (title, metadata, footer buttons) ...
    const codeContainer = this.contentEl.createDiv({ cls: 'leetcode-submissions-code' });
    // Third arg 'sourcePath' is used to resolve relative wikilinks. Pass the problem note
    // path so link resolution in the rendered markdown behaves as if the code is in that note.
    const fenced = '```' + (this.deps.lang || 'text') + '\n' + this.deps.code + '\n```\n';
    await MarkdownRenderer.render(this.app, fenced, codeContainer, this.deps.file.path, this.component);
  }

  onClose(): void {
    this.component.unload();  // disposes every child child registered via addChild during render
    this.contentEl.empty();
  }
}
```

**Component lifecycle invariants (verified from obsidian.d.ts lines 1830–1908):**
- `load()` is idempotent-ish: calling it on an already-loaded component re-runs `onload()`. Call `load()` exactly once after construction.
- `unload()` disposes `addChild`-registered children + fires `register(cb)` callbacks + detaches `registerEvent`/`registerDomEvent` listeners.
- `MarkdownRenderer.render` internally calls `component.addChild(...)` for embedded renderers (e.g., transcluded mermaid diagrams). Without the parent `component.load()` these child lifecycles don't attach.

**Test pattern for D-31 (rewrite `tests/graph/SubmissionDetailModal.test.ts`):**
- `vi.mock('obsidian', …)` to stub `MarkdownRenderer.render` as `vi.fn(() => Promise.resolve())`
- Assert the mock was called with `(app, expectedFenced, container, sourcePath, component)`
- Assert `expectedFenced` begins with ```` ```{lang} ```` and ends with ```` ``` ````
- Assert `component.unload()` is called on `onClose`

### Pattern 4: Ephemeral tab store with workspace event lifecycle (D-02, D-09 CORRECTED)

**What:** A per-slug in-memory tab store that wipes a slug's state when the last leaf showing the slug's file is closed.
**Critical finding:** `'file-close'` is NOT a valid Workspace event in `obsidian@1.12.3`. The full list of emitted `Workspace.on(name: '…', …)` events (from obsidian.d.ts lines 6781–7163) is:
- `'quick-preview'` (file, data) — fires on every keystroke in active MD editor
- `'resize'` — workspace layout resized
- `'active-leaf-change'` (leaf | null) — active leaf changed
- `'file-open'` (file | null) — active file changed (could be new leaf or embed)
- `'layout-change'` — layout reconfigured (covers leaf opens, closes, splits)
- `'window-open'` / `'window-close'` (WorkspaceWindow, Window) — popout windows only
- `'css-change'` — theme CSS changed
- `'file-menu'`, `'files-menu'`, `'url-menu'`, `'editor-menu'` — context menu builders
- `'editor-change'` (editor, info) — editor content changed

There is no direct "leaf X closed" event. **Canonical pattern:** listen to `'layout-change'` + `'active-leaf-change'`, then call `workspace.getLeavesOfType('markdown')` and check if any leaf's `view.file.path` corresponds to the slug we care about.

**Example:**
```typescript
// Source: obsidian@1.12.3 obsidian.d.ts Workspace events (lines 6781-7169) + getLeavesOfType (7050)
import { MarkdownView, TFile, type Plugin, type WorkspaceLeaf } from 'obsidian';

export interface TabState {
  input: string;
}

export class EphemeralTabStore {
  private readonly state = new Map<string, TabState[]>();
  /** Tracks which slugs we've seen at least one leaf for — used to detect "was present,
   *  now absent" transitions on layout-change so we only wipe when the count drops to 0. */
  private readonly lastKnownSlugs = new Set<string>();

  constructor(private readonly plugin: Plugin) {
    // Wire workspace events via plugin.registerEvent so they auto-detach on plugin unload.
    // Per obsidian-developer-docs resource-cleanup guideline.
    plugin.registerEvent(
      plugin.app.workspace.on('layout-change', () => this.reconcile())
    );
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', () => this.reconcile())
    );
  }

  /** D-03 — first-run seed from exampleTestcases; subsequent opens reuse in-memory state. */
  getOrSeed(slug: string, exampleTestcases: string): TabState[] {
    const existing = this.state.get(slug);
    if (existing && existing.length > 0) return existing;
    const cases = splitExampleTestcases(exampleTestcases);
    const tabs: TabState[] = cases.length > 0
      ? cases.map((input) => ({ input }))
      : [{ input: '' }];
    this.state.set(slug, tabs);
    this.lastKnownSlugs.add(slug);
    return tabs;
  }

  /** D-05 — Reset button re-seeds from cached exampleTestcases. */
  resetToSamples(slug: string, exampleTestcases: string): TabState[] {
    this.state.delete(slug);
    this.lastKnownSlugs.delete(slug);
    return this.getOrSeed(slug, exampleTestcases);
  }

  setTabs(slug: string, tabs: TabState[]): void {
    this.state.set(slug, tabs);
    this.lastKnownSlugs.add(slug);
  }

  /** D-02 — wipe slug state when the last leaf showing it closes. */
  private reconcile(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    const stillOpen = new Set<string>();
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file instanceof TFile) {
        const cache = this.plugin.app.metadataCache.getFileCache(view.file);
        const slug = cache?.frontmatter?.['lc-slug'];
        if (typeof slug === 'string') stillOpen.add(slug);
      }
    }
    // Wipe any slug we've seen before that is now absent.
    for (const slug of this.lastKnownSlugs) {
      if (!stillOpen.has(slug)) {
        this.state.delete(slug);
        this.lastKnownSlugs.delete(slug);
      }
    }
    // Register newly-seen slugs so the NEXT transition to absent triggers a wipe.
    for (const slug of stillOpen) this.lastKnownSlugs.add(slug);
  }

  /** Test / plugin.onunload path — deterministic full wipe. */
  dispose(): void {
    this.state.clear();
    this.lastKnownSlugs.clear();
  }
}

function splitExampleTestcases(raw: string): string[] {
  if (!raw) return [];
  // LC separates multi-case example strings with `\n` per case terminator; some problems
  // use `\n\n`. The user-visible invariant: whatever LC cached, split on blank lines and
  // use the resulting groups. Per-case-internal newlines are preserved.
  return raw.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}
```

**Why this pattern:**
- `layout-change` fires when any leaf is added/closed/split/popped out — covers every "tab no longer open" transition.
- `active-leaf-change` picks up second-window leaves that may not fire `layout-change` in older Obsidian versions (defense-in-depth).
- `getLeavesOfType('markdown')` iterates all currently open markdown leaves across main pane + sidebars + popouts. Per `iterateAllLeaves` docs (obsidian.d.ts:7044), it covers all surfaces.
- `registerEvent(...)` ensures auto-detach on plugin unload (guideline from obsidian-developer-docs).

### Pattern 5: Promise.race timeout wrapping for requestUrl (D-20 CORRECTED)

**What:** Enforce a 10-second timeout on every non-polling LC call.
**Critical finding:** `RequestUrlParam` has NO `timeout` field. Verified surface (obsidian.d.ts lines 5273–5290):
```typescript
export interface RequestUrlParam {
    url: string;
    method?: string;
    contentType?: string;
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    throw?: boolean;
}
```

Nor does `requestUrl` accept any timeout option; it returns a `Promise<RequestUrlResponse>` that resolves when the request completes or errors out only on network failure. Electron-provided `net.request` does NOT auto-timeout.

**Example:**
```typescript
// Source: obsidian@1.12.3 obsidian.d.ts lines 5270-5304 (requestUrl + RequestUrlResponse)
// Implementation pattern (Phase 5 extension to src/api/requestUrlFetcher.ts):

class TimeoutError extends Error {
  constructor() { super('LeetCode request timed out'); this.name = 'TimeoutError'; }
}

export async function throttledRequestUrl(
  params: RequestUrlParam,
  opts: { timeoutMs?: number } = {},
): Promise<RequestUrlResponse> {
  const timeoutMs = opts.timeoutMs ?? 10_000;  // D-20: 10s non-polling default
  const throttle = activeThrottle;
  if (!throttle) throw new Error('throttledRequestUrl: fetcher not installed');
  await throttle.acquire();
  try {
    return await raceWithTimeout(
      doRequestWith429Retry(params),  // D-18 retry inside
      timeoutMs,
    );
  } finally {
    throttle.release();
  }
}

async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);  // never leak the timer if the request won the race
  }
}
```

**Opt-out path for polling** (D-20 carve-out): submit polling already owns its own backoff ladder (1-2-4-8 cap 30s per Phase 3 D-21). That path already lives inside `pollingOrchestrator.pollSubmission` and does NOT call `throttledRequestUrl` with a 10s cap — it uses the raw throttle + its own interval chain. Phase 5's change only touches the `throttledRequestUrl` entry point (NEW default 10s timeout); the polling orchestrator's internal fetcher path stays timeout-free because each poll-step request is expected to return in sub-second time at LC's end (the 30s cap is a *total wall-clock* cap, not a per-request cap).

### Pattern 6: 429 single auto-retry (D-18)

**What:** On first 429, silently queue a single retry after `RATE_LIMIT_RETRY_MS = 5000`. On second 429, surface Notice and fail.
**Example:**
```typescript
// Inside src/api/requestUrlFetcher.ts (Phase 5 extension)
const RATE_LIMIT_RETRY_MS = 5000;

async function doRequestWith429Retry(params: RequestUrlParam): Promise<RequestUrlResponse> {
  try {
    return await doRawRequest(params);
  } catch (err) {
    if (err instanceof RateLimitError) {
      // D-18: silent wait + single retry
      await delay(RATE_LIMIT_RETRY_MS);
      try {
        return await doRawRequest(params);
      } catch (err2) {
        if (err2 instanceof RateLimitError) {
          // D-18: second failure surfaces the locked Notice at the caller level
          // (Notice fire NOT here — here we just re-throw so the command-palette
          // lambda can surface its locked copy.)
          throw err2;
        }
        throw err2;
      }
    }
    throw err;
  }
}

async function doRawRequest(params: RequestUrlParam): Promise<RequestUrlResponse> {
  const res = await requestUrl({ ...params, throw: false });
  if (res.status === 429) {
    const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
    const retryMs = retryAfter && Number.isFinite(+retryAfter)
      ? +retryAfter * 1000
      : RATE_LIMIT_RETRY_MS;
    throw new RateLimitError(retryMs);
  }
  return res;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

**Important:** the existing `throttledRequestUrl` already throws `RateLimitError` on 429 (verified from source at `src/api/requestUrlFetcher.ts:115–136`). Phase 5's change wraps this with the retry-once layer, and the Notice copy fires at the call site. **Do NOT double-Notice** (existing 429 Notice flows in `main.ts` already fire on `RateLimitError`).

### Pattern 7: Section heading in Settings tab (D-14)

**What:** Add a `Knowledge Graph` section heading to the settings tab.
**Canonical pattern (from obsidian-developer-docs Plugin guidelines):**
```typescript
// Source: obsidianmd/obsidian-developer-docs en/Plugins/Releasing/Plugin guidelines.md
// "Use `setHeading` instead of a <h1>, <h2>"
new Setting(containerEl).setName('Knowledge Graph').setHeading();
```

**Do NOT use** `containerEl.createEl('h2', …)` — explicitly called out as a violation in the developer docs. The existing `src/settings/SettingsTab.ts` already uses `setHeading()` correctly at 3 sites — Phase 5 adds a fourth.

### Anti-Patterns to Avoid

- **`new Function()` / `eval()` / `document.write()`** — Store auto-rejection. D-27 grep-gates all three.
- **`innerHTML` / `outerHTML` / `insertAdjacentHTML`** — Developer Policies violation; `eslint-plugin-obsidianmd` flags. Use `createEl()`, `createDiv()`, `createSpan()`, `el.empty()`. D-27 grep-gates `innerHTML\s*=`.
- **Hardcoded inline styles** (`el.style.color = 'red'`) — Developer Policies violation. Use CSS classes + `var(--...)` tokens. Phase 5 new CSS in `styles.css` must follow Phase 1-4 convention.
- **Default hotkeys** (`hotkeys: [...]` in addCommand payload) — Developer Policies violation. D-27 grep-gates.
- **Plugin ID containing "obsidian"** — manifest rejected. Current `id: 'leetcode'` is clean; do not regress.
- **Writing to `## Custom Tests`** — Phase 5 forbids per D-01/D-08. Any `writeCasesToVault` import in new code = bug.
- **Passing the string `'file-close'` to `workspace.on`** — event does not exist; runtime silently does nothing. Use `layout-change` + ref-count per Pattern 4.
- **Calling `Notice.addAction(...)`** — API does not exist; TypeScript compile error. Use DocumentFragment per Pattern 1.
- **Setting `timeout` on `RequestUrlParam`** — field does not exist; silently ignored. Use Promise.race per Pattern 5.
- **Writing analytics/telemetry strings anywhere** — Developer Policies "Not allowed" list. D-27 grep-gates `analytics|telemetry|mixpanel|google-analytics|gtag`.
- **`vault.modify` in `src/graph/` or `src/main.ts`** — CF-06 lock. Existing `scripts/grep-no-vault-modify.sh` already enforces; D-27 extends.
- **Including `id: 'leetcode:…'` in `addCommand`** — Obsidian auto-prefixes; per Submission Requirements "Don't include the plugin ID in the command ID". Current code at `main.ts:195` has an eslint-disable comment for ONE legacy command; Phase 5's new `run` command must NOT repeat this pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fenced-code syntax highlighting in `SubmissionDetailModal` | Custom CodeMirror highlighter or highlight.js | `MarkdownRenderer.render(app, '\`\`\`lang\n…\n\`\`\`', el, sourcePath, component)` | Obsidian's own CM6 fence rendering handles every language Obsidian itself handles; bundling highlight.js adds ~200kB |
| Reading-mode code-block decoration | Custom HTML parse of rendered preview | `plugin.registerMarkdownPostProcessor(cb)` | Canonical API; handles re-renders correctly; lifecycle managed |
| Section headings in Settings tab | `createEl('h2', …)` | `new Setting(el).setName('Heading').setHeading()` | Obsidian Plugin guidelines flag `<h2>` as inconsistent styling |
| Tab leaf close detection | Polling `getLeavesOfType` every N ms | Listen to `'layout-change'` + `'active-leaf-change'` events | Polling is wasteful; events fire exactly when needed |
| Request timeout | Cancel via `AbortController` | `Promise.race([request, setTimeout reject])` | `requestUrl` doesn't support AbortController; race pattern is standard JS |
| 429 auto-retry | Custom exponential-backoff state machine | Single `await delay(5000) + retry-once` per D-18 | D-18 locks single-retry semantics; full backoff ladder is POLISH-02 stretch, not locked |
| Frontmatter parsing from MDP element | Regex over `element.textContent` | `app.metadataCache.getFileCache(file).frontmatter` | Metadata cache already parses frontmatter; regex misses edge cases (triple-dash in code blocks, etc.) |
| Network-error detection from `requestUrl` throws | Try to parse `err.message` for OS-specific tokens | Helper `isNetworkError(err)` that whitelists known Chromium net:: error prefixes | D-19 locks the helper shape; centralize in `src/shared/errors.ts` for one change-point |
| LICENSE file text | Write custom license prose | Verbatim MIT text from `choosealicense.com/licenses/mit/` | D-26 locks MIT; "choose a license" is the canonical source |
| Prerelease manifest validity | JSON Schema validator library | Shell grep + `jq` (if available) or inline `python3 -c` | Schema is tiny (10 fields); shell patterns are grep-visible + zero-dep |
| Bundle size check | rollup-plugin-analyzer / webpack-bundle-analyzer | `stat -c '%s' main.js` (Linux) or `wc -c < main.js` (portable) | 200kB ceiling is a simple byte count; no tool needed |

**Key insight:** Every single Phase 5 capability has a stable Obsidian API or single-liner platform pattern. The temptation is greatest around **tab-close detection** (no direct event) and **Notice action buttons** (no method) — but the corrected patterns above are both ~30 LoC and safer than any custom implementation.

## Runtime State Inventory

Phase 5 has a mix of refactor (CustomTestModal rename/rewrite) AND new functionality. Applying the inventory:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | `data.json` field `autoBacklinksEnabled` already exists (Phase 4 D-21) — no migration. NEW field `techniquesFolderOverride: string` (D-15) — backward-compat via shape-guard (missing → empty string → use derived default). NO new `lc-*` frontmatter keys (CF-12). NO persistence of ephemeral tabs (D-02 in-memory only). | Add field to `PluginData` type + `DEFAULT_DATA` + shape guard in `SettingsStore.load`. Fall-through to derived default for old data.json. |
| **Live service config** | None — LC endpoints unchanged. No external services configured at runtime. | None — verified no external service state depends on renamed code. |
| **OS-registered state** | None — no OS registrations. | None. |
| **Secrets/env vars** | `LEETCODE_SESSION` + `csrftoken` in `data.json` (CF-03, unchanged in Phase 5). No secret-key renames. `RATE_LIMIT_RETRY_MS = 5000` is an in-code const (D-18), not a env var. | None. |
| **Build artifacts / installed packages** | `main.js` bundle regenerated each build. If Phase 5 wave 5 changes the bundle (it will — settings UI extensions, RunModal, MDP), `scripts/prerelease-check.sh` needs to run post-build so the bundle-size check reflects Phase 5 output. Existing `tests/__snapshots__/` for vitest may need updating if any rendered DOM assertion changes (low risk — Phase 5 tests are mostly new). | Re-snapshot once after Wave 3; ensure `grep-no-vault-modify.sh` path coverage extends to any new `src/` subfolder (it already greps `src/graph/` + `src/main.ts`; Phase 5 adds no new folder). |

**Special callout — CustomTestModal → RunModal rename (D-10):**
- No external consumer references `CustomTestModal` by name outside `main.ts` (which we edit) and `tests/solve/` (which we edit).
- No user-facing filename depends on it.
- No persisted `data.json` key references it.
- `grep -rn "CustomTestModal" src/ tests/` should return zero hits after Phase 5 Wave 3 completes.

**`customTestStore.ts` deletion verification:**
- After D-01 removes the two command handlers that call `writeCasesToVault` and after D-08 removes the `## Custom Tests` read path, `readCasesFromVault` / `writeCasesToVault` / `readCases` / `writeCases` should have zero remaining callers.
- Pure helpers `CaseRegion.readCases` / `CaseRegion.writeCases` are imported only by `customTestStore.ts`; both files become dead.
- **Action:** delete both files in Wave 3; grep-verify zero callers before commit.

## Common Pitfalls

### Pitfall 1: `Notice.addAction` assumption (D-21)
**What goes wrong:** Typing `new Notice(msg).addAction('Log in', cb)` — TypeScript compile error in strict mode ("Property 'addAction' does not exist on type 'Notice'"), or silently no-op if the call is `any`-cast away.
**Why it happens:** Old Obsidian tutorials and some older plugin examples assume this method exists. It does not.
**How to avoid:** Use `new Notice(DocumentFragment, 0)` pattern from Pattern 1. Add a unit test that asserts the button appears inside `notice.messageEl` (using the happy-dom test env).
**Warning signs:** `.addAction(` appearing in any src/ file after Wave 2 (D-27 prerelease grep can optionally gate this).

### Pitfall 2: `'file-close'` event assumption (D-02, D-09)
**What goes wrong:** `workspace.on('file-close', cb)` — TypeScript accepts it (`on(name: string, cb: ...)` has a catch-all overload on `Events`), but the callback NEVER fires. Ephemeral tab state accumulates forever; user reports "custom tests showing old problem's inputs."
**Why it happens:** Misreading the Workspace event list; intuitive symmetry with `file-open`.
**How to avoid:** Use `layout-change` + ref-count per Pattern 4. Unit test the store by simulating open/close transitions via mocked `workspace.getLeavesOfType`.
**Warning signs:** `workspace.on('file-close'` or `on('file-closed'` anywhere in src/ after Wave 3.

### Pitfall 3: MarkdownPostProcessor runs on every re-render
**What goes wrong:** Processor creates duplicate button rows when user scrolls out-of-view and back; `MarkdownPostProcessor` can be invoked multiple times per block as the viewport repaints.
**Why it happens:** Obsidian's virtualized reading view evicts off-screen blocks from the DOM and re-renders them on return; each re-render fires the processor.
**How to avoid:** Idempotency guard — before appending the action row, check if the next sibling already has class `leetcode-code-actions`. See Pattern 2 example.
**Warning signs:** Users see double "Run / Submit" rows under a block after scrolling.

### Pitfall 4: MarkdownPostProcessor element scope varies
**What goes wrong:** Processor code assumes `element` is the full note root and does `element.querySelector('…')` from top — misses blocks that are in sibling sections during partial re-renders.
**Why it happens:** Per Obsidian docs, `element` may be a single section or the whole note depending on render lifecycle stage (initial vs. incremental).
**How to avoid:** Scope queries to `element` only; do not assume whole-note visibility. Use `element.querySelectorAll('pre > code')` on the given element — if the section has no code blocks, the loop is a no-op.

### Pitfall 5: Frontmatter lookup timing in MarkdownPostProcessor
**What goes wrong:** `ctx.frontmatter` is `null` on first render for a freshly-opened note because the metadata cache hasn't populated yet; processor skips (no buttons) until the user edits.
**Why it happens:** Obsidian's metadataCache populates asynchronously after file read.
**How to avoid:** Prefer `plugin.app.metadataCache.getFileCache(file).frontmatter` — this is synchronously-populated once the cache has seen the file, which it always has by the time reading-mode render fires (file-open precedes render). If lookup fails once, the next re-render triggered by any note mutation will succeed.

### Pitfall 6: Component lifecycle ordering
**What goes wrong:** Calling `MarkdownRenderer.render(…, component)` without `component.load()` — internal child components never fire `onload()`, rendered elements missing expected hover/link behaviors.
**Why it happens:** Component's `load()` is virtual; the renderer uses `addChild` internally but children only fully initialize when the parent is loaded.
**How to avoid:** Call `component.load()` in `onOpen` BEFORE calling `render`, and `component.unload()` in `onClose`. See Pattern 3.
**Warning signs:** Console warning "Child loaded before parent" (Obsidian-internal); or subtle bugs where embedded transclusions in rendered code comments (rare) don't render.

### Pitfall 7: Notice auto-dismiss racing with action click
**What goes wrong:** Default `Notice` auto-dismisses after 4s (if `duration` unset). User sees the `Log in` action, reaches for it, Notice dismisses before they click.
**Why it happens:** Default timeout swallows the Notice.
**How to avoid:** Pass `duration: 0` (never auto-dismiss) OR a long duration like `15_000`. Per D-21, sticky (0) makes semantic sense — the user decides when to dismiss.
**Warning signs:** User reports "The Notice disappeared while I was reading it."

### Pitfall 8: 429 auto-retry amplifying load
**What goes wrong:** D-18 says "one retry after 5s backoff." If the retry path is itself wrapped in another retry layer (e.g., the orchestrator loop also retries on RateLimitError), the user fires 4 requests for what they think is 1.
**Why it happens:** Composition of retry layers.
**How to avoid:** Do NOT add retry logic above `throttledRequestUrl`. The orchestrator and command handlers surface `RateLimitError` as-is via the locked Notice — no retry.
**Warning signs:** Rapid-fire requests to `/interpret_solution/` during rate-limit testing.

### Pitfall 9: LICENSE copyright holder inference
**What goes wrong:** LICENSE says `Copyright (c) 2026 YourNameHere` — blocks review.
**Why it happens:** Boilerplate substitution forgotten.
**How to avoid:** Use `git config user.name` OR manifest.json `author` field as the holder. D-26 locks MIT; copyright line format: `Copyright (c) 2026 moxu` (per `manifest.json` author). D-27's manual UAT (D-28) includes a spot-check.

### Pitfall 10: manifest.json + package.json + versions.json drift
**What goes wrong:** Bump manifest to 0.1.0 but forget package.json or versions.json; community plugin install fails on version mismatch.
**Why it happens:** Three files, three edits, easy to miss one.
**How to avoid:** D-27 prerelease grep enforces all three match. The existing `npm version` script (package.json `scripts.version` → `node version-bump.mjs && git add manifest.json versions.json`) auto-syncs two of three when run as `npm version 0.1.0`. Recommend using `npm version 0.1.0` for the bump + add an explicit package.json sync step.

### Pitfall 11: README screenshot paths broken on GitHub
**What goes wrong:** README uses relative paths like `docs/screenshots/xxx.png`; screenshots are actually at `assets/…` or missing.
**Why it happens:** Path rearrangement without updating markdown.
**How to avoid:** D-27 grep asserts "contains 4 image links". D-28 manual UAT includes a "screenshots render" visual spot-check on GitHub web view BEFORE opening the PR. Store screenshots under `docs/` (relative paths ensure GitHub + Obsidian help page both render).

### Pitfall 12: Prerelease grep false positives
**What goes wrong:** `grep -r "innerHTML" src/` catches the string `innerHTML` in a code comment like `// CF-07: never use innerHTML`, blocks release.
**Why it happens:** Pattern too loose.
**How to avoid:** D-27 specifies tighter patterns:
- `grep -rE "innerHTML\s*=" src/` (assignment only, not mentions)
- `grep -rE "\bfetch\s*\(" src/` (call-site only; word boundary avoids `requestFetch`)
- `grep -rE "\beval\s*\(" src/` (same)
- `grep -rE "new Function\s*\(" src/`
Document the expected exit-0 behavior in `prerelease-check.sh` with comments referencing this RESEARCH §Pitfall 12.

### Pitfall 13: 10s timeout + D-22 submit polling 30s cap
**What goes wrong:** Submit path's outer wall-clock 30s cap (Phase 3 D-21) runs *total*; each individual poll request gets wrapped in the new 10s timeout. If LC's `/check/{id}` takes 11s on a single poll, the timeout fires and the submission orchestrator sees a TimeoutError — pending verdict becomes an error that is NOT a real timeout.
**Why it happens:** Layering two timeout regimes.
**How to avoid:** Carve out polling from the new 10s. Per D-20 carve-out text: "30s exponential backoff for submit polling continues." Implementation: call the raw `throttledRequestUrl` WITHOUT the timeoutMs wrap from inside `pollSubmission`, OR pass `{ timeoutMs: 20_000 }` (more generous per poll).
**Warning signs:** Submit path reports "LeetCode is slow to respond" instead of the real verdict on a slow judge.

### Pitfall 14: `executeCommandById` ID format
**What goes wrong:** Click handler calls `app.commands.executeCommandById('run')` — command not found because real registered ID is `leetcode:run`.
**Why it happens:** Obsidian auto-prefixes command IDs at registration time (see `main.ts:195` comment for the same issue).
**How to avoid:** Pass `${plugin.manifest.id}:${commandId}` per Pattern 2.
**Warning signs:** Clicks silently no-op; no error in console.

## Code Examples

### Example 1: `techniquesFolderOverride` Setting control (D-15)

```typescript
// Source: obsidian@1.12.3 obsidian.d.ts Setting API (lines 5523-5660)
// Pattern mirrored on current src/settings/SettingsTab.ts 'Problems folder' control
import { Notice } from 'obsidian';

// Inside display() method, AFTER Notes section and BEFORE the end:
new Setting(containerEl).setName('Knowledge Graph').setHeading();

new Setting(containerEl)
  .setName('Technique folder override')
  .setDesc('Vault folder for technique stub notes. Leave empty to use {Problems folder}/Techniques.')
  .addText((t) => t
    .setPlaceholder(`${this.plugin.settings.getProblemsFolder()}/Techniques`)
    .setValue(this.plugin.settings.getTechniquesFolderOverride())
    .onChange(async (v) => {
      await this.plugin.settings.setTechniquesFolderOverride(v.trim().replace(/[\\/]+$/, ''));
    }),
  );

new Setting(containerEl)
  .setName('Auto-create technique backlinks on Accepted')
  .setDesc('When enabled, an Accepted submission writes a ## Techniques section and creates stub notes for each LC topic tag. When disabled, only frontmatter tags (lc/{slug}) are written; no ## Techniques heading, no stubs.')
  .addToggle((t) => t
    .setValue(this.plugin.settings.getAutoBacklinksEnabled())
    .onChange(async (v) => {
      await this.plugin.settings.setAutoBacklinksEnabled(v);
    }),
  );
```

**Matching SettingsStore extension:**
```typescript
// In PluginData interface:
techniquesFolderOverride: string;  // empty string = use derived default

// In DEFAULT_DATA:
techniquesFolderOverride: '',

// In isValidPluginData-equivalent (inside SettingsStore.load):
techniquesFolderOverride: sanitizeFolder(raw.techniquesFolderOverride),  // '' allowed

// New getter/setter:
getTechniquesFolderOverride(): string { return this.data.techniquesFolderOverride; }
async setTechniquesFolderOverride(v: string): Promise<void> {
  this.data.techniquesFolderOverride = v;
  await this.persist();
}

// Modified getTechniquesFolder (D-15):
getTechniquesFolder(): string {
  const override = this.data.techniquesFolderOverride;
  return override && override.length > 0
    ? override
    : `${this.getProblemsFolder()}/Techniques`;
}
```

**`sanitizeFolder` carve-out:** the existing helper rejects empty strings by returning `DEFAULT_DATA.problemsFolder`. The override field needs empty-string preservation — either extend `sanitizeFolder` to accept empty, or inline the sanitization here. Preferred: inline + reuse the path-traversal + absolute-path guards.

### Example 2: `isNetworkError` helper (D-19)

```typescript
// src/shared/errors.ts — Phase 5 extension
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Chromium net:: error tokens emitted by Electron's net.request when
  // a network hop fails. Covers macOS / Windows / Linux variants.
  const tokens = [
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_REFUSED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NETWORK_CHANGED',
    'ERR_CONNECTION_CLOSED',
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_PROXY_CONNECTION_FAILED',
    'ERR_NAME_RESOLUTION_FAILED',
  ];
  return tokens.some((t) => msg.includes(t));
}
```

### Example 3: Prerelease check script (D-27)

```bash
#!/usr/bin/env bash
# scripts/prerelease-check.sh
# Mechanical gates before `git tag 0.1.0`. Each gate exits loud on failure.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "PRERELEASE FAIL: $*" >&2; exit 1; }
ok()   { echo "OK: $*"; }

# 1. No innerHTML assignment (mentions in comments allowed)
if grep -rE "innerHTML\s*=" src/ --include='*.ts' -q; then
  grep -rnE "innerHTML\s*=" src/ --include='*.ts' >&2
  fail "innerHTML assignment found"
fi
ok "no innerHTML assignment"

# 2. No raw fetch() calls (LC calls must go through requestUrl/throttle)
if grep -rE "\bfetch\s*\(" src/ --include='*.ts' -q; then
  grep -rnE "\bfetch\s*\(" src/ --include='*.ts' >&2
  fail "raw fetch() call found (use requestUrl)"
fi
ok "no raw fetch() calls"

# 3. No eval() or new Function()
for pat in '\beval\s*\(' 'new Function\s*\('; do
  if grep -rE "$pat" src/ --include='*.ts' -q; then
    grep -rnE "$pat" src/ --include='*.ts' >&2
    fail "Forbidden pattern: $pat"
  fi
done
ok "no eval / new Function"

# 4. No telemetry / analytics imports or strings
if grep -rEi "(analytics|telemetry|mixpanel|google-analytics|gtag\s*\()" src/ --include='*.ts' -q; then
  grep -rniE "(analytics|telemetry|mixpanel|google-analytics|gtag\s*\()" src/ --include='*.ts' >&2
  fail "Telemetry/analytics reference found"
fi
ok "no telemetry/analytics references"

# 5. CF-06: no vault.modify in src/graph/ or src/main.ts (also gated by existing script)
if grep -rE "vault\.modify\s*\(" src/graph/ src/main.ts --include='*.ts' -q; then
  grep -rnE "vault\.modify\s*\(" src/graph/ src/main.ts --include='*.ts' >&2
  fail "vault.modify found in graph/ or main.ts"
fi
ok "no vault.modify in graph/ or main.ts"

# 6. manifest.json validity (jq preferred; fallback to python3)
if command -v jq >/dev/null 2>&1; then
  ID=$(jq -r '.id' manifest.json)
  VER=$(jq -r '.version' manifest.json)
  MIN=$(jq -r '.minAppVersion' manifest.json)
  DESC=$(jq -r '.description' manifest.json)
  ISDT=$(jq -r '.isDesktopOnly' manifest.json)
else
  ID=$(python3 -c "import json;print(json.load(open('manifest.json'))['id'])")
  VER=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
  MIN=$(python3 -c "import json;print(json.load(open('manifest.json'))['minAppVersion'])")
  DESC=$(python3 -c "import json;print(json.load(open('manifest.json'))['description'])")
  ISDT=$(python3 -c "import json;print(json.load(open('manifest.json')).get('isDesktopOnly', False))")
fi
[[ "$ID" == *obsidian* ]] && fail "manifest.json: id contains 'obsidian'"
[[ ! "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && fail "manifest.json: version '$VER' not valid semver x.y.z"
[[ -z "$MIN" ]] && fail "manifest.json: minAppVersion empty"
[[ "$DESC" != *. ]] && fail "manifest.json: description missing terminal period"
[[ ${#DESC} -gt 250 ]] && fail "manifest.json: description > 250 chars (${#DESC})"
[[ "$ISDT" != "true" && "$ISDT" != "True" ]] && fail "manifest.json: isDesktopOnly must be true"
ok "manifest.json valid"

# 7. package.json + versions.json + manifest.json version consistency
PKG_VER=$(python3 -c "import json;print(json.load(open('package.json'))['version'])")
VJSON_LATEST=$(python3 -c "import json,sys;d=json.load(open('versions.json'));print(sorted(d.keys())[-1] if d else '')")
[[ "$PKG_VER" != "$VER" ]] && fail "package.json version ($PKG_VER) != manifest.json ($VER)"
[[ "$VJSON_LATEST" != "$VER" ]] && fail "versions.json latest ($VJSON_LATEST) != manifest.json ($VER)"
ok "version consistency (manifest=$VER, package=$PKG_VER, versions latest=$VJSON_LATEST)"

# 8. LICENSE file present + non-empty
[[ ! -s LICENSE ]] && fail "LICENSE missing or empty"
ok "LICENSE present"

# 9. README.md present + contains network disclosure + 4 image links
[[ ! -s README.md ]] && fail "README.md missing or empty"
grep -q "leetcode.com" README.md || fail "README.md missing leetcode.com network disclosure"
IMG_COUNT=$(grep -cE '!\[.*\]\(' README.md || true)
[[ "$IMG_COUNT" -lt 4 ]] && fail "README.md has fewer than 4 image links ($IMG_COUNT)"
ok "README.md has network disclosure + $IMG_COUNT image links"

# 10. Lint clean
npm run lint || fail "npm run lint failed"
ok "npm run lint clean"

# 11. Tests clean
npm test -- --run || fail "npm test failed"
ok "npm test passing"

# 12. Bundle size — warn at 100kB, fail at 200kB
[[ ! -f main.js ]] && fail "main.js not built (run `npm run build` first)"
SIZE_BYTES=$(wc -c < main.js)
SIZE_KB=$((SIZE_BYTES / 1024))
if [[ "$SIZE_KB" -gt 200 ]]; then fail "main.js bundle $SIZE_KB kB > 200 kB ceiling"; fi
if [[ "$SIZE_KB" -gt 100 ]]; then echo "WARN: main.js bundle $SIZE_KB kB exceeds 100 kB advisory"; fi
ok "bundle size $SIZE_KB kB (ceiling 200)"

echo "All prerelease gates passed."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MarkdownRenderer.renderMarkdown(md, el, src, comp)` | `MarkdownRenderer.render(app, md, el, src, comp)` | Obsidian 0.16.x | `renderMarkdown` deprecated; `render` takes `app` as first arg. D-31 must use the new form. |
| `workspace.activeLeaf` direct access | `workspace.getActiveViewOfType(MarkdownView)` / `workspace.activeEditor` | Obsidian 1.x plugin guidelines | Developer guideline; D-22 command handlers already use the new form. No Phase 5 regression. |
| `containerEl.createEl('h2', …)` for Settings headings | `new Setting(el).setName('…').setHeading()` | Obsidian 0.9.16 (API) / guideline current | D-14 uses the current form. |
| Plugin ID prefix in command ID (`id: 'leetcode:run'`) | Bare command ID (`id: 'run'`; Obsidian auto-prefixes) | Submission Requirements (current) | Phase 5 new `run` command uses bare form. Legacy `open-leetcode-browser` remains eslint-disabled for backward compat. |
| Global `app` / `window.app` | `this.app` from Plugin instance | Guideline current | Already enforced in Phase 1-4. |

**Deprecated/outdated:**
- `MarkdownRenderer.renderMarkdown` — replaced by `.render` with app as first arg.
- `Notice.noticeEl` — deprecated in favor of `messageEl` (@since 0.9.7). Phase 5 new code uses `messageEl`.
- `@electron/remote` — deprecated; direct `require('electron')` preferred. Not touched by Phase 5.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notice.messageEl.createEl('button', …)` works at runtime (not just documented) | Pattern 1 fallback | If Obsidian re-renders the Notice's internal DOM on every `setMessage`, the appended button could be lost. Mitigation: prefer the DocumentFragment constructor overload (primary path), not the fallback. |
| A2 | `ctx.frontmatter` in `MarkdownPostProcessor` is usable but less reliable than `metadataCache.getFileCache(file).frontmatter` | Pattern 2 | We recommend metadataCache as authoritative; if `ctx.frontmatter` is actually reliable in 1.12.x, this is more defensive than needed — no harm. |
| A3 | LC's `exampleTestcases` string uses blank-line separators between cases | `splitExampleTestcases` in Pattern 4 | If LC uses a different separator (e.g., `\n`-only or a fixed case count), the seeded tabs could all be in Case 1. Phase 2 D-14 already caches this string; Wave 3 Task 1 should visually verify by dumping the cached string for Two Sum (expected: 3 cases seeded). |
| A4 | `app.commands.executeCommandById` is a stable public API | Pattern 2 | It is not explicitly documented in the dev docs index but is widely used by community plugins (e.g., obsidian-git, hotkeysplus-obsidian per community-plugins.json). Low risk; Phase 5 uses it as intended by Obsidian's plugin SDK. |
| A5 | Phase 4 existing `SubmissionDetailModal` already works in production with `<pre><code>` approach; D-31 upgrade is cosmetic | Pattern 3 | Phase 4 VERIFICATION passed with the current approach; the D-31 upgrade is a polish fix for the "no syntax highlighting" UAT gap. Low-risk rewrite. |
| A6 | `package.json` `scripts.version` → `node version-bump.mjs` already handles manifest.json + versions.json sync | Pitfall 10 | File exists in package.json per `npm version` script. The `version-bump.mjs` file wasn't read during research; the planner should verify it exists in repo (or create one) before locking D-23's bump method. |
| A7 | Bundle size ceiling 200 kB is generous; Phase 1-4 output stays under 100 kB | Prerelease script #12 | Not measured during research — planner should add a task to Wave 5 "capture current main.js size" to confirm. If the bundle is already 150 kB after Phase 4, the 200 kB ceiling leaves little room for Phase 5 additions. |

**Unassumed (verified):** All Obsidian API signatures (Notice, Setting, Component, MarkdownRenderer, MarkdownPostProcessor, RequestUrlParam, Workspace events, PluginManifest, Command) verified against local `node_modules/obsidian@1.12.3/obsidian.d.ts`. All Developer Policies / Plugin Guidelines / Submit-your-plugin / Submission-requirements verified against raw markdown fetched from `obsidianmd/obsidian-developer-docs` GitHub. All npm versions verified via live `npm view X version` calls 2026-05-09.

## Open Questions

1. **Should the bundle-size ceiling be 200 kB or tighter?**
   - What we know: D-27 says 200 kB ceiling, 100 kB warn line. Current Phase 4 bundle size unmeasured.
   - What's unclear: Is the plugin currently close to 100 kB or well under?
   - Recommendation: Wave 5 first task = `npm run build && wc -c < main.js`; if already > 100 kB, tighten warning to current+20 kB.

2. **Should the Notice action button use `mod-cta` accent or stay neutral?**
   - What we know: D-13 reserves accent for the primary `Log in via embedded window` button in Settings. D-21 adds a `Log in` action button in a Notice — arguably the SAME semantic (primary auth CTA).
   - What's unclear: Is the Notice action a second CTA that violates the accent-rule lock, or is it the SAME CTA rendered in a different context?
   - Recommendation: Treat as the same CTA — use `mod-cta` on the Notice action button. Update the grep-gate to allow exactly 2 `.setCta()` + `mod-cta` invocations (one in SettingsTab, one in session-expiry Notice builder). Planner confirms.

3. **Should `RunModal`'s Reset button confirm before wiping?**
   - What we know: D-05 says "no confirmation modal (destructive but recoverable)."
   - What's unclear: If the user has typed a lot in a non-sample tab and accidentally clicks Reset, is the recovery path (re-typing) actually acceptable?
   - Recommendation: Follow D-05 literally (no confirm). If UAT surfaces complaints, a 3s "Undo" Notice could ship in post-v1.

4. **Live Preview overlay buttons — is the Reading-Mode-only shipment a UX regression?**
   - What we know: D-11 says Reading Mode only; Live Preview deferred past v1.
   - What's unclear: The author's primary usage mode during development was not recorded. If they work primarily in Live Preview (which is Obsidian's default post-0.15), the Run/Submit buttons never appear during their main workflow.
   - Recommendation: Keep D-11 decision; in README/usage walkthrough, explicitly mention "buttons appear in Reading mode — command palette is always available in Live Preview." Mitigates user confusion.

5. **Ephemeral tab store — should popout windows count as "still showing"?**
   - What we know: D-02 says "while any workspace leaf is showing the problem note… state persists."
   - What's unclear: Does `getLeavesOfType('markdown')` include leaves in popout windows (second Obsidian window)?
   - Answer (from obsidian.d.ts line 7040–7044): Yes — `iterateAllLeaves` explicitly covers "main area leaves, floating leaves, and sidebar leaves." `getLeavesOfType` is implemented similarly per community plugin references.
   - Recommendation: No change to Pattern 4; popout windows correctly keep the tab state alive.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `obsidian` (npm type pkg) | All Phase 5 code | ✓ | 1.12.3 | — |
| Node + npm | Build, tests | ✓ | Node present (package.json requires Node-native esbuild) | — |
| `jq` | `scripts/prerelease-check.sh` manifest validity | Unknown (user env dependent) | — | Fall through to `python3 -c` per script Example 3 |
| `python3` | prerelease-check.sh fallback path | Likely ✓ (ubiquitous on dev machines) | — | Manually curl + cat expected values |
| `git` | Tagging release | ✓ (project is under git) | — | — |
| `gh` CLI | PR submission to obsidianmd/obsidian-releases | Optional | — | Manual GitHub UI PR — official docs actually recommend UI flow (`Submit your plugin` §Step 3) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `jq` — script falls through to `python3`; if neither present, can add a third node-based fallback (`node -e "console.log(require('./manifest.json').id)"`). Recommend shipping with `jq → python3 → node` triple-fallback.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (already committed; see package.json + existing ~40 test files) |
| Config file | `vitest.config.ts` (inferred from existing tests; verify path during Wave 0) |
| Test env | `happy-dom` per package.json devDependency |
| Quick run command | `npx vitest run tests/{path} --passWithNoTests` |
| Full suite command | `npm test -- --run` |
| Lint command | `npm run lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-01 (auto-backlink toggle) | Settings UI toggle bound to `getAutoBacklinksEnabled`/`setAutoBacklinksEnabled` | unit | `npx vitest run tests/settings/SettingsTab.knowledge-graph.test.ts` | ❌ Wave 0 |
| POLISH-01 (technique folder override) | Override text field + derived default placeholder updates live | unit | `npx vitest run tests/settings/SettingsTab.knowledge-graph.test.ts` | ❌ Wave 0 |
| POLISH-01 (SettingsStore persistence) | `techniquesFolderOverride` round-trips via data.json | unit | `npx vitest run tests/settings-store.test.ts` (extend existing) | ✅ (extend) |
| POLISH-02 (429 auto-retry) | Single retry after 5s; second 429 surfaces Notice | unit | `npx vitest run tests/api/throttle.rate-limit-retry.test.ts` | ❌ Wave 0 |
| POLISH-02 (10s timeout) | Request that takes > 10s rejects with TimeoutError; polling path exempt | unit | `npx vitest run tests/api/throttle.timeout.test.ts` | ❌ Wave 0 |
| POLISH-02 (isNetworkError) | Classifies known ERR_* tokens correctly | unit | `npx vitest run tests/shared/errors.isNetworkError.test.ts` | ❌ Wave 0 |
| POLISH-02 (session-expiry Notice + action) | Notice contains button that invokes AuthService.login when clicked | unit | `npx vitest run tests/notice-action.test.ts` | ❌ Wave 0 |
| POLISH-03 (no innerHTML/fetch/eval/telemetry) | Prerelease script exits 0 on clean src/ | integration | `bash scripts/prerelease-check.sh` (in CI / manually) | ❌ Wave 5 |
| POLISH-03 (lint clean) | ESLint Required rules zero violations | integration | `npm run lint` | ✅ |
| POLISH-04 (README) | README exists + contains LC disclosure + 4 image links | integration | `bash scripts/prerelease-check.sh` gate #9 | ❌ Wave 5 |
| POLISH-05 (LICENSE) | LICENSE file present + non-empty | integration | `bash scripts/prerelease-check.sh` gate #8 | ❌ Wave 5 |
| POLISH-06 (community PR) | Manual — PR submitted with `Add plugin: LeetCode` title + checklist | manual (UAT) | Visual check of GitHub PR | ❌ Wave 5 |
| POLISH-07 (Run command) | Single `Run` command exists; Phase 3 Run commands removed | unit | `npx vitest run tests/solve/run-command-registration.test.ts` | ❌ Wave 0 |
| POLISH-07 (RunModal tabs) | Modal opens with tabs seeded from exampleTestcases on first open | unit | `npx vitest run tests/solve/RunModal.test.ts` | ❌ Wave 0 |
| POLISH-07 (ephemeral lifecycle) | Tab state wiped when last leaf showing slug closes | unit | `npx vitest run tests/solve/ephemeralTabStore.test.ts` | ❌ Wave 0 |
| POLISH-07 (Reset button) | Reset button re-seeds from exampleTestcases | unit | `npx vitest run tests/solve/RunModal.test.ts` | ❌ Wave 0 |
| POLISH-07 (single-active-tab Run) | Clicking Run sends only active tab's input (not concatenated) | unit | `npx vitest run tests/solve/RunModal.test.ts` | ❌ Wave 0 |
| POLISH-07 (legacy section ignored) | Plugin never reads/writes `## Custom Tests` after Phase 5 | integration | grep `writeCasesToVault\|readCasesFromVault` src/ → 0 hits | ❌ Wave 3 |
| D-11/D-12 (reading-mode buttons) | MarkdownPostProcessor appends buttons only on lc-slug notes | unit | `npx vitest run tests/graph/CodeBlockActionProcessor.test.ts` | ❌ Wave 0 |
| D-31 (SubmissionDetailModal MarkdownRenderer) | Uses MarkdownRenderer.render + Component lifecycle | unit | `npx vitest run tests/graph/SubmissionDetailModal.test.ts` (rewrite) | ✅ (rewrite) |
| D-29 (CE chip tint) | CSS `.leetcode-verdict-ce` uses orange token | visual (UAT) | Light/dark spot-check | — |
| D-30 (light-mode focus ring) | Picker rows have 2px accent outline on focus in light theme | visual (UAT) | Light/dark spot-check | — |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/{specific-area}` for the files touched by that commit (< 10 seconds)
- **Per wave merge:** `npm test -- --run` for all tests + `npm run lint` (< 2 minutes)
- **Phase gate:** `bash scripts/prerelease-check.sh` — must exit 0 with all 12 gates passing before opening the community-plugin PR
- **Pre-UAT gate:** `npm run build && npm test && bash scripts/prerelease-check.sh` must all be green before collecting the 4 README screenshots (D-28).

### Wave 0 Gaps

- [ ] `tests/settings/SettingsTab.knowledge-graph.test.ts` — covers POLISH-01 new controls (auto-backlink + tech folder override)
- [ ] `tests/api/throttle.rate-limit-retry.test.ts` — covers POLISH-02 D-18 429 single-retry
- [ ] `tests/api/throttle.timeout.test.ts` — covers POLISH-02 D-20 10s timeout + polling exemption
- [ ] `tests/shared/errors.isNetworkError.test.ts` — covers POLISH-02 D-19 helper
- [ ] `tests/notice-action.test.ts` — covers POLISH-02 D-21 session-expiry Notice action button
- [ ] `tests/solve/run-command-registration.test.ts` — covers POLISH-07 D-01 command set change
- [ ] `tests/solve/RunModal.test.ts` — covers POLISH-07 D-04..D-07 (tabs, reset, single-active Run)
- [ ] `tests/solve/ephemeralTabStore.test.ts` — covers POLISH-07 D-02 / D-09 lifecycle + reference count
- [ ] `tests/graph/CodeBlockActionProcessor.test.ts` — covers D-11..D-13 reading-mode MDP
- [ ] `tests/graph/SubmissionDetailModal.test.ts` — **REWRITE** (existing file) for D-31 MarkdownRenderer.render
- [ ] `tests/settings-store.test.ts` — **EXTEND** (existing file) for `techniquesFolderOverride` round-trip
- [ ] `scripts/prerelease-check.sh` — new script per D-27

**Framework install:** None required; vitest 4.1.5 already in devDependencies.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Cookie-based auth via embedded BrowserWindow (Phase 1); Phase 5 D-21 surfaces the re-auth affordance |
| V3 Session Management | yes | `LEETCODE_SESSION` + `csrftoken` stored in data.json only (CF-03, AUTH-06); session-expiry detection via GraphQL errors + 401/403 signals. Phase 5 adds no new session surface. |
| V4 Access Control | no | Plugin runs at user privilege in local Obsidian context; no multi-tenant surface |
| V5 Input Validation | yes | User-entered `techniquesFolderOverride` (D-15) flows through `sanitizeFolder` (rejects absolute paths + `..` traversal). User-entered test case input (D-03) is untrusted but is forwarded verbatim to LC's `/interpret_solution/` — no local interpretation, no template injection vector. |
| V6 Cryptography | no | No new crypto in Phase 5; existing cookie storage is plaintext in data.json per AUTH-06 (by design — Obsidian does not offer keychain access) |
| V7 Error Handling & Logging | yes | Phase 1 `logger.ts` redacts session artifacts (verified via `tests/logger-redact.test.ts`); Phase 5 adds no new log fields. Error Notices avoid leaking cookie values. |
| V8 Data Protection | yes | No telemetry (D-27 grep-gate); no analytics; no network calls to endpoints other than leetcode.com |
| V12 Files & Resources | yes | `techniquesFolderOverride` path sanitization (see V5) |
| V14 Configuration | yes | `isDesktopOnly: true` in manifest (CF-02); electron/node imports confined to `src/auth/BrowserWindowLogin.ts` per Phase 1 D-02 |

### Known Threat Patterns for {Obsidian plugin + LC auth stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious HTML in problem statement → XSS via innerHTML | Tampering/Elevation | `createEl()` discipline (CF-07); prerelease grep-gate `innerHTML\s*=` (D-27) |
| Cookie leakage through logger | Information Disclosure | `logger.redact` targets cookie fields (Phase 1); no Phase 5 call site bypasses |
| Session cookie exfiltration via plugin telemetry | Information Disclosure | Zero-telemetry policy (Developer Policies "Not allowed"); D-27 grep-gate for analytics/telemetry/mixpanel/gtag |
| Remote code execution via `eval`/`new Function` | Elevation | D-27 grep-gates both; Developer Policies block |
| Vault write outside configured folder via `techniquesFolderOverride` | Tampering | `sanitizeFolder` rejects `..` + absolute paths; same guard as `problemsFolder` (Phase 1 CF-08) |
| User-provided test case injected into LC POST body | Tampering | Forwarded as-is inside JSON `data_input` field — LC's API handles; plugin does not concatenate into URLs or shell |
| MarkdownPostProcessor injected into untrusted note | Tampering | Frontmatter gate (`lc-slug` required) — buttons never render on non-LC notes, so they never invoke commands on non-LC notes |
| Notice action callback captures stale closure | Elevation (low) | Notice lifecycle ends when `hide()` fires; captured `login` reference does not persist past dismiss |

## Sources

### Primary (HIGH confidence)

- **`/Users/moxu/projects/obsidian-leetcode/node_modules/obsidian/obsidian.d.ts`** (obsidian@1.12.3, locally installed — committed in `package.json` devDependencies transitively via `obsidian: "latest"`)
  - Line 406–482: `App` class surface (includes `app.commands`, `app.workspace`, `app.metadataCache`)
  - Line 1695–1824: `Command` interface — `checkCallback`, `editorCheckCallback`, `hotkeys?`
  - Line 1830–1908: `Component` class lifecycle — `load`, `unload`, `addChild`, `registerEvent`, `registerDomEvent`, `registerInterval`
  - Line 3462–3472: `ItemView.addAction(icon, title, callback)` — for clarity: this is the only `addAction` in the file, and it's on ItemView, NOT Notice
  - Line 3846–3891: `MarkdownPostProcessor` + `MarkdownPostProcessorContext` (`sourcePath`, `frontmatter`, `addChild`, `getSectionInfo`)
  - Line 3987–4014: `MarkdownRenderer` abstract class + `static render(app, md, el, sourcePath, component)` + deprecated `renderMarkdown`
  - Line 4272: `MetadataCache.getFileCache(file: TFile): CachedMetadata | null`
  - Line 4467–4504: **`Notice` class — full surface (no addAction method exists)**
  - Line 4839: `Plugin.registerMarkdownPostProcessor(processor, sortOrder?)`
  - Line 4848: `Plugin.registerMarkdownCodeBlockProcessor(language, handler, sortOrder?)`
  - Line 4941–4988: `PluginManifest` interface — required fields + `isDesktopOnly?: boolean`
  - Line 5270–5290: `requestUrl` + `RequestUrlParam` (no timeout field)
  - Line 5523–5660: `Setting` class — `setName`, `setDesc`, `setHeading()`, `addToggle`, `addText`, `addDropdown`, `addButton`
  - Line 6781–7169: `Workspace` class — events list (`file-open`, `active-leaf-change`, `layout-change`, `quick-preview`, etc. but **no `file-close`**); `getLeavesOfType`, `iterateAllLeaves`, `revealLeaf`

- **`obsidianmd/obsidian-developer-docs`** (raw markdown via `gh api repos/obsidianmd/obsidian-developer-docs/contents/...`):
  - `en/Developer policies.md` — "Not allowed" list (no client-side telemetry, no obfuscation, no dynamic ads, no plugin self-update), Disclosures, Copyright/Licensing, LICENSE required
  - `en/Plugins/Releasing/Plugin guidelines.md` — innerHTML ban, `setHeading` over `<h2>`, `registerEvent`/`addCommand` auto-cleanup, no default hotkeys, `getActiveViewOfType` over `activeLeaf`, `Vault.process` over `Vault.modify`, `FileManager.processFrontMatter`, hardcoded styling ban
  - `en/Plugins/Releasing/Submit your plugin.md` — Step 1-4 submission process, community-plugins.json entry shape, `id` can't contain `obsidian`, `version` must be semver `x.y.z`, PR naming `Add plugin: [...]`
  - `en/Plugins/Releasing/Submission requirements for plugins.md` — `isDesktopOnly: true` requirement for Node/Electron API use, description 250-char max + terminal period + sentence case, "Don't include the plugin ID in the command ID", `fundingUrl` only if financial support, remove sample code
  - `en/Plugins/Editor/Markdown post processing.md` — canonical `registerMarkdownPostProcessor` example
  - `en/Plugins/User interface/HTML elements.md` — `createEl` / `createDiv` / `createSpan` pattern
  - `en/Reference/Manifest.md` — authoritative manifest.json schema table

- **`obsidianmd/obsidian-releases`** (raw markdown via gh api):
  - `README.md` — `community-plugins.json` entry fields (`id`, `name`, `author`, `description`, `repo`), plugin pull flow (manifest + main.js + styles.css from GitHub release)
  - `plugin-review.md` — redirect-only file pointing to the Plugin guidelines page above

- **`/Users/moxu/projects/obsidian-leetcode/CLAUDE.md`** (committed project instructions) — Community Plugin Store Requirements section, Stack Patterns, Technology Stack

### Secondary (MEDIUM confidence)

- **npm registry** via `npm view X version` (run 2026-05-09): obsidian@1.12.3, turndown@7.2.4, esbuild@0.28.0 (upstream), vitest@4.1.5, typescript@6.0.3 (upstream), eslint-plugin-obsidianmd@0.2.9

### Tertiary (LOW confidence)

- **Community plugin examples in `community-plugins.json`** (partial list read): obsidian-git, hotkeysplus-obsidian, nldates-obsidian. Referenced for `executeCommandById` usage pattern recognition (A4). Not independently source-verified per plugin.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry + locked package.json
- Architecture patterns (Notice DocumentFragment, ephemeral store via layout-change, MarkdownPostProcessor frontmatter gate, Component lifecycle): HIGH — API signatures verified line-by-line from local obsidian.d.ts
- Pitfalls: HIGH for API-correctness pitfalls (1, 2, 3, 5, 13); MEDIUM for UX pitfalls (7, 11); HIGH for grep-gate false positive (12)
- Community-plugin submission process: HIGH — Submit your plugin docs + obsidian-releases README quoted verbatim
- Developer Policies: HIGH — fetched verbatim from raw markdown

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 for Obsidian API (Obsidian changelog is stable; 1.12.x line). Valid until: 2026-05-16 for npm versions (fast-moving upstream; re-verify if Phase 5 waves stretch past 1 week). Plugin guidelines are stable (changes require announcement); 2026-07-09 ok.
