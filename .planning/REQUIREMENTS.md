# Requirements: Obsidian LeetCode v1.3 — Inline Widget Architecture

**Defined:** 2026-05-29
**Core Value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

**Milestone goal:** Replace the v1.2 dual-CM6 nested editor + bidirectional sync + section-lock with a self-contained inline code-block widget driven by one-way sync. Preserve the "code lives in the note" UX while eliminating the corner-case bug class.

## Confirmed Decisions

| # | Decision |
|---|---|
| Q1 | Section-lock → narrower `sectionProtectionExtension.ts` (protects `## Problem` body + `## Techniques` heading only) |
| Q2 | Vim toggle → live `Compartment.reconfigure` first; reload-on-toggle is fallback |
| Q3 | Reading-mode rendering → live CM6 with `editable.of(false)` |
| Q4 | Multi-pane → single-active-per-file in v1.3; live/mirror deferred to v1.3.x |
| Q4b | Embed support → fence-tag-gated mount; `![[lc-note]]` renders read-only widget anywhere |
| Q5 | Rollout → default ON from first 1.3.x release |
| Q6 | Migration backup retention → 30 days |
| Q7 | Migration + first edit → atomic single `vault.process` write |

## v1.3 Requirements

### Widget Foundation (WIDGET-*)

- [ ] **WIDGET-01**: A new fence tag `leetcode-solve` is registered as both a Reading-mode markdown code-block processor and a Live Preview CM6 ViewPlugin, mounting an embedded CM6 EditorView per fence
- [ ] **WIDGET-02**: The embedded editor uses `EditorView.atomicRanges` so the parent note's cursor cannot enter the fence range (no "raw source reveal" thrash on cursor approach)
- [ ] **WIDGET-03**: Widget mounts on fence tag `leetcode-solve`, not on `lc-slug` frontmatter (so embeds and stray fences render correctly)
- [ ] **WIDGET-04**: Widget state (cursor position, scroll offset, undo history) persists across unmount/remount via a plugin-level state map keyed by `${file.path}::${fenceIdentity}` with 30-second TTL
- [ ] **WIDGET-05**: Widget falls back gracefully on null `getSectionInfo` (renders static `<pre><code>` instead of crashing)
- [ ] **WIDGET-06**: Widget falls back to Python language pack with a Notice when `lc-language` frontmatter is missing or unrecognized
- [ ] **WIDGET-07**: Reading mode renders the same CM6 widget with `EditorView.editable.of(false)` — single render path across modes
- [ ] **WIDGET-08**: All 8 v1.2 language packs (Python, Java, C++, JavaScript, TypeScript, C, Go, Rust) carry over to the widget via the existing `languageCompartment`

### One-Way Sync (SYNC-*)

- [ ] **SYNC-01**: Widget edits write back to disk via debounced `vault.process` (400ms default; configurable 300/500/1000/2000ms via settings)
- [ ] **SYNC-02**: Pending writes flush immediately on widget unmount, plugin unload, leaf change, file rename, button click (Run/Submit/AI Debug), and `beforeunload`
- [ ] **SYNC-03**: Self-write echo is suppressed via a per-path content-hash map with 2-second TTL (NOT a boolean flag)
- [ ] **SYNC-04**: External edits (other panes, Obsidian Sync, CLI) reload the widget via `vault.on('modify')` with cursor-preserving dispatch into the embedded CM6
- [ ] **SYNC-05**: Conflict modal appears when external edit arrives during local in-flight typing ("Keep mine / Keep external / View diff")
- [ ] **SYNC-06**: Round-trip serialization is byte-exact: triple backticks, frontmatter-like `---` lines, and significant whitespace inside the fence body survive a write-read cycle unchanged
- [ ] **SYNC-07**: Per-file flush rate-limited to max 1 flush per 200ms to prevent file-watcher storms (Obsidian Sync, iCloud, Git auto-commit)

### Embed Support (EMBED-*)

- [ ] **EMBED-01**: `![[lc-note]]` embed in any host note renders the LeetCode widget read-only (no editing, no buttons)
- [ ] **EMBED-02**: `![[lc-note#Code]]` section embed renders just the fence as read-only widget
- [ ] **EMBED-03**: Embed detection uses `.markdown-embed`/`.internal-embed` ancestor check OR `ctx.sourcePath` mismatch with the rendered TFile
- [ ] **EMBED-04**: Stray `\`\`\`leetcode-solve` fence in a non-LC note (no `lc-slug`) renders as read-only widget — never crashes, never offers Run/Submit

### Action Row & Language Switching (ACTION-*)

- [ ] **ACTION-01**: Run / Submit / AI Debug / Reset / Copy buttons mount inside the widget DOM (not as a separate parent-doc decoration)
- [ ] **ACTION-02**: Language chevron mounts inside the widget; click flips `lc-language` frontmatter via `processFrontMatter`
- [ ] **ACTION-03**: Widget reacts to `metadataCache.on('changed')` and applies `Compartment.reconfigure` to swap language packs without recreating the EditorView
- [ ] **ACTION-04**: Action buttons read code via `widget.childView.state.doc.toString()` (no disk round-trip required before Run/Submit)
- [ ] **ACTION-05**: Action row uses flex-wrap layout, CSS variable discipline, and focus save/restore on button click
- [ ] **ACTION-06**: Reading-mode action row continues to render via `codeActionsPostProcessor.ts` (unchanged from v1.2)

### Theme Integration (THEME-*)

- [ ] **THEME-01**: Widget inherits the active Obsidian theme — no opinionated/static palette in v1.3
- [ ] **THEME-02**: `lc-nested-editor` + `HyperMD-codeblock` container classes carry over from v1.2 so community themes (One Dark, Atom, Dracula, etc.) cascade in
- [ ] **THEME-03**: Lezer-node → semantic CSS class mapping (`childEditorSemanticClasses.ts` from v1.2 Phase 17 round-3) carries over verbatim
- [ ] **THEME-04**: Theme changes (light/dark toggle, custom theme swap) re-theme the widget live — no note reload required
- [ ] **THEME-05**: Visual regression check is a Phase 4 release gate — side-by-side widget screenshots across top 5 community themes (Minimal, Things, Catppuccin, Anuppuccin, Atom) compared against v1.2 baseline. No regressions allowed.

### Section Protection (PROTECT-*)

- [ ] **PROTECT-01**: A new `src/main/sectionProtectionExtension.ts` (replacing `sectionLockExtension.ts`) protects `## Problem` body and `## Techniques` heading only — the v1.0 validated requirement is preserved
- [ ] **PROTECT-02**: Fence opener and closer protection is removed (v1.2 concern is moot — fence is owned by the widget)
- [ ] **PROTECT-03**: The `'leetcode.*'` userEvent bypass convention is removed from the new extension and from CLAUDE.md `## Conventions`

### Vim Integration (VIM-*)

- [ ] **VIM-01**: When `app.vault.getConfig('vimMode')` is true at widget mount, the embedded CM6 receives the `vim()` extension via a `vimCompartment`
- [ ] **VIM-02**: Live `Compartment.reconfigure(enabled ? vim() : [])` swaps vim on/off without rebuilding the EditorView when the user toggles vim mode in Obsidian settings
- [ ] **VIM-03**: If live reconfigure proves unreliable empirically, fall back to a "reload note to apply vim toggle" banner — accepted by user
- [ ] **VIM-04**: Vim keystrokes are confined to the embedded editor (no leakage to the parent doc — `atomicRanges` enforces this)

### Migration (MIGRATE-*)

- [ ] **MIGRATE-01**: On first open of a v1.2 note (first fence under `## Code` has v1.2 lang-slug tag AND `lc-slug` frontmatter present), trigger lazy migration — never on plugin load
- [ ] **MIGRATE-02**: Migration writes a backup of the original note to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/` before rewrite
- [ ] **MIGRATE-03**: Migration is a single atomic `vault.process` that rewrites fence opener `\`\`\`<langslug>` → `\`\`\`leetcode-solve` and ensures `lc-language` frontmatter is set; fence body is untouched
- [ ] **MIGRATE-04**: Migration is idempotent — opening an already-migrated note is a no-op
- [ ] **MIGRATE-05**: Backup files older than 30 days auto-delete on plugin load
- [ ] **MIGRATE-06**: Setting "Auto-migrate v1.2 notes when opened" defaults ON; OFF shows a "Migrate this note?" button on first open of a legacy note
- [ ] **MIGRATE-07**: Migration + the user's first edit land in the same `vault.process` callback (atomic single write — no half-migrated state on disk)
- [ ] **MIGRATE-08**: New notes created in v1.3 emit `\`\`\`leetcode-solve` directly via `starterCodeInjector.ts` and `NoteTemplate.ts`
- [ ] **MIGRATE-09**: `codeExtractor.ts` sources language from `lc-language` frontmatter instead of fence tag
- [ ] **MIGRATE-10**: CI fixtures for v1.0, v1.1, v1.2 sample notes verify migration correctness on every release candidate

### Deletion (DELETE-*)

- [ ] **DELETE-01**: `src/main/childEditorSync.ts` (809 LOC) is deleted
- [ ] **DELETE-02**: `src/main/sectionLockExtension.ts` (527 LOC) is deleted (replaced by narrower `sectionProtectionExtension.ts`)
- [ ] **DELETE-03**: `src/main/nestedEditorExtension.ts` (395 LOC) is deleted
- [ ] **DELETE-04**: `src/main/childEditorRegistry.ts` (114 LOC) is deleted (replaced by ~50 LOC `widgetRegistry.ts`)
- [ ] **DELETE-05**: `src/main/codeActionsEditorExtension.ts` (395 LOC) is deleted (`findCodeFence` lifted to widget controller)
- [ ] **DELETE-06**: `src/main.ts` cleanup of ~800 LOC: sync wiring, `ECHO_PRONE_USER_EVENTS`, `useNestedEditor` fork, `nestedEditorRebuildEffect`, fence-repair hook, `dispatchChildLanguageReconfigure`, `handleFmChangeForLanguageReactivity` (moves into widget), `childEditorRegistry?.get` seams in `switchFenceLanguage`/`reset`/`copyToCode`
- [ ] **DELETE-07**: Dead test files removed: `childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts`
- [ ] **DELETE-08**: CLAUDE.md `## Conventions` paragraphs about `'leetcode.*'` userEvent and "Canonical plugin write-path pattern (Phase 17 D-05)" are removed — both obsolete in v1.3

### Rollout & Polish (POLISH-*)

- [ ] **POLISH-01**: Default plugin behavior is the v1.3 widget on first 1.3.x release (no opt-in alpha period)
- [ ] **POLISH-02**: Bundle size reduces from ~1.71 MB; CI gate flags any regression
- [ ] **POLISH-03**: `eslint-plugin-obsidianmd` clean run; zero `innerHTML` usages in `src/widget/`
- [ ] **POLISH-04**: README updated for v1.3: architecture overview, migration docs, sync interaction notes, Cmd-Z/Cmd-F scoping behavior
- [ ] **POLISH-05**: All 1,713 v1.2 tests pass (excluding the dead-test deletions); new widget code has unit + integration coverage
- [ ] **POLISH-06**: BRAT alpha period for plugin-store re-review readiness check before stable release tag

## v1.4+ Requirements (Deferred)

### Multi-pane Live/Mirror (MULTI-*)

- **MULTI-01**: Same note open in two panes — edits in pane A appear continuously in pane B
- **MULTI-02**: Promote-on-focus widget designation (single-source-of-truth + mirrors)

### Static Widget Palette (PALETTE-*)

- **PALETTE-01**: Settings option for opinionated VS Code-style palette (One Dark Pro / One Light Pro / Atom One Dark / Dracula) overriding theme tracking — carried over from v1.2 backlog 999.1

### Triple-Backtick Bracket Pair (BRACKET-*)

- **BRACKET-01**: CM6's stock `closeBrackets` extended to handle triple-backtick template literals (deferred from v1.2)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-pane live/mirror sync | Single-active-per-file is the v1.3 baseline; live/mirror deferred to v1.4 |
| Reverse migration (v1.3 → v1.2) | Kept as dev-only command; not shipped — recovery path is the backup sidecar |
| Batch migration on plugin load | Risks 30+ second freeze and partial-write corruption — lazy-on-open only (v1.1 precedent) |
| Side-by-side dual render during migration | Confuses users; lazy single-fence rewrite is unambiguous |
| Bundling `obsidian` or `@codemirror/*` | Runtime-provided by Obsidian host; bundling causes peer-version conflicts |
| Adding lodash | Obsidian's built-in `debounce` covers all use cases; lodash adds ~70 KB for one helper |
| Mobile support | Inherited Out-of-Scope from v1.0 — Electron APIs needed for embedded login + AI streaming |
| `leetcode.cn` support | Inherited Out-of-Scope — different API surface, deferred to v2 |
| Auto-rewrite all v1.2 notes on plugin update | Anti-feature — never batch-rewrite vault data |
| Widget editable in `![[]]` embed | Embed renders read-only; editing the source note opens the source |
| `cm.dispatch` from widget into parent CM6 | Architectural anti-pattern — widget edits go through `vault.process` only |
| LRU cache for widget instances | Obsidian owns mount/unmount lifecycle; thin Map-based registry is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIDGET-01 | Phase 19 | Pending |
| WIDGET-02 | Phase 19 | Pending |
| WIDGET-03 | Phase 19 | Pending |
| WIDGET-04 | Phase 19 | Pending |
| WIDGET-05 | Phase 19 | Pending |
| WIDGET-06 | Phase 19 | Pending |
| WIDGET-07 | Phase 19 | Pending |
| WIDGET-08 | Phase 19 | Pending |
| SYNC-01 | Phase 19 | Pending |
| SYNC-02 | Phase 19 | Pending |
| SYNC-03 | Phase 19 | Pending |
| SYNC-04 | Phase 20 | Pending |
| SYNC-05 | Phase 20 | Pending |
| SYNC-06 | Phase 19 | Pending |
| SYNC-07 | Phase 19 | Pending |
| EMBED-01 | Phase 19 | Pending |
| EMBED-02 | Phase 19 | Pending |
| EMBED-03 | Phase 19 | Pending |
| EMBED-04 | Phase 19 | Pending |
| ACTION-01 | Phase 20 | Pending |
| ACTION-02 | Phase 20 | Pending |
| ACTION-03 | Phase 20 | Pending |
| ACTION-04 | Phase 20 | Pending |
| ACTION-05 | Phase 20 | Pending |
| ACTION-06 | Phase 20 | Pending |
| THEME-01 | Phase 19 | Pending |
| THEME-02 | Phase 19 | Pending |
| THEME-03 | Phase 19 | Pending |
| THEME-04 | Phase 20 | Pending |
| THEME-05 | Phase 22 | Pending |
| PROTECT-01 | Phase 20 | Pending |
| PROTECT-02 | Phase 20 | Pending |
| PROTECT-03 | Phase 22 | Pending |
| VIM-01 | Phase 20 | Pending |
| VIM-02 | Phase 20 | Pending |
| VIM-03 | Phase 22 | Pending |
| VIM-04 | Phase 19 | Pending |
| MIGRATE-01 | Phase 21 | Pending |
| MIGRATE-02 | Phase 21 | Pending |
| MIGRATE-03 | Phase 21 | Pending |
| MIGRATE-04 | Phase 21 | Pending |
| MIGRATE-05 | Phase 21 | Pending |
| MIGRATE-06 | Phase 21 | Pending |
| MIGRATE-07 | Phase 21 | Pending |
| MIGRATE-08 | Phase 21 | Pending |
| MIGRATE-09 | Phase 21 | Pending |
| MIGRATE-10 | Phase 21 | Pending |
| DELETE-01 | Phase 22 | Pending |
| DELETE-02 | Phase 22 | Pending |
| DELETE-03 | Phase 22 | Pending |
| DELETE-04 | Phase 22 | Pending |
| DELETE-05 | Phase 22 | Pending |
| DELETE-06 | Phase 22 | Pending |
| DELETE-07 | Phase 22 | Pending |
| DELETE-08 | Phase 22 | Pending |
| POLISH-01 | Phase 22 | Pending |
| POLISH-02 | Phase 22 | Pending |
| POLISH-03 | Phase 22 | Pending |
| POLISH-04 | Phase 22 | Pending |
| POLISH-05 | Phase 22 | Pending |
| POLISH-06 | Phase 22 | Pending |

**Coverage:**
- v1.3 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0 ✓

*Note: Phase numbers above are provisional placeholders. Final phase boundaries are set by the gsd-roadmapper agent in the next workflow step.*

---
*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 after initial definition*
