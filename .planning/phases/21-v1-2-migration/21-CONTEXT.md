# Phase 21: v1.2 Migration - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 delivers lazy-on-open atomic migration of v1.0/v1.1/v1.2 LeetCode notes from the legacy fence tag (`` ```python ``, `` ```java ``, `` ```cpp ``, etc. under `## Code`) to the v1.3 widget fence tag (`` ```leetcode-solve ``), with a per-note backup sidecar (30-day retention), idempotent re-open detection, a frontmatter `lc-language` floor (default-language fill if missing/empty), and CI fixtures across v1.0/v1.1/v1.2 sample notes — so Phase 22 can delete the v1.2 path with confidence that no user data is stranded.

In scope: 10 requirements (MIGRATE-01..MIGRATE-10). Migration runs **on file-open, before widget mount**, gated on `lc-slug` frontmatter + recognized-langSlug fence tag (strict-matching contract). Migration's only on-disk change is rewriting the fence opener `` ```<langSlug> `` → `` ```leetcode-solve `` plus (optionally, when `lc-language` is missing/empty) injecting `lc-language: <user default>`; **fence body and all other frontmatter are byte-identical to before**. A backup of the full pre-migration note is written to `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO-timestamp}/{slug}.md` BEFORE the rewrite. Backups older than 30 days auto-delete on plugin load (fire-and-forget microtask). New notes created in v1.3 emit `` ```leetcode-solve `` directly via `starterCodeInjector.ts` and `NoteTemplate.ts`. `codeExtractor.ts` is refactored (MIGRATE-09) to read language from `lc-language` frontmatter when the located fence is `leetcode-solve`, falling back to the existing fence-tag path for legacy/non-LC fences during the v1.3 transition window.

Out of scope (Phase 22): deletion of the v1.2 source files and `useNestedEditor` fork (DELETE-01..07), `useInlineWidget=ON` cutover (POLISH-01), `'leetcode.*'` userEvent removal (PROTECT-03), theme regression visual gate (THEME-05), reverse migration shipped to users (kept as dev-only command — recovery path is the backup sidecar). Out of scope (forever, this milestone): batch migration on plugin load, side-by-side dual-render during migration, hand-edit repair UX for malformed notes (skipped silently per strict-matching contract).

</domain>

<decisions>
## Implementation Decisions

### Carry-Forward (locked by REQUIREMENTS.md / Phase 19+20 CONTEXT — not re-litigated)

- **L1:** Canonical v1.3 fence tag = `` ```leetcode-solve ``; language metadata lives in `lc-language` frontmatter (PROJECT.md Key Decisions; REQUIREMENTS Q1; Phase 19 C-01).
- **L2:** Backup retention = 30 days (REQUIREMENTS Q6; MIGRATE-05).
- **L3:** Migration + first-edit are atomic — single `vault.process` callback; disk never observes a half-migrated state (REQUIREMENTS Q7; MIGRATE-07).
- **L4:** Idempotency contract — re-opening an already-migrated note is a no-op (MIGRATE-04). The `leetcode-solve` opener IS the migrated marker; presence of `countLeetCodeSolveFenceOpeners > 0` short-circuits.
- **L5:** Never call migration from `Plugin.onload()`. Lazy-on-first-open only. v1.1's lazy-on-AC Techniques migration is the precedent.
- **L6:** New notes emit `` ```leetcode-solve `` directly (MIGRATE-08). `codeBlockFor` in `src/notes/NoteTemplate.ts` and `starterCodeInjector.ts` both swap their emitter to the v1.3 opener.
- **L7:** Reverse migration (`unmigrateToLegacyFence`) kept in tree as a dev-only command, not shipped (ROADMAP Phase 21 §"Key risks/notes").
- **L8:** `vault.process` is the ONLY vault mutation primitive used by migration (CF-06 vault-layer write discipline).
- **L9:** Migration runs behind `useInlineWidget=ON` only. With `useInlineWidget=OFF` (the default through Phase 21), migration is a no-op — the v1.2 path still owns the user's notes. Phase 22 flips the default and deletes the gate.

### Trigger + Mount Lifecycle (D-trigger)

- **D-trigger-01:** Migration fires **on file-open, before widget mount**. The widget's mount lifecycle (Reading-mode `MarkdownPostProcessor` + Live-Preview `ViewPlugin`) consults the file's frontmatter + first-fence kind synchronously. When the file has `lc-slug` AND the first fence under `## Code` is a recognized-langSlug legacy fence (i.e., the strict-matching predicate from D-edge-01), migration runs via `vault.process` BEFORE the widget mounts. The widget then mounts on the freshly-rewritten `leetcode-solve` fence in the same render cycle. **Why:** "atomic with first edit" per Q7 is satisfied because migration IS the first edit — the user's first interaction with the note is already on the v1.3 fence. Eliminates "transitional state" bug surface (no widget mounted on a legacy fence; no interaction with the conflict modal during a half-migrated read). First-keystroke-debounced was rejected because the widget would have to handle "I'm sitting on a legacy fence" state for arbitrary time, and external-edit reconciliation (Phase 20 SYNC-04) becomes ill-defined for transitional state. **How to apply:** new `src/widget/fenceMigrator.ts` module exposes `migrateLegacyFenceIfNeeded(app, file)` returning `Promise<boolean>` (true if migration ran). Both mount paths (`codeBlockProcessor.ts` Reading-mode handler and `liveModeViewPlugin.ts` ViewPlugin) call `await migrateLegacyFenceIfNeeded(app, file)` in their pre-mount gate. The function self-gates on `useInlineWidget=ON` + `lc-slug` presence + strict-match predicate.

- **D-trigger-02:** Cost mitigation — first-open of a legacy note is ~10–50ms slower (synchronous backup write + `vault.process` rewrite). Subsequent opens see the `leetcode-solve` opener and short-circuit on the idempotency check. Acceptable per "lazy-on-AC Techniques migration" precedent (v1.1 had the same one-time cost). **Why:** the synchronous wait is part of the same render frame the user is already waiting on; no perceptible regression vs. v1.2 first-open. Async background migration was rejected because it creates a window where the widget mounts on the legacy fence and then re-mounts on the leetcode-solve fence (state loss, decoration thrash).

### Auto-Migrate Setting UX (D-auto)

- **D-auto-01:** Setting `autoMigrateOnOpen: boolean` defaults **ON** (MIGRATE-06). When ON, migration runs silently per D-trigger-01 — no Notice, no banner. **Why:** majority case (user wants their notes upgraded with no friction); silent matches v1.1 lazy-on-AC discipline. **How to apply:** new field in `SettingsStore.ts`; `migrateLegacyFenceIfNeeded` reads it and returns early when OFF.

- **D-auto-02:** When `autoMigrateOnOpen=OFF`: the widget mount path detects the legacy fence and renders a **persistent banner** above the (read-only legacy-display) fence with copy "This note uses the v1.2 format. [Migrate now]". The widget mounts in **read-only legacy display mode**: a `<pre><code>` rendering of the fence body using the existing `childEditorSemanticClasses` (for visual continuity), no atomicRanges, no debouncedWriter, no action row. Clicking [Migrate now] runs migration via `migrateLegacyFenceIfNeeded(app, file, { force: true })`, which on success unmounts the legacy display and the normal v1.3 widget mount path takes over. **Why:** discoverable + gives the user an off-ramp; matches the "user owns their vault" plugin-store guidance. Modal-on-first-open was rejected (modal fatigue when many legacy notes are opened back-to-back). Command-palette-only was rejected (banner is more discoverable for a one-time migration moment). **How to apply:** new `src/widget/legacyFenceBanner.ts` (~80 LOC) — a tiny component that renders the banner DOM and the read-only legacy display; mounted by both `codeBlockProcessor.ts` and `liveModeViewPlugin.ts` when `autoMigrateOnOpen=OFF` AND legacy fence detected.

- **D-auto-03:** Command palette entry `LeetCode: Migrate current note` is registered unconditionally (visible regardless of the `autoMigrateOnOpen` setting). Runs `migrateLegacyFenceIfNeeded(app, currentFile, { force: true })` for the active note's file. **Why:** keyboard-driven workflow + escape hatch when the banner is dismissed; cheap to register. **How to apply:** standard `Plugin.addCommand` registration in `src/main.ts:Plugin.onload()` behind `useInlineWidget=ON` gate.

### Edge Case Handling (D-edge)

- **D-edge-01:** **Strict matching.** Migration runs only when ALL of the following hold:
  1. Note has `lc-slug` frontmatter (gate from v1.0 Phase 5.5; same gate as v1.3 widget mount).
  2. `## Code` heading exists.
  3. First fence inside `## Code` (first `^\s*```<tag>` line scanning forward from the heading) has a recognized LC langSlug — i.e., `resolveLangSlug(tag, '__sentinel__') !== '__sentinel__'` AND the resolved value is in `LC_LANG_SLUGS`. Both base slugs (`python3`, `java`, `cpp`, `golang`, `rust`, `javascript`, `typescript`, `c`) and aliases (`python`, `go`, `c++`, `c#`, `cs`, `cs`, `kt`, `rb`, `rs`, `pg`, `sql`, `js`, `ts`, `py`, `py3`) qualify per `FENCE_TAG_ALIASES`.
  4. The fence has a closer (matching `^\s*```\s*$` somewhere before EOF or the next `## ` heading).
  5. The note does NOT already contain a `` ```leetcode-solve `` fence (idempotency — `countLeetCodeSolveFenceOpeners(text) === 0`).

  All other shapes — note without `## Code`, `## Code` heading with no fence, fence with unrecognized tag (`` ```pseudo ``, `` ```text ``, `` ```bash ``), fence with no closer, mixed-state notes (legacy AND `leetcode-solve` both present) — **skip migration silently**. No backup written for skipped notes. Logging is debug-level only (`logger.debug`); no Notice. **Why:** the strict-matching contract makes the migration provably scoped to "well-formed v1.2 plugin-owned notes" — no risk of rewriting user-authored example fences in `## Notes`, no risk of hijacking notes that aren't really LC notes (despite the `lc-slug` frontmatter present). The widget then mounts per its own contract (WIDGET-05 static `<pre><code>` fallback for non-LC fences; WIDGET-06 Python+Notice for missing `lc-language`). Permissive-rewrite-first-fence was rejected — risks rewriting non-code fences user added intentionally; user's own examples in their LC notes deserve preservation. Strict+repair was considered but Notice fatigue across many malformed notes is worse than silent skip + manual `LeetCode: Migrate current note` command. **How to apply:** the strict-match predicate is one helper `isMigrationCandidate(noteText, frontmatter): boolean` exported from `fenceMigrator.ts`. Reuses `findCodeFence` (already returns `kind: 'leetcode-solve' | 'legacy'`) + `LC_LANG_SLUGS` membership.

- **D-edge-02:** **Mixed-state notes** (note already has BOTH a legacy fence AND a `leetcode-solve` fence). Idempotency wins: `countLeetCodeSolveFenceOpeners > 0` short-circuits migration. The `leetcode-solve` fence is treated as the canonical plugin-owned fence; the legacy fence is treated as user content (left untouched, rendered as a normal code block by Obsidian). No backup. No Notice. Re-open is a no-op. **Why:** simplest correct semantic — the note is already migrated for plugin purposes; the legacy fence is now whatever the user chose to keep around. Multi-fence migration was rejected (risks overreaching into `## Notes` examples); modal-on-mixed-state was rejected (over-engineering an edge case the user can resolve manually).

- **D-edge-03:** **Missing `lc-language` frontmatter at migration time.** During the same atomic `vault.process` callback that rewrites the fence opener, **inject `lc-language: <user default>`** into frontmatter via `app.fileManager.processFrontMatter`. Default = `SettingsStore.getDefaultLanguage()`. **Why:** user-clarified rule — migration's job is to leave the note in a fully-canonical v1.3 state, including the v1.3 invariant that `lc-language` is the source of truth for Run/Submit. Skipping migration on missing-frontmatter (the strict reading of "don't touch frontmatter") was rejected: those notes are stranded — the v1.3 widget falls back to Python+Notice (WIDGET-06) and the user has to manually fix every note. Always-overwrite from fence-tag was rejected: clobbers existing `lc-language` set by the chevron, which is the wrong direction. **How to apply:** inside the `vault.process` callback, after `rewriteFenceBody` (or equivalent fence-opener swap), call `processFrontMatter` to fill `lc-language` only when missing/empty (`typeof fm['lc-language'] !== 'string' || fm['lc-language'] === ''`). The atomicity guarantee comes from Obsidian: `vault.process` and `processFrontMatter` queue serially per-file, and Phase 21 must verify empirically that the two writes land in the same render frame (Plan 21-01 dev-vault probe).

- **D-edge-04:** **Frontmatter is otherwise untouched.** Migration NEVER overwrites `lc-language`, `lc-slug`, `lc-status`, `lc-id`, `lc-title`, `lc-difficulty`, `lc-url`, `tags`, `aliases`, or any user-authored frontmatter key. The chevron + `applyFrontmatter` + `applySolveTimeFrontmatter` are the only writers for those fields. **Why:** v1.0–v1.2 already wrote canonical LC slugs into `lc-language` (`applyFrontmatter` line 295: `fm['lc-language'] = input.language`; `applySolveTimeFrontmatter` line 393: `fm['lc-language'] = input.language`). Migration touching the canonical value would be a regression risk. The fence tag is being *deleted*, not preserved as a fallback signal.

### Backup Sidecar (D-backup)

- **D-backup-01:** **Per-note folder shape:** `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO-timestamp}/{slug}.md`. The folder name carries both the slug AND the migration ISO timestamp; the file inside is named after the slug only. Example: `migration-backup-two-sum-2026-06-01T14-32-08Z/two-sum.md`. **Why:** parsing the timestamp out of the folder name is trivial (regex `migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$`); each note has at most one backup folder over its lifetime (idempotency means no second migration); easy 30-day cleanup (each folder is a single timestamp). Per-day was rejected (collisions when multiple migrations on the same day; less precise TTL); per-session was rejected (a session with no migrations leaves an empty folder; multi-session timestamps are confusing). **How to apply:** `fenceMigrator.ts` exports `writeBackup(app, file, slug, fileText): Promise<string>` returning the backup path. Uses `app.vault.adapter.write(...)` rather than `app.vault.create(...)` (the backup folder is plugin-internal, NOT a vault-visible file the user wants in their graph). The `:` in the ISO timestamp is replaced with `-` for cross-OS filesystem safety.

- **D-backup-02:** **One backup per note ever.** Re-opening a migrated note triggers the idempotency check (D-edge-02 / `countLeetCodeSolveFenceOpeners > 0`) and short-circuits before the backup writer runs. No second backup. No mtime touch. The 30-day TTL cleans up the original backup whether or not the user re-opens the note. **Why:** straight idempotency contract; matches MIGRATE-04. Refresh-mtime-on-open was rejected — defeats the 30-day cleanup intent (user keeps re-opening = backup never expires).

- **D-backup-03:** **30-day cleanup runs on plugin load, fire-and-forget.** `Plugin.onload()` queues a microtask via `Promise.resolve().then(...)` (NOT `setTimeout` — keeps it inside the same tick) that:
  1. Lists the contents of `.obsidian/plugins/obsidian-leetcode/` via `app.vault.adapter.list(...)`.
  2. Filters to entries matching `^migration-backup-.+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$`.
  3. Parses the ISO timestamp from the folder name.
  4. Compares `Date.now() - parsed > 30 * 24 * 60 * 60 * 1000`.
  5. Deletes expired folders via `app.vault.adapter.rmdir(folder, true)`.

  Cleanup runs unconditionally, even when `useInlineWidget=OFF` — backups exist on disk regardless of the current setting. **Why:** matches MIGRATE-05 spec; non-blocking (microtask doesn't delay plugin readiness or user interactions); same discipline as v1.1 ("never block plugin load"). Lazy-on-first-migration was rejected — accumulates if user has many sessions without opening a legacy note. Daily timer was rejected — adds a long-lived `setInterval` to the plugin lifecycle. **How to apply:** new `src/widget/migrationBackupGc.ts` (~60 LOC) called from `Plugin.onload()`. Errors during cleanup are debug-logged and swallowed (best-effort; MIGRATE-05 is non-critical).

### MIGRATE-09 codeExtractor Refactor (D-extract)

- **D-extract-01:** **`codeExtractor.ts` becomes frontmatter-aware.** Refactor `extractFirstFencedBlock(noteBody)` → `extractFirstFencedBlock(noteBody, frontmatter)` where `frontmatter` is `{ 'lc-language'?: string }`. Behavior:
  - When the located fence is `` ```leetcode-solve `` (kind detection via the existing `LC_OPENER_RE`), return `{ lang: frontmatter['lc-language'] ?? null, code: ... }`. Frontmatter is the source of truth.
  - When the located fence is a legacy LC-tagged fence (or any other tag), preserve the existing behavior verbatim — return `{ lang: fenceTag ?? null, code: ... }` and let the caller call `resolveLangSlug` as before.
  - When `lc-language` is missing/empty AND the fence is `leetcode-solve` (transitional state, e.g., user's `lc-language` was wiped manually), return `{ lang: null, code: ... }` and let the caller's `resolveLangSlug(null, defaultLang)` fallback handle it (same WIDGET-06-like Python+default discipline).

  **Why:** clean dual-path during the v1.3 transition window (legacy notes still need to Run/Submit until they migrate; once migrated, frontmatter wins). After Phase 22 deletes the legacy path, the legacy fence-tag branch becomes unreachable and can be deleted in Phase 22 cleanup. Stripping fence-tag dispatch entirely was rejected — breaks unmigrated notes' Run/Submit during the transition. Leaving codeExtractor alone was rejected — `resolveLangSlug('leetcode-solve', defaultLang)` falls back to defaultLang, which is wrong for any user whose default doesn't match their actual language. **How to apply:** add `frontmatter` arg to `extractFirstFencedBlock`; thread it through every consumer (`runWithCode`, `submitWithCode`, AI Debug code-fetch, AI Solution code-fetch, copyToCode, KnowledgeGraphWriter language-write). The frontmatter access pattern is already `app.metadataCache.getFileCache(file)?.frontmatter` — every consumer already has `file` in scope.

- **D-extract-02:** **codeExtractor is the ONLY codepath that reads language for Run/Submit.** Phase 21 must NOT introduce a parallel "read lc-language directly from `metadataCache`" shortcut in any consumer; all language-derivation goes through codeExtractor. **Why:** SSoT discipline; one place to delete in Phase 22. The plugin already has many ad-hoc `metadataCache.getFileCache(file)?.frontmatter?.['lc-language']` reads (per `grep`), but those are for chevron display + frontmatter writes, not for code-execution dispatch. Phase 21 is not a refactor of THOSE; only the `codeExtractor`-driven path is in scope.

### New Note Emission (D-emit)

- **D-emit-01:** **`codeBlockFor` in `src/notes/NoteTemplate.ts`** is split into two modes:
  - `codeBlockFor(langSlug, starter)` — legacy emitter, kept for backward-compat callers that still want a langSlug-tagged fence. Used by ZERO production paths after Phase 21 (verified by grep).
  - `codeBlockForV13(starter)` — new emitter that returns `` ```leetcode-solve\n<starter>\n``` ``. Called by the new-note creation path.

  Existing callers (`buildNoteBody`, `injectCodeSection`, `forceInjectCodeSection`) switch their call sites to `codeBlockForV13` once `useInlineWidget=ON`. **Why:** matches MIGRATE-08; preserves the legacy emitter for the transition window where `useInlineWidget=OFF` (still used during Phase 21 dev). After Phase 22 cutover, `codeBlockFor` is deleted and `codeBlockForV13` is renamed to `codeBlockFor`. **How to apply:** `useInlineWidget=ON` gate at the call sites: `useInlineWidget ? codeBlockForV13(starter) : codeBlockFor(langSlug, starter)`. The gate dies in Phase 22.

- **D-emit-02:** **`starterCodeInjector.forceInjectCodeSection`** already has the `fenceKind: 'leetcode-solve' | 'legacy'` arg (Phase 20 Plan 20-10 gap-closure). Phase 21 `useInlineWidget=ON` path always passes `fenceKind: 'leetcode-solve'` so the function takes the `rewriteFenceBody` short-circuit (lines 164-179). The `injectCodeSection` (non-force) helper gains the same `fenceKind` arg with the same dispatch. **Why:** the body-only-replace primitive already exists and is property-tested (`tests/widget/fenceSerialization.property.test.ts`); reuse rather than duplicate. **How to apply:** add `fenceKind` arg to `injectCodeSection` mirroring `forceInjectCodeSection`; call sites updated when they construct `InjectOptions`. No new `rewriteFenceBody` callers introduced — the existing one in `forceInjectCodeSection` covers both paths.

### CI Fixtures (D-fixtures)

- **D-fixtures-01:** **Three fixture sets** under `tests/fixtures/migration/{v1.0,v1.1,v1.2}/`:
  - **v1.0:** 3 hand-written sample notes covering: a Python `python3` fence note, a Java `java` fence note, a `cpp` fence note. Each is a minimal but realistic Phase 2/3 output (frontmatter + `## Problem` body + `## Code` fence + `## Notes`).
  - **v1.1:** 3 hand-written notes adding the v1.1 surfaces: one with `## Techniques` populated, one with `## AI Review` content, one with `## Related Variants`. Same fence-tag matrix.
  - **v1.2:** 4 hand-written notes covering Phase 5.3's lcSlugToFenceTag remaps (`python3 → python`, `golang → go`, `c → cpp`) plus a TypeScript fence. Includes one note with vim-mode artifacts (e.g., user-added trailing whitespace) to verify byte-exact body preservation.

  Each fixture has a paired `*.expected.md` showing the post-migration result. The test asserts byte-exact equality after running migration. **Why:** synthetic hand-written fixtures (a) avoid leaking real user notes into the repo, (b) give precise control over edge cases, (c) match the discipline of `tests/widget/fenceSerialization.property.test.ts` (corpus-driven). Real-vault capture was rejected — privacy, reproducibility, and CI portability concerns. Property tests round-tripping ARE included (D-fixtures-02) but the byte-exact fixture suite catches the integration glue that property tests don't (`processFrontMatter` + `vault.process` ordering).

- **D-fixtures-02:** **Property-test layer** in `tests/widget/migration.property.test.ts`. Generators emit synthetic v1.2 notes with: random LC langSlug, random `lc-language` value (canonical, missing, malformed), random body content (including nested triple-backticks per the existing `fenceSerialization.property.test.ts` corpus, CRLF mix, trailing whitespace). Invariants verified:
  - **Body preservation:** `extractFenceBody(migrated, 0) === preMigrationFenceBody`.
  - **Frontmatter preservation:** every `lc-*` key (other than `lc-language` when it was missing pre-migration) is byte-identical post-migration.
  - **Idempotency:** `migrate(migrate(note)) === migrate(note)`.
  - **Backup correctness:** `backupContents === preMigrationNoteText` byte-for-byte.

  **Why:** the byte-exact fixture suite is necessary but not sufficient — property tests catch the long tail of edge cases the hand-written fixtures miss. **How to apply:** reuse the `splitPreservingEols` / `rewriteFenceBody` test infrastructure already in `src/widget/fenceSerialization.ts`.

- **D-fixtures-03:** **CI gate.** Both fixture suites run on every PR; failure is a hard block. The fixture suite runs as `vitest --run tests/fixtures/migration/**` (or equivalent path). Backup-related fixtures use a `MockVault` shim (existing pattern in `tests/widget/`) since real `vault.adapter.write` requires Obsidian runtime. **Why:** MIGRATE-10 explicitly calls out CI fixtures as a release-candidate gate.

### Plan Structure (advisory — gsd-planner finalizes)

- **D-plan-01:** **Vertical-slice plan split.** Suggested 4 plans:
  - **Plan 21-01 — fenceMigrator core + strict-match predicate (Foundation).** New `src/widget/fenceMigrator.ts` with `migrateLegacyFenceIfNeeded(app, file, opts?)`, `isMigrationCandidate(text, frontmatter)`, `writeBackup(app, file, slug, text)`, the atomic `vault.process` + `processFrontMatter` pipeline. Property tests for `isMigrationCandidate` covering the 5-clause predicate + edge cases (no `## Code`, unrecognized tag, no closer, mixed state, missing `lc-slug`). Integration test for the `vault.process` + `processFrontMatter` ordering (D-edge-03 dev-vault probe). NOT yet wired into widget mount paths. Acceptance: `migrateLegacyFenceIfNeeded` is unit-testable in isolation; running it on a v1.2 fixture note rewrites the fence opener + injects missing `lc-language` + writes a backup, all atomically.
  - **Plan 21-02 — Mount integration + auto-migrate setting (UX).** Wire `migrateLegacyFenceIfNeeded` into `codeBlockProcessor.ts` (Reading) and `liveModeViewPlugin.ts` (Live Preview). New `autoMigrateOnOpen` setting in `SettingsStore.ts` (default ON). Auto-migrate path: silent. OFF path: render `legacyFenceBanner.ts` + read-only legacy display. Command palette entry `LeetCode: Migrate current note` registered. Acceptance: opening a v1.2 fixture note in dev vault with `autoMigrateOnOpen=ON` rewrites the fence + mounts the v1.3 widget on the rewritten fence in a single render frame; toggling OFF surfaces the banner; clicking [Migrate now] runs migration and remounts.
  - **Plan 21-03 — codeExtractor + new-note emission (MIGRATE-08, MIGRATE-09).** Refactor `extractFirstFencedBlock` to take `frontmatter` arg with the dual-path dispatch; thread frontmatter through every consumer (`runWithCode`, `submitWithCode`, AI Debug code-fetch, AI Solution code-fetch, copyToCode, KnowledgeGraphWriter). Add `codeBlockForV13` to `NoteTemplate.ts`; add `fenceKind` arg to `injectCodeSection` mirroring `forceInjectCodeSection`; gate `useInlineWidget=ON` paths to emit `leetcode-solve`. Acceptance: with `useInlineWidget=ON`, creating a new note via problem-open emits `` ```leetcode-solve `` directly; running a freshly-migrated note's code uses `lc-language` frontmatter (not the deleted fence tag) for the LC API call.
  - **Plan 21-04 — Backup GC + CI fixtures + property-test corpus (Polish + Release Gate).** New `src/widget/migrationBackupGc.ts` 30-day cleanup wired into `Plugin.onload()`. Three fixture sets (`tests/fixtures/migration/{v1.0,v1.1,v1.2}/`) + property-test layer (`tests/widget/migration.property.test.ts`). CI gate verified. Acceptance: cleanup runs without blocking plugin load; fixture suite passes byte-exactly; property tests pass over 100+ generated cases.

- **D-plan-02:** **Plan order = sequential (foundation → UX → SSoT refactor → polish).** Each plan is a dogfood checkpoint. 21-01 lets the migrator be exercised in isolation. 21-02 gives the user-visible UX. 21-03 closes the language-derivation invariant. 21-04 hardens the release gate. Parallel ordering rejected — 21-02 and 21-03 both touch `src/main.ts:Plugin.onload()`; sequential prevents merge friction.

### Claude's Discretion

- **`vault.process` + `processFrontMatter` empirical ordering.** Plan 21-01 must verify in the dev vault whether the two writes land in the same render frame, or whether `processFrontMatter` queues a second `vault.on('modify')` event the widget's selfWriteSuppression must absorb. Parallel suppression-arm pattern (Phase 19 C-04 hash map) is the fallback if needed. Same probe shape as Phase 20 D-Claude-discretion §"`processFrontMatter` ↔ `vault.on('modify')` ordering probe".
- **Backup write primitive choice:** `app.vault.adapter.write` (raw filesystem) vs. `app.vault.createBinary` (vault-visible). Recommendation: `adapter.write` to keep backups out of the user's graph. Planner finalizes if Obsidian's adapter API has friction (e.g., needs leading `/`, paths normalized via `normalizePath`).
- **Legacy banner styling:** copy reuses Obsidian's `.notice-warning` / `.callout-warning` classes for visual consistency. Planner picks between fixed-position above the editor body vs. inline within the Reading-mode container; Live Preview banner placement is the harder case.
- **Read-only legacy display fidelity:** the legacy display in `legacyFenceBanner.ts` doesn't need full v1.2 fidelity (no language switching, no Run/Submit); a static `<pre><code class="language-{tag}">` is sufficient. If syntax highlighting is desired, the existing `childEditorSemanticClasses` ViewPlugin can be reused but it's overkill for a read-only legacy view. Planner decides.
- **Fixture seed data:** real LC problem slugs (two-sum, add-two-numbers, etc.) for realism vs. synthetic slugs (test-problem-1) for portability. Recommendation: synthetic slugs in fixtures to avoid implying we're storing real LC data.
- **`useInlineWidget=OFF` migration behavior:** L9 says migration is a no-op when OFF, but the BACKUP cleanup still runs on plugin load (D-backup-03). Planner verifies this is the right trade-off — backups from a prior `useInlineWidget=ON` session shouldn't disappear if the user toggles OFF for testing.
- **Reverse migration command exposure:** dev-only via `process.env.NODE_ENV === 'development'` gate, or always-registered with a clear "Dev only — do not use" Notice. Recommendation: always-register + Notice. Planner finalizes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 21 Direct Foundation
- `.planning/phases/19-widget-foundation-one-way-sync/19-CONTEXT.md` — Phase 19 implementation decisions C-01..C-17 + D-01..D-10. Phase 21 inherits the fence-tag canonicalization (C-01), `vault.process` write discipline (C-04/C-06), and `lc-slug` gating (C-10).
- `.planning/phases/20-reconciliation-ux-action-row-section-protection/20-CONTEXT.md` — Phase 20 D-protect, D-action, D-conflict decisions. Phase 21's mount-time migration interacts with the conflict modal (Phase 20 SYNC-04/05) — confirm: migration's `vault.process` write self-suppresses via the existing hash-map pattern.

### v1.3 Research (foundation)
- `.planning/research/SUMMARY.md` — Q1–Q7 confirmed decisions; migration strategy notes.
- `.planning/research/STACK.md` — `app.vault.process`, `app.fileManager.processFrontMatter`, `app.vault.adapter.write/list/rmdir` API surfaces.
- `.planning/research/PITFALLS.md` — Especially **P7 (lazy-on-AC discipline; never batch-rewrite)** and **P13 (idempotency)**.

### Project / Milestone State
- `.planning/PROJECT.md` — Key Decisions table; v1.1 lazy-on-AC Techniques migration is the precedent for Phase 21's discipline.
- `.planning/REQUIREMENTS.md` — v1.3 requirements; Phase 21 owns MIGRATE-01..MIGRATE-10 (line 187-196 traceability).
- `.planning/ROADMAP.md` §"Phase 21: v1.2 Migration" (lines 175-202) — Goal, success criteria, key risks/notes (LOW for mechanics, MEDIUM for hand-edited edge cases).
- `.planning/STATE.md` lines 90-91 — Phase 21 risk note: "hand-edited note edge cases (extra blank lines, malformed frontmatter, missing `## Code` heading) need fixture coverage in CI" — addressed by D-fixtures-01.

### v1.2/v1.3 Code Files (touch points)
- `src/widget/fenceLocator.ts` — **Reuse verbatim.** `findCodeFence(state, opts)` returns `kind: 'leetcode-solve' | 'legacy'`; `computeFenceIndex` / `countLeetCodeSolveFenceOpeners` for idempotency check.
- `src/widget/fenceSerialization.ts` — **Reuse verbatim.** `rewriteFenceBody` for body-preserving fence-opener swap. CRLF-tolerant via `splitPreservingEols`. Property-tested at `tests/widget/fenceSerialization.property.test.ts`.
- `src/solve/languages.ts` — `LC_LANG_SLUGS`, `FENCE_TAG_ALIASES`, `resolveLangSlug`, `lcSlugToFenceTag`. Phase 21 strict-match predicate uses these directly.
- `src/solve/codeExtractor.ts` — **Refactor (MIGRATE-09).** Add `frontmatter` arg; dual-path dispatch on fence kind.
- `src/solve/starterCodeInjector.ts` — **Extend.** `fenceKind` arg already on `forceInjectCodeSection`; mirror to `injectCodeSection`. v1.3 path takes the `rewriteFenceBody` short-circuit at line 164-179.
- `src/notes/NoteTemplate.ts` — **Extend (MIGRATE-08).** Add `codeBlockForV13` emitter; gate call sites on `useInlineWidget=ON`.
- `src/widget/codeBlockProcessor.ts` — **Modify (Plan 21-02).** Pre-mount migration call. Read-mode banner mount when `autoMigrateOnOpen=OFF`.
- `src/widget/liveModeViewPlugin.ts` — **Modify (Plan 21-02).** Same pre-mount migration call for Live Preview.
- `src/widget/WidgetController.ts` — Reads via `widget.childView.state.doc.toString()` (Phase 20 ACTION-04); no changes for Phase 21.
- `src/main.ts` — **Modify.** Add command palette entry `LeetCode: Migrate current note`. Add `migrationBackupGc` invocation in `Plugin.onload()`. Update settings UI integration for `autoMigrateOnOpen` toggle.
- `src/settings/SettingsStore.ts` — **Modify.** Add `autoMigrateOnOpen: boolean` field (default `true`).
- `src/settings/SettingsTab.ts` — **Modify.** Add toggle UI for `autoMigrateOnOpen` (recommend Experimental subsection or main migration subsection — planner decides).

### New Plan-Specific Files (proposed — planner finalizes)
- `src/widget/fenceMigrator.ts` (NEW, ~250 LOC) — Plan 21-01 core. `migrateLegacyFenceIfNeeded`, `isMigrationCandidate`, `writeBackup`.
- `src/widget/legacyFenceBanner.ts` (NEW, ~80 LOC) — Plan 21-02. Banner DOM + read-only legacy display.
- `src/widget/migrationBackupGc.ts` (NEW, ~60 LOC) — Plan 21-04. 30-day cleanup microtask.
- `tests/widget/fenceMigrator.test.ts` (NEW) — Plan 21-01 unit + integration.
- `tests/widget/migration.property.test.ts` (NEW) — Plan 21-04. Property-test layer.
- `tests/fixtures/migration/v1.0/` (NEW, 3 notes + 3 expected) — Plan 21-04.
- `tests/fixtures/migration/v1.1/` (NEW, 3 notes + 3 expected) — Plan 21-04.
- `tests/fixtures/migration/v1.2/` (NEW, 4 notes + 4 expected) — Plan 21-04.

### Obsidian / CodeMirror Reference
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3`) — Especially `Vault.process`, `Vault.adapter.write/list/rmdir/exists`, `FileManager.processFrontMatter`, `Plugin.addCommand`, `MetadataCache.getFileCache`.
- v1.1 Phase 12 / Phase 11 lazy-on-AC migration code (search `src/graph/mergeTechniquesSection.ts` history) — precedent pattern for "never batch on plugin load".

### CLAUDE.md Conventions (status update)
- `CLAUDE.md` §"Conventions" — `'leetcode.*'` userEvent paragraph and "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph **remain in CLAUDE.md through Phase 21**. Phase 21 plans MUST NOT delete or modify these. Phase 22 (DELETE-08, PROTECT-03) removes them.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (verbatim or light-modify)
- `src/widget/fenceLocator.ts:findCodeFence` — Returns `kind: 'leetcode-solve' | 'legacy'` directly; the strict-match predicate consumes this without re-implementing fence detection.
- `src/widget/fenceLocator.ts:countLeetCodeSolveFenceOpeners` — Idempotency gate (count > 0 ⇒ skip migration).
- `src/widget/fenceSerialization.ts:rewriteFenceBody` — Body-preserving fence-opener swap. The migration uses this primitive — but with a twist: rewriteFenceBody currently rewrites the body of an existing `leetcode-solve` fence; for migration we need a sibling primitive `rewriteFenceOpenerTag(noteText, fenceLineIdx, newTag)` that preserves body byte-exactly while swapping the opener line. **Decision for planner:** either (a) extend `rewriteFenceBody` with an `openerTag?: string` parameter (recommended — keeps SSoT in one file with the property-test corpus), or (b) add a new `rewriteFenceOpenerTag` function in the same file. Either way, no new files.
- `src/solve/languages.ts` — `LC_LANG_SLUGS`, `FENCE_TAG_ALIASES`, `resolveLangSlug` are the strict-match predicate's vocabulary.
- `app.vault.process(file, fn)` + `app.fileManager.processFrontMatter(file, fn)` — Two atomic primitives; D-edge-03 sequences them within a single render frame (empirical probe in Plan 21-01).
- `app.vault.adapter.write/list/rmdir` — Plugin-internal filesystem access for backup writes + cleanup. The backup folder lives outside the vault tree (`.obsidian/plugins/obsidian-leetcode/`), so `adapter.*` is the correct primitive (NOT `vault.create`).
- `Plugin.addCommand` — Command palette entry registration, gated on `useInlineWidget=ON`.

### Established Patterns
- **Lazy-on-trigger migration** (v1.1 Phase 11/12 Techniques migration): never batch on plugin load; trigger on user-touch (open / AC / first edit). Phase 21 mirrors this — migration triggers on file-open, not on plugin load.
- **`vault.process` write discipline** (v1.0/v1.1/v1.2/v1.3 SSoT): all plugin fence-body writes go through `vault.process(file, fn)`. Phase 21's atomic write also goes through this primitive.
- **`processFrontMatter` for atomic frontmatter changes** (v1.1, v1.2): `app.fileManager.processFrontMatter(file, (fm) => { ... })`. Phase 21 D-edge-03 pairs this with `vault.process` for the `lc-language` fill case.
- **`registerEvent()` for plugin lifecycle cleanup** — Phase 21 doesn't register any new event handlers; the migration call is fired imperatively from the widget mount path, no listener registration needed.
- **Property-test corpus discipline** (Phase 19-04): `tests/widget/fenceSerialization.property.test.ts` is the model for `tests/widget/migration.property.test.ts`. Same generator infrastructure (`splitPreservingEols`, CRLF mix, nested triple-backticks).
- **Settings UI gating** (Phase 19 D-08, D-05): `useInlineWidget=ON` is the master gate; `autoMigrateOnOpen` is a child setting that's only consulted when the master is ON.

### Integration Points
- `src/main.ts:Plugin.onload()` — Plan 21-02 adds command palette entry; Plan 21-04 wires `migrationBackupGc` microtask. Both behind `useInlineWidget=ON` gate.
- `src/widget/codeBlockProcessor.ts` (Reading mode) — Plan 21-02 pre-mount migration call.
- `src/widget/liveModeViewPlugin.ts` (Live Preview) — Plan 21-02 pre-mount migration call (same `migrateLegacyFenceIfNeeded` call as Reading mode; the migration is mode-agnostic).
- `src/solve/codeExtractor.ts` — Plan 21-03 refactors signature to take `frontmatter` arg; threads through every consumer in `src/solve/`, `src/ai/`, `src/graph/`.
- `src/notes/NoteTemplate.ts:codeBlockFor` — Plan 21-03 adds v1.3 emitter; gates the call sites in `injectCodeSection`, `forceInjectCodeSection`, `buildNoteBody`.
- `src/settings/SettingsStore.ts` + `SettingsTab.ts` — Plan 21-02 adds `autoMigrateOnOpen` field + UI toggle.
- `tests/widget/` — Plans 21-01 and 21-04 add new test files mirroring `src/widget/fenceMigrator.ts` and `migrationBackupGc.ts`.
- `tests/fixtures/migration/` — Plan 21-04 NEW directory with three subfolders.

</code_context>

<specifics>
## Specific Ideas

- **Strict-matching is the safety bet.** The five-clause predicate (D-edge-01) means migration runs only on notes the plugin authoritatively owns. Permissive variants (rewrite first fence regardless of tag, or rewrite all fences under `## Code`) save ~5 LOC and create a class of "user content was clobbered" bug reports that this plugin has avoided across v1.0–v1.2 by similar discipline.
- **The reverse-mapping question dissolved.** User-clarified: `lc-language` is already canonical on every v1.0/v1.1/v1.2 note (`applyFrontmatter` and the chevron both write LC's canonical slug). Migration doesn't reverse-map fence tags — it preserves frontmatter as-is and only fills `lc-language` when missing/empty. Run/Submit dispatches via the (refactored MIGRATE-09) `codeExtractor` which reads frontmatter post-migration.
- **`vault.process` + `processFrontMatter` ordering is the only empirical risk.** Everything else in Phase 21 reuses primitives that are already tested in Phase 19's corpus or v1.0/v1.1's lazy-migration patterns. The single new question is: do the two atomic writes land in the same render frame? Plan 21-01 dev-vault probe answers this; the fallback (selfWriteSuppression hash-arm pattern from Phase 19 C-04) is already in tree.
- **Banner over modal for the manual-mode UX.** The user has many LC notes. A modal-on-first-open per-note becomes modal fatigue immediately. A banner is non-blocking, dismissible by [Migrate now], and stays out of the keyboard flow (command palette is the keyboard alternative). Matches the "user owns their vault" philosophy.
- **Fixtures over real-vault capture.** Synthetic slugs (e.g., `test-problem-1`), hand-written body content, deliberate edge cases (extra blank lines, malformed frontmatter, mixed line endings). Captures the long tail without bringing user data into the repo. Property-test layer fills the rest.
- **D-trigger-01's "atomic with first edit" framing.** Migration IS the first edit. The user opens the note, migration fires synchronously inside the file-open path, the widget mounts on the post-migration state. There is no transitional state visible to the user — except in `autoMigrateOnOpen=OFF` mode where the banner explicitly signals "this note is in transition until you click [Migrate now]".
- **Phase 22 cleanup is mechanical because of how Phase 21 builds.** `useInlineWidget=ON` gates die. `codeBlockFor` legacy is deleted; `codeBlockForV13` is renamed to `codeBlockFor`. `extractFirstFencedBlock`'s legacy fence-tag branch is deleted. `injectCodeSection`'s `fenceKind` branch is reduced to the v1.3 path. The migrator + backup GC + banner stay (still useful for users who haven't opened every note before Phase 22 cutover).

</specifics>

<deferred>
## Deferred Ideas

- **Repair UX for malformed v1.2 notes** (no `## Code` heading, missing closer, mid-state). Strict-matching skips them silently. If demand surfaces, add a `LeetCode: Repair migration for current note` command palette entry — Phase 22+ polish.
- **Multi-fence migration** (rewrite all legacy LC-tagged fences under `## Code`). Skipped per D-edge-01 / D-edge-02. If a user reports it as a feature request, it can land as a separate command — not in scope for the core lazy-on-open path.
- **Reverse-migration shipping** (revert `leetcode-solve` → langSlug fences). Kept as dev-only command per L7. If users need a "rollback" path post-Phase-22 cutover, the backup sidecar IS the rollback path (manual paste-back).
- **Telemetry / metrics on migration count** — non-negotiable per PROJECT.md "no telemetry by default" rule.
- **Settings UI for backup retention period** — locked at 30 days per Q6. If user demand surfaces, surface as a settings field; for now hard-coded.
- **Pre-flight migration audit** ("show me how many notes will migrate"). Useful for power users with thousands of LC notes; not core. Defer.
- **Migration progress notification** when many legacy notes are opened in quick succession (dev workflow opening many notes via search). The lazy-per-open model means each migration is one user-action; no "running 50 migrations" surface to indicate.
- **VIM-03 reload-on-toggle banner** — Phase 22, only if Phase 20 vim live-reconfigure proved unreliable.
- **DELETE-01..08 + POLISH-01 + PROTECT-03 + THEME-05** — Phase 22.

</deferred>

---

*Phase: 21-v1.2 Migration*
*Context gathered: 2026-06-01*
