# Phase 11: AI Knowledge Graph - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/graph/PatternClusterEngine.ts` | service | request-response | `src/graph/KnowledgeGraphWriter.ts` | exact |
| `src/graph/buildKgPrompt.ts` | utility | transform | `src/ai/buildReviewPrompt.ts` | exact |
| `src/graph/parseKgResponse.ts` | utility | transform | `src/ai/buildReviewPrompt.ts` | role-match |
| `src/graph/patternTaxonomy.ts` | config | static | `src/notes/NoteTemplate.ts` (constants) | role-match |
| `src/graph/ClusterHubWriter.ts` | service | CRUD | `src/graph/StubNoteCreator.ts` | exact |
| `src/graph/mergeRelatedVariantsSection.ts` | utility | transform | `src/ai/mergeAIReviewSection.ts` | exact |
| `src/graph/mergeTechniquesSection.ts` (MODIFY) | utility | transform | self (existing) | exact |
| `src/graph/KnowledgeGraphWriter.ts` (MODIFY) | service | request-response | self (existing) | exact |
| `src/ai/disclosure.ts` (MODIFY) | utility | transform | self (`withReviewBullet`) | exact |
| `src/notes/NoteTemplate.ts` (MODIFY) | config | static | self (existing) | exact |
| `src/settings/SettingsStore.ts` (MODIFY) | store | CRUD | self (`autoAIReviewOnAC`) | exact |
| `src/main.ts` (MODIFY) | controller | event-driven | self (`addCommand` + contest patterns) | exact |
| `tests/graph/buildKgPrompt.test.ts` | test | transform | `tests/ai/buildReviewPrompt.test.ts` | exact |
| `tests/graph/parseKgResponse.test.ts` | test | transform | `tests/ai/buildReviewPrompt.test.ts` | role-match |
| `tests/graph/clusterHubWriter.test.ts` | test | CRUD | `tests/graph/stubNoteCreator.test.ts` | exact |
| `tests/graph/mergeRelatedVariantsSection.test.ts` | test | transform | `tests/graph/mergeTechniquesSection.test.ts` | exact |
| `tests/ai/disclosure.withKgBullet.test.ts` | test | transform | `tests/ai/disclosure.withReviewBullet.test.ts` | exact |

## Pattern Assignments

### `src/graph/PatternClusterEngine.ts` (service, request-response)

**Analog:** `src/graph/KnowledgeGraphWriter.ts`

**Imports pattern** (lines 55-63):
```typescript
import type { App, TFile } from 'obsidian';
import { classifyStatus } from '../solve/statusMap';
import { applySolveTimeFrontmatter } from '../notes/NoteTemplate';
import { mergeTechniquesSection } from './mergeTechniquesSection';
import { ensureTechniquesFolder, createStubIfMissing } from './StubNoteCreator';
import { buildTechniqueStubBody, buildTechniqueFilename } from '../notes/NoteTemplate';
import { logger } from '../shared/logger';
import type { SubmitCheckResponse } from '../solve/types';
import type { DetailCacheEntry } from '../settings/SettingsStore';
```

**DI constructor pattern** (lines 82-95):
```typescript
/** Constructor deps (DI). */
export interface KnowledgeGraphWriterDeps {
  app: App;
  settings: KnowledgeGraphSettings;
}

export class KnowledgeGraphWriter {
  private readonly app: App;
  private readonly settings: KnowledgeGraphSettings;

  constructor(deps: KnowledgeGraphWriterDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
  }
```

**Core pipeline pattern** (lines 111-120 + 176-185):
```typescript
async onAccepted(ctx: KnowledgeGraphContext, terminal: SubmitCheckResponse): Promise<void> {
    // Gate check
    const info = classifyStatus(terminal.status_code, terminal.status_msg);
    if (info.kind !== 'ac') {
      logger.debug('graph.onAccepted: non-AC verdict, skipping pipeline', { ... });
      return;
    }
    // ...
    // Step 2 — vault.process for body write (CF-06)
    try {
      await this.app.vault.process(ctx.file, (current) =>
        mergeTechniquesSection(current, topicTags),
      );
    } catch (err) {
      logger.debug('graph.onAccepted: step 2 body write failed', err);
    }
```

**Error handling pattern** (per-stage try/catch, debug-level logging, never throws):
```typescript
    try {
      // ... vault operation
    } catch (err) {
      // Per-stage failure is silent. Debug log and continue.
      logger.debug('graph.onAccepted: step N failed', err);
    }
```

---

### `src/graph/buildKgPrompt.ts` (utility, transform)

**Analog:** `src/ai/buildReviewPrompt.ts`

**Imports pattern** (lines 1-2 — zero external deps):
```typescript
// No imports — zero external deps for purity.
```

**Interface + export pattern** (lines 25-38):
```typescript
export interface BuildReviewPromptArgs {
  /** Markdown of the problem statement. */
  problemMd: string;
  /** The user's accepted solution code. */
  code: string;
  /** Fence info-string ('python3', 'java', etc.). */
  language: string;
}

/**
 * Pure prompt assembler. Returns the prompt string.
 * Determinism: same args -> byte-identical output.
 */
export function buildReviewPrompt(args: BuildReviewPromptArgs): string {
```

**Core join pattern** (lines 39-67):
```typescript
export function buildReviewPrompt(args: BuildReviewPromptArgs): string {
  return [
    'You are reviewing an Accepted LeetCode solution. Provide constructive feedback in three sections.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Review instructions',
    // ... instruction lines
    'Be concise. Do not restate the problem. Do not congratulate.',
  ].join('\n');
}
```

**Purity contract** (file header):
```typescript
// Purity (mirrors `src/ai/buildDebugPrompt.ts` posture):
//   - No imports (zero external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args -> byte-identical output across calls.
```

---

### `src/graph/parseKgResponse.ts` (utility, transform)

**Analog:** `src/ai/buildReviewPrompt.ts` (same purity contract, different purpose)

**Pattern:** Pure function, no imports, same-input/same-output contract. Should follow the defensive parsing strategy from RESEARCH.md Pitfall 1:
```typescript
// Pattern: try JSON.parse -> strip fences -> regex extract -> safe fallback
export function parseKgResponse(text: string): KgClassification {
  // 1. Direct parse
  // 2. Strip markdown fences then parse
  // 3. Regex extract {...} then parse
  // 4. Fallback: { pattern: 'OTHER', variants: [], lookAhead: [] }
}
```

---

### `src/graph/patternTaxonomy.ts` (config, static)

**Analog:** `src/notes/NoteTemplate.ts` (constants export pattern)

**Constants export pattern** (NoteTemplate lines 55-88):
```typescript
export const TECHNIQUES_HEADING_LINE = '## Techniques' as const;
export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;

export const LOCKED_HEADINGS = [
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  AI_REVIEW_HEADING_LINE,
] as const;
```

**Apply to patternTaxonomy.ts:**
```typescript
export const SEED_PATTERNS = [
  'Arrays & Hashing',
  'Two Pointers',
  // ... 22 total
] as const;

export function normalizePatternName(name: string): string {
  // Trim, title-case, collapse whitespace
}
```

---

### `src/graph/ClusterHubWriter.ts` (service, CRUD)

**Analog:** `src/graph/StubNoteCreator.ts`

**Folder creation pattern** (lines 41-50):
```typescript
export async function ensureTechniquesFolder(app: App, folder: string): Promise<void> {
  const trimmed = folder.replace(/[\\/]+$/, '');
  if (app.vault.getAbstractFileByPath(trimmed)) return;
  try {
    await app.vault.createFolder(trimmed);
  } catch (err) {
    // Concurrent-create race -> silent
    logger.debug('graph.ensureTechniquesFolder: concurrent create', err);
  }
}
```

**Create-if-missing pattern** (lines 61-74):
```typescript
export async function createStubIfMissing(
  app: App,
  path: string,
  body: string,
): Promise<void> {
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.create(path, body);
  } catch (err) {
    // Race -> silent
    logger.debug('graph.createStubIfMissing: concurrent create', { path, err });
  }
}
```

**Apply to ClusterHubWriter:** Same create-or-update idiom — check existence with `getAbstractFileByPath`, branch to `vault.create` (new) or `vault.process` (update).

---

### `src/graph/mergeRelatedVariantsSection.ts` (utility, transform)

**Analog:** `src/ai/mergeAIReviewSection.ts`

**Full file pattern** (lines 1-55):
```typescript
// Purity contract (mirrors `src/graph/mergeTechniquesSection.ts` posture):
//   - Only import is heading constant from NoteTemplate (SSoT).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same (body, content) input -> same string output.
//   - Safe inside `vault.process` retry semantics.

import { AI_REVIEW_HEADING_LINE } from '../notes/NoteTemplate';

export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines);

  if (headingIdx >= 0) {
    // Replacement path: discard from heading to EOF/next-H2, insert new content.
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
  }

  // First-write path: append after all existing content.
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
}

function findExactHeading(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === AI_REVIEW_HEADING_LINE) return i;
  }
  return -1;
}
```

**Key difference for Related Variants:** Uses `findNextH2` (bounded to next heading, not EOF) and inserts AFTER `## Techniques` as canonical anchor. The `mergeTechniquesSection.ts` `findSectionEnd` + `spliceRegion` helpers are the closer structural analog for bounded-region replacement.

---

### `src/graph/mergeTechniquesSection.ts` (MODIFY — utility, transform)

**Analog:** self (existing file)

**Key modification:** Replace the union-merge logic with AI-cluster single-link write. The `parseItems` pattern (lines 119-142) is reusable for "free items" preservation (D-11):
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
      items.push({ type: 'link', target: m[2] ?? '', bullet: m[1] ?? '-' });
    } else {
      buf.push(line);
    }
  }
  flushFree();
  return items;
}
```

**Phase 11 modification:** Add a new exported function (or modify the existing one) that removes ALL link items and inserts a single `- [[patternName]]` link, preserving free items.

---

### `src/ai/disclosure.ts` (MODIFY — add `withKgBullet`)

**Analog:** `withReviewBullet` in same file (lines 130-140)

**Exact pattern to copy:**
```typescript
export function withReviewBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI Review sends the problem statement and your accepted solution code',
    ],
    neverSends: base.neverSends,
  };
}
```

**Phase 11:** Replace function name with `withKgBullet`, replace bullet text with KG-specific copy.

---

### `src/settings/SettingsStore.ts` (MODIFY — add feature flag)

**Analog:** `autoAIReviewOnAC` pattern in same file

**PluginData interface extension** (line 122):
```typescript
  autoAIReviewOnAC: boolean;
```

**DEFAULT_DATA entry** (line 242):
```typescript
  autoAIReviewOnAC: false,  // AIREV-01 default OFF — user must opt in
```

**Shape-guard in load** (lines 688-693):
```typescript
      autoAIReviewOnAC: typeof raw.autoAIReviewOnAC === 'boolean'
        ? raw.autoAIReviewOnAC
        : DEFAULT_DATA.autoAIReviewOnAC,
```

**Phase 11:** Mirror this triple (interface + default + shape-guard) for `featureFlags: { lookAheadEdges: boolean }`.

---

### `src/notes/NoteTemplate.ts` (MODIFY — add constants)

**Analog:** self (lines 62-89)

**Heading constant pattern** (line 62-66):
```typescript
export const TECHNIQUES_HEADING_LINE = '## Techniques' as const;
export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;
```

**LOCKED_HEADINGS extension** (lines 83-89):
```typescript
export const LOCKED_HEADINGS = [
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  AI_REVIEW_HEADING_LINE,
] as const;
```

**Phase 11:** Add `RELATED_VARIANTS_HEADING_LINE = '## Related Variants' as const;` and append it to `LOCKED_HEADINGS`.

---

### `src/main.ts` (MODIFY — command + interval registration)

**Analog:** `addCommand` with `editorCheckCallback` (lines 695-704) + contest command pattern (lines 658-691)

**Command with frontmatter gate pattern** (line 695-704):
```typescript
    this.addCommand({
      id: 'generate-contest-analysis',
      name: 'Generate contest analysis',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!fm?.['lc-contest-id']) return false;
        if (!checking) { void this.handleManualContestAnalysis(file); }
```

**Interval registration pattern** (from RESEARCH.md — uses Obsidian `registerInterval`):
```typescript
this.registerInterval(
  window.setInterval(() => {
    void this.reconcilePatternHubs();
  }, 60 * 60 * 1000), // 1 hour
);
```

---

### `tests/graph/buildKgPrompt.test.ts` (test, transform)

**Analog:** `tests/ai/buildReviewPrompt.test.ts`

**Full test structure pattern** (lines 1-101):
```typescript
import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../../src/ai/buildReviewPrompt';

describe('Phase 09 Plan 01 — buildReviewPrompt pure helper', () => {
  it('output contains specific headings/markers', () => {
    const out = buildReviewPrompt({ problemMd: '...', code: '...', language: 'python3' });
    expect(out).toContain('### Approach');
  });

  it('output contains ## Problem section with content trimmed', () => { ... });

  it('output contains fenced code block with language tag', () => { ... });

  it('output never contains forbidden content', () => {
    expect(out).not.toContain('## Notes');
  });

  it('determinism: same args produces byte-identical output across 100 calls', () => {
    const args = { problemMd: '...', code: '...', language: 'python3' };
    const first = buildReviewPrompt(args);
    for (let i = 0; i < 100; i++) {
      expect(buildReviewPrompt(args)).toBe(first);
    }
  });

  it('empty code string does not throw', () => {
    expect(() => buildReviewPrompt({ ... code: '' ... })).not.toThrow();
  });
});
```

---

### `tests/ai/disclosure.withKgBullet.test.ts` (test, transform)

**Analog:** `tests/ai/disclosure.withReviewBullet.test.ts`

**Full test structure pattern** (lines 1-69):
```typescript
import { describe, it, expect } from 'vitest';

const VERBATIM_BULLET = 'AI Review sends the problem statement and your accepted solution code';

describe('Phase 09 Plan 01 — withReviewBullet factory', () => {
  it('returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    const baseLengthBefore = DISCLOSURE_BASE_COPY.willSend.length;
    const result = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(result).not.toBe(DISCLOSURE_BASE_COPY);
    expect(DISCLOSURE_BASE_COPY.willSend.length).toBe(baseLengthBefore);
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY)).toBe(true);
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY.willSend)).toBe(true);
  });

  it('result.willSend.length === base.willSend.length + 1', async () => { ... });

  it('result.willSend ends with the locked verbatim bullet', async () => { ... });

  it('result.neverSends === base.neverSends (reference equality)', async () => { ... });

  it('calling factory twice returns two independent objects', async () => { ... });
});
```

---

### `tests/graph/mergeRelatedVariantsSection.test.ts` (test, transform)

**Analog:** `tests/graph/mergeTechniquesSection.test.ts`

**Test structure pattern** (lines 0-39):
```typescript
import { describe, it, expect } from 'vitest';
import { mergeTechniquesSection } from '../../src/graph/mergeTechniquesSection';

describe('mergeTechniquesSection (GRAPH-03, D-13)', () => {
  it('appends ## Techniques after ## Notes when section is absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const tags = [{ name: 'Two Pointers', slug: 'two-pointers' }];
    const out = mergeTechniquesSection(body, tags);
    expect(out).toContain('## Techniques');
    expect(out).toContain('- [[Two Pointers]]');
    expect(out.indexOf('## Notes')).toBeLessThan(out.indexOf('## Techniques'));
  });

  it('writes wikilink per topic tag', () => { ... });
  it('insertion after ## Notes', () => { ... });
});
```

---

### `tests/graph/clusterHubWriter.test.ts` (test, CRUD)

**Analog:** `tests/graph/stubNoteCreator.test.ts`

**Pattern:** Tests for hub creation use mock `App` with `vault.getAbstractFileByPath` + `vault.create` + `vault.process` stubs. Same DI shape as existing graph tests.

---

## Shared Patterns

### Authentication / Disclosure Gate
**Source:** `src/ai/AIClient.ts` lines 157-198
**Apply to:** `PatternClusterEngine.ts` (calls `AIClient.invoke` — gate fires automatically)
```typescript
async invoke(req: AIRequest): Promise<AIResponse> {
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      throw new Error('No AI provider configured');
    }
    let cfg = this.settings.getProviderConfig(provider);
    if (!cfg.disclosureAcknowledged) {
      const ack = await this.requireDisclosure(provider, cfg);
      if (!ack) throw new Error('AI call cancelled');
      // ... persist ack
    }
    // ... actual call
}
```
Phase 11 does NOT re-implement this — it calls `AIClient.invoke` which handles disclosure internally.

### Error Handling (vault writes)
**Source:** `src/graph/KnowledgeGraphWriter.ts` lines 143-155, 176-185, 191-209
**Apply to:** `PatternClusterEngine.ts`, `ClusterHubWriter.ts`
```typescript
    try {
      await this.app.vault.process(ctx.file, (current) =>
        someTransform(current, args),
      );
    } catch (err) {
      logger.debug('graph.<context>: <step> failed', err);
      // Continue pipeline — next steps may still succeed
    }
```

### vault.process for All Body Writes (CF-06)
**Source:** `src/graph/KnowledgeGraphWriter.ts` line 177
**Apply to:** ALL vault body mutation in Phase 11 (hub updates, Techniques rewrite, Related Variants)
```typescript
await this.app.vault.process(file, (current) => pureTransform(current, args));
```
NEVER use `vault.modify`. Hub note creation uses `vault.create` (new files only).

### processFrontMatter for Metadata
**Source:** `src/graph/KnowledgeGraphWriter.ts` line 147 (via `applySolveTimeFrontmatter`)
**Apply to:** Writing `lc-pattern` frontmatter field
```typescript
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm['lc-pattern'] = patternName;
});
```

### Pure Transform Purity Contract
**Source:** `src/graph/mergeTechniquesSection.ts` file header (lines 1-33), `src/ai/mergeAIReviewSection.ts` file header (lines 1-17)
**Apply to:** `buildKgPrompt.ts`, `parseKgResponse.ts`, `mergeRelatedVariantsSection.ts`, `patternTaxonomy.ts`
```typescript
// Purity contract:
//   - Only imports are SSoT constants from NoteTemplate (or none).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same input -> same output.
//   - Safe inside `vault.process` retry semantics.
```

### Cost Accounting After AI Call
**Source:** `src/settings/SettingsStore.ts` line 844 (`addCostLedger`)
**Apply to:** After `AIClient.invoke` returns in `PatternClusterEngine`
```typescript
// After invoke resolves, compute cost from response.usage via pricing.ts
const cost = computeCost(response.usage, provider);
this.settings.addCostLedger(cost);
```

### Logger Debug-Level Only (No Notices)
**Source:** `src/graph/KnowledgeGraphWriter.ts` header comment lines 52-53
**Apply to:** All Phase 11 graph/AI modules
```typescript
// Forbidden (CF-19): New Notice() — on-AC write is invisible-by-design.
// Errors are logged at debug level.
import { logger } from '../shared/logger';
logger.debug('graph.<context>: <event>', { ...data });
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All Phase 11 files have strong analogs in the existing codebase |

Every file in Phase 11 maps directly to an existing codebase pattern. This is expected: RESEARCH.md explicitly states "Phase 11 introduces zero new infrastructure."

## Metadata

**Analog search scope:** `src/graph/`, `src/ai/`, `src/notes/`, `src/settings/`, `src/main.ts`, `tests/graph/`, `tests/ai/`
**Files scanned:** 12 source files read, 2 test files read
**Pattern extraction date:** 2026-05-18
