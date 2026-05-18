# Phase 09: AI ACed Review - Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 11 (new/modified files)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ai/buildReviewPrompt.ts` | utility | transform | `src/ai/buildDebugPrompt.ts` | exact |
| `src/ai/mergeAIReviewSection.ts` | utility | transform | `src/graph/mergeTechniquesSection.ts` | exact |
| `src/ai/disclosure.ts` (+withReviewBullet) | utility | transform | `src/ai/disclosure.ts` (withDebugBullet) | exact |
| `src/notes/NoteTemplate.ts` (+LOCKED_HEADINGS) | config | N/A | `src/notes/NoteTemplate.ts` (self — extend tuple) | exact |
| `src/main/sectionLockExtension.ts` (+HeadingKind) | middleware | event-driven | `src/main/sectionLockExtension.ts` (self — extend type) | exact |
| `src/settings/SettingsStore.ts` (+autoAIReviewOnAC) | config | CRUD | `src/settings/SettingsStore.ts` (self — extend shape) | exact |
| `src/solve/VerdictModal.ts` (+review streaming) | component | streaming | `src/ai/AIStreamModal.ts` | role-match |
| `src/main.ts` (+AC hook, palette command) | controller | request-response | `src/main.ts` (self — ai-debug command + AC gate) | exact |
| `tests/ai/buildReviewPrompt.test.ts` | test | N/A | `tests/ai/buildDebugPrompt.test.ts` | exact |
| `tests/ai/mergeAIReviewSection.test.ts` | test | N/A | `tests/graph/mergeTechniquesSection.test.ts` | exact |
| `tests/ai/disclosure.withReviewBullet.test.ts` | test | N/A | `tests/ai/disclosure.withDebugBullet.test.ts` | exact |

## Pattern Assignments

### `src/ai/buildReviewPrompt.ts` (utility, transform)

**Analog:** `src/ai/buildDebugPrompt.ts`

**Imports pattern** (lines 1-2):
```typescript
// No external imports — pure function, type-only imports only
import type { LastVerdict } from '../solve/lastVerdictStore';
```

**Interface pattern** (lines 37-46):
```typescript
export interface BuildDebugPromptArgs {
  /** Markdown of the problem statement (full statement + examples + constraints). */
  problemMd: string;
  /** The user's solution code (active fence body — Plan 08-04 reads via `extractFirstFencedBlock`). */
  code: string;
  /** Fence info-string ('python3', 'java', 'cpp', etc.). */
  language: string;
  /** Optional last failing run/submit verdict. Undefined = empty-store path. */
  lastVerdict?: LastVerdict;
}
```

**Core pattern** (lines 53-77 — pure function assembling a prompt via array join):
```typescript
export function buildDebugPrompt(args: BuildDebugPromptArgs): string {
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
    '',
    '## Tasks',
    '1. Tell me what is wrong.',
    '2. Suggest the smallest fix that makes the failing case pass.',
    '3. Show the corrected code in a fenced block. Do not rewrite unchanged sections; show the full corrected solution only if a partial diff would be confusing.',
  ].join('\n');
}
```

**Key principles to copy:**
- Zero I/O, zero DOM, zero Obsidian deps
- Only type-only imports allowed
- Same args produces byte-identical output (determinism)
- Array of strings joined with `\n` pattern

---

### `src/ai/mergeAIReviewSection.ts` (utility, transform)

**Analog:** `src/graph/mergeTechniquesSection.ts`

**Imports pattern** (lines 34-38):
```typescript
import {
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  CUSTOM_TESTS_HEADING_LINE,
} from '../notes/NoteTemplate';
```

**Constants pattern** (lines 40-41):
```typescript
const H2 = /^## /;
/** Tolerates `-`, `*`, `+` bullets (D-13 format tolerance, RESEARCH §Pattern 3). */
const LINK_RE = /^([-*+])\s+\[\[([^\]]+)\]\]\s*$/;
```

**Core vault-write transform pattern** (lines 59-96 — pure function taking body string, returning transformed string):
```typescript
export function mergeTechniquesSection(
  body: string,
  topicTags: ReadonlyArray<{ name: string; slug: string }>,
): string {
  const lines = body.split('\n');
  const start = findSectionStart(lines);

  // D-25: no tags AND no existing section → no-op.
  if (topicTags.length === 0 && start < 0) return body;

  // No existing section → insert a fresh block at the canonical anchor point.
  if (start < 0) {
    return appendNewTechniquesSection(body, topicTags);
  }

  // Existing section → parse items, union-merge, render, splice.
  const end = findSectionEnd(lines, start);
  // ...
}
```

**Splice helper pattern** (lines 177-183 — line array manipulation for insertion):
```typescript
function spliceRegion(lines: string[], start: number, end: number, rendered: string): string {
  const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
  const after = lines.slice(end).join('\n');
  const gluePre = before.length > 0 ? '\n\n' : '';
  const gluePost = after.length > 0 ? '\n\n' : '\n';
  return before + gluePre + rendered + gluePost + after.replace(/^\n+/, '');
}
```

**Key principles to copy:**
- Pure function safe inside `vault.process` retry semantics
- Same (body, content) input produces same string output
- Idempotent: merge(merge(body, x), x) === merge(body, x)
- Uses `lines.findIndex(l => l === HEADING_CONSTANT)` for section detection
- Since `## AI Review` is the LAST section, replacement is simpler: from heading to EOF

---

### `src/ai/disclosure.ts` (+withReviewBullet) (utility, transform)

**Analog:** `src/ai/disclosure.ts` lines 101-113 (`withDebugBullet`)

**Factory pattern** (lines 101-113):
```typescript
export function withDebugBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  // Spread (not in-place mutation) is the locked composition pattern. See
  // the JSDoc above `withDebugBullet` for the WR-02 frozen-base contract.
  return {
    willSend: [
      ...base.willSend,
      'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)',
    ],
    neverSends: base.neverSends,
  };
}
```

**Key principles to copy:**
- Spread `base.willSend` into a NEW array (never mutate frozen base)
- Pass `neverSends` by reference (no copy needed, both frozen)
- Return a fresh object every call
- Bullet text describes exactly what the feature sends to the AI provider

---

### `src/notes/NoteTemplate.ts` (+LOCKED_HEADINGS extension) (config)

**Analog:** `src/notes/NoteTemplate.ts` lines 74-79

**LOCKED_HEADINGS tuple** (lines 74-79):
```typescript
export const LOCKED_HEADINGS = [
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
] as const;
```

**Key principle:** Phase 09 adds a new constant (`AI_REVIEW_HEADING_LINE`) and extends the tuple. The heading constant is defined in the same module (SSoT invariant: no other module hardcodes heading strings).

---

### `src/main/sectionLockExtension.ts` (+HeadingKind extension) (middleware, event-driven)

**Analog:** `src/main/sectionLockExtension.ts` lines 77-79

**HeadingKind type** (line 77):
```typescript
type HeadingKind = 'problem' | 'code' | 'techniques' | 'notes';
```

**Import from NoteTemplate** (lines 57-61):
```typescript
import {
  CODE_HEADING_LINE,
  NOTES_HEADING_LINE,
  PROBLEM_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
} from '../notes/NoteTemplate';
```

**Key principle:** Add `'ai-review'` to `HeadingKind` union, import the new heading constant, add a new `case` in the per-kind range emission logic with same semantics as `'notes'` (heading line locked, body editable).

---

### `src/settings/SettingsStore.ts` (+autoAIReviewOnAC field) (config, CRUD)

**Analog:** `src/settings/SettingsStore.ts` lines 109-117 (PluginData shape) + lines 204-225 (DEFAULT_DATA)

**PluginData field shape pattern** (lines 109-117):
```typescript
  /** Phase 06 PREVIEW-02 — click-default behavior for ProblemBrowserView rows.
   *  'preview' = single-click previews (default for fresh installs and v1.1
   *  upgraders alike — CONTEXT.md decision A; no upgrader-detection branch);
   *  'open' = single-click creates/opens the note (v1.0 behavior). ...
   *  Shape-guard ... collapses anything that isn't literally
   *  the string 'open' to 'preview' — fresh install, missing field, wrong
   *  type, typo all fall through to the safe default. */
  previewClickBehavior: 'preview' | 'open';
```

**DEFAULT_DATA pattern** (lines 204-225):
```typescript
const DEFAULT_DATA: PluginData = {
  version: 1,
  auth: null,
  // ...
  previewClickBehavior: 'preview',
  activeAIProvider: null,
  providerConfigs: DEFAULT_PROVIDER_CONFIGS,
  aiCostLedger: { date: new Date().toISOString().slice(0, 10), usdToday: 0 },
};
```

**Key principle:** Add `autoAIReviewOnAC: boolean` to `PluginData` interface + add `autoAIReviewOnAC: false` to `DEFAULT_DATA`. Shape-guard in `load()` collapses invalid/missing values to the default `false`.

---

### `src/solve/VerdictModal.ts` (+review streaming area) (component, streaming)

**Analog:** `src/ai/AIStreamModal.ts` (streaming logic), `src/solve/VerdictModal.ts` (self — modal structure)

**AIStreamModal streaming core pattern** (lines 224-299 — consumeStream method):
```typescript
private async consumeStream(
  result: Extract<InvokeStreamResult, { kind: 'stream' }>['result'],
): Promise<void> {
  let firstChunkSeen = false;
  try {
    const textStream = (result as unknown as { textStream: AsyncIterable<string> }).textStream;
    for await (const chunk of textStream) {
      if (this.abortController.signal.aborted) {
        throw new Error('aborted');
      }
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      if (!firstChunkSeen) {
        firstChunkSeen = true;
        this.bodyEl.empty();
        this.stopCounter();
      }
      this.buffer += chunk;
      this.scheduleRender();
    }
    // Stream ended naturally — flush final render + cost ledger.
    this.completed = true;
    await this.flushRender();
    // ... cost estimation ...
    await this.args.aiClient.addCost(cost);
    this.swapToCompletionFooter();
  } catch (err) {
    if (this.abortController.signal.aborted) {
      this.cancelled = true;
      await this.args.aiClient.addCost(0);
      this.swapToCancelledFooter();
      return;
    }
    this.handleStreamError(err);
  }
}
```

**Debounced render pattern** (lines 341-358):
```typescript
private scheduleRender(): void {
  if (this.renderTimer != null) return;
  this.renderTimer = setWindowTimeout(() => {
    this.renderTimer = null;
    void this.flushRender();
  }, RENDER_DEBOUNCE_MS);
}

private async flushRender(): Promise<void> {
  if (this.renderTimer != null) {
    clearWindowTimeout(this.renderTimer);
    this.renderTimer = null;
  }
  this.bodyEl.empty();
  await MarkdownRenderer.render(this.app, this.buffer, this.bodyEl, '', this.component);
}
```

**VerdictModal onClose anti-zombie pattern** (lines 55-68):
```typescript
onClose(): void {
  if (this.isPending) {
    this.isPending = false;
    try { this.args.onCancel(); } catch { /* ignore — cleanup */ }
  }
  // ... clear DOM ...
}
```

**Key principles to copy:**
- AbortController-based cancel; `onClose()` aborts if not completed
- Debounced render via `setWindowTimeout` (100ms)
- `MarkdownRenderer.render(this.app, md, el, '', this.component)` — never innerHTML
- `Component` lifecycle: `load()` before first render, `unload()` on close
- Cost ledger: `addCost(estimated)` on success, `addCost(0)` on cancel/buffered
- Footer state machine transitions based on stream state

---

### `src/main.ts` (+AC hook + palette command) (controller, request-response)

**Analog:** `src/main.ts` lines 496-508 (ai-debug command) + lines 1291-1301 (AC gate)

**Palette command with editorCheckCallback** (lines 496-508):
```typescript
this.addCommand({
  id: 'ai-debug',
  name: 'AI: Debug current code',
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

**AC gate hook pattern** (lines 1291-1301):
```typescript
if (classifyStatus(terminalTyped.status_code, terminalTyped.status_msg).kind === 'ac') {
  try {
    await this.knowledgeGraph.onAccepted(
      { file: ctx.file, slug: ctx.slug, title: ctx.title },
      terminalTyped,
    );
  } catch (err) {
    logger.debug('graph.onAccepted: non-fatal (invisible-by-design)', err);
  }
  this.submissionHistory.invalidate(ctx.slug);
}
```

**AIStreamModal construction** (lines 1157-1163):
```typescript
new AIStreamModal(this.app, {
  provider,
  prompt,
  aiClient: this.aiClient,
  model: providerCfg.model,
  disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY),
}).open();
```

**Key principles to copy:**
- `editorCheckCallback` guard: file exists, frontmatter has `lc-slug`
- `if (!checking) { void this.methodName(slug); }` dispatch shape
- AC hook: try/catch wrapping, `logger.debug` on error, non-blocking
- Phase 09 adds alongside (parallel with `knowledgeGraph.onAccepted`), not inside it
- AIStreamModal reuse: same constructor shape with `withReviewBullet` instead of `withDebugBullet`

---

### `tests/ai/buildReviewPrompt.test.ts` (test)

**Analog:** `tests/ai/buildDebugPrompt.test.ts`

**Test structure** (lines 1-57):
```typescript
import { describe, it, expect } from 'vitest';
import { buildDebugPrompt } from '../../src/ai/buildDebugPrompt';
import type { LastVerdict } from '../../src/solve/lastVerdictStore';

describe('Phase 08 Plan 03 — buildDebugPrompt pure helper', () => {
  it('verbatim fixture round-trip with full LastVerdict', () => {
    const out = buildDebugPrompt({ problemMd: '...', code: '...', language: 'python3', lastVerdict: verdict });
    const expected = [...].join('\n');
    expect(out).toBe(expected);
  });

  it("empty-store path emits literal 'No verdict yet — ...'", () => { ... });
});
```

**Key principles:** verbatim fixture assertions, determinism test (same args N times = same output), defense-in-depth assertions (e.g., `## Notes` never appears in output).

---

### `tests/ai/mergeAIReviewSection.test.ts` (test)

**Analog:** `tests/graph/mergeTechniquesSection.test.ts`

**Test structure** (lines 1-27):
```typescript
import { describe, it, expect } from 'vitest';
import { mergeTechniquesSection } from '../../src/graph/mergeTechniquesSection';

describe('mergeTechniquesSection (GRAPH-03, D-13)', () => {
  it('appends ## Techniques after ## Notes when section is absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const tags = [{ name: 'Two Pointers', slug: 'two-pointers' }];
    const out = mergeTechniquesSection(body, tags);
    expect(out).toContain('## Techniques');
    expect(out.indexOf('## Notes')).toBeLessThan(out.indexOf('## Techniques'));
  });
});
```

**Key principles:** body string input, assert section presence, assert ordering (indexOf comparison), idempotency test (merge twice = same result).

---

### `tests/ai/disclosure.withReviewBullet.test.ts` (test)

**Analog:** `tests/ai/disclosure.withDebugBullet.test.ts`

**Test structure** (lines 1-83):
```typescript
import { describe, it, expect } from 'vitest';

const VERBATIM_BULLET = 'AI Debug also sends the last failing run/submit verdict...';

describe('Phase 08 Plan 03 — withDebugBullet factory', () => {
  it('returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    const baseLengthBefore = DISCLOSURE_BASE_COPY.willSend.length;
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(result).not.toBe(DISCLOSURE_BASE_COPY);
    expect(DISCLOSURE_BASE_COPY.willSend.length).toBe(baseLengthBefore);
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY)).toBe(true);
  });

  it('result.willSend.length === base.willSend.length + 1', async () => { ... });
  it('result.willSend ends with the locked verbatim bullet', async () => { ... });
  it('result.neverSends === base.neverSends (reference equality)', async () => { ... });
  it('calling factory twice returns two independent objects', async () => { ... });
});
```

**Key principles:** dynamic import in each `it` block (isolation), assert frozen base unchanged, assert reference equality for `neverSends`, assert new object per call.

---

## Shared Patterns

### Vault Write via `app.vault.process`
**Source:** `src/graph/KnowledgeGraphWriter.ts` (conceptual — observed in CONTEXT)
**Apply to:** VerdictModal review stream completion, manual re-run completion
```typescript
// Pattern: vault.process with pure transform function
await this.app.vault.process(file, (body) => mergeAIReviewSection(body, reviewContent));
```

### MarkdownRenderer.render (never innerHTML)
**Source:** `src/ai/AIStreamModal.ts` line 319, 358
**Apply to:** VerdictModal streaming area, AIStreamModal (already has it)
```typescript
await MarkdownRenderer.render(this.app, this.buffer, this.bodyEl, '', this.component);
```

### Cost Ledger Accumulation
**Source:** `src/ai/AIStreamModal.ts` lines 264-276 (stream path), line 323 (buffered path)
**Apply to:** VerdictModal review stream + AIStreamModal manual re-run
```typescript
// On natural stream end:
const usage = await result.usage;
cost = estimateCostUsd(model, { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 });
await this.args.aiClient.addCost(cost);

// On cancel or buffered fallback:
await this.args.aiClient.addCost(0);
```

### Subtle Notice on Non-Blocking Failure
**Source:** `src/main.ts` line 1324 (network error notice pattern)
**Apply to:** Auto-review failure in VerdictModal
```typescript
new Notice('AI review skipped — {reason}', 4000);
```

### AbortController Anti-Zombie
**Source:** `src/ai/AIStreamModal.ts` lines 201-219 (onClose)
**Apply to:** VerdictModal review streaming extension
```typescript
onClose(): void {
  if (!this.completed && !this.cancelled) {
    this.cancelled = true;
    try { this.abortController.abort(); } catch { /* ignore */ }
  }
  // ... cleanup timers, component.unload(), contentEl.empty()
}
```

### Logger Discipline (No Prompt/Response Logging)
**Source:** `src/ai/AIStreamModal.ts` lines 173-177
**Apply to:** All AI call sites in Phase 09
```typescript
logger.debug('ai-stream.start', {
  provider: this.args.provider,
  model: this.args.model ?? '(unknown)',
  promptCharCount: this.args.prompt.length,
});
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 09 files have exact or role-match analogs in existing Phase 07/08 code |

## Metadata

**Analog search scope:** `src/ai/`, `src/graph/`, `src/solve/`, `src/notes/`, `src/main/`, `src/settings/`, `tests/ai/`, `tests/graph/`
**Files scanned:** ~20 analog candidates evaluated; 11 selected as best matches
**Pattern extraction date:** 2026-05-17
