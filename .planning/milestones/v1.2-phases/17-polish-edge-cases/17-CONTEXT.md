# Phase 17: Polish & Edge Cases - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 17 closes out v1.2's Code Editor Experience milestone by (a) honoring the 5 stated roadmap success criteria — paste-as-raw, IME safety, Source↔Live Preview parity, bundle audit, and lifecycle/leak verification — and (b) clearing the Phase 13–16 carry-over backlog: Reset undo scope regression (major), fence opener/closer auto-recovery regression (major — `repairFenceStructure` not behaving correctly), Tab mid-line indent behavior, external `lc-language` frontmatter reactivity, theme-aware HighlightStyle (with bracket-match contrast), Go syntax highlighting (low-priority gap), and vim mode in the child editor (matched to Obsidian's `vimMode` setting). Plugin-store re-submission is explicitly OUT — pushed to a later v1.2.x cycle. v1.3+ items (BRACKET-05 triple-backtick, modular panel layout, full language-server features) remain deferred.

</domain>

<decisions>
## Implementation Decisions

### Scope Perimeter
- **D-01:** Phase 17 covers all 5 roadmap criteria + all 7 carry-over items from the Phase 13/15/16 backlog (Reset undo, Tab mid-line, fm reactivity, theme HighlightStyle, dark-mode bracket-match contrast, Go highlighting, vim mode) + the fence opener/closer auto-recovery regression (`repairFenceStructure` in `childEditorSync.ts:355` is not behaving correctly — surfaced 2026-05-23). Plugin-store re-submission is OUT of Phase 17 scope — handled in a separate post-v1.2 release phase (allows v1.2 to land internally before community-store ceremony).
- **D-02:** v1.3 deferrals carried forward unchanged: BRACKET-05 (triple-backtick auto-close in JS/TS), modular panel layout, IDE features (IntelliSense/linting). Not reopened.

### Reset Undo Scope (Major Carry-over from Phase 16)
- **D-03 (architectural):** Reset code refactors to dispatch through the **child editor's CM6** (not the parent). The child gets the undo entry; child→parent sync mirrors the change to the parent doc with `addToHistory.of(false)` (existing pattern in `childEditorSync.ts:112,162`). Cmd-Z in the child undoes Reset; Cmd-Z while focused in `## Notes` is a no-op for code state. Restores Phase 15 D-05 invariant (cm-z scope isolation) for Reset, which currently breaks it.
- **D-04:** When the file isn't open in a MarkdownView (no child registered), Reset falls back to `app.vault.process(...)` — same fallback pattern as the current implementation. The reopen path will rebuild the child from disk content.
- **D-05:** This sets the **canonical write-path pattern** for any future plugin write that touches the fence body (Copy to Code likely has the same latent issue — flagged for verification but not in-scope to refactor here unless the audit finds a confirmed regression). Document the pattern in code comments + CLAUDE.md `## Conventions` so future writers don't repeat the parent-CM6-with-userEvent mistake.
- **D-06:** Frontmatter `lc-language` sync via `processFrontMatter` stays untouched — Phase 16's resolver-based logic (frontmatter → active fence opener tag → `getDefaultLanguage()`) is correct and only needs the dispatch path swap.

### Fence Opener/Closer Auto-Recovery Regression (Major Carry-over surfaced 2026-05-23)
- **D-06b:** `repairFenceStructure` in `src/main/childEditorSync.ts:355` (Phase 14 D-05 design — dispatches with `userEvent: 'leetcode.fence-repair'`) is not auto-recovering opener/closer correctly. Treat as a debug-driven bug fix in Phase 17 Wave 1 alongside Reset (both touch the write-path / sync module).
- **D-06c:** Investigation must surface the root cause before fix. Candidate hypotheses for the researcher: (a) opener/closer detection in the diff path mis-classifies the user's edit (so repair never triggers), (b) repair triggers but dispatches a write that `ECHO_PRONE_USER_EVENTS` swallows on the listener side (Phase 16 narrowed this, but the repair path may still be filtered downstream), (c) the repaired offsets are stale relative to the parent's current doc state, (d) the repair fires but the section lock or another transaction filter drops it. Track in a debug doc: `.planning/debug/fence-auto-recovery-regression.md`.
- **D-06d:** Fix must include a regression test in `tests/main/childEditorSync.test.ts` (or equivalent) that constructs a damaged-fence parent state and asserts `repairFenceStructure` produces a syntactically intact fence + opener tag matches the active language slug + child editor stays in sync after repair.

### Edge Inputs (Paste / IME / Source↔Live Preview)
- **D-07:** **Verify-first, fix-only-if-broken.** Manual UAT scripts are the deliverable when stock CM6 behavior is correct (likely the case for paste + IME — CM6 has robust composition-event handling). Add regression tests only where verification surfaces an actual failure. Avoids speculative complexity.
- **D-08:** Paste UAT must include: VS Code → child, StackOverflow HTML → child, LeetCode web copy → child, Obsidian's own clipboard interceptor (note that Obsidian sometimes formats pasted markdown — must NOT happen inside child).
- **D-09:** IME UAT must include: Chinese pinyin composition (multi-keystroke → committed character), Japanese romaji → kanji conversion, Korean Hangul. Verify no duplication, no truncation, no early-commit on the first sync dispatch.
- **D-10:** Source↔Live Preview UAT: Cmd-E with cursor in child + pending edits → flip → child preserves state on flip-back. Special attention to Source Mode rendering of `Decoration.widget({ block: true })` (Pitfall 8 in NESTED-EDITOR-PITFALLS.md).

### Tab Mid-line Behavior
- **D-11:** Replace the bare `indentWithTab` keymap entry with a custom command that branches on cursor position: at line-start (or with selection that spans line-starts) → indent the line(s); mid-line → insert tab character at cursor. CM6 ships `insertTab` and `indentMore` separately — combine them with a position check. Selection ranges always indent (current behavior — preserved).
- **D-12:** Multi-line selection still acts as a single undo step (Phase 15 invariant — preserved).

### External `lc-language` Frontmatter Reactivity (Phase 16 D-14)
- **D-13:** Add a `metadataCache.on('changed')` listener (registered via `this.registerEvent()` for plugin lifecycle cleanup). When the changed file's `lc-language` frontmatter differs from the child's currently-applied language, dispatch `Compartment.reconfigure(...)` on the child (same effect shape as Phase 16 D-12 chevron path) with `userEvent: 'leetcode.lang-switch'`. Reuses the existing chevron switch plumbing.
- **D-14:** No fence-opener rewrite from this listener — frontmatter is the source of truth in this scenario; if the user wanted the fence opener to flip too, they'd use the chevron. Avoids automating writes to the document body from a passive listener.

### Theme-aware HighlightStyle (Phase 16 D-16) + Go + Bracket-match Contrast
- **D-15:** Build a single Obsidian-CSS-variable-bound `HighlightStyle` and apply it via `syntaxHighlighting(themedHighlightStyle)` in the child editor's extension array. Map Lezer tags to Obsidian variables: `--code-keyword`, `--code-string`, `--code-comment`, `--code-function`, `--code-tag`, `--code-property`, etc. (Obsidian publishes these in its theme contract.) This addresses both the cosmetic dark-mode contrast issue AND the keyword/string/comment color quality across all Lezer-based languages.
- **D-16:** **Bracket-match contrast** is solved as a side effect of D-15 by emitting a CSS rule for `.cm-matchingBracket` that uses high-contrast Obsidian theme variables (foreground + a slightly tinted background). Verify visually in dark + light themes.
- **D-17 (Go highlighting — conditional):** If applying the same `syntaxHighlighting(themedHighlightStyle)` to the legacy-modes Go `StreamLanguage` (likely needs binding via `StreamLanguage.define(go).data.of({...})` or a `LanguageSupport` wrapper) is small (~10–20 lines, no new deps), include it. If it's non-trivial (requires custom token mapper or new package), **leave Go as plain text for v1.2** and document as v1.3 polish. User explicitly green-lit this tradeoff.

### Vim Mode in Child Editor
- **D-18:** Read `app.vault.getConfig('vimMode')` (Obsidian's global vim setting) at child mount. When true, include `@replit/codemirror-vim` (or current best-maintained CM6 vim package per research phase) in the child's extensions. When false, the child stays standalone (current behavior). Per-user setting tracking, no new plugin setting field.
- **D-19:** Vim package adds ~30–60 KB to the bundle (estimate — researcher to confirm). Bundle ceiling already at 1.6 MB HARD; leaves ~20–50 KB headroom (current is 1.578 MB raw / 1.6 MB ceiling). If estimate proves higher, gate on bundle-size check before commit. **Do not raise the ceiling further for vim mode** — cuts scope (defer to v1.3) instead.
- **D-20:** Vim keymap interactions to verify in UAT: Esc still returns focus to parent (Phase 15 escape hatch) — vim's Esc should still allow our blur-to-parent path, OR vim's Esc enters Normal mode and a SECOND Esc (or Cmd-blur equivalent) returns focus. Tab in Insert mode follows D-11 (mid-line vs line-start). Cmd-/ (COMMENT-01) still works in both Normal and Insert mode. `:w` is a no-op or maps to Obsidian's save (researcher decision).
- **D-21:** Conditional bundle-cost path: if dynamic-import works under esbuild's CJS+nosplit config (test in Wave 3), non-vim users pay zero cost. If it doesn't (likely — same constraint as the AI SDK), the package is always bundled and the conditional applies only at runtime — accepted tradeoff.

### Wave Shape (advisory — planner finalizes)
- **D-22:** Suggested 3-wave structure for the planner: **Wave 1** Reset undo refactor + fence opener/closer auto-recovery debug+fix + Tab mid-line (all three touch the parent↔child write/sync module — same dispatch primitives, share regression-test fixtures). **Wave 2** Edge-input UAT (paste/IME/Source-mode) + external fm reactivity (input-edge cluster). **Wave 3** themed HighlightStyle (+ optional Go) + vim mode + bundle audit + lifecycle/leak verification (polish + ship-ready). The planner may consolidate or re-split based on dependency analysis — not locked.

### Lifecycle & Bundle Validation (roadmap criteria 4+5)
- **D-23:** Lifecycle verification has two arms: (a) automated unit/integration test in vitest covering the registry destroy path on plugin unload + on note close (LRU eviction); (b) manual DevTools heap-snapshot UAT script — open/close 20 notes, take heap snapshot, verify no detached EditorView instances or growing decoration sets. UAT script + snapshot results checked into `.planning/phases/17-polish-edge-cases/`.
- **D-24:** Bundle audit produces a written record (final `main.js` size raw + gzipped, breakdown of contributors) before phase close. Hard gate: must remain under 1.6 MB ceiling. If vim mode lands and pushes bundle over, vim mode is excluded from v1.2 (per D-19).

### Claude's Discretion
- File layout: themed HighlightStyle definition probably lives in a new `src/main/childEditorTheme.ts` or extends `childEditorFactory.ts`. Whichever is cleaner for the planner.
- Vim package selection: `@replit/codemirror-vim` is the historically common choice but may not be the actively-maintained CM6 6.x compatible build in 2026. Researcher selects based on maintenance + size + CM6 6.x compatibility.
- Heap-snapshot tooling: pick the simplest reliable approach (DevTools manual or a Playwright-driven script). Manual snapshot is probably enough for v1.2.
- Test layout: paste/IME UAT cases likely live in a single `17-UAT.md` markdown checklist alongside automated regression tests in `tests/main/`. Reuse Phase 16's UAT format.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13–16 Foundation (direct dependencies)
- `.planning/phases/13-nested-editor-foundation/13-CONTEXT.md` — Widget pattern, registry lifecycle, lifecycle cleanup invariants (foundation for D-23)
- `.planning/phases/14-bidirectional-sync/14-CONTEXT.md` — `userEvent: 'leetcode.*'` convention, child-sync echo prevention via `syncAnnotation`, `addToHistory.of(false)` on mirror dispatches (foundation for D-03/D-05)
- `.planning/phases/15-focus-undo-cursor/15-CONTEXT.md` — D-05 cm-z scope isolation invariant (Reset must restore this), `indentWithTab` keymap (D-11 modifies this), Escape-to-parent escape hatch (D-20 vim must preserve)
- `.planning/phases/16-language-packs-switching/16-CONTEXT.md` — `languageCompartment` (D-13 reuses for fm reactivity), Compartment.reconfigure pattern, `defaultHighlightStyle` (D-15 replaces this), Go legacy-modes plumbing (D-17), bundle ceiling at 1.6 MB HARD (D-19/D-24)
- `.planning/phases/16-language-packs-switching/16-UAT.md` — Phase 17 carry-over backlog (lines 116–192) with full reproduction notes and severity flags

### Debug Sessions (architectural pattern references)
- `.planning/debug/reset-code-language-regression.md` — Phase 16 Reset fix (resolver + parent CM6 dispatch). D-03 refactors the dispatch path WITHOUT changing the resolver logic.
- `.planning/debug/chevron-switch-child-body-stale.md` — `ECHO_PRONE_USER_EVENTS` Set in `nestedEditorExtension.ts:269`; D-13 fm-reactivity dispatches with `userEvent: 'leetcode.lang-switch'` which is NOT in that set, so it propagates correctly to child sync.

### Source Files (touch points)
- `src/solve/resetCodeWithConfirm.ts` — Reset implementation. D-03 swaps the parent CM6 dispatch path for a child-CM6 path; vault.process fallback (D-04) preserved when no MarkdownView is open.
- `src/main.ts:2780–2810` — Current Reset CM6 dispatch with `userEvent: 'leetcode.reset'`. This block changes to dispatch on the child instead of the parent.
- `src/main/childEditorSync.ts:112,162,228` — `addToHistory.of(false)` pattern; mirror-only history convention used by D-03.
- `src/main/childEditorSync.ts:355 repairFenceStructure` — Auto-recovery for damaged fence opener/closer. D-06b debugs why it's not recovering correctly; dispatch annotation at line 422 (`'leetcode.fence-repair'`) is on `ECHO_PRONE_USER_EVENTS` (intentional — repair is parent-side; child sync mirrors via `repaired` return path at line 98).
- `src/main/nestedEditorExtension.ts:267` — `ECHO_PRONE_USER_EVENTS` Set includes `'leetcode.fence-repair'`. D-06c hypothesis (b) probes whether this is over-filtering for the repair propagation path.
- `src/main/childEditorFactory.ts` — Child editor extension array. D-15 (HighlightStyle), D-18 (vim conditional), D-11 (Tab keymap) all modify the extensions list.
- `src/main/nestedEditorExtension.ts:269 ECHO_PRONE_USER_EVENTS` — Confirms `'leetcode.lang-switch'` (D-13) propagates; new userEvents (if any) must be evaluated against this Set.
- `src/main/codeActionsEditorExtension.ts` — `languageRefreshEffect` for parent-side language switch; D-13 listener dispatches the same effect on the child via Compartment.
- `src/settings/SettingsStore.ts` / `src/settings/SettingsTab.ts` — No new fields planned for Phase 17 (vim follows Obsidian's `vimMode`, not a plugin setting).
- `src/solve/languages.ts` — Language slug catalog; consulted by D-13 fm reactivity for slug→LanguageSupport mapping.

### Architecture & Pitfalls
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Especially Pitfall 1 (widget destruction, lifecycle for D-23), Pitfall 5 (Live Preview re-render storms, D-10), Pitfall 8 (Source Mode parity, D-10).
- `.planning/research/ARCHITECTURE.md` — v1.2 architecture context.
- `.planning/research/STACK.md` — Bundle ceiling history (D-24).

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — All 16 v1.2 requirements covered ✓; Phase 17 is polish only (no new REQ-IDs). BRACKET-05 stays Deferred.
- `.planning/ROADMAP.md` §Phase 17 — 5 success criteria (paste, IME, Source/Live Preview, bundle, lifecycle).
- `.planning/PROJECT.md` — Bundle ceiling discussion + v1.2 architecture decisions in "Key Decisions".

### CLAUDE.md Conventions
- `CLAUDE.md` §"Conventions" — `'leetcode.*'` userEvent bypass for plugin-internal CM6 dispatches. D-03's child-CM6 dispatch follows this; the userEvent string for the new Reset path (likely `'leetcode.reset.child'` or unchanged `'leetcode.reset'` on the child) must be added to this convention block as part of the phase work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/childEditorSync.ts:112,162` — `addToHistory.of(false)` annotations on mirror dispatches; D-03 reuses this exact pattern.
- `src/main/childEditorFactory.ts` — Extension array is the single mount point for D-11 (Tab keymap), D-15 (HighlightStyle), D-18 (vim).
- `src/main/codeActionsEditorExtension.ts:112 languageRefreshEffect` — Reusable for D-13 fm reactivity (dispatch on child instead of parent).
- `src/main/childEditorRegistry.ts.get(filePath)` — Registry lookup. D-13 listener and D-23 lifecycle test both use this.
- `app.vault.getConfig('vimMode')` — Obsidian's global vim setting. D-18 reads this at mount.
- `app.metadataCache.on('changed', ...)` — Standard Obsidian metadata-change hook for D-13.
- `Transaction.addToHistory.of(false)` — CM6 standard primitive for non-undoable transactions.

### Established Patterns
- **Plugin write path canonical pattern (D-05):** Plugin writes touching the fence body should dispatch via the child editor's CM6 instance (when available) so the change lands in the child's undo stack. Mirror to parent doc with `addToHistory.of(false)` via the existing child-sync extension. Fall back to `app.vault.process(...)` only when no child is registered (note not open in a MarkdownView).
- **Compartment-based config swap pattern:** `D-13` reuses Phase 16's `languageCompartment.reconfigure(...)` shape — single effect on the child, no rebuild of the StateField, no widget re-mount.
- **Conditional extension loading pattern:** D-18 vim is the first conditional-by-runtime-setting extension. Pattern: read `app.vault.getConfig(...)` in `createChildEditor(...)` and spread `(vimEnabled ? [vim()] : [])` into the extensions array.

### Integration Points
- `src/main.ts` (`onload`) — D-13 fm-change listener registers here via `this.registerEvent(this.app.metadataCache.on('changed', handler))`.
- `src/main/childEditorFactory.ts` createChildEditor signature — D-18 may need access to `app` (to read vim config); D-15 needs the new `themedHighlightStyle`.
- `src/main.ts:resetCode` (or wherever the helper is invoked) — D-03 changes the dispatch target from parent CM6 to the child CM6 obtained via `childEditorRegistry.get(file.path)`.
- `package.json` — Add vim package dependency (D-18). Confirm no transitive bloat.

</code_context>

<specifics>
## Specific Ideas

- The Reset undo regression user-flagged screenshot shows the entire prior solution body inside `## Notes` — the canonical demonstration of the cm-z scope isolation invariant being broken. After D-03, this exact reproduction must produce a clean undo (child returns to prior body, Notes untouched) regardless of whether focus is in the editor or in Notes when Cmd-Z fires.
- Theme-aware HighlightStyle should "feel like Obsidian's native code-block colors" — use Obsidian's existing CSS variables so the child's syntax highlight is visually indistinguishable from a Source-Mode markdown code block at default theme + same plugin theme.
- Vim mode should match the user's existing Obsidian vim experience — no new bindings, no new modal UX. If Obsidian's vim is enabled, the child gets vim. If not, no vim. One toggle, one truth.
- Phase 17 closes v1.2 internally; plugin-store re-submission is a separate ceremony in v1.2.x. The README disclosure / version-bump / community-plugins.json PR work belongs there, not here.

</specifics>

<deferred>
## Deferred Ideas

- **Plugin-store re-submission** — README updates (bundle disclosure, new editor-experience section, screenshots), `manifest.json` version bump to 1.2.0, `community-plugins.json` PR. Push to a v1.2.x release phase post-Phase-17. Lets the editor experience stabilize internally before public release.
- **Go syntax highlighting** *(if non-trivial — see D-17)* — If binding the legacy-modes StreamLanguage to the themed HighlightStyle requires more than ~20 lines or new tooling, defer to v1.3. User-flagged "low priority, OK to leave as-is for 1.2."
- **Copy to Code undo-scope audit** *(latent)* — D-05 calls out that Copy to Code likely has the same parent-CM6-dispatch issue Reset does. Phase 17 fixes the canonical pattern via Reset; an audit + fix for Copy to Code can land in v1.2.x or v1.3 depending on confirmed severity.
- **BRACKET-05 (triple-backtick auto-close in JS/TS)** — Already Deferred from Phase 16. Stays deferred.
- **Modular panel layout (LC-web-style resizable panels)** — Stays in v1.3+.
- **Full IDE features** (IntelliSense, linting, debugger, snippet expansion, multi-cursor) — Out of scope for v1.x; would require a language-server architecture.
- **AI auto-tagging of contest problems / batch migration UI** — Carried in PROJECT.md Deferred Items table (AIKG-FUT-04 / AIKG-FUT-01).

</deferred>

---

*Phase: 17-Polish & Edge Cases*
*Context gathered: 2026-05-23*
