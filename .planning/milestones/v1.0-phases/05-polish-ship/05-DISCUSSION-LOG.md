# Phase 5: Polish & Ship — Discussion Log

**Gathered:** 2026-05-09
**Mode:** discuss (default, no flags)

---

## Area 1: Run UX Rework (POLISH-07)

### Q1 — Pin to note: keep as opt-in escape hatch, or drop entirely?

**Options presented:**
- Drop pinning entirely (ephemeral-only; plugin never writes to `## Custom Tests`)
- Keep Pin as escape hatch (ephemeral default, explicit `Pin to note` button available)

**User selection:** Drop pinning entirely.

**Notes:** User clarified during preamble: "I like a modal with test case tab, prepopulated with examples. I can add new ones or modify existing ones, I want ephemeral, but I want the lifecycle to be extended — as long as the md is open, it should remain, when I close it, it's gone, next time I run, it opens a new modal again, and prepopulate with example." This was a scope shift from POLISH-07's roadmap wording; D-01 / D-02 capture the new shape.

### Q2 — What to do with existing `## Custom Tests` sections (legacy from Phase 3)?

**Options presented:**
- Ignore — leave as-is (plugin never reads or writes the section)
- Seed ephemeral from existing (read once, then ignore — awkward half-state)
- Strip on first Run (destroys user content)
- Migration prompt (one-time Notice)

**User selection:** Ignore — leave as-is.

**Notes:** Locked in D-08. Zero migration risk; users can manually clean if they want.

### Q3 — When does the ephemeral tab state reset?

**Options presented:**
- Note close — any leaving of the file
- All note leaves closed (any pinned tab / split pane keeps state alive)
- Plugin reload / Obsidian restart only

**User selection:** All note leaves closed.

**Notes:** Locked in D-02. Implementation detects via `workspace.on('file-close')` + `workspace.getLeavesOfType('markdown')` residual-leaf check.

### Q4 — Modal close + reopen within same note-open session — what's in the tab row?

**Options presented:**
- Samples + previously-added ephemeral tabs (modal close is NOT a lifecycle boundary)
- Fresh samples only (every modal open = clean slate)

**User selection:** Samples + previously-added ephemeral tabs.

**Notes:** Locked in D-03. Modal is a view over the `ephemeralTabStore`, not its owner.

### Q5 — Run semantics (current active tab only, or all non-empty tabs joined)?

**Options presented:**
- Run active tab only (single result; simpler)
- Run all non-empty tabs (Phase 3 behavior; multi-case result)

**User selection:** Run active tab only.

**Notes:** Locked in D-07. Phase 3's newline-joined blob behavior is dropped.

### Q6 — Edit a sample tab, close modal, reopen — what do you see?

**Options presented:**
- Edited text persists; labeled as modified
- Edited text persists; no visual difference
- Samples always reset on modal reopen

**User selection:** User amended the scope: "2 and 3, but upon reopen, don't populate again, essentially, only the first time prepopulate sample, further ones should just load ephemeral (whatever in the test cases are ephemeral, edit or not). Add a button to reset the test case."

**Notes:** Locked in D-03, D-04, D-05. The sample/custom distinction dissolves after the first-per-note-open seed; every tab is uniform thereafter. Reset button is the only re-seed affordance.

### Q7 — Can the user delete a sample tab?

(This question was folded into the Q6 answer — user described the full model in one turn. D-06 captures the delete discipline: everything deletable, minimum-1-tab guard.)

---

## Area 2: Settings UI Completeness (POLISH-01)

### Q8 — Settings tab section layout?

**Options presented:**
- Auth / Notes / Knowledge Graph
- Auth / Notes (everything else here)
- Auth / Notes / Advanced (collapsible)

**User selection:** Auth / Notes / Knowledge Graph.

**Notes:** Locked in D-14. Three sections. New section holds the auto-backlink toggle + technique folder override.

### Q9 — Technique folder: visible override or locked-derived?

**Options presented:**
- Locked-derived (current Phase 4 D-15)
- Visible override with derived default

**User selection:** Visible override with derived default.

**Notes:** Locked in D-15. Empty value → derived default (`{problemsFolder}/Techniques`). Non-empty → override. Reuses `sanitizeFolder`.

### Q10 — Auto-backlink toggle copy (behavior-first / value-first / minimal)?

**Options presented:**
- Behavior-first (from pending todo) — label/desc verbatim from the Phase 4 todo file
- Value-first — emphasizes the graph-building benefit
- Minimal — terse

**User selection:** Behavior-first (from pending todo).

**Notes:** Locked in D-16. Copy verbatim from `.planning/todos/pending/settings-ui-auto-backlinks-toggle.md`.

### Q11 — Run UX invocation surface (command palette only / + ribbon / + code-block overlay)?

**Options presented:**
- Command palette only (FND-03 default)
- Command palette + editor ribbon button
- Command palette + overlay on ## Code block (pulls in deferred overlay work)

**User selection:** User asked for simplification: "Command palette + button, if overlay is too complicated, can you use 2 button instead? after the code block fenced tag?"

**Notes:** Locked in D-11, D-12, D-13. Reading Mode `MarkdownPostProcessor` appends Run + Submit buttons below each rendered `<pre><code>` block when the note has `lc-slug` frontmatter. Live Preview / CM6 path deferred past v1. This is the smaller-surface replacement for the chevron overlay (which remains deferred).

---

## Area 3: Error Handling UX (POLISH-02)

### Q12 — 429 rate-limited behavior?

**Options presented:**
- One-shot Notice (current CF-10)
- Notice + auto-retry after backoff
- Inline error wherever the command originated

**User selection:** Notice + auto-retry after backoff.

**Notes:** Locked in D-18. One retry after 5s cooldown; if retry fails, second Notice, no further retry.

### Q13 — LC offline / network failure?

**Options presented:**
- Notice + no retry (command fails)
- Notice + command-specific fallback
- Unified banner in ProblemBrowserView

**User selection:** Notice + no retry.

**Notes:** Locked in D-19. Copy `Couldn't reach LeetCode. Check your connection.` (sentence case + terminal period). User retries manually.

### Q14 — Network timeout threshold and behavior?

**Options presented:**
- 30s per request, Notice on timeout
- 10s per request, Notice on timeout
- Submit polling special (exp-backoff to 30s); all others 10s

**User selection:** Submit polling special; all others 10s.

**Notes:** Locked in D-20. Submit polling (Phase 3 D-21) untouched. Everything else uses 10s timeout. Notice copy `LeetCode is slow to respond. Try again.`

### Q15 — Expired session re-auth flow?

**Options presented:**
- User-driven (current CF-04)
- Notice + auto-open login window
- Notice with clickable action

**User selection:** Notice with clickable action.

**Notes:** Locked in D-21. Notice copy unchanged (CF-04 lock); gains `Log in` action button via `Notice.addAction()` (Obsidian 1.x API). Action callback invokes `AuthService.login()`.

---

## Area 4: Ship Checklist (POLISH-04/05/06)

### Q16 — Release version?

**Options presented:**
- 1.0.0 (community store submission)
- 0.1.0 (initial public)
- 0.1.0 now, 1.0.0 after community feedback

**User selection:** 0.1.0 (initial public).

**Notes:** Locked in D-23. Matches Phase 2 Bases v0.1.0 cadence. 1.0.0 bump happens post-community-feedback (tracked outside Phase 5).

### Q17 — README screenshots scope?

**Options presented:**
- Core loop (4 screenshots)
- Full feature surface (7-8 screenshots)
- Animated GIF + 2-3 static

**User selection:** Core loop (4 screenshots).

**Notes:** Locked in D-24. The 4: problem browser, problem note opened, submit verdict modal (Accepted), graph view edges.

### Q18 — Wave sequencing of Phase 4 deferred items + new Phase 5 work?

**Options presented:**
- Phase 4 deferreds first (blocker burn-down)
- Settings + error handling first (biggest UX wins)
- Run UX first (biggest behavior change — de-risk)

**User selection:** "you decide, i don't have strong preference, use your best judgement".

**Notes:** Claude's discretion. Captured in the Wave Sequencing section of CONTEXT.md: Settings UI → Error handling → Run UX rework → Reading-mode buttons + Phase 4 cosmetic polish → Ship. Rationale: Settings unblocks toggle dogfooding; error handling is low-risk foundation; Run UX gets middle slot so dogfooding shakes out issues; polish is cosmetic and burns down before the ship wave; ship needs all prior waves green for screenshots.

### Q19 — Store PR prerelease validation?

**Options presented:**
- Automated checklist script
- Manual checklist in PLAN.md
- Both — script for grep gates, manual for subjective

**User selection:** Both.

**Notes:** Locked in D-27, D-28. `scripts/prerelease-check.sh` grep-gates mechanical items (innerHTML / fetch / eval / telemetry strings / manifest validity / LICENSE / lint / tests / bundle size). Manual UAT checklist covers subjective items (screenshot match, no obfuscation, light+dark mode spot-check, community PR submission).

---

## Deferred Ideas Captured During Discussion

See the `<deferred>` section in 05-CONTEXT.md for the full list. Key items:
- Pin-to-note affordance
- Migration / strip of legacy `## Custom Tests` sections
- Live Preview / CM6 code-block actions
- Chevron overlay on `## Code`
- Diff view in SubmissionDetailModal
- Retroactive opt-out cleanup command
- Submission picker filter toggle
- Animated GIF / full-feature README screenshots
- Advanced / collapsible settings section
- Auto-open login on session expiry
- 1.0.0 release (post-Phase 5)
- Per-endpoint timeout tuning
- Further Notice auto-retries beyond first

## Claude's Discretion Captured

- Wave sequencing (user deferred to Claude's best judgement)
- Exact module naming (`RunModal.ts` vs. extending `CustomTestModal.ts`; `ephemeralTabStore.ts` vs. other names)
- Whether `customTestStore.ts` is deleted vs. kept (depends on remaining callers after D-01)
- Exact shape of the Notice `addAction` fallback if the API turns out unavailable in some supported Obsidian version (planner verifies during research)
- Precise requestUrl timeout implementation (native param vs. Promise.race wrapper)
- README section ordering beyond the fixed first-to-last pass (D-25 is a suggestion; planner may re-order if one flows better)

---

*Log written: 2026-05-09*
