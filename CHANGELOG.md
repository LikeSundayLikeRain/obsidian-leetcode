# Changelog

All notable changes to **LeetCode for Obsidian** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-14

Initial public release.

### Added

#### Browse + open
- Right-sidebar problem browser with search, difficulty filter, and status filter.
- Embedded `BrowserWindow` login flow that captures the LeetCode session cookie after normal sign-in. Manual cookie-paste available as a fallback.
- Throttled `requestUrl`-based HTTP layer with rate-limit handling and a "Fetching from LeetCode…" footer indicator after sustained queue depth.
- One-click "open as note" — creates `LeetCode/{id}-{slug}.md` with full frontmatter (`lc-id`, `lc-slug`, `lc-title`, `lc-difficulty`, `lc-url`, `lc-status`, `lc-language`, aliases, tags), the problem statement converted to Markdown, and `## Code` / `## Notes` headings ready for solving.
- `LeetCode.base` Bases view in the problems folder — sortable table of all opened problems by `lc-id`.
- Offline cache — previously-fetched problems read from `data.json` without internet.

#### Solve
- Run code against custom test cases via the `LeetCode: Run` command — multi-tab modal with editable inputs, per-case output rendering, and arity inference from LC's `metaData`.
- Submit solutions via the `LeetCode: Submit` command. Polling-based judge handles every verdict type (Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Compile Error, Runtime Error).
- Inline `Run` and `Submit` action row anchored directly below the `## Code` fence — visible in both Reading mode and Edit mode (Live Preview + Source).
- Chevron dropdown to switch the fence's language atomically — rewrites the fence opener tag, replaces the body with the new language's starter code, and updates `lc-language` frontmatter in a single undo-able transaction.
- Past-Submissions modal (`LeetCode: View past submissions`) — list of your prior submissions with verdict pill, runtime, memory, and language. Click a row to open the submission detail with syntax-highlighted code.
- "Copy to ## Code" — copy any past submission's code into the active note's `## Code` fence.
- "Copy failing testcase" — pull the offending input from a Wrong Answer verdict back into a new Run-modal tab.

#### Knowledge graph
- On Accepted: auto-merge LeetCode topic tags as `lc/{slug}` tags (e.g. `lc/array`, `lc/hash-table`).
- On Accepted: append `[[Technique Name]]` wikilinks under a `## Techniques` section, automatically creating stub technique notes in a configurable folder.
- Settings toggle to disable automatic technique backlinks if you prefer to curate the graph manually.

#### Section locking
- `## Problem` body, `## Code` heading + fence opener + closing fence, `## Techniques` heading, and `## Notes` heading are read-only in Edit mode for any note with `lc-slug` frontmatter.
- Cursor automatically snaps out of locked regions on click and arrow navigation.
- Selections across locked text are allowed (so you can copy locked content).
- Locked heading `## ` markers are hidden in Live Preview for parity with Reading mode.
- Plugin-internal CM6 dispatches that need to write to locked regions use the `'leetcode.*'` userEvent annotation as a documented bypass channel.

#### Settings
- Authentication section — log in / log out / paste session cookie.
- Notes section — choose problems folder (default: `LeetCode`) and default language (default: `python3`).
- Knowledge Graph section — override the technique-notes folder and toggle auto-backlinks.

### Locked decisions

These decisions are intentional v1.0 choices, documented here so future versions don't reverse them silently:

- **Desktop-only** — `isDesktopOnly: true`. The embedded login window depends on Electron's `BrowserWindow`, which mobile Obsidian doesn't have. Mobile support is deferred to a future major version.
- **leetcode.com only** — `leetcode.cn` has a different API surface and authentication model. Deferred to a future version.
- **One note per problem** — solution code lives inside the problem note's `## Code` fence rather than in a separate file. Keeps the note graph-native and self-contained.
- **`vault.process` for plugin writes** — all plugin-side note mutations go through Obsidian's vault layer (not `cm.dispatch`) so they're retry-safe and don't conflict with the section lock filter.
- **No `lc-solved-date` / `lc-runtime-ms` / `lc-memory-mb` frontmatter** — these had no production reader and risked staleness on re-acceptance. Runtime, memory, and submission timestamp render fresh from the LeetCode GraphQL API in the Past Submissions modal.

### Known limitations

- Mobile Obsidian is not supported (see Locked decisions).
- `leetcode.cn` is not supported (see Locked decisions).
- Submission detail modal opens with default Obsidian syntax highlighting; very long submissions (10k+ lines) may render slowly.

### Tech stack

- TypeScript ^5.8.3 + esbuild bundler
- Obsidian plugin API + CodeMirror 6 (`@codemirror/state`, `@codemirror/view`)
- `@leetnotion/leetcode-api` for problem-list / detail / submissions GraphQL
- Hand-rolled REST for `interpret_solution` / `submit` / `check`
- `requestUrl` (Obsidian built-in) for all HTTP — bypasses Electron CORS
- `turndown` for HTML → Markdown conversion
- `vitest` for unit testing — 652 tests passing, ~163 KB production bundle

[1.0.0]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.0.0
