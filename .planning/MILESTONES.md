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
