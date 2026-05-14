# Phase 3: Run & Submit - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 19 new + 5 modified source files, 10+ new test files
**Analogs found:** 19 / 19 source files have a strong or role-match analog in Phases 1–2

## Summary

`src/solve/` is greenfield but every new file has a direct Phase 1/2 analog. The dominant patterns to replicate verbatim:

1. **HTTP:** every request goes through `installRequestUrlFetcher`-patched `requestUrl` + the single `Throttle` instance. `src/solve/leetcodeRest.ts` MUST piggyback on this, not build a second pipe. See `src/api/requestUrlFetcher.ts:38-68`.
2. **Modals:** `FilterModal` (`src/browse/FilterModal.ts`) is the dominant Modal analog — class extends `Modal`, `createEl()`-only DOM, `addClass('lc-…')` scoping, popover-on-click pattern. `CookiePasteModal` is the small-form analog.
3. **String transforms:** `rewriteProblemSection` (`src/notes/HeadingRegion.ts`) is the template for pure, `vault.process`-safe string transforms. `## Code` retrofit and `## Custom Tests` nested parser mirror it exactly.
4. **Cache schema:** `DetailCacheEntry` in `src/settings/SettingsStore.ts:16-26` already ships with `codeSnippets` and `exampleTestcases` — Phase 3 only adds `internalQuestionId?: string` via the same shape-guard pattern.
5. **Orchestration:** `NoteWriter` (`src/notes/NoteWriter.ts`) is THE orchestrator template — structural-client constructor DI, `isSessionExpired` reuse, `Notice` copy verbatim from UI-SPEC, silent-vs-surfaced-error split (`backgroundRefresh` vs `forceRefresh`). `SubmissionOrchestrator` is `NoteWriter` with a polling loop.
6. **Tests:** every test file uses the `vi.mock('obsidian', …)` + `makeMockVaultApp` + `makeMockLeetCodeClient` trio. Timers tested via `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(ms)`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/solve/leetcodeRest.ts` | REST client (hand-rolled, non-GraphQL) | request-response | `src/api/requestUrlFetcher.ts` + `src/api/LeetCodeClient.ts` | role-match (adapts GraphQL-only analog to REST) |
| `src/solve/SubmissionOrchestrator.ts` | orchestrator (singleton, single-flight) | event-driven polling | `src/notes/NoteWriter.ts` | role-match (adds polling + single-flight) |
| `src/solve/VerdictModal.ts` | modal (8 states, mutable body/footer) | state-machine UI | `src/browse/FilterModal.ts` | role-match (larger, more states) |
| `src/solve/CustomTestModal.ts` | modal (tabbed input + persistence) | state-machine UI | `src/browse/FilterModal.ts` | exact (tabs = variant of rules, popover pattern reused) |
| `src/solve/codeExtractor.ts` | pure string transform (parser) | transform | `src/notes/HeadingRegion.ts` (pure transform shape) | exact |
| `src/solve/languages.ts` | lookup table (SSoT) | lookup | `src/notes/NoteTemplate.ts` PLUGIN_LC_KEYS/LC_STATUS_VALUES | exact |
| `src/solve/CaseRegion.ts` | nested heading parser | transform | `src/notes/HeadingRegion.ts` | exact (extended for nested `###`) |
| `src/solve/starterCodeInjector.ts` | vault-write helper | transform | `src/notes/HeadingRegion.ts` + `NoteWriter.backgroundRefresh` | exact |
| `src/solve/types.ts` | barrel/types | — | `src/notes/types.ts` | exact |
| `src/notes/NoteTemplate.ts` (modify) | schema SSoT | — | self (extend PLUGIN headings) | exact |
| `src/notes/NoteWriter.ts` (modify) | orchestrator (retrofit hook) | — | self (extend open-path) | exact |
| `src/settings/SettingsStore.ts` (modify) | data.json wrapper | — | self (extend DetailCacheEntry) | exact |
| `src/api/throttle.ts` (modify) | throttle (expose raw helper) | — | self + `requestUrlFetcher.ts` shim shape | exact |
| `src/main.ts` (modify) | plugin entry (register commands) | — | self (mirror Step 6c command registration) | exact |
| `styles.css` (modify) | CSS (verdict + custom-test classes) | — | self (`.leetcode-browser .lc-…` namespace) | exact |
| `tests/solve/submission-orchestrator-*.test.ts` | tests (fake timers) | — | `tests/throttle.test.ts` | exact |
| `tests/solve/verdict-modal-*.test.ts` | tests (fixture-driven rendering) | — | `tests/htmlToMarkdown-snapshots.test.ts` + `tests/new-note-fetch-failure.test.ts` | role-match |
| `tests/solve/code-extractor-*.test.ts` | tests (pure function) | — | `tests/heading-region.test.ts` | exact |
| `tests/solve/mocks/fakeFetcher.ts` | test helper (mock HTTP) | — | `tests/fetcher-install.test.ts` `mockRequestUrl` pattern | exact |
| `tests/solve/mocks/fakeSettingsStore.ts` | test helper (settings) | — | `tests/new-note-fetch-failure.test.ts` `makeEmptySettings()` | exact |
| `tests/solve/fixtures/*.json` | fixtures (captured LC responses) | — | `tests/fixtures/lc-*.html` | exact |

---

## Pattern Assignments

### `src/solve/leetcodeRest.ts` (hand-rolled REST)

**Role:** REST client — non-GraphQL `requestUrl` calls for the three LC endpoints (`/interpret_solution/`, `/submit/`, `/check/`).
**Analog:** `src/api/requestUrlFetcher.ts` (lines 16–68) + `src/api/LeetCodeClient.ts` (lines 1–30).
**Why it's the analog:** the existing fetcher is the GraphQL adapter around `requestUrl`; Phase 3 REST does the same thing for non-GraphQL endpoints. The 429-handling shape, throttle integration, and error-class usage carry over one-for-one.

**Imports pattern** (from `src/api/requestUrlFetcher.ts:16-26`):
```typescript
import { requestUrl } from 'obsidian';
import { Throttle } from './throttle';
import { RateLimitError } from '../shared/errors';
```

**Throttle integration pattern** (from `src/api/requestUrlFetcher.ts:38-68`) — Phase 3 MUST reuse the live throttle exposed by `getActiveThrottle()` rather than constructing a new one:
```typescript
const shim = async (input: unknown, init?: FetchInit): Promise<Response> => {
  await throttle.acquire();
  try {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const res = await requestUrl({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
      throw: false, // IMPORTANT: let the library see 4xx/5xx for error parsing.
    });
    if (res.status === 429) {
      const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
      const retryMs = retryAfter
        ? (Number.isFinite(+retryAfter) ? +retryAfter * 1000 : 10_000)
        : 10_000;
      throw new RateLimitError(retryMs);
    }
    return new Response(res.text, { status: res.status, headers: res.headers as HeadersInit });
  } finally {
    throttle.release();
  }
};
```

**Session-expiry check pattern** (from `src/api/LeetCodeClient.ts:132-140`) — REST responses run through the same helper; do NOT duplicate:
```typescript
export function isSessionExpired(resp: unknown): boolean {
  if (!resp || typeof resp !== 'object') return false;
  const r = resp as { data?: unknown; errors?: Array<{ message?: string }> };
  if (r.data === null) return true;
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e?.message ?? '')
  );
}
```

**Notable differences Phase 3 must handle:**
- The Phase 1 shim returns a web-`Response`; Phase 3 REST needs a typed-response return (`{ interpret_id }`, `{ submission_id }`, `CheckResponse`). Either export a raw `throttledRequestUrl(params)` from `src/api/throttle.ts` that returns `RequestUrlResponse` verbatim (preferred per D-28), OR consume the existing shim and JSON-parse its `.text`.
- Cookie injection is explicit per request (not auto): read `SettingsStore.getAuthCookies()` at request time, build `Cookie: csrftoken=X; LEETCODE_SESSION=Y;` header. Research confirms this (RESEARCH.md Summary #2).
- 401/403/redirect-to-login: call `isSessionExpired` on the response body; throw `SessionExpiredError` (already defined in `src/shared/errors.ts:1-6`).

---

### `src/solve/SubmissionOrchestrator.ts` (orchestrator, singleton)

**Role:** singleton service with single-flight flag, backoff scheduler, abort flag, verdict-modal wiring.
**Analog:** `src/notes/NoteWriter.ts` (entire file; focus on lines 104-247 orchestration shape + error dispatch).
**Why it's the analog:** `NoteWriter` is the existing "one public verb that branches by state, calls the client, handles errors via Notice, coordinates other services" pattern. Phase 3's orchestrator adds polling + single-flight but is otherwise a clone.

**Class shape pattern** (from `src/notes/NoteWriter.ts:104-109`):
```typescript
export class NoteWriter {
  constructor(
    private readonly app: App,
    private readonly client: NoteWriterClient,
    private readonly settings: NoteWriterSettings,
  ) {}

  async openProblem(slug: string, initialStatus?: 'solved' | 'attempted' | 'untouched'): Promise<void> {
    // ...
  }
}
```

**Structural-client DI pattern** (from `src/notes/NoteWriter.ts:58-88`) — lets tests pass a bare mock without constructing the real LC client:
```typescript
export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}

export interface NoteWriterSettings {
  getProblemsFolder(): string;
  getDefaultLanguage(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;
}
```
Apply: `SubmissionOrchestrator` takes structural `{ rest, settings, verdictModalFactory, customTestModalFactory }` so tests can inject fakes.

**Session-expiry dispatch pattern** (from `src/notes/NoteWriter.ts:146-160`) — reuse verbatim for D-27:
```typescript
try {
  detail = await this.client.getProblemDetail(slug);
} catch (err) {
  const maybeResp = (typeof err === 'object' && err !== null)
    ? (err as { response?: unknown }).response
    : undefined;
  if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    new Notice('LeetCode session expired. Log in again.', 8000);
    return;
  }
  new Notice(`Couldn't fetch ${slug}. Check your connection.`, 4000);
  return;
}
```

**Registered-timer pattern** — the repo does NOT yet use `Plugin.registerInterval`; Phase 1 uses `setWindowTimeout` from `src/shared/timers.ts:13-19` for popout-window safety. Apply the same helper for the backoff chain:
```typescript
// src/shared/timers.ts:13-19
export function setWindowTimeout(fn: () => void, ms: number): TimerHandle {
  if (typeof activeWindow !== 'undefined' && activeWindow) {
    return activeWindow.setTimeout(fn, ms) as unknown as TimerHandle;
  }
  return setTimeout(fn, ms);
}
```
Planner discretion: either reuse `setWindowTimeout` directly (lighter) or register each chained timer via `this.plugin.registerInterval()` (safer on unload). CONTEXT CF-05 and CLAUDE.md §Stack Patterns both require registered timers.

**Notable differences Phase 3 must handle:**
- Single-flight flag: `NoteWriter` has no equivalent. Add a private `currentSubmission: { abort: () => void } | null` field and check it at the top of `submit()` / `runSample()` / `runCustom()`; throw or Notice per D-24.
- Backoff chain: chain `setWindowTimeout` recursively (1s → 2s → 4s → 8s → 8s …). Research recommends `setTimeout` chain (not `setInterval`) because intervals aren't uniform (RESEARCH.md §Alternatives Considered).
- Abort: check an `aborted: boolean` flag before every call to `checkSubmission` and before scheduling the next timer. Fire-and-forget in-flight `requestUrl` per D-23.

---

### `src/solve/VerdictModal.ts` (8-state modal)

**Role:** Modal with pending / AC / WA / TLE / MLE / CE / RE / Unknown / Timeout states; mutable body + footer; all DOM via `createEl()`.
**Analog:** `src/browse/FilterModal.ts` (lines 79-553, esp. 100-113 for shape and 130-200 for in-place rendering).
**Why it's the analog:** `FilterModal` is the existing complex Modal — class extends `Modal`, adds a root class, empties `contentEl` in `onOpen`, keeps refs to mutable sub-elements, builds everything with `createEl/createDiv/createSpan` + `setIcon`. Phase 3 modals mirror this shape exactly; the state-machine variant (pending → verdict → close) just means more `contentEl.empty()` + rebuild passes.

**Modal class shape** (from `src/browse/FilterModal.ts:79-113`):
```typescript
export class FilterModal extends Modal {
  private draft: CompoundFilter;
  private rulesEl: HTMLElement | null = null;
  private readonly onApply: (f: CompoundFilter | null) => void;

  constructor(app: App, initial: CompoundFilter | null, topicSlugs: string[], onApply: (f: CompoundFilter | null) => void) {
    super(app);
    this.draft = initial ? { match: initial.match, rules: initial.rules.map((r) => ({ ...r })) } : { match: 'all', rules: [] };
    this.onApply = onApply;
  }

  onOpen(): void {
    this.modalEl.addClass('lc-filter-modal');
    const { contentEl } = this;
    contentEl.empty();
    this.renderMatchHeader(contentEl);
    this.rulesEl = contentEl.createDiv({ cls: 'lc-fm__rules' });
    this.renderRules();
    this.renderAddButton(contentEl);
    this.renderFooter(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```
Apply verbatim: `class VerdictModal extends Modal` with `contentEl.addClass('leetcode-verdict')`, state field (e.g., `private state: 'pending' | 'ac' | 'wa' | …`), and a `render()` method that empties contentEl and rebuilds per state. UI-SPEC §State Machine covers the transitions.

**Simpler modal shape** (from `src/auth/CookiePasteModal.ts:13-79`) — for layout-only reference (headings, Setting API, Save button):
```typescript
export class CookiePasteModal extends Modal {
  constructor(app: App, private readonly onSave: (cookies: AuthCookies) => void | Promise<void>) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-settings');
    contentEl.createEl('h2', { text: 'Manual cookie (fallback)' });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Save cookies').onClick(async () => { /* ... */ this.close(); }),
    );
  }
}
```

**DOM creation pattern** (from `src/browse/FilterModal.ts:236-260`) — `createEl`, `createDiv`, `createSpan`, `setIcon`; never `innerHTML`:
```typescript
const row = parent.createDiv({ cls: 'lc-fm__rule' });
const fieldCell = row.createDiv({ cls: 'lc-fm__rule-field' });
const iconEl = fieldCell.createSpan({ cls: 'lc-fm__rule-ficon' });
setIcon(iconEl, def.icon);
fieldCell.createSpan({ text: def.label });
```
Apply to verdict-modal status icon + label (UI-SPEC §Icons: `check-circle`, `x-circle`, `alert-triangle`, `loader`).

**Popover / floating menu pattern** (from `src/browse/FilterModal.ts:354-393`) — reuse for VerdictModal's `<details>` on unknown verdict and any right-click/hover affordance:
```typescript
const menu = this.contentEl.createDiv({ cls: 'lc-fm__popover' });
const rect = anchor.getBoundingClientRect();
menu.style.position = 'absolute';
menu.style.top = `${String(rect.bottom - parentRect.top + 4)}px`;
const close = (e: MouseEvent): void => {
  if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
    menu.remove();
    document.removeEventListener('click', close, true);
  }
};
setTimeout(() => document.addEventListener('click', close, true), 0);
```
Not strictly needed for VerdictModal — noted here because CustomTestModal's tab-affordances and popovers can copy this pattern.

**Notable differences Phase 3 must handle:**
- VerdictModal has **9 render states** vs FilterModal's 1. Use a `switch(this.state)` in `render()`; each branch calls `renderAccepted()`, `renderWrongAnswer()`, etc., each of which empties `this.bodyEl` / `this.footerEl` refs.
- Focus management (UI-SPEC §Focus Management): default-focus the Cancel/Close button on each render pass. `btn.focus()` after creation.
- `aria-live="polite"` on `bodyEl` for screen-reader state-transition announcements (UI-SPEC §Accessibility).
- Modal chrome: use `this.titleEl.setText(…)` (inherited from `Modal`) for the title — FilterModal doesn't use it (renders its own header).

---

### `src/solve/CustomTestModal.ts` (tabbed modal)

**Role:** Modal with N tabs (Case 1..N + `+`), textarea per tab, Run button; reads/writes `## Custom Tests` section.
**Analog:** `src/browse/FilterModal.ts` — specifically the rule-row pattern (lines 202-260) for the tab-row structure and the popover pattern for the remove-on-hover affordance. `CookiePasteModal` for the simple footer Save/Run button pattern.

**Tab-row-like pattern** (adapted from `src/browse/FilterModal.ts:202-234`):
```typescript
// FilterModal renders rules; CustomTestModal renders tabs with the same shape
private renderRules(): void {
  if (!this.rulesEl) return;
  this.rulesEl.empty();
  this.draft.rules.forEach((r, i) => this.renderRule(this.rulesEl!, r, i));
}
```
Apply: `renderTabs()` iterates cases, appends `+` button at end. UI-SPEC specifies 28px-tall `<button>` elements with `role="tab"` and `aria-selected`.

**Footer button pattern** (from `src/browse/FilterModal.ts:520-552`) — the Run button is the primary CTA in CustomTestModal, reserved accent per UI-SPEC:
```typescript
const applyBtn = rightGroup.createEl('button', {
  cls: 'lc-fm__apply mod-cta',
  text: 'Apply',
});
applyBtn.addEventListener('click', () => {
  this.onApply(this.draft.rules.length === 0 ? null : this.draft);
  this.close();
});
```
Replace `'Apply'` with `'Run'`, `'lc-fm__apply'` with `'leetcode-custom-test-run'`. Keep `mod-cta` class (Obsidian's accent).

**Notable differences Phase 3 must handle:**
- Tab state: active tab index + cases array. Textarea content saved to the active tab's case on switch/close.
- Persistence: on close (not cancel), write cases back to note via `CaseRegion` pure transform + `vault.process()`. Copy the `NoteWriter.backgroundRefresh` pattern (lines 232-247) verbatim.
- First-open population: read `## Custom Tests` section if present (via CaseRegion), else seed Case 1 from cached `DetailCacheEntry.exampleTestcases` (SettingsStore already caches this per Phase 2 D-14).

---

### `src/solve/codeExtractor.ts` (pure transform)

**Role:** Pure function — input `(noteBody: string, defaultLang: string) → { code: string; lang: string } | null`.
**Analog:** `src/notes/HeadingRegion.ts` — the paradigmatic pure-string-transform module in this repo.
**Why it's the analog:** both are `string → string-or-null` with no imports, no state, `vault.process`-safe. Comment header, JSDoc style, purity notes all carry over.

**Purity + module-header pattern** (from `src/notes/HeadingRegion.ts:1-22`):
```typescript
// src/notes/HeadingRegion.ts
// Pure string transform for rewriting the `## Problem` region of a problem note.
//
// Purity (Pitfall 4):
//   - No captured mutable state.
//   - Same (current, newMarkdown) → same return value.
//   - Safe to pass as the callback to Obsidian's `vault.process`, which may
//     silently retry the callback on a write conflict.
//
// This module imports NOTHING — it is a string-in/string-out helper.
```
Apply verbatim. Add module header explaining: "No imports. Pure. Given a note body + default language, return the first fenced block + resolved language OR null."

**Line-scan parser pattern** (from `src/notes/HeadingRegion.ts:36-56`):
```typescript
export function rewriteProblemSection(current: string, newMarkdown: string): string {
  const lines = current.split('\n');
  let problemStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === PROBLEM_HEADING_LINE) {
      problemStart = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^## /.test(lines[j] ?? '')) {
          problemEnd = j;
          break;
        }
      }
      break;
    }
  }
  // ...
}
```
Apply: line-scan for `^```(\w*)\s*$`, track fence open/close, return first block's content + tag. Tag-to-langSlug resolution lives in `src/solve/languages.ts`; untagged → fall back to default (D-03).

**Exported const pattern** (from `src/notes/HeadingRegion.ts:23`):
```typescript
export const PROBLEM_HEADING_LINE = '## Problem' as const;
```
Apply: export `CODE_HEADING_LINE = '## Code' as const` and `CUSTOM_TESTS_HEADING_LINE = '## Custom Tests' as const` from `NoteTemplate.ts` (schema SSoT — see D-03 carry-over: no other module hardcodes heading names).

---

### `src/solve/languages.ts` (lookup table)

**Role:** Fence-tag → LC langSlug lookup + alias table.
**Analog:** `src/notes/NoteTemplate.ts:25-46` — exports `PLUGIN_LC_KEYS`, `LC_TAG_PREFIX`, `LC_STATUS_VALUES` as SSoT constants.
**Why it's the analog:** same "single source of truth for a small, closed vocabulary" pattern.

**SSoT constants pattern** (from `src/notes/NoteTemplate.ts:25-46`):
```typescript
export const PLUGIN_LC_KEYS = [
  'lc-id', 'lc-slug', 'lc-title', 'lc-difficulty', 'lc-url', 'lc-status', 'lc-language',
] as const;

export const LC_TAG_PREFIX = 'lc/' as const;

export const LC_STATUS_VALUES = ['accepted', 'attempted', 'untouched'] as const;
export type LcStatus = typeof LC_STATUS_VALUES[number];
```
Apply:
```typescript
export const LC_LANG_SLUGS = [
  'python3', 'java', 'cpp', 'c', 'csharp', 'javascript', 'typescript',
  'rust', 'golang', 'kotlin', 'swift', 'ruby', 'scala', 'php', /* ... */
] as const;
export type LcLangSlug = typeof LC_LANG_SLUGS[number];

export const FENCE_TAG_ALIASES: Readonly<Record<string, LcLangSlug>> = {
  'py': 'python3', 'python': 'python3',
  'ts': 'typescript', 'js': 'javascript',
  'c++': 'cpp', 'go': 'golang',
  // ...
};

export function resolveLangSlug(fenceTag: string | null, fallback: string): string { /* ... */ }
```

---

### `src/solve/CaseRegion.ts` (nested heading parser)

**Role:** Parse `## Custom Tests` region with nested `### Case N` subheadings + `` ```text `` fenced blocks.
**Analog:** `src/notes/HeadingRegion.ts` — extended for nested `###` subheadings within a plugin-owned `##` region.
**Why it's the analog:** same ownership model (plugin-owned `##` heading, user-preserved intra-section text), same pure-transform contract, same `vault.process`-safe return-same-output-for-same-input invariant.

**Ownership model to replicate** (from `src/notes/HeadingRegion.ts:1-17`):
```typescript
// Ownership model (D-08):
//   - Plugin owns ONLY the `## Problem` body — from the `## Problem` heading line
//     to the line before the NEXT `## ` heading (same-level H2 only — H3 doesn't
//     close the region) or EOF.
//   - If `## Problem` is renamed or missing, the plugin re-inserts a fresh
//     `## Problem` block at the TOP of the body (above the first `## `
//     heading if any — typically `## Notes`; otherwise at EOF).
```
Apply to `## Custom Tests` (D-18, D-19): plugin owns the H2 heading + the `### Case N` subheadings + their immediate fenced blocks. User-added text between cases is preserved.

**Region-splice pattern** (from `src/notes/HeadingRegion.ts:57-68`):
```typescript
const trimmedNew = newMarkdown.trim();
const newBlock = `${PROBLEM_HEADING_LINE}\n${trimmedNew}\n\n`;

if (problemStart >= 0) {
  const before = lines.slice(0, problemStart).join('\n');
  const after = lines.slice(problemEnd).join('\n');
  const leadingGlue = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  return `${before}${leadingGlue}${newBlock}${after}`;
}
```
Apply: locate `## Custom Tests`, walk forward parsing `### Case N` + immediate ` ```text ` blocks into an array, write-back replaces the region with regenerated cases in numeric order. User-added paragraph text between cases is preserved by including it in the regenerated block verbatim.

**Test file analog** (from `tests/heading-region.test.ts:4-48`):
```typescript
describe('rewriteProblemSection (NOTE-06, D-08)', () => {
  it('rewrites the ## Problem body and preserves content under ## Notes', () => {
    const before = `## Problem\nOld.\n\n## Notes\nUser's note.\n`;
    const after = rewriteProblemSection(before, 'Fresh.');
    expect(after).toContain('Fresh.');
    expect(after).not.toContain('Old.');
    expect(after).toContain("User's note.");
  });

  it('is a pure function (no side effects on re-invocation — safe inside vault.process retry)', () => {
    const input = `## Problem\nfoo\n\n## Notes\nbar\n`;
    const a = rewriteProblemSection(input, 'new');
    const b = rewriteProblemSection(input, 'new');
    expect(a).toBe(b);
  });
});
```
Apply verbatim to `tests/solve/case-region.test.ts` and `tests/solve/code-extractor-*.test.ts`: every pure transform gets a purity test.

---

### `src/solve/starterCodeInjector.ts` (vault-write helper)

**Role:** D-07 retrofit + on-demand injection — inserts `## Code` block with starter snippet.
**Analog:** `src/notes/NoteWriter.ts:232-247` (`backgroundRefresh`) — the vault-write wrapper around a pure transform.

**Vault-process pattern** (from `src/notes/NoteWriter.ts:232-247`):
```typescript
private async backgroundRefresh(file: TFile, slug: string): Promise<void> {
  const detail = await this.client.getProblemDetail(slug);
  if (!detail || !detail.content) return;
  const entry = toDetailCacheEntry(detail);
  await this.settings.setProblemDetail(slug, entry);
  const freshMarkdown = htmlToMarkdown(entry.contentHtml);
  // Body rewrite — vault.process is atomic; rewriteProblemSection is pure.
  await this.app.vault.process(file, (current) => rewriteProblemSection(current, freshMarkdown));
  await applyFrontmatter(this.app, file, buildFrontmatterInput(entry, this.settings.getDefaultLanguage()));
}
```
Apply for `starterCodeInjector.retrofit(file, detail, settings)`:
```typescript
await this.app.vault.process(file, (current) => injectCodeSection(current, {
  starterCode: detail.codeSnippets?.find((s) => s.langSlug === lang)?.code ?? '',
  lang,
}));
```
`injectCodeSection` is a new pure function in `src/solve/CaseRegion.ts` or a sibling `CodeRegion.ts`; mirrors `rewriteProblemSection` exactly.

**Idempotency pattern** — D-07: retrofit must NOT replace an existing fenced block. Mirror `rewriteProblemSection`'s rename-detection logic (lines 70-104) to detect "## Code exists, has a fenced block" and early-return unchanged.

**Silent-on-failure pattern** (from `src/notes/NoteWriter.ts:127-140`) — D-09: retrofit swallows errors at debug log level:
```typescript
await ensureLeetcodeBase(this.app, folder).catch((err) => {
  logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
});
```
Apply verbatim for retrofit. Never Notice.

---

### `src/notes/NoteTemplate.ts` (modify — schema extension)

**Role:** extend the canonical heading inventory with `## Code` and `## Custom Tests`.
**Analog:** self — `src/notes/NoteTemplate.ts:107-109` (buildNoteBody).

**Current body template** (from `src/notes/NoteTemplate.ts:107-109`):
```typescript
export function buildNoteBody(input: { problemMarkdown: string }): string {
  return `## Problem\n${input.problemMarkdown.trim()}\n\n## Notes\n\n`;
}
```
Extend per CONTEXT D-06: `## Problem` → `## Code` → `## Notes`. Add `codeBlockFor(langSlug, starterCode)` helper that emits the fenced block with LC's starter code. `## Custom Tests` is lazy (only appears if cases exist) — NOT added to `buildNoteBody`; emitted only by `CaseRegion.writeCases`.

**Schema SSoT constants** (from `src/notes/NoteTemplate.ts:25-46`): add `CODE_HEADING_LINE`, `CUSTOM_TESTS_HEADING_LINE`, `CASE_HEADING_PREFIX = '### Case '` as exported consts. No other module hardcodes these strings.

---

### `src/notes/NoteWriter.ts` (modify — retrofit hook)

**Role:** after Phase 2's body-write, call `starterCodeInjector.retrofit()` if `## Code` is missing.
**Analog:** self — add a step between `vault.create` and `applyFrontmatter` (around line 192) and between `backgroundRefresh`'s body-rewrite and frontmatter-update (around line 245).

**Retrofit insertion point** — modify `NoteWriter.openProblem` after the `vault.create(filePath, body)` call (line 182) but BEFORE `applyFrontmatter`:
```typescript
const file = await this.app.vault.create(filePath, body);
// Phase 3 NEW: retrofit starter code silently.
await starterCodeInjector.retrofit(this.app, file, newEntry, this.settings).catch((err) => {
  logger.debug('notes.retrofit: non-fatal failure', err);
});
```

Also modify the re-open path (around line 135-141): after `openLinkText`, run retrofit on the existing file.

---

### `src/settings/SettingsStore.ts` (modify — extend DetailCacheEntry)

**Role:** add `internalQuestionId?: string` to `DetailCacheEntry`.
**Analog:** self — `src/settings/SettingsStore.ts:16-26` + `166-187` (isValidDetailCacheEntry).

**Extension pattern** (from `src/settings/SettingsStore.ts:16-26`):
```typescript
export interface DetailCacheEntry {
  fetchedAt: number;
  id: number;                 // LC's questionFrontendId (display)
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  // Phase 3: add
  internalQuestionId?: string;  // LC's internal questionId (sent in submit body, different from frontend id)
}
```

**Shape-guard extension** (from `src/settings/SettingsStore.ts:166-187`) — every new field gets a corresponding guard line:
```typescript
function isValidDetailCacheEntry(v: unknown): v is DetailCacheEntry {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DetailCacheEntry>;
  if (typeof d.fetchedAt !== 'number') return false;
  // ...
  if (d.internalQuestionId !== undefined && typeof d.internalQuestionId !== 'string') return false;
  return true;
}
```

---

### `src/api/throttle.ts` (modify — expose raw helper)

**Role:** add `throttledRequestUrl(params: RequestUrlParam): Promise<RequestUrlResponse>` so `leetcodeRest.ts` can bypass the GraphQL-shaped `Response` wrapper.
**Analog:** self — `src/api/requestUrlFetcher.ts:38-68` (the existing shim).

**New helper shape** (derived from `src/api/requestUrlFetcher.ts:38-68`):
```typescript
// NEW in src/api/throttle.ts or src/api/requestUrlFetcher.ts — planner picks:
export async function throttledRequestUrl(params: RequestUrlParam): Promise<RequestUrlResponse> {
  const throttle = getActiveThrottle();
  if (!throttle) throw new Error('throttledRequestUrl: fetcher not installed');
  await throttle.acquire();
  try {
    const res = await requestUrl({ ...params, throw: false });
    if (res.status === 429) {
      const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
      const retryMs = retryAfter
        ? (Number.isFinite(+retryAfter) ? +retryAfter * 1000 : 10_000)
        : 10_000;
      throw new RateLimitError(retryMs);
    }
    return res;
  } finally {
    throttle.release();
  }
}
```

---

### `src/main.ts` (modify — register 5 commands + orchestrator)

**Role:** wire Phase 3 orchestrator + commands between Phase 2 NoteWriter and ribbon registration.
**Analog:** self — `src/main.ts:76-111` (existing `addCommand` calls) + `55-58` (service construction step).

**Service wiring step** (from `src/main.ts:55-58`):
```typescript
// Step 5.5 — note writer.
this.notes = new NoteWriter(this.app, this.client, this.settings);
```
Apply — add Step 5.6:
```typescript
// Step 5.6 — submission orchestrator (Phase 3).
this.solve = new SubmissionOrchestrator(this, this.settings, /* rest client */);
```

**Command registration pattern** (from `src/main.ts:91-111`):
```typescript
this.addCommand({
  id: 'refresh-current-problem',
  name: 'Refresh current problem',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm: Record<string, unknown> | undefined = cache?.frontmatter;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || !slug) return false;
    if (!checking) { void this.refreshProblem(slug); }
    return true;
  },
});
```
Apply to all 5 Phase 3 commands (Run sample / Run custom / Submit / Insert starter code / Cancel). All use `editorCheckCallback` keyed off `lc-slug` frontmatter so the command is only enabled on plugin-generated problem notes. **No hotkeys field** (CLAUDE.md community-plugin rule).

**Notice-for-non-problem-note pattern** — per UI-SPEC copy: `Open a LeetCode problem note first.` (4s). Trigger via `new Notice('…', 4000)` in the command callback when frontmatter lacks `lc-slug`.

---

### `styles.css` (modify — add verdict + custom-test classes)

**Role:** CSS classes for VerdictModal and CustomTestModal.
**Analog:** self — `styles.css` lines 3-233 (`.leetcode-browser` namespace) + existing `@keyframes lc-progress-shimmer` at line 229.

**Namespace convention** (from `styles.css:3-188`):
```css
.leetcode-browser {
  padding: 8px 12px;
}
.leetcode-browser .lc-row {
  display: grid;
  /* ... */
}
.leetcode-browser .lc-row__status--solved     { color: var(--color-green); }
```
Apply: `.leetcode-verdict .leetcode-verdict-section { … }`, `.leetcode-custom-test .leetcode-custom-test-tab { … }`. Never hardcoded hex values — use `var(--text-error)`, `var(--text-success)`, `var(--interactive-accent)` per UI-SPEC §Color.

**Keyframe pattern** (from `styles.css:229-233`):
```css
@keyframes lc-progress-shimmer {
  /* ... */
}
```
Apply for the pending-state spinner: `@keyframes lc-spin { to { transform: rotate(360deg); } }`. Wrap in `@media (prefers-reduced-motion: no-preference)` per UI-SPEC §Accessibility.

The full CSS skeleton is already in UI-SPEC §CSS skeleton — executor copies it verbatim.

---

### Test Pattern Assignments

#### `tests/solve/submission-orchestrator-backoff.test.ts` (fake-timer polling)

**Analog:** `tests/throttle.test.ts:1-66`.

**Fake-timer pattern** (from `tests/throttle.test.ts:5-33`):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Throttle } from '../src/api/throttle';

describe('Throttle (BROWSE-05)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('25 sequential acquires take >=10s with capacity=20', async () => {
    const t = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 2 });
    const run = (async () => {
      for (let i = 0; i < 25; i++) await runOne();
    })();
    await vi.advanceTimersByTimeAsync(10_001);
    await run;
    expect(Date.now() - start).toBeGreaterThanOrEqual(10_000);
  });
});
```
Apply: set up orchestrator with fake fetcher returning `{ state: 'PENDING' }` for N polls then `{ state: 'SUCCESS', status_code: 10 }`. Assert poll timestamps at t=1s, 3s, 7s, 15s (cumulative after 1/2/4/8 backoffs).

#### `tests/solve/verdict-modal-*.test.ts` (fixture-driven)

**Analog:** `tests/htmlToMarkdown-snapshots.test.ts` (fixture-driven rendering) + `tests/new-note-fetch-failure.test.ts` (Notice assertion pattern).

**Notice-spy pattern** (from `tests/new-note-fetch-failure.test.ts:1-15`):
```typescript
import { describe, it, expect, vi } from 'vitest';
const noticeSpy = vi.fn();
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class MockNotice {
      constructor(msg: string, ms?: number) { noticeSpy(msg, ms); }
    },
  };
});
```
Apply: in verdict-modal tests, mock `Modal` to capture `titleEl.setText` / `contentEl.createEl` calls. Load fixture JSON from `tests/solve/fixtures/{verdict}.json`, instantiate `VerdictModal`, call `render(fixture)`, assert DOM structure + Notice text.

#### `tests/solve/mocks/fakeFetcher.ts` (mock HTTP)

**Analog:** `tests/fetcher-install.test.ts:6-33` (mockRequestUrl pattern).

**Mock pattern** (from `tests/fetcher-install.test.ts:13-32`):
```typescript
interface MockRequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  arrayBuffer: ArrayBuffer;
}
const mockRequestUrl = vi.fn<(arg: unknown) => Promise<MockRequestUrlResponse>>(async () => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  text: '{"data":{"hello":"world"}}',
  json: { data: { hello: 'world' } },
  arrayBuffer: new ArrayBuffer(0),
}));
vi.mock('obsidian', () => ({ requestUrl: mockRequestUrl }));
```
Apply: `fakeFetcher.ts` exports a similar spy + a helper `queueResponses([…])` that returns each fixture in order (emulates `/check/{id}` polling returning PENDING × N then SUCCESS).

#### `tests/solve/mocks/fakeSettingsStore.ts`

**Analog:** `tests/new-note-fetch-failure.test.ts:17-28` (`makeEmptySettings()`).

**Minimal settings pattern** (from `tests/new-note-fetch-failure.test.ts:17-28`):
```typescript
function makeEmptySettings() {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}
```
Apply: extend with `getAuthCookies: () => ({ LEETCODE_SESSION: 'test', csrftoken: 'test' })` for REST tests.

#### `tests/solve/fixtures/*.json`

**Analog:** `tests/fixtures/lc-two-sum.html`, `lc-median.html`, etc.
**Why:** Phase 2 already keeps captured-live-LC fixtures in `tests/fixtures/`. Phase 3 mirrors this directory layout but for JSON verdict responses. D-31 requires live capture.

**Pattern:** one file per verdict type, flat key-value matching the LC `/check/{id}` response shape:
```
tests/solve/fixtures/
  interpret-pending.json       # { state: 'PENDING' } during polling
  interpret-success-ac.json    # run result: correct_answer: true
  interpret-success-wa.json    # run result: correct_answer: false
  submit-ac.json               # status_code: 10, runtime, memory, percentile
  submit-wa.json               # status_code: 11, input_formatted, code_output, expected_output
  submit-tle.json              # status_code: 14, last_testcase
  submit-mle.json              # status_code: 12
  submit-ce.json               # status_code: 20, compile_error
  submit-re.json               # status_code: 15, runtime_error, last_testcase
  submit-unknown.json          # status_code: 99 (synthetic — for D-15 unknown path)
```

---

## Shared Patterns

### Pattern A: Notice Copy (UI-SPEC §Notice strings, Phase 1 LOCKED)

**Source:** `src/auth/AuthService.ts:32-44` + UI-SPEC §Notice strings table (Phase 3).
**Apply to:** Every new Notice in Phase 3.

Every `new Notice` call MUST:
- Sentence case
- End with a period
- Single quote the "LeetCode" brand name with the eslint-disable comment if needed

```typescript
// eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
new Notice('LeetCode session expired. Log in again.', 8000);
```

Phase 3 Notice strings (from UI-SPEC §Notice strings):
- `No code block found. Add a fenced block with your solution.` (6s, D-04)
- `A submission is already in progress. Cancel it first or wait for the verdict.` (6s, D-24)
- `Open a LeetCode problem note first.` (4s)
- `Starter code inserted.` (3s, optional, D-07)
- `LeetCode judge timed out. Try again or check leetcode.com.` (6s, D-22)

### Pattern B: `isSessionExpired` Reuse (CF-04, AUTH-04 OWNERSHIP LOCKED)

**Source:** `src/api/LeetCodeClient.ts:132-140`.
**Apply to:** `SubmissionOrchestrator` (after every REST response), `leetcodeRest.ts` (optionally inside each wrapper).

Import once:
```typescript
import { isSessionExpired } from '../api/LeetCodeClient';
```
Never redefine. Never add a sibling helper.

### Pattern C: `vault.process` + pure-transform for body writes (CF-06)

**Source:** `src/notes/NoteWriter.ts:240` + `src/notes/HeadingRegion.ts:42-104`.
**Apply to:** `starterCodeInjector.retrofit`, `CustomTestModal.persistCases` (via CaseRegion), any Phase 3 note-mutation.

```typescript
await this.app.vault.process(file, (current) => myPureTransform(current, input));
```

**Never:** `vault.modify()`. Enforced by Phase 3 grep gate (CONTEXT CF-06):
```
grep -rE "vault\.modify\s*\(" src/solve/ src/notes/ --include='*.ts'    # must be empty
```

### Pattern D: `createEl`-only DOM (CF-07)

**Source:** `src/browse/FilterModal.ts:237-248` (icon + cell shape), `src/auth/CookiePasteModal.ts:29-53`.
**Apply to:** `VerdictModal`, `CustomTestModal`, all Phase 3 DOM.

```typescript
const row = parent.createDiv({ cls: 'leetcode-verdict-section' });
const label = row.createDiv({ cls: 'leetcode-verdict-section-label', text: 'Input' });
const pre = row.createEl('pre', { cls: 'leetcode-verdict-diff-input' });
pre.setText(value); // NEVER innerHTML for user-output strings (WA diff rendering)
```

**Never:** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, direct `style=""` attribute, `!important`.

### Pattern E: Structural-interface DI (testability)

**Source:** `src/notes/NoteWriter.ts:58-88`.
**Apply to:** `SubmissionOrchestrator`, `starterCodeInjector`, `CustomTestModal`.

Declare a minimal interface per dependency; let tests pass bare `{ someMethod: vi.fn(...) }` objects:
```typescript
export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}
```

### Pattern F: Silent vs Surfaced Error Split (D-12 vs D-13 posture)

**Source:** `src/notes/NoteWriter.ts:227-247` (silent) vs `279-340` (surfaced).
**Apply to:**
- Retrofit (D-09) → silent (debug log only; user didn't ask)
- Explicit command (`Submit`, `Run code`) → surfaced via Notice (user explicitly asked; failure visible)

Silent variant:
```typescript
void this.backgroundRefresh(file, slug).catch((err) => {
  logger.debug('notes.backgroundRefresh: swallowed failure', err);
});
```

Surfaced variant (from `src/notes/NoteWriter.ts:295-312`):
```typescript
try {
  detail = await this.client.getProblemDetail(slug);
} catch (err) {
  if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
    new Notice('LeetCode session expired. Log in again.', 8000);
    return;
  }
  new Notice(`Couldn't refresh ${displayTitle}. Check your connection.`, 4000);
  return;
}
```

### Pattern G: Logger-redacted Logging (CF-03, AUTH-06)

**Source:** `src/shared/logger.ts:57-73`.
**Apply to:** All Phase 3 logging. Especially D-15 unknown-verdict `warn` path:
```typescript
logger.warn('solve.verdict: unrecognized status', { status_code: resp.status_code, payload: resp });
```
Logger auto-redacts `session`/`csrf`/`cookie`/`token` keys + embedded `key=value` pairs in strings. Never use `console.*` directly.

### Pattern H: Popout-window-safe Timers (WR-02)

**Source:** `src/shared/timers.ts:13-28`.
**Apply to:** `SubmissionOrchestrator`'s backoff chain (D-21), any Phase 3 `setTimeout`/`setInterval`.

```typescript
import { setWindowTimeout, clearWindowTimeout } from '../shared/timers';
const handle = setWindowTimeout(() => { /* next poll */ }, backoffMs);
// cleanup:
clearWindowTimeout(handle);
```

---

## No Analog Found

None. Every Phase 3 file has a strong or role-match analog in Phases 1–2.

The only structural novelty is the **single-flight flag + abort-flag combination in `SubmissionOrchestrator`** — this pattern does not exist anywhere in Phases 1–2 (no existing feature has a long-running cancellable operation). Planner should treat this as a green-field design point, referencing RESEARCH.md §Pattern 2 and §Pattern 4 for the concurrency shape and §Standard Stack note about `requestUrl` not supporting `AbortSignal`.

---

## Metadata

**Analog search scope:**
- `src/api/` — throttle, fetcher, LeetCodeClient (HTTP + auth patterns)
- `src/notes/` — NoteWriter, HeadingRegion, NoteTemplate (orchestrator + transform + schema)
- `src/browse/` — FilterModal (complex Modal), ProblemBrowserView (view registration)
- `src/auth/` — CookiePasteModal (simple Modal), AuthService (service pattern)
- `src/settings/` — SettingsStore (cache schema + shape guards)
- `src/shared/` — errors, logger, timers
- `src/main.ts` — command + service wiring
- `tests/` — throttle.test.ts, heading-region.test.ts, new-note-fetch-failure.test.ts, fetcher-install.test.ts, session-expiry.test.ts (fake-timer + mock patterns)
- `tests/helpers/` — mock-vault, mock-leetcode-client, obsidian-stub
- `styles.css` — `.leetcode-browser` namespace, Obsidian CSS variable conventions

**Files scanned:** ~30 source + tests files read end-to-end; CSS skimmed via Grep.

**Pattern extraction date:** 2026-05-08
