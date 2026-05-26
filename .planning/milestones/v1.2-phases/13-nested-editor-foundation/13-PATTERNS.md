# Phase 13: Nested Editor Foundation - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 8 (3 new source, 2 modified source, 3 new test)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/nestedEditorExtension.ts` | editor-extension | event-driven | `src/main/codeActionsEditorExtension.ts` | exact |
| `src/main/childEditorRegistry.ts` | utility (cache) | CRUD | (no direct analog — standard LRU pattern) | no-analog |
| `src/main/childEditorFactory.ts` | utility (factory) | transform | (no direct analog — CM6 EditorView creation) | no-analog |
| `src/main.ts` | controller (plugin entry) | event-driven | `src/main.ts` (self — lines 787-797) | exact |
| `styles.css` | config (CSS) | — | `styles.css` (self — lines 957-972 section-lock heading hide) | exact |
| `tests/main/nestedEditorExtension.test.ts` | test | — | `tests/main/sectionLockExtension.test.ts` | exact |
| `tests/main/childEditorRegistry.test.ts` | test | — | `tests/main/sectionLockExtension.test.ts` | role-match |
| `tests/main/childEditorFactory.test.ts` | test | — | `tests/main/sectionLockExtension.test.ts` | role-match |

## Pattern Assignments

### `src/main/nestedEditorExtension.ts` (editor-extension, event-driven)

**Analog:** `src/main/codeActionsEditorExtension.ts`

**Imports pattern** (lines 41-63):
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import {
  editorInfoField,
  editorLivePreviewField,
  MarkdownView,
  type Plugin,
  type TFile,
} from 'obsidian';
```

**PluginHost type pattern** (lines 79-81):
```typescript
type PluginHost = Plugin & LanguageChevronHost & {
  settings: { getDefaultLanguage(): string };
};
```

**WidgetType subclass pattern** (lines 124-164):
```typescript
export class CodeActionsWidget extends WidgetType {
  constructor(
    readonly plugin: PluginHost,
    readonly file: TFile,
    readonly currentSlug: string,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    return buildCodeBlockButtonRow(doc, this.plugin, { /* ... */ });
  }

  eq(other: CodeActionsWidget): boolean {
    return (
      other instanceof CodeActionsWidget &&
      other.plugin === this.plugin &&
      other.file === this.file &&
      other.currentSlug === this.currentSlug
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}
```

**findCodeFence SSoT reuse pattern** (lines 177-212):
```typescript
export function findCodeFence(
  state: EditorState,
): { openerLine: number; closerLine: number } | null {
  if (state.doc.lines === 0) return null;

  const FENCE_RE = /^\s*```/;
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;

  let inCodeSection = false;
  const total = state.doc.lines;

  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;
    if (H2_CODE_RE.test(text)) { inCodeSection = true; continue; }
    if (H2_ANY_RE.test(text)) { inCodeSection = false; continue; }
    if (inCodeSection && FENCE_RE.test(text)) {
      for (let j = i + 1; j <= total; j++) {
        if (FENCE_RE.test(state.doc.line(j).text)) {
          return { openerLine: i, closerLine: j };
        }
      }
      return null;
    }
  }
  return null;
}
```

**buildDecorations function pattern** (lines 238-299):
```typescript
export function buildDecorations(
  state: EditorState,
  plugin: PluginHost,
  overrideSlug?: string,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Gate 1: editorInfoField file
  const file = state.field(editorInfoField)?.file;
  if (!file) return builder.finish();

  // Gate 2: lc-slug frontmatter
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return builder.finish();
  }

  // Gate 3: fence presence
  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  // Build decoration (block widget at line boundary)
  const anchor = state.doc.line(fence.closerLine).to;
  const side = 1;
  builder.add(
    anchor,
    anchor,
    Decoration.widget({
      widget: new CodeActionsWidget(plugin, file, currentSlug),
      side,
      block: true,
    }),
  );

  return builder.finish();
}
```

**StateField.define pattern** (lines 365-394):
```typescript
export function buildCodeActionsEditorExtension(
  plugin: PluginHost,
): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, plugin);
    },
    update(old, tr) {
      const modeFlipped =
        tr.state.field(editorLivePreviewField) !==
        tr.startState.field(editorLivePreviewField);
      let overrideSlug: string | undefined;
      for (const e of tr.effects) {
        if (e.is(languageRefreshEffect)) {
          overrideSlug = e.value;
        }
      }
      const refreshEffect = overrideSlug !== undefined ||
        tr.effects.some((e) => e.is(languageRefreshEffect));
      if (tr.docChanged || modeFlipped || refreshEffect) {
        return buildDecorations(tr.state, plugin, overrideSlug);
      }
      return old.map(tr.changes);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}
```

---

### `src/main/childEditorRegistry.ts` (utility/cache, CRUD)

**Analog:** None in codebase (standard LRU Map pattern from RESEARCH.md)

**Structure pattern** (from RESEARCH.md Pattern 5):
```typescript
interface RegistryEntry {
  view: EditorView;
  lastAccess: number;
}

class ChildEditorRegistry {
  private readonly cache = new Map<string, RegistryEntry>();
  private readonly cap: number;

  constructor(cap = 5) { this.cap = cap; }

  get(key: string): EditorView | undefined { /* ... */ }
  set(key: string, view: EditorView): void { /* ... */ }
  private evictIfNeeded(): void { /* ... */ }
  destroyAll(): void { /* ... */ }
  delete(key: string): void { /* ... */ }
}
```

**Import convention** (follow same eslint-disable pattern):
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
```

---

### `src/main/childEditorFactory.ts` (utility/factory, transform)

**Analog:** None in codebase (CM6 EditorView creation pattern from RESEARCH.md)

**Import convention** (follow same eslint-disable pattern):
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
```

**Note:** `@codemirror/lang-python` is a bundled dependency (in package.json) so it does NOT need the eslint-disable comment. Only the runtime-external `@codemirror/*` packages need it.

---

### `src/main.ts` (controller, event-driven) — MODIFY

**Analog:** `src/main.ts` (self, lines 787-797)

**Registration pattern** (lines 787-797):
```typescript
    // Step 6f — Phase 5.1 edit-mode Run/Submit buttons.
    this.registerEditorExtension(buildCodeActionsEditorExtension(this));

    // Step 6f-bis — Phase 05.5 section locking for lc-slug notes.
    this.registerEditorExtension(buildSectionLockExtension(this));
```

**New extension registers BETWEEN these two calls** (per CONTEXT canonical_refs):
```typescript
    // Step 6f — Phase 5.1 edit-mode Run/Submit buttons.
    this.registerEditorExtension(buildCodeActionsEditorExtension(this));
    // Step 6f-nested — Phase 13: nested editor widget
    this.registerEditorExtension(buildNestedEditorExtension(this));
    // Step 6f-bis — Phase 05.5 section locking for lc-slug notes.
    this.registerEditorExtension(buildSectionLockExtension(this));
```

**Plugin lifecycle pattern for registry cleanup** (follow onunload pattern already established):
```typescript
    // In onload(): instantiate registry
    this.childEditorRegistry = new ChildEditorRegistry(5);

    // In onunload(): destroy all child editors
    this.childEditorRegistry.destroyAll();
```

---

### `styles.css` (config/CSS) — MODIFY

**Analog:** `styles.css` (self, lines 957-972 — section-lock heading hide pattern)

**Decoration.line CSS hide pattern** (lines 957-972):
```css
/* Phase 05.5 (POLISH) — section-lock heading-marker hide.
 * Lines decorated with .leetcode-locked-heading-line ... */
.cm-editor .leetcode-locked-heading-line .cm-formatting-header,
.cm-editor .leetcode-locked-heading-line .cm-formatting-header-2 {
  display: none;
}
```

**New CSS for fence-line hiding** (following same conventions: scoped under `.cm-editor`, Obsidian CSS variables only, no raw hex):
```css
/* Phase 13 — Nested editor: hide fence lines (opener, body, closer).
 * Content stays in document model; visually replaced by child EditorView. */
.cm-editor .lc-fence-hidden {
  height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  line-height: 0 !important;
}

/* Phase 13 — Nested editor container styling.
 * Darker background matching Obsidian's code block rendering (D-05). */
.cm-editor .lc-nested-editor {
  background: var(--code-background, var(--background-secondary));
  border-radius: 4px;
  padding: 8px 0;
}
.cm-editor .lc-nested-editor .cm-editor {
  background: transparent;
}
.cm-editor .lc-nested-editor .cm-content {
  font-family: var(--font-monospace);
  font-size: 14px;
}
.cm-editor .lc-nested-editor .cm-gutters {
  background: transparent;
  border-right: none;
}
```

---

### `tests/main/nestedEditorExtension.test.ts` (test)

**Analog:** `tests/main/sectionLockExtension.test.ts`

**Test file structure pattern** (lines 1-56):
```typescript
// Phase 13 — Nested Editor Extension unit tests.
// ...

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import {
  makeStateForLockTests,
  makeFakeTransaction,
} from '../helpers/obsidian-stub';
import {
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
} from '../../src/notes/NoteTemplate';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// Import module under test AFTER vi.mock
import {
  buildNestedEditorExtension,
  // ... exported helpers
} from '../../src/main/nestedEditorExtension';
```

**makeStateForLockTests helper** (obsidian-stub.ts lines 258-283) — reusable for building fake EditorState with doc lines + editorInfoField file gate:
```typescript
export function makeStateForLockTests(opts: LockTestStateOpts): EditorState {
  const lines = opts.body.split('\n');
  const path = opts.filePath ?? 'LeetCode/0001-two-sum.md';
  const fakeState = {
    doc: {
      get lines() { return lines.length; },
      line(n: number) {
        const t = lines[n - 1] ?? '';
        const before = lines.slice(0, n - 1).join('\n');
        const from = n === 1 ? 0 : before.length + 1;
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, from, to, number: n };
      },
      get length() { return opts.body.length; },
    },
    field(_f: unknown) {
      return { file: { path } };
    },
  };
  return fakeState as unknown as EditorState;
}
```

**Canonical note body helper** (sectionLockExtension.test.ts lines 75-99):
```typescript
function canonicalNoteBody(opts: CanonicalNoteOpts = {}): string {
  const lang = opts.fenceLang ?? 'python';
  const closer = opts.unterminatedFence ? '' : '```\n';
  return (
    `${PROBLEM_HEADING_LINE}\n` +
    `Given an array, return two indices.\n` +
    `\n` +
    `${CODE_HEADING_LINE}\n` +
    `\n` +
    '```' + lang + '\n' +
    `class Solution: pass\n` +
    closer +
    `\n` +
    `${TECHNIQUES_HEADING_LINE}\n` +
    `\n` +
    `- [[Hash Table]]\n` +
    `\n` +
    `${NOTES_HEADING_LINE}\n` +
    `\n` +
    `user notes here\n`
  );
}
```

---

### `tests/main/childEditorRegistry.test.ts` (test)

**Analog:** `tests/main/sectionLockExtension.test.ts` (structure only)

**Testing pattern:** Pure unit tests (no vi.mock('obsidian') needed since the registry is a plain Map-based class). Only needs `EditorView` mock/stub. Test structure:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock EditorView.destroy to track calls
// ... import and test ChildEditorRegistry
```

---

### `tests/main/childEditorFactory.test.ts` (test)

**Analog:** `tests/main/sectionLockExtension.test.ts` (structure only)

**Testing pattern:** Needs `vi.mock('obsidian')` + `vi.mock('@codemirror/lang-python')` since the factory creates real EditorView instances or verifies extension composition.

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// Import module under test AFTER vi.mock
import { createChildEditor } from '../../src/main/childEditorFactory';
```

---

## Shared Patterns

### Frontmatter Gate (lc-slug check)
**Source:** `src/main/codeActionsEditorExtension.ts` lines 244-254
**Apply to:** `nestedEditorExtension.ts` — identical gate before building decorations

```typescript
const file = state.field(editorInfoField)?.file;
if (!file) return builder.finish();

const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) {
  return builder.finish();
}
```

### ESLint Disable Comment for @codemirror/* Imports
**Source:** `src/main/codeActionsEditorExtension.ts` lines 41, 49
**Apply to:** All three new source files that import from `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`

```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
```

### Decoration.line Usage
**Source:** `src/main/sectionLockExtension.ts` lines 301-318 (`buildLockedDecorations`)
**Apply to:** `nestedEditorExtension.ts` — fence-line hiding decorations

```typescript
function buildLockedDecorations(state: EditorStateType): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const total = state.doc.lines;
  if (total === 0) return b.finish();
  const lineDeco = Decoration.line({ class: 'leetcode-locked-heading-line' });
  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;
    if (/* condition */) {
      b.add(state.doc.line(i).from, state.doc.line(i).from, lineDeco);
    }
  }
  return b.finish();
}
```

### TransactionFilter for Cursor Redirect
**Source:** `src/main/sectionLockExtension.ts` lines 453-520
**Apply to:** `nestedEditorExtension.ts` — focus redirect when cursor enters hidden fence zone

```typescript
EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;

  const file = tr.startState.field(editorInfoField)?.file;
  if (!file) return tr;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) return tr;

  // ... selection inspection + rewrite ...
  return {
    changes: tr.changes,
    selection: EditorSelection.cursor(snapTarget),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
  };
});
```

### Test vi.mock('obsidian') Pattern
**Source:** `tests/main/sectionLockExtension.test.ts` lines 35-38
**Apply to:** `tests/main/nestedEditorExtension.test.ts`, `tests/main/childEditorFactory.test.ts`

```typescript
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

### Block Widget Decoration.widget Pattern
**Source:** `src/main/codeActionsEditorExtension.ts` lines 286-296
**Apply to:** `nestedEditorExtension.ts` — nested editor widget at opener line

```typescript
const anchor = state.doc.line(fence.openerLine).to;
builder.add(
  anchor,
  anchor,
  Decoration.widget({
    widget: new NestedEditorWidget(file.path, registry, fenceContent),
    block: true,
    side: 1,
  }),
);
```

### `userEvent: 'leetcode.*'` Bypass Convention
**Source:** `src/main/sectionLockExtension.ts` lines 386-390
**Apply to:** Any future dispatch from child-to-parent sync (Phase 14) must use `'leetcode.child-sync'`

```typescript
// Gate 1 — plugin-side dispatches with userEvent starting 'leetcode.' bypass
if (ev.startsWith('leetcode.')) {
  return true;
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/main/childEditorRegistry.ts` | utility (cache) | CRUD | No LRU cache exists in the codebase; standard Map-based pattern from RESEARCH.md |
| `src/main/childEditorFactory.ts` | utility (factory) | transform | No EditorView factory exists; CM6 creation pattern from official docs + RESEARCH.md |

Both files are simple utility modules with no complex interaction patterns. RESEARCH.md provides complete code examples (Pattern 5 for registry, Pattern 3 for factory) that serve as the implementation reference.

## Metadata

**Analog search scope:** `src/main/`, `tests/main/`, `tests/helpers/`, `styles.css`
**Files scanned:** 8 source/test targets + 5 analog files
**Pattern extraction date:** 2026-05-21
