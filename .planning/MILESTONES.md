# Milestones

## v1.0 MVP (Shipped: 2026-05-14)

**Phases completed:** 10 phases, 61 plans, 76 tasks

**Delivered:** A first-class Obsidian plugin for solving LeetCode problems without leaving the vault. Browse the LeetCode problem list, open a problem as a vault note (problem statement → `## Problem`, solution → `## Code`, your reflections → `## Notes`), run code against custom test cases, submit solutions and see verdicts inline, switch fence languages from a chevron dropdown, view past submissions, and have technique tags + backlinks auto-generated on Accepted submissions. Plugin-owned regions are structurally locked to prevent accidental edits.

### Key accomplishments

1. **Plugin foundation** (Phase 01) — Embedded BrowserWindow login flow, session cookie capture + persistence, throttled `requestUrl` HTTP layer with rate-limit handling, right-sidebar `ItemView` problem browser, ribbon icon + command palette activation.

2. **Problems-as-notes pipeline** (Phase 02) — First-click creates a `LeetCode/{id}-{slug}.md` vault note with full frontmatter (lc-id, lc-slug, lc-title, lc-difficulty, lc-url, lc-status, lc-language, aliases, tags), HTML-to-Markdown conversion via turndown, `## Problem` + `## Notes` template, `LeetCode.base` Bases view, offline cache.

3. **Run/Submit + verdict** (Phase 03) — Run code against editable test-case tabs, submit to LC, polling-based judge with abort/timeout, terminal verdict modal (Accepted/WA/TLE/MLE/RE/CE), session-expiry detection chain, network/rate-limit/timeout error UX.

4. **Knowledge graph wiring** (Phase 04) — On Accepted: auto-merge topic-slug tags (`lc/array`, `lc/hash-table`, …), append wikilinks under `## Techniques`, write technique stubs to a configurable folder, opt-out toggle for users who don't want auto-backlinks.

5. **Polish + ship-blocker resolution** (Phase 05 + 05.1 + 05.2) — Reading-mode action row (Run/Submit buttons under `## Code` fences), edit-mode inline buttons via CM6 `CodeActionsWidget` block decoration, copy-to-code from past submissions, settings-tab UI, MarkdownRenderer integration in submission detail modal.

6. **Language-aware editor** (Phase 05.3) — Chevron dropdown to switch fence language atomically (rewrites opener tag + body + frontmatter `lc-language` in one undo step), portal-pattern dropdown that escapes CM6 paint container, default-language fallback, `'leetcode.lang-switch'` userEvent annotation as the bypass convention for plugin-internal CM6 dispatches.

7. **Run/verdict UX polish** (Phase 05.4) — Multi-case Run modal with per-case input/output rendering, arity inference from `metaData`, "Copy failing testcase" affordance from VerdictModal, ephemeral tab store, polish across the verdict pill rendering and inline action row spacing.

8. **Section locking for lc-slug notes** (Phase 05.5) — `## Problem` body, `## Code` heading + fence opener + closing fence, `## Techniques` heading, `## Notes` heading become read-only in Edit Mode via a CM6 `EditorState.changeFilter`. Cursor snaps out of locked ranges. Selections allow copy. Heading `##` markers hidden for Reading-Mode parity. `vault.process` writes pass through cleanly.

### Tech stack

- TypeScript ^5.8.3 + esbuild bundler
- Obsidian plugin API + CodeMirror 6 (`@codemirror/state`, `@codemirror/view`)
- `@leetnotion/leetcode-api` for problem-list/detail/submissions GraphQL
- Hand-rolled REST for `interpret_solution` / `submit` / `check`
- `requestUrl` (Obsidian built-in) for all HTTP — bypasses Electron CORS
- `turndown` for HTML→Markdown conversion
- `vitest` for unit testing — 652 tests passing, ~163 KB production bundle

### Outstanding work (not v1.0 scope)

- Plan 07 (`05-07-SUMMARY.md`): GitHub release / `community-plugins.json` PR — version bump + tag + release artifacts. Documented as deferred manual step; ready to execute whenever the user is.

### Archived artifacts

- `.planning/milestones/v1.0-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.0-REQUIREMENTS.md` — requirements traceability with outcomes

---

## v1.1 Contest, AI Coach, and Preview (Shipped: 2026-05-20)

**Phases completed:** 9 phases, 41 plans
**Timeline:** 2026-05-15 → 2026-05-20 (5 days)
**Stats:** 206 files changed, 37,219 insertions, 2,141 deletions. 1,450 tests passing. Bundle: 1.155 MB.

**Delivered:** AI-powered coaching + contest training + non-destructive preview. The v1.0 "solve and capture" plugin becomes a practice + coaching + AI-curated knowledge graph — preview problems without creating notes, run virtual past contests with timer and scoring, get AI debug suggestions on failed submissions, receive AI-generated 3-dimension reviews on Accepted solutions, and have AI maintain a 22-pattern knowledge graph with hub notes, difficulty-progression edges, cross-cluster Related Variants, and look-ahead wikilinks to unsolved problems.

### Key accomplishments

1. **Preview mode** (Phase 06) — Click-to-preview replaces click-to-create as default. Sticky header with difficulty + topic chips, "Start Problem" / "Open Problem" buttons, right-click context menu, tab-reuse semantics. CI bundle-size gate + eslint-plugin-obsidianmd@^0.3.0 lint baseline.

2. **AI Provider Foundation** (Phase 07) — `AIClient` facade with 5 provider adapters (Anthropic, OpenAI, OpenRouter, Ollama, Bedrock), `obsidianFetch(mode)` transport layer, masked key input, one-time data-flow disclosure modal, Test Connection probe matrix, Clear AI Key command, README network disclosure.

3. **AI Debug** (Phase 08 + 08.1 + 08.2) — User-triggered "AI: Debug" button on failed submissions. Token-by-token streaming via native `window.fetch()` primary tier with 2 fallback tiers. AWS Bedrock as full 5th provider with canonical credential chain (`AWS_PROFILE`, `credential_process`, auto-refresh). AIStreamModal with live render, Thinking indicator, Cancel + Copy.

4. **AI ACed Review** (Phase 09) — Opt-in auto-review on Accepted: 3-dimension LLM call (Approach + Efficiency + Code Style) writes to locked `## AI Review` section. Idempotent on re-AC. Manual re-run from command palette. Section-lock enforced.

5. **Contest mode** (Phase 10) — Past contest picker + "Surprise me" random. Virtual timer (90/100 min) with persistent epoch-baseline. 4-problem solve view with Run/Submit. Active contest header (countdown + verdict badges + pause/abort). ContestFinalizer writes summary note with solved/missed, per-problem time, score, technique tags, #revisit auto-tagging.

6. **AI Knowledge Graph** (Phase 11) — 22-pattern classifier (18 NeetCode + 4 additional). Cluster hub notes at `LeetCode/Patterns/{Cluster}.md` with difficulty-progression edges. Lazy-on-AC migration from v1.0 lc-tag wikilinks. Cross-cluster `## Related Variants` (capped at 2). Feature-flagged look-ahead edges to unsolved problems.

7. **Polish + release** (Phase 12) — Pattern chip on verdict modal, wikilink-to-preview navigation, H1 titles in notes, contest bug fixes (scratch files, tab idempotency, finish lifecycle), lazy AIClient construction, manifest v1.1.0, README audit.

### Tech stack additions (over v1.0)

- Vercel AI SDK 6.x (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/amazon-bedrock`)
- Native `window.fetch()` for streaming AI (confined to `src/ai/` via prelint + fs-walk gates)
- In-plugin AWS credential chain (INI parser, `credential_process` spawnSync, cache + auto-refresh)
- 1,450 tests passing (up from 652 in v1.0)

### Archived artifacts

- `.planning/milestones/v1.1-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.1-REQUIREMENTS.md` — requirements traceability with outcomes
