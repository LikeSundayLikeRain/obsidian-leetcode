# Phase 4: Knowledge Graph Wiring - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 21 new/modified source files + 11 test files + 5 fixture/mocks
**Analogs found:** 20 / 21 source files (1 greenfield — `ConfirmOverwriteModal.ts` — reuses Modal primitive + VerdictModal footer pattern)
**Analogs scanned:** `src/solve/`, `src/notes/`, `src/settings/`, `src/api/`, `src/shared/`, `tests/solve/`, `tests/notes/`, `tests/` (root)

---

## File Classification

### Source files (new + modified)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/graph/KnowledgeGraphWriter.ts` | service (orchestrator) | event-driven (on-AC callback) | `src/solve/submissionOrchestrator.ts` + `src/notes/NoteWriter.ts` | role-match (submit-outcome-oriented vs submit-driver) |
| `src/graph/mergeTechniquesSection.ts` | utility (pure transform) | transform | `src/solve/CaseRegion.ts` | exact |
| `src/graph/StubNoteCreator.ts` | service (vault loop) | file-I/O (batched creates) | `src/notes/BaseFile.ts::ensureLeetcodeBase` | exact |
| `src/graph/submissionHistoryClient.ts` | service (REST client) | request-response | `src/solve/leetcodeRest.ts` | exact |
| `src/graph/SubmissionPickerModal.ts` | component (Modal) | event-driven (row click → detail fetch) | `src/solve/CustomTestModal.ts` | role-match (list vs tabs) |
| `src/graph/SubmissionDetailModal.ts` | component (Modal + renderer) | request-response + MarkdownRenderer | `src/solve/VerdictModal.ts` | role-match (render verdict vs render code) |
| `src/graph/ConfirmOverwriteModal.ts` | component (Modal, sub-dialog) | event-driven (confirm/cancel) | `src/solve/VerdictModal.ts` footer section | partial (reuse footer pattern) |
| `src/graph/copyToCode.ts` | utility (vault.process helper) | transform | `src/solve/starterCodeInjector.ts` (for `forceInjectCodeSection`) + `src/solve/customTestStore.ts::writeCasesToVault` | role-match |
| `src/shared/dates.ts` (OR `NoteTemplate.ts` extension) | utility (pure helper) | transform (Date → string) | `src/notes/NoteTemplate.ts::buildNoteFilename` / `codeBlockFor` (pure helpers sibling pattern) | role-match |
| `src/notes/NoteTemplate.ts` **(modified)** | service (template SSoT) | transform | existing self — same file extends with new exports | self |
| `src/notes/NoteWriter.ts` **(modified)** | service | request-response (+ background refresh) | self — extends `backgroundRefresh` hook on open | self |
| `src/settings/SettingsStore.ts` **(modified)** | service (persistence) | CRUD (data.json) | self — adds field + shape-guard pair | self |
| `src/main.ts` **(modified)** | config (wiring) | event-driven (command registration) | self — extends `submitFromActive` + new `editorCheckCallback` command | self |
| `styles.css` **(modified)** | config (CSS) | N/A | existing `.leetcode-custom-test-*` and `.leetcode-verdict-*` blocks | self |

### Test files (new)

| New Test File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `tests/graph/mergeTechniquesSection.test.ts` | unit (pure transform) | transform | `tests/solve/CaseRegion.test.ts` | exact |
| `tests/graph/stubNoteCreator.test.ts` | unit (vault loop) | file-I/O | `tests/base-file-ship.test.ts`, `tests/base-file-preserve.test.ts`, `tests/base-file-detect-stale.test.ts` | exact |
| `tests/graph/stubFilename.test.ts` | unit (pure) | transform | `tests/note-filename.test.ts` | exact |
| `tests/graph/onAccepted.frontmatter.test.ts` | unit (writer + fakes) | event-driven | `tests/note-frontmatter-write.test.ts` | exact |
| `tests/graph/onAccepted.tags.test.ts` | unit (writer + fakes) | event-driven | `tests/note-frontmatter-tags.test.ts` + `tests/note-frontmatter-preserve-user-tags.test.ts` | exact |
| `tests/graph/onAccepted.optOut.test.ts` | unit (writer + fakes) | event-driven | `tests/note-frontmatter-tags.test.ts` (opt-out-flag assertion shape) | role-match |
| `tests/graph/onAccepted.gate.test.ts` | unit | event-driven | `tests/solve/statusMap.test.ts` + `tests/solve/unknownVerdictGuard.test.ts` | role-match |
| `tests/graph/submissionHistoryClient.test.ts` | unit (REST, mocked) | request-response | `tests/solve/leetcodeRest.test.ts` | exact |
| `tests/graph/copyToCode.test.ts` / `copyToCode.confirm.test.ts` | unit (vault.process) | transform | `tests/solve/CaseRegion.test.ts` + `tests/solve/customTestStore.test.ts` | exact |
| `tests/shared/dates.test.ts` | unit (pure) | transform | `tests/solve/statusMap.test.ts` | role-match |
| `tests/graph/mocks/fakeKnowledgeGraphDeps.ts` | mock/fixture | — | `tests/solve/mocks/fakeSettingsStore.ts` | exact |
| `tests/graph/mocks/fakeSubmissionHistoryFetcher.ts` | mock/fixture | — | `tests/solve/mocks/fakeFetcher.ts` | exact |
| `tests/fixtures/lc-submissions/*.json` | fixture data | — | `tests/solve/fixtures/` + `tests/fixtures/` (live-captured) | exact |

---

## Pattern Assignments

### `src/graph/KnowledgeGraphWriter.ts` (service/orchestrator, event-driven on-AC callback)

**Primary analog:** `src/solve/submissionOrchestrator.ts` (class-based orchestrator with DI deps) + `src/notes/NoteWriter.ts` (App/client/settings DI triplet, fire-and-forget background refresh pattern).

**Imports pattern** (from `submissionOrchestrator.ts:23-36`):
```typescript
import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { logger } from '../shared/logger';
import { classifyStatus } from '../solve/statusMap';
import { applyFrontmatter, buildFrontmatterInput } from '../notes/NoteTemplate';
import { toIsoLocalTz } from './dateFormat'; // or '../shared/dates'
import { mergeTechniquesSection } from './mergeTechniquesSection';
import { createStubIfMissing, ensureTechniquesFolder } from './StubNoteCreator';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import type { SubmitCheckResponse } from '../solve/types';
```

**DI class-shape pattern** (from `submissionOrchestrator.ts:50-65, 109-114`):
```typescript
export interface KnowledgeGraphWriterDeps {
  app: App;
  settings: {               // structural DI facade — extends FakeSettings in tests
    getProblemDetail(slug: string): DetailCacheEntry | null;
    getAutoBacklinksEnabled(): boolean;
    getProblemsFolder(): string;
    getTechniquesFolder(): string;
    getDefaultLanguage(): string;
  };
}

export class KnowledgeGraphWriter {
  constructor(private readonly deps: KnowledgeGraphWriterDeps) {}
  async onAccepted(ctx: ProblemContext, terminal: SubmitCheckResponse): Promise<void> { ... }
}
```

**Core AC-gate pattern** (from `main.ts:475-482` + `statusMap.ts:40-43`):
```typescript
// Only fires when status_code === 10 (Accepted) per D-23, CF-18.
async onAccepted(ctx: ProblemContext, terminal: SubmitCheckResponse): Promise<void> {
  const info = classifyStatus(terminal.status_code);
  if (info.kind !== 'ac') return;
  // ... proceed with 3-step pipeline
}
```

**Three-step pipeline pattern** (NEW — mirrors `NoteWriter.openProblem` new-note path ordering at `NoteWriter.ts:248-306`):
```typescript
// Step 1 — frontmatter (always fires on AC, even under opt-out per D-20)
try {
  await applyFrontmatter(this.deps.app, ctx.file, extendedInput);
} catch (err) {
  logger.debug('graph.onAccepted: applyFrontmatter failed', err);
  return;  // frontmatter write is primary; abandon secondary steps on failure
}

// Opt-out gate — skip body + stubs per D-20
if (!this.deps.settings.getAutoBacklinksEnabled()) return;

const topicTags = detail?.topicTags ?? [];
if (topicTags.length === 0) return;  // D-25: no tags → skip Techniques + stubs

// Step 2 — ## Techniques region rewrite (pure transform via vault.process)
try {
  await this.deps.app.vault.process(ctx.file, (current) =>
    mergeTechniquesSection(current, topicTags),
  );
} catch (err) {
  logger.debug('graph.onAccepted: Techniques write failed', err);
  return;
}

// Step 3 — stub creation loop (non-atomic; per-stub failures silent per D-19)
try {
  await ensureTechniquesFolder(this.deps.app, this.deps.settings.getTechniquesFolder());
  for (const tag of topicTags) {
    const filename = buildTechniqueFilename(tag.name);
    const path = `${this.deps.settings.getTechniquesFolder()}/${filename}`;
    const body = buildTechniqueStubBody(tag.slug, tag.name);
    await createStubIfMissing(this.deps.app, path, body);
  }
} catch (err) {
  logger.debug('graph.onAccepted: stub loop failed', err);  // non-fatal
}
```

**Error handling pattern** (debug-log + silent-fail per CF-19, matches `NoteWriter.ts:158-160, 299-302` `.catch((err) => { logger.debug(...) })`):
```typescript
// Each step wraps its atomic work in try/catch + debug-log. No Notice fires
// — on-AC write is invisible-by-design (UI-SPEC §Notice strings).
```

---

### `src/graph/mergeTechniquesSection.ts` (utility, pure transform — union-merge list items)

**Primary analog:** `src/solve/CaseRegion.ts` (exact — parse-items + merge + render pattern, zero I/O, safe for `vault.process` retry). `src/notes/HeadingRegion.ts` also informs the H2-insertion-point pattern.

**Imports + purity header** (from `CaseRegion.ts:22-24`):
```typescript
// Purity: only imports heading SSoT constants from NoteTemplate; no I/O,
// no captured state. Safe inside `vault.process` retry (CF-06).
import { TECHNIQUES_HEADING_LINE, NOTES_HEADING_LINE, CUSTOM_TESTS_HEADING_LINE } from '../notes/NoteTemplate';
```

**Region delimiters** (from `CaseRegion.ts:26-29`):
```typescript
const H2 = /^## /;
// LINK_RE per RESEARCH.md Pattern 3 Line 370 — tolerates `-`, `*`, `+` bullets
const LINK_RE = /^([-*+])\s+\[\[([^\]]+)\]\]\s*$/;
```

**Item typedef + parse-items pattern** (from `CaseRegion.ts:31-34, 109-160`):
```typescript
type Item =
  | { type: 'link'; target: string; bullet: string }
  | { type: 'free'; content: string };

function parseItems(lines: string[], from: number, to: number): Item[] {
  const items: Item[] = [];
  let buf: string[] = [];
  const flushFree = (): void => {
    while (buf.length > 0 && buf[0] === '') buf.shift();
    while (buf.length > 0 && buf[buf.length - 1] === '') buf.pop();
    if (buf.length > 0) items.push({ type: 'free', content: buf.join('\n') });
    buf = [];
  };
  for (let i = from; i < to; i++) {
    const line = lines[i] ?? '';
    const m = LINK_RE.exec(line);
    if (m) {
      flushFree();
      items.push({ type: 'link', target: m[2]!, bullet: m[1]! });
    } else {
      buf.push(line);
    }
  }
  flushFree();
  return items;
}
```

**Region-find + splice pattern** (from `CaseRegion.ts:88-100`):
```typescript
function findSectionStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === TECHNIQUES_HEADING_LINE) return i;
  }
  return -1;
}

function findSectionEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (H2.test(lines[i] ?? '')) return i;
  }
  return lines.length;
}
```

**Splice + glue logic** (from `CaseRegion.ts:77-83`):
```typescript
const end = findSectionEnd(lines, start);
const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
const after = lines.slice(end).join('\n');
const gluePre = before.length > 0 ? '\n\n' : '';
const gluePost = after.length > 0 ? '\n\n' : '\n';
return before + gluePre + newSection + gluePost + after.replace(/^\n+/, '');
```

**Insertion-point pattern — after `## Notes`** (new for Phase 4; mirrors `HeadingRegion.ts:92-99` "find first same-level H2" but inverted — find `## Notes` and insert after its region):
```typescript
// D-14: insert immediately after ## Notes region, before any ## Custom Tests
function findTechniquesInsertionPoint(lines: string[]): number {
  // Search for ## Notes H2
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === NOTES_HEADING_LINE) {
      // Walk to next H2 to find end of Notes region
      for (let j = i + 1; j < lines.length; j++) {
        if (H2.test(lines[j] ?? '')) return j;
      }
      return lines.length;  // Notes is last — insert at EOF
    }
  }
  return lines.length;  // no Notes — append at EOF (before any ## Custom Tests; caller handles)
}
```

---

### `src/graph/StubNoteCreator.ts` (service, file-I/O with never-overwrite discipline)

**Primary analog:** `src/notes/BaseFile.ts::ensureLeetcodeBase` (exact — pre-check + `vault.createFolder` + `vault.create`, never-overwrite discipline, opportunistic non-fatal).

**Imports + folder-ensure pattern** (from `BaseFile.ts:21, 98-113`):
```typescript
import type { App } from 'obsidian';
import { logger } from '../shared/logger';

export async function ensureTechniquesFolder(app: App, folder: string): Promise<void> {
  // Strip trailing slashes per sanitizeFolder invariant (SettingsStore.ts:99-112)
  const trimmed = folder.replace(/[\\/]+$/, '');
  if (app.vault.getAbstractFileByPath(trimmed)) return;  // idempotent pre-check
  try {
    await app.vault.createFolder(trimmed);
  } catch (err) {
    // Concurrent create race → no-op silent per D-18, Pitfall 6.
    logger.debug('graph.ensureTechniquesFolder: concurrent create', err);
  }
}
```

**Stub create with never-overwrite** (from `BaseFile.ts:98-113`, adapted for per-stub loop):
```typescript
export async function createStubIfMissing(
  app: App,
  path: string,
  body: string,
): Promise<void> {
  // D-18: never overwrite existing stubs.
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.create(path, body);
  } catch (err) {
    // Race (another flow created between check + create) → silent per D-18.
    logger.debug('graph.createStubIfMissing: concurrent create', { path, err });
  }
}
```

**Divergence note** (D-18 Phase 4 divergence from Phase 2 BaseFile): **Stubs DO get re-created on user deletion** (silent re-create on next AC), whereas `LeetCode.base` is never re-created. The creation function itself is identical; the difference is that KnowledgeGraphWriter calls it on every AC unconditionally, while main.ts gates the `.base` ship on `legacyBaseNoticeShown` (or first-open only).

---

### `src/graph/submissionHistoryClient.ts` (service, REST client)

**Primary analog:** `src/solve/leetcodeRest.ts` (exact — same throttledRequestUrl pipe, same `authHeaders` helper, same three-layer session-expiry detection).

**Imports pattern** (from `leetcodeRest.ts:27-31`):
```typescript
import { throttledRequestUrl } from '../api/throttle';
import { SessionExpiredError } from '../shared/errors';
import { isSessionExpired } from '../api/LeetCodeClient';
import { authHeaders } from '../solve/leetcodeRest';   // REUSE — do not duplicate
import type { AuthCookies } from '../settings/SettingsStore';
```

**Request-shape pattern** (from `leetcodeRest.ts:90-118`):
```typescript
const BASE_URL = 'https://leetcode.com';

export async function listSubmissionsForSlug(
  slug: string,
  cookies: AuthCookies,
): Promise<SubmissionRow[]> {
  const res = await throttledRequestUrl({
    url: `${BASE_URL}/api/submissions/${slug}`,
    method: 'GET',
    headers: authHeaders(slug, cookies),  // REUSE Phase 3 header builder
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`listSubmissionsForSlug HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`);
  }
  const data = res.json as { submissions_dump?: Array<Record<string, unknown>> };
  return (data.submissions_dump ?? []).map(mapSubmissionRow);
}
```

**Three-layer session-expiry defense** (from `leetcodeRest.ts:65-82` — reuse verbatim or re-export; DO NOT duplicate the function body):
```typescript
// Option A (recommended): factor assertNotSessionExpired out of leetcodeRest.ts
// into a shared helper and re-use. Option B: duplicate verbatim. Choose A.
function assertNotSessionExpired(status: number, text: string, body: unknown): void {
  if (status === 302 || status === 303 || status === 401 || status === 403) {
    throw new SessionExpiredError();
  }
  if (status === 200 && typeof text === 'string' && text.length > 0 && text.length < 500_000) {
    const head = text.slice(0, 2000);
    if (/<title>Log In|<form[^>]+action="\/accounts\/login/i.test(head)) {
      throw new SessionExpiredError();
    }
  }
  if (isSessionExpired(body)) throw new SessionExpiredError();
}
```

**HTML-scrape pattern for submission detail** (NEW — from RESEARCH.md Pattern B, mirrors @leetnotion's scrape shape):
```typescript
export async function detailForSubmission(
  id: string,
  slug: string,
  cookies: AuthCookies,
): Promise<SubmissionDetail> {
  const res = await throttledRequestUrl({
    url: `${BASE_URL}/submissions/detail/${id}/`,
    method: 'GET',
    headers: authHeaders(slug, cookies),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`detailForSubmission HTTP ${String(res.status)}`);
  }
  const m = /var pageData = ({[^]+?});/.exec(res.text);
  if (!m) throw new Error('detailForSubmission: pageData not found in HTML');
  const jsonStr = m[1]!
    .replace(/'/g, '"')
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  return JSON.parse(jsonStr) as SubmissionDetail;
}
```

---

### `src/graph/SubmissionPickerModal.ts` (component, list-render Modal)

**Primary analog:** `src/solve/CustomTestModal.ts` (exact for Modal lifecycle + createEl discipline; list-row shape is unique to Phase 4).

**Class shape + constructor** (from `CustomTestModal.ts:37-59`):
```typescript
import { Modal, type App, type TFile } from 'obsidian';
import { logger } from '../shared/logger';

export interface SubmissionPickerModalArgs {
  file: TFile;
  slug: string;
  title: string;
  fetchHistory: () => Promise<SubmissionRow[]>;  // closure so tests inject scripted rows
  openDetailModal: (row: SubmissionRow) => void;
}

export class SubmissionPickerModal extends Modal {
  private readonly args: SubmissionPickerModalArgs;
  private rows: SubmissionRow[] = [];
  constructor(app: App, args: SubmissionPickerModalArgs) {
    super(app);
    this.args = args;
  }
}
```

**onOpen/onClose + createEl discipline** (from `CustomTestModal.ts:61-118`):
```typescript
onOpen(): void {
  const { contentEl, titleEl } = this;
  clear(contentEl);
  addClass(contentEl, 'leetcode-submissions-picker');
  if (titleEl) titleEl.textContent = 'Past submissions';
  this.renderLoading();
  void this.loadAndRender();
}

onClose(): void {
  clear(this.contentEl);
}
```

**Row-render pattern via createEl** (from `CustomTestModal.ts:122-147` — tab-row pattern generalizes to picker-row):
```typescript
private renderRows(): void {
  clear(this.contentEl);
  const listEl = appendEl(this.contentEl, 'div', 'leetcode-submissions-picker__list');
  listEl.setAttribute('role', 'listbox');
  this.rows.forEach((row) => {
    const rowEl = appendEl(listEl, 'div', 'leetcode-submissions-picker__row');
    rowEl.setAttribute('role', 'option');
    rowEl.setAttribute('tabindex', '0');
    // Verdict chip — compose with reused Phase 3 .leetcode-verdict-* color class
    const chip = appendEl(rowEl, 'span',
      `leetcode-submissions-picker__chip leetcode-verdict-${row.verdictKind}`);
    chip.textContent = row.verdictLabel;  // 'AC' / 'WA' / 'TLE' / ...
    // Date column
    const dateEl = appendEl(rowEl, 'span', 'leetcode-submissions-picker__date');
    dateEl.textContent = formatPickerDate(row.timestamp);
    // Runtime · Memory
    const perfEl = appendEl(rowEl, 'span', 'leetcode-submissions-picker__perf');
    perfEl.textContent = formatPerf(row.runtime, row.memory);
    // Language chip
    const langEl = appendEl(rowEl, 'span', 'leetcode-submissions-picker__lang');
    langEl.textContent = row.lang;

    rowEl.addEventListener('click', () => this.args.openDetailModal(row));
    rowEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { this.args.openDetailModal(row); }
    });
  });
}
```

**Empty / error / loading inline states** (from UI-SPEC §Layouts; no direct analog but followed from `VerdictModal.ts:67-99` pending-state pattern):
```typescript
private renderEmpty(): void {
  clear(this.contentEl);
  const box = appendEl(this.contentEl, 'div', 'leetcode-submissions-picker__empty');
  const h = appendEl(box, 'div', 'leetcode-submissions-picker__empty-heading');
  h.textContent = 'No submissions yet.';
  const b = appendEl(box, 'div', 'leetcode-submissions-picker__empty-body');
  b.textContent = 'Submit a solution to LeetCode to see it here.';
}

private renderError(): void {
  // Same DOM shape with __error-* classes; includes Retry button (28px, neutral).
  // NOT a Notice per D-06 (session expiry is the ONLY modal-closing Notice path).
}

private renderLoading(): void {
  // Same shape; uses `.leetcode-submissions-picker__spinner` + setIcon(el, 'loader')
  // + existing Phase 3 lc-spin keyframes.
}
```

**Session-expiry close-modal pattern** (from `main.ts:591-594` + VerdictModal approach):
```typescript
catch (err) {
  if (err instanceof SessionExpiredError) {
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
    new Notice('LeetCode session expired. Log in again.', 8000);
    this.close();
    return;
  }
  this.renderError();  // all other failures → inline
}
```

**Local DOM helpers** (copy verbatim from `CustomTestModal.ts:197-224`):
```typescript
function clear(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const maybe = el as unknown as { empty?: () => void };
  if (typeof maybe.empty === 'function') maybe.empty();
  else while (el.firstChild) el.removeChild(el.firstChild);
}

function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const doc = parent.ownerDocument ?? (globalThis as { document?: Document }).document;
  const el = (doc ?? document).createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function addClass(el: HTMLElement | null | undefined, cls: string): void {
  if (!el) return;
  const maybe = el as unknown as { addClass?: (c: string) => void };
  if (typeof maybe.addClass === 'function') maybe.addClass(cls);
  else el.classList.add(cls);
}
```

---

### `src/graph/SubmissionDetailModal.ts` (component, read-only viewer + MarkdownRenderer)

**Primary analog:** `src/solve/VerdictModal.ts` (Modal lifecycle + titleEl + footer right-aligned buttons + Close focus default). New addition is `MarkdownRenderer.render` for code — no direct in-repo analog (new Phase 4 primitive per RESEARCH.md Pattern 5).

**Modal lifecycle + titleEl** (from `VerdictModal.ts:44-64`):
```typescript
import { MarkdownRenderer, Modal, Notice, setIcon, Component, type App } from 'obsidian';

export class SubmissionDetailModal extends Modal {
  private renderChild: Component | null = null;

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    clear(contentEl);
    addClass(contentEl, 'leetcode-submissions-detail');
    if (titleEl) titleEl.textContent = `${this.args.verdictDisplay} — ${this.args.problemTitle}`;
    void this.loadAndRender();
  }

  override onClose(): void {
    if (this.renderChild) { this.removeChild(this.renderChild); this.renderChild = null; }
    clear(this.contentEl);
  }
}
```

**MarkdownRenderer.render lifecycle pattern** (from RESEARCH.md Pattern 5 — Phase 4 is first adopter; planner must enforce disposal):
```typescript
private async renderCodeBlock(code: string, lang: string): Promise<void> {
  const wrapper = appendEl(this.contentEl, 'div', 'leetcode-submissions-detail__code');
  const fenced = '```' + lang + '\n' + code + '\n```';
  this.renderChild = new Component();
  this.addChild(this.renderChild);   // Modal extends Component → lifecycle-managed
  await MarkdownRenderer.render(
    this.app,
    fenced,
    wrapper,
    '',                               // sourcePath — empty; no backing file
    this.renderChild,
  );
}
```

**Footer with accent CTA + secondary Close** (from `VerdictModal.ts:88-98` + `CustomTestModal.ts:83-102`):
```typescript
const footer = appendEl(this.contentEl, 'div', 'leetcode-submissions-detail__footer');

const copyBtn = appendEl(footer, 'button',
  'mod-cta leetcode-submissions-detail__copy');
setIcon(copyBtn, 'copy');
const copyLabel = appendEl(copyBtn, 'span');
copyLabel.textContent = ' Copy to ## Code';
copyBtn.addEventListener('click', () => { void this.handleCopyToCode(); });

const closeBtn = appendEl(footer, 'button', 'leetcode-submissions-detail__close');
closeBtn.textContent = 'Close';
closeBtn.addEventListener('click', () => this.close());

// Default focus on Close per UI-SPEC §Accessibility
try { (closeBtn as HTMLElement).focus(); } catch { /* headless */ }
```

**Copy-to-Code handler** (orchestrates ConfirmOverwriteModal + vault.process via copyToCode helper):
```typescript
private async handleCopyToCode(): Promise<void> {
  const currentBody = await this.app.vault.read(this.args.file);
  const hasNonEmptyCode = hasExistingCodeBlock(currentBody);  // from copyToCode.ts
  if (hasNonEmptyCode) {
    new ConfirmOverwriteModal(this.app, {
      onConfirm: async () => {
        await this.performCopy();
        this.close();
      },
    }).open();
  } else {
    await this.performCopy();
    this.close();
  }
}

private async performCopy(): Promise<void> {
  await copyToCode(this.app, this.args.file, this.args.code, this.args.lang);
}
```

---

### `src/graph/ConfirmOverwriteModal.ts` (component, sub-dialog)

**Primary analog:** `src/solve/VerdictModal.ts` footer section (partial — Modal shell + two-button footer + default-focus-on-safe-action). No dedicated confirm-dialog exists yet in the repo; this is a simplified Modal following the same shell conventions.

**Skeleton**:
```typescript
import { Modal, type App } from 'obsidian';

export interface ConfirmOverwriteModalArgs {
  onConfirm: () => void | Promise<void>;
}

export class ConfirmOverwriteModal extends Modal {
  private readonly args: ConfirmOverwriteModalArgs;
  constructor(app: App, args: ConfirmOverwriteModalArgs) { super(app); this.args = args; }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    clear(contentEl);
    addClass(contentEl, 'leetcode-submissions-confirm');
    if (titleEl) titleEl.textContent = 'Overwrite current code?';

    const body = appendEl(contentEl, 'div', 'leetcode-submissions-confirm__body');
    body.textContent = 'Your current ## Code block will be replaced with this submission.';

    const note = appendEl(contentEl, 'div', 'leetcode-submissions-confirm__note');
    note.textContent = "This can't be undone from the modal, but Obsidian's undo (Cmd/Ctrl+Z) works after closing.";

    const footer = appendEl(contentEl, 'div', 'leetcode-submissions-confirm__footer');
    const yesBtn = appendEl(footer, 'button', 'mod-cta leetcode-submissions-confirm__yes');
    yesBtn.textContent = 'Yes, overwrite';
    yesBtn.addEventListener('click', async () => {
      try { await this.args.onConfirm(); } finally { this.close(); }
    });
    const cancelBtn = appendEl(footer, 'button', 'leetcode-submissions-confirm__cancel');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());
    // Default focus on Cancel per UI-SPEC §Accessibility (destructive protection).
    try { (cancelBtn as HTMLElement).focus(); } catch { /* headless */ }
  }

  override onClose(): void { clear(this.contentEl); }
}
```

---

### `src/graph/copyToCode.ts` (utility, vault.process helper)

**Primary analog:** `src/solve/customTestStore.ts::writeCasesToVault` (exact — vault.process wrapper) + `src/solve/starterCodeInjector.ts::forceInjectCodeSection` (for the pure `## Code` fence-rewrite transform, called from `main.ts:658-660`).

**Vault wrapper pattern** (from `customTestStore.ts:67-73`):
```typescript
import type { App, TFile } from 'obsidian';
import { forceInjectCodeSection } from '../solve/starterCodeInjector';  // REUSE — pure transform

export async function copyToCode(
  app: App,
  file: TFile,
  code: string,
  langSlug: string,
): Promise<void> {
  await app.vault.process(file, (current) =>
    forceInjectCodeSection(current, { starterCode: code, langSlug }),
  );
}
```

**Helper for "has non-empty code?" check** (new utility; reuses `extractFirstFencedBlock` from `src/solve/codeExtractor.ts`):
```typescript
import { extractFirstFencedBlock } from '../solve/codeExtractor';

export function hasExistingCodeBlock(body: string): boolean {
  const extracted = extractFirstFencedBlock(body);
  return extracted !== null && extracted.code.trim().length > 0;
}
```

---

### `src/shared/dates.ts` OR `NoteTemplate.ts` extension (utility, pure Date helper)

**Primary analog:** `src/notes/NoteTemplate.ts::buildNoteFilename` and `codeBlockFor` (pure helpers sibling-pattern) + `src/solve/statusMap.ts` (pure, zero imports).

**Helper pattern** (from RESEARCH.md Pattern 6 — new primitive; canonical form):
```typescript
// src/shared/dates.ts
/**
 * Format a Date as ISO-8601 local-timezone: `YYYY-MM-DDTHH:MM:SS±HH:MM`.
 * DST-aware via native Date.getTimezoneOffset (MDN-documented behavior).
 * Pure: no imports, no I/O, same input → same output.
 */
export function toIsoLocalTz(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = Math.floor(abs / 60);
  const om = abs % 60;
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    sign + pad(oh) + ':' + pad(om)
  );
}
```

---

### `src/notes/NoteTemplate.ts` **(modified)** — service (template SSoT extensions)

**Self-analog:** existing `PROBLEM_HEADING_LINE` / `CODE_HEADING_LINE` / `NOTES_HEADING_LINE` / `CUSTOM_TESTS_HEADING_LINE` constants at `NoteTemplate.ts:41-48` — Phase 4 adds `TECHNIQUES_HEADING_LINE`.

**Additions** (new exports at same file, preserving SSoT invariant from header comment at `NoteTemplate.ts:1-19`):
```typescript
// Phase 4 extensions — NoteTemplate remains the SSoT for all plugin-owned headings.
export const TECHNIQUES_HEADING_LINE = '## Techniques' as const;

/** Emits the bulleted wikilink list for ## Techniques per D-12. */
export function buildTechniquesBlock(topicTags: Array<{ name: string }>): string {
  const bullets = topicTags.map((t) => `- [[${t.name}]]`).join('\n');
  return `${TECHNIQUES_HEADING_LINE}\n\n${bullets}`;
}

/** Emits the frontmatter-only stub note body per D-16. */
export function buildTechniqueStubBody(slug: string, name: string): string {
  return `---\nlc-technique: ${slug}\naliases:\n  - ${name}\ntags:\n  - lc/technique/${slug}\n---\n\n`;
}

/** D-17: replace vault-forbidden chars with '-'; preserve '+' for C++. */
export function buildTechniqueFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, '-');
  return `${safe}.md`;
}
```

**Extended applyFrontmatter pattern** (extend at `NoteTemplate.ts:200-248`): Phase 4 adds 4 new lc-* writes to the same callback, plus expands `pluginTags` to include topic slugs. The existing GAP-2a non-downgrade guard at lines 220-228 is PRESERVED — only Phase 4's KnowledgeGraphWriter calls with `initialStatus: 'accepted'`, which feeds through the same branch.

```typescript
// Inside processFrontMatter callback, extend section 1:
fm['lc-solved-date'] = toIsoLocalTz(new Date());
if (typeof runtimeMs === 'number') fm['lc-runtime-ms'] = runtimeMs;
if (typeof memoryMb === 'number') fm['lc-memory-mb'] = memoryMb;
fm['lc-language'] = input.language;  // now sourced from submission, not settings
```

---

### `src/notes/NoteWriter.ts` **(modified)** — optional submission-history refetch hook

**Self-analog:** existing `backgroundRefresh` pattern at `NoteWriter.ts:168-172, 313-333` (fire-and-forget + silent debug on failure). Phase 4's D-02 submission-history refetch-on-open uses the EXACT same shape; RESEARCH §Open Question 1 recommends an in-memory-per-slug cache.

**Extension pattern**:
```typescript
// After the existing backgroundRefresh call at NoteWriter.ts:169
if (cacheStale) {
  void this.backgroundRefresh(existingFile as unknown as TFile, slug).catch((err) => {
    logger.debug('notes.backgroundRefresh: swallowed failure', err);
  });
}
// NEW — unconditional submission-history refetch per D-02 (always live, no TTL)
void this.submissionHistory.refetchForSlug(slug).catch((err) => {
  logger.debug('notes.submissionHistoryRefetch: swallowed failure', err);
});
```

**Planner-decides:** whether to plumb the submission-history client through NoteWriter constructor DI (adds one more dep) or hook it at `main.ts` via `app.workspace.on('file-open', ...)`. Prefer the main.ts-level hook — keeps NoteWriter's concern "open/refresh problem notes" unchanged.

---

### `src/settings/SettingsStore.ts` **(modified)** — adds `autoBacklinksEnabled` + `topicTags` in DetailCacheEntry

**Self-analog:** existing `isPremium: boolean | null` field at `SettingsStore.ts:42` + shape-guard at `SettingsStore.ts:227` + getter/setter at `SettingsStore.ts:291-295` (EXACT pattern).

**`autoBacklinksEnabled` additions**:
```typescript
// DEFAULT_DATA (at SettingsStore.ts:75-86) — add:
autoBacklinksEnabled: true,   // D-21 default ON

// PluginData interface (at SettingsStore.ts:35-57) — add:
autoBacklinksEnabled: boolean;

// load() shape-guard (mirrors isPremium at SettingsStore.ts:227):
autoBacklinksEnabled: typeof raw.autoBacklinksEnabled === 'boolean'
  ? raw.autoBacklinksEnabled
  : DEFAULT_DATA.autoBacklinksEnabled,

// getters/setters (mirror getIsPremium/setIsPremium at SettingsStore.ts:291-295):
getAutoBacklinksEnabled(): boolean { return this.data.autoBacklinksEnabled; }
async setAutoBacklinksEnabled(v: boolean): Promise<void> {
  this.data.autoBacklinksEnabled = v;
  await this.persist();
}

// Derived getter (D-15) — no new field; delegates to getProblemsFolder():
getTechniquesFolder(): string {
  return this.getProblemsFolder() + '/Techniques';
}
```

**`DetailCacheEntry.topicTags` extension** (mirrors `internalQuestionId?: string` optional field at `SettingsStore.ts:31-32`):
```typescript
// DetailCacheEntry (at SettingsStore.ts:18-33) — add:
topicTags?: Array<{ name: string; slug: string }>;

// isValidDetailCacheEntry shape-guard (at SettingsStore.ts:173-198) — add before the closing return true:
if (d.topicTags !== undefined) {
  if (!Array.isArray(d.topicTags)) return false;
  if (!d.topicTags.every((t) =>
    t && typeof t === 'object' &&
    typeof (t as { name?: unknown }).name === 'string' &&
    typeof (t as { slug?: unknown }).slug === 'string'
  )) return false;
}
```

---

### `src/main.ts` **(modified)** — register writer + new command + wire into submitFromActive

**Self-analog:** existing Phase 3 command-registration pattern at `main.ts:183-194, 217-227` + `submitFromActive` lambda at `main.ts:417-512`.

**New command registration** (exact copy of Phase 3 editorCheckCallback gate from `main.ts:217-227`):
```typescript
this.addCommand({
  id: 'view-past-submissions',
  name: 'View past submissions',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.viewPastSubmissionsFromActive(); }
    return true;
  },
});
```

**submitFromActive AC-hook** (extend at `main.ts:475-482`, after `assertKnownVerdictOrThrow` and before `modal.renderVerdict`):
```typescript
const terminalTyped = terminal as SubmitCheckResponse;
assertKnownVerdictOrThrow(terminalTyped);
modal.renderVerdict(terminalTyped, ctx.title);

// ── Phase 4 on-AC graph write ──
if (classifyStatus(terminalTyped.status_code).kind === 'ac') {
  try {
    await this.knowledgeGraph.onAccepted(ctx, terminalTyped);
  } catch (err) {
    // Silent per UI-SPEC — graph write failure never surfaces to user.
    logger.debug('graph.onAccepted failed', err);
  }
}
```

**Step 5.7 wiring in onload()** (extend at `main.ts:117-119`):
```typescript
// Step 5.7 — knowledge graph writer (Phase 4). Singleton, constructed with
// structural DI that extends NoteWriterSettings with Phase 4-specific getters.
this.knowledgeGraph = new KnowledgeGraphWriter({
  app: this.app,
  settings: {
    getProblemDetail: (s) => this.settings.getProblemDetail(s),
    getAutoBacklinksEnabled: () => this.settings.getAutoBacklinksEnabled(),
    getProblemsFolder: () => this.settings.getProblemsFolder(),
    getTechniquesFolder: () => this.settings.getTechniquesFolder(),
    getDefaultLanguage: () => this.settings.getDefaultLanguage(),
  },
});
```

---

### `styles.css` **(modified)** — scoped `.leetcode-submissions-*` classes

**Self-analog:** existing Phase 3 `.leetcode-custom-test-*` + `.leetcode-verdict-*` blocks. UI-SPEC §CSS skeleton (lines 708-856) provides the literal CSS to append. Rules:
- Reuse `.leetcode-verdict-ac` / `-wa` / etc. — do NOT redefine.
- Compose `.leetcode-submissions-picker__chip` with verdict color class at DOM level.
- Reuse existing `lc-spin` keyframes from Phase 3 — do NOT redefine.

---

## Shared Patterns

### Logger + silent-fail discipline

**Source:** `src/shared/logger.ts` (referenced throughout — used at `NoteWriter.ts:158, 243, 259`, `submissionOrchestrator.ts:262`, `BaseFile.ts:108-110`, `CustomTestModal.ts:191`, `VerdictModal.ts:197`).

**Apply to:** All Phase 4 files EXCEPT the pure transforms (`mergeTechniquesSection.ts`, `dates.ts`, and the `NoteTemplate` helper additions).

```typescript
import { logger } from '../shared/logger';
// Catch-and-log on non-critical paths:
try { await someIO(); }
catch (err) { logger.debug('graph.<operation>: non-fatal', err); }
```

### Session-expiry three-layer defense

**Source:** `src/solve/leetcodeRest.ts:65-82` (`assertNotSessionExpired`).

**Apply to:** `src/graph/submissionHistoryClient.ts` (EXACT reuse — either factor shared helper OR copy verbatim per RESEARCH §Pattern B example).

### `authHeaders` REST header builder

**Source:** `src/solve/leetcodeRest.ts:41-51` (`authHeaders(slug, cookies)`).

**Apply to:** `src/graph/submissionHistoryClient.ts` — **import + reuse**, do NOT duplicate. Header set is locked at UI/contract level (CF-29).

### createEl DOM discipline (CF-07)

**Source:** `src/solve/CustomTestModal.ts:197-224` — `clear()`, `appendEl()`, `addClass()` local helpers.

**Apply to:** All three new modals (`SubmissionPickerModal.ts`, `SubmissionDetailModal.ts`, `ConfirmOverwriteModal.ts`). Copy the helpers verbatim (each modal keeps its own copy; these are trivial utilities).

### Pure-transform + `vault.process` invariant

**Source:** `src/notes/HeadingRegion.ts:13-20` (purity header) + `src/solve/CaseRegion.ts:20-23` (safe-inside-vault.process comment).

**Apply to:** `src/graph/mergeTechniquesSection.ts` — must be pure (no captured state, same inputs → same outputs) so `vault.process` retry-on-conflict is safe.

### frontmatter union-merge inside processFrontMatter callback

**Source:** `src/notes/NoteTemplate.ts::applyFrontmatter` at `NoteTemplate.ts:200-248` (tags + aliases union; lc-status non-downgrade guard).

**Apply to:** `src/graph/KnowledgeGraphWriter.ts` — **do NOT write a second `processFrontMatter` pass** in the graph writer. Instead, extend `applyFrontmatter`'s callback OR call `applyFrontmatter` with a Phase 4-extended `NoteTemplateInput` that carries `topicSlugs` in `pluginTags` + the solve-time values. Planner decides the exact factoring; the invariant is ONE callback passes per AC.

### Notice copy — sentence case + terminal period + disable-rule

**Source:** `src/main.ts:386-390, 501-502, 592-594`; `src/solve/submissionOrchestrator.ts:154, 162-166, 174-178, 186`.

**Apply to:** Phase 4 — only the two reused Notices (session-expiry + rate-limit). No new Notice copy per UI-SPEC. ESLint disable line comment `// eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED` precedes each.

### `editorCheckCallback` slug-guard pattern

**Source:** `src/main.ts:183-194` + `src/solve/slugGuard.ts::isValidSlug`.

**Apply to:** `src/main.ts` new `view-past-submissions` command — **exact reuse**. Do NOT re-implement slug validation.

### Shape-guard + backward-compat for `PluginData` additions

**Source:** `src/settings/SettingsStore.ts:227` (`isPremium` boolean-or-null guard) + `SettingsStore.ts:193-197` (`internalQuestionId` optional-string guard).

**Apply to:** `autoBacklinksEnabled` (boolean, default `true`) + `topicTags` (optional array). Both must have shape-guard tests against pre-Phase-4 `data.json` fixtures (RESEARCH §Pitfall 9, 10).

---

## Test Analogs — Detailed

### `tests/graph/mergeTechniquesSection.test.ts`

**Analog:** `tests/solve/CaseRegion.test.ts` (exact — same describe shape: "readCases" / "writeCases" → "parseTechniques" / "mergeTechniquesSection"; same `expect(result).toEqual([...])` + string-roundtrip assertions; same empty/absent/multi-item branches).

**Test shape to copy** (from `CaseRegion.test.ts:4-67`):
```typescript
import { describe, it, expect } from 'vitest';
import { mergeTechniquesSection } from '../../src/graph/mergeTechniquesSection';

describe('mergeTechniquesSection (GRAPH-03, D-13)', () => {
  it('appends ## Techniques after ## Notes when section is absent', () => { ... });
  it('writes one `- [[Name]]` bullet per topic tag in LC order', () => { ... });
  it('preserves user-added non-link lines in their original position', () => { ... });
  it('preserves user-added `[[Custom]]` wikilinks that are not LC topics', () => { ... });
  it('is idempotent: merge(merge(body, tags), tags) === merge(body, tags)', () => { ... });
  it('no-ops when topicTags is empty and section does not exist (D-25)', () => { ... });
  it('tolerates `*` and `+` bullets as link markers', () => { ... });
});
```

### `tests/graph/stubNoteCreator.test.ts`

**Analog:** `tests/base-file-ship.test.ts` + `tests/base-file-preserve.test.ts` (exact — same `makeMockVaultApp` harness, same "create if missing / no-op if present" describe split).

### `tests/graph/submissionHistoryClient.test.ts`

**Analog:** `tests/solve/leetcodeRest.test.ts` (EXACT — copy the file skeleton, swap endpoints):
- `vi.mock('../../src/api/throttle', ...)` and `vi.mock('../../src/api/LeetCodeClient', ...)` at the top (lines 35-50 verbatim).
- `mockThrottledRequestUrl.mockResolvedValueOnce({ status, headers, text, json })` per-test scripting.
- Assertions on `url`, `method`, `headers['cookie']`, `headers['x-csrftoken']`, `headers['referer']`.
- `expect(...).rejects.toBeInstanceOf(SessionExpiredError)` for 302 / 401 / 403 / HTML-login.
- `expect(...).rejects.toThrow(/500/)` for non-auth 5xx.

### `tests/graph/onAccepted.frontmatter.test.ts`

**Analog:** `tests/note-frontmatter-write.test.ts` (EXACT — `makeMockVaultApp` + `applyFrontmatter` → `onAccepted`). Test shape to copy (from `note-frontmatter-write.test.ts:5-30`):
```typescript
import { makeMockVaultApp } from './helpers/mock-vault';
import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';
import { makeFakeSettingsStore, makeDetailCacheEntry } from '../solve/mocks/fakeSettingsStore';

it('writes lc-solved-date, lc-runtime-ms, lc-memory-mb, lc-language, lc-status on AC', async () => {
  const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n' });
  const settings = makeFakeSettingsStore({
    problemDetails: { 'two-sum': makeDetailCacheEntry({ id: 1, topicTags: [{ name: 'Hash Table', slug: 'hash-table' }] }) },
  });
  const writer = new KnowledgeGraphWriter({ app: m.app as never, settings: { ...settings, getAutoBacklinksEnabled: () => true, getTechniquesFolder: () => 'LeetCode/Techniques' } });
  await writer.onAccepted(ctx, acceptedTerminalFixture);
  const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
  expect(fm!['lc-status']).toBe('accepted');
  expect(fm!['lc-solved-date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  expect(fm!['lc-runtime-ms']).toBe(12);
  expect(fm!['lc-memory-mb']).toBe(14.2);
  expect(fm!['lc-language']).toBe('python3');
});
```

### `tests/graph/mocks/fakeKnowledgeGraphDeps.ts`

**Analog:** `tests/solve/mocks/fakeSettingsStore.ts` (EXACT — same shape; extend `FakeSettings` interface with `getAutoBacklinksEnabled`, `getTechniquesFolder`, `getProblemsFolder`).

### `tests/graph/mocks/fakeSubmissionHistoryFetcher.ts`

**Analog:** `tests/solve/mocks/fakeFetcher.ts` (EXACT — same `makeFakeFetcher` FIFO-queue pattern; script submission-list + detail responses per URL regex).

### `tests/shared/dates.test.ts`

**Analog:** `tests/solve/statusMap.test.ts` (role-match — pure helper, simple assertion shape). Test pattern:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toIsoLocalTz } from '../../src/shared/dates';

describe('toIsoLocalTz (GRAPH-02, D-10)', () => {
  it('emits YYYY-MM-DDTHH:MM:SS±HH:MM shape', () => { ... });
  it('uses + sign for positive offsets (e.g., Asia/Tokyo)', () => { ... });
  it('uses - sign for negative offsets (e.g., America/Los_Angeles)', () => { ... });
  it('DST boundary: Feb 1 2026 PST → -08:00; Mar 9 2026 04:00 PDT → -07:00', () => { ... });
});
```

### `tests/fixtures/lc-submissions/*.json`

**Analog:** `tests/solve/fixtures/` (existing Phase 3 live-captured verdict fixtures). Wave 0 live-capture step required per RESEARCH §Assumption A2, A3 — capture against real LC and commit as JSON, then build `mapSubmissionRow` against fixture shape.

---

## No Analog Found (Greenfield Patterns)

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *(none — `ConfirmOverwriteModal.ts` has partial analog via VerdictModal footer; all other files have exact or role-match analogs)* | | | |

All 21 files have either exact or role-match analogs in the repo. `MarkdownRenderer.render` is the only API call with no in-repo prior art — RESEARCH §Pattern 5 supplies the canonical usage + disposal pattern.

---

## Metadata

**Analog search scope:** `src/solve/` (13 files) + `src/notes/` (7 files) + `src/settings/` (2 files) + `src/api/` (3 files) + `src/shared/` (3 files) + `src/main.ts` + `tests/solve/` (17 files) + `tests/notes/` (1 file) + `tests/` root (23 files) + `tests/solve/mocks/` (2 files) + `tests/solve/fixtures/` + `tests/fixtures/`

**Files scanned:** ~72 TS source + test files

**Pattern extraction date:** 2026-05-09

**Output file:** `.planning/phases/04-knowledge-graph-wiring/04-PATTERNS.md`
