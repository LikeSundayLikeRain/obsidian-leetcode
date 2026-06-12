# Obsidian LeetCode

## What This Is

An Obsidian community plugin that fetches LeetCode problems, lets users write and submit solutions without leaving Obsidian, and turns every solved problem into a linked note in their vault. Code lives inside the note as a self-contained inline `leetcode-solve` widget — its own embedded CM6 editor with syntax highlighting, vim mode, and language switching — writing through to disk via one-way sync so the file is always the single source of truth. Layered on top: AI-powered coaching (debug suggestions, solution reviews, pattern classification), virtual contest mode, and a non-destructive problem preview surface. Inspired by vscode-leetcode, but leans into what Obsidian does well: tags, backlinks, and the knowledge graph — so a solving session compounds into a personal, searchable reference library of techniques and patterns.

## Core Value

Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

## Current State

**v1.3 shipped 2026-06-12.** 30 phases (across 4 milestones), 168 plans, ~2,873 tests passing, 1,723 KB production bundle. Tag `1.3.0`.

v1.3 replaced the v1.2 dual-CM6 nested-editor + bidirectional-sync + section-lock stack with a self-contained inline `leetcode-solve` code-block widget driven by one-way sync (`app.vault.process` as the sole mutation primitive; file is the single source of truth). This collapsed v1.2's open-ended corner-case bug class into one render path and netted −3,325 LOC in `src/`. Existing v1.2 notes migrate lazily and atomically on first open with a 30-day backup sidecar. All v1.2 editor features carry over (8 languages, vim, indent/bracket/comment rules, language switching, relative line numbers, theme integration), plus all v1.1 features (preview, AI coaching, contest mode, knowledge graph). Shipped via BRAT 7-day dogfood → 1.3.0 stable.

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
- ✓ Inline `leetcode-solve` widget mounts in Reading mode + Live Preview (two-path) with its own embedded CM6 editor — v1.3
- ✓ One-way sync: widget edits → debounced `vault.process` → atomic fence-body rewrite; file is single source of truth — v1.3
- ✓ Per-path content-hash echo suppression + per-file rate-limit + six flush-on-transition hooks (no lost edits) — v1.3
- ✓ External-edit reconciliation via `vault.on('modify')` with cursor-preserving reload + conflict modal (Keep mine / external / diff) — v1.3
- ✓ `atomicRanges` keeps parent cursor out of the fence; widget state (cursor/scroll/undo) persists across remount — v1.3
- ✓ Action row (Run / Submit / AI Debug / Reset / Copy) + language chevron mount inside the widget — v1.3
- ✓ `![[embed]]` and stray-fence rendering degrade to read-only safely — v1.3
- ✓ Narrowed section protection (`## Problem` body + `## Techniques` heading only); fence opener/closer owned by widget — v1.3
- ✓ Lazy atomic migration of v1.2 notes on first open + 30-day backup sidecar + CI fixtures — v1.3
- ✓ v1.2 path deleted (5 files + ~800 LOC wiring + `'leetcode.*'` userEvent convention), net −3,325 LOC — v1.3

### Active

(None — v1.3 shipped. Next milestone requirements defined via `/gsd-new-milestone`.)

## Completed: v1.3 Inline Widget Architecture (2026-06-12)

**Delivered:** Self-contained inline `leetcode-solve` widget + one-way sync replacing the v1.2 dual-CM6 stack; file is the single source of truth. Lazy atomic v1.2-note migration with backup sidecar. v1.2 path fully removed (net −3,325 LOC). See MILESTONES.md for full details.

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
- **Multi-pane live/mirror widget sync** — Single-active-per-file is the v1.3 baseline; promote-on-focus live/mirror (MULTI-01/02) deferred to v1.4+.
- **Widget editing inside `![[]]` embeds** — Embeds render read-only; edit the source note instead.
- **`cm.dispatch` from widget into parent CM6** — Architectural anti-pattern; widget edits go through `vault.process` only.
- **Batch migration on plugin load** — Lazy-on-open only; never freeze the vault rewriting v1.2 notes en masse.
- **Static/opinionated widget palette (VS Code themes)** — Theme-tracking is the v1.3 behavior; static palette (PALETTE-01) deferred to v1.4+ backlog.
- **Multiple `leetcode-solve` fences per problem note** — Single fence per note in v1.3; multi-fence support deferred to v1.4 candidate.
- **Hot-reload of vim-mode toggle** — Settings-panel vim toggle requires an Obsidian reload (VIM-03 resolved via documentation; banner not shipped).

## Context

- **v1.3 is the editing-model rewrite.** The widget owns its embedded CM6 `EditorView`; edits flow one-way through `app.vault.process` (the sole mutation primitive) to disk. File = single source of truth, widget = active editor, parent CM6 = passive consumer. Collapsed v1.2's bug surface into one render path.
- **v1.1 shipped as a full practice + coaching platform.** Preview → solve → submit → AI review → pattern classification → knowledge graph — all without leaving Obsidian.
- **Tech stack:** TypeScript, esbuild, Obsidian API, CM6, `@replit/codemirror-vim`, Vercel AI SDK 6.x, `@leetnotion/leetcode-api`, turndown, vitest.
- **Bundle:** 1,723 KB raw (ceiling 1.8 MB, set Phase 17 D-19 for vim). v1.3 netted −3,325 LOC in `src/` but bundle stayed flat (CodeMirror vim + language packs dominate). AI SDK + CM6 are the primary contributors; CJS-no-splitting makes dynamic import ineffective.
- **Widget architecture (v1.3):** `WidgetController` per fence; `widgetRegistry.ts` is a thin `Map<key, EditorView>`; self-write echo suppression is a per-path content-hash map (2s TTL); the only fence-body write path is `applyAuthoritativeBody`. See CLAUDE.md `## Architecture` for the canonical detail.
- **AI architecture:** `AIClient` facade → provider adapters → `obsidianFetch(mode)` transport. Native `window.fetch()` for streaming (confined to `src/ai/`), `requestUrl` for everything else.
- **User is primary user:** Built by the author for daily LC practice; dogfood guides UX. v1.3 shipped via a BRAT 7-day dogfood window with fixes landed through `/gsd-quick`.
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
| Inline code-block widget + one-way sync (v1.3) | v1.2 dual-CM6 sync proved an open-ended bug surface; widget = single source of truth, file = passive consumer | ✓ Good — collapsed the bug class; net −3,325 LOC |
| `app.vault.process` as sole mutation primitive (v1.3) | One write path; retry-safe; no `cm.dispatch` into parent | ✓ Good |
| Two-path mount: code-block processor (Reading) + ViewPlugin `Decoration.replace` (Live Preview) (v1.3) | Single path breaks half of all user workflows | ✓ Good |
| Per-path content-hash echo suppression, 2s TTL (v1.3) | Boolean flag is provably broken under concurrent multi-file flushes | ✓ Good |
| `EditorView.atomicRanges` keeps parent cursor out of fence (v1.3) | Without it, Live Preview unmounts the widget on cursor approach, destroying state | ✓ Good |
| Narrowed `sectionProtectionExtension` (`## Problem` + `## Techniques` only) (v1.3) | Widget owns the fence range, so opener/closer locks are moot; `'leetcode.*'` userEvent retired | ✓ Good |
| Lazy atomic v1.2-note migration + 30-day backup (v1.3) | Never batch-rewrite vault data on plugin load; disk never sees a half-migrated state | ✓ Good |
| Single-active-per-file multi-pane (v1.3) | Live/mirror promote-on-focus deferred to v1.4+; "Take over" affordance covers the common case | ✓ Good |
| Reload-on-vim-toggle accepted (v1.3) | Listening for Obsidian vim toggle has no clean event; reload is acceptable to user | ✓ Good — VIM-03 resolved via README docs; banner not shipped |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-12 — after v1.3 milestone (Inline Widget Architecture shipped)*
