# Phase 09: AI ACed Review - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 09-ai-aced-review
**Areas discussed:** Review output shape, Cost cap behavior, Auto-run failure posture, Section placement + template

---

## Review Output Shape

### Structure of the 3-dimension review

| Option | Description | Selected |
|--------|-------------|----------|
| Heading per dimension | Three H3s under ## AI Review: ### Approach, ### Efficiency, ### Code Style. Each has 2-4 sentences. | ✓ |
| Single prose block | One flowing paragraph covering all three dimensions. More natural reading, but harder to scan. | |
| You decide | Let Claude/planner pick the best structure. | |

**User's choice:** Heading per dimension
**Notes:** Clean, scannable, follows Obsidian heading hierarchy.

### When to include suggested code

| Option | Description | Selected |
|--------|-------------|----------|
| Only when different approach | AI includes a code fence only when it identifies a fundamentally different algorithm/technique. | ✓ |
| Always include suggestion | AI always includes a suggested code fence showing the 'optimal' version. | |
| You decide | Let planner decide based on prompt engineering feasibility. | |

**User's choice:** Only when different approach
**Notes:** Keeps ## AI Review concise. Minor style tweaks get prose only.

### Prompt length constraint

| Option | Description | Selected |
|--------|-------------|----------|
| Concise (hard cap) | Prompt instructs: 'Keep each dimension to 2-4 sentences. Total review under 300 words.' ~200-400 output tokens. | |
| Natural length | No explicit length constraint in the prompt. AI writes what it deems helpful. | ✓ |
| You decide | Let planner/researcher pick based on cost modeling. | |

**User's choice:** Natural length
**Notes:** Reviews on Hard problems may be longer. Better insight over cost control.

### Attribution line content

| Option | Description | Selected |
|--------|-------------|----------|
| Provider + date only | 'Reviewed by Anthropic — 2026-05-18'. Clean, short. | |
| Provider + model + date | 'Reviewed by Anthropic (claude-haiku-4-5) — 2026-05-18'. More precise. | ✓ |
| You decide | Let planner pick. | |

**User's choice:** Provider + model + date
**Notes:** Useful when comparing reviews from different models.

---

## Cost Cap Behavior

### Default daily AI cost cap

| Option | Description | Selected |
|--------|-------------|----------|
| $1.00/day | Conservative. Covers ~50-200 reviews/day. | |
| $0.50/day | Very conservative. Covers 25-100 reviews/day. | |
| No cap by default | Cap exists but default is 0 (unlimited). | |

**User's choice:** (Free text) "I don't think I need this functionality in this milestone."

### AIREV-06 disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Ship minimal cap | Simple aiDailyCapUsd settings field with generous default. Satisfies the requirement. | |
| Defer to Phase 12 | Move AIREV-06 to Phase 12 (Polish). | |
| Drop from v1.1 | Remove AIREV-06 from v1.1 requirements entirely. | ✓ |

**User's choice:** Drop from v1.1
**Notes:** Users monitor their own AI spend via provider dashboards. Cost ledger continues to accumulate but no cap check.

---

## Auto-run Failure Posture

### Failure behavior on AC

| Option | Description | Selected |
|--------|-------------|----------|
| Silent log only | Matches KnowledgeGraphWriter.onAccepted posture. User sees nothing. | |
| Subtle Notice | Brief Notice: 'AI review skipped — [reason]'. AC celebration not blocked. | ✓ |
| Notice + retry once | Notice on first failure, auto-retry after 3s. | |

**User's choice:** Subtle Notice
**Notes:** User knows it didn't run but AC celebration isn't undercut.

### Review display on AC — user-initiated discussion pivot

The user proposed showing the review in VerdictModal (not originally an option).

| Option | Description | Selected |
|--------|-------------|----------|
| Stream in VerdictModal | Review streams directly into VerdictModal below 'Accepted!'. Richest UX. | ✓ |
| Transition to review modal | VerdictModal closes, AIStreamModal opens. Reuses Phase 08 infrastructure. | |
| Background + indicator | VerdictModal shows 'Writing AI review...' line. Review writes to note in background. | |

**User's choice:** Stream in VerdictModal
**Notes:** Richest UX. User watches the review fill in immediately after seeing "Accepted!"

### Manual re-run display

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse AIStreamModal | Open the existing AIStreamModal. Consistent with AI Debug UX. Minimal new code. | ✓ |
| Write directly to note | No modal. Review writes directly via vault.process. Notice says 'AI review updated.' | |
| You decide | Let planner pick. | |

**User's choice:** Reuse AIStreamModal
**Notes:** Consistent with AI Debug UX.

---

## Section Placement + Template

### Position in note

| Option | Description | Selected |
|--------|-------------|----------|
| After ## Notes (last) | Order: Problem → Code → Techniques → Notes → AI Review. User's notes stay above AI content. | ✓ |
| After ## Techniques | Order: Problem → Code → Techniques → AI Review → Notes. Review pairs with techniques. | |
| You decide | Let planner pick. | |

**User's choice:** After ## Notes (last)
**Notes:** Natural reading flow: solve → reflect → AI feedback.

### Template presence

| Option | Description | Selected |
|--------|-------------|----------|
| Inject on first review | New notes have no ## AI Review. vault.process appends on first review. | ✓ |
| Always in template | Every new note gets an empty ## AI Review heading. | |

**User's choice:** Inject on first review
**Notes:** Notes without AI review stay clean. Less template clutter.

### Section lock scope

| Option | Description | Selected |
|--------|-------------|----------|
| Lock H2 only | Only ## AI Review is in LOCKED_HEADINGS. H3 sub-headings and body are editable. | ✓ |
| Lock H2 + H3s | ## AI Review plus all three ### sub-headings locked. Body stays editable. | |
| You decide | Let planner decide. | |

**User's choice:** Lock H2 only
**Notes:** Users can rename, delete, or annotate H3 sub-headings.

---

## Claude's Discretion

- Prompt assembly helper name and location
- Exact prompt wording for the 3 dimensions
- VerdictModal streaming implementation approach
- `maxTokens` default for the review call
- Review writer module location (`src/ai/` vs `src/graph/`)

## Deferred Ideas

- **AIREV-06 (daily cost cap)** — dropped from v1.1 by user decision.
- **Re-run button in modals** — deferred (no cap to prevent double-spend).
- **`## Notes` send toggle** — rejected; `## Notes` is never sent to AI.
- **Per-feature provider routing** — AIPROV-FUT-02.
- **Apply-patch / auto-apply suggested code** — AIPROV-FUT-03.
