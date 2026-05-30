# Phase 20: Reconciliation, UX, Action Row, Section Protection — Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 19 (8 NEW source + 7 modified source + 9 NEW test stubs; some files cross-cut multiple plans)
**Analogs found:** 19/19 — every Phase 20 file maps onto an existing in-tree analog (no green-field code).

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/main/sectionProtectionExtension.ts` (NEW, fork) | CM6-extension (transactionFilter / changeFilter) | event-driven (transaction filter) | `src/main/sectionLockExtension.ts` | exact (literal `cp` + surgical delete per CONTEXT D-protect-04) |
| `src/widget/ConflictModal.ts` (NEW) | UI component (Obsidian Modal subclass) | request-response (user pick → resolution) | `src/auth/CookiePasteModal.ts` (form layout + Setting().addButton) + `src/graph/ConfirmOverwriteModal.ts` (resolver + settle pattern) | exact (Modal lifecycle); role-match (no in-tree 3-pane diff modal exists) |
| `src/widget/conflictDiff.ts` (NEW, ~150 LOC pure-TS LCS) | utility (pure function, no DOM, no I/O) | transform | `src/widget/hash.ts` (`djb2` / `sha1` — pure-TS, exported function, vitest-tested in isolation) + `src/widget/fenceSerialization.ts` (line-scan + transform shape) | role-match (no LCS analog; closest pure-fn export shape) |
| `src/widget/themeListener.ts` (NEW) | service (single global listener fans out to registry) | event-driven | `src/main/codeActionsEditorExtension.ts:329-359` (the inline `metadataCache.on('changed')` registerEvent block — fan-out-to-active-view shape) + `src/main.ts:935-939` (active-leaf-change → flushAll fan-out) | role-match (no `css-change` listener exists yet; the registerEvent + iterate-registry shape is the analog) |
| `src/widget/multiPaneCoordinator.ts` (NEW) | service (workspace event listener + per-widget state mutator) | event-driven | `src/solve/ephemeralTabStore.ts:46-100` (active-leaf-change reconcile pattern) + `src/widget/widgetRegistry.ts:67-119` (registry walk shape) | role-match (no multi-pane affordance in tree; the reconcile-on-leaf-change shape is the closest analog) |
| `src/widget/widgetActions.ts` (NEW, ~80 LOC adapter) | utility (DOM mount adapter; routes host calls to widget-aware methods) | request-response | `src/main/codeActionsPostProcessor.ts:4-25` (calls `buildCodeBlockButtonRow(doc, plugin)` + appends to host) + `src/main/codeActionsEditorExtension.ts` `CodeActionsWidget.toDOM` shape | exact (mount-adapter shape) |
| `src/main.ts` *FromWidget methods (5 NEW alongside existing) | controller (plugin method) | request-response | `src/main.ts:2356-2362` (`resetFromActive`), `:2365-2397` (`retrieveLastSubmissionFromActive`), `:2459-2624` (`submitFromActive`), `:2631-2657` (`runFromActive`), `:2339-2354` (`aiSolutionFromActive`) | exact (`*FromWidget` is parallel-method shape per CONTEXT D-action-04) |
| `src/main.ts` mutually-exclusive registration block (Plan 20-01 modify) | controller (plugin onload registration) | config | `src/main.ts:843-868` (existing `if (!useInlineWidget) { ... }` codeActionsPostProcessor + buildCodeActionsEditorExtension gate); `:911-1019` (`if (useInlineWidget) { ... }` widget block); `:1029` (current `buildSectionLockExtension` registration to relocate) | exact (the same flag-gate shape already split across both branches) |
| `src/widget/WidgetController.ts` extensions (Plans 20-01, 20-02, 20-03, 20-04 all modify) | controller class (per-widget state + lifecycle) | event-driven (CM6 update → write; metadataCache → reconfigure) | itself (Phase 19 baseline `WidgetController` at `src/widget/WidgetController.ts:123-178`); the existing `flushNow` + `destroy` + `getDoc` shape extends with `reloadFromDisk` / `reconfigureVim` / `cssRetheme` / `greyedOut` | exact (extension of the Phase 19 controller — same file, same class) |
| `src/widget/LeetCodeFenceWidget.ts` `toDOM` extension (Plan 20-02, 20-04) | UI component (CM6 WidgetType) | request-response (build DOM, return) | itself, `src/widget/LeetCodeFenceWidget.ts:89-100` `toDOM` body — same WidgetType pattern, append action-row + overlay siblings to host | exact |
| `src/widget/debouncedWriter.ts` `hasPending()` accessor (Plan 20-03 modify) | service method | request-response (sync getter) | `src/widget/debouncedWriter.ts:81-103` (existing `cancel`/`forceFlush`/`setDelay` accessor shape) | exact (same class, same accessor signature) |
| `src/widget/codeBlockProcessor.ts` (Plan 20-02 may modify) | controller (Reading-mode processor) | request-response | `src/widget/codeBlockProcessor.ts:77-155` (existing `leetCodeBlockProcessor` body); per RESEARCH §"Recommended Project Structure" + ACTION-06, this file is **likely unchanged** in Phase 20 — action-row mount happens inside `mountLeetCodeWidget` via `widgetActions.ts`. Reading-mode action row is owned by `src/main/codeActionsPostProcessor.ts` (UNCHANGED). | exact (likely no-op; if needed, the `LeetCodeWidgetRenderChild` host is the mount point) |
| `src/widget/liveModeViewPlugin.ts` (Plan 20-02 may modify) | controller (CM6 ViewPlugin + Decoration.replace) | event-driven | `src/widget/liveModeViewPlugin.ts:46-93` `buildLeetCodeFenceRanges`. The `Decoration.replace` payload is the `LeetCodeFenceWidget` whose `toDOM` mount-factory now appends the action-row container — so this file likely needs **no changes** (the action row sits inside the widget's container, not as a sibling decoration). | exact (likely no-op; the mount factory carries the action row) |
| `styles.css` (Plans 20-03, 20-04 add `.lc-takeover-overlay`, `.lc-conflict-*`) | config (CSS) | n/a | existing styles.css conventions: `.leetcode-code-actions` (action row), `.leetcode-language-chevron-*`, `.leetcode-locked-heading-line` — `kebab-case`-prefixed, Obsidian CSS variables only (no raw hex except documented exceptions); 20-UI-SPEC §Color enumerates the new classes verbatim | exact (style discipline pattern) |
| `tests/main/sectionProtectionExtension.test.ts` (NEW Wave 0 fork) | test (Vitest unit) | n/a | `tests/main/sectionLockExtension.test.ts` (existing 100+ cases — fork source per CONTEXT D-protect-04 acceptance gate) | exact |
| `tests/widget/conflictDiff.test.ts` (NEW Wave 0) | test (pure-fn) | n/a | `tests/widget/fenceLocator.test.ts` / `tests/widget/fenceSerialization.property.test.ts` (pure-function unit shape) | role-match |
| `tests/widget/ConflictModal.test.ts` (NEW Wave 0) | test (Modal lifecycle) | n/a | `tests/widget/WidgetController.test.ts` shape + `tests/main/codeBlockButtonRow.test.ts` (DOM-on-fake-doc shape) | role-match |
| `tests/widget/themeListener.test.ts` (NEW Wave 0) | test (event listener) | n/a | `tests/widget/modifyEventOrdering.probe.test.ts` (event-fire / observe shape) | role-match |
| `tests/widget/multiPaneCoordinator.test.ts` (NEW Wave 0) | test (event listener + registry walk) | n/a | `tests/widget/widgetRegistry.test.ts` + `tests/widget/WidgetController.test.ts` | role-match |
| `tests/widget/widgetActionRow.test.ts` (NEW Wave 0) | test (DOM adapter) | n/a | `tests/main/codeBlockButtonRow.test.ts` (DOM assertion shape) | exact |
| `tests/widget/languageSwitch.test.ts` (NEW Wave 0) | test (frontmatter → reconfigure) | n/a | `tests/main/switchFenceLanguage.test.ts` + `tests/main/fmReactivity.test.ts` | exact |
| `tests/widget/vimReconfigure.test.ts` (NEW Wave 0) | test (Compartment.reconfigure) | n/a | `tests/widget/vimMount.test.ts` + Phase 16 `tests/main/childEditorLanguage.behavioral.test.ts` (Compartment swap shape) | role-match |
| `tests/widget/externalEditReload.test.ts` + `conflictTrigger.test.ts` (NEW Wave 0) | test (vault.on('modify') branch decision tree) | n/a | `tests/widget/selfWriteSuppression.test.ts` + `tests/widget/modifyEventOrdering.probe.test.ts` | exact |

---

## Pattern Assignments

### 1. `src/main/sectionProtectionExtension.ts` (NEW, ~370 LOC) — Plan 20-01

**Analog:** `src/main/sectionLockExtension.ts` (527 LOC) — **literal fork** per CONTEXT D-protect-04.

**Imports pattern** (`src/main/sectionLockExtension.ts:40-63`) — preserve verbatim except rename:
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  Transaction,
  type EditorState as EditorStateType,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import {
  AI_REVIEW_HEADING_LINE,
  CODE_HEADING_LINE,
  NOTES_HEADING_LINE,
  PROBLEM_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
} from '../notes/NoteTemplate';
import { findCodeFence } from './codeActionsEditorExtension';
```

**Preserve verbatim — boundary fix** (`src/main/sectionLockExtension.ts:415-431`):
```typescript
// Boundary fix (UAT 2026-05-13): CM6's changeFilter is exclusive at
// boundaries — a pure insertion at position `lockFrom` does not
// strictly overlap `[lockFrom, lockTo]` so the change passes through.
// ... Extending each lock's `from` backward by 1 (clamped at 0) makes
// such boundary insertions fall strictly inside the suppressed range.
const ranges = computeLockedRanges(tr.startState);
if (ranges.length === 0) return true;
const expanded: number[] = [];
for (let i = 0; i < ranges.length; i += 2) {
  expanded.push(Math.max(0, (ranges[i] as number) - 1));
  expanded.push(ranges[i + 1] as number);
}
return expanded;
```

**Preserve verbatim — `'leetcode.*'` userEvent bypass** (`src/main/sectionLockExtension.ts:374-391`) — load-bearing per CONTEXT L6 + D-protect-02; PROTECT-03 (Phase 22) removes:
```typescript
const isUserInput =
  typeof ev === 'string' &&
  (ev.startsWith('input.') ||
    ev.startsWith('delete.') ||
    ev === 'undo' ||
    ev === 'redo');
if (!isUserInput) return true;

// Gate 1 — D-04 + Pitfall 5: plugin-side dispatches with userEvent
// starting `'leetcode.'` bypass the lock so the chevron switch
// (Phase 5.3) and any future plugin-driven CM6 dispatch keeps working.
if (ev.startsWith('leetcode.')) {
  return true;
}
```

**Preserve verbatim — file + lc-slug gate** (`src/main/sectionLockExtension.ts:393-407`):
```typescript
const file = tr.startState.field(editorInfoField)?.file;
if (!file) return true;
const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) {
  return true;
}
```

**Preserve verbatim — selection-snap transactionFilter** (`src/main/sectionLockExtension.ts:453-520`) — UAT 2026-05-13 derived; collapsed-cursor only; passes through `tr.changes` / `tr.effects` / `tr.scrollIntoView`. **Copy this entire block byte-for-byte.**

**Preserve verbatim — `mergeLockedRanges` + `computeSnapTarget` helpers** (`src/main/sectionLockExtension.ts:228-285`) — used by transactionFilter; pure exported helpers covered by existing tests.

**Preserve verbatim — `## Problem` body lock** (`src/main/sectionLockExtension.ts:144-156`):
```typescript
if (cur.kind === 'problem') {
  const nextHeadingLine =
    h + 1 < headings.length
      ? (headings[h + 1] as HeadingHit).line
      : total + 1;
  const bodyTo =
    nextHeadingLine <= total
      ? state.doc.line(nextHeadingLine).from
      : state.doc.line(total).to;
  out.push(headFrom, bodyTo);
}
```

**SURGICAL DELETE — fence opener-line + closer-line lock** (`src/main/sectionLockExtension.ts:157-194`). Today the `'code'` branch emits:
1. `out.push(headFrom, openerTo)` — heading + blank-line pocket + opener line — **PRESERVE per CONTEXT D-protect-01** (the heading + pocket lock stays; the **fence opener line itself becomes editable in source mode** but `atomicRanges` from Phase 19's ViewPlugin keeps the parent cursor out).
2. `out.push(closer.from, closerLockTo)` — fence closer line through next heading — **DELETE entirely** (CONTEXT D-protect-04: "DELETE in sectionProtectionExtension.ts: fence closer lock is no longer needed").
3. `else { out.push(headFrom, headTo); }` malformed-note fallback — **PRESERVE verbatim**.

Net deletion target: ~150 LOC removed from 527 LOC base → ~370 LOC.

**Preserve verbatim — heading-line decorations** (`src/main/sectionLockExtension.ts:288-319`) — `.leetcode-locked-heading-line` cosmetic; preserved unchanged; `Decoration.line` zero-length range at `line.from`.

**Renames** — search/replace ONLY:
- `buildSectionLockExtension` → `buildSectionProtectionExtension`
- File header banner: `"Phase 05.5 (POLISH) — Section Locking"` → `"Phase 20 — Section Protection (forked from sectionLockExtension at v1.3)"`

---

### 2. `src/widget/ConflictModal.ts` (NEW) — Plan 20-03

**Analog (Modal lifecycle):** `src/auth/CookiePasteModal.ts` (87 LOC) — minimal `Modal` subclass with `Setting().addButton().setCta()` primary CTA pattern.

**Imports pattern** (`src/auth/CookiePasteModal.ts:10`):
```typescript
import { App, Modal, Notice, Setting } from 'obsidian';
```

**Modal lifecycle pattern** (`src/auth/CookiePasteModal.ts:13-86`):
```typescript
export class CookiePasteModal extends Modal {
  private sessionValue = '';
  private csrfValue = '';

  constructor(
    app: App,
    private readonly onSave: (cookies: AuthCookies) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-settings');
    contentEl.createEl('h2', { text: 'Manual cookie (fallback)' });
    contentEl.createEl('p', { text: '...', cls: 'setting-item-description' });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Save cookies')
        .onClick(async () => {
          // ... validation + persist + this.close()
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

**Apply to ConflictModal:**
- Constructor `(app, widget, mineDoc, externalDoc)` per RESEARCH Example 1.
- `onOpen` calls `contentEl.empty()` first; emits `<h2>External edit detected</h2>`; emits `<p>` body paragraph (locked copy from 20-UI-SPEC §Copywriting).
- Three buttons via `new Setting(contentEl).addButton(...).addButton(...).addButton(...)`. **"Keep mine"** uses `.setCta()` (matches 20-UI-SPEC §Color "Accent reserved for #3"); **"Keep external"** and **"View diff"** are neutral.
- `onClose` calls `this.contentEl.empty()`.

**Analog (resolver / settle pattern, second-fire defense):** `src/graph/ConfirmOverwriteModal.ts:22-102`:
```typescript
export class ConfirmOverwriteModal extends Modal {
  private readonly resolver: (result: boolean) => void;
  private settled = false;

  constructor(app: App, onResult: (result: boolean) => void) {
    super(app);
    this.resolver = onResult;
  }

  private settle(result: boolean): void {
    if (this.settled) return;
    this.settled = true;
    try { this.resolver(result); } catch { /* swallow */ }
  }

  onClose(): void {
    this.settle(false);  // dismiss without click → cancel
    clear(this.contentEl);
  }
}
```

**Apply to ConflictModal:**
- D-conflict-04 second external edit: a public `updateExternalContent(newExt)` method mutates `this.externalDoc` and calls `this.renderDiff()` if `diffOpen`. The `isOpen` boolean (set in `open()`/`close()` overrides) gates whether `vault.on('modify')` calls `updateExternalContent` vs. opens a fresh modal — same `settled`-style guard pattern as `ConfirmOverwriteModal`.

**DOM-no-innerHTML discipline** (`src/auth/CookiePasteModal.ts:29-30` + project lint rule): use `createEl('h2', { text })` / `createEl('p', { text })` / `createEl('pre', { cls })` only. Diff column rendering (the `lineDiff(...)` output): per `<DiffRow>` create a `<span class="lc-diff-{kind}">` and set `textContent` — never `innerHTML` (CLAUDE.md §"No innerHTML in widget code").

**Sizing override pattern (if needed)** (`src/main.ts:2448-2453`): `modal.modalEl.style.setProperty('width', 'min(90vw, 780px)', 'important');`. Use sparingly — 20-UI-SPEC says use Obsidian default modal sizing (`min(700px, 90vw)`) and only override if the 3-pane diff doesn't fit.

---

### 3. `src/widget/conflictDiff.ts` (NEW, ~150 LOC) — Plan 20-03

**Analog (pure-fn export shape):** `src/widget/hash.ts` + `src/widget/fenceSerialization.ts` (line-scan + transform pure functions; no DOM, no I/O; vitest-tested in isolation).

**Pattern (hash.ts shape):**
```typescript
// src/widget/hash.ts — exact line counts unverified, but the export shape
// is a single pure function returning a primitive, fully tested in
// tests/widget/.
export function djb2(s: string): string { /* pure */ }
```

**Pattern (`src/widget/debouncedWriter.ts:35-55` `sha1` for graceful-degradation pure function):**
```typescript
export async function sha1(s: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  // ... hand-rolled fallback when subtle missing (test envs)
}
```

**Apply to conflictDiff.ts:** single-file, single export `lineDiff(mine: string, ext: string): DiffRow[]` plus the `DiffRow` interface. Skeleton (verbatim from 20-RESEARCH.md §"Pattern 5: Pure-TS LCS Diff", lines 484-526). No imports needed beyond `interface DiffRow {...}`. No DOM, no I/O, no async — instantly testable.

**Test analog:** `tests/widget/fenceLocator.test.ts` (assertion shape: input string fixtures + property assertions on returned shape).

---

### 4. `src/widget/themeListener.ts` (NEW) — Plan 20-04

**Analog (single-listener fan-out + registry walk):** `src/main/codeActionsEditorExtension.ts:329-359` (the `metadataCache.on('changed')` block that fans out to the active `MarkdownView`).

**Pattern (`src/main/codeActionsEditorExtension.ts:329-359`):**
```typescript
try {
  plugin.registerEvent(
    plugin.app.metadataCache.on('changed', (file) => {
      try {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || view.file !== file) return;
        const cm = (view.editor as unknown as { cm: EditorView }).cm;
        // ... read fresh fm, compute payload, dispatch effect
        cm.dispatch({ effects: languageRefreshEffect.of(freshSlug) });
      } catch {
        // Silently ignore — editor may be in teardown
      }
    }),
  );
} catch {
  // Defensive: metadataCache not yet wired (test fixtures)
}
```

**Apply to themeListener.ts** (skeleton verbatim from 20-RESEARCH.md §"Pattern 7", lines 626-637):
```typescript
import { type Plugin } from 'obsidian';
import type { WidgetRegistry } from './widgetRegistry';

export function registerThemeListener(plugin: Plugin & { widgetRegistry: WidgetRegistry }): void {
  plugin.registerEvent(
    plugin.app.workspace.on('css-change', () => {
      for (const ctl of plugin.widgetRegistry.values()) {
        // Force CM6 to remeasure after the new theme has applied.
        ctl.view.requestMeasure();
      }
    })
  );
}
```

**Note:** `WidgetRegistry` (current `src/widget/widgetRegistry.ts:38`) does NOT expose `values()` directly — it has internal `private readonly map`. Plan 20-04 needs to add a `values()` accessor (following the existing accessor shape at `widgetRegistry.ts:42-122`). The new method shape:
```typescript
// Add to src/widget/widgetRegistry.ts
*values(): IterableIterator<WidgetControllerLike> {
  yield* this.map.values();
}
```

This is a one-line addition matching the existing `flushAll` / `flushAllSync` / `destroyAll` iteration shape.

**Verified `css-change` API:** `obsidian.d.ts:7137` (per 20-RESEARCH.md). No MutationObserver fallback needed.

**Apply to all controllers:** call `ctl.view.requestMeasure()` on every fire; cursor + scroll + undo state preserved (no rebuild).

---

### 5. `src/widget/multiPaneCoordinator.ts` (NEW) — Plan 20-04

**Analog (active-leaf-change reconcile pattern):** `src/solve/ephemeralTabStore.ts:46-100`:
```typescript
plugin.registerEvent(
  plugin.app.workspace.on('active-leaf-change', () => this.reconcile()),
);
plugin.registerEvent(
  plugin.app.workspace.on('layout-change', () => this.reconcile()),
);
```

**Pattern (registry-walk shape — `src/widget/widgetRegistry.ts:67-119`):**
```typescript
async flushAll(): Promise<void> {
  for (const ctl of this.map.values()) {
    await ctl.flushNow();
  }
}
async flushFile(filePath: string): Promise<void> {
  for (const ctl of this.map.values()) {
    if (ctl.file.path === filePath) await ctl.flushNow();
  }
}
```

**Apply to multiPaneCoordinator.ts:**
```typescript
import type { Plugin, TFile, MarkdownView } from 'obsidian';
import { MarkdownView as MV } from 'obsidian';
import type { WidgetRegistry } from './widgetRegistry';

export function registerMultiPaneCoordinator(
  plugin: Plugin & { widgetRegistry: WidgetRegistry },
): void {
  plugin.registerEvent(
    plugin.app.workspace.on('active-leaf-change', () => {
      const active = plugin.app.workspace.getActiveViewOfType(MV);
      if (!(active?.file)) return;
      const activePath = active.file.path;
      // Walk registry — widgets keyed `${path}::${idx}` matching activePath
      // become "active" (greyedOut=false); peers on the same path in OTHER
      // panes become "inactive" (greyedOut=true).
      for (const ctl of plugin.widgetRegistry.values()) {
        const isOnActiveFile = ctl.file.path === activePath;
        // Determine pane affiliation by walking up DOM from ctl.container —
        // the closest .workspace-leaf is the pane.
        const pane = ctl.container.closest('.workspace-leaf');
        const activePaneEl = active.containerEl.closest('.workspace-leaf');
        const isInActivePane = pane === activePaneEl;
        const newGreyed = isOnActiveFile && !isInActivePane;
        ctl.setGreyedOut?.(newGreyed);
      }
    }),
  );
}
```

**Greyed-out container attribute pattern** — UI-SPEC § "Multi-Pane 'Take Over'" mandates `data-pane-state="active|inactive"` on `.lc-nested-editor` container. Toggle in `WidgetController.setGreyedOut(b)` via `this.container.setAttribute('data-pane-state', b ? 'inactive' : 'active')`. Same DOM-attribute discipline as the existing `aria-expanded` flip in `src/main/languageChevronWidget.ts:179`.

---

### 6. `src/widget/widgetActions.ts` (NEW, ~80 LOC) — Plan 20-02

**Analog (mount-adapter shape):** `src/main/codeActionsPostProcessor.ts:4-25`:
```typescript
export function registerCodeBlockActionProcessor(
  plugin: Plugin & CodeBlockButtonRowHost,
): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
    // ... gates ...
    const doc: Document = pre.ownerDocument as unknown as Document;
    const row = buildCodeBlockButtonRow(doc, plugin);
    pre.insertAdjacentElement('afterend', row);
  });
}
```

**Apply to widgetActions.ts** (skeleton verbatim from 20-RESEARCH.md §"Pattern 2", lines 358-379):
```typescript
import { buildCodeBlockButtonRow } from '../main/codeBlockButtonRow';
import { buildLanguageChevron } from '../main/languageChevronWidget';
import type { TFile } from 'obsidian';
import type { WidgetController } from './WidgetController';

export function mountActionRow(
  ctl: WidgetController,
  file: TFile,
  currentSlug: string,
  doc: Document,
): HTMLDivElement {
  // CodeBlockButtonRowHost adapter — routes *FromActive to *FromWidget.
  const host = {
    runFromActive: () => ctl.plugin.runFromWidget(ctl),
    submitFromActive: () => ctl.plugin.submitFromWidget(ctl),
    aiDebugFromActive: () => Promise.resolve(),  // not in widget row (D-action-03)
    aiSolutionFromActive: () => ctl.plugin.aiSolutionFromWidget(ctl),
    resetFromActive: () => ctl.plugin.resetFromWidget(ctl),
    retrieveLastSubmissionFromActive: () => ctl.plugin.retrieveLastSubmissionFromWidget(ctl),
    switchLanguage: (f: TFile, slug: string) => ctl.plugin.switchLanguageFromWidget(ctl, f, slug),
  };
  const row = buildCodeBlockButtonRow(doc, host as never, {
    prefix: () => buildLanguageChevron(doc, host as never, file, currentSlug),
  });
  ctl.container.appendChild(row);
  return row;
}
```

**Reference contract** — the host shape MUST match `CodeBlockButtonRowHost` (from `src/main/codeBlockButtonRow.ts:3-10`):
```typescript
export interface CodeBlockButtonRowHost {
  resetFromActive(): void | Promise<void>;
  retrieveLastSubmissionFromActive(): void | Promise<void>;
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
  aiDebugFromActive(): void | Promise<void>;
  aiSolutionFromActive(): void | Promise<void>;
}
```
…plus `LanguageChevronHost` (`src/main/languageChevronWidget.ts:53-55`):
```typescript
export interface LanguageChevronHost extends CodeBlockButtonRowHost {
  switchLanguage(file: TFile, newSlug: string): Promise<void>;
}
```

The widgetActions adapter satisfies both interfaces structurally; existing `buildCodeBlockButtonRow` API is reused **verbatim** per CONTEXT D-action-02.

**Embed-skip pattern** (`src/widget/embedDetect.ts` exposes `isEmbedContext`): `mountActionRow` skip-call pattern lives in the caller (`mountLeetCodeWidget` in `src/widget/WidgetController.ts:332`), not inside widgetActions.

---

### 7. `src/main.ts` *FromWidget methods (NEW alongside existing) — Plan 20-02

**Analog:** the existing `*FromActive` family in `src/main.ts`:

| New Method | Existing Analog | Lines | Pattern Detail |
|------------|----------------|-------|----------------|
| `runFromWidget(widget)` | `runFromActive` | `src/main.ts:2631-2657` | Read `getActiveProblemContext` → `RunModal` → `runInterpretedInput`. **Refactor target:** extract `runWithCode(file, slug, language, code)` private — `*FromActive` reads code via `view.editor.cm.state.doc.toString()`, `*FromWidget` reads `widget.view.state.doc.toString()` — both call `runWithCode`. |
| `submitFromWidget(widget)` | `submitFromActive` | `src/main.ts:2459-2624` | Same — extract `submitWithCode(file, slug, language, title, code)`; widget supplies code + frontmatter via `widget.file` + `metadataCache.getFileCache`. |
| `aiSolutionFromWidget(widget)` | `aiSolutionFromActive` | `src/main.ts:2339-2354` | Calls `openAISolution(slug)`; the method already reads frontmatter via `metadataCache.getFileCache(view.file)?.frontmatter`. Replace `view.file` with `widget.file`. |
| `resetFromWidget(widget)` | `resetFromActive` | `src/main.ts:2356-2363` | One-liner — calls `resetCode(file, slug)`. Replace `getActiveProblemContext()` → `getProblemContextFromWidget(widget)`. |
| `retrieveLastSubmissionFromWidget(widget)` | `retrieveLastSubmissionFromActive` | `src/main.ts:2365-2397` | Same shape — replace context resolver. |

**Pattern (`src/main.ts:2356-2362`):**
```typescript
async resetFromActive(): Promise<void> {
  const ctx = this.getActiveProblemContext();
  if (!ctx) {
    new Notice('Open a LeetCode problem note first.', 4000);
    return;
  }
  await this.resetCode(ctx.file, ctx.slug);
}
```

**Apply to `resetFromWidget`** (Plan 20-02):
```typescript
async resetFromWidget(widget: WidgetController): Promise<void> {
  await widget.flushNow();  // ACTION-04 + Pitfall 19-A self-write hygiene
  const fm = this.app.metadataCache.getFileCache(widget.file)?.frontmatter as
    | Record<string, unknown> | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    new Notice('This widget is not on a LeetCode note.', 4000);
    return;
  }
  await this.resetCode(widget.file, slug);
}
```

**Pattern (`src/main.ts:2631-2657` `runFromActive`):**
```typescript
async runFromActive(): Promise<void> {
  const ctx = this.getActiveProblemContext();
  if (!ctx) { new Notice('Open a LeetCode problem note first.', 4000); return; }
  const detail = this.settings.getProblemDetail(ctx.slug);
  // ... linesPerCase derive ...
  new RunModal(this.app, {
    slug: ctx.slug,
    exampleTestcases: detail?.exampleTestcases ?? '',
    linesPerCase,
    store: this.ephemeralTabs,
    onRun: (input: string) => {
      const current = this.getActiveProblemContext();
      if (current) void this.runInterpretedInput(current, input);
    },
  }).open();
}
```

**Apply to `runFromWidget`:** same body but resolve `ctx` from `widget.file` + `metadataCache` rather than `getActiveViewOfType(MarkdownView)`. **Critical:** `onRun` callback's re-resolve at modal-Run-click time should resolve from widget too (or fall back to `getActiveProblemContext()` if widget is destroyed by then).

**Refactor seam pattern** (per CONTEXT D-action-04): extract `runWithCode` / `submitWithCode` / etc. private helpers so `*FromActive` and `*FromWidget` both call into a single shared body. Phase 22 mechanical sweep: delete `*FromActive` and rename `*FromWidget` → `*FromActive`.

---

### 8. `src/main.ts` mutually-exclusive registration — Plan 20-01

**Analog:** the existing `if (!this.settings.getUseInlineWidget())` gate at `src/main.ts:843-868` (which already gates the v1.2 codeActionsPostProcessor + buildCodeActionsEditorExtension to OFF) and the `if (useInlineWidget)` block at `src/main.ts:911-1019` (Phase 19's widget activation block).

**Current registration (`src/main.ts:1029`):**
```typescript
this.registerEditorExtension(buildSectionLockExtension(this));
```

**Apply (Plan 20-01):**
```typescript
// Phase 20 Plan 20-01 — mutually-exclusive section protection (CONTEXT D-protect-03).
// useInlineWidget=ON → narrow protection (## Problem body + ## Code heading + ## Techniques heading).
// useInlineWidget=OFF → v1.2 wide lock (carry-forward).
// The mutual-exclusion assert at lines 885-890 already guarantees only one
// of useInlineWidget / useNestedEditor fires at any time.
if (this.settings.getUseInlineWidget()) {
  this.registerEditorExtension(buildSectionProtectionExtension(this));
} else {
  this.registerEditorExtension(buildSectionLockExtension(this));
}
```

The same `useInlineWidget` flag is read **once at onload only** (matches the hard-gate convention at `src/main.ts:851-852`).

---

### 9. `src/widget/WidgetController.ts` extensions (all four plans modify)

**Analog:** itself — `src/widget/WidgetController.ts:123-178` is the Phase 19 baseline; Phase 20 extends without rewriting.

**Existing `WidgetController` shape** (`src/widget/WidgetController.ts:123-178`):
```typescript
export class WidgetController {
  public writer?: DebouncedWriter;
  public readonly persistenceKey: string;

  constructor(
    public readonly view: EditorView,
    public readonly container: HTMLElement,
    public readonly file: TFile,
    public readonly fenceIndex: number,
    public readonly plugin: WidgetMountHost,
  ) {
    this.persistenceKey = `${file.path}::${fenceIndex}`;
  }

  flushNow(): Promise<void> { /* writer.forceFlush */ }
  destroy(): void { /* persistence + writer.cancel + view.destroy */ }
  getDoc(): string { return this.view.state.doc.toString(); }
}
```

**Apply (Plan 20-01 vimCompartment):**
```typescript
// Add per-widget Compartment (NOT module-singleton — each widget has its own
// EditorView and Compartments are identity-keyed). RESEARCH §"Pattern 6"
// lines 580-601 supplies the skeleton verbatim.
private readonly vimCompartment = new Compartment();
private mountedVimMode = false;

reconfigureVim(enabled: boolean): void {
  if (this.mountedVimMode === enabled) return;
  this.mountedVimMode = enabled;
  this.view.dispatch({
    effects: this.vimCompartment.reconfigure(enabled ? vim({ status: true }) : []),
  });
}
```
The `buildExtensions` factory at `src/widget/WidgetController.ts:251-318` already conditionally injects `vim()`; Plan 20-01 wraps the conditional injection in `vimCompartment.of(...)`.

**Apply (Plan 20-02 actionRow):**
```typescript
public actionRow?: HTMLDivElement;
// In mountLeetCodeWidget (src/widget/WidgetController.ts:332): after
// ctl = new WidgetController(...), call:
//   ctl.actionRow = mountActionRow(ctl, file, slug, document);
// (skip when isEmbedContext returns true; matches Phase 19 ProcessorHost gating)
```

**Apply (Plan 20-03 reloadFromDisk):** verbatim from 20-RESEARCH.md §"Pattern 4" + §"Code Examples — Reload-with-cursor" (lines 949-995). The `EditorSelection.cursor(restoredHead)` + `Transaction.addToHistory.of(false)` pattern.

**Apply (Plan 20-04 cssRetheme):**
```typescript
cssRetheme(): void {
  // CM6's requestMeasure schedules layout recompute on next animation frame.
  this.view.requestMeasure();
}
setGreyedOut(b: boolean): void {
  this.container.setAttribute('data-pane-state', b ? 'inactive' : 'active');
  // Show/hide overlay child — created lazily on first transition.
  // (Or render conditionally inside LeetCodeFenceWidget.toDOM per 20-UI-SPEC §3.)
}
```

**Per-widget metadataCache subscription** (Plan 20-02 — language switch reactivity). Pattern from `src/main/codeActionsEditorExtension.ts:329-359` (already shown above). Wrap with `plugin.registerEvent` and filter by `file.path === widget.file.path`.

---

### 10. `src/widget/LeetCodeFenceWidget.ts` `toDOM` extension — Plans 20-02, 20-04

**Analog:** itself — `src/widget/LeetCodeFenceWidget.ts:89-100`:
```typescript
toDOM(_view: EditorView): HTMLElement {
  const host = document.createElement('div');
  mountLeetCodeWidget(
    host, this.source, this.file, this.plugin,
    /*readOnly=*/false, this.fenceIndex,
  );
  return host;
}
```

**Apply (Plan 20-02 + 20-04):** No changes here directly — `mountLeetCodeWidget` (in `src/widget/WidgetController.ts:332`) becomes the seam that appends action-row + (optional) takeover-overlay child elements to the `container`. The `LeetCodeFenceWidget.toDOM` body remains identical.

**If `greyedOut` initial state must be honored at construction:** add `greyedOut: boolean` to the WidgetType constructor's identity contract — but **avoid this** — `WidgetType.eq()` (at `src/widget/LeetCodeFenceWidget.ts:66-74`) is content-hash-based. Greyed-out is per-instance state that shouldn't trigger remount; toggle via `data-pane-state` attribute (set in `WidgetController.setGreyedOut()` per multiPaneCoordinator).

---

### 11. `src/widget/debouncedWriter.ts` `hasPending()` accessor — Plan 20-03

**Analog:** itself — `src/widget/debouncedWriter.ts:81-103` (existing `cancel`/`forceFlush`/`setDelay` accessor shape).

**Existing accessors** (`src/widget/debouncedWriter.ts:81-103`):
```typescript
cancel(): void {
  this.deb.cancel();
  if (this.rateLimitTimer !== null) {
    clearTimeout(this.rateLimitTimer);
    this.rateLimitTimer = null;
  }
}

forceFlush(): Promise<void> {
  this.deb.cancel();
  return this.flush();
}

setDelay(ms: number): void { /* ... */ }
```

**Apply (Plan 20-03):** add a sentinel boolean (per RESEARCH §"Pattern 4" lines 471-473 — "Obsidian Debouncer doesn't expose this directly; Plan 20-03 must wrap with a sentinel boolean reset on `flush()` and set on `run()`"):
```typescript
private pending = false;

run(): void {
  this.pending = true;
  this.deb();
}

hasPending(): boolean {
  return this.pending;
}

private async flush(): Promise<void> {
  // ... existing body (lines 107-178) ...
  // At the END (after vault.process completes):
  this.pending = false;
}

cancel(): void {
  this.deb.cancel();
  this.pending = false;  // also clear on cancel
  if (this.rateLimitTimer !== null) {
    clearTimeout(this.rateLimitTimer);
    this.rateLimitTimer = null;
  }
}

forceFlush(): Promise<void> {
  this.deb.cancel();
  // Don't clear `pending` here — the awaiting `flush()` body still needs to run;
  // `flush()` sets it false at completion.
  return this.flush();
}
```

---

### 12. `styles.css` additions — Plans 20-03, 20-04

**Analog:** existing styles.css conventions.

**Existing class naming:**
- `.leetcode-code-actions` — outer flex container (CSS variables only).
- `.leetcode-code-action-icon` / `.leetcode-code-action-run` / `.leetcode-code-action-submit` / `.leetcode-code-action-ai-solution` — pill button shapes.
- `.leetcode-language-chevron-wrapper` / `-button` / `-dropdown` / `-item` — chevron + portal popover.
- `.leetcode-locked-heading-line` — heading-line cosmetic dim.
- `.lc-nested-editor` / `.lc-leetcode-solve` (Phase 19) — widget container classes.

**Apply (Plan 20-04 — multi-pane overlay):** verbatim from 20-UI-SPEC §3 (line ~286-320):
```css
.lc-nested-editor[data-pane-state="inactive"] { position: relative; }
.lc-nested-editor[data-pane-state="inactive"] > .lc-takeover-overlay {
  position: absolute; inset: 0;
  background: var(--background-secondary); opacity: 0.55;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; border-radius: 4px; pointer-events: auto; z-index: 5;
}
.lc-nested-editor[data-pane-state="inactive"] > .lc-takeover-overlay:hover {
  border: 1px solid var(--interactive-accent);
}
.lc-takeover-cta {
  padding: 12px 16px; border-radius: 6px;
  background: var(--background-primary); color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  font-size: 13px; font-weight: 500;
}
```

**Apply (Plan 20-03 — conflict-modal diff classes):** prefix all new classes `lc-conflict-*` per existing `.leetcode-*` / `.lc-*` discipline:
- `.lc-conflict-diff` — outer container appended below button row.
- `.lc-conflict-cols` — `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;` (RESEARCH §"3-pane diff" + 20-UI-SPEC §2).
- `.lc-conflict-mine`, `.lc-conflict-external`, `.lc-conflict-merged` — per-column `<pre>` styling.
- `.lc-diff-same`, `.lc-diff-mine-only`, `.lc-diff-external-only`, `.lc-diff-changed` — inline `<span>` classes for merged column, with `color-mix(in srgb, ...)` token use per 20-UI-SPEC §Color "Diff color contract" table.

**Reduced-motion gating** (20-UI-SPEC §Accessibility):
```css
@media (prefers-reduced-motion: no-preference) {
  .lc-conflict-external--updated {
    outline: 1px solid var(--text-muted);
    transition: outline-color 200ms ease;
  }
}
```

---

### 13. `tests/main/sectionProtectionExtension.test.ts` (NEW Wave 0 fork)

**Analog:** `tests/main/sectionLockExtension.test.ts` (the existing 100+ test cases per Phase 5.5 UAT).

**Pattern** (`tests/main/sectionLockExtension.test.ts:1-100`):
- Imports `computeLockedRanges`, `buildSectionLockExtension`, `computeSnapTarget`, `mergeLockedRanges`, `LOCKED_HEADINGS` from `../../src/main/sectionLockExtension`.
- Mocks `obsidian` via `vi.mock('obsidian', async () => { const actual = await import('../helpers/obsidian-stub'); return actual; });`.
- Builds canonical fixtures via `canonicalNoteBody({ fenceLang, includeCustomTests, unterminatedFence })`.
- Iterates extension array and pulls callable via `extractChangeFilterCallback` helper.

**Apply (Plan 20-01):**
1. `cp tests/main/sectionLockExtension.test.ts tests/main/sectionProtectionExtension.test.ts`.
2. Replace import path: `'../../src/main/sectionLockExtension'` → `'../../src/main/sectionProtectionExtension'`.
3. Rename `buildSectionLockExtension` → `buildSectionProtectionExtension`.
4. **DELETE cases** that assert the fence-closer-line lock and the inter-fence body lock (per CONTEXT D-protect-04 surgical-deletion contract).
5. **PRESERVE cases** that assert: `## Problem` body lock, `## Code` heading + opener-line + blank-line-pocket lock, `## Techniques` heading lock, malformed-fence fall-through, `'leetcode.*'` userEvent bypass, boundary fix (`expanded.push(Math.max(0, from - 1))`), `mergeLockedRanges` shape, `computeSnapTarget` decision tree.

The acceptance gate is the v1.0 Phase 5.5 UAT regression rerun (CONTEXT D-protect-04 + RESEARCH §"What to Preserve Verbatim").

---

### 14. New test stubs (Plan 20-02..20-04)

| Test File | Closest existing analog | Pattern to copy |
|-----------|------------------------|-----------------|
| `tests/widget/conflictDiff.test.ts` | `tests/widget/fenceLocator.test.ts` (pure-fn); also Phase 19 hash test fixtures | Pure-input-output assertions; ~100 cases for hostile inputs (insertion, deletion, full replacement, empty inputs) per RESEARCH §Validation Architecture |
| `tests/widget/ConflictModal.test.ts` | `tests/widget/WidgetController.test.ts` + project Modal-test conventions (search for `extends Modal` test files in `tests/`) | Construct modal with fake `App` from `tests/helpers/obsidian-stub`; assert `onOpen` populates `contentEl`; `onClose` empties; `updateExternalContent` re-renders |
| `tests/widget/themeListener.test.ts` | `tests/widget/modifyEventOrdering.probe.test.ts` (event-fire / observe shape) | Fire fake `css-change`; assert `view.requestMeasure` called per registered widget |
| `tests/widget/multiPaneCoordinator.test.ts` | `tests/widget/widgetRegistry.test.ts` + `tests/widget/WidgetController.test.ts` | Two widgets keyed under same path; fire fake `active-leaf-change`; assert `setGreyedOut(true/false)` called correctly |
| `tests/widget/widgetActionRow.test.ts` | `tests/main/codeBlockButtonRow.test.ts` (DOM assertion shape — child-count, class names, button labels) | Construct fake `Document`; call `mountActionRow`; assert returned row has the 5 buttons + chevron prefix in correct order; assert button click fires the matching `*FromWidget` adapter method |
| `tests/widget/languageSwitch.test.ts` | `tests/main/switchFenceLanguage.test.ts` + `tests/main/fmReactivity.test.ts` | Fire `processFrontMatter` → `metadataCache.on('changed')`; assert `languageCompartment.reconfigure` was dispatched with `buildLanguageExtensions(newSlug, indent)` |
| `tests/widget/vimReconfigure.test.ts` | `tests/widget/vimMount.test.ts` + Phase 16 Compartment reconfigure tests | Mount widget vim=OFF; call `reconfigureVim(true)`; assert dispatch shape; assert toggling back to OFF passes empty array |
| `tests/widget/externalEditReload.test.ts` | `tests/widget/selfWriteSuppression.test.ts` | Fire `vault.on('modify')`; assert `selfWriteSuppression.tryConsume` called; on `'consumed'` no widget action; on `'miss'` + `!hasPending` → `reloadFromDisk('silent')` |
| `tests/widget/conflictTrigger.test.ts` | `tests/widget/modifyEventOrdering.probe.test.ts` | Set `widget.writer.hasPending() === true`; fire `vault.on('modify')`; assert `ConflictModal.open()` called; second fire while modal open → `updateExternalContent` |

All Wave 0 stubs follow the `vi.mock('obsidian', ...)` pattern at the top, the `tests/helpers/obsidian-stub.ts` shape for `createFakePlugin` / `makeStateForLockTests` / etc., and the project's vitest 4.1.5 conventions.

---

## Shared Patterns

### Pattern A: `registerEvent` for plugin-lifecycle cleanup

**Source:** `src/main.ts:935-1018` (six event-listener registrations from Phase 19) and `src/main/codeActionsEditorExtension.ts:329-359` (metadataCache subscription within an extension factory).

**Pattern:**
```typescript
plugin.registerEvent(
  plugin.app.workspace.on('css-change' /* or 'active-leaf-change' / 'layout-change' */, () => {
    /* handler */
  }),
);
plugin.registerEvent(
  plugin.app.metadataCache.on('changed', (file) => { /* handler */ }),
);
plugin.registerEvent(
  plugin.app.vault.on('modify', async (file) => { /* handler */ }),
);
plugin.registerEvent(
  plugin.app.vault.on('rename', (_file, oldPath) => { /* handler */ }),
);
```

**Apply to:** All Phase 20 listeners — `themeListener.ts` (css-change), `multiPaneCoordinator.ts` (active-leaf-change), per-widget metadataCache reactivity (Plan 20-02), Plan 20-01 layout-change for vim toggle. Auto-unregisters on `Plugin.onunload` (mandatory per CLAUDE.md "Resource cleanup").

### Pattern B: `'leetcode.*'` userEvent — DO NOT remove

**Source:** `src/main/sectionLockExtension.ts:387-391`; documented in CLAUDE.md §Conventions paragraph 1.

**Apply to:** `sectionProtectionExtension.ts` — preserve **verbatim** (CONTEXT L6 + D-protect-02). PROTECT-03 (Phase 22) removes it together with the v1.2 path deletion.

### Pattern C: Vault-layer write discipline

**Source:** `src/widget/debouncedWriter.ts:158-167` (canonical widget write — `app.vault.process(file, body => rewriteFenceBody(body, idx, newBody))`); CLAUDE.md §Conventions paragraph 2; `src/main.ts:2793-2795` (`processFrontMatter` for atomic frontmatter).

**Apply to:** All Phase 20 plugin writes — Plan 20-03 "Keep mine" calls `widget.writer.forceFlush()` (which goes through `vault.process`); Plan 20-02 chevron switch calls `app.fileManager.processFrontMatter(file, fm => { fm['lc-language'] = newSlug })`. **Never `vault.modify(file, data)`** — banned by `scripts/grep-no-vault-modify.sh`.

### Pattern D: `metadataCache.getFileCache(file)?.frontmatter` cast

**Source:** `src/main.ts:2328-2330` and 30+ other sites (the canonical cast pattern):
```typescript
const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown> | undefined;
```

**Apply to:** Every Phase 20 frontmatter read — `*FromWidget` methods, language-switch reactivity, multi-pane coordinator gating on `lc-slug`, Plan 20-01 protection extension's gate (preserve from `sectionLockExtension.ts:401-407`).

### Pattern E: No-`innerHTML` DOM construction

**Source:** `src/widget/codeBlockProcessor.ts:42-69` (uses `createEl('pre').createEl('code', { text: source })` and falls back to `document.createElement` + `textContent` in happy-dom test envs); `src/main/languageChevronWidget.ts:89-97` (`createElement` + `textContent` only; `setIcon` for icons); `src/auth/CookiePasteModal.ts:29-30` (`createEl('h2', { text })` / `createEl('p', { text, cls })`).

**Apply to:** All Phase 20 new files — `ConflictModal.ts`, `widgetActions.ts`, `themeListener.ts`, `multiPaneCoordinator.ts`. Diff column rendering uses `<span class="lc-diff-{kind}">` with `textContent` only. CLAUDE.md §Constraints + `eslint-plugin-obsidianmd` enforce.

### Pattern F: Single-flush-then-write seam

**Source:** `src/main.ts:2768-2796` (`switchFenceLanguage` Step B → B′ → C ordering — flush widget edits BEFORE writing frontmatter so pending characters don't end up under the new slug).

**Apply to:** Plan 20-02 `switchLanguageFromWidget` Step 1 = `await widget.flushNow()`; Plan 20-02 `*FromWidget` methods all call `widget.flushNow()` BEFORE reading `widget.view.state.doc.toString()` (per CONTEXT L2 / ACTION-04 — code is read from widget state, but flush ensures disk parity for downstream API failures reproducible from file).

### Pattern G: Phase 19 self-write suppression consult-on-modify

**Source:** `src/main.ts:992-1018` (the existing `vault.on('modify')` listener that consults `selfWriteSuppression.tryConsume` and currently logs `Plan 20 reload TBD`).

**Apply to:** Plan 20-03 — replace the `logger.debug(...)` placeholder at `src/main.ts:1010-1012` with the conflict-modal-or-silent-reload decision tree from RESEARCH §"Pattern 4" + the Pitfall P2 early-return for "fence body unchanged" (frontmatter-only write absorption).

### Pattern H: `Compartment.reconfigure` for live config swap

**Source:** `src/main.ts:2823-2843` (`dispatchChildLanguageReconfigure` — Phase 16 Plan 04 LANG-01); `src/main.ts:2885-2920` (`fmReactivityHandler` body — metadataCache.on('changed') reconfigure path); `src/main/childEditorLanguage.ts` `languageCompartment` + `buildLanguageExtensions` (148 LOC carry-over).

**Pattern:**
```typescript
childView.dispatch({
  effects: languageCompartment.reconfigure(
    buildLanguageExtensions(newSlug, indentOverride),
  ),
  userEvent: 'leetcode.lang-switch',  // only required when dispatching into locked range
});
```

**Apply to:**
- Plan 20-02 ACTION-03 — per-widget `metadataCache.on('changed')` listener dispatches to widget's own EditorView (not parent). userEvent NOT required (the widget's own EditorView has no section-protection extension installed; only the parent does). Effects-only dispatch.
- Plan 20-01 VIM-02 — `vimCompartment.reconfigure(enabled ? vim() : [])`. Same shape, separate Compartment per widget.

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback Plan |
|------|------|-----------|--------|---------------|
| `src/widget/conflictDiff.ts` (LCS algorithm body) | utility | transform | No LCS line-diff exists in tree. | Use the verbatim skeleton from 20-RESEARCH.md §"Pattern 5" (lines 484-526); pattern for export-shape + pure-fn discipline taken from `src/widget/hash.ts`. |
| Multi-pane "Take over" CTA UX flow | UI component | event-driven | No existing multi-pane affordance in tree (Phase 19 single-active baseline). | Pattern shape taken from `src/solve/ephemeralTabStore.ts` (active-leaf-change reconcile) + `data-pane-state` attribute toggle inspired by `src/main/languageChevronWidget.ts` `aria-expanded` pattern. |
| `app.workspace.on('css-change')` listener | service | event-driven | No prior `css-change` subscriber in tree. | Pattern shape taken from `src/main/codeActionsEditorExtension.ts:329-359` `metadataCache.on('changed')` registerEvent block. |

For each of the above, the fallback plan provides a strong shape from the in-tree event-listener / pure-function / DOM-mount idiom — even though no exact LCS / multi-pane / theme analog exists.

---

## Metadata

**Analog search scope:** `src/main/`, `src/widget/`, `src/auth/`, `src/graph/`, `src/solve/`, `src/contest/`, `src/ai/`, `src/browse/`, `tests/main/`, `tests/widget/`.

**Files scanned:** ~60 source files + Phase 20 CONTEXT/RESEARCH/UI-SPEC.

**Pattern extraction date:** 2026-05-29

**Key cross-cutting findings:**
- All eight Modal subclasses in tree (`CookiePasteModal`, `ConfirmOverwriteModal`, `VerdictModal`, `RunModal`, `SubmissionDetailModal`, `OtherPatternModal`, `SubmissionPickerModal`, `AbortContestModal`, `ContestPreviewModal`, `AIDisclosureModal`, `AIStreamModal`, `FilterModal`) follow the same `extends Modal` + `onOpen`/`onClose` lifecycle. ConflictModal is a routine new entry in this family.
- Every widget-write path ALREADY goes through `app.vault.process` (Phase 19's `DebouncedWriter.flush`); Plan 20-03 "Keep mine" calls `widget.writer.forceFlush()` and inherits this discipline automatically.
- The `'leetcode.*'` userEvent convention (CLAUDE.md §Conventions) is load-bearing through Phase 21 — Phase 20 protection extension preserves it verbatim; Phase 22 PROTECT-03 removes it.
- `WidgetRegistry` (`src/widget/widgetRegistry.ts:38-124`) needs a one-line `*values()` iterator addition for Plan 20-04's themeListener + multiPaneCoordinator — matches existing accessor shape; no architectural change.
- `*FromWidget` methods are a parallel-API shape (NOT a refactor of `*FromActive`) — Phase 22 deletes `*FromActive` and renames `*FromWidget` mechanically. The shared `*WithCode(file, slug, language, code)` private extraction is the architectural seam.
