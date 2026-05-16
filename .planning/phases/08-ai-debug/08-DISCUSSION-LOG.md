# Phase 08 Discussion Log — AI Debug

**Phase:** 08 — AI Debug
**Date:** 2026-05-15
**Mode:** discuss (default)

This log is for human reference only. Downstream agents read `08-CONTEXT.md`, not this file.

---

## Areas selected for discussion

User selected ALL four offered gray areas:

1. Prompt scope — what AI sees
2. LastVerdictStore shape + lifetime
3. Button placement + conditional visibility
4. Modal UX + cancel posture

---

## Area 1 — Prompt scope

### Q1.1 — `## Notes` send posture

**Options presented:**

- ☐ Never send `## Notes` (Recommended)
- ☐ Per-call toggle in the modal (checkbox)
- ☐ Settings toggle, default off

**Selected:** Never send `## Notes` (Recommended)

**Rationale (Claude):** REQUIREMENTS.md already lists "AI rewriting `## Notes`" as out-of-scope; the same posture extends to "AI reading `## Notes`". `## Notes` is the user's reflection scratch space. Never-send keeps the disclosure copy honest and removes a leak vector.

### Q1.2 — Extra inputs beyond mandatory

**Options presented (multiSelect):**

- ☐ Problem topic tags + difficulty
- ☐ Selected code language (e.g. python3, java)
- ☐ Problem URL / slug
- ☐ Nothing extra — keep prompt minimal

**Selected:** Selected code language only.

**Rationale:** Language is unambiguous (chevron / fence info-string already exposes it); skipping it would force AI to guess. Topic tags + difficulty + URL deferred — small token cost but rejected for prompt minimalism.

### Decision summary (Area 1)

Mandatory inputs only: problem text, `## Code`, last verdict + failing test, language. Empty-store path: include literal `"No verdict yet — review the code as-is."` so AI Debug gracefully degrades to general code review (button stays visible per Area 3).

---

## Area 2 — LastVerdictStore

### Q2.1 — When is the verdict captured?

**Options presented:**

- ☐ Both Run failures and Submit failures (Recommended)
- ☐ Submit failures only
- ☐ Run failures only

**Selected:** Both (Recommended)

**Rationale:** Mirrors real debugging flow — user runs sample, sees a failure, hits Debug. Submit-only would force a Submit (with judge cost + lockout) before Debug is useful; Run-only misses the Submit-WA-on-hidden-test case.

### Q2.2 — Scope + persistence

**Options presented:**

- ☐ Per-slug, in-memory only (Recommended)
- ☐ Per-slug, persisted in data.json
- ☐ Single global last verdict

**Selected:** Per-slug, in-memory only (Recommended)

**Rationale:** Mirrors `EphemeralTabStore` precedent. No data.json bloat, no expiry policy, no shape-guards. Plugin reload is a clean-slate mental model for debug context.

### Q2.3 — Empty-store behavior

**Options presented:**

- ☐ Send prompt with no failure block (Recommended)
- ☐ Disable button until verdict exists
- ☐ Show Notice "Run or Submit first"

**Selected:** Send prompt with no failure block (Recommended)

**Rationale:** Graceful-degrade is the lowest-friction path. AI gets a "No verdict yet — review the code as-is" line; user can still ask AI for early-stage code review. Disabled-button path adds discovery cliff; Notice path adds friction without value.

### Decision summary (Area 2)

`Map<slug, LastVerdict>` on `LeetCodePlugin` instance. Captures non-Accepted verdicts from BOTH Run and Submit. Cleared on plugin unload. Not persisted. Empty-store path graceful-degrades to general code review.

---

## Area 3 — Button placement

### Q3.1 — Where does the AI Debug button live?

**Options presented:**

- ☐ 3rd button in the Run/Submit row (Recommended)
- ☐ Separate row below the fence
- ☐ Edit Mode only (CM6 widget)
- ☐ Palette command only — no fence button

**Selected:** 3rd button in the existing Run/Submit row + **also a Debug button in the Run/Verdict modal when verdict is non-Accepted**.

**Note:** User added the verdict-modal surface mid-question. Two surfaces locked: fence row (always-visible, both Edit + Reading) AND verdict modal footer (conditional on non-Accepted).

**Rationale:** Fence row matches Run/Submit discovery; verdict modal gives zero-friction "Run failed → Debug" without the user having to navigate back to the fence. Two surfaces, one underlying entry point (`LeetCodePlugin.openAIDebug(slug)`).

### Q3.2 — Visibility rules for the fence-row button

**Options presented:**

- ☐ Always visible when fence is under `## Code` (Recommended)
- ☐ Only visible when LastVerdictStore has an entry
- ☐ Always visible + label changes by verdict presence

**Selected:** Always visible when fence is under `## Code` (Recommended)

**Rationale:** Same rules as Run/Submit. Predictable, no flicker as CM6 widgets rebuild. Empty-store path (Area 2) handles the no-verdict case in-modal.

### Q3.3 — Palette command?

**Options presented:**

- ☐ Yes — `ai-debug` palette + button (Recommended)
- ☐ Button only

**Selected:** Yes — palette command + button (Recommended)

**Rationale:** Palette is the Obsidian power-user norm; mirrors Phase 07 precedent (`test-ai-connection`, `reset-ai-disclosures`, `clear-ai-key`).

### Decision summary (Area 3)

THREE surfaces:

1. Fence-row 3rd button (Edit + Reading), always visible.
2. Verdict-modal footer button, conditional on non-Accepted verdict.
3. `ai-debug` palette command, `editorCheckCallback`-guarded by `lc-slug` frontmatter.

All three call `LeetCodePlugin.openAIDebug(slug)` — single entry point.

---

## Area 4 — Modal UX

### Q4.1 — Stream render strategy

**Options presented:**

- ☐ Plain-text streaming, Markdown render at end (Recommended)
- ☐ Markdown re-render on every chunk
- ☐ Plain-text only, no Markdown render

**Selected:** Markdown re-render on every chunk

**Note:** User's preference is the polished/risky path. CONTEXT.md flags this as the single most uncertain decision in Phase 08; researcher's verification gate must validate stability with `MarkdownRenderer.render` under repeated calls. Fallback (debounce or render-at-end) is documented as the planner's escape hatch if the live path is unstable.

### Q4.2 — Cancel posture

**Options presented:**

- ☐ Immediate kill, keep partial output, modal stays open (Recommended)
- ☐ Immediate kill, close modal, partial output discarded
- ☐ Confirm dialog before kill

**Selected:** Immediate kill, keep partial output, modal stays open (Recommended)

**Rationale:** AIDBG-03 says "without leaving modal in bad state" — partial output preserved is more useful (user can copy what arrived); modal stays open so user has explicit closure control.

### Q4.3 — Fallback indicator

**Options presented:**

- ☐ `Thinking…` + mm:ss counter, buffered render at end (Recommended)
- ☐ Indeterminate spinner only
- ☐ Estimated time / progress bar

**Selected:** `Thinking…` + mm:ss counter (Recommended)

**Rationale:** Verbatim match to AIDBG-02 wording; counter signals "alive, not hung".

### Q4.4 — Modal action buttons

**Options presented (multiSelect):**

- ☐ Copy response to clipboard (Recommended)
- ☐ Re-run with same prompt
- ☐ Copy code only (extracts first fence)
- ☐ No extra buttons — just Close

**Selected:** Copy response to clipboard only.

**Rationale:** Re-run rejected to avoid cost-surprise pre-Phase-09 cap. "Copy code only" is apply-patch territory (AIPROV-FUT-03 — explicit out-of-scope).

### Decision summary (Area 4)

Live Markdown re-render per chunk (with researcher verification gate). Cancel = immediate-kill + partial output preserved + modal stays open with `[Close]` + `[Copy]`. Fallback shows `Thinking…` + `mm:ss` counter, body Markdown-renders once on response. Single Copy button after stream completes.

---

## Deferred ideas (captured during discussion)

- `## Notes` send toggle — explicitly rejected; revisit in v1.2 if dogfood shows debugging needs the user's hypothesis.
- Topic tags + difficulty + URL in prompt — rejected for minimalism.
- Re-run button — Phase 09 (after cost cap exists).
- "Copy code only" / extract-first-fence — apply-patch is AIPROV-FUT-03.
- LastVerdictStore data.json persistence — rejected; in-memory is sufficient.
- Multi-turn conversational debug — post-v1.1.
- AbortController-aware `requestUrl` — depends on Obsidian API support.
- Provider-side rate-limit awareness (429 backoff) — Phase 09 candidate if dogfood surfaces it.

---

## Items left to Claude's discretion (not user-facing decisions)

- Exact `LastVerdict` shape — researcher pins against orchestrator output.
- AIClient.invokeStream vs polymorphic invoke — recommended Option 1 (separate method) for symmetry with LeetCodeClient; planner has final say.
- LastVerdictStore file location — recommended `src/solve/lastVerdictStore.ts`.
- `withDebugBullet` factory location — recommended `src/ai/disclosure.ts`.
- AIStreamModal title model-name inclusion — recommended provider only.
- Fence-row button label — recommended `'AI: Debug'`.

---

*Discussion log: 2026-05-15*
