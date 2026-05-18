# Phase 11: AI Knowledge Graph - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

AI maintains a pattern-cluster taxonomy across the user's solved problems. On each Accepted submission, AI classifies the solution into a canonical pattern (seeded from 22 NeetCode-derived patterns but open-ended — AI can create new pattern names when none fits). Hub notes at `LeetCode/Patterns/{Cluster}.md` list all member problems with difficulty-progression grouping. The AC'd note's `## Techniques` section is lazily migrated from v1.0 lc-tag wikilinks to AI cluster wikilinks. Cross-cluster `## Related Variants` and flag-gated look-ahead edges complete the graph surface.

Requirements covered: **AIKG-01, AIKG-02, AIKG-03, AIKG-04, AIKG-05, AIKG-06, AIKG-07** (7 of v1.1's 39).

</domain>

<decisions>
## Implementation Decisions

### A. Pattern Classification Flow

- **D-01: Inline blocking classification on AC.** The AI classification call runs synchronously in the AC flow (before vault writes). Since AI Review already streams in VerdictModal after AC, users already expect a brief AI wait. The classification call is small (returns a pattern name) and fast.
- **D-02: 22 seed patterns are NOT a ceiling.** The 18 NeetCode patterns + 4 additions (Prefix Sum, Monotonic Stack, Topological Sort, Union-Find) serve as a seed taxonomy. When no seed pattern fits, AI is free to create a new pattern name. New patterns get a hub note auto-created immediately with no user confirmation.
- **D-03: Prompt input = problem statement + user's code.** AI sees what the problem is and how the user solved it — classifies based on the actual technique used. LC topic tags are NOT included in the prompt (avoids biasing the AI toward LC's coarse-grained categories).
- **D-04: Classification persisted in BOTH frontmatter + wikilink.** Frontmatter field `lc-pattern: <Pattern Name>` enables Dataview queries. `## Techniques` wikilink `[[Pattern Name]]` enables graph navigation. Both are written on AC.

### B. Hub Note Structure + Progression Edges

- **D-05: Hub note uses difficulty-grouped tables.** Structure: `### Easy`, `### Medium`, `### Hard` sub-headings, each with a table (Problem | Difficulty | Date Solved). Progression is visual from the heading hierarchy itself.
- **D-06: Hub path:** `LeetCode/Patterns/{Cluster}.md` (per AIKG-02). Created on first problem classified into that pattern.
- **D-07: Three-mechanism hub update strategy:**
  1. **Incremental append on each AC** — fast path, immediate UX.
  2. **Background full reconcile after each AC** — catches drift from appends.
  3. **1-hour interval timer** — background reconcile regardless of activity (catches manual edits, renames, long-running sessions).
  4. **Palette command `reconcile-pattern-hubs`** — manual trigger for users who want it now.
- **D-08: Reconcile = scan all notes with `lc-pattern` frontmatter, rebuild hub.** The reconcile is authoritative — frontmatter is the source of truth, hub note is derived.

### C. Techniques Section Migration Strategy

- **D-09: Full replacement on AC.** When AI classifies on AC, `## Techniques` is rewritten — old v1.0 lc-tag wikilinks (`[[Hash Table]]`, `[[Array]]`) are removed entirely, replaced by the AI cluster wikilink (`[[Two Pointers]]`). Clean break, no dual-system.
- **D-10: Lazy-on-AC only.** Migration happens one note at a time as each note gets an AC. Never batch on plugin load (locked in REQUIREMENTS.md Out-of-Scope). Notes that haven't been re-AC'd keep their v1.0 wikilinks indefinitely.
- **D-11: User-added lines preserved.** Same contract as v1.0's `mergeTechniquesSection` "free items" logic — plugin-owned wikilinks are replaced but any user-added free-text lines are preserved below the AI cluster link.

### D. Related Variants + Look-ahead Edges

- **D-12: AI suggests variants from the full LC problem corpus.** Not limited to user's solved problems. Suggested slugs are validated against the local problem index (fetched metadata). Unknown slugs dropped silently. May produce dangling wikilinks (Obsidian renders these with unresolved-link styling — correct UX).
- **D-13: `## Related Variants` format = wikilink list with brief reason.** Example: `- [[3Sum]] — same two-pointer shrink pattern on sorted input`. Compact, scannable. Capped at 2 per note (hard cap per AIKG-05).
- **D-14: Cross-cluster only.** Same-cluster suggestions are suppressed (they'd be redundant with the hub note's member list). Per AIKG-05.
- **D-15: `## Related Variants` heading locked under `LOCKED_HEADINGS`.** Per AIKG-07.
- **D-16: Look-ahead edges flag-gated.** `featureFlags.lookAheadEdges` toggle (default OFF). When enabled, AI may suggest up to 2 unsolved problems. Validated against local index, unknowns dropped. Per AIKG-06.

### Claude's Discretion

- AI call structure (single call returning pattern + variants + look-ahead, vs separate calls, vs piggybacking on AI Review). Optimize for classification quality and cost.
- Prompt wording for the 22-seed taxonomy + "create new if none fits" instruction.
- `maxTokens` for the classification call.
- Module layout — whether `PatternClusterEngine`, `ClusterHubWriter`, `RelatedVariantsWriter` are separate files or colocated.
- Reconcile implementation: whether to use a shared `ReconcileService` or inline in a command handler.
- How look-ahead edges interact with Related Variants in the note layout (same section or separate).
- `## Techniques` vs `## Related Variants` ordering in the note (Techniques is already locked at its position; Related Variants goes after it or after `## AI Review`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state
- `.planning/PROJECT.md` — v1.1 milestone scope, BYO key posture, vault-write conventions.
- `.planning/REQUIREMENTS.md` — AIKG-01..07 wording. Out-of-Scope rows: free-form AI cluster names (revised: AI CAN create new names, but from a frozen-seed base), auto-rewrite v1.0 Techniques on plugin update, >2 look-ahead edges, AI rewriting `## Notes`.
- `.planning/ROADMAP.md` — Phase 11 goal + success criteria + dependency chain (Phase 07, Phase 09).
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time.

### v1.1 prior phase context (load-bearing precedents)
- `.planning/phases/07-ai-provider-foundation/07-CONTEXT.md` — AIClient seam, disclosure gate, obsidianFetch contract, cost ledger, `prettyName` SSoT.
- `.planning/phases/09-ai-aced-review/09-CONTEXT.md` — AI vault write pattern (`## AI Review` locked heading, `vault.process`, disclosure extension via composition, idempotent replacement, `buildReviewPrompt` precedent, `withReviewBullet` factory).

### Project conventions (from `CLAUDE.md`)
- All HTTP to `leetcode.com` via `requestUrl` — absolute, no exceptions. AI calls via `obsidianFetch(mode)`.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden.
- `LOCKED_HEADINGS` lives in `src/notes/NoteTemplate.ts:83`; Phase 11 extends with `## Related Variants`.
- Plugin ID prefix and "command" word forbidden in command IDs.
- `'leetcode.*'` userEvent annotation bypasses section lock for CM6 dispatches. Phase 11 uses `vault.process` (below CM6 — not subject to section lock).

### v1.1 code references (read before editing)
- `src/graph/KnowledgeGraphWriter.ts` — existing on-AC pipeline (frontmatter → `## Techniques` → stubs). Phase 11 extends or replaces step 2 (Techniques write) and step 3 (stub creation → hub note creation).
- `src/graph/mergeTechniquesSection.ts` — current pure transform for `## Techniques` union-merge. Phase 11 replaces the merge logic to write AI cluster wikilinks instead of lc-tag wikilinks. "Free items" preservation logic is reusable.
- `src/notes/NoteTemplate.ts:83` — `LOCKED_HEADINGS` tuple. Phase 11 adds `## Related Variants`.
- `src/notes/NoteTemplate.ts:62` — `TECHNIQUES_HEADING_LINE` constant. Phase 11 reuses.
- `src/main/sectionLockExtension.ts` — imports `LOCKED_HEADINGS`. Adding new entry auto-locks it.
- `src/ai/AIClient.ts` — `invoke(req)` (non-streaming, sufficient for classification) and `invokeStream(req)`. Disclosure gate fires automatically.
- `src/ai/disclosure.ts` — `DISCLOSURE_BASE_COPY` + `withDebugBullet`/`withReviewBullet` factories. Phase 11 adds `withKgBullet`.
- `src/ai/types.ts` — `AIRequest`, `AIResponse`, `AIProvider`, `prettyName()`.
- `src/settings/SettingsStore.ts:103` — `PluginData` interface. Phase 11 adds `featureFlags.lookAheadEdges: boolean`.
- `src/settings/SettingsStore.ts:844` — `addCostLedger(usd)`. Phase 11 calls after classification completes.
- `src/main.ts:1291` — `classifyStatus` AC gate + `knowledgeGraph.onAccepted()` invocation site. Phase 11 hooks into the KnowledgeGraphWriter pipeline (extends step 2/3) or alongside it.
- `tests/ai/lc-isolation.test.ts` — MUST stay green. Phase 11 stays inside the AI / graph boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`KnowledgeGraphWriter.onAccepted`** — existing on-AC pipeline. Phase 11 extends step 2 (Techniques body write) to use AI classification output instead of raw lc-tags, and replaces step 3 (stub technique notes → hub notes).
- **`mergeTechniquesSection` "free items" preservation** — the `parseItems` / splice pattern that preserves user-added lines. Reusable for the new AI-cluster merge logic.
- **`AIClient.invoke(req)`** — non-streaming call, sufficient for classification (small response: just a pattern name + variants). Disclosure gate fires automatically.
- **`withDebugBullet` / `withReviewBullet` composition** — Phase 11 adds `withKgBullet` following the same pattern.
- **`applySolveTimeFrontmatter`** — existing frontmatter write helper. Phase 11 may extend or add a parallel call for `lc-pattern`.
- **`SettingsStore.addCostLedger(usd)`** — cost ledger for AI calls.
- **`pollingOrchestrator.ts` `registerInterval` pattern** — reusable for the 1-hour reconcile timer.

### Established Patterns
- **`vault.process` for all vault writes** (CF-06) — Phase 11 follows exclusively.
- **`LOCKED_HEADINGS` tuple extension** — add `## Related Variants`.
- **Shape-guarded PluginData extension** — new fields get defaults at load time.
- **`editorCheckCallback` guard on palette commands** — `lc-slug` frontmatter check for note-scoped commands.
- **Disclosure extension via composition** — `withKgBullet` mirrors prior bullets.

### Integration Points
- **`KnowledgeGraphWriter` step 2** — current `mergeTechniquesSection(body, topicTags)` call. Phase 11 replaces `topicTags` input with AI classification output.
- **`KnowledgeGraphWriter` step 3** — current `createStubIfMissing` loop. Phase 11 replaces with hub note append.
- **`PluginData` shape** — gains `featureFlags.lookAheadEdges: boolean` (default `false`).
- **`LOCKED_HEADINGS` array** — gains `'## Related Variants'`.
- **`main.ts` onload** — registers `reconcile-pattern-hubs` palette command + 1-hour reconcile interval.
- **`NoteTemplate.ts`** — may gain `RELATED_VARIANTS_HEADING_LINE` constant.

</code_context>

<specifics>
## Specific Ideas

- The 22 NeetCode-derived patterns are a SEED, not a ceiling. AI is free to invent new pattern names when the problem doesn't fit any seed pattern. New patterns auto-create hub notes with no user confirmation.
- Related Variants format: `- [[Problem Name]] — brief structural reason`. Compact, scannable. Cross-cluster only.
- Hub notes are difficulty-grouped tables under `### Easy`, `### Medium`, `### Hard` sub-headings.
- The reconcile mechanism is belt-and-suspenders: incremental append for speed, background reconcile for consistency, timer for long sessions, manual command for control.
- `## Techniques` migration is a clean break — v1.0 lc-tag wikilinks are fully replaced by the AI cluster wikilink on AC. No coexistence period.

</specifics>

<deferred>
## Deferred Ideas

- **AIKG-FUT-01 (batch migration UI)** — opt-in one-shot rewrite of all `## Techniques` sections. Phase 12 stretch goal. Phase 11 is lazy-on-AC only.
- **AIKG-FUT-02 (manual cluster override)** — user sets `lc-pattern` manually and AI respects it. Post-v1.1.
- **AIKG-FUT-03 (cluster-color graph view)** — visual cluster coloring in Obsidian's graph. Post-v1.1.
- **Per-feature AI provider routing (AIPROV-FUT-02)** — classification uses the same active provider as Debug/Review.
- **Taxonomy admin UI** — viewing/merging/renaming patterns across the vault. Not in v1.1.

</deferred>

---

*Phase: 11-ai-knowledge-graph*
*Context gathered: 2026-05-18*
