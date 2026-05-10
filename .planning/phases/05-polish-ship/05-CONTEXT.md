# Phase 5: Polish & Ship - Context

**Gathered:** 2026-05-09
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Phase 5 takes the plugin from "functionally complete through Phase 4" to "ready for the Obsidian community plugin store." Five concrete work surfaces:

1. **Run UX rework (POLISH-07)** — Replace the two Phase 3 commands (`Run code (sample)` + `Run code (custom input)`) with a single unified `LeetCode: Run` command. The modal pre-fills tabs from the problem's `exampleTestcases` **only on the first Run per note-open**; every later Run in the same note-open session restores whatever tab state was in memory. Tabs are ephemeral-scoped-to-note-open (all leaves showing the note closed = state wiped). Plugin never writes to `## Custom Tests`. Legacy `## Custom Tests` sections from Phase 3 are ignored — never read, never touched. A Reset button re-seeds from LC's `exampleTestcases`.

2. **Settings UI completeness (POLISH-01)** — Three sections (Authentication / Notes / Knowledge Graph) surfacing every missing control: auto-backlink toggle (D-20 flag exists, UI doesn't), technique folder override with derived default, plus the existing Phase 1 controls (auth, problems folder, default language, manual cookie).

3. **Error handling UX (POLISH-02)** — Four error conditions get user-readable Notices with concrete behavior: 429 rate-limited (Notice + one auto-retry after backoff), LC offline / network failure (Notice + fail, no retry), network timeout (10s per non-polling request, locked-30s exponential backoff for submit polling continues), expired session (existing Notice gains a clickable `Log in` action via `Notice.addAction()`).

4. **Run/Submit buttons after fenced code blocks** — Reading-mode `MarkdownPostProcessor` that appends a small `Run` + `Submit` button pair below the rendered `<pre><code>` block, only when the note has `lc-slug` frontmatter. Live Preview (CM6) path deferred past v1.

5. **Ship checklist (POLISH-04/05/06)** — `0.1.0` semver for initial community-store submission. README with 4 core-loop screenshots + network disclosure. LICENSE present. `scripts/prerelease-check.sh` gates the mechanical requirements (no `innerHTML`, no `fetch(`, no telemetry strings, manifest valid, lint clean, tests clean). Manual checklist in UAT covers the subjective items (description ends with period, no obfuscated code, screenshots in README). Final step: open PR to `obsidianmd/obsidian-releases`.

Plus **4 Phase 4 deferred polish items** that ship during Phase 5:
- CE verdict chip tint (reads red, expected orange)
- Light-mode focus ring on submission picker rows
- `SubmissionDetailModal` `MarkdownRenderer.render` upgrade with Component lifecycle (Pitfall 7)
- `autoBacklinksEnabled` settings-UI toggle (D-20 field already exists; toggle UI doesn't)

Covers 7 requirements:
- **POLISH-01:** Settings UI completeness — auth (shipped P1), manual cookie (shipped P1), vault folder (shipped P1), default language (shipped P1) + NEW: technique folder override + auto-backlink toggle.
- **POLISH-02:** Graceful error handling for 4 conditions (offline, 429, expired session, timeout).
- **POLISH-03:** Zero Required ESLint violations (continuous), no telemetry (enforced by prerelease script), no `innerHTML` (Phase 1-4 discipline continues), no `eval` / remote-code (never shipped).
- **POLISH-04:** README with install / usage walkthrough / screenshots / network disclosure.
- **POLISH-05:** LICENSE file (MIT).
- **POLISH-06:** PR to `obsidianmd/obsidian-releases` following community plugin guidelines.
- **POLISH-07:** Run UX rework — single `Run` command, ephemeral tab model, no persistence to note.

Explicitly out of scope for Phase 5:
- **Pin-to-note affordance** — user rejected during discussion. Tabs are ephemeral-only. No opt-in persistence mechanism. No `## Custom Tests` writes from Phase 5 code.
- **Migration of legacy `## Custom Tests` sections** — user chose ignore-and-leave-alone. Plugin does not read, seed from, or strip existing sections. Users manually clean if they want.
- **Sample vs. user-added tab distinction after seed** — per user clarification: "whatever in the test cases are ephemeral, edit or not." After the first-Run seed, every tab is uniform. Reset button re-seeds.
- **Live Preview / CM6 overlay buttons** — only Reading Mode `MarkdownPostProcessor` ships. Live Preview overlay deferred.
- **Chevron/dropdown navigator overlay on `## Code`** — Phase 4 deferred, still deferred.
- **Diff view in `SubmissionDetailModal`** — Phase 4 deferred, still deferred.
- **Retroactive opt-out cleanup command** (strip existing `## Techniques`) — deferred.
- **First-run onboarding modal** — Phase 4 D-22 rejected it, stays rejected.
- **Bases-file schema regeneration for new frontmatter fields** — Phase 5 cosmetic deferral still deferred.
- **1.0.0 release** — ships as 0.1.0 (initial public); 1.0.0 after post-submission community feedback iterates.
- **Per-endpoint timeout tuning beyond 10s / polling-special** — one bulk decision.

</domain>

<decisions>
## Implementation Decisions

### Run UX Rework (POLISH-07)

- **D-01:** **Single `LeetCode: Run` command replaces both Phase 3 commands.** The two Phase 3 commands (`Run code (sample)`, `Run code (custom input)`) are deleted from the registered command list in `main.ts`. Their handlers (`runSampleFromActive`, `runCustomFromActive`) may be refactored or replaced. New command ID: `run` (no hotkey per FND-03).

- **D-02:** **Ephemeral tab lifecycle — scoped to "all leaves showing the note closed."** Tab state lives in an in-memory per-slug map keyed off `lc-slug` frontmatter. While *any* workspace leaf is showing the problem note (pinned tab, split pane, second window), state persists. When `app.workspace.on('file-close')` fires AND no remaining leaves show the file, state for that slug is wiped. `workspace.getLeavesOfType('markdown')` or equivalent check drives the decision. No persistence to `data.json`; no write to `## Custom Tests`.

- **D-03:** **First-Run-per-note-open seeds from `exampleTestcases`; subsequent Runs restore in-memory state.** When the user invokes Run:
  - If no in-memory state exists for the active slug: seed tabs from cached `problemDetails[slug].exampleTestcases` (Phase 2 D-14 cache, already populated from problem detail fetch). Each entry becomes one tab labeled `Case 1`, `Case 2`, …
  - If in-memory state exists: reopen the modal with the existing tabs (including any edits, additions, deletions from earlier in this note-open session).

- **D-04:** **Tabs are uniform after seed — no sample vs. user-added distinction.** Per user clarification: "whatever in the test cases are ephemeral, edit or not." Once the initial seed happens, the plugin does not remember which tabs were samples. Editing, deleting, adding all behave identically. No badges, no special labels, no undeletable tabs. If the user deletes all tabs, clicking Reset (D-05) re-seeds.

- **D-05:** **Reset button in modal footer re-seeds from LC examples.** Button label: `Reset to sample cases`. When clicked: wipes current in-memory tab state for the slug, re-seeds from `problemDetails[slug].exampleTestcases`, re-renders tab row. No confirmation modal (destructive but recoverable — user can re-type within the same note-open session, or just re-run).

- **D-06:** **Delete discipline — everything deletable; single-tab-minimum guard.** `×` on hover is visible on every tab (uniform per D-04). Phase 3's "× only visible when >1 tab" carries forward: if user deletes down to one tab, that last tab's `×` is hidden until another tab is added. Prevents the empty-state. User can use Reset to refill if desired.

- **D-07:** **Run semantics — single active tab only.** Clicking Run sends **only the currently selected tab's input** to LC's `/interpret_solution/` (not all non-empty tabs joined by newline, which was Phase 3's behavior). Verdict modal shows one result. Rationale: user specifically tests "this case"; multi-case runs are better served by LC's own web UI if ever needed.

- **D-08:** **Legacy `## Custom Tests` sections — ignore completely.** No read, no seed-from, no strip. Phase 5 code never references the `## Custom Tests` heading. Phase 3's `customTestStore.ts` `writeCasesToVault` call sites are removed with the command deletion in D-01. The helper itself may be deleted if no other callers remain (planner decides).

- **D-09:** **In-memory state holder: new `src/solve/ephemeralTabStore.ts`** (planner discretion on exact name). Holds `Map<slug, TabState[]>` plus the `workspace.on('file-close')` subscription that wipes entries when the last leaf showing a slug's note closes. Registered via `this.registerEvent()` in `main.ts` for auto-cleanup on unload. Single instance, constructed in `main.ts` alongside other services.

- **D-10:** **Modal rewrite path — extend or replace `CustomTestModal.ts`?** Planner discretion. Preferred: rename `CustomTestModal.ts` → `RunModal.ts`, delete `customTestStore.writeCasesToVault` call sites, add Reset button, swap `onRun` behavior to single-active-tab. If the delta is small, extend in-place with a rename. If large (enough logic changes to warrant a clean slate), delete and rewrite.

### Run/Submit Buttons After Fenced Code Blocks

- **D-11:** **Reading-mode `MarkdownPostProcessor` only (Live Preview deferred).** Register via `this.registerMarkdownPostProcessor()` in `main.ts`. Processor scans rendered HTML for `<pre class="language-{langSlug}">` blocks inside problem notes (detected via active file's `lc-slug` frontmatter). Appends a `<div class="leetcode-code-actions">` below the `<pre>` containing two neutral buttons: `Run` and `Submit`. Click handlers invoke the existing `run` / `submit` command IDs via `app.commands.executeCommandById`.

- **D-12:** **Button visibility gated on `lc-slug` frontmatter.** Inside the postprocessor, check the current file's frontmatter via `ctx.sourcePath` → `app.metadataCache.getFileCache(file).frontmatter`. If no `lc-slug`, do nothing (no buttons). Avoids polluting non-LC notes with LC-plugin chrome.

- **D-13:** **CSS-scoped to `.leetcode-code-actions`.** Both buttons use default-button neutral styling — no accent (UI-SPEC color rule: accent reserved for primary auth button). Small, right-aligned. `styles.css` additions; no inline style.

### Settings UI Completeness (POLISH-01)

- **D-14:** **Three sections: Authentication / Notes / Knowledge Graph.** Extends the existing Phase 1 D-09 layout. New `Knowledge Graph` heading added after `Notes`. Holds: the auto-backlink toggle + the technique folder override. Future knowledge-graph settings also go here.

- **D-15:** **Technique folder — visible override with derived default.** Text field. Placeholder: `{problemsFolder}/Techniques` (substituted live from current `problemsFolder` setting, so it shows e.g. `LeetCode/Techniques`). Empty value = use derived default (backward-compat with Phase 4 D-15 behavior — existing users without this setting see no behavior change). Non-empty value overrides. `SettingsStore.getTechniquesFolder()` (Phase 4) becomes: `return override || (problemsFolder + '/Techniques')`. New data.json field: `techniquesFolderOverride: string`. Shape guard + sanitize-folder (reuse Phase 1 `sanitizeFolder`).

- **D-16:** **Auto-backlink toggle — behavior-first copy (from pending todo).**
  - Label: `Auto-create technique backlinks on Accepted`
  - Description: `When enabled, an Accepted submission writes a ## Techniques section and creates stub notes for each LC topic tag. When disabled, only frontmatter tags (lc/{slug}) are written; no ## Techniques heading, no stubs.`
  - Bound to `SettingsStore.getAutoBacklinksEnabled()` / `setAutoBacklinksEnabled()` (Phase 4 D-21, already plumbed).

- **D-17:** **No Advanced / collapsible section.** The Knowledge Graph section is always visible. No power-user-hidden knobs. Three toggles + one folder field stay uncluttered enough.

### Error Handling UX (POLISH-02)

- **D-18:** **429 rate-limited — Notice + one auto-retry after backoff.** First rejection from `throttledRequestUrl`'s rate-limit path fires: Notice `LeetCode is rate limiting us. Try again in a moment.` (8s, sentence case, terminal period). The failing request is queued and retried ONCE after a 5s cooldown. If retry succeeds: silent (user sees the delayed result). If retry fails again with 429: second Notice, no further retry. Implementation lives in `src/api/throttle.ts` (extension, not a new layer). Backoff constant: `RATE_LIMIT_RETRY_MS = 5000`.

- **D-19:** **LC offline / network failure — Notice + no retry, command fails.** Copy: `Couldn't reach LeetCode. Check your connection.` (8s). Distinct from the picker-specific inline copy (Phase 4 D-06) — this is for command-palette-initiated flows (Run, Submit, open problem). Error surfaces via `requestUrl` throwing `net::ERR_NAME_NOT_RESOLVED` / `net::ERR_CONNECTION_REFUSED` / `net::ERR_INTERNET_DISCONNECTED` and equivalents — planner adds an `isNetworkError(err)` helper that checks `err.message` for these tokens. No auto-retry. User retries manually.

- **D-20:** **Network timeout — 10s per non-polling request, 30s exponential backoff retained for submit polling.** Submit polling (Phase 3 D-21) already uses its own 1s→2s→4s→8s backoff sequence capped at 30s total — untouched. Every other LC call (`requestUrl` invocation outside polling) times out at 10s. Implementation: add `timeout: 10_000` to the `RequestUrlParam` in `throttledRequestUrl`, or wrap in `Promise.race` with a rejecting `setTimeout` (planner picks based on requestUrl's actual timeout support). On timeout: Notice `LeetCode is slow to respond. Try again.` (8s). Classified the same as network failure from a user-UX perspective (no retry).

- **D-21:** **Expired session — existing Notice gains a clickable `Log in` action button.** Copy stays: `LeetCode session expired. Log in again.` (CF-04, locked). Added via `new Notice(...).addAction('Log in', () => this.auth.login())` — the `addAction` API is available on Notice in Obsidian 1.x (planner verifies during research). Clicking the action opens the embedded `BrowserWindow` login flow via `AuthService.login()`. Notice self-dismisses on action click. Fallback if `addAction` unavailable: Notice stays plain, user opens Settings manually (current CF-04 path).

- **D-22:** **Error routing — surface-aware.** Phase 4 D-06 established: picker = inline-in-modal; command-palette-initiated = Notice. Phase 5 D-18..D-21 extend this uniformly:
  - Command-palette flows (Run, Submit, Open problem, Refresh problem list): Notice
  - Modal flows (Picker, Detail modal, Run modal): inline in the current modal where the request originated
  - The `run` button in the code-block-actions postprocessor treats click as a command-palette flow (delegates via `executeCommandById`) — Notice behavior, not inline.

### Ship Checklist (POLISH-04/05/06)

- **D-23:** **Release version: 0.1.0 (initial public).** `manifest.json` version → `0.1.0`. `package.json` version → `0.1.0`. `versions.json` gets a `0.1.0` entry mapping to `minAppVersion: 1.10.0` (Phase 2 lock). Release tag `0.1.0` on GitHub with `main.js` + `manifest.json` assets.

- **D-24:** **README — 4 screenshots covering the core loop.**
  1. Problem browser view (ribbon icon → pane open showing problem list with filters)
  2. Problem note opened (frontmatter visible in reading view + `## Problem` rendered)
  3. Submit verdict modal showing `Accepted`
  4. Graph view showing problem note → technique note edges after an Accepted submission
  Animated GIF deferred. Static screenshots only for Phase 5.

- **D-25:** **README sections, in order:**
  1. What it is (1-paragraph pitch)
  2. Features (bulleted)
  3. Install (from community store after submission; manual install from release assets before)
  4. Usage walkthrough (open problem → write code → run → submit → see graph)
  5. Screenshots (inline with usage)
  6. Network disclosure (verbatim: `This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.`)
  7. Configuration (settings tab walk-through)
  8. Troubleshooting (session expired, rate limiting, offline)
  9. License (MIT)
  10. Contributing / Issues (link to GitHub)

- **D-26:** **LICENSE — MIT.** Root-level `LICENSE` file. Copyright holder line per user's GitHub identity. Full MIT text verbatim from `choosealicense.com/licenses/mit/`.

- **D-27:** **Prerelease check script — `scripts/prerelease-check.sh`.** Mechanical gates, each failing loud with `exit 1`:
  ```
  - grep -rE "innerHTML\s*=" src/        → 0 matches
  - grep -rE "\bfetch\s*\(" src/          → 0 matches (requestUrl only)
  - grep -rE "\beval\s*\(" src/           → 0 matches
  - grep -rE "new Function\s*\(" src/     → 0 matches
  - grep -rE "(analytics|telemetry|mixpanel|google-analytics|gtag)" src/ → 0 matches
  - grep -rE "vault\.modify\s*\(" src/graph/ src/main.ts → 0 matches (CF-06 extend)
  - manifest.json: id sans "obsidian"; valid semver version; isDesktopOnly: true; description ends with "."; description ≤ 250 chars
  - LICENSE file present and non-empty
  - README.md present; contains "leetcode.com" (network disclosure); contains 4 screenshot image links
  - npm run lint → exit 0
  - npm test -- --run → exit 0
  - bundle size check: main.js ≤ 200 kB (generous ceiling; warn at 100 kB)
  ```
  Run as final step of `npm run release`. Chained: `npm run build && scripts/prerelease-check.sh && git tag 0.1.0`.

- **D-28:** **Manual UAT checklist (subjective items, in UAT.md):**
  - Screenshots in README match current UI (light-mode + dark-mode spot-check)
  - No obfuscated code (manual read of `main.js` first/last 50 lines for sanity)
  - No default hotkeys on any command (grep `defaultHotkeys` in source → 0)
  - Settings UI renders cleanly light-mode + dark-mode
  - Community plugin PR submitted to `obsidianmd/obsidian-releases`

### Phase 4 Deferred Polish (rolled into Phase 5)

- **D-29:** **CE verdict chip tint — fix from red to orange.** Phase 4 UAT Test 6 flagged. Root cause: `styles.css` `.leetcode-verdict-ce` CSS color token. Change from red-ish to a CSS orange token (Obsidian's `--color-orange` if defined, else `#e67e22` fallback). Visual spot-check in UAT.

- **D-30:** **Light-mode focus ring on picker rows — strengthen.** Phase 4 UAT Test 6 flagged. Root cause: `.leetcode-submission-row:focus` outline color/width too weak under light theme. Bump outline to `var(--interactive-accent)` 2px solid + 2px offset, tested in both themes.

- **D-31:** **`SubmissionDetailModal.ts` — `MarkdownRenderer.render` with Component lifecycle.** Per the pending todo. Replace `<pre><code class="language-*">` + `textContent` approach with `MarkdownRenderer.render(app, fenced, container, sourcePath, component)`. `component = new Component()` created in `onOpen`, `component.unload()` in `onClose` (Pitfall 7 from 04-RESEARCH.md). `tests/graph/SubmissionDetailModal.test.ts` updated: mock `MarkdownRenderer.render` as `vi.fn()`; assert call args + Component instance passed. Remove the `<pre><code>` assertion.

- **D-32:** **`autoBacklinksEnabled` settings-UI toggle — shipped under D-16.** Same work item, not separate.

### Carried Forward (not re-asked)

- **CF-01:** All LC calls via `api/throttle.ts → throttledRequestUrl`. (Phase 1 D-12.) Phase 5's 10s timeout (D-20) extends inside this pipe.
- **CF-02:** `isDesktopOnly: true`. No new Electron APIs in Phase 5. (All prior phases.)
- **CF-03:** Session cookie only in `data.json`. Never logged/transmitted. (All prior phases.)
- **CF-04:** Session-expiry Notice copy is LOCKED: `LeetCode session expired. Log in again.` Phase 5 D-21 adds an action button; copy text unchanged.
- **CF-05:** Zero Required `eslint-plugin-obsidianmd` violations. No `innerHTML`, no `fetch`, no default hotkeys, sentence case + terminal period on every Notice.
- **CF-06:** `vault.process()` + `processFrontMatter()` only. `vault.modify()` permanently forbidden. Phase 5 adds no vault writes (pure UX + settings).
- **CF-07:** `createEl()` discipline for all DOM. New Settings UI + Run modal + code-actions postprocessor all use `createEl()`. No `innerHTML`.
- **CF-08:** Default problems folder `LeetCode`; default language `python3`; `sanitizeFolder` rejects path traversal. Phase 5's technique-folder override (D-15) passes through the same sanitizer.
- **CF-09:** Rate ceiling 20 req / 10s + max 2 concurrent. Phase 5's 429 auto-retry (D-18) stays within the ceiling.
- **CF-10:** Throttle UX: silent queue; 429 surfaces Notice. Extended by D-18 (one auto-retry). Picker-initiated 4xx/5xx stays inline per Phase 4 D-06.
- **CF-11:** Feature-first folder layout. Phase 5 adds no new top-level `src/` folder. Extensions to existing: `src/solve/` (RunModal rewrite, ephemeralTabStore), `src/settings/` (SettingsTab extension, SettingsStore `techniquesFolderOverride`), `src/graph/` (SubmissionDetailModal D-31 fix, styles.css CE/focus-ring).
- **CF-12:** Frontmatter schema locked in Phase 2. Phase 5 adds no new `lc-*` keys.
- **CF-13:** `problemDetails[slug]` cache from Phase 2 supplies `exampleTestcases` to Run modal seed (D-03). No new cache fields.
- **CF-14:** Cache TTL 7 days. Unchanged.
- **CF-18:** `classifyStatus` single source of truth. Unchanged.
- **CF-19:** Notice copy locked. Phase 5 new Notices (all sentence case + terminal period):
  - `LeetCode is rate limiting us. Try again in a moment.` (D-18)
  - `Couldn't reach LeetCode. Check your connection.` (D-19)
  - `LeetCode is slow to respond. Try again.` (D-20)
  - `LeetCode session expired. Log in again.` + `Log in` action button (D-21, copy unchanged)

### Wave Sequencing (Claude's best judgement per user)

Suggested wave order for the planner (not a hard lock — planner may adjust if dependencies reveal a better ordering):

- **Wave 1 — Settings UI foundation.** D-14, D-15, D-16, D-17, D-32. Unblocks dogfooding the auto-backlink toggle; low-risk. Ships `SettingsTab.ts` extension + `SettingsStore` `techniquesFolderOverride` field.
- **Wave 2 — Error handling.** D-18, D-19, D-20, D-21, D-22. Mostly extensions to `throttle.ts`, existing Notice call sites, `isNetworkError` helper. Foundation for clean dogfood feedback during later waves.
- **Wave 3 — Run UX rework.** D-01..D-10. Biggest behavior change — middle slot so dogfooding has time to shake out issues before store submission. Rewrites `CustomTestModal.ts` → `RunModal.ts`, adds `ephemeralTabStore.ts`, deletes old commands from `main.ts`.
- **Wave 4 — Reading-mode code-block buttons + Phase 4 cosmetic polish.** D-11, D-12, D-13 + D-29, D-30, D-31. Purely UI / presentational. Ships `MarkdownPostProcessor` registration + styles.css updates + SubmissionDetailModal rewrite.
- **Wave 5 — Ship.** D-23..D-28. README (4 screenshots), LICENSE, prerelease-check.sh, manual UAT, community plugin PR. All prior waves must be green before screenshots are captured.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — Constraints (desktop-only, no telemetry, CSP-safe), Key Decisions (community-store target)
- `.planning/REQUIREMENTS.md` §Polish & Release — POLISH-01 through POLISH-07
- `.planning/ROADMAP.md` §Phase 5 — Goal, success criteria (6 items including Run UX rework)
- `.planning/STATE.md` — Current milestone (v1.0), 4/5 phases complete at discussion start
- `.planning/phases/01-plugin-foundation/01-CONTEXT.md` — Phase 1 locks: `requestUrl` pipe, Settings tab D-09 layout (Phase 5 extends with third section), sanitizeFolder, AuthService.login entry point (D-21 action button target)
- `.planning/phases/02-problems-as-notes/02-CONTEXT.md` — Frontmatter schema lock, `exampleTestcases` cached in `problemDetails[slug]` (D-03 seed source), `minAppVersion: 1.10.0` (Phase 5 versions.json entry)
- `.planning/phases/03-run-submit/03-CONTEXT.md` — `SubmissionOrchestrator` shape, exponential backoff 1-2-4-8 cap 30s (D-20 retains), CustomTestModal lifecycle + `## Custom Tests` writer (both removed in D-01/D-08), UI-SPEC color rule (accent reserved for primary auth button — D-13 respects)
- `.planning/phases/03-run-submit/03-PATTERNS.md` — Modal chrome, Run button CTA convention
- `.planning/phases/04-knowledge-graph-wiring/04-CONTEXT.md` — `autoBacklinksEnabled` D-21 field (Phase 5 surfaces UI), `getTechniquesFolder()` D-15 derived getter (Phase 5 extends with override), D-06 inline-vs-Notice error routing (Phase 5 D-22 extends), Pitfall 7 MarkdownRenderer lifecycle (Phase 5 D-31)
- `.planning/phases/04-knowledge-graph-wiring/04-UAT.md` — 2 cosmetic UAT gaps (CE chip tint, focus ring) — Phase 5 D-29, D-30
- `.planning/phases/04-knowledge-graph-wiring/04-VERIFICATION.md` — MarkdownRenderer override record (Phase 5 D-31 resolves)
- `.planning/todos/pending/settings-ui-auto-backlinks-toggle.md` — Phase 5 D-16 origin; label/desc copy verbatim
- `.planning/todos/pending/submission-detail-markdownrenderer-upgrade.md` — Phase 5 D-31 origin; spec verbatim

### Tech stack
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Technology Stack — `requestUrl`, esbuild, `MarkdownRenderer.render` (sanctioned), `Notice` API
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §8 Community Plugin Store Requirements — manifest validity, description ≤250 chars + period, LICENSE, network disclosure, no `innerHTML` / `eval` / obfuscation, no "obsidian" in ID, no default hotkeys, `isDesktopOnly: true`. D-27 script enforces.
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Stack Patterns — `this.registerEvent()` auto-cleanup (D-09 ephemeralTabStore uses), `this.registerMarkdownPostProcessor` (D-11), `PluginSettingTab` + `Setting` API (D-14)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §2 LeetCode API Integration — `exampleTestcases` availability in problem detail GraphQL (D-03 seed)

### Obsidian docs (researcher verifies during Phase 5 research)
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `Notice.addAction(label, callback)` API signature + availability in Obsidian 1.10.0 (D-21 contingent); `MarkdownPostProcessorContext.sourcePath` + `MetadataCache.getFileCache` for frontmatter detection (D-12); `Workspace.on('file-close')` + `getLeavesOfType` for ephemeral tab lifecycle (D-02); `RequestUrlParam.throw` + timeout handling (D-20)
- `obsidianmd/obsidian-developer-docs` — `PluginSettingTab` dropdown + toggle + text patterns (D-14..D-17); `registerMarkdownPostProcessor` lifecycle (D-11)
- `obsidianmd/obsidian-releases` `plugin-review.md` — community plugin submission checklist (D-27 + D-28 coverage); PR template for `obsidianmd/obsidian-releases` (D-26 submission)

### What to avoid
- **Writing to `## Custom Tests`** — Phase 5 removes all such writes (D-01, D-08). Plugin becomes a pure-read relationship with this legacy section. Do not add new writers. If `customTestStore.writeCasesToVault` has no remaining callers after D-01, remove it.
- **Pin-to-note affordance** — user rejected during discussion. Do not re-add a "save this tab permanently" feature. If the user later wants pinning, it's a post-v1 enhancement.
- **Sample vs. custom tab distinction** — per D-04, once seeded, tabs are uniform. Do not add badges, icons, or labels that signal "this was a sample." Reset button is the only re-seed path.
- **Multi-tab Run** — D-07 locks single-active-tab semantics. Do not concatenate tabs into one `data_input` blob like Phase 3 did.
- **Hotkeys on new commands** — FND-03 / CF-05. `run`, `view-past-submissions`, `submit`, all prior commands stay hotkey-less.
- **`innerHTML` anywhere** — CF-07. Especially tempting for README badges or `MarkdownPostProcessor` output; use `createEl()` (D-11 / D-13).
- **`fetch()` / `axios`** — CORS-blocked, prerelease script grep-gates (D-27).
- **Telemetry strings** — D-27 grep-gates `analytics|telemetry|mixpanel|google-analytics|gtag`. Do not import analytics SDKs even for "opt-in anonymous crash reports."
- **`eval` / `new Function` / remote `<script>`** — D-27 grep-gates. Never introduce.
- **1.0.0 release in Phase 5** — D-23 locks 0.1.0. Post-submission + community feedback round drives the 1.0.0 bump.
- **"obsidian" in plugin ID** — already clean; don't regress.
- **Migrating legacy `## Custom Tests`** — D-08 locks ignore-and-leave-alone. No auto-strip, no auto-seed.
- **Chevron overlay on `## Code`** — Phase 4 deferred, still deferred. Two-button postprocessor (D-11) is the simpler ship.
- **Live Preview / CM6 code-block actions** — D-11 Reading Mode only. Live Preview path is post-v1.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phases 1-4 — all in `src/`)

- **`src/settings/SettingsTab.ts`** — Phase 5 extends. Current layout: Authentication section + Manual cookie subsection + Notes section. Phase 5 adds: (a) Knowledge Graph section heading, (b) auto-backlink toggle (D-16), (c) technique folder override (D-15). Accent-modifier grep-gate (1 invocation) is preserved — new buttons stay neutral.

- **`src/settings/SettingsStore.ts`** — Phase 5 extensions:
  - New field `techniquesFolderOverride: string` in `PluginData` (D-15) + shape-guard in `isValidPluginData` (empty string default).
  - Updated `getTechniquesFolder()`: `return override || (problemsFolder + '/Techniques')`.
  - New getter/setter pair: `getTechniquesFolderOverride()` / `setTechniquesFolderOverride(v)`.
  - `getAutoBacklinksEnabled()` / `setAutoBacklinksEnabled()` already exist (Phase 4 D-21) — just consumed by the new toggle UI.

- **`src/api/throttle.ts`** — Phase 5 extensions:
  - Add 10s timeout to every `requestUrl` call (D-20), except submit-polling path (already owns its own backoff).
  - Add 429 auto-retry once after 5s (D-18). New const `RATE_LIMIT_RETRY_MS = 5000`.
  - Surface Notice copy locked per D-18. Actual `new Notice(...)` call site stays as-is (currently fires once per rejection; the retry layer wraps it).

- **`src/shared/errors.ts`** — Phase 5 adds `isNetworkError(err: unknown): boolean` helper (D-19). Checks for `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_INTERNET_DISCONNECTED`, `ERR_NETWORK_CHANGED`, plus equivalent Windows/macOS variants. Consumed by Run, Submit, Open-problem error branches.

- **`src/auth/AuthService.ts`** — Phase 5 D-21: Notice `addAction('Log in', () => authService.login())` callback points here. No changes to the service itself; just a new caller.

- **`src/solve/CustomTestModal.ts`** — Phase 5 rewrites in place or replaces with `RunModal.ts` (D-10). Heavy changes: delete `customTestStore` persistence, add Reset button, switch Run semantics to single-active-tab (D-07), integrate with `ephemeralTabStore` (D-09).

- **`src/solve/customTestStore.ts`** — Phase 5 likely deletes (no remaining callers after D-01, D-08). Planner confirms no references outside Phase 3 code paths.

- **`src/solve/statusMap.ts`, `pollingOrchestrator.ts`, `submissionOrchestrator.ts`, `leetcodeRest.ts`** — **Unchanged.** Phase 5 doesn't touch the submit pipeline beyond UI-layer tweaks (Reset button, single-tab Run call).

- **`src/graph/SubmissionDetailModal.ts`** — Phase 5 D-31 rewrite: swap `<pre><code>` + textContent for `MarkdownRenderer.render` + Component lifecycle. Component created in `onOpen`, unloaded in `onClose`. Existing Cancel default-focus discipline from ConfirmOverwriteModal is a reference pattern (but not directly reused here).

- **`src/main.ts`** — Phase 5 touchpoints:
  - Delete 2 command registrations (`run-code-sample`, `run-code-custom`) (D-01); add 1 new (`run`).
  - Register new `MarkdownPostProcessor` for code-block action buttons (D-11).
  - Construct `ephemeralTabStore` singleton (D-09); wire `workspace.on('file-close')` via `this.registerEvent`.
  - New `executeCommandById`-style wiring for the postprocessor buttons (D-11).
  - Import `isNetworkError` from `errors.ts` for Run/Submit error branches (D-19, D-22).

- **`styles.css`** — Phase 5 additions:
  - `.leetcode-code-actions` container + button styles (D-13).
  - `.leetcode-verdict-ce` color fix: red → orange (D-29).
  - `.leetcode-submission-row:focus` outline strengthened for light mode (D-30).
  - `.leetcode-run-modal` tab / footer tweaks if RunModal delta requires (D-10).

- **`tests/solve/mocks/fakeFetcher.ts`, `fakeSettingsStore.ts`** — Phase 5 extends:
  - `fakeSettingsStore`: add `techniquesFolderOverride` field.
  - Add `fakeWorkspace` mock helper (for `getLeavesOfType` / `on('file-close')`) — if one doesn't exist.
  - Add Notice spy with `addAction` stub (for D-21 tests).

- **`tests/fixtures/lc-submissions/`, `lc-verdicts/`** — unchanged.

### Established Patterns (carried forward)

- **Feature-first folder layout:** Phase 5 stays within existing folders. No new `src/polish/` or similar.
- **All LC calls through throttle/fetcher pipe:** 429 + timeout additions are *inside* the pipe (D-18, D-20). No parallel stack.
- **All vault writes via `vault.process()` / `processFrontMatter()` / `vault.create()`:** Phase 5 adds zero vault writes.
- **`createEl()` only for DOM:** Settings extensions, Run modal rewrite, code-actions postprocessor all use `createEl()`.
- **Notice copy locked:** sentence case + terminal period. All 4 Phase 5 Notices conform (D-18, D-19, D-20, D-21).
- **No default hotkeys:** `run` command, `view-past-submissions` (shipped Phase 4), and all prior commands stay hotkey-less.
- **Atomic commits per plan:** Waves 1-5 split into small plans, each committing 1-3 files. Pre-release script + LICENSE + README are their own commits.

### Integration Points

- **`main.ts` wiring additions (Phase 5):**
  1. Construct `ephemeralTabStore` (D-09) after settings/client/etc., before command registration
  2. Register `workspace.on('file-close')` via `this.registerEvent()` — wired to `ephemeralTabStore.onFileClose(file)`
  3. Register new `run` command — handler opens `RunModal` seeded via `ephemeralTabStore.getOrSeed(slug, exampleTestcases)`
  4. Delete old `run-code-sample` + `run-code-custom` command registrations (Phase 3)
  5. Register `MarkdownPostProcessor` via `this.registerMarkdownPostProcessor()` (D-11)
  6. Import + use `isNetworkError` in submitFromActive and runFromActive error branches (D-19, D-22)

- **`PluginSettingTab.display()` additions:**
  - After `Notes` section: add `new Setting(containerEl).setName('Knowledge Graph').setHeading()`
  - Add technique folder override setting (D-15)
  - Add auto-backlink toggle (D-16)

- **`throttle.ts` wrapping:**
  - On rate-limit rejection: fire existing Notice, then `setTimeout` + retry queue bump (D-18)
  - On any requestUrl call: wrap with timeout promise (D-20)

- **`MarkdownPostProcessor` registration:**
  - In postprocess fn: check `ctx.sourcePath` → `metadataCache.getFileCache(file).frontmatter?.['lc-slug']` presence
  - If present: scan element for `pre > code.language-*`, append `<div class="leetcode-code-actions">` with two `createEl('button', ...)` — Run / Submit
  - Button click → `app.commands.executeCommandById('obsidian-leetcode:run')` / `'obsidian-leetcode:submit'` (plugin id prefix)

- **`SubmissionDetailModal` rewrite:**
  - `this.component = new Component()` in `onOpen` (added)
  - `MarkdownRenderer.render(app, fenced, container, '', this.component)` replaces current `<pre><code>` approach
  - `this.component.unload()` in `onClose` (added)
  - Test file updated to mock `MarkdownRenderer.render` + assert Component passed

### Existing Test Infrastructure

- **`tests/solve/`** — Phase 5 adds `RunModal.test.ts`, `ephemeralTabStore.test.ts`. Removes or rewrites `CustomTestModal.test.ts` (depending on D-10 rewrite decision).
- **`tests/settings/`** — Phase 5 adds `SettingsTab.knowledge-graph.test.ts` (or equivalent) asserting the new section + toggles render; `SettingsStore.techniquesFolderOverride.test.ts` for the shape-guard + getter.
- **`tests/api/`** — Phase 5 adds `throttle.timeout.test.ts` (D-20) + `throttle.rate-limit-retry.test.ts` (D-18).
- **`tests/graph/SubmissionDetailModal.test.ts`** — rewrite per D-31 to assert MarkdownRenderer mock usage.
- **`scripts/prerelease-check.sh`** — new script; may have `tests/scripts/prerelease-check.test.sh` that runs it against a fixture repo.
- **`vitest.config.ts`** — unchanged.

</code_context>

<specifics>
## Specific Ideas

- **User's explicit Run UX preference:** "I like is a modal with test case tab, prepopulated with examples. I can add new ones or modify existing ones, I want ephemeral, but I want the lifecycle to be extended — as long as the md is open, it should remain; when I close it, it's gone; next time I run, it opens a new modal again, and prepopulate with example." Captured verbatim in D-02, D-03, D-04.

- **User's explicit reset preference:** "whatever in the test cases are ephemeral, edit or not. Add a button to reset the test case." Captured in D-04 (uniform tabs after seed) + D-05 (Reset button).

- **User's explicit button-placement preference:** "Can you use 2 button instead? after the code block fenced tag?" Captured in D-11 (Reading Mode `MarkdownPostProcessor` with neutral Run + Submit buttons below each code block).

- **User's stance on pinning:** Drop entirely (rejected the POLISH-07 roadmap's "Pin to note" affordance). Simpler, less surface to maintain.

- **User's stance on legacy sections:** Ignore (leave existing `## Custom Tests` alone; don't read, don't strip, don't migrate). Zero risk to existing notes.

- **User's pacing preference:** No strong wave-order preference — "use your best judgement." Captured as Claude's suggested sequencing in the Wave Sequencing section; planner has freedom to adjust.

- **Community-store conservatism:** Ship as 0.1.0, not 1.0.0. Matches Phase 2 Bases v0.1.0 migration. Implicit signal: "expect the first community feedback round to surface issues."

</specifics>

<deferred>
## Deferred Ideas

Captured during Phase 5 discussion, redirected out of Phase 5 scope:

- **Pin-to-note affordance** — rejected in D-01/D-08. If user ever wants explicit persistence of a custom test beyond note-close, it's a post-v1 enhancement. Scope creep prevented.

- **Migration of legacy `## Custom Tests` sections** — rejected in D-08. If the ignored-section accumulation becomes a real nuisance (e.g., community user reports "I have 200 stale test cases in my notes"), a `LeetCode: Clean up legacy custom tests` command could ship post-v1.

- **Live Preview / CM6 Run+Submit overlay** — D-11 ships Reading Mode `MarkdownPostProcessor` only. Live Preview path via `EditorView` is post-v1; the CM6 integration is non-trivial enough to warrant its own scope.

- **Chevron/dropdown submission navigator overlay on `## Code`** — Phase 4 deferred, still deferred. The command-palette-based picker (Phase 4 D-03) + Submission Viewer cover the core need.

- **Diff view in `SubmissionDetailModal`** — Phase 4 deferred, still deferred.

- **Retroactive opt-out cleanup command** (strip existing `## Techniques` sections) — still deferred. Users manually clean if they want.

- **Filter toggle in submission picker** (Accepted-only filter) — Phase 4 deferred, still deferred.

- **Submission history export** (save all submissions as files) — v2.

- **Bases-file schema regeneration for new Phase 4 frontmatter fields** — still deferred. Users re-generate manually if they want the columns visible in Bases views.

- **Animated GIF in README** — D-24 ships 4 static screenshots only. Post-v1 enhancement.

- **7-8 full-feature README screenshots** — D-24 ships 4 core-loop screenshots only.

- **Advanced / collapsible settings section** — D-17 rejected. If the settings tab grows past ~10 controls post-v1, revisit.

- **Auto-open login BrowserWindow on session expiry** — D-21 ships `addAction` button instead. Lets the user decide when to re-authenticate.

- **1.0.0 release** — D-23 ships 0.1.0. 1.0.0 after first community feedback round (tracked post-Phase 5).

- **Per-endpoint timeout tuning** — D-20 uses one 10s ceiling for all non-polling requests. If a specific endpoint needs different timeout (e.g., problem list slow on first load), post-v1 tuning.

- **Notice auto-retry beyond first attempt** (D-18 ships 1 retry) — if users report "LC rate-limits me a lot and I hate clicking retry," iterate post-v1.

Standing deferrals from PROJECT.md / REQUIREMENTS.md:
- Spaced repetition (SR-01..03) → v2
- leetcode.cn (CN-01..02) → v2
- Mobile (MOB-01..02) → v2
- AI enhancements (AI-01..02) → v2
- Spaced-repetition-dependent enrichments ("was this in streak N?") → v2
- Diff against current ## Code in SubmissionDetailModal → post-v1

</deferred>

---

*Phase: 5-polish-ship*
*Context gathered: 2026-05-09*
