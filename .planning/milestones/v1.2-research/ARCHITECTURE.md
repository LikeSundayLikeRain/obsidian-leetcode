# Architecture: Zone-Scoped Code Editing Extensions in CM6 Markdown

**Domain:** CM6 editor extension architecture for scoped code-editing behavior within a fenced code block
**Researched:** 2026-05-21
**Overall Confidence:** HIGH (verified against CM6 official docs, existing codebase patterns, and runtime constraints)

---

## Executive Summary

The v1.2 "Code Editor Experience" milestone requires injecting code-editor behavior (auto-indent, bracket handling, Tab indent/dedent) into a specific line range (the fence body between opener and closer) of an Obsidian markdown document, while leaving the rest of the document in standard markdown editing mode. The architecture must coexist with the existing `sectionLockExtension` (changeFilter + transactionFilter) and the `codeActionsEditorExtension` (StateField + DecorationSet).

The recommended architecture uses **guarded keymaps** (command functions that check cursor position before acting) combined with a **Compartment** for dynamic language switching. This avoids the impossible path of replacing Obsidian's markdown language and instead layers behavior on top using CM6's composable extension model.

---

## Recommended Architecture

### High-Level Design

```
+-------------------------------------------------------------+
|                    Obsidian Editor (CM6)                     |
|  +-----------------------------------------------------+    |
|  |  Existing Extensions (registered via plugin)         |    |
|  |  +- codeActionsEditorExtension (StateField)         |    |
|  |  +- sectionLockExtension (changeFilter + txFilter)  |    |
|  |  +- NEW: codeEditingExtension (this milestone)      |    |
|  +-----------------------------------------------------+    |
|                                                             |
|  codeEditingExtension internals:                            |
|  +----------------------------------------------------------+
|  |  Compartment (language-specific config)               |   |
|  |  +- indentUnit facet (language-dependent)            |   |
|  |  +- closeBrackets config (code-mode vs markdown)     |   |
|  |  +- language-specific indent rules (heuristic)       |   |
|  |                                                       |   |
|  |  Prec.high keymap (zone-guarded commands)            |   |
|  |  +- Tab -> indentMore (if in fence body)             |   |
|  |  +- Shift-Tab -> indentLess (if in fence body)       |   |
|  |  +- Enter -> smartNewline (if in fence body)         |   |
|  |  +- } / ) -> dedentOnClose (if in fence body)       |   |
|  |                                                       |   |
|  |  inputHandler (bracket suppression in fence)         |   |
|  |  +- Suppress markdown pairs (* _ ~) in fence body   |   |
|  |  +- Allow code pairs ({ [ ( " ') in fence body      |   |
|  +----------------------------------------------------------+
+-------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `fenceZoneDetector` (pure helper) | Determine if a cursor position is inside the editable fence body | All guarded commands; reuses `findCodeFence` from `codeActionsEditorExtension.ts` |
| `codeEditingKeymap` | Zone-guarded keymap bindings for Tab, Enter, brackets | `fenceZoneDetector`, `@codemirror/commands` indent functions |
| `codeBracketHandler` | inputHandler that suppresses markdown bracket pairs inside fence | `fenceZoneDetector` |
| `languageCompartment` | Compartment holding language-specific config (indent unit, indent rules) | `languageRefreshEffect` (existing), chevron switch path |
| `indentRulesProvider` | Per-language indent heuristics (when to indent after `{`, `:`, etc.) | `languageCompartment` contents |
| `buildCodeEditingExtension()` | Factory composing all above into a single Extension array | `src/main.ts` registration via `registerEditorExtension` |

### Data Flow

```
User keystroke
    |
    +---> sectionLockExtension.changeFilter
    |     (Gate 0: only fires on user-input userEvents)
    |     (Gate 1: leetcode.* bypass)
    |     (Gate 2-3: file + lc-slug gates)
    |     (Gate 4: suppress if change touches locked range)
    |     |
    |     +---> If ALLOWED (fence body is editable) -> change proceeds
    |
    +---> codeEditingKeymap (Prec.high)
    |     Tab pressed?
    |       -> isCursorInFenceBody(state)?
    |         YES -> indentMore(view); return true
    |         NO  -> return false (fall through to Obsidian default)
    |
    +---> codeBracketHandler (EditorView.inputHandler)
    |     User typed `*` or `_`?
    |       -> isCursorInFenceBody(state)?
    |         YES -> insert literal char, return true (suppress md pair)
    |         NO  -> return false (let markdown handle it)
    |
    +---> Obsidian's default markdown keymap (lower precedence)
          Handles everything outside the fence body normally
```

---

## Question-by-Question Analysis

### Q1: CM6 Primitives for Scoping Keybindings to a Line Range

**Answer:** CM6 does NOT have a built-in "scope extension to line range" primitive. The correct pattern is **guarded commands** -- keymap bindings where the `run` function checks cursor position and returns `false` (fall-through) when the cursor is outside the target zone.

```typescript
import { keymap } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';
import { Prec } from '@codemirror/state';

// Guard: returns true if cursor head is inside the fence body
function isCursorInFenceBody(state: EditorState): boolean {
  const fence = findCodeFence(state);
  if (!fence) return false;
  const head = state.selection.main.head;
  const bodyStart = state.doc.line(fence.openerLine).to + 1; // after opener \n
  const bodyEnd = state.doc.line(fence.closerLine).from;     // before closer
  return head >= bodyStart && head < bodyEnd;
}

const codeEditingKeymap = Prec.high(keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      if (!isCursorInFenceBody(view.state)) return false;
      return indentMore(view);
    },
    shift: (view) => {
      if (!isCursorInFenceBody(view.state)) return false;
      return indentLess(view);
    },
  },
]));
```

**Confidence:** HIGH -- verified against CM6 docs. The `keymap` facet's command protocol (return `true` = handled, `false` = pass to next) is the canonical scoping mechanism.

**Available primitives for zone-scoping:**
1. **`keymap` with guarded commands** -- Primary mechanism. Command returns `false` to pass through.
2. **`EditorView.inputHandler`** -- For intercepting text input (typed characters). Can check position and return `false` to delegate.
3. **`EditorState.transactionFilter`** -- For inspecting/modifying transactions after they form. Can rewrite based on position.
4. **`EditorState.changeFilter`** -- Already used by sectionLock. Returns suppressed ranges.
5. **`Prec.*` precedence wrappers** -- Control which extension gets first crack at a key.

There is NO equivalent to VSCode's `editorTextFocus && editorLangId == 'java'` `when` clause -- all scoping must be imperative in the command body.

### Q2: TransactionFilter/Keymap Interaction with sectionLockExtension

**Answer:** The section lock and the new code editing extension operate at different layers and are complementary, not conflicting.

**Interaction model:**
```
Keystroke arrives
  1. keymap handlers fire (highest Prec first)
     -> codeEditingKeymap (Prec.high) checks zone, dispatches indent/newline
     -> If handled (returns true), CM6 creates a transaction from the dispatch
  2. Transaction passes through changeFilter
     -> sectionLockExtension checks if changes touch locked ranges
     -> Fence BODY is NOT locked -> changes pass through
  3. Transaction passes through transactionFilter
     -> sectionLockExtension snaps cursor if it landed in a locked range
     -> Code editing dispatches land IN the fence body -> no snap needed
```

**Key insight:** The section lock's changeFilter only suppresses changes to **locked** ranges. The fence body (between opener+1 and closer-1) is explicitly **unlocked** in `computeLockedRanges()`. Therefore, any change dispatched by the code editing extension that targets the fence body will pass the changeFilter without issue.

**One critical rule:** If the code editing extension ever needs to modify the fence opener or closer (it should not, but hypothetically), it must use the `userEvent: 'leetcode.*'` annotation to bypass the lock. For normal indent/dedent/newline operations within the body, no bypass is needed.

**No modifications to `sectionLockExtension.ts` are required.**

### Q3: EditorView.inputHandler vs keymap Facet with Range-Check Guards

**Answer:** Use BOTH, for different purposes.

| Mechanism | Best For | Zone Check Cost | Integration |
|-----------|----------|-----------------|-------------|
| `keymap` (Prec.high) | Tab, Shift-Tab, Enter (specific keys with code-editor semantics) | Per-keypress of bound key only | Returns `false` to fall through to Obsidian defaults |
| `EditorView.inputHandler` | Typed characters that need markdown-pair suppression (`*`, `_`, `~`) or code-pair insertion (`{`, `(`, `[`) | Per typed character | Returns `true` to suppress default handling |

**Why not just keymap for everything?**
- `keymap` binds to specific key combos. You cannot bind "any printable character" to a keymap entry.
- `inputHandler` intercepts ALL text input (the `beforeinput` DOM event) and lets you decide per-character.

**Why not just inputHandler for everything?**
- `inputHandler` only fires for text insertion, not for keys like Tab, Shift-Tab, Enter, Backspace.
- Tab/Enter need `keymap` because they are control keys, not text input.

**Recommended split:**
```typescript
// keymap: control keys with code-editing semantics
keymap.of([
  { key: 'Tab', run: guardedIndentMore, shift: guardedIndentLess },
  { key: 'Enter', run: guardedSmartNewline },
  { key: 'Backspace', run: guardedDeleteBracketPair },
])

// inputHandler: character-level markdown suppression
EditorView.inputHandler.of((view, from, to, text) => {
  if (!isCursorInFenceBody(view.state)) return false;
  // Suppress markdown auto-pairs for * _ ~ inside code fence
  if ('*_~'.includes(text)) {
    // Insert literal character without triggering markdown pair
    view.dispatch({ changes: { from, to, insert: text } });
    return true;
  }
  return false; // Let closeBrackets handle { ( [ etc.
});
```

### Q4: Detecting "Cursor Inside Code Fence Body" Efficiently (Per-Keystroke)

**Answer:** Reuse `findCodeFence(state)` from `codeActionsEditorExtension.ts` -- it is already the SSoT for fence detection. The function scans for `## Code` heading + first fence opener/closer. Cost: O(n) where n = number of lines.

**Performance analysis:**
- Typical LC problem note: 50-150 lines. `findCodeFence` scans at most once per transaction.
- CM6 keymap commands only fire for their bound keys (Tab, Enter, etc.) -- not every keystroke.
- `inputHandler` fires per character typed, but only when actually typing (not cursor movement).
- At 150 lines, a linear scan is microseconds. No caching needed.

**Optimization path (if needed later, but NOT recommended for v1.2):**
A `StateField<{openerLine: number, closerLine: number} | null>` could cache the fence position and rebuild only on `tr.docChanged`. But this adds complexity and the linear scan is already negligible for the note sizes involved.

**Recommended helper:**
```typescript
// src/main/fenceZoneDetector.ts
import { findCodeFence } from './codeActionsEditorExtension';
import type { EditorState } from '@codemirror/state';

/**
 * Returns true if the primary cursor head is inside the editable fence body
 * (between opener line's end and closer line's start).
 *
 * O(lines) per call via findCodeFence. Acceptable for per-keypress use
 * on notes under 200 lines (typical LC note size).
 */
export function isCursorInFenceBody(state: EditorState): boolean {
  const fence = findCodeFence(state);
  if (!fence) return false;
  const head = state.selection.main.head;
  // Body starts after the opener line's newline
  const bodyStart = state.doc.line(fence.openerLine).to + 1;
  // Body ends before the closer line begins
  const bodyEnd = state.doc.line(fence.closerLine).from;
  return head >= bodyStart && head < bodyEnd;
}

/**
 * Returns the fence body range { from, to } or null.
 * Used by indent commands that need to know the bounds.
 */
export function getFenceBodyRange(state: EditorState): { from: number; to: number } | null {
  const fence = findCodeFence(state);
  if (!fence) return null;
  return {
    from: state.doc.line(fence.openerLine).to + 1,
    to: state.doc.line(fence.closerLine).from,
  };
}
```

**Why NOT use `syntaxTree` / `languageDataAt`?**
Obsidian's markdown parser DOES create `FencedCode` nodes in the syntax tree, and within those, nested language trees are mounted. However:
1. The syntax tree may be **partially parsed** (CM6 parses lazily/incrementally) -- the node may not exist yet when the user types fast.
2. `findCodeFence` is already the SSoT used by the lock extension. Using a different detection mechanism creates a divergence risk.
3. The syntax tree approach would need to handle the case where the nested language tree isn't yet mounted (first keystroke after opening a file).

Sticking with `findCodeFence` maintains the SSoT invariant established in Phase 5.

### Q5: Extension Ordering -- Code-Editing Extensions vs Section Lock

**Answer:** Register the code editing extension **BEFORE** the section lock.

**Rationale:**
```typescript
// src/main.ts onload()
this.registerEditorExtension(buildCodeActionsEditorExtension(this));  // existing
this.registerEditorExtension(buildCodeEditingExtension(this));        // NEW (before lock)
this.registerEditorExtension(buildSectionLockExtension(this));        // existing (last)
```

**Why this order matters:**

1. **For keymaps:** Precedence is controlled by `Prec.high/highest`, not registration order. The code editing keymap should use `Prec.high` to win over Obsidian's default markdown keybindings (which are at default precedence). Registration order within the same Prec level follows array position -- earlier = higher priority. Registering before the lock means our keymap processes first within the same precedence bucket.

2. **For changeFilter:** CM6 evaluates ALL changeFilter providers and intersects their results. The section lock's changeFilter returns suppressed ranges. The code editing extension does NOT add a changeFilter (it uses keymap + inputHandler). So order between them for filtering is irrelevant.

3. **For transactionFilter:** The section lock's transactionFilter snaps cursors OUT of locked ranges. If the code editing extension dispatches a transaction that places the cursor in the fence body (an unlocked range), the snap filter will not interfere. No ordering concern.

**The `Prec.high` wrapper on the keymap is the critical ordering mechanism**, not the registration order. But registering before the lock keeps the conceptual layering clean: "editing behaviors first, enforcement last."

### Q6: Language-Switching (Java to Python) Without Re-registering Extensions

**Answer:** Use a **Compartment** to hold the language-specific configuration. When the user switches language via the chevron, dispatch a `Compartment.reconfigure()` effect.

**Architecture:**
```typescript
import { Compartment } from '@codemirror/state';

// Created once per editor extension registration
const langConfigCompartment = new Compartment();

// Language-specific config varies by slug
function getLangConfig(langSlug: string): Extension {
  return [
    // Indent unit: Python uses 4 spaces, Java/C++ use 4 spaces (or tab)
    EditorState.tabSize.of(getTabSize(langSlug)),
    indentUnit.of(getIndentUnit(langSlug)),
    // Language-specific indent heuristics (see indentRulesProvider)
    buildIndentRules(langSlug),
  ];
}

// Initial: use whatever lc-language says (or default)
const extension = langConfigCompartment.of(getLangConfig(currentLangSlug));

// On language switch (triggered by chevron or languageRefreshEffect):
function reconfigureLanguage(view: EditorView, newSlug: string) {
  view.dispatch({
    effects: langConfigCompartment.reconfigure(getLangConfig(newSlug)),
  });
}
```

**Integration with existing `languageRefreshEffect`:**
The `codeActionsEditorExtension` already dispatches `languageRefreshEffect` when `lc-language` changes. The code editing extension can listen for the same effect in a StateField or transactionExtender and trigger the Compartment reconfigure.

Alternatively (simpler): subscribe to `metadataCache.on('changed')` the same way `codeActionsEditorExtension` does, and dispatch the reconfigure effect when `lc-language` changes. This keeps the two extensions independent.

**What changes per language:**
| Config | Python | Java | C++ | JavaScript/TypeScript | Go | Rust |
|--------|--------|------|-----|----------------------|-----|------|
| Indent unit | 4 spaces | 4 spaces | 4 spaces (or 2) | 2 spaces | tab | 4 spaces |
| Tab size | 4 | 4 | 4 | 2 | 4 | 4 |
| Indent after | `:`, `(`, `[` | `{`, `(`, `[` | `{`, `(`, `[` | `{`, `(`, `[` | `{`, `(` | `{`, `(`, `[` |
| Dedent on | (next non-empty) | `}` | `}` | `}` | `}` | `}` |
| Comment token | `#` | `//` | `//` | `//` | `//` | `//` |

### Q7: Should We Use Compartments for Dynamic Reconfiguration?

**Answer:** YES. Compartments are the canonical CM6 mechanism for this exact use case.

**Why Compartments (not re-registering):**
1. `plugin.registerEditorExtension()` is append-only -- Obsidian provides no `unregisterEditorExtension()` or replace API.
2. Even if we could remove/re-add, that would destroy and rebuild all StateFields, losing editor state.
3. Compartments are designed for "config that changes at runtime" -- the CM6 docs use language switching as the primary Compartment example.
4. Compartment reconfiguration is a single-transaction operation: `view.dispatch({ effects: compartment.reconfigure(newExtension) })`. The editor state transitions atomically.

**Compartment scope:**
```
buildCodeEditingExtension() returns:
[
  langConfigCompartment.of(getLangConfig(initialSlug)),  // Dynamic via Compartment
  Prec.high(codeEditingKeymap),                          // Static (zone guards handle lang differences)
  codeBracketInputHandler,                               // Static (zone guard + per-char logic)
  languageRefreshListener,                               // Listens for effect -> reconfigures compartment
]
```

The keymap itself is **static** -- it does not change when language switches. The guarded commands internally read the current language config from the Compartment's facet values (e.g., `state.facet(indentUnit)`) to determine indent size. Only the Compartment's contents swap.

---

## Patterns to Follow

### Pattern 1: Guarded Command (Zone-Scoped Key Handler)

**What:** A keymap command that checks cursor position before acting, returning `false` to delegate to lower-precedence handlers when outside the zone.

**When:** Any key that should behave differently inside the code fence vs. the rest of the markdown document.

**Example:**
```typescript
import { indentMore } from '@codemirror/commands';
import { type Command } from '@codemirror/view';

const guardedIndentMore: Command = (view) => {
  if (!isCursorInFenceBody(view.state)) return false;
  return indentMore(view);
};
```

### Pattern 2: Compartment for Language-Dependent Config

**What:** A Compartment wrapping all config that varies by programming language, reconfigured on language switch.

**When:** The user changes language via the chevron widget. The Compartment's contents swap atomically.

**Example:**
```typescript
const langCompartment = new Compartment();

function buildForLanguage(slug: string): Extension {
  return [
    indentUnit.of(slug === 'golang' ? '\t' : '    '),
    EditorState.tabSize.of(4),
    // Language-specific indent heuristics StateField or facet
  ];
}

// On switch:
view.dispatch({
  effects: langCompartment.reconfigure(buildForLanguage(newSlug)),
});
```

### Pattern 3: inputHandler for Character-Level Override

**What:** Use `EditorView.inputHandler` to intercept typed characters that conflict between markdown and code modes.

**When:** Characters like `*`, `_`, `~` that markdown auto-pairs but code should treat as literal operators.

**Example:**
```typescript
EditorView.inputHandler.of((view, from, to, text) => {
  if (!isCursorInFenceBody(view.state)) return false;
  if (MARKDOWN_PAIR_CHARS.has(text)) {
    // Insert literal, suppress markdown auto-pair
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    return true;
  }
  return false;
});
```

### Pattern 4: Heuristic Indentation (No Parse Tree Dependency)

**What:** Language-aware auto-indent based on the previous line's content (trailing `{`, `:`, `(`) rather than the syntax tree.

**When:** After Enter is pressed inside the fence body. We cannot rely on the nested language's parse tree being fully built (CM6 lazy parsing).

**Example:**
```typescript
function computeIndentAfterEnter(
  state: EditorState,
  pos: number,
  langSlug: string,
): string {
  const line = state.doc.lineAt(pos);
  const trimmed = line.text.trimEnd();
  const currentIndent = line.text.match(/^\s*/)?.[0] ?? '';
  const unit = state.facet(indentUnit);

  // Brace-based languages: indent after { ( [
  if (/[{(\[]$/.test(trimmed)) {
    return currentIndent + unit;
  }
  // Python: indent after :
  if (langSlug === 'python3' && /:\s*(#.*)?$/.test(trimmed)) {
    return currentIndent + unit;
  }
  return currentIndent;
}
```

### Pattern 5: lc-slug Gate (Consistent with Existing Extensions)

**What:** Only activate code-editing behaviors on notes with `lc-slug` frontmatter.

**When:** Every guarded command and inputHandler should include this gate to avoid affecting non-LC notes.

**Example:**
```typescript
function isLcSlugNote(state: EditorState, plugin: Plugin): boolean {
  const file = state.field(editorInfoField)?.file;
  if (!file) return false;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  return typeof slug === 'string' && slug.length > 0;
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Replacing Obsidian's Markdown Language

**What:** Attempting to inject a custom Language or override the editor's primary language with a code language for the fence region.

**Why bad:** Obsidian's CM6 instance is configured internally. Plugins cannot access the state's language configuration. Even if possible, replacing the markdown language would break all other markdown behavior (headings, lists, links, etc.).

**Instead:** Layer behavior on top using keymaps + inputHandler. Accept that the editor is "markdown mode with code-editor keybindings active in a zone."

### Anti-Pattern 2: Using `indentOnInput` Globally

**What:** Registering `indentOnInput()` from `@codemirror/language` as a global extension.

**Why bad:** `indentOnInput` relies on the language's indentation computation from the syntax tree. In a markdown document, the syntax tree says "you're in a fenced code block" -- but the indentation rules it computes are for markdown (if any), not for the nested language. Also, it would fire for ALL typed characters everywhere in the document, trying to re-indent markdown headings/lists.

**Instead:** Implement a custom transactionExtender or keymap-triggered indent that only fires for the fence body and uses heuristic rules rather than the markdown syntax tree.

### Anti-Pattern 3: Dispatching with userEvent That Triggers the Lock

**What:** Dispatching changes from the code editing extension with `userEvent: 'input.type'` or `'input.paste'`.

**Why bad:** The section lock's changeFilter (Gate 0) fires on `input.*` and `delete.*` userEvents. If the code editing extension dispatches a transaction with these userEvents targeting a locked range (e.g., accidentally targeting the fence opener), the lock will suppress the change silently.

**Instead:** Code editing commands dispatch to the fence BODY (unlocked range) -- no conflict. If edge cases arise, use `userEvent: 'leetcode.indent'` to bypass. But design commands to never touch locked ranges.

### Anti-Pattern 4: Caching Fence Position in a StateField

**What:** Creating a StateField to cache `findCodeFence()` results for "performance."

**Why bad:** Adds complexity for negligible gain. `findCodeFence` is O(lines) on ~100-line documents -- microseconds. A StateField must handle all edge cases (doc changes that move the fence, fence deletion, fence creation). The caching logic is harder to get right than the scan itself.

**Instead:** Call `findCodeFence(state)` directly in each guarded command. It's pure and cheap.

### Anti-Pattern 5: Bundling `@codemirror/lang-*` as Full Language Support Extensions

**What:** Installing full `LanguageSupport` extensions (e.g., `javascript()`, `python()`) from the `@codemirror/lang-*` packages to get their indentation.

**Why bad:** These packages provide a full language stack (parser, highlighter, completions). Installing them as extensions would conflict with Obsidian's own markdown language. They would try to parse the ENTIRE document as Java/Python, not just the fence body.

**Instead:** The `@codemirror/lang-*` packages are already bundled (in `dependencies`) -- but use them ONLY if extracting indent metadata, not as active Language extensions. Or better: implement heuristic indent rules that do not depend on a parse tree at all.

---

## Integration Points with Existing Architecture

### Integration Point 1: `findCodeFence` (SSoT Reuse)

| Aspect | Detail |
|--------|--------|
| **Source** | `src/main/codeActionsEditorExtension.ts` (exported) |
| **Used by** | sectionLockExtension, codeActionsEditorExtension, NEW: fenceZoneDetector |
| **Contract** | Returns `{openerLine, closerLine}` or `null` |
| **No modification needed** | Function is pure; safe to call from new extension |

### Integration Point 2: `languageRefreshEffect` (Language Switch Signal)

| Aspect | Detail |
|--------|--------|
| **Source** | `src/main/codeActionsEditorExtension.ts` (exported StateEffect) |
| **Fired by** | metadataCache 'changed' listener in codeActionsEditorExtension |
| **Carries** | `string | undefined` (new lc-language slug or undefined) |
| **New consumer** | Code editing extension listens for this effect to reconfigure Compartment |

### Integration Point 3: `sectionLockExtension` (Coexistence)

| Aspect | Detail |
|--------|--------|
| **Lock boundaries** | Fence opener + closer are LOCKED; body between is UNLOCKED |
| **Code editing target** | Always the unlocked body -- no bypass needed |
| **userEvent convention** | Code editing dispatches SHOULD use `userEvent: 'leetcode.indent'` etc. for safety, even though body changes would pass anyway |
| **No modification needed** | Section lock's filter naturally allows fence-body changes |

### Integration Point 4: `switchFenceLanguage` (Language Change Trigger)

| Aspect | Detail |
|--------|--------|
| **Source** | `src/main.ts:2302` |
| **Current behavior** | Rewrites fence opener tag + body content |
| **New responsibility** | After rewriting, must also trigger Compartment reconfigure |
| **Implementation** | Dispatch `languageRefreshEffect` (already happens via metadataCache 'changed' listener) -- the code editing extension picks it up |

### Integration Point 5: Extension Registration Order in `src/main.ts`

```typescript
// Step 6f -- code actions (decorations)
this.registerEditorExtension(buildCodeActionsEditorExtension(this));

// Step 6f-bis-a -- NEW: code editing behaviors (keymap + inputHandler + compartment)
this.registerEditorExtension(buildCodeEditingExtension(this));

// Step 6f-bis -- section lock (changeFilter + transactionFilter)
this.registerEditorExtension(buildSectionLockExtension(this));
```

---

## New Components to Create

| File | Type | Purpose |
|------|------|---------|
| `src/main/fenceZoneDetector.ts` | Pure helper module | `isCursorInFenceBody()`, `getFenceBodyRange()`, `isLcSlugNote()` -- thin wrappers around `findCodeFence` + frontmatter check |
| `src/main/codeEditingExtension.ts` | Extension factory | `buildCodeEditingExtension(plugin)` -- composes keymap, inputHandler, Compartment, refresh listener |
| `src/main/codeIndentRules.ts` | Pure logic | Per-language heuristic indent rules (what triggers indent/dedent per language) |
| `src/main/codeBracketRules.ts` | Pure logic | Bracket pair definitions per language; markdown-char suppression set |

## Existing Components to Modify

| File | Change | Reason |
|------|--------|--------|
| `src/main.ts` (onload) | Add `registerEditorExtension(buildCodeEditingExtension(this))` call | Registration of new extension |
| `src/main/codeActionsEditorExtension.ts` | None | `findCodeFence` already exported; `languageRefreshEffect` already exported |
| `src/main/sectionLockExtension.ts` | None | No changes needed; fence body is already unlocked |

---

## Suggested Build Order

Based on dependencies between components:

### Phase 1: Foundation (no UI-visible behavior yet)
1. **`fenceZoneDetector.ts`** -- Pure helper. Depends only on `findCodeFence` (already exists). Unit-testable immediately.
2. **`codeIndentRules.ts`** -- Pure data + logic. Language-to-indent-config mapping. Unit-testable.
3. **`codeBracketRules.ts`** -- Pure data. Markdown chars to suppress, code pairs per language. Unit-testable.

### Phase 2: Core Extension (Tab/Shift-Tab)
4. **`codeEditingExtension.ts`** (skeleton) -- Compartment setup + guarded Tab/Shift-Tab keymap. This gives immediate value: Tab indents in fence.
5. **Registration in `main.ts`** -- Wire `buildCodeEditingExtension(this)` between code actions and section lock.

### Phase 3: Smart Enter
6. **Smart newline command** -- Enter in fence body -> compute indent from previous line -> insert newline + indent. Handles `{`/`:` indent triggers.
7. **Brace completion on Enter** -- Enter between `{|}` -> newline + indent + newline + dedent + `}`.

### Phase 4: Bracket Handling
8. **inputHandler for markdown suppression** -- Suppress `*_~` auto-pairs inside fence.
9. **Code bracket closing** -- `{` -> `{}` with cursor between, `(` -> `()`, etc. Only in fence.

### Phase 5: Language Switching
10. **Compartment reconfigure on `languageRefreshEffect`** -- Subscribe to the existing effect and swap indent/bracket config.
11. **Per-language indent rules** -- Python `:` dedent, Go `tab` indent unit, etc.

**Rationale:** Each phase delivers testable, shippable behavior. Phase 2 alone (Tab/Shift-Tab) resolves the most common user complaint. Phase 3 (smart Enter) is the next highest-value. Phase 4 and 5 are polish.

---

## Scalability Considerations

| Concern | Current (v1.2) | Future (if needed) |
|---------|----------------|-------------------|
| Fence detection cost | O(lines) per keystroke, ~100 lines | Cache in StateField if notes grow past 500 lines |
| Language count | 8 languages (Python, Java, C++, C, JS, TS, Go, Rust) | Add indent configs to `codeIndentRules.ts` for new languages |
| Multiple code blocks | Only first fence under `## Code` (SSoT from `findCodeFence`) | N/A -- LC note template has exactly one code fence |
| Extension registration | Static (registered once on plugin load) | Compartment handles runtime changes without re-registration |

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Guarded commands over zone-scoped extensions | CM6 has no built-in zone-scoping; guard pattern is idiomatic |
| Heuristic indent over syntax-tree indent | Cannot rely on nested parse tree being ready; previous-line heuristics are reliable and simple |
| Compartment for language config | Canonical CM6 pattern; only mechanism since `registerEditorExtension` is append-only |
| `Prec.high` for code keymap | Must beat Obsidian's default markdown keybindings (Tab = list indent in markdown) |
| Reuse `findCodeFence` SSoT | Avoids divergence with section lock; proven reliable across 1,450 tests |
| inputHandler for character suppression | Only mechanism to intercept arbitrary typed chars; keymap cannot bind "any char" |
| No modification to sectionLock | Fence body is already unlocked; clean separation of concerns |
| Register before section lock | Logical layering: behaviors first, enforcement last |

---

## Sources

- CM6 official docs: Compartment dynamic reconfiguration example (codemirror.net/examples/config) -- HIGH confidence
- CM6 official docs: keymap facet, command protocol (return true/false) -- HIGH confidence
- CM6 official docs: Prec.high/highest for extension precedence -- HIGH confidence
- CM6 official docs: EditorView.inputHandler for text input interception -- HIGH confidence
- CM6 official docs: indentWithTab, indentMore, indentLess from @codemirror/commands -- HIGH confidence
- CM6 official docs: indentService, indentUnit, indentOnInput from @codemirror/language -- HIGH confidence
- CM6 official docs: closeBrackets, closeBracketsKeymap, deleteBracketPair -- HIGH confidence
- CM6 official docs: Tab handling accessibility (escape hatch via Escape key) -- HIGH confidence
- Existing codebase: `sectionLockExtension.ts` -- changeFilter + transactionFilter architecture (direct code read)
- Existing codebase: `codeActionsEditorExtension.ts` -- `findCodeFence` SSoT, `languageRefreshEffect` (direct code read)
- Existing codebase: `src/main.ts` -- extension registration order, `switchFenceLanguage` dispatch pattern (direct code read)
- Existing codebase: `esbuild.config.mjs` -- `@codemirror/commands` and `@codemirror/language` are external (runtime-provided by Obsidian)
- Existing codebase: `package.json` -- `@codemirror/lang-*` packages are bundled dependencies
- CLAUDE.md project conventions: `'leetcode.*'` userEvent bypass, `vault.process` not `cm.dispatch` for vault writes
