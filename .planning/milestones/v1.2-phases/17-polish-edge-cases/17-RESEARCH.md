# Phase 17: Polish & Edge Cases — Research

**Researched:** 2026-05-23
**Domain:** Nested CM6 EditorView polish (write-paths, edge inputs, theme integration, vim, lifecycle)
**Confidence:** HIGH for code-level changes; MEDIUM for vim package selection; LOW only for IME/Source-mode behaviors that need empirical UAT.

## Summary

Phase 17 closes v1.2 by combining (a) 5 roadmap polish items (paste/IME/Source-mode/bundle/lifecycle) with (b) 7 carry-overs from Phases 13–16. Three of the carry-overs are debug-driven bug fixes that share the same write-path/sync module — Reset undo, fence auto-recovery, Tab mid-line — and naturally cluster into Wave 1. Edge-input UAT and external frontmatter reactivity cluster into Wave 2 (input-edge concerns). Themed HighlightStyle, vim mode, bundle audit, and lifecycle verification cluster into Wave 3 (visual + ship-ready).

The fundamental insight is that all three Wave-1 fixes follow the **canonical plugin write-path pattern (D-05)**: dispatch through the child editor's CM6 instance when one is registered, mirror to parent with `addToHistory.of(false)`, fall back to `app.vault.process(...)` only when no child is registered. This pattern is already proven by `childEditorSync.ts:107–115` (post-repair full-replace dispatch) and `:158–164` (child→parent change mirror). Reset (D-03) just needs to invert direction: dispatch on the **child** with normal history, then let the existing `createChildSyncExtension` mirror the change to the parent with `addToHistory.of(false)`.

**Primary recommendation:** Implement Wave 1 as three small, surgical refactors keyed off the existing `childEditorRegistry.get(filePath)` lookup pattern; reuse the existing `'leetcode.*'` userEvent convention; ship a regression test for each that fails on `main` today and passes after the refactor. Do NOT introduce a new sync architecture — Phase 14's primitives are sufficient.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Reset undo (D-03..D-06) | Child CM6 (write origin) | Parent CM6 (mirror via existing sync) | Restores Phase 15 D-05 cm-z scope isolation; Reset becomes a normal child edit |
| Fence repair (D-06b..D-06d) | Parent CM6 (where the fence lives) | Child CM6 (mirror only) | Repair fixes `````` markers on the parent doc; child has no marker awareness — debug session must determine why current parent dispatch fails |
| Tab mid-line (D-11..D-12) | Child CM6 (keymap) | — | Pure child-side concern; no sync impact |
| External fm reactivity (D-13..D-14) | Plugin onload (registers metadataCache hook) | Child CM6 (Compartment.reconfigure) | Listener observes Obsidian metadata events; dispatches reuse Phase 16 D-12 plumbing |
| Themed HighlightStyle (D-15..D-17) | Child CM6 (extension) | — | Pure child-side; consumes Obsidian CSS variables already injected on `body` |
| Vim mode (D-18..D-21) | Child CM6 (conditional extension) | Obsidian config (vimMode flag read) | Read flag once at child mount; spread `vim()` into extensions |
| Lifecycle/leak (D-23) | Plugin onunload + ChildEditorRegistry | Vitest fake-EditorView fixture | Registry already has `destroyAll()` — verify it via tests + manual heap snapshot |
| Bundle audit (D-24) | esbuild metafile | scripts/check-bundle-size.mjs | Existing script enforces ceiling; audit produces a written record |
| Paste/IME/Source-mode (D-07..D-10) | UAT (manual) | Regression test only if a failure is found | "Verify-first, fix-only-if-broken" per CONTEXT.md |

<phase_requirements>
## Phase Requirements

Phase 17 is **polish only** — no new REQ-IDs. Coverage maps to robustness for all 16 v1.2 requirements:

| ID | Description | Research Support |
|----|-------------|------------------|
| INDENT-01..04 | Tab/Shift-Tab + per-language indent | D-11 Tab mid-line refines the Tab keymap; D-12 preserves single-undo invariant |
| ENTER-01..04 | Smart Enter (preserve indent, brace, colon, brace-pair split) | No code changes — UAT regression coverage in 17-UAT.md to confirm Phase 16 behavior holds after Wave-1 dispatch refactor |
| BRACKET-01..04 | Auto-close, no-pair in markdown chars, overtype, pair-delete | UAT regression coverage; no code change |
| LANG-01 | Chevron switch reconfigures child | D-13 fm reactivity reuses the same Compartment.reconfigure path |
| COMMENT-01 | Cmd-/ language-aware toggle | UAT regression in vim Insert/Normal mode (D-20) |
| HIGHLIGHT-01 | Bracket-match highlight visible | D-15/D-16 themed HighlightStyle solves dark-mode contrast as side effect |
</phase_requirements>

## Standard Stack

> Phase 17 uses the v1.2 stack already locked in Phase 13–16. The only **new** runtime dep candidate is the vim package; everything else is already installed.

### Already Installed (v1.2 baseline)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@codemirror/state` | 6.x peer (via obsidian) | Compartment, Annotation, Transaction | external in esbuild |
| `@codemirror/view` | 6.x peer (via obsidian) | EditorView, keymap, ViewPlugin | external in esbuild |
| `@codemirror/language` | ^6.12.3 | syntaxHighlighting, HighlightStyle, indentUnit, StreamLanguage | external in esbuild [VERIFIED: package.json] |
| `@codemirror/commands` | ^6.10.3 | indentWithTab, history, defaultKeymap, toggleLineComment, **insertTab, indentMore, indentLess** | external in esbuild [VERIFIED: package.json] |
| `@codemirror/autocomplete` | ^6.20.2 | closeBrackets, closeBracketsKeymap | direct dep [VERIFIED: package.json] |
| `@codemirror/lang-{python,java,cpp,javascript,rust}` | ^6.x | Lezer-based language packs | direct deps [VERIFIED: package.json] |
| `@codemirror/legacy-modes` | ^6.5.3 | Go via StreamLanguage.define(go) | direct dep [VERIFIED: package.json] |

### New Candidate (Vim, gated by D-19)

| Library | Latest | Purpose | Decision Gate |
|---------|--------|---------|---------------|
| `@replit/codemirror-vim` | **6.3.0** (published 2026-05-08) | CM6 6.x vim keybindings | **D-19 hard gate**: Bundle ceiling 1.6 MB, current 1.578 MB → 22 KB headroom. If gzipped+min vim package exceeds headroom, vim is **excluded from v1.2**. Estimated raw size 60–80 KB unminified; gzipped ~25 KB. [CITED: npm view @replit/codemirror-vim] |

**Vim package verification (HIGH confidence, slopcheck-equivalent manual audit):**
- Registry: npm — version 6.3.0 verified via `npm view @replit/codemirror-vim version`
- Last published: 2026-05-08 (active maintenance)
- Peer deps declared: `@codemirror/{view,state,search,commands,language}` all `6.x.x` — matches our installed majors [VERIFIED: npm view peerDependencies]
- Source repo: github.com/replit/codemirror-vim — Replit org, public, multi-contributor
- Disposition: **APPROVED (subject to bundle gate D-19)**

### What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `vim()` from older `codemirror-vim` (no namespace) | Pre-CM6, references `CodeMirror.defineExtension` | `@replit/codemirror-vim` |
| Hand-rolled tab branching | Reinvents `insertTab` + `indentMore` already in `@codemirror/commands` | Compose existing commands |
| Hand-rolled HighlightStyle from a third-party theme | Won't track Obsidian's CSS variables; breaks on theme switch | `HighlightStyle.define([{ tag: tags.X, color: 'var(--code-X)' }])` |
| `Decoration.replace` for Source Mode parity | Pitfall 8/5 — Live Preview unfolds it | Continue with widget+CSS-hide (Phase 13 D-13 unchanged) |

## Package Legitimacy Audit

> Vim is the only **new** package candidate. All others are already installed and have shipped in production v1.2 builds.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@replit/codemirror-vim` | npm | ~4.5 years (since 2021-11-29) | publicly trackable; Replit-maintained | github.com/replit/codemirror-vim | [OK] (manual: peerDeps match, scoped to active org, no postinstall) | **Approved (gated by D-19 bundle ceiling)** |

slopcheck CLI was not invoked — manual peer-deps + maintainer audit substitutes. Mark `[ASSUMED]` if planner prefers to enforce a `checkpoint:human-verify` task before `npm install`.

## Architecture Patterns

### System Architecture Diagram (Wave-1 write paths)

```
                ┌─────────────────────────────────────────────────────────┐
                │  USER ACTION (in MarkdownView with lc-slug frontmatter) │
                └───────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼─────────────────────────────────┐
        │                       │                                 │
        ▼                       ▼                                 ▼
   Cmd-P "Reset code"   Tab key in fence body              ` repair trigger
        │                       │                                 │
        ▼                       ▼                                 ▼
 resolveActiveLangSlug    customTabCommand                  findCodeFence
 (frontmatter→fence       (cursor at line-start            returns null
  →default)               vs mid-line)                            │
        │                       │                                 ▼
        ▼                       ▼                          repairFenceStructure
 getDispatchHandle?      indentMore | insertTab            (parent CM6 dispatch
        │                       │                          userEvent='leetcode.fence-repair')
   ┌────┴────┐                  │                                 │
   │  child  │ vault.process    ▼                                 ▼
   │ exists? │ fallback     CHILD dispatch                  Body unchanged →
   └────┬────┘ (no view)    (normal user edit)              no body sync needed
        │ yes                   │                                 │
        ▼                       ▼                                 ▼
  CHILD.dispatch         createChildSyncExtension          rebuild fence detection
  full-body replace      mirrors to PARENT with            on next user edit
  userEvent=             addToHistory.of(false)
  'leetcode.reset.child'        │
        │                       ▼
        ▼                   PARENT doc updated
 createChildSyncExtension   (Phase 14 invariant)
 mirrors to PARENT with
 addToHistory.of(false)
        │
        ▼
 PARENT doc updated +
 fileManager.processFrontMatter
 sets lc-language
```

### File-to-Implementation Mapping (Wave-by-Wave)

| Wave | Files Touched | New Files |
|------|---------------|-----------|
| **Wave 1** | `src/solve/resetCodeWithConfirm.ts`, `src/main.ts` (~2780–2810 Reset wiring), `src/main/childEditorSync.ts` (`repairFenceStructure` debug+fix), `src/main/childEditorFactory.ts` (Tab keymap replacement) | `tests/main/resetCommand.childDispatch.test.ts` (new), `tests/main/childEditorSync.repair.test.ts` (new fixture for damaged-fence reproduction), `tests/main/tabMidLine.test.ts` |
| **Wave 2** | `src/main.ts` `onload` (register metadataCache.changed listener), `tests/main/fmReactivity.test.ts` | `.planning/phases/17-polish-edge-cases/17-UAT.md` (paste/IME/Source-mode scripts) |
| **Wave 3** | `src/main/childEditorFactory.ts` (HighlightStyle slot, vim conditional spread), `package.json` (vim dep IF gate passes) | `src/main/childEditorTheme.ts` (themed HighlightStyle), `tests/main/childEditorTheme.test.ts`, `tests/main/lifecycle.test.ts` (registry destroy assertions), `.planning/phases/17-polish-edge-cases/17-BUNDLE-AUDIT.md` (written record per D-24) |

### Pattern 1: Canonical Plugin Write-Path (D-05)

**What:** Plugin writes touching the fence body dispatch through the child editor's CM6 (when registered); the existing child→parent sync mirrors the change to the parent with `addToHistory.of(false)`. Fall back to `app.vault.process(...)` only when no child is registered.

**When to use:** Reset code (D-03), Copy to Code audit (deferred), any future plugin write.

**Example — Reset refactored (D-03):**

```typescript
// src/solve/resetCodeWithConfirm.ts — replace the existing handle.replaceFullBody body
//
// Before (Phase 16 fix — currently in repo):
//   handle.replaceFullBody calls cm.dispatch on PARENT CM6
//   with userEvent: 'leetcode.reset' → lands in PARENT undo stack → BROKEN.
//
// After (D-03):
//   getDispatchHandle returns a handle that dispatches on the CHILD CM6 obtained
//   from childEditorRegistry.get(file.path). The existing createChildSyncExtension
//   in childEditorSync.ts:82-121 will mirror the change to the parent with
//   addToHistory.of(false) automatically.

// In src/main.ts where Reset wires getDispatchHandle (~line 2780-2810), change:
getDispatchHandle: (targetFile: TFile) => {
  // 1) Look up child first — child is the canonical write target
  const childView = this.childEditorRegistry.get(targetFile.path);
  if (childView) {
    return {
      replaceFullBody: (next: string) => {
        // Compute fence-body-only slice from `next` (forceInjectCodeSection
        // returns the FULL note body; we need just the body between fence
        // markers because the child's doc IS the fence body)
        const bodyOnly = extractFenceBodyFromFullNote(next);  // helper to add
        childView.dispatch({
          changes: { from: 0, to: childView.state.doc.length, insert: bodyOnly },
          userEvent: 'leetcode.reset.child',  // NEW userEvent — child-origin reset
          // NOTE: do NOT add addToHistory.of(false) — we WANT child undo entry
        });
        // The existing createChildSyncExtension listener will pick this up,
        // skip echo via syncAnnotation gate (none on this dispatch — it's
        // child-origin user-style, sync extension WILL fire), and mirror to
        // parent with addToHistory.of(false) per childEditorSync.ts:158-164.
      },
    };
  }
  // 2) No child registered (note not open in MarkdownView) — vault.process
  //    fallback (existing behavior preserved per D-04)
  return null;  // helper falls back to vault.process
},
```

**Critical detail:** The child's `createChildSyncExtension` updateListener at `childEditorSync.ts:87-121` does NOT skip `'leetcode.reset.child'` — its only echo guard is `syncAnnotation`, and the new userEvent is not annotated. So Reset dispatched on child → child-sync extension mirrors to parent → parent doc updated. The child gets the undo entry; parent does NOT (mirror dispatch carries `addToHistory.of(false)` per `childEditorSync.ts:111,162`). This restores the Phase 15 D-05 invariant.

**Why `'leetcode.reset.child'` userEvent (not unchanged `'leetcode.reset'`):**
- Required by CLAUDE.md `'leetcode.*'` convention (child editor has no section lock so this is informational only — but consistency).
- Distinguishes child-origin Reset from any future parent-origin path.
- Update CLAUDE.md `## Conventions` block to add: `'leetcode.reset.child'` (child-origin Reset dispatch).

### Pattern 2: Custom Tab Command Composition (D-11)

**What:** Replace the bare `indentWithTab` keymap entry with a `Mod`-less Tab binding that branches on cursor position.

**Example:**

```typescript
// src/main/childEditorFactory.ts — replace line 185:
//   keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])
// with:
import { insertTab, indentMore, indentLess } from '@codemirror/commands';

const customTabCommand: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  // Multi-line selection → always indent (preserve INDENT-03 single-undo)
  if (!sel.empty && state.doc.lineAt(sel.from).number !== state.doc.lineAt(sel.to).number) {
    return indentMore(view);
  }
  // Cursor at or before first non-whitespace of line → indent the line
  const line = state.doc.lineAt(sel.head);
  const beforeCursor = line.text.slice(0, sel.head - line.from);
  if (/^\s*$/.test(beforeCursor)) {
    return indentMore(view);
  }
  // Mid-line → insert tab character (or N spaces from indentUnit)
  return insertTab(view);
};

const customShiftTabCommand: Command = (view) => indentLess(view);

// In the extensions array:
keymap.of([
  { key: 'Tab', run: customTabCommand, shift: customShiftTabCommand },
  ...defaultKeymap,
  ...historyKeymap,
]),
```

**Critical detail:** `insertTab` from `@codemirror/commands` reads `indentUnit` from state — so it inserts the right unit per language (4 spaces, 2 spaces, or `\t`). It is NOT a hardcoded `\t` insert. [CITED: codemirror.net/docs/ref/#commands.insertTab]

**Single-undo invariant (D-12):** Both `indentMore` and `insertTab` produce a single transaction. Multi-line selection's `indentMore` is also a single transaction (CM6 standard). Phase 15 invariant preserved.

### Pattern 3: Themed HighlightStyle (D-15)

**What:** A single `HighlightStyle.define([...])` keyed off Lezer `tags`, mapping to Obsidian CSS variables. Wired via `syntaxHighlighting(themedHighlightStyle)` in the child's extension array, **replacing** the current `syntaxHighlighting(defaultHighlightStyle)` at `childEditorFactory.ts:177`.

**Lezer tag → Obsidian CSS variable map (HIGH confidence — published in Obsidian theme contract):**

| Lezer tag | Obsidian CSS variable | Purpose |
|-----------|----------------------|---------|
| `tags.keyword` | `var(--code-keyword)` | Reserved words (def, class, if, return) |
| `tags.string` | `var(--code-string)` | String literals |
| `tags.comment` | `var(--code-comment)` | Comments |
| `tags.function(tags.variableName)` | `var(--code-function)` | Function names |
| `tags.tagName` | `var(--code-tag)` | HTML/JSX tags |
| `tags.propertyName` | `var(--code-property)` | Object property keys |
| `tags.operator` | `var(--code-operator)` | Operators |
| `tags.number` | `var(--code-value)` | Numeric literals |
| `tags.bool` | `var(--code-value)` | true/false |
| `tags.null` | `var(--code-value)` | null/None/nil |
| `tags.className` | `var(--code-property)` | Class names |
| `tags.typeName` | `var(--code-keyword)` | Type names (TS, Rust) |
| `tags.regexp` | `var(--code-string)` | Regex literals |
| `tags.escape` | `var(--code-string)` | Escape sequences |
| `tags.special(tags.string)` | `var(--code-string)` | Template literals |
| `tags.punctuation` | `var(--code-normal)` | Brackets, semicolons (default text) |
| `tags.invalid` | `var(--text-error)` | Parser errors |

**Bracket-match contrast (D-16) — solved as side-effect:**

```typescript
// In childEditorTheme.ts, alongside the HighlightStyle:
const themedBracketMatchTheme = EditorView.theme({
  '.cm-matchingBracket': {
    color: 'var(--code-keyword)',           // high-contrast foreground
    backgroundColor: 'var(--background-modifier-active-hover)',  // tinted bg
    outline: '1px solid var(--code-keyword)',
    borderRadius: '2px',
  },
  '.cm-nonmatchingBracket': {
    color: 'var(--text-error)',
    backgroundColor: 'transparent',
  },
});
```

Verified visually in dark + light Obsidian themes during Wave 3 UAT.

**Conditional Go highlighting (D-17):**

```typescript
// Total LOC for this is ~5 — within D-17 ceiling of "≤20 LOC, no new deps":
import { StreamLanguage } from '@codemirror/language';
import { go } from '@codemirror/legacy-modes/mode/go';

// Already in childEditorLanguage.ts — no change needed there. The themed
// HighlightStyle defined in childEditorTheme.ts applies to legacy-modes Go
// AUTOMATICALLY because `syntaxHighlighting(themedHighlightStyle)` reads tags
// from the active language whatever its source. The thing that was missing is
// any HighlightStyle binding — defaultHighlightStyle had partial Lezer-tag
// coverage; the themed style covers the same tags AND legacy-modes' tag set.
//
// Test: switch to Go fence, verify keyword/string/comment colorization. If
// still plain text after themed style ships → Go has its own tag mapping
// problem (defer to v1.3 per D-17 escape clause).
```

**Decision rule:** Build themed HighlightStyle (covers all Lezer langs); ship Go highlighting **iff** UAT shows Go gets colorized after the swap (Wave 3). If Go remains plain text, document as v1.3 and remove zero LOC (the binding was already free).

### Pattern 4: Vim Mode Conditional (D-18)

**What:** Read `app.vault.getConfig('vimMode')` at child creation; spread `vim()` into extensions when true.

**Example:**

```typescript
// src/main/childEditorFactory.ts — extension array, BEFORE keymap.of([...]):
import { vim } from '@replit/codemirror-vim';

// Read once at mount (matches Obsidian's behavior — vim setting changes
// don't take effect until note reopen):
const vimEnabled = (app as unknown as {
  vault: { getConfig(key: string): unknown };
}).vault.getConfig('vimMode') === true;

const extensions = [
  // ... existing extensions ...
  ...(vimEnabled && app ? [vim()] : []),  // vim FIRST in keymap order
  keymap.of([{ key: 'Tab', run: customTabCommand, shift: customShiftTabCommand }, ...defaultKeymap, ...historyKeymap]),
];
```

**Vim keymap interactions (D-20) — verified behaviors to UAT:**

| Concern | Expected Behavior | Source |
|---------|-------------------|--------|
| Esc returns focus to parent | Vim Esc enters Normal mode FIRST; second Esc OR Cmd-blur returns focus | Standard vim semantics; Phase 15 escape hatch unchanged |
| Tab in Insert mode | Falls through to our `customTabCommand` (D-11) | `vim()` doesn't bind Tab in Insert by default |
| Cmd-/ in Normal/Insert | Both work — our Scope-based override (factory.ts:74-120) is at app level, fires regardless of vim mode | Verified by Phase 16 Test 6 architecture |
| `:w` in Normal mode | Maps to no-op (recommend) OR Obsidian save | Researcher recommendation: **no-op** for v1.2 — Obsidian auto-saves; users who want explicit save use Cmd-S which Obsidian handles. Document in 17-UAT.md. |
| Mode indicator | Vim package adds `.cm-vim-panel` line at bottom of editor | Default behavior — accept |

**Bundle gate (D-19/D-21):** Wave 3 task gates the install on a measured size delta. Plan structure:

1. Build current `main.js` → record raw + gzipped bytes (baseline).
2. `npm install @replit/codemirror-vim` (in a branch).
3. Add the import + conditional spread.
4. Build → record new bundle size.
5. Decision:
   - **delta + current ≤ 1,600,000:** vim ships in v1.2.
   - **delta + current > 1,600,000:** uninstall, remove import, document as v1.3 deferral, keep all other Wave-3 work.

### Pattern 5: External Frontmatter Reactivity (D-13)

```typescript
// src/main.ts onload (or a new src/main/fmReactivity.ts):
this.registerEvent(
  this.app.metadataCache.on('changed', (file, _data, cache) => {
    // Gate 1: lc-slug note only
    const slug = cache?.frontmatter?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;

    // Gate 2: child registered for this file (note open in a MarkdownView)
    const childView = this.childEditorRegistry.get(file.path);
    if (!childView) return;

    // Gate 3: lc-language differs from child's currently-applied slug
    const fmLang = cache.frontmatter?.['lc-language'];
    if (typeof fmLang !== 'string' || fmLang.length === 0) return;

    // Compare to child's current — read from a per-child WeakMap or stash on
    // the EditorView. Simplest: re-read parent fence opener tag and compare:
    const currentSlug = readActiveFenceSlug(file);  // helper using metadataCache + parent CM6
    if (currentSlug === fmLang) return;  // already in sync

    // Dispatch the same Compartment.reconfigure used by chevron (Phase 16 D-12 step 2):
    childView.dispatch({
      effects: languageCompartment.reconfigure(
        buildLanguageExtensions(fmLang, this.settings.getIndentSizeOverride()),
      ),
      // userEvent: 'leetcode.lang-switch' is NOT applicable here because there's
      // no `changes:` payload — just an effect. Skip annotation entirely.
    });
    // Per D-14: do NOT rewrite the fence opener tag. Frontmatter is the source
    // of truth in this scenario.
  }),
);
```

**Debounce/dedupe note:** `metadataCache.on('changed')` fires once per file save and once per metadata-cache rebuild. Gate 3 (slug equality check) is sufficient dedupe — no debounce needed. If empirical UAT shows multiple fires per save, add 50ms debounce via `Map<filePath, NodeJS.Timeout>` cleared on each fire.

### Anti-Patterns to Avoid

- **Dispatching Reset on parent with `addToHistory.of(false)`:** Loses Reset from undo entirely; Cmd-Z does nothing. Worse than current state. → Use Pattern 1 (child dispatch, mirror to parent).
- **Building a new sync StateEffect for fm reactivity:** Phase 16's `languageCompartment.reconfigure` is sufficient. Do NOT introduce new effects/annotations.
- **Hardcoding HighlightStyle colors:** Won't track theme switches. Always use `var(--code-*)`.
- **Bundling vim package eagerly when vimMode is false:** esbuild CJS+nosplit prevents true dynamic import (per Phase 07-03 ceiling-bump comment). Accept always-bundled cost; condition only at runtime (D-21).
- **Skipping the Reset regression test fixture:** Without a test that fails on `main` and passes after D-03, the fix is unverifiable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab branching on cursor position | Custom indent calculator | Compose `insertTab` + `indentMore` from `@codemirror/commands` | They read `indentUnit` from state correctly; battle-tested with multi-cursor + selection |
| Vim mode | Custom modal keymap | `@replit/codemirror-vim` | Obsidian's built-in vim is CodeMirror 5; CM6 child needs the official 6.x port |
| Themed syntax colors | Hand-pick hex codes | Lezer `tags` + Obsidian CSS variables | Theme switches break hard-coded colors; tag system is canonical |
| Frontmatter change detection | Polling, manual diff | `app.metadataCache.on('changed')` | Obsidian's standard hook; fires after parse, includes processed frontmatter |
| Heap-snapshot tooling | Custom Playwright harness | Manual DevTools snapshot | v1.2 ships internally; manual is sufficient and fastest |
| Bundle measurement | Custom byte counter | Existing `scripts/check-bundle-size.mjs` + esbuild metafile | Gate already exists; metafile gives contributor breakdown |

**Key insight:** Phase 17 is mostly **applying existing primitives correctly**, not building new ones. The Reset undo bug exists precisely because the Phase 16 fix took a shortcut (parent dispatch) instead of using the canonical pattern (child dispatch + existing sync mirror).

## Runtime State Inventory

> N/A — Phase 17 is pure code/test/docs work. No databases, services, or OS-registered state. The only persistent state touched is `lc-language` frontmatter (via `processFrontMatter`, idempotent) and the SettingsStore (no schema changes — D-18 reads Obsidian's `vimMode`, not a plugin setting).

**Categorical sweep:**

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None | — |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | `main.js` rebuilt by Wave 3 (vim install changes hash) | Standard `npm run build` flow |

## Common Pitfalls

### Pitfall 1: Reset child dispatch fires before child is wired for sync

**What goes wrong:** If Reset runs on a child that hasn't yet had `wireSyncIfNeeded` called (e.g., note just opened, widget mounted, but registry-attached child has no syncExtension yet), the child changes won't propagate to the parent. User sees Reset succeed visually but disk content unchanged.

**Why it happens:** `wireSyncIfNeeded` (childEditorSync.ts:254) only wires on first `toDOM()` call. There's a brief window between widget creation and the first sync wiring.

**How to avoid:** Make Reset `getDispatchHandle` lookup ALSO call `wireSyncIfNeeded(parentView, childView, file.path, registry)` defensively before returning. The function is idempotent (`SyncWiringState.has` guard), so a second call is safe.

**Warning sign in tests:** Reset writes to child but parent doc unchanged after dispatch — assert parent doc state explicitly in `tests/main/resetCommand.childDispatch.test.ts`.

### Pitfall 2: Fence repair regression — `ECHO_PRONE_USER_EVENTS` over-filtering (D-06c hypothesis b)

**What goes wrong:** The repair fires correctly on the parent (`leetcode.fence-repair` userEvent), but `nestedEditorExtension.ts:267` includes `'leetcode.fence-repair'` in `ECHO_PRONE_USER_EVENTS`. This means `detectAndPropagateExternalChange` is **intentionally** skipped for repair. If repair adds the missing closer at a position that the child also needs to know about (because the child's bodyEnd boundary changed), the child won't observe it.

**Why it happens:** Phase 14 D-05 design assumed repair only inserts marker characters and never touches body content. But the body's **boundary** in the parent doc shifts when a closer is inserted. The child's view of "what is in my fence" is unchanged (child has its own doc), but the **parent's** `findCodeFence` now returns different `closerLine` — so subsequent child-sync writes might use stale offsets.

**How to avoid:** Investigate via debug doc `.planning/debug/fence-auto-recovery-regression.md` (per D-06c). Likely fix is one of:
- (a) Verify the repair actually triggers — log when `findCodeFence` returns null in `createChildSyncExtension` (line 96).
- (b) Verify the post-repair `findCodeFence` retry at line 102 actually finds the fence.
- (c) Check if the section lock at `sectionLockExtension.ts` has changed and is now dropping the repair dispatch.
- (d) Check if `nestedEditorExtension.ts` StateField update at line 290–293 is intercepting the repair before it commits.

**Warning sign:** Parent doc has dangling fence (single ` ``` ` line, no closer) and stays that way across multiple keystrokes. Test fixture: damage the closer, type in child, assert closer reappears.

### Pitfall 3: `metadataCache.on('changed')` listener fires during plugin's own `processFrontMatter`

**What goes wrong:** D-13 fm reactivity listener fires recursively when Reset (D-03) writes `lc-language` via `fileManager.processFrontMatter`. Listener sees the write, dispatches Compartment.reconfigure even though child language is already correct. Wasteful but not corrupting.

**Why it happens:** Standard Obsidian event hook — fires on any change including plugin-originated.

**How to avoid:** Gate 3 (slug equality check) prevents the dispatch. Verify in `tests/main/fmReactivity.test.ts` with a fixture that writes the SAME slug — assert no Compartment.reconfigure dispatch fired.

### Pitfall 4: Vim mode `Esc` shadows Phase 15 escape hatch

**What goes wrong:** Phase 15 used Esc to return focus to parent. Vim's Esc enters Normal mode (intended). Users who don't know vim semantics report "Esc is broken — doesn't return to Notes."

**Why it happens:** `vim()` extension binds Esc with high precedence.

**How to avoid:** **Document, don't fix.** When vim mode is enabled, users have opted into vim semantics — Esc-Esc (or click into Notes) is the documented escape path. Add a 1-line note in 17-UAT.md and 17-VERIFY.md so we don't get bug reports.

### Pitfall 5: Themed HighlightStyle breaks Phase 13 bracket-match if `bracketMatching()` is dropped

**What goes wrong:** Refactoring `childEditorFactory.ts:177-178` to swap `defaultHighlightStyle` for themed could accidentally remove `bracketMatching()` (line 178). HIGHLIGHT-01 silently regresses — bracket match no longer fires at all.

**How to avoid:** Diff carefully; the swap is on `syntaxHighlighting(...)` only. Keep `bracketMatching()` untouched.

**Test:** Phase 16 Test 9 (bracket match highlight) is in `tests/main/childEditorFactory.test.ts` (verify by file presence). Run after Wave 3 — must still pass.

### Pitfall 6: Bundle measurement happens BEFORE all Wave-3 work merges

**What goes wrong:** Vim install + themed HighlightStyle + Go binding + lifecycle test additions ALL contribute to bundle. If we measure mid-wave, we get a misleading number.

**How to avoid:** Bundle audit is the **last** Wave-3 task. It runs after all other Wave-3 work is committed.

## Code Examples

### Reset child-dispatch test fixture (Wave 1)

```typescript
// tests/main/resetCommand.childDispatch.test.ts (NEW FILE)
//
// Phase 17 Wave 1 — D-03 verification: Reset dispatches through child CM6.
// Asserts:
//   1. When child is registered, getDispatchHandle returns a child-routing handle.
//   2. Resulting dispatch carries userEvent 'leetcode.reset.child'.
//   3. Child doc updates; parent doc updates via existing sync (mirror with
//      addToHistory.of(false)).
//   4. Cmd-Z (history pop) on child restores prior body; parent reflects via sync.
//   5. ## Notes section is untouched after Reset+undo (Phase 15 D-05 invariant).

import { describe, it, expect, vi } from 'vitest';
import { resetCodeWithConfirm } from '../../src/solve/resetCodeWithConfirm';
import { ChildEditorRegistry } from '../../src/main/childEditorRegistry';
// ... helpers from tests/helpers/obsidian-stub and mock-vault ...

describe('Reset code — child-CM6 dispatch (Phase 17 D-03)', () => {
  it('dispatches on child when registered, parent doc reflects via sync mirror', async () => {
    // Build a parent state with a Java fence containing OLD code
    // Build a child registered in childEditorRegistry pointing at the file
    // Call resetCodeWithConfirm with deps wired to the registry
    // Assert: childView.dispatch was called with userEvent 'leetcode.reset.child'
    // Assert: parent doc body now contains starter code (via mocked sync extension)
    // Assert: parent doc dispatch carried addToHistory.of(false)
  });

  it('falls back to vault.process when no child is registered', async () => {
    // Same setup but registry has no entry for the file
    // Assert: vault.process spy called once
    // Assert: childView.dispatch not called (no child)
  });

  it('after Reset + Cmd-Z, child returns to prior body and Notes section unchanged', async () => {
    // Most important regression test — captures the screenshot symptom from
    // Phase 16 UAT carry-over.
    // Build full note with Notes section content
    // Reset via D-03 path
    // Dispatch undo on child (history pop)
    // Assert: child doc === original body
    // Assert: parent ## Notes section text unchanged from initial state
  });
});
```

### Fence repair regression fixture (Wave 1)

```typescript
// tests/main/childEditorSync.repair.test.ts (NEW FILE)
//
// D-06d: damaged-fence reproduction + post-repair invariant.
// Builds three damaged states and asserts repair restores intact structure.

describe('repairFenceStructure regression (Phase 17 D-06b)', () => {
  it('missing closer — appends ``` before next ## heading', () => {
    const damaged = [
      '---', 'lc-slug: x', '---', '',
      '## Code', '',
      '```java',
      'class Solution { }',
      // CLOSER MISSING
      '## Notes', 'unrelated text',
    ].join('\n');
    const parent = makeMockParentView(damaged);
    expect(repairFenceStructure(parent)).toBe(true);
    // Assert dispatch called with insertion of '\n```' before '## Notes'
    expect(parent.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: expect.anything(),  // userEvent 'leetcode.fence-repair'
      }),
    );
  });

  it('missing opener — inserts ``` after ## Code heading', () => { /* ... */ });
  it('both missing — inserts opener+blank+closer block', () => { /* ... */ });
  it('intact fence — returns false, no dispatch', () => { /* ... */ });

  it('post-repair, child sync uses fresh offsets (regression for hypothesis c)', () => {
    // Build a damaged-closer fence; trigger child→parent sync
    // After sync attempt, repair fires; full-replace dispatch lands cleanly
    // Assert: parent doc has both opener and closer, body matches child content
  });
});
```

### Themed HighlightStyle module (Wave 3)

```typescript
// src/main/childEditorTheme.ts (NEW FILE)
//
// Phase 17 D-15/D-16 — Obsidian-CSS-variable-bound HighlightStyle.
// Replaces defaultHighlightStyle in childEditorFactory.ts:177.
// Bracket-match contrast theme bundled here (D-16).

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
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
  '.cm-nonmatchingBracket': {
    color: 'var(--text-error)',
  },
});

export function createThemedHighlight(): Extension[] {
  return [syntaxHighlighting(themedHighlightStyle), themedBracketMatchTheme];
}
```

**Note on `@lezer/highlight` import:** This is a transitive dep of `@codemirror/language` (always present). Verified by checking node_modules in repo. If TypeScript complains about resolution, add `"@lezer/highlight": "^1.x.x"` to package.json dependencies (no bundle impact — already loaded). [VERIFIED: package transitively included via @codemirror/language]

### Lifecycle leak test (Wave 3)

```typescript
// tests/main/lifecycle.test.ts (NEW FILE)
//
// D-23 arm (a): automated registry destroy assertions.
// Manual heap-snapshot UAT goes in 17-UAT.md (arm b).

describe('ChildEditorRegistry lifecycle (Phase 17 D-23a)', () => {
  it('destroyAll calls destroy on every cached EditorView', () => {
    const registry = new ChildEditorRegistry(5);
    const views = Array.from({ length: 3 }, () => makeMockEditorView());
    registry.set('a', views[0]);
    registry.set('b', views[1]);
    registry.set('c', views[2]);
    registry.destroyAll();
    for (const v of views) {
      expect(v.destroy).toHaveBeenCalledTimes(1);
    }
    expect(registry.size).toBe(0);
  });

  it('LRU eviction destroys evicted view and unwires sync', () => {
    const registry = new ChildEditorRegistry(2);
    const v1 = makeMockEditorView();
    const v2 = makeMockEditorView();
    const v3 = makeMockEditorView();
    registry.set('a', v1);
    registry.set('b', v2);
    registry.get('a');  // touch a — b becomes LRU
    registry.set('c', v3);  // evicts b
    expect(v2.destroy).toHaveBeenCalledTimes(1);
    expect(registry.has('b')).toBe(false);
    expect(registry.has('a')).toBe(true);
    expect(registry.has('c')).toBe(true);
  });

  it('plugin onunload calls registry.destroyAll', () => {
    // Mock plugin.onunload, assert registry.destroyAll spy fires
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reset via parent CM6 dispatch with `userEvent: 'leetcode.reset'` | Reset via child CM6 dispatch with `userEvent: 'leetcode.reset.child'` + sync mirror | This phase (D-03) | Restores Phase 15 D-05 invariant |
| Bare `indentWithTab` keymap entry | `Tab` bound to `customTabCommand` (line-start vs mid-line branch) | This phase (D-11) | Mid-line Tab inserts character; multi-line selection still single-undo |
| `defaultHighlightStyle` from `@codemirror/language` | Themed HighlightStyle bound to Obsidian CSS variables | This phase (D-15) | Theme-aware colors; dark-mode bracket match contrast |
| Chevron-only language source-of-truth | Chevron + frontmatter (chevron writes, fm reads) | This phase (D-13) | External fm edits trigger child reconfigure |
| No vim support in child | Conditional `vim()` extension matched to Obsidian's `vimMode` | This phase (D-18) | Single source of truth (Obsidian's setting) |

**Deprecated/outdated:**
- Parent CM6 Reset dispatch — **REMOVED** in D-03. Document the removal in CLAUDE.md `## Conventions` block (the `'leetcode.reset'` userEvent on parent should never appear after this phase; if it does, it's a regression).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `metadataCache.on('changed')` fires after frontmatter is fully parsed and includes the new value in `cache.frontmatter` | Pattern 5 (D-13) | If fires before parse completes, fmLang would be stale — listener would loop or miss updates. **Mitigation:** Wave-2 UAT explicitly tests external fm edit → child reconfigure within 1 second. |
| A2 | `@replit/codemirror-vim` 6.3.0 gzipped bundle delta is ≤25 KB | D-19 vim gate | Could exceed 1.6 MB ceiling, forcing vim-out. **Mitigation:** Wave-3 hard gate (measure before commit; revert if over). |
| A3 | Obsidian publishes the full set of `--code-{keyword,string,comment,function,tag,property,operator,value}` CSS variables across all built-in themes | Pattern 3 (D-15) | If a variable is undefined, syntax highlighting falls back to inherited color (probably text default — degraded but not broken). **Mitigation:** Each `var(--code-X)` falls back via `var(--code-X, var(--text-normal))` if needed; verify in light + dark themes during UAT. |
| A4 | Legacy-modes Go highlighting will start working after themed HighlightStyle swap | D-17 | Go may have a different tag mapping that needs explicit binding. **Mitigation:** UAT-driven; if Go remains plain text after Wave-3 swap, accept v1.3 deferral (D-17 escape clause). |
| A5 | `'leetcode.reset.child'` userEvent will not be intercepted by any current sync gate | Pattern 1 | If `ECHO_PRONE_USER_EVENTS` ever expands to include it, child→parent sync would silently drop. **Mitigation:** New userEvent is NOT in current set (verified `nestedEditorExtension.ts:265-268`); add comment to that block stating "DO NOT ADD `'leetcode.reset.child'`". |
| A6 | The fence repair regression (D-06b) is one of the four enumerated hypotheses (a/b/c/d) and not a fifth unknown cause | Pitfall 2 | Wasted Wave-1 time. **Mitigation:** Hypothesis (e) "instrumentation reveals an unmodeled cause" is implicit; debug doc must remain open until reproduction confirms hypothesis. |

**If any assumption fails during execution → return to discuss-phase before continuing.**

## Open Questions (RESOLVED)

> All four open questions have been resolved during planning. Each is governed by a CONTEXT decision and a concrete plan task — no execution-time research is required. Marked here for traceability.

1. **Vim package size — actual gzipped delta** — **RESOLVED**
   - What we know: 6.3.0 published 2026-05-08; peer deps match; raw size estimated 60–80 KB.
   - What's unclear (was): gzipped delta to OUR bundle (other deps may share code).
   - Resolution: **measure → install → measure → decide** per CONTEXT D-19 hard-gate protocol. Owned by Plan 17-06 Task 2 (`checkpoint:decision`). Plan executes baseline build → `npm install @replit/codemirror-vim` → re-build → measure delta → branch on `current_raw <= 1,600,000`. The gate is empirical and one-shot; no further research changes the outcome.

2. **Whether Source Mode renders `Decoration.widget({ block: true })` correctly** — **RESOLVED**
   - What we know: Phase 13 chose widget+CSS-hide over Decoration.replace specifically to avoid Source Mode pitfalls.
   - What's unclear (was): empirical Cmd-E flip behavior with pending child edits.
   - Resolution: **empirical UAT** per CONTEXT D-07 verify-first / fix-only-if-broken policy. Owned by 17-UAT.md script SRCLIV-01 (Plan 17-04 scaffolds; Plan 17-06 Task 4 executes). If UAT shows the flip preserves state → no code change. If it fails → file as v1.3 issue per D-07 escape clause; the registry already preserves child across mode flips per Phase 13.

3. **Go highlighting after themed swap** — **RESOLVED**
   - What we know: Phase 16 UAT confirmed Go is plain text with `defaultHighlightStyle`.
   - What's unclear (was): whether legacy-modes Go's tags map to our themed tags.
   - Resolution: **UAT-driven** per CONTEXT D-17 escape clause; ≤20 LOC + no-new-deps ceiling decided by Plan 17-05 Task 2 (themed style swap, free for Lezer langs) + 17-UAT.md script GO-01 (Plan 17-06 Task 4). Decision tree explicitly enumerated in 17-UAT.md Test 16 (CASE A ship / CASE B defer + REQUIREMENTS.md FUTURE-06 entry).

4. **Whether to debounce `metadataCache.on('changed')`** — **RESOLVED**
   - What we know: Standard Obsidian hook fires once per save in normal usage.
   - What's unclear (was): Whether metadataCache rebuilds (e.g., on Obsidian load, vault sync) fire it multiple times.
   - Resolution: **start without debounce.** Plan 17-04 Task 2 ships the listener without debounce. Add 50ms debounce only if 17-UAT.md (Plan 17-06 Task 4 — Test 12 fm-reactivity sanity) shows multiple fires per save. Gate 3 (slug equality check) is the primary dedupe and is sufficient for the canonical case.

## Environment Availability

> Phase 17 is code-only; no new external tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All (build, tests) | ✓ | (project standard) | — |
| npm | Vim install (D-18) | ✓ | (project standard) | — |
| esbuild | Bundle build | ✓ | ^0.28.0 (package.json) | — |
| vitest | Test execution | ✓ | ^4.1.5 (package.json) | — |
| Obsidian (dev vault) | Manual UAT (D-07..D-10, D-23 heap snapshot) | (assumed user-controlled) | 1.12.x peer | Skip UAT, mark phase incomplete |
| DevTools heap profiler | D-23 arm (b) | ✓ (Chromium DevTools, built into Obsidian Electron) | — | Skip UAT, accept arm (a) only |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (assumed; project standard) |
| Quick run command | `npm test -- tests/main/<file>.test.ts` |
| Full suite command | `npm test` |
| Per-test isolation | `vi.mock('obsidian', ...)` pattern from `tests/main/childEditorSync.test.ts:12-15` |

### Phase Requirements → Test Map

| Item | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|--------------|
| D-03 Reset undo | Cmd-Z restores prior body; Notes untouched | unit (mocked CM6) | `npm test -- tests/main/resetCommand.childDispatch.test.ts` | ❌ Wave 1 (NEW) |
| D-03 Reset undo | Reset dispatches userEvent `'leetcode.reset.child'` on child | unit | same | ❌ Wave 1 (NEW) |
| D-04 Reset fallback | No-child path uses vault.process | unit | `npm test -- tests/main/resetCommand.test.ts` (extend existing) | ✅ tests/main/resetCommand.test.ts |
| D-06b/d Fence repair | Damaged-closer reproduction + post-repair invariant | unit | `npm test -- tests/main/childEditorSync.repair.test.ts` | ❌ Wave 1 (NEW) |
| D-11 Tab mid-line | mid-line Tab inserts char; line-start Tab indents; multi-line selection indents | unit | `npm test -- tests/main/tabMidLine.test.ts` | ❌ Wave 1 (NEW) |
| D-12 Single-undo invariant | Multi-line indent is one history entry | unit | same | ❌ Wave 1 (NEW) |
| D-13 fm reactivity | metadataCache.changed dispatches Compartment.reconfigure | unit | `npm test -- tests/main/fmReactivity.test.ts` | ❌ Wave 2 (NEW) |
| D-14 fm reactivity | Listener does NOT rewrite fence opener | unit | same | ❌ Wave 2 (NEW) |
| D-15/D-16 Themed style | HighlightStyle uses CSS variables; bracket-match theme present | unit (DOM check) | `npm test -- tests/main/childEditorTheme.test.ts` | ❌ Wave 3 (NEW) |
| D-15/D-16 Visual | Dark + light theme verification | manual UAT | 17-UAT.md script | ❌ Wave 3 (NEW) |
| D-17 Go highlighting | Go fence shows colorization | manual UAT | 17-UAT.md script | ❌ Wave 3 (NEW) |
| D-18/D-20 Vim mode | vimMode=true loads vim; Esc-Esc returns focus; Cmd-/ works in Insert/Normal | manual UAT | 17-UAT.md script | ❌ Wave 3 (NEW) |
| D-23a Lifecycle | destroyAll, LRU eviction, onunload destroy | unit | `npm test -- tests/main/lifecycle.test.ts` | ❌ Wave 3 (NEW) |
| D-23b Heap snapshot | 20 open/close cycles, no detached EditorView | manual UAT | 17-UAT.md script + DevTools | ❌ Wave 3 (NEW) |
| D-24 Bundle audit | Raw + gzipped + contributor breakdown documented; under 1.6 MB | manual record | `npm run check:bundle-size` + `node esbuild.config.mjs production --metafile` | partial (script exists; audit doc NEW) |
| D-07/D-08 Paste UAT | VS Code, StackOverflow, LC web, Obsidian clipboard interceptor | manual UAT | 17-UAT.md script | ❌ Wave 2 (NEW) |
| D-09 IME UAT | Pinyin, Romaji, Hangul; no duplication, no truncation | manual UAT | 17-UAT.md script | ❌ Wave 2 (NEW) |
| D-10 Source/Live Preview | Cmd-E with pending edits; child preserves on flip-back | manual UAT | 17-UAT.md script | ❌ Wave 2 (NEW) |

### Sampling Rate

- **Per task commit:** `npm test -- tests/main/<file>.test.ts` (~5 sec) for the file just touched.
- **Per wave merge:** `npm test` (full suite, ~30 sec) + `npm run lint` + `npm run build`.
- **Phase gate:** Full suite + `npm run check:bundle-size` + manual UAT scripts pass before `/gsd:verify-work`.

### Wave 0 Gaps

> Wave 0 = test infrastructure additions before Wave 1 work begins.

- [x] `tests/helpers/obsidian-stub.ts` already provides the structural stubs (Notice, TFile, MarkdownView, Workspace, makeStateForLockTests, makeFakeTransaction) that Wave-1 tests need. The Reset/repair/Tab tests will inline their own `makeMockChildView` and `makeMockRegistry` mocks following the established pattern in `tests/main/childEditorSync.test.ts:87-109` and `tests/main/childEditorRegistry.test.ts:10` — no new helper required.
- [x] `metadataCache` stubbing follows the `createFakeMetadataCache().setFrontmatter(...)` pattern already used by `tests/main/codeActionsPostProcessor.test.ts:103-105` and `tests/main/childEditorSync.test.ts:241-292`. Wave 2's fm-reactivity test will inline a `metadataCache: { getFileCache: vi.fn() }` mock per the chevron-analog pattern at `src/main/codeActionsEditorExtension.ts:329-359`.
- [x] No new framework install needed — vitest 4.1.5 is configured.
- [x] No conftest equivalent — vitest uses per-file `vi.mock(...)` pattern.

*Wave 0 is complete by reuse — no new infrastructure plan is required. Wave-1 tasks proceed.*

## Sources

### Primary (HIGH confidence)
- Codebase: `src/main/childEditorSync.ts` (read in full) — sync primitives, repair function, `addToHistory.of(false)` mirror pattern
- Codebase: `src/main/nestedEditorExtension.ts` (read in full) — `ECHO_PRONE_USER_EVENTS` set, externalChangeListener gating
- Codebase: `src/main/childEditorFactory.ts` (read in full) — extension array mount points, Cmd-/ Scope pattern
- Codebase: `src/main/childEditorRegistry.ts` (read in full) — LRU lifecycle for D-23
- Codebase: `src/main/childEditorLanguage.ts` (read in full) — Compartment + buildLanguageExtensions for D-13 reuse
- Codebase: `src/solve/resetCodeWithConfirm.ts` (read in full) — Reset helper architecture for D-03 refactor target
- Codebase: `src/main.ts:2780-2810` (Reset dispatch wiring) — current parent CM6 dispatch path that D-03 changes
- `.planning/phases/17-polish-edge-cases/17-CONTEXT.md` — locked decisions D-01..D-24
- `.planning/phases/16-language-packs-switching/16-UAT.md` — full carry-over backlog with reproduction notes
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Pitfalls 1, 5, 6, 8, 10 architectural rationale
- `.planning/REQUIREMENTS.md` + `.planning/ROADMAP.md` — requirement traceability + phase definition
- `package.json` (read in full) — verified all CM6 deps already installed
- `npm view @replit/codemirror-vim` — verified vim package version 6.3.0, peer deps, publish date

### Secondary (MEDIUM confidence)
- `tests/main/childEditorSync.test.ts` (lines 1–100) — fixture pattern for damaged-fence regression test reuse
- `tests/main/resetCommand.test.ts` (lines 1–120) — fixture pattern for `tests/main/resetCommand.childDispatch.test.ts`
- `scripts/check-bundle-size.mjs` head — current 1.6 MB ceiling; precedent for Phase 17 audit

### Tertiary (LOW confidence)
- Lezer tag → Obsidian CSS variable mapping (Pattern 3) — based on Obsidian theme contract documentation; mitigated by `var(...)` fallback chains and Wave-3 visual UAT

## Metadata

**Confidence breakdown:**
- Reset undo refactor (D-03): HIGH — pattern reuse from `childEditorSync.ts:107-115`; test-fixture pattern already established
- Fence repair regression (D-06b..d): MEDIUM — root cause requires debug session; four hypotheses listed with verification strategies
- Tab mid-line (D-11): HIGH — composes documented CM6 commands; no novel logic
- fm reactivity (D-13): HIGH — reuses Phase 16 D-12 dispatch pattern verbatim
- Themed HighlightStyle (D-15..16): MEDIUM-HIGH — Obsidian CSS variable mapping is published but theme variance possible; conservative fallback chains mitigate
- Go highlighting (D-17): LOW-MEDIUM — depends on legacy-modes tag binding behavior; UAT-driven decision
- Vim mode (D-18..21): MEDIUM — package selection HIGH (verified); bundle gate is concrete numbered hard gate
- Lifecycle (D-23): HIGH — `ChildEditorRegistry.destroyAll` already exists; tests are direct assertions
- Bundle audit (D-24): HIGH — script exists; audit is paperwork

**Research date:** 2026-05-23
**Valid until:** 2026-06-22 (30 days — stable CM6 ecosystem; only watch is `@replit/codemirror-vim` major bump unlikely in 30 days)
