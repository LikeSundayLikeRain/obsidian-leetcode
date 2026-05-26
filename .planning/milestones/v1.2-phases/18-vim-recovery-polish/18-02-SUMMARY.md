---
phase: 18-vim-recovery-polish
plan: 02
status: complete
started: 2026-05-25
completed: 2026-05-25
---

# Summary: Fence Recovery on Non-CM6 Edits (18-02)

## One-liner

vault.on('modify') trigger fires repairFenceStructure when vim or external tools delete the fence closer outside CM6's transaction pipeline.

## What was delivered

- `registerVaultModifyRepairTrigger` in childEditorSync.ts registers vault.on('modify') listener
- Triple gate: active file has lc-slug + matches active MarkdownView + findCodeFence returns null
- Repair dispatch goes through parent CM6 view (NOT vault.process — preserves D-05 invariant)
- Idempotent: findCodeFence !== null short-circuits; 'leetcode.fence-repair' in ECHO_PRONE_USER_EVENTS prevents mirror
- Uses metadataCache for activeSlug (not doc text) — correct source of truth
- File-open repair deferred via setTimeout for first-open cases
- No duplicate starter code injection on reload

## Files modified

- `src/main/childEditorSync.ts` — registerVaultModifyRepairTrigger export + window.setTimeout fix
- `src/main.ts` — file-open repair wiring in onload
- `tests/main/childEditorSync.repair.test.ts` — unit tests for vault.on trigger path

## Decisions

- D-34 (registry-deletion stale-child invalidation) explicitly DROPPED — Plan 17-09 WeakMap lifecycle handles naturally
- Repair uses parent CM6 dispatch, never vault.process
- queueMicrotask defers fence check to allow Obsidian's internal sync to complete
