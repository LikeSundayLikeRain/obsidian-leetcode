# Phase 3: Run & Submit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 3-run-submit
**Areas discussed:** Code anchoring & language, Starter-code injection, Run/Submit UX surface, Polling safety & concurrency

---

## Area selection

Presented 4 gray areas; user selected all 4.

| Area | Description | Selected |
|------|-------------|----------|
| Code anchoring & language | Which fenced block at submit time? How is language resolved? Multiple blocks / none? | ✓ |
| Starter-code injection | When does boilerplate land — creation / first run / command? Overwrite policy? | ✓ |
| Run/Submit UX surface | Command palette / ribbon / toolbar / status bar? Verdict modal content for WA? Custom test input surface? | ✓ |
| Polling safety & concurrency | Hard cap on polling? Cancel button? Parallel-submit policy? Unknown verdict handling? | ✓ |

---

## Code anchoring & language

### Q1: Which fenced code block does the plugin send to LeetCode at Run/Submit?

| Option | Description | Selected |
|--------|-------------|----------|
| First fenced block in note | Grab first triple-backtick block anywhere. Simplest; robust. | ✓ |
| First block under explicit heading | Only look inside a plugin-known heading region (new `## Code` or Phase 4's `## Solution`). Clear contract; adds a heading. | |
| First block with matching lang tag | Pick first block whose tag matches `lc-language`. Safe; requires users to tag blocks. | |

**User's choice:** First fenced block in note.

---

### Q2: How is the submission language determined?

| Option | Description | Selected |
|--------|-------------|----------|
| Fence tag wins, fallback to frontmatter | Language tag on the block wins; fall back to `lc-language` if untagged. | ✓ (with modification) |
| Frontmatter is truth | `lc-language` is the only source; fence tag decorative. | |
| Ask on first submit per problem | Modal prompt on first run, saves to `lc-language`. | |

**User's choice (free-text):** "fence tag wins, one problem have 1 md, but can have multiple submissioin with different language, so fence tag wins"

**Notes:** User explicitly endorsed "multiple submissions in different languages per problem note" as a supported workflow. Fence tag is the source of truth at submit time; `lc-language` frontmatter degrades to a starter-code default only. Locked as D-02.

---

### Q3: What happens if no fenced code block is found?

| Option | Description | Selected |
|--------|-------------|----------|
| Notice and abort | "No code block found. Add a ``` fenced block with your solution." No network call. | ✓ |
| Auto-insert starter then abort | Insert starter + Notice "Starter code inserted. Write your solution and try again." | |
| Auto-insert starter then submit anyway | Insert + run (will likely fail); instant feedback loop. | |

**User's choice:** Notice and abort.

**Notes:** Matches ROADMAP success criterion 5 verbatim ("plugin warns if no fenced code block is found"). Locked as D-04.

---

### Q4: Fenced block has NO language tag (bare ```` ``` ````). What happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to lc-language | Use frontmatter `lc-language`. Zero friction for single-language users. | |
| Notice and abort | "Add a language tag to your fenced block." Consistent with fence-tag-wins. | |
| Use SettingsStore default | Fall back to global default language (not `lc-language`). | ✓ |

**User's choice:** Use SettingsStore default.

**Notes:** Preserves the "fence tag wins" spirit — if the user cleared the tag to switch languages and didn't commit, the global preference wins. `lc-language` is per-note default, may be stale. Locked as D-03.

---

## Starter-code injection

### Q5: When does the plugin insert boilerplate into the note?

| Option | Description | Selected |
|--------|-------------|----------|
| Retrofit + on-demand command | Existing notes auto-backfilled on next open; new notes get starter at creation; command for language switches. | ✓ (with overlay-button question) |
| On note creation only | New notes get starter at Phase 2 NoteWriter time; existing notes require command. | |
| On-demand command only | Never auto-inserted; command-only. | |

**User's choice (free-text):** "retrofit + on-demand, but I'm thinking adding few buttons in the fence block, how difficult is that? something like the top right ones on leetcode"

**Screenshot provided:** LC's code editor chrome — language switcher + auto-save lock + alignment icon + bookmark + `{}` format + reset + expand icons in the top-right of the code block.

**Agent response:** Feasibility explained — Reading Mode buttons via `MarkdownPostProcessor` are ~50 LoC and safe; Live Preview buttons via CM6 `EditorView` are ~150-250 LoC and use undocumented API (flagged in CLAUDE.md). Presented 3 options; user picked "Command palette only — buttons in Phase 5". Locked as D-07 + D-11.

---

### Q6: Which UX affordance for Run/Submit does Phase 3 ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Reading Mode buttons + commands | Overlay icon row in preview via MarkdownPostProcessor + command palette. No CM6 internals. | |
| Both modes (Reading + Live Preview) | Reading Mode overlay + CM6 widget in Live Preview. Richer; undocumented API; 3× code. | |
| Command palette only — buttons in Phase 5 | Phase 3 commands only; buttons become Phase 5 Polish. | ✓ |

**User's choice:** Command palette only — buttons in Phase 5.

**Notes:** Keeps Phase 3 focused on REST endpoints, polling, verdict modal. Overlay design persists as Phase 5 Polish goal (LC-style icon row). Locked as D-10, D-11.

---

### Q7: Starter-code injection behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand command only | Single command; zero changes to Phase 2 NoteWriter. Lowest risk. | |
| Retrofit + on-demand command | Retrofit + backfill on next open + on-demand re-insertion. | ✓ |
| On-creation only + on-demand | New notes only; no retrofit; command for recovery. | |

**User's choice:** Retrofit + on-demand command. Locked as D-07.

---

### Q8: Where does the starter-code fenced block get inserted?

| Option | Description | Selected |
|--------|-------------|----------|
| Under new `## Code` heading | Phase 3 introduces plugin-owned `## Code` between `## Problem` and `## Notes`. Clear ownership. | ✓ |
| Under `## Notes` (above user text) | Insert as first child of `## Notes`. Violates Phase 2 D-08 ownership. | |
| Between `## Problem` and `## Notes`, no heading | Bare fenced block; cleaner visual; slight ambiguity on ownership. | |

**User's choice:** Under new `## Code` heading.

**Notes:** Updates Phase 2 D-01 heading inventory — Phase 3 shape is `## Problem` → `## Code` → `## Notes`. Retrofit is idempotent; only fires when no fenced block exists under `## Code`. Locked as D-06, D-08.

---

## Run/Submit UX surface

### Q9: What should the WA (Wrong Answer) modal show?

| Option | Description | Selected |
|--------|-------------|----------|
| Failing testcase + expected vs actual | Input / Expected / Actual with runtime/memory. Most useful for debugging. | ✓ |
| LC's raw error output only | Show raw LC fields with minimal formatting. Faster; less polish. | |
| Testcase diff + "Copy failing testcase to custom input" action | Diff + action button to re-run with custom input modal. | ✓ |

**User's choice (free-text):** "1+3, something like leetcode native ux" — Input / Output / Expected layout with red-for-actual / green-for-expected highlighting.

**Screenshot provided:** LC's native WA result pane — `Input` (per-arg: `nums = [3,2,4]`, `target = 6`), `Output` (red text `[0,0]`), `Expected` (green text `[1,2]`).

**Notes:** Locked both as D-12 (LC-native modal chrome + runtime/memory) and D-13 (verdict-specific body) and D-14 (action button: Copy failing testcase to custom input). Spirit test: WA modal must feel LC-equivalent.

---

### Q10: Custom test input UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Modal prompt before Run | Modal textarea pre-filled with `exampleTestcases`. Ephemeral. | |
| Dedicated `## Custom Test` heading in note | Persistent across sessions under a note heading. | |
| Both — modal with "save to note" option | Modal + checkbox to persist. | |

**User's choice (free-text):** "how difficult is it to build something like [LC's tabbed custom-input UI]?"

**Screenshot provided:** LC's tabbed custom-input — `Case 1 / Case 2 / Case 3 / +` tab row, per-argument labeled inputs (`nums = [3,3]`, `target = 6`).

**Agent response:** Feasibility breakdown —
- Tabs: easy (~60 LoC, plain CSS)
- Per-arg labeled inputs: HARD — requires parsing starter-code signature across languages (Java vs Python vs C++); fragile across LC changes; 3–5 days + permanent maintenance burden
- Full LC parity (tabs + labels + debug + "Use Testcase"): 1–2 weeks, beyond Phase 3

Presented 3 refined options; user picked "Tabbed modal, textarea per case, persist in note". Label-parsing deferred to Phase 5.

---

### Q11: Which custom-test UI should Phase 3 ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed modal, textarea per case, persist in note | Case 1/2/3/+ tabs + plain textareas + persist under `## Custom Tests`. ~1 day. | ✓ |
| Full LC parity — labeled per-arg inputs | Parse signatures; per-arg UI. 3-5 days + fragility. | |
| Simple modal, single textarea | No tabs; one textarea; half-day ship. | |

**User's choice:** Tabbed modal, textarea per case, persist in note. Locked as D-17, D-18, D-19, D-20.

---

## Polling safety & concurrency

### Q12: Hard cap on submission polling?

| Option | Description | Selected |
|--------|-------------|----------|
| 60s hard cap, then timeout Notice | Back off 1/2/4/8s up to 60s; Notice "Judge timed out." | |
| Indefinite polling + cancel button | No timeout; modal pending; user cancels. | |
| 60s cap + cancel button | 60s cap + cancel button + timeout error state. | ✓ |

**User's choice:** 60s cap + cancel button. Locked as D-21, D-22, D-23.

---

### Q13: What happens if user invokes Submit/Run while a submission is in flight?

| Option | Description | Selected |
|--------|-------------|----------|
| Block with Notice | "A submission is already in progress." Simplest; prevents parallel state. | ✓ |
| Queue — second waits | Queue behind first; verdict modal updates in order. | |
| Cancel in-flight, start new | New submission cancels previous (client-side). | |

**User's choice:** Block with Notice.

**Notes:** Matches LC's server-side behavior (LC queues serially per user). Cancel button in pending-verdict modal is the escape hatch. Locked as D-24.

---

### Q14: Unknown status code from LC?

| Option | Description | Selected |
|--------|-------------|----------|
| Show raw status + treat as not-accepted | Display raw `status_msg`; Phase 4 AC flow does NOT fire; warn log. | |
| Treat as error, abort display | Notice "Unexpected LeetCode response."; warn log. No modal. | |
| Treat as error with "Copy payload" action | Modal "Unrecognized verdict" + Copy response button; warn log. | ✓ |

**User's choice:** Treat as error with "Copy payload" action. Locked as D-15.

---

## Completion gate

### Q15: Anything else to explore?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Lock decisions and proceed. | ✓ |
| Explore more gray areas | Dig into CSRF/session handling, submission history, 429/503 recovery, runtime percentile display, Phase 4 interaction. | |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

Areas where user deferred to Claude (captured in CONTEXT.md §Claude's Discretion):

- Exact module layout under `src/solve/` (file splits for orchestrator, REST client, modals)
- Singleton vs per-command factory for `SubmissionOrchestrator` (recommendation: singleton)
- CSS approach for verdict-modal diff highlighting (inline classes vs CSS variables)
- Verdict-modal status icon choice (setIcon palette recommendation)
- `Retry-After` header handling during 429 polling
- In-memory representation of custom-test cases (persistence locked to in-note)
- Whether to cache `question_id` (internal) separately from `questionFrontendId`
- Language-normalization alias table scope (which fence tags to recognize)
- Auto-close verdict modal on AC (recommendation: no)

## Deferred Ideas

Captured in CONTEXT.md §Deferred Ideas:

- Overlay Run/Submit buttons on code block (Phase 5 Polish — Reading Mode first, Live Preview later)
- Per-argument labeled inputs in custom-test modal (Phase 5 — requires signature parsing)
- Submission history browsing (post-v1)
- Retry button in verdict modal (Phase 5)
- Auto-language detection from fenced-block syntax (deferred)
- Large-output truncation with "show more" (Phase 5 if observed issue)
- Integration tests against mocked LC server (reliability upgrade)
- Character-level / word-level diff granularity (Phase 5)
- Error-copy polish for REST failures (POLISH-02, Phase 5)

Standing deferrals: Phase 4 (GRAPH-*), Phase 5 (POLISH-*), v2 (SR/CN/MOB/AI).

---

*Discussion completed: 2026-05-08*
