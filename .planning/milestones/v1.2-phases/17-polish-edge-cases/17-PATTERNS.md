# Phase 17: Polish & Edge Cases — Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 17 (5 NEW source/test/UAT, 8 MODIFIED source, 4 MODIFIED test/config)
**Analogs found:** 16 / 17 (one Wave-3 module — `childEditorTheme.ts` — has a partial-match analog only)

---

## File Classification

### NEW Files

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/main/childEditorTheme.ts` | module / extension factory | request-response (CM6 extension production) | `src/main/childEditorLanguage.ts` (Compartment+Extension factory pattern) | role-match (no existing HighlightStyle module) |
| `tests/main/resetCommand.childDispatch.test.ts` | test (vitest, mocked CM6) | request-response | `tests/main/resetCommand.test.ts` | exact (sibling — extends same describe pattern) |
| `tests/main/childEditorSync.repair.test.ts` | test (vitest, mocked CM6) | request-response | `tests/main/childEditorSync.test.ts` | exact (sibling) |
| `tests/main/tabMidLine.test.ts` | test (vitest, mocked CM6) | request-response | `tests/main/childEditorSync.test.ts` (mock CM6 + dispatch spy) | role-match |
| `tests/main/fmReactivity.test.ts` | test (vitest, mocked Obsidian metadataCache) | event-driven | `tests/main/childEditorSync.test.ts` (mock-vault + spy pattern) | role-match |
| `tests/main/childEditorTheme.test.ts` | test (vitest, DOM check) | request-response | `tests/main/childEditorSync.test.ts` (factory mock pattern) | partial-match |
| `tests/main/lifecycle.test.ts` | test (vitest, registry assertions) | request-response | `tests/main/childEditorSync.test.ts` (mock registry) + existing registry tests | role-match |
| `.planning/phases/17-polish-edge-cases/17-UAT.md` | docs (manual UAT script) | docs | `.planning/phases/16-language-packs-switching/16-UAT.md` | exact |
| `.planning/phases/17-polish-edge-cases/17-BUNDLE-AUDIT.md` | docs (bundle record) | docs | (none — first formal audit doc) | n/a |

### MODIFIED Files

| File | Role | Data Flow | Anchor Pattern Source | Match Quality |
|------|------|-----------|----------------------|---------------|
| `src/solve/resetCodeWithConfirm.ts` | service helper | CRUD (write-path) | self (current shape — `replaceFullBody` callback) | self (D-03 swaps caller-provided handle, not helper internals) |
| `src/main.ts` (Reset wiring ~2783–2803) | controller (command wiring) | request-response | self + `src/main/childEditorSync.ts:107-115` (full-body replace dispatch on EditorView) | exact |
| `src/main.ts` (`onload` ~820–880) | controller (event registration) | event-driven | `src/main.ts:870-879` (`registerEvent(workspace.on('file-open', ...))`) + `src/main/codeActionsEditorExtension.ts:329-359` (`registerEvent(metadataCache.on('changed', ...))`) | exact |
| `src/main/childEditorSync.ts` (`repairFenceStructure` 355–430) | utility (debug-driven fix) | transform | self (current behavior — debug session + regression test attached) | self (D-06b debug + fix in place) |
| `src/main/childEditorSync.ts` (`createChildSyncExtension` 82–121) | utility (sync mirror) | event-driven | self (mirror dispatches with `addToHistory.of(false)` at lines 110-114, 161-163) | self (Pattern 1 anchor) |
| `src/main/nestedEditorExtension.ts` (`ECHO_PRONE_USER_EVENTS` 265–268) | utility (echo gate) | event-driven | self (current Set + comment block) | self (D-06c hypothesis probe site) |
| `src/main/childEditorFactory.ts` | factory / extension array | request-response | self (current extensions list at lines 158–207) | self (single mount point for D-11/D-15/D-18) |
| `src/main/codeActionsEditorExtension.ts` (`languageRefreshEffect` 112) | utility (StateEffect) | request-response | self (current `cm.dispatch({ effects: languageRefreshEffect.of(...) })` at line 352) | self (D-13 dispatches the same shape on the child Compartment) |
| `src/solve/languages.ts` | utility (slug catalog) | transform | self (`resolveLangSlug`) | self (D-13 fm reactivity reads `lc-language` directly; helper consulted for tag→slug only) |
| `package.json` | config | n/a | (Phase 16 chevron-related deps — adds `@replit/codemirror-vim`) | role-match |
| `CLAUDE.md` (`## Conventions` block ~line 195) | docs | docs | self (current `'leetcode.*'` block) | self (append new userEvent strings) |
| `tests/main/resetCommand.test.ts` (extension) | test | request-response | self (existing `resolveActiveLangSlug` + `getDispatchHandle` cases at lines 287–344) | self (D-04 vault.process fallback case already exists; possibly extend to assert child path absent when registry miss) |

---

## Pattern Assignments

### WAVE 1 — Write-path / sync module fixes

#### `src/solve/resetCodeWithConfirm.ts` (service helper, CRUD)

**Analog:** self (lines 91–136 — current shape) + `src/main/childEditorSync.ts:107-115` (full-body replace dispatch).

**Critical insight (D-03):** The helper itself does NOT change. The dispatch path swap happens in the **caller** (`src/main.ts`'s `getDispatchHandle` resolver). The helper already has the correct seam:

```typescript
// src/solve/resetCodeWithConfirm.ts:104-114 — DO NOT CHANGE
const handle = deps.getDispatchHandle?.(deps.file) ?? null;
if (handle) {
  const current = await readCurrentBody(deps.app, deps.file);
  const next = forceInjectCodeSection(current, { starterCode: starter, langSlug });
  handle.replaceFullBody(next);    // <-- caller decides parent vs child
} else {
  await deps.app.vault.process(deps.file, (body) =>
    forceInjectCodeSection(body, { starterCode: starter, langSlug }),
  );
}
```

**`<read_first>` for planner:** `src/solve/resetCodeWithConfirm.ts:38-136` (the entire helper — confirms the seam). No edit required to this file in Wave 1; the only change is documentation of the new contract (callers may now route via child CM6) in the JSDoc.

---

#### `src/main.ts` Reset wiring (controller, request-response) — **D-03 PRIMARY EDIT**

**Analog:** `src/main/childEditorSync.ts:107-115` (post-repair full-replace dispatch on parent EditorView — same shape, dispatched on **child** instead).

**Current shape (`src/main.ts:2791-2803` — pre-D-03):**

```typescript
// CURRENT — dispatches on PARENT cm; lands in PARENT undo stack (the bug)
getDispatchHandle: (targetFile: TFile) => {
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file !== targetFile) return null;
  const cm = (view.editor as unknown as { cm: EditorView }).cm;
  return {
    replaceFullBody: (next: string) => {
      cm.dispatch({
        changes: { from: 0, to: cm.state.doc.length, insert: next },
        userEvent: 'leetcode.reset',
      });
    },
  };
},
```

**Target shape (post-D-03) — copy this exact mirror pattern from `childEditorSync.ts:107-115`:**

```typescript
// TARGET — dispatches on CHILD; existing createChildSyncExtension (childEditorSync.ts:87-121)
// mirrors to parent with addToHistory.of(false). userEvent string is 'leetcode.reset.child'.
getDispatchHandle: (targetFile: TFile) => {
  // 1. Look up child first — child is the canonical write target (D-05)
  const childView = this.childEditorRegistry?.get(targetFile.path);
  if (childView) {
    return {
      replaceFullBody: (next: string) => {
        const bodyOnly = extractFenceBodyFromFullNote(next); // helper to add — slice between fence markers
        childView.dispatch({
          changes: { from: 0, to: childView.state.doc.length, insert: bodyOnly },
          userEvent: 'leetcode.reset.child',
          // NO addToHistory.of(false) here — we WANT child undo entry
        });
      },
    };
  }
  // 2. Parent CM6 fallback REMOVED (no longer needed — child registry covers
  //    every open MarkdownView path; non-open path falls through to vault.process
  //    via getDispatchHandle returning null per D-04).
  return null;
},
```

**Mirror dispatch reference (already in repo — DO NOT TOUCH, just observe):**

```typescript
// src/main/childEditorSync.ts:107-115 — EXISTING; the parent-side mirror that runs after Reset
parentView.dispatch({
  changes: { from: bodyStart, to: bodyEnd, insert: update.view.state.doc.toString() },
  annotations: [
    Transaction.userEvent.of('leetcode.child-sync'),
    Transaction.addToHistory.of(false),   // <-- KEY: parent gets no undo entry
  ],
});
```

**Pre-flight verification check (before commit):**
- `nestedEditorExtension.ts:265-268` `ECHO_PRONE_USER_EVENTS` set MUST NOT contain `'leetcode.reset.child'` (verified — currently only `'leetcode.child-sync'` and `'leetcode.fence-repair'`).

---

#### `src/main/childEditorSync.ts` `repairFenceStructure` (utility, transform) — **D-06b DEBUG + FIX**

**Analog:** self — current implementation lines 355–430 is the regression site.

**Current shape (already in repo):**

```typescript
// src/main/childEditorSync.ts:355-430 — current implementation under audit
export function repairFenceStructure(parentView: EditorView): boolean {
  const state = parentView.state;
  const doc = state.doc;
  // ... scans for ## Code heading, finds opener/closer, assembles changes ...
  if (changes.length === 0) return false;
  try {
    parentView.dispatch({
      changes,
      annotations: Transaction.userEvent.of('leetcode.fence-repair'),
    });
  } catch { return false; }
  return true;
}
```

**Echo-prone gate that may be over-filtering (`nestedEditorExtension.ts:265-268`):**

```typescript
// CURRENT — both repair AND child-sync are skipped from external-change propagation
const ECHO_PRONE_USER_EVENTS = new Set([
  'leetcode.child-sync',
  'leetcode.fence-repair',   // <-- D-06c hypothesis (b) — does this over-filter?
]);
```

**Test fixture pattern (from existing `tests/main/childEditorSync.test.ts:77-97`):**

```typescript
function makeMockParentView(docContent: string) {
  const state = makeStateForLockTests({ body: docContent });
  return {
    state,
    dispatch: vi.fn(),
  } as unknown as import('@codemirror/view').EditorView;
}
```

**`<read_first>` for planner:**
- `src/main/childEditorSync.ts:355-430` (current `repairFenceStructure`)
- `src/main/childEditorSync.ts:82-121` (`createChildSyncExtension` — calls repair on null fence at line 98, retries `findCodeFence` at line 102)
- `src/main/nestedEditorExtension.ts:265-326` (`ECHO_PRONE_USER_EVENTS` + `externalChangeListener`)
- `.planning/debug/fence-auto-recovery-regression.md` (debug doc — to be created Wave 1)

**Hypothesis probes (per CONTEXT D-06c):**
- (a) Add temporary `console.debug` in `createChildSyncExtension:96` to confirm `findCodeFence` returns null on damaged input.
- (b) Test what happens if `'leetcode.fence-repair'` is removed from `ECHO_PRONE_USER_EVENTS` (compare child-side observability before/after).
- (c) Verify post-repair `findCodeFence(parentView.state)` retry at line 102 returns a valid fence after dispatch lands (synchronous re-read of state).
- (d) Audit `sectionLockExtension.ts` `changeFilter` — confirms `'leetcode.fence-repair'` userEvent threads through (CLAUDE.md `## Conventions` says `'leetcode.*'` always passes; verify no regression).

---

#### `src/main/childEditorFactory.ts` Tab keymap (factory) — **D-11 EDIT POINT**

**Analog:** self — current line 185 keymap entry.

**Current shape:**

```typescript
// src/main/childEditorFactory.ts:38-44 imports
import {
  history,
  indentWithTab,           // <-- REPLACE this import with insertTab + indentMore + indentLess
  defaultKeymap,
  historyKeymap,
  toggleLineComment,
} from '@codemirror/commands';

// src/main/childEditorFactory.ts:183-185 — keymap mount point
// 5. Main keymap. indentWithTab MUST be first (priority over
//    defaultKeymap's Tab handling — Phase 15).
keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
```

**Target shape (D-11 — branch on cursor position):**

```typescript
// New imports:
import { insertTab, indentMore, indentLess } from '@codemirror/commands';
import type { Command } from '@codemirror/view';

// New custom command (place near top of file, after imports):
const customTabCommand: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  // Multi-line selection → always indent (preserve INDENT-03 single-undo)
  if (!sel.empty && state.doc.lineAt(sel.from).number !== state.doc.lineAt(sel.to).number) {
    return indentMore(view);
  }
  // Cursor at or before first non-whitespace → indent the line
  const line = state.doc.lineAt(sel.head);
  const beforeCursor = line.text.slice(0, sel.head - line.from);
  if (/^\s*$/.test(beforeCursor)) return indentMore(view);
  // Mid-line → insert tab character (or N spaces from indentUnit)
  return insertTab(view);
};
const customShiftTabCommand: Command = (view) => indentLess(view);

// Replacement keymap (line 185):
keymap.of([
  { key: 'Tab', run: customTabCommand, shift: customShiftTabCommand },
  ...defaultKeymap,
  ...historyKeymap,
]),
```

**`<read_first>` for planner:**
- `src/main/childEditorFactory.ts:38-44` (current commands import)
- `src/main/childEditorFactory.ts:158-207` (full extensions array — to verify D-11 swap is the only Tab change; D-15 + D-18 also touch this array)

---

### WAVE 2 — Edge inputs + external fm reactivity

#### `src/main.ts` `metadataCache.on('changed')` listener (controller, event-driven) — **D-13 NEW LISTENER**

**Analog:** Two existing call sites — pick whichever shape the planner prefers:

**Analog A (preferred — concrete event-listener pattern from Phase 5.3):**

```typescript
// src/main/codeActionsEditorExtension.ts:329-359 — chevron metadataCache subscription
plugin.registerEvent(
  plugin.app.metadataCache.on('changed', (file) => {
    try {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file !== file) return;
      const cm = (view.editor as unknown as { cm: EditorView }).cm;
      const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown> | undefined;
      const lcLanguageRaw = fm?.['lc-language'];
      const freshSlug =
        typeof lcLanguageRaw === 'string' && lcLanguageRaw.length > 0
          ? lcLanguageRaw : undefined;
      cm.dispatch({ effects: languageRefreshEffect.of(freshSlug) });
    } catch { /* defensive */ }
  }),
);
```

**Analog B (lc-slug filtering pattern — from `src/main.ts:834-862` wikilink-to-preview gate):**

```typescript
// src/main.ts:834-862 — three-gate file-open pattern (registerEvent + filtering by slug)
this.registerEvent(
  this.app.workspace.on('file-open', (file: TFile | null) => {
    if (!file) return;
    if (file.stat.size !== 0) return;
    // ... gates ...
  }),
);
```

**Target shape (D-13 — combine the two analogs; reuse `languageCompartment.reconfigure` from chevron path):**

```typescript
// In src/main.ts onload, alongside other registerEvent calls (place near line 870)
this.registerEvent(
  this.app.metadataCache.on('changed', (file, _data, cache) => {
    // Gate 1: lc-slug note only (mirrors nestedEditorExtension gate)
    const slug = cache?.frontmatter?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;

    // Gate 2: child registered for this file (note open in MarkdownView)
    const childView = this.childEditorRegistry?.get(file.path);
    if (!childView) return;

    // Gate 3: lc-language differs from child's currently-applied slug
    const fmLang = cache.frontmatter?.['lc-language'];
    if (typeof fmLang !== 'string' || fmLang.length === 0) return;
    const currentSlug = readActiveFenceSlug(file);  // helper (consult parent fence opener via metadataCache)
    if (currentSlug === fmLang) return;

    // Dispatch Compartment.reconfigure on CHILD (reuses Phase 16 chevron path)
    childView.dispatch({
      effects: languageCompartment.reconfigure(
        buildLanguageExtensions(fmLang, this.settings.getIndentSizeOverride()),
      ),
      // userEvent omitted — no `changes:` payload, not subject to changeFilter
    });
    // Per D-14: do NOT rewrite the fence opener tag. Frontmatter is SoT here.
  }),
);
```

**Imports needed in `src/main.ts`:**

```typescript
import { languageCompartment, buildLanguageExtensions } from './main/childEditorLanguage';
```

**`<read_first>` for planner:**
- `src/main.ts:820-880` (existing `registerEvent` block — D-13 listener registers near here)
- `src/main/codeActionsEditorExtension.ts:329-359` (Analog A)
- `src/main/childEditorLanguage.ts:44, 132-148` (`languageCompartment` + `buildLanguageExtensions` — D-13 dispatches the same payload)
- `src/solve/languages.ts:67-77` (`resolveLangSlug` — used by `readActiveFenceSlug` helper)

---

#### `tests/main/fmReactivity.test.ts` (NEW test) — **D-13 / D-14 verification**

**Analog:** `tests/main/childEditorSync.test.ts` (mock-vault + obsidian-stub + spy pattern).

**Pattern excerpts to copy:**

```typescript
// tests/main/childEditorSync.test.ts:9-19 — test bootstrap
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// tests/main/childEditorSync.test.ts:99-109 — registry mock pattern
function makeMockRegistry() {
  const map = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => map.get(key)),
    has: vi.fn((key: string) => map.has(key)),
    set: vi.fn((key: string, view: unknown) => { map.set(key, view); }),
    delete: vi.fn((key: string) => { map.delete(key); }),
    _map: map,
  } as unknown as import('../../src/main/childEditorRegistry').ChildEditorRegistry;
}

// tests/main/childEditorSync.test.ts:87-97 — child mock pattern
function makeMockChildView(docContent: string) {
  return {
    state: {
      doc: { length: docContent.length, toString() { return docContent; } },
    },
    dispatch: vi.fn(),
  } as unknown as import('@codemirror/view').EditorView;
}
```

**Test cases to write (per D-13/D-14 + Pitfall 3):**
1. External fm change `lc-language: java → python` → `childView.dispatch` called with `effects: languageCompartment.reconfigure(...)`.
2. fm change to **same** slug → `childView.dispatch` NOT called (Gate 3 dedupe).
3. fm change on note without lc-slug → no dispatch.
4. fm change on file not in registry → no dispatch.
5. (D-14) Listener never calls `app.vault.process` or `fileManager.processFrontMatter` (no fence opener rewrite).

---

### WAVE 3 — Themed style + vim + lifecycle + bundle audit

#### `src/main/childEditorTheme.ts` (NEW module) — **D-15 / D-16 PATTERN 3**

**Analog:** `src/main/childEditorLanguage.ts` (extension factory pattern — pure module returning `Extension[]`).

**Pattern excerpts to copy:**

```typescript
// src/main/childEditorLanguage.ts:18-32 — import header (CM6 externals)
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { Compartment, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { indentUnit, StreamLanguage } from '@codemirror/language';

// src/main/childEditorLanguage.ts:132-148 — exported extension-array factory
export function buildLanguageExtensions(
  slug: string, override: IndentOverride,
): Extension[] {
  return [
    getLanguageSupport(slug),
    indentUnit.of(effectiveIndent(slug, override)),
    closeBrackets(),
    keymap.of([{ key: 'Mod-/', run: toggleLineComment as unknown as Command }]),
  ];
}
```

**Target shape (`src/main/childEditorTheme.ts` NEW):**

```typescript
// src/main/childEditorTheme.ts — Phase 17 D-15/D-16
//
// Obsidian-CSS-variable-bound HighlightStyle for the child editor.
// Replaces the `defaultHighlightStyle` import in childEditorFactory.ts:35-37.
// Bracket-match contrast theme bundled here (D-16) — high-contrast across
// dark + light Obsidian themes.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { tags as t } from '@lezer/highlight';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView, type Extension } from '@codemirror/view';

const themedHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], color: 'var(--code-string)' },
  { tag: t.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: 'var(--code-function)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--code-tag)' },
  { tag: [t.propertyName, t.className], color: 'var(--code-property)' },
  { tag: t.operator, color: 'var(--code-operator)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-value)' },
  { tag: t.typeName, color: 'var(--code-keyword)' },
  { tag: t.invalid, color: 'var(--text-error)' },
]);

const themedBracketMatchTheme = EditorView.theme({
  '.cm-matchingBracket': {
    color: 'var(--code-keyword)',
    backgroundColor: 'var(--background-modifier-active-hover)',
    outline: '1px solid var(--code-keyword)',
    borderRadius: '2px',
  },
  '.cm-nonmatchingBracket': { color: 'var(--text-error)' },
});

export function createThemedHighlight(): Extension[] {
  return [syntaxHighlighting(themedHighlightStyle), themedBracketMatchTheme];
}
```

---

#### `src/main/childEditorFactory.ts` extension array swap — **D-15 / D-18 EDIT POINTS**

**Analog:** self — current lines 158–207 are the single mount point for all three Wave-3 child-editor extensions.

**Current shape (lines 174-205 — three swap points highlighted):**

```typescript
// src/main/childEditorFactory.ts:174-205 — extensions array (current)
keymap.of(closeBracketsKeymap),
// 3. Syntax highlighting + bracket matching (HIGHLIGHT-01 / D-15
//    unchanged from Phase 13).
syntaxHighlighting(defaultHighlightStyle),    // <-- D-15 SWAP POINT
bracketMatching(),                             // <-- DO NOT TOUCH (Pitfall 5)
// 4. Editing primitives.
history(),
drawSelection(),
highlightActiveLine(),
// 5. Main keymap. indentWithTab MUST be first (priority over
//    defaultKeymap's Tab handling — Phase 15).
keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),  // <-- D-11 SWAP POINT (Wave 1)
// 6. Visual extensions.
EditorView.lineWrapping,
EditorView.theme({ /* ... */ }),
// 7. Sync helpers (Phase 13/14).
createScrollIntoViewExtension(),
...(syncExtensions ?? []),
```

**Target swaps (Wave 3):**

```typescript
// D-15 swap (replace line 177):
//   FROM: syntaxHighlighting(defaultHighlightStyle),
//   TO:   ...createThemedHighlight(),
// (Spread because createThemedHighlight returns an Extension[] including theme)
// (Drop the `defaultHighlightStyle` import from line 35.)

// D-18 vim insertion (insert BEFORE the keymap.of([customTabCommand, ...]) at line 185):
const vimEnabled = (app as unknown as {
  vault: { getConfig(key: string): unknown };
})?.vault?.getConfig?.('vimMode') === true;

const extensions: Extension[] = [
  // ... existing extensions through history() ...
  ...(vimEnabled ? [vim()] : []),  // vim FIRST in keymap order (Esc, modal handling)
  keymap.of([{ key: 'Tab', run: customTabCommand, shift: customShiftTabCommand }, ...defaultKeymap, ...historyKeymap]),
  // ... existing visual extensions ...
];
```

**Pitfall 5 reminder (per RESEARCH):** `bracketMatching()` (line 178) MUST stay — only `syntaxHighlighting(defaultHighlightStyle)` is replaced.

**`<read_first>` for planner:**
- `src/main/childEditorFactory.ts:33-44` (imports — `defaultHighlightStyle` removal point)
- `src/main/childEditorFactory.ts:150-210` (full `createChildEditor` body — every Wave-3 child-side extension lands here)

---

#### `package.json` vim install — **D-18 / D-19 GATED**

**Current shape (relevant deps):**

```json
"@codemirror/autocomplete": "^6.20.2",
"@codemirror/commands": "^6.10.3",
"@codemirror/language": "^6.12.3",
"@codemirror/lang-cpp": "^6.0.3",
"@codemirror/lang-java": "^6.0.2",
"@codemirror/lang-javascript": "^6.2.5",
"@codemirror/lang-python": "^6.2.1",
"@codemirror/lang-rust": "^6.0.2",
"@codemirror/legacy-modes": "^6.5.3",
```

**Target add (after bundle gate passes):**

```json
"@replit/codemirror-vim": "^6.3.0",
```

**Hard gate sequence (D-19):** measure baseline `main.js` → `npm install` → measure delta → if `delta + current ≤ 1,600,000` commit, else `npm uninstall` and defer.

---

#### `tests/main/lifecycle.test.ts` (NEW test) — **D-23a**

**Analog:** `tests/main/childEditorSync.test.ts` (mock pattern) + `src/main/childEditorRegistry.ts:75-81` (existing `destroyAll` implementation).

**`<read_first>` for planner:**
- `src/main/childEditorRegistry.ts:1-114` (full registry — `destroyAll`, `evictIfNeeded`, `delete` all need assertions)
- `src/main.ts:794` (`this.childEditorRegistry = new ChildEditorRegistry(5);`)
- `src/main.ts:939` (`this.childEditorRegistry?.destroyAll();` in `onunload`)

**Mock pattern (extracted from `tests/main/childEditorSync.test.ts:87-97`):**

```typescript
function makeMockEditorView() {
  return {
    state: { doc: { length: 0, toString: () => '' } },
    dispatch: vi.fn(),
    destroy: vi.fn(),
    dom: { parentElement: null } as unknown as HTMLElement,
  } as unknown as import('@codemirror/view').EditorView;
}
```

**Target test cases:**
1. `destroyAll()` calls `destroy` on every cached `EditorView` and clears the cache.
2. LRU eviction destroys evicted view + calls `unwireSync(key)`.
3. `set(key, view)` on existing key destroys old view before replacing.
4. `delete(key)` calls `unwireSync` + `view.destroy()` + removes from map.
5. Plugin `onunload` integration — `registry.destroyAll` is invoked (grep gate on `src/main.ts`).

---

#### `.planning/phases/17-polish-edge-cases/17-UAT.md` (NEW manual UAT) — **D-07/08/09/10/15/16/17/20/23b**

**Analog:** `.planning/phases/16-language-packs-switching/16-UAT.md` (exact format match).

**Format anchors to copy:**

```markdown
# Phase 16 UAT format excerpt — copy verbatim shape:

---
status: complete
phase: 17-polish-edge-cases
source: [17-XX-SUMMARY.md, ...]
started: <ISO>
updated: <ISO>
---

## Current Test
[testing in progress | testing complete]

## Tests

### N. <Title> (<REQ-ID or D-ID>)
expected: <one-paragraph success criteria>
result: <pass | fail | pending>
notes: "<freeform; reference debug docs by path>"
```

**Test sections required (per CONTEXT D-07..D-10, D-15..D-17, D-20, D-23b):**
1. Pre-flight build + plugin reload.
2. **Paste UAT (D-07/D-08):** VS Code → child, StackOverflow HTML → child, LeetCode web copy → child, Obsidian clipboard interceptor (verify NOT formatted as markdown inside child).
3. **IME UAT (D-09):** Pinyin (Chinese), Romaji→kanji (Japanese), Hangul (Korean) — no duplication, no truncation, no early-commit.
4. **Source↔Live Preview UAT (D-10):** Cmd-E with pending edits → flip → state preserved on flip-back.
5. **Themed HighlightStyle UAT (D-15):** Verify keyword/string/comment colors track Obsidian theme on dark + light theme switch.
6. **Bracket-match contrast UAT (D-16):** Visible in dark + light themes (resolves Phase 16 cosmetic gap).
7. **Go highlighting UAT (D-17 conditional):** Switch to Go fence — colorized? If yes, ship; if no, document for v1.3 deferral.
8. **Vim mode UAT (D-18/D-20):** vimMode=true loads vim, Esc-Esc returns focus to parent, Cmd-/ works in Insert + Normal, Tab in Insert mode follows D-11 mid-line behavior.
9. **Heap snapshot UAT (D-23b):** Open/close 20 notes, take DevTools heap snapshot, verify no detached EditorView instances or growing decoration sets.
10. **Phase 16 regressions (sanity):** Tests 2, 4, 5, 6, 9, 13, 14, 15, 16, 17, 18, 19 from 16-UAT.md must still pass.

---

#### `.planning/phases/17-polish-edge-cases/17-BUNDLE-AUDIT.md` (NEW docs) — **D-24**

**Analog:** none (first formal audit doc) — minimal structure suggested below.

**Required content per CONTEXT D-24:**
- Final `main.js` size raw + gzipped.
- esbuild metafile contributor breakdown (top 10 modules by bytes).
- Hard gate verification: `< 1,600,000` bytes raw.
- Decision record: vim included or excluded; Go highlighting included or v1.3 deferred.

---

### `CLAUDE.md` `## Conventions` block update — **D-05 / D-22 documentation**

**Current block (`CLAUDE.md:193-195`):**

```markdown
## Conventions

- **`'leetcode.*'` userEvent annotation is the bypass convention for plugin-internal CM6 dispatches.** [...] Audited callsites: `src/main.ts:799-805` (`switchFenceLanguage` — sets `'leetcode.lang-switch'`); `src/main/codeActionsEditorExtension.ts:~320` (`languageRefreshEffect` — dispatches an effect with no `changes`, not subject to the changeFilter). [...]
```

**Target additions (per RESEARCH §State of the Art):**
- Add `'leetcode.reset.child'` (child-origin Reset dispatch — D-03).
- Add note that `'leetcode.reset'` (parent-origin) is **deprecated post-Phase-17** — should NOT appear in any callsite after this phase. Document the canonical write-path pattern (Pattern 1): "Plugin writes touching the fence body dispatch on the child EditorView when registered; mirror to parent via existing childEditorSync extension with `addToHistory.of(false)`. Fall back to `app.vault.process(...)` only when no child is registered."
- Add explicit warning to `ECHO_PRONE_USER_EVENTS` block: "DO NOT add `'leetcode.reset.child'` to this set — child-origin Reset relies on the existing child-sync mirror to propagate to parent."

---

## Shared Patterns

### Pattern A — Plugin Internal Dispatch with `'leetcode.*'` userEvent
**Source:** `CLAUDE.md:193-195` Conventions block + `src/main.ts:2799` (existing) + `src/main/childEditorSync.ts:111` (mirror dispatch).
**Apply to:** D-03 Reset child dispatch, D-13 fm reactivity (effect-only — no userEvent needed since no `changes`).

```typescript
// CANONICAL SHAPE: every plugin-internal CM6 dispatch that touches a locked
// range MUST set userEvent: 'leetcode.<verb>' or the section lock drops it.
view.dispatch({
  changes: { /* ... */ },
  userEvent: 'leetcode.<verb>',
});
```

### Pattern B — `addToHistory.of(false)` Mirror Dispatches
**Source:** `src/main/childEditorSync.ts:110-114, 161-163`.
**Apply to:** All sync mirrors (already in place; D-03 reuses verbatim).

```typescript
parentView.dispatch({
  changes,
  annotations: [
    Transaction.userEvent.of('leetcode.child-sync'),
    Transaction.addToHistory.of(false),    // mirror = NOT undoable on this side
  ],
});
```

### Pattern C — `registerEvent` for Auto-Cleanup
**Source:** `src/main.ts:834-862, 870-879` + `src/main/codeActionsEditorExtension.ts:329-359`.
**Apply to:** D-13 `metadataCache.on('changed')` listener.

```typescript
// Standard Obsidian event subscription pattern — auto-detaches on plugin unload.
this.registerEvent(
  this.app.<event-source>.on('<event>', (args) => {
    // ... gates ... dispatch ...
  }),
);
```

### Pattern D — Mock-Vault + Vitest Bootstrap
**Source:** `tests/main/childEditorSync.test.ts:9-19` + `tests/main/resetCommand.test.ts:30-50`.
**Apply to:** All NEW Wave-1/2/3 test files.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

### Pattern E — Child Editor Extension Mount Point
**Source:** `src/main/childEditorFactory.ts:158-207` (single extensions array).
**Apply to:** D-11 (Tab keymap), D-15 (themed HighlightStyle), D-18 (vim conditional). All three Wave-3 child-side modifications land in this single array — coordinate diffs to avoid merge conflicts.

### Pattern F — Compartment Reconfigure for Live Language Swap
**Source:** `src/main/codeActionsEditorExtension.ts:352` + `src/main/childEditorLanguage.ts:44, 132-148`.
**Apply to:** D-13 fm reactivity dispatches the same Compartment payload on the child.

```typescript
childView.dispatch({
  effects: languageCompartment.reconfigure(
    buildLanguageExtensions(slug, indentOverride),
  ),
});
```

### Pattern G — Mock EditorView Spy Pattern
**Source:** `tests/main/childEditorSync.test.ts:77-97`.
**Apply to:** All NEW Wave-1 tests (`resetCommand.childDispatch.test.ts`, `childEditorSync.repair.test.ts`, `tabMidLine.test.ts`) + Wave-3 (`childEditorTheme.test.ts`, `lifecycle.test.ts`).

```typescript
function makeMockParentView(docContent: string) {
  const state = makeStateForLockTests({ body: docContent });
  return { state, dispatch: vi.fn() } as unknown as EditorView;
}
```

### Pattern H — `findCodeFence` Fence-Detection SSoT
**Source:** `src/main/codeActionsEditorExtension.ts:177-212`.
**Apply to:** D-13 `readActiveFenceSlug` helper, all new fence-related tests.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `.planning/phases/17-polish-edge-cases/17-BUNDLE-AUDIT.md` | docs (bundle audit record) | First formal audit document in repo. Loose precedent in `.planning/phases/16-language-packs-switching/16-UAT.md:99-102` (Test 20 — bundle ceiling decision in narrative form), but no dedicated audit-table format yet. Planner picks structure freely. |

---

## Metadata

**Analog search scope:**
- `src/main/*.ts` (full directory — Phase 13/14/15/16 child-editor modules)
- `src/solve/*.ts` (Reset helper + language slug catalog)
- `tests/main/*.test.ts` (sibling test analogs for new tests)
- `.planning/phases/16-language-packs-switching/16-UAT.md` (UAT format anchor)
- `CLAUDE.md` (Conventions block)

**Files scanned via Read:** 12 source/test/docs files (CONTEXT, RESEARCH, resetCodeWithConfirm, childEditorSync, childEditorFactory, nestedEditorExtension, childEditorLanguage, codeActionsEditorExtension, childEditorRegistry, languages, resetCommand.test, childEditorSync.test, 16-UAT) + 2 grep scans (main.ts wiring sites, package.json deps).

**Confidence breakdown:**
- Wave 1 (Reset/repair/Tab): HIGH — analog patterns are 1:1 reusable, all anchor lines verified.
- Wave 2 (fm reactivity, UAT script): HIGH — Analog A from `codeActionsEditorExtension.ts:329-359` is a near-exact template.
- Wave 3 (themed style, vim, lifecycle, audit): HIGH for themed style (analog from `childEditorLanguage.ts`), HIGH for lifecycle (registry already exists), MEDIUM for vim (D-19 bundle gate is empirical), MEDIUM for bundle audit (no precedent doc structure).

**Pattern extraction date:** 2026-05-23
