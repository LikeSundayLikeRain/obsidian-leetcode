---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: architecture overview, migration docs, sync interaction notes, and Cmd-Z/Cmd-F scoping behavior.
status: executing
stopped_at: Phase 21 context gathered
last_updated: "2026-06-01T23:58:44.398Z"
last_activity: 2026-06-01 -- Phase 21 execution started
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-28 — v1.3 milestone started)

**Core value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.
**Current focus:** Phase 21 — v1-2-migration

## Current Position

Phase: 21 (v1-2-migration) — EXECUTING
Plan: 1 of 17
Status: Executing Phase 21
Last activity: 2026-06-01 -- Phase 21 execution started

## Performance Metrics

**Cumulative (v1.0 + v1.1 + v1.2):**

- Total phases completed: 25
- Total plans completed: 133
- v1.0: 10 phases, 61 plans (shipped 2026-05-14)
- v1.1: 9 phases, 41 plans (shipped 2026-05-20)
- v1.2: 6 phases, 31 plans (shipped 2026-05-26)
- v1.2 stats: 1,713 tests passing, 1.71 MB raw / 459 KB gzipped bundle

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
- 2026-05-23 (Phase 17 D-19, user-approved): Bundle ceiling raised from 1.6 MB → 1.8 MB to ship @replit/codemirror-vim 6.3.0 in v1.2. Post-vim raw 1,707,327 B / gzipped 459,257 B. Headroom ~92 KB for v1.3.
- Phase 13-01: Monotonic tick counter for LRU ordering (avoids sub-ms Date.now() conflicts)
- Phase 13-02: Widget decoration at openerLine.to between opener line-hide and body line-hides for RangeSetBuilder sorted-order compliance
- Phase 13-03: Registry instantiation before all registerEditorExtension calls; nested editor registered between code-actions and section-lock for correct transactionFilter ordering
- [Phase ?]: indentWithTab placed first in keymap for priority; 4-space default indent; addToHistory:false on all child-to-parent sync
- [Phase ?]: mousedown preventDefault on action buttons for focus retention (D-02)
- **v1.3 architecture (2026-05-28):** Inline code-block widget + one-way sync chosen over v1.2's dual-CM6 sync. File becomes single source of truth; widget writes through `vault.process`. Net −2,400 LOC.
- **v1.3 mount strategy (Q3 confirmed):** Two-path mount required — `registerMarkdownCodeBlockProcessor` (Reading) + `registerEditorExtension` ViewPlugin with `Decoration.replace({ widget })` (Live Preview). Single path breaks half of all user workflows. Reading mode renders live CM6 with `editable.of(false)` for one render code path.
- **v1.3 self-write suppression (P1):** Per-path content-hash map with 2-second TTL — NOT a boolean flag. Boolean flag is provably broken under concurrent multi-file flushes.
- **v1.3 fence tag (Q1):** `leetcode-solve` is the canonical fence tag; language metadata moves entirely to `lc-language` frontmatter. Fence opener no longer encodes language.
- **v1.3 vim toggle (Q2):** Live `Compartment.reconfigure(enabled ? vim() : [])` is the primary path; reload-on-toggle banner is the pre-accepted fallback (VIM-03) if empirical test fails.
- **v1.3 section protection (Q1):** `sectionLockExtension.ts` (527 LOC) deleted; replaced by narrower `sectionProtectionExtension.ts` covering only `## Problem` body + `## Techniques` heading. Fence opener/closer protection moot (widget owns the fence). `'leetcode.*'` userEvent convention retired.
- **v1.3 multi-pane (Q4):** Single-active-per-file is the v1.3 baseline; full live/mirror with promote-on-focus deferred to v1.3.x (MULTI-01/MULTI-02 v1.4+).
- **v1.3 rollout (Q5):** Default ON from first 1.3.x release — no opt-in alpha period (BRAT-only alpha for plugin-store re-review readiness).
- **v1.3 migration (Q6, Q7):** 30-day backup retention; migration + first-edit are atomic in a single `vault.process` callback.

### Pending Todos

- Plan Phase 19: Widget Foundation + One-Way Sync — `/gsd:plan-phase 19`

### Blockers/Concerns

- **Phase 19 empirical risks:** Live Preview raw-source-reveal mitigation (`mousedown.stopPropagation()`) is empirically unverified — state-persistence map is the fallback regardless. `getSectionInfo` null-paths must be exercised on day one.
- **Phase 20 empirical risks:** Section-protection narrowing has no precedent (must audit every `changeFilter` condition). `@replit/codemirror-vim` Compartment.reconfigure runtime-toggle is undocumented in the library README — early dev-vault probe required.
- **Phase 21 risk:** Migration is the highest-risk surface in the milestone. Hand-edited note edge cases (extra blank lines, malformed frontmatter, missing `## Code` heading) need fixture coverage in CI.
- **Bundle headroom:** ~92 KB remaining after v1.2's vim addition. v1.3 should net out negative (−2,400 LOC) but CI gate must guard.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260514-k39 | Fix Obsidian plugin store auto-review ESLint errors and warnings | 2026-05-14 | 80a51ca | [260514-k39-fix-obsidian-plugin-store-auto-review-es](./quick/260514-k39-fix-obsidian-plugin-store-auto-review-es/) |
| 260528-vq4 | Add useNestedEditor toggle setting | 2026-05-29 | 5480c03 | [260528-vq4-add-usenestededitor-toggle-setting](./quick/260528-vq4-add-usenestededitor-toggle-setting/) |

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
| Widget | Multi-pane live/mirror — MULTI-01, MULTI-02 | Deferred to v1.4+ | 2026-05-29 |
| Widget | Static palette for widget — PALETTE-01 (v1.2 backlog 999.1) | Deferred to v1.4+ | 2026-05-29 |
| Widget | Triple-backtick bracket pair — BRACKET-01 (v1.2 carry-over) | Deferred to v1.4+ | 2026-05-29 |

## Session Continuity

Last session: 2026-06-01T14:44:04.381Z
Stopped at: Phase 21 context gathered
Resume file: .planning/phases/21-v1-2-migration/21-CONTEXT.md
Next action: `/gsd-plan-phase 20`
