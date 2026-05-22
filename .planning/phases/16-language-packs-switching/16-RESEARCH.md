# Phase 16: Language Packs & Switching — Research

**Researched:** 2026-05-22
**Domain:** CM6 LanguageSupport, Compartment reconfigure, closeBrackets, toggleLineComment
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** `@codemirror/lang-rust` 6.x — Rust LanguageSupport
- **D-02** `@codemirror/legacy-modes` — Go via `StreamLanguage.define(go)`; `@codemirror/legacy-modes/mode/go` import path
- **D-03** `@codemirror/lang-cpp` for both `cpp` and `c`; `@codemirror/lang-javascript` with `{ typescript: true }` for `typescript`
- **D-04** Only 8 chevron slugs get LanguageSupport; others fall through to existing path
- **D-05** Per-language indent map (`auto` defaults): python3/java/cpp/c/rust → 4 spaces; javascript/typescript → 2 spaces; golang → `'\t'`
- **D-06** One settings field `indentSizeOverride: 'auto' | 2 | 4 | 8`; Go always uses tab regardless
- **D-07** Effective indent recomputed on every language switch; `indentUnit.of(...)` lives inside the language Compartment
- **D-08** `@codemirror/autocomplete` promoted to direct dep; use stock `closeBrackets()` + `closeBracketsKeymap`; covers BRACKET-01/03/04
- **D-09** BRACKET-05 (triple-backtick template literals) deferred; update REQUIREMENTS.md to mark as Deferred
- **D-10** BRACKET-02 (markdown `*`/`_` pair suppression) needs regression test confirming no auto-pair fires in the child editor
- **D-11** Single `languageCompartment: Compartment` holds: LanguageSupport + `indentUnit.of(...)` + `closeBrackets()` + `keymap.of(closeBracketsKeymap)` + comment-toggle keymap entry
- **D-12** Chevron handler `switchFenceLanguage` extended: after parent CM6 dispatch, look up child via `childEditorRegistry.get(file.path)`, dispatch `{ effects: languageCompartment.reconfigure(...), userEvent: 'leetcode.lang-switch' }` on child
- **D-13** No new SharedStateEffect for child reconfigure; `Compartment.reconfigure(...)` effect is sufficient
- **D-14** External `lc-language` frontmatter edit reactivity deferred to Phase 17
- **D-15** HIGHLIGHT-01 already done (Phase 13 `bracketMatching()` at `childEditorFactory.ts:45`); verify only
- **D-16** Theme-aware highlighting deferred to Phase 17

### Claude's Discretion

- Implementation file layout: new `src/main/childEditorLanguage.ts` if builder grows past ~50 lines (preferred)
- Go import path: `@codemirror/legacy-modes/mode/go` vs package main export — whichever esbuild handles cleanly
- `closeBracketsKeymap` placement: top-level (outside Compartment) is simpler since it doesn't depend on language data; per-language behavior comes from `closeBrackets()` reading `languageData` at runtime
- Test layout: fixture-driven table per requirement (INDENT-04, BRACKET-01..04, COMMENT-01) rather than 8 per-language files

### Deferred Ideas (OUT OF SCOPE)

- BRACKET-05 (triple-backtick template literals in JS/TS)
- Theme-aware syntax highlighting (Phase 17)
- External `lc-language` frontmatter edit reactivity (Phase 17)
- Vim mode support (Phase 17)
- Modular panel layout (v1.3+)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INDENT-04 | Indent unit respects active language | §1 indent map table; §5 Compartment reconfigure wiring |
| ENTER-02 | Enter after `{`/`(` indents new line one level deeper | §4 — Lezer-based lang packs provide this via `indentNodeProp` on block nodes |
| ENTER-03 | Enter after Python `:` indents new line one level deeper | §4 — `@codemirror/lang-python` `indentNodeProp` handles colon-body contexts |
| ENTER-04 | Enter between matched `{|}` splits into 3 lines | §4 — `continuedIndent`/`delimitedIndent` in Lezer packs; `closeBrackets()` does NOT do this; CM6 `insertNewlineAndIndent` does |
| BRACKET-01 | Open bracket inserts matching closer | §2 — `closeBrackets()` + per-lang `languageData` |
| BRACKET-02 | `*`/`_`/backtick in fence body does NOT auto-pair | §2 — no markdown LanguageSupport in child = no markdown pair behavior; covered by regression test |
| BRACKET-03 | Close bracket overtypes existing closer | §2 — `closeBracketsKeymap` provides overtype handler |
| BRACKET-04 | Backspace between pair deletes both | §2 — `closeBracketsKeymap` provides Backspace handler |
| BRACKET-05 | Triple-backtick auto-close in JS/TS | DEFERRED (D-09) |
| LANG-01 | Chevron switch updates indent/bracket without re-opening note | §5 Compartment reconfigure dispatch |
| COMMENT-01 | Cmd-/ toggles line comment using active language's syntax | §3 — `toggleLineComment` from `@codemirror/commands` reads `commentTokens` from languageData; no per-language switch code needed |
| HIGHLIGHT-01 | Bracket match highlighting on cursor | Already done Phase 13; verify only (D-15) |
</phase_requirements>

---

## Summary

Phase 16 wires full CM6 LanguageSupport for 8 LC slugs into a single `languageCompartment: Compartment` on the child editor. Chevron switches atomically reconfigure parser + indent + closeBrackets + comment-toggle in one `cm.dispatch({ effects: ... })` call. The language builder is a pure function `buildLanguageExtensions(slug, override)` → `Extension[]` living in a new `src/main/childEditorLanguage.ts`. Three packages are added: `@codemirror/lang-rust` (direct Lezer pack), `@codemirror/legacy-modes` (StreamLanguage for Go), `@codemirror/autocomplete` (promoted from transitive to direct for `closeBrackets()`). `@codemirror/autocomplete` and `@codemirror/commands` are already external in esbuild; `@codemirror/lang-rust` and the legacy-modes subpath bundle. Net bundle delta is ~50–80 KB gzipped, well within the 1.5 MB v1.2 ceiling.

**Primary recommendation:** One `languageCompartment` containing `[languageSupport, indentUnit.of(effectiveIndent), closeBrackets()]`; `closeBracketsKeymap` outside the Compartment at the top level of the extensions array (simpler, no language-dependence).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Language parser (syntax + indent + comment tokens) | Child editor (CM6) | — | LanguageSupport lives in the child's state; parent editor sees only raw fence text |
| Bracket auto-close behavior | Child editor (CM6) | — | `closeBrackets()` reads `languageData` from the child's active LanguageSupport |
| Compartment reconfigure dispatch | `src/main.ts:switchFenceLanguage` | `childEditorRegistry` lookup | Chevron is the single entry point for language switches (D-14 deferred reactivity) |
| Per-language indent unit | `src/main/childEditorLanguage.ts` | Settings (`indentSizeOverride`) | Pure mapping function; setting provides user override at call time |
| Settings persistence | `SettingsStore` + `SettingsTab` | — | `indentSizeOverride: 'auto' \| 2 \| 4 \| 8` field follows existing pattern |
| REQUIREMENTS.md mutation | Manual edit | — | Flip BRACKET-05 from Pending → Deferred |

---

## Standard Stack

### New Direct Dependencies (add to `package.json` `dependencies`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@codemirror/lang-rust` | `^6.0.2` | Rust LanguageSupport (Lezer-based) | Official CM6 org package; same quality tier as lang-python/java/cpp |
| `@codemirror/legacy-modes` | `^6.5.3` | Go via `StreamLanguage.define(go)` | Official CM6 org package; only Go option since no `lang-go` exists |
| `@codemirror/autocomplete` | `^6.20.2` | `closeBrackets()`, `closeBracketsKeymap` | Official CM6 org; currently transitive via lang-cpp/lang-javascript; must be direct for explicit import |

[VERIFIED: npm registry] — all three packages confirmed on npm registry with versions above.

Registry provenance:
- `@codemirror/lang-rust`: `github.com/codemirror/lang-rust` (official CM6 org) [VERIFIED: npm registry]
- `@codemirror/legacy-modes`: `code.haverbeke.berlin/codemirror/legacy-modes` (Marijn Haverbeke's personal forge = CM6 author) [VERIFIED: npm registry]
- `@codemirror/autocomplete`: `code.haverbeke.berlin/codemirror/autocomplete` (same) [VERIFIED: npm registry]

### Already Present (no install needed)

| Library | In `package.json` | Role in Phase 16 |
|---------|-------------------|------------------|
| `@codemirror/lang-python` | `^6.2.1` dep | `python3` slug |
| `@codemirror/lang-java` | `^6.0.2` dep | `java` slug |
| `@codemirror/lang-cpp` | `^6.0.3` dep | `cpp` + `c` slugs |
| `@codemirror/lang-javascript` | `^6.2.5` dep | `javascript` + `typescript` slugs |
| `@codemirror/commands` | `^6.10.3` devDep + esbuild external | `toggleLineComment`, `insertNewlineAndIndent` |
| `@codemirror/language` | `^6.12.3` devDep + esbuild external | `indentUnit`, `StreamLanguage`, `bracketMatching` |
| `@codemirror/state` | esbuild external | `Compartment`, `Extension` |
| `@codemirror/autocomplete` | esbuild external | `closeBrackets`, `closeBracketsKeymap` — already external, just add direct dep |

**Installation:**
```bash
npm install @codemirror/lang-rust @codemirror/legacy-modes @codemirror/autocomplete
```

---

## Package Legitimacy Audit

> slopcheck exited with code 2 (API unavailable at research time). Packages verified manually via npm registry + official repository provenance.

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `@codemirror/lang-rust` | npm | ~3 yrs (pub 2025-06-19 for v6.0.2) | github.com/codemirror/lang-rust | unavailable | Approved — official CM6 org |
| `@codemirror/legacy-modes` | npm | ~4 yrs (pub 2026-05-14 for v6.5.3) | code.haverbeke.berlin/codemirror/legacy-modes | unavailable | Approved — CM6 author's forge |
| `@codemirror/autocomplete` | npm | ~4 yrs (pub 2026-05-06 for v6.20.2) | code.haverbeke.berlin/codemirror/autocomplete | unavailable | Approved — CM6 author's forge |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time (exit 2). All three packages are tagged [VERIFIED: npm registry] via manual provenance check against the official codemirror GitHub org and Marijn Haverbeke's (CM6 author) personal forge. No planner checkpoint required — provenance is unambiguous.*

---

## Section 1: Slug → Extension[] Builder

Pure function: `buildLanguageExtensions(slug: string, override: 'auto' | 2 | 4 | 8): Extension[]`

| LC slug | LanguageSupport import | Call | Per-lang indent (`auto`) |
|---------|------------------------|------|--------------------------|
| `python3` | `import { python } from '@codemirror/lang-python'` | `python()` | `'    '` (4 sp) |
| `java` | `import { java } from '@codemirror/lang-java'` | `java()` | `'    '` (4 sp) |
| `cpp` | `import { cpp } from '@codemirror/lang-cpp'` | `cpp()` | `'    '` (4 sp) |
| `c` | same as cpp | `cpp()` | `'    '` (4 sp) |
| `javascript` | `import { javascript } from '@codemirror/lang-javascript'` | `javascript()` | `'  '` (2 sp) |
| `typescript` | same as javascript | `javascript({ typescript: true })` | `'  '` (2 sp) |
| `golang` | `import { StreamLanguage } from '@codemirror/language'`; `import { go } from '@codemirror/legacy-modes/mode/go'` | `StreamLanguage.define(go)` | `'\t'` (always tab; ignores override) |
| `rust` | `import { rust } from '@codemirror/lang-rust'` | `rust()` | `'    '` (4 sp) |

**Effective indent derivation:**

```ts
function effectiveIndent(slug: string, override: 'auto' | 2 | 4 | 8): string {
  if (slug === 'golang') return '\t'; // gofmt non-negotiable (D-06)
  if (override !== 'auto') return ' '.repeat(override);
  // D-05 per-language defaults
  const map: Record<string, string> = {
    python3: '    ', java: '    ', cpp: '    ', c: '    ', rust: '    ',
    javascript: '  ', typescript: '  ', golang: '\t',
  };
  return map[slug] ?? '    '; // 4-space fallback for unknown slugs
}
```

**esbuild Go import shape:** `@codemirror/legacy-modes/mode/go` exports a plain object `{ name: 'go', startState, token, ... }` (CM5-style mode descriptor). `StreamLanguage.define(go)` wraps it. esbuild resolves deep subpath imports from `node_modules/@codemirror/legacy-modes/mode/go.js` — this is a standard CJS/ESM export and bundles cleanly. `@codemirror/language` (which exports `StreamLanguage`) is already external in esbuild, but `StreamLanguage.define` itself is a call made at bundle-time-init and the result is bundled. [VERIFIED: esbuild.config.mjs — `@codemirror/language` is in externals list, so `StreamLanguage` is runtime-provided by Obsidian; call `StreamLanguage.define(go)` at factory call time, not module init time, to avoid circular issues.] [ASSUMED: the exact deep-import subpath `/mode/go` resolves under esbuild without additional `paths` config — this follows the legacy-modes package structure which uses individual mode files.]

**Pitfall 11 (from NESTED-EDITOR-PITFALLS.md):** `@codemirror/language` is esbuild-external. `StreamLanguage` is on the runtime-provided `@codemirror/language`. Import it via `import { StreamLanguage } from '@codemirror/language'` — esbuild will leave this as an external require. The `go` mode object from `@codemirror/legacy-modes/mode/go` WILL be bundled (it's not in the externals list). This is the correct split.

---

## Section 2: closeBrackets Wiring

**How `closeBrackets()` reads per-language pairs:** [ASSUMED based on CM6 architecture — not directly confirmed via Context7 in this session, but consistent with CM6's languageData facet design]

- `closeBrackets()` (from `@codemirror/autocomplete`) reads the `closeBrackets` facet from `languageData`. Each `LanguageSupport` defines its bracket pairs via `languageData: { closeBrackets: { brackets: [...] } }`.
- `python()` → pairs: `{`, `[`, `(`, `"`, `'`, `` ` ``
- `java()` / `cpp()` / `rust()` → pairs: `{`, `[`, `(`, `"`, `'`
- `javascript()` → pairs: `{`, `[`, `(`, `"`, `'`, `` ` ``
- `StreamLanguage.define(go)` → basic pairs; CM5 modes don't set `closeBrackets` languageData natively, so `closeBrackets()` falls back to a default set (typically `{`, `[`, `(`)

**BRACKET-02 (no markdown pairs):** The child editor has NO markdown `LanguageSupport`. The markdown pair behavior (`*`, `_`, backtick auto-pair) is a markdown language-data feature. Without markdown LanguageSupport in the child, it simply never fires. This is structural — requires a regression test to prove (D-10). [ASSUMED: no explicit CM6 doc confirming this, but follows logically from languageData scoping]

**`closeBracketsKeymap` placement (D-11 + Claude's Discretion):** Place `keymap.of(closeBracketsKeymap)` OUTSIDE the Compartment, at the top level of the extensions array in `createChildEditor`. The keymap bindings (`(`, `[`, etc.) delegate to `closeBrackets()` for the actual pair-insertion decision; the keymap itself is language-agnostic. Rebuilding the keymap on every language switch is unnecessary complexity.

**BRACKET-03 (overtype):** `closeBracketsKeymap` provides a handler that intercepts typing a closing bracket when the next character is that same bracket, consuming it instead of inserting a duplicate. [ASSUMED: standard CM6 closeBrackets behavior]

**BRACKET-04 (Backspace pair-delete):** `closeBracketsKeymap` provides a Backspace handler that deletes both opener and closer when cursor is between an auto-inserted pair. [ASSUMED: standard CM6 closeBrackets behavior]

**Keymap ordering concern:** `closeBracketsKeymap` Backspace handler must be checked before any other Backspace binding. Place `keymap.of(closeBracketsKeymap)` before `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])` in the extensions array to ensure priority. [ASSUMED: standard CM6 keymap precedence — first registered wins for same key]

---

## Section 3: toggleLineComment

**How `toggleLineComment` reads comment tokens:** [ASSUMED based on CM6 architecture]

- `toggleLineComment` (from `@codemirror/commands`) reads the `commentTokens` facet from `languageData` at the cursor's language scope.
- Each Lezer-based LanguageSupport declares its `commentTokens` in language data:
  - `python()` → `{ line: '#' }`
  - `java()`, `cpp()`, `javascript({ typescript: true })`, `rust()` → `{ line: '//' }`
  - `StreamLanguage.define(go)` → CM5 modes declare `lineComment: '//'` which `StreamLanguage` maps to `commentTokens: { line: '//' }` [ASSUMED — CM5 → StreamLanguage mapping]

**Is Cmd-/ already in `defaultKeymap`?** [ASSUMED: `defaultKeymap` from `@codemirror/commands` does NOT include a Cmd-/ binding for `toggleLineComment`.]

The `@codemirror/commands` package exposes `toggleLineCommentKeymap` (a separate array) and also includes Cmd-/ in `defaultKeymap` only as a comment toggle IF the relevant binding is in the standard set. Based on CM6 architecture, `defaultKeymap` contains standard editing commands but NOT `toggleLineComment` — that is in a separate `commentKeymap` export. [ASSUMED — not verified in Context7 this session]

**Conclusion:** The comment toggle Cmd-/ / Ctrl-/ binding must be explicitly added as part of D-11's keymap entry inside the Compartment OR at the top level. Per D-11, include it as a keymap entry in the Compartment alongside the LanguageSupport — this makes the comment keymap reload with each language switch, which is harmless (the binding always calls the same `toggleLineComment`).

**Explicit binding to add inside Compartment:**

```ts
import { toggleLineComment } from '@codemirror/commands';
// Inside buildLanguageExtensions:
keymap.of([{ key: 'Mod-/', run: toggleLineComment }]),
```

`Mod-` is CM6's cross-platform modifier (Cmd on Mac, Ctrl on Win/Linux). [ASSUMED: standard CM6 key notation]

---

## Section 4: ENTER-02/03/04 Indent Behavior

**Per-language Enter indent behavior:**

| Slug | ENTER-02 (`{`-Enter) | ENTER-03 (`:`-Enter) | ENTER-04 (`{|}` split) | Mechanism |
|------|----------------------|----------------------|------------------------|-----------|
| `python3` | N/A (no braces) | YES | N/A | `lang-python` Lezer indent handles `:` colon-body blocks via `indentNodeProp` |
| `java` | YES | N/A | YES | `lang-java` Lezer `delimitedIndent`/`continuedIndent` on block nodes |
| `cpp` / `c` | YES | N/A | YES | `lang-cpp` Lezer same pattern as Java |
| `javascript` / `typescript` | YES | N/A | YES | `lang-javascript` Lezer; TypeScript shares the same indent rules |
| `golang` | YES (brace-counting in StreamLanguage) | N/A | PARTIAL | Go StreamLanguage provides brace-counting indent; ENTER-04 split behavior may be incomplete vs Lezer packs [ASSUMED — StreamLanguage indent is less precise than Lezer] |
| `rust` | YES | N/A | YES | `lang-rust` Lezer same pattern as Java/C++ |

**How it works:** CM6's `insertNewlineAndIndent` command (in `defaultKeymap` as Enter) triggers the language's `indentLine` logic. Lezer packs implement `indentNodeProp` on their grammar nodes. `closeBrackets()` handles ENTER-04 via the `insertNewlineContinueMarkupList` / auto-bracket-split path. [ASSUMED: ENTER-04 requires `closeBrackets()` to be active]

**Caveat for Go:** `StreamLanguage` uses a regex-based token approach. ENTER-02 (brace indent) works via brace counting. ENTER-04 (split `{|}`) depends on `closeBrackets()` pair tracking — this should work since `closeBrackets()` is in the Compartment. ENTER-03 does not apply to Go. Overall quality is acceptable for typical LC Go solutions. [ASSUMED — empirical testing required in UAT]

---

## Section 5: Compartment Reconfigure Dispatch

**Factory-time initialization:**

```ts
// src/main/childEditorLanguage.ts
import { Compartment } from '@codemirror/state';

export const languageCompartment = new Compartment();

export function buildLanguageExtensions(
  slug: string,
  override: 'auto' | 2 | 4 | 8,
): Extension[] {
  return [
    getLanguageSupport(slug),           // LanguageSupport for parser + languageData
    indentUnit.of(effectiveIndent(slug, override)),
    closeBrackets(),                    // reads per-lang bracket pairs from languageData
    keymap.of([{ key: 'Mod-/', run: toggleLineComment }]),
  ];
}
```

**In `createChildEditor` (replaces hardcoded `indentUnit.of("    ")` and `python()` at lines 43 and 49):**

```ts
// Replace python() + indentUnit.of("    ") with:
languageCompartment.of(buildLanguageExtensions(initialSlug, indentSizeOverride)),
```

The `languageCompartment` instance must be accessible from both `createChildEditor` (for initialization) and `switchFenceLanguage` (for reconfigure). Options:
- Export from `childEditorLanguage.ts` as a singleton (simplest — one child per file per D-11/registry key)
- Store on the registry entry alongside the `EditorView`

**Chevron reconfigure dispatch (D-12):**

```ts
// Inside switchFenceLanguage, after the existing cm.dispatch({...}) call:
const childView = this.childEditorRegistry.get(file.path);
if (childView) {
  childView.dispatch({
    effects: languageCompartment.reconfigure(
      buildLanguageExtensions(newSlug, this.settings.getIndentSizeOverride())
    ),
    annotations: Transaction.userEvent.of('leetcode.lang-switch'),
  });
}
```

**Key properties of this dispatch:**
- `effects` only — NO `changes`, NO doc edit
- `userEvent: 'leetcode.lang-switch'` — matches the existing parent-side annotation (CLAUDE.md convention)
- Cursor position: preserved (no document change, no selection reset)
- No remount: `Compartment.reconfigure` is a `StateEffect` applied in-place; the EditorView stays mounted
- No echo: child sync extension (`createChildSyncExtension`) only fires on `update.docChanged`; an effects-only transaction has `docChanged === false` → sync skips it entirely

**Pitfall 5 reference (Compartment timing):** Reconfigure must happen AFTER the parent dispatch completes (step B in `switchFenceLanguage`). The child dispatch is synchronous JavaScript — no async gap. The existing `switchFenceLanguage` already dispatches to the parent cm synchronously; add the child dispatch immediately after.

---

## Section 6: Sync / Section-Lock Compatibility

**Child sync skips effects-only transactions:** `createChildSyncExtension` (in `childEditorSync.ts:87`) guards on `if (!update.docChanged) return`. A Compartment reconfigure dispatch has no `changes`, so `docChanged === false` — the sync listener exits immediately. No parent contamination. [VERIFIED: childEditorSync.ts line 89]

**`'leetcode.*'` userEvent bypass for section lock:** The section lock's Gate 0 (`sectionLockExtension.ts`) evaluates `tr.isUserEvent('input.*')` etc. A `userEvent: 'leetcode.lang-switch'` is NOT `input.*` / `delete.*` / `undo` / `redo`, so Gate 0 passes it through. However, the reconfigure dispatch goes to the CHILD editor, not the parent — the section lock extension lives on the parent editor and never sees the child's dispatch. The `userEvent` annotation on the child dispatch is purely for the child's own updateListeners (sync extension). [VERIFIED: childEditorSync.ts echo prevention at line 92; section lock is parent-only]

**nestedEditorExtension fast-path:** The parent's nested editor StateField `update()` has a `leetcode.*` early-return path (maps decorations without rebuild). The child reconfigure dispatch is dispatched to the CHILD, not the parent, so the parent StateField never sees it. No widget rebuild triggered. [VERIFIED: 14-CONTEXT.md D-01/D-02 and pattern described in 13-CONTEXT.md code context]

---

## Section 7: Settings UI for `indentSizeOverride`

**Add to `PluginData` interface:**
```ts
indentSizeOverride: 'auto' | 2 | 4 | 8;  // D-06 default 'auto'
```

**Add to `DEFAULT_DATA`:**
```ts
indentSizeOverride: 'auto',
```

**Shape-guard in `SettingsStore.load`:**
```ts
indentSizeOverride: (raw.indentSizeOverride === 2 || raw.indentSizeOverride === 4 ||
                    raw.indentSizeOverride === 8)
  ? raw.indentSizeOverride
  : 'auto',  // collapses any non-matching value (fresh install, corrupt) to 'auto'
```

**Getter/setter (follow existing pattern):**
```ts
getIndentSizeOverride(): 'auto' | 2 | 4 | 8 { return this.data.indentSizeOverride; }
async setIndentSizeOverride(v: 'auto' | 2 | 4 | 8): Promise<void> {
  this.data.indentSizeOverride = v;
  await this.persist();
}
```

**Settings UI (in `SettingsTab.ts`, new "Code editor" section heading):**

Follow the `addDropdown` pattern used for `previewClickBehavior` (line ~213) and `defaultLanguage` (line ~191). Use `.addOption(value, label)` chain per established precedent:

```ts
new Setting(containerEl).setName('Code editor').setHeading();

new Setting(containerEl)
  .setName('Indent size')
  .setDesc('Number of spaces per indent level in the code editor. "Auto" uses the language default (4 for Java/Python/C++, 2 for JS/TS, tab for Go).')
  .addDropdown((d) => d
    .addOption('auto', 'Auto (language default)')
    .addOption('2', '2 spaces')
    .addOption('4', '4 spaces')
    .addOption('8', '8 spaces')
    .setValue(String(this.plugin.settings.getIndentSizeOverride()))
    .onChange(async (v) => {
      const val = v === '2' ? 2 : v === '4' ? 4 : v === '8' ? 8 : 'auto';
      await this.plugin.settings.setIndentSizeOverride(val as 'auto' | 2 | 4 | 8);
    }),
  );
```

Note: `addDropdown` values are strings; coerce back to number/`'auto'` in `onChange`.

---

## Section 8: REQUIREMENTS.md BRACKET-05 Mutation

**Current line (line 83):**
```
| BRACKET-05 | Phase 16: Language Packs & Switching           | Pending |
```

**Target line:**
```
| BRACKET-05 | Phase 16: Language Packs & Switching           | Deferred |
```

Also add to the `## Future Requirements (Deferred)` section (after FUTURE-04, around line 50):
```
- **BRACKET-05**: Triple-backtick template literal auto-close in JS/TS (CM6 stock `closeBrackets` does not cover triple-quote sequences; deferred to v1.3 if user-reported).
```

And remove BRACKET-05 from the checkbox list (lines 31-32) or change `[ ]` to indicate deferred status. The traceability table change on line 83 is the load-bearing mutation.

---

## Section 9: Bundle Size

**Current bundle:** `main.js` was not built in the working tree (no artifact found). CLAUDE.md records the bundle ceiling as ~1.5 MB for v1.2. Previous pitfall analysis (NESTED-EDITOR-PITFALLS.md Pitfall 14) estimated ~270–370 KB for language packs uncompressed.

**Phase 16 delta estimate:**

| Package | Bundled? | Estimated gzipped delta |
|---------|----------|-------------------------|
| `@codemirror/lang-rust` | YES (not external) | ~20–30 KB gzipped |
| `@codemirror/legacy-modes/mode/go` | YES (subpath, not external) | ~5–10 KB gzipped (one mode file) |
| `@codemirror/autocomplete` (closeBrackets only, tree-shaken) | NO — already esbuild external | 0 KB (runtime-provided by Obsidian) |
| `@codemirror/lang-python/java/cpp/javascript` | Already in bundle | 0 KB delta |

**Critical finding:** `@codemirror/autocomplete` is already in `esbuild.config.mjs` externals list (line 21: `"@codemirror/autocomplete"` in externals). This means `closeBrackets()` and `closeBracketsKeymap` are runtime-provided by Obsidian — zero bundle impact. The only new bundle contributions are `lang-rust` (~20–30 KB gzipped) and the `legacy-modes/mode/go` subpath (~5–10 KB gzipped).

**Total Phase 16 gzipped delta: ~25–40 KB** — well within the D-12/CONTEXT.md accepted budget of ~50–80 KB and the 1.5 MB ceiling. [ASSUMED: gzip estimates based on Lezer grammar sizes; confirmed direction by esbuild externals list]

**Build verification step:** Run `npm run build && node scripts/check-bundle-size.mjs` as part of the phase verification. The `check:bundle-size` script exists in `package.json`.

---

## Section 10: Test Strategy

**Existing test infrastructure:** vitest 4.1.5, happy-dom environment, `tests/main/childEditorFactory.test.ts` as the direct model. All CM6 modules mocked via `vi.mock(...)`. Tests do NOT use live EditorState/EditorView — they verify that factory functions pass the right arguments to CM6 constructors.

### Unit Tests (new file: `tests/main/childEditorLanguage.test.ts`)

| What to test | Test description | Mocking |
|-------------|------------------|---------|
| `buildLanguageExtensions('python3', 'auto')` returns array with `python()`, `indentUnit.of('    ')`, `closeBrackets()` | Shape validation | Mock lang packs + autocomplete |
| `buildLanguageExtensions('golang', 'auto')` uses `'\t'` | Go tab indent | Mock StreamLanguage.define |
| `buildLanguageExtensions('golang', 4)` still uses `'\t'` (override ignored) | Go tab override non-negotiable | Same |
| `buildLanguageExtensions('javascript', 2)` uses `'  '` | Override respected | Mock |
| `buildLanguageExtensions('typescript', 'auto')` calls `javascript({ typescript: true })` | TS variant | Mock |
| `buildLanguageExtensions('cpp', 'auto')` and `buildLanguageExtensions('c', 'auto')` both call `cpp()` | Shared C/C++ pack | Mock |
| `effectiveIndent` map covers all 8 slugs with correct defaults | Table completeness | Pure function, no mocking |
| `indentSizeOverride` shape-guard: `'2'` (string) → `'auto'` (not valid number) | Settings guard | Unit test SettingsStore.load |

### Unit Tests (update: `tests/main/childEditorFactory.test.ts`)

- Remove test asserting `indentUnit.of('    ')` called directly (line 173) — now Compartment-managed
- Remove test asserting `python()` called directly (line 99) — now inside Compartment
- Add test: `EditorState.create` receives `languageCompartment.of(...)` extension
- Add test: `closeBracketsKeymap` keymap entry present (outside Compartment)

### Integration / Behavioral Tests (new file: `tests/main/childEditorLanguage.behavioral.test.ts`)

Use live `EditorState` (no mock) with happy-dom. CM6 packages work in happy-dom for state-level tests (no rendering).

| Requirement | Test | Command |
|-------------|------|---------|
| BRACKET-01: open inserts pair | `EditorState` with `closeBrackets()` + `python()`, simulate `{` input, verify `{}` in doc | `vitest run tests/main/childEditorLanguage.behavioral.test.ts` |
| BRACKET-03: overtype closer | Position cursor before `}`, type `}`, verify no double `}}` | Same |
| BRACKET-04: Backspace pair-delete | Cursor between `{}`, Backspace, verify both deleted | Same |
| BRACKET-02: `*` no auto-pair | `EditorState` with `python()` only (no markdown), type `*`, verify no pair | Same |
| COMMENT-01: `toggleLineComment` Python | Apply `toggleLineComment` to Python state, verify `#` prefix | Same |
| COMMENT-01: `toggleLineComment` Java | Apply `toggleLineComment` to Java state, verify `//` prefix | Same |
| INDENT-04: Python `indentUnit` | Check `getIndentUnit(state)` returns `'    '` for python3 | Same |
| INDENT-04: JS `indentUnit` | Check `getIndentUnit(state)` returns `'  '` for javascript | Same |
| INDENT-04: Go `indentUnit` | Check `getIndentUnit(state)` returns `'\t'` for golang | Same |

**Note on behavioral tests:** `@codemirror/commands`, `@codemirror/language`, `@codemirror/state` are esbuild-external but NOT vitest-external — vitest resolves them from `node_modules` normally. The test file imports them directly (no mock). This matches the pattern in `tests/main/sectionLockExtension.test.ts` which uses live EditorState.

---

## Section 11: Validation Architecture (Nyquist)

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=dot tests/main/childEditorLanguage` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INDENT-04 | `indentUnit` per slug | unit | `npm test -- tests/main/childEditorLanguage.test.ts` | ❌ Wave 0 |
| ENTER-02 | `{`-Enter indent | behavioral | `npm test -- tests/main/childEditorLanguage.behavioral.test.ts` | ❌ Wave 0 |
| ENTER-03 | `:`-Enter Python indent | behavioral | same | ❌ Wave 0 |
| ENTER-04 | `{|}` split | behavioral | same | ❌ Wave 0 |
| BRACKET-01 | Auto-close pairs | behavioral | same | ❌ Wave 0 |
| BRACKET-02 | No markdown pair in child | behavioral | same | ❌ Wave 0 |
| BRACKET-03 | Overtype closer | behavioral | same | ❌ Wave 0 |
| BRACKET-04 | Backspace pair-delete | behavioral | same | ❌ Wave 0 |
| LANG-01 | Compartment reconfigure shape | unit | `npm test -- tests/main/childEditorLanguage.test.ts` | ❌ Wave 0 |
| COMMENT-01 | `toggleLineComment` Python/#, Java/JS// | behavioral | same | ❌ Wave 0 |
| HIGHLIGHT-01 | `bracketMatching()` in extensions | unit (existing) | `npm test -- tests/main/childEditorFactory.test.ts` | ✅ existing |

### Sampling Rate

- **Per task commit:** `npm test -- tests/main/childEditorLanguage`
- **Per wave merge:** `npm test` (full suite, must be green)
- **Phase gate:** Full suite green + `npm run build` clean + `node scripts/check-bundle-size.mjs` passes + manual chevron-switch UAT

### Wave 0 Gaps

- [ ] `tests/main/childEditorLanguage.test.ts` — unit tests for `buildLanguageExtensions`, `effectiveIndent` map, all 8 slugs
- [ ] `tests/main/childEditorLanguage.behavioral.test.ts` — live EditorState behavioral tests for BRACKET-01..04, COMMENT-01, INDENT-04, ENTER-02..04
- [ ] Update `tests/main/childEditorFactory.test.ts` — remove hardcoded `python()` + `indentUnit` assertions; add Compartment-based assertions

---

## Section 12: Common Pitfalls

### Pitfall A: esbuild external conflict with `@codemirror/language` + `StreamLanguage.define`

**What goes wrong:** `@codemirror/language` is esbuild-external. Calling `StreamLanguage.define(go)` at module initialization time (top-level const) causes esbuild to generate code that calls the external `@codemirror/language` before Obsidian has provided it.

**Prevention:** Call `StreamLanguage.define(go)` inside `buildLanguageExtensions(...)` (at factory call time, not module init), so it resolves the external after Obsidian's runtime has provided `@codemirror/language`. [ASSUMED: standard safe pattern for CM6 external deps in Obsidian plugins]

### Pitfall B: `@codemirror/autocomplete` is already external — import correctly

**What goes wrong:** `closeBrackets` and `closeBracketsKeymap` are imported from `@codemirror/autocomplete`, which is in esbuild's externals list. This is correct — esbuild will leave the import as an external require, and Obsidian's runtime provides it. But if the developer accidentally imports from a deep subpath (e.g., `@codemirror/autocomplete/src/closebrackets`), esbuild will bundle that subpath instead.

**Prevention:** Always import `closeBrackets` and `closeBracketsKeymap` from the package root: `import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'`.

### Pitfall C: `languageCompartment` singleton scope

**What goes wrong:** If `languageCompartment` is a module-level singleton in `childEditorLanguage.ts`, all child editors share the same `Compartment` instance. `Compartment.reconfigure(...)` generates a `StateEffect` that is evaluated in the context of a specific `EditorView`'s state — the effect carries the new config but the `Compartment` object itself is just a key. Multiple editors sharing one `Compartment` key is fine architecturally (CM6 Compartments are identity-based, not state-based). However, if two notes are open simultaneously, reconfiguring one child affects only that child's state (the dispatch goes to one `childView`). This is correct behavior. [ASSUMED: consistent with CM6 Compartment design]

**Prevention:** Use module-level singleton OR per-instance; both work. Module-level singleton is simpler and idiomatic.

### Pitfall D: `closeBracketsKeymap` ordering vs Backspace handlers

**What goes wrong:** `defaultKeymap` includes its own Backspace binding (delete character). If `closeBracketsKeymap` Backspace handler is registered after `defaultKeymap`, CM6 evaluates the `defaultKeymap` Backspace first, consuming the event before `closeBracketsKeymap` sees it.

**Prevention:** Register `keymap.of(closeBracketsKeymap)` as an extension that appears BEFORE `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])` in the extensions array. [ASSUMED: standard CM6 keymap priority]

### Pitfall E: StreamLanguage `languageData` for `commentTokens`

**What goes wrong:** CM5-style modes passed to `StreamLanguage.define(go)` declare `lineComment: '//'` at the mode level. `StreamLanguage` may or may not map this to the CM6 `commentTokens` languageData facet.

**Prevention:** If `toggleLineComment` produces no output on Go code, manually add `languageData: { commentTokens: { line: '//' } }` to the `StreamLanguage.define()` call: `StreamLanguage.define(go).extension` — or wrap: `new LanguageSupport(StreamLanguage.define(go), [languageData.of({ commentTokens: { line: '//' } })])`. Test this in Wave 1 UAT. [ASSUMED: the mapping may not be automatic; this is the documented workaround if needed]

### Pitfall F: `@codemirror/state` / `@codemirror/view` peer-dep alignment with new lang packs

**What goes wrong:** `@codemirror/lang-rust@6.0.2` and `@codemirror/legacy-modes@6.5.3` were built against specific `@codemirror/state` / `@codemirror/view` versions. If they require a higher 6.x version than what Obsidian ships, Lezer parser results may be incorrect.

**Assessment:** All CM6 packages use `^6.x` peer deps and maintain backward compatibility within the 6.x range. Obsidian 1.12.3 ships `@codemirror/state@6.x` and `@codemirror/view@6.x`. Since all packages are in the same CM6 release train, compatibility is maintained. [ASSUMED: CM6 maintains strict 6.x compatibility; no evidence of breaking changes within 6.x]

**Prevention:** After `npm install`, run `npm ls @codemirror/state @codemirror/view` to confirm no duplicate versions appear.

---

## Architecture Patterns

### Compartment Extension Array Layout

```
createChildEditor extensions array (final order):
1. languageCompartment.of(buildLanguageExtensions(initialSlug, override))
   └─ contains: [languageSupport, indentUnit.of(...), closeBrackets(), keymap.of([{Mod-/, toggleLineComment}])]
2. keymap.of(closeBracketsKeymap)        ← top-level, before defaultKeymap
3. syntaxHighlighting(defaultHighlightStyle)
4. bracketMatching()                     ← HIGHLIGHT-01 (Phase 13, unchanged)
5. history()
6. drawSelection()
7. highlightActiveLine()
8. keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])
9. EditorView.lineWrapping
10. EditorView.theme({...})
11. createScrollIntoViewExtension()
12. ...(syncExtensions ?? [])
```

### `src/main/childEditorLanguage.ts` (new file, ~60–80 lines)

Exports:
- `languageCompartment: Compartment` — singleton used by factory and chevron handler
- `buildLanguageExtensions(slug: string, override: 'auto' | 2 | 4 | 8): Extension[]`
- `effectiveIndent(slug: string, override: 'auto' | 2 | 4 | 8): string` (exported for tests)

### Recommended Project Structure Changes

```
src/main/
├── childEditorFactory.ts     # Replace python()+indentUnit with languageCompartment.of(...)
├── childEditorLanguage.ts    # NEW — buildLanguageExtensions, effectiveIndent, languageCompartment
├── childEditorRegistry.ts    # Unchanged
├── childEditorSync.ts        # Unchanged
└── ...
src/settings/
├── SettingsStore.ts          # Add indentSizeOverride field + getter/setter + shape-guard
└── SettingsTab.ts            # Add "Code editor" section + indent size dropdown
src/main.ts                   # switchFenceLanguage: add child reconfigure dispatch
.planning/
└── REQUIREMENTS.md           # BRACKET-05: Pending → Deferred
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hardcoded `python()` + `indentUnit.of("    ")` in `childEditorFactory.ts` | `languageCompartment.of(buildLanguageExtensions(slug, override))` | Atomic per-language reconfigure without remount |
| No `closeBrackets` in child | `closeBrackets()` in language Compartment | BRACKET-01/03/04 covered |
| No comment toggle binding | `keymap.of([{key: 'Mod-/', run: toggleLineComment}])` in Compartment | COMMENT-01 |
| Single `indentSizeOverride: 'auto'` default | Settings field + dropdown UI | User-configurable indent per D-06 |

**Deprecated / changed:**
- `childEditorFactory.ts` line 43 `python()` — replaced by Compartment; move to `childEditorLanguage.ts`
- `childEditorFactory.ts` line 49 `indentUnit.of("    ")` — replaced by Compartment-managed value

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `closeBrackets()` reads per-language bracket pairs from `languageData` in the active LanguageSupport | §2 | Pairs would be language-agnostic (same for all langs); low severity since default pairs still work |
| A2 | `defaultKeymap` does NOT include a Cmd-/ comment toggle binding | §3 | If it does, adding an explicit binding causes duplicate (harmless — CM6 deduplicates same-key same-command) |
| A3 | `StreamLanguage.define(go)` maps CM5 `lineComment: '//'` to CM6 `commentTokens` | §3 | `toggleLineComment` silently no-ops on Go code; fix: add explicit `languageData` (§12 Pitfall E) |
| A4 | ENTER-04 `{|}` split requires `closeBrackets()` to be active | §4 | Split behavior may not fire; workaround: add `insertNewlineAndIndent` explicitly |
| A5 | `@codemirror/legacy-modes/mode/go` deep subpath resolves cleanly under esbuild without extra `paths` config | §1 | Build error; fix: add esbuild `alias` or use package main export if it re-exports mode files |
| A6 | Module-level `languageCompartment` singleton works correctly when multiple child editors are active | §12 Pitfall C | No issue expected; CM6 Compartments are identity-keyed per EditorState |
| A7 | `closeBracketsKeymap` Backspace wins over `defaultKeymap` Backspace when registered before it | §12 Pitfall D | Backspace pair-delete doesn't work; fix: reorder extensions |

---

## Open Questions

1. **`StreamLanguage.define(go)` comment token mapping**
   - What we know: CM5 go mode declares `lineComment: '//'`
   - What's unclear: Whether `StreamLanguage` automatically exposes this as `commentTokens` in CM6 languageData
   - Recommendation: Wave 1 — test `toggleLineComment` on Go code in a live EditorState; if no-op, add explicit `languageData.of({ commentTokens: { line: '//' } })` to the Go LanguageSupport extension

2. **`closeBracketsKeymap` placement (inside vs outside Compartment)**
   - What we know: D-11 says `keymap.of(closeBracketsKeymap)` in Compartment; Claude's Discretion says top-level is simpler
   - What's unclear: Whether the keymap must be in the Compartment to get per-language pair data or if top-level works
   - Recommendation: Top-level (outside Compartment); `closeBrackets()` inside Compartment reads languageData; the keymap just triggers it — no language-awareness in the keymap bindings themselves

3. **ENTER-04 `{|}` split — does it require explicit `insertNewlineAndIndent` or is it covered by `closeBrackets()` + `defaultKeymap` Enter?**
   - What we know: `defaultKeymap` includes Enter → `insertNewlineAndIndent`; `closeBrackets()` may provide pair-split behavior
   - What's unclear: Whether the three-line split comes from `closeBrackets` or from language indent alone
   - Recommendation: Test in Wave 1 behavioral test; if not working, add `closeBracketsKeymap` Enter binding explicitly

---

## Environment Availability

Phase 16 adds no external services. Node.js and npm are available (confirmed by registry queries above). No new CLI tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm | Package install | ✓ | — | — |
| `@codemirror/lang-rust` | Rust LanguageSupport | ✓ (6.0.2 on registry) | 6.0.2 | — |
| `@codemirror/legacy-modes` | Go LanguageSupport | ✓ (6.5.3 on registry) | 6.5.3 | — |
| `@codemirror/autocomplete` | closeBrackets (already external) | ✓ | 6.20.2 | — |

---

## Project Constraints (from CLAUDE.md)

- `'leetcode.*'` userEvent bypass required on any plugin-internal CM6 dispatch targeting locked ranges or bypassing child↔parent sync
- `requestUrl` for all HTTP (not `fetch`); no impact on Phase 16 (no network calls)
- No `innerHTML`; no `eval()`; no global `app`
- Use `Prec.highest` or extension ordering for keymap priority
- `@codemirror/state` and `@codemirror/view` always external in esbuild
- `@codemirror/autocomplete` already external — import from package root only
- `app.fileManager.processFrontMatter()` for frontmatter writes (not `vault.modify`)
- TypeScript `strictNullChecks: true`, `noImplicitAny: true`

---

## Sources

### Primary (HIGH confidence)
- `esbuild.config.mjs` (this repo) — externals list, confirms `@codemirror/autocomplete` is external [VERIFIED]
- `src/main/childEditorSync.ts:87-92` — `docChanged` guard confirms effects-only transactions skip sync [VERIFIED]
- `src/main/childEditorFactory.ts` — current extensions array, hardcoded `indentUnit` and `python()` locations [VERIFIED]
- `src/main.ts:2321-2403` — `switchFenceLanguage` full implementation [VERIFIED]
- `package.json` (this repo) — current deps, confirms lang packs present, autocomplete transitive [VERIFIED]
- npm registry — versions and publish dates for `@codemirror/lang-rust@6.0.2`, `@codemirror/legacy-modes@6.5.3`, `@codemirror/autocomplete@6.20.2` [VERIFIED: npm registry]
- `.planning/phases/16-language-packs-switching/16-CONTEXT.md` — locked decisions D-01..D-16 [VERIFIED]
- `.planning/REQUIREMENTS.md` — requirement IDs and current statuses [VERIFIED]
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Pitfall 5, Pitfall 11, Pitfall 14 [VERIFIED]

### Secondary (MEDIUM confidence)
- `@codemirror/lang-rust` GitHub `github.com/codemirror/lang-rust` — official CM6 org package
- `@codemirror/legacy-modes` repo `code.haverbeke.berlin/codemirror/legacy-modes` — CM6 author's forge
- Phase 13/14/15 CONTEXT.md files — established patterns for child editor extensions array, userEvent convention

### Tertiary (LOW confidence — see Assumptions Log)
- `closeBrackets()` languageData reading behavior (A1)
- `StreamLanguage` → CM6 `commentTokens` mapping for Go (A3)
- ENTER-04 split mechanism (A4)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry with official provenance
- Architecture: HIGH — directly derived from reading source files
- Pitfalls: MEDIUM — esbuild/CM6 interaction patterns based on existing code patterns + known CM6 design
- Behavioral (closeBrackets, toggleLineComment details): MEDIUM/ASSUMED — CM6 architecture is consistent but not Context7-verified this session

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (stable CM6 6.x; lang packs rarely have breaking changes)

---

## RESEARCH COMPLETE
