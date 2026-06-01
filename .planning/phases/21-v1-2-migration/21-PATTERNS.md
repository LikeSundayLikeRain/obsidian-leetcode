# Phase 21: v1.2 Migration - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 17 (3 NEW source + 5 NEW test + 9 MODIFY)
**Analogs found:** 16 / 17 (one new pattern: `vault.adapter.write/list/rmdir` filesystem cleanup; no in-tree precedent)

## File Classification

### NEW source files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/widget/fenceMigrator.ts` | service (orchestrator) | atomic-write transform | `src/graph/copyToCode.ts` | exact (vault.process + processFrontMatter atomic pair) |
| `src/widget/legacyFenceBanner.ts` | UI/component | request-response (DOM mount) | `src/widget/codeBlockProcessor.ts` (renderStaticFallback) | role-match (createEl pattern; no innerHTML) |
| `src/widget/migrationBackupGc.ts` | utility (microtask) | file-I/O (filesystem cleanup) | `src/solve/starterCodeInjector.ts:retrofit` (silent-on-failure) | partial (no in-tree analog for `vault.adapter.list/rmdir`; closest pattern is the silent-best-effort wrapper from `retrofit`) |

### NEW test files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `tests/widget/fenceMigrator.test.ts` | test | unit + integration | `tests/widget/fenceSerialization.property.test.ts` | exact (corpus-driven property test pattern) |
| `tests/widget/migration.property.test.ts` | test | property | `tests/widget/fenceSerialization.property.test.ts` | exact (it.each + SHELLS × HOSTILE_BODIES corpus) |
| `tests/widget/migrationBackupGc.test.ts` | test | unit (mocked adapter) | `tests/widget/fenceSerialization.property.test.ts` | role-match (mock-vault shim pattern) |
| `tests/widget/legacyFenceBanner.test.ts` | test | unit (DOM render) | `tests/widget/widgetActionRow.test.ts` | role-match (DOM-construction unit test) |
| `tests/fixtures/migration/{v1.0,v1.1,v1.2}/*.md` + `tests/fixtures/migration/index.test.ts` | test | fixture + snapshot | `tests/widget/fenceSerialization.property.test.ts` (it.each pattern); `tests/fixtures/lc-submissions/` (existing fixture-suite shape) | role-match (byte-exact equality assertion) |

### MODIFY files

| Modified File | Role | Data Flow | Closest Analog Within Same File | Edit Shape |
|---------------|------|-----------|---------------------------------|-----------|
| `src/widget/codeBlockProcessor.ts` | controller | request-response | `leetCodeBlockProcessor` line 96-122 (existing pre-mount lc-slug gate) | insert pre-mount migration call before lc-slug branching |
| `src/widget/liveModeViewPlugin.ts` | controller | event-driven | `buildLeetCodeFenceRanges` line 53-104 + `pushParentToChild` line 164-239 | insert fire-and-forget migration trigger when `kind === 'legacy'` (Pitfall 6 — sync ViewPlugin, async migration) |
| `src/widget/fenceSerialization.ts` | utility | pure transform | existing `rewriteFenceBody` line 141-194 + `splitPreservingEols` line 209-243 | add sibling `rewriteFenceOpenerTag` (or extend `rewriteFenceBody` with `openerTag?` arg) |
| `src/solve/codeExtractor.ts` | utility | pure transform | existing `extractFirstFencedBlock` line 46-60 | widen signature to take `frontmatter` arg with dual-path dispatch |
| `src/solve/starterCodeInjector.ts` | service | pure transform + I/O wrapper | `forceInjectCodeSection` line 138-212 (already has `fenceKind` arg + short-circuit at lines 164-179) | mirror `fenceKind` arg from `forceInjectCodeSection` to `injectCodeSection` |
| `src/notes/NoteTemplate.ts` | utility (template emitter) | pure string | `codeBlockFor` line 118-121 | add sibling `codeBlockForV13(starter)` |
| `src/main.ts` | controller (plugin lifecycle) | request-response | existing `addCommand` blocks lines 585-895 + `Plugin.onload()` body | add command palette entry + microtask GC invocation in `onload()` |
| `src/settings/SettingsStore.ts` | model (persistence) | CRUD | existing `useInlineWidget` field (line 86) + `getUseInlineWidget` (line 890) + DEFAULT_DATA (line 278) + shape-guard (line 702-704) | add `autoMigrateOnOpen: boolean` field mirroring useInlineWidget shape |
| `src/settings/SettingsTab.ts` | UI/component | request-response | existing `useInlineWidget` toggle in Experimental subsection (line 281-308) | add toggle UI for `autoMigrateOnOpen` |

## Pattern Assignments

### `src/widget/fenceMigrator.ts` (service, atomic-write)

**Closest analog:** `src/graph/copyToCode.ts` — same `vault.process` + `processFrontMatter` atomic pair, same kind-aware short-circuit using `countLeetCodeSolveFenceOpeners`, same SSoT discipline (reuses fenceLocator + fenceSerialization).

**Imports pattern** (copy from `src/graph/copyToCode.ts:25-31`):
```typescript
import type { App, TFile } from 'obsidian';
import { LC_LANG_SLUGS, resolveLangSlug } from '../solve/languages';
import { countLeetCodeSolveFenceOpeners } from '../widget/fenceLocator';
import { logger } from '../shared/logger';
// Phase 21 NEW — extension target in fenceSerialization
import { rewriteFenceOpenerTag } from './fenceSerialization';
```

**vault.process + processFrontMatter ordering** (copy structure from `src/graph/copyToCode.ts:70-117`):
```typescript
// Step 1 — atomic fence-opener swap via vault.process (CF-06 discipline).
// SSoT: REUSES rewriteFenceOpenerTag (no parallel scan loop).
await app.vault.process(file, (current) =>
  rewriteFenceOpenerTag(current, 'leetcode-solve'),
);

// Step 2 — fill lc-language only when missing/empty (D-edge-04 protects existing values).
// Mirrors switchFenceLanguage Step C (src/main.ts:3539-3541) — same atomic-shape
// processFrontMatter write. Re-check inside callback for race-safety.
const needsLang = typeof fm['lc-language'] !== 'string' || fm['lc-language'] === '';
if (needsLang) {
  await app.fileManager.processFrontMatter(file, (fmObj: Record<string, unknown>) => {
    if (typeof fmObj['lc-language'] !== 'string' || fmObj['lc-language'] === '') {
      fmObj['lc-language'] = defaultLang;
    }
  });
}
```

**Strict-match predicate (5-clause gate)** — closest analog in tree is `sectionHasRecognizedFence` in `src/solve/starterCodeInjector.ts:251-267` (sentinel-trick + walks `## Code` section + `LC_LANG_SLUGS` membership):
```typescript
// From starterCodeInjector.ts:251-267 — pattern to copy:
function sectionHasRecognizedFence(lines: string[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const m = FENCE_OPEN.exec(lines[i] ?? '');
    if (!m) continue;
    const tag = (m[1] ?? '').toLowerCase();
    // Sentinel trick: resolveLangSlug returns the sentinel only when the tag
    // is unknown. Any other return value means the tag resolved to an LC slug.
    if (tag && resolveLangSlug(tag, '__x__') !== '__x__' &&
        LC_LANG_SLUGS.has(resolveLangSlug(tag, '__x__'))) {
      // Ensure there's a closing fence somewhere in the section.
      for (let j = i + 1; j < to; j++) {
        if (FENCE_CLOSE.test(lines[j] ?? '')) return true;
      }
    }
  }
  return false;
}
```

**Idempotency short-circuit** (copy from `src/graph/copyToCode.ts:85-89` + `src/widget/fenceLocator.ts:118-138`):
```typescript
// Cheap pre-check; skip the linear scan when already migrated.
if (countLeetCodeSolveFenceOpeners(noteText, Number.MAX_SAFE_INTEGER) > 0) {
  return false;
}
```

**Settings access pattern** (copy from `src/widget/codeBlockProcessor.ts:30-36` typed plugin host):
```typescript
// Pass `plugin` or read settings via the migrator's invoking host. Do NOT
// reach into `app.plugins.plugins['obsidian-leetcode']` — that's a debug API
// per CLAUDE.md. The cleanest shape: pre-mount caller already has access to
// `plugin.settings.getAutoMigrateOnOpen()` and threads the boolean in.
```

**Error handling / silent-on-failure** (copy from `src/solve/starterCodeInjector.ts:218-233`):
```typescript
// Migration must NOT block the user from opening the note.
// debug-log + return false; user retains their note unchanged.
try {
  // ... migration body ...
} catch (err) {
  logger.debug('migration.fenceMigrator: non-fatal failure', err);
  return false;
}
```

---

### `src/widget/fenceSerialization.ts` MODIFY — add `rewriteFenceOpenerTag`

**Closest analog within the same file:** existing `rewriteFenceBody` line 141-194 (CRLF-tolerant via `splitPreservingEols` line 209-243; property-tested at `tests/widget/fenceSerialization.property.test.ts`).

**Existing primitive** (`fenceSerialization.ts:209-243`) — REUSE verbatim:
```typescript
function splitPreservingEols(text: string): { lines: string[]; eols: string[] } {
  // ... CRLF-tolerant tokenizer ...
  // Round-trip invariant: lines.map((l, i) => l + eols[i]).join('') === input
}
```

**New helper shape** (mirror `rewriteFenceBody`'s prefix + middle + suffix structure):
```typescript
// Locator clause: walks `## Code` H2 forward, finds first ```<tag> opener that
// is NOT already leetcode-solve. Mirror the locator regex from
// `fenceMigrator.isMigrationCandidate` to keep semantics aligned.
//
// Reconstruction: [lines 0..openerLineIdx-1] + new opener line + [lines openerLineIdx+1..end]
// each with its preserved eol. Boundary eol of the opener line is reused.
//
// Guard: idempotency — return input unchanged when the opener is already
// `\`\`\`leetcode-solve` (mirrors the locateFenceByIndex out-of-range guard
// at fenceSerialization.ts:147-148).
```

**Test pattern to copy** (`tests/widget/fenceSerialization.property.test.ts:33-93`):
```typescript
const HOSTILE_BODIES: string[] = [
  '', 'x', 'a\nb\nc', 'a\r\nb\r\nc',
  '```\nnested\n```',           // nested triple backticks
  '---\nframtmatter-like\n---', // frontmatter lookalike
  '🎉unicode',                  // multi-byte
  // ... etc
];
const SHELLS: string[] = [
  '## Code\n\n```leetcode-solve\n{{BODY}}\n```\n',
  // ... etc
];
// it.each driven by SHELLS × HOSTILE_BODIES — same matrix Phase 21 mirrors.
```

---

### `src/widget/legacyFenceBanner.ts` (UI/component, request-response DOM mount)

**Closest analog:** `renderStaticFallback` in `src/widget/codeBlockProcessor.ts:42-69` — same `createEl` pattern, no-innerHTML rule, happy-dom degradation.

**DOM construction pattern** (copy from `codeBlockProcessor.ts:42-69`):
```typescript
function renderStaticFallback(el: HTMLElement, source: string): void {
  el.empty?.();
  if (!el.empty) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  type CreateElFn = (tag: string, opts?: { text?: string; cls?: string }) => HTMLElement;
  const createEl = (el as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof createEl === 'function') {
    const pre = createEl.call(el, 'pre');
    (pre as unknown as { createEl: CreateElFn }).createEl('code', { text: source });
  } else {
    // happy-dom path — manual DOM. Still no innerHTML.
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = source;
    pre.appendChild(code);
    el.appendChild(pre);
  }
}
```

**Banner styling** (uses Obsidian's `.notice-warning` / `.callout-warning` cascade — RESEARCH §"Claude's Discretion"). Banner copy: `"This note uses the v1.2 format."` + `[Migrate now]` button.

**Click handler** (button calls `migrateLegacyFenceIfNeeded(app, file, { force: true })` — same shape as `addCommand` callback in main.ts:585-589).

**Exported signature** (canonical — Plan 21-02 Task 2 + revision-pass WARNING 1):
```typescript
export function mountLegacyFenceBanner(
  host: HTMLElement,
  source: string,
  file: TFile,
  plugin: { app: App; settings: { getAutoMigrateOnOpen(): boolean; getDefaultLanguage?(): string } },
  mode: 'auto-migrating' | 'manual-prompt' | 'read-only-legacy',
): void;
```
The `mode` parameter is REQUIRED (not optional). Three render branches:
- `'auto-migrating'` — Live Preview during the migration window (banner copy "Migrating note to v1.3 format..."; no [Migrate now] button; no read-only legacy `<pre><code>`).
- `'manual-prompt'` — Reading mode `autoMigrateOnOpen=OFF` path (banner copy "This note uses the v1.2 format."; [Migrate now] CTA; read-only legacy `<pre><code>` of `source`).
- `'read-only-legacy'` — unmigratable shapes (read-only `<pre><code>` only; no banner). Reserved; currently unused.

The CSS class includes the mode as a modifier: `leetcode-migration-banner leetcode-migration-banner--<mode>`.

---

### `src/widget/migrationBackupGc.ts` (utility, file-I/O cleanup)

**Closest analog:** `src/solve/starterCodeInjector.ts:218-233:retrofit` — silent-on-failure best-effort `try/catch` + `logger.debug` discipline.

**Silent-on-failure pattern** (copy from `starterCodeInjector.ts:218-233`):
```typescript
export async function retrofit(...): Promise<void> {
  try {
    await app.vault.process(file, ...);
  } catch (err) {
    logger.debug('solve.retrofit: non-fatal failure', err);
  }
}
```

**No in-tree analog for `vault.adapter.list/rmdir`** — these are first-time uses in this codebase. Use the API directly per `obsidian.d.ts:1944-2032`. Wrap each `adapter.*` call in `try/catch` because:
- `adapter.list(missingDir)` throws on first-install (Pitfall 4)
- `adapter.rmdir(folder, true)` may throw on permission denied or partial cleanup
- `adapter.mkdir(existing)` contract unclear (Open Question §2 in RESEARCH)

**Microtask scheduling** (RESEARCH §"30-day backup TTL cleanup" Pattern 4):
```typescript
// In src/main.ts Plugin.onload():
Promise.resolve().then(() => runMigrationBackupGc(this.app));
// NOT setTimeout — keeps it inside the same tick; non-blocking.
```

---

### `src/widget/codeBlockProcessor.ts` MODIFY — pre-mount migration gate

**Within-file analog:** existing handler shape line 77-220 (TFile resolution, lc-slug check, embed detection, RenderChild mount).

**Insertion point** — between TFile resolution at line 85-90 and the lc-slug check at line 96-100:
```typescript
// EXISTING (codeBlockProcessor.ts:85-100):
const fileLike = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
if (!(fileLike instanceof TFile)) {
  renderStaticFallback(el, source);
  return;
}
const file = fileLike;

const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const lcSlug = fm?.['lc-slug'];
const hasLcSlug = typeof lcSlug === 'string' && lcSlug.length > 0;

// NEW Phase 21 gate — runs AFTER hasLcSlug derivation, BEFORE the lc-slug
// branching. Async fits because Reading-mode MarkdownPostProcessor handlers
// CAN be async (per ProcessorHost return type at line 78-82). The handler's
// signature stays Promise<void> (was implicitly void before; widening is
// backward-compatible for Obsidian's processor contract).
if (
  hasLcSlug &&
  plugin.settings.getUseInlineWidget?.() === true &&
  plugin.settings.getAutoMigrateOnOpen?.() === true
) {
  try {
    const migrated = await migrateLegacyFenceIfNeeded(plugin.app, file);
    if (migrated) {
      // vault.on('modify') will trigger a fresh post-processor invocation
      // that mounts on the new ```leetcode-solve fence. This invocation
      // has no further work.
      renderStaticFallback(el, source);
      return;
    }
  } catch {
    // Defensive — fall through to existing path.
  }
}

// NEW Phase 21 — banner path when autoMigrateOnOpen=OFF and the strict-match
// predicate would have accepted this fence:
if (
  hasLcSlug &&
  plugin.settings.getUseInlineWidget?.() === true &&
  plugin.settings.getAutoMigrateOnOpen?.() !== true &&
  isMigrationCandidate(source, fm)
) {
  mountLegacyFenceBanner(el, source, file, plugin);
  return;
}

// EXISTING path continues at line 102+ (info, isEmbed, RenderChild mount).
```

---

### `src/widget/liveModeViewPlugin.ts` MODIFY — Live Preview pre-mount migration

**Within-file analog:** `buildLeetCodeFenceRanges` line 53-104 (synchronous decoration build).

**The Pitfall-6 problem** (RESEARCH §"Pitfall 6: Mount-path race"): `update()` is synchronous (CM6 ViewPlugin contract). It cannot `await migrateLegacyFenceIfNeeded`.

**Pattern** — fire-and-forget Promise from inside `update()` when `kind === 'legacy'` is detected; immediately return empty/legacy-fence decorations; rely on `vault.on('modify')` (which fires after migration completes) to trigger a fresh `update()`:

```typescript
// In buildLeetCodeFenceRanges, after findCodeFence returns a fence:
const fence = findCodeFence(view.state, { preferLeetCodeSolve: true });
if (!fence) return builder.finish();
if (fence.kind === 'leetcode-solve') {
  // EXISTING widget mount path — unchanged.
} else {
  // NEW Phase 21 — kind === 'legacy'
  // Fire-and-forget; do NOT await. The next vault.on('modify') triggers a
  // fresh build that sees ```leetcode-solve fence.
  if (
    plugin.settings.getUseInlineWidget?.() === true &&
    plugin.settings.getAutoMigrateOnOpen?.() === true
  ) {
    void migrateLegacyFenceIfNeeded(plugin.app, file).catch(() => {
      // Defensive — best-effort, debug-log only.
    });
  }
  // Return empty decoration set (graceful "no widget" state during the
  // ~10-50ms window before migration completes — better than rendering a
  // legacy-tagged fence as the editable widget). Banner mount happens via
  // the codeBlockProcessor path (Reading mode) for autoMigrateOnOpen=OFF.
  return builder.finish();
}
```

**Three-signal isReadingMode pattern** at codeBlockProcessor.ts:153-198 — informs the `update()` migration gate (skip migration when in Reading mode and the codeBlockProcessor path is already running).

---

### `src/solve/codeExtractor.ts` MODIFY — frontmatter-aware refactor

**Within-file analog:** existing `extractFirstFencedBlock(noteBody)` at line 46-60.

**Existing signature**:
```typescript
export function extractFirstFencedBlock(noteBody: string): ExtractedCode | null {
```

**New signature** (D-extract-01):
```typescript
export function extractFirstFencedBlock(
  noteBody: string,
  frontmatter?: { 'lc-language'?: string },
): ExtractedCode | null {
```

**Dual-path dispatch** — when located fence opener matches `^\s*```leetcode-solve\b` (use `LC_OPENER_RE` regex from `src/widget/fenceSerialization.ts:35`), return `{ lang: frontmatter['lc-language'] ?? null, code: ... }`. Otherwise preserve verbatim behavior — return `{ lang: fenceTag ?? null, code: ... }`.

**Consumer threading** — RESEARCH Open Questions §5 lists 5 production consumers + 2 test files:
- `src/main.ts` (Run/Submit dispatch)
- `src/solve/submissionOrchestrator.ts`
- `src/graph/KnowledgeGraphWriter.ts` (language-write)
- `src/ai/buildDebugPrompt.ts`
- (1 more consumer per grep)
- `tests/solve/codeExtractor.test.ts`
- `tests/main/runFromWidget.test.ts`

Each consumer already has `file` in scope; access pattern is `app.metadataCache.getFileCache(file)?.frontmatter` (matches the existing pattern at `codeBlockProcessor.ts:96-98` and `liveModeViewPlugin.ts:64-67`).

---

### `src/solve/starterCodeInjector.ts` MODIFY — mirror `fenceKind` to `injectCodeSection`

**Within-file analog:** existing `forceInjectCodeSection` line 138-212 already has the `fenceKind` arg + `rewriteFenceBody` short-circuit at lines 164-179. Mirror that arg + dispatch pattern verbatim onto `injectCodeSection`.

**Existing pattern to copy** (`starterCodeInjector.ts:164-179`):
```typescript
if (opts.fenceKind === 'leetcode-solve') {
  const v13Count = countLeetCodeSolveFenceOpeners(
    current,
    Number.MAX_SAFE_INTEGER,
  );
  if (v13Count > 0) {
    return rewriteFenceBody(current, 0, opts.starterCode.trim());
  }
  // fall through — no v1.3 fence to replace; behave as legacy path.
}
```

**InjectOptions interface** (`starterCodeInjector.ts:51-68`) — add nothing new; the `fenceKind` field already exists.

**`injectCodeSection` modification** — add the same short-circuit at the top of the function (before the existing line 76 split). When `fenceKind === 'leetcode-solve'` AND the note has a v1.3 fence, return `rewriteFenceBody(current, 0, opts.starterCode.trim())`. The idempotency guard at line 86 still applies for the legacy path.

---

### `src/notes/NoteTemplate.ts` MODIFY — add `codeBlockForV13` emitter

**Within-file analog:** existing `codeBlockFor` at line 118-121.

**Existing pattern** (`NoteTemplate.ts:118-121`):
```typescript
export function codeBlockFor(langSlug: string, starterCode: string): string {
  const code = starterCode.trim();
  return '```' + lcSlugToFenceTag(langSlug) + '\n' + code + '\n```';
}
```

**New sibling** — same trim semantics, no langSlug arg:
```typescript
/**
 * Phase 21 MIGRATE-08 — v1.3 emitter. Emits a `\`\`\`leetcode-solve` fence
 * directly. Language metadata lives in `lc-language` frontmatter (canonical
 * v1.3 source of truth per Phase 19 C-01). Used by new-note creation paths
 * when `useInlineWidget=ON` (gated at call sites in `injectCodeSection`,
 * `forceInjectCodeSection`, `buildNoteBody`).
 *
 * Phase 22 cleanup will rename this back to `codeBlockFor` after `codeBlockFor`
 * (the legacy emitter) is deleted.
 */
export function codeBlockForV13(starterCode: string): string {
  const code = starterCode.trim();
  return '```leetcode-solve\n' + code + '\n```';
}
```

**Call-site gate pattern** (RESEARCH §"D-emit-01"):
```typescript
// At each call site in starterCodeInjector.ts / NoteTemplate.buildNoteBody:
const block = useInlineWidget ? codeBlockForV13(starter) : codeBlockFor(langSlug, starter);
```

---

### `src/main.ts` MODIFY — addCommand + microtask GC + onload wiring

**Within-file analog (addCommand):** existing pattern at line 585-589 (`open-problem-browser`), 671-680 (`refresh-current-problem`), 648-652 (`reset-ai-disclosures`).

**Command palette pattern** (copy from `main.ts:585-589`):
```typescript
// New addCommand block — register UNCONDITIONALLY per D-auto-03 (visible
// regardless of autoMigrateOnOpen). Self-gates internally on useInlineWidget
// AND active-file lc-slug presence (mirrors editorCheckCallback shape from
// `refresh-current-problem` at line 671-680).
//
// Community plugin ID rules (per the `open-problem-browser` comment at line
// 580-584): id does NOT contain 'leetcode' or 'command'; name is sentence
// case and does NOT start with the plugin name; NO hotkeys field.
this.addCommand({
  id: 'migrate-current-note',
  name: 'Migrate current note',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    if (!this.settings.getUseInlineWidget()) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm: Record<string, unknown> | undefined = cache?.frontmatter;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) return false;
    if (!checking) {
      void migrateLegacyFenceIfNeeded(this.app, file, { force: true });
    }
    return true;
  },
});
```

**onload microtask pattern** (RESEARCH Pattern 4) — insert in `Plugin.onload()` body unconditionally (runs even when `useInlineWidget=OFF` per D-backup-03):
```typescript
// Inside onload() body — fire-and-forget, NOT awaited:
Promise.resolve().then(() => runMigrationBackupGc(this.app));
```

**processFrontMatter analog** (copy from `main.ts:3539-3541` — switchFenceLanguage Step C):
```typescript
await this.app.fileManager.processFrontMatter(file, (fmObj: Record<string, unknown>) => {
  fmObj['lc-language'] = newSlug;
});
```

---

### `src/settings/SettingsStore.ts` MODIFY — add `autoMigrateOnOpen` field

**Within-file analog:** `useInlineWidget` field shape (lines 80-86, 278, 702-704, 890, 896-899).

**Field declaration** (insert near line 86, mirror `useInlineWidget`):
```typescript
/** Phase 21 MIGRATE-06 — auto-migrate v1.2 notes on file open. Default true.
 *  When ON, opening a v1.2 LC note silently rewrites the legacy fence opener
 *  to ```leetcode-solve and fills `lc-language` if missing. When OFF, the
 *  widget mount path renders a `legacyFenceBanner` instead with a [Migrate now]
 *  button. Strict-match predicate gates entry — non-LC fences never touched.
 *  Self-gated on `useInlineWidget=ON` (no-op when master toggle is OFF, per
 *  Phase 21 L9). Shape-guard at load: non-boolean / missing / corrupt collapses
 *  to true (default ON). */
autoMigrateOnOpen: boolean;
```

**DEFAULT_DATA entry** (insert near line 278):
```typescript
// Phase 21 MIGRATE-06 — default ON; user must explicitly opt out.
autoMigrateOnOpen: true,
```

**Shape-guard at load** (insert near line 702-704):
```typescript
// Phase 21 MIGRATE-06 — non-boolean raw / missing field / corrupt data.json
// all collapse to true (DEFAULT_DATA.autoMigrateOnOpen). Default ON matches
// MIGRATE-06; user explicitly opts out via settings toggle.
autoMigrateOnOpen: typeof raw.autoMigrateOnOpen === 'boolean'
  ? raw.autoMigrateOnOpen
  : DEFAULT_DATA.autoMigrateOnOpen,
```

**Getter / setter** (insert near line 890, mirror `getUseInlineWidget` / `setUseInlineWidget`):
```typescript
/** Phase 21 MIGRATE-06 — read auto-migrate setting. Read at every
 *  `migrateLegacyFenceIfNeeded` call site (mount path); live-applies (toggle
 *  takes effect on next file open without reload — no widget destroy needed). */
getAutoMigrateOnOpen(): boolean { return this.data.autoMigrateOnOpen; }

/** Phase 21 MIGRATE-06 — persist auto-migrate setting. Live-apply: no reload
 *  required (next mount-path read picks up the new value). */
async setAutoMigrateOnOpen(v: boolean): Promise<void> {
  this.data.autoMigrateOnOpen = v;
  await this.persist();
}
```

---

### `src/settings/SettingsTab.ts` MODIFY — add toggle UI

**Within-file analog:** existing `useInlineWidget` toggle in Experimental subsection at line 281-308.

**Toggle UI pattern** (copy structure from `SettingsTab.ts:291-308`):
```typescript
// Add inside the same Experimental subsection (after the useInlineWidget
// toggle at line 308, before the Save delay dropdown at line 310). Or under
// a new "Migration" subsection — planner decides per RESEARCH §"Claude's
// Discretion" (Settings UI subsection placement).
new Setting(expGroup)
  .setName('Auto-migrate v1.2 notes when opened')
  .setDesc('When opening a LeetCode note from v1.2 or earlier, silently rewrite the fence to the v1.3 format. When off, a banner offers a manual [Migrate now] button.')
  .addToggle((toggle) => toggle
    .setValue(this.plugin.settings.getAutoMigrateOnOpen())
    .onChange(async (v) => {
      await this.plugin.settings.setAutoMigrateOnOpen(v);
      // No reload needed — live-applies on next file open.
    }),
  );
```

---

### Test file patterns

**`tests/widget/fenceSerialization.property.test.ts:33-93`** — corpus + it.each:
```typescript
const HOSTILE_BODIES: string[] = [/* ... */];
const SHELLS: string[] = [/* ... */];
describe('fence body round-trip property tests', () => {
  const cases: Array<{ label: string; shellIdx: number; body: string; fenceIndex: number }> = [];
  SHELLS.forEach((_, sIdx) => {
    HOSTILE_BODIES.forEach((body, bIdx) => {
      cases.push({ label: `shell ${sIdx} body ${bIdx}`, shellIdx: sIdx, body, fenceIndex: 0 });
    });
  });
  it.each(cases)('$label — extract+rewrite is identity', ({ shellIdx, body, fenceIndex }) => {
    const file = SHELLS[shellIdx]!.replace('{{BODY}}', body);
    const extracted = extractFenceBody(file, fenceIndex);
    expect(extracted).toBe(body);
    const rewritten = rewriteFenceBody(file, fenceIndex, body);
    expect(rewritten).toBe(file);
  });
});
```

**vitest mock pattern for obsidian** (copy from `tests/widget/fenceSerialization.property.test.ts:19-22`):
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

**Mock-vault adapter shim for `tests/widget/migrationBackupGc.test.ts`** — needs construction. Cast `app.vault.adapter` to a typed mock:
```typescript
const mockAdapter = {
  list: vi.fn(),
  rmdir: vi.fn(),
  write: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
};
const mockApp = { vault: { adapter: mockAdapter } } as unknown as App;
```

---

## Shared Patterns

### Pattern S-01: vault-layer write discipline (CF-06 / L8 — applies to fenceMigrator + main.ts onload)

**Source:** `src/graph/copyToCode.ts:18-20` + `src/solve/starterCodeInjector.ts:23` (file headers)

**Apply to:** `src/widget/fenceMigrator.ts`, `src/widget/migrationBackupGc.ts` headers
```typescript
// vault.process is the ONLY vault mutation primitive used here (CF-06).
// NEVER vault.modify on problem notes. The grep gate in
// scripts/grep-no-vault-modify.sh still applies.
//
// Backup writes use vault.adapter.write (plugin-internal — outside vault
// tree, NOT a vault-visible file).
```

---

### Pattern S-02: SSoT discipline (reuse fenceLocator + fenceSerialization — applies to fenceMigrator)

**Source:** `src/graph/copyToCode.ts:28-31` (header comment) + `src/solve/starterCodeInjector.ts:38-43` (header comment)

**Apply to:** `src/widget/fenceMigrator.ts`
```typescript
// SSoT discipline: REUSE the canonical fence-locator predicate and body
// rewriter from src/widget/. Do NOT inline a private detector or a
// parallel body-replace helper — the existing primitives are
// property-tested (Plan 19-04 nested-triple-backticks rule) and
// CRLF-tolerant. countLeetCodeSolveFenceOpeners, rewriteFenceBody, and
// the new rewriteFenceOpenerTag (Phase 21 extension) are the canonical
// primitives. Any new scan loop introduced here would drift the
// regex semantics.
```

---

### Pattern S-03: Self-write suppression hash-arm (Phase 19 C-04 — fallback if dev-vault probe shows two-frame `vault.process` + `processFrontMatter` events)

**Source:** `src/widget/selfWriteSuppression.ts:42-91`

**Apply to:** `src/widget/fenceMigrator.ts` ONLY IF Plan 21-01 dev-vault probe shows two-frame ordering:
```typescript
// Phase 19 C-04 hash-arm shape — used by DebouncedWriter.flush, copyToCode,
// conflict-modal trigger. The arm() call sets the EXPECTED hash of the
// post-write fence body; the modify-handler in main.ts calls
// tryConsume(observedHash) which returns 'consumed' / 'stale' / 'miss'.
// Defensive delete on hash-mismatch handles the vault.read↔vault.process
// race (an external write between read and process produces a different
// hash; treating that as 'miss' preserves external-edit semantics).
//
// If migration's vault.process + processFrontMatter both fire modify events
// in separate frames, arm TWICE — once before vault.process (with post-rewrite
// hash), once before processFrontMatter (with post-frontmatter-fill hash).
```

**Single-frame fallback:** if the probe shows single-frame, no extra arming needed; the existing single suppression entry covers both writes.

---

### Pattern S-04: 'leetcode.*' userEvent annotation (NOT applicable to Phase 21)

**Source:** CLAUDE.md §"Conventions" + `src/main/sectionLockExtension.ts`

**Apply to:** None of the Phase 21 files. **Why:** Migration runs at the vault layer (`vault.process` + `processFrontMatter`) BEFORE widget mount. There is no CM6 dispatch involved. The section lock's `changeFilter` operates on CM6 transactions — the migration write goes through the vault layer (`Vault.process`), which fires `vault.on('modify')` AFTER the file content lands. The CM6 instance for the about-to-mount widget hasn't been created yet, so no transaction filter applies.

**Confirmation pattern** (excerpt for the `fenceMigrator.ts` header):
```typescript
// Phase 17 D-05 canonical write-path EXCEPTION (per Phase 21 RESEARCH
// "Project Constraints"): migration fires BEFORE widget mount, so no child
// editor exists. vault.process is the correct primitive in this specific
// phase (no child-CM6 dispatch path needed).
```

---

### Pattern S-05: silent-on-failure best-effort wrapper (applies to fenceMigrator + migrationBackupGc + retrofit)

**Source:** `src/solve/starterCodeInjector.ts:218-233` (`retrofit`)

**Apply to:** `src/widget/fenceMigrator.ts`, `src/widget/migrationBackupGc.ts`
```typescript
try {
  // ... best-effort I/O ...
} catch (err) {
  logger.debug('module.fn: non-fatal failure', err);
}
// NEVER Notice the user on background failure (D-09 silent-on-failure).
// Migration failures must not block file-open; backup-cleanup failures
// must not block plugin-load.
```

---

### Pattern S-06: lc-slug + frontmatter access via metadataCache (applies to fenceMigrator + codeBlockProcessor + liveModeViewPlugin)

**Source:** `src/widget/codeBlockProcessor.ts:96-100` + `src/widget/liveModeViewPlugin.ts:64-67`

**Apply to:** `src/widget/fenceMigrator.ts` (`isMigrationCandidate` consumer)
```typescript
// Read frontmatter via metadataCache (consistent with v1.2 callsites at
// codeActionsEditorExtension.ts:248-251). Do NOT use ctx.frontmatter —
// typed `any | null | undefined` per RESEARCH Anti-Patterns.
const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const lcSlug = fm?.['lc-slug'];
const hasLcSlug = typeof lcSlug === 'string' && lcSlug.length > 0;
```

---

### Pattern S-07: no-innerHTML DOM construction (applies to legacyFenceBanner)

**Source:** CLAUDE.md "Don't use innerHTML" + `src/widget/codeBlockProcessor.ts:42-69` + `src/settings/SettingsTab.ts:284-289`

**Apply to:** `src/widget/legacyFenceBanner.ts`
```typescript
// CLAUDE.md no-innerHTML rule. eslint-plugin-obsidianmd enforces.
// Use createEl with text option for visible text content; never assign
// innerHTML / innerText. happy-dom test environment may not expose .createEl,
// so guard with a typeof check + manual document.createElement fallback
// (mirrors codeBlockProcessor.ts:56-68 fallback shape).
expGroup.createEl('p', {
  text: 'These features are under development and may change between releases.',
  cls: 'setting-item-description',
});
```

---

### Pattern S-08: lazy-on-trigger discipline (applies to fenceMigrator — never batch on plugin load)

**Source:** v1.1 lazy-on-AC Techniques migration (`src/graph/mergeTechniquesSection.ts` — pure transform consumed inside a `vault.process(file, body => mergeTechniquesSection(body, tags))` callback fired ONLY on Accepted submission, never on plugin load).

**Pattern applied to:** Phase 21 mirrors the discipline — migration triggers on file-open, not on plugin load. The `vault.process` primitive is identical; the trigger is moved from "AC submission" to "first file open".

**File header excerpt** (`mergeTechniquesSection.ts:1-32`):
```typescript
// Purity contract (D-13 + CF-06):
//   - Only imports heading SSoT constants from NoteTemplate
//   - No I/O, no captured state, no Date.now, no randomness
//   - Same (body, topicTags) input → same string output
//   - Safe inside `vault.process` retry semantics
//
// This file is the primitive Plan 03's KnowledgeGraphWriter will call inside
// a `vault.process(ctx.file, body => mergeTechniquesSection(body, tags))`.
```

**Apply to:** `src/widget/fenceMigrator.ts` — the pure transform helpers (`isMigrationCandidate`, `rewriteFenceOpenerTag`) MUST be safe inside `vault.process` retry; the side-effect wrapper (`migrateLegacyFenceIfNeeded`) owns the I/O.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/widget/migrationBackupGc.ts` (the `vault.adapter.list/rmdir/exists/mkdir` calls) | utility | filesystem cleanup | No in-tree precedent for `vault.adapter.*` filesystem traversal. The closest thing is the `try/catch` + `logger.debug` discipline from `starterCodeInjector.ts:retrofit`. Use the API directly per `obsidian.d.ts:1944-2032` with a defensive try-catch wrapping each call (Pitfall 4 — adapter.list throws on missing directory). |

For backup writes (`vault.adapter.write`), folder creation (`vault.adapter.mkdir`), backup retrieval (`vault.adapter.read`) — also no in-tree analog. Planner should treat the `obsidian.d.ts` API contract + RESEARCH Patterns 3 + 4 as the authoritative reference.

---

## Metadata

**Analog search scope:**
- `src/widget/` (fenceLocator, fenceSerialization, codeBlockProcessor, liveModeViewPlugin, selfWriteSuppression, WidgetController)
- `src/solve/` (codeExtractor, starterCodeInjector, languages)
- `src/notes/` (NoteTemplate)
- `src/graph/` (copyToCode, mergeTechniquesSection)
- `src/main.ts` (addCommand patterns, onload structure, processFrontMatter callsites)
- `src/settings/` (SettingsStore, SettingsTab — useInlineWidget shape as canonical boolean-toggle precedent)
- `tests/widget/` (fenceSerialization.property.test.ts as property-test corpus pattern)

**Files scanned:** 14 source files + 1 property test (focused; per RESEARCH §"Code Files (touch points)" enumeration)

**Pattern extraction date:** 2026-06-01

**Key takeaway for the planner:**
- **Plan 21-01** (fenceMigrator core): copy `copyToCode.ts` shape + extend `fenceSerialization.ts` with `rewriteFenceOpenerTag` (mirror `rewriteFenceBody` structure); reuse `countLeetCodeSolveFenceOpeners` for idempotency; reuse `LC_LANG_SLUGS` + `resolveLangSlug` sentinel-trick from `starterCodeInjector.sectionHasRecognizedFence` for the strict-match predicate.
- **Plan 21-02** (mount integration + UX): copy `useInlineWidget` shape from `SettingsStore.ts:80-86, 278, 702-704, 890-899` + `SettingsTab.ts:291-308`; copy `renderStaticFallback` `createEl` pattern from `codeBlockProcessor.ts:42-69` for the banner; copy `addCommand` editorCheckCallback pattern from `main.ts:609-624` (`open-in-preview`) for the command palette entry.
- **Plan 21-03** (codeExtractor + new-note emission): widen `extractFirstFencedBlock` signature (existing line 46-60); thread `frontmatter` through 5 production consumers + 2 test files; mirror `forceInjectCodeSection`'s `fenceKind` arg + short-circuit (lines 164-179) onto `injectCodeSection`; add `codeBlockForV13` sibling next to `codeBlockFor` at `NoteTemplate.ts:118-121`.
- **Plan 21-04** (backup GC + fixtures + property tests): copy `tests/widget/fenceSerialization.property.test.ts:33-93` corpus + it.each pattern; use `obsidian.d.ts:1944-2032` `DataAdapter` API directly for `vault.adapter.list/rmdir/write/mkdir`; wrap every adapter call in `try/catch` + `logger.debug` per Pattern S-05.

**Single empirical risk** (per RESEARCH §"Open Questions §1"): the `vault.process` + `processFrontMatter` ordering — single render frame or two? Plan 21-01 dev-vault probe answers this; the fallback (Pattern S-03 selfWriteSuppression hash-arm) is already in tree.
