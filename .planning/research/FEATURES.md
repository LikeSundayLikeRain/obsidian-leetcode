# Feature Research — v1.3 Inline Widget Architecture

**Domain:** Obsidian plugin — inline editable code-block widget for LeetCode solve flow
**Researched:** 2026-05-28
**Confidence:** HIGH for table-stakes patterns (Dataview lp-render evidence, Obsidian docs, CM6 reference); MEDIUM for differentiator framing (synthesis from analogous plugins); MEDIUM-HIGH for migration strategy (Obsidian-side patterns extrapolated from existing v1.x lazy-migration discipline)

## Scope Note

This document maps **what the v1.3 inline-widget UX must look like** and which behaviors are commonly-requested-but-harmful. It is the input to REQUIREMENTS.md categorization and phase boundaries — not a roadmap, and not an architecture spec (those live in ROADMAP.md and ARCHITECTURE.md).

The v1.2 surface that ships into v1.3 is treated as a **constraint**, not a feature: 8-language packs, runtime language switching via `languageCompartment`, vim mode, relative line numbers, indent/bracket/comment rules, action row (Run / Submit / AI Debug / Copy / Reset / Retrieve), and chevron dropdown all already exist in `src/main/childEditorFactory.ts` and `src/main/codeBlockButtonRow.ts`. The v1.3 work re-mounts them inside a code-block-processor widget instead of a fence-overlay nested editor — almost no new feature surface, almost all UX-architecture rework.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Behaviors users will assume work because they work in v1.2 today, in mature Obsidian inline-widget plugins, or in standard CM6 editors. Missing any of these = the v1.3 widget is a regression vs v1.2 and will be experienced as broken even if architecturally cleaner.

| # | Feature | Why Expected | Complexity | Depends on v1.2 | Notes |
|---|---------|--------------|------------|-----------------|-------|
| TS-01 | **Click into widget → caret lands inside → typing edits code immediately** | "Continuous editing feel" — the v1.2 fence-overlay nested editor already provides this; users will not accept a click-to-enter-edit-mode modal step. Same UX as Kanban cards, Tasks task-modal text inputs, native Obsidian table cells in Live Preview. | M | Reuses `childEditorFactory.ts` mount logic | One CM6 `EditorView` per widget. Mount target = `el` from `registerMarkdownCodeBlockProcessor(source, el, ctx)`. Focus on first user click via `view.focus()` inside `mousedown` handler. |
| TS-02 | **Caret stays inside widget while typing — does not "fall back" to source on every keystroke** | Dataview's lp-render explicitly uses **selection-overlap detection** to *strip* its decoration and reveal raw source when the cursor enters — that is acceptable for a *display* widget, NOT for an *edit* widget. Our widget owns the edit experience; the parent CM6 must NOT see the cursor inside the fence range. | M | n/a (new) | Use `EditorView.atomicRanges` facet on the parent so the parent caret skips over the replaced range entirely. Combine with `WidgetType.ignoreEvent() => false` for a fenced subset of events (mousedown, keydown when widget has focus) so the parent doesn't re-claim selection. Parent caret never enters the fence-body range. |
| TS-03 | **Cmd-Z inside widget undoes only widget edits (does not affect prose around the widget)** | This is the *direct* fix for the v1.2 "Cmd-Z leaks prior body into adjacent sections" bug class (Phase 16 D-03). Standard CM6 `history()` extension on the child gives a per-widget undo stack — same model Kanban uses (StateManager owns board state, edits don't enter the parent file's CM6 history). | S | Already wired in `childEditorFactory.ts` line ~40 (`history()` from `@codemirror/commands`) | The widget's CM6 `history()` is independent from the parent note's CM6 `history()`. Cmd-Z while focus is in widget = widget undo; Cmd-Z while focus is in surrounding prose = note undo. This is the v1.2 bug-class root cause inverted into a feature. |
| TS-04 | **Cmd-F inside widget searches widget body; Cmd-F outside searches whole note** | Direct consequence of TS-02 + TS-03 — focus scopes the keyboard. CM6's default search keymap is per-EditorView, so this is automatic if focus is correctly scoped. Same as Live Preview tables, Kanban cards. | S | n/a (default CM6) | Acceptable UX shift from v1.2. Do NOT add a custom global Cmd-F bridge — that re-creates the dual-editor coupling we are deleting. |
| TS-05 | **Edits persist to disk without explicit save (autosave)** | Excalidraw, Kanban, native Obsidian editor — none require explicit save. Excalidraw uses `autosaveTimer` + 2000ms `PREVENT_RELOAD_TIMEOUT` semaphore for self-write echo. | M | n/a (new — replaces v1.2 cm.dispatch sync) | Debounced `vault.process(file, body => rewriteFenceBody(body, newCode))`. See TS-12 for debounce window. |
| TS-06 | **Flush-on-blur and flush-on-unload — no in-flight edits lost on close, file-switch, or plugin unload** | Universal expectation. Obsidian's own `TextFileView` (which Kanban inherits) calls `save(true)` before `clear()` in `onUnloadFile`. | S | n/a (new) | Cancel pending debounce + flush sync on: widget DOM detach (`onunload` of post-processor child), file close, plugin `onunload`, app `quit` event (`workspace.on('quit')`). Critical — without this, a user typing then immediately switching files loses 300–500ms of edits. |
| TS-07 | **External edits (other pane, Obsidian Sync, CLI, vim outside Obsidian) round-trip into the widget without losing user's in-progress edits** | The whole point of v1.3 architecture: file is single source of truth. But naïve `vault.on('modify')` re-render destroys the widget editor's state if the user is mid-typing. | L | n/a (new) | Pattern: (a) On modify event, check `isSelfWrite` window (Excalidraw 2000ms). If yes, ignore. (b) If external, parse new fence body. (c) If widget editor's current doc === pre-edit body (no in-progress local edits), apply external doc to widget. (d) If widget has unsaved local edits, surface conflict (toast + "Reload from disk" / "Keep mine"). Phase 17.x already demonstrated `ECHO_PRONE_USER_EVENTS` is bug-prone — replace with timestamp window. |
| TS-08 | **Reading mode renders the same code (with same syntax highlight) as Live Preview** | Other plugins that registerMarkdownCodeBlockProcessor get this for free — same processor runs in both modes. | S | n/a (registerMarkdownCodeBlockProcessor pattern) | Reading mode mounts a read-only variant (omit `history()`, omit user-input keymap, set `EditorState.readOnly.of(true)`) but with same theme + language Compartment. Or: in Reading mode, render a static `<pre><code>` with `MarkdownRenderer.render` for the fence body. Decision deferred to architecture phase. |
| TS-09 | **Action row (Run, Submit, AI Debug, AI Solution, Reset, Retrieve) renders adjacent to widget code, in both modes** | v1.2 shipped 6-button action row; deletion is not on the table. `codeBlockButtonRow.ts` is already reusable — accepts a `Plugin & CodeBlockButtonRowHost` with the 6 method handles. | S | Reuses `codeBlockButtonRow.ts` verbatim | Mount below or above the CM6 widget in the same `el`. Reading mode shows same buttons (per existing `codeActionsPostProcessor.ts` precedent). Buttons must `e.stopPropagation()` so click doesn't bubble to parent CM6 (existing code already does this — line 60–63). |
| TS-10 | **Language chevron dropdown (Edit-Mode only — Reading-Mode hides it per existing D-09 lock)** | v1.2 shipped this with a strict Edit-Mode-only contract. Re-mount inside the widget edit instance only. | S | Reuses `languageChevronWidget.ts` | Pass via `CodeBlockButtonRowOptions.prefix` — same wiring as v1.2 nested-editor codepath. Chevron triggers `Compartment.reconfigure` on the *widget's* editor (no parent CM6 dispatch — drops the `'leetcode.lang-switch'` userEvent convention entirely). |
| TS-11 | **Vim mode toggles via Obsidian's vault config (`vault.getConfig('vimMode')`)** | v1.2 shipped this. Standard expectation: one global vim setting controls everything. | M | Reuses vim Compartment pattern from `childEditorFactory.ts` line 48 | **Confidence-correction vs PROJECT.md:** PROJECT.md states "reload-on-vim-toggle accepted." Per CodeMirror 6 docs (HIGH confidence), `vimCompartment.reconfigure(enabled ? vim() : [])` toggles at runtime *without* recreating the EditorView. Recommend: poll `vault.getConfig('vimMode')` on widget focus, dispatch reconfigure if changed. Reload-fallback only if a real-world bug forces it. Flag for roadmapper. |
| TS-12 | **Debounced disk write — 300–500ms window** | Excalidraw uses ~2000ms (heavyweight drawings); Kanban uses TextFileView's inherited save (no explicit debounce in StateManager). For text-edit cadence, 300–500ms is the sweet spot — above keystroke jitter, below "feels delayed." | S | n/a (new) | Use Obsidian's `debounce()` utility (built-in, takes `(fn, wait, resetTimer)`). Recommend 400ms. Pair with TS-06 flush-on-blur for crash safety. |
| TS-13 | **Theme tracking (light/dark and Obsidian theme variables) inside widget** | v1.2 ships `childEditorTheme.ts`. The widget must look native in both light and dark. | S | Reuses `childEditorTheme.ts` | Already wired through Obsidian semantic CSS variables; no change needed. |
| TS-14 | **Bracket auto-close, smart Enter, Cmd-/ comment toggle, Tab/Shift-Tab indent** | All of v1.2's Phase 13–18 keystroke handling. | S | Reuses `childEditorFactory.ts` (closeBracketsKeymap, custom Tab handler, language-Compartment-driven comment binding) | Drop-in. The Phase 16 fix that wired Cmd-/ via `app.keymap` Scope on focus (not DOM listener) carries over verbatim. |
| TS-15 | **Bracket match highlighting + relative line numbers (when enabled)** | v1.2 features. | S | Reuses `bracketMatching()` + line numbers gutter from `childEditorFactory.ts` | Settings flag for relative line numbers already exists. |
| TS-16 | **Active line highlighting + Obsidian-native selection drawing** | Standard CM6 polish. v1.2 has it (`drawSelection()`, `highlightActiveLine()` already in factory). | S | Drop-in | n/a |
| TS-17 | **Reading-mode parity for action buttons (Run / Submit etc. work without entering edit mode)** | v1.2 ships `codeActionsPostProcessor.ts` for this. Users practice on iPad-Obsidian-via-Sync where Live Preview / Reading toggle is common; buttons must work in both. | S | Reuses post-processor | The processor already keys off the fence language tag — same pattern works for the new fence tag. |
| TS-18 | **Widget renders correctly when fence is the first or last line of file, when adjacent to other fences, and when nested inside callout/blockquote** | Edge cases that broke v1.2 fence-recovery. registerMarkdownCodeBlockProcessor handles these by design (Obsidian parses the markdown tree first, processor runs per-block). | S | n/a (free with the new architecture) | This is one of the bug-class wins of v1.3 — fence-edge cases stop being a custom CM6 problem. |

### Differentiators (LeetCode-Specific UX Wins)

These are not strict prerequisites for shipping v1.3, but they exploit the inline-widget architecture in ways generic plugins do not, and they reinforce the project's Core Value ("every problem becomes a first-class note"). Each is optional for the v1.3 milestone — flag in roadmap as "ship in v1.3" or "v1.3.x follow-up."

| # | Feature | Value Proposition | Complexity | Depends on v1.2 | Notes |
|---|---------|-------------------|------------|-----------------|-------|
| DF-01 | **Fence tag carries language slug** (e.g. ` ```leetcode-solve python ` ) | Self-describing source — opening the .md file in any other markdown viewer (GitHub, VSCode preview) shows correct syntax-highlighted code. Solves a v1.2 problem where language was in frontmatter `lc-language` and out-of-band from the fence. | S | Replaces frontmatter lookup | Parse `info` string in code-block processor: `processor((source, el, ctx) => { const lang = ctx.getSectionInfo(el)?.text.split('\n')[0]; ... })`. Migration: see MIG-01 below. |
| DF-02 | **Cursor "exits down" the widget moves to the line after the fence (and "exits up" moves above)** | When user reaches end of code with arrow-down, focus naturally returns to the parent note. Same UX as native Obsidian tables. | M | n/a (new) | CM6 keymap on widget: `ArrowDown` at last line + `ArrowUp` at first line dispatch a custom event the post-processor listens for and calls `parentMarkdownView.editor.focus()` + `setCursor` to the line outside the widget. Polish item — defer if Phase 1 timing is tight. |
| DF-03 | **Visible "edited externally / reload?" toast on conflict (TS-07's UX surface)** | When TS-07 detects external edits + local unsaved widget state, give the user agency. Obsidian's `Notice` API + `Setting.addButton` is the idiomatic surface. | S | Builds on TS-07 | Two buttons: "Reload from disk (discard my edits)" / "Keep my edits (overwrite next save)". Default action = keep mine, with 10s auto-dismiss. |
| DF-04 | **In-widget verdict badge** (after Submit returns, render Accepted/Wrong-Answer chip inside widget header) | Tighter feedback loop than the v1.2 modal-only verdict. The widget already owns the action row — verdict result lives next to the button that produced it. | S | Reuses Submit verdict types from `solve/` | Optional but high-leverage — exploits the new single-host architecture. Could be deferred to v1.3.x. |
| DF-05 | **Widget header shows current language slug, problem title link, and difficulty pill** | Single-glance context — user opens the note, sees `[Two Sum] · Easy · python` at top of widget. | S | Reuses problem metadata from frontmatter | Nice-to-have. Defer if scope tight. |
| DF-06 | **Per-widget AI Debug stays scoped to that widget's code** | When the note has multiple `leetcode-solve` fences (rare but possible — alternate language attempts), AI Debug only sees the fence the button was clicked from. | S | Refactor existing AI Debug to take fence-body as arg | Already mostly there; widget host already isolates per-widget state. |
| DF-07 | **Code-block "Copy" button copies just the fence body (no markdown fence syntax)** | v1.2 likely already does this; flagged as table-stakes-adjacent. | S | Reuses existing Copy handler | Verify in implementation. |

### Anti-Features (Commonly Requested, Often Problematic)

Things that would seem to make the widget "more like the v1.2 nested-editor experience" or "smarter" but reintroduce the bug class v1.3 is built to delete. **The roadmap must explicitly forbid these in REQUIREMENTS.md.**

| # | Anti-Feature | Why Requested | Why Problematic | Alternative |
|---|--------------|---------------|-----------------|-------------|
| AF-01 | **Bidirectional sync — parent CM6 edits inside the fence range mirror to widget** | "What if the user edits the file via vim outside Obsidian, then comes back?" | This *is* the v1.2 architecture. It is the entire reason v1.3 exists. The "external edit reconciles into widget" path (TS-07) is one-way *file → widget*; the parent CM6 never participates. | TS-07: vault.on('modify') with self-write suppression window. Parent CM6 does not own the fence body. |
| AF-02 | **Auto-rewrite all v1.2 notes on plugin load** | "Migration should be automatic and complete." | Same risk class as v1.0→v1.1 Techniques rewrite that PROJECT.md "Out of Scope" already forbids. Rewriting hundreds of notes on plugin load (a) blocks startup, (b) creates a single mass-modification commit in user's vault history, (c) breaks if the plugin crashes mid-loop, (d) cannot be undone safely. | MIG-01 below: **lazy-on-open with dual-render fallback**. |
| AF-03 | **Section locking inside the widget body** | v1.2 has section-lock for `## Code` heading + fence opener; users might think they need it. | The widget body IS the entire writable surface — there is no plugin-owned region inside it to lock. Locking inside the widget recreates `sectionLockExtension.ts` which v1.3 PROJECT.md explicitly deletes. | The widget *boundary* is the lock — parent CM6's `atomicRanges` facet (TS-02) is the only lock needed. |
| AF-04 | **A `'leetcode.*'` userEvent annotation convention for plugin dispatches into the widget** | v1.2 codebase has the convention; existing plugin developers (and Claude!) will reach for it reflexively. | The widget has its own EditorView and its own changeFilter (or none). Plugin writes go through `vault.process` (which propagates back through TS-07's normal path). No userEvent bypass channel. | Plugin dispatches into widget (e.g. Reset child) call `widget.cm.dispatch({ changes: ..., annotations: addToHistory.of(true) })` directly; no userEvent signaling needed because no changeFilter exists. |
| AF-05 | **Render widget identically in source mode (raw markdown view)** | "Consistency across all 3 modes." | Source mode IS raw markdown by definition — a widget there hides the fence syntax the user explicitly opened source mode to see. Dataview lp-render correctly bails when not in `editorLivePreviewField`. | Source mode shows raw fence (no widget). Live Preview + Reading mode show the widget. Three-mode parity is wrong; two-mode parity is correct. |
| AF-06 | **Render two widgets side-by-side for old `## Code` block + new fence during migration** | "Make it visible to the user that we're migrating." | Confusing UI — user can't tell which one is canonical, double action rows fight for clicks, scrolls awkwardly. | MIG-01: detect old format, render widget as-if migrated (read old code into widget), but defer the actual file rewrite until first edit. |
| AF-07 | **Auto-debounce the language switch** | "Don't reconfigure on every chevron flicker." | The chevron dispatches one event per click — no flicker. Debouncing it adds latency for no benefit. | Direct `Compartment.reconfigure` on click (existing v1.2 pattern). |
| AF-08 | **In-widget Cmd-S "save now" button** | "Users want manual save control." | Autosave + flush-on-blur (TS-05, TS-06) cover every case where a manual save would matter. A button creates a learned habit users don't need. Excalidraw, Kanban, every other autosave plugin omits this. | None. Just don't ship it. |
| AF-09 | **Visible loading skeleton inside widget on file open** | "Async mount feels janky without a placeholder." | The CM6 mount is synchronous (sub-frame). A skeleton flashes for one tick and feels worse than nothing. | Mount synchronously in the post-processor callback; skip the skeleton. |
| AF-10 | **Persist widget editor scroll position to frontmatter or data.json** | "If the code is long, restore where I was." | Long code in a LeetCode solution is rare; persistence adds a write per scroll; recovery on file reopen is undefined when language changed. | Don't persist. Fresh mount = top of code. |
| AF-11 | **Multi-cursor support across widget + parent prose** | "Power users want to edit code and surrounding prose simultaneously." | The two CM6 instances are independent — there is no shared selection model. Pretending otherwise rebuilds the v1.2 sync layer. | Standard single-editor multi-cursor inside whichever editor has focus. Cross-editor multi-cursor is out of scope. |

---

## Migration Strategy (v1.2 → v1.3 Notes)

This is the highest-risk surface in v1.3 — botching it corrupts user vaults. Recommendation grounded in the v1.0→v1.1 Techniques migration precedent (lazy-on-AC, never batch-rewrite) listed in PROJECT.md Key Decisions, plus general Obsidian plugin community practice.

### MIG-01: Lazy-on-Open with Dual-Render Fallback (RECOMMENDED)

**Trigger:** Plugin load — does *nothing* to existing files. Migration triggers per-file when the file is opened in Obsidian after the v1.3 plugin update.

**Detection:**
- v1.2 format: `## Code\n\n` followed by a code fence with no special tag (just `python` or `java`), and frontmatter has `lc-language` field.
- v1.3 format: `## Code\n\n` followed by a code fence with the `leetcode-solve` tag (e.g. ` ```leetcode-solve python `).

**Render path:**
- v1.3 fence found → register the new code-block processor; widget renders.
- v1.2 fence found → register a *transitional* code-block processor for the bare-language fence inside a `## Code` section. The v1.2 fence renders the widget in **read-mostly** mode; on the first user keystroke (or first action button click that mutates code, e.g. Reset, Retrieve), the widget calls `vault.process` to:
  1. Rewrite the fence opener: ` ```python ` → ` ```leetcode-solve python `.
  2. Optionally remove the now-redundant `lc-language` frontmatter key (or leave it for backwards compatibility — recommend leave; cost is one frontmatter line).
- Then the file is in v1.3 format and the v1.3 processor takes over on next render.

**Why this works:**
- Plugin load is unchanged — no startup blocking, no mass-write commit.
- User who opens a v1.2 note and reads it without editing pays no migration cost.
- User who opens and edits gets atomic per-file migration triggered by their own action — they implicitly consent.
- A user opening a v1.2 note before the rewrite trigger sees the widget (read-mostly; same buttons; same code) — they cannot tell the file is unmigrated. This satisfies the PROJECT.md constraint "existing v1.2 notes must remain readable/editable."
- A plugin crash during rewrite is bounded to one file; `vault.process` is atomic.

**Edge case — heading-detection:** v1.2 fence inside `## Code` is the migration target. A bare `python` fence elsewhere in a non-LeetCode note must NOT be hijacked. Disambiguation: only run the transitional processor when the surrounding section is `## Code` AND the file has `leetcode-id` (or equivalent canonical LC frontmatter) in frontmatter. Both checks are cheap and `MarkdownPostProcessorContext.frontmatter` exposes the second directly.

### MIG-02: Manual Migration Command (FALLBACK)

Add a command palette entry: `LeetCode: Migrate this note to v1.3 format`. Operates only on the active file. For users who want explicit control, or for notes that the dual-render somehow misidentifies. Low complexity (re-uses MIG-01's rewrite logic).

### Migration Anti-Patterns (forbidden — see AF-02, AF-06)

- **AF-02:** Eager batch rewrite on plugin load — forbidden.
- **AF-06:** Side-by-side dual-widget — forbidden.
- **Format-version frontmatter key** (e.g. `lc-format-version: 1.3`) — *not* needed; the fence syntax itself is self-identifying. Adding the frontmatter key adds a write surface for no detection benefit.

---

## Feature Dependencies

```
TS-02 (caret stays in widget — atomicRanges)
    └──enables──> TS-03 (Cmd-Z scoped to widget)
    └──enables──> TS-04 (Cmd-F scoped to widget)
    └──enables──> AF-01 prevention (no parent-CM6 sync of fence body)

TS-05 (autosave debounce)
    └──requires──> TS-12 (debounce window 300–500ms)
    └──requires──> TS-06 (flush-on-blur/unload — closes the data-loss window)

TS-07 (external edit reconciliation)
    └──requires──> self-write suppression flag (Excalidraw 2000ms semaphore pattern)
    └──requires──> TS-05 + TS-12 (need to know "did we just write this")
    └──enhances──> DF-03 (conflict toast)

TS-08 (Live Preview + Reading mode parity)
    └──requires──> registerMarkdownCodeBlockProcessor (registers for both)
    └──conflicts──> AF-05 (3-mode parity is wrong)

TS-11 (vim mode toggle)
    └──enabled-by──> CM6 Compartment pattern (already in childEditorFactory.ts)
    └──contradicts──> PROJECT.md "reload-on-vim-toggle accepted"
        (Compartment.reconfigure is sufficient; reload not needed)

TS-09, TS-10 (action row + chevron)
    └──reuses──> codeBlockButtonRow.ts (existing)
    └──reuses──> languageChevronWidget.ts (existing)

DF-01 (fence tag carries language)
    └──enables──> MIG-01 (detection logic)
    └──conflicts──> v1.2 lc-language frontmatter key (recommend leave-alone, ignore)

MIG-01 (lazy-on-open migration)
    └──conflicts──> AF-02 (eager batch)
    └──conflicts──> AF-06 (dual-widget side-by-side)
```

### Dependency Notes

- **TS-02 is the load-bearing facet** — atomicRanges is what stops the widget from behaving like Dataview's lp-render (cursor enters → strip widget → fall back to source). Without it, every other table-stakes item breaks.
- **TS-06 is the reason TS-05 is safe** — debounced autosave alone is a data-loss bug. Flush-on-blur/unload turns it into "saves frequently and on every transition."
- **TS-11 (vim) needs a confidence-correction relative to PROJECT.md** — see "Open Questions for Roadmap" below.
- **MIG-01's edge-case disambiguation** (require `## Code` section + LC frontmatter) is the single most important detail to carry forward to REQUIREMENTS.md. Get it wrong → hijack non-LC code blocks across the whole vault.

---

## MVP Definition

### Launch With (v1.3.0)

**Required for v1.3 to be a non-regression vs v1.2.** Failing any one of these means users will roll back.

- [ ] TS-01 through TS-18 (every table stakes item)
- [ ] MIG-01 (lazy-on-open migration with dual-render of v1.2 notes as widgets)
- [ ] All AF-* explicitly NOT shipped (REQUIREMENTS.md anti-feature list)

### Add After Validation (v1.3.x patch series)

Differentiators that exploit the new architecture but are not strictly required to claim feature parity.

- [ ] DF-02 — Arrow-down/up exits widget (UX polish)
- [ ] DF-03 — External-edit conflict toast (only if real-world conflicts surface in field)
- [ ] DF-04 — In-widget verdict badge
- [ ] DF-05 — Widget header (title + difficulty pill)
- [ ] DF-06 — Per-widget AI Debug scope (refactor of existing)

### Future Consideration (v1.4+)

- [ ] DF-07 if not already covered by v1.2 Copy
- [ ] Multi-language widgets per note (multiple `leetcode-solve` fences with separate language tags) — only if user demand surfaces
- [ ] MIG-02 manual migration command — only if MIG-01's heuristic misclassifies in the wild

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-01 click→focus→type | HIGH | MEDIUM | P1 |
| TS-02 atomicRanges (caret stays in widget) | HIGH | MEDIUM | P1 |
| TS-03 Cmd-Z scoped to widget | HIGH | LOW (default CM6) | P1 |
| TS-05 autosave debounce | HIGH | MEDIUM | P1 |
| TS-06 flush-on-blur/unload | HIGH (data safety) | LOW | P1 |
| TS-07 external edit reconciliation | HIGH | HIGH | P1 |
| TS-08 Live Preview + Reading parity | HIGH | LOW (free with processor) | P1 |
| TS-09 action row | HIGH (regression risk) | LOW (reuse) | P1 |
| TS-11 vim mode toggle | MEDIUM | LOW (Compartment) | P1 |
| TS-12 debounce window 300–500ms | HIGH | LOW | P1 |
| TS-13 through TS-18 (theme, brackets, etc.) | HIGH (regression risk) | LOW (reuse) | P1 |
| MIG-01 lazy-on-open migration | HIGH (vault safety) | MEDIUM | P1 |
| DF-01 fence tag carries language | MEDIUM | LOW | P1 (needed for MIG-01 detection) |
| DF-02 arrow-exit widget | MEDIUM | MEDIUM | P2 |
| DF-03 conflict toast | MEDIUM | LOW | P2 |
| DF-04 verdict badge | MEDIUM | LOW | P2 |
| DF-05 widget header | LOW | LOW | P3 |
| MIG-02 manual command | LOW | LOW | P3 |

---

## Reference Plugins / Comparator Analysis

| Behavior | Dataview lp-render (display widget) | Kanban (full view replacement) | Excalidraw (full view replacement) | Tasks (post-processor + LP extension) | Our v1.3 widget (target) |
|----------|-------------------------------------|--------------------------------|-------------------------------------|---------------------------------------|--------------------------|
| Inline in note? | YES (inline-code) | NO (replaces view) | NO (replaces view) | YES for `tasks` queries (read-only) | YES (fence widget) |
| Editable inline? | NO — strips on cursor entry, falls back to source | N/A (own UI) | N/A (own UI) | NO — opens modal for edits | **YES** (this is the differentiator) |
| Live Preview + Reading parity? | YES | N/A | N/A | YES (separate paths but same output) | YES (one processor) |
| Cursor handling | Selection-overlap → strip widget → reveal source | n/a (custom view) | n/a (custom view) | Read-only widget — cursor doesn't enter | atomicRanges → caret skips fence range; widget owns its own selection |
| Persistence | n/a (read-only) | StateManager + `vault.modify` (no explicit debounce in StateManager — TextFileView inherits save) | autosaveTimer + `PREVENT_RELOAD_TIMEOUT = 2000ms` | Modal commits via vault | Debounced 400ms `vault.process` + flush-on-blur |
| External edit handling | Re-renders on metadataCache events | Reparse with `shouldSave: false` flag | 2000ms self-write suppression semaphore | Cache-driven; reactive | Self-write suppression window + conflict toast (DF-03) |
| Undo scope | n/a (read-only) | StateManager owns model | Excalidraw owns model | Modal owns transient state | Per-widget CM6 history; parent note CM6 history independent |
| Vim mode | n/a | n/a | n/a | n/a | Compartment.reconfigure on focus |

**Direct lessons:**
1. **Dataview's inline pattern is the wrong model for us** — they explicitly fall back to source; we explicitly do not (we are an *edit* widget, not a *display* widget). Knowing this maps the architecture: Dataview *omits* atomicRanges; we *require* atomicRanges.
2. **Excalidraw's 2000ms self-write semaphore is the canonical pattern** for external-edit reconciliation (TS-07). Adopt it.
3. **Kanban's reparse-with-`shouldSave: false`** is the canonical pattern for breaking the write-modify-write echo loop. Adopt it.
4. **Tasks' approach (read-only widget + edit-modal)** is the *anti-pattern* to avoid. Modal-edit destroys the "code lives in the note" UX promise.

---

## Open Questions for Roadmap

These are flagged for the roadmapper / synthesizer because they need a phase-level decision, not a research answer.

1. **Reading-mode widget: live CM6 (read-only) or static `<pre><code>`?** TS-08 — both work. Live CM6 keeps theme + language switching working identically; static is simpler. Recommend live CM6 (single code path) but flag as architecture decision.

2. **Vim-toggle: live `Compartment.reconfigure` or reload-fallback?** TS-11 — PROJECT.md accepts reload, but evidence (CM6 docs HIGH confidence + existing `languageCompartment` pattern in codebase MEDIUM-HIGH confidence) suggests Compartment is sufficient. Roadmap should select live-reconfigure as P1 with reload as P3 fallback if a real bug surfaces.

3. **Migration MIG-01 edge case — what about notes with multiple LeetCode `## Code` blocks?** Rare but possible (alternate language attempts). Two approaches: (a) migrate all fences in the file in a single `vault.process` (atomic), or (b) migrate per-fence on first edit-of-that-fence. Recommend (a) — atomic per-file is consistent.

4. **Action-row layout in Reading mode — same as Live Preview, or simplified?** v1.2 currently shows full action row in both modes. Continue or simplify in Reading mode? Recommend continue — users practice in Reading mode and need Run/Submit there.

5. **First-edit autosave write — should the v1.2-format fence rewrite (MIG-01) and the user's first character both land in the same `vault.process` callback, or in two separate writes?** One write is cleaner but couples migration to typing. Recommend one write — atomic, and the write was going to happen anyway.

6. **`onunload` flush window** — TS-06 requires a sync-ish flush, but Obsidian's `onunload` is async-tolerant. Worst case: user force-quits Obsidian. Is the 400ms window of risk acceptable? Recommend yes, with the workspace `quit` event as belt-and-suspenders.

---

## Sources

| Source | Confidence | Notes |
|--------|-----------|-------|
| Obsidian developer docs (`Plugins/Vault`, `Plugins/Editor/Decorations`, `Plugins/Editor/Markdown post processing`) — fetched via Context7 `/websites/obsidian_md_plugins` 2026-05-28 | HIGH | Confirms `Vault.process` preferred over `Vault.modify`; confirms `registerMarkdownCodeBlockProcessor` works in both Live Preview and Reading. |
| `blacksmithgu/obsidian-dataview/src/ui/lp-render.ts` — fetched via gh raw 2026-05-28 | HIGH | Direct source: cursor-overlap → strip-decoration pattern (the *wrong* pattern for us — see comparator). Confirms `editorLivePreviewField`-gated rendering. |
| `mgmeyers/obsidian-kanban/src/main.ts` + `src/StateManager.ts` + `src/KanbanView.tsx` | MEDIUM-HIGH | Reparse-with-`shouldSave: false` pattern (echo-loop break) confirmed. Debounce window not visible in StateManager (delegated to TextFileView's inherited `requestSave`). |
| `zsviczian/obsidian-excalidraw-plugin/src/view/ExcalidrawView.ts` | MEDIUM | First 1000 lines fetched; `PREVENT_RELOAD_TIMEOUT = 2000ms` semaphore confirmed by symbol presence; full handler logic not directly read. |
| CodeMirror 6 reference docs — `Decoration.replace`, `EditorView.atomicRanges`, `WidgetType.ignoreEvent`, `Compartment` — codemirror.net 2026-05-28 | HIGH | Authoritative; confirms atomicRanges + ignoreEvent semantics, confirms Compartment.reconfigure for runtime vim toggling. |
| `@replit/codemirror-vim` README | MEDIUM | Confirms vim() returns standard CM6 extension wrappable in Compartment. README does not document toggling but CM6 Compartment pattern is universal. |
| v1.2 codebase: `src/main/childEditorFactory.ts`, `src/main/codeBlockButtonRow.ts`, `src/main/childEditorLanguage.ts`, `src/main.ts` | HIGH | Verified existing v1.2 features that v1.3 must re-mount: 8 languages via Compartment, vim, action row, chevron, indent/bracket/comment rules, theme tracking. |
| PROJECT.md (current state, key decisions, out-of-scope) | HIGH | Source of truth for v1.3 milestone goal, deletion targets, and prior-version migration discipline (lazy-on-AC v1.0→v1.1 Techniques precedent). |

### Confidence Caveats

- **Dataview lp-render** is read directly — HIGH confidence on the cursor-fallback pattern.
- **Kanban debounce window** is *not* directly visible in fetched files — Kanban inherits `TextFileView.requestSave` whose internal debounce was not retrievable. Treat the "no explicit debounce" claim as MEDIUM.
- **Excalidraw 2000ms** is inferred from constant name + semaphore field presence; full handler logic not read end-to-end. The 2000ms value is HIGH confidence; the *exact* echo-suppression logic is MEDIUM.
- **`@replit/codemirror-vim` Compartment toggle** is HIGH confidence based on CM6 Compartment semantics + the fact that vim() returns a standard extension; not directly verified on a running editor with this exact library version, but no plausible reason it would fail.

---

*Feature research for: Obsidian LeetCode v1.3 inline-widget architecture*
*Researched: 2026-05-28*
*Author: gsd-project-researcher*
