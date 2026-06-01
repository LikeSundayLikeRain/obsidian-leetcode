# Phase 21: v1.2 Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 21-v1.2 Migration
**Areas discussed:** Trigger + Auto UX, Edge cases, lc-language derivation, Backup + cleanup mechanics, MIGRATE-09 codeExtractor refactor

---

## Trigger + Auto UX

### Q1: When does migration actually fire on a v1.2 note?

| Option | Description | Selected |
|--------|-------------|----------|
| On file-open, before widget mount | Migration runs via `vault.process` BEFORE the widget mounts. Widget then mounts on the freshly-rewritten `leetcode-solve` fence. "Atomic with first edit" = atomic with the act of opening. ~10–50ms slower first open; idempotent on re-open. | ✓ |
| On first keystroke (debounced flush) | Widget mounts on legacy fence in transitional read-only mode; first keystroke arms the writer to rewrite opener + body atomically. Truly atomic with user edit but creates ill-defined transitional state for conflict modal. | |
| On widget mount (synchronous prelude) | Widget mount runs migration synchronously then mounts. Per-fence granular; supports embeds. | |

**User's choice:** On file-open, before widget mount.
**Notes:** Eliminates transitional state bug surface; matches the "atomic with first edit" framing because the first edit IS migration. Widget never has to render on a half-migrated fence.

### Q2: When auto-migrate setting is OFF, how does the user trigger migration?

| Option | Description | Selected |
|--------|-------------|----------|
| Banner above widget + command palette | Persistent banner above read-only legacy display; click [Migrate now] to migrate. Plus command palette entry. | ✓ |
| Command palette only | No banner; user runs the command from palette. | |
| Modal on first open | Modal asking "Migrate now? Yes / Not now / Don't ask again." | |

**User's choice:** Banner above widget + command palette.
**Notes:** Modal-on-first-open creates fatigue when user has many legacy notes. Banner is non-blocking and discoverable; command palette is the keyboard alternative.

---

## Edge Cases

### Q3: How does migration handle structural edge cases on lc-slug notes?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict — migrate only well-formed v1.2 notes | Migration runs only when `## Code` exists, first fence has recognized LC langSlug, fence has closer. All other shapes skipped silently. Backup NOT written for skipped notes. | ✓ |
| Permissive — migrate first fence regardless of tag | Rewrites first fence regardless of tag; risks rewriting non-code fences user added intentionally. | |
| Strict + repair Notice | Strict matching plus one-time Notice on repairable cases. Auto-mode skips; manual mode allows repair. | |

**User's choice:** Strict matching.
**Notes:** Provably scoped to plugin-owned notes; eliminates "user content was clobbered" bug class.

### Q4: When a note already has BOTH a legacy fence AND a leetcode-solve fence (mixed/mid-state), what happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip migration, leave as-is | `countLeetCodeSolveFenceOpeners > 0` short-circuits. Legacy fence treated as user content. Idempotent re-open. | ✓ |
| Migrate the legacy fence too (multi-fence) | Rewrite ALL legacy LC-tagged fences. Risks rewriting user examples. | |
| Notice + manual repair only | Skip auto + surface Notice. | |

**User's choice:** Skip migration; idempotent.
**Notes:** Aligns with MIGRATE-04 idempotency contract; legacy fence is now whatever the user chose to keep around.

---

## lc-language Derivation

### Q5 (initial framing — clarified by user, not selected):

> User clarified: `lc-language` is already canonical on every v1.0/v1.1/v1.2 note (`applyFrontmatter` + chevron always write the LC canonical slug like `python3`, `golang`, `cpp`). Migration MUST NOT touch `lc-language`. Reverse-mapping fence tag → slug is therefore not needed for the canonical case.
>
> Original Q5 ("which canonical form for reverse-mapping?") and Q6 ("if lc-language already exists, keep or overwrite?") collapse into a single principle: **migration never touches `lc-language` when it's already set**. Frontmatter is sacred; only the fence opener is rewritten.

### Q6: If lc-language frontmatter is missing/empty when migrating a legacy note, what does migration do?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip migration — treat as malformed | Strict matching: missing `lc-language` means not well-formed. Backup NOT written. User fixes manually. | |
| Derive lc-language from fence tag as last-resort fill | Derive via `resolveLangSlug(fenceTag, defaultLanguage)` and write into frontmatter atomically. | |
| Migrate fence anyway; let widget Python-fallback handle it | Rewrite opener regardless; widget WIDGET-06 falls back to Python with Notice. | |
| **User-clarified:** Inject default language | Inject `lc-language: <user default from SettingsStore>` as part of the same atomic `vault.process`. | ✓ |

**User's choice:** "it should just inject a new lc-languag with default language"
**Notes:** Captured in D-edge-03. Migration's goal is to leave the note in fully-canonical v1.3 state — including the v1.3 invariant that `lc-language` is the source of truth.

---

## Backup + Cleanup Mechanics

### Q7: How is the {timestamp} folder scoped in `migration-backup-{timestamp}/{slug}.md`?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-note (one folder per note ever) | Folder = `migration-backup-{slug}-{ISO-timestamp}/`; one backup per note ever (idempotency means no second migration). | ✓ |
| Per-day | Folder = `migration-backup-{YYYY-MM-DD}/{slug}.md`; all migrations same day share folder. | |
| Per-session (plugin load) | One folder per plugin-load session. | |

**User's choice:** Per-note (one folder per note ever).
**Notes:** Easy mental model; easy 30-day cleanup (each folder is a single timestamp).

### Q8: When does the 30-day cleanup of old backups actually run?

| Option | Description | Selected |
|--------|-------------|----------|
| On plugin load, fire-and-forget | Microtask queued in `Plugin.onload()`. Non-blocking. | ✓ |
| Lazy on first migration | Cleanup runs only when a new migration is about to write a backup. | |
| Daily timer | `setInterval` 24h. | |

**User's choice:** On plugin load, fire-and-forget.
**Notes:** Same discipline as v1.1 ("never block plugin load"); microtask doesn't delay readiness.

### Q9: If the user re-opens a note that has already been migrated (and the backup still exists), do we touch the backup?

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent skip — backup untouched | Re-open detects `leetcode-solve` fence; skip migration entirely. Backup stays until 30-day TTL expires. | ✓ |
| Refresh backup timestamp on every open | Touch backup folder mtime to extend TTL. Defeats 30-day cleanup intent. | |

**User's choice:** Idempotent skip.
**Notes:** Aligns with MIGRATE-04 idempotency contract.

---

## MIGRATE-09 codeExtractor Refactor

### Q10: How does codeExtractor read language post-migration?

| Option | Description | Selected |
|--------|-------------|----------|
| Frontmatter is the source of truth; fence tag ignored when leetcode-solve | Refactor `extractFirstFencedBlock` to take `frontmatter` arg with dual-path dispatch on fence kind. Legacy path preserved during transition window. | ✓ |
| Strip fence-tag dispatch entirely | Delete the fence-tag branch; require lc-language frontmatter on every read. Breaks unmigrated notes' Run/Submit during Phase 21. | |
| Leave codeExtractor alone; let chevron drive | Wrong behavior: `resolveLangSlug('leetcode-solve', defaultLang)` falls back to defaultLang. | |

**User's choice:** Frontmatter is the source of truth; dual-path during transition.
**Notes:** Captured in D-extract-01. Phase 22 cleanup deletes the legacy-fence branch mechanically.

---

## Claude's Discretion

The following items were left to Claude / planner judgment (documented in CONTEXT.md `### Claude's Discretion`):

- **`vault.process` + `processFrontMatter` empirical ordering** — Plan 21-01 dev-vault probe; selfWriteSuppression hash-arm fallback if needed.
- **Backup write primitive** — `app.vault.adapter.write` vs `app.vault.createBinary`. Recommended `adapter.write` to keep backups out of the user's graph.
- **Legacy banner styling** — Reuse Obsidian's `.notice-warning` / `.callout-warning` classes; placement (fixed-position vs. inline) is planner's call.
- **Read-only legacy display fidelity** — Static `<pre><code class="language-{tag}">` likely sufficient; full v1.2 fidelity not required.
- **Fixture seed data** — Synthetic slugs (e.g., `test-problem-1`) recommended over real LC slugs.
- **`useInlineWidget=OFF` migration behavior** — Migration is a no-op when OFF (L9); backup cleanup still runs unconditionally on plugin load.
- **Reverse migration command exposure** — Recommended always-register + Notice "Dev only — do not use".

## Deferred Ideas

(Captured in CONTEXT.md `<deferred>` section.)

- Repair UX for malformed v1.2 notes — Phase 22+ polish.
- Multi-fence migration (rewrite all legacy LC-tagged fences) — separate command if user demand surfaces.
- Reverse-migration shipped to users — kept as dev-only command.
- Telemetry / metrics on migration count — non-negotiable "no telemetry" rule.
- Settings UI for backup retention period — locked at 30 days.
- Pre-flight migration audit — power-user feature, defer.
- Migration progress notification — not needed (lazy-per-open model is one user-action per migration).
- VIM-03 reload-on-toggle banner — Phase 22.
- DELETE-01..08 + POLISH-01..06 + PROTECT-03 + THEME-05 — Phase 22.
