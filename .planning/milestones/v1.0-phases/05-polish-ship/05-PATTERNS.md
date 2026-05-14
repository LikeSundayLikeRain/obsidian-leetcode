# Phase 5: Polish & Ship - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 22 (new + modified + deleted + tests + config)
**Analogs found:** 20 / 22 (2 first-of-kind: ephemeralTabStore, CodeBlockActionProcessor)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/solve/RunModal.ts` (new — replaces CustomTestModal) | modal | DOM + in-memory | `src/solve/CustomTestModal.ts` | exact |
| `src/solve/ephemeralTabStore.ts` (new) | store / lifecycle | in-memory + workspace-event | *(first-of-kind; weak analog = `src/graph/SubmissionHistoryStore.ts`)* | partial |
| `src/graph/CodeBlockActionProcessor.ts` (new) | postprocessor | DOM (reading-mode render) | *(first-of-kind; weak analog = none in this codebase)* | none |
| `src/solve/SessionExpiredNotice.ts` (new — DocumentFragment helper) | UI helper | DOM + callback | existing `new Notice(...)` call-sites in `src/main.ts` | role-match |
| `src/api/requestUrlFetcher.ts` (modify — add 429 retry + 10s timeout) | fetcher | network + throttle | **self** (existing `throttledRequestUrl`) | exact |
| `src/shared/errors.ts` (modify — add `isNetworkError`) | utility | pure | **self** (existing `SessionExpiredError`, `RateLimitError`) | exact |
| `src/settings/SettingsTab.ts` (modify — add Knowledge Graph section) | settings UI | settings-store | **self** (existing Authentication + Notes sections) | exact |
| `src/settings/SettingsStore.ts` (modify — `techniquesFolderOverride`) | store | settings persistence | **self** (existing `autoBacklinksEnabled` + `problemsFolder`) | exact |
| `src/graph/SubmissionDetailModal.ts` (rewrite — MarkdownRenderer.render + Component) | modal | DOM + vault-read | **self** (existing file; rewriting code-render path) | exact |
| `src/main.ts` (modify — delete 2 cmds, add 1 + MDP + event-wiring) | orchestrator | wiring | **self** (existing `addCommand` + `registerEvent`-ready shape) | exact |
| `styles.css` (modify — `.leetcode-code-actions` + CE + focus-ring + RunModal) | CSS | static | **self** (existing `.leetcode-custom-test`, `.leetcode-submissions-chip`) | exact |
| `manifest.json` (modify — version 0.1.0) | config | static | **self** (already `0.1.0`) | exact |
| `package.json` (modify — version 0.1.0) | config | static | **self** (already `0.1.0`) | exact |
| `versions.json` (modify — entry 0.1.0 → 1.10.0) | config | static | **self** (already has 0.1.0 key) | exact |
| `scripts/prerelease-check.sh` (new) | shell gate | filesystem + grep + exec | `scripts/grep-no-vault-modify.sh` | role-match |
| `LICENSE` (new) | doc | static | external (MIT boilerplate — no in-repo analog) | none |
| `README.md` (rewrite — 4 screenshots + usage) | doc | static | **self** (current skeleton) | partial |
| `tests/solve/RunModal.test.ts` (new) | test | unit | `tests/solve/customTestStore.test.ts` (pure helpers) + `tests/graph/SubmissionDetailModal.test.ts` (modal) | role-match |
| `tests/solve/ephemeralTabStore.test.ts` (new) | test | unit | `tests/settings-store.test.ts` (store round-trip pattern) | role-match |
| `tests/settings/SettingsTab.knowledge-graph.test.ts` (new) | test | unit | *(first — no existing SettingsTab test; closest is `tests/settings-store.test.ts`)* | partial |
| `tests/api/throttle.rate-limit-retry.test.ts` (new) | test | unit | `tests/solve/throttled-request-url.test.ts` | exact |
| `tests/api/throttle.timeout.test.ts` (new) | test | unit | `tests/solve/throttled-request-url.test.ts` | exact |
| `tests/shared/errors.isNetworkError.test.ts` (new) | test | unit | `tests/solve/errors.test.ts` | exact |
| `tests/notice-action.test.ts` (new) | test | unit | `tests/graph/SubmissionDetailModal.test.ts` (happy-dom DOM assertions) | role-match |
| `tests/solve/run-command-registration.test.ts` (new) | test | unit | *(no existing command-registration test; closest = `src/main.ts` `addCommand` shape)* | partial |
| `tests/graph/CodeBlockActionProcessor.test.ts` (new) | test | unit | `tests/graph/SubmissionDetailModal.test.ts` (happy-dom pattern) | role-match |
| `tests/graph/SubmissionDetailModal.test.ts` (rewrite — mock `MarkdownRenderer.render`) | test | unit | **self** (rewrite) | exact |
| `src/solve/customTestStore.ts` (DELETE — no remaining callers after D-01, D-08) | deletion | — | **self** | exact |
| `src/solve/CaseRegion.ts` (DELETE — caller-less after customTestStore removal; verify) | deletion | — | **self** | exact |

---

## Pattern Assignments

### `src/solve/RunModal.ts` (modal, DOM + in-memory) — NEW / renamed from CustomTestModal

**Analog:** `src/solve/CustomTestModal.ts` (near-exact match — rename and adapt)

**Imports pattern** (CustomTestModal.ts lines 21-23):
```typescript
import { Modal, type App, type TFile } from 'obsidian';
import { logger } from '../shared/logger';
// REMOVE (D-01, D-08): import { writeCasesToVault, type CustomTestCase } from './customTestStore';
// ADD: import { EphemeralTabStore, type TabState } from './ephemeralTabStore';
```

**Args shape pattern** (CustomTestModal.ts lines 25-35) — reshape to match D-02/D-09 store injection:
```typescript
// OLD — CustomTestModal args (REMOVE `file`, `initialCases`, persist-on-close)
export interface CustomTestModalArgs {
  file: TFile;
  initialCases: string[];
  initialActiveTab?: number;
  onRun: (input: string) => void;
}

// NEW — RunModal args (inject store; slug keys in-memory state)
export interface RunModalArgs {
  slug: string;
  exampleTestcases: string;       // cache-sourced seed (D-03)
  store: EphemeralTabStore;       // in-memory Map<slug, TabState[]>
  onRun: (input: string) => void; // single-tab-active input (D-07)
}
```

**Modal lifecycle pattern** (CustomTestModal.ts lines 61-118) — keep skeleton; remove persist-on-close:
```typescript
onOpen(): void {
  const { contentEl, titleEl } = this;
  clear(contentEl);
  addClass(contentEl, 'leetcode-custom-test');   // reuse existing CSS class — UI-SPEC carries it forward
  // D-10: also add the new `leetcode-run-modal` class for the footer-layout tweaks (UI-SPEC §2c)
  this.modalEl?.addClass('leetcode-run-modal');
  if (titleEl) titleEl.textContent = 'Run';      // D-07 locked label

  this.tabsEl = appendEl(contentEl, 'div', 'leetcode-custom-test-tabs');
  this.tabsEl.setAttribute('role', 'tablist');
  this.renderTabs();

  const textarea = appendEl(contentEl, 'textarea', 'leetcode-custom-test-textarea') as HTMLTextAreaElement;
  textarea.setAttribute('role', 'tabpanel');
  textarea.setAttribute('placeholder', 'Enter test input (one value per line)');
  textarea.value = this.cases[this.activeTab]?.input ?? '';
  textarea.addEventListener('input', () => {
    const c = this.cases[this.activeTab];
    if (c) c.input = textarea.value;
  });
  this.textareaEl = textarea;
  // ... footer with Reset + Run buttons (see below)
}

onClose(): void {
  // D-02: push in-memory tabs back to store (no vault write — store owns lifecycle).
  this.args.store.setTabs(this.args.slug, this.cases);
  clear(this.contentEl);
}
```

**Footer pattern** — replace lines 83-106 (Run-only footer) with Reset + Run split layout per UI-SPEC §2c:
```typescript
const footer = appendEl(contentEl, 'div', 'leetcode-custom-test-footer leetcode-run-modal-footer');

// D-05 — left-side Reset button (neutral, no mod-cta)
const resetBtn = appendEl(footer, 'button', 'leetcode-run-modal-reset');
resetBtn.textContent = 'Reset to sample cases';
resetBtn.addEventListener('click', () => {
  this.cases = this.args.store.resetToSamples(this.args.slug, this.args.exampleTestcases);
  this.activeTab = 0;
  this.textareaEl.value = this.cases[0]?.input ?? '';
  this.renderTabs();
});

// D-07 — right-side Run button (mod-cta)
const runBtn = appendEl(footer, 'button', 'leetcode-run-modal-run mod-cta');
runBtn.textContent = 'Run';
runBtn.addEventListener('click', () => {
  this.syncActiveFromTextarea();
  // D-07: SINGLE active-tab input, NOT joined — replaces CustomTestModal lines 90-93
  const input = this.cases[this.activeTab]?.input ?? '';
  this.args.store.setTabs(this.args.slug, this.cases);
  try { this.args.onRun(input); } finally { this.close(); }
});
```

**Tab rendering + delete-guard pattern** (CustomTestModal.ts lines 122-147) — keep nearly verbatim (D-06 single-tab-minimum already baked in):
```typescript
private renderTabs(): void {
  clear(this.tabsEl);
  this.cases.forEach((_, i) => {
    const tab = appendEl(this.tabsEl, 'button',
      'leetcode-custom-test-tab' + (i === this.activeTab ? ' is-active' : ''));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(i === this.activeTab));
    tab.textContent = `Case ${i + 1}`;
    tab.addEventListener('click', () => this.switchTab(i));
    if (this.cases.length > 1) {   // D-06: no × when only one tab
      const remove = appendEl(tab, 'span', 'leetcode-custom-test-tab-remove');
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeCase(i);
      });
    }
  });
  const addBtn = appendEl(this.tabsEl, 'button',
    'leetcode-custom-test-tab leetcode-custom-test-tab-add');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => this.addCase());
}
```

**DOM helper pattern** (CustomTestModal.ts lines 198-224) — copy verbatim (`clear`, `appendEl`, `addClass`); they already handle the happy-dom fallback the test suite needs.

---

### `src/solve/ephemeralTabStore.ts` (store, in-memory + workspace-event) — NEW

**Analog:** Partial — `src/graph/SubmissionHistoryStore.ts` is the nearest in-memory-only store. RESEARCH.md §Pattern 4 supplies the workspace-event lifecycle shape that is first-of-kind here.

**Constructor + registerEvent pattern** (from RESEARCH.md §Pattern 4, lines 382-397):
```typescript
import { MarkdownView, TFile, type Plugin } from 'obsidian';

export interface TabState { input: string; }

export class EphemeralTabStore {
  private readonly state = new Map<string, TabState[]>();
  private readonly lastKnownSlugs = new Set<string>();

  constructor(private readonly plugin: Plugin) {
    // registerEvent auto-detaches on plugin unload — same pattern main.ts uses for
    // setOnNoteOpen today (main.ts:171-175 style).
    plugin.registerEvent(
      plugin.app.workspace.on('layout-change', () => this.reconcile())
    );
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', () => this.reconcile())
    );
  }
  // ... getOrSeed / resetToSamples / setTabs / reconcile / dispose (RESEARCH §Pattern 4)
}
```

**Construction call-site pattern to add to main.ts** (mirrors the Phase 4 KnowledgeGraphWriter construction at main.ts:158-165):
```typescript
// NEW Step 5.8 — Phase 5 ephemeral tab store (D-09).
this.ephemeralTabs = new EphemeralTabStore(this);
```

**Non-analog note:** No existing src/ file registers a `workspace.on` event — main.ts uses `setOnNoteOpen` (a custom callback) and `registerInterval` but NOT `registerEvent`. This is the first `registerEvent` consumer in the codebase. Planner must import `registerEvent` via the `Plugin` instance.

---

### `src/graph/CodeBlockActionProcessor.ts` (postprocessor, DOM) — NEW

**Analog:** None in this codebase — no existing `registerMarkdownPostProcessor` call-site. RESEARCH.md §Pattern 2 is the definitive template.

**Registration call-site pattern** (from RESEARCH.md §Pattern 2, lines 270-306):
```typescript
// In main.ts, inside onload() — alongside the other register* calls in Step 6a:
import { registerCodeBlockActionProcessor } from './graph/CodeBlockActionProcessor';

registerCodeBlockActionProcessor(this);
```

**Processor body pattern** — use RESEARCH §Pattern 2 verbatim (D-11, D-12, D-13 locked):
```typescript
import type { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';

export function registerCodeBlockActionProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    const slug = cache?.frontmatter?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;   // D-12: frontmatter gate

    const codeBlocks = element.querySelectorAll('pre > code');
    codeBlocks.forEach((code) => {
      const pre = code.parentElement;
      if (!pre || pre.nextElementSibling?.classList.contains('leetcode-code-actions')) {
        return;    // Pitfall 3: idempotency guard — re-renders must not duplicate
      }
      const row = pre.createDiv({ cls: 'leetcode-code-actions' });
      const runBtn = row.createEl('button', { text: 'Run', cls: 'leetcode-code-action-run' });
      const submitBtn = row.createEl('button', { text: 'Submit', cls: 'leetcode-code-action-submit' });
      runBtn.addEventListener('click', () => {
        // Pitfall 14: command ID must be fully qualified `{manifest.id}:{id}`
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

**Warning signs — grep-gate candidates the planner should wire into prerelease-check.sh:**
- `grep -n "'file-close'" src/` → 0 matches (Pitfall 2)
- `grep -n "\.addAction(" src/` on Notice call-sites → 0 matches (Pitfall 1)

---

### `src/solve/SessionExpiredNotice.ts` (UI helper, DOM + callback) — NEW

**Analog:** Existing `new Notice(...)` call-sites across src/main.ts, src/notes/NoteWriter.ts, src/browse/ProblemBrowserView.ts (RESEARCH confirms `Notice.addAction` does NOT exist).

**Current (plain-string) Notice call-site pattern** (`src/main.ts:640` + `src/notes/NoteWriter.ts:227`):
```typescript
new Notice('LeetCode session expired. Log in again.', 8000);
```

**New DocumentFragment + mod-cta button pattern** (RESEARCH §Pattern 1, lines 232-247):
```typescript
import { Notice } from 'obsidian';

export function showSessionExpiredNotice(login: () => void): void {
  const frag = document.createDocumentFragment();
  frag.createEl('span', {
    text: 'LeetCode session expired. Log in again.',   // CF-04 LOCKED copy unchanged
  });
  frag.createEl('span', { text: ' ' });
  const btn = frag.createEl('button', {
    cls: 'leetcode-notice-action mod-cta',
    text: 'Log in',
  });
  const notice = new Notice(frag, 0);    // 0 = sticky (Pitfall 7 — do not auto-dismiss)
  btn.addEventListener('click', () => {
    notice.hide();
    void login();
  });
}
```

**Migration scope — replace 5 call-sites** (from the Notice grep above):
- `src/main.ts:640, 685, 784, 793`
- `src/notes/NoteWriter.ts:227, 436`
- `src/solve/submissionOrchestrator.ts:186, 225`
- `src/browse/ProblemBrowserView.ts:196`
- `src/graph/SubmissionPickerModal.ts:365`

All become: `showSessionExpiredNotice(() => this.auth.login());` — planner wires the `login` callback via the plugin instance's `auth` field.

---

### `src/api/requestUrlFetcher.ts` (fetcher, network + throttle) — MODIFY

**Analog:** **Self** (existing `throttledRequestUrl` at lines 115-136 — D-18/D-20 extensions go inside it).

**Existing imports** (lines 16-27):
```typescript
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import { Throttle } from './throttle';
import { RateLimitError } from '../shared/errors';
```

**Existing 429-throw site to wrap with single-retry** (lines 125-131):
```typescript
// Current: throws RateLimitError on 429
if (res.status === 429) {
  const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
  const retryMs = retryAfter
    ? (Number.isFinite(+retryAfter) ? +retryAfter * 1000 : 10_000)
    : 10_000;
  throw new RateLimitError(retryMs);
}
```

**D-18 single-retry extension pattern** (RESEARCH §Pattern 6, lines 536-575) — wrap the raw-request part:
```typescript
const RATE_LIMIT_RETRY_MS = 5000;

async function doRequestWith429Retry(params: RequestUrlParam): Promise<RequestUrlResponse> {
  try { return await doRawRequest(params); }
  catch (err) {
    if (err instanceof RateLimitError) {
      await delay(RATE_LIMIT_RETRY_MS);
      return await doRawRequest(params); // second failure re-throws to caller → existing Notice
    }
    throw err;
  }
}
```

**D-20 10s timeout pattern** (RESEARCH §Pattern 5, lines 490-525) — wrap the retry layer:
```typescript
export async function throttledRequestUrl(
  params: RequestUrlParam,
  opts: { timeoutMs?: number } = {},
): Promise<RequestUrlResponse> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const throttle = activeThrottle;
  if (!throttle) throw new Error('throttledRequestUrl: fetcher not installed');
  await throttle.acquire();
  try {
    return await raceWithTimeout(doRequestWith429Retry(params), timeoutMs);
  } finally {
    throttle.release();
  }
}
```

**Pitfall 13 carve-out:** Polling-orchestrator requests must pass `{ timeoutMs: 20_000 }` (or skip the wrapper) so individual poll-step requests don't contend with the outer 30s wall-clock cap. Planner edits `src/solve/pollingOrchestrator.ts` to supply the opt.

---

### `src/shared/errors.ts` (utility, pure) — MODIFY

**Analog:** **Self** — existing error class pattern.

**Existing pattern** (lines 1-20):
```typescript
export class SessionExpiredError extends Error {
  constructor(msg = 'LeetCode session expired') {
    super(msg);
    this.name = 'SessionExpiredError';
  }
}
```

**D-19 extension — add `isNetworkError` helper** (RESEARCH §Example 2, lines 800-818):
```typescript
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
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

---

### `src/settings/SettingsTab.ts` (settings UI, settings-store) — MODIFY

**Analog:** **Self** — current `display()` already has Authentication + Notes sections; add a Knowledge Graph section mirroring the same pattern.

**Existing section-heading pattern** (line 36, 131):
```typescript
new Setting(containerEl).setName('Authentication').setHeading();
// ...
new Setting(containerEl).setName('Notes').setHeading();
```

**Existing text-field pattern** (lines 133-144 — use as template for `techniquesFolderOverride`):
```typescript
new Setting(containerEl)
  .setName('Problems folder')
  .setDesc('Vault folder where problem notes are created.')
  .addText((t) => t
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper-noun brand
    .setPlaceholder('LeetCode/')
    .setValue(this.plugin.settings.getProblemsFolder())
    .onChange(async (v) => {
      await this.plugin.settings.setProblemsFolder(v.replace(/\/+$/, ''));
    }),
  );
```

**D-14/D-15/D-16 additions pattern** (RESEARCH §Example 1, lines 743-764) — append after the Notes section:
```typescript
// =============================
//   Knowledge Graph section (D-14)
// =============================
new Setting(containerEl).setName('Knowledge Graph').setHeading();

// D-15 — technique folder override (derived default visible as placeholder)
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

// D-16 — auto-backlink toggle (copy LOCKED verbatim)
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

**Accent-gate invariant (preserve):** The existing grep-gate comment on line 8 ("Grep gate: exactly one invocation of the accent modifier in this file") STAYS TRUE — the Knowledge Graph section adds zero `.setCta()` calls (D-13/UI-SPEC §Color).

---

### `src/settings/SettingsStore.ts` (store, settings persistence) — MODIFY

**Analog:** **Self** — `autoBacklinksEnabled` and `problemsFolder` are the exact templates for `techniquesFolderOverride`.

**PluginData field + DEFAULT_DATA** (lines 71 + 90-102):
```typescript
// Add to PluginData interface:
techniquesFolderOverride: string;  // '' = use derived default (D-15)

// Add to DEFAULT_DATA:
techniquesFolderOverride: '',
```

**Shape guard pattern** (lines 268-272 — mirror `autoBacklinksEnabled` guard):
```typescript
// Add inside SettingsStore.load() data-assembly block:
techniquesFolderOverride: typeof raw.techniquesFolderOverride === 'string'
  ? raw.techniquesFolderOverride.trim().replace(/[\\/]+$/, '')
  : DEFAULT_DATA.techniquesFolderOverride,
```

**Getter/setter pattern** (lines 343-350 — mirror `get/setAutoBacklinksEnabled`):
```typescript
getTechniquesFolderOverride(): string { return this.data.techniquesFolderOverride; }
async setTechniquesFolderOverride(v: string): Promise<void> {
  this.data.techniquesFolderOverride = v;
  await this.persist();
}
```

**`getTechniquesFolder()` rewrite** (lines 358-360 — current form returns derived):
```typescript
// BEFORE (Phase 4)
getTechniquesFolder(): string {
  return `${this.getProblemsFolder()}/Techniques`;
}

// AFTER (Phase 5 D-15)
getTechniquesFolder(): string {
  const override = this.data.techniquesFolderOverride;
  return override && override.length > 0
    ? override
    : `${this.getProblemsFolder()}/Techniques`;
}
```

---

### `src/graph/SubmissionDetailModal.ts` (modal, DOM + vault-read) — REWRITE (D-31)

**Analog:** **Self** — the rewrite swaps the `<pre><code>` approach at lines 103-106 for `MarkdownRenderer.render` + Component lifecycle.

**Current `<pre><code>` render** (lines 99-106 — to DELETE):
```typescript
const pre = appendEl(this.contentEl, 'pre', 'leetcode-submissions-code');
const code = appendEl(pre, 'code', `language-${this.deps.lang || 'text'}`);
setText(code, this.deps.code);
```

**New MarkdownRenderer.render + Component pattern** (RESEARCH §Pattern 3, lines 320-344):
```typescript
import { Modal, Component, MarkdownRenderer, type App, type TFile } from 'obsidian';

export class SubmissionDetailModal extends Modal {
  private readonly component = new Component();  // NEW — Pitfall 6

  async onOpen(): Promise<void> {
    this.component.load();    // MUST load before render (Pitfall 6)
    this.ensureDomContainers();
    addClass(this.contentEl, 'leetcode-submissions');
    addClass(this.contentEl, 'leetcode-submissions-detail');
    await this.render();      // render() becomes async
  }

  onClose(): void {
    this.component.unload();  // NEW — disposes CM6 child components
    clear(this.contentEl);
  }

  private async render(): Promise<void> {
    // ... title + metadata (unchanged, lines 77-97) ...
    const codeContainer = appendEl(this.contentEl, 'div', 'leetcode-submissions-code');
    const fenced = '```' + (this.deps.lang || 'text') + '\n' + this.deps.code + '\n```\n';
    await MarkdownRenderer.render(
      this.app, fenced, codeContainer, this.deps.file.path, this.component,
    );
    // ... footer (unchanged, lines 108-131) ...
  }
}
```

**Test file update** (`tests/graph/SubmissionDetailModal.test.ts`):
```typescript
// ADD: mock MarkdownRenderer.render to avoid loading CM6 in happy-dom
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('obsidian')>('obsidian');
  return {
    ...actual,
    MarkdownRenderer: {
      render: vi.fn(() => Promise.resolve()),
    },
    Component: class { load() {} unload() {} addChild() {} },
  };
});

// REMOVE: assertions that `<pre><code class="language-*">` exists in the DOM.
// ADD: assertion that MarkdownRenderer.render was called with (app, fenced, el, sourcePath, component).
```

---

### `src/main.ts` (orchestrator, wiring) — MODIFY

**Analog:** **Self** — existing `addCommand` blocks (lines 193-340) + `notes.setOnNoteOpen` pattern (lines 171-175).

**D-01 command delete pattern** — delete the `addCommand` blocks at:
- `id: 'run-sample'` (lines 239-250)
- `id: 'run-custom'` (lines 256-267)

Also delete the supporting helpers they call:
- `runSampleFromActive()` (lines 609-619)
- `openCustomTestModalFromActive()` (lines 705-716)
- `openCustomTestModalWithSeeded()` (lines 721-740)
- imports: `CustomTestModal` (line 36), `readCasesFromVault` (line 37)

**D-01 new command add pattern** — use the shape of existing `view-past-submissions` (lines 308-320) as template:
```typescript
this.addCommand({
  id: 'run',
  name: 'Run',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.runFromActive(); }
    return true;
  },
});
```

**D-09 store construction pattern** — insert alongside Step 5.7 (after the `KnowledgeGraphWriter` block at lines 158-165):
```typescript
// Step 5.8 — Phase 5 ephemeral tab store (D-09).
this.ephemeralTabs = new EphemeralTabStore(this);
```

**D-11 MDP registration** — insert in Step 6 (anywhere after `addSettingTab`):
```typescript
// Step 6e — Phase 5 reading-mode Run/Submit buttons below fenced code blocks (D-11).
registerCodeBlockActionProcessor(this);
```

**D-19/D-20/D-22 error-routing pattern** — in every existing `catch (err)` branch of `submitFromActive` + new `runFromActive`, add branches BEFORE the existing `RateLimitError` branch (lines 590-593):
```typescript
} else if (isNetworkError(err)) {
  new Notice("Couldn't reach LeetCode. Check your connection.", 8000);    // D-19 LOCKED
  try { modal.close(); } catch { /* headless */ }
} else if ((err as Error).name === 'TimeoutError') {
  new Notice('LeetCode is slow to respond. Try again.', 8000);             // D-20 LOCKED
  try { modal.close(); } catch { /* headless */ }
} else if (err instanceof RateLimitError) {
  // EXISTING branch — replace inline string with the D-18 locked copy:
  new Notice('LeetCode is rate limiting us. Try again in a moment.', 8000);
  try { modal.close(); } catch { /* headless */ }
}
```

**D-21 session-expired Notice upgrade** — at every call-site that currently fires `new Notice('LeetCode session expired. Log in again.', 8000)` (five sites per the grep earlier), replace with:
```typescript
showSessionExpiredNotice(() => { void this.auth.login(); });
```

---

### `styles.css` (CSS, static) — MODIFY

**Analog:** **Self** — existing `.leetcode-custom-test` + `.leetcode-submissions-chip` rules.

**D-13 `.leetcode-code-actions` addition pattern** (UI-SPEC §3, lines 270-294) — append after existing `.leetcode-custom-test-*` block:
```css
.leetcode-code-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 8px;
}
.leetcode-code-actions .leetcode-code-action-run,
.leetcode-code-actions .leetcode-code-action-submit {
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  transition: background 100ms ease, color 100ms ease;
}
.leetcode-code-actions .leetcode-code-action-run:hover,
.leetcode-code-actions .leetcode-code-action-submit:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
```

**D-29 CE chip fix pattern** (UI-SPEC §6) — append AFTER the existing grouped `--wa/--tle/.../--ce` rule at `styles.css:749-757`:
```css
/* D-29: CE verdict chip — orange (overrides the shared error rule above) */
.leetcode-submissions .leetcode-submissions-chip--ce {
  background: color-mix(in srgb, var(--background-secondary) 80%, var(--color-orange, #e67e22) 20%);
  color: var(--color-orange, #e67e22);
}
```

**D-30 focus-ring pattern** (UI-SPEC §7) — replace the existing `:hover, :focus` rule at `styles.css:726-730`:
```css
/* BEFORE: shared :hover,:focus rule with outline: none */
.leetcode-submissions-picker .leetcode-submissions-row:hover,
.leetcode-submissions-picker .leetcode-submissions-row:focus {
  background: var(--background-modifier-hover);
  outline: none;
}

/* AFTER: split :hover and :focus; :focus gets strong accent outline */
.leetcode-submissions-picker .leetcode-submissions-row:hover {
  background: var(--background-modifier-hover);
}
.leetcode-submissions-picker .leetcode-submissions-row:focus {
  background: var(--background-modifier-hover);
  outline: 2px solid var(--interactive-accent);
  outline-offset: -2px;
}
```

**D-10 RunModal footer pattern** (UI-SPEC §CSS Additions Summary):
```css
.leetcode-run-modal .leetcode-run-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  gap: 8px;
}
```

---

### `manifest.json`, `package.json`, `versions.json` (config, static) — MODIFY

**Current state (verified by Read):** All three already declare `0.1.0`. Phase 5 D-23 says "bump to 0.1.0 (initial public)" — the bump is already landed. Planner task is to **verify consistency** + ensure `versions.json` maps `0.1.0 → 1.10.0` (currently `1.5.0` — mismatch with `manifest.json minAppVersion: 1.10.0`).

**versions.json fix pattern:**
```json
// CURRENT (mismatch)
{ "0.1.0": "1.5.0" }

// REQUIRED (per D-23)
{ "0.1.0": "1.10.0" }
```

---

### `scripts/prerelease-check.sh` (shell gate) — NEW

**Analog:** `scripts/grep-no-vault-modify.sh` (role-match — same grep + exit-code pattern).

**Existing shell script pattern** (grep-no-vault-modify.sh lines 1-20) — note `set -euo pipefail`, grep with `--include='*.ts'`, `exit 1` on match:
```bash
#!/usr/bin/env bash
set -euo pipefail
matches=0
for d in src/notes/ src/browse/; do
  if [ -d "$d" ]; then
    if grep -rE "vault\.modify\s*\(" "$d" --include='*.ts'; then
      matches=1
    fi
  fi
done
if [ "$matches" -eq 1 ]; then
  echo "ERROR: ..."
  exit 1
fi
```

**Full prerelease-check.sh script** — use RESEARCH.md §Example 3 verbatim (lines 823-927). Key gates:
1. No `innerHTML\s*=` assignment (Pitfall 12 anchored pattern)
2. No `\bfetch\s*\(` call (word-boundary to avoid false positives)
3. No `\beval\s*\(` / `new Function\s*\(`
4. No telemetry strings
5. No `vault\.modify\s*\(` in graph/ + main.ts (CF-06 extend)
6. manifest.json validity (jq with python3 fallback)
7. version triple-consistency (manifest = package = versions-latest)
8. LICENSE present + non-empty
9. README has `leetcode.com` + 4+ image links
10. `npm run lint` exit 0
11. `npm test -- --run` exit 0
12. main.js ≤ 200 kB

**chmod gate:** Planner must `chmod +x scripts/prerelease-check.sh` after creation (the existing grep-no-vault-modify.sh is already +x — mirror that).

---

### `LICENSE` (doc, static) — NEW

**Analog:** None in repo. MIT text from `choosealicense.com/licenses/mit/` — D-26 LOCKED.

**Copyright-holder line** (D-26 + Pitfall 9): derive from `manifest.json` author:
```
Copyright (c) 2026 moxu
```

---

### `README.md` (doc, static) — REWRITE

**Analog:** **Self** (current 8-line skeleton).

**Sections to add** (D-25 ordered list, verbatim):
1. What it is (1-paragraph pitch)
2. Features (bulleted)
3. Install (from store after submission; manual from release assets before)
4. Usage walkthrough
5. Screenshots (inline with usage — 4 per D-24)
6. Network disclosure (verbatim locked copy: `This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.`)
7. Configuration
8. Troubleshooting
9. License
10. Contributing

**Current network-disclosure-ish line at README.md:5** — already present but paraphrased. Planner replaces with D-25 verbatim copy.

**Screenshot paths** (Pitfall 11): store under `docs/` with relative paths so GitHub + Obsidian plugin browser both render correctly.

---

### Test files

All test files live under `tests/` (flat layout for root tests, subfolder for domain tests).

#### `tests/solve/RunModal.test.ts` (new)

**Analog:** `tests/graph/SubmissionDetailModal.test.ts` (happy-dom modal pattern) + `tests/solve/customTestStore.test.ts` (for the tab-round-trip semantics).

**Import + mock-vault pattern** (SubmissionDetailModal.test.ts lines 7-12):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { RunModal } from '../../src/solve/RunModal';
```

**Key assertions (per POLISH-07 test map):**
- Modal opens with tabs seeded from `exampleTestcases` on first open
- Reset button re-seeds from `exampleTestcases`
- Clicking Run sends ONLY active tab input (not concatenated) — D-07
- No `writeCasesToVault` call fires on modal close (D-08)

#### `tests/solve/ephemeralTabStore.test.ts` (new)

**Analog:** `tests/settings-store.test.ts` (store round-trip pattern; lines 2-4 `makeMockPlugin` helper is the shape to mirror for `makeMockPlugin`-with-workspace).

**Key assertions:** leaf-count goes to zero → slug state wiped; leaf reopens → getOrSeed re-seeds; setTabs round-trips; popout leaves count via `getLeavesOfType('markdown')`.

#### `tests/api/throttle.rate-limit-retry.test.ts` + `throttle.timeout.test.ts` (new)

**Analog:** `tests/solve/throttled-request-url.test.ts` (exact match — same `vi.mock('obsidian', { requestUrl })` shape + fake response pattern).

**Exact pattern to replicate** (throttled-request-url.test.ts lines 6-17):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const requestUrlMock = vi.fn();
vi.mock('obsidian', () => ({
  requestUrl: (params: unknown) => requestUrlMock(params),
}));
// beforeEach: requestUrlMock.mockReset(); vi.resetModules();
// Then inside the test: `const { throttledRequestUrl } = await import('../../src/api/requestUrlFetcher');`
```

**D-18 test (rate-limit-retry):** first call returns 429 → assert `setTimeout(5000)` fires via `vi.useFakeTimers()` + `vi.advanceTimersByTime(5000)` → second call resolves.

**D-20 test (timeout):** first call never resolves → advance timers by 10_000 → assertion that the promise rejects with `TimeoutError`.

#### `tests/shared/errors.isNetworkError.test.ts` (new)

**Analog:** `tests/solve/errors.test.ts` (already tests existing error classes).

**Pattern:** plain Vitest — no mocks. Assert each of the 9 ERR_* tokens returns `true`; non-Error + irrelevant strings return `false`.

#### `tests/graph/SubmissionDetailModal.test.ts` (rewrite for D-31)

**Analog:** **Self** (already exists; rewrite mocks).

**Replace existing module-level imports** (lines 7-11) with the `MarkdownRenderer` mock from the D-31 pattern above. Remove `<pre><code>` DOM assertions; add `expect(MarkdownRenderer.render).toHaveBeenCalledWith(app, fenced, el, sourcePath, componentInstance)`.

#### `tests/notice-action.test.ts` (new)

**Analog:** `tests/graph/SubmissionDetailModal.test.ts` (DOM assertions in happy-dom).

**Key assertion:** `showSessionExpiredNotice(login)` creates a Notice whose `messageEl` contains a `<button class="leetcode-notice-action mod-cta">Log in</button>`; clicking it calls the `login` callback and calls `notice.hide()`.

#### `tests/graph/CodeBlockActionProcessor.test.ts` (new)

**Analog:** `tests/graph/SubmissionDetailModal.test.ts` (DOM + frontmatter gate).

**Key assertions:**
- Processor no-ops on notes without `lc-slug` frontmatter (D-12)
- Appends `<div class="leetcode-code-actions">` after `<pre>` with Run + Submit buttons (D-13)
- Idempotent: running processor twice does not duplicate the div (Pitfall 3)
- Click handler calls `app.commands.executeCommandById('leetcode:run')` / `'leetcode:submit'` (Pitfall 14)

#### `tests/solve/run-command-registration.test.ts` (new)

**Analog:** No existing test asserts command registration. Closest: the shape of `src/main.ts addCommand` blocks (e.g., lines 239-250).

**Key assertions:** After `plugin.onload()`, `addCommand` was called with `id: 'run'` exactly once; `id: 'run-sample'` / `id: 'run-custom'` were NOT called (D-01 delete).

#### `tests/settings-store.test.ts` (extend, existing)

**Analog:** **Self** — extend the existing `Phase 4 backward-compat` describe block at line 154 with new cases for `techniquesFolderOverride`:
- Defaults to `''` when absent from data.json
- Rejects non-string → fallback `''`
- Round-trip: setter persists; `getTechniquesFolder()` returns override when non-empty, derived when empty
- Path-traversal rejection (same posture as `sanitizeFolder`)

#### `tests/settings/SettingsTab.knowledge-graph.test.ts` (new)

**Analog:** Partial — no existing SettingsTab render test. Closest pattern is `tests/settings-store.test.ts`'s `makeMockPlugin` helper.

**Key assertions:** After `tab.display()` runs against a happy-dom container, the container has a heading element with text `Knowledge Graph`, a text input bound to `techniquesFolderOverride`, and a toggle bound to `autoBacklinksEnabled`.

---

## Shared Patterns

### Pattern: `createEl` / `createDiv` / `createSpan` DOM discipline (CF-07)

**Source:** Every DOM-building file in src/ (CustomTestModal.ts, SubmissionDetailModal.ts, SettingsTab.ts).

**Apply to:** All Phase 5 DOM construction — `RunModal`, `CodeBlockActionProcessor`, `SessionExpiredNotice`, SettingsTab additions.

**Excerpt** (CustomTestModal.ts lines 208-214):
```typescript
function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const doc = parent.ownerDocument ?? (globalThis as { document?: Document }).document;
  const el = (doc ?? document).createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}
```

**NEVER:** `el.innerHTML = ...` / `insertAdjacentHTML(...)` / `outerHTML`. Prerelease-check.sh greps assignment-form `innerHTML\s*=`.

### Pattern: Notice sentence-case + terminal period (CF-19)

**Source:** Every `new Notice(...)` call-site (see grep above — 40+ call-sites across src/).

**Apply to:** All 4 Phase 5 new Notices (D-18, D-19, D-20, D-21 copy unchanged).

**Locked copy table:**
| Trigger | Copy | Duration |
|---------|------|----------|
| 429 rate-limited (after retry) | `LeetCode is rate limiting us. Try again in a moment.` | 8000 |
| Network failure | `Couldn't reach LeetCode. Check your connection.` | 8000 |
| 10s timeout | `LeetCode is slow to respond. Try again.` | 8000 |
| Session expired | `LeetCode session expired. Log in again.` + `Log in` action | 0 (sticky) |

**eslint-disable marker** (for `LeetCode` proper-noun cases — from SettingsTab.ts line 56):
```typescript
// eslint-disable-next-line obsidianmd/ui/sentence-case -- proper-noun brand name
```

### Pattern: `registerEvent` auto-cleanup

**Source:** None in src/ yet — first-of-kind (planner MUST introduce).

**Apply to:** `EphemeralTabStore` constructor — wrap BOTH `workspace.on('layout-change', ...)` and `workspace.on('active-leaf-change', ...)` in `plugin.registerEvent(...)` so unsubscribe fires on plugin unload. RESEARCH §Pattern 4 has the full example.

### Pattern: `vault.process` + `processFrontMatter` only (CF-06)

**Source:** `src/solve/customTestStore.ts:72` + `src/notes/NoteWriter.ts` + `src/graph/copyToCode.ts`.

**Apply to:** Phase 5 adds ZERO vault writes (D-02/D-08 — no write to `## Custom Tests`; no new note-write surfaces). The existing `vault.modify` grep-gate stays at 0 hits in `src/notes/` + `src/browse/`; prerelease-check.sh extends the gate to `src/graph/` + `src/main.ts`.

### Pattern: `getActiveViewOfType(MarkdownView)` for active-file lookup

**Source:** `src/main.ts:441` + every Phase 3/4 editorCheckCallback.

**Excerpt** (main.ts lines 440-455):
```typescript
private getActiveProblemContext(): ProblemContext | null {
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.file) return null;
  const file = view.file;
  const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
  const slug = fm?.['lc-slug'];
  if (!isValidSlug(slug)) return null;
  return { view, file, slug, title: /* ... */, currentBody: () => view.editor.getValue() };
}
```

**Apply to:** The new `runFromActive()` helper in main.ts + `CodeBlockActionProcessor`'s frontmatter gate (which uses `getFileCache` since MDP doesn't have a `MarkdownView`).

### Pattern: `editorCheckCallback` with `lc-slug` gate

**Source:** `src/main.ts` — 5 existing commands (lines 216-320).

**Excerpt** (main.ts lines 239-250):
```typescript
this.addCommand({
  id: 'run-sample',
  name: 'Run code (sample)',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.runSampleFromActive(); }
    return true;
  },
});
```

**Apply to:** The new `id: 'run'` command — mirror shape exactly.

### Pattern: Vitest happy-dom modal testing

**Source:** `tests/graph/SubmissionDetailModal.test.ts` + `tests/helpers/mock-vault.ts`.

**Excerpt** (SubmissionDetailModal.test.ts lines 7-39):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { SubmissionDetailModal } from '../../src/graph/SubmissionDetailModal';

const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
const modal = new SubmissionDetailModal(m.app as never, { ... });
await (modal as unknown as { performCopy(): Promise<void> }).performCopy();
```

**Apply to:** RunModal, CodeBlockActionProcessor, SessionExpiredNotice tests.

### Pattern: Vitest module-level `vi.mock('obsidian', ...)` for `requestUrl`

**Source:** `tests/solve/throttled-request-url.test.ts` (lines 9-13).

**Apply to:** `throttle.rate-limit-retry.test.ts`, `throttle.timeout.test.ts`. Full pattern already shown in test-file section above.

---

## No Analog Found

Files with no close match in the codebase (planner uses RESEARCH.md patterns):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/solve/ephemeralTabStore.ts` | store + event-lifecycle | in-memory + workspace-event | No existing module uses `plugin.registerEvent` with workspace events. `SubmissionHistoryStore` is in-memory but has no lifecycle listener — weak analog only. Planner must follow RESEARCH §Pattern 4 verbatim. |
| `src/graph/CodeBlockActionProcessor.ts` | postprocessor | reading-mode DOM decoration | No existing `registerMarkdownPostProcessor` call-site. RESEARCH §Pattern 2 is the only source of truth. |
| `LICENSE` | doc | static | External boilerplate — MIT text from `choosealicense.com/licenses/mit/` per D-26. |

---

## Metadata

**Analog search scope:** `src/solve/`, `src/settings/`, `src/graph/`, `src/api/`, `src/shared/`, `src/notes/`, `src/main.ts`, `tests/` (all subdirectories), `scripts/`, repo root config.

**Files scanned:** ~55 source files + ~40 test files + 4 config files.

**Key findings:**
1. **Strong analog coverage (20/22).** Most Phase 5 files either extend or mirror an existing module exactly. The "rewrite" category (CustomTestModal → RunModal, SubmissionDetailModal D-31 upgrade) benefits from keeping 80%+ of the original code.
2. **Three critical API corrections from RESEARCH dictate implementation shape:** `Notice.addAction` does not exist (DocumentFragment path), `workspace.on('file-close')` does not exist (layout-change + ref-count path), `RequestUrlParam.timeout` does not exist (Promise.race path). All three patterns are first-of-kind in this codebase.
3. **Two first-of-kind surfaces** that deserve extra planner attention: `EphemeralTabStore` (first `registerEvent` consumer) and `CodeBlockActionProcessor` (first `registerMarkdownPostProcessor`).
4. **Versions.json version-bump mismatch** (0.1.0 → 1.5.0) must be corrected to 1.10.0 per D-23 + `manifest.json minAppVersion`.

**Pattern extraction date:** 2026-05-09
