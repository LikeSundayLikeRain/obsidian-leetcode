# Obsidian LeetCode

## What This Is

An Obsidian community plugin that fetches LeetCode problems, lets users write and submit solutions without leaving Obsidian, and turns every solved problem into a linked note in their vault. Inspired by vscode-leetcode, but leans into what Obsidian does well: tags, backlinks, and the knowledge graph — so a solving session compounds into a personal, searchable reference library of techniques and patterns.

## Core Value

Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- v1 scope. Building toward these. -->

- [ ] Browse and search LeetCode problems from inside Obsidian
- [ ] Authenticate with leetcode.com via embedded login window (preferred) with cookie-paste fallback
- [ ] Open a problem as a note in the vault (one note per problem, markdown)
- [ ] Write solution code in the note editor in any LeetCode-supported language
- [ ] Run code against LeetCode's sample/custom test cases (remote)
- [ ] Submit code to LeetCode's judge and display verdict
- [ ] Auto-import LeetCode's problem tags (difficulty, topics) as Obsidian tags
- [ ] Support user-added personal tags (e.g. `#revisit`, `#tricky`, `#interview-asked`)
- [ ] On accepted submission: append solution code into the problem note
- [ ] On accepted submission: update note frontmatter with solved date, runtime, memory, language
- [ ] On accepted submission: create/update backlinks to technique notes (e.g. `[[Two Pointers]]`)
- [ ] Cached problems are readable offline
- [ ] Settings UI: login, default language, vault folder for problems
- [ ] Graceful error handling: LC downtime, expired session, rate limits
- [ ] README with install, usage, screenshots — ready for community plugin submission

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
| Desktop-only in v1 | Unlocks embedded login window, simpler architecture, mobile is not the primary LC solving surface anyway | — Pending |
| leetcode.com only in v1 | Different API/auth surface than leetcode.cn; scope control for first ship | — Pending |
| One note per problem (not problem + separate code file) | Graph-native, simpler, solution lives with notes and tags | — Pending |
| All LC languages supported for submission (not just Java/Python) | Remote submission is a language-agnostic API call; rejecting languages locks out users | — Pending |
| No spaced repetition in v1 | Defer to v2; graph/tags already answer "what should I revisit?" adequately | — Pending |
| Embedded login preferred, cookie-paste fallback | Smooth UX when possible, works-everywhere fallback when not | — Pending |
| Auto-update note on accepted submission (solution, metadata, backlinks) | Captures the win immediately; turns solving into knowledge automatically | — Pending |

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
*Last updated: 2026-05-07 after initialization*
