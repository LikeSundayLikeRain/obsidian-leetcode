---
phase: 05-polish-ship
plan: 02
status: complete
tasks_completed: 2
tasks_total: 2
commits:
  - e33e7d4 feat(05-02) extend SettingsStore with techniquesFolderOverride (D-15)
  - c120b29 feat(05-02) add Knowledge Graph section to SettingsTab (D-14, D-16, D-17)
self_check: passed
---

# Plan 05-02 — Settings UI Knowledge Graph section

## Outcome

POLISH-01 shipped. `SettingsStore` now carries `techniquesFolderOverride` with getter/setter + override-aware `getTechniquesFolder()`. `SettingsTab` grew a `Knowledge Graph` section (third section, after Authentication and Notes) containing two controls:

1. **Technique folder override** — text field (blank = derived default `{problemsFolder}/Techniques`).
2. **Auto-create technique backlinks on Accepted** — toggle persisting `autoBacklinksEnabled`.

All four Wave-0 SettingsStore stubs and three Wave-0 SettingsTab stubs are GREEN.

## Key files

### Modified
- `src/settings/SettingsStore.ts` — +9 usages of `techniquesFolderOverride`; override-aware `getTechniquesFolder()` returns override when non-empty, else derived default.
- `src/settings/SettingsTab.ts` — +1 section (`Knowledge Graph`) with two controls. `setCta()` count remains 1 (Authentication login button only — D-17 accent reservation honored).

### Tests turned GREEN
- `tests/settings/SettingsStore.techniques-override.test.ts` — 4/4 pass
- `tests/settings/SettingsTab.knowledge-graph.test.ts` — 3/3 pass
- `tests/settings-store.test.ts` — extended coverage

## Locked decisions honored

- D-14: three-section layout (Authentication / Notes / Knowledge Graph) — verified via `setHeading` count = 4 (4th = Manual cookie sub-heading inside Authentication).
- D-15: technique folder is a visible override field with derived default when blank.
- D-16: toggle uses behavior-first copy ("Auto-create technique backlinks on Accepted").
- D-17: no Advanced / collapsible section, no new accent — `.setCta()` grep-gate holds at 1.
- D-32: shipped under D-16 (toggle).

## Grep gates

- `.setCta(` in `src/settings/SettingsTab.ts` = 1
- `setHeading` in `src/settings/SettingsTab.ts` = 4
- `techniquesFolderOverride` in `src/settings/SettingsStore.ts` = 9
- `const override` in `src/settings/SettingsStore.ts` = 1

## Deviations

Two Rule-3 (test-scaffolding) adjustments, no architectural (Rule-4) changes:

1. **Inline Obsidian DOM-helper polyfill in `SettingsTab.knowledge-graph.test.ts`** — the stub originally relied on implicit globals; we shimmed `createEl`/`createDiv`/`createSpan` on the fake container so Obsidian-style UI wiring runs under jsdom.
2. **`getUsername()` shim on the fake plugin** — SettingsTab's Authentication rendering path reads `this.plugin.getUsername()`; added a no-op stub to the test fake so `display()` can run end-to-end.

No production code was altered for test convenience; the shims live only in the test file.

## Out-of-scope RED tests (expected — later plans)

6 failing tests across 8 files remain RED — all Wave-0 stubs owned by later plans:
- Plan 03: `errors.isNetworkError.test.ts`, `throttle.rate-limit-retry.test.ts`, `throttle.timeout.test.ts`, `SessionExpiredNotice.test.ts`.
- Plan 04: `ephemeralTabStore.test.ts`, `RunModal.test.ts`, `run-command-registration.test.ts`, `codeActionsPostProcessor.test.ts`.

## Notes for downstream plans

- Plan 05-03 (error handling) can rely on the `autoBacklinksEnabled` toggle being live — no settings work needed before implementing the error Notices.
- `techniquesFolderOverride` is now the canonical read path for KnowledgeGraphWriter — Plan 04's `getTechniquesFolder()` call in Phase 4 already uses it via the new getter.

## Reconstruction note

This SUMMARY.md was reconstructed by the orchestrator from the agent's completion message after the worktree directory was removed before SUMMARY.md could be rescued. The two commits (e33e7d4, c120b29) are the source of truth; this file summarizes their content and the agent's self-check results.
