# Pitfalls Research — v1.3 Inline Widget + One-Way Sync

**Domain:** Obsidian plugin migrating from a dual-CM6 nested editor (v1.2) to an inline `registerMarkdownCodeBlockProcessor` widget driven by debounced one-way sync (`widget edits → vault.process` rewrite). Reading mode + Live Preview rendered by the widget; Source mode shows raw fence.
**Researched:** 2026-05-28
**Confidence:** HIGH for areas backed by Obsidian docs (`registerMarkdownCodeBlockProcessor`, `MarkdownPostProcessorContext.getSectionInfo`, `Vault.process`, `vault.on('modify')`, CM6 widget lifecycle); MEDIUM for v1.3-novel patterns where v1.2 lessons-learned + community-plugin precedent (Dataview, Excalidraw, Kanban, Advanced Tables) inform extrapolation.

---

> **Scope note.** This document covers v1.3 milestone pitfalls only — the inline-widget + one-way sync architecture replacing v1.2's dual-editor model. v1.2 pitfalls remain archived; pitfalls below are those NEW to v1.3 OR carried over because the same failure mode reappears under different mechanics. The repeated-mistake pitfalls (P9, P14, P19, P20) explicitly call out the v1.2 ancestor so the team avoids reliving the same bug class with different surface symptoms.

> **Lessons learned from v1.2 that drive v1.3 design.** Cmd-Z leaks across editor boundaries → fixed by single source of truth (widget owns the doc, parent file is passive). Locked-range dispatches dropping plugin writes silently → fixed by removing section lock. Fence-closer merge on empty deletions → fixed because there is no fence-closer-merge logic; the widget owns its own buffer. Trailing-newline normalization divergence → fixed by canonical serialization at the sync boundary. Cursor visibility on re-focus → still relevant (widget focus model). Vim keystroke routing → still relevant (vim runs inside the widget; toggle now requires reload). Fence auto-recovery after non-CM6 edits → simplified: no recovery needed because `vault.on('modify')` triggers a full widget rebuild from disk.

---

## Critical Pitfalls

### Pitfall 1: Self-Write Echo Without Suppression Window — Widget Reloads Mid-Edit

**What goes wrong:**
The widget debounces user edits and calls `app.vault.process(file, data => rewriteFenceBody(data, newCode))`. This atomic write fires `vault.on('modify')`. The plugin's modify-listener detects the file changed and rebuilds the widget from disk. But the user is still typing — the rebuild lands a stale version of the doc into the widget, clobbering keystrokes that arrived between the debounce flush and the modify event. In the worst case: every flush triggers a self-rebuild, the widget cursor jumps to position 0, and the user's typing produces garbled output.

**Why it happens:**
`vault.on('modify')` does not distinguish plugin writes from external writes. There is no `userEvent`-style annotation on vault events. The plugin must layer its own suppression: when it calls `vault.process`, it must record an "expected next modify event for `file.path`" and skip the rebuild for that one event. Naive implementations get this wrong in three ways:
1. **Boolean flag, no path scoping.** `this.isWriting = true` set before `vault.process`, cleared after — but if two files are mid-flush, the flag from file A swallows the modify event for file B.
2. **Setting the flag synchronously around the await.** `vault.process` is async; the modify event fires AFTER the await resolves. If the flag is cleared in the same `await` block, the modify event arrives a tick later and finds the flag false.
3. **No timeout on the suppression entry.** If `vault.process` succeeds but the modify event never fires (rare, but possible with iCloud/Dropbox shimming the file), the suppression entry leaks and the next genuine external edit is silently dropped.

**Consequences:**
- Typing produces garbled / lost characters every 300–500 ms (debounce flush triggers self-rebuild)
- iCloud/Dropbox/Git external edits are silently dropped (suppression entry stuck on)
- "Conflict" notice fires on every keystroke flush
- Plugin appears to randomly reset the user's code

**How to avoid:**
- **Use a per-path expectation map keyed by content hash, not a boolean.** `Map<string, { expectedHash: string, expiresAt: number }>`. Before `vault.process`, compute the hash of the new content, store `{ filePath → expectedHash }` with a 2-second timeout. In `vault.on('modify')`, hash the new file content and check: if it matches the expected hash for this path, drop the entry and skip rebuild. If it doesn't match (or the entry is stale beyond timeout), treat as external edit and reload.
- **Hash the post-write content, not the input string.** `Vault.process` may add trailing newlines, normalize line endings, or merge with concurrent writes. Compute the hash from `await vault.read(file)` after the process completes, or capture it from the `process` callback's return value before resolving.
- **Always set the timeout.** Even a perfectly-paired modify event can be delayed by Obsidian Sync, OS file-watcher debouncing, or anti-virus scans. 2 seconds is generous; 5 is safe; "never expire" is wrong.
- **Reset suppression on plugin reload / file rename.** `onunload()` clears the map; `vault.on('rename', oldPath → newPath)` re-keys entries.

**Warning signs:**
- Test suite has no test for "two flushes within 100ms across two notes"
- Suppression code is a single boolean named `this.isWriting`
- No content-hash comparison in the modify handler
- The modify handler does not log when it suppresses vs. reloads

**Phase to address:** Phase 01 (Foundation: widget mount + sync layer). The suppression-window mechanism MUST land in the same plan as the first one-way write — never "we'll add this later."

---

### Pitfall 2: Multi-Pane Coherence — Edit in Pane A, Stale Widget in Pane B

**What goes wrong:**
The user opens `LeetCode/1-two-sum.md` in two panes (Cmd-click "Open in new pane"). Both panes mount their own widget instance. The user types in pane A. Debounced flush rewrites the file. `vault.on('modify')` fires. The pane A widget recognizes its own write (suppression matches) and skips rebuild. The pane B widget sees the modify event, but its hash doesn't match (it never wrote anything), so it correctly reloads from disk. Good — until pane B is mid-edit. Now pane B's reload clobbers pane B's pending typing. Or the panes end up in a flush-race where each pane's flush invalidates the other's local edits.

**Why it happens:**
Obsidian's canonical multi-pane pattern is "the file is the source of truth; views reconcile on `modify`." For markdown notes, the parent CM6 EditorView in each pane handles this internally via Obsidian's file-buffer infrastructure. But a code-block widget owns its own state OUTSIDE that infrastructure. There is no built-in "pane B's widget should mirror pane A's widget" channel — each widget reads/writes the file independently.

**The deeper problem:** with one-way sync (widget → file), if both panes are accepting edits, the file becomes a contested resource. Last write wins, and "lost" edits in pane B are simply gone — they were never persisted because pane A's flush landed first and pane B's reload reverted them.

**Consequences:**
- User loses code typed in one pane when the other pane flushes
- "Why did my code revert?" support tickets
- Race between panes can produce truncated / interleaved code
- If panes are open across multiple devices via Obsidian Sync, the problem compounds (network latency adds to the race window)

**How to avoid:**
- **Designate one widget per file as the "live" editor; others render read-only or as a mirror.** Detect via a plugin-level `Map<string, WidgetInstance>` keyed by `file.path`. The first widget to mount becomes live; subsequent mounts on the same path render in mirror mode (display-only, no input). When the live widget unmounts, the next mounted widget is promoted.
- **Mirror-mode widgets reload from disk on every `modify` event** (no suppression check — they want to see all changes including the live widget's writes).
- **When a mirror widget gains focus** (user clicks into pane B), promote it to live: pull current content from disk, demote pane A's widget to mirror, transfer the "live" registry entry. Show a brief Notice: "Editing in this pane now."
- **Alternative (simpler, accepted UX cost):** allow only one widget per file at a time. Second pane opens and shows "Code editor is active in another pane" with a "Take over" button. This eliminates the race entirely at the cost of multi-pane convenience.
- **Verify across Obsidian Sync.** If pane A is on Mac and pane B is on Windows via Sync, the modify event in pane B is delivered with significant latency (seconds, not milliseconds). The mirror-mode reload still works, but in-flight typing on the slower device is more vulnerable to clobber. Document this as a known limitation.

**Warning signs:**
- No `widgetRegistry` keyed by file path on the plugin instance
- Two widgets for the same file both accept input simultaneously
- Test suite does not include a "two panes, same file, type in both" scenario
- "Live" status not visible to the user (no visual indicator of which pane owns the buffer)

**Phase to address:** Phase 02 (Multi-pane + external-edit reconciliation). Must land before any general-availability release; single-pane-only is acceptable for early development phases but ships as a regression vs. v1.2.

---

### Pitfall 3: Live Preview Raw-Source Reveal — Cursor Lands in Fence Range

**What goes wrong:**
Obsidian Live Preview renders a `registerMarkdownCodeBlockProcessor` widget when the cursor is OUTSIDE the fence range. When the cursor enters the fence range (e.g., user clicks on a line that turns out to be inside the code block, or arrows down from `## Problem`), Obsidian unmounts the widget and shows raw markdown — opener line, body, closer line — for direct editing. This is documented Live Preview behavior for any widget-based code-block processor (Dataview, Mermaid, etc.).

For v1.3 this creates several problems:
1. **Widget unmount mid-edit:** the user is typing in the widget's child CM6, presses up-arrow at the top of the widget, the parent CM6 cursor lands on the opener line, widget unmounts, child CM6 state (cursor, scroll, selection) is destroyed.
2. **Cursor jump artifacts:** when the cursor leaves the widget and the widget remounts, the parent cursor position may land mid-fence (now visible because the widget is gone), then on next keystroke the widget remounts and the cursor "snaps" to a new position.
3. **Unmount/remount thrash on adjacent typing:** user types in the paragraph immediately above the widget. Each keystroke is a parent CM6 transaction. If the parent's cursor proximity to the widget triggers Live Preview "near a widget" logic, the widget rebuilds. Each rebuild calls the registered handler, which mounts a fresh child CM6 — child state lost.
4. **Click-to-edit confusion:** user clicks on the rendered widget expecting to edit. Obsidian Live Preview interprets the click as "user wants to edit raw markdown here" — widget unmounts, user is now editing the fence body as plain text. Re-clicking elsewhere remounts the widget, but the in-flight raw edit may still be in the doc.

**Why it happens:**
`registerMarkdownCodeBlockProcessor` is a Reading-mode primitive that Obsidian extended to Live Preview. Live Preview's heuristic: "if the cursor is inside the rendered range, show raw markdown so the user can edit." The plugin has no API to override this — the unmount is mandated by Obsidian.

The deeper issue: in v1.2, the team controlled the rendering directly via CM6 decorations and could fight the unfold logic. In v1.3, control is surrendered to Obsidian's processor pipeline.

**Consequences:**
- Up-arrow at top of code editor destroys widget state (scroll, cursor, selection, undo history of the in-memory child)
- Typing in adjacent paragraphs causes widget thrash and visible flashing
- Unintentional raw-fence editing creates malformed code that the widget's next remount must parse and recover from
- Cmd-Z in the parent (focus outside widget) may undo widget's flushed write but the widget already shows the post-write state — divergence between displayed and on-disk content

**How to avoid:**
- **Make the widget's child CM6 state PERSISTENT across unmount/remount.** Plugin-level `Map<string, ChildEditorState>` keyed by `${file.path}::${fenceIdentity}`. On `widget.toDOM`, look up existing state; if found, hydrate (cursor, scroll, content) and continue. On unmount (handle via `MarkdownRenderChild` lifecycle), DETACH but don't destroy — write current state back to the map with a 30-second TTL.
- **Use `ctx.addChild(new MarkdownRenderChild(el))` for lifecycle hooks.** The `MarkdownRenderChild.onunload()` hook is the correct place to capture state before unmount.
- **Treat Live Preview unmount as "blur," not "close."** A blurred widget still owns its in-memory state; remount restores. The widget is "closed" only when the file closes or the plugin unloads.
- **Flush on detach.** In `MarkdownRenderChild.onunload()`, force a synchronous `vault.process` flush of any pending debounced edits. This guarantees that even if state hydration on remount fails, the disk version is current.
- **Document the click-to-edit behavior.** README: "Live Preview reveals raw markdown when you click directly on the code editor. Click outside the editor to re-render. To edit code, click into the editor and start typing — the editor catches input before Live Preview can unmount it." (Or: investigate if `el.addEventListener('mousedown', e => e.stopPropagation())` on the widget's root element prevents Obsidian's cursor-place behavior. Empirical test required.)
- **Test in both Live Preview AND Reading Mode AND Source Mode.** Source Mode shows raw fence (no widget) by design — user sees the same `\`\`\`leetcode-solve` opener as in any other code block. Behavior must degrade gracefully.

**Warning signs:**
- Code mounts a new child CM6 EditorView in `toDOM()` without checking a registry
- `MarkdownRenderChild` is not used for cleanup
- No flush-on-unload in the widget lifecycle
- Test plan does not include "type in adjacent paragraph and verify widget does not flash"
- Test plan does not include "up-arrow out of widget, down-arrow back into widget, verify content preserved"

**Phase to address:** Phase 01 (Foundation: widget mount + lifecycle). The persistence-across-unmount design is the foundational architectural decision — must be settled before any sync work begins. This is the v1.3 analog of v1.2 Pitfall 1 (Widget Destruction on Parent Transaction), and the SAME mistake will reappear if not designed in from day one.

---

### Pitfall 4: Debounce Window Edge Cases — Process Kill Loses In-Flight Edits

**What goes wrong:**
Debounce window is 300–500 ms. User types 5 characters, then quits Obsidian (Cmd-Q), or kills the process (Force Quit), or switches to a different note before the timer fires, or the laptop runs out of battery. The 5 characters were never persisted. On next open, the file shows the last flushed version. The user expected "everything I typed is saved."

The user-perceived contract for "Obsidian saves my notes" is implicit and violation-sensitive. Markdown editing in normal Obsidian flushes on every keystroke (via the parent CM6 buffer + Obsidian's autosave). v1.3 introduces a 300–500 ms gap — in a 60-WPM typing session that is 4–6 characters consistently at risk.

**Why it happens:**
Debouncing is essential to avoid file-watcher storms (see Pitfall 12), but every debounce is by definition a delayed write. The transitions where data loss occurs:
1. **Quit obsidian (Cmd-Q):** workspace close fires `plugin.onunload()`. If the widget's flush is debounced via `setTimeout`, the timer is cleared on unload but the pending payload is not flushed.
2. **Switch notes:** opens a different note, the current note's leaf is closed. `MarkdownRenderChild.onunload()` fires for the widget. If flush isn't called there, in-flight edits are lost.
3. **Switch tabs within the same note:** edit mode → preview mode toggle (Cmd-E). Widget unmounts. Same as above.
4. **Window minimize / app switch:** `window.onblur` fires. By itself this doesn't unmount the widget, but if the user kills Obsidian from outside (Activity Monitor, OS update, power loss), the in-memory buffer is gone.
5. **Plugin unload:** `onunload()` fires. Same flush requirement.
6. **Process crash:** can't be handled. Acceptable loss.

**Consequences:**
- "I typed code and switched tabs to look at the problem statement; my code is gone" — actual user complaint vector
- Lost work when Obsidian is killed during an OS update / battery death / forced restart
- AI Debug invocations show OLD code (last flushed version, not what user is seeing)
- Run/Submit submits OLD code if user clicks the button immediately after typing without waiting 500 ms

**How to avoid:**
- **Flush on every transition. Synchronously, not debounced.**
  - `MarkdownRenderChild.onunload()` → `await flushNow()`
  - `window.addEventListener('beforeunload', flushNow)` → for Cmd-Q
  - `Plugin.onunload()` → iterate widget registry, `flushNow()` for each
  - `workspace.on('active-leaf-change')` → if the previously-active leaf had a widget on the current file, flush
  - Run/Submit/AI Debug button click → flush BEFORE reading the code
  - Vault file rename for the current file → flush, then update the registry key
- **Make `flushNow()` idempotent and synchronous-safe.** Cancel any pending debounce timer; if the buffer differs from last-known-on-disk, write immediately via `vault.process`. If a flush is already in progress, await it (don't double-write).
- **Persist in-flight edits to plugin data on `beforeunload` if synchronous vault writes aren't allowed.** Last-resort fallback: `localStorage.setItem('lc-pending-flush', JSON.stringify({...}))`. On next plugin load, check for pending entries and offer to recover. This is paranoid but costs little.
- **Reduce debounce window for very small edits.** If the user types a single character then pauses, flush after 100 ms instead of 500 ms (small writes are cheap, the pause indicates "thinking"). Heuristic: longer debounce only when a flush is currently in-flight.
- **Show a flush indicator in the UI.** A small "saving…" pill in the widget header that fades when flushed. Users tolerate delay if they can see it.

**Warning signs:**
- Debounce implemented as a bare `setTimeout` with no flush-on-unload hook
- No `beforeunload` handler
- `MarkdownRenderChild.onunload()` does not call flush
- Run/Submit reads code from the widget's in-memory state without first flushing (or — equivalently — submits stale on-disk content)

**Phase to address:** Phase 01 (Foundation). Flush-on-transition is non-negotiable from the first widget commit. The "we'll add lifecycle hooks later" version always loses data in user testing.

---

### Pitfall 5: Vim Mode Toggle While Widget Is Open — Stale Vim State

**What goes wrong:**
The user enables Obsidian's Vim mode in Settings → Editor. The widget's child CM6 was constructed with no vim extension (because vim was off when the widget mounted). The widget keeps showing as a non-vim editor while the rest of Obsidian respects the new vim setting. Inverse: user disables vim while a widget is open — widget keeps capturing vim normal-mode keys, user can't type letters.

**Why it happens:**
The Obsidian vim setting is a plugin-config flag (`app.vault.getConfig('vimMode')`). There is no documented event fired when it toggles. The Obsidian core editor reconfigures itself when the setting changes — it tears down the editor's CM6 instance and rebuilds with the new extension set. But a widget's child CM6 is separate; it has no equivalent reconfiguration trigger.

The user has accepted "reload-on-toggle" as the pragmatic approach (per PROJECT.md). The pitfall is in HOW the reload is triggered and what happens between toggle and reload.

**Consequences:**
- Vim user enables vim mode mid-session; types `:` expecting vim command-line, instead types `:` literally into the buffer (stale non-vim widget)
- Non-vim user disables vim; types `i` expecting `i` character, gets ignored or captures into a vim normal-mode buffer
- Confusion compounds because Obsidian's own editor immediately reflects the setting, but the widget does not — user thinks plugin is broken
- If reload fires automatically without warning, in-flight edits may be lost (depends on flush-on-detach correctness)

**How to avoid:**
- **Detect vim setting on each widget mount, not on plugin load.** `app.vault.getConfig('vimMode')` is read during the widget handler — never cached in plugin state.
- **Show a banner in the widget when vim setting differs from what the widget was constructed with.** "Vim mode setting changed. Reload note to apply." with a Reload button. Reload = unmount widget, re-render note. User clicks reload at their own pace; in-flight edits flush automatically (Pitfall 4 handler) before reload.
- **DO NOT auto-reload silently.** Auto-reload mid-typing is hostile UX. The trade-off accepted in PROJECT.md is "reload required" — the implementation must surface that requirement, not hide it.
- **Cache the vim-mode flag on the widget instance at mount time.** On every widget render, compare `currentSetting` vs. `mountedSetting`. If different, render the banner instead of forcing a rebuild.
- **DO listen for any reasonable signal.** Possible probe surfaces: `app.workspace.on('layout-change')` fires when settings are saved (not documented but observable); polling `getConfig('vimMode')` every 5 seconds is acceptable cost. When change detected, show banner — still don't auto-reload.
- **Document in README: "Toggle Vim mode requires reopening the note."** Eliminates support ticket vector.

**Warning signs:**
- Widget construction reads vim setting once at plugin load, never re-checks
- No banner / status indicator distinguishing widget's vim state from Obsidian's vim state
- Auto-reload-on-detected-change without flushing first
- Test plan does not include "toggle vim mid-edit, verify behavior is documented and code is preserved"

**Phase to address:** Phase 04 (Vim integration). This is a leaf concern — vim mode is feature-flagged behavior on top of the core editor; the banner UX can be added once the editor itself works.

---

### Pitfall 6: Markdown Round-Trip Bugs — Triple Backticks, Frontmatter Lookalikes, Indent Loss

**What goes wrong:**
The widget extracts the fence body when reading from disk and rewrites it on every flush. Three classes of content break the round-trip:

1. **Triple backticks in code.** Python multi-line strings (`"""..."""`), template literals containing `\`\`\``, or sample test cases that include literal backtick sequences. If the fence opener is `` ``` `` (3 backticks) and the body contains `` ``` `` (also 3), the markdown parser sees the body's `` ``` `` as the closer. Worse: when the plugin rewrites the file, the rewritten fence may include the user's `` ``` `` followed by the actual closer, producing a fence that closes early on next read.
2. **Frontmatter-lookalike `---` lines.** Code containing horizontal rules or YAML separators. By itself this is fine inside a fenced block (markdown parser correctly scopes `---` to frontmatter only at file top). The risk is the plugin's own fence-extraction logic — naive regex `^---$` matching may misidentify a `---` inside the code as a section boundary.
3. **Whitespace-significant indentation.** Python code with consistent 4-space indents; a serializer that calls `.trim()` or normalizes leading whitespace destroys it. Or: a serializer that re-indents to match the surrounding markdown's indent level (because the fence is inside a list item, say) — Python becomes invalid.
4. **Trailing-whitespace stripping.** Some markdown serializers strip trailing whitespace per line. In string literals or trailing-space-significant contexts (rare in LC, but possible), this corrupts content. v1.2 had a related bug ("trailing-newline normalization divergence" — commit afea41f).
5. **CRLF vs LF line endings.** User pastes Windows-line-ending code into the widget; widget stores LF in memory; flush rewrites file with LF; if Obsidian Sync mirrors a Windows version of the file, line endings flip. Subsequent reads see different content than was written.

**Why it happens:**
Round-trip serialization is a classic data-fidelity problem. The plugin's responsibility: extract body bytes, preserve them exactly through the editor session, write them back without mutation. Common mistakes:
- Using a regex to find the closer (`^```$` matches the user's content)
- Calling `body.trim()` or `body.replace(/\s+$/, '')` "to clean it up"
- Using a markdown round-tripper (turndown, remark) instead of byte-level slicing
- Treating the body as `string` and re-encoding via `JSON.stringify` (escapes characters)
- Trusting `MarkdownPostProcessorContext.getSectionInfo` to return a canonical body (it returns line numbers; the plugin must read the actual bytes from `vault.cachedRead`)

**Consequences:**
- User's Python solution truncated when flush rewrites the fence (closer matched mid-code)
- Code containing `\`\`\`` (rare but legal in Python docstrings, JS template literals) silently corrupted
- Indentation lost on round-trip → Python solution broken on next session
- Trailing whitespace bugs reappear (v1.2 commit afea41f redux)
- Cross-platform sync flips line endings, version control sees spurious changes

**How to avoid:**
- **Use a longer fence opener if the body contains 3-backtick sequences.** Markdown allows `` ```` `` (4 backticks) or more. When writing, count the longest backtick run in the body and use `bodyMaxBackticks + 1` for opener/closer. Standard pattern (Obsidian itself does this in some contexts).
- **OR: detect and reject 3-backtick bodies during paste.** Block paste of content containing `` ``` `` with a clear error: "Code containing triple backticks cannot be embedded in this widget. Paste it elsewhere or replace backticks." Acceptable simplification for v1.3 (Python users rarely have triple backticks in solutions; LC problems don't).
- **Slice bytes, don't parse markdown.** When extracting the body: use `getSectionInfo(el).lineStart` and `.lineEnd` to find opener/closer line numbers, then read the file via `vault.cachedRead`, slice by line index, never run a regex over the body content.
- **Never `.trim()`.** Preserve trailing newlines exactly. The fence opener line ends with `\n`; the body starts on the next line; the closer line is preceded by `\n`. The body is `everything strictly between opener-line-end and closer-line-start`.
- **Canonicalize line endings on first read, then never touch them.** When the file is first loaded, normalize CRLF → LF in the in-memory buffer. Always write LF. Document this: "This plugin normalizes line endings to LF on first read." Acceptable because LC's web editor uses LF and most modern tooling does too.
- **Test the round-trip explicitly with hostile inputs.** Test fixtures: code with literal `` ``` ``, code with `---` line at column 0, code with leading whitespace mismatching the surrounding indent, code with trailing spaces, CRLF input.
- **Validate after every flush.** Compute `expectedHash = sha256(currentBody)` before write. After `vault.process` completes, re-read the file and slice the body; if `sha256(actualBody) !== expectedHash`, log a warning with diff (in dev mode) and fall back to direct `Vault.modify` write. Surface a Notice if it fails again. This is the canary — round-trip bugs are usually subtle and only show up on specific content.

**Warning signs:**
- Body extraction uses a regex matching `^```` against the file contents
- Any call to `.trim()` / `.replace(/\s+$/, '')` / `.normalize()` in the body path
- No test fixture for "code containing triple backticks"
- Fence opener is hardcoded to 3 backticks regardless of body content
- No post-flush hash check

**Phase to address:** Phase 01 (Foundation: serialization layer). Round-trip fidelity is part of the read/write primitives — a bug here corrupts user data. v1.2 commit afea41f ("sync trailing-newline normalization") is the cautionary tale.

---

### Pitfall 7: v1.2 → v1.3 Migration — Fence Rewrite Data Loss

**What goes wrong:**
v1.2 notes use `\`\`\`python` (or `\`\`\`java`, etc.) as the fence opener inside a `## Code` section. v1.3 needs the fence to be `\`\`\`leetcode-solve` so `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` can render it. Migration must rewrite the opener tag without touching the body.

Common migration disasters:
1. **Regex-replace catches false positives.** A note's `## Notes` section contains an example fence `\`\`\`python\nprint("hello")\n\`\`\`` for documentation purposes. The migration regex matches it and rewrites to `\`\`\`leetcode-solve` — now a non-LC fence is being rendered by the plugin's processor with no body language.
2. **Migration runs on plugin load, hits user's vault before the user opts in.** User installs v1.3 thinking it's an update; the plugin batch-rewrites every LC note in their vault on startup. If the rewrite has any bug, every note is corrupted at once. Worse: undo the migration requires a per-note diff against a backup.
3. **Partial-write corruption.** Migration rewrites file A, mid-process the user closes Obsidian (or a sync conflict lands), file A is left half-rewritten. Next plugin load reads a corrupted file, fails to parse, widget mount errors.
4. **Double-rewrite.** Migration runs on a note that was already migrated. If the detection is "fence opener is `\`\`\`python`," and the migrated note is now `\`\`\`leetcode-solve`, the second run is a no-op. But if the detection logic is buggy (e.g., "any note with `lc-slug`") and the rewrite is "set opener to `leetcode-solve`," double-rewriting isn't harmful — but if the migration also moves content (e.g., insert a language attribute as fenced metadata), double-runs duplicate it.
5. **Frontmatter `lc-language` stays out of sync.** The fence opener tag was the source of truth in v1.2 (Phase 5.3 chevron rewrites both opener AND `lc-language`). After migration, the fence opener no longer encodes language; the plugin must read language from `lc-language`. If migration only rewrites the opener and not the frontmatter, the language is lost (the opener was the language carrier).

**Why it happens:**
Vault-wide rewrites against user data are inherently dangerous because:
- Vault is the user's own files; corruption is permanent without backups
- Obsidian Sync, iCloud, Dropbox can deliver concurrent writes during migration
- v1.0/v1.1/v1.2 notes have varied structure (the section template evolved)
- Some users may have hand-edited their LC notes (added their own sections, restructured) — assumptions break

**Consequences:**
- User data corruption affecting every LC note in vault
- Support tickets requiring per-vault recovery (no scalable fix)
- Plugin store rejection or rapid takedown if users report data loss
- Loss of trust — even if recovered, "the plugin ate my code" persists

**How to avoid:**
- **NEVER auto-migrate on plugin load.** This is the single most important rule. The lazy-on-AC migration pattern from v1.1 (Techniques migration, see PROJECT.md key decisions) is the right precedent: migrate a note only when it's opened AND the user takes an action.
- **Migrate on first open in v1.3.** When the widget mounts on a v1.2-shaped note, detect the legacy fence (e.g., `\`\`\`python` immediately after `## Code`), log a one-time Notice ("Migrating fence to v1.3 format"), rewrite the opener AND verify the `lc-language` frontmatter contains the correct language (if absent, derive from old fence tag, write it back). All in one `vault.process` call.
- **Use byte-level rewriting, not regex.** Locate the `## Code` heading, locate the next ` ``` ` line, parse its language tag, write back with `\`\`\`leetcode-solve`. Skip any other fence in the document.
- **Idempotent migration logic.** Detect "already migrated" via the literal `\`\`\`leetcode-solve` opener; skip if found. Detect "no fence" (corrupted note) and abort migration with a Notice; do not attempt repair.
- **Backup before migrate.** First time the migration runs on a vault, write a snapshot of each migrated note to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/`. Keep for 30 days. README documents the location and retention.
- **Don't migrate during plugin-store review.** Reviewers may install v1.3 in an empty vault for testing; migration should not run on non-LC notes (gate on `lc-slug` frontmatter).
- **Test migration with v1.0, v1.1, v1.2 sample vaults.** Each version's sample notes are checked into `.planning/test-fixtures/` (or similar) and migration runs against all of them in CI before any release.
- **Safety: gate migration behind a setting.** "Auto-migrate v1.2 notes when opened" defaults to ON, but the user can disable. If disabled, opening a v1.2 note shows a "Migrate this note?" button instead.

**Warning signs:**
- A migration function is called from `Plugin.onload()` that iterates vault files
- Migration logic uses `String.replaceAll` or naked regex against full file contents
- No backup directory created before first migration
- No "already migrated?" check at the top of the migration function
- Migration runs synchronously on plugin load, blocking app startup
- No CI test fixtures for v1.0/v1.1/v1.2 sample notes

**Phase to address:** Phase 03 (Migration). Must come AFTER widget rendering is stable (Phase 01-02), so the migration can use the same fence-extract/rewrite primitives the widget uses. Migration testing must include "user has 50 LC notes, opens 10 of them in a session, rest stay v1.2" and "user has hand-edited fence opener" scenarios.

---

### Pitfall 8: Cursor Restoration After External-Edit Reload — User's Position Lost

**What goes wrong:**
The user is typing in the widget. Obsidian Sync writes a remote change to the file (collaborator edited from another machine, or user is on iCloud and the desktop wrote earlier). `vault.on('modify')` fires; the plugin's modify handler detects external edit (hash doesn't match expected); widget reloads from disk. Reload replaces the widget's in-memory document with the disk version. User's cursor was at line 45, column 12; after reload, cursor jumps to line 0, column 0. User loses their place.

Worse: in some implementations, the user's IN-FLIGHT edits are silently dropped. Reload replaces the buffer; the 5 characters typed since last flush are gone (because they were debounced, not yet flushed). External edit just clobbered local edits.

**Why it happens:**
Reloading a CM6 EditorView is destructive — `state` is replaced wholesale. Restoring cursor / scroll requires capturing them BEFORE the reload and dispatching a follow-up effect to restore. Restoring in-flight edits requires a 3-way merge between (last-flushed, current-disk, current-buffer) — non-trivial.

**Consequences:**
- User typing is silently overwritten by remote edit
- Cursor jumps to start of doc on every Sync push
- "Why did my code revert?" tickets — same surface as Pitfall 2, different mechanism
- Heavy Sync / iCloud users (multi-device, common for LC practice) hit this constantly

**How to avoid:**
- **Capture cursor + scroll before reload.** `const cursor = childView.state.selection.main; const scroll = childView.scrollDOM.scrollTop;` before dispatching the doc replacement.
- **Restore after reload.** `childView.dispatch({ selection: EditorSelection.cursor(Math.min(cursor.head, newDoc.length)) }); childView.scrollDOM.scrollTop = scroll;`. Clamp the cursor to the new doc length (the external edit may have shortened the body).
- **Detect concurrent local + external edits.** If the widget's in-memory buffer differs from last-flushed AND the disk version also differs from last-flushed AND they differ from each other → conflict. Surface a modal: "This file was changed externally while you were editing. Choose: Keep my version / Keep external version / View diff." Don't auto-resolve.
- **For non-conflict reloads** (user wasn't actively editing), reload silently. Show a brief Notice "Note updated externally" only if the file change affected the fence body.
- **Use a 3-way diff library or hand-rolled `diff-match-patch`** for the conflict modal's "View diff" view. Optional polish, but a major UX win for power users.
- **In the simple case (user is not currently typing), still preserve cursor.** Even a non-conflict reload should preserve cursor position by mapping it through a CM6 ChangeSet computed from old → new doc.

**Warning signs:**
- Reload code path replaces doc without capturing cursor first
- No conflict-detection logic distinguishing "external write while user idle" from "external write while user editing"
- No modal for conflict resolution; reload always silently wins
- Test plan does not include "Sync push during local typing" scenario

**Phase to address:** Phase 02 (External-edit reconciliation). This pitfall is the Phase 02 anti-pattern — without explicit work here, reload code is one-way destructive.

---

### Pitfall 9: Action Row Positioning — Layout Bleed and Theme Differences

**What goes wrong:**
v1.2 had Run/Submit/AI Debug/Copy as a CM6 block decoration in the parent doc, immediately below the fence closer. v1.3 puts them inside the widget's DOM (the widget owns the entire rendered region). Common layout bugs:

1. **Collapsed margins:** the widget's outer `<div>` has `margin: 0` set by the user's theme. The action row inside has `margin-top: 8px`. Margin collapse rules can swallow that gap when the widget is adjacent to a paragraph above. Action row appears flush against the previous content — visually broken.
2. **Theme bleed:** themes target `.markdown-rendered .code-block` or similar selectors; the widget's div may inherit unintended padding/border/background. Buttons rendered inside inherit theme button styles that don't fit (e.g., a theme that makes all `<button>` elements 100% width).
3. **Reading mode vs. Live Preview CSS differences:** Reading mode renders inside `.markdown-preview-view`; Live Preview inside `.markdown-source-view.is-live-preview`. Theme rules scoped to one selector but not the other cause the widget to look different in each mode.
4. **Mobile / narrow-pane layout:** five buttons in a row may overflow on narrow panes. Even though v1.3 is desktop-only, narrow side panes (problem browser, AI panel) push the main pane to 600px or less. Buttons wrap or clip.
5. **Dark mode / light mode style mismatch:** action row uses theme-token CSS variables (`--background-primary`, `--text-normal`); widget body uses CM6's own theme. If the CM6 theme is dark while the surrounding Obsidian theme is light (or vice versa), the action row looks like it belongs to a different app.
6. **Cursor focus indication:** in v1.2, focus was on the parent CM6; the action row was always visually de-emphasized. In v1.3, focus is in the widget; clicking a button shifts focus to the button (loses the editor cursor); if button click triggers a flush, the user's cursor returns to position 0 (Pitfall 8 again). User clicks Run → cursor jumps → confusion.

**Why it happens:**
Inline widgets render inside arbitrary surrounding markdown. The widget is not a top-level UI surface (like a modal or a side panel) — it's embedded in a document that has its own typography, spacing, and theme. CSS isolation is hard.

**Consequences:**
- Action row visually broken in popular themes (Minimal, Things, Catppuccin)
- Buttons clip on narrow panes
- Focus shift on button click loses editor cursor position
- Reading mode vs. Live Preview look different — confusing UX

**How to avoid:**
- **Use Obsidian's CSS variable system, not hard-coded colors.** All button colors, borders, backgrounds via `var(--interactive-normal)`, `var(--background-primary)`, etc. Themes set these correctly; hard-coded values fight themes.
- **Scope all widget CSS via a unique class.** `.lc-widget` as the outer container; nest all rules. Themes that target generic `.markdown-rendered button` are constrained to the unscoped portion of the widget.
- **Set `display: flex; flex-wrap: wrap; gap: 8px;` on the action row.** Buttons wrap on narrow panes instead of clipping.
- **Block margin collapse with `padding-top: 1px` on the action row's container** (or `display: flow-root` on the parent). Both approaches break the margin-collapse chain reliably.
- **Render an identical action row in both Live Preview and Reading mode.** Same DOM, same CSS, same button handlers. Only difference: in Reading mode the editor body is read-only (CM6 with `EditorView.editable.of(false)`).
- **Save and restore editor focus on button click.** Before invoking a button handler, capture `childView.hasFocus` and `childView.state.selection`. After handler resolves, if `childView` was focused, refocus and restore selection. This sidesteps Pitfall 8 for button-induced reloads.
- **Test against the top 5 most popular themes.** Minimal, Things, Catppuccin, Anuppuccin, Atom. Each has a different button-styling philosophy. Visual regression tests via screenshot diffs (manual until automation lands).
- **Clip with `overflow: hidden` only at the OUTER widget boundary.** Inner content (popovers, dropdowns) need to escape; clip at the widget level only.

**Warning signs:**
- CSS uses hard-coded colors (e.g., `color: #333`)
- No `.lc-widget` (or similar) outer scope
- Action row absent from Reading mode or styled differently
- Button handlers don't capture/restore editor focus
- Visual regression test plan does not include theme matrix

**Phase to address:** Phase 02 (Widget chrome + button integration). Layout pitfalls usually emerge in user testing; lock down CSS conventions early so the eventual fixes are surgical.

---

### Pitfall 10: Section-Lock Removal Regression Risk

**What goes wrong:**
v1.2 used `sectionLockExtension.ts` to make `## Problem` body, `## Code` heading + opener + closer, `## Techniques` heading, `## Notes` heading read-only in the parent CM6. v1.3 removes this extension because the widget now owns the editable code region (lock no longer needed for fence opener/closer protection). But several incidental protections disappear with it:

1. **`## Problem` body becomes editable.** Users can accidentally edit the problem statement, deleting the LeetCode-fetched HTML. Re-opening the problem doesn't restore it (no auto-refresh on every open).
2. **`## Techniques` heading editable.** Users may rename it, delete it, restructure. Knowledge-graph wiring depends on the heading existing literally as `## Techniques` — auto-tagging fails silently.
3. **`## Notes` heading editable.** Less critical (Notes is user content), but if the heading is renamed, `vault.process` writes targeting `## Notes` (e.g., AI Review writes near the section?) miss their anchor.
4. **Frontmatter editable.** Frontmatter was technically not in the lock, but the lock's overall "this note is plugin-owned" signaling discouraged edits. Without it, users may edit `lc-slug`, `lc-id`, breaking the plugin's `metadataCache` lookups.

**Why it happens:**
v1.2's section lock was over-scoped — it protected against "user edits inside the fence opener line" (a real risk) AND coincidentally protected `## Problem` body (a different risk). Removing the extension wholesale removes BOTH protections, even though only the first is obsoleted by the widget.

**Consequences:**
- Users accidentally delete problem statements
- `## Techniques` renames break knowledge graph
- `lc-slug` edits cause widget mount to fail (no LC note context)
- v1.0 requirement "Plugin-owned regions structurally locked to prevent accidental edits" (PROJECT.md, validated requirement) regresses

**How to avoid:**
- **Audit each section lock and re-implement only those still needed.**
  - `## Problem` body protection → STILL NEEDED. Re-implement as a narrower section lock or as a `vault.on('modify')` that re-fetches problem HTML if the body diverges from cache (defense in depth).
  - `## Code` heading + opener + closer → NO LONGER NEEDED. Widget owns the fence; the parent doc shows raw fence only in Source Mode (where edits are intentional).
  - `## Techniques` heading → STILL NEEDED. Even minimal protection (warn-on-rename) preserves graph wiring.
  - `## Notes` heading → optional. Notes section is user-editable content; heading rename is annoying but recoverable. Lower priority.
- **Use the same `EditorState.changeFilter` mechanism, narrower scope.** Keep the file as `sectionProtectionExtension.ts` — rename to reflect narrowed scope. Document that `'leetcode.*'` userEvent bypass is still the convention for plugin writes (AI review writes, problem refresh writes).
- **Keep a "what does the new section protection cover" decision matrix in `.planning/research/ARCHITECTURE.md` for v1.3.** The team needs to look this up for years.
- **Verify v1.0 validated requirement still holds after migration.** Add an integration test: open a v1.3 LC note, attempt to type into `## Problem` body, verify the change is rejected.
- **Surface the protection in Reading mode too** (Live Preview only — Reading mode is already read-only by definition).

**Warning signs:**
- v1.3 plan says "delete `sectionLockExtension.ts`" with no mention of replacement
- No requirement re-traceability check ("v1.0 PROJECT.md requirement → v1.3 implementation")
- v1.3 test plan doesn't include "type into `## Problem` body and verify it's blocked"
- ARCHITECTURE.md doesn't document which section protections remain

**Phase to address:** Phase 02 (Section protection rewire). Must run in parallel with widget integration. Removing the lock without the narrower replacement is a regression even before users notice.

---

### Pitfall 11: Frontmatter `lc-language` Sync — Where Does It Update?

**What goes wrong:**
v1.2 chevron rewrote the fence opener tag (`\`\`\`python` → `\`\`\`java`) AND `lc-language` frontmatter atomically in one `vault.process` (one undo step), with `'leetcode.lang-switch'` userEvent. v1.3 fence opener is `\`\`\`leetcode-solve` — language is no longer encoded there. Where does language live, and what updates `lc-language`?

Three plausible v1.3 architectures:
1. **Language as widget setting attribute on the opener line.** `\`\`\`leetcode-solve language=python` — opener carries language as an attribute parsed by the widget. Frontmatter and opener must stay in sync.
2. **Language only in frontmatter.** `lc-language: python` is the source of truth; widget reads it on mount, language switch rewrites frontmatter only.
3. **Language inside the body via a comment.** `# language: python` on first line; widget parses on mount, switch rewrites first line. Pollutes user code.

Option 2 is cleanest. But: the widget needs to react to frontmatter changes. If the user edits frontmatter externally (Sync, manual edit), `vault.on('metadataCache.changed')` fires; widget needs to detect language change and reconfigure CM6 (Compartment.reconfigure with new LanguageSupport).

**Common bugs:**
1. Frontmatter rewrite for language switch doesn't trigger widget reconfiguration → user sees old syntax highlighting until note is closed and reopened.
2. Widget reads `lc-language` from frontmatter at mount, never re-reads → external frontmatter changes ignored.
3. Language switch dispatched via `'leetcode.lang-switch'` userEvent — but widget no longer monitors parent CM6 transactions (it owns its own buffer); event never fires inside the widget.
4. Frontmatter rewrite fails or partially succeeds (e.g., `processFrontMatter` throws on malformed YAML) → opener attribute and frontmatter diverge, widget mount errors.

**Why it happens:**
v1.2 had a single dispatch point (the chevron); both opener and frontmatter were handled there. v1.3 splits the surface: language is set in frontmatter, observed by the widget, reacted to via reconfiguration. Three components must coordinate (settings tab / chevron in widget header / external edit).

**Consequences:**
- Language switch shows new dropdown selection but doesn't change syntax highlighting
- AI Debug / Run / Submit submit with wrong language (button reads from one source, syntax-highlight from another)
- External frontmatter edits don't propagate to widget
- Stale language state across tab switches

**How to avoid:**
- **Single source of truth: `lc-language` frontmatter.** Widget never caches language across renders.
- **Update via `app.fileManager.processFrontMatter(file, fm => { fm['lc-language'] = newLang })`.** This is atomic, handles YAML parse errors, and Obsidian fires the metadataCache-changed event automatically.
- **Widget subscribes to metadata changes for its file.**
  ```typescript
  this.registerEvent(
    app.metadataCache.on('changed', (file) => {
      if (file.path === this.filePath) this.reconfigureLanguage();
    })
  );
  ```
  `reconfigureLanguage()` reads frontmatter, looks up new LanguageSupport, dispatches `Compartment.reconfigure` to the child CM6.
- **Language switch flow in widget header chevron:** flush widget edits → `processFrontMatter` to update `lc-language` → metadataCache-changed event fires → widget's listener reconfigures language. Order matters: flush BEFORE frontmatter write so the widget's pending edits are persisted under the OLD language tag (not lost in the reconfigure).
- **Reset compartment, don't tear down editor.** `Compartment.reconfigure` swaps the language extension without destroying the editor. Cursor / undo / scroll preserved.
- **On widget mount, read `lc-language` once.** Set up the metadataCache listener for ongoing changes. Don't poll.
- **Test the external-edit path.** Edit `lc-language: python` → `lc-language: java` directly in the frontmatter view; verify widget syntax highlighting updates.

**Warning signs:**
- Widget code reads `frontmatter['lc-language']` from a snapshot taken at plugin load
- No `metadataCache.on('changed')` listener for the widget's file
- Language switch logic dispatches a CM6 effect instead of writing frontmatter
- Tests don't include "edit frontmatter externally, verify widget reacts"

**Phase to address:** Phase 02 (Language switching + frontmatter integration). The language-source-of-truth decision is a Phase 01 architectural call; the live-update wiring is Phase 02.

---

### Pitfall 12: Performance — File-Watcher Storms with Sync, iCloud, Git

**What goes wrong:**
Widget flushes every 300–500 ms while the user types. Each flush is a full file rewrite. Cascading effects:

1. **Obsidian Sync** sees N writes per second, queues each for upload; bandwidth saturation, sync conflicts, "out of date" notices on other devices.
2. **iCloud / Dropbox / OneDrive** mirroring the vault folder fires its own watchers; cloud upload bandwidth saturates; mid-flush state visible to the cloud (atomic write within Obsidian, but the cloud watcher may snapshot before the rename completes).
3. **Git auto-commit watchers** (e.g., `obsidian-git` plugin) batch on file change; with 300ms debounce + 5-minute commit interval, every typing session creates dozens of pending commits. If interval is shorter, every commit is a single character.
4. **Anti-virus / Spotlight / mdworker** repeatedly scans the file; CPU spikes during typing.
5. **Obsidian's own metadataCache** parses frontmatter on every modify; for files with large frontmatter, repeated parsing adds latency.

**Why it happens:**
File-watcher storms are inherent to high-frequency disk writes. Web/native editors avoid this by NOT writing to disk during typing — they save on focus loss, on close, on explicit Ctrl-S. Obsidian's built-in markdown editor does write through to disk on every keystroke (or close enough — autosave is aggressive), but it's a single file-buffer-to-disk path optimized internally.

The widget introduces a NEW write path (widget → vault.process → file → modify event → other-pane reload) that's both higher-frequency than typical Obsidian writes (because typing IS a write event) AND wider in scope (it bumps the file's mtime, triggering everything that watches mtime).

**Consequences:**
- Obsidian Sync conflicts: edits on phone arrive after desktop's flush; Sync resolves with "keep both," leaving merge conflicts in the file
- Mac users with iCloud see lag and occasional file lockup (iCloud re-uploading)
- `obsidian-git` users see hundreds of "uncommitted changes" entries
- Battery drain on laptop (continuous disk write + cloud upload)
- File system journal grows (especially on encrypted volumes with COW filesystems like APFS)

**How to avoid:**
- **Aggressive debouncing for sync-aware users.** Default 500 ms; setting to expose: "Save delay" 300 / 500 / 1000 / 2000 ms. Power users with Sync can opt for 2 seconds.
- **Coalesce flushes.** If a flush is in flight when another debounced edit fires, queue ONE follow-up flush after the in-flight completes. Never 2 flushes simultaneously (race condition territory).
- **Use `Vault.process` not `Vault.modify`.** `process` is atomic; `modify` is not. Concurrent reads during a write see consistent content. (Already the canonical pattern per CLAUDE.md.)
- **Detect sync plugins and increase debounce.** If `app.plugins.plugins['obsidian-sync']` or similar is loaded, default debounce to 1000 ms. Same for git plugins.
- **Throttle per file.** Even within a session, never more than 1 flush per 200 ms per file. If the user types continuously, the debounce timer keeps resetting until they pause; if a flush happens to land mid-burst, the rate limiter prevents the next within the 200 ms window.
- **Don't write if content unchanged.** Compare current buffer to last-written; skip flush if equal. Saves redundant disk hits during cursor movement / undo / redo cycles that produce same content.
- **Communicate cost in README.** Settings tab hint: "Frequent flushes can conflict with Obsidian Sync and large vaults synced via iCloud. Increase Save delay if you experience sync lag."
- **Test on a synced vault.** Mac + iPhone with iCloud sync; type continuously for 60 seconds; verify no sync conflicts and reasonable battery cost.

**Warning signs:**
- Flush implementation has no rate limiter
- No setting exposed for debounce duration
- No "skip if unchanged" check in flush
- README does not mention sync interaction
- Test plan does not include "synced vault, continuous typing"

**Phase to address:** Phase 01 (Foundation: sync layer with rate limit) + Phase 02 (settings exposure). Initial implementation must include rate limiting; settings polish lands in Phase 02.

---

### Pitfall 13: Plugin-Store Re-Review Risk — New Surface, New Scrutiny

**What goes wrong:**
v1.3 introduces `registerMarkdownCodeBlockProcessor` (new API surface), removes nested CM6 EditorView (the v1.2 reviewer concern). Net cleaner — but plugin-store reviewers may re-check:

1. **Network calls disclosure.** README says "communicates with leetcode.com." Still true. No new networks. SAFE.
2. **innerHTML / DOM API.** Widget renders into the supplied `el: HTMLElement`. If the widget uses `el.innerHTML = ...`, FAIL. Already known per v1.2 (CLAUDE.md flags this); v1.3 must use `el.createEl` / `el.createDiv` / `createSpan`. Also: SVG icons replaced via `DOMParser` per recent commit f0de77f (lint compliance) — apply same discipline in widget.
3. **eval / new Function.** None expected. SAFE.
4. **`isDesktopOnly: true`.** Required because of embedded BrowserWindow login. Still true. SAFE.
5. **No telemetry.** Still true. SAFE.
6. **`processFrontMatter` usage.** New if not already used. Documented Obsidian API; safe.
7. **`vault.on('modify')` listener for arbitrary files.** Reviewers may flag a global listener that fires on every vault file. Mitigation: filter by `lc-slug` frontmatter / `LeetCode/` folder in the listener; early-return for non-LC files.
8. **Plugin registers code-block processor at load.** Standard pattern; not a concern.
9. **Migration that touches user files.** Reviewers DEFINITELY scrutinize this. Per Pitfall 7, migration is opt-in via lazy-on-open; reviewer can verify no batch rewrite at load.
10. **Self-write echo suppression machinery.** Reviewers may ask "what is this map for?" — be ready with the README explanation: "When the plugin saves your code, it tracks its own writes to avoid reloading mid-edit."
11. **`@codemirror/lang-*` packages.** Already external in v1.2. No change.
12. **Bundle size.** v1.2 ships at 1.71 MB. Removing 1,700 LOC nets a smaller bundle; new sync layer adds ~300 LOC. Net: smaller. SAFE.

**Why it happens:**
Re-review for major architecture changes is standard. The risk is not rejection — it's delay (review queue is multi-week). Obvious things to fix in review take less time than addressing them in advance.

**Consequences:**
- Submission delayed by reviewer questions
- Need to update README, code comments, or settings to satisfy reviewer
- In the worst case, an architectural choice (e.g., the suppression-window map) is questioned and needs justification

**How to avoid:**
- **Update README before submission.** Explain v1.3 architecture in user-facing terms ("The plugin now provides an inline code editor inside problem notes. Your code is auto-saved every 500ms. The note's frontmatter controls the language."). Disclose the modify-listener scope ("only LC notes are touched").
- **Run `eslint-plugin-obsidianmd` on the v1.3 codebase before submission.** Fix every flagged item. This is the reviewer's automated tool.
- **Verify zero `innerHTML` in v1.3 code.** `grep -rn 'innerHTML' src/` should return zero outside test fixtures.
- **Document the migration explicitly in README.** "On first open of a v1.2 note, the plugin will rewrite the fence to v1.3 format. A backup is kept at..." 
- **Bundle-size regression test in CI.** v1.2 shipped at 1.155 MB (per commit history) / 1.71 MB raw; v1.3 should not exceed this. Add an esbuild-meta-file gate.
- **Submit a private beta first** via BRAT or alpha install. Real users hit issues that automated review misses.
- **Pre-emptive ticket: "Plugin store reviewer questions handler."** A document with anticipated questions and answers, ready to paste into reviewer DMs.

**Warning signs:**
- README not updated for v1.3 architecture changes
- Lint clean run not part of release checklist
- No bundle-size CI gate
- Migration doesn't have a README section
- No alpha / beta period before submission

**Phase to address:** Final polish phase before submission. Most items in this pitfall are checklist items, not architectural — but the README discipline must persist throughout.

---

## Moderate Pitfalls

### Pitfall 14: Widget Identity and Eq() — Inline Widget Equivalent of v1.2 Pitfall 1

**What goes wrong:**
v1.2 Pitfall 1 (NESTED-EDITOR-PITFALLS.md) was "Widget Destruction on Parent Transaction — Child State Loss." The mechanism was CM6 Decoration widgets; the v1.3 mechanism is `MarkdownPostProcessorContext` re-rendering. The underlying class of bug is identical: any signal that causes Obsidian to re-render the widget destroys child editor state unless the plugin keeps it elsewhere.

Specific v1.3 triggers:
1. Section info changes (the fence's line numbers shifted because text was inserted above) → Obsidian may re-call the processor.
2. `editorLivePreviewField` flip (Cmd-E for source mode toggle) → re-render.
3. Reading mode ↔ Live Preview ↔ Source mode transitions → re-render in Reading/Live, no widget in Source.
4. File reload after `vault.on('modify')` → re-render.
5. Plugin disable/enable → all widgets re-render.

**Why it happens:**
The v1.2 mistake recurs because the v1.3 architecture appears to "outsource" lifecycle to Obsidian — but the widget's child CM6 state is still plugin-owned and must be persisted across re-renders.

**Prevention:**
- Same as v1.3 Pitfall 3 above: plugin-level `Map<filePath, ChildEditorState>` for state persistence across re-render. `MarkdownRenderChild` lifecycle hooks for capture/restore.
- Treat re-render as "same as scroll-out-of-viewport" — user did not initiate any state change; their work must survive.

**Phase to address:** Phase 01 (Foundation). This is a re-statement of Pitfall 3 framed as "lessons learned from v1.2." The same diligence applies.

---

### Pitfall 15: `getSectionInfo` Returns Null — Don't Panic, Don't Crash

**What goes wrong:**
The Obsidian API documents that `MarkdownPostProcessorContext.getSectionInfo(el)` "may return null in many circumstances." Plugin code that assumes non-null will crash, leaving the widget broken.

**Why it happens:**
Section info is computed from the markdown source state at processing time. Common null causes:
- The element was detached from the DOM and the section is no longer in the rendered tree
- The processor is running for an embedded note (transclusion) that doesn't have the same section structure
- The processor is running during a partial re-render where line offsets are not yet recomputed

**Consequences:**
- `null.lineStart` throws → widget mount errors → user sees an error message instead of the editor
- If error is swallowed, user sees an empty widget

**How to avoid:**
- **Always null-check.** `const info = ctx.getSectionInfo(el); if (!info) { renderFallback(el, source); return; }`. Fallback: render a basic `<pre>` with the source string and a "Could not embed editor here" notice. User can still see the code; can manually edit by switching to Source mode.
- **Re-call at use time, not at mount time.** Per Obsidian docs: "Only call this function right before you need this information." Cache only briefly (the cached value goes stale on every doc change).
- **Test embedded views.** Open `LeetCode/1-two-sum.md` → embed via `![[1-two-sum]]` in another note → verify the embedded version doesn't crash.

**Phase to address:** Phase 01 (Foundation). The null check is one line of code; missing it is a P0 stability bug.

---

### Pitfall 16: Embedded Notes — Widget Mounts in `![[...]]` Transclusions

**What goes wrong:**
User embeds a problem note in another note via `![[1-two-sum]]`. The embedded view runs `registerMarkdownCodeBlockProcessor` for the inner fence — your widget mounts inside the embed. Now there are two contexts where the widget exists for the same file:
- The original note's pane (live editor)
- The embedding note's pane (embedded view)

If both are interactive editors, this is Pitfall 2 (multi-pane coherence) again, made worse: the embedded view's `el` is in a different DOM tree, with different CSS scoping (`.markdown-embed`).

**Why it happens:**
Embedded notes go through the same markdown rendering pipeline. The processor is called for any fence with the registered language tag, regardless of where the source note is being rendered.

**Prevention:**
- **Detect embedded context and render read-only.** `MarkdownPostProcessorContext` exposes `sourcePath`; if `sourcePath` differs from the open file's path, it's an embed. Render the widget with `EditorView.editable.of(false)`. Hide Run/Submit buttons (only show in the live pane).
- **Test embed scenarios.** Hub note that embeds 3 problem notes; verify each embed shows code (read-only), and the original notes remain editable.

**Phase to address:** Phase 02 (Multi-context handling). Embeds are a real Obsidian feature; not handling them is a quality-bar miss.

---

### Pitfall 17: Reading Mode vs. Live Preview Lifecycle Differences

**What goes wrong:**
Reading mode renders the widget once when the note is opened; the widget DOM lives until the note is closed (or the user scrolls far enough that virtualized rendering unmounts and remounts). Live Preview renders dynamically as the cursor moves. Lifecycles differ:
- Reading mode `MarkdownRenderChild.onunload()` fires when note closes
- Live Preview `MarkdownRenderChild.onunload()` fires when cursor enters the fence (raw-source reveal) AND when note closes AND on scroll-virtualization (less common)

Code that assumes Reading-mode lifecycle (mount once, live until close) breaks in Live Preview (mount/unmount per cursor proximity).

**Why it happens:**
Different rendering pipelines, same processor API. Plugin author tests in Reading mode (simpler), ships, then Live Preview users hit edge cases.

**Prevention:**
- **Treat every unmount as transient.** State persistence map (Pitfall 3) handles this.
- **Test in BOTH Reading mode and Live Preview as the primary test surface.** Source mode is a tertiary test (no widget there).

**Phase to address:** Phase 01 (Foundation, with cross-mode tests).

---

### Pitfall 18: Read vs. cachedRead — Wrong Primitive Causes Sync Lag

**What goes wrong:**
Per Obsidian docs ("Vault.cachedRead is for display, Vault.read is for modification"), the wrong choice causes subtle bugs:
- `cachedRead` returns potentially stale content (within Obsidian's cache TTL) — fast, fine for display
- `read` always hits disk — slower, current

If the modify-listener uses `cachedRead` to compute the post-modify hash for suppression check, the cache may return pre-modify content → hash mismatch → wrongly classifies plugin's own write as external → reload → infinite loop.

**Prevention:**
- **In the modify handler, use `read` not `cachedRead`.** The modify event is the canonical "content changed" signal; we need the actual new content, not a cached version.
- **In display paths, use `cachedRead`.** Faster.

**Phase to address:** Phase 01 (Foundation: sync layer).

---

### Pitfall 19: Cmd-Z (Undo) Confusion — User Has Local CM6 Undo, Not Vault Undo

**What goes wrong:**
v1.2 Cmd-Z worked across the parent doc (user could undo any edit anywhere in the note). v1.3 Cmd-Z while focus is in the widget undoes only widget edits — and only edits since the widget mounted (re-mount clears the in-memory undo stack unless preserved per Pitfall 3). User's expectation may be "undo my last edit" → gets "undo nothing" if their last edit was outside the widget.

Inverse: user edits widget → flush writes to disk → user clicks outside widget → presses Cmd-Z. Parent CM6 undo: undoes the most recent parent-doc transaction, which was the modify-event-triggered reconciliation (if any). User sees nothing change, or sees the file revert in unexpected ways.

**Why it happens:**
Two separate undo stacks (widget's CM6 undo, parent doc's CM6 undo). v1.2 had this same issue (Pitfall 11 in NESTED-EDITOR-PITFALLS.md); the team had a partial fix (`addToHistory.of(false)` mirror). v1.3 has the same fundamental tension.

The PROJECT.md key decisions accept "Cmd-Z (per-widget undo) and Cmd-F (focus-scoped) become intentional UX shifts — matches other inline-block plugins." So this isn't a bug — it's a documented UX shift. Pitfall here is implementation drift: making the UX shift CONFUSING by not making the boundaries clear.

**Prevention:**
- **Visual indicator of undo scope.** When focus is in the widget, the widget's chrome shows "Cmd-Z undoes code edits." When focus is outside, parent-doc undo applies.
- **Persist widget undo across remounts** (Pitfall 3 state map includes the undo history if possible — CM6 history extension serializes via `historyField.value` which is reasonably small).
- **Document in README.** "Pressing Cmd-Z while editing code undoes only code changes. Click outside the editor to undo other changes."
- **Don't try to merge.** Merging two undo stacks is the rabbit hole that bit v1.2; v1.3 explicitly punts on this.

**Phase to address:** Phase 02 (UX polish around undo boundaries).

---

### Pitfall 20: Cmd-F Find — Focus-Scoped Search

**What goes wrong:**
User presses Cmd-F expecting to find text anywhere in the note. Focus is in the widget; the widget's CM6 captures Cmd-F via its own search extension; opens the widget's local search bar. User searches for `## Notes` heading → not found (heading is in parent doc, not in widget). User confused.

Inverse: focus outside widget; Cmd-F opens parent-doc search; user searches for code text inside the widget; not found (widget's content may or may not be in the parent doc, depending on whether the inline widget hides the underlying fence body in Live Preview).

**Why it happens:**
Two separate search scopes. PROJECT.md accepts this as a UX shift.

**Prevention:**
- **Don't include CM6's `search` extension in the widget if it conflicts with Obsidian's Cmd-F.** Test what Obsidian does by default; configure the widget's keymap accordingly.
- **Or include it deliberately** with a documented binding (e.g., `Cmd-Shift-F` for widget search; `Cmd-F` falls through to Obsidian).
- **Document scoping in README.**

**Phase to address:** Phase 02 (UX polish).

---

### Pitfall 21: AI Debug / Run / Submit — Read Stale Code If No Pre-Flush

**What goes wrong:**
User types code, immediately clicks "Run" without waiting for debounce. Run handler reads code from `vault.cachedRead(file)` to extract fence body. Cached read returns pre-typing content. Run sends old code to LeetCode. Verdict comes back not matching what the user sees in the editor.

Same for AI Debug (sends code as context to LLM), Submit (executes on LC), Copy (puts code on clipboard).

**Why it happens:**
Button handlers historically read from disk; widget's in-memory buffer is the live source.

**Prevention:**
- **All button handlers flush widget first, then read.** `await widgetInstance.flushNow(); const fileContent = await vault.read(file); const code = extractFenceBody(fileContent);`. Or better: read directly from the widget's CM6 state without round-tripping through disk: `const code = widgetInstance.childView.state.doc.toString();`.
- **Direct widget-state read is preferred** — eliminates a flush + read cycle, faster, no race window.
- **Test "type, click button immediately."** Verify no stale-code submission.

**Phase to address:** Phase 02 (Action button integration).

---

### Pitfall 22: Widget Mount on Notes Without `lc-slug` — Don't Render

**What goes wrong:**
User writes a non-LC note, includes a code block with the language tag `\`\`\`leetcode-solve` (maybe by copy-paste from a problem note). Plugin's processor mounts the widget. Widget tries to read `lc-slug` frontmatter for context; finds none; throws or renders broken.

**Why it happens:**
`registerMarkdownCodeBlockProcessor` is global per language tag; it fires for ANY note with the tag. The widget assumes LC-note context (problem ID, language frontmatter, run/submit endpoints).

**Prevention:**
- **Gate widget mount on `lc-slug` frontmatter.** In the processor handler:
  ```typescript
  this.registerMarkdownCodeBlockProcessor('leetcode-solve', (source, el, ctx) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return renderFallback(el, source);
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm?.['lc-slug']) return renderFallback(el, source);
    return mountWidget(source, el, ctx, file);
  });
  ```
- **Fallback rendering** = a simple `<pre><code>` showing the code with a small notice: "This code block requires LeetCode metadata (lc-slug)."
- **Test edge cases:** non-LC note with `\`\`\`leetcode-solve` fence; LC note with frontmatter-stripped (manual edit removed `lc-slug`); LC note with corrupted `lc-slug`.

**Phase to address:** Phase 01 (Foundation: widget mount).

---

## Minor Pitfalls

### Pitfall 23: Fence Language Lookup — Missing Languages Crash Mount

**What goes wrong:** Frontmatter has `lc-language: kotlin`, but plugin's `LANGUAGE_PACK_MAP` doesn't include Kotlin. Widget mount accesses `LANGUAGE_PACK_MAP['kotlin'] = undefined`, then `undefined.support` throws.

**Prevention:** Always provide a fallback. `const langPack = LANGUAGE_PACK_MAP[lang] || LANGUAGE_PACK_MAP['python']`. Log a warning, surface a Notice once per session: "Language X not yet supported; rendering as Python."

**Phase to address:** Phase 01.

---

### Pitfall 24: Window Resize During Edit — CM6 Layout Re-measure

**What goes wrong:** User resizes Obsidian window mid-edit. CM6 needs to re-measure layout. Widget's child CM6 may not receive the resize signal if it's disconnected from the parent's layout pipeline. Cursor offset, line wrapping break.

**Prevention:** Listen for `window.addEventListener('resize', ...)` on the widget; call `childView.requestMeasure()`. Cleanup the listener on `MarkdownRenderChild.onunload()`.

**Phase to address:** Phase 02 (polish).

---

### Pitfall 25: Plugin Update While Widget Open — Old Code Continues to Run

**What goes wrong:** Plugin updates via Community plugins → Update. Old plugin's `onunload()` fires; new plugin's `onload()` fires. Widget mounted by old plugin still has DOM references to old plugin code. Until note is reloaded, button handlers reference old code paths.

**Prevention:** This is an inherent Obsidian limitation. Document: "After updating the plugin, reload your open notes to apply the new version." Standard Obsidian advice.

**Phase to address:** Documentation only.

---

### Pitfall 26: Mobile Future Compatibility — Widget Won't Work

**What goes wrong:** Future mobile support: widget needs CM6 (works on mobile per Obsidian docs), but lookup of `app.vault.getConfig('vimMode')` may differ. Touch input semantics differ (no Tab key; no Cmd-F). 

**Prevention:** v1.3 is desktop-only per `isDesktopOnly: true`. Mobile support is a future milestone; defer fully.

**Phase to address:** N/A.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip suppression-window mechanism, use boolean flag | -50 LOC | Self-write echo bugs (Pitfall 1); multi-file race conditions | Never — the boolean version is provably broken |
| Skip multi-pane handling, allow both panes to edit | -100 LOC | Lost-edit complaints (Pitfall 2) | Phase 01 only; must land before GA |
| Skip flush-on-unload | -20 LOC | Data loss on Cmd-Q / tab switch (Pitfall 4) | Never — silent data loss is worse than any other class of bug |
| Skip widget state persistence across re-render | -80 LOC | Cursor / scroll / undo lost on every Live Preview flicker (Pitfall 3) | Never |
| Auto-migrate v1.2 notes on plugin load | +10 LOC vs. lazy-on-open | Vault corruption risk (Pitfall 7) | Never — lazy-on-open is mandatory |
| Hardcode Python as fallback language | -5 LOC | User confusion when fallback hits silently | Phase 01 with surfaced Notice — acceptable |
| Skip backup before migration | -30 LOC | Permanent vault corruption if migration has a bug | Never for production release; acceptable in dev with explicit warning |
| Skip rate limiter, debounce only | -20 LOC | File-watcher storms with sync (Pitfall 12) | Never for production; rate limiter is essential |
| Submit code from disk read instead of widget state | +10 LOC saved on flush wiring | Stale-code submissions (Pitfall 21) | Never |
| Skip embedded-note read-only handling | -40 LOC | Multi-pane race in `![[...]]` transclusions (Pitfall 16) | Phase 01 only; defaults to multi-pane bug |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Obsidian Sync | Continuous high-frequency flushes saturate sync | Increase debounce to 1000-2000ms when sync detected; rate-limit to 1/200ms |
| iCloud Drive | Atomic writes via vault.process still trigger iCloud upload on every mtime change | Document in README; let user increase debounce |
| `obsidian-git` plugin | Per-keystroke files create unwanted commit noise | Document in README; suggest debounce 2000ms for git users |
| `obsidian-vimrc-support` | Custom vim bindings in user's vimrc don't apply to widget's vim instance | Document the limitation; widget vim is `@replit/codemirror-vim` baseline only |
| External editor (vim, VS Code) | User edits LC note in external editor; saves; modify event fires | Standard reload flow handles this; ensure the conflict modal (Pitfall 8) covers it |
| `markdown-it` based Reading mode | Custom code-block plugins may conflict | Test top 5 markdown plugins; document conflicts |
| BRAT (beta plugin manager) | Beta users get auto-updates that may have migration changes | Migration backups (Pitfall 7) cover this |
| `Excalidraw`, `Dataview`, `Kanban` | All use `registerMarkdownCodeBlockProcessor`; precedent is well-established | Follow their patterns; reference their source for tricky cases |
| `obsidian-tasks` | May process `## Notes` content; v1.3 must not break this | Verify task syntax in `## Notes` still parsed |
| Theme: Minimal | Aggressive base styling | Test theme; use CSS variables only |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-keystroke flush | Sync lag, battery drain, file-watcher storms | Debounce 300-500ms + rate limit 1/200ms | Always; immediate problem |
| `cachedRead` in modify handler | Stale hash → infinite reload loop | Use `read` in modify path | First sync conflict |
| No "skip if unchanged" check | Redundant flushes during cursor movement | Compare buffer to last-written | Long sessions, idle periods |
| Re-mount full editor on every re-render | UI flash, state loss, slow cursor response | State persistence map (Pitfall 3) | Live Preview cursor proximity |
| Widget rebuilds entire CM6 on language switch | Multi-second delay on language change | Compartment.reconfigure | Every language switch |
| Modify handler hashes entire file | CPU spike on large files | Hash only the fence body, not the whole file | Files > 100KB |
| Run handler reads file from disk every click | 100ms+ latency per click | Read from widget state directly | Every button click |
| Embedded notes mount full widgets | N widgets × M edits = N×M flushes | Read-only mode for embeds (Pitfall 16) | Hub notes with many embeds |
| `metadataCache.on('changed')` not scoped | Listener fires on every vault file | Filter by file.path before logic runs | Large vaults |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing widget state with session cookie | Cookie leaked via state-persistence map | Never serialize cookies into widget state — keep in plugin's `loadData()` only |
| Logging widget content (debug logs) | User code with secrets logged | Never log fence body content; log lengths and hashes only |
| Migration backup readable by other plugins | Old code with proprietary algorithms exposed | Backup directory inside `.obsidian/plugins/obsidian-leetcode/` (plugin-private) |
| Allowing arbitrary `lc-slug` injection via widget | If `lc-slug` controls vault paths or URLs | Treat `lc-slug` as user-influenced data; validate against LC slug format `/^[a-z0-9-]+$/` before any URL/path use |
| Widget DOM accepts pasted HTML | XSS via clipboard | Already mitigated: CM6 paste handler strips HTML; verify in test |
| Migration writes to non-LC notes | Vault corruption attack vector | Strict gate on `lc-slug` frontmatter; reject without it |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent suppression of self-writes | User unsure if save happened | Subtle "saving…" indicator that fades; "saved" pulse on flush |
| Auto-reload on vim toggle | Surprise data loss + cursor jump | Banner "Vim setting changed; reload note to apply" + explicit Reload button |
| Widget unmount on Cmd-E (source toggle) | Code editor disappears mid-edit | Explain in README; document that Source mode shows raw fence intentionally |
| No visual distinction live vs. mirror pane | User edits in mirror pane, edits lost | "Editing in: Pane 1" indicator on each widget |
| Conflict resolution defaults to silent overwrite | Lost work | Modal: "Choose your version / Keep external / View diff" |
| Migration prompt on every open | Annoyance | One-time confirmation per file; setting to disable prompts |
| Run/Submit click while debounce in flight | Submits stale code | Flush before submit; loading state on button until flush + submit complete |
| Cmd-Z scope changes silently | "Why doesn't undo work?" | Visual scope indicator in widget chrome |
| Cmd-F scope changes silently | "I can't find this text" | README + chrome hint |
| Action row buttons clip on narrow panes | Functionality unreachable | flex-wrap; ensure minimum widget width or graceful clipping |
| "Saving..." indicator stays visible forever (stuck flush) | User thinks save broken | Timeout fallback: if flush doesn't complete in 5s, show error and offer manual save |

---

## "Looks Done But Isn't" Checklist

- [ ] **Widget mount:** Renders in Reading mode, Live Preview, AND degrades cleanly in Source mode (raw fence visible)
- [ ] **Widget mount:** Handles `getSectionInfo` returning null without crashing (renders fallback)
- [ ] **Widget mount:** Gates on `lc-slug` frontmatter; non-LC fences render fallback
- [ ] **Widget mount:** Supports embedded views (`![[...]]` transclusions) as read-only
- [ ] **Self-write suppression:** Per-path content-hash map with timeout; not a boolean
- [ ] **Self-write suppression:** Multi-file scenario tested (write to A while suppression entry for B is active)
- [ ] **Multi-pane:** Live + mirror designation; visual indicator; promote-on-focus
- [ ] **Live Preview:** Type in adjacent paragraph for 60s; widget does not flash; child editor state preserved
- [ ] **Live Preview:** Up-arrow out of widget then down-arrow back in; cursor + scroll preserved
- [ ] **Live Preview:** Click directly on widget; raw-fence reveal handled gracefully
- [ ] **Debounce:** Flush on `MarkdownRenderChild.onunload`, `Plugin.onunload`, `beforeunload`, `active-leaf-change`, button clicks, file rename
- [ ] **Debounce:** Cmd-Q with unsaved edits → edits persisted before quit
- [ ] **Vim toggle:** Banner appears when setting changes; explicit reload required; flush-before-reload
- [ ] **Round-trip:** Test fixture with triple backticks in body — widget rejects paste OR uses 4-backtick fence
- [ ] **Round-trip:** Test fixture with `---` lines in body — passes through unchanged
- [ ] **Round-trip:** Test fixture with leading whitespace + trailing whitespace — preserved exactly
- [ ] **Round-trip:** Hash check after every flush; warning on mismatch
- [ ] **Migration:** Lazy-on-open only; never on plugin load
- [ ] **Migration:** Backup directory created; 30-day retention documented in README
- [ ] **Migration:** Idempotent (already-migrated notes detected, skipped)
- [ ] **Migration:** v1.0, v1.1, v1.2 sample-vault fixtures pass migration in CI
- [ ] **Migration:** Setting to disable migration prompts
- [ ] **External edit:** Sync push during local typing → conflict modal, no silent overwrite
- [ ] **External edit:** Cursor + scroll preserved across non-conflict reloads
- [ ] **Action row:** Tested in Minimal, Things, Catppuccin, Anuppuccin, Atom themes — no visual regressions
- [ ] **Action row:** Buttons wrap on 600px-wide panes; no clip
- [ ] **Action row:** Click any button → editor focus restored after handler
- [ ] **Section protection:** `## Problem` body still protected from edits (re-implemented from v1.2 lock)
- [ ] **Section protection:** `## Techniques` heading still protected
- [ ] **Frontmatter sync:** External `lc-language` edit → widget reconfigures language live
- [ ] **Frontmatter sync:** Language switch flushes, then writes frontmatter, then reconfigures
- [ ] **Performance:** Continuous typing in 60s session on synced vault → no sync conflicts
- [ ] **Performance:** Settings exposes "Save delay" slider 300/500/1000/2000ms
- [ ] **Performance:** Rate limiter prevents > 1 flush per 200ms
- [ ] **Performance:** Skip flush if buffer unchanged
- [ ] **AI Debug / Run / Submit:** Read code from widget state, not disk; verify with "type-then-click-immediately" test
- [ ] **Plugin review:** README updated for v1.3 architecture
- [ ] **Plugin review:** `eslint-plugin-obsidianmd` clean (no innerHTML, no workspace.activeLeaf, etc.)
- [ ] **Plugin review:** Bundle size CI gate (no regression vs. v1.2)
- [ ] **Plugin review:** Migration documented in README with backup location

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Self-write echo loop in production | LOW | Hotfix: replace boolean flag with per-path hash map. Users' data unaffected (corruption manifests as garbled typing — visible immediately). |
| Multi-pane data loss reported | MEDIUM | Hotfix: degrade to single-pane mode (second pane becomes mirror); subsequent release adds promote-on-focus. |
| Live Preview state loss reported | MEDIUM | Hotfix: state persistence map. May need a setting "remember widget state across re-render" defaulted on. |
| Debounce data loss on Cmd-Q | MEDIUM | Hotfix: synchronous flush in `onunload`. Document any edge case (e.g., crash) where data is still lost. |
| Vim toggle confusion | LOW | Documentation update + banner UX patch. |
| Round-trip corruption (triple backticks) | HIGH | Forensic recovery from migration backup OR vault snapshots. Add post-flush hash verification to prevent recurrence. |
| Migration data loss | HIGH | Restore from migration backup directory (Pitfall 7). If backup missing: Obsidian Sync version history; iCloud version history; user-provided git history. Worst case: user lost data. |
| External-edit silent overwrite | HIGH | Restore from `vault.cachedRead` history if available; otherwise from Sync. Add conflict modal in next release. |
| Section protection regression | LOW | Re-implement narrowed section lock; ship hotfix. |
| `lc-language` desync | LOW | Manual frontmatter edit; add metadataCache listener in next release. |
| File-watcher storm caused sync conflicts | MEDIUM | Bump default debounce to 1000ms; expose setting. Resolve sync conflicts manually via Sync UI. |
| Plugin store rejection over architecture | MEDIUM | Update README, address reviewer feedback, resubmit. Multi-week delay typical. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Pitfall 1: Self-write echo | Phase 01 (Foundation) | Test: write to file A while suppression entry for file B is active — both are handled correctly |
| Pitfall 2: Multi-pane coherence | Phase 02 (Multi-pane + reconciliation) | Test: open same file in two panes, type in both, verify last-focused wins as live |
| Pitfall 3: Live Preview re-render | Phase 01 (Foundation: state persistence) | Test: type in adjacent paragraph 60s, verify widget never flashes/loses state |
| Pitfall 4: Debounce edge cases | Phase 01 (Foundation: flush hooks) | Test: type and Cmd-Q immediately; type and switch tab; type and click Run |
| Pitfall 5: Vim mode toggle | Phase 04 (Vim integration) | Test: toggle vim mid-edit; verify banner appears and explicit reload required |
| Pitfall 6: Round-trip bugs | Phase 01 (Foundation: serialization) | Test: hostile input fixtures (triple backticks, `---`, leading/trailing ws, CRLF) |
| Pitfall 7: Migration | Phase 03 (Migration) | Test: v1.0/v1.1/v1.2 sample-vault fixtures pass migration with backup |
| Pitfall 8: Cursor restoration | Phase 02 (External-edit reconciliation) | Test: simulated Sync push during typing → conflict modal, no silent overwrite |
| Pitfall 9: Action row layout | Phase 02 (Widget chrome) | Theme matrix visual test (Minimal, Things, Catppuccin, Anuppuccin, Atom) |
| Pitfall 10: Section-lock removal | Phase 02 (Section protection rewire) | Test: type into `## Problem` body, verify still blocked |
| Pitfall 11: Frontmatter sync | Phase 02 (Language + frontmatter wiring) | Test: external frontmatter edit reconfigures widget language |
| Pitfall 12: File-watcher storms | Phase 01 (Sync layer with rate limit) + Phase 02 (settings) | Test: 60s typing on synced vault → no sync conflicts |
| Pitfall 13: Plugin-store re-review | Final polish phase | Lint clean; README updated; bundle-size gate; alpha period |
| Pitfall 14: Widget identity | Phase 01 (Foundation) | Same as Pitfall 3 |
| Pitfall 15: getSectionInfo null | Phase 01 (Foundation) | Test: embedded note (`![[...]]`) doesn't crash |
| Pitfall 16: Embedded notes | Phase 02 (Multi-context) | Test: hub note embeds 3 problem notes; widgets render read-only |
| Pitfall 17: Mode lifecycle differences | Phase 01 (cross-mode tests) | Test in Reading + Live Preview + Source explicitly |
| Pitfall 18: Read vs cachedRead | Phase 01 | Code review: modify handler uses `read` not `cachedRead` |
| Pitfall 19: Cmd-Z confusion | Phase 02 (UX polish) | UX validation; documented in README |
| Pitfall 20: Cmd-F confusion | Phase 02 (UX polish) | UX validation; documented in README |
| Pitfall 21: Stale code on Run/Submit | Phase 02 (Action button integration) | Test: type then click Run immediately; verify fresh code |
| Pitfall 22: Non-LC note widget mount | Phase 01 (Foundation: `lc-slug` gate) | Test: non-LC note with `\`\`\`leetcode-solve` renders fallback |
| Pitfall 23: Missing language pack | Phase 01 (Foundation: language fallback) | Test: `lc-language: kotlin` (or other unsupported) renders Python fallback with Notice |
| Pitfall 24: Window resize | Phase 02 (Polish) | Test: resize window mid-edit; cursor / wrap correct |
| Pitfall 25: Plugin update with widget open | N/A (documentation only) | README note |
| Pitfall 26: Mobile compat | N/A (out of scope) | `isDesktopOnly: true` enforced |

---

## Phase Boundary Recommendations

Based on pitfall clustering, suggested v1.3 phase boundaries:

| Phase | Scope | Pitfalls Addressed | Why This Boundary |
|-------|-------|--------------------|--------------------|
| Phase 01: Widget Foundation | Mount widget, render in Reading + Live Preview, state persistence map, fence body extract/serialize, suppression-window mechanism, flush-on-transition hooks, `lc-slug` gating, language pack fallback, mode-lifecycle test coverage | P1, P3, P4, P6, P14, P15, P17, P18, P22, P23 | These are foundational primitives; bugs here cascade through every subsequent phase. Must be rock-solid before sync work begins. |
| Phase 02: Reconciliation, UX, Action Row | Multi-pane handling (live/mirror), external-edit conflict modal, cursor restoration, frontmatter sync wiring, language switch via Compartment, action row in widget DOM, section protection rewire (narrower scope), Cmd-Z / Cmd-F UX polish, embedded-note read-only, button handlers flush-then-read, settings (save-delay), rate limiter | P2, P8, P9, P10, P11, P12, P16, P19, P20, P21, P24 | These are integration concerns that depend on a stable widget. Must land before migration to avoid migration revealing latent bugs. |
| Phase 03: v1.2 Migration | Lazy-on-open fence rewrite, backup directory, idempotent detection, CI fixtures for v1.0/v1.1/v1.2 sample vaults, opt-out setting, README documentation | P7 | Single high-risk concern; isolated phase to allow extensive testing before user data is touched. |
| Phase 04: Vim, Polish, Pre-Submission | Vim mode integration with banner-on-toggle, polish for plugin-store review (lint, README, bundle gate), alpha/beta period | P5, P13, P25 | Vim is a discrete feature; pre-submission is a checklist phase. |

---

## Sources

- **Obsidian Developer Docs (Context7 `/obsidianmd/obsidian-developer-docs`, fetched 2026-05-28):**
  - `Plugin.registerMarkdownCodeBlockProcessor()` — confirmed signature and behavior (HIGH)
  - `MarkdownPostProcessorContext.getSectionInfo()` — explicitly returns null in many circumstances (HIGH)
  - `Vault.process()` — atomic read/modify/save (HIGH)
  - `Vault.on('modify')` — fires on any file modify, no userEvent annotation (HIGH)
  - `MarkdownRenderChild` — lifecycle management for widget DOM (HIGH)
  - `app.fileManager.processFrontMatter` — atomic frontmatter rewrite, fires metadataCache event (HIGH)
- **v1.2 PITFALLS.md and NESTED-EDITOR-PITFALLS.md** — direct lessons-learned source (HIGH, primary source for migration / convention concerns)
- **CLAUDE.md project conventions** — `'leetcode.*'` userEvent bypass, canonical write-path pattern, vault path memory (HIGH)
- **PROJECT.md v1.3 milestone definition** — accepted UX trade-offs (Cmd-Z scope, Cmd-F scope, vim reload-on-toggle), bundle size precedent (HIGH)
- **MILESTONES.md v1.0/v1.1/v1.2 history** — v1.2 phase 17 D-05 ("canonical plugin write-path"), Phase 18 vim isolation, fence auto-recovery; v1.0 section lock requirement (HIGH)
- **Recent commits (afea41f, c087fe3, 46dbd33, f0de77f)** — trailing-newline normalization, sync divergence guard, action row redesign, SVG via DOMParser (HIGH, primary source for recent bug class precedent)
- **Community plugin precedents** — Dataview, Excalidraw, Kanban, Advanced Tables all use `registerMarkdownCodeBlockProcessor` for inline interactive widgets (MEDIUM, observed pattern; specific implementations not deeply audited for this research)
- **CM6 reference** — `Compartment.reconfigure`, `EditorView.editable`, `history` extension (HIGH, prior research carryover)

**Confidence levels:**
- HIGH: pitfalls grounded in Obsidian docs, v1.2 lessons learned, or official APIs
- MEDIUM: pitfalls extrapolated from v1.2 patterns to v1.3 mechanics; testing required to confirm exact behavior
- Single LOW-confidence claim: that `mousedown.stopPropagation()` on widget root prevents Live Preview cursor-place behavior (Pitfall 3 prevention) — this is empirical and must be validated

---
*Pitfalls research for: Obsidian LeetCode v1.3 milestone (Inline Widget + One-Way Sync Architecture)*
*Researched: 2026-05-28*
