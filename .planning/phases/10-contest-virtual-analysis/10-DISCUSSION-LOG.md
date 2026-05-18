# Phase 10: Contest (virtual + analysis) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 10-contest-virtual-analysis
**Areas discussed:** Contest picker surface, Timer + pause/abort UX, Problem note creation flow, Summary note shape

---

## Contest Picker Surface

### Where should the contest picker live?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated ItemView tab | New 'leetcode-contests' view type in the sidebar, similar to ProblemBrowserView | |
| Modal (SuggestModal) | Palette command opens a fuzzy-searchable modal | |
| You decide | Let the planner pick | |

**User's choice:** Tab toggle within the existing ProblemBrowserView — switch between "Problems" and "Contests" in the same sidebar pane.
**Notes:** User wants to keep it in the same tab rather than a new view or modal. Natural discovery without extra UI surface.

### How should 'Surprise me' be accessed?

| Option | Description | Selected |
|--------|-------------|----------|
| Button in contest tab | Prominent button at the top of Contests tab | |
| Palette command only | Power users invoke from command palette | |
| Both (button + command) | Button for discoverability + command for keyboard users | ✓ |

**User's choice:** Both button and command. Reuse the existing random button pattern — in Contests mode it picks a random contest.
**Notes:** User also flagged a bug: the existing random-problem button creates a note directly, bypassing previewRouter (should preview instead). Documented as deferred fix.

### When user selects a contest, what happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm + start immediately | Click → confirmation modal → Start begins timer | |
| Preview then start | Click → preview pane with details → Start Contest button | ✓ |
| Start immediately (no confirm) | Click = start, no intermediate step | |

**User's choice:** Preview then start.
**Notes:** Mirrors Phase 06 problem preview pattern.

### Contest list data source?

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch on tab open + cache | Fetch from LC API, cache in PluginData, 24h TTL | ✓ |
| Ship a static index | Bundle JSON of all past contests, update on release | |
| You decide | Let researcher determine | |

**User's choice:** Fetch on tab open + cache.

---

## Timer + Pause/Abort UX

### Where should the running contest timer be displayed?

| Option | Description | Selected |
|--------|-------------|----------|
| Status bar item (bottom) | Obsidian's bottom status bar, persistent | |
| Header bar in contest tab | Sticky header in ProblemBrowserView contest mode | ✓ |
| Both | Status bar everywhere + tab header when visible | |

**User's choice:** Header bar in contest tab only.
**Notes:** Keeps timer contained rather than always-visible. User opens the contest tab to check progress.

### What should 'Pause' mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Pause stops the clock | Paused time doesn't count, actual solving time only | ✓ |
| Pause hides UI, clock keeps running | Like a real contest, time never stops | |
| No pause, only abort | Simplest, mirrors real contest conditions | |

**User's choice:** Pause stops the clock.

### What happens on abort?

| Option | Description | Selected |
|--------|-------------|----------|
| Summary note + keep notes | Immediately write summary, no confirmation | |
| Confirm then delete state only | Confirmation, clear state, no summary written | |
| Confirm, keep notes, write partial summary | Confirmation dialog, summary marked (aborted) | ✓ |

**User's choice:** Confirmation modal before abort, summary written with "(aborted)" marker.
**Notes:** User asked about difference between options 1 and 3 — clarified it's the confirmation step. User agreed confirmation is good to have.

### Timer persistence model?

| Option | Description | Selected |
|--------|-------------|----------|
| PluginData with Date.now() baseline | Store epoch + pausedDuration, recalculate on reload | ✓ |
| You decide | Let planner choose as long as it survives reloads | |

**User's choice:** PluginData with Date.now() baseline.

---

## Problem Note Creation Flow

### When should 4 contest problem notes be created?

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 upfront on contest start | Fetch + create all at start, slight delay | |
| On demand (when user opens each) | Notes created as user navigates, network risk mid-contest | |
| Fetch upfront, create on open | Fetch all details at start, create .md on first open | ✓ |

**User's choice:** Fetch upfront, create on open.

### How should contest notes relate to existing pipeline?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse NoteWriter fully | Same folder, add lc-contest-id parameter | |
| Separate contest subfolder + NoteWriter | Contest notes in subfolder, still uses NoteWriter | ✓ |
| You decide | Let planner integrate | |

**User's choice:** Separate contest subfolder + NoteWriter.

### If user picks contest with previously-solved problem?

**User's choice:** (Explored via freeform discussion)
**Notes:** User wanted a sandbox experience but also a single note per problem. Explored 3 approaches:
1. Contest subfolder → merge back after
2. Same note, hide prior code during contest
3. Temporary buffer → write to canonical note

User chose option 3 (ephemeral — no .md during contest, write to canonical location on end) but wanted reload survival. Solution: code lives in PluginData during contest.

### Merge strategy for existing notes?

**User's choice:** (Discussed, Claude recommended, user agreed)
**Notes:** Claude recommended: AC in contest → overwrite existing `## Code`; no AC → don't touch existing note. Rationale: protects prior good solutions while recording genuine re-solves under pressure. User agreed.

### When should canonical notes be created?

| Option | Description | Selected |
|--------|-------------|----------|
| On contest end (all attempted) | Create notes for all problems user wrote code for | ✓ |
| On first Accepted only | Only AC'd problems become notes | |
| On contest end, solved only | Only AC'd problems on end | |
| On each AC (during contest) | Write immediately on each AC during contest | |

**User's choice:** On contest end, all attempted.

---

## Summary Note Shape

### Frontmatter?

| Option | Description | Selected |
|--------|-------------|----------|
| Rich metadata | lc-contest-id, type, date, duration, score, solved-count, problems list | ✓ |
| Minimal + body carries detail | Just lc-contest-id and date | |
| You decide | Let planner pick | |

**User's choice:** Rich metadata.

### Score calculation?

| Option | Description | Selected |
|--------|-------------|----------|
| LC's per-question credit values | Fetch point values, sum solved | ✓ |
| Simple solved count | Just count solved/total | |
| Both (points + count) | LC score AND solved count | |

**User's choice:** LC's per-question credit values.

### Body sections?

**User's choice:** `## Results` (table) → `## AI Analysis` (locked) → `## Notes` (user reflection)
**Notes:** User wanted AI analysis in the summary. Discussion expanded into AI contest analysis decisions (see below).

### AI contest analysis scope?

**User's choice:** Full debrief — holistic patterns + brief per-problem commentary (1-2 sentences max per problem). Not a replacement for per-problem AIREV.

### AI trigger?

**User's choice:** Both auto (on contest end, gated by separate toggle `autoAIContestAnalysis`) AND manual palette command.

### AI toggle — reuse or separate?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse autoAIReviewOnAC | Same toggle for both | |
| Separate toggle | Independent autoAIContestAnalysis setting | ✓ |

**User's choice:** Separate toggle.

### AI analysis placement in summary note?

| Option | Description | Selected |
|--------|-------------|----------|
| ## AI Analysis (locked), after Results before Notes | Locked heading, idempotent on re-run | ✓ |
| ## AI Analysis after ## Notes | AI feedback last | |
| You decide | Let planner determine | |

**User's choice:** `## AI Analysis` locked heading, after `## Results`, before `## Notes`.

---

## Claude's Discretion

- Exact editing surface for contest solving (dedicated ItemView vs hidden scratch file)
- Contest list API endpoint discovery
- ProblemBrowserView toggle implementation style (tabs, dropdown, segmented control)
- `maxTokens` for contest analysis AI call
- "Surprise me" unfetchable-problem handling strategy
- Contest preview pane implementation (reuse ProblemPreviewView or new modal)

## Deferred Ideas

- **Random-problem button previewRouter bypass (bug)** — existing random button creates note directly instead of previewing. Separate fix.
- **CONTEST-FUT-01** — live participation
- **CONTEST-FUT-02** — difficulty-weighted Surprise me
- **CONTEST-FUT-03** — upcoming contest schedule
- **AIPROV-FUT-02** — per-feature provider routing
