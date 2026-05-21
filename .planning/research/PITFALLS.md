# Pitfalls Research — v1.2 (Code Editor Experience in Fenced Blocks)

**Domain:** Adding code-editing features (auto-indentation, bracket closing, Tab indent/dedent) to a zone within a CM6 markdown document in an Obsidian plugin
**Researched:** 2026-05-21
**Confidence:** HIGH (CM6 official docs via Context7, Obsidian Developer Docs, existing codebase analysis of `sectionLockExtension.ts` and `codeActionsEditorExtension.ts`)

---

> **Scope note.** This document covers v1.2 milestone pitfalls only — specifically the interaction between code-editing features and the existing section lock, Obsidian's markdown mode, and CM6's extension system. v1.0/v1.1 pitfalls (CORS, streaming, AI provider, contest timer, etc.) are archived in milestone-specific research. When a v1.2 feature touches an existing convention (section lock, `'leetcode.*'` userEvent, `findCodeFence`), it surfaces here as a regression risk.

---

## Critical Pitfalls

### Pitfall 1: Tab Key Conflict — Obsidian's Markdown List Indent vs Code Indent

**What goes wrong:**
You register `indentWithTab` (from `@codemirror/commands`) globally via `registerEditorExtension`. Now Tab inside fenced code correctly indents — but Tab at any bullet point in `## Notes`, any markdown list in the user's other vault notes, and any list in `## Problem` also fires `indentMore` instead of Obsidian's native markdown list indent behavior. Obsidian uses Tab to increase list nesting level (a different operation than inserting indentation characters). The plugin has broken every markdown note in the vault.

**Why it happens:**
CM6 keymaps registered via `registerEditorExtension` are **global to the editor instance** — they apply to the entire document, not just to a region. There is no built-in CM6 mechanism to scope a keymap to a document range. The `keymap` facet resolves by precedence order: the first handler that returns `true` wins. If `indentWithTab` returns `true` unconditionally, Obsidian's own Tab handler never fires.

**Consequences:**
- Every markdown list in the vault loses native Tab indent behavior
- Obsidian's outline/fold commands that rely on Tab may break
- Users who have Tab for accessibility (focus trap escape) lose that path
- Plugin review may flag this as "overriding core editor behavior"

**Prevention:**
- **Never register `indentWithTab` directly.** Instead, write a custom Tab keymap handler that:
  1. Checks if the cursor is inside the code fence (using `findCodeFence(view.state)`)
  2. If YES: call `indentMore(view)` / `indentLess(view)` and return `true`
  3. If NO: return `false` (fall through to Obsidian's native handler)
- Use `Prec.high(keymap.of([...]))` to ensure the fence-scoped Tab handler runs BEFORE Obsidian's default Tab handler, but still returns `false` when outside the fence so Obsidian handles it.
- The command signature is `(view: EditorView) => boolean` — returning `false` means "I didn't handle this, try the next handler."

**Detection (warning signs):**
- Tab in `## Notes` section inserts spaces instead of nesting a list
- Tab in a non-LC note inserts raw indentation instead of markdown list indent
- User reports "Tab stopped working normally in all my notes"

**Phase to address:** Phase 01 (Tab/Shift-Tab handling) — the very first implementation must be zone-scoped. Never start with global `indentWithTab` and "fix it later."

---

### Pitfall 2: closeBrackets Conflict — Markdown Auto-Pairs vs Code Auto-Pairs

**What goes wrong:**
Obsidian's markdown mode (likely via its own `closeBrackets` configuration or `languageData`) auto-closes markdown-specific pairs: `*` → `**`, `_` → `__`, `` ` `` → ` `` ` `. You add `closeBrackets()` from `@codemirror/autocomplete` for code-style bracket closing (`{` → `{}`, `(` → `()`, `[` → `[]`). Now:
- Inside fences: typing `*` produces `**` (wrong — `*` is multiplication in code, not emphasis)
- Inside fences: typing `` ` `` produces ` `` ` ` (wrong — backtick in code is not markdown inline code)
- Outside fences: duplicate bracket behavior from having two `closeBrackets` extensions active

**Why it happens:**
CM6's `closeBrackets` reads its pair configuration from `languageData` at the cursor position. In a markdown document, the top-level language is markdown, and its `languageData` includes markdown-specific `closeBrackets` configuration (pairs like `*`, `_`, `` ` ``). CM6 uses `EditorState.languageDataAt(name, pos)` to resolve language data at a position — but this depends on the **syntax tree** correctly identifying the cursor as being inside a code block's inner language. If Obsidian's markdown parser doesn't nest a sub-language inside fenced blocks (or nests only for highlighting, not for `languageData`), the position still resolves to markdown's `closeBrackets` config.

**Consequences:**
- Typing `*` inside a Java/Python code fence auto-closes as `**` (markdown emphasis)
- Typing backtick inside code fence creates inline code markers
- Users cannot type `*` for pointer dereference (C/C++), multiplication, or spread operator without fighting the auto-close

**Prevention:**
- **Do NOT add a global `closeBrackets()` extension.** Instead, write a custom `inputHandler` (via `EditorView.inputHandler.of(...)`) that intercepts bracket characters ONLY when the cursor is inside the code fence:
  1. On input of `{`, `(`, `[`, `"`, `'`: check if cursor is in fence → if yes, insert the closing pair manually via `view.dispatch`; return `true` (handled)
  2. On input of `*`, `_`, `` ` ``: check if cursor is in fence → if yes, return `false` WITHOUT auto-closing (let the character insert as-is, suppressing markdown's auto-close by consuming the event first)
  3. Outside fence: return `false` (let Obsidian handle normally)
- Alternative approach: use a `transactionFilter` that detects when `closeBrackets`-originated insertions happen inside the fence and rewrites them. But this is fragile — better to intercept at the input level.
- The cleanest architecture: a custom `closeBrackets`-like extension that only activates within `[fenceOpenerLine+1, fenceCloserLine-1]` range.
- **Critical:** Obsidian may already have its own `closeBrackets` registered. You cannot remove it. You can only pre-empt it with higher precedence for positions inside the fence.

**Detection (warning signs):**
- Typing `*` in a Python code fence produces `**` cursor placement (markdown emphasis behavior)
- Typing `{` outside the fence produces `{}` (code behavior leaking into markdown)
- Backspace after auto-close deletes only one bracket (pair-delete not working)

**Phase to address:** Phase 02 (bracket handling) — must research Obsidian's existing `closeBrackets` behavior before implementing. Test what Obsidian does by default in a vanilla fenced code block.

---

### Pitfall 3: indentOnInput Fires Globally — Dedent on `}` Rewrites Markdown

**What goes wrong:**
You register `indentOnInput()` from `@codemirror/language` to get auto-dedent when the user types `}` at the start of a line (matching Java/C++ indent style). `indentOnInput` checks the language's indent rules and re-indents the current line when a trigger character is typed. In a markdown document without a nested language providing indent rules, `indentOnInput` either:
- Does nothing (no indent rules for markdown nodes) — wasted overhead
- Applies unexpected indentation to markdown content if any indent rule accidentally matches
- Crashes or errors when trying to walk a syntax tree that doesn't have the expected node types

Worse: even if you only want it inside fences, `indentOnInput` has no positional scoping. It is a global extension that fires on every keystroke matching its trigger pattern.

**Why it happens:**
`indentOnInput` works by consulting `getIndentation` from the language's syntax tree. In Obsidian's markdown mode, the syntax tree for content inside a fenced code block may be:
1. A nested language tree (if Obsidian configures `parseMixed` for the fence language) — in which case `indentOnInput` might work BUT relies on that nested language having `indentNodeProp` configured
2. Opaque "FencedCode" content (no nested parse tree) — in which case `getIndentation` returns null and `indentOnInput` is a no-op but still runs on every keystroke

The problem is that `indentOnInput` has no way to know it should only operate inside the fence. It checks the language at the cursor position via the syntax tree — if the tree is wrong (or markdown-level), it may fire inappropriate reindentation.

**Consequences:**
- Typing `}` at the start of a markdown line may unexpectedly remove indentation
- Performance overhead from running tree queries on every keystroke document-wide
- If Obsidian's nested language parse is incomplete or absent, indentation does nothing useful inside the fence either

**Prevention:**
- **Do NOT use `indentOnInput()` globally.** Instead, implement a custom `inputHandler` or keymap that:
  1. Detects when a trigger character (`}`, `)`, `]`) is typed
  2. Checks if the cursor is inside the code fence
  3. If yes: compute the desired indentation using a simple rule engine (match opening brace on the same nesting level; dedent one level) and dispatch the reindentation
  4. If no: return `false` (let normal markdown behavior proceed)
- For the indentation engine: **do not depend on Obsidian's syntax tree.** Obsidian may or may not provide a nested language tree inside fences. Instead, implement a simple brace-counting indentation algorithm:
  - On Enter after `{`: indent one level
  - On `}` at line start: dedent one level
  - Track nesting by counting `{`/`}` from fence opener to cursor
- This approach is language-generic and works for Java, Python (`:`-based), TypeScript, Go, etc. without needing a per-language parser.

**Detection (warning signs):**
- Typing `}` in markdown body (outside fence) causes unexpected line reindentation
- `console.warn` or error from `getIndentation` because no language data found at position
- Performance profile shows syntax-tree walks on every keystroke in long documents

**Phase to address:** Phase 03 (auto-indentation on Enter/brace) — implement custom indentation engine rather than relying on `indentOnInput`.

---

### Pitfall 4: Extension Precedence — Plugin Keybindings Lose to Obsidian's Built-in Keymaps

**What goes wrong:**
You register a Tab keymap via `registerEditorExtension(keymap.of([{key: "Tab", run: myTabHandler}]))`. Obsidian itself has already registered its own Tab handler (for markdown list indent, outline fold, etc.) at some precedence level. Your extension is flattened into the extension array AFTER Obsidian's built-in extensions. Result: Obsidian's Tab handler fires first, returns `true`, and your handler never runs.

**Why it happens:**
CM6 keymap resolution is **precedence-first, then document-order within the same precedence bucket**. Extensions registered via `registerEditorExtension` land at `Prec.default` level unless explicitly wrapped. Obsidian's own keymaps may be at `Prec.default` or `Prec.high`. If they're at the same level, the ordering depends on when `registerEditorExtension` inserts into the extension array relative to Obsidian's core extensions — which is undocumented and may vary across Obsidian versions.

The CM6 precedence levels are, from highest to lowest:
- `Prec.highest` — overrides everything
- `Prec.high` — above default
- `Prec.default` — standard level (where `registerEditorExtension` lands)
- `Prec.low` — below default
- `Prec.lowest` — fallback level
- `Prec.fallback` — only if nothing else handles it

**Consequences:**
- Tab/Shift-Tab inside fences does nothing (Obsidian's handler already consumed it)
- Enter-after-brace does nothing (Obsidian's Enter handler already fired)
- The behavior appears "intermittent" if Obsidian only sometimes returns `true` from its handler

**Prevention:**
- **Wrap all v1.2 keymaps in `Prec.high(...)`** so they evaluate BEFORE Obsidian's default-precedence handlers:
  ```typescript
  this.registerEditorExtension(
    Prec.high(keymap.of([
      { key: "Tab", run: fenceScopedTab },
      { key: "Shift-Tab", run: fenceScopedShiftTab },
      { key: "Enter", run: fenceScopedEnter },
    ]))
  );
  ```
- **Do NOT use `Prec.highest`** — that would override even Obsidian's accessibility handlers and vim-mode plugins. `Prec.high` is the correct level for "specialized handler that may decline."
- **Every handler MUST return `false` when outside the fence** so that handlers below in precedence (Obsidian's native ones) still work for non-fence content.
- **Test by disabling the plugin** and verifying Obsidian's native Tab/Enter behavior is preserved — then re-enable and verify it still works outside the fence.

**Detection (warning signs):**
- Tab inside fence does nothing (Obsidian consumed it)
- Tab outside fence is broken (your handler consumed it but didn't act)
- Behavior changes between Obsidian versions (Obsidian moved its keymap precedence)

**Phase to address:** Phase 01 (very first keymap registration) — `Prec.high` wrapping must be the default pattern from day one.

---

### Pitfall 5: Section Lock changeFilter Drops Tab-Induced Changes in Locked Regions

**What goes wrong:**
The existing section lock (`sectionLockExtension.ts`) has a `changeFilter` that drops changes touching locked ranges. The fence opener line and closing fence line are locked (lines 165-189 of `sectionLockExtension.ts`). Your Tab handler dispatches an `indentMore`-style change. If the user's cursor is on the FIRST line of the fence body (line immediately after the opener) and the indentation change's `from` position touches the locked range boundary, the changeFilter drops the change silently.

Specifically, the lock extension's boundary fix (line 419-430) extends each lock's `from` backward by 1:
```typescript
expanded.push(Math.max(0, (ranges[i] as number) - 1));
```

This means position `openerTo` (start of first editable line) minus 1 is INSIDE the lock. If `indentMore` calculates a change that starts at `openerTo - 1` (which it might, depending on how CM6's indent commands work with the `\n` at the end of the opener line), the change is suppressed.

**Why it happens:**
The `-1` boundary expansion was added to prevent users from inserting text at the exact start of `## Problem` (UAT 2026-05-13). But it also means the newline at the end of the opener line is part of the suppressed range. Indent commands that operate on "the line containing the cursor" typically compute the change range as `lineStart..lineStart + existingIndent` — if `lineStart` happens to be exactly at the lock boundary, the change's `from` is `openerTo` which is the **exclusive** end of the lock (allowed), but if there's any off-by-one in how the indent command computes its range, the filter drops it.

Additionally: the changeFilter checks `isUserInput` (lines 375-380) and only fires for `input.*`, `delete.*`, `undo`, `redo` userEvents. The `indentMore` command dispatches with userEvent `'input.indent'` — which IS matched by `ev.startsWith('input.')`. So the lock WILL evaluate indent transactions.

**Consequences:**
- Tab on the first line of the code fence body silently does nothing
- User perceives the fence as "partially locked" and files a bug
- Shift-Tab that would remove all indentation from the first line, potentially leaving `from === openerTo`, gets dropped

**Prevention:**
- **Tag all v1.2 code-fence dispatches with `userEvent: 'leetcode.code-indent'`** (or similar `'leetcode.*'`-prefixed annotation). The section lock's Gate 1 (line 389) checks for `leetcode.*` prefix and returns `true` (bypass), but Gate 0 (line 376) checks `isUserInput` first and only continues for `input.*`/`delete.*`/`undo`/`redo`. Since `'leetcode.code-indent'` does NOT start with `input.` or `delete.`, Gate 0 returns `true` (no suppression) — the lock is bypassed.
- **Wait — verify this.** Gate 0 returns `true` (pass through) when `isUserInput` is `false`. A `'leetcode.code-indent'` userEvent: `isUserInput` = `ev.startsWith('input.') || ev.startsWith('delete.') || ev === 'undo' || ev === 'redo'`. `'leetcode.code-indent'.startsWith('input.')` = false. So `isUserInput = false`, Gate 0 returns `true`. Correct — the lock is bypassed.
- **However**, this means your Tab dispatch does NOT go through the lock at all. This is safe because your handler already verified the cursor is inside the fence body before dispatching. You have effectively pre-authorized the edit.
- **Do NOT use `indentMore` directly** (it dispatches with `userEvent: 'input.indent'`). Instead, compute the indentation change manually and dispatch with `userEvent: 'leetcode.code-indent'`. This ensures the section lock never interferes.
- **Alternative**: modify the section lock to whitelist `'input.indent'` when the change is entirely within the fence body. But this is riskier — modifying security infrastructure for a feature is backwards.

**Detection (warning signs):**
- Tab on line 1 of fence body does nothing while Tab on line 2+ works fine
- Shift-Tab removes indentation on all lines except the first
- Adding `console.log` inside the changeFilter shows the indent transaction being dropped

**Phase to address:** Phase 01 (Tab handler implementation) — use `'leetcode.code-indent'` / `'leetcode.code-dedent'` userEvent annotations from day one. Document this in the code convention.

---

### Pitfall 6: Per-Keystroke `findCodeFence()` Line Scan — Performance at Scale

**What goes wrong:**
Every keymap handler (Tab, Enter, bracket) calls `findCodeFence(view.state)` to check if the cursor is inside the fence. `findCodeFence` does a linear scan of the document from line 1 to find `## Code`, then scans forward for the fence opener, then forward again for the closer. For a typical LC problem note (~100-200 lines), this is ~200 string comparisons per keystroke. Seems fast — but:
- The changeFilter in `sectionLockExtension.ts` ALSO calls `computeLockedRanges(tr.startState)` which calls `findCodeFence(state)` internally (line 161)
- The decorations extension in `codeActionsEditorExtension.ts` ALSO calls `findCodeFence(state)` on rebuild (line 256)
- Total: up to 3 calls to `findCodeFence` per transaction (changeFilter + transactionFilter + your new keymap handler)

At 200 lines, 3 full scans per keystroke: ~600 string operations. Still likely < 1ms on modern hardware. But:
- Users with extremely long `## Problem` sections (LC hards with long descriptions: 80-100 lines of HTML-converted markdown)
- Users who paste large test cases into `## Custom Tests`
- Notes with AI Review sections can reach 300-400 lines

At 400 lines x 3 scans = 1200 string ops per keystroke — still probably fine, but it's the wrong direction.

**Why it happens:**
`findCodeFence` was designed as a pure utility for occasional use (decoration rebuild on `docChanged`, lock computation on edit attempts). Adding it to a per-keystroke keymap handler triples its call frequency.

**Consequences:**
- Theoretical: on very long notes (500+ lines), typing becomes perceptibly laggy
- Practical for v1.2: probably fine for typical LC notes, but sets a bad precedent
- The real risk is compounding: if future phases add MORE per-keystroke checks, the linear scan becomes the bottleneck

**Prevention:**
- **For v1.2: the line scan is acceptable.** A 200-line note scanned 3x per keystroke is ~0.1ms on modern hardware. Do not prematurely optimize.
- **BUT: cache the result in a StateField if profiling shows any issue.** The pattern:
  ```typescript
  const codeFenceField = StateField.define<{openerLine: number; closerLine: number} | null>({
    create(state) { return findCodeFence(state); },
    update(old, tr) { return tr.docChanged ? findCodeFence(tr.state) : old; }
  });
  ```
  This recomputes only on `docChanged` (when the fence might have moved) and is O(1) to read on every keystroke.
- **Decision rule:** implement v1.2 Phase 01 with direct `findCodeFence` calls. After Phase 01 lands, run a performance profile on a 500-line note with rapid typing. If any keystroke exceeds 2ms total extension time, add the StateField cache. If not, leave it.
- **Do NOT pre-build the StateField cache before measuring.** It adds complexity (another field to register, another thing that can go stale, another piece of state for tests to mock). The section lock already calls `computeLockedRanges` (which calls `findCodeFence`) per transaction and no performance issues have been reported.

**Detection (warning signs):**
- Performance profiler shows > 2ms in `findCodeFence` per keystroke
- Users report lag in the code fence on long notes
- The StateField cache is added but `docChanged` logic has a bug and returns stale data

**Phase to address:** Phase 01 (initial implementation uses direct calls) — revisit at Phase 03 (after all keystroke handlers are in place) with profiling.

---

### Pitfall 7: Undo/Redo Coherence — Custom Dispatches Must Preserve History

**What goes wrong:**
Your Tab handler computes an indentation change and dispatches it via `view.dispatch({changes, userEvent: 'leetcode.code-indent'})`. The change is applied — but when the user presses Cmd+Z, nothing happens. The indent was not recorded in undo history.

Or the inverse: every single Tab press creates a separate undo entry. The user indents 5 lines one by one, then Cmd+Z — only the last line's indent is undone. They must press Cmd+Z five times. This feels wrong compared to IDE behavior where "indent selection" is one undo step.

**Why it happens:**
CM6's `history()` extension records transactions into the undo stack based on the `addToHistory` annotation. By default, all transactions with document changes ARE added to history. However:
1. If you accidentally set `addToHistory: false` on your dispatch spec, the change is invisible to undo.
2. If you dispatch 5 separate transactions (one per line) for a multi-line indent, each becomes a separate undo entry. `indentMore` from `@codemirror/commands` correctly handles multi-cursor/multi-line indent as ONE transaction — but if you hand-roll the indent and dispatch per-line, you get 5 entries.
3. The `'leetcode.*'` userEvent prefix has no special interaction with history — it only bypasses the section lock. History records normally.

**Consequences:**
- User presses Cmd+Z after Tab-indent: nothing happens → "the plugin broke undo"
- User presses Cmd+Z after indenting 5 lines: must undo 5 times → annoying
- If the section lock somehow transforms the transaction (rewriting it via transactionFilter), the history may record the REWRITTEN transaction, not the original intent

**Prevention:**
- **Never set `addToHistory: false`** on indent/dedent/bracket dispatches. Let history record naturally.
- **Always dispatch multi-line indent as a single transaction** with a combined `ChangeSet`. Build all line-indentation changes into one `changes` array and dispatch once:
  ```typescript
  const changes = selectedLines.map(line => ({
    from: line.from,
    to: line.from, // insert at start
    insert: indentUnit
  }));
  view.dispatch({ changes, userEvent: 'leetcode.code-indent' });
  ```
  CM6 accepts an array of non-overlapping changes in one dispatch — they become one undo entry.
- **For auto-close brackets**: the inserted closing bracket should be in the SAME transaction as the opening bracket. Dispatch: `{changes: [{from: pos, insert: "{"}], {from: pos+1, insert: "}"}]` — one dispatch, one undo entry that removes both.
- **Test undo explicitly**: after implementing each handler, verify that Cmd+Z undoes the entire operation in one step.

**Detection (warning signs):**
- Cmd+Z after Tab does nothing
- Cmd+Z after indenting a selection undoes one line at a time
- Auto-closed bracket: Cmd+Z removes only the closing bracket, leaving orphaned opening bracket

**Phase to address:** Phase 01 (Tab/Shift-Tab) — establish the "single-transaction, no addToHistory override" convention. Phase 02 (brackets) — same convention for pair insertion.

---

### Pitfall 8: Live Preview vs Source Mode — Decoration Offsets Differ

**What goes wrong:**
Live Preview mode renders some markdown syntax as formatted output (e.g., bold text shows as bold, not as `**bold**`). This means character positions in the editor may not match the raw document positions. Your Tab handler uses `findCodeFence(state)` which returns line numbers based on the raw document. But in Live Preview, the cursor position reported by `view.state.selection.main.head` is in the **rendered** coordinate space — or is it?

Actually: CM6 positions are always raw-document positions, even in Live Preview. Obsidian's Live Preview uses decorations to HIDE syntax characters, but the underlying document and position model remain unchanged. So this is NOT a real pitfall — but it's a common source of confusion.

The REAL pitfall in Live Preview: **widgets and replacements shift visual lines.** The existing `CodeActionsWidget` (block widget below the fence closer) occupies visual space. If your Tab handler uses `view.lineBlockAt(pos)` to determine visual indentation, the widget presence may shift line-block geometry. But if you use `state.doc.lineAt(pos)` (document-level, not view-level), you're safe.

**Why it happens:**
Confusion between CM6's two line APIs:
- `state.doc.lineAt(pos)` — document line (raw text, unaffected by decorations)
- `view.lineBlockAt(pos)` — visual line block (affected by widgets, folding, wrapping)

**Consequences:**
- If you accidentally use `view.lineBlockAt` for indentation calculations, results differ between Live Preview and Source Mode
- If you rely on "line count" between opener and cursor for nesting depth, block widgets (like the Run/Submit row) don't affect document line count but DO affect visual rendering — potential off-by-one in visual feedback, not in logic

**Prevention:**
- **Always use `state.doc.lineAt(pos)` and `state.doc.line(n)` for all indentation/fence logic.** Never use `view.lineBlockAt` or `view.visualLineAt` for position math.
- **`findCodeFence` already uses `state.doc.line(i)` exclusively** — it is mode-agnostic. Keep all new code on the same pattern.
- **The editorLivePreviewField check in codeActionsEditorExtension.ts is for decoration rebuild (showing/hiding the widget), NOT for position math.** v1.2 code should NOT check `editorLivePreviewField` for indentation behavior — behavior should be identical in both modes.
- **Test in both modes**: enable Live Preview, type in the fence, verify indentation works. Switch to Source Mode (Cmd+E), verify same behavior. The underlying logic should be byte-for-byte identical.

**Detection (warning signs):**
- Indentation works in Source Mode but misaligns in Live Preview
- Code uses `view.lineBlockAt` or `view.visualLineAt` anywhere in the indent/bracket logic
- A check for `editorLivePreviewField` gates indentation behavior differently per mode

**Phase to address:** Phase 01 — establish the "document-position only" convention in the first implementation. No mode-specific branching for behavior.

---

### Pitfall 9: Obsidian Plugin Review — Overriding Core CM6 Behavior

**What goes wrong:**
The plugin-store reviewer sees that your plugin registers `Prec.high(keymap.of([...]))` for Tab, Enter, and bracket keys. They flag: "This plugin overrides core editor keybindings at high precedence. Does it correctly fall through when not applicable? Could it break other plugins?" The reviewer tests with vim-mode enabled — your Tab handler fires BEFORE vim's Tab command.

Alternatively: the reviewer runs `eslint-plugin-obsidianmd@0.3.0` and one of its rules flags "no default hotkeys" — but that rule is about the command palette, not editor keymaps. Still, the reviewer's suspicion may delay approval.

**Why it happens:**
Plugin review is partly automated and partly human judgment. Reviewers look for:
- Network calls not disclosed in README (not applicable here)
- `innerHTML` usage (not applicable)
- Global keybinding overrides (APPLICABLE)
- Performance-heavy extensions that run on every keystroke (APPLICABLE)

There is no explicit rule against high-precedence keymaps, but reviewers use discretion. A plugin that breaks vim-mode or other popular plugins will get complaints.

**Consequences:**
- Plugin submission delayed by reviewer questions
- Conflicts with vim-mode (obsidian-vimrc-support) — vim uses Tab for its own purposes in normal mode
- Conflicts with other CM6 plugins that also override Tab (rare, but possible)

**Prevention:**
- **The handler MUST return `false` when outside the fence.** This is the contract: "I only handle Tab when the cursor is inside a code fence in an LC note. Otherwise I don't interfere." Document this clearly in the code and in the README.
- **Gate on `lc-slug` frontmatter.** The handler should FIRST check if the current file is an LC note (same pattern as the section lock: check `editorInfoField` → file → frontmatter → `lc-slug`). If not an LC note, return `false` immediately. This means the handler is a no-op in 99% of files in the vault.
- **Gate on fence position.** Even in an LC note, if the cursor is outside the fence, return `false`.
- **Two-gate fast path:**
  ```typescript
  function fenceScopedTab(view: EditorView): boolean {
    // Gate 1: is this an LC note?
    const file = view.state.field(editorInfoField)?.file;
    if (!file) return false;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm?.['lc-slug']) return false;
    // Gate 2: is cursor inside the fence body?
    const fence = findCodeFence(view.state);
    if (!fence) return false;
    const cursor = view.state.selection.main.head;
    const fenceBodyStart = view.state.doc.line(fence.openerLine).to + 1;
    const fenceBodyEnd = view.state.doc.line(fence.closerLine).from;
    if (cursor < fenceBodyStart || cursor >= fenceBodyEnd) return false;
    // Cursor is in fence — handle Tab
    // ...
    return true;
  }
  ```
- **Vim-mode compatibility**: vim-mode plugins typically register their keymaps at `Prec.highest`. If the user has vim-mode enabled, vim's Tab handler will fire first in normal/visual mode. In insert mode, vim usually passes through to the standard keymaps. Your handler at `Prec.high` fires AFTER `Prec.highest` (vim) but BEFORE `Prec.default` (Obsidian markdown). This is the correct layering.
- **README note**: "This plugin adds code-aware Tab, Enter, and bracket behavior inside the `## Code` fence on LeetCode problem notes. It does not affect other notes or other sections of the note."

**Detection (warning signs):**
- Plugin reviewer asks "does this break vim-mode?"
- A vim-mode user reports Tab no longer works in insert mode inside fences
- The handler returns `true` in any code path where the cursor is outside the fence

**Phase to address:** Phase 01 — two-gate pattern established from the start. README updated to disclose the scoped keybinding behavior.

---

### Pitfall 10: Enter-After-Brace Creates Undo Entry That Section Lock Then Drops

**What goes wrong:**
User types `{` then presses Enter. Your Enter handler dispatches: insert `\n` + indentation + closing `}` on the next line. The transaction has `userEvent: 'leetcode.code-enter'`. The section lock's Gate 0 sees this is NOT `input.*` / `delete.*` / `undo` / `redo` — so it passes through (returns `true`). Good.

But what if the user types `{` at the END of the last line of the fence body (the line immediately before the closing ` ``` `)? Your Enter handler inserts a new line + `}`, pushing the closing fence down by 2 lines. The closing fence IS locked by the section lock. If your dispatch includes changes that span into the closing fence's position... but wait — you're inserting BEFORE the closer, not modifying it. The closer just shifts down in the document. Insertions before a locked range don't modify the locked range — they shift it. CM6's `changeFilter` only drops changes that OVERLAP locked ranges, not changes that shift them.

**The real problem**: after your Enter handler dispatches with `'leetcode.code-enter'`, Obsidian's OWN Enter handler may ALSO try to fire (if your handler didn't return `true`). Or: if the transaction goes through the transactionFilter (selection snap), the snap logic might move the cursor to an unexpected position after the Enter-insert.

**Why it happens:**
The transactionFilter in `sectionLockExtension.ts` (lines 453-519) fires on every transaction with a selection change. After your Enter-dispatch creates a new line and places the cursor on it, the transactionFilter evaluates whether the new cursor position is inside a locked range. Since `computeLockedRanges` is recomputed on `tr.state` (the POST-transaction state, line 464), the fence positions have SHIFTED (closer moved down). The transactionFilter correctly sees the new cursor is in the fence body (not locked). But if there's a bug in `computeLockedRanges` with the shifted positions...

Actually, the transactionFilter reads `flatRanges = computeLockedRanges(tr.state)` — post-transaction state. The fence closer has moved. `findCodeFence` re-scans the post-transaction document correctly. So this should be fine.

**The ACTUAL risk**: if your Enter handler dispatches AND Obsidian's native Enter handler ALSO dispatches (because you returned `false` from one but `true` from another in a chained keymap), you get a double-newline. Or: your Enter creates a transaction, the transactionFilter rewrites it (adding a selection snap), and the rewritten transaction no longer has your intended changes.

**Consequences:**
- Double-newline on Enter (both your handler and Obsidian's fired)
- Cursor lands in an unexpected position after Enter-insert
- Auto-indent after `{` puts the cursor at the wrong column

**Prevention:**
- **Return `true` from the Enter handler unconditionally when inside the fence.** This prevents any downstream Enter handler from firing. Your handler is fully responsible for the newline + indent behavior inside the fence.
- **Dispatch the complete transaction in one shot**: newline + indentation + optional closing brace + cursor positioning. Use `{changes: [...], selection: EditorSelection.cursor(newCursorPos), userEvent: 'leetcode.code-enter'}`.
- **Do NOT rely on CM6's `insertNewlineAndIndent` command** — it uses the language's indent rules which may not work inside the fence (see Pitfall 3). Roll your own newline + indent logic.
- **Test the fence-boundary edge case explicitly**: cursor on the last line of fence body, type `{`, press Enter. Verify the closer shifts down cleanly, cursor is indented, and undo restores to pre-state.

**Detection (warning signs):**
- Double-newline on Enter inside the fence
- Cursor jumps to the start of the closer line after Enter
- Undo after Enter removes only the newline but leaves the auto-inserted `}`

**Phase to address:** Phase 03 (Enter/auto-indent) — edge cases at fence boundary are part of the test matrix.

---

### Pitfall 11: Mobile Future-Proofing — CM6 Access May Not Exist

**What goes wrong:**
v1.2 is desktop-only (PROJECT.md: "Platform: Desktop Obsidian only"). But a future milestone may target mobile. On Obsidian Mobile:
- The editor IS CodeMirror 6 (confirmed in Obsidian docs)
- But `view.editor.cm` (the undocumented internal path to `EditorView`) may not exist or may differ
- `registerEditorExtension` should still work (it's a documented Plugin API method)
- However: mobile has no physical Tab key. Touch keyboards don't emit "Tab" keycodes.

**Why it happens:**
Mobile keyboards don't have Tab. The "indent" action on mobile would need a toolbar button or gesture, not a keymap. If all your indent logic lives inside a `key: "Tab"` handler with no alternative entry point, mobile support requires a full rewrite of the trigger mechanism.

**Consequences for future mobile milestone:**
- All Tab/Shift-Tab logic inaccessible on mobile (no Tab key)
- Enter-after-brace may work IF the keymap fires on Enter (mobile keyboards DO have Enter)
- Bracket auto-close via `inputHandler` should work (mobile keyboards generate input events)
- The StateField cache (if built) works everywhere — it's pure state

**Prevention (design now, implement later):**
- **Separate the LOGIC from the TRIGGER.** Structure the code as:
  - `indentFenceSelection(view: EditorView): boolean` — the logic (compute changes, dispatch)
  - Tab keymap handler → calls `indentFenceSelection`
  - Future mobile toolbar button → also calls `indentFenceSelection`
- **Do NOT inline logic inside the keymap handler closure.** Extract it as a named exported function (testable, reusable, mobile-ready).
- **For bracket auto-close, using `inputHandler` is already mobile-safe** — it fires on any text input regardless of physical keyboard.
- **The `'leetcode.*'` userEvent convention is keyboard-agnostic** — it's an annotation on the transaction, not tied to how the transaction was triggered.

**Detection (warning signs):**
- All indent logic is inside an anonymous closure in `keymap.of([{key: "Tab", run: (view) => { /* everything here */ }}])`
- No exported function that performs the indent operation independently of the key trigger
- A future mobile PR requires rewriting 200 lines of logic because it's trapped inside a keymap handler

**Phase to address:** Phase 01 (Tab handler) — extract logic into named functions from day one. This is free (just function extraction) and pays off if mobile is ever scoped in.

---

## Moderate Pitfalls

### Pitfall 12: Multi-Cursor Indent — Only Main Cursor Is Inside Fence

**What goes wrong:**
User has multiple cursors (Obsidian supports this via Alt-click). One cursor is inside the fence, another is in `## Notes`. Tab fires. Your handler checks `view.state.selection.main.head` — it's inside the fence. You dispatch `indentMore`-style changes for ALL cursor positions. The cursor in `## Notes` gets indented too (wrong — it's markdown, should do list indent). Or worse: the change for the `## Notes` cursor overlaps a locked range and the section lock drops the entire transaction (all changes, including the valid fence one).

**Why it happens:**
CM6 selections can have multiple ranges. `selection.main` is just the primary one. Commands like `indentMore` operate on ALL ranges. If your handler only checks the main range's position but dispatches changes for all ranges, non-fence cursors get wrong behavior.

**Prevention:**
- **Check ALL selection ranges**, not just `main`. For each range:
  - If it's inside the fence body → include it in the indent changes
  - If it's outside the fence → skip it (don't include in changes)
- **If NO ranges are inside the fence, return `false`** (let Obsidian handle Tab for all cursors).
- **If SOME ranges are inside and some outside**: this is an edge case. Recommended: only indent the in-fence ranges, leave the others unchanged. Dispatch changes only for in-fence ranges. The out-of-fence cursors simply don't move.
- Alternatively (simpler): if ANY range is outside the fence, return `false` entirely. This means Tab only works when ALL cursors are inside the fence. Less flexible but simpler and avoids partial-dispatch complexity.

**Phase to address:** Phase 01 (Tab handler) — decide the multi-cursor policy upfront (recommend: "all cursors must be in fence for Tab to fire").

---

### Pitfall 13: Bracket Pair Deletion (Backspace) Not Handled

**What goes wrong:**
You implement auto-close brackets: typing `{` inserts `{}` with cursor between them. Great. User presses Backspace between `{` and `}`. Expected: both characters deleted (pair-delete). Actual: only `{` is deleted, leaving orphaned `}`. This is because `closeBrackets` from `@codemirror/autocomplete` comes with its own Backspace handler (`closeBracketsKeymap` includes a Backspace binding) — but since you're not using the standard `closeBrackets()` extension (Pitfall 2 says you shouldn't), you don't get pair-delete for free.

**Why it happens:**
Pair-delete is a separate concern from pair-insert. The standard `closeBrackets` extension tracks what it inserted and removes pairs on Backspace. If you roll your own bracket insertion, you must also roll your own pair-aware Backspace.

**Prevention:**
- Implement a custom Backspace handler (scoped to fence, same two-gate pattern):
  1. Check cursor is inside fence
  2. Check character before cursor and character after cursor form a known pair (`{}`, `()`, `[]`, `""`, `''`)
  3. If yes: delete both characters in one dispatch; return `true`
  4. If no: return `false` (normal Backspace)
- Register this Backspace handler at `Prec.high` alongside Tab/Enter
- **Don't forget: the section lock will NOT interfere** because your Backspace dispatch uses `'leetcode.code-backspace'` userEvent (bypasses Gate 0)

**Phase to address:** Phase 02 (bracket handling) — pair-delete is inseparable from pair-insert. Ship both together.

---

### Pitfall 14: `findCodeFence` Returns Stale Data During Composition (IME Input)

**What goes wrong:**
A user typing with an Input Method Editor (IME — common for Chinese/Japanese/Korean users, but also for emoji/accent input on macOS) starts a composition inside the fence. During composition, CM6 fires transactions with `isComposing: true`. Your keymap handler may or may not fire during composition (CM6 keymaps typically do NOT fire during IME composition — `keydown` events during composition are suppressed by the browser). But your `inputHandler` (for bracket auto-close) DOES fire during composition — and it calls `findCodeFence` which scans the document including the not-yet-committed composition text.

If the composition text contains characters that look like a fence marker (unlikely but possible: triple backtick as part of an IME sequence), `findCodeFence`'s regex could match and return wrong line numbers. Extremely unlikely for code editing, but theoretically possible.

**The more practical IME issue:** after IME commit, the transaction's `userEvent` is `'input.type.compose'`. The section lock's Gate 0 checks `ev.startsWith('input.')` → true → proceeds to evaluate the lock. This is correct behavior (IME input should respect locks). But if the IME commits a `}` character that triggers your `indentOnInput`-style reindentation, the reindentation dispatch races with the IME commit transaction.

**Prevention:**
- **Do not trigger auto-indent on IME-committed characters.** Check `tr.isUserEvent('input.type.compose')` — if true, skip reindentation triggers. Let the character land first; reindent on the next non-composition keystroke if needed.
- **For bracket auto-close during IME**: don't auto-close. IME input is inherently multi-character; inserting a closing bracket mid-composition breaks the IME flow. Only auto-close on direct (non-IME) input.
- **`findCodeFence` is safe** — it scans committed document content only. CM6's document is not updated with uncommitted composition text (composition lives in a DOM overlay until commit). So `findCodeFence` always sees the pre-composition state during composition, and the post-commit state after. This is correct.

**Phase to address:** Phase 02 (bracket auto-close) and Phase 03 (auto-indent triggers) — add composition guards to input handlers.

---

### Pitfall 15: Language-Specific Indent Rules Differ — Java `{` vs Python `:`

**What goes wrong:**
You implement "indent after `{`" for Java/C++/TypeScript. A user switches the fence language to Python (via the language chevron, Phase 5.3). They type `def foo():` and press Enter. Expected: indent next line. Actual: no indent (your rule only checks for `{`).

Similarly: Java users expect dedent on `}`, Python users expect dedent on `return`/`pass`/`break` at the end of a block — or no dedent at all (Python indent is purely additive; you dedent by typing at a shallower level, not by a trigger character).

**Why it happens:**
Different languages have fundamentally different indentation rules:
- **Brace languages** (Java, C++, TS, Go, Rust): indent after `{`, dedent on `}`
- **Python**: indent after `:`, no explicit dedent trigger (user manually dedents)
- **Ruby**: indent after `do`/`def`/`if`/`class`, dedent after `end`
- **Lisp**: indent based on form nesting (irrelevant for LC but theoretically possible)

A single indent rule engine cannot cover all languages without becoming a mini-parser.

**Prevention:**
- **Start with brace-language rules only.** The majority of LC users write Java, C++, Python, or TypeScript. Three of those four are brace languages. Python is the outlier.
- **For Python**: indent after lines ending in `:` (function def, if/else/for/while/class/with). Do NOT auto-dedent. Python's dedent is user-driven.
- **Minimal per-language config:**
  ```typescript
  const INDENT_TRIGGERS: Record<string, {after: RegExp, dedent?: RegExp}> = {
    java:       { after: /[{(]\s*$/, dedent: /^\s*[})]/  },
    cpp:        { after: /[{(]\s*$/, dedent: /^\s*[})]/  },
    typescript: { after: /[{(]\s*$/, dedent: /^\s*[})]/  },
    python:     { after: /:\s*(#.*)?$/ },  // no dedent trigger
    go:         { after: /[{(]\s*$/, dedent: /^\s*[})]/  },
    rust:       { after: /[{(]\s*$/, dedent: /^\s*[})]/  },
    // ... fallback to brace rules for unknown languages
  };
  ```
- **Read the current language from frontmatter `lc-language`** (same source as the language chevron). Map LC language slugs to indent rule keys.
- **Default/fallback: brace rules.** Unknown languages get `{`/`}` indent/dedent. This is wrong for Python but Python is explicitly handled.

**Detection (warning signs):**
- Python users report "Enter after `def foo():` doesn't indent"
- Java users report "Enter after `{` doesn't indent" (rule engine not recognizing the trigger)
- No language-awareness in the indent logic — same rules for all languages

**Phase to address:** Phase 03 (Enter/auto-indent) — language-aware rules from the start. The per-language config map is small (~20 lines) and saves significant user confusion.

---

## Minor Pitfalls

### Pitfall 16: Tab Inserts Spaces But User Expects Tabs

**What goes wrong:**
Your Tab handler inserts 4 spaces (or 2 spaces). The user's preferred indentation for their language is actual `\t` characters. Or: the user has Obsidian's "Use tabs" setting enabled but your handler ignores it and always inserts spaces.

**Prevention:**
- Read the indent unit from `view.state.facet(indentUnit)` (CM6 provides this). If Obsidian or the user has configured tab size, this facet reflects it.
- Alternatively: add a v1.2-specific setting "Indent unit in code fence" with options: "2 spaces", "4 spaces", "Tab character". Default: "4 spaces" (matches LeetCode web editor default).
- Use `view.state.facet(indentUnit)` as the default; let the plugin setting override if the user configures it.

**Phase to address:** Phase 01 — respect indent unit from the start.

---

### Pitfall 17: Selection-Based Indent Doesn't Preserve Selection

**What goes wrong:**
User selects 5 lines in the fence, presses Tab. Expected: all 5 lines indent, selection stays on the same 5 lines (just shifted right). Actual: selection collapses to a cursor after the dispatch.

**Prevention:**
- When dispatching a multi-line indent, compute the new selection that covers the same lines but shifted by the indent amount:
  ```typescript
  const newSelection = EditorSelection.range(
    oldSelection.from + indentSize, // first line shifted
    oldSelection.to + (indentSize * numLines) // last line shifted
  );
  ```
- Include `selection: newSelection` in the dispatch spec.
- For Shift-Tab (dedent): selection shifts left (but clamp at column 0 — don't go negative).

**Phase to address:** Phase 01 — selection preservation is part of the Tab/Shift-Tab spec.

---

### Pitfall 18: Plugin Unload Doesn't Clean Up Extension State

**What goes wrong:**
The plugin is disabled/unloaded. Extensions registered via `registerEditorExtension` are automatically cleaned up by Obsidian — the extension is removed from the editor state on next reconfiguration. But if you added DOM event listeners, global state, or module-level caches that reference the EditorView, those leak.

**Prevention:**
- `registerEditorExtension` handles cleanup automatically — no manual work needed for CM6 extensions.
- If using a module-level `Map<TFile, FenceCache>` or similar, clear it in `onunload()`.
- StateFields are automatically removed — no leak.
- The existing pattern from v1.0 (section lock, code actions extension) confirms that `registerEditorExtension` is sufficient for cleanup.

**Phase to address:** All phases — follow existing cleanup patterns from v1.0/v1.1.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 01: Tab/Shift-Tab | Pitfall 1 (global Tab conflict), Pitfall 4 (precedence), Pitfall 5 (section lock drop) | Zone-scoped handler with `Prec.high`, `'leetcode.*'` userEvent, two-gate fast path |
| Phase 02: Bracket Handling | Pitfall 2 (markdown auto-pairs conflict), Pitfall 13 (pair-delete missing) | Custom inputHandler, not global `closeBrackets()`; ship pair-delete with pair-insert |
| Phase 03: Enter/Auto-Indent | Pitfall 3 (`indentOnInput` global), Pitfall 10 (double-newline), Pitfall 15 (language-specific rules) | Custom Enter handler returning `true` inside fence; per-language trigger config |
| All Phases: History | Pitfall 7 (undo coherence) | Single-transaction dispatches, never `addToHistory: false` |
| All Phases: Performance | Pitfall 6 (`findCodeFence` per-keystroke) | Direct calls acceptable; cache via StateField only if profiling warrants |
| All Phases: Multi-cursor | Pitfall 12 (only main cursor in fence) | Check all ranges; require all-in-fence or fall through |
| All Phases: Review | Pitfall 9 (reviewer concerns) | Two-gate pattern, README disclosure, `false`-return outside fence |
| Future: Mobile | Pitfall 11 (no Tab key) | Extract logic into named functions, separate trigger from action |

---

## Integration With Existing Section Lock — Detailed Analysis

The section lock (`sectionLockExtension.ts`) is the highest-risk interaction point for v1.2. Here is the complete interaction matrix:

| v1.2 Action | userEvent Annotation | Section Lock Gate 0 (`isUserInput`) | Gate 1 (`leetcode.*`) | Outcome |
|-------------|---------------------|--------------------------------------|------------------------|---------|
| Tab indent dispatch | `'leetcode.code-indent'` | `false` (not `input.*`/`delete.*`) | N/A (Gate 0 returns `true`) | **PASSES** — lock bypassed |
| Shift-Tab dedent dispatch | `'leetcode.code-dedent'` | `false` | N/A | **PASSES** |
| Enter + auto-indent dispatch | `'leetcode.code-enter'` | `false` | N/A | **PASSES** |
| Bracket auto-close dispatch | `'leetcode.code-bracket'` | `false` | N/A | **PASSES** |
| Pair-delete Backspace dispatch | `'leetcode.code-backspace'` | `false` | N/A | **PASSES** |
| User types `{` normally (no auto-close) | `'input.type'` | `true` → evaluate lock | N/A | **Evaluated** — passes if cursor in editable zone |
| User presses Backspace normally | `'delete.backward'` | `true` → evaluate lock | N/A | **Evaluated** — may be dropped if in locked range |
| Undo of a `'leetcode.*'` dispatch | `'undo'` | `true` → evaluate lock | N/A | **WARNING** — see below |

**Critical edge case: Undo of a `'leetcode.*'` dispatch.** When the user undoes a `'leetcode.code-indent'` transaction, CM6's history replays the inverse change with userEvent `'undo'`. The section lock's Gate 0 sees `ev === 'undo'` → `isUserInput = true` → proceeds to evaluate the lock. The undo's inverse change touches the fence body (which is editable) → lock passes it through. **This is correct.** But if the undo somehow touches the fence opener or closer (e.g., an Enter-after-brace that shifted the closer — undoing it shifts the closer back up), the lock will evaluate whether the change overlaps a locked range. Since the closer IS locked, the undo might be dropped.

**Resolution:** The undo SHIFTS the closer (insertion undo = deletion before the closer), it doesn't MODIFY the closer's content. CM6's changeFilter drops changes that OVERLAP locked ranges (i.e., `change.from < lockTo && change.to > lockFrom`). A deletion that ends at `closerLine.from - 1` (removing the newline before the closer) does NOT overlap the closer's locked range (which starts at `closer.from`). So the undo passes through. **But test this edge case explicitly.**

---

## "Looks Done But Isn't" Checklist

- [ ] **Tab handler:** Returns `true` inside fence but returns `false` outside → verified in non-LC notes
- [ ] **Tab handler:** Works when cursor is on the FIRST line of fence body (section lock boundary)
- [ ] **Tab handler:** Multi-line selection indent is one undo entry, not N entries
- [ ] **Tab handler:** Selection is preserved after indent (not collapsed to cursor)
- [ ] **Tab handler:** Works with vim-mode enabled (insert mode Tab → code indent)
- [ ] **Shift-Tab handler:** Does not dedent past column 0
- [ ] **Bracket auto-close:** Typing `*` inside fence does NOT produce `**` (markdown emphasis suppressed)
- [ ] **Bracket auto-close:** Typing `{` outside fence still gets Obsidian's normal behavior
- [ ] **Bracket pair-delete:** Backspace between `{}` removes both characters
- [ ] **Enter handler:** Enter after `{` inside fence produces indented new line + closing `}` on next line
- [ ] **Enter handler:** Enter outside fence (in `## Notes`) still produces normal markdown newline
- [ ] **Enter handler:** Enter on the LAST line of fence body (before closer) works correctly
- [ ] **Auto-indent:** Python `:` triggers indent; `{` does not trigger indent in Python mode
- [ ] **Auto-indent:** Java `{` triggers indent; `:` does not trigger indent in Java mode
- [ ] **Undo:** Cmd+Z after Tab undoes the entire indent in one step
- [ ] **Undo:** Cmd+Z after Enter+auto-indent removes the newline + indent + closing brace in one step
- [ ] **Undo:** Cmd+Z after auto-close bracket removes both opening and closing characters
- [ ] **Live Preview:** All behaviors work identically in Live Preview and Source Mode
- [ ] **Section lock:** No regression — `## Problem` still fully locked, fence opener/closer still locked
- [ ] **Non-LC notes:** All handlers return `false` → zero behavioral change in normal markdown
- [ ] **Performance:** Rapid typing in 400-line note shows no perceptible lag
- [ ] **Plugin review:** README updated with "Scoped code-editing keybindings" disclosure
- [ ] **Indent unit:** Respects configured indent size (2/4 spaces or tab character)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Global Tab override broke all markdown lists | LOW | Wrap handler in fence-check; deploy hotfix. Users' notes are undamaged (undo works). |
| Markdown auto-close pairs leak into code | LOW | Add fence-position check to inputHandler; deploy patch. |
| Section lock drops indent changes on first line | LOW | Switch to `'leetcode.*'` userEvent annotation; deploy patch. |
| Undo broken for indent operations | MEDIUM | Ensure single-transaction dispatch; may require re-testing all paths. No data loss — user can manually fix. |
| Performance regression on long notes | LOW | Add StateField cache for `findCodeFence`; deploy patch. |
| Plugin review rejection for keybinding override | MEDIUM | Add README disclosure + demonstrate `false`-return in PR diff; resubmit. |
| vim-mode conflict | MEDIUM | Lower precedence to `Prec.default` with conditional `Prec.high` only in insert mode; requires vim-mode detection (check for `cm-vim-mode` class on editor DOM). |

---

## Sources

- CM6 Official Documentation (Context7 `/codemirror/website`, fetched 2026-05-21):
  - Keymap precedence: `Prec.highest` > `Prec.high` > `Prec.default` > `Prec.low` > `Prec.lowest` (HIGH confidence)
  - Command contract: `(view: EditorView) => boolean` — `true` = handled, `false` = pass to next handler (HIGH)
  - `closeBrackets` reads from `languageData` at cursor position (HIGH)
  - `indentOnInput` uses syntax tree's `indentNodeProp` — requires nested language tree to work (HIGH)
  - `changeFilter` drops changes overlapping `[from, to]` ranges — insertions at boundary are exclusive (HIGH)
  - `history()` records all transactions with document changes unless `addToHistory: false` (HIGH)
  - `indentUnit` facet controls indent size (HIGH)
- Obsidian Developer Docs (fetched 2026-05-21):
  - `registerEditorExtension` is the standard way to add CM6 extensions from plugins (HIGH)
  - `view.editor.cm as EditorView` is the undocumented but stable internal path (MEDIUM — undocumented)
  - Extensions are cleaned up automatically on plugin unload (HIGH)
- Existing codebase analysis:
  - `sectionLockExtension.ts`: Gate 0 fires only for `input.*`/`delete.*`/`undo`/`redo` userEvents; `'leetcode.*'` bypasses via Gate 1 (but is unreachable because Gate 0 exits first) (HIGH — primary source)
  - `findCodeFence`: linear scan, returns `{openerLine, closerLine}` or null (HIGH)
  - `codeActionsEditorExtension.ts`: existing `languageRefreshEffect` + `buildDecorations` pattern shows how to dispatch effects and rebuild decorations (HIGH)
  - `computeLockedRanges`: boundary expansion `-1` on lock from (HIGH)
- CM6 Mixed Language Parsing docs: `parseMixed` enables nested language trees inside fenced blocks — but Obsidian's implementation is opaque; cannot rely on nested tree for indent rules (MEDIUM)

---
*Pitfalls research for: Obsidian LeetCode v1.2 milestone (Code Editor Experience in Fenced Blocks)*
*Researched: 2026-05-21*
