# Phase 17: Polish & Edge Cases - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 17-Polish & Edge Cases
**Areas discussed:** Phase 17 scope perimeter, Reset undo scope regression, Edge inputs (paste / IME / Source↔Live Preview), Theme + Go highlighting + bundle/lifecycle cleanup, Fence opener/closer auto-recovery (added mid-discussion)

---

## Phase 17 scope perimeter

| Option | Description | Selected |
|--------|-------------|----------|
| Roadmap 5 + Reset undo only | Lock to 5 stated criteria + Reset undo. Defer 6 cosmetic carry-overs to v1.3. Smallest, most focused. | |
| Roadmap 5 + Reset + theme/Go cluster | Add theme HighlightStyle + dark-mode bracket contrast + Go syntax highlighting. 1–2 extra plans. | |
| Everything: roadmap 5 + all 7 carry-overs + store | Maximalist — also fixes Tab mid-line, fm reactivity, vim. Higher sprawl risk. | ✓ |
| Roadmap 5 only — Reset as separate hotfix phase | Reset becomes 17.1; Phase 17 stays pure. Cleaner separation, more ceremony. | |

**User's choice:** "roadmap 5 + all 7 carry-overs, we can do the store release later"
**Notes:** Plugin-store re-submission pushed to a post-v1.2 release phase — lets the editor experience stabilize internally before community-store ceremony. v1.3+ items (BRACKET-05, modular panels, IDE features) stay deferred.

---

## Reset undo scope regression

| Option | Description | Selected |
|--------|-------------|----------|
| Child-only history (dispatch via child CM6) | Reset writes through child CM6; child gets undo entry; mirror to parent with addToHistory:false. Sets canonical write-path pattern. | ✓ |
| addToHistory:false on parent dispatch | Cheaper fix; Reset becomes non-undoable. Loses 'undo accidental Reset' affordance. | |
| Annotation + custom history filter | Tag transactions; install parent-side history filter to exclude. More complex/flexible. | |
| Audit all plugin writes first | Research task before deciding per-path. Slower; produces invariants table. | |

**User's choice:** Child-only history dispatch (Recommended)
**Notes:** Decision sets the canonical write-path pattern (D-05) for any plugin write that touches the fence body. Copy to Code likely has the same latent issue — flagged for verification but not in-scope to refactor here unless a confirmed regression surfaces. Pattern documented in code comments + CLAUDE.md `## Conventions` so future writers don't repeat the parent-CM6-with-userEvent mistake.

---

## Edge inputs: paste / IME / Source↔Live Preview

| Option | Description | Selected |
|--------|-------------|----------|
| Verify-first, fix-only-if-broken | UAT scripts as deliverable when stock CM6 behavior is correct. Targeted fixes only on confirmed failure. Smallest plan. | ✓ |
| Proactive guards + regression tests | Belt-and-suspenders: explicit clipboard intercept + composition guards + Cmd-E lifecycle test. ~2 extra plans. | |
| Source Mode parity only — paste/IME assumed working | Focus highest-risk surface; spot-check the rest in UAT. | |

**User's choice:** Verify-first, fix-only-if-broken (Recommended)
**Notes:** UAT must include VS Code/StackOverflow/LC web paste cases, Chinese/Japanese/Korean IME composition flows, and a Cmd-E flip-with-pending-edits test. Stock CM6 has robust composition handling — speculative complexity avoided.

---

## Theme + Go highlighting + bundle/lifecycle cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Single HighlightStyle wave + single validation wave | Wave A: Obsidian-CSS-var HighlightStyle covering Lezer + Go + bracket-match. Wave B: bundle audit + lifecycle/leak verification. Two clean waves. | ✓ |
| Theme + Go together, defer bracket-match contrast | Same Wave A but skip bracket-match unless it falls out of HighlightStyle CSS. | |
| Three small plans (theme, Go, validation) | More granular tracking, more ceremony. | |
| Validation first; polish only if budget allows | Bundle + lifecycle as must-ship; theme/Go as 'fix if time'. | |

**User's choice:** Single HighlightStyle wave + single validation wave (Recommended)
**Notes:** Go is low-priority; if binding the StreamLanguage to themed HighlightStyle adds non-trivial overhead, leaving Go as plain text for v1.2 is acceptable. Quote: "go is low prio, if it's add too much overhead, i'm ok to leave it as is for 1.2".

---

## Smaller carry-overs (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Tab mid-line behavior | Cursor mid-line → insert tab; cursor at line-start → indent line. | ✓ |
| External lc-language frontmatter reactivity | metadataCache listener → Compartment.reconfigure on child. | ✓ |
| Vim mode in child editor | Conditional vim package — match Obsidian's vimMode setting. | ✓ |

**User's choice:** All three included.

---

## Vim mode acceptance bar

| Option | Description | Selected |
|--------|-------------|----------|
| Match Obsidian's vim setting | Read app.vault.getConfig('vimMode') at child mount; conditionally include vim package. No new plugin setting. | ✓ |
| Always-on vim if user opts in via plugin setting | New plugin setting; decoupled from Obsidian's global vim. | |
| Defer to v1.3 | Skip vim for Phase 17. | |

**User's choice:** Match Obsidian's vim setting (Recommended)
**Notes:** Bundle ceiling at 1.6 MB HARD; vim package adds ~30–60 KB. If estimate proves higher OR pushes bundle over ceiling, vim mode is excluded from v1.2 (do not raise ceiling further). Esc-to-parent escape hatch must be preserved with vim's Esc semantics — researcher to design.

---

## Wave shape

| Option | Description | Selected |
|--------|-------------|----------|
| 3 waves: Reset+Tab → Edge inputs+fm → HighlightStyle+vim+validation | Foundation → input edges → polish + ship-ready. | ✓ (Claude's discretion) |
| 2 waves: writes/edges → polish/validation | Bigger Wave 1; fewer waves. | |
| Let planner decide | Plan-phase determines structure based on dependency analysis. | |

**User's choice:** "up to you, do what you think is the best"
**Notes:** Claude selected 3-wave shape. Updated mid-discussion when fence-repair was added: Wave 1 now bundles Reset undo + fence opener/closer auto-recovery + Tab mid-line (all three touch the parent↔child write/sync module). Final wave shape may be re-validated by gsd-planner during plan-phase.

---

## Fence opener/closer auto-recovery (added mid-discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| Add to Phase 17 scope, treat as bug-fix | Same severity tier as Reset undo. Wave 1 candidate (shares write-path module). | ✓ |
| Investigate first, then decide | Spike a debug session, then confirm severity before scoping. | |
| Hotfix outside Phase 17 first | Standalone debug commit, then Phase 17 starts clean. | |

**User's choice:** Add to Phase 17 scope, treat as bug-fix (Recommended)
**Notes:** `repairFenceStructure` in `src/main/childEditorSync.ts:355` is not auto-recovering opener/closer correctly. Investigation must surface the root cause before fix; track in `.planning/debug/fence-auto-recovery-regression.md`. Regression test required after fix.

---

## Claude's Discretion

- File layout for themed HighlightStyle (new `src/main/childEditorTheme.ts` vs extending `childEditorFactory.ts`).
- Specific vim package selection (`@replit/codemirror-vim` vs current best-maintained CM6 6.x build) — researcher decides.
- Heap-snapshot tooling for lifecycle verification (manual DevTools vs Playwright-driven script).
- UAT layout (single `17-UAT.md` checklist vs split per-area files).
- Final wave shape — researcher/planner may consolidate or re-split.
- Whether the Reset child-CM6 dispatch userEvent stays as `'leetcode.reset'` on the child or becomes `'leetcode.reset.child'`.
- Whether `:w` in vim normal mode is a no-op or maps to Obsidian's save (researcher decision).

## Deferred Ideas

- **Plugin-store re-submission** — README, manifest 1.2.0 bump, community-plugins.json PR. Post-v1.2 release phase.
- **Go syntax highlighting** *(if non-trivial — see D-17)* — User-flagged "low priority, OK to leave as-is for 1.2."
- **Copy to Code undo-scope audit** *(latent)* — Same parent-CM6-dispatch issue as Reset likely; verify in v1.2.x or v1.3.
- **BRACKET-05 (triple-backtick)** — Stays Deferred from Phase 16.
- **Modular panel layout (LC-web-style resizable panels)** — v1.3+.
- **Full IDE features** (IntelliSense, linting, debugger, snippets, multi-cursor) — Not in v1.x.
