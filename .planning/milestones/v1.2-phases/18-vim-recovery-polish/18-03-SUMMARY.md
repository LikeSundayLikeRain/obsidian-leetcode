---
phase: 18-vim-recovery-polish
plan: 03
status: complete
started: 2026-05-25
completed: 2026-05-25
---

# Summary: Relative Line Numbers Setting (18-03)

## One-liner

Plugin-owned "Show relative line numbers" setting gates a custom gutter formatter on the child editor, independent of third-party plugins.

## What was delivered

- New setting `showRelativeLineNumbers: boolean` (default false) in SettingsStore
- Settings UI toggle under 'Code editor' heading in SettingsTab
- 5-touchpoint integration: SettingsStore → PluginHost type → buildNestedDecorations → NestedEditorWidget → createChildEditor
- Custom relativeFormatter: cursor line shows absolute number, others show |n - cursorLine|
- Combinatorial with Obsidian's showLineNumber: relative only activates when line numbers are enabled
- Custom gutter with lineMarkerChange forces re-render on cursor line change (vim Normal mode)
- Read-once-at-mount semantic (matches D-18/D-35 contract)
- Test 25 (LINENUM-RELATIVE-01) appended to 17-UAT.md

## Files modified

- `src/settings/SettingsStore.ts` — showRelativeLineNumbers field + getter
- `src/settings/SettingsTab.ts` — UI toggle
- `src/main/nestedEditorExtension.ts` — PluginHost type extended + widget constructor
- `src/main/childEditorFactory.ts` — relativeFormatter + custom gutter extension
- `tests/main/childEditorFactory.test.ts` — formatter unit tests
- `tests/main/nestedEditorExtension.test.ts` — integration chain test

## Decisions

- No vim `:set rnu`/`:set nornu` aliases (Decision 3 preserved)
- Custom gutter replaces plain lineNumbers() to support lineMarkerChange for cursor-driven re-render
- Read-once-at-mount: no live reactivity on toggle
