# Phase 21: v1.2 Migration - Research

**Researched:** 2026-06-01
**Domain:** Obsidian plugin lazy on-open atomic note migration (legacy fence-tag → `leetcode-solve`) + sidecar backup + idempotent detection
**Confidence:** HIGH (all primitives already shipped in tree; one empirical probe carry-over from Phase 19/20)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carry-Forward (locked by REQUIREMENTS.md / Phase 19+20 CONTEXT — not re-litigated):**
- **L1:** Canonical v1.3 fence tag = `` ```leetcode-solve ``; language metadata lives in `lc-language` frontmatter (PROJECT.md Key Decisions; REQUIREMENTS Q1; Phase 19 C-01).
- **L2:** Backup retention = 30 days (REQUIREMENTS Q6; MIGRATE-05).
- **L3:** Migration + first-edit are atomic — single `vault.process` callback; disk never observes a half-migrated state (REQUIREMENTS Q7; MIGRATE-07).
- **L4:** Idempotency contract — re-opening an already-migrated note is a no-op (MIGRATE-04). The `leetcode-solve` opener IS the migrated marker; presence of `countLeetCodeSolveFenceOpeners > 0` short-circuits.
- **L5:** Never call migration from `Plugin.onload()`. Lazy-on-first-open only. v1.1's lazy-on-AC Techniques migration is the precedent.
- **L6:** New notes emit `` ```leetcode-solve `` directly (MIGRATE-08). `codeBlockFor` in `src/notes/NoteTemplate.ts` and `starterCodeInjector.ts` both swap their emitter to the v1.3 opener.
- **L7:** Reverse migration (`unmigrateToLegacyFence`) kept in tree as a dev-only command, not shipped (ROADMAP Phase 21 §"Key risks/notes").
- **L8:** `vault.process` is the ONLY vault mutation primitive used by migration (CF-06 vault-layer write discipline).
- **L9:** Migration runs behind `useInlineWidget=ON` only. With `useInlineWidget=OFF` (the default through Phase 21), migration is a no-op — the v1.2 path still owns the user's notes. Phase 22 flips the default and deletes the gate.

**Trigger + Mount Lifecycle (D-trigger):**
- **D-trigger-01:** Migration fires **on file-open, before widget mount**. The widget's mount lifecycle (Reading-mode `MarkdownPostProcessor` + Live-Preview `ViewPlugin`) consults the file's frontmatter + first-fence kind synchronously. When the file has `lc-slug` AND the first fence under `## Code` is a recognized-langSlug legacy fence, migration runs via `vault.process` BEFORE the widget mounts. Both mount paths call `await migrateLegacyFenceIfNeeded(app, file)` in their pre-mount gate.
- **D-trigger-02:** Cost mitigation — first-open of a legacy note is ~10–50ms slower (synchronous backup write + `vault.process` rewrite). Subsequent opens see the `leetcode-solve` opener and short-circuit on the idempotency check.

**Auto-Migrate Setting UX (D-auto):**
- **D-auto-01:** `autoMigrateOnOpen: boolean` defaults **ON** (MIGRATE-06). When ON, migration runs silently — no Notice, no banner.
- **D-auto-02:** When `autoMigrateOnOpen=OFF`: render a **persistent banner** above a read-only legacy display: "This note uses the v1.2 format. [Migrate now]". Read-only display = static `<pre><code>` of the fence body using existing `childEditorSemanticClasses`; no atomicRanges, no debouncedWriter, no action row. Click [Migrate now] runs migration with `{ force: true }`; on success the legacy display unmounts and normal v1.3 widget mount path takes over.
- **D-auto-03:** Command palette entry `LeetCode: Migrate current note` is registered unconditionally (visible regardless of `autoMigrateOnOpen` setting). Runs `migrateLegacyFenceIfNeeded(app, currentFile, { force: true })`.

**Edge Case Handling (D-edge):**
- **D-edge-01: Strict matching.** Migration runs only when ALL hold:
  1. Note has `lc-slug` frontmatter.
  2. `## Code` heading exists.
  3. First fence inside `## Code` has a recognized LC langSlug — `resolveLangSlug(tag, '__sentinel__') !== '__sentinel__'` AND resolved value is in `LC_LANG_SLUGS`. Both base slugs and aliases (per `FENCE_TAG_ALIASES`) qualify.
  4. The fence has a closer.
  5. Note does NOT already contain a `` ```leetcode-solve `` fence (`countLeetCodeSolveFenceOpeners(text) === 0`).

  All other shapes — note without `## Code`, `## Code` heading with no fence, fence with unrecognized tag, fence with no closer, mixed-state notes — **skip migration silently**. No backup. Logging is debug-level only.
- **D-edge-02: Mixed-state notes.** Idempotency wins: `countLeetCodeSolveFenceOpeners > 0` short-circuits. The legacy fence is treated as user content. No backup. No Notice.
- **D-edge-03: Missing `lc-language` frontmatter at migration time.** During the same atomic `vault.process` callback, **inject `lc-language: <user default>`** via `app.fileManager.processFrontMatter`. Default = `SettingsStore.getDefaultLanguage()`. Fill ONLY when missing/empty (`typeof fm['lc-language'] !== 'string' || fm['lc-language'] === ''`). **Empirical risk to verify:** Plan 21-01 must verify in dev vault whether `vault.process` + `processFrontMatter` land in the same render frame. Fallback: selfWriteSuppression hash-arm pattern (Phase 19 C-04).
- **D-edge-04: Frontmatter is otherwise untouched.** Migration NEVER overwrites `lc-language` (when already set), `lc-slug`, `lc-status`, `lc-id`, `lc-title`, `lc-difficulty`, `lc-url`, `tags`, `aliases`, or any user-authored frontmatter key.

**Backup Sidecar (D-backup):**
- **D-backup-01: Per-note folder shape:** `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO-timestamp}/{slug}.md`. Folder name parseable via regex `migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$`. ISO `:` replaced with `-` for cross-OS filesystem safety. Use `app.vault.adapter.write(...)` rather than `app.vault.create(...)` (the backup folder is plugin-internal, NOT a vault-visible file).
- **D-backup-02: One backup per note ever.** Re-opening a migrated note triggers idempotency short-circuit before the backup writer runs. No second backup. No mtime touch.
- **D-backup-03: 30-day cleanup runs on plugin load, fire-and-forget.** `Plugin.onload()` queues a microtask via `Promise.resolve().then(...)` that lists `.obsidian/plugins/obsidian-leetcode/`, regex-filters folder names, parses the timestamp, deletes folders older than 30 days via `app.vault.adapter.rmdir(folder, true)`. Cleanup runs unconditionally — even when `useInlineWidget=OFF` — so backups from a prior `useInlineWidget=ON` session don't disappear if the user toggles OFF for testing. Errors swallowed (debug-log only).

**MIGRATE-09 codeExtractor Refactor (D-extract):**
- **D-extract-01: codeExtractor becomes frontmatter-aware.** Refactor `extractFirstFencedBlock(noteBody)` → `extractFirstFencedBlock(noteBody, frontmatter)` where `frontmatter` is `{ 'lc-language'?: string }`. Behavior:
  - When the located fence is `` ```leetcode-solve `` → return `{ lang: frontmatter['lc-language'] ?? null, code: ... }`. Frontmatter is the source of truth.
  - When the located fence is a legacy LC-tagged fence (or any other tag) → preserve existing behavior verbatim.
  - When `lc-language` is missing/empty AND the fence is `leetcode-solve` → return `{ lang: null, code: ... }` and let caller's `resolveLangSlug(null, defaultLang)` fallback handle it.
- **D-extract-02: codeExtractor is the ONLY codepath that reads language for Run/Submit.** Phase 21 must NOT introduce a parallel "read lc-language directly from `metadataCache`" shortcut in any consumer.

**New Note Emission (D-emit):**
- **D-emit-01: `codeBlockFor` in `src/notes/NoteTemplate.ts`** split into:
  - `codeBlockFor(langSlug, starter)` — legacy emitter, kept for backward-compat callers.
  - `codeBlockForV13(starter)` — new emitter that returns `` ```leetcode-solve\n<starter>\n``` ``.
  Existing callers (`buildNoteBody`, `injectCodeSection`, `forceInjectCodeSection`) switch their call sites to `codeBlockForV13` once `useInlineWidget=ON` (gated: `useInlineWidget ? codeBlockForV13(starter) : codeBlockFor(langSlug, starter)`).
- **D-emit-02: `starterCodeInjector.forceInjectCodeSection`** already has `fenceKind: 'leetcode-solve' | 'legacy'` arg (Phase 20 Plan 20-10 gap-closure). Phase 21 `useInlineWidget=ON` path always passes `fenceKind: 'leetcode-solve'`. The `injectCodeSection` (non-force) helper gains the same `fenceKind` arg.

**CI Fixtures (D-fixtures):**
- **D-fixtures-01: Three fixture sets** under `tests/fixtures/migration/{v1.0,v1.1,v1.2}/`:
  - **v1.0:** 3 notes (Python `python3` fence, Java `java` fence, `cpp` fence).
  - **v1.1:** 3 notes adding v1.1 surfaces (one with `## Techniques`, one with `## AI Review`, one with `## Related Variants`).
  - **v1.2:** 4 notes covering Phase 5.3's `lcSlugToFenceTag` remaps (`python3 → python`, `golang → go`, `c → cpp`) plus a TypeScript fence; one with vim-mode artifacts.
  Each fixture has a paired `*.expected.md`. Test asserts byte-exact equality.
- **D-fixtures-02: Property-test layer** `tests/widget/migration.property.test.ts`. Generators emit synthetic v1.2 notes with random LC langSlug, random `lc-language` value, random body content. Invariants: body preservation, frontmatter preservation, idempotency, backup correctness.
- **D-fixtures-03: CI gate.** Both fixture suites run on every PR; failure is a hard block.

**Plan Structure (D-plan):**
- **D-plan-01: Vertical-slice plan split.** Suggested 4 plans:
  - **Plan 21-01** — fenceMigrator core + strict-match predicate (Foundation).
  - **Plan 21-02** — Mount integration + auto-migrate setting (UX).
  - **Plan 21-03** — codeExtractor + new-note emission (MIGRATE-08, MIGRATE-09).
  - **Plan 21-04** — Backup GC + CI fixtures + property-test corpus (Polish + Release Gate).
- **D-plan-02: Sequential ordering** (foundation → UX → SSoT refactor → polish).

### Claude's Discretion
- `vault.process` + `processFrontMatter` empirical ordering — Plan 21-01 must verify in dev vault.
- Backup write primitive choice: `app.vault.adapter.write` (recommended — keeps backups out of user's graph) vs. `app.vault.createBinary`.
- Legacy banner styling: copy reuses Obsidian's `.notice-warning` / `.callout-warning` classes. Planner picks fixed-position vs. inline within Reading-mode container; Live Preview placement is harder.
- Read-only legacy display fidelity — static `<pre><code class="language-{tag}">` is sufficient; `childEditorSemanticClasses` ViewPlugin available if syntax highlighting desired.
- Fixture seed data: synthetic slugs (e.g., `test-problem-1`) recommended over real LC slugs.
- `useInlineWidget=OFF` migration behavior — L9 says no-op when OFF, but BACKUP cleanup still runs on plugin load. Planner verifies this is the right trade-off.
- Reverse migration command exposure: dev-only via `process.env.NODE_ENV === 'development'` gate, or always-registered with a clear "Dev only — do not use" Notice.

### Deferred Ideas (OUT OF SCOPE)
- Repair UX for malformed v1.2 notes (no `## Code` heading, missing closer, mid-state). Strict-matching skips silently.
- Multi-fence migration. Skipped per D-edge-01 / D-edge-02.
- Reverse-migration shipping. Kept dev-only per L7.
- Telemetry / metrics on migration count — non-negotiable per "no telemetry by default".
- Settings UI for backup retention period — locked at 30 days per Q6.
- Pre-flight migration audit ("show me how many notes will migrate"). Defer.
- Migration progress notification when many legacy notes are opened in quick succession.
- VIM-03 reload-on-toggle banner — Phase 22.
- DELETE-01..08 + POLISH-01 + PROTECT-03 + THEME-05 — Phase 22.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGRATE-01 | On first open of a v1.2 note (first fence under `## Code` has v1.2 lang-slug tag AND `lc-slug` present), trigger lazy migration — never on plugin load | D-trigger-01 + strict-match predicate (D-edge-01); reuses `findCodeFence(state, opts)` (`src/widget/fenceLocator.ts:33-99`), `LC_LANG_SLUGS` + `FENCE_TAG_ALIASES` + `resolveLangSlug` (`src/solve/languages.ts:13-77`); pre-mount call from `codeBlockProcessor.ts` and `liveModeViewPlugin.ts` |
| MIGRATE-02 | Migration writes a backup of the original note to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/` before rewrite | D-backup-01; uses `DataAdapter.write(normalizedPath, data, options?)` (verified `obsidian@1.12.3` `obsidian.d.ts:1964`); folder created via `DataAdapter.mkdir` (`obsidian.d.ts:2011`) |
| MIGRATE-03 | Single atomic `vault.process` rewrites fence opener `\`\`\`<langslug>` → `\`\`\`leetcode-solve` and ensures `lc-language` is set; fence body untouched | D-edge-03 + D-edge-04; uses `Vault.process(file, fn)` (atomic — see `obsidian.d.ts:6443+`); body preserved via existing `rewriteFenceBody` (`src/widget/fenceSerialization.ts:141`) — but for opener-tag swap, requires extension (see "rewriteFenceOpenerTag" in §"Code Examples") |
| MIGRATE-04 | Migration is idempotent — opening an already-migrated note is a no-op | D-edge-02 + L4; uses `countLeetCodeSolveFenceOpeners(text, MAX) > 0` short-circuit (`src/widget/fenceLocator.ts:125-138`) |
| MIGRATE-05 | Backup files older than 30 days auto-delete on plugin load | D-backup-03; uses `DataAdapter.list` (`obsidian.d.ts:1945`) + `DataAdapter.rmdir(path, recursive)` (`obsidian.d.ts:2032`); fire-and-forget microtask via `Promise.resolve().then(...)` |
| MIGRATE-06 | Setting "Auto-migrate v1.2 notes when opened" defaults ON; OFF shows a "Migrate this note?" button on first open of a legacy note | D-auto-01 + D-auto-02; new field `autoMigrateOnOpen: boolean` in `SettingsStore.ts` mirroring `useInlineWidget` shape (line 86, 702-704); banner via `legacyFenceBanner.ts` |
| MIGRATE-07 | Migration + the user's first edit land in the same `vault.process` callback (atomic single write) | D-trigger-01: migration IS the first edit; widget mounts on the freshly-rewritten `leetcode-solve` fence in the same render cycle |
| MIGRATE-08 | New notes created in v1.3 emit `\`\`\`leetcode-solve` directly via `starterCodeInjector.ts` and `NoteTemplate.ts` | D-emit-01 + D-emit-02; `codeBlockForV13` emitter; `fenceKind` arg in `injectCodeSection`; `useInlineWidget=ON` gate at call sites |
| MIGRATE-09 | `codeExtractor.ts` sources language from `lc-language` frontmatter instead of fence tag | D-extract-01: refactor `extractFirstFencedBlock(noteBody)` → `extractFirstFencedBlock(noteBody, frontmatter)`; thread frontmatter through 5 consumers (see "Component Responsibilities" table) |
| MIGRATE-10 | CI fixtures for v1.0, v1.1, v1.2 sample notes verify migration correctness on every release candidate | D-fixtures-01 + D-fixtures-02 + D-fixtures-03; reuses `tests/widget/fenceSerialization.property.test.ts` corpus pattern |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These directives MUST be honored by all Phase 21 plans:

- **Vault-layer write discipline:** All plugin fence-body writes go through `app.vault.process(file, fn)`. Phase 21's atomic write also goes through this primitive (locked by L8). Backup writes use `app.vault.adapter.write` (plugin-internal — not a vault-visible file).
- **`'leetcode.*'` userEvent convention** REMAINS in CLAUDE.md through Phase 21. Phase 21 plans MUST NOT delete or modify it. Phase 22 (DELETE-08) removes it.
- **"Canonical plugin write-path pattern (Phase 17 D-05)"** REMAINS in CLAUDE.md through Phase 21. Same rule.
- **No `innerHTML`** anywhere (CLAUDE.md "Don't use innerHTML"; `eslint-plugin-obsidianmd` enforces). Banner DOM construction MUST use `createEl({ text: ... })` per `codeBlockProcessor.ts:42-69` precedent.
- **No telemetry / no metrics** on migration count (project-locked).
- **`requestUrl` for HTTP** (Phase 21 has no HTTP — N/A).
- **No `eval` / `new Function`** (Phase 21 has none — N/A).
- **Strict null checks + `noImplicitAny`** (TypeScript baseline — every function signature must hold).
- **Plugin write-path** — when child editor is registered, dispatch through child CM6 (with `addToHistory.of(false)` mirror via `createChildSyncExtension`); fall back to `app.vault.process` only when no child registered. **Migration is the EXCEPTION** — it fires BEFORE widget mount, so no child editor exists. `vault.process` is the correct primitive in this specific phase.

## Summary

Phase 21 is high-risk surface but low-novelty: every primitive needed already exists in the codebase. The phase delivers four plans across a foundation → UX → SSoT-refactor → polish slice:

1. **Strict-matching gate.** A 5-clause predicate (`isMigrationCandidate`) determines whether a note is a "well-formed v1.2 plugin-owned note." Reuses `findCodeFence` (returns `kind: 'leetcode-solve' | 'legacy'`), `LC_LANG_SLUGS` membership, `FENCE_TAG_ALIASES`, and the existing `countLeetCodeSolveFenceOpeners` idempotency primitive — all already shipped in Phase 19. The strict-matching contract makes migration provably scoped to plugin-owned fences; user-authored example fences in `## Notes` are never touched.
2. **Atomic two-write callback.** Migration rewrites the fence opener via `vault.process` AND injects missing `lc-language` via `processFrontMatter` AND writes a backup sidecar via `vault.adapter.write`, all gated on the strict-match predicate. The atomicity guarantee comes from Obsidian: `vault.process` and `processFrontMatter` queue serially per-file. **The single empirical risk is whether the two writes land in the same render frame** — Plan 21-01 dev-vault probe answers this; the fallback (Phase 19 C-04 selfWriteSuppression hash-arm pattern) is already in tree.
3. **Lazy-on-open trigger.** Both mount paths (`codeBlockProcessor.ts` Reading + `liveModeViewPlugin.ts` Live Preview) `await migrateLegacyFenceIfNeeded(app, file)` BEFORE widget mount. Migration IS the first edit; the widget mounts on the freshly-rewritten `leetcode-solve` fence in the same render cycle (no transitional state visible to the user).
4. **30-day backup TTL.** Fire-and-forget microtask in `Plugin.onload()` lists `.obsidian/plugins/obsidian-leetcode/`, regex-filters `migration-backup-*-{ISO}` folders, and `vault.adapter.rmdir`s expired ones. Errors swallowed.
5. **MIGRATE-09 codeExtractor refactor.** `extractFirstFencedBlock` gains a `frontmatter` arg; when located fence is `leetcode-solve`, returns `lang` from `frontmatter['lc-language']`; legacy fences keep verbatim behavior. Threads through 5 consumers. After Phase 22 deletes the legacy path, the legacy branch becomes unreachable and is deleted in Phase 22 cleanup.
6. **CI fixture suite.** Three hand-written fixture sets (v1.0/v1.1/v1.2) + property-test layer modeled on `tests/widget/fenceSerialization.property.test.ts`.

**Primary recommendation:** Honor CONTEXT.md verbatim — every architectural decision is locked. Ship Plan 21-01 first (foundation, dev-vault empirically probes the `vault.process`+`processFrontMatter` ordering). Plan 21-02 uses the probe result to decide whether selfWriteSuppression needs an extra arm. Plans 21-03 and 21-04 are mechanical given 21-01+21-02.

## Architectural Responsibility Map

This phase is single-tier (Obsidian plugin renderer process). Capabilities partition cleanly across the file system / plugin runtime / metadata layers:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Strict-match predicate (5-clause gate) | Plugin runtime (pure helpers) | — | No I/O; reuses `findCodeFence` + `LC_LANG_SLUGS` membership |
| Backup file write | Plugin filesystem (`vault.adapter`) | — | Backup lives outside vault tree (`.obsidian/plugins/...`); user must NOT see it in graph view |
| Fence opener rewrite | Vault-layer atomic write (`vault.process`) | — | CF-06 discipline: all body-touching writes go through `vault.process` |
| `lc-language` fill | Frontmatter atomic write (`fileManager.processFrontMatter`) | — | Frontmatter-only edits use the dedicated YAML primitive — never hand-roll |
| Idempotency check | Plugin runtime (pure scan) | — | `countLeetCodeSolveFenceOpeners` is a pure string scan |
| 30-day backup TTL cleanup | Plugin filesystem (`vault.adapter`) | Plugin runtime (microtask scheduler) | Folder list + regex parse + rmdir — best-effort, fire-and-forget |
| Auto-migrate setting | Plugin settings (`SettingsStore`) | UI (`SettingsTab`) | Standard reload-required toggle (mirrors `useInlineWidget` shape) |
| Legacy-fence banner UX | UI (DOM helpers) | Plugin runtime (manual command palette path) | `createEl` per CLAUDE.md no-innerHTML rule; banner is a transient render-mode surface |
| Command palette `LeetCode: Migrate current note` | Plugin runtime (`Plugin.addCommand`) | — | Standard Obsidian command registration; gated on `useInlineWidget=ON` |
| codeExtractor refactor (MIGRATE-09) | Plugin runtime (pure helpers) | — | Frontmatter source-of-truth read; no I/O at extract time (caller owns metadataCache lookup) |
| New-note emission (MIGRATE-08) | Plugin runtime (`NoteTemplate.codeBlockForV13`, `starterCodeInjector`) | — | Pure string template + idempotent injection |
| CI fixture validation | Test infrastructure (Vitest) | — | Pure functions exercised; no Obsidian runtime needed |

**Cross-tier interactions to verify in Plan 21-01 dev vault:**
- `vault.process` callback completes → `processFrontMatter` queued → both fire `vault.on('modify')` → widget's `selfWriteSuppression` must absorb (Phase 19 C-04 hash-arm shape; `currentDocHash` on the controller; modify-handler in `main.ts`).
- The widget mount path (`codeBlockProcessor.ts:121` reads `info` immediately after migration completes, `liveModeViewPlugin.ts:53-103` rebuilds RangeSet on `update.docChanged`) — both paths must NOT race the in-flight migration.

## Standard Stack

### Core (already in `package.json`; NO new runtime deps)
| Library | Installed Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (npm) | `1.12.3` | `Vault.process`, `Vault.adapter.write/list/rmdir/exists`, `FileManager.processFrontMatter`, `Plugin.addCommand`, `MetadataCache.getFileCache`, `MarkdownPostProcessorContext` | All migration primitives come from this package; verified in `node_modules/obsidian/obsidian.d.ts` lines 1918-2032 (DataAdapter), 6356+ (Vault), and `addCommand` in plugin spec [VERIFIED: obsidian.d.ts] |
| `@codemirror/view` | `6.38.6` | Reused via existing widget infrastructure (already shipped) | Phase 19 wiring; nothing new for Phase 21 [VERIFIED: package.json] |
| `@codemirror/state` | `6.5.0` | Reused via existing widget infrastructure (already shipped) | Phase 19 wiring; nothing new for Phase 21 [VERIFIED: package.json] |

### Supporting (existing in-tree primitives — verbatim reuse)
| Module | Path | Purpose |
|--------|------|---------|
| `findCodeFence` | `src/widget/fenceLocator.ts:33` | Returns `kind: 'leetcode-solve' \| 'legacy'`; consumes for strict-match predicate |
| `countLeetCodeSolveFenceOpeners` | `src/widget/fenceLocator.ts:154` (alias of `computeFenceIndex` line 125) | Idempotency check (`> 0` ⇒ skip migration) |
| `rewriteFenceBody` | `src/widget/fenceSerialization.ts:141` | Body-preserving fence-opener swap (CRLF-tolerant, property-tested at `tests/widget/fenceSerialization.property.test.ts`). **Phase 21 needs an opener-tag-swap variant — see Code Examples §"rewriteFenceOpenerTag"** |
| `splitPreservingEols` | `src/widget/fenceSerialization.ts:209` | CRLF-tolerant line splitter; reuse for the new opener-tag-swap helper |
| `LC_LANG_SLUGS` | `src/solve/languages.ts:13` | Strict-match predicate vocabulary |
| `FENCE_TAG_ALIASES` | `src/solve/languages.ts:41` | Recognized aliases (`py`, `go`, `c++`, `cs`, `kt`, `rb`, `rs`, `pg`, `sql`, `js`, `ts`, `py3`) |
| `resolveLangSlug` | `src/solve/languages.ts:67` | Strict-match predicate uses sentinel-trick (returns `__sentinel__` if unknown) |
| `lcSlugToFenceTag` | `src/solve/languages.ts:118` | Used by current `codeBlockFor`; Phase 21 keeps for legacy emitter |
| `SelfWriteSuppression.arm/tryConsume` | `src/widget/selfWriteSuppression.ts:42,60` | Hash-arm fallback pattern if D-edge-03 dev-vault probe shows `processFrontMatter` fires a separate modify event |
| `extractFenceBody` | `src/widget/fenceSerialization.ts:113` | Body extraction (used by `WidgetController.reloadFromDisk` already; Phase 21 doesn't directly call but uses the same byte-exact contract) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `app.vault.adapter.write` (D-backup-01 backup primitive) | `app.vault.create` | `vault.create` exposes the backup as a vault-visible file (graph view, search results); ignores user intent. `adapter.write` keeps backups plugin-internal. |
| `vault.process` for atomic rewrite | `vault.modify` | Non-atomic; CI lint blocks it (`scripts/grep-no-vault-modify.sh`). Locked by L8. |
| `processFrontMatter` for `lc-language` fill | hand-rolling YAML edit inside `vault.process` | YAML parse errors silently corrupt frontmatter. `processFrontMatter` is purpose-built and atomic. |
| Lazy-on-AC migration (v1.1 Techniques precedent at full strength) | Lazy-on-first-edit | First-edit-debounced rejected per D-trigger-01 because the widget would have to handle "I'm sitting on a legacy fence" state for arbitrary time, and external-edit reconciliation (Phase 20 SYNC-04) becomes ill-defined for transitional state. |
| Strict-matching (D-edge-01) | Permissive-rewrite-first-fence | Risks rewriting non-code fences user added intentionally — locked rejection. |
| Per-note backup folder | Per-day folder | Per-day collisions when multiple migrations same day; less precise TTL — locked rejection per D-backup-01. |
| Microtask scheduler for 30-day cleanup | `setTimeout` daily timer | Adds long-lived `setInterval` to plugin lifecycle — locked rejection per D-backup-03. |
| Modal-on-first-open for `autoMigrateOnOpen=OFF` | Banner | Modal fatigue when many legacy notes opened back-to-back — locked rejection per D-auto-02. |

### Installation

**No `npm install` required.** All Phase 21 primitives come from packages already in `package.json`. Do NOT add `lodash`, `react`, `markdown-it`, `js-yaml` — Obsidian's built-in primitives cover every operation.

### Version Verification

| Package | Verified Version | Method |
|---------|-----------------|--------|
| `obsidian` | `1.12.3` | `package.json` + `node_modules/obsidian/obsidian.d.ts` line confirms `DataAdapter.appendBinary` `@since 1.12.3` (the package self-tags this version) [VERIFIED: obsidian.d.ts:1988] |
| `Vault.process` | available since `1.1.0` | obsidian.d.ts (Phase 19 STACK research, line 391) [CITED: STACK.md] |
| `DataAdapter.write/list/rmdir/exists/mkdir` | all present in `1.12.3` | obsidian.d.ts:1932 (exists), 1945 (list), 1964 (write), 2011 (mkdir), 2032 (rmdir) [VERIFIED: obsidian.d.ts] |
| `FileManager.processFrontMatter` | available since plugin's existing usage in v1.0/v1.1/v1.2 | confirmed via `applyFrontmatter` at `src/notes/NoteTemplate.ts:267-315` [VERIFIED: existing callsite] |

## Package Legitimacy Audit

> Phase 21 introduces NO new external packages. All primitives reuse `obsidian@1.12.3`, `@codemirror/view@6.38.6`, `@codemirror/state@6.5.0` — already pinned in `package.json` and shipped successfully across Phases 19+20.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `obsidian` | npm | mature (multi-year) | high (Obsidian official type defs) | github.com/obsidianmd/obsidian-api | N/A — pre-existing | Approved (no change) |
| `@codemirror/view` | npm | mature (multi-year) | very high (CM6 official) | github.com/codemirror/view | N/A — pre-existing | Approved (no change) |
| `@codemirror/state` | npm | mature (multi-year) | very high (CM6 official) | github.com/codemirror/state | N/A — pre-existing | Approved (no change) |

**Packages removed due to slopcheck [SLOP] verdict:** none (no new packages).
**Packages flagged as suspicious [SUS]:** none (no new packages).
**No new install commands required for Phase 21.** No new dev-deps either.

*slopcheck not invoked because no new packages are introduced.*

## Architecture Patterns

### System Architecture Diagram

Migration data flow on file-open in Live Preview (Reading-mode parallel — same call shape, different mount entry):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ user clicks LC note (Live Preview)                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ leetCodeFenceViewPlugin.update(view) — buildLeetCodeFenceRanges         │
│  ─ reads metadataCache for lc-slug                                      │
│  ─ runs findCodeFence(state, { preferLeetCodeSolve: true })             │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┴───────────────────┐
              ▼                                        ▼
   ┌─────────────────────┐                ┌──────────────────────────┐
   │ kind === 'legacy'   │                │ kind === 'leetcode-solve'│
   │  + useInlineWidget  │                │  → mount widget directly │
   │  + lc-slug          │                │  (existing path)         │
   │  → call             │                └──────────────────────────┘
   │  migrateLegacyFence │
   │     IfNeeded        │
   └─────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ migrateLegacyFenceIfNeeded(app, file, opts?)  — src/widget/fenceMigrator│
│ ─ isMigrationCandidate(text, fm) — 5-clause strict-match gate           │
│ ─ writeBackup(app, file, slug, fileText)                                │
│   ─ adapter.mkdir(`.obsidian/plugins/.../migration-backup-{slug}-{ts}`) │
│   ─ adapter.write(`.../{slug}.md`, fileText)                            │
│ ─ vault.process(file, currentText => rewriteFenceOpenerTag(...))        │
│ ─ if (lc-language missing) processFrontMatter(file, fm => fm['lc-…']=…) │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Migration COMPLETE                                                       │
│ vault.on('modify') fires → main.ts handler                              │
│  ─ selfWriteSuppression.tryConsume(file.path, hash) → 'consumed'        │
│  ─ processFrontMatter modify event → currentDocHash stays valid OR       │
│    second arm() consumes the second event (D-edge-03 empirical risk)    │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Next render frame — leetCodeFenceViewPlugin.update sees                 │
│ kind === 'leetcode-solve' → widget mounts on rewritten fence            │
│ (atomic with first edit per L3+L4)                                      │
└─────────────────────────────────────────────────────────────────────────┘

Parallel cleanup pipeline (independent, fires once per Plugin.onload):

┌─────────────────────────────────────────────────────────────────────────┐
│ Plugin.onload()                                                          │
│  ─ Promise.resolve().then(() => migrationBackupGc.run(app))             │
│    ─ adapter.list(`.obsidian/plugins/obsidian-leetcode/`)               │
│    ─ filter regex `^migration-backup-.+-{ISO}$`                         │
│    ─ parse ISO timestamp → Date.now() - parsed > 30d?                   │
│    ─ adapter.rmdir(folderPath, true)                                    │
│    ─ errors swallowed (debug-log only)                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/widget/
├── fenceMigrator.ts            # NEW — Plan 21-01 (~250 LOC)
│   ├── migrateLegacyFenceIfNeeded(app, file, opts?)
│   ├── isMigrationCandidate(text, frontmatter)
│   └── writeBackup(app, file, slug, fileText)
├── legacyFenceBanner.ts        # NEW — Plan 21-02 (~80 LOC)
│   └── mountLegacyFenceBanner(host, source, file, plugin)
├── migrationBackupGc.ts        # NEW — Plan 21-04 (~60 LOC)
│   └── runMigrationBackupGc(app)
├── fenceLocator.ts             # MODIFIED — extend rewriteFenceBody (or add sibling rewriteFenceOpenerTag)
├── codeBlockProcessor.ts       # MODIFIED (Plan 21-02) — pre-mount migration call
└── liveModeViewPlugin.ts       # MODIFIED (Plan 21-02) — pre-mount migration call

src/solve/
├── codeExtractor.ts            # MODIFIED (Plan 21-03) — frontmatter arg
├── starterCodeInjector.ts      # MODIFIED (Plan 21-03) — fenceKind arg on injectCodeSection
└── languages.ts                # UNCHANGED — strict-match predicate vocabulary

src/notes/
└── NoteTemplate.ts             # MODIFIED (Plan 21-03) — codeBlockForV13 emitter

src/main.ts                     # MODIFIED — register command palette + migrationBackupGc microtask
src/settings/
├── SettingsStore.ts            # MODIFIED — autoMigrateOnOpen field (default true)
└── SettingsTab.ts              # MODIFIED — Experimental subsection toggle

tests/widget/
├── fenceMigrator.test.ts       # NEW — Plan 21-01 unit + integration
└── migration.property.test.ts  # NEW — Plan 21-04

tests/fixtures/migration/
├── v1.0/                       # NEW (3 notes + 3 *.expected.md)
├── v1.1/                       # NEW (3 notes + 3 *.expected.md)
└── v1.2/                       # NEW (4 notes + 4 *.expected.md)
```

### Pattern 1: Strict-match predicate (D-edge-01)
**What:** A 5-clause boolean predicate gating the migration entry point.
**When to use:** Every call to `migrateLegacyFenceIfNeeded`, including the `force: true` command-palette path (force only bypasses `autoMigrateOnOpen=OFF`, not the strict-match — a malformed note never migrates).
**Source:** Reuses `findCodeFence` (returns `kind`), `LC_LANG_SLUGS` membership, and `countLeetCodeSolveFenceOpeners`.

```typescript
// src/widget/fenceMigrator.ts (new)
export function isMigrationCandidate(
  noteText: string,
  frontmatter: { 'lc-slug'?: string } | undefined,
): boolean {
  // Clause 1: lc-slug present
  if (typeof frontmatter?.['lc-slug'] !== 'string' || frontmatter['lc-slug'] === '') {
    return false;
  }
  // Clause 5: idempotency — already migrated?
  if (countLeetCodeSolveFenceOpeners(noteText, Number.MAX_SAFE_INTEGER) > 0) {
    return false;
  }
  // Clauses 2,3,4 are encapsulated by findCodeFence + a kind check.
  // Construct EditorState via @codemirror/state Text.of(noteText.split('\n'))
  // — same shape as the rest of the widget code; or use a string-based scan
  // that mirrors findCodeFence's regex (preferred for purity in vault.process).
  // See Code Example "isMigrationCandidate" below for the pure variant.
  // ...
}
```

### Pattern 2: Atomic two-write callback (D-edge-03)
**What:** Migration's `vault.process` callback rewrites the opener tag; immediately AFTER (or chained inside the same async path), `processFrontMatter` injects `lc-language` when missing.
**When to use:** Inside `migrateLegacyFenceIfNeeded`. The empirical question is whether the two writes land in the same render frame — see "Common Pitfalls §1" and "Open Questions §1".
**Source:** v1.0/v1.1 precedent for both primitives.

```typescript
// src/widget/fenceMigrator.ts (new) — pseudocode shape
export async function migrateLegacyFenceIfNeeded(
  app: App,
  file: TFile,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  // 1. Settings gate (skip when autoMigrateOnOpen=OFF unless forced)
  const settings = (app as unknown as { plugins?: { plugins?: { 'obsidian-leetcode'?: { settings?: SettingsStore } } } });
  const store = settings.plugins?.plugins?.['obsidian-leetcode']?.settings;
  if (!opts.force && !store?.getAutoMigrateOnOpen()) return false;

  // 2. Read note text + frontmatter
  const text = await app.vault.read(file);
  const fm = app.metadataCache.getFileCache(file)?.frontmatter as
    | { 'lc-slug'?: string; 'lc-language'?: string }
    | undefined;

  // 3. Strict-match gate
  if (!isMigrationCandidate(text, fm)) return false;

  // 4. Backup BEFORE rewrite (D-backup-01). Failure aborts migration.
  const slug = fm!['lc-slug']!;
  await writeBackup(app, file, slug, text);

  // 5. Atomic fence-opener swap.
  await app.vault.process(file, (current) =>
    rewriteFenceOpenerTag(current, /* targetTag */ 'leetcode-solve'),
  );

  // 6. Fill lc-language when missing/empty.
  const needsLang = typeof fm!['lc-language'] !== 'string' || fm!['lc-language'] === '';
  if (needsLang) {
    const defaultLang = store?.getDefaultLanguage() ?? 'python3';
    await app.fileManager.processFrontMatter(file, (fmRef: Record<string, unknown>) => {
      // Re-check inside the callback — race-safe.
      if (typeof fmRef['lc-language'] !== 'string' || fmRef['lc-language'] === '') {
        fmRef['lc-language'] = defaultLang;
      }
    });
  }
  return true;
}
```

### Pattern 3: Backup sidecar via DataAdapter
**What:** Backup folder lives at `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md`. Created via `adapter.mkdir` then `adapter.write`.
**When to use:** Inside `writeBackup` helper called BEFORE `vault.process`.
**Source:** `obsidian.d.ts:1944-2032` (`DataAdapter.list/write/mkdir/rmdir/exists`).

```typescript
// src/widget/fenceMigrator.ts (new)
export async function writeBackup(
  app: App,
  file: TFile,
  slug: string,
  fileText: string,
): Promise<string> {
  // ISO timestamp with `:` replaced for cross-OS filesystem safety.
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
  const baseDir = `.obsidian/plugins/obsidian-leetcode/migration-backup-${slug}-${ts}`;
  const filePath = `${baseDir}/${slug}.md`;
  // mkdir — Obsidian's adapter.mkdir is idempotent for existing dirs.
  await app.vault.adapter.mkdir(baseDir);
  await app.vault.adapter.write(filePath, fileText);
  return filePath;
}
```

### Pattern 4: 30-day backup TTL cleanup (D-backup-03)
**What:** Fire-and-forget microtask in `Plugin.onload()` lists, regex-filters, parses ISO, deletes expired folders.
**When to use:** Once per `Plugin.onload()`; runs unconditionally regardless of `useInlineWidget` setting.
**Source:** `obsidian.d.ts:1944-2032`.

```typescript
// src/widget/migrationBackupGc.ts (new)
export async function runMigrationBackupGc(app: App): Promise<void> {
  const baseDir = '.obsidian/plugins/obsidian-leetcode';
  const re = /^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;
  let listing: { folders: string[]; files: string[] };
  try {
    listing = await app.vault.adapter.list(baseDir);
  } catch (e) {
    // Defensive — adapter may throw on first-install when the folder
    // doesn't exist yet. Swallow and return (best-effort).
    return;
  }
  const now = Date.now();
  for (const folderFull of listing.folders) {
    // adapter.list returns folder names with the parent path prefix.
    const folderName = folderFull.replace(`${baseDir}/`, '');
    const m = re.exec(folderName);
    if (!m) continue;
    const [, , isoSafe] = m;
    // Reverse the `:` → `-` substitution for parsing.
    const iso = isoSafe.replace(
      /(T\d{2})-(\d{2})-(\d{2})Z$/,
      '$1:$2:$3Z',
    );
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;
    if (now - ts > TTL_MS) {
      try {
        await app.vault.adapter.rmdir(folderFull, true);
      } catch (e) {
        // Best-effort — log debug, continue.
      }
    }
  }
}

// In src/main.ts Plugin.onload():
//   Promise.resolve().then(() => runMigrationBackupGc(this.app));
```

### Pattern 5: Pre-mount migration gate (D-trigger-01)
**What:** Both mount paths consult migration BEFORE constructing the widget.
**When to use:** `codeBlockProcessor.ts` Reading-mode handler + `liveModeViewPlugin.ts` `update()` decoration builder.
**Source:** Existing pre-mount metadataCache gate at `codeBlockProcessor.ts:96-100` and `liveModeViewPlugin.ts:64-79`.

```typescript
// src/widget/codeBlockProcessor.ts — modified handler shape
return async (source, el, ctx) => {
  // ... existing TFile + lc-slug + isEmbed checks ...

  // NEW: Phase 21 pre-mount migration gate.
  if (hasLcSlug && plugin.settings.getUseInlineWidget()) {
    const migrated = await migrateLegacyFenceIfNeeded(plugin.app, file);
    if (migrated) {
      // Force a re-render; Obsidian re-fires the post-processor on disk change.
      // No further work in THIS handler invocation — the next invocation sees
      // the rewritten ```leetcode-solve fence and mounts the widget normally.
      return;
    }
    // Otherwise: not a candidate, OR autoMigrateOnOpen=OFF; check banner path.
    if (isLegacyFenceCandidate(source, fm) && !store.getAutoMigrateOnOpen()) {
      mountLegacyFenceBanner(el, source, file, plugin);
      return;
    }
  }
  // ... existing mount path ...
};
```

### Anti-Patterns to Avoid
- **Regex-replace across full file.** Locked rejection per Pitfall 7. Use `findCodeFence` + `rewriteFenceOpenerTag` (byte-level slice) only.
- **Migration on `Plugin.onload()`.** Locked rejection per L5. Lazy-on-open ONLY.
- **`vault.modify` for the rewrite.** Non-atomic; CI lint blocks (per CLAUDE.md vault-layer write discipline).
- **Skipping backup on `force: true` path.** Backup is non-negotiable per MIGRATE-02 — even the command-palette manual migration writes a backup.
- **Rewriting `lc-language` when already set.** Per D-edge-04, migration NEVER overwrites existing values.
- **Using `vault.create` for backup files.** Locked rejection per D-backup-01 — backup must NOT appear in the user's vault.
- **Auto-reload silently on migration failure.** Per `Pitfall 5` (vim-toggle precedent): never auto-reload mid-edit. If migration fails, debug-log + return false; the user retains their note unchanged.
- **Calling `processFrontMatter` BEFORE `vault.process`.** Order matters: `vault.process` is the body-touching atomic write. Frontmatter edits after the body edit make the modify-event ordering predictable. (D-edge-03 inverts this only for the `lc-language` fill, which is itself ordered AFTER the opener swap.)
- **Caching the `metadataCache` snapshot across the migration boundary.** Always re-read inside the `processFrontMatter` callback — the cache may already reflect the post-`vault.process` state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic fence-opener swap | Custom regex find-and-replace | Extend existing `rewriteFenceBody` with `openerTag?: string` parameter (recommended), OR sibling `rewriteFenceOpenerTag(noteText, fenceLineIdx, newTag)` in same file | `rewriteFenceBody` is property-tested; CRLF-tolerant; SSoT in one file |
| Backup folder filesystem ops | Direct `fs.writeFileSync` / Node FS APIs | `app.vault.adapter.write/list/rmdir/mkdir` | Obsidian's adapter is the cross-platform abstraction; raw Node FS breaks under iCloud/sync |
| 30-day TTL cleanup | `setInterval` / `setTimeout` long-lived timer | `Promise.resolve().then(...)` microtask in `Plugin.onload()` | Keeps it inside the same tick; no long-lived plugin lifecycle hook |
| Backup folder name parsing | YAML / structured metadata file | Folder-name regex `migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$` | Folder name carries the data; one less file to write/read |
| Frontmatter YAML parsing | `js-yaml` / hand-rolled YAML editor | `app.fileManager.processFrontMatter(file, fm => fm['k']=v)` | Atomic; handles malformed YAML; fires metadataCache event automatically |
| Idempotency check | Hash + timestamp metadata file | `countLeetCodeSolveFenceOpeners(text, MAX) > 0` short-circuit | The `leetcode-solve` opener IS the migrated marker (L4) |
| Strict-match predicate | Custom mini-parser for fence detection | Reuse `findCodeFence(state, opts)` + `LC_LANG_SLUGS` membership | Already shipped; tested through Phase 19/20 |
| Migration "session" backup directory | Per-plugin-load timestamp folder | Per-note timestamp folder | One folder per note over its lifetime (D-backup-01) |
| Cross-platform ISO timestamp | Custom date format | `new Date().toISOString().replace(/:/g, '-')` | The `:` is the only forbidden char on Windows; replace once |
| Banner DOM construction | Template strings + `innerHTML` | `el.createEl({ text, cls })` per `codeBlockProcessor.ts:42-69` precedent | CLAUDE.md no-innerHTML rule + `eslint-plugin-obsidianmd` enforces |
| Manual file-system probe for "backup folder exists" | Custom existence check | `app.vault.adapter.exists(path, sensitive?)` (`obsidian.d.ts:1932`) | Cross-platform case-sensitivity gate built in |

**Key insight:** Every primitive Phase 21 needs is already in tree. The phase is integration + UX, not new mechanics. The only NEW pure helper required is `rewriteFenceOpenerTag` (or an extension to `rewriteFenceBody`) — and that helper has the property-test corpus pattern already established in `tests/widget/fenceSerialization.property.test.ts`.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 21 introduces no new persistent data structures (backup folders are content-addressable filesystem state, not stored data). The plugin already persists `data.json` via `SettingsStore`; new `autoMigrateOnOpen` field is a settings-only toggle. | Adding `autoMigrateOnOpen: boolean` (default `true`) to `PluginData` interface in `SettingsStore.ts` mirrors `useInlineWidget` shape (line 86). Shape-guard at load: `typeof raw.autoMigrateOnOpen === 'boolean' ? raw.autoMigrateOnOpen : true`. |
| Live service config | None — Obsidian itself owns the renderer process; no n8n / Datadog / Cloudflare interaction. | None |
| OS-registered state | None — no Windows Task Scheduler / launchd / systemd registration. | None |
| Secrets/env vars | None — Phase 21 has no HTTP, no API keys, no env vars. | None |
| Build artifacts / installed packages | The legacy `codeBlockFor` emitter remains in `src/notes/NoteTemplate.ts` for the `useInlineWidget=OFF` transition window; new `codeBlockForV13` ships alongside. After Phase 22 cutover, `codeBlockFor` is deleted and `codeBlockForV13` is renamed to `codeBlockFor`. **No build-artifact action for Phase 21** — the rename is Phase 22 mechanical work. | None for Phase 21; Phase 22 deletes the legacy emitter + renames. |

**Nothing found in category:** Stated explicitly above for "Live service config", "OS-registered state", and "Secrets/env vars" categories — verified by reading `src/main.ts:Plugin.onload()` registration shape (no external service handles, no OS-level registration, no secrets load).

**Migration impact: existing user data on disk.** The Phase 21 migration ITSELF rewrites user note files. The 5-clause strict-match predicate (D-edge-01) protects user content. The backup sidecar (D-backup-01) provides recovery. The atomic write semantic (L3) guarantees disk never observes a half-migrated state. CI fixtures (D-fixtures-01) catch regressions on the v1.0/v1.1/v1.2 schemas. **This is a data migration AND a code edit — both must appear in the plan.** Plan 21-01 ships the data-migration mechanics; Plan 21-03 ships the code-edit (codeExtractor + new-note emission) for the post-migration invariant.

## Common Pitfalls

### Pitfall 1: `vault.process` + `processFrontMatter` ordering empirical risk (D-edge-03)
**What goes wrong:** The two atomic writes land in DIFFERENT render frames, OR both fire `vault.on('modify')` events. The widget mount path consumes the first event mid-migration, sees the post-`vault.process` but pre-`processFrontMatter` state, mounts on a fence-rewritten-but-language-missing note, hits the WIDGET-06 fallback (Python+Notice), and the user sees a flash of incorrect language before the second event triggers a remount.
**Why it happens:** Obsidian queues `vault.process` and `processFrontMatter` serially per-file, but each may fire its own `modify` event with its own settle frame. The selfWriteSuppression hash-arm is a single entry — if migration fires both events, only one is absorbed.
**How to avoid:** Plan 21-01 dev-vault probe ANSWERS this empirically. Two fallback strategies are pre-built:
1. **If single-frame:** No work needed; the suppression map's single entry covers both writes.
2. **If two-frame:** Arm `selfWriteSuppression` TWICE — once before `vault.process` (with the post-rewrite hash), once before `processFrontMatter` (with the post-frontmatter-fill hash). Phase 19 C-04 hash-arm pattern is already in tree.
**Warning signs:** Test "open a v1.2 note with missing `lc-language`; widget should mount with the correct lc-language slug, not Python+Notice." Failure: WIDGET-06 fallback Notice fires.

### Pitfall 2: Strict-match predicate over- or under-scoping
**What goes wrong:** The 5-clause predicate accepts notes it shouldn't (rewrites user-authored example fences), or rejects notes it should accept (a v1.2 note with `lc-language` set but the fence-tag-vs-frontmatter-language disagree).
**Why it happens:** Cross-checking 5 clauses across `findCodeFence` + `LC_LANG_SLUGS` + `FENCE_TAG_ALIASES` + `countLeetCodeSolveFenceOpeners` involves 4 different code paths. Missing one clause leaks.
**How to avoid:** Property-test the predicate exhaustively (Plan 21-01). Generators emit synthetic notes with: random LC langSlug (canonical and alias), random `lc-language` value, random body content, mixed-state notes (legacy + leetcode-solve fences), fences with no closer, fences in non-`## Code` sections, notes without `## Code` heading. The predicate must reject every malformed shape.
**Warning signs:** Fixture suite includes a note with `lc-slug` + `## Code` heading + ` ```text ` fence (NOT a recognized langSlug); migration must NOT rewrite it.

### Pitfall 3: Backup folder filename illegality (Windows `:` in ISO timestamp)
**What goes wrong:** `new Date().toISOString()` produces `2026-06-01T14:32:08.123Z`. The literal `:` is forbidden in Windows filenames; `adapter.write` fails.
**Why it happens:** Cross-platform path conventions; macOS/Linux accept `:` but Windows rejects.
**How to avoid:** Replace `:` with `-` BEFORE constructing the path: `new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')`. Also strip the millisecond fragment for compactness.
**Warning signs:** Add a Windows CI test (or a unit test that passes a Windows-style sanitization regex through the helper); fail loudly on illegal chars.

### Pitfall 4: 30-day cleanup running on first install (no backup folder exists)
**What goes wrong:** `app.vault.adapter.list(baseDir)` throws on a non-existent folder. Plugin.onload() crashes.
**Why it happens:** First-install vaults have no `.obsidian/plugins/obsidian-leetcode/migration-backup-*` folders. `adapter.list` is documented to return `ListedFiles` but throws on missing paths.
**How to avoid:** Wrap the list call in try-catch; swallow the error and return early. Per D-backup-03: errors during cleanup are debug-logged and swallowed.
**Warning signs:** Test "Plugin.onload() on a fresh vault" — must NOT throw, must NOT log error-level (only debug).

### Pitfall 5: Cleanup running on `useInlineWidget=OFF` deletes legitimate backups
**What goes wrong:** A user toggles `useInlineWidget=ON`, opens 50 legacy notes (50 backups created), toggles `useInlineWidget=OFF` for testing, reloads Obsidian. The cleanup microtask fires, parses backup folders, deletes any older than 30 days.
**Why it happens:** Per D-backup-03, cleanup runs unconditionally. Per L9, migration is a no-op when OFF. The cleanup must still run because backups from prior `=ON` sessions are real.
**How to avoid:** Cleanup correctness — verify the 30-day TTL math is `now - parsed > 30 * 24 * 60 * 60 * 1000`, not the other direction. A user toggling ON/OFF for testing does NOT trigger spurious deletion (their backups are days old, not 30+ days).
**Warning signs:** Property test: backup written at `t=0`, cleanup runs at `t=29.9 days` → folder remains; cleanup at `t=30.1 days` → folder deleted.

### Pitfall 6: Mount-path race between async migration and synchronous decoration build
**What goes wrong:** `liveModeViewPlugin.update()` is synchronous (CM6 ViewPlugin contract). It cannot `await migrateLegacyFenceIfNeeded`. If migration is async, the synchronous decoration build runs FIRST (sees legacy fence → renders nothing), then migration completes, then a second `update` fires (sees `leetcode-solve` → renders widget). User sees a flash of unstyled fence body.
**Why it happens:** CM6 ViewPlugin's update method must return synchronously. Reading-mode `MarkdownPostProcessor` handlers can be async, but the Live Preview path cannot.
**How to avoid:** In Live Preview, fire the migration as a fire-and-forget Promise from inside `update()` when a legacy fence is detected; immediately return an empty decoration set (or render the legacy fence via the `kind === 'legacy'` branch of `findCodeFence`); rely on `vault.on('modify')` (which fires after migration completes) to trigger a fresh `update()` call that sees the rewritten fence.
**Warning signs:** Test "open a v1.2 note in Live Preview; observe NO flash of raw fence body." The transitional state must be "no widget" (graceful) not "raw markdown" (broken).

### Pitfall 7: Migration on a note that's been migrated then manually unmigrated
**What goes wrong:** User runs the dev-only `unmigrateToLegacyFence` command (L7), which strips the `leetcode-solve` opener back to `langSlug`. Now the note matches the strict-match predicate AGAIN (lc-slug present, ## Code heading, recognized fence tag, closer, no leetcode-solve fence). Re-opening the note triggers migration AGAIN, writing a SECOND backup with a different timestamp.
**Why it happens:** Per D-backup-02, "one backup per note ever" relies on the idempotency short-circuit. Manual unmigration breaks the contract.
**How to avoid:** Document this in the dev-only command's Notice copy: "Reverse migration applied. Re-opening this note will re-migrate and create a new backup." This is acceptable for a dev-only path. The backup directory will eventually exceed two folders for the same slug, but each is uniquely timestamped.
**Warning signs:** N/A for production users; dev-only command will surface this naturally.

### Pitfall 8: codeExtractor refactor breaks Run/Submit during transition
**What goes wrong:** Plan 21-03 refactors `extractFirstFencedBlock(noteBody)` → `extractFirstFencedBlock(noteBody, frontmatter)`. The 5 consumers (`runWithCode`, `submitWithCode`, AI Debug code-fetch, AI Solution code-fetch, copyToCode, `KnowledgeGraphWriter`) must ALL be updated. Missing one consumer leaves a stale call site that passes only `noteBody` — runtime TypeError.
**Why it happens:** Multi-callsite refactors are mechanical but error-prone.
**How to avoid:** Use TypeScript's strict signature change to force every consumer to update. Compile error blocks the change from landing without all callsites updated.
**Warning signs:** Run `pnpm tsc --noEmit` after the refactor; any error indicates a missed callsite.

### Pitfall 9: New-note emission writing legacy `langSlug` fence with `useInlineWidget=ON`
**What goes wrong:** Plan 21-03 adds `codeBlockForV13` and gates `injectCodeSection` on `fenceKind`, but a forgotten call site in `forceInjectCodeSection` (or `buildNoteBody`) emits `codeBlockFor(langSlug, ...)` instead. New v1.3 notes ship with a `langSlug`-tagged fence; the next time the user opens them, migration fires (turning brand-new notes into "migrated from v1.2" notes with a backup folder).
**Why it happens:** Multiple call sites (`buildNoteBody`, `injectCodeSection`, `forceInjectCodeSection`) all emit fences. Missing one = user-visible bug.
**How to avoid:** Audit every emit site. Add a unit test: `useInlineWidget=ON` + new note creation → resulting body contains `leetcode-solve` fence, NOT a `langSlug` fence.
**Warning signs:** Fixture: assert `useInlineWidget=ON` + buildNoteBody(...) → result NOT matching `/^```python/` and matching `/```leetcode-solve/`.

## Code Examples

Verified patterns from in-tree sources:

### Example 1: `rewriteFenceOpenerTag` (NEW pure helper — extends `fenceSerialization.ts`)

The recommended approach (per code_context §"Reusable Assets"): extend `rewriteFenceBody` with an optional `openerTag?: string` parameter, OR add a sibling function. Either way, no new files.

```typescript
// src/widget/fenceSerialization.ts — NEW sibling function
//
// Phase 21 — preserve fence body BYTE-EXACT while swapping the opener line's
// tag. Mirrors rewriteFenceBody's locator + EOL-preserving structure.
//
// Round-trip invariant for the Phase 21 migration use:
//   rewriteFenceOpenerTag(rewriteFenceOpenerTag(s, '```leetcode-solve'),
//                         '```python') === s   // when s has a python fence
//
// (assuming the body did not contain the new tag triggering re-detection —
// this is fine for the migration use because the strict-match predicate
// already gates on `kind === 'legacy'`.)
export function rewriteFenceOpenerTag(
  noteText: string,
  newOpenerTag: 'leetcode-solve',  // type-narrow for v1.3 use
): string {
  // Locate the FIRST legacy LC-tagged fence under `## Code` — same
  // shape as fenceLocator.findCodeFence, but operating on a string
  // (no EditorState dependency, safe inside vault.process callback).
  const { lines, eols } = splitPreservingEols(noteText);
  let inCodeSection = false;
  let openerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i] ?? '';
    if (/^\s*##\s+Code\s*$/.test(t)) { inCodeSection = true; continue; }
    if (/^\s*##\s+\S/.test(t)) { inCodeSection = false; continue; }
    if (inCodeSection && /^\s*```/.test(t)) {
      // Don't rewrite an already-leetcode-solve fence (idempotency).
      if (/^\s*```leetcode-solve\b/.test(t)) return noteText;
      openerLineIdx = i;
      break;
    }
  }
  if (openerLineIdx < 0) return noteText;
  // Reconstruct: prefix + new opener line + suffix.
  const newOpenerLine = '```' + newOpenerTag;
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    if (i === openerLineIdx) {
      out += newOpenerLine;
    } else {
      out += lines[i] ?? '';
    }
    out += eols[i] ?? '';
  }
  return out;
}
```

Property-test pattern (mirror `tests/widget/fenceSerialization.property.test.ts`):

```typescript
// tests/widget/fenceMigrator.property.test.ts (NEW — Plan 21-04)
import { describe, it, expect } from 'vitest';
import { rewriteFenceOpenerTag } from '../../src/widget/fenceSerialization';
import { extractFenceBody } from '../../src/widget/fenceSerialization';

describe('rewriteFenceOpenerTag — body preservation', () => {
  it.each([
    ['python', 'def f():\n    return 1'],
    ['java', 'public class Solution {}'],
    ['cpp', 'int main() { return 0; }'],
    ['python', '```nested\nbacktick body\n```'],  // nested backticks
    ['python', '---\nfrontmatter-like\n---'],     // body with --- lines
  ])('rewrites %s opener while preserving body byte-exact', (langSlug, body) => {
    const file = `## Code\n\n\`\`\`${langSlug}\n${body}\n\`\`\`\n\n## Notes\n`;
    const rewritten = rewriteFenceOpenerTag(file, 'leetcode-solve');
    // Body byte-exact via extractFenceBody (which scans for leetcode-solve fences).
    expect(extractFenceBody(rewritten, 0)).toBe(body);
  });

  it('is idempotent on already-leetcode-solve fences', () => {
    const file = '## Code\n\n```leetcode-solve\nbody\n```\n';
    expect(rewriteFenceOpenerTag(file, 'leetcode-solve')).toBe(file);
  });
});
```

### Example 2: `isMigrationCandidate` predicate (string-based, pure)

```typescript
// src/widget/fenceMigrator.ts — NEW
import { LC_LANG_SLUGS, resolveLangSlug } from '../solve/languages';
import { countLeetCodeSolveFenceOpeners } from './fenceLocator';

export function isMigrationCandidate(
  noteText: string,
  frontmatter: Record<string, unknown> | undefined,
): boolean {
  // Clause 1: lc-slug present + non-empty.
  const slug = frontmatter?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) return false;

  // Clause 5: idempotency — already migrated? Cheap; do this BEFORE the linear scan.
  if (countLeetCodeSolveFenceOpeners(noteText, Number.MAX_SAFE_INTEGER) > 0) {
    return false;
  }

  // Clauses 2,3,4: `## Code` heading exists AND first fence inside it has a
  // recognized LC langSlug AND the fence has a closer.
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i] ?? '';
    if (/^\s*##\s+Code\s*$/.test(t)) { inCodeSection = true; continue; }
    if (/^\s*##\s+\S/.test(t)) { inCodeSection = false; continue; }
    if (!inCodeSection) continue;
    const fenceMatch = /^\s*```([A-Za-z0-9_+#-]*)\s*$/.exec(t);
    if (!fenceMatch) continue;

    // Clause 3: recognized langSlug or alias.
    const tag = (fenceMatch[1] ?? '').toLowerCase();
    if (!tag) return false;  // empty fence opener — not a v1.2 LC fence
    const resolved = resolveLangSlug(tag, '__sentinel__');
    if (resolved === '__sentinel__') return false;  // alias miss
    if (!LC_LANG_SLUGS.has(resolved)) return false;  // unknown slug

    // Clause 4: closer exists before next `## ` heading or EOF.
    for (let j = i + 1; j < lines.length; j++) {
      const tt = lines[j] ?? '';
      if (/^\s*##\s+/.test(tt)) return false;  // hit next heading first — no closer
      if (/^\s*```\s*$/.test(tt)) return true;  // closer found
    }
    return false;  // no closer
  }
  return false;  // no `## Code` section or no fence
}
```

### Example 3: Pre-mount migration call (modify existing `codeBlockProcessor.ts`)

```typescript
// src/widget/codeBlockProcessor.ts — modified handler. EXISTING shape preserved
// for non-migration paths; new gate inserted between TFile resolution and the
// existing isReadingMode probe.
import { migrateLegacyFenceIfNeeded } from './fenceMigrator';

export function leetCodeBlockProcessor(plugin: ProcessorHost) {
  return async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> => {
    // ... existing TFile resolution at line 85 ...

    // NEW Phase 21 gate — runs BEFORE the lc-slug check below so migration
    // happens even when the post-processor is invoked during the
    // pre-render fragment (auto-migrate path).
    if (
      file instanceof TFile &&
      plugin.settings?.getUseInlineWidget?.() === true &&
      plugin.settings?.getAutoMigrateOnOpen?.() === true
    ) {
      try {
        const migrated = await migrateLegacyFenceIfNeeded(plugin.app, file);
        if (migrated) {
          // Migration rewrote the file; vault.on('modify') will trigger a
          // fresh post-processor invocation that mounts the widget on the
          // ```leetcode-solve fence. This invocation has no further work.
          renderStaticFallback(el, source);
          return;
        }
      } catch (err) {
        // Defensive — migration must NOT block the user from opening the
        // note. Log debug, fall through to the existing static fallback.
      }
    }

    // ... existing lc-slug + isEmbed + RenderChild mount path unchanged ...
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.2 fence-tag = `\`\`\`python` (etc.) encodes language | `\`\`\`leetcode-solve` + `lc-language` frontmatter is canonical | v1.3 milestone (Phase 19 C-01) | Phase 21 migrates every legacy note to the new shape |
| codeExtractor reads language from fence tag | codeExtractor reads from frontmatter when fence is `leetcode-solve`; legacy fence-tag path remains during transition | Phase 21 (D-extract-01) | After Phase 22 cutover, legacy branch unreachable; Phase 22 deletes it |
| New notes emit `\`\`\`<langSlug>` via `codeBlockFor` | New notes emit `\`\`\`leetcode-solve` via `codeBlockForV13` (gated on `useInlineWidget=ON`) | Phase 21 (D-emit-01) | Phase 22 renames `codeBlockForV13` to `codeBlockFor` and deletes the legacy emitter |
| Backup before plugin-store re-review = none (v1.0/v1.1/v1.2 had no batch migration) | Per-note backup folder (30-day TTL) | Phase 21 (D-backup-*) | Plugin-store reviewers may scrutinize the backup discipline; D-backup is documented in `Pitfall 13` from PITFALLS.md |
| Section-lock convention `'leetcode.*'` userEvent active | `'leetcode.*'` retained through Phase 21 | Phase 22 deletion (DELETE-08) | Phase 21 plans MUST NOT modify CLAUDE.md `## Conventions` section |

**Deprecated/outdated:**
- The string `\`\`\`python3` as a fence tag — legacy v1.0/v1.1/v1.2; Phase 21 migrates away.
- `codeBlockFor(langSlug, starter)` — kept as legacy emitter through Phase 21; deleted in Phase 22.
- `extractFirstFencedBlock(noteBody)` (1-arg signature) — Plan 21-03 widens to 2-arg; Phase 22 may simplify back after legacy fence-tag path is deleted.

## Assumptions Log

> Listing claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `app.vault.adapter.list(missingDir)` throws on first-install when `migration-backup-*` folders don't exist | Pitfall 4 + Code Example 4 | LOW — defensive try-catch already wraps the call; behavior verified empirically by Plan 21-04 dev-vault probe |
| A2 | `app.vault.adapter.mkdir(dirThatExists)` is idempotent (no-op when the dir already exists) | Code Example 3 | LOW — Obsidian's adapter doc doesn't explicitly state idempotency, but `obsidian.d.ts:2011` describes `mkdir` without an "already-exists" error contract; if mkdir throws on existing dirs, wrap in try-catch and check `adapter.exists` first |
| A3 | Banner DOM construction with `el.createEl({ text, cls })` is sufficient for the legacy-fence banner UX | Pattern 5 + Code Example 5 | MEDIUM — `legacyFenceBanner.ts` styling depends on Obsidian's `.notice-warning` / `.callout-warning` cascade; planner verifies in dev vault per Claude's discretion §"Legacy banner styling" |
| A4 | `processFrontMatter` callback running AFTER `vault.process` produces frontmatter that is byte-exact except for the new `lc-language` line | D-edge-04 | LOW — Obsidian's `processFrontMatter` is documented atomic; widely used in v1.0/v1.1/v1.2 callsites with no reported regressions |

**Rationale for low risk on A1, A2, A4:** These are Obsidian API contracts that have been exercised by v1.0/v1.1/v1.2 production usage. The Phase 21 dev-vault probe confirms the live behavior; failures fall through to debug-log + best-effort.

## Open Questions (RESOLVED)

1. **`vault.process` + `processFrontMatter` ordering — same render frame or separate frames?**
   - What we know: Both primitives are atomic per-file. Both fire `vault.on('modify')`. Phase 19 PHASE-SUMMARY documents an "A1 modify ordering" empirical probe result that Plan 21-01 inherits.
   - What's unclear: Whether the second event arrives in the same render frame as the first, OR after a settle frame.
   - Recommendation: Plan 21-01 dev-vault probe asks: open a v1.2 note with missing `lc-language`; observe whether the widget's `selfWriteSuppression.tryConsume` returns `'consumed'` for both events (single-arm) or whether the second event escapes (double-arm needed).
   - **RESOLVED:** Deferred to Plan 21-02 Task 4 dev-vault probe with bounded protocol; default-path is single-frame; if probe shows two-frame, the conditional sub-task in Plan 21-02 (Task 5, added per BLOCKER 3 of the revision pass) wires the Phase 19 C-04 selfWriteSuppression hash-arm fallback. The Plan 21-01 orchestrator ships under the single-frame assumption; the Phase 19 C-04 hash-arm pattern is already in tree (`src/widget/selfWriteSuppression.ts:42-91`) and the conditional Plan 21-02 Task 5 wires it iff Test 2 of the probe shows the two-frame Python+Notice flash.

2. **Backup folder mkdir contract — does `adapter.mkdir` throw on existing directories?**
   - What we know: `obsidian.d.ts:2011` documents `mkdir` without an "already-exists" error contract.
   - What's unclear: Production behavior on macOS / Windows / Linux when the folder already exists.
   - Recommendation: Wrap mkdir in try-catch defensively; if it throws, swallow the error and proceed to `adapter.write` (which creates the file regardless, per `obsidian.d.ts:1958-1963` "If the file exists its content will be overwritten, otherwise the file will be created.").
   - **RESOLVED:** Wrap `adapter.mkdir(baseDir)` in try/catch in `writeBackup` per Plan 21-01 Task 2 behavior; swallow on error and proceed to `adapter.write` (which creates the file regardless per the obsidian.d.ts contract). Risk LOW.

3. **`useInlineWidget=OFF` cleanup question (Claude's discretion).**
   - What we know: Per L9, migration is a no-op when OFF. Per D-backup-03, cleanup runs unconditionally.
   - What's unclear: Whether a user toggling `useInlineWidget=OFF` for testing should preserve their backups.
   - Recommendation: Cleanup runs always; the 30-day TTL math protects fresh backups regardless of toggle state. No special-case logic.
   - **RESOLVED:** Cleanup runs unconditionally in `Plugin.onload()` (Plan 21-04 Task 1); 30-day TTL math protects fresh backups regardless of `useInlineWidget` toggle state. No special-case logic introduced.

4. **Reverse-migration command exposure (Claude's discretion).**
   - What we know: Per L7, the command is dev-only. Two implementation options: `process.env.NODE_ENV === 'development'` gate, or always-registered with a "Dev only — do not use" Notice.
   - What's unclear: Which is more robust for in-the-field debugging.
   - Recommendation: Always-registered + Notice — `process.env.NODE_ENV` may not be reliably set in production Obsidian.
   - **RESOLVED:** Reverse migration is OUT OF SCOPE for Phase 21 plans 21-01..04 — kept as dev-only and deferred per L7. Recovery path for users is the backup sidecar (D-backup-01). Phase 22 may surface the dev-only command behind a `process.env.NODE_ENV` gate or always-registered + Notice if demand arises.

5. **codeExtractor consumer count — exact 5?**
   - What we know: CONTEXT D-extract-01 lists 5 consumers (`runWithCode`, `submitWithCode`, AI Debug, AI Solution, copyToCode, KnowledgeGraphWriter language-write).
   - Verified via grep: `tests/solve/codeExtractor.test.ts`, `tests/main/runFromWidget.test.ts`, `src/main.ts`, `src/solve/submissionOrchestrator.ts`, `src/solve/codeExtractor.ts`, `src/graph/KnowledgeGraphWriter.ts`, `src/ai/buildDebugPrompt.ts` all import / reference `extractFirstFencedBlock`.
   - Plan 21-03 must update each consumer (count: 5 production consumers + 2 test files). TS strict-mode catches missing call sites.
   - **RESOLVED:** Re-grepped during revision pass on 2026-06-01. Actual call site count is **6** in production code across **3** files (not 5 across 4-5 files): `src/main.ts:2278` (`openAIDebug`, `view.file` in scope), `src/main.ts:2400` (AI Review snapshot path, `ctx.file` in scope from outer ctx with `file: TFile`), `src/main.ts:2544` (`runAIReview` / AI Solution path, `view.file` in scope), `src/main.ts:3846` (`runWithCode` legacy fallback, `ctx.file` in scope per ProblemContext at line 236), `src/solve/submissionOrchestrator.ts:260` (`submitWithCode` legacy fallback — **`file` NOT in `SubmissionDeps` interface (line 71); needs lift via threading new `file: TFile` field into deps**), `src/graph/KnowledgeGraphWriter.ts:217` (`onAccepted` pattern classification, `ctx.file` in scope at line 216). `src/ai/buildDebugPrompt.ts` only references `extractFirstFencedBlock` in comments — not a call site. Plus 2 test files (`tests/solve/codeExtractor.test.ts`, `tests/main/runFromWidget.test.ts`). Plan 21-03 Task 2 enumerates all 6 production sites and documents the lift requirement for `submissionOrchestrator.ts`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `obsidian` (npm) | All Phase 21 primitives | ✓ | 1.12.3 | — |
| `@codemirror/view` | Existing widget infrastructure (Phase 19 carry) | ✓ | 6.38.6 | — |
| `@codemirror/state` | Existing widget infrastructure (Phase 19 carry) | ✓ | 6.5.0 | — |
| `vitest` | CI fixture suite + property tests | ✓ | 4.1.5 | — |
| `typescript` | Strict-signature codeExtractor refactor | ✓ | 5.8.3 | — |
| `eslint-plugin-obsidianmd` | Pre-commit lint + plugin-store readiness | ✓ | (already pinned) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation: true` per `.planning/config.json` — section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `pnpm vitest --run tests/widget/fenceMigrator.test.ts` (per-Plan) |
| Full suite command | `pnpm vitest --run` (full suite, including new `tests/fixtures/migration/*` and `tests/widget/migration.property.test.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGRATE-01 | Lazy on first open of a v1.2 note triggers migration | unit + integration (mock TFile + adapter) | `pnpm vitest --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-01"` | ❌ Wave 0 — new file |
| MIGRATE-02 | Backup file written before rewrite | unit (mock adapter.write spy) | `pnpm vitest --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-02"` | ❌ Wave 0 |
| MIGRATE-03 | Atomic rewrite (single vault.process callback) preserves body | property test | `pnpm vitest --run tests/widget/migration.property.test.ts -t "body-preservation"` | ❌ Wave 0 |
| MIGRATE-04 | Idempotency — re-open is no-op | unit (call migrate twice, assert second call returns false) | `pnpm vitest --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-04"` | ❌ Wave 0 |
| MIGRATE-05 | 30-day TTL deletes expired backups | unit (mock Date.now + adapter.list/rmdir) | `pnpm vitest --run tests/widget/migrationBackupGc.test.ts -t "MIGRATE-05"` | ❌ Wave 0 |
| MIGRATE-06 | Auto-migrate setting toggle | unit (settings persistence + onChange) | `pnpm vitest --run tests/settings/SettingsTab.test.ts -t "autoMigrateOnOpen"` | ⚠️ extend existing file |
| MIGRATE-07 | Atomic with first edit (vault.process + processFrontMatter same callback) | integration (dev-vault probe documented in Plan 21-01) | dev-vault smoke (manual) | manual-only |
| MIGRATE-08 | New notes emit `leetcode-solve` directly | unit (call buildNoteBody / forceInjectCodeSection with useInlineWidget=ON) | `pnpm vitest --run tests/solve/starterCodeInjector.test.ts -t "v13-emit"` + `tests/solve/noteTemplate-phase3.test.ts -t "v13-emit"` | ⚠️ extend existing files |
| MIGRATE-09 | codeExtractor reads from frontmatter when fence is `leetcode-solve` | unit | `pnpm vitest --run tests/solve/codeExtractor.test.ts -t "frontmatter-source"` | ⚠️ extend existing file |
| MIGRATE-10 | CI fixtures pass byte-exact migration | integration (snapshot test) | `pnpm vitest --run tests/fixtures/migration/` | ❌ Wave 0 — new directory |

### Sampling Rate
- **Per task commit:** `pnpm vitest --run tests/widget/fenceMigrator.test.ts` (Plan 21-01 unit slice).
- **Per wave merge:** `pnpm vitest --run` (full suite, ~30s baseline + ~5s for new fixture suite).
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual dev-vault smoke for MIGRATE-07 (dev-vault probe).

### Wave 0 Gaps
- [ ] `tests/widget/fenceMigrator.test.ts` — covers MIGRATE-01 through MIGRATE-04, MIGRATE-07.
- [ ] `tests/widget/migrationBackupGc.test.ts` — covers MIGRATE-05.
- [ ] `tests/widget/migration.property.test.ts` — property-test layer covering MIGRATE-03 invariants.
- [ ] `tests/fixtures/migration/v1.0/` — 3 hand-written notes + 3 `*.expected.md` files.
- [ ] `tests/fixtures/migration/v1.1/` — 3 hand-written notes + 3 `*.expected.md` files.
- [ ] `tests/fixtures/migration/v1.2/` — 4 hand-written notes + 4 `*.expected.md` files.
- [ ] No framework install needed — `vitest@4.1.5` already pinned.

## Security Domain

> `workflow.security_enforcement` not explicitly disabled in `.planning/config.json` — section is included with categories applicable to this Obsidian-plugin phase. Most ASVS web-application categories don't apply (no web server, no auth, no remote endpoints — Phase 21 has zero network surface).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes — backup folder location is plugin-internal | `.obsidian/plugins/obsidian-leetcode/` is OFF the user's vault tree (D-backup-01) |
| V2 Authentication | no | N/A — no auth surface in Phase 21 |
| V3 Session Management | no | N/A |
| V4 Access Control | yes — strict-match predicate gates whose notes are touched | 5-clause predicate (D-edge-01) requires `lc-slug` frontmatter |
| V5 Input Validation | yes — slug used in backup path | `lc-slug` validated against LC slug format (existing v1.0 contract: `/^[a-z0-9-]+$/`); ISO timestamp normalization replaces `:` with `-` for cross-OS filesystem safety |
| V6 Cryptography | no | N/A — no crypto in Phase 21 |
| V7 Error Handling | yes — migration failure must NOT corrupt user data | Backup BEFORE rewrite; defensive try-catch on cleanup; debug-log all errors |
| V8 Data Protection | yes — backup contains user code | Backup folder is plugin-internal (`.obsidian/plugins/...`), not synced via Obsidian Sync (which mirrors `.obsidian/plugins` only when explicit per-user setting is enabled — and even then is plugin-author intent) |
| V9 Communications | no | N/A — no network in Phase 21 |
| V10 Malicious Code | yes — migration rewrites user files | Strict-match predicate provably scopes the rewrite; idempotency prevents re-corruption; backup provides rollback |
| V11 Business Logic | yes — `lc-language` fill must NOT downgrade existing values | D-edge-04: NEVER overwrite existing `lc-language` |
| V12 File and Resources | yes — backup paths could trigger path-traversal | Slug validated against LC format BEFORE substitution into path; ISO timestamp sanitized |

### Known Threat Patterns for {Obsidian plugin / TypeScript / vault filesystem}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path-traversal via malicious `lc-slug` (e.g., `'../evil'`) | Tampering | LC slug format `/^[a-z0-9-]+$/` validated by `LeetCodeClient` BEFORE writing to frontmatter; backup path constructs via template literal with the validated slug |
| Migration rewrites a non-LC note (hijacks user's example code fences) | Tampering | Strict-match predicate's clause 1 (`lc-slug` present) gates entry — non-LC notes never reach the rewrite |
| Race between migration and external sync (Obsidian Sync, iCloud, git) | DoS / data loss | `vault.process` is atomic — disk never observes a half-migrated state; backup provides rollback if external write lands during migration |
| Malformed v1.2 note triggers parser exception | DoS | Strict-match predicate's clauses 2-4 reject malformed shapes BEFORE the rewrite path runs |
| Stale `selfWriteSuppression` entry from an unrelated migration absorbs an external edit | Data loss | 2-second TTL on suppression entries (Phase 19 C-04 already in tree); modify-handler defensive-deletes on hash mismatch |
| Backup folder name collision (rapid back-to-back migrations on the same slug) | Data loss | ISO timestamp at second precision — collision requires two migrations within the same second on the same slug, which is statistically impossible (one note per session per opening) |
| `processFrontMatter` corrupts existing YAML when fill races with manual edit | Data loss | `processFrontMatter` is atomic per Obsidian's contract; re-check inside callback ensures race-safety |
| 30-day cleanup deletes a backup mid-restore | Data loss | TTL math is `now - parsed > 30d`; restore is a manual user action — they would be using the backup folder while the cleanup decides it's expired only on the 30th day mark |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/21-v1-2-migration/21-CONTEXT.md` — User decisions; locked carries L1–L9, D-trigger, D-auto, D-edge, D-backup, D-extract, D-emit, D-fixtures, D-plan
- `.planning/REQUIREMENTS.md` lines 81-93 + 187-196 — Phase 21 owns MIGRATE-01..MIGRATE-10 traceability
- `.planning/research/SUMMARY.md` — Q1–Q7 confirmed decisions; v1.3 architecture primitives
- `.planning/research/STACK.md` (lines 70-83 NPM verification, lines 126-145 `vault.process` semantics)
- `.planning/research/PITFALLS.md` — P7 (migration data loss) + P13 (idempotency) + P1 (self-write echo) + P2 (multi-pane) + P11 (frontmatter sync)
- `.planning/phases/19-widget-foundation-one-way-sync/19-CONTEXT.md` — Phase 19 C-01 (fence tag canonicalization), C-04 (self-write suppression), C-06 (vault-layer write discipline), C-10 (lc-slug gate)
- `.planning/phases/20-reconciliation-ux-action-row-section-protection/20-CONTEXT.md` — Phase 20 D-conflict, D-action, D-protect; verifies Phase 21's mount-time migration interacts cleanly with conflict modal
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3`) — Verified `Vault.process`, `Vault.adapter.write/list/rmdir/exists/mkdir` (lines 1918-2032), `FileManager.processFrontMatter`, `Plugin.addCommand` [VERIFIED: obsidian.d.ts]
- `src/widget/fenceLocator.ts:33-138` — `findCodeFence`, `extractFenceBody`, `computeFenceIndex`/`countLeetCodeSolveFenceOpeners` (verbatim reuse) [VERIFIED: in-tree source]
- `src/widget/fenceSerialization.ts:113-243` — `extractFenceBody`, `rewriteFenceBody`, `splitPreservingEols` (extension target for `rewriteFenceOpenerTag`) [VERIFIED: in-tree source]
- `src/solve/languages.ts:13-77` — `LC_LANG_SLUGS`, `FENCE_TAG_ALIASES`, `resolveLangSlug` [VERIFIED: in-tree source]
- `src/widget/selfWriteSuppression.ts:42,60` — `arm/tryConsume` shape (Phase 19 C-04) [VERIFIED: in-tree source]
- `tests/widget/fenceSerialization.property.test.ts` — Property-test corpus pattern for Plan 21-04 mirror [VERIFIED: in-tree test]

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` lines 175-202 — Phase 21 goal, success criteria, key risks (LOW for mechanics, MEDIUM for hand-edited edge cases)
- `.planning/STATE.md` lines 90-91 — Phase 21 risk note: hand-edited note edge cases need fixture coverage in CI (D-fixtures-01 addresses)
- v1.1 lazy-on-AC Techniques migration precedent (PROJECT.md Key Decisions) — direct precedent for Phase 21 lazy-on-open discipline; behavioral pattern referenced but not deeply audited

### Tertiary (LOW confidence)
- None. All claims in this research are verified against in-tree sources or Obsidian's typed API.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive verified against `obsidian@1.12.3` types + in-tree usage
- Architecture: HIGH — all five patterns reuse existing, property-tested in-tree code
- Pitfalls: HIGH (P1, P3, P4, P7, P11) / MEDIUM (P2 multi-pane intersection — beyond Phase 21 scope per L9, accepted)
- D-edge-03 empirical risk: MEDIUM — verified existence in tree (Phase 19 PHASE-SUMMARY documents the probe pattern); definitive answer requires Plan 21-01 dev-vault execution

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (30 days for stable Obsidian + CM6 versions; sooner if `obsidian@1.13.0+` ships breaking DataAdapter API changes — none expected per published roadmap)
