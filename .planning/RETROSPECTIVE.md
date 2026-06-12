# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — Inline Widget Architecture

**Shipped:** 2026-06-12
**Phases:** 5 (19, 20, 21, 21.1, 22) | **Plans:** 35 | **Tag:** 1.3.0

### What Was Built
- Self-contained inline `leetcode-solve` widget with its own embedded CM6 `EditorView`, mounted via a two-path strategy (Reading-mode code-block processor + Live Preview ViewPlugin `Decoration.replace`).
- One-way sync: widget edits → debounced `app.vault.process` (the sole mutation primitive) → atomic fence-body rewrite. File is the single source of truth; parent CM6 is a passive consumer.
- Per-path content-hash echo suppression (2s TTL), per-file rate-limiting, six flush-on-transition hooks, `atomicRanges` cursor containment, and a 30s-TTL state-persistence map.
- External-edit reconciliation via `vault.on('modify')` + a conflict modal (Keep mine / Keep external / View diff with inline LCS line-diff).
- Lazy, atomic, single-`vault.process` migration of v1.2 notes on first open, with a 30-day backup sidecar and CI fixtures across v1.0/v1.1/v1.2 sample notes.
- Hard cutover deleting the entire v1.2 dual-CM6 stack (5 files + ~800 LOC of `src/main.ts` wiring + the `'leetcode.*'` userEvent convention) — net −3,325 LOC.

### What Worked
- **Coexistence-behind-a-flag, then cutover.** Phases 19–21 built the v1.3 path behind `useInlineWidget=OFF` while v1.2 stayed the user-facing default; Phase 22 flipped the flag and deleted v1.2. This kept main shippable throughout and made the risky rewrite reversible until the final phase.
- **Architectural decisions locked up front (Q1–Q7) held.** Two-path mount, per-path content-hash suppression (not a boolean), `atomicRanges`, narrowed section protection, lazy atomic migration — all of these survived implementation without reversal. The pre-decided answers prevented mid-stream thrash.
- **`vault.process` as the single write path** made the whole sync layer reason-about-able and retry-safe; it is the load-bearing invariant the rest of the design leaned on.
- **BRAT dogfood + `/gsd-quick` fix loop** caught the residual live-Obsidian bugs (cursor-jump/char-rollback, multi-pane preview leaf-targeting, issue-16 cookie filter) and shipped them quickly without reopening phases.

### What Was Inefficient
- **Long live-Obsidian bug tail.** vitest cannot render CM6, so the highest-risk behaviors (atomicRanges cursor-stop, self-write remount cycle, decoration RangeError, vim state loss on flush) were only observable in a live Obsidian instance. This produced heavy gap-closure churn: Phase 20 needed a 20-10 gap-closure plan + 7 hotfix patches; Phase 21 spawned 21-05…21-17 across two re-test cycles; and an entire follow-up phase (21.1) existed solely to fix a typing-flicker (R10) that unit tests could never have surfaced.
- **14 debug sessions accumulated** across the milestone — most diagnosed-but-not-formally-closed until milestone-close cleanup. The debug-session lifecycle drifted from the verification lifecycle.
- **Verification status stuck at `human_needed`** for Phases 19/20/21 because the must-have proofs were inherently human-only; the artifacts sat un-finalized until close even though the work was validated in dogfood. The "human-needed verification" state needs a faster path to "confirmed via dogfood."
- **Self-write remount cycle was discovered in Phase 19 but not fully resolved until Phase 20+** — a known major issue carried across a phase boundary as a documented deferral rather than blocking.

### Patterns Established
- **One mutation primitive.** All vault writes go through `app.vault.process`; no `cm.dispatch` into the parent doc. Echo suppression is a per-path content-hash map with a shared TTL constant, never a boolean flag.
- **Widget owns the fence range.** With `atomicRanges`, fence opener/closer locks become moot — section protection narrows to just `## Problem` body + `## Techniques` heading.
- **Lazy-on-open atomic migration** (never batch-on-load) + backup sidecar with TTL GC — the v1.1 lazy-Techniques-migration discipline generalized into a reusable pattern.
- **Build-behind-flag → dogfood → cutover** for architecture-replacement milestones.

### Key Lessons
1. **For CM6/Obsidian-renderer work, plan the human-UAT and dogfood budget as a first-class phase, not an afterthought.** The unit-test suite (~2,873 tests) gave false confidence; every milestone-defining bug lived in the rendered DOM. Front-load dev-vault probes for each empirical risk on day one of the phase.
2. **A single-issue follow-up phase (21.1) is a healthy signal, not a failure** — isolating the flicker fix from Phase 22's deletion work kept the cutover clean. Resist bundling.
3. **Close debug sessions and finalize verification status as work lands, not at milestone close.** The 22-item audit backlog at close was entirely lifecycle drift, not real open work.
4. **Architecture decisions made and frozen before coding (the Q1–Q7 set) paid for themselves** — zero were reversed during the 5 phases.

### Cost Observations
- Model mix: predominantly Opus for planning/architecture and Sonnet for execution (per OMC routing); a 32-agent debug workflow (`wf_b127f280-b9e`) was used for the cursor-jump/char-rollback investigation.
- Notable: the most expensive activity by far was iterating on live-Obsidian-only bugs through plan → ship → re-test cycles, because each loop required a human in a real vault.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 10 | 61 | Initial build; problems-as-notes + run/submit + section locking |
| v1.1 Contest/AI/Preview | 9 | 41 | Added AI provider layer + streaming transport; lazy-on-AC migration discipline |
| v1.2 Code Editor | 6 | 31 | Nested CM6 editor + bidirectional sync (the stack v1.3 later replaced) |
| v1.3 Inline Widget | 5 | 35 | Editing-model rewrite: one-way sync, single source of truth; build-behind-flag → dogfood → cutover |

### Cumulative Quality

| Milestone | Tests | Bundle | Net LOC signal |
|-----------|-------|--------|----------------|
| v1.0 | 652 | ~163 KB | initial |
| v1.1 | 1,450 | 1.155 MB | +AI SDK |
| v1.2 | 1,713 | 1.71 MB | +language packs + vim |
| v1.3 | ~2,873 | 1,723 KB | −3,325 LOC in src/ (deletion-heavy) |

### Top Lessons (Verified Across Milestones)

1. **Vault writes go through `app.vault.process`** — established v1.0, reinforced every milestone, became the sole primitive in v1.3.
2. **Never batch-rewrite vault data on plugin load** — lazy-on-AC (v1.1 Techniques) generalized to lazy-on-open (v1.3 migration). Both shipped with backups/idempotency.
3. **CM6/Obsidian behavior is only truly verifiable in a live vault** — the unit suite guards regressions but never substitutes for human UAT + dogfood on rendered-DOM behavior.
4. **Dogfood-driven development (author is the primary user)** consistently surfaces the real UX bugs that specs miss — every milestone's late fixes came from daily-practice use.
