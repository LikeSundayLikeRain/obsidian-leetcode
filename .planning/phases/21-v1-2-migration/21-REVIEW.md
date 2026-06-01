---
phase: 21-v1-2-migration
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/widget/fenceMigrator.ts
  - src/widget/fenceSerialization.ts
  - src/widget/legacyFenceBanner.ts
  - src/widget/codeBlockProcessor.ts
  - src/widget/liveModeViewPlugin.ts
  - src/widget/migrationBackupGc.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - src/solve/codeExtractor.ts
  - src/solve/starterCodeInjector.ts
  - src/solve/submissionOrchestrator.ts
  - src/notes/NoteTemplate.ts
  - src/notes/NoteWriter.ts
  - src/contest/ContestFinalizer.ts
  - src/graph/KnowledgeGraphWriter.ts
  - src/main.ts
findings:
  critical: 4
  warning: 9
  info: 4
  total: 17
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-06-01
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 21 implements v1.2 → v1.3 lazy-on-open fence migration. The change set is substantial: a new pure migrator (`fenceMigrator.ts`), a banner DOM module (`legacyFenceBanner.ts`), a fire-and-forget GC sweep (`migrationBackupGc.ts`), three-branch dispatch in `codeExtractor`, and threading of `frontmatter` arg + `useInlineWidget` gate through 6 consumer call sites.

The body byte-exactness pipeline (rewriteFenceOpenerTag + splitPreservingEols) appears solid and is property-tested. The settings shape-guards continue the project's strict-equality posture. However, several real defects exist:

- **Reading-mode entry point gap (BLOCKER):** `registerMarkdownCodeBlockProcessor('leetcode-solve', …)` only fires for `leetcode-solve` fences. Legacy v1.2 notes (with `\`\`\`python` etc.) opened in Reading mode never invoke `migrateLegacyFenceIfNeeded` because the registered handler is for the post-migration tag. There is no Reading-mode migration trigger; only Live Preview's view plugin detects `kind === 'legacy'`. This contradicts the comment in the codeBlockProcessor pre-mount-gate header ("Reading-mode handler awaits migrateLegacyFenceIfNeeded BEFORE constructing the widget") and leaves Reading-mode v1.2 users with no migration unless they switch panes.
- **Backup atomicity gap (BLOCKER):** `migrateLegacyFenceIfNeeded` calls `writeBackup` then `vault.process`. If `vault.process` throws AFTER the backup succeeds but BEFORE/DURING the body rewrite, the next file-open re-runs the orchestrator and writes a SECOND backup folder (different ISO suffix). D-backup-02 says "one backup per note ever" — this guarantee is violated on retry after partial failure.
- **`legacyFenceBanner.ts` `manual-prompt` branch missing host empty-before-render (BLOCKER):** the function calls `empty(host)` once at top, then `mk(host, 'div', …)` to add the banner, then `renderReadOnly(host, source)` which DOES NOT empty `host` again. So the banner div + `<pre><code>` source are siblings — fine. BUT: `renderReadOnly` reads `(host as { createEl?: … }).createEl`. After the createEl exists, it calls `ce.call(host, 'pre')` then `(pre).createEl('code', …)`. If host has `createEl` but the returned `pre` instance is a happy-dom or non-Obsidian element without `createEl`, the chained call throws — and the unhandled exception inside the post-processor surfaces in the user's notes pane.
- **Backup GC `BACKUP_FOLDER_RE` is greedy (BLOCKER):** `^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$`. The `(.+)` is greedy. If a future folder shape adds a literal `-2026-...` suffix to a non-backup folder, it could match. More immediately — this regex captures group 1 = slug. Slugs in the wild may contain `-2026-…-style` substrings (e.g., a slug `foo-2026-01-01T12-34-56Zsomething`), but realistic LC slugs are kebab-case alphanumerics, so this is mostly theoretical. The deeper concern: `Date.parse(parseSanitizedIso('YYYY-MM-DDTHH-MM-SSZ'))` — the regex `T(\d{2})-(\d{2})-(\d{2})Z$` succeeds for any matching tail; if a slug ends in a substring matching the full regex's group 2 capture (e.g., a malicious or accidentally-named folder), TTL math could delete the folder.

In addition there are 9 warnings and 4 info items — most concerning the silent-failure posture, race-stale frontmatter reads, and module-level state that persists across plugin reloads.

## Critical Issues

### CR-01: Reading mode never invokes migration trigger for legacy v1.2 notes

**File:** `src/widget/codeBlockProcessor.ts:95-194`, `src/main.ts:1042` (`registerMarkdownCodeBlockProcessor('leetcode-solve', …)`)
**Issue:** The migration-gate code in `codeBlockProcessor.ts:142-194` runs inside the handler registered for the `leetcode-solve` fence tag. Legacy v1.2 notes carry `\`\`\`python`, `\`\`\`java`, etc. — NOT `\`\`\`leetcode-solve` — so this handler is NEVER invoked on a v1.2 legacy note in Reading mode. The migration-trigger code is therefore dead in Reading mode, and the file header comment ("Reading-mode handler awaits migrateLegacyFenceIfNeeded BEFORE constructing the widget so the v1.2 → v1.3 fence rewrite happens in the same render frame") is misleading.

The only actual Reading-mode user surface for a legacy note is Obsidian's stock `\`\`\`python` syntax-highlighted block — which has no migration prompt. The user must switch to Live Preview to trigger migration. CONTEXT D-trigger-01 acknowledges Live Preview as a fallback ("Reading mode is the user-visible primary surface for legacy notes"), but Reading mode currently has NO surface at all.

**Fix:** Either:
1. Register additional code-block processors for the recognized LC langSlug fence tags (`python`, `java`, `cpp`, `golang`, …) that gate on `lc-slug` frontmatter and route legacy LC notes through `mountLegacyFenceBanner` / `migrateLegacyFenceIfNeeded`.
2. Add a `vault.on('file-open')` or `workspace.on('file-open')` handler that calls `migrateLegacyFenceIfNeeded` for any TFile whose frontmatter has `lc-slug`. This is the simplest fix and matches L5 ("Lazy-on-first-open only").
3. Update the header comment + CONTEXT to acknowledge "Reading-mode auto-migration is intentionally NOT supported in v1.3; the user must switch to Live Preview or invoke the palette command" — and verify this is the intended design (it conflicts with the explicit MIGRATE-06 default ON contract).

```typescript
// Option 2 — file-open hook in main.ts onload():
this.registerEvent(
  this.app.workspace.on('file-open', (file) => {
    if (!file || !this.settings.getUseInlineWidget()) return;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (typeof fm?.['lc-slug'] !== 'string') return;
    void migrateLegacyFenceIfNeeded(this.app, file, {
      autoMigrateOnOpen: this.settings.getAutoMigrateOnOpen(),
      defaultLanguage: this.settings.getDefaultLanguage(),
    });
  }),
);
```

### CR-02: Double-backup on retry after partial migration failure violates D-backup-02

**File:** `src/widget/fenceMigrator.ts:240-308`
**Issue:** D-backup-02 states "one backup per note ever; idempotency short-circuits before the backup writer runs on subsequent re-opens." The orchestrator pipeline is:

1. read text + fm
2. `isMigrationCandidate(text, fm)` — checks `countLeetCodeSolveFenceOpeners > 0` for idempotency
3. `writeBackup(...)` — writes `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/`
4. `vault.process(...)` — rewrites the opener
5. `processFrontMatter(...)` — fills lc-language

If step 4 throws (vault locked, I/O error, plugin reload mid-write), the catch in step 5 wraps the orchestrator and returns false. On the NEXT file open:
- Step 1: re-reads text (still has legacy fence — step 4 never landed)
- Step 2: `countLeetCodeSolveFenceOpeners > 0`? NO (rewrite never ran)
- `isMigrationCandidate` returns true again
- Step 3: writes a SECOND backup with a DIFFERENT ISO timestamp
- Step 4: this time succeeds

Result: two backup folders for the same note. Storage waste is minor; the contract violation matters because Phase 22 cleanup may rely on D-backup-02's "one backup per note" invariant for safe deletion logic. The 30-day GC saves us eventually but not before the user sees `migration-backup-{slug}-T1` AND `migration-backup-{slug}-T2`.

**Fix:** Guard the backup writer with a pre-existence check on the backup folder shape:

```typescript
// Inside writeBackup or migrateLegacyFenceIfNeeded:
async function backupAlreadyExistsForSlug(app: App, slug: string): Promise<boolean> {
  try {
    const listing = await app.vault.adapter.list('.obsidian/plugins/obsidian-leetcode');
    const re = new RegExp(`^migration-backup-${escape(slug)}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z$`);
    return (listing.folders ?? []).some((f) => re.test(f.split('/').pop() ?? ''));
  } catch { return false; }
}

// In migrateLegacyFenceIfNeeded:
if (!(await backupAlreadyExistsForSlug(app, slug))) {
  await writeBackup(app, file, slug, text);
}
```

Alternatively: explicit one-shot persisted flag in plugin data (`migrationBackedUpSlugs: Set<string>`) checked & set inside the same atomic flow.

### CR-03: Greedy slug capture in BACKUP_FOLDER_RE permits TTL deletion of foreign folders

**File:** `src/widget/migrationBackupGc.ts:55-56`
**Issue:** `^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$`. `(.+)` is greedy. Any future plugin-internal folder named e.g. `migration-backup-something-2026-01-01T12-00-00Z` (regardless of whether it was created by this plugin) is matched, parsed, and TTL-deleted via `rmdir(path, true)` (recursive=true, line 135). Although the prefix `migration-backup-` is somewhat distinctive, NOTHING in the regex enforces that the slug portion conforms to LC slug shape (kebab-case alphanumeric, no `-{4 digits}-`). The phase context flag explicitly called out "false positives risk deleting non-backup folders under `.obsidian/plugins/obsidian-leetcode/`" — this regex provides only weak protection.

A second concern: `parseSanitizedIso(captured)` uses `.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z')`. If `captured` is malformed (e.g., adapter returned a path with a different time format), the replace silently no-ops and `Date.parse` returns NaN → skipped. SAFE for THAT path. But the OUTER regex permits the slug (`group 1`) to itself contain a `\d{4}-\d{2}-\d{2}T...` pattern; greedy `.+` would still match the LAST `-\d{4}-…Z$` suffix. That's the behavior we want, but requires careful slug shape constraints.

**Fix:** Tighten the slug character class:

```typescript
// Restrict slug to LC-shape kebab-case alphanumerics:
const BACKUP_FOLDER_RE =
  /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;
```

LC slugs match `[a-z0-9-]+` per leetcode.com convention. Reject anything outside that. Tests should add a fixture like `migration-backup-foo-bar-baz-2026-01-01T00-00-00Z` (multi-segment slug) to confirm the tighter regex still matches valid backups.

### CR-04: `legacyFenceBanner.renderReadOnly` chains `.createEl` on a returned `pre` without checking it exists

**File:** `src/widget/legacyFenceBanner.ts:97-109`
**Issue:**

```typescript
function renderReadOnly(host: HTMLElement, source: string): void {
  const ce = (host as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof ce === 'function') {
    const pre = ce.call(host, 'pre');
    (pre as unknown as { createEl: CreateElFn }).createEl('code', { text: source });
    return;
  }
  // ...happy-dom fallback
}
```

The function checks `host.createEl` exists before using it, but assumes the returned `pre` element ALSO exposes `createEl`. In Obsidian's runtime this is true (HTMLElement.prototype is patched globally). However:

1. `ce.call(host, 'pre')` could return undefined if the createEl shim is non-Obsidian (legitimate runtime in tests / popup windows / iframes where Obsidian's prototype patch hasn't fired yet).
2. Calling `.createEl` on undefined throws `TypeError: Cannot read properties of undefined`.
3. This exception is NOT caught — it propagates out of `mountLegacyFenceBanner`, which is called from `mountLegacyFenceBanner(...)` in `codeBlockProcessor.ts:185-191` (no try/catch wrap) and `liveModeViewPlugin.ts:91-97` (inside `toDOM`, also no try/catch). A throw in `toDOM` from a CM6 widget BREAKS the editor render cycle — the user sees a broken pane.

Also, `mountLegacyFenceBanner` itself has no top-level try/catch — only `runMigrate`'s click handler does. An exception during `mk(banner, 'p', …)` or `renderReadOnly(host, …)` crashes the post-processor.

**Fix:**

```typescript
function renderReadOnly(host: HTMLElement, source: string): void {
  const ce = (host as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof ce === 'function') {
    const pre = ce.call(host, 'pre');
    const preCe = (pre as unknown as { createEl?: CreateElFn })?.createEl;
    if (typeof preCe === 'function') {
      preCe.call(pre, 'code', { text: source });
      return;
    }
    // pre lacks createEl — fall through to manual text content
    pre.textContent = source;
    return;
  }
  // ...happy-dom fallback (unchanged)
}

// Wrap the entry point:
export function mountLegacyFenceBanner(host, source, file, plugin, mode) {
  try {
    empty(host);
    // ... existing body
  } catch (err) {
    logger.debug('migration.legacyFenceBanner: mount failed', err);
    // best-effort plain-text fallback
    try { host.textContent = source; } catch { /* */ }
  }
}
```

## Warnings

### WR-01: `migrateInFlight` Set is module-level and never cleared on plugin unload

**File:** `src/widget/liveModeViewPlugin.ts:67`
**Issue:** `const migrateInFlight = new Set<string>();` lives at module scope. If the plugin is reloaded (Settings → toggle useNestedEditor / useInlineWidget → reload), the module is re-imported with a fresh Set under typical bundler semantics — but in development hot-reload modes (pjeby/hot-reload, the documented dev-vault helper from CLAUDE.md), the module instance may persist across plugin instances, leaking entries from prior runs. Worse, if a migration is in-flight when the plugin unloads, the `.finally(() => migrateInFlight.delete(file.path))` may never fire (promise abandoned) — entry leaks until next module re-import.

**Fix:** Move `migrateInFlight` into the ViewPlugin instance or a per-plugin singleton attached to the LeetCodePlugin host:

```typescript
// In LeetCodeLiveViewPlugin:
class LeetCodeLiveViewPlugin {
  private static migrateInFlight = new WeakMap<App, Set<string>>();
  private getInFlight(): Set<string> {
    let s = LeetCodeLiveViewPlugin.migrateInFlight.get(this.plugin.app);
    if (!s) { s = new Set(); LeetCodeLiveViewPlugin.migrateInFlight.set(this.plugin.app, s); }
    return s;
  }
}
```

### WR-02: Stale `fm` reference used for outer `needsLang` check after vault.process

**File:** `src/widget/fenceMigrator.ts:281-282`
**Issue:** Step 1 reads `fm = app.metadataCache.getFileCache(file)?.frontmatter`. Step 4 runs `vault.process` which rewrites the body (NOT the frontmatter). Step 5 evaluates `needsLang = typeof fm?.['lc-language'] !== 'string' || fm['lc-language'] === ''` against the SAME `fm` reference read in step 1. Between step 1 and step 5, another path (chevron click, manual edit, Obsidian Sync) could write `lc-language` to disk; metadataCache may or may not have caught up. The outer guard is stale; only the inner re-check (lines 288-291) protects the actual write.

In practice this is safe — the inner re-check IS authoritative. But the outer guard is misleading and could mask a subtle race if a future change relies on the outer check being authoritative.

**Fix:** Always run the processFrontMatter callback unconditionally and let the inner re-check decide:

```typescript
// Always invoke processFrontMatter; inner callback is the authoritative gate.
await app.fileManager.processFrontMatter(file, (fmObj) => {
  if (typeof fmObj['lc-language'] !== 'string' || fmObj['lc-language'] === '') {
    fmObj['lc-language'] = opts?.defaultLanguage ?? 'python3';
  }
});
```

This is one extra processFrontMatter no-op when language is already set, but the metadata cache is then guaranteed-consistent.

### WR-03: `isMigrationCandidate` recomputes `countLeetCodeSolveFenceOpeners` over ENTIRE noteText, including frontmatter region

**File:** `src/widget/fenceMigrator.ts:110`
**Issue:** `countLeetCodeSolveFenceOpeners(noteText, Number.MAX_SAFE_INTEGER)` scans the whole file for `^\s*\`\`\`leetcode-solve\b`. Frontmatter `---` blocks containing user-typed content with that pattern would incorrectly match. While unrealistic for actual frontmatter (YAML keys can't begin with backticks), a fenced block inside `## Notes` containing the literal text `\`\`\`leetcode-solve` (e.g., a doc/example) would prevent migration. This is the inverse of the intended idempotency clause.

The comment on the predicate says "C5: idempotency — note does NOT already contain `\`\`\`leetcode-solve`". A user's note may legitimately reference the string `\`\`\`leetcode-solve` inside `## Notes` for documentation purposes; this aborts migration even though the actual `## Code` fence is still legacy.

**Fix:** Scope the idempotency check to the `## Code` section only, mirroring what `rewriteFenceOpenerTag` does:

```typescript
function hasLeetCodeSolveOpenerInCodeSection(noteText: string): boolean {
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  for (const line of lines) {
    if (H2_CODE_RE.test(line)) { inCodeSection = true; continue; }
    if (H2_ANY_RE.test(line)) { inCodeSection = false; continue; }
    if (inCodeSection && /^\s*```leetcode-solve\b/.test(line)) return true;
  }
  return false;
}
// Replace clause C5:
if (hasLeetCodeSolveOpenerInCodeSection(noteText)) return false;
```

### WR-04: `mountLegacyFenceBanner` `manual-prompt` mode renders banner + read-only block as siblings on host without separator

**File:** `src/widget/legacyFenceBanner.ts:51-79`
**Issue:** In `manual-prompt` mode the function calls `empty(host)`, then `mk(host, 'div', …)` for the banner, then `renderReadOnly(host, source)`. The `<pre><code>` is appended directly to `host`, NOT inside the banner div. There's no visual separator (no class, no spacing wrapper). The CSS class `leetcode-migration-banner` is only on the banner div; the read-only block is a bare sibling.

Behaviorally this works (banner above, code below). But the file header comment claims it shows "Banner with [Migrate now] button + read-only `<pre><code>` of source" as a single unit. CSS styling may not target the read-only block as part of the banner.

**Fix:** Wrap the read-only block in a sibling div inside `host` so it can be styled cohesively:

```typescript
mk(banner, 'p', { text: 'This note uses the v1.2 format.', cls: 'leetcode-migration-banner__copy' });
mk(banner, 'button', { text: 'Migrate now', cls: 'leetcode-migration-banner__cta' });
const readOnlyWrap = mk(host, 'div', { cls: 'leetcode-migration-banner__readonly' });
renderReadOnly(readOnlyWrap, source);
```

### WR-05: `runMigrationBackupGc` does not throttle / dedupe concurrent invocations

**File:** `src/widget/migrationBackupGc.ts:98-143`, called from `src/main.ts:420`
**Issue:** `Promise.resolve().then(() => runMigrationBackupGc(this.app))`. If onload runs more than once in a session (plugin reload, settings flip with reload), multiple GCs queue concurrently. Each iterates the same folder list and calls `adapter.rmdir(folderFull, true)`. If two invocations both decide to delete the same expired folder, the second call hits `ENOENT` — caught by the inner try/catch at line 133-138 → logger.debug + continue. SAFE but noisy.

More concerning: `for (const folderFull of listing.folders ?? [])` is sequential `await`. A vault with 100s of expired backups blocks for the duration of all rmdir calls — non-blocking via fire-and-forget at the call site, but the promise stays pending and may overlap with normal vault writes.

**Fix:** Add a module-level `gcRunning` flag + early exit:

```typescript
let gcRunning = false;
export async function runMigrationBackupGc(app: App): Promise<void> {
  if (gcRunning) return;
  gcRunning = true;
  try { /* existing body */ }
  finally { gcRunning = false; }
}
```

### WR-06: `validateContestSlug` throws inside `finalizeContest` — ContestFinalizer is unaware of Phase 21 changes

**File:** `src/contest/ContestFinalizer.ts:75-80`
**Issue:** Not introduced in Phase 21, but: `validateContestSlug` throws plain `Error` on invalid slug. The new Phase 21 `useInlineWidget` gate inside `buildNoteBody` is fine — but the `codeBlockFor(problem.language, problem.code)` at line 405 (inside `buildContestProblemBody`) is a DEAD function. It's defined but never called. This dead function emits the LEGACY fence regardless of `useInlineWidget` — if a future Phase 22 cleanup deletes `codeBlockFor` without first verifying `buildContestProblemBody` is unused, this will fail to compile.

**Fix:** Delete `buildContestProblemBody` (it's unused — verify with grep):

```bash
grep -rn "buildContestProblemBody" /Users/moxu/projects/obsidian-leetcode/src
# If only the definition matches: safe to delete.
```

### WR-07: `injectCodeSection` `fenceKind === 'leetcode-solve'` short-circuit replaces fence body without checking section boundary

**File:** `src/solve/starterCodeInjector.ts:91-100`
**Issue:** When `fenceKind === 'leetcode-solve'` AND `countLeetCodeSolveFenceOpeners > 0`, the function calls `rewriteFenceBody(current, 0, opts.starterCode.trim())`. `rewriteFenceBody`'s fenceIndex=0 means "the FIRST `\`\`\`leetcode-solve` fence in the file". If the user has TWO `\`\`\`leetcode-solve` fences (uncommon but possible — e.g., a legacy migration miss + a newly-injected one), this overwrites the first one. The intent is to replace the `## Code` fence; if the user has placed a `\`\`\`leetcode-solve` reference in `## Notes` ABOVE `## Code` (or via a copy-paste), the wrong fence is overwritten.

**Fix:** Locate the first `\`\`\`leetcode-solve` fence inside `## Code` specifically, OR add a clear precondition that only ONE `leetcode-solve` fence may exist per note (with a unit test fixture that fails for multi-fence inputs). The current implementation silently corrupts.

### WR-08: `migrationBackupGc.parseSanitizedIso` accepts strings with extra trailing characters

**File:** `src/widget/migrationBackupGc.ts:71-77`
**Issue:** `iso = captured.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z')`. The regex anchors at end with `$` but `captured` is the regex group 2 from `BACKUP_FOLDER_RE` which already enforces `\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$` exactly. Defensive but redundant. NOT a defect — but if `BACKUP_FOLDER_RE` is ever loosened, `parseSanitizedIso` would silently mis-parse.

**Fix:** Add an explicit shape assertion:

```typescript
function parseSanitizedIso(captured: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(captured)) return NaN;
  const iso = captured.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
  return Date.parse(iso);
}
```

### WR-09: `getCurrentCode` widget path skips empty-string check on `lcLanguage` but trusts default fallback

**File:** `src/solve/submissionOrchestrator.ts:316`
**Issue:** `const langSlug = this.deps.lcLanguage ?? resolveLangSlug(extractedLang, this.deps.settings.getDefaultLanguage());`. The widget path SHOULD have `lcLanguage` always (per the Phase 21 contract: lc-language frontmatter is the SSoT). But if the widget caller passes `lcLanguage: ''` (empty string) instead of `null`/`undefined`, `??` does NOT short-circuit (empty string is truthy in `??` semantics — only null/undefined trigger fallback). The submit body then carries `lang: ''`, which LC rejects as a 400 Bad Request.

The widget call site (`main.ts:2910-2913`) does check `lc-language` is non-empty before defaulting to `python3` — so this is defended at the OUTER call site. But the orchestrator interface is loose; a future caller passing empty-string to `lcLanguage` would silently corrupt the request.

**Fix:** Tighten the orchestrator's defaulting:

```typescript
const lcLang = typeof this.deps.lcLanguage === 'string' && this.deps.lcLanguage.length > 0
  ? this.deps.lcLanguage
  : null;
const langSlug = lcLang ?? resolveLangSlug(extractedLang, this.deps.settings.getDefaultLanguage());
```

## Info

### IN-01: `fenceMigrator.ts:70` regex constants duplicated in `fenceSerialization.ts:238-241`

**File:** `src/widget/fenceMigrator.ts:71-74`, `src/widget/fenceSerialization.ts:238-241`
**Issue:** Both files declare `H2_CODE_RE = /^\s*##\s+Code\s*$/`, `H2_ANY_RE = /^\s*##\s+\S/`, `FENCE_OPENER_RE = /^\s*\`\`\`([A-Za-z0-9_+#-]*)\s*$/`, `FENCE_CLOSER_RE = /^\s*\`\`\`\s*$/`. These are character-identical between the two files. SSoT discipline is invoked elsewhere (e.g., for `rewriteFenceBody`); the regex constants should live in a shared module.

**Fix:** Extract to `src/widget/fenceConstants.ts` and import from both call sites.

### IN-02: Comment drift — `fenceMigrator.ts:53-60` says useInlineWidget is the master gate, but module gates only on autoMigrateOnOpen

**File:** `src/widget/fenceMigrator.ts:53-60`
**Issue:** The header comment claims "useInlineWidget=ON is the master gate (L9). This module does NOT inspect useInlineWidget — the gate is the caller's responsibility (Plan 21-02 wires it in the mount paths)." But `liveModeViewPlugin.ts:160-163` and `codeBlockProcessor.ts:142-146` both check `useInlineWidget?.() === true` — fine. However, the command-palette callsite at `main.ts:725` checks `getUseInlineWidget()` (no optional) and proceeds. The doc could clarify that: (a) `force: true` ALWAYS bypasses autoMigrateOnOpen but does NOT bypass the caller's useInlineWidget gate; (b) the module trusts the caller to gate.

**Fix:** Add an explicit assertion:

```typescript
// Optional dev-mode invariant check:
if (process.env.NODE_ENV === 'development' && opts?.force === true) {
  // Caller MUST have already gated on useInlineWidget=ON.
  console.assert(/* caller invariant */);
}
```

(Or just clarify the comment.)

### IN-03: `extractFirstFencedBlock` Branch C ignores empty fence tag, returns `lang: null` — but caller compatibility relies on this

**File:** `src/solve/codeExtractor.ts:135-141`
**Issue:** Comment at line 119: "Empty fence tag '\`\`\`' returns lang: null — caller resolves the default via languages.ts resolveLangSlug(null, defaultLang)." The new Branch C now returns `{ lang: fenceTag.length > 0 ? fenceTag : null, code }`. For an untagged `\`\`\`` opener, `fenceTag = ''` → `lang: null`. CORRECT. BUT: legacy v1.2 LC notes ALWAYS had a tag. An untagged `\`\`\`` is not v1.2 LC content; it's user content. Returning `lang: null` for user content lets the orchestrator fall back to defaultLang and submit the user's notes-section pseudo-code as a solution. Pre-Phase-21, that was already the behavior (preserved verbatim). Worth a regression test.

**Fix:** None required (verbatim behavior preserved). Add a test fixture with an untagged ` ``` ` to confirm null-lang fallback path.

### IN-04: `liveModeViewPlugin.AutoMigratingBannerWidget.eq()` ignores source, may cause stale DOM on body change

**File:** `src/widget/liveModeViewPlugin.ts:101-106`
**Issue:** `eq(other)` compares only `file.path`. If the user makes a typo in the legacy fence body during the migration window (the auto-migrating banner is showing), CM6 would NOT remount because eq returns true. Since the banner displays "Migrating note to v1.3 format..." with no body content, this is fine. But if a future change adds source preview to the auto-migrating banner, eq must include source comparison.

**Fix:** None required for current banner content. Add a comment guarding future changes:

```typescript
eq(other: WidgetType): boolean {
  // NOTE: source intentionally excluded — banner displays no source content.
  // If banner content is extended to show source, add `&& other.source === this.source`.
  return other instanceof AutoMigratingBannerWidget && other.file.path === this.file.path;
}
```

---

_Reviewed: 2026-06-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
