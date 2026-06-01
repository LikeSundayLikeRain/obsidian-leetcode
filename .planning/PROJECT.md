# Obsidian LeetCode

## What This Is

An Obsidian community plugin that fetches LeetCode problems, lets users write and submit solutions without leaving Obsidian, and turns every solved problem into a linked note in their vault. Now with AI-powered coaching (debug suggestions, solution reviews, pattern classification), virtual contest mode, and a non-destructive problem preview surface. Inspired by vscode-leetcode, but leans into what Obsidian does well: tags, backlinks, and the knowledge graph — so a solving session compounds into a personal, searchable reference library of techniques and patterns.

## Core Value

Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

## Current State

**v1.2 shipped 2026-05-26.** 25 phases (across 3 milestones), 133 plans, 1,713 tests passing, 1.71 MB production bundle.

The plugin now includes a nested code editor with full language support (8 languages), vim mode, relative line numbers, fence auto-recovery, and all v1.1 features (preview, AI coaching, contest mode, knowledge graph). Version 1.2.0-alpha.1 pre-released for testing.

## Requirements

### Validated

- ✓ Browse and search LeetCode problems from inside Obsidian — v1.0
- ✓ Authenticate with leetcode.com via embedded login window (preferred) with cookie-paste fallback — v1.0
- ✓ Open a problem as a note in the vault (one note per problem, markdown) — v1.0
- ✓ Write solution code in the note editor in any LeetCode-supported language — v1.0
- ✓ Run code against LeetCode's sample/custom test cases (remote) — v1.0
- ✓ Submit code to LeetCode's judge and display verdict — v1.0
- ✓ Auto-import LeetCode's problem tags (difficulty, topics) as Obsidian tags — v1.0
- ✓ Support user-added personal tags (e.g. `#revisit`, `#tricky`, `#interview-asked`) — v1.0
- ✓ On accepted submission: update note frontmatter + create/update backlinks — v1.0
- ✓ Cached problems are readable offline — v1.0
- ✓ Settings UI: login, default language, vault folder for problems — v1.0
- ✓ Graceful error handling: LC downtime, expired session, rate limits — v1.0
- ✓ Plugin-owned regions structurally locked to prevent accidental edits — v1.0
- ✓ Preview mode (read-mode tab + Start/Open Problem button) — v1.1
- ✓ Contest virtual mode (past + random + post-contest analysis) — v1.1
- ✓ AI debug (user-triggered streaming modal) — v1.1
- ✓ AI ACed-solution review (3 dimensions: Approach, Efficiency, Code Style) — v1.1
- ✓ AI knowledge-graph maintenance (22-pattern clusters supersede lc-tag Techniques) — v1.1
- ✓ AI difficulty-progression + cross-cluster Related Variants + look-ahead edges — v1.1
- ✓ Multi-provider AI support (BYO key + custom base URL + Bedrock) — v1.1
- ✓ Nested code editor with syntax highlighting for 8 languages — v1.2
- ✓ Tab/Shift-Tab indent/dedent inside code fence — v1.2
- ✓ Smart Enter (auto-indent after braces/colon, split matched braces) — v1.2
- ✓ Bracket auto-close and overtype inside fence (no markdown pairs) — v1.2
- ✓ Language switching updates indent/bracket/comment rules instantly — v1.2
- ✓ Cmd-/ comment toggling with correct per-language syntax — v1.2
- ✓ Bracket match highlighting — v1.2
- ✓ Vim mode with keystroke isolation in code editor — v1.2
- ✓ Fence auto-recovery on non-CM6 edits (vim dd, external tools) — v1.2
- ✓ Optional relative line numbers in code editor — v1.2

### Active

(Next milestone not yet started — run `/gsd:new-milestone`)

## Completed: v1.2 Code Editor Experience (2026-05-26)

**Delivered:** Nested CM6 EditorView with full language support, vim mode, fence auto-recovery, and relative line numbers. See MILESTONES.md for full details.

### Out of Scope

- **Obsidian mobile support** — Embedded login and AI streaming need Electron APIs that don't exist on mobile.
- **leetcode.cn (Chinese LeetCode)** — Different API surface, URLs, and auth. v2 milestone.
- **Spaced repetition / review scheduling** — Graph + cluster hubs + #revisit auto-tag cover the review surface.
- **Live contest participation** — Needs real-time leaderboards and contest-day submission throttling. v1.1 is virtual-only.
- **AI key proxy / hosted AI service** — BYO key only. No telemetry surface, no hosting cost.
- **Local code execution** — LeetCode's Run Code endpoint handles remote execution.
- **IDE-style features** (IntelliSense, linting, debugger) — Obsidian isn't an IDE.
- **Auto-debug on every WA** — Cost surprise + anti-feature; debug must remain user-triggered.
- **Auto-apply AI suggested code** — Trust boundary; AI suggestions stay in `## AI Review`.
- **Auto-rewrite v1.0 `## Techniques` on plugin update** — Lazy-on-AC migration is mandatory default.
- **Free-form AI cluster names** — Frozen 22-pattern taxonomy prevents graph fragmentation.
- **Telemetry / usage analytics** — Non-negotiable for plugin-store.

## Context

- **v1.1 shipped as a full practice + coaching platform.** Preview → solve → submit → AI review → pattern classification → knowledge graph — all without leaving Obsidian.
- **Tech stack:** TypeScript, esbuild, Obsidian API, CM6, Vercel AI SDK 6.x, `@leetnotion/leetcode-api`, turndown, vitest.
- **Bundle:** 1.155 MB (ceiling 1.2 MB). AI SDK is the primary contributor; CJS-no-splitting makes dynamic import ineffective.
- **AI architecture:** `AIClient` facade → provider adapters → `obsidianFetch(mode)` transport. Native `window.fetch()` for streaming (confined to `src/ai/`), `requestUrl` for everything else.
- **User is primary user:** Built by the author for daily LC practice; dogfood guides UX.
- **Primary languages:** Java and Python, but all LC languages supported.

## Constraints

- **Platform**: Desktop Obsidian only (macOS, Windows, Linux) — mobile deferred.
- **Target site**: leetcode.com only — leetcode.cn deferred.
- **Tech stack**: Obsidian plugin (TypeScript) — follows official plugin API and community guidelines.
- **Compatibility**: Must pass Obsidian community plugin review criteria.
- **Offline**: Previously-fetched problem content must be readable without internet.
- **Security**: Session cookie + AI keys in local plugin data only — never logged, never transmitted anywhere except their intended targets.
- **AI transport**: `leetcode.com` calls always via `requestUrl`; AI calls via native `window.fetch()` (streaming) or `requestUrl` (non-streaming). Never cross the boundary.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop-only | Unlocks embedded login, Electron APIs for AI streaming | ✓ Good |
| leetcode.com only | Scope control; .cn is different API surface | ✓ Good |
| One note per problem | Graph-native; solution lives with notes and tags | ✓ Good |
| All LC languages supported | Remote submission is language-agnostic | ✓ Good |
| Embedded login preferred, cookie-paste fallback | Smooth UX when possible | ✓ Good |
| `vault.process` not `cm.dispatch` for plugin writes | Retry-safe, bypasses section-lock cleanly | ✓ Good |
| `'leetcode.*'` userEvent bypass convention | Single channel for plugin CM6 dispatches | ✓ Good |
| Section locking via `EditorState.changeFilter` | Prevents user edits to plugin-owned regions | ✓ Good |
| Bundle ceiling 500 KB → 1 MB (v1.1) | AI SDK lands as single unit; CJS-no-splitting | ✓ Necessary |
| Native `window.fetch()` primary streaming tier (v1.1) | `electron.net.fetch` probe fails on contextIsolation:true | ✓ Good |
| Bedrock as native 5th provider (v1.1) | `@ai-sdk/amazon-bedrock` + in-plugin credential chain | ✓ Good |
| 22-pattern taxonomy frozen at v1.1 | Prevents cluster-name drift fragmentation | ✓ Good |
| Look-ahead edges feature-flagged (v1.1) | Novel UX; can disable in field | ✓ Good |
| Lazy-on-AC Techniques migration (v1.1) | Never batch-rewrite on plugin load | ✓ Good |
| All AI vault writes via `app.vault.process` (v1.1) | Consistent with v1.0 vault-write discipline | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-21 — v1.2 milestone started*
