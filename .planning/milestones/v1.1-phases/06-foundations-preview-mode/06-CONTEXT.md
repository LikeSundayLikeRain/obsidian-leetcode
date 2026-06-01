# Phase 06 Context — Foundations + Preview Mode

**Phase:** 06 — Foundations + Preview Mode
**Milestone:** v1.1 (Contest, AI Coach, and Preview)
**Date:** 2026-05-15
**Goal:** User can preview a LeetCode problem without creating a note, and the codebase is lint-clean against the latest plugin-store ruleset with a CI bundle-size gate.

---

<domain>

This phase delivers two coupled capabilities:

1. **Preview Mode** — a non-destructive read-mode tab for LeetCode problems. Single-click in `ProblemBrowserView` opens the preview tab; shift-click (or "Start Problem" inside the preview) goes through v1.0's existing note-creation pipeline. Preview also exposes "Open Problem" when a note already exists for the slug. This refactors the row-click handler into a `previewRouter` that Phase 10 (Contest) reuses.

2. **Foundations** — bumps `eslint-plugin-obsidianmd` to `^0.3.0` and resolves all new lint violations before any v1.1 feature code lands; introduces a CI workflow (lint + test + production build + 500 KB bundle-size gate); ensures every new command uses clean IDs (no plugin-id prefix, no "command" word).

Foundations gate every subsequent v1.1 phase. Preview unblocks Phase 10's `previewRouter` reuse.

Requirements covered: **FOUND-01, FOUND-02, FOUND-03, PREVIEW-01, PREVIEW-02, PREVIEW-03, PREVIEW-04, PREVIEW-05** (8 of v1.1's 39).

</domain>

---

<canonical_refs>

Downstream agents (researcher, planner, executor) MUST read these before acting. All paths are repo-relative.

**Project state**
- `.planning/PROJECT.md` — v1.1 milestone scope, key decisions, out-of-scope
- `.planning/REQUIREMENTS.md` — v1.1 requirements list (PREVIEW-01..05, FOUND-01..03)
- `.planning/ROADMAP.md` — Phase 06 goal + success criteria
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time

**v1.1 research (HIGH confidence; consume verbatim)**
- `.planning/research/SUMMARY.md` §7 (Phase 06 brief), §6.1, §6.5, §6.8
- `.planning/research/ARCHITECTURE.md` §2.1 (router refactor), §2.2 (NEW vs MODIFIED matrix), §3.1 (Preview deep-dive), §6 (build order)
- `.planning/research/FEATURES.md` §A (Preview feature landscape, anti-features)
- `.planning/research/PITFALLS.md` Pitfalls 14, 15, 16, 18 (preview / lint / README / bundle gate)
- `.planning/research/STACK.md` (no new runtime deps in this phase)

**Project conventions**
- `CLAUDE.md` — `'leetcode.*'` userEvent annotation rule (relevant if any cm.dispatch is added; preview should not need any), `app.vault.process` discipline (preview never writes to vault — but Start/Open delegates do)

**v1.0 code references (read before editing)**
- `src/main.ts:171, 462-475` — `LeetCodePlugin.openProblem(slug, status)` is the existing entry point; new `routeProblemClick(slug, status, intent)` wraps it
- `src/browse/ProblemBrowserView.ts:560-610` — single row-click handler at line 605-609 is the only edit site for the click-default change
- `src/browse/ProblemBrowserView.ts:471-484` — `pickRandom()` also calls `openProblem` directly; keep as-is (random pick = open intent, not preview)
- `src/notes/NoteWriter.ts:218-225` — `getProblemDetail(slug)` cache lookup; preview reuses
- `src/notes/NoteTemplate.ts` — exports `buildNotePath(folder, id, slug)`; preview uses for existing-note detection
- `src/settings/SettingsTab.ts` — settings precedent for the new "Preview" section + click-behavior toggle
- `src/settings/SettingsStore.ts` — `PluginData` shape; new field for click-behavior toggle goes here
- `package.json` — currently pins `eslint-plugin-obsidianmd@0.2.9`; FOUND-01 bumps to `^0.3.0`
- `esbuild.config.mjs` — production build entry; bundle-size check wraps this output

**External (verified 2026-05-14)**
- `eslint-plugin-obsidianmd@^0.3.0` README — full rule list (PITFALLS §15)
- Obsidian Developer Docs `MarkdownRenderer.render` (Context7) — `(app, md, el, sourcePath, component)` signature; `component` MUST be the `ItemView` instance, never the plugin (PITFALLS §15)
- `obsidian.d.ts` 1.12.x — `ItemView` lifecycle, `WorkspaceLeaf.detach`, `workspace.getLeaf(true)` / `getLeavesOfType(...)` for one-tab-at-a-time reuse

</canonical_refs>

---

<decisions>

### A. Click default + onboarding

- **Single-click previews for everyone — fresh installs and v1.1 upgraders alike.** No two-default split, no upgrader-detection branch.
- **Shift-click always opens the note directly** (bypasses preview), regardless of the click-behavior setting.
- **No onboarding modal.** The README documents the behavior change. Users who want v1.0 click-to-create can flip the settings toggle (PREVIEW-02).
- **Settings toggle:** new `Preview › Click behavior` setting under a new "Preview" section in `SettingsTab.ts`. Values: `preview` (default) | `open`. Persisted to `PluginData.previewClickBehavior` (or equivalent — researcher to confirm exact field shape against existing PluginData precedent).

### B. Preview tab placement & lifecycle

- **Open in a new center tab** via `workspace.getLeaf('tab')`. Not the right sidebar (cramped), not a modal (anti-feature), not by replacing the active leaf.
- **Reuse the existing preview tab on subsequent previews.** When a `leetcode-preview` leaf already exists, swap its content (re-render body + chips + Start/Open buttons) instead of opening a new tab. One preview tab at a time. Use `workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)` to detect.
- **After Start/Open:** preview leaf detaches once the note tab opens and gains focus. `this.leaf.detach()` after a brief delay (~100 ms post note-open) to avoid focus flicker — pattern lifted from PITFALLS §14.
- **No accidental file creation paths.** Preview is a `ProblemPreviewView extends ItemView` (custom view type `leetcode-preview`); body never calls `app.vault.create` or `workspace.openLinkText`. "Start Problem" delegates to `plugin.openProblem(slug, status)` (the existing v1.0 entry).

### C. Preview body content & UI chrome

- **Body renders full LC problem content** — statement + examples + constraints + follow-ups, the same content that v1.0 writes to the `## Problem` section of a note. Pipeline: cached `DetailCacheEntry.contentHtml` (or freshly fetched for cache miss) → existing turndown HTML→Markdown → `MarkdownRenderer.render(this.app, md, body, '', this)` where `this` = the `ProblemPreviewView` (satisfies `no-plugin-as-component`).
- **Sticky header bar** at the top of the tab containing, left → right:
  - `{id}. {title}` heading
  - Difficulty pill (reuses the v1.0 `lc-diff--{easy|medium|hard}` styling)
  - Topic chips (clickable later — for v1.1 base ship, render as plain chips)
  - Right-aligned action button: `Start Problem` when no note exists, `Open Problem` when one does. Existing-note detection: `SettingsStore.getProblemDetail(slug)` returns `DetailCacheEntry.id`; `app.vault.getAbstractFileByPath(buildNotePath(folder, id, slug))` resolves vault state. Both helpers already exist (`src/notes/NoteWriter.ts:218-225`, `src/notes/NoteTemplate.ts`).
  - The header MUST stay pinned on scroll; body scrolls underneath. CSS via the preview's own scoped class (e.g. `lc-preview__header.is-sticky`).
- **No "Preview Mode" banner / chip / label.** Tab title `Preview: {id}. {title}` plus a distinguishing tab icon, the absence of frontmatter, and the sticky action bar are sufficient to distinguish from a real note.
- **Tab icon:** use `getIcon(): 'eye'` (or `'book-open'` if `eye` collides — researcher to confirm available Lucide icon names against current Obsidian build).

### D. Foundations — lint bump + clean command IDs

- **`eslint-plugin-obsidianmd` bump to `^0.3.0`** runs as the first plan of Phase 06, before any preview feature code lands. `npm run lint` must be green at HEAD before Plan 02 begins.
- **Clean command IDs across the existing v1.0 surface.** Audit every `addCommand({ id: ... })` and `id` registration in `src/main.ts` against the new rules:
  - `commands/no-plugin-id-in-command-id` — strip any `obsidian-leetcode:` prefix
  - `commands/no-command-in-command-id` / `no-command-in-command-name` — drop the literal word "command"
  - `commands/no-default-hotkeys` — already clean in v1.0; verify
- **All new Phase 06 commands ship with clean IDs** (FOUND-03). Concrete additions are scoped to Plan 02 (preview): a new `Open in Preview` (or similar — final wording TBD by planner) palette command guarded by `editorCheckCallback` against `lc-slug` frontmatter is allowed but not required by PREVIEW-01..05; researcher should confirm whether the right-click menu PREVIEW-01 demands a palette twin.
- **Other 0.3.0 rules to handle in this phase:** `no-plugin-as-component` (Preview's `MarkdownRenderer.render` already accounts for this in decision C), `prefer-instanceof`, `vault/iterate`, `prefer-window-timers` (already enforced via v1.0's `shared/timers` helpers — re-confirm).

### E. CI bundle-size gate + full CI bootstrap

- **New GitHub Actions workflow** at `.github/workflows/ci.yml` runs on every push to `main` and every PR. Steps, in order:
  1. `npm ci`
  2. `npm run lint`
  3. `npm test`
  4. `npm run build` (production bundle)
  5. `npm run check:bundle-size` — new script that runs `du -b main.js` (or platform-portable equivalent) and fails the build when output > 500_000 bytes.
- **Hard gate at 500 KB**, soft warning at 400 KB (script logs the warning but exits 0). Threshold lives as a hardcoded constant in the script — not configurable, not stored as a baseline file.
- **Baseline noted in README + this CONTEXT.md only.** Current production `main.js` ≈ 163 KB (per `.planning/research/SUMMARY.md` §1). No `bundle-baseline.txt` committed; no PR-comment automation — kept simple to match current project scale.
- **No pre-push hook** added in this phase (kept user-driven; CI is authoritative).
- **README "Bundle size" subsection** added in this phase: states the 500 KB ceiling, the current ~163 KB baseline, and that violations fail CI.

### F. Out of scope for this phase (locked)

- Right-click context menu plumbing for PREVIEW-01 — required by the success criterion, but research confirms it's a thin handler. Researcher confirms whether it's a separate plan or folded into the row-click refactor; planner sequences accordingly. The decision here is only that this phase ships PREVIEW-01 (right-click → preview) — no deferral.
- Preview's "I have N notes in this cluster" hint, look-ahead edges, AI debug button, AI review section. All deferred to later phases per ROADMAP.md.
- Pattern-cluster wikilinks. Phase 11.
- Onboarding modal of any kind. Decided against above.
- PR-comment bundle-size delta. Decided against above.
- Bundling `bundle-baseline.txt` for drift tracking. Decided against above.
- Native iframe / web-view rendering of LC content. v1.0's turndown pipeline is reused verbatim.

</decisions>

---

<deferred>

Captured here, NOT implemented. These came up during discussion but are out of scope for Phase 06.

- **Topic chips clickable → filter ProblemBrowserView by topic.** Useful UX but pulls in a new affordance not required by PREVIEW-03. Backlog candidate post-v1.1.
- **Preview tab "I have N notes already linked to patterns this problem touches" coverage hint.** Depends on Phase 11's pattern-cluster work. Confirmed in `FEATURES.md` §A.
- **PR-comment automation showing bundle-size delta on every PR.** Nice-to-have once contributors join; one-person project doesn't justify the setup cost.
- **Pre-push hook for local size check.** Defer; CI is the source of truth.
- **Right-click → "Start Problem (skip preview)"** as a separate menu option. Shift-click already provides this; menu duplication can come later if user feedback demands.
- **Tab tooltip showing the LC URL of the previewed problem.** Polish; can fold into a later UX phase.

</deferred>

---

<code_context>

Key existing assets new code should reuse (read before writing anything new):

- **`LeetCodePlugin.openProblem(slug, status)`** at `src/main.ts:462-475` — the existing entry point that NoteWriter wraps. Preview's "Start Problem" / "Open Problem" buttons delegate here; the `routeProblemClick` wrapper checks intent and dispatches to either the new preview path or this existing call.

- **`ProblemBrowserView.renderRow` row-click handler** at `src/browse/ProblemBrowserView.ts:605-609` — the SINGLE edit site for the click-default change. Today: `void this.plugin.openProblem(p.slug, p.status)`. Becomes: `void this.plugin.routeProblemClick(p.slug, p.status, e.shiftKey ? 'open' : 'preview')`.

- **`ProblemBrowserView.pickRandom()`** at `src/browse/ProblemBrowserView.ts:471-484` — the random/shuffle button currently calls `openProblem` directly. Decision: leave unchanged. Random pick is intentional commitment, not browsing — opening directly matches user intent.

- **Existing-note detection helpers** — `SettingsStore.getProblemDetail(slug)` returns `DetailCacheEntry` with `id` and `fetchedAt`; `buildNotePath(folder, id, slug)` from `NoteTemplate.ts`; `app.vault.getAbstractFileByPath(...)` checks vault existence. Three function calls — no new index needed.

- **Turndown HTML→Markdown pipeline** — already wired into v1.0 problem fetch. Preview reuses by rendering the same Markdown that the `## Problem` section of a note would contain.

- **`MarkdownRenderer.render(app, md, el, sourcePath, component)`** — used by `SubmissionDetailModal` in v1.0. Pass `''` for `sourcePath` (the preview has no real file) and `this` (the ItemView) for `component`. Satisfies `no-plugin-as-component` and gives Obsidian a proper lifecycle owner for the rendered subtree.

- **Tab management** — `workspace.getLeaf('tab')` to open a fresh tab; `workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)` to detect existing preview leaves for reuse; `WorkspaceLeaf.openIfExtant` (TBD by researcher — verify name) or manual `setViewState({type: PREVIEW_VIEW_TYPE, state: {slug}})` on the existing leaf.

- **Settings precedent** — `SettingsTab.display()` mounts sections in fixed order. New "Preview" section sits between existing "Notes" and "Knowledge graph" sections (alphabetical-by-purpose; researcher to confirm against existing ordering convention).

- **Timer / interval helpers** — `src/shared/timers.ts` (`setWindowTimeout`, `clearWindowTimeout`) already wraps the popout-aware pattern. Preview's post-Start `leaf.detach()` delay should use `setWindowTimeout` (also satisfies `prefer-window-timers`).

- **Lint pinning** — `package.json` currently pins `eslint-plugin-obsidianmd@0.2.9`. FOUND-01 bumps to `^0.3.0`; verify peer/runtime compat against `@eslint/js@9.30.1`, `typescript-eslint@8.35.1`, `eslint@?` (researcher to confirm exact eslint version + any required co-bumps).

- **Build entry** — `esbuild.config.mjs` is invoked by `npm run build`; production output is `main.js` at repo root. The bundle-size check runs against this exact path post-build.

</code_context>

---

<plan_hints>

For the planner — likely plan boundaries (researcher/planner have final say):

1. **Plan 06.01: Lint bump + command-ID audit + CI scaffold.** Bumps `eslint-plugin-obsidianmd` to `^0.3.0`, fixes every resulting violation, audits existing v1.0 command IDs for the new rules, adds the new `.github/workflows/ci.yml` running lint+test+build+bundle-size, adds the `npm run check:bundle-size` script. Lint must be green and CI green at HEAD. **Gates every later plan.**
2. **Plan 06.02: `routeProblemClick` + settings toggle.** Refactors the row-click handler in `ProblemBrowserView` to call a new `LeetCodePlugin.routeProblemClick(slug, status, intent)`. Adds the `Preview › Click behavior` setting (`preview` | `open`) under a new "Preview" section in `SettingsTab`. No preview UI yet — `intent='preview'` falls back to a stub Notice until Plan 03 lands.
3. **Plan 06.03: `ProblemPreviewView` + tab-reuse logic.** Builds the `ProblemPreviewView` ItemView, renders the body via `MarkdownRenderer.render`, the sticky header chrome, the Start/Open button with existing-note detection, tab-reuse logic, post-action `leaf.detach()`. Wires the registration in `main.ts` onload. `routeProblemClick(... 'preview')` now opens the real preview.
4. **Plan 06.04: Right-click context menu (PREVIEW-01).** Adds the right-click → Preview entry on `ProblemBrowserView` rows. May fold into Plan 03 if researcher determines it's a 5-line addition; planner decides.
5. **Plan 06.05: README + bundle-size baseline doc.** Updates README with the v1.1 click-default change, the click-behavior toggle, the bundle-size policy. Re-confirms FOUND-02 baseline with a fresh `npm run build`.

Plan numbering is illustrative; planner's split is authoritative.

</plan_hints>

---

<success_criteria>

(Mirrors ROADMAP.md Phase 06 success criteria, restated for downstream.)

1. Right-click on a problem in `ProblemBrowserView` opens a preview tab with no `.md` file created in the vault.
2. Single-click previews by default (FOUND default); shift-click or the `Preview › Click behavior = open` toggle restores v1.0 click-to-create.
3. Preview tab shows difficulty + topic chips in a sticky header bar; "Start Problem" creates the note via `plugin.openProblem`; "Open Problem" jumps to the existing note.
4. CI fails when production `main.js` > 500 KB; baseline (~163 KB) noted in README.
5. `npm run lint` passes against `eslint-plugin-obsidianmd@^0.3.0` with all new commands using clean IDs.

Verification: each success criterion maps to an integration test or a manual UAT step, planner to enumerate.

</success_criteria>

---

<open_questions_for_planning>

Items the researcher / planner should resolve before execution. Not blockers for this CONTEXT.md.

- Exact `PluginData` field name + default for the click-behavior toggle (`previewClickBehavior` is a guess; check existing naming convention in `SettingsStore.ts`).
- Whether `leetcode-preview` view type clashes with any existing v1.0 type registration.
- Whether right-click context menu (PREVIEW-01) is its own plan or folds into the preview-view plan — informed by handler complexity.
- Confirm the eslint version that ships compatibly with `eslint-plugin-obsidianmd@^0.3.0` against current devDeps (`@eslint/js@9.30.1`, `typescript-eslint@8.35.1`).
- Decide platform-portable bundle-size check command (`du -b main.js` is GNU; a portable shim like `node -e "console.log(fs.statSync('main.js').size)"` may be safer for cross-OS contributors and CI runners).
- Cache-miss behavior for preview body rendering: when `getProblemDetail(slug)` returns nothing, does preview pre-fetch (preferred) or show a "Fetching…" placeholder + auto-render once fetch completes? Researcher to lock based on `ProblemListService` / detail-cache contract.

</open_questions_for_planning>

---

*Phase 06 context captured: 2026-05-15. Ready for `/gsd-plan-phase 6`.*
