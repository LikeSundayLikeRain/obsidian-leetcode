# Phase 12: Polish + Plugin-Store Re-submission - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Bug fixes, UX polish, and release preparation to ship v1.1 as a re-reviewed community plugin. Addresses contest mode defects (scratch file visibility, sidebar AC status, finish lifecycle, tab idempotency, AI review stuck), verdict modal layout regressions (Close button below AI review stream), new polish features (pattern chip in verdict modal, H1 title in notes, wikilink-to-preview navigation), and operational release tasks (README audit, version bump, manifest validation, cold-start profiling).

Wave structure: **Bugs first → Polish second → Release last.**

Requirements covered: Operational phase — no base v1.1 requirements. Ships fixes for Phase 09/10/11 integration issues + polish items from success criteria.

</domain>

<decisions>
## Implementation Decisions

### A. Verdict Modal Layout

- **D-01: Remove Close button from ALL verdict states.** Obsidian's standard X button in the title bar handles dismissal universally. This eliminates the problem where AI review content renders below the Close button on AC. No branching needed — same VerdictModal class is shared across normal and contest paths (4 construction sites: `main.ts:1898`, `main.ts:2262`, `ContestSolveView.ts:323`, `ContestSolveView.ts:399`).
- **D-02: AI review streams below the Accepted banner with no footer chrome.** After removing Close, the review area fills the modal body naturally. No sticky footer needed.

### B. Pattern Chip in Verdict Modal

- **D-03: Pattern chip renders below the Accepted banner, above the AI review stream.** A small badge (e.g. "Two Pointers") appears between the Accepted title and the review area. Visible immediately after Phase 11's inline classification completes.
- **D-04: Pattern chip is clickable — navigates to the hub note.** Clicking closes the modal and opens `LeetCode/Patterns/{Pattern}.md`. Gives immediate access to related problems in the same cluster.

### C. Contest Bug Fixes

- **D-05: Scratch files move to dot-prefixed folder `.leetcode-contest/`.** Obsidian hides dot-folders from the file explorer. Files still exist on disk (supports CM6 MarkdownView editing) but are invisible to the user. `ContestScratchManager.SCRATCH_FOLDER` changes from `LeetCode/contest-scratch` to `.leetcode-contest`.
- **D-06: Contest sidebar AC status — wire verdict callback.** The `ContestSolveView` submit path must call `ContestSessionManager.onVerdictChange` when AC is detected. Currently the session manager's data source never gets the update, so the sidebar never re-renders. Fix: detect AC in the contest submit verdict handler and propagate to the session manager.
- **D-07: Contest tab idempotency — reuse existing tabs.** Clicking a problem that already has an open `ContestSolveView` tab must refocus the existing leaf instead of creating a duplicate. Apply the same `openOrReusePreview` pattern (leaf scan by view type + slug match) that `ProblemPreviewView` uses.
- **D-08: AI review deferred during active contest.** Do NOT run AI review on individual AC during a timed contest — it slows the flow. The `onStartReviewStream` callback is suppressed (not passed) when the submit originates from `ContestSolveView`. Reviews fire as a batch during finalization after notes are written to the vault.
- **D-09: Contest finish lifecycle must complete end-to-end.** Clicking "Finish" must: (1) write canonical problem notes, (2) write summary note to `LeetCode/Contests/{date}-{id}.md`, (3) trigger AI contest analysis if enabled, (4) THEN return to contest browser. The current bug silently drops back to the browser with no output — likely the finalizer call is not awaited or errors silently.

### D. Cold-Start Performance

- **D-10: First-load slowness is the primary concern.** Subsequent reloads are fast (Obsidian's module cache helps). The first load after copying a new plugin version is noticeably slow. Likely culprits: AI SDK module evaluation on first import, problem index build, or synchronous PluginData deserialization. Fix strategy: lazy-import the AI SDK (defer until first AI call), ensure problem index fetch is non-blocking.

### E. Additional Polish

- **D-11: Problem notes include `# {Title}` H1 heading.** Added at the top of the body (before `## Problem`) so the human-readable title is visible when Obsidian's "Show inline title" setting is disabled.
- **D-12: Wikilink-to-preview for unresolved problem links.** Clicking a wikilink to a problem that has no local note opens a preview tab (via `previewRouter`) instead of creating a blank file. Makes Related Variants and hub note links instantly navigable.

### F. Release Prep

- **D-13: Version bump to 1.1.0.** `manifest.json` version bumped, `minAppVersion` re-validated against Obsidian API usage.
- **D-14: README network/cost audit.** Ensure all v1.1 AI endpoints + contest API calls are documented. Cost expectations section links provider pricing.
- **D-15: GitHub release artifacts.** `main.js` + `manifest.json` attached. Lint + bundle-size CI gates green at release commit.
- **D-16: Batch migration UI is a stretch goal.** Only attempt if all other items ship cleanly.

### Claude's Discretion

- Exact CSS approach for pattern chip styling (match existing tag/chip patterns in the codebase).
- Whether cold-start lazy-import uses dynamic `import()` or deferred construction.
- ContestFinalizer error handling strategy (whether to surface partial results on failure).
- Exact implementation of wikilink-to-preview hook (Obsidian's `resolveMarkdownLink` or a workspace event).
- Wave breakdown for the plan (how to group the 13+ items into parallel execution waves).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state
- `.planning/PROJECT.md` — v1.1 milestone scope, vault-write conventions.
- `.planning/REQUIREMENTS.md` — all v1.1 requirement IDs. Phase 12 is operational (no base requirements).
- `.planning/ROADMAP.md` — Phase 12 goal + 14 success criteria.
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time; all prior phase decisions.

### v1.1 prior phase context (load-bearing precedents)
- `.planning/phases/09-ai-aced-review/09-CONTEXT.md` — AI review vault write pattern, VerdictModal streaming extension (D-08), `onStartReviewStream` callback contract.
- `.planning/phases/10-contest-virtual-analysis/10-CONTEXT.md` — Contest session architecture, ephemeral scratch design (D-09), ContestSolveView editing surface, finalization flow.
- `.planning/phases/11-ai-knowledge-graph/11-CONTEXT.md` — Pattern classification flow, hub note paths, `lc-pattern` frontmatter field.

### Project conventions (from `CLAUDE.md`)
- All HTTP to `leetcode.com` via `requestUrl` — absolute, no exceptions.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden.
- `LOCKED_HEADINGS` lives in `src/notes/NoteTemplate.ts`.
- Plugin ID prefix and "command" word forbidden in command IDs.
- Tab-reuse pattern established in Phase 06 (`openOrReusePreview` in `src/preview/previewRouter.ts`).

### v1.1 code references (read before editing)
- `src/solve/VerdictModal.ts` — VerdictModal class (shared by normal + contest paths). Phase 12 removes Close button, adds pattern chip.
- `src/solve/verdictModalRenderer.ts` — pure DOM renderer. Close button lives here (data-lc-role="close"). Remove from all verdict states.
- `src/contest/ContestScratchManager.ts:12` — `SCRATCH_FOLDER = 'LeetCode/contest-scratch'`. Change to `.leetcode-contest`.
- `src/contest/ContestSolveView.ts:323,399` — Contest VerdictModal construction sites. Wire AC detection → session manager.
- `src/contest/ContestSessionManager.ts` — `onVerdictChange` callback. Must be called from ContestSolveView on AC.
- `src/contest/ContestFinalizer.ts` — Finalization pipeline. Must complete before returning to browser.
- `src/preview/previewRouter.ts` — `openOrReusePreview` tab-reuse pattern. Reuse for contest tab idempotency + wikilink-to-preview.
- `src/notes/NoteTemplate.ts` — Note template. Add `# {Title}` H1 before `## Problem`.
- `src/main.ts:1898,2262` — Normal VerdictModal construction. Pattern chip integration site.
- `src/graph/KnowledgeGraphWriter.ts` — `onAccepted` pipeline where classification result is available for the pattern chip.
- `manifest.json` — Version bump target.
- `README.md` — Network/cost audit target.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`openOrReusePreview` in `src/preview/previewRouter.ts`** — leaf-scan + slug-match tab reuse. Apply same pattern for contest tabs and wikilink-to-preview.
- **`ContestSessionManager.onVerdictChange` callback** — already defined in the type (`ContestSessionCallbacks`). Just needs to be called from the submit path.
- **`verdictModalRenderer.ts` Close button** — `data-lc-role="close"` selector. Single removal point.
- **Phase 11's `lc-pattern` frontmatter field** — available after classification. Read this to display the pattern chip in the verdict modal.
- **`prettyName(provider)` in `src/ai/types.ts`** — could be paralleled with a `patternDisplayName` if needed.

### Established Patterns
- **Tab-reuse via leaf scan** (Phase 06) — scan workspace leaves for matching view type + identifier, focus if found, create if not.
- **`vault.process` for all vault writes** — Phase 12 follows exclusively.
- **Shape-guarded PluginData extension** — new fields get defaults at load time.
- **Dot-prefixed folders hidden by Obsidian** — standard convention for invisible storage.

### Integration Points
- **VerdictModal** — remove Close button (renderer change), add pattern chip (new DOM element after AC banner).
- **ContestSolveView submit handler** — wire AC → session manager callback.
- **ContestFinalizer** — ensure `await` on the full pipeline before switching back to browser.
- **NoteTemplate** — add H1 title line.
- **`main.ts` onload** — possibly register a workspace event for wikilink-to-preview interception.

</code_context>

<specifics>
## Specific Ideas

- VerdictModal is shared across all 4 construction sites (2 normal, 2 contest) — removing Close universally is the simplest fix with zero branching.
- Pattern chip is clickable → closes modal → opens hub note. Same "close-then-navigate" pattern as the AI Debug button.
- Contest AI review is deferred to finalization — no `onStartReviewStream` callback passed in the contest VerdictModal construction.
- First-load performance is the concern (not subsequent reloads) — likely lazy-import of AI SDK solves it.
- Wave structure: bugs (contest + verdict modal) → polish (chip, H1, wikilink) → release (README, manifest, GitHub release).

</specifics>

<deferred>
## Deferred Ideas

- **AIKG-FUT-01 (batch migration UI)** — stretch goal within Phase 12, only if everything else ships cleanly.
- **Contest live participation (CONTEST-FUT-01)** — v1.2.
- **Daily cost cap (AIREV-06)** — dropped from v1.1.
- **Per-feature AI provider routing (AIPROV-FUT-02)** — post-v1.1.

</deferred>

---

*Phase: 12-polish-plugin-store-resubmission*
*Context gathered: 2026-05-19*
