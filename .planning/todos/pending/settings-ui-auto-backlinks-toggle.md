---
title: Settings UI toggle for autoBacklinksEnabled
captured: 2026-05-09
resolves_phase: 5
tags: [phase-5, settings-ui, polish, graph-05]
references:
  - .planning/phases/04-knowledge-graph-wiring/04-CONTEXT.md (D-20)
  - .planning/phases/04-knowledge-graph-wiring/04-05-SUMMARY.md
---

# Settings UI toggle for autoBacklinksEnabled

Phase 4 shipped the `autoBacklinksEnabled` opt-out flag (D-20, GRAPH-05) in
`data.json`, but there is no UI surface to toggle it. Users currently have to
close Obsidian, hand-edit `data.json`, and restart to disable auto-backlink
creation on AC.

## What Phase 5 should ship

Add a toggle in the plugin's `PluginSettingTab` (under a new **Knowledge Graph**
section, or the existing Notes section):

- **Label:** `Auto-create technique backlinks on Accepted`
- **Description:** `When enabled, an Accepted submission writes a ## Techniques section and creates stub notes for each LC topic tag. When disabled, only frontmatter tags (lc/{slug}) are written; no ## Techniques heading, no stubs.`
- Bound to `SettingsStore.autoBacklinksEnabled` (already wired through
  `SettingsStore.getAutoBacklinksEnabled()` which `KnowledgeGraphWriter`
  already consults).

## Notes

- No code changes needed in `KnowledgeGraphWriter` or `SettingsStore` — the
  plumbing landed in Phase 4. This is purely a settings-UI wiring.
- Default should remain `true` (headline plugin value is ON).
- Consider pairing with a **retroactive opt-out cleanup** command (already in
  Phase 4 CONTEXT `<deferred>` list) — a single settings page can surface both.
