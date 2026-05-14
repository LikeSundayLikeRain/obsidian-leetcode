# Phase 2: Problems as Notes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 2-problems-as-notes
**Areas discussed:** Note anatomy & section order, User-content preservation mechanism, Re-open behavior, Tag placement

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Note anatomy & section order | Shape of a problem note — headings, ordering, which sections are plugin-managed | ✓ |
| User-content preservation mechanism | How to detect user regions vs plugin regions; heading-based vs sentinel markers | ✓ |
| Re-open behavior when note exists | What happens when a user re-clicks a problem that already has a vault note | ✓ |
| Tag placement: frontmatter vs inline body | Where #lc/* tags live; form; frontmatter vs body; coexistence with user tags | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Note Anatomy & Section Order

### Q1: Top-level shape of a problem note

| Option | Description | Selected |
|--------|-------------|----------|
| Problem → Notes → Solution → Techniques (recommended) | Plugin-managed ## Problem top, user writes in ## Notes, Phase 4 appends Solution + Techniques | ✓ |
| Problem (sub-split) → Notes → Solution → Techniques | ## Problem split into ### Description / ### Examples / ### Constraints | |
| Notes first, then Problem | User notes at top; problem statement below as reference | |

**User's choice:** Problem → Notes → Solution → Techniques.

### Q2: Pre-create Solution and Techniques headings, or insert on first AC?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-create empty headings on first open (recommended) | Simpler anchor logic, stable outline from day one | |
| Insert on first Accepted submission only | Unsolved notes stay visually cleaner — no empty Solution staring back | ✓ |
| Pre-create as HTML comments | Placeholder comments, replaced by Phase 4 | |

**User's choice:** Insert on first Accepted submission only. **Notes:** User explicitly asked "can we also populate the algo tags after first AC? difficulty tag is ok." — this answer shaped the whole frontmatter/tag strategy.

### Q3: Frontmatter fields on first open

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal identity + status (recommended) | Only REQUIREMENTS.md NOTE-03 mandated fields | (superseded) |
| Minimal + optional acceptance rate / paid flag | Add lc-acceptance and lc-paid for Dataview/Bases sorting | |
| Full schema with empty Phase 4 placeholders | Show "shape" of solved note from day one | |

**User's choice:** No option — user asked whether algo tags could be populated after first AC; question Q4 follow-up was generated from this response.

### Q4 (follow-up): Tag policy + frontmatter shape

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 difficulty tag only; Phase 4 adds topic tags on AC (recommended) | Matches "earn your tags" mental model; requires NOTE-04 scope shift | ✓ |
| Phase 2 difficulty + paid/acceptance tags; Phase 4 adds topic tags on AC | Small extra graph edges from day one | |
| Something else | User-defined combo | |

**User's choice:** Phase 2 difficulty tag only; Phase 4 adds topic tags on AC. **Notes:** This creates a scope adjustment to REQUIREMENTS.md NOTE-04 — flagged in CONTEXT.md D-05.

### Q5: Where are topic slugs stored before Phase 4 can use them?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-fetch topics at AC time — keep Phase 2 frontmatter clean (recommended) | One extra detail-fetch on AC; smaller frontmatter | |
| Stash topic slugs in hidden frontmatter field at open time | Phase 4 reads from frontmatter directly; frontmatter slightly larger | |
| Stash topic slugs in plugin data.json keyed by slug | Best separation; Phase 4 reads from cache | ✓ |

**User's choice:** Stash in data.json keyed by slug. **Notes:** This motivates the problemDetails cache schema in CONTEXT.md D-14.

---

## User-Content Preservation Mechanism

### Q1: Detecting user regions vs plugin regions

| Option | Description | Selected |
|--------|-------------|----------|
| Heading-based: everything under ## Notes is sacred (recommended) | Simple mental model; frontmatter merges via processFrontMatter | ✓ |
| Sentinel-based: HTML comment markers | Explicit but visible in source mode, un-Obsidian | |
| Hybrid: headings define regions, sentinels inside Problem only | Markers protect turndown output against drift | |

**User's choice:** Heading-based.

### Q2: If user deletes or renames ## Problem heading

| Option | Description | Selected |
|--------|-------------|----------|
| Re-insert if missing; never re-insert if renamed (recommended) | "Plugin owns its anchor, user owns their renames" | ✓ |
| Always re-insert if exact heading not found | Simpler; worse UX for users who customise | |
| Never auto-insert; require explicit regenerate command | Safest; requires user to know the escape hatch | |

**User's choice:** Re-insert if missing; never re-insert if renamed.

### Q3: User-added tags inside the lc/ namespace

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve anything in tags[] that plugin didn't write this pass (recommended) | Simple, friendly, lc/ is prefix convention not reserved lock | ✓ |
| Only preserve tags OUTSIDE lc/ namespace; strip unrecognised lc/* | Clean separation; risks stripping user's thoughtful categorisation | |
| Preserve all, move user tags to separate 'user-tags' frontmatter key | Plugin-managed tags[]; but hides user tags from native tag pane | |

**User's choice:** Preserve anything in tags[] that plugin didn't write this pass.

### Q4: Continue this area or move on?

**User's choice:** Next area (Re-open behavior).

---

## Re-Open Behavior

### Q1: Behavior when user clicks a problem whose note already exists

| Option | Description | Selected |
|--------|-------------|----------|
| Open file; refresh plugin regions only if cache > 7d (recommended) | Fast reveal; background refresh; matches VS Code LC plugin model | ✓ |
| Open file; never auto-refresh; require explicit command | Cleanest; drift risk if LC edits problem statements | |
| Open file; always refresh on open | Latest always; violates NOTE-07 offline spirit on flaky networks | |
| Prompt on stale cache | Middle ground; can feel nag-y | |

**User's choice:** Open file; refresh plugin regions only if cache > 7d.

### Q2: Offline / network-failure policy on background refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Open existing note silently; skip refresh; no Notice (recommended) | NOTE-07 offline promise; no noise on planes | ✓ |
| Open + transient Notice "Offline — showing cached version." | Acknowledges stale without demanding action | |
| Open + persistent footer indicator | Informative; requires injecting UI into markdown view | |

**User's choice:** Open existing note silently; skip refresh; no Notice.

### Q3: Cache location for per-problem detail

| Option | Description | Selected |
|--------|-------------|----------|
| data.json, keyed by slug, 7-day TTL (recommended) | Single source of truth; matches Phase 1 pattern | ✓ |
| Per-slug files under .obsidian/plugins/<id>/cache/ | Slim data.json; filesystem overhead | |
| Cache the rendered Markdown in the note's Problem section | No separate cache; muddies owner-detection | |

**User's choice:** data.json, keyed by slug, 7-day TTL.

### Q4: Continue this area or move on?

**User's choice:** Next area (Tag placement).

---

## Tag Placement: Frontmatter vs Inline Body

### Q1: Where do #lc/* tags live?

| Option | Description | Selected |
|--------|-------------|----------|
| Frontmatter tags[] array only (recommended) | Single source, Obsidian-native, graph/Dataview/Bases friendly | ✓ |
| Inline #lc/... tags in a dedicated section | User sees in reading mode; preservation less robust | |
| Both — frontmatter + inline mirror | Redundant; doubles preservation surface | |

**User's choice:** Frontmatter tags[] array only.

### Q2: Tag form (case + format)

| Option | Description | Selected |
|--------|-------------|----------|
| All lowercase, slug-form: lc/easy, lc/dynamic-programming (recommended) | Matches PROJECT.md convention; matches LC topic slugs | ✓ |
| TitleCase, human-readable: lc/Easy, lc/Dynamic-Programming | Prettier; duplicate risk on case mismatch | |
| Slug + capitalise words: lc/easy topics, lc/Easy difficulty | Hybrid; two conventions to remember | |

**User's choice:** All lowercase, slug-form.

### Q3: Obsidian aliases for cross-linking

| Option | Description | Selected |
|--------|-------------|----------|
| Add aliases: [Two Sum, '0001'] by default (recommended) | [[1]], [[0001]], [[Two Sum]] all resolve | (superseded) |
| Add aliases but only the title | Cleaner; loses id-link | |
| No aliases in Phase 2 — defer to Phase 4 or Polish | Safest scope control | |

**User's choice:** Recommended option initially; superseded by Q6 follow-up after filename-padding clarification.

### Q4: Filename padding (original ask)

Options: 4-digit padding (recommended), no padding, 5-digit future-proof.

**User's choice:** None — user asked "is there a way to preserve the order without 0 padding?" — triggered a clarification discussion about how Obsidian sorts files lexicographically and alternatives (Problem Browser, Bases views, external plugins, slug-only filenames).

### Q5 (clarified): Filename format given the landscape

| Option | Description | Selected |
|--------|-------------|----------|
| No padding: 1-two-sum.md — rely on Problem Browser (and Bases later) | Matches LC URL convention; File Explorer ordering is cosmetic | |
| Zero-padded 4-digit: 0001-two-sum.md | Correct File Explorer sorting out of the box | |
| No padding + ship a Bases view (LeetCode.base) alongside in Phase 2 | Filename is 1-two-sum.md; plugin creates LeetCode.base sorted by lc-id desc | ✓ |

**User's choice:** No padding + ship a Bases view.

### Q6: Bases version strategy + aliases revision

Paired question. **Bases strategy options:**

| Option | Description | Selected |
|--------|-------------|----------|
| Bump minAppVersion to Bases-required; Bases is the only sorted view (recommended) | One implementation; sidebar fallback on older Obsidian = can't install plugin | ✓ |
| Keep minAppVersion 1.5.0; conditionally ship .base on version detect | No user locked out; extra branching | |
| Keep minAppVersion 1.5.0; ship Dataview-style fallback instead | Depends on Dataview plugin | |
| Drop Bases view entirely — sidebar IS the sorted surface | No extra files; reconsider the whole thing | |

**Aliases options:**

| Option | Description | Selected |
|--------|-------------|----------|
| Both: aliases: [Two Sum, '1', '0001'] (recommended) | Maximum link flexibility | |
| Only numeric id: aliases: [Two Sum, '1'] | Matches no-padding philosophy | ✓ |

**User's choice:** Bump minAppVersion + ship Bases file; aliases are `[Title, '1']` (no padded alias).

### Q7: Continue this area or ready for context?

**User's choice:** I'm ready for context.

---

## Claude's Discretion

Items where planner/researcher have flexibility, captured in CONTEXT.md:
- Internal module layout under `src/notes/` (NoteTemplate / NoteWriter / htmlToMarkdown / NoteReader split)
- Region regenerator implementation (regex, markdown AST, line-range tracker)
- `topicSlugs` stored as `[string]` or `[{slug, name}]`
- Exact `LeetCode.base` view definition (columns, filters) beyond lc-id-desc sort
- Notice copy refinement per UI-SPEC.md if generated for Phase 2
- Opportunistic-prune threshold for `problemDetails`
- Whether row-click routes through `main.ts` or a dedicated `NoteOrchestrator` service

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:
- "Has a note" indicator on Problem Browser rows → Phase 5 candidate
- "Force refresh from LeetCode" command → Phase 5 candidate
- User-visible refresh-failure indicator → Phase 5 fallback if silent default feels too silent
- Image download / vault-local caching → v2
- Turndown output fine-tuning for specific problem types (tables, nested code, SVG) → Phase 5 Polish
- Proactive `problemDetails` cache pruning surface → Phase 5 settings
