---
phase: 18-vim-recovery-polish
plan: 01
status: complete
started: 2026-05-25
completed: 2026-05-25
---

# Summary: Vim Focus Routing (18-01)

## One-liner

Scope-based vim keystroke intercept prevents Normal-mode navigation keys from leaking to parent editor.

## What was delivered

- Hypothesis A confirmed via DevTools probe: keys leak to parent even with correct DOM focus
- Scope-based intercept registered on child focus, popped on blur (mirrors createCmdSlashScopeExtension pattern)
- Normal-mode keys (j/k/h/l/dd/yy/p/x/o/i/a/s) route to child's vim instance
- Insert-mode keystrokes pass through unchanged (no Esc/o/i regressions)
- Visual mode Esc capture prevents parent focus-steal
- First-open decoration rebuild ensures child renders on initial note open
- Click focus via requestAnimationFrame ensures contentDOM receives focus

## Files modified

- `src/main/childEditorFactory.ts` — createVimIsolationExtension ViewPlugin + mousedown focus fix
- `tests/main/childEditorVimScope.test.ts` — unit tests for Scope membership and mode gating

## Decisions

- Hypothesis A (Scope intercept) won over Hypothesis B (focus primer)
- Insert-mode keys are NEVER intercepted — learned from prior regression
- `:set nu`/`:set nonu` aliases explicitly dropped per user decision
