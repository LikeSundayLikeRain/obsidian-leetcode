---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Code Editor Experience
status: ready_to_plan
stopped_at: Phase 16 complete (5/5) — ready to discuss Phase 17
last_updated: 2026-05-23T02:05:23.819Z
last_activity: 2026-05-22 -- Phase 16 execution started
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 14
  completed_plans: 14
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21 — v1.2 milestone started)

**Core value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.
**Current focus:** Phase 17 — polish & edge cases

## Current Position

Phase: 17
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-23

Progress: [█████████░] 89%

## Performance Metrics

**Cumulative (v1.0 + v1.1):**

- Total phases completed: 19
- Total plans completed: 113
- v1.0: 10 phases, 61 plans (shipped 2026-05-14)
- v1.1: 9 phases, 41 plans (shipped 2026-05-20)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13 | 01 | 261s | 2 | 4 |
| 13 | 02 | 294s | 1 | 3 |
| 13 | 03 | 111s | 3 | 2 |
| Phase 15 P01 | 136s | 2 tasks | 4 files |
| Phase 15 P02 | 139s | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 05.3 (empirical failure): Compartment-swap of `@codemirror/lang-*` packs does NOT work inside markdown fences — Obsidian's `lang-markdown` nested-parser owns the fence sub-tree and ignores outer Compartments
- v1.2 architecture: **Nested EditorView (Path B)** chosen over heuristic keymaps (Path A) for best UX quality
- v1.2 decoration: Use `Decoration.widget({ block: true })` + CSS-hidden fence lines (NOT `Decoration.replace`) — avoids Live Preview "unfold" storms
- v1.2 lifecycle: Child EditorView registry on plugin instance (`Map<key, EditorView>`) decouples child lifecycle from widget destruction/recreation
- v1.2 sync: CM6 split-view pattern with sync annotations to prevent echo loops; always re-derive offsets via `findCodeFence()` before dispatching
- v1.2 section lock: No modifications needed — child→parent sync dispatches have no `input.*` userEvent, Gate 0 passes them through
- v1.2 bundle: Accept ~1.5 MB ceiling (language packs add ~300 KB over current 1.155 MB)
- Phase 13-01: Monotonic tick counter for LRU ordering (avoids sub-ms Date.now() conflicts)
- Phase 13-02: Widget decoration at openerLine.to between opener line-hide and body line-hides for RangeSetBuilder sorted-order compliance
- Phase 13-03: Registry instantiation before all registerEditorExtension calls; nested editor registered between code-actions and section-lock for correct transactionFilter ordering
- [Phase ?]: indentWithTab placed first in keymap for priority; 4-space default indent; addToHistory:false on all child-to-parent sync
- [Phase ?]: mousedown preventDefault on action buttons for focus retention (D-02)

### Pending Todos

None yet.

### Blockers/Concerns

- Bundle size: language packs raise ceiling from 1.2 MB to ~1.5 MB — user accepted this tradeoff for better UX
- Phase 13 spike needed: empirically verify `Decoration.widget` + CSS-hidden approach works in both Source Mode and Live Preview

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| AI provider | Native Bedrock SSO refresh + assume-role — AIPROV-FUT-01 | Deferred | 2026-05-15 |
| AI provider | Per-feature provider routing — AIPROV-FUT-02 | Deferred | 2026-05-15 |
| AI provider | Apply-patch (Cursor-style diff) — AIPROV-FUT-03 | Deferred | 2026-05-15 |
| Knowledge graph | Batch migration UI — AIKG-FUT-01 | Deferred (Phase 12 stretch, not shipped) | 2026-05-15 |
| Knowledge graph | Manual cluster override — AIKG-FUT-02 | Deferred | 2026-05-15 |
| Knowledge graph | Cluster-color graph view — AIKG-FUT-03 | Deferred | 2026-05-15 |
| Knowledge graph | AI auto-tagging of contest problems — AIKG-FUT-04 | Deferred | 2026-05-15 |
| Contest | Live participation — CONTEST-FUT-01 | Deferred | 2026-05-15 |
| Contest | Difficulty-weighted Surprise me — CONTEST-FUT-02 | Deferred | 2026-05-15 |
| Contest | Upcoming contest schedule — CONTEST-FUT-03 | Deferred | 2026-05-15 |
| Contest | LC Virtual Contest API integration — CONTEST-FUT-04 | Deferred | 2026-05-18 |

## Session Continuity

Last session: 2026-05-22T15:41:56.931Z
Stopped at: Phase 16 context gathered
Resume file: .planning/phases/16-language-packs-switching/16-CONTEXT.md
