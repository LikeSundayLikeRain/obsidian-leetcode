# Phase 08: AI Debug — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 21 (5 new, 16 modified, plus tests)
**Analogs found:** 21 / 21 (every new/modified file has a load-bearing precedent in repo)

> Every pattern below cites a concrete file path + line range. Planner MUST emit
> `read_first` lists that include the analog file, and `acceptance_criteria` that
> mirror the analog's shape. No re-invention — every primitive Phase 08 needs
> already exists somewhere in `src/ai/`, `src/solve/`, `src/preview/`, or
> `src/main/`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ai/AIStreamModal.ts` (NEW) | component (Modal) | streaming + event-driven | `src/preview/ProblemPreviewView.ts` (MarkdownRenderer.render) + `src/solve/VerdictModal.ts` (Modal lifecycle, footer button row, default-focus, onClose cleanup) + `src/ai/disclosure.ts` (Modal scaffolding) | exact (composite) |
| `src/ai/buildDebugPrompt.ts` (NEW) | utility (pure function) | transform | `src/solve/codeExtractor.ts` (pure string-transform helper, no I/O, no captured state) | role-match (pure transform) |
| `src/solve/lastVerdictStore.ts` (NEW — placement locked by RESEARCH §"Architectural Responsibility Map") | model (in-memory store) | event-driven (set on orchestrator post-resolve) | `src/solve/ephemeralTabStore.ts` (Map-on-Plugin instance, slug-keyed, in-memory only, dispose() in onunload) | exact |
| `src/ai/types.ts` (MODIFY — fill empty interfaces) | model (type definitions) | n/a | self (Phase 07 baseline at lines 60-72; ProviderConfig at 21-26 is the field-shape precedent) | exact |
| `src/ai/AIClient.ts` (MODIFY — add `invokeStream`) | service (facade) | request-response → streaming | self (existing `invoke` at lines 130-160 is the disclosure-gate posture to mirror) | exact |
| `src/ai/disclosure.ts` (MODIFY — add `withDebugBullet`) | utility (factory) | transform | self (DISCLOSURE_BASE_COPY at lines 55-73 is the frozen baseline to extend by composition) | exact |
| `src/ai/providers/anthropic.ts` (MODIFY — add stream/buffered invoke) | service (adapter) | streaming | self (existing `probeAnthropic` at lines 30-46 is the SDK-call posture: createAnthropicModel + generateText/streamText + try/catch) | exact |
| `src/ai/providers/openai.ts` (MODIFY) | service (adapter) | streaming | self (existing `probeOpenAI` at lines 22-45) | exact |
| `src/ai/providers/openaiCompatible.ts` (MODIFY) | service (adapter) | streaming | self (existing `probeCustom` / `probeOpenRouter` / `probeViaOneTokenChat` at lines 29-117) | exact |
| `src/ai/providers/ollama.ts` (MODIFY) | service (adapter) | streaming | self (existing `probeOllama` at lines 23-53) | exact |
| `src/ai/providers/index.ts` (MODIFY — replace invoke stubs) | service (dispatch) | n/a | self (existing `resolveAdapter` switch at lines 84-126) | exact |
| `src/main/codeBlockButtonRow.ts` (MODIFY — add 3rd button) | component (DOM factory) | event-driven | self (existing 2-button precedent at lines 29-66 with chevron-prefix slot) | exact |
| `src/solve/VerdictModal.ts` (MODIFY — pass onOpenAIDebug down) | component (Modal) | event-driven | self (existing onCopyFailingInput plumbing at lines 27-33, 105-125) | exact |
| `src/solve/verdictModalRenderer.ts` (MODIFY — conditional AI Debug footer button) | component (pure renderer) | event-driven | self (existing conditional Copy-failing-input button at lines 483-505) | exact |
| `src/solve/RunModal.ts` (MODIFY) | component (Modal) | event-driven | `src/solve/RunModal.ts` (own footer at `.leetcode-run-footer` — see RESEARCH §Pitfall — Surface 3 may collapse into Surface 2) | exact |
| `src/solve/submissionOrchestrator.ts` (MODIFY — onVerdict callback) | service (orchestrator) | event-driven | self (existing `SubmissionOrchestratorDeps` at lines 51-74 — pure DI shape; add `onVerdict?` next to `login?`) | exact |
| `src/solve/pollingOrchestrator.ts` (MODIFY — propagate verdict) | service (orchestrator) | event-driven | self + `submissionOrchestrator.ts` (resolve point pattern) | exact |
| `src/main.ts` (MODIFY — palette command + LastVerdictStore field + openAIDebug + register orchestrator callback) | main (plugin host) | event-driven | self (existing `addCommand({ id: 'submit', editorCheckCallback })` at lines 425-436 + `EphemeralTabStore` instantiation at line 256 + `requireAIDisclosure` factory at lines 855-895) | exact |
| `styles.css` (MODIFY — add 5 selectors) | config (styles) | n/a | self (`.leetcode-ai-disclosure` at line 212; `.leetcode-verdict-footer/action-row` at 627-633; `.leetcode-submissions-loading/error` at 741-751; `.leetcode-code-action-run/submit` at 971-988; `.leetcode-preview__body markdown-rendered` at 1346) | exact |
| `tests/main/codeBlockButtonRow.test.ts` (MODIFY — bump 2→3, 3→4) | test (unit) | n/a | self (existing assertions at lines 29-67 and 69-80) | exact |
| `tests/solve/VerdictModal.test.ts` (NEW or extend `verdictModalRenderer.test.ts`) | test (unit) | n/a | `tests/solve/verdictModalRenderer.test.ts` (DOM stubs, fixture replay, footer assertions) | exact |
| `tests/solve/lastVerdictStore.test.ts` (NEW) | test (unit) | n/a | `tests/solve/ephemeralTabStore.test.ts` (Plugin-instance Map, set/get/clear, dispose) | exact |
| `tests/ai/AIStreamModal*.test.ts` (NEW × 4 — streaming, fallback, cancel, debounce) | test (unit) | n/a | `tests/ai/disclosure.test.ts` (Modal mock + DOM inspection + button capture) | exact |
| `tests/ai/buildDebugPrompt.test.ts` (NEW) | test (unit) | n/a | pure-function tests pattern (no analog needed; vitest fixtures) | partial |
| `tests/ai/AIClient.invokeStream.test.ts` (NEW) | test (unit) | n/a | `tests/ai/aiClient.test.ts` (resolveAdapter mock, vi.mock('obsidian'), MockSettings factory at lines 12-63) | exact |
| `tests/ai/disclosure.test.ts` (EXTEND — add `withDebugBullet` cases) | test (unit) | n/a | self (existing shape assertions at lines 1-80) | exact |

---

## Pattern Assignments

### `src/ai/AIStreamModal.ts` (NEW — component, streaming)

**Primary analog:** `src/solve/VerdictModal.ts` (Modal subclass scaffolding, args interface, footer construction, default-focus, onClose cleanup, Notice on copy)

**Secondary analog:** `src/preview/ProblemPreviewView.ts` (MarkdownRenderer.render call shape)

**Tertiary analog:** `src/ai/disclosure.ts` (constructor args + onClose double-fire guard)

**Imports pattern** (from `src/solve/VerdictModal.ts:20-23`):
```typescript
import { Modal, Notice, setIcon, type App } from 'obsidian';
import { logger } from '../shared/logger';
```
Plus from `src/preview/ProblemPreviewView.ts` precedent:
```typescript
import { MarkdownRenderer } from 'obsidian';
import { setWindowTimeout, clearWindowTimeout, type TimerHandle } from '../shared/timers';
```

**Args interface pattern** (from `src/solve/VerdictModal.ts:27-33`):
```typescript
export interface VerdictModalArgs {
  problemTitle: string;
  onCancel: () => void;
  onCopyFailingInput?: (input: string) => void;
}
```
Phase 08 mirror — `AIStreamModalArgs` carries `provider`, `prompt`, `aiClient`, optional `disclosureCopy`, optional `onCancel` callback.

**Modal scaffolding pattern** (from `src/solve/VerdictModal.ts:34-45`):
```typescript
export class VerdictModal extends Modal {
  private readonly args: VerdictModalArgs;

  constructor(app: App, args: VerdictModalArgs) {
    super(app);
    this.args = args;
  }

  private isPending = false;

  onOpen(): void {
    this.isPending = true;
    this.renderPending();
  }
```

**onClose anti-zombie pattern** (from `src/solve/VerdictModal.ts:49-63`) — load-bearing for AIDBG-03:
```typescript
onClose(): void {
  // If the user dismisses the modal (ESC, overlay click, or X) while the
  // submission is still in flight, treat it as Cancel so the orchestrator
  // flips the abort flag instead of leaving the poll loop running.
  if (this.isPending) {
    this.isPending = false;
    try { this.args.onCancel(); } catch { /* ignore — cleanup */ }
  }
  const { contentEl } = this;
  if (contentEl && typeof (contentEl as unknown as { empty?: () => void }).empty === 'function') {
    (contentEl as unknown as { empty: () => void }).empty();
  } else if (contentEl) {
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
  }
}
```
**Apply to AIStreamModal** — replace `this.args.onCancel()` with `this.abortController.abort()`. Same `isPending` guard pattern (rename `inFlight = !completed && !cancelled`).

**Footer construction pattern** (from `src/solve/VerdictModal.ts:86-96`):
```typescript
const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
const cancelBtn = appendEl(footer, 'button');
cancelBtn.textContent = 'Cancel';
cancelBtn.addEventListener('click', () => {
  this.args.onCancel();
  this.close();
});
// Default-focus the Cancel button per UI-SPEC §Accessibility.
if (typeof (cancelBtn as unknown as { focus?: () => void }).focus === 'function') {
  try { (cancelBtn).focus(); } catch { /* headless */ }
}
```

**Body region pattern** (from `src/solve/VerdictModal.ts:75-76`) — `aria-live="polite"`:
```typescript
const body = appendEl(contentEl, 'div', 'leetcode-verdict-body leetcode-verdict-body--pending');
body.setAttribute('aria-live', 'polite');
```

**MarkdownRenderer.render pattern** (from `src/preview/ProblemPreviewView.ts:474-481`):
```typescript
// The `markdown-rendered` class co-applied alongside `leetcode-preview__body`
// pulls Obsidian's reading-mode CSS cascade onto the rendered body
// (code-block backgrounds, copy buttons, prose typography). Without it
// the body inherits no font cascade and examples fall back to plain
// prose at the chrome's `--font-ui-small` size — see 06-UAT.md gap #1.
const body = root.createDiv({ cls: 'leetcode-preview__body markdown-rendered' });
const md = htmlToMarkdown(detail.contentHtml);
void MarkdownRenderer.render(this.app, md, body, '', this);
```
**Apply to AIStreamModal** — same call shape with `this.bodyEl` co-classed `leetcode-ai-stream-body markdown-rendered`. The `this` in the 5th arg satisfies `obsidianmd/no-plugin-as-component` because Modal extends Component.

**Counter timer pattern** (from `src/preview/ProblemPreviewView.ts:524-528, 528-535`):
```typescript
if (this.detachHandle != null) {
  clearWindowTimeout(this.detachHandle);
  this.detachHandle = null;
}
this.detachHandle = setWindowTimeout(() => {
  /* tick */
}, POST_ACTION_DETACH_MS);
```
**Apply to AIStreamModal** — `counterTimer: TimerHandle | null = null`; recursive `setWindowTimeout(() => this.tick(), 1000)` for mm:ss.

**Notice + clipboard pattern** (from `src/solve/VerdictModal.ts:198-208`):
```typescript
const text = safeStringify(payload);
try {
  const clip = activeWindow.navigator?.clipboard;
  if (clip?.writeText) {
    void clip.writeText(text);
  }
  new Notice('Payload copied.', 2000);
} catch (err) {
  logger.debug('solve.verdict.copyPayload: clipboard unavailable', err);
}
```
**Apply to AIStreamModal** — replace `'Payload copied.'` with `'AI response copied.'` (UI-SPEC locked verbatim) and add the `'Clipboard unavailable.'` 4000ms Notice on the catch branch.

**AbortController + try/catch + signal-aborted distinguish pattern** (from `08-RESEARCH §"Code Examples" Example 1` + `08-RESEARCH §Pitfall 2`):
```typescript
try {
  for await (const chunk of result.textStream) {
    if (chunk.length === 0) continue;   // Assumption A3 guard
    this.buffer += chunk;
    this.scheduleRender();
  }
  // ...
} catch (err) {
  if (this.abortController.signal.aborted) {
    this.cancelled = true;
    await this.args.aiClient.addCost(0);   // Pitfall 6 — don't bill cancelled
    this.swapToCancelledFooter();
    return;
  }
  this.handleError(err);
}
```

**Acceptance criteria** (planner mirrors against analog):
- `extends Modal`; constructor `(app: App, args: AIStreamModalArgs)`; private `args`.
- `onOpen()` paints title + body (Thinking…) + footer (Cancel button); kicks off invokeStream; default-focuses Cancel.
- `onClose()` `if (!completed && !cancelled) abortController.abort()`; clears all timers; empties contentEl.
- Body uses `'leetcode-ai-stream-body markdown-rendered'` co-class; `aria-live="polite"`.
- All button listeners attached at construction; no `unregisterEvent` needed (DOM nodes go with `contentEl.empty()`).

---

### `src/ai/buildDebugPrompt.ts` (NEW — utility, transform)

**Analog:** `src/solve/codeExtractor.ts` (pure string transform; no captured state; no imports beyond types)

**Imports pattern** (from `src/solve/codeExtractor.ts:1-22`):
```typescript
// (no imports — pure string transform, safe inside vault.process retry)
```
Phase 08 mirror — buildDebugPrompt imports ONLY the `LastVerdict` type:
```typescript
import type { LastVerdict } from '../solve/lastVerdictStore';
```

**Pure-function shape pattern** (from `src/solve/codeExtractor.ts:46-60`):
```typescript
export function extractFirstFencedBlock(noteBody: string): ExtractedCode | null {
  const lines = noteBody.split('\n');
  // ... pure transform; same input → same output
}
```

**Core pattern** — locked illustrative shape from RESEARCH §Pattern 3 (lines 434-475 of 08-RESEARCH.md):
```typescript
export function buildDebugPrompt(args: {
  problemMd: string;
  code: string;
  language: string;
  lastVerdict?: LastVerdict;
}): string {
  const verdictBlock = args.lastVerdict
    ? formatVerdictBlock(args.lastVerdict)
    : 'No verdict yet — review the code as-is.';
  return [
    'You are debugging a LeetCode solution. Be concise. Do not rewrite the entire problem.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## My ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## What happened on my last run',
    verdictBlock,
    // ...
  ].join('\n');
}
```

**Acceptance criteria:**
- Pure: no `app`/`Plugin`/`Vault` references; no I/O.
- Empty-store path emits literal `'No verdict yet — review the code as-is.'` (verbatim).
- `## Notes` content NEVER appears in output (locked decision A; assert via fixture round-trip).
- Determinism: same args → byte-identical output.

---

### `src/solve/lastVerdictStore.ts` (NEW — model, event-driven)

**Analog:** `src/solve/ephemeralTabStore.ts` (Map-on-Plugin, in-memory, slug-keyed, dispose())

**Imports pattern** (from `src/solve/ephemeralTabStore.ts:33`):
```typescript
import { MarkdownView, TFile, type Plugin } from 'obsidian';
```
Phase 08 mirror (no Plugin needed because LastVerdictStore has NO reconcile loop — see RESEARCH §"Anti-Patterns to Avoid" #6):
```typescript
// (no imports beyond local types — Map-only, no workspace events)
```

**Class skeleton pattern** (from `src/solve/ephemeralTabStore.ts:35-48`):
```typescript
export class EphemeralTabStore {
  private readonly state = new Map<string, string[]>();
  private readonly lastKnownSlugs = new Set<string>();

  constructor(private readonly plugin: Plugin) {
    plugin.registerEvent(
      plugin.app.workspace.on('layout-change', () => this.reconcile()),
    );
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', () => this.reconcile()),
    );
  }
```
**Apply to LastVerdictStore** — strip the `plugin` constructor arg AND the layout-change reconcile loop (RESEARCH §"Anti-Patterns" #6: "Verdicts don't have a 'tab is open' lifecycle. Plain Map + clear() on plugin unload is sufficient. No reconciliation needed."):
```typescript
export class LastVerdictStore {
  private readonly state = new Map<string, LastVerdict>();
  set(slug: string, v: LastVerdict): void { this.state.set(slug, v); }
  get(slug: string): LastVerdict | undefined { return this.state.get(slug); }
  clear(): void { this.state.clear(); }
}
```

**LastVerdict shape** — locked by RESEARCH §"Pattern 2" (verified field-by-field against `src/solve/types.ts:71-117`):
```typescript
export interface LastVerdict {
  kind: 'run-failure' | 'submit-failure';
  capturedAt: number;
  verdictText: string;             // classifyStatus(code, msg).displayName
  failingInput?: string;
  expectedOutput?: string;
  actualOutput?: string;
  runtimeMs?: string;              // LC's wire format ('120 ms')
  memoryMb?: string;               // LC's wire format ('14.5 MB')
  errorMessage?: string;
}
```

**Dispose pattern** (from `src/solve/ephemeralTabStore.ts:151-154`):
```typescript
/** Test + plugin.onunload path — deterministic full wipe. */
dispose(): void {
  this.state.clear();
  this.lastKnownSlugs.clear();
}
```
**Apply to LastVerdictStore** — same posture; called from `LeetCodePlugin.onunload()`.

**Acceptance criteria:**
- `set(slug, v)` overwrites prior verdict for slug; no per-slug history.
- `get(slug)` returns undefined when never set or after clear.
- `clear()` deterministic; idempotent.
- Map-only; NO `data.json` field (locked decision B); NO workspace event subscriptions (vs. EphemeralTabStore — important difference).

---

### `src/ai/types.ts` (MODIFY — fill in AIRequest/AIResponse)

**Analog:** self at lines 21-26 (`ProviderConfig` interface — the field-shape precedent)

**Interface fill pattern** (from current state at `src/ai/types.ts:60-72`):
```typescript
// CURRENT (Phase 07 baseline):
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AIRequest {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AIResponse {}
```

**Phase 08 fill** — locked by RESEARCH §"E. AIRequest / AIResponse expansion":
```typescript
export interface AIRequest {
  /** Single-shot prompt assembled by buildDebugPrompt(...). */
  prompt: string;
  /** Optional: provider-side max tokens. Default: provider-specific cheap-tier value. */
  maxTokens?: number;
  /** When true, route through obsidianFetch('stream'). When false/undefined, requestUrl. */
  stream?: boolean;
  /** AbortController.signal — propagated into streamText({ abortSignal }). */
  signal?: AbortSignal;
}

export interface AIResponse {
  text: string;
  /** USD cost added to the daily ledger; zero on Ollama / unknown. */
  usdCost: number;
  /** Optional usage object for diagnostics. */
  usage?: { inputTokens?: number; outputTokens?: number };
}
```

**Acceptance criteria:**
- The two `// eslint-disable-next-line @typescript-eslint/no-empty-object-type` comments are REMOVED.
- The `(req as { stream?: boolean }).stream === true` cast at `src/ai/AIClient.ts:147` is removed (`req.stream` is type-clean now).
- Tests: `tests/ai/types.test.ts` extends with field assertions.

---

### `src/ai/AIClient.ts` (MODIFY — add `invokeStream`)

**Analog:** self at lines 130-160 (`invoke` method — same disclosure-gate posture, same routing seam)

**Disclosure-gate pattern** (from `src/ai/AIClient.ts:130-160`):
```typescript
async invoke(req: AIRequest): Promise<AIResponse> {
  const provider = this.settings.getActiveAIProvider();
  if (provider === null) {
    throw new Error('No AI provider configured');
  }
  let cfg = this.settings.getProviderConfig(provider);
  if (!cfg.disclosureAcknowledged) {
    const ack = await this.requireDisclosure(provider, cfg);
    if (!ack) {
      throw new Error('AI call cancelled');
    }
    await this.settings.setProviderConfig(provider, {
      ...cfg,
      disclosureAcknowledged: true,
    });
    cfg = this.settings.getProviderConfig(provider);
  }
  const wantStream = (req as { stream?: boolean }).stream === true;
  const fetcher = obsidianFetch(wantStream ? 'stream' : 'request');
  const adapter = resolveAdapter(provider, cfg, fetcher);
  return await adapter.invoke(req);
}
```

**Phase 08 mirror — `invokeStream(req)`** — RESEARCH §"F-Refinement" recommends the discriminated tuple return:
```typescript
async invokeStream(req: AIRequest): Promise<
  | { kind: 'stream'; result: StreamTextResult<{}, {}>; abortController: AbortController }
  | { kind: 'buffered'; text: Promise<string>; abortController: AbortController }
> {
  // 1. Same disclosure-gate prologue (lines 131-146 of invoke())
  // 2. Try streaming via obsidianFetch('stream') + adapter.streamInvoke(req)
  // 3. On loadElectronNet throw, fallback to obsidianFetch('request') + adapter.bufferedInvoke(req)
}
```

**Cost-on-cancel posture** (from RESEARCH §Pitfall 6 + lines 167-169 of AIClient.ts):
```typescript
async addCost(usd: number): Promise<void> {
  await this.settings.addCostLedger(usd);
}
```
**Caller responsibility** — modal must call `addCost(0)` on cancel branch (don't await `result.usage` Promise; it rejects on abort).

**Acceptance criteria:**
- `invokeStream` mirrors `invoke`'s disclosure-gate prologue verbatim (locked: same `requireDisclosure` call, same `setProviderConfig({ ...cfg, disclosureAcknowledged: true })` persist, same `cfg = this.settings.getProviderConfig(provider)` re-read).
- Throws `Error('AI call cancelled')` on disclosure-cancel (locked verbatim string).
- Throws `Error('No AI provider configured')` when active provider is null.
- Routes through `obsidianFetch('stream')` (or 'request' on fallback) — never directly imports `requestUrl` or `electron`.
- `(req as { stream?: boolean }).stream` cast at line 147 is REMOVED (types.ts now carries the field).

---

### `src/ai/disclosure.ts` (MODIFY — add `withDebugBullet` factory)

**Analog:** self at lines 55-73 (DISCLOSURE_BASE_COPY constant + freeze contract)

**Frozen-base pattern** (from `src/ai/disclosure.ts:55-73`):
```typescript
export const DISCLOSURE_BASE_COPY: { willSend: readonly string[]; neverSends: readonly string[] } = {
  willSend: Object.freeze([
    'Problem text (statement, examples, constraints)',
    'Your `## Code` content',
    'The last run/submit verdict and failing test (if any)',
    'Optionally your `## Notes` (only if you opt in per feature)',
  ]),
  neverSends: Object.freeze([
    'Vault file paths outside the active note',
    'Frontmatter that does not begin with `lc-`',
    'Any other vault content',
    'Telemetry of any kind',
  ]),
};
Object.freeze(DISCLOSURE_BASE_COPY);
```

**Composition factory pattern** — locked by 08-UI-SPEC §"Disclosure copy extension" + RESEARCH §"Pattern 5":
```typescript
export function withDebugBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] }
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)',
    ],
    neverSends: base.neverSends,
  };
}
```

**Acceptance criteria:**
- `withDebugBullet` does NOT mutate `base.willSend` (asserted via `Object.isFrozen` round-trip).
- Returns fresh object whose `willSend.length === base.willSend.length + 1`.
- Bullet text locked verbatim (UI-SPEC §"Disclosure copy extension").
- `neverSends` reference equality preserved (no copy needed; both frozen).
- DISCLOSURE_BASE_COPY itself is unchanged after factory call.

---

### `src/ai/providers/anthropic.ts` (MODIFY — replace stub invoke)

**Analog:** self — `probeAnthropic` at lines 30-46 is the SDK-call posture template.

**SDK-call pattern** (from `src/ai/providers/anthropic.ts:21-46`):
```typescript
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import { extractProviderError } from './index';

export function createAnthropicModel(cfg: ProviderConfig, fetcher: FetchFn) {
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: fetcher,                         // <— obsidianFetch('stream') or ('request') injected here
  });
  return provider(cfg.model || 'claude-haiku-4-5');
}

export async function probeAnthropic(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    await generateText({
      model: createAnthropicModel(cfg, fetcher),
      prompt: 'ping',
      maxOutputTokens: 1,
    });
    return { ok: true, modelCount: null };
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
}
```

**Phase 08 add** — `streamAnthropic` + `invokeAnthropicBuffered` (from RESEARCH §"Code Examples" Example 2):
```typescript
import { streamText, generateText } from 'ai';

export function streamAnthropic(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): StreamTextResult<{}, {}> {
  return streamText({
    model: createAnthropicModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
}

export async function invokeAnthropicBuffered(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createAnthropicModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
  return { text: result.text, usage: result.usage };
}
```

**Acceptance criteria:**
- `streamText` / `generateText` imported from `'ai'` (core), NOT from `@ai-sdk/anthropic`.
- `fetch: fetcher` field on `createAnthropic` ALWAYS set (CORS-bypass is non-negotiable).
- `abortSignal: signal` propagated in both stream + buffered paths.
- Pattern repeats verbatim in `openai.ts`, `openaiCompatible.ts`, `ollama.ts` — only the model factory changes.

---

### `src/ai/providers/index.ts` (MODIFY — replace invoke throw stubs)

**Analog:** self at lines 84-126 (existing `resolveAdapter` exhaustive switch).

**Switch dispatch pattern** (from `src/ai/providers/index.ts:84-126`):
```typescript
export function resolveAdapter(
  provider: AIProvider,
  cfg: ProviderConfig,
  fetcher: FetchFn,
): ResolvedAdapter {
  switch (provider) {
    case 'anthropic':
      return {
        probe: () => probeAnthropic(cfg, fetcher),
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
    // ... 4 more cases, identical shape ...
  }
}
```
**Phase 08** — replace each `throw` with the real adapter call. Add `streamInvoke` and `bufferedInvoke` to `ResolvedAdapter`. Each branch wires the new exports from the per-provider files.

**Acceptance criteria:**
- All 5 cases (`anthropic` / `openai` / `openrouter` / `ollama` / `custom`) wired to real adapters.
- The hardcoded `'AIClient.invoke: Phase 08 wires the real call'` string is GONE from the file (grep gate).
- Exhaustive switch (no default branch) — same posture as today.

---

### `src/main/codeBlockButtonRow.ts` (MODIFY — add 3rd button)

**Analog:** self at lines 29-66 (the existing 2-button DOM factory)

**Existing structure pattern** (from `src/main/codeBlockButtonRow.ts:29-66`):
```typescript
export function buildCodeBlockButtonRow(
  doc: Document,
  plugin: Plugin & CodeBlockButtonRowHost,
  opts: CodeBlockButtonRowOptions = {},
): HTMLDivElement {
  const row = doc.createElement('div');
  row.className = 'leetcode-code-actions';

  if (opts.prefix) {
    row.appendChild(opts.prefix());
  }

  const runBtn = doc.createElement('button');
  runBtn.className = 'leetcode-code-action-run';
  runBtn.textContent = 'Run';
  runBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.runFromActive();
  });
  row.appendChild(runBtn);

  const submitBtn = doc.createElement('button');
  submitBtn.className = 'leetcode-code-action-submit';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.submitFromActive();
  });
  row.appendChild(submitBtn);

  return row;
}
```

**Phase 08 extension** — append after submitBtn block (UI-SPEC §"Surface 1"):
```typescript
// Host interface gains a 3rd method:
export interface CodeBlockButtonRowHost {
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
  aiDebugFromActive(): void | Promise<void>;   // NEW (Phase 08)
}

// 3rd button block (mirrors Run/Submit verbatim):
const aiBtn = doc.createElement('button');
aiBtn.className = 'leetcode-code-action-ai-debug';
aiBtn.textContent = 'AI: Debug';
aiBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  void plugin.aiDebugFromActive();
});
row.appendChild(aiBtn);
```

**Acceptance criteria:**
- DOM order: `[prefix?][Run][Submit][AI: Debug]`. AI button is ALWAYS last.
- Class `leetcode-code-action-ai-debug` (matches UI-SPEC §"Bundle Constraint").
- Label `AI: Debug` (verbatim — UI-SPEC §"Copywriting Contract").
- `e.preventDefault(); e.stopPropagation()` mirrors Run/Submit (no event leakage to underlying CM6 doc).
- Test contract: no-prefix path produces `row.children.length === 3` (was 2); chevron-prefix path produces 4 (was 3). The no-prefix invariant SURVIVES.

---

### `src/solve/verdictModalRenderer.ts` (MODIFY — conditional AI Debug footer button)

**Analog:** self at lines 483-505 (existing Copy-failing-input + Close button block in `renderSubmitVerdict`)

**Conditional-button pattern** (from `src/solve/verdictModalRenderer.ts:483-506`):
```typescript
// Footer: action button (per UI-SPEC §Action Buttons table) + Close.
const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
const failingInput = firstNonEmpty(res.input, res.last_testcase);
if (kind === 'wa' || kind === 'tle' || kind === 're') {
  if (onCopyFailingInput && failingInput.length > 0) {
    const copyBtn = appendEl(footer, 'button');
    setText(copyBtn, 'Copy failing testcase to custom input');
    copyBtn.addEventListener('click', () => {
      onCopyFailingInput(failingInput);
    });
  }
} else if (kind === 'ce') {
  const errText = firstNonEmpty(res.full_compile_error, res.compile_error);
  if (errText.length > 0) {
    const copyBtn = appendEl(footer, 'button');
    setText(copyBtn, 'Copy error');
    copyBtn.addEventListener('click', () => {
      void writeClipboard(errText);
    });
  }
}
const closeBtn = appendEl(footer, 'button', 'mod-cta');
setText(closeBtn, 'Close');
closeBtn.setAttribute('data-lc-role', 'close');
```

**Phase 08 extension** — INSERT before the `closeBtn` block (UI-SPEC §"Surface 2"):
```typescript
// Phase 08 — AI Debug button (visible only on actionable failures).
// Locked union per RESEARCH §Pitfall 7: ['wa','tle','mle','re','ce'].
// NOT 'ac' (Phase 09 territory), NOT 'ole'/'ie'/'unknown'/'unknown-lc'.
const showAIDebugButton =
  kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce';
if (showAIDebugButton && onOpenAIDebug) {
  const aiBtn = appendEl(footer, 'button');
  setText(aiBtn, 'AI: Debug');
  aiBtn.addEventListener('click', () => {
    onOpenAIDebug();   // closes verdict modal + opens AIStreamModal
  });
}
```

**Args extension** — add `onOpenAIDebug?: () => void` to the renderer's args alongside `onCopyFailingInput?` (mirrors line 434).

**Acceptance criteria:**
- AI Debug button rendered iff `kind ∈ {'wa','tle','mle','re','ce'}` AND callback provided.
- ABSENT for `'ac'`, `'ole'`, `'ie'`, `'unknown'`, `'unknown-lc'`.
- Click invokes `onOpenAIDebug()`; modal close + AIStreamModal open is the caller's responsibility (VerdictModal.ts handles `this.close()` like the existing Copy-failing-input path).
- DOM order: `[Copy failing testcase?][AI: Debug?][Close]`.

---

### `src/solve/VerdictModal.ts` (MODIFY — pass onOpenAIDebug down)

**Analog:** self at lines 27-33, 105-125 (existing `onCopyFailingInput` arg + plumbing)

**Args extension pattern** (from `src/solve/VerdictModal.ts:27-33`):
```typescript
export interface VerdictModalArgs {
  problemTitle: string;
  onCancel: () => void;
  onCopyFailingInput?: (input: string) => void;
}
```
**Phase 08 add** — `onOpenAIDebug?: () => void` next to `onCopyFailingInput`. Same optional posture, same plumbing.

**Plumbing pattern** (from `src/solve/VerdictModal.ts:111-122`):
```typescript
renderVerdict(res, problemTitle, opts) {
  this.clearPendingStateClass();
  renderVerdict({
    titleEl: this.titleEl,
    contentEl: this.contentEl,
    payload: res,
    problemTitle,
    metaData: opts?.metaData,
    joinedDataInput: opts?.joinedDataInput,
    onCopyFailingInput: (input) => {
      this.args.onCopyFailingInput?.(input);
      this.close();
    },
  });
  // ...
}
```
**Phase 08 add** — same lambda wrapping `onOpenAIDebug` so the click closes the modal first then fires the callback (mirrors the `onCopyFailingInput` close-then-fire posture):
```typescript
onOpenAIDebug: () => {
  this.close();
  this.args.onOpenAIDebug?.();
},
```

**Acceptance criteria:**
- `onOpenAIDebug` plumbed identically to `onCopyFailingInput`.
- Click closes verdict modal BEFORE opening AIStreamModal (no double-modal stack).

---

### `src/solve/RunModal.ts` (MODIFY — failure footer)

**Analog:** self (existing footer at `.leetcode-run-footer`) AND `verdictModalRenderer.ts:483-505` (conditional-button posture)

**Surface check** — RESEARCH §"Surface 3" warns: *"Verify during Plan 08-05 whether RunModal directly renders failure UI or whether the orchestrator delegates to VerdictModal in all failure paths. If the latter, Surface 3 collapses into Surface 2 and the AI Debug button is wired only in Surface 2."* Planner must read RunModal end-to-end + the orchestrator's run-failure path to make this call.

**If Surface 3 ships:** mirror the Surface 2 conditional-button pattern verbatim against the RunModal failure footer; gate on `compare_result` mask containing at least one `0`.

---

### `src/solve/submissionOrchestrator.ts` + `pollingOrchestrator.ts` (MODIFY — onVerdict callback)

**Analog:** self at `src/solve/submissionOrchestrator.ts:51-74` (existing dependency-injection shape)

**DI shape pattern** (from `src/solve/submissionOrchestrator.ts:51-74`):
```typescript
export interface SubmissionOrchestratorDeps {
  fetcher: Fetcher;
  settings: OrchestratorSettings;
  slug: string | null;
  getCurrentBody: () => string;
  /** Phase 5 D-21 — login callback wired to the D-21 sticky session-expired
   *  Notice. Optional to preserve backward compatibility with Wave 0 tests
   *  that instantiate the orchestrator without a login callback ... */
  login?: () => void | Promise<void>;
}
```
**Phase 08 add** — same optional-callback posture (preserves backward compatibility with Wave 0 tests):
```typescript
/** Phase 08 — fired after pollSubmission resolves with a non-Accepted verdict.
 *  Plugin registers `(slug, verdict) => lastVerdictStore.set(slug, verdict)`.
 *  Optional to preserve backward compatibility; tests that don't need verdict
 *  capture omit the callback. */
onVerdict?: (slug: string, verdict: LastVerdict) => void;
```

**Capture pattern** — locked by RESEARCH §"Code Examples" Example 6:
```typescript
const terminal = await pollSubmission({ ... });
const info = classifyStatus(terminal.status_code, terminal.status_msg);
if (info.kind !== 'ac' && info.kind !== 'unknown' && info.kind !== 'unknown-lc') {
  this.deps.onVerdict?.(slug, {
    kind: 'submit-failure',
    capturedAt: Date.now(),
    verdictText: info.displayName,
    failingInput: terminal.input || terminal.last_testcase,
    expectedOutput: terminal.expected_output ?? asString(terminal.expected_code_answer),
    actualOutput: terminal.std_output ?? asString(terminal.code_output),
    runtimeMs: terminal.status_runtime,
    memoryMb: terminal.status_memory,
    errorMessage: firstNonEmpty(
      terminal.full_compile_error, terminal.compile_error,
      terminal.full_runtime_error, terminal.runtime_error,
    ),
  });
}
```

**Acceptance criteria:**
- Orchestrator stays pure: it does NOT import `LastVerdictStore` directly. The plugin (`main.ts`) injects the callback at construction.
- Capture filter: `kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'` (locked).
- Run-side: helper `extractRunFailureForVerdictStore(res, joinedDataInput, metaData)` per RESEARCH §Pitfall 8. Reuses `splitOutput` + `splitInput` from `src/solve/runArity.ts`.
- Wave 0 tests still pass without `onVerdict` field set (optional).

---

### `src/main.ts` (MODIFY — palette command + LastVerdictStore field + openAIDebug + register orchestrator callback)

**Analogs:** self at multiple sites:
- `src/main.ts:256` — EphemeralTabStore instantiation pattern
- `src/main.ts:270-273` — AIClient construction with `requireAIDisclosure` arrow
- `src/main.ts:425-436` — `addCommand({ id: 'submit', editorCheckCallback })` pattern (clean ID, frontmatter guard)
- `src/main.ts:872-895` — `requireAIDisclosure` factory (Promise + AIDisclosureModal pattern; same shape applies to `openAIDebug` in spirit)

**Field declaration pattern** (from `src/main.ts:160-162`):
```typescript
// view that wants AIClient access can grab it from this.aiClient). Holds no
// listeners, no timers, no open sockets.
aiClient!: AIClient;
```
**Phase 08 add** — same definite-assignment posture:
```typescript
lastVerdictStore!: LastVerdictStore;
```

**Instantiation pattern** (from `src/main.ts:252-273`):
```typescript
this.ephemeralTabs = new EphemeralTabStore(this);
// ...
this.aiClient = new AIClient(
  this.settings,
  (provider, cfg) => this.requireAIDisclosure(provider, cfg),
);
```
**Phase 08 add** — alongside these:
```typescript
this.lastVerdictStore = new LastVerdictStore();   // no Plugin arg — see analog deviation
```

**Palette command pattern** (from `src/main.ts:425-436`):
```typescript
this.addCommand({
  id: 'submit',
  name: 'Submit',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.submitFromActive(); }
    return true;
  },
});
```
**Phase 08 mirror** — locked by UI-SPEC §"Copywriting Contract" (`ai-debug` ID, `'AI: Debug current code'` label):
```typescript
this.addCommand({
  id: 'ai-debug',                        // clean ID, no prefix per FOUND-03
  name: 'AI: Debug current code',        // UI-SPEC verbatim
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) return false;
    if (!checking) { void this.openAIDebug(slug); }
    return true;
  },
});
```

**`openAIDebug(slug)` single-entrypoint pattern** — RESEARCH §"Architectural Responsibility Map" + Assumption A6 lock:
```typescript
async openAIDebug(slug: string): Promise<void> {
  // 1. Resolve problem markdown (DetailCache or fresh fetch — same path Preview uses).
  // 2. Read active note body via getActiveNoteBody() — same precedent as submissionOrchestrator's getCurrentBody.
  // 3. extractFirstFencedBlock(body) → { lang, code }.
  // 4. const lastVerdict = this.lastVerdictStore.get(slug);
  // 5. const prompt = buildDebugPrompt({ problemMd, code, language: lang ?? 'plaintext', lastVerdict });
  // 6. const provider = this.settings.getActiveAIProvider();
  // 7. new AIStreamModal(this.app, { provider, prompt, aiClient: this.aiClient, disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY) }).open();
}
```

**Acceptance criteria:**
- `LastVerdictStore` constructed in onload AFTER `EphemeralTabStore` and AFTER `AIClient` (same step group).
- `openAIDebug(slug)` is the SOLE entrypoint; called from 3 surfaces (fence-row button via `aiDebugFromActive`, verdict modal callback, palette command).
- `aiDebugFromActive()` host method on plugin extracts active slug from active MarkdownView frontmatter then calls `openAIDebug(slug)`.
- `addCommand({ id: 'ai-debug', ... })` — no `obsidian-leetcode:` prefix, no "command" word.
- `editorCheckCallback` mirrors line 425-436 verbatim shape.
- Orchestrator `onVerdict` callback registered in onload pointing at `this.lastVerdictStore.set(slug, verdict)`.

---

### `styles.css` (MODIFY — add 5 new selectors)

**Analogs:** self at multiple lines:
- `styles.css:212-214` — `.leetcode-ai-disclosure { ... }` empty-rule scoping anchor pattern
- `styles.css:627-633` — `.leetcode-verdict-footer, .leetcode-verdict-action-row` token (extend by comma-grouping)
- `styles.css:741-748` — `.leetcode-submissions-loading` (Thinking… pattern: muted, centered, padding 16px)
- `styles.css:749-751` — `.leetcode-submissions-error` (`color: var(--text-error)`)
- `styles.css:971-988` — `.leetcode-code-action-run, .leetcode-code-action-submit` token (extend by comma-grouping for `.leetcode-code-action-ai-debug`)
- `styles.css:1346-1348` — `.leetcode-preview__body markdown-rendered` (body co-class precedent)

**Bundle constraint** — UI-SPEC locks 5 new selectors targeting < 1 KB total:

```css
/* Phase 08 — AI Debug stream modal */
.leetcode-ai-stream { /* scoping anchor — no styling */ }
.leetcode-ai-stream-body { padding: 0; }
.leetcode-ai-stream-thinking {
  text-align: center;
  padding: 16px 0;
  color: var(--text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.leetcode-ai-stream-cancelled {
  color: var(--text-muted);
  font-style: italic;
  font-size: 13px;
  margin: 0 0 8px 0;
}
.leetcode-ai-stream-error {
  color: var(--text-error);
  font-size: 13px;
  margin: 8px 0 0 0;
}
/* Comma-extend existing .leetcode-verdict-footer rule at line 627: */
/*   .leetcode-verdict .leetcode-verdict-action-row,            */
/*   .leetcode-verdict .leetcode-verdict-footer,                */
/*   .leetcode-ai-stream-footer { ... existing rules ... }      */
```

**Acceptance criteria:**
- All colors via `var(--*)` — zero raw hex / rgba (locked invariant at `styles.css:2`).
- Spacing values from `{4, 8, 16, 24}` only — Phase 08 introduces NO 12px (UI-SPEC §"Spacing Scale" exception).
- 13px font-size matches existing button-label token (no new typographic primitive).
- `.leetcode-code-action-ai-debug` ADDED to the comma-grouped rule at lines 971-988 (no new property block).
- Total CSS additions ≤ 1 KB.

---

### `tests/main/codeBlockButtonRow.test.ts` (MODIFY — bump child counts)

**Analog:** self at lines 29-67 (no-prefix path) and 69-80 (chevron-prefix path)

**Existing assertion pattern** (from `tests/main/codeBlockButtonRow.test.ts:30-38`):
```typescript
it('produces a row with EXACTLY 2 children (Run, Submit) — no chevron leak in Reading Mode', () => {
  const plugin = withHostMethods();
  const row = buildCodeBlockButtonRow(document, plugin);

  expect(row.classList.contains('leetcode-code-actions')).toBe(true);
  expect(row.children.length).toBe(2);
  expect(row.children[0]!.classList.contains('leetcode-code-action-run')).toBe(true);
  expect(row.children[1]!.classList.contains('leetcode-code-action-submit')).toBe(true);
});
```
**Phase 08 update** — bump to 3, add 3rd-child assertion:
```typescript
expect(row.children.length).toBe(3);   // was 2
expect(row.children[2]!.classList.contains('leetcode-code-action-ai-debug')).toBe(true);
```

**Test host pattern** (from lines 17-27):
```typescript
function withHostMethods(overrides?: {
  runFromActive?: ReturnType<typeof vi.fn>;
  submitFromActive?: ReturnType<typeof vi.fn>;
}): HostPlugin {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = overrides?.runFromActive ?? vi.fn();
  plugin.submitFromActive = overrides?.submitFromActive ?? vi.fn();
  return plugin as unknown as HostPlugin;
}
```
**Phase 08 add** — `aiDebugFromActive: ...` field alongside the other two (no host shape break — extension only).

**Chevron path** — bump to 4 children, add 4th-child assertion at index 3 with class `leetcode-code-action-ai-debug`.

---

### `tests/solve/lastVerdictStore.test.ts` (NEW)

**Analog:** `tests/solve/ephemeralTabStore.test.ts` (Map-on-Plugin tests)

**Test scaffolding pattern** (from `tests/solve/ephemeralTabStore.test.ts` — first ~50 lines):
- vitest `describe` / `it` / `expect` / `vi.fn()`
- vi.mock('obsidian') for Plugin/MarkdownView shapes
- Direct instantiation of the store; assertions against set/get/clear/dispose

**Phase 08 cases** (RESEARCH §"Wave 0 Gaps"):
- `set(slug, v)` then `get(slug)` returns `v` byte-identical.
- `set(s1, v1)` then `set(s2, v2)` — both retrievable independently (per-slug isolation).
- Re-`set(s1, v1')` overwrites `v1`.
- `get('unknown')` returns `undefined`.
- `clear()` empties; subsequent `get` returns `undefined`.
- No data.json field exists for verdicts (grep gate against `src/settings/SettingsStore.ts`).

---

### `tests/ai/AIStreamModal.*.test.ts` (NEW × 4)

**Analog:** `tests/ai/disclosure.test.ts` (Modal mock + button-capture + DOM inspection)

**Modal mock pattern** (from `tests/ai/disclosure.test.ts:40-72`):
```typescript
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Modal {
    public app: unknown;
    public contentEl: HTMLElement;
    public titleEl: HTMLElement;
    constructor(app: unknown) {
      this.app = app;
      this.contentEl = document.createElement('div');
      this.titleEl = document.createElement('div');
      attachObsidianHelpers(this.contentEl);
      attachObsidianHelpers(this.titleEl);
    }
    open(): void { /* tests drive onOpen directly */ }
    close(): void {
      const maybeClose = (this as unknown as { onClose?: () => void }).onClose;
      if (typeof maybeClose === 'function') maybeClose.call(this);
    }
  }
  // ... Setting + Notice mocks ...
});
```
**Phase 08 use** — same scaffolding for AIStreamModal tests. Stand up modal instance, drive `onOpen()` with a mocked AIClient that yields a controlled `AsyncIterable<string>`, inspect DOM.

**Test split** (RESEARCH §"Wave 0 Gaps"):
- `tests/ai/AIStreamModal.streaming.test.ts` — first chunk replaces Thinking…, MarkdownRenderer.render called, debounced.
- `tests/ai/AIStreamModal.fallback.test.ts` — Thinking… + counter ticks, single render on resolve.
- `tests/ai/AIStreamModal.cancel.test.ts` — Cancel button aborts; onClose during in-flight aborts; cost ledger gets 0.
- `tests/ai/AIStreamModal.fallback.cancel.test.ts` — fallback cancel closes immediately, swallows promise.
- `tests/ai/AIStreamModal.debounce.test.ts` — 5 chunks within 100ms produce 1 render call (vi.useFakeTimers).

---

### `tests/ai/buildDebugPrompt.test.ts` (NEW)

**Analog:** pure-function test pattern (no analog needed)

**Cases:**
- Verbatim fixture round-trip (problemMd + code + language + LastVerdict → expected prompt string).
- Empty-store path emits literal `'No verdict yet — review the code as-is.'`.
- `## Notes` content NEVER appears (assert via grep on output string for a notes-content fixture string).
- All 4 mandatory inputs present (problem text, code, language, last verdict).

---

### `tests/ai/AIClient.invokeStream.test.ts` (NEW)

**Analog:** `tests/ai/aiClient.test.ts` (resolveAdapter mock + MockSettings factory + disclosure-gate test patterns)

**MockSettings factory pattern** (from `tests/ai/aiClient.test.ts:48-63`):
```typescript
function makeMockSettings(opts: {
  startingCfg?: Record<string, unknown>;
  overrides?: Partial<MockSettings>;
} = {}): MockSettings {
  const cfgs = new Map<string, Record<string, unknown>>();
  const setProviderConfigDefault = vi.fn(async (provider: string, next: Record<string, unknown>) => {
    cfgs.set(provider, next);
  });
  const base: MockSettings = {
    getActiveAIProvider: () => 'openai',
    getProviderConfig: (p: string) => cfgs.get(p) ?? (opts.startingCfg ?? DEFAULT_CFG),
    setProviderConfig: setProviderConfigDefault,
    addCostLedger: vi.fn(async () => {}),
  };
  return { ...base, ...(opts.overrides ?? {}) };
}
```

**vi.mock('../../src/ai/providers') pattern** (from lines 12-16):
```typescript
const resolveAdapterMock = vi.fn();
vi.mock('../../src/ai/providers', () => ({
  resolveAdapter: (...args: unknown[]) => resolveAdapterMock(...args),
}));
```
**Phase 08 mirror** — same MockSettings + same vi.mock pattern; `resolveAdapter` returns `{ probe, invoke, streamInvoke, bufferedInvoke }` with the new methods being vi.fn() that yield controlled streams or buffered text.

**Test cases** (RESEARCH §"Wave 0 Gaps"):
- `invokeStream` fires disclosure gate when `disclosureAcknowledged === false`; persists ack on Continue.
- `invokeStream` throws `Error('AI call cancelled')` on disclosure-cancel (verbatim string locked).
- Stream path returns `{ kind: 'stream', result, abortController }`.
- Fallback path (electron.net.fetch unavailable) returns `{ kind: 'buffered', text, abortController }`.
- AbortSignal propagation: aborting controller cascades into adapter call.

---

## Shared Patterns

### Disclosure Gate
**Source:** `src/ai/AIClient.ts:130-160` (the `invoke` method).
**Apply to:** `AIClient.invokeStream` (mirror prologue verbatim — same `requireDisclosure` call, same persist-then-re-read).
**Excerpt:**
```typescript
let cfg = this.settings.getProviderConfig(provider);
if (!cfg.disclosureAcknowledged) {
  const ack = await this.requireDisclosure(provider, cfg);
  if (!ack) {
    throw new Error('AI call cancelled');
  }
  await this.settings.setProviderConfig(provider, {
    ...cfg,
    disclosureAcknowledged: true,
  });
  cfg = this.settings.getProviderConfig(provider);
}
```

### MarkdownRenderer.render in non-MarkdownView
**Source:** `src/preview/ProblemPreviewView.ts:474-481`.
**Apply to:** `AIStreamModal.flushRender()`.
**Excerpt:**
```typescript
// `markdown-rendered` co-class pulls Obsidian's reading-mode CSS cascade.
const body = root.createDiv({ cls: 'leetcode-preview__body markdown-rendered' });
void MarkdownRenderer.render(this.app, md, body, '', this);   // 5th arg: this (Modal extends Component)
```
**Project rule:** the `this` in arg 5 satisfies `obsidianmd/no-plugin-as-component` because `Modal extends Component`. Never pass the `Plugin` instance here.

### setWindowTimeout / clearWindowTimeout
**Source:** `src/shared/timers.ts` + `src/preview/ProblemPreviewView.ts:524-535`.
**Apply to:** mm:ss counter and 100ms debounce ring buffer in `AIStreamModal`.
**Excerpt:**
```typescript
import { setWindowTimeout, clearWindowTimeout, type TimerHandle } from '../shared/timers';

if (this.detachHandle != null) {
  clearWindowTimeout(this.detachHandle);
  this.detachHandle = null;
}
this.detachHandle = setWindowTimeout(() => { /* tick */ }, MS);
```
**Project rule:** never use `setInterval` / `setTimeout` directly — `prefer-active-window-timers` lint rule + popout-window safety.

### Frontmatter-guarded Palette Command
**Source:** `src/main.ts:425-436` (Submit command).
**Apply to:** `ai-debug` palette command in `main.ts`.
**Excerpt:**
```typescript
this.addCommand({
  id: 'ai-debug',
  name: 'AI: Debug current code',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.openAIDebug(fm['lc-slug'] as string); }
    return true;
  },
});
```
**Project rule:** clean command IDs (no `obsidian-leetcode:` prefix, no "command" word). No default hotkeys.

### Conditional Footer Button (Verdict Modal)
**Source:** `src/solve/verdictModalRenderer.ts:483-505` (existing Copy-failing-input + Copy-error pattern).
**Apply to:** AI Debug button in `renderSubmitVerdict` footer; AI Debug button in `RunModal` failure footer (if Surface 3 ships).
**Excerpt:**
```typescript
const showAIDebugButton =
  kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce';
if (showAIDebugButton && onOpenAIDebug) {
  const aiBtn = appendEl(footer, 'button');
  setText(aiBtn, 'AI: Debug');
  aiBtn.addEventListener('click', () => onOpenAIDebug());
}
```

### Map-on-Plugin In-Memory Store
**Source:** `src/solve/ephemeralTabStore.ts:35-48, 87-97, 151-154`.
**Apply to:** `LastVerdictStore` (deviation: NO Plugin arg, NO reconcile loop — verdicts have no tab lifecycle).
**Excerpt:**
```typescript
export class LastVerdictStore {
  private readonly state = new Map<string, LastVerdict>();
  set(slug: string, v: LastVerdict): void { this.state.set(slug, v); }
  get(slug: string): LastVerdict | undefined { return this.state.get(slug); }
  clear(): void { this.state.clear(); }
}
```

### Frozen-base Composition Factory (Disclosure)
**Source:** `src/ai/disclosure.ts:55-73` (DISCLOSURE_BASE_COPY frozen at module load).
**Apply to:** `withDebugBullet` factory.
**Excerpt:**
```typescript
export function withDebugBullet(base): { willSend; neverSends } {
  return {
    willSend: [...base.willSend, '<feature bullet>'],   // NEW array; never push
    neverSends: base.neverSends,                         // reference equality (frozen)
  };
}
```
**Project rule:** NEVER mutate the frozen base; always compose. Phase 09 / Phase 11 follow the same pattern (`withReviewBullet`, `withKgBullet`).

### AbortController + Signal-Aborted Distinguish
**Source:** RESEARCH §"Code Examples" Example 1 + RESEARCH §Pitfall 2.
**Apply to:** `AIStreamModal.consumeStream` catch block.
**Excerpt:**
```typescript
} catch (err) {
  if (this.abortController.signal.aborted) {
    this.cancelled = true;
    await this.args.aiClient.addCost(0);
    this.swapToCancelledFooter();
    return;
  }
  this.handleError(err);
}
```
**Project rule:** check `signal.aborted` BEFORE inspecting error type. SDK 6.x may wrap AbortError as APICallError.

### Logger Discipline (No Full Prompts)
**Source:** RESEARCH §Pitfall 10 + Phase 07 T-07-05.
**Apply to:** ALL `src/ai/` files.
**Rule:** Never log `prompt` or `responseText` at any verbosity. Log only metadata (provider, model, prompt-char-count, duration, ok/err). Plan 08-02 adds grep-locked guard test `tests/ai/no-prompt-logging.test.ts`.

---

## No Analog Found

**None.** Every Phase 08 file has a load-bearing precedent in repo (Phases 03 / 05 / 06 / 07). The "weakest" match is `buildDebugPrompt.ts` (pure transform) which mirrors `codeExtractor.ts`'s no-imports / same-input-same-output discipline — that's a strong role match even if the actual logic is unique.

**Files Phase 08 creates that don't exist anywhere yet, but with strongly-mirrored analogs:**
- `AIStreamModal.ts` — composite of VerdictModal scaffolding + ProblemPreviewView render + disclosure modal lifecycle.
- `LastVerdictStore` — strict subset of EphemeralTabStore.
- `withDebugBullet` — strict subset of "future-phase extension" contract documented in `disclosure.ts:43-50` JSDoc.

---

## Metadata

**Analog search scope:** `src/ai/`, `src/solve/`, `src/preview/`, `src/main/`, `src/main.ts`, `src/shared/`, `tests/ai/`, `tests/solve/`, `tests/main/`, `styles.css`.
**Files scanned (full read):** ~22 source files + 4 test files + selective `styles.css` grep + selective `main.ts` grep.
**Pattern extraction date:** 2026-05-15.
**Primary source:** Phase 07 finished work (AIClient + disclosure + obsidianFetch + provider adapters) is the load-bearing precedent for Phase 08. Phase 06 PreviewView is the load-bearing precedent for MarkdownRenderer.render in non-MarkdownView contexts. Phase 05 EphemeralTabStore is the load-bearing precedent for in-memory per-slug stores.

**Next step:** `gsd-planner` consumes this PATTERNS.md alongside CONTEXT.md + RESEARCH.md + UI-SPEC.md to emit per-plan PLAN.md files with concrete `read_first` lists and pattern-anchored `acceptance_criteria`.
