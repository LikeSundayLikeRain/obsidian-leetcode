# Obsidian LeetCode

## What This Is

An Obsidian community plugin that fetches LeetCode problems, lets users write and submit solutions without leaving Obsidian, and turns every solved problem into a linked note in their vault. Inspired by vscode-leetcode, but leans into what Obsidian does well: tags, backlinks, and the knowledge graph — so a solving session compounds into a personal, searchable reference library of techniques and patterns.

## Core Value

Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

## Current State

**v1.0 MVP shipped 2026-05-14.** 10 phases, 61 plans, 76 tasks, ~163 KB production bundle, 652 tests passing.

The plugin is functionally complete and ship-ready. Plan 07 (GitHub release / community-plugins.json PR) is documented as a deferred manual step in `.planning/milestones/v1.0-phases/05-polish-ship/05-07-SUMMARY.md` — version bump + tag + release artifacts are ready to execute whenever the user is.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Browse and search LeetCode problems from inside Obsidian — v1.0 (Phase 01–02)
- ✓ Authenticate with leetcode.com via embedded login window (preferred) with cookie-paste fallback — v1.0 (Phase 01)
- ✓ Open a problem as a note in the vault (one note per problem, markdown) — v1.0 (Phase 02)
- ✓ Write solution code in the note editor in any LeetCode-supported language — v1.0 (Phase 02 + 05.3 chevron-driven language switch)
- ✓ Run code against LeetCode's sample/custom test cases (remote) — v1.0 (Phase 03 + 05.4 multi-case Run modal)
- ✓ Submit code to LeetCode's judge and display verdict — v1.0 (Phase 03 + 05.4 verdict polish)
- ✓ Auto-import LeetCode's problem tags (difficulty, topics) as Obsidian tags — v1.0 (Phase 02 + 04)
- ✓ Support user-added personal tags (e.g. `#revisit`, `#tricky`, `#interview-asked`) — v1.0 (Phase 02 union-merge frontmatter)
- ✓ On accepted submission: solution code already lives in `## Code` (no append needed — D-01 GRAPH-01 revised) — v1.0 (Phase 04)
- ✓ On accepted submission: update note frontmatter with language + status (solved date / runtime / memory dropped — no production reader, staleness risk; runtime/memory render fresh from GraphQL) — v1.0 (Phase 04 + UAT trim 05.5)
- ✓ On accepted submission: create/update backlinks to technique notes (e.g. `[[Two Pointers]]`) — v1.0 (Phase 04)
- ✓ Cached problems are readable offline — v1.0 (Phase 02)
- ✓ Settings UI: login, default language, vault folder for problems — v1.0 (Phase 01 + 05)
- ✓ Graceful error handling: LC downtime, expired session, rate limits — v1.0 (Phase 03 + 05.4)
- ✓ README with install, usage, screenshots — ready for community plugin submission — v1.0 (Phase 05)
- ✓ Plugin-owned regions structurally locked to prevent accidental edits — v1.0 (Phase 05.5; emerged during dogfood)

### Active

<!-- v2+ scope. Empty — v1 shipped. -->

(None — awaiting v1.1 milestone scoping)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Obsidian mobile support** — Embedded login and some LC integration paths need Electron APIs that don't exist on mobile; defer to a later milestone.
- **leetcode.cn (Chinese LeetCode)** — Different API surface, URLs, and auth. Adds significant scope; v2 milestone.
- **Spaced repetition / review scheduling** — Deferred to v2. Graph + tags alone are enough to surface problems to revisit for v1.
- **AI-powered tagging** — Future enhancement once core solving/tagging flow is stable.
- **Local code execution** — LeetCode's Run Code endpoint handles remote execution for all supported languages; no need for local runtimes.
- **IDE-style features** (IntelliSense, linting, debugger) — Obsidian isn't an IDE; for deep editing, users can still use their IDE of choice. This plugin is for solve-and-capture.

## Context

- **Reference implementation:** vscode-leetcode is the feature benchmark — submit/run/tag functionality is well-established there. Our differentiation is Obsidian-native integration (notes, tags, graph, offline) rather than reinventing LC interaction.
- **Authentication reality:** vscode-leetcode uses a custom `leetcode.com/authorize-login/vscode/?path=...` endpoint that was a bespoke LC integration redirecting to `vscode://`. That endpoint won't redirect to Obsidian. We'll replicate the UX with an embedded Electron BrowserWindow that captures the session cookie after normal login.
- **Desktop-only architecture:** v1 targets Electron-based desktop Obsidian (macOS, Windows, Linux). This unlocks BrowserWindow, filesystem access for offline cache, and simpler HTTP handling.
- **Graph-first design:** Obsidian's killer feature is linked notes. Problem notes should be graph citizens from day one — backlinks to technique notes, tag clouds, and vault-wide search "just working."
- **User is primary user:** This is being built by the author for their own daily LC practice first, then polished for community release. Dogfood guides UX.
- **Primary languages:** Java and Python for the author's own use, but submission must work for all LC-supported languages since remote submission is cheap to support across languages.

## Constraints

- **Platform**: Desktop Obsidian only for v1 (macOS, Windows, Linux) — mobile deferred.
- **Target site**: leetcode.com only for v1 — leetcode.cn deferred.
- **Tech stack**: Obsidian plugin (TypeScript) — follows the official plugin API and community guidelines for store submission.
- **Dependencies**: Prefer a well-maintained existing LeetCode API library (e.g. `leetcode-query` or similar) over hand-rolling GraphQL calls. Selection during research phase.
- **Compatibility**: Must pass the Obsidian community plugin review criteria (no suspicious network calls, CSP-safe, honors user vault, no telemetry by default).
- **Offline**: Previously-fetched problem content must be readable without internet.
- **Security**: Session cookie lives in local plugin data only — never logged, never transmitted anywhere except LC.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop-only in v1 | Unlocks embedded login window, simpler architecture, mobile is not the primary LC solving surface anyway | ✓ Good — `isDesktopOnly: true` in manifest; no mobile bug reports during dogfood |
| leetcode.com only in v1 | Different API/auth surface than leetcode.cn; scope control for first ship | ✓ Good — clean ship; .cn can come in v2 |
| One note per problem (not problem + separate code file) | Graph-native, simpler, solution lives with notes and tags | ✓ Good — single-file model is the sweet spot; `## Problem` / `## Code` / `## Techniques` / `## Notes` template proven in dogfood |
| All LC languages supported for submission (not just Java/Python) | Remote submission is a language-agnostic API call; rejecting languages locks out users | ✓ Good — chevron switch (05.3) makes it discoverable |
| No spaced repetition in v1 | Defer to v2; graph/tags already answer "what should I revisit?" adequately | ✓ Good — graph is a sufficient v1 review surface |
| Embedded login preferred, cookie-paste fallback | Smooth UX when possible, works-everywhere fallback when not | ✓ Good — embedded BrowserWindow path is the default, fallback rarely needed |
| Auto-update note on accepted submission (solution, metadata, backlinks) | Captures the win immediately; turns solving into knowledge automatically | ✓ Good — `KnowledgeGraphWriter.onAccepted` is the linchpin of the graph value-prop |
| **vault.process not cm.dispatch for plugin writes** (CF-06) | Vault-layer writes are retry-safe and bypass CM6's transactionFilter; cm.dispatch interferes with section-lock | ✓ Good — section-lock (05.5) shipped on top of this without breaking copyToCode |
| **`'leetcode.*'` userEvent annotation** as the convention for plugin-internal CM6 dispatches | Single bypass channel for the section-lock; documented in CLAUDE.md | ✓ Good — chevron switch + lock filter co-exist cleanly |
| **Drop `lc-solved-date` / `lc-runtime-ms` / `lc-memory-mb` from frontmatter** | No production reader; staleness risk on re-AC. Display reads fresh from GraphQL | ✓ Good — narrower frontmatter surface |
| **Section locking via `EditorState.changeFilter`** (05.5) | User edits to plugin-owned regions get clobbered on next plugin write; lock prevents the divergence at the keystroke level | ✓ Good — emerged during dogfood; cleaner than divergence detection |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-14 after v1.0 milestone*
