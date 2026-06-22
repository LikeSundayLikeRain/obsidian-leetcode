# Changelog

All notable changes to **LeetCode for Obsidian** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2026-06-22

Fixes for the AI knowledge-graph pattern hubs: a missing hub, drifting pattern names, and broken hub links.

### Fixed
- Patterns whose name contains a slash — notably **Heap / Priority Queue** — now get a proper hub note. Previously the slash was treated as a folder separator, so the hub note silently failed to write and every problem in that pattern was left without a hub. Hub filenames now strip filesystem-reserved characters (`/ \ : * ? " < > |`) while the note keeps the original display name.
- Pattern names with internal capitals — **1-D Dynamic Programming**, **2-D Dynamic Programming**, **Union-Find** — now keep their exact capitalization in note frontmatter and hub filenames. They were previously lowercased to `1-d` / `2-d` / `Union-find`, which risked splitting one pattern across two near-duplicate hubs.
- The pattern chip in the verdict popup and the `## Techniques` wikilink now resolve to the real hub file for slash-named patterns, instead of pointing at a non-existent note. The in-note link uses an aliased form (`[[Heap Priority Queue|Heap / Priority Queue]]`) so it still displays the canonical name.

### Changed
- The pattern classifier prompt is tuned to reduce mislabeling: enabling steps (Sorting, Arrays & Hashing, Prefix Sum) are no longer chosen as the primary pattern when a real downstream technique exists (e.g. 3Sum is now Two Pointers, not Sorting); a second pattern is emitted only when it is genuinely load-bearing; and pattern names must be output verbatim from the known list.

## [1.3.1] - 2026-06-12

### Fixed
- Typing in the solution editor no longer occasionally drops the last character or jumps the cursor, even while Obsidian Sync or another pane writes to the same note. The editor now tracks in-progress typing precisely and never clears its "still editing" state until your keystrokes have actually reached disk. ([#24])
- Composing CJK text (Pinyin, Japanese, Korean) in the solution editor is now safe: a background sync or save arriving while the candidate menu is open can no longer overwrite your half-composed input. ([#24])
- Auto-indent on Enter now respects each language's indent style and your **Indent size** setting. Previously it always inserted 4 spaces regardless of language or your override (so the 2-space default for JavaScript/TypeScript was unreachable). ([#26])
- Pressing Tab in the solution editor now inserts the same indentation that Enter uses, instead of a literal tab character. This fixes the "mixed tabs and spaces in the same file" problem. ([#26])
- Switching the fence language via the chevron dropdown now recolors the code immediately. Previously the syntax highlighting kept the old language's colors until your next keystroke. ([#25])
- The chevron language switch once again swaps the fence body to the new language's starter code (restoring v1.2 behavior). If you've already started typing, your code is preserved and a notice points you to **LeetCode: Reset code**. When LeetCode has no starter for the chosen language or you're offline, the notice now tells you which case applies. ([#25])
- System paste (Cmd+V) in the solution editor now lands at the cursor instead of one character to the right when vim mode is in normal or visual mode, and now correctly replaces a visual selection. Vim's own register paste (`p`/`P`/`yy`) is unchanged. ([#27])
- The Run modal now shows each test case's own output under its tab again, instead of repeating one combined blob under every tab. Runtime errors that happen partway through a run now surface the stack trace on the failing case's tab rather than showing empty output boxes. ([#28])

### Changed
- The chevron language switch now swaps the fence body and re-highlights in a single undo-able step, so you never see new code briefly painted with the old language's colors. ([#25])
- Changing the **Indent size** setting now applies live to every open solution editor; you no longer need to reopen the note. ([#26])

## [1.3.0] - 2026-06-09

The v1.3 inline-widget architecture milestone. The nested `## Code` child-editor is replaced by a single inline solution widget — one fenced code block per note that owns its own editor — giving more reliable sync, cleaner section locking, and faster editing.

### Added

#### Inline solution widget
- A single inline code widget replaces the old nested `## Code` editor. The widget owns its own embedded editor and renders in both Reading mode and Live Preview, with language-aware syntax highlighting, auto-indent, bracket matching, and comment toggling for all 8 LeetCode languages.
- The Run / Submit action row and the language chevron live directly inside the widget in both reading and editing modes.
- `lc-language` frontmatter is now the single source of truth for which language Run, Submit, and AI features use.
- Vim mode runs inside the widget, with keystrokes scoped to the editor so they never leak to the surrounding note. The vim toggle applies after reloading the note.
- Line-number gutter with a vim-aware hybrid (relative) mode.

#### Migration from v1.2
- Notes created in v1.0–v1.2 are migrated to the single-fence widget the first time you open them, controlled by the **Auto-migrate on open** setting. A timestamped backup is written to the plugin folder before each migration and is automatically cleaned up after 30 days.
- A banner on legacy notes lets you trigger migration manually if auto-migrate is off.

#### Quick problem search
- Find and open any problem from the command palette or by pressing Shift twice. ([#17])

### Changed
- External edits that arrive while you're typing now raise a conflict modal (Keep mine / Keep external / View diff) instead of silently clobbering either side.
- Release titles dropped the leading "v" prefix; the release workflow patches `manifest.json` from the git tag.

### Fixed
- The AI knowledge-graph taxonomy now recognizes the Monotonic Queue pattern. ([#18])
- AI review code is read from the widget so reviews see your current solution. ([#13])
- The LeetCode login flow captures the session cookie more reliably via a URL filter and now surfaces a timeout state instead of hanging. ([#19])
- Run verdicts now trust LeetCode's own per-case comparison, fixing spurious mismatches on order-agnostic answers.
- Numerous editing-stability fixes for the new widget: cursor preservation during typing races, fence-closer protection, scroll jumps on Enter, and reading-mode re-render after migration.

---

## [1.2.0-alpha.4] - 2026-05-29

### Added
- Settings → Code editor → **Use nested code editor** toggle. When OFF, the plugin skips registering the nested CM6 child-editor at onload — Run/Submit/Reset/Retrieve/AI commands still work via the markdown fallback path. Reload Obsidian to apply.
- AI solution prompt now includes the LeetCode starter code so the generated solution matches the expected class/method signature.

### Fixed
- Sync corruption when the parent document and child editor diverged (manifested as reversed/interleaved text after focus changes). Added a divergence guard that does a full-replace sync when offsets diverge.
- Reset code occasionally produced `}````` ``` (fence closer merged with the last brace). All full-replace sync paths now normalize trailing newlines.
- Fence closer disappearing when deleting trailing empty lines inside the code editor.
- Cursor visibility on re-focus in non-vim mode after Obsidian's `addProperty` (Cmd+;) hotkey stole focus.

## [1.2.0-alpha.1] - 2026-05-26

### Added

#### Nested code editor
- Full nested CM6 EditorView inside the `## Code` fence with language-aware syntax highlighting, auto-indent, bracket matching, and comment toggling for all 8 LeetCode languages (Python, Java, C++, C, JavaScript, TypeScript, Go, Rust).
- Bidirectional sync between the code editor and the parent markdown document — edits flow both ways with echo-loop prevention.
- Language switching via the chevron dropdown instantly reconfigures indent rules, bracket behavior, comment syntax, and highlighting without reopening the note.
- Tab/Shift-Tab indents/dedents code; Cmd-Z undoes within the code editor independently of the parent document.
- Paste from VS Code, StackOverflow, or LeetCode web produces raw code (no markdown formatting injected).
- IME input (Chinese Pinyin, Japanese, Korean) works correctly without duplication or composition interruption.
- Code editor renders correctly in both Source Mode and Live Preview.

#### Vim mode
- Vim navigation keys (j/k/h/l/dd/yy/p/x/o/i/a/s) execute inside the code editor when focused — never leak to the parent document.
- Scope-based keystroke intercept activates on focus and deactivates on blur.
- Insert-mode keys pass through unchanged (no interference with i/a/o/Esc transitions).

#### Fence auto-recovery
- `vault.on('modify')` listener detects when the fence closer is deleted by vim (`dd`) or external tools and re-inserts it automatically within ~100ms — no reload required.

#### Settings
- New "Show relative line numbers" toggle in Settings → Code editor. Renders cursor-relative line numbers in the code editor gutter. Read-once-at-mount semantic (toggle takes effect after note remount).
- New "Indent size" override for the code editor (default: 4 spaces).

### Changed
- Bundle size increased from ~800 KB to ~1.71 MB due to language packs (8 Lezer grammars + @replit/codemirror-vim). Hard ceiling raised to 1.8 MB.
- Release workflow now patches `manifest.json` version from the git tag — `manifest-beta.json` removed (BRAT no longer requires it).

### Fixed
- Cursor invisible in non-vim mode — vim cursor CSS now scoped with `:has(.cm-vimCursorLayer)`.
- Tab in Problem Browser and Contest views no longer causes idempotency issues.

---

## [1.1.0] - 2026-05-20

### Added

#### Problem preview
- Single-click previews problems in a read-only tab before committing to a note. Shift-click opens the note directly.
- Right-click context menu with "Preview problem" option.
- Sticky "Start Problem" button at the top of preview tabs.
- Settings toggle for click behavior (preview first vs. open note directly).

#### AI features
- AI Provider foundation with support for Anthropic, OpenAI, OpenRouter, Ollama, Custom (OpenAI-compatible), and AWS Bedrock.
- AI Debug — streaming analysis of wrong-answer or TLE verdicts with actionable suggestions.
- AI Review — opt-in review of accepted solutions with improvement suggestions.
- AI Knowledge Graph classification — automatic pattern/technique classification on accepted problems.
- AWS Bedrock provider with SSO credential process support.

#### Contest mode
- Virtual contest practice — solve past contest problems under timed conditions.
- Contest analysis with AI-powered performance summary.
- Contest scratch manager for temporary working space during contests.

### Changed
- Plugin store re-submission with full compliance audit.

---

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

[1.3.2]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.3.2
[1.3.1]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.3.1
[1.3.0]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.3.0
[1.2.0-alpha.1]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.2.0-alpha.1
[1.1.0]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.1.0-alpha.2
[1.0.0]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases/tag/1.0.0
[#13]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/13
[#17]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/17
[#18]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/18
[#19]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/19
[#24]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/24
[#25]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/25
[#26]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/26
[#27]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/27
[#28]: https://github.com/LikeSundayLikeRain/obsidian-leetcode/pull/28
