# Phase 16: Language Packs & Switching - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 delivers: full CM6 LanguageSupport for all 8 LeetCode languages (Python, Java, C, C++, JavaScript, TypeScript, Go, Rust) wired into the child editor; chevron-driven language switching that atomically reconfigures the child via a single Compartment (parser + indent + comment syntax + bracket-pair config); language-aware Tab/Shift-Tab indent units; bracket auto-close (BRACKET-01/02/03/04); Cmd-/ line-comment toggle with the active language's comment syntax; and bracket-match highlighting (already present from Phase 13). Bundle-size accepts ~50–80 KB additional from the new lang packs (Rust + legacy-modes Go), well within the v1.2 ceiling of ~1.5 MB.

</domain>

<decisions>
## Implementation Decisions

### Language Pack Sourcing
- **D-01:** Add `@codemirror/lang-rust` (latest 6.x) as a direct dependency for Rust. Lezer-based, full indent/highlight/match — same quality tier as the existing `lang-python`/`lang-java`/`lang-cpp`/`lang-javascript`.
- **D-02:** Add `@codemirror/legacy-modes` as a direct dependency for Go. Use `StreamLanguage.define(go)` from `@codemirror/legacy-modes/mode/go`. CM5-style (regex-based, no Lezer tree); accepted tradeoff because no official `@codemirror/lang-go` exists. Provides syntax highlighting + brace-counting indent — adequate for typical LC Go solutions.
- **D-03:** Reuse `@codemirror/lang-cpp` for both `cpp` and `c` LC slugs (already convention in `src/solve/languages.ts`). Reuse `@codemirror/lang-javascript` (configured with `{ typescript: true }`) for the `typescript` slug.
- **D-04:** No language pack for any LC slug outside the 8 chevron-supported languages. The chevron only exposes the 8; other LC slugs (csharp, kotlin, ruby, swift, scala, php, dart, elixir, erlang, racket, mysql, postgresql, mssql, oraclesql) are out of scope for the child editor and continue to render via the existing fallback path.

### Per-Language Indent Unit (INDENT-04)
- **D-05:** Per-language indent map (the `'auto'` defaults):
  - `python3`, `java`, `cpp`, `c`, `rust` → 4 spaces (`'    '`)
  - `javascript`, `typescript` → 2 spaces (`'  '`)
  - `golang` → real tab character (`'\t'`) — gofmt-idiomatic, matches LC web's Go editor
- **D-06:** Add ONE settings field: `indentSizeOverride: 'auto' | 2 | 4 | 8`, default `'auto'`. When `'auto'`, the per-language map applies. When set to a number, that number of spaces is used for all languages **except** Go, which always uses tab regardless of the override (gofmt is non-negotiable).
- **D-07:** The effective indent unit is recomputed on every language switch. The `indentUnit.of(...)` extension is part of the language Compartment (D-09) so it always stays in sync.

### Bracket Auto-Close (BRACKET-01..05)
- **D-08:** Add `@codemirror/autocomplete` as a direct dependency (currently transitive via `lang-cpp`/`lang-javascript`). Use stock `closeBrackets()` and `closeBracketsKeymap`. Each LanguageSupport already declares its own bracket pairs in its `languageData`, so `closeBrackets()` becomes per-language automatically.
  - Covers BRACKET-01 (open inserts pair), BRACKET-03 (overtype on closer), BRACKET-04 (Backspace deletes pair).
- **D-09:** **BRACKET-05 (triple-backtick template literals in JS/TS) is deferred for v1.2.** Justification: LC test cases don't exercise template literals on a meaningful scale; CM6's stock closeBrackets doesn't ship a triple-backtick rule. Update `.planning/REQUIREMENTS.md` to mark BRACKET-05 as **Deferred**, not "Pending". Re-evaluate in v1.3 if user-reported.
- **D-10:** BRACKET-02 (markdown `*`/`_` pair suppression in fence body) requires no separate code: the child editor has no markdown LanguageSupport loaded, so markdown pair behavior never fires. **MUST be covered by a regression test** that types `*` and `_` in the child and confirms no auto-pair, to prove the property structurally.

### Compartment Scope & Switch Plumbing (LANG-01)
- **D-11:** A single `languageCompartment: Compartment` lives in the child editor's extension array. Its current value is the Extension list:
  - LanguageSupport (parser + per-language data, e.g., `python()`, `javaLanguage`, `cpp()`, `javascript({ typescript: true })`, `rust()`, `StreamLanguage.define(go)`)
  - `indentUnit.of(effectiveIndent)` — derived from D-05 + D-06
  - `closeBrackets()` — picks up per-language pairs from the LanguageSupport's languageData
  - `keymap.of(closeBracketsKeymap)` — bracket overtype/Backspace bindings
  - Comment-toggle keymap entry — Cmd-/ / Ctrl-/ runs CM6's `toggleLineComment` from `@codemirror/commands`. The line-comment token (`//` for Java/JS/TS/C/C++/Go/Rust, `#` for Python) is read from the LanguageSupport's `commentTokens` languageData; CM6's stock `toggleLineComment` already does this lookup, so no per-language switch logic is needed in plugin code (COMMENT-01).
- **D-12:** On language switch, the chevron handler in `src/main.ts` (`switchFenceLanguage`) is extended:
  1. Existing behavior preserved — write `lc-language` frontmatter via `processFrontMatter`, dispatch `languageRefreshEffect` on the parent CM6.
  2. **New** — look up the child via `childEditorRegistry.get(file.path)`. If present, dispatch `{ effects: languageCompartment.reconfigure(buildLanguageExtensions(newSlug)) }` onto the child.
  3. The dispatch carries `userEvent: 'leetcode.lang-switch'` (matches existing parent-side annotation) so the child-sync extension recognizes it as plugin-internal and does NOT propagate it back to the parent doc as a content edit.
- **D-13:** No new shared StateEffect for child reconfigure. The single `Compartment.reconfigure(...)` effect is sufficient — symmetric with how the parent already handles it (different effect type but same conceptual pattern). Source of truth for "what language this child is currently using" is the chevron handler, not a separate observable.
- **D-14:** External `lc-language` frontmatter edits (e.g., user manually edits the YAML, or a future feature writes it via vault.process without going through `switchFenceLanguage`) are an out-of-scope edge case for v1.2. The chevron is the intended entry point. If the gap becomes user-visible, a Phase 17 polish task can add a `metadataCache.on('changed')` listener that re-derives the child's language. Documented as deferred.

### Bracket Match Highlight (HIGHLIGHT-01)
- **D-15:** Already satisfied by Phase 13 — `bracketMatching()` is in `childEditorFactory.ts:45`. Verify visual behavior in test/UAT; no new code.

### Theme-Aware Highlighting (carried from Phase 15 deferred)
- **D-16:** **Deferred to Phase 17 polish.** v1.2 ships with `defaultHighlightStyle` (current behavior). Justification: scope control — language packs and switching are the milestone-critical work; Obsidian-CSS-variable HighlightStyle is independent and can land later without re-architecting. Documented in `<deferred>`.

### Claude's Discretion
- Implementation file layout — whether the language Compartment lives inside `childEditorFactory.ts` or moves to a new `src/main/childEditorLanguage.ts` for separation of concerns. Prefer a new file if the per-language extension builder grows past ~50 lines.
- The exact import path for legacy-modes Go (`@codemirror/legacy-modes/mode/go` vs the package's main export); whichever esbuild handles cleanly.
- Whether `closeBracketsKeymap` is included once at the top level (outside the Compartment) or rebuilt with each reconfigure. Top-level is simpler since the keymap doesn't depend on language data; the per-language behavior comes from `closeBrackets()` reading languageData at runtime.
- Test layout — whether per-language indent/bracket/comment tests share fixtures or each language gets its own file. Aim for one fixture-driven table per requirement (INDENT-04, BRACKET-01..04, COMMENT-01) rather than 8 nearly-duplicated test files.
- Bundle-size measurement — whether a build comparison commit gets recorded as a verification artifact (recommended) or just noted in the verification report.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13–15 Foundation (direct dependencies)
- `.planning/phases/13-nested-editor-foundation/13-CONTEXT.md` — Widget pattern, registry lifecycle (D-11..D-13), CSS-hide, bracketMatching already wired
- `.planning/phases/14-bidirectional-sync/14-CONTEXT.md` — `userEvent: 'leetcode.lang-switch'` convention (D-08/D-09), child-sync echo prevention, addToHistory
- `.planning/phases/15-focus-undo-cursor/15-CONTEXT.md` — `indentWithTab` keymap (D-05), child editor extensions array, COMMENT-01 deferred-to-Phase-16 (D-09)
- `src/main/childEditorFactory.ts` — Where the language Compartment, closeBrackets, indentUnit, and comment keymap are added; current `bracketMatching()` integration (line 45); current hardcoded `indentUnit.of("    ")` (line 49) — REPLACE with Compartment-managed value
- `src/main/childEditorRegistry.ts` — `get(file.path)` for the chevron handler's reconfigure dispatch
- `src/main/childEditorSync.ts` — Confirm `'leetcode.lang-switch'` annotation passes through without triggering child→parent content sync
- `src/main/nestedEditorExtension.ts` — `transactionFilter` and `'leetcode.*'` early-return path; child reconfigure must not trigger a widget rebuild

### Language switch site (parent-side)
- `src/main.ts` — `switchFenceLanguage` (line ~2321) is the chevron handler; this is where the child reconfigure dispatch is added
- `src/main/codeActionsEditorExtension.ts` — `languageRefreshEffect` (line 112) is dispatched on the parent today; the child does NOT subscribe to it (per D-12 plumbing decision)
- `src/main/languageChevronWidget.ts` — Chevron UI; no changes required

### Language slug catalog
- `src/solve/languages.ts` — `LC_CHEVRON_LANG_ORDER` (8 slugs), `LC_LANG_FENCE_TAG` (slug→fence-tag map; informs how the fence is read but doesn't drive the LanguageSupport selection — slug drives that), `LC_LANG_DISPLAY_LABELS`
- `src/settings/SettingsStore.ts` — Extend with `indentSizeOverride: 'auto' | 2 | 4 | 8` (default `'auto'`)
- `src/settings/SettingsTab.ts` — Add the override field to the settings UI

### Architecture & Pitfalls
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Especially Pitfall 5 (Compartment reconfigure timing) and Pitfall 11 (language-pack import shape under esbuild)
- `.planning/research/ARCHITECTURE.md` — v1.2 architecture context; integration points and anti-patterns
- `.planning/research/STACK.md` — Bundle ceiling discussion

### Requirements
- `.planning/REQUIREMENTS.md` — INDENT-04, ENTER-02..04, BRACKET-01..05 (note: BRACKET-05 to be re-marked Deferred per D-09), LANG-01, COMMENT-01, HIGHLIGHT-01
- `.planning/ROADMAP.md` §Phase 16 — Success criteria (5 items)

### CLAUDE.md conventions
- `CLAUDE.md` §"Conventions" — `'leetcode.*'` userEvent bypass for plugin-internal CM6 dispatches (mandatory for D-12 step 3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `childEditorFactory.ts:45` — `bracketMatching()` already wired (HIGHLIGHT-01 already done; verification only)
- `childEditorFactory.ts:49` — `indentUnit.of("    ")` hardcoded — this becomes Compartment-managed
- `childEditorFactory.ts:50` — `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])` — extend with `closeBracketsKeymap` and the Cmd-/ comment toggle binding (or rely on `defaultKeymap` which includes it)
- `src/solve/languages.ts` `LC_CHEVRON_LANG_ORDER` — the canonical 8-slug list; iterate this when wiring the language→Extension builder
- `src/main/codeActionsEditorExtension.ts:112` `languageRefreshEffect` — existing parent-side effect; left untouched
- `src/main/childEditorRegistry.ts.get(filePath)` — registry lookup for chevron handler

### Established Patterns
- LC slug → `LanguageSupport` mapping table (new) — pure function `buildLanguageExtensions(slug, indentOverride): Extension[]`. Pure data + thin import; safe to put in `src/main/childEditorLanguage.ts`.
- `Compartment.of(initial) → Compartment.reconfigure(next)` — standard CM6 pattern; same shape as how the chevron flips the parent today (although the parent uses a StateEffect, not a Compartment)
- `userEvent: 'leetcode.*'` — required on ANY plugin-dispatched transaction touching a section-locked range or that should bypass child↔parent sync as a content change. Dispatch in D-12 uses `'leetcode.lang-switch'`.

### Integration Points
- `childEditorFactory.ts` — Replace hardcoded `indentUnit.of("    ")` with `languageCompartment.of([...])` containing all language-dependent extensions. `python()` import is removed from this file (moves into the new builder).
- `src/main.ts:switchFenceLanguage` — After parent dispatch, look up child and dispatch reconfigure with `userEvent: 'leetcode.lang-switch'`.
- `src/settings/SettingsStore.ts` + `SettingsTab.ts` — Add `indentSizeOverride` field + UI control (3 radio options: 'auto', 2, 4, 8).
- `package.json` — Add `@codemirror/lang-rust`, `@codemirror/legacy-modes`, `@codemirror/autocomplete` (promote from transitive to direct).

</code_context>

<specifics>
## Specific Ideas

- Cmd-/ should "feel like VS Code" — single line toggles a comment, multi-line selection comments/uncomments all selected lines, repeat-press undoes the comment. CM6's stock `toggleLineComment` already does all of this if the language declares `commentTokens`.
- Switching language via the chevron should be visibly instantaneous — parser + indent + comment all flip together with no visual flash, no note re-open, no scroll jump. (Atomic Compartment reconfigure achieves this.)
- Bundle size add (~50–80 KB) is acceptable per v1.2 architecture decision (STATE.md "Blockers/Concerns"). No need to dynamic-import language packs.

</specifics>

<deferred>
## Deferred Ideas

- **BRACKET-05 (triple-backtick template literals in JS/TS)** — Not on LC's test surface; CM6 stock closeBrackets doesn't cover it. Re-mark as Deferred in REQUIREMENTS.md as part of this phase's planning. Re-evaluate in v1.3 if user-reported.
- **Theme-aware syntax highlighting (Obsidian CSS variables)** — Carried from Phase 15 deferred ideas. Defer to Phase 17 polish — independent of language-pack work; can land later without re-architecting.
- **External `lc-language` frontmatter edit reactivity** — If the user edits the YAML directly (not via the chevron) the child won't re-derive its language. Acceptable v1.2 gap; chevron is the documented entry point. Phase 17 candidate if user-visible.
- **Vim mode support** — Carried from Phase 15 deferred ideas. Phase 17 polish.
- **Modular panel layout (LeetCode-web-style resizable panels)** — Carried from Phase 15. Future milestone (v1.3+).

</deferred>

---

*Phase: 16-Language Packs & Switching*
*Context gathered: 2026-05-22*
