# Phase 20: Reconciliation, UX, Action Row, Section Protection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 20-reconciliation-ux-action-row-section-protection
**Areas discussed:** Conflict modal + reload UX, Action row layout & contents, Section protection scope (PROTECT-01/02), Plan structure / vertical-slice ordering

---

## Conflict Modal + Reload UX

### Q1 — What counts as 'local in-flight typing' that triggers the conflict modal?

| Option | Description | Selected |
|--------|-------------|----------|
| Any unflushed chars (Recommended) | If the debouncedWriter has ANY pending content (timer armed, not yet flushed), external edit triggers conflict modal. Aligns with v1.3 "never lose data" thesis. | ✓ |
| Unflushed for >Nms | Only treat as in-flight if pending edits >N ms old. Reduces modal noise but adds tunable threshold. | |
| Widget has focus + unflushed | Conflict modal only if widget focused AND has unflushed. Maps to "I'm typing here right now." | |
| Always silent reload | Skip modal entirely. Simpler — but violates "never lose data." | |

**User's choice:** Any unflushed chars (Recommended) → D-conflict-01

---

### Q2 — What does the 'View diff' button do in the conflict modal?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline 3-pane diff in modal (Recommended) | Modal expands to show Mine / External / Merged preview. Pure-TS line diff (LCS), ~150 LOC. | ✓ |
| Open temp diff file in tab | Spawn a new pane with both versions; standard Obsidian diff syntax-highlighting. | |
| Hide 'View diff' — just Keep mine / Keep external | Drop the third button. User decides blind. | |
| Open in OS-level diff tool (vimdiff/git mergetool) | Shell out to user's configured difftool. Plugin-store unfriendly. | |

**User's choice:** Inline 3-pane diff in modal (Recommended) → D-conflict-02

---

### Q3 — Cursor preservation strategy on silent reload (no-conflict path — SYNC-04)?

| Option | Description | Selected |
|--------|-------------|----------|
| Line/col clamp (Recommended) | Capture (line, col), clamp to new doc bounds, restore. Matches Obsidian's external-file behavior. | ✓ |
| Token-anchor scan | Capture 32 chars around cursor, search for it on reload. Survives line insertion/deletion above cursor; slow on large docs. | |
| Reset to top of fence | Always (0,0). Simplest but annoying for large reloads. | |
| Restore from Phase 19 historyJSON snapshot | Replay history. Heaviest; undo stack survives reload as side-effect. | |

**User's choice:** Line/col clamp (Recommended) → D-conflict-03

---

### Q4 — What happens if a SECOND external edit arrives while the conflict modal is already open?

| Option | Description | Selected |
|--------|-------------|----------|
| Update 'External' pane silently (Recommended) | Modal stays open; External column re-renders to latest disk content; diff recomputes. | ✓ |
| Show 'updated' banner | Same as above with a small fade-after-2s banner. | |
| Drop — ignore until user closes modal | Show only the FIRST external edit; subsequent silently dropped. Data-loss-prone. | |
| Stack — show new modal on top | Each external edit pops a new modal. Likely bad UX during Sync storms. | |

**User's choice:** Update 'External' pane silently (Recommended) → D-conflict-04

---

## Action Row Layout & Contents

### Q1 — Where should the action row sit relative to the embedded editor?

| Option | Description | Selected |
|--------|-------------|----------|
| Below editor (Recommended) | Buttons under the editor body, just above the fence closer. Matches v1.2 reading-mode placement. | ✓ |
| Above editor | Buttons above editor body. Easier to reach without scrolling for short solutions. | |
| Both — chevron above, buttons below | Visually balanced; chevron-as-state-indicator at top. +1 row of vertical space. | |
| Floating bottom-right | Absolute positioned. Clean editor body but loses on small viewports. | |

**User's choice:** Below editor (Recommended) → D-action-01

---

### Q2 — Where should the language chevron live, given the row is below the editor?

| Option | Description | Selected |
|--------|-------------|----------|
| Top-right of editor | Small chevron pill in top-right above editor's first line. | |
| Left of action row | Chevron at left end before [Run]; single horizontal strip. | |
| Right of action row | Chevron at right end after [Copy]; mirrors v1.2 placement. | |
| Reuse v1.2 languageChevronWidget.ts placement | Whatever the existing v1.2 widget does — mirror it byte-for-byte. | ✓ |

**User's choice:** "same as previously" → reuse v1.2 placement verbatim → D-action-02

---

### Q3 — Button set for the v1.3 widget row (ROADMAP s.c. 2 mentions Run/Submit/AI Debug/Reset/Copy; v1.2 row has Retrieve/Reset/AI Solution/Run/Submit)

| Option | Description | Selected |
|--------|-------------|----------|
| Add AI Debug + Copy now | Match ROADMAP s.c. 2 (Retrieve + Reset + AI Solution + AI Debug + Copy + Run + Submit). 7 buttons + chevron. | |
| Match v1.2 row exactly (defer Copy/AI Debug) | Ship the 5 v1.2 buttons. ROADMAP s.c. 2 becomes Phase 22 polish. | |
| Add AI Debug now; defer Copy | AI Debug is a real feature gap. Copy is convenience-only. | |
| Drop Retrieve from the v1.3 row | Replace Retrieve with AI Debug + Copy; row width similar. | |
| **Free text:** "Run / Submit / AI Solution / Reset / retrieve last submission, and language chevron, ai/run/submit on the right, others on the left" + screenshot | User specified exact button set + grouping via screenshot. | ✓ |

**User's choice:** "Match v1.2 row exactly verbatim" via screenshot → D-action-03

**Notes:** User attached a screenshot showing the active v1.2 row: `Java ▾ {} ↺` on the left, `✦ AI solution ▷ Run ☁ Submit` on the right. ROADMAP s.c. 2 wording (`Run/Submit/AI Debug/Reset/Copy`) is imprecise; flagged for ROADMAP correction at git_commit. AI Debug + Copy buttons are deferred ideas.

---

### Q4 — How should the widget connect its action buttons to the existing plugin handlers?

| Option | Description | Selected |
|--------|-------------|----------|
| Add new widget-aware methods (Recommended) | New runFromWidget / submitFromWidget / etc. v1.2 *FromActive unchanged. Clean separation. | ✓ |
| Make *FromActive widget-aware | Modify existing methods to detect widget. Single code path; v1.3 branch in v1.2 code. | |
| Mediator interface | `interface CodeSource { getCode(): string }`. Most testable; slight ceremony. | |
| Override active-leaf code provider when widget focused | Hijack getActiveViewOfType. Subtle; risks side-effects. | |

**User's choice:** Add new widget-aware methods (Recommended) → D-action-04

---

## Section Protection Scope (PROTECT-01/02)

### Q1 — What about ## Code heading line itself? PROTECT-01 mentions only Problem body + Techniques heading; v1.2 also locks ## Code line.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep ## Code heading locked (Recommended) | Match v1.2 — lock the literal '## Code' line. Conservative; matches v1.0 validated UX. | ✓ |
| Stop locking ## Code heading | Less protection; widget keeps working if heading deleted (depending on fenceLocator). | |
| Lock ## Code heading only when adjacent to leetcode-solve fence | Conditional; most precise; most code. | |
| Defer decision to fenceLocator behavior probe | Empirical test in plan: does fenceLocator depend on heading? | |

**User's choice:** Keep ## Code heading locked (Recommended) → D-protect-01

---

### Q2 — What about the 'leetcode.*' userEvent bypass?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep bypass in new extension (Recommended) | New extension honors `'leetcode.*'`. v1.2 path keeps using it (chevron, Reset). Phase 22 removes. | ✓ |
| Drop bypass; widget writes never touch protected ranges anyway | Widget vault.process is below CM6. But v1.2 path still alive — would break chevron + Reset. | |
| Keep bypass but add deprecation log | Honor the bypass; emit console.warn once per session. Surfaces dead-path discovery. | |
| New extension defaults to bypass-on-userEvent regardless of value | Any non-empty userEvent bypasses. Could leak under unrelated patterns. Not recommended. | |

**User's choice:** Keep bypass in new extension (Recommended) → D-protect-02

---

### Q3 — Should sectionProtectionExtension.ts run only when useInlineWidget=ON, or always when there's an lc-slug?

| Option | Description | Selected |
|--------|-------------|----------|
| Always when lc-slug (Recommended) | Same lifecycle as v1.2. Mutually exclusive with sectionLockExtension. | ✓ |
| Only when useInlineWidget=ON | When OFF, doesn't register. Marginally more code, clearer intent. | |
| Both always; sectionProtectionExtension augments sectionLockExtension | Two changeFilters running. Confusing; double surface for bugs. | |
| Always when lc-slug, but only Problem+Techniques (not Code heading) | Splits responsibility unpredictably. | |

**User's choice:** Always when lc-slug (Recommended) → D-protect-03

---

### Q4 — How do we land sectionProtectionExtension.ts (527 LOC v1.2 base)?

| Option | Description | Selected |
|--------|-------------|----------|
| Fork sectionLockExtension.ts, delete fence-opener/closer logic, rename (Recommended) | Copy 527 LOC; surgically remove fence-opener/closer. Predictable diff; same edge-case coverage. | ✓ |
| Greenfield rewrite (~150 LOC) | Cleaner code; high risk of regressing boundary fix + blank-line + malformed-note edge cases. | |
| Wrap sectionLockExtension.ts with a config flag | `protectFenceRange: boolean` option. Violates PROTECT-01 "replacing" wording. | |
| Fork + run extensive UAT regression suite | Fork as in option 1 + regenerate Phase 5.5 UAT cases. | |

**User's choice:** Fork sectionLockExtension.ts, delete fence-opener/closer logic, rename (Recommended) → D-protect-04

---

## Plan Structure / Vertical-Slice Ordering

### Q1 — How should Phase 20 split into plans?

| Option | Description | Selected |
|--------|-------------|----------|
| 4 vertical slices (Recommended) | 20-01 Section protection + vim-live; 20-02 Action row + chevron + *FromWidget; 20-03 Reconciliation + conflict modal; 20-04 Theme retheme + multi-pane. | ✓ |
| 3 slices (merge theme into action-row) | 20-01 Protection + vim; 20-02 Action row + chevron + theme + multi-pane; 20-03 Reconciliation. Tighter; risks LOC budget. | |
| 5 slices (split conflict modal) | Add separate 'external-edit silent reload' before 'conflict modal'. More plan overhead. | |
| Decide after research | Defer to gsd-plan-phase. Risk: planner may produce mega-plan or over-split. | |

**User's choice:** 4 vertical slices (Recommended) → D-plan-01

---

### Q2 — In what order should the 4 plans run?

| Option | Description | Selected |
|--------|-------------|----------|
| Foundation → UX → Sync → Polish (Recommended) | 20-01 → 20-02 → 20-03 → 20-04. Each checkpoint unlocks more dogfood. | ✓ |
| UX → Sync → Foundation → Polish | Action row first for highest user-visible value. Risks contamination if protection breaks. | |
| Sync → UX → Foundation → Polish | Reconciliation first for highest-uncertainty surface. Hard to dogfood without action row. | |
| Parallel: 20-01 + 20-02 first; 20-03 + 20-04 second | Faster wall-clock; risks merge conflicts on WidgetController.ts. | |

**User's choice:** Foundation → UX → Sync → Polish (Recommended) → D-plan-02

---

## Claude's Discretion

- **Theme detection probe** (Plan 20-04): `app.workspace.on('css-change')` existence in `obsidian@1.12.3` is unverified — researcher to grep `node_modules/obsidian/obsidian.d.ts`. `MutationObserver` on `document.body.classList` is the documented fallback.
- **Vim live-reconfigure failure-mode classification** (Plan 20-01): "reconfigure works but insert-mode glitches" = fail (ship VIM-03 banner Phase 22); "reconfigure works after one no-op keystroke" = pass. Planner has discretion to raise the bar.
- **Multi-pane "Take over" affordance** (Plan 20-04): three options surfaced (greyed-out + CTA / frozen-readonly snapshot / banner-across-both). Planner picks based on least-flicker preservation.
- **`processFrontMatter` ↔ `vault.on('modify')` ordering**: empirical question for Plan 20-02; if frontmatter writes trigger a modify event, selfWriteSuppression must absorb it.
- **3-pane diff syntax-highlighting** (Plan 20-03): recommend yes (reuse `languageCompartment`); planner can defer if it slows the plan.
- **Conflict-modal "Keep mine" debounce semantics** (Plan 20-03): recommend immediate flush (deliberate user action); planner finalizes.

## Deferred Ideas

- **AI Debug button in widget action row** — Not part of v1.2 row; defer to future polish phase.
- **Copy button in widget action row** — User can Cmd-A Cmd-C in editor; defer.
- **Multi-pane live/mirror sync (MULTI-01, MULTI-02)** — v1.4+. Phase 20 ships single-active + "Take over" CTA only.
- **PROTECT-03: 'leetcode.*' userEvent removal** — Phase 22, paired with v1.2 path deletion.
- **VIM-03: Reload-on-toggle banner** — Phase 22, only if Plan 20-01 dev-vault probe shows live-reconfigure unreliable.
- **THEME-05: Theme regression visual gate** — Phase 22 release gate.
- **DELETE-01..07: v1.2 file deletion** — Phase 22.
- **POLISH-01: useInlineWidget flip to default ON** — Phase 22.
- **ROADMAP s.c. 2 wording correction**: change "Run / Submit / AI Debug / Reset / Copy" to "Retrieve / Reset / AI Solution / Run / Submit" to match v1.2 button set + screenshot. Could land in Phase 20 git_commit or Phase 22 doc sweep.
