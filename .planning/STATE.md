---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Inline Widget Architecture
status: shipped
stopped_at: "v1.3 shipped (1.3.0 tag) and archived; awaiting next milestone"
last_updated: "2026-06-12T13:47:43.787Z"
last_activity: 2026-06-12 — Milestone v1.3 completed and archived
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 35
  completed_plans: 35
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12 — after v1.3 milestone)

**Core value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.
**Current focus:** Planning next milestone (v1.3 shipped)

## Current Position

Phase: Milestone v1.3 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-21 — Completed quick task 260621-154: pattern-classification hub bug fixes

## Performance Metrics

**Cumulative (v1.0 + v1.1 + v1.2 + v1.3):**

- Total phases completed: 30
- Total plans completed: 168
- v1.0: 10 phases, 61 plans (shipped 2026-05-14)
- v1.1: 9 phases, 41 plans (shipped 2026-05-20)
- v1.2: 6 phases, 31 plans (shipped 2026-05-26)
- v1.3: 5 phases, 35 plans (shipped 2026-06-12)
- v1.3 stats: ~2,873 tests passing, 1,723 KB raw bundle, net −3,325 LOC in src/

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
- **Phase 22-03 bundle threshold calibration (2026-06-03):** HARD_LIMIT preserved at 1,800,000 (Phase 17 D-19 user-approved ceiling) instead of lowered to v1.2 baseline 1,706,000 as 22-03 originally proposed. Phase 22-02 polish suite re-pulled +49 KB CodeMirror surface (lineNumbers gutter port, per-mode vim cursor rendering, hover-border CSS, etc.); the v1.2 ratchet became infeasible at the actual measured 1,756,707 size. SOFT_WARN drops to 1,760,000 — fires on any feature regression past polish within ~1 KB of growth.
- **VIM-03 disposition (2026-06-03 per 22-01-B dogfood):** vim-toggle in Settings does NOT hot-reload; user must reload Obsidian. Banner explicitly NOT shipped. README "Known notes" section documents the requirement. REQUIREMENTS.md VIM-03 marker = "Resolved by 'reload required' documentation."
- **POLISH-03 scope-boundary deferral (2026-06-03):** innerHTML scan in `src/widget/` PASS (zero active assignments — operative D-gate-02 concern intact). `npm run lint` 81-error baseline pre-existed Phase 22 (verified at commit 245f45b — identical output). Per Rule 3 SCOPE BOUNDARY, deferred to a Phase 22.5 mini-phase scope (~3 hours: `--fix` auto-corrections + ~26 hand-fixes + baseline-gate wiring). Plugin-store auto-rejection guard intact.

### Pending Todos

- Multi-fence support per problem note — deferred to v1.4 (see ROADMAP Backlog + `.planning/todos/completed/2026-06-11-multi-fence-support-per-problem-note.md`)

### Blockers/Concerns

(None — all v1.3 empirical risks resolved; milestone shipped via BRAT dogfood.)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260514-k39 | Fix Obsidian plugin store auto-review ESLint errors and warnings | 2026-05-14 | 80a51ca | [260514-k39-fix-obsidian-plugin-store-auto-review-es](./quick/260514-k39-fix-obsidian-plugin-store-auto-review-es/) |
| 260528-vq4 | Add useNestedEditor toggle setting | 2026-05-29 | 5480c03 | [260528-vq4-add-usenestededitor-toggle-setting](./quick/260528-vq4-add-usenestededitor-toggle-setting/) |
| 260605-vny | Fix widget cursor jump and char rollback (BRAT regression) | 2026-06-06 | 064d0ce | [260605-vny-fix-widget-cursor-jump-and-char-rollback](./quick/260605-vny-fix-widget-cursor-jump-and-char-rollback/) |
| 260605-wle | Document widget cursor-jump rollback debug findings (D/E/F/G followups) | 2026-06-06 | b8034bd | [260605-wle-document-widget-cursor-jump-rollback-deb](./quick/260605-wle-document-widget-cursor-jump-rollback-deb/) |
| 260605-wux | Fix multi-pane preview→openProblem leaf-targeting bug | 2026-06-06 | 237de28 | [260605-wux-fix-multi-pane-preview-leaf-targeting](./quick/260605-wux-fix-multi-pane-preview-leaf-targeting/) |
| 260607-uko | Add quick problem search via palette + double-shift | 2026-06-08 | 7131191 | [260607-uko-add-quick-search-shift-shift](./quick/260607-uko-add-quick-search-shift-shift/) |
| 260608-qf6 | Fix issue #16 cookie filter (host-only csrftoken capture + 30s watchdog) | 2026-06-08 | — | [260608-qf6-issue-16-cookie-filter](./quick/260608-qf6-issue-16-cookie-filter/) |
| 260621-154 | Fix pattern-classification hub bugs: seed-aware normalizePatternName + hub filename sanitization | 2026-06-21 | 64e9c84 | [260621-154-fix-pattern-classification-hub-bugs-seed](./quick/260621-154-fix-pattern-classification-hub-bugs-seed/) |

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
| Widget | Multi-fence support per problem note | Deferred to v1.4 | 2026-06-12 |
| Lint | Repo-wide eslint baseline cleanup (~81 errors, predates Phase 22) — POLISH-03 tail | Deferred (post-v1.3) | 2026-06-03 |

## Session Continuity

Last session: 2026-06-12 — v1.3 milestone close
Stopped at: v1.3 archived (milestones/v1.3-ROADMAP.md + v1.3-REQUIREMENTS.md), PROJECT.md evolved, RETROSPECTIVE.md created, REQUIREMENTS.md removed, git tag 1.3.0 present (stable shipped 2026-06-12).
Resume file: —
Next action: Start the next milestone with `/gsd-new-milestone`. First v1.4 candidate already on the board: multi-fence support per problem note (ROADMAP Backlog).

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
