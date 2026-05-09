# Phase 4: Knowledge Graph Wiring — Discussion Log

**Discussion date:** 2026-05-09
**Mode:** interactive discuss-phase, --chain
**Participants:** User (project owner / dogfood author), Claude (builder)

Human-reference audit trail. NOT consumed by downstream agents (researcher, planner, executor) — those read CONTEXT.md.

---

## Areas selected for discussion

User selected all 4 areas (multiSelect): Solution accumulation, Techniques & topic tags, Stub technique notes, Opt-out & frontmatter fields.

---

## Area 1: Solution accumulation

### Q1.1 — On an Accepted submission, how should ## Solution accumulate?

Options presented:
- **Overwrite — latest AC wins (Recommended)** — single fenced block, overwrite on each AC, history via git
- **Append history (### YYYY-MM-DD)** — each AC adds a dated subsection
- **Latest + optional archive heading** — ## Solution latest, ## Past Solutions archive

**User response (freeform, "Other"):**
> "i think i don't need a separate solution section, i just want the Code section, same as leetcode, i want it have all the accepted history and current one i'm working on, and have a button arrors like the image to navigate, and also a button in the middle i can click and open a dropdown to select, when open a note or a question, if the last accepted submission is older than X days, then insert a new one. X should be the same experience in leetcode"

*User attached screenshot of LC's submission navigator showing `< 2/2 >` chevrons.*

**Reshaped the phase significantly:**
- No `## Solution` heading at all
- All code activity lives in `## Code` (the Phase 3 heading)
- LC-style navigation between submissions
- Stale-detect auto-insert for fresh start

### Q1.2 — What happens on AC if the user manually edited ## Solution?

Options: Plugin owns / User-owned / Skip + Notice
**User selected:** User-owned — never touch once present

*Note: this answer was captured before the ## Solution heading was dropped (Q1.1). It's effectively moot under the revised D-01 model — there IS no ## Solution to touch — but the preference ("respect user edits, never clobber") carried forward into D-04's confirm-overwrite gate on Copy-to-Code.*

### Q1.3 — What triggers the append — every AC, or only the first AC?

Options: Every AC / First AC only / First AC + on-demand refresh
**User selected:** Every AC (Recommended)

*Carried forward into D-24: re-accepted submissions re-fire the full frontmatter update.*

### Q1.4 — What fence tag should ## Solution use?

Options: Same tag as ## Code / Frontmatter lc-language / Plain ```
**User selected:** Same tag as ## Code at submit time (Recommended)

*Carried forward into D-04: Copy-to-Code uses the submitted language's langSlug as fence tag.*

### Follow-up Q1.5 — Where does submission history live?

Options: Markdown / data.json cache / Hybrid
**User selected:** data.json: history is cached, ## Code shows one active block

### Follow-up Q1.6 — Where does the navigator UI surface in Phase 4?

Options: Command palette + modal / Reading Mode overlay / Full overlay
**User selected:** Command palette + modal (Recommended for P4)

*Locked D-03/D-04 picker-based navigation; overlay deferred to Phase 5.*

### Follow-up Q1.7 — "Older than X days" threshold?

Options: Fixed 30d / Research LC's behavior / User-configurable
**User selected:** Research LC's actual behavior first

*Was going to be a P0 research item; rendered moot by Q1.8 (no history stored in note → no stale-detect).*

### Follow-up Q1.8 — WIP vs AC snapshots under ## Code?

**User response (freeform, "Other"):**
> "actually i think upon choose a submission, it open the code in a modal, and with a button to put the code in the code fenced tag, so ensentially, the history is something we fetch from leetcode, and the note only have a code block we work on."

**Final model locked:**
- `## Code` = one block, user WIP (Phase 3 D-08 preserved)
- History fetched live from LC, not cached in note, not cached in data.json
- Picker modal → detail modal with read-only code + Copy-to-Code button
- No stale-detect (nothing to stale-check)

*This was the key pivot of the session — collapsed the Phase 4 surface from "vault-state management with history" to "frontmatter + new heading + picker."*

### Follow-up Q1.9 — When does plugin fetch submission history?

Options: On-demand only / On every AC / Cached with TTL
**User response (freeform):**
> "i think on open the note or select a question, we should refetch the question and history, same as leetcode experience"

*Locked D-02: refetch on note open. D-07: no persistent cache for history.*

### Follow-up Q1.10 — What does the read-only submission viewer show?

Options: Code + metadata / Code only / Code + diff
**User selected:** Code + runtime/memory + date + verdict (Recommended)

### Follow-up Q1.11 — Should picker show all submissions or only Accepted?

Options: All + verdict chip / Accepted only / All + filter toggle
**User selected:** All submissions (default), with verdict chip (Recommended)

### Follow-up Q1.12 — Copy-to-Code behavior?

Options: Confirm + overwrite / Silent overwrite / Append
**User selected:** Confirm + overwrite (Recommended)

---

## Area 2: Techniques & topic tags

### Q2.1 — How do topic slugs become display names?

Options: LC's .name verbatim / Title-case slug / Custom map
**User selected:** Use LC's topicTag.name verbatim (Recommended)

*Carried into D-12 + D-14 schema extension (Phase 2 cache extended with topicTags array).*

### Q2.2 — Do tags and wikilinks write in one pass?

Options: One pass / Two passes
**User selected:** Yes — one on-AC writer handles both (Recommended)

*Carried into D-08 (single KnowledgeGraphWriter entry point) + D-09 (sequenced atomic-per-concern passes).*

### Q2.3 — How do wikilinks render?

Options: Bulleted list / Inline comma-separated / Callout
**User selected:** Bulleted list (Recommended)

*Carried into D-12 format.*

### Q2.4 — Ownership model for ## Techniques?

Options: Plugin + user union / Plugin-owned / User-owned after first write
**User selected:** Plugin writes LC topics, user can add extras (union-merge, Recommended)

*Carried into D-13. Flagged as new primitive (mergeTechniquesSection.ts) — Phase 2 HeadingRegion handles whole-region replacement but doesn't union-merge list items.*

---

## Area 3: Stub technique notes

### Q3.1 — Where do stub technique notes live?

Options: User-configurable 'Techniques/' / Fixed at root / Sibling to problems folder
**User selected:** Sibling to problems folder (e.g., LeetCode/Techniques)

*Locked D-15: derived from `problemsFolder`, no new settings field.*

### Q3.2 — What does a fresh stub contain?

Options: Frontmatter only / Frontmatter + H1 + placeholder / Frontmatter + Dataview
**User selected:** Frontmatter only + empty body (Recommended)

*Locked D-16.*

### Q3.3 — What happens after first creation?

Options: Never overwrite, never auto-update / Never + skip re-create / Overwrite FM only
**User selected:** Never overwrite, never auto-update (Recommended — matches GRAPH-04)

*Locked D-18. Noted divergence from Phase 2 D-18 BaseFile: techniques DO re-create if deleted (dangling link worse than stub).*

### Q3.4 — Should stub use tag mirroring problem-note tag?

Options: Yes — tag only / No — field only / Both field + tag
**User selected:** Yes — single `tags: [lc/technique/two-pointers]` in frontmatter (Recommended)

*Locked D-16 three-field stub frontmatter (lc-technique, aliases, tags).*

---

## Area 4: Opt-out & frontmatter fields

### Q4.1 — Opt-out scope?

Options: Skip Techniques + stubs / Skip everything / Skip stubs only
**User selected:** Skip only ## Techniques + stubs; still write lc/topic tags (Recommended)

*Locked D-20. Rationale: tags are lightweight graph fuel.*

### Q4.2 — Default state?

Options: Enabled / Disabled / First-run prompt
**User selected:** Enabled by default (Recommended)

*Locked D-21 + D-22 (no first-run prompt).*

### Q4.3 — lc-runtime-ms / lc-memory-mb format?

Options: Numbers / Raw LC strings / Both
**User selected:** Numbers (Recommended): lc-runtime-ms: 12, lc-memory-mb: 14.2

*Locked D-10.*

### Q4.4 — lc-solved-date format?

Options: ISO-8601 timestamp / YYYY-MM-DD / Unix epoch
**User response (freeform, elaborating on Recommended):**
> "ISO-8601 timestamp, but using local tz"

*Locked D-10: ISO-8601 local-tz (e.g., `2026-05-09T14:32:01-07:00`). Planner must test against DST boundary.*

---

## Claude's Discretion (captured in CONTEXT.md `### Claude's Discretion`)

Not asked; planner picks during plan-phase:

- Exact module layout under `src/graph/` (orchestrator vs merge helper vs stub creator split)
- Singleton vs factory for KnowledgeGraphWriter
- Prefetch-on-hover vs on-click for picker per-row detail
- Picker-row CSS class reuse (verdict chips from VerdictModal)
- Confirm-overwrite dialog style (native confirm vs Obsidian modal)
- Whether stub frontmatter lands via processFrontMatter (post-create) or embedded in vault.create body

---

## Deferred ideas captured during discussion

(Full list in CONTEXT.md `<deferred>` — highlights here):

- **Chevron/dropdown overlay on ## Code** → Phase 5 Polish (same lane as Phase 3 D-11)
- **Submission-history cache with TTL** → Phase 5 if needed
- **Diff view in SubmissionDetailModal** → Phase 5
- **Filter toggle in picker (AC only)** → Phase 5
- **Retroactive opt-out cleanup command** → Phase 5
- **Bases-file schema update for new frontmatter fields** → Phase 5

---

## Scope-creep redirects

None during this session — user stayed on-scope for Phase 4 throughout. The submission-history surface (picker + detail modal) is a **scope expansion** of Phase 4 (not in original GRAPH-01..05) but directly replaces the original `## Solution` mechanism, so it's scope-neutral relative to the phase goal rather than scope creep.

---

## Key pivot

The session's pivotal moment was Q1.1's freeform answer + Q1.8's freeform answer, which together collapsed the Phase 4 surface from "vault-state-heavy solution-history management" to "frontmatter write + new Techniques heading + stub notes + picker modal." This simplified:

- Ownership model (## Code unchanged from Phase 3)
- Cache footprint (no history in data.json)
- Vault-write discipline (one processFrontMatter + one vault.process + N vault.create, all sequenced but each atomic)

At cost of:

- ROADMAP Phase 4 success criterion 1 needs rewrite (transition phase)
- New `## Techniques` body union-merge primitive (mergeTechniquesSection.ts)
- New submission-history REST surface (P0 research item — endpoint shape)

---

# Revision Pass — 2026-05-09 (drift-triggered)

**Trigger:** Wave 0 Task 2 fixture capture surfaced RESEARCH §Pattern B / §A3 drift. LC migrated submission detail from HTML scrape to GraphQL. See `04-01-SUMMARY.md` for the full finding.

**Scope:** Narrow. Only D-27, D-28 (clarification), D-29, the submission-client Discretion bullet, and a new D-30 for session-expiry detection. All other 26 decisions untouched.

## Revision Area 1: Scope of this pass

**Q — How should the discussion proceed?**

Options: (1) Update CONTEXT.md + force replan (Recommended), (2) Full re-discussion, (3) Skip — edit RESEARCH.md only.

**User:** Option 1 — Update CONTEXT.md + force replan.

## Revision Area 2: GraphQL client design

**Q — Hand-roll or delegate to `@leetnotion/leetcode-api`?**

Options: (1) Hand-rolled `POST /graphql/` (Recommended), (2) Delegate to library, (3) Hybrid.

**User:** Option 1 — Hand-rolled. Rationale: `@leetnotion` 3.0.0 still uses the obsolete HTML-scrape pattern for `submission(id)` — delegating would push the same fix down a level with a fork dependency.

## Revision Area 3: List transport

**Q — Keep REST `/api/submissions/{slug}/` (unchanged) or migrate list to GraphQL too?**

Options: (1) Keep REST (Recommended), (2) Migrate both to GraphQL.

**User:** Option 2 — Migrate both to GraphQL. Rationale: one client code path, one failure mode, one session-expiry check is easier to reason about. `questionSubmissionList` operation was verified live during the discussion (`tests/fixtures/lc-submissions/list-many.graphql.json`).

## Revision Area 4: Session-expired detection

**Q — What signal fires SessionExpiredError?**

Options: (1) HTTP 401 + JSON `detail` field (Recommended), (2) Only HTTP status code.

**User:** Option 1. Rationale: GraphQL returns HTTP 200 with `errors[]` on auth failures; status-only check misses that. Signal set consolidated into new D-30.

## Live verification performed during this pass

- `POST /graphql/` with operation `submissionList` (`questionSubmissionList`): 200 + full shape. Saved as `list-many.graphql.json`.
- `POST /graphql/` with operation `submissionDetails($submissionId: Int!)`: confirmed `Int!` required. AC and WA fixtures saved.
- Referer constraint: detail GraphQL calls return 403 unless Referer is `/submissions/detail/{id}/` (not the problem description URL). Captured into D-29 revised.

## Next step

Run `/gsd-plan-phase 4 --gaps` to regenerate 04-03 PLAN.md and the affected 04-01 stub describe-block names. Other plans (04-02, 04-04, 04-05, 04-06, plus 04-01 Task 3) remain valid as-is.

*End of revision pass.*
