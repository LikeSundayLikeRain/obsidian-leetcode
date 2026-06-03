# Plan 21-02 Task 4 — Dev-Vault Probe Protocol (Human-Blocked Checkpoint)

**Status:** Deferred. Headless executor cannot exercise this checkpoint —
Task 4 is a `checkpoint:human-verify` gate that requires a live Obsidian
runtime. Per Plan 21-02 Task 4 `<notes>` ("Human-blocked checkpoint by
design"), the probe runs only inside a real Obsidian session.

**Auto-resume defaults applied by the headless executor (per orchestrator
plan-specific notes):**
- **Axis 1 (Test 2 frame ordering):** `single-frame`
- **Axis 2 (Test 7 shim validation):** `shim_validation=skipped`

These default signals propagate to:
- **Task 5** (`gate="blocking_when=probe_two_frame"`) → SKIPPED. The
  hash-arm fallback is NOT wired in this plan. If a later dev-vault probe
  finds two-frame ordering, the user re-runs `/gsd-execute-phase 21
  --gaps-only` to wire it as a follow-up.
- **Plan 21-04 Task 3 (BLOCKER 4 acceptance):** the
  `tests/fixtures/migration/.obsidian-shim-validation.txt` artifact is NOT
  produced. Plan 21-04 Task 3 MUST run its own capture step before
  authoring `*.expected.md` fixtures, OR a follow-up dev-vault session
  must produce the artifact before Plan 21-04 ships.

## Probe Protocol (verbatim — for the future human runner)

The full protocol is the `<how-to-verify>` block of Plan 21-02 Task 4 in
`.planning/phases/21-v1-2-migration/21-02-PLAN.md`. Summary:

1. `npm run build`. Confirm exit 0.
2. Symlink/copy `main.js` + `manifest.json` to
   `~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/`.
3. Reload Obsidian.
4. Settings → Community Plugins → LeetCode → toggle `useInlineWidget` ON.
5. **Test 1 (auto-migrate path with `lc-language` present).** Create
   `Test1-LegacyWithLang.md` with `{ lc-slug: 'test-1', lc-language:
   'python3' }` + `## Code\n\n```python\ndef f(): return 1\n```\n`. Open
   the note. Expected: fence opener rewritten to ```` ```leetcode-solve ````,
   widget mounts, no banner. Verify on disk.
6. **Test 2 (auto-migrate path with `lc-language` MISSING — empirical-risk
   case for Open Question §1).** Create `Test2-LegacyNoLang.md` with
   `{ lc-slug: 'test-2' }` (no `lc-language`) + a Java fence. Open the
   note. Expected: fence rewritten + `lc-language: java` injected. Watch
   for: (a) clean Java mount → `single-frame` ordering. (b) Python+Notice
   flash before Java mount → `two-frame` ordering → spawn Task 5 wiring
   as a follow-up.
7. **Test 3 (banner path).** Toggle `autoMigrateOnOpen` OFF. Create
   `Test3-Legacy.md` with `cpp` fence. Open. Expected: banner with
   "This note uses the v1.2 format." + [Migrate now] CTA + read-only
   `<pre><code>` of body. Click [Migrate now]. Expected: banner unmounts,
   widget mounts on rewritten leetcode-solve fence.
8. **Test 4 (command palette path).** Toggle `autoMigrateOnOpen` ON.
   Create `Test4-Legacy.md` with `typescript` fence. Trigger Command
   Palette → "Migrate current note". Expected: command appears, runs,
   file is rewritten.
9. **Test 5 (idempotency).** Re-open Tests 1–4. Expected: NO additional
   backup folders are created (one backup per note ever; D-backup-02).
10. **Test 6 (`useInlineWidget=OFF` no-op).** Toggle `useInlineWidget` OFF.
    Create `Test6-Legacy.md`. Open. Expected: no migration; v1.2 path
    renders normally.
11. **Test 7 (frontmatter byte-layout capture for Plan 21-04 BLOCKER 4).**
    See full protocol in 21-02-PLAN.md Task 4 step 11 — produces
    `tests/fixtures/migration/.obsidian-shim-validation.txt`.

## Resume-Signal Recording (when human resumes)

When a future human runs the probe and resumes Plan 21-02 (e.g., via
`/gsd-execute-phase 21 --gaps-only`), they should record both axes
explicitly in `21-02-SUMMARY.md`:

- `probe_result={single_frame|two_frame}` (axis 1)
- `shim_validation={captured|diverges|skipped}` (axis 2)

If `probe_result=two_frame`, Task 5 must be wired before resume. If
`shim_validation=diverges` or `shim_validation=skipped`, Plan 21-04 Task 3
inherits the corrective action.

## Code-Path Verification (executable by the headless executor)

The executor verified the following non-runtime assertions:

- `npm run build` exits 0 (TypeScript strict-mode passes).
- `npx vitest run` — 2878/2884 tests pass; 6 pre-existing skips; ZERO
  failures attributable to Plan 21-02 changes.
- Acceptance criterion grep checks:
  - `grep -c 'migrateLegacyFenceIfNeeded' src/widget/codeBlockProcessor.ts`
    >= 1 (5 hits — fenceMigrator import, auto-path call, comment
    references).
  - `grep -c 'mountLegacyFenceBanner' src/widget/codeBlockProcessor.ts`
    >= 1 (3 hits).
  - `grep -c 'isMigrationCandidate' src/widget/codeBlockProcessor.ts`
    >= 1 (2 hits — import + call site).
  - `grep -c 'migrateLegacyFenceIfNeeded' src/widget/liveModeViewPlugin.ts`
    >= 1 (4 hits).
  - `grep -c 'void migrateLegacyFenceIfNeeded' src/widget/liveModeViewPlugin.ts`
    >= 1 (1 hit — Pitfall 6 fire-and-forget).
  - `grep -c 'auto-migrating' src/widget/liveModeViewPlugin.ts`
    >= 1 (4 hits — banner mode mount during migration window per
    D-trigger-01).
  - `grep -c "id: 'migrate-current-note'" src/main.ts` == 1.
  - `grep -c "name: 'Migrate current note'" src/main.ts` == 1.
  - CLAUDE.md `## Conventions` paragraphs unchanged.
  - The Live Preview legacy-kind branch returns synchronously (no `await`
    keyword between `if (fence.kind === 'legacy')` and the `return`
    statement; verified by reading source).
  - The `editorCheckCallback` for `migrate-current-note` returns true
    ONLY when `useInlineWidget=ON` + lc-slug present (verified by reading
    source).

The remaining acceptance criteria — D-trigger-01 invariant under live
Obsidian rendering, idempotency on re-open, command palette discoverability,
and the frontmatter byte-layout capture — depend on a live Obsidian
runtime and are deferred to a future dev-vault session.
