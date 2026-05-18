# Phase 11: AI Knowledge Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 11-ai-knowledge-graph
**Areas discussed:** Pattern classification flow, Hub note structure + progression edges, Techniques section migration strategy, Related Variants + look-ahead edges

---

## Pattern Classification Flow

### Q1: When does pattern classification happen relative to the AC flow?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline blocking (before vault write) | User waits for AI to return the pattern before ## Techniques is written. Adds 1-3s latency. | ✓ |
| Background with deferred write | AC vault write proceeds immediately with v1.0-style lc-tag wikilinks. AI runs in background; second vault.process replaces. | |
| Inline with fast timeout + fallback | Wait up to 3s for AI. If timeout, write v1.0 lc-tags as fallback and queue background re-classify. | |

**User's choice:** Inline blocking — "we have the ai review anyway" (already waiting for AI in the AC flow).
**Notes:** Natural fit since Phase 09 AI Review already streams in VerdictModal after AC.

### Q2: What input should the classification prompt receive?

| Option | Description | Selected |
|--------|-------------|----------|
| Problem statement + user's code | AI sees problem + solution, classifies based on actual technique used. | ✓ |
| Problem statement + code + LC topic tags | Additionally includes LC's own tags as a hint for disambiguation. | |
| Code only (no problem statement) | Minimal input. Risks misclassification on ambiguous problems. | |

**User's choice:** Problem statement + user's code.
**Notes:** None.

### Q3: What about the 22 fixed patterns — is it exhaustive?

**User's clarification:** "Why 22? What's this magical number? NeetCode is not an exhaustive list."
**Resolution:** 22 patterns are a SEED taxonomy, not a ceiling. AI classifies into one of them when appropriate, but can create a new pattern name when none fits. This eliminates the "OTHER → user picks" flow entirely.

### Q4: When AI creates a new pattern name, should anything gate it?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-accept — new hub note created immediately | AI picks a name, hub note created. Taxonomy grows organically with no friction. | ✓ |
| Notice + auto-accept | Same but a Notice informs the user. | |
| Confirmation modal before creating new pattern | User can accept, rename, or pick from existing. Prevents near-duplicates. | |

**User's choice:** Auto-accept — no friction.
**Notes:** None.

### Q5: How should the classification result be persisted?

| Option | Description | Selected |
|--------|-------------|----------|
| Frontmatter field: lc-pattern | Single source of truth for queries. | |
| Only via ## Techniques wikilink | No frontmatter field. Graph navigation only. | |
| Both: frontmatter + wikilink | Maximizes discoverability through Dataview AND graph view. | ✓ |

**User's choice:** Both — frontmatter `lc-pattern` + wikilink in `## Techniques`.
**Notes:** None.

---

## Hub Note Structure + Progression Edges

### Q1: How should the hub note list member problems?

| Option | Description | Selected |
|--------|-------------|----------|
| Difficulty-grouped table | Table under ### Easy, ### Medium, ### Hard sub-headings. | ✓ |
| Flat sorted list with difficulty badge | Single list sorted by difficulty then date. | |
| Progression chain (arrows) | `[[Two Sum]] → [[3Sum]] → [[4Sum]]` showing Easy→Medium→Hard. | |

**User's choice:** Difficulty-grouped table.
**Notes:** None.

### Q2: How should the hub note be updated when a new problem joins?

| Option | Description | Selected |
|--------|-------------|----------|
| Full rewrite from index scan | Rebuild entire hub by scanning all matching notes on each AC. | |
| Incremental append | Append new problem to correct section. Fast but can drift. | |
| Incremental append + periodic reconcile command | Append on AC + manual palette command for full rebuild. | |

**User's choice:** "Incremental append on each AC, fire a background reconcile also on each AC, add a 1hr interval timer in background, plus a manual command."
**Notes:** Belt-and-suspenders: immediate append for UX, background reconcile after each AC for correctness, hourly timer for long sessions, manual command for control.

### Q3: Reconcile timing clarification

**User's clarification:** "What's the difference between on-plugin-load and daily? What if the app's been open multiple days with no plugin reload?"
**Resolution:** Neither fires mid-session. Switched to an interval timer (1-hour) that works regardless of how long Obsidian stays open.

---

## Techniques Section Migration Strategy

### Q1: What happens to existing v1.0 lc-tag wikilinks on AC?

| Option | Description | Selected |
|--------|-------------|----------|
| Full replacement — AI clusters replace lc-tag links entirely | Old [[Hash Table]] / [[Array]] links removed. Clean break. User lines preserved. | ✓ |
| AI cluster prepended, lc-tags kept below separator | AI cluster first, then `---`, then old links for reference. | |
| AI cluster replaces only matching lc-tags; extras stay | Only remove lc-tag links that directly map to the AI cluster name. Others kept. | |

**User's choice:** Full replacement.
**Notes:** None.

### Q2: What about user-added content in ## Techniques?

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve all user lines below AI links | Same as v1.0's mergeTechniquesSection "free items" behavior. | ✓ |
| Wipe entire section, write only AI cluster link | Clean slate. Users should use ## Notes for personal content. | |

**User's choice:** Preserve user-added lines.
**Notes:** Same contract as existing `mergeTechniquesSection` free-item preservation.

---

## Related Variants + Look-ahead Edges

### Q1: Should Related Variants and look-ahead be part of the same AI call as classification?

| Option | Description | Selected |
|--------|-------------|----------|
| Single AI call returns all three | One prompt returns pattern + variants + look-ahead. Cheaper. | |
| Two calls: classification first, then variants/look-ahead | Allows skipping second call if variants disabled. | |
| Classification bundled with AI Review call | Piggyback on Phase 09's review prompt. One fewer call. | |

**User's choice:** "Use whatever you think is best to achieve the best quality."
**Notes:** Deferred to Claude's discretion — planner/researcher decides optimal call structure.

### Q2: Should AI suggest variants from solved problems only or full LC corpus?

| Option | Description | Selected |
|--------|-------------|----------|
| Only suggest from user's already-solved problems | Every wikilink resolves. Limits discovery. | |
| Suggest from full LC problem corpus (validated against local index) | May produce dangling wikilinks. Maximizes discovery. | ✓ |
| Prefer solved, allow unsolved if high confidence | Hybrid. | |

**User's choice:** Full LC corpus, validated against local index.
**Notes:** Dangling wikilinks are acceptable — Obsidian renders unresolved-link styling.

### Q3: How should ## Related Variants be rendered?

| Option | Description | Selected |
|--------|-------------|----------|
| Simple wikilink list with brief reason | `- [[3Sum]] — same two-pointer shrink pattern on sorted input` | ✓ |
| Wikilinks only (no explanation) | Ultra-minimal. | |
| Table with cluster + difficulty | More structured but heavier. | |

**User's choice:** Wikilink list with brief reason.
**Notes:** None.

---

## Claude's Discretion

- AI call structure (single vs multiple calls, piggybacking on AI Review)
- Prompt wording for seed taxonomy + "create new if none fits"
- `maxTokens` for classification
- Module layout (PatternClusterEngine, ClusterHubWriter, RelatedVariantsWriter)
- Reconcile service implementation
- `## Related Variants` placement in note order
- Look-ahead interaction with Related Variants layout

## Deferred Ideas

- **AIKG-FUT-01** — batch migration UI (Phase 12 stretch)
- **AIKG-FUT-02** — manual cluster override (`lc-pattern` manually set)
- **AIKG-FUT-03** — cluster-color graph view
- **Taxonomy admin UI** — view/merge/rename patterns across vault
- **Per-feature AI provider routing** — AIPROV-FUT-02
