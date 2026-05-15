# Phase 06: Foundations + Preview Mode — Research

**Researched:** 2026-05-15
**Domain:** Obsidian community-plugin lint hardening (`eslint-plugin-obsidianmd@^0.3.0`), CI bundle-size gate, and a non-destructive `ItemView`-based Preview tab refactoring `ProblemBrowserView`'s row-click into a `routeProblemClick` router.
**Confidence:** HIGH (every hot-path is read directly from `src/`, `node_modules/obsidian/obsidian.d.ts`, `node_modules/eslint-plugin-obsidianmd/dist/lib/rules/`, and the npm registry; v1.1 research files already locked these decisions at the milestone level)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Click default + onboarding**

- **Single-click previews for everyone — fresh installs and v1.1 upgraders alike.** No two-default split, no upgrader-detection branch.
- **Shift-click always opens the note directly** (bypasses preview), regardless of the click-behavior setting.
- **No onboarding modal.** README documents the behavior change. Users who want v1.0 click-to-create can flip the settings toggle (PREVIEW-02).
- **Settings toggle:** new `Preview › Click behavior` setting under a new "Preview" section in `SettingsTab.ts`. Values: `preview` (default) | `open`. Persisted to `PluginData.previewClickBehavior` (or equivalent — researcher confirms exact field shape against existing PluginData precedent — see decision below).

**B. Preview tab placement & lifecycle**

- **Open in a new center tab** via `workspace.getLeaf('tab')`. Not the right sidebar (cramped), not a modal (anti-feature), not by replacing the active leaf.
- **Reuse the existing preview tab on subsequent previews.** When a `leetcode-preview` leaf already exists, swap its content (re-render body + chips + Start/Open buttons) instead of opening a new tab. One preview tab at a time. Use `workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)` to detect.
- **After Start/Open:** preview leaf detaches once the note tab opens and gains focus. `this.leaf.detach()` after a brief delay (~100 ms post note-open) to avoid focus flicker — pattern lifted from PITFALLS §14.
- **No accidental file creation paths.** Preview is a `ProblemPreviewView extends ItemView` (custom view type `leetcode-preview`); body never calls `app.vault.create` or `workspace.openLinkText`. "Start Problem" delegates to `plugin.openProblem(slug, status)` (the existing v1.0 entry).

**C. Preview body content & UI chrome**

- **Body renders full LC problem content** — statement + examples + constraints + follow-ups, the same content that v1.0 writes to the `## Problem` section. Pipeline: cached `DetailCacheEntry.contentHtml` (or freshly fetched for cache miss) → existing turndown HTML→Markdown → `MarkdownRenderer.render(this.app, md, body, '', this)` where `this` = the `ProblemPreviewView` (satisfies `no-plugin-as-component`).
- **Sticky header bar** at the top of the tab containing, left → right:
  - `{id}. {title}` heading
  - Difficulty pill (reuses the v1.0 `lc-diff--{easy|medium|hard}` styling)
  - Topic chips (clickable later — for v1.1 base ship, render as plain chips)
  - Right-aligned action button: `Start Problem` when no note exists, `Open Problem` when one does. Existing-note detection: `SettingsStore.getProblemDetail(slug)` returns `DetailCacheEntry.id`; `app.vault.getAbstractFileByPath(buildNotePath(folder, id, slug))` resolves vault state. Both helpers already exist.
  - Header MUST stay pinned on scroll; body scrolls underneath.
- **No "Preview Mode" banner / chip / label.** Tab title `Preview: {id}. {title}` plus the tab icon plus absence of frontmatter is enough.
- **Tab icon:** `getIcon(): 'eye'` (or `'book-open'` if `eye` is unavailable).

**D. Foundations — lint bump + clean command IDs**

- **`eslint-plugin-obsidianmd` bump to `^0.3.0`** runs as the FIRST plan of Phase 06, before any preview feature code lands. `npm run lint` must be green at HEAD before Plan 02 begins.
- **Clean command IDs across the existing v1.0 surface.** Audit every `addCommand({ id: ... })` and `id` registration in `src/main.ts` against the new rules:
  - `commands/no-plugin-id-in-command-id` — strip any `obsidian-leetcode:` prefix
  - `commands/no-command-in-command-id` / `no-command-in-command-name` — drop the literal word "command"
  - `commands/no-default-hotkeys` — already clean in v1.0; verify
- **All new Phase 06 commands ship with clean IDs** (FOUND-03).
- **Other 0.3.0 rules to handle in this phase:** `no-plugin-as-component` (Preview's `MarkdownRenderer.render` accounts for this in C), `prefer-instanceof`, `vault/iterate`, `prefer-window-timers` (already enforced via v1.0's `shared/timers` helpers — re-confirm).

**E. CI bundle-size gate + full CI bootstrap**

- **New GitHub Actions workflow** at `.github/workflows/ci.yml` runs on every push to `main` and every PR. Steps in order:
  1. `npm ci`
  2. `npm run lint`
  3. `npm test`
  4. `npm run build` (production bundle)
  5. `npm run check:bundle-size` — new script; fails when `main.js` > 500_000 bytes.
- **Hard gate at 500 KB**, soft warning at 400 KB (script logs the warning but exits 0). Threshold lives as a hardcoded constant in the script — not configurable, not a baseline file.
- **Baseline noted in README + this CONTEXT.md only.** Current production `main.js` ≈ 163 KB (verified at HEAD: 162,229 bytes). No `bundle-baseline.txt` committed; no PR-comment automation.
- **No pre-push hook** added in this phase (kept user-driven; CI is authoritative).
- **README "Bundle size" subsection** added in this phase: states the 500 KB ceiling, the current ~163 KB baseline, and that violations fail CI.

**F. Out of scope for this phase (locked)**

- Right-click context menu plumbing for PREVIEW-01 — required by the success criterion. Researcher confirms whether it's a separate plan or folds into the preview-view plan — see decision below.
- Preview's "I have N notes in this cluster" hint, look-ahead edges, AI debug button, AI review section. All deferred to later phases per ROADMAP.md.
- Pattern-cluster wikilinks. Phase 11.
- Onboarding modal of any kind. Decided against above.
- PR-comment bundle-size delta. Decided against above.
- Bundling `bundle-baseline.txt` for drift tracking. Decided against above.
- Native iframe / web-view rendering of LC content. v1.0's turndown pipeline reused verbatim.

### Claude's Discretion

(Not explicitly enumerated as a discrete `<discretion>` block in CONTEXT.md, but these resolutions are owned by researcher/planner per CONTEXT.md `<open_questions_for_planning>`):

1. Exact `PluginData` field name + default for the click-behavior toggle.
2. Whether `leetcode-preview` view type clashes with any existing v1.0 type registration.
3. Whether right-click context menu (PREVIEW-01) is its own plan or folds into the preview-view plan.
4. Confirm the eslint version that ships compatibly with `eslint-plugin-obsidianmd@^0.3.0` against current devDeps.
5. Decide platform-portable bundle-size check command.
6. Cache-miss behavior for preview body rendering.
7. List every `addCommand({ id: ... })` audit-target.
8. Confirm right Lucide icon name for the preview tab.
9. Verify whether `WorkspaceLeaf.openIfExtant` exists.
10. Verify exact `MarkdownRenderer.render` call signature.

### Deferred Ideas (OUT OF SCOPE)

- **Topic chips clickable → filter ProblemBrowserView by topic.** Backlog candidate post-v1.1.
- **Preview tab "I have N notes already linked to patterns this problem touches" coverage hint.** Depends on Phase 11 cluster work.
- **PR-comment automation showing bundle-size delta on every PR.**
- **Pre-push hook for local size check.**
- **Right-click → "Start Problem (skip preview)"** as a separate menu option. Shift-click already provides this.
- **Tab tooltip showing the LC URL of the previewed problem.** Polish; later UX phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | `eslint-plugin-obsidianmd` is bumped to `^0.3.0` and the codebase passes the new ruleset. | §1 verifies installed version is 0.2.9; §3 enumerates new 0.3.0 rules and current command-ID audit; §6 lists install + version-compat. |
| FOUND-02 | CI fails the build if production bundle exceeds 500 KB. | §5 picks the platform-portable `node -e fs.statSync` shim; §11 lists threshold + baseline (162,229 bytes verified). |
| FOUND-03 | All new commands use clean IDs (no plugin-id prefix, no "command" word). | §3 audits all 7 existing v1.0 command IDs (all already clean — passes 0.3.0 rules); §7 enumerates the new Phase 06 command (`open-in-preview`) per CONTEXT.md hint. |
| PREVIEW-01 | User can right-click a problem in the browser to open it in a read-mode preview tab without creating a note. | §4.4 sketches Obsidian `Menu` API context-menu pattern; §10 covers regression hardening (no `vault.create` / `openLinkText` in the preview module). |
| PREVIEW-02 | Single-click previews by default; settings toggle restores v1.0 click-to-create. | §2 specifies `routeProblemClick(slug, status, intent)` API; §4.2 specifies the new `Preview` section in `SettingsTab` and `PluginData.previewClickBehavior` field shape. |
| PREVIEW-03 | User sees difficulty + topic chips at the top of the preview tab. | §4.3 maps to UI-SPEC.md sticky header decisions; topic data already in `DetailCacheEntry.topicTags` + `topicSlugs`. |
| PREVIEW-04 | "Start Problem" button creates the note via existing v1.0 pipeline. | §4.3 + §10 confirm Start delegates to `plugin.openProblem(slug, status)` which is the v1.0 entry at `src/main.ts:471-476`. |
| PREVIEW-05 | "Open Problem" button jumps to existing note instead of overwriting. | §4.3 confirms NoteWriter's existing-file branch (`src/notes/NoteWriter.ts:227`) handles re-open without overwrite. |
</phase_requirements>

---

## Summary

Phase 06 is two coupled but independent surfaces:

1. **Foundations (FOUND-01..03)** — bump `eslint-plugin-obsidianmd` from 0.2.9 (verified installed) to ^0.3.0, fix any new violations, audit existing v1.0 command IDs against new rules, add a GitHub Actions CI workflow with a 500 KB bundle-size gate. The v1.0 codebase is already mostly clean — every existing `addCommand` ID is already plain (`open-problem-browser`, `refresh-current-problem`, `submit`, `reset-code`, `view-past-submissions`, `cancel-submission`, `run`) — so the audit risk is mostly catching new 0.3.0 rules that weren't lints in 0.2.9 (`no-plugin-as-component`, `prefer-instanceof`, `vault/iterate`).

2. **Preview Mode (PREVIEW-01..05)** — a NEW `ItemView` (viewType `leetcode-preview`) registered in `main.ts` `onload()`, opened via a new `routeProblemClick(slug, status, intent)` method that the modified `ProblemBrowserView` row-click handler delegates to. Right-click on a row opens the same preview via Obsidian's `Menu` API. Body renders the cached LC problem content via `MarkdownRenderer.render(this.app, md, body, '', this)` (the view IS a Component — verified via `ItemView extends View extends Component` in `obsidian.d.ts`). One preview leaf at a time, swapped via `setViewState({type, state: {slug}})` on the existing leaf returned by `getLeavesOfType(PREVIEW_VIEW_TYPE)`. After Start/Open, `setWindowTimeout(100ms)` then `this.leaf.detach()`.

**Primary recommendation:** Land Foundations as Plan 06.01 (gate). Land the preview router + settings toggle as 06.02. Land the `ProblemPreviewView` as 06.03 (folds in the right-click handler — research below shows it is a 5-line `contextmenu` listener, not worth its own plan). Land the README + bundle-doc as 06.04.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Click-to-preview UX (row click → router → preview leaf) | UI / view layer (`ProblemBrowserView` + `ProblemPreviewView`) | Plugin orchestration (`LeetCodePlugin.routeProblemClick`) | Click happens in the view; routing decision lives on the plugin so Phase 10 (Contest) can reuse the same router. |
| Preview body rendering | UI / view layer (`ProblemPreviewView` + Obsidian `MarkdownRenderer`) | Domain (`SettingsStore.getProblemDetail`) for the cached HTML | View OWNS the DOM + lifecycle; it consumes already-cached HTML (no new fetch path needed when cached) |
| Cache-miss fetch | Domain (`LeetCodeClient.getProblemDetail` already exists) | Persistence (`SettingsStore.setProblemDetail`) | Reuse the v1.0 fetcher; no new HTTP path. The view shows a "Loading…" state while the existing throttled `requestUrl` chain runs. |
| Existing-note detection | Persistence (`SettingsStore.getProblemDetail` for `id`) + Vault (`app.vault.getAbstractFileByPath`) | Path builder (`NoteTemplate.buildNotePath`) | Both helpers already exist; preview reads vault state but never writes |
| Click-behavior toggle | Persistence (`PluginData.previewClickBehavior`) + UI (`SettingsTab.display()`) | — | Settings tab is the only writer; `routeProblemClick` is the only reader |
| Tab lifecycle (open / reuse / detach) | UI / view layer (`workspace.getLeavesOfType`, `workspace.getLeaf('tab')`, `leaf.setViewState`, `leaf.detach`) | Timing (`shared/timers.setWindowTimeout`) | All Obsidian-native primitives; popout-aware via `setWindowTimeout` |
| Right-click context menu | UI / view layer (`Menu` API on `ProblemBrowserView` row) | Plugin orchestration (delegates to `routeProblemClick(... 'preview', { force: true })`) | DOM `contextmenu` listener + Obsidian `Menu` — entirely in the existing browser view |
| Lint compliance / FOUND-01 | Build infrastructure (`package.json`, `eslint.config.mts`) | Source code (any new violations under 0.3.0) | Toolchain change with cascade fixes; lands as Plan 01 to gate everything else |
| CI bundle-size gate / FOUND-02 | Build infrastructure (`.github/workflows/ci.yml`, new `scripts/check-bundle-size.mjs` or `package.json` script) | — | Workflow + script; no source-code touch except the README |

---

## Standard Stack

### Core (no new runtime deps in this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` | latest (1.12.x) | `ItemView`, `MarkdownRenderer.render`, `WorkspaceLeaf`, `Menu`, `Notice`, `setIcon`, `Setting` | Already a runtime dep — provides every primitive Phase 06 needs. `ItemView extends View extends Component` (verified at `obsidian.d.ts:3456`, `:7350`, `:1830`) so the preview view IS a `Component` and can be passed to `MarkdownRenderer.render` as the 5th arg, satisfying the new `obsidianmd/no-plugin-as-component` rule. [VERIFIED: node_modules/obsidian/obsidian.d.ts] |
| `turndown` | 7.2.4 | HTML → Markdown for the cached `DetailCacheEntry.contentHtml` | Already a runtime dep used by `htmlToMarkdown` in `src/notes/htmlToMarkdown.ts` — preview reuses verbatim. [VERIFIED: package.json:33] |

### Foundations / Build

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eslint-plugin-obsidianmd` | `^0.3.0` (current installed: 0.2.9; latest published 2026-05-12) | Plugin-store lint enforcement | FOUND-01 requirement; the plugin store runs the latest version against PRs. Published `0.3.0` on 2026-05-12 (verified `npm view eslint-plugin-obsidianmd time`). [VERIFIED: npm registry] |
| `@eslint/js` | `^9.30.1` (currently pinned exactly to `9.30.1`) | ESLint flat-config base | Listed as `peerDependency` of `eslint-plugin-obsidianmd@0.3.0` (`^9.30.1`); already satisfied. [VERIFIED: `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies`] |
| `typescript-eslint` | `^8.35.1` (currently exact `8.35.1`) | TS rules + parser | Listed as `peerDependency` of `eslint-plugin-obsidianmd@0.3.0` (`^8.35.1`); already satisfied. [VERIFIED: `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies`] |
| `eslint` | `>=9.0.0` (peer-required by `eslint-plugin-obsidianmd@0.3.0`) | Lint runner | NOT directly pinned in `package.json` — currently transitively pulled via `@eslint/js@9.30.1` and `typescript-eslint@8.35.1`. [VERIFIED: `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies` returned `eslint: '>=9.0.0'`] **The bump from 0.2.9 → 0.3.0 requires NO co-bumps to `@eslint/js`, `typescript-eslint`, or `eslint`** — current pins satisfy 0.3.0's peer ranges. |
| `obsidian` (peer dep of 0.3.0) | `1.8.7` | Type baseline used by lint rules | Current install pulls `latest` (1.12.3); 0.3.0 peer-requires `obsidian: 1.8.7` literally — but that field is "informational" (the rule code only reads `obsidian.d.ts`-shape APIs that are stable across 1.8.x → 1.12.x). No conflict expected. [VERIFIED: `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies`] |

### Supporting (existing v1.0 helpers — REUSED)

| Helper | Path | Purpose | Reuse Site |
|--------|------|---------|------------|
| `setWindowTimeout` / `clearWindowTimeout` | `src/shared/timers.ts` | Popout-aware setTimeout via `activeWindow.setTimeout` | Preview's post-Start `leaf.detach()` 100 ms delay; satisfies `prefer-active-window-timers` rule |
| `htmlToMarkdown` | `src/notes/htmlToMarkdown.ts` | Turndown wrapper; already used by NoteWriter | Preview body renders this exact output |
| `buildNotePath(folder, id, slug)` | `src/notes/NoteTemplate.ts:137` | Computes `LeetCode/{id}-{slug}.md` | Existing-note detection in preview header |
| `LeetCodePlugin.openProblem(slug, status)` | `src/main.ts:471-476` | v1.0 entry that NoteWriter wraps | Preview's Start/Open buttons delegate here verbatim |
| `SettingsStore.getProblemDetail(slug)` | `src/settings/SettingsStore.ts:434` | Read cached `DetailCacheEntry` | Preview body source on cache hit; existing-note detection (returns `id`) |
| `LeetCodeClient.getProblemDetail(slug)` | `src/api/LeetCodeClient.ts` (referenced from `src/main.ts:780`) | Live LC fetch via existing throttled `requestUrl` | Preview cache-miss path |
| `MarkdownRenderer.render(app, md, el, sourcePath, component)` | `obsidian` API | Render markdown with full Obsidian semantics | `SubmissionDetailModal` already uses this (`src/graph/SubmissionDetailModal.ts:136`); preview follows the SAME shape but passes the view itself as `component` (the modal passes `this.component` — its own Component child, also valid). [VERIFIED: src/graph/SubmissionDetailModal.ts:136-143] |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| `ItemView` for preview | `MarkdownView` over a virtual file | Would force `vault.create` or some hidden-file shim — defeats the entire "no accidental note creation" goal of preview |
| `ItemView` for preview | Obsidian `Modal` | Modal blocks the editor; users can't keep preview open while browsing. Confirmed anti-feature in CONTEXT.md decision B. |
| `WorkspaceLeaf.openIfExtant` for tab reuse | `getLeavesOfType + setViewState` (chosen) | **`openIfExtant` does NOT exist on `WorkspaceLeaf`** in `obsidian.d.ts@1.12.3` — verified by grepping the type definitions. The standard pattern is `getLeavesOfType(PREVIEW_VIEW_TYPE)[0]` → if found, `leaf.setViewState({type, state: {slug}})`; if not, `workspace.getLeaf('tab').setViewState(...)`. [VERIFIED: `grep openIfExtant node_modules/obsidian/obsidian.d.ts` returned nothing] |
| `du -b main.js` for size check | `node -e "console.log(fs.statSync('main.js').size)"` (chosen) | `du -b` is GNU-only; macOS / BSD `du` lacks `-b` (uses `-A` and reports in 512-byte blocks). The Node shim is platform-portable, has zero deps, and runs in any GitHub Actions runner image. |
| Streaming a fresh fetch on cache miss | Render "Loading…" state then re-render on resolve (chosen) | Streaming UX is overkill for a problem statement that loads in < 2 s on a warm connection. Cache-miss is the ONLY slow path. |
| Encoding `previewClickBehavior` as a boolean | String enum `'preview' \| 'open'` (chosen) | Matches the locked CONTEXT.md decision A copy ("Preview first" / "Open note directly"); future-proofs for additional modes (e.g. "ask each time") without a schema migration |

**Installation:**

```bash
# FOUND-01 — bump only the lint package (no co-bumps required; peer deps already satisfied)
npm install --save-dev eslint-plugin-obsidianmd@^0.3.0

# Phase 06 introduces ZERO new runtime deps. Verify post-install:
npm ls eslint-plugin-obsidianmd
```

**Version verification (performed 2026-05-15):**

| Package | Pinned in package.json | Latest on npm | Action |
|---------|------------------------|---------------|--------|
| `eslint-plugin-obsidianmd` | `0.2.9` | `0.3.0` (published 2026-05-12) | Bump to `^0.3.0` |
| `@eslint/js` | `9.30.1` | (peer-satisfies 0.3.0's `^9.30.1`) | Hold |
| `typescript-eslint` | `8.35.1` | (peer-satisfies 0.3.0's `^8.35.1`) | Hold |
| `eslint` (no direct pin) | transitive | (peer-satisfies 0.3.0's `>=9.0.0`) | Hold |

[VERIFIED: `npm view eslint-plugin-obsidianmd version` → `0.3.0`; `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies` → `{ '@eslint/js': '^9.30.1', '@eslint/json': '0.14.0', eslint: '>=9.0.0', obsidian: '1.8.7', 'typescript-eslint': '^8.35.1' }`]

---

## Architecture Patterns

### System Architecture Diagram

```
                                                User clicks row
                                                       │
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │ ProblemBrowserView.renderRow click listener            │
                       │   src/browse/ProblemBrowserView.ts:605-609 (MODIFIED)  │
                       │   - left click  → routeProblemClick(slug, status,'preview')
                       │   - shift click → routeProblemClick(slug, status,'open')
                       │   - right click → Menu({Preview problem})              │
                       │                     → routeProblemClick(... 'preview', force=true)
                       └─────┬──────────────────────────┬────────────────────────┘
                             │                          │
                             ▼                          │
            ┌──────────────────────────────────┐        │
            │ LeetCodePlugin.routeProblemClick │        │
            │   (NEW — src/main.ts)            │        │
            │   Reads PluginData.previewClick- │        │
            │   Behavior. With force=true,     │        │
            │   intent='preview' overrides     │        │
            │   the user's setting.            │        │
            └──┬───────────────────────────────┘        │
               │                          │              │
        intent='preview'           intent='open'         │
               │                          │              │
               ▼                          ▼              ▼
   ┌─────────────────────────────┐    ┌──────────────────────────────┐
   │ openOrReusePreview(slug)    │    │ plugin.openProblem(slug,     │
   │   (NEW)                     │    │   status)                    │
   │   1. getLeavesOfType(       │    │   = NoteWriter.openProblem   │
   │      PREVIEW_VIEW_TYPE)     │    │   (UNCHANGED v1.0 entry)     │
   │   2. if leaf exists:        │    └─────────┬────────────────────┘
   │      leaf.setViewState({    │              │
   │        type, state:{slug}}) │              ▼
   │   3. else:                  │       Vault note created /
   │      workspace.getLeaf(     │       revealed (existing path)
   │       'tab').setViewState() │
   │   4. revealLeaf(leaf)       │
   └────────┬────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│ ProblemPreviewView extends ItemView (NEW)                        │
│   src/preview/ProblemPreviewView.ts                              │
│   viewType = 'leetcode-preview'                                  │
│                                                                  │
│  setState({slug}) →                                              │
│    1. cache hit? ──yes──┐                                        │
│       SettingsStore.    │                                        │
│       getProblemDetail()│                                        │
│           │             ▼                                        │
│           no    render(detail)                                   │
│           │     - sticky header (id+title+diff+chips+button)     │
│           ▼     - body via MarkdownRenderer.render(app,md,el,'',this)│
│    render loading state                                          │
│    fetch via plugin.client.getProblemDetail(slug) (existing)     │
│        │                                                         │
│        resolve → render(detail)                                  │
│        reject  → render error state with [Retry]                 │
│                                                                  │
│  Start/Open click →                                              │
│    plugin.openProblem(slug, status)                              │
│      then setWindowTimeout(100ms, () => this.leaf.detach())      │
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additions for Phase 06)

```
src/
├── preview/                        # NEW
│   ├── ProblemPreviewView.ts       # ItemView; renders body + sticky header; handles tab lifecycle
│   ├── previewRouter.ts            # routeProblemClick() — could attach directly to LeetCodePlugin
│   └── previewExistingNote.ts      # Pure helper: existing-note detection (slug → {fileExists, file?, id?})
├── settings/
│   ├── SettingsStore.ts            # MODIFIED — add `previewClickBehavior` field + getter/setter
│   └── SettingsTab.ts              # MODIFIED — add `Preview` section with click-behavior dropdown
├── browse/
│   └── ProblemBrowserView.ts       # MODIFIED — row-click → routeProblemClick; add contextmenu listener
└── main.ts                         # MODIFIED — registerView(PREVIEW_VIEW_TYPE); add `routeProblemClick` method
```

```
.github/
└── workflows/
    └── ci.yml                      # NEW — lint + test + build + bundle-size gate

scripts/
└── check-bundle-size.mjs           # NEW — Node shim for portable size check
```

### Pattern 1: `routeProblemClick(slug, status, intent, opts?)` — single dispatch site

**What:** All problem-row activations funnel through ONE method on `LeetCodePlugin`. Phase 10 (Contest) reuses this so contest "open the four problems" can opt into preview-first if desired.

**When to use:** Any callsite that "opens a LeetCode problem" — row click, right-click menu, palette command, future contest start.

**Code pattern (verified against existing v1.0 entry shape):**

```ts
// src/main.ts (NEW METHOD on LeetCodePlugin)
type PreviewClickBehavior = 'preview' | 'open';
type ClickIntent = 'preview' | 'open';

async routeProblemClick(
  slug: string,
  status: 'solved' | 'attempted' | 'untouched' | undefined,
  intent: ClickIntent,
  opts?: { force?: boolean },
): Promise<void> {
  // Right-click → preview always wins (force=true bypasses user setting).
  if (intent === 'preview' && !opts?.force) {
    const cfg = this.settings.getPreviewClickBehavior();
    if (cfg === 'open') return this.openProblem(slug, status);
  }
  if (intent === 'open') return this.openProblem(slug, status);
  return this.openOrReusePreview(slug);
}
```

**Trade-offs:**
- + Single source of truth — Phase 10 reuses with zero refactor
- + Settings toggle has ONE reader; `ProblemBrowserView` doesn't read settings directly
- − Adds one method to `LeetCodePlugin` (already a "god object"); mitigated by keeping `openOrReusePreview` in `src/preview/` as a free function

[CITED: `.planning/research/ARCHITECTURE.md` §3.1 — "How the existing browser changes"]

### Pattern 2: ItemView tab-reuse via `getLeavesOfType + setViewState`

**What:** One preview tab at a time. New previews swap content on the existing leaf rather than opening duplicates.

**Code pattern (verified — `openIfExtant` does NOT exist):**

```ts
// src/preview/ProblemPreviewView.ts (or main.ts helper)
const PREVIEW_VIEW_TYPE = 'leetcode-preview';

async function openOrReusePreview(plugin: LeetCodePlugin, slug: string): Promise<void> {
  const ws = plugin.app.workspace;
  const existing = ws.getLeavesOfType(PREVIEW_VIEW_TYPE);
  if (existing.length > 0 && existing[0]) {
    // Reuse — setViewState triggers ProblemPreviewView.setState({slug}) lifecycle
    await existing[0].setViewState({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug },
    });
    await ws.revealLeaf(existing[0]);
    return;
  }
  const leaf = ws.getLeaf('tab');
  await leaf.setViewState({
    type: PREVIEW_VIEW_TYPE,
    active: true,
    state: { slug },
  });
  await ws.revealLeaf(leaf);
}
```

**ItemView setState/getState contract (NEW — read on plugin reload too):**

```ts
export class ProblemPreviewView extends ItemView {
  private slug: string | null = null;

  getViewType() { return PREVIEW_VIEW_TYPE; }
  getDisplayText() {
    const cached = this.slug ? this.plugin.settings.getProblemDetail(this.slug) : null;
    if (this.slug && cached) return `Preview: ${cached.id}. ${cached.title}`;
    return 'Preview';
  }
  getIcon() { return 'eye'; }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const slug = (state as { slug?: unknown })?.slug;
    if (typeof slug === 'string') {
      this.slug = slug;
      await this.renderForSlug(slug);
    }
    return super.setState(state, result);
  }

  getState(): { slug: string | null } { return { slug: this.slug }; }
}
```

**Verification of API:** `WorkspaceLeaf.setViewState(viewState, eState?)` is the single canonical method to swap a leaf's content (`obsidian.d.ts:7306`). `Workspace.getLeavesOfType(viewType: string): WorkspaceLeaf[]` (`obsidian.d.ts:7050`) returns all leaves of a given type. `Workspace.getLeaf(newLeaf?: PaneType | boolean)` overload `'tab'` opens a fresh center tab (`obsidian.d.ts:6927`). [VERIFIED: node_modules/obsidian/obsidian.d.ts]

### Pattern 3: `MarkdownRenderer.render(app, md, el, sourcePath, component)` with view as Component

**What:** The new `obsidianmd/no-plugin-as-component` rule (in 0.3.0) fires when the `component` arg is the plugin instance itself. Pass an `ItemView` (which IS a Component) instead.

**Verified facts:**
- `MarkdownRenderer.render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>` ([VERIFIED: obsidian.d.ts:4013])
- `ItemView extends View` (`obsidian.d.ts:3456`); `View extends Component` (`obsidian.d.ts:7350` — `View` is at line 6709, declared `extends` not literally Component but transitively via the class hierarchy — the existing `SubmissionDetailModal.ts:136` pattern passes `this.component` (a child `Component` it explicitly creates) as the 5th arg, so passing the view directly is equivalent and avoids the extra Component plumbing).
- The locked CONTEXT.md call shape is `MarkdownRenderer.render(this.app, md, body, '', this)` where `this` = the `ProblemPreviewView`. Passing `''` as `sourcePath` is correct because there is no real file backing the preview — the preview is ephemeral and any wikilinks should resolve against the global vault, not relative to a file path.

**Code pattern:**

```ts
// inside ProblemPreviewView
private async renderForSlug(slug: string): Promise<void> {
  this.contentEl.empty();
  this.contentEl.addClass('leetcode-preview');

  // Cache hit fast-path
  let detail = this.plugin.settings.getProblemDetail(slug);
  if (!detail) {
    this.renderLoading();
    try {
      // Cache-miss: prefer the existing client (it persists into SettingsStore on success)
      const fetched = await this.plugin.client.getProblemDetail(slug);
      if (!fetched || !fetched.content) {
        this.renderError("Couldn't load problem", new Error('not found'));
        return;
      }
      // We DO NOT manually setProblemDetail here — the v1.0 NoteWriter pattern is the
      // canonical persister. For preview we re-read after the client-call to pick
      // up whatever the throttled fetcher decided to cache (research §6 below
      // resolves the cache-miss contract).
      detail = this.plugin.settings.getProblemDetail(slug);
      if (!detail) {
        // Fall back: build a minimal in-memory entry from the fetch result for render only
        // (no persistence — keep preview side-effect-free on disk).
        detail = ephemeralDetailFromFetch(fetched);
      }
    } catch (err) {
      this.renderError("Couldn't load problem", err);
      return;
    }
  }

  this.renderHeader(detail);
  const body = this.contentEl.createDiv({ cls: 'leetcode-preview__body' });
  const md = htmlToMarkdown(detail.contentHtml);
  await MarkdownRenderer.render(this.app, md, body, '', this);  // `this` = the view
}
```

[VERIFIED: SubmissionDetailModal.ts:136-143 already uses MarkdownRenderer.render in v1.0; same import path]

### Pattern 4: Right-click context menu via `contextmenu` listener + Obsidian `Menu`

**What:** Add a `contextmenu` event listener to `renderRow`'s row element. Open a one-item Obsidian `Menu` at the cursor. Single click on the entry dispatches the same router with `force: true` (right-click is explicit user intent regardless of the click-behavior setting).

**Code pattern (verified against UI-SPEC.md interaction contract):**

```ts
// src/browse/ProblemBrowserView.ts renderRow — ADDITION
row.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle('Preview problem')
      .setIcon('eye')
      .onClick(() => {
        void this.plugin.routeProblemClick(p.slug, p.status, 'preview', { force: true });
      }),
  );
  menu.showAtMouseEvent(e);
});
```

This is a **5-line addition**. Researcher recommends folding the right-click handler INTO the `ProblemPreviewView` plan (Plan 06.03) rather than splitting it into its own plan — see §3 (Plan boundary recommendation).

### Anti-Patterns to Avoid

- **`vault.create(...)` inside the preview module.** Preview is read-only; the entire plan exists to prevent accidental note creation. Acceptance grep already locked in UI-SPEC.md: `grep -n "vault.create\|openLinkText" src/preview/` MUST return zero. [CITED: `.planning/research/PITFALLS.md` Pitfall 14]
- **Reading from `app` instead of `this.app`.** Lint flags this; v1.0 already passes — re-confirm at Plan 06.03.
- **Using `innerHTML` for problem content.** Forbidden by 0.3.0 + community-plugin guidelines. Preview goes HTML → Markdown via turndown → `MarkdownRenderer.render`, never raw HTML. [CITED: `.planning/research/PITFALLS.md` Pitfall 14]
- **Passing `this` (the plugin) as the 5th arg to `MarkdownRenderer.render`.** Triggers `obsidianmd/no-plugin-as-component`; pass the view instead.
- **Bare `setTimeout(... , 100)` for the post-Start detach delay.** Use `setWindowTimeout` from `src/shared/timers.ts` so popout windows work correctly + satisfy `prefer-active-window-timers`.
- **`workspace.activeLeaf` direct access.** Deprecated; use `workspace.getActiveViewOfType` or `getLeavesOfType`. (Already enforced in v1.0; preview must follow.)
- **Plugin id prefix in command IDs.** New `Open in preview` palette command MUST be `id: 'open-in-preview'`, not `id: 'obsidian-leetcode:open-in-preview'`. Same goes for the rest of the existing IDs (re-verified clean below).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Render LC problem HTML in the preview | `innerHTML` / a custom DOM walker | `htmlToMarkdown` (existing) → `MarkdownRenderer.render` (Obsidian) | XSS risk on `innerHTML`; XSS-safe via markdown pipeline; matches v1.0 `## Problem` rendering |
| Tab reuse / "is there already a preview tab?" detection | A custom registry of opened previews | `workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)` | Obsidian already tracks every leaf by view type; a side-registry would drift on plugin reload |
| Persist the preview's slug across plugin reload | A new `data.json` field | Obsidian's leaf state via `setState/getState` on the ItemView | `ViewState.state` is exactly this primitive; Obsidian persists it in workspace.json |
| Right-click menu | A custom DOM popup | Obsidian `Menu` API + `Menu.showAtMouseEvent(evt)` | Native styling, native dismissal, native keyboard nav |
| Bundle-size threshold check on multiple OSes | A bash one-liner with `du -b` | A 5-line Node script using `fs.statSync` | `du -b` is GNU-only — would silently fail on macOS runners |
| Detect existing note for "Start vs Open" toggle | A new file index | `app.vault.getAbstractFileByPath(buildNotePath(folder, id, slug))` | Three function calls, all v1.0 primitives; no new index needed |
| Lifecycle / cleanup on tab close | A custom subscription tracker | `ItemView.onClose()` + `register()` family on `Component` | Obsidian auto-cleans every `register*` subscription; manual tracking is redundant |
| Loading-state UX during cache miss | A streaming progress bar | `renderEmptyState`-shape pattern from `ProblemBrowserView` (`.lc-empty`) | Established v1.0 idiom; UI-SPEC.md already locked the loading copy + layout |

**Key insight:** Phase 06 is about *reusing* primitives, not building new ones. Every novel construct in the plan should feel suspicious — the only genuinely-new things are (a) the view type registration string, (b) the `routeProblemClick` 8-line wrapper, (c) the `previewClickBehavior` settings field, (d) the bundle-size script, and (e) the GitHub Actions YAML.

---

## Runtime State Inventory

> Phase 06 is a feature-add phase, not a rename / refactor / migration. This section is included for completeness but most categories are **None**.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **One new field on `PluginData`:** `previewClickBehavior: 'preview' \| 'open'` (default `'preview'`). Stored in `.obsidian/plugins/obsidian-leetcode/data.json`. NO migration data — existing v1.0 installs simply lack the field; the load-time shape guard in `SettingsStore.load` defaults missing/non-string values to `'preview'`. | New `getter`/`setter` + shape-guard branch in `SettingsStore.load`; default value is `'preview'` to honor the locked CONTEXT.md decision A |
| Live service config | None — preview talks to NO new external service. The cache-miss path uses `plugin.client.getProblemDetail`, which is the existing `LeetCodeClient` (verified at `src/main.ts:780`); no new GraphQL surface, no new endpoint. | None |
| OS-registered state | None — no Task Scheduler / launchd / pm2 entries; no native binaries; nothing registered with the OS. | None |
| Secrets / env vars | None — no new keys, no secrets surface. CI uses `GITHUB_TOKEN` for the workflow but that's automatic. | None |
| Build artifacts / installed packages | `node_modules/eslint-plugin-obsidianmd` will be replaced by the 0.3.0 install. `package-lock.json` regenerated. **No** rebuild of `main.js` artifact required by the Foundations bump itself, but Plan 04 (CI workflow) will fail-fast unless the README + check-bundle-size script land before the workflow gates the first PR. | After `npm install`, run `npm run lint` and confirm zero violations. The `node_modules/eslint-plugin-obsidianmd/dist/lib/rules/` tree expands from the current ~12 rules to the full 0.3.0 ruleset (see §3 below). |

**Verified explicit "nothing found" items (ran 2026-05-15):**

- **No collision on `'leetcode-preview'` view type.** `grep -rn "leetcode-preview" src/` returns zero matches; `grep -rn "BROWSER_VIEW_TYPE\|registerView" src/` confirms only `'leetcode-browser'` is in use. Safe to register `'leetcode-preview'`. [VERIFIED: bash grep on src/]
- **No collision on the proposed new command id `open-in-preview`.** Existing v1.0 command IDs are: `open-problem-browser`, `refresh-current-problem`, `submit`, `reset-code`, `view-past-submissions`, `cancel-submission`, `run`. None overlap. [VERIFIED: grep `addCommand` in src/]
- **`WorkspaceLeaf.openIfExtant` does not exist.** [VERIFIED: `grep openIfExtant node_modules/obsidian/obsidian.d.ts` returned no results.]

---

## Common Pitfalls

### Pitfall 1: Silent note creation in the preview path
**What goes wrong:** A code path inside `src/preview/` calls `app.vault.create(...)` or `app.workspace.openLinkText(...)` (which is "open-or-create"). The preview now creates accidental notes — exactly the bug the feature exists to prevent.
**Why it happens:** `openLinkText` is one line and "feels right" for opening; but it has create-side effect. The v1.0 reveal path uses it too (`src/notes/NoteWriter.ts:229,301,386`), which trains muscle memory.
**How to avoid:** Acceptance grep gate (already in UI-SPEC.md): `grep -nE "vault\.create\(|workspace\.openLinkText\(" src/preview/` MUST return zero. The Start/Open buttons hand off to `plugin.openProblem(slug, status)` — that is the ONLY note-creation path. [CITED: PITFALLS.md Pitfall 14]
**Warning signs:** A new `.md` file appearing in the vault on first preview of a slug.

### Pitfall 2: `MarkdownRenderer.render` passing the plugin as Component
**What goes wrong:** Lint fails on `obsidianmd/no-plugin-as-component`; at runtime, when the preview tab closes, the rendered subtree's child components don't unload because they're parented to the plugin (which only unloads at plugin disable). Memory leak.
**Why it happens:** The signature looks like `render(app, md, el, sourcePath, component)` and "component" looks naturally like the plugin.
**How to avoid:** Pass `this` (the `ProblemPreviewView` instance — `ItemView extends View` extends `Component` transitively per the obsidian.d.ts class hierarchy). Acceptance grep: `grep -n "MarkdownRenderer.render(" src/preview/` should match `this.app, …, this)` shape — never `this.plugin`. [CITED: PITFALLS.md Pitfall 14, UI-SPEC.md Acceptance grep]
**Warning signs:** Bundle-size unchanged but Obsidian's "Memory" performance metric trends up after multiple preview opens/closes.

### Pitfall 3: Tab not reused — duplicate preview tabs after each click
**What goes wrong:** Click problem A → preview tab opens. Click problem B → second preview tab opens alongside. Workspace fills with stale tabs.
**Why it happens:** Forgot to `getLeavesOfType` first; or did but called `getLeaf('tab')` unconditionally.
**How to avoid:** Pattern 2 above — always `getLeavesOfType(PREVIEW_VIEW_TYPE)` first, swap state if found, only `getLeaf('tab')` on empty. Acceptance grep: `getLeavesOfType('leetcode-preview'\|getLeavesOfType(PREVIEW_VIEW_TYPE` returns at least one match in `src/preview/`. [CITED: UI-SPEC.md Acceptance grep]
**Warning signs:** Manual smoke test: rapid-click 5 different rows; expect ONE preview tab.

### Pitfall 4: Cache-miss UX hangs without feedback
**What goes wrong:** Click a row whose detail isn't cached. Preview tab opens but renders nothing for 1-3 seconds while the GraphQL fetch runs. User clicks another row, double-fires.
**Why it happens:** No loading state; or loading state is shown but the fetch isn't actually fired.
**How to avoid:** UI-SPEC.md locked the loading copy ("Loading problem…" / "Fetching {id}. {title}…"). The view must render the loading state SYNCHRONOUSLY before awaiting the fetch. The state-machine in UI-SPEC.md `## State machine` covers this.
**Warning signs:** Manual test on a fresh install with empty cache: the loading state must paint within ~16ms of the click.

### Pitfall 5: 0.3.0 lint rules silently fail v1.0 code
**What goes wrong:** Bumping to 0.3.0 surfaces violations in v1.0 modules that 0.2.9 didn't catch (`prefer-instanceof`, `vault/iterate`, `no-plugin-as-component`). Plan 06.01 turns red, Plan 06.02 can't start.
**Why it happens:** Each minor 0.x.x release of the plugin adds rules without an opt-in flag; `recommended` config picks them all up.
**How to avoid:** §3 below pre-audits the most likely v1.0 violators. Plan 06.01 has explicit budget for the cascade fix. [CITED: PITFALLS.md Pitfall 15]
**Warning signs:** Plan 06.01 lint pass produces > 30 errors (audit underestimated; reset budget).

### Pitfall 6: Bundle-size script uses GNU-only flags
**What goes wrong:** `du -b main.js` works locally on Linux but fails on macOS contributors / GitHub Actions macOS runners. Soft warning never fires; hard gate misses.
**Why it happens:** macOS `du` doesn't support `-b` (uses 512-byte blocks).
**How to avoid:** Use a Node shim — the runtime's already on the runner, no new dep, works everywhere. [Resolves: CONTEXT.md `<open_questions_for_planning>` item 5]

```js
// scripts/check-bundle-size.mjs
import fs from 'node:fs';
const HARD_LIMIT = 500_000;
const SOFT_WARN = 400_000;
const size = fs.statSync('main.js').size;
console.log(`main.js: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
if (size > HARD_LIMIT) {
  console.error(`FAIL: main.js exceeds ${HARD_LIMIT} bytes`);
  process.exit(1);
}
if (size > SOFT_WARN) {
  console.warn(`WARN: main.js > ${SOFT_WARN} bytes — heading toward the gate`);
}
```

**Warning signs:** CI green on Linux but a fresh PR opened from macOS reports "command not found: stat".

### Pitfall 7: Settings field shape mismatches
**What goes wrong:** `previewClickBehavior` written as a boolean by an early prototype, then changed to `'preview'|'open'` strings — existing dev installs get a load-time shape-guard rejection that flips them silently to default.
**Why it happens:** Iterating the schema before locking.
**How to avoid:** Lock the schema in this RESEARCH.md before Plan 06.02 starts. **Decision: `'preview' | 'open'` string enum**, default `'preview'`. Shape-guard in `SettingsStore.load`:
```ts
previewClickBehavior:
  raw.previewClickBehavior === 'open' ? 'open'
  : 'preview',  // default for both 'preview' and any malformed/missing value
```
**Warning signs:** Dev sees their toggle reset on plugin reload after a prototype iteration.

---

## Code Examples

### Example 1: Phase 06 onload registration block (`src/main.ts` additions)

```ts
// Step 6a (UPDATED) — register both views.
this.registerView(BROWSER_VIEW_TYPE, (leaf) =>
  new ProblemBrowserView(leaf, this));
this.registerView(PREVIEW_VIEW_TYPE, (leaf) =>
  new ProblemPreviewView(leaf, this));   // NEW

// Step 6c (UPDATED) — palette twin for PREVIEW-01 (researcher-recommended; optional)
this.addCommand({
  id: 'open-in-preview',
  name: 'Open in preview',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
      as Record<string, unknown> | undefined;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) return false;
    if (!checking) {
      void this.routeProblemClick(slug, undefined, 'preview', { force: true });
    }
    return true;
  },
});
```

### Example 2: `routeProblemClick` (NEW method on `LeetCodePlugin`)

```ts
async routeProblemClick(
  slug: string,
  status: 'solved' | 'attempted' | 'untouched' | undefined,
  intent: 'preview' | 'open',
  opts?: { force?: boolean },
): Promise<void> {
  if (intent === 'open') return this.openProblem(slug, status);
  // intent === 'preview' — settings can override unless force=true
  if (!opts?.force) {
    const cfg = this.settings.getPreviewClickBehavior();
    if (cfg === 'open') return this.openProblem(slug, status);
  }
  // Local helper that lives in src/preview/ — exported for test isolation.
  const { openOrReusePreview } = await import('./preview/previewRouter');
  return openOrReusePreview(this, slug);
}
```

(The dynamic import is not required — a static import is fine. Shown here only as a tree-shaking option if Phase 10 measurement shows a reason; not part of Plan recommendation.)

### Example 3: `SettingsStore` field additions

```ts
// In PluginData interface
previewClickBehavior: 'preview' | 'open';

// In DEFAULT_DATA
previewClickBehavior: 'preview',

// In load() shape-guard (defensive)
previewClickBehavior:
  raw.previewClickBehavior === 'open' ? 'open' : 'preview',

// New getter / setter
getPreviewClickBehavior(): 'preview' | 'open' { return this.data.previewClickBehavior; }
async setPreviewClickBehavior(v: 'preview' | 'open'): Promise<void> {
  this.data.previewClickBehavior = v;
  await this.persist();
}
```

### Example 4: Settings UI section (in `SettingsTab.display()`)

```ts
// Inserted between the Notes section (lines 149-173) and the Knowledge graph
// section (line 182).
new Setting(containerEl).setName('Preview').setHeading();

new Setting(containerEl)
  .setName('Click behavior')
  .setDesc('What happens when you click a problem in the LeetCode browser. Shift-click always opens the note directly.')
  .addDropdown((d) => d
    .addOption('preview', 'Preview first')
    .addOption('open', 'Open note directly')
    .setValue(this.plugin.settings.getPreviewClickBehavior())
    .onChange(async (v) => {
      await this.plugin.settings.setPreviewClickBehavior(v as 'preview' | 'open');
    }),
  );
```

### Example 5: `ProblemBrowserView.renderRow` row-click MODIFICATION

```ts
// Existing line 605-609 becomes:
row.addEventListener('click', (e) => {
  const intent: 'preview' | 'open' = (e as MouseEvent).shiftKey ? 'open' : 'preview';
  void this.plugin.routeProblemClick(p.slug, p.status, intent);
});

// ADDITION (right-click context menu — PREVIEW-01)
row.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle('Preview problem')
      .setIcon('eye')
      .onClick(() => {
        void this.plugin.routeProblemClick(p.slug, p.status, 'preview', { force: true });
      }),
  );
  menu.showAtMouseEvent(e);
});
```

### Example 6: `ProblemPreviewView` skeleton

```ts
// src/preview/ProblemPreviewView.ts
import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon, type ViewStateResult } from 'obsidian';
import type LeetCodePlugin from '../main';
import { htmlToMarkdown } from '../notes/htmlToMarkdown';
import { buildNotePath } from '../notes/NoteTemplate';
import { setWindowTimeout } from '../shared/timers';

export const PREVIEW_VIEW_TYPE = 'leetcode-preview';

export class ProblemPreviewView extends ItemView {
  private slug: string | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string { return PREVIEW_VIEW_TYPE; }
  getIcon(): string { return 'eye'; }
  getDisplayText(): string {
    if (!this.slug) return 'Preview';
    const cached = this.plugin.settings.getProblemDetail(this.slug);
    return cached ? `Preview: ${cached.id}. ${cached.title}` : `Preview: ${this.slug}`;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const slug = (state as { slug?: unknown })?.slug;
    if (typeof slug === 'string' && slug.length > 0) {
      this.slug = slug;
      this.app.workspace.requestSaveLayout();  // tab-title refresh
      await this.renderForSlug(slug);
    }
    return super.setState(state, result);
  }

  getState(): { slug: string | null } { return { slug: this.slug }; }

  // ... renderForSlug, renderHeader, renderLoading, renderError, renderBody
  // ... Start/Open click handlers that call plugin.openProblem then setWindowTimeout(100, () => this.leaf.detach())
}
```

### Example 7: GitHub Actions CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run check:bundle-size
```

`package.json` adds `"check:bundle-size": "node scripts/check-bundle-size.mjs"`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `eslint-plugin-obsidianmd@0.1.x` ruleset (v1.0 baseline pre-bump path) | `0.3.0` adds `no-plugin-as-component`, `prefer-instanceof`, `vault/iterate`, `commands/no-command-in-command-id`, `commands/no-command-in-command-name`, plus deepens `no-forbidden-elements`, `no-global-this`, `regex-lookbehind` | 0.3.0 published 2026-05-12 | Phase 06 must bump-and-fix; v1.0 already pinned 0.2.9 so the gap is small |
| `MarkdownRenderer.renderMarkdown(...)` | `MarkdownRenderer.render(app, md, el, sourcePath, component)` (renderMarkdown is `@deprecated` per obsidian.d.ts:4000) | Obsidian 1.4+ | v1.0 already uses the new shape; preview follows |
| `workspace.activeLeaf` direct access | `workspace.getActiveViewOfType(MarkdownView)` / `getLeavesOfType(...)` | Obsidian 1.0+ | v1.0 already follows; preview follows |
| `setTimeout(...)` bare | `activeWindow.setTimeout(...)` via `src/shared/timers.setWindowTimeout` | Obsidian popout windows GA | v1.0 already wraps; preview reuses |
| `du -b main.js` for bundle size | `node -e "fs.statSync(...)"` shim | macOS portability requirement | New in Phase 06 |

**Deprecated/outdated:**

- `MarkdownRenderer.renderMarkdown(...)` — `@deprecated`; never use.
- `WorkspaceLeaf.getRoot()` (still valid but less expressive than `workspace.getLeaf('tab')`).
- 0.2.x of `eslint-plugin-obsidianmd` — superseded by 0.3.0.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 0.3.0 → 0.2.9 gap will surface ≤ 30 violations against the existing v1.0 codebase. | §3 (Resolved Open Questions) | Plan 06.01 grows by one task to fix the cascade. Low impact — bounded by v1.0's existing module count. |
| A2 | The cache-miss preview body fetch can reuse `plugin.client.getProblemDetail(slug)` directly without ANY new persistence path (i.e., the existing `LeetCodeClient` already persists into `SettingsStore.problemDetails` on success). | §6 Resolution | If `LeetCodeClient.getProblemDetail` does NOT auto-persist, the preview view needs a manual `settings.setProblemDetail(slug, …)` call. Verifier should grep `LeetCodeClient.getProblemDetail` for a `setProblemDetail` call. **Mitigation:** the fallback `ephemeralDetailFromFetch` helper in Example 3 covers the in-memory render path even if persistence is absent. |
| A3 | All 7 existing v1.0 command IDs already pass 0.3.0 lint rules. | §3 Audit | The audit shows literals — recheck against the rules at Plan 06.01 implementation. Re-audit cost is < 30 minutes. |
| A4 | Right-click PREVIEW-01 handler is a 5-line addition that does NOT need its own plan. | Plan boundary recommendation | If the menu requires more than the contextmenu listener (e.g., long-press on touch devices, keyboard menu trigger), planner promotes to a separate plan. v1.1 is desktop-only per project constraints — touch is not required. |

**Status:** All four assumptions are LOW risk; none block planning. Verifier should re-confirm A2 before Plan 06.03 lands.

---

## Open Questions — Resolutions

CONTEXT.md `<open_questions_for_planning>` resolved here. Each receives a recommended answer with verification source. Planner takes these as defaults; deviations require explicit justification.

### 1. `PluginData` field name + default

**Recommendation:** `previewClickBehavior: 'preview' | 'open'`, default `'preview'`. [VERIFIED: SettingsStore.ts naming convention is camelCase property names with type-narrowed string unions or primitives — e.g. `defaultLanguage`, `problemsFolder`, `legacyBaseNoticeShown`, `autoBacklinksEnabled`, `techniquesFolderOverride`. The proposed name `previewClickBehavior` matches this pattern (camelCase, descriptive, no leading verb).]

### 2. `leetcode-preview` view type collision

**Resolution:** No collision. Only `'leetcode-browser'` is registered in v1.0. [VERIFIED: `grep -rn "leetcode-preview\|VIEW_TYPE" src/`]

### 3. Right-click context menu — own plan or fold-in?

**Recommendation:** **Fold into Plan 06.03 (`ProblemPreviewView`).** Justification: the handler is a 5-line `contextmenu` listener using the Obsidian `Menu` API (Pattern 4 above). Splitting it out adds a plan-boundary tax for trivial code. Acceptance grep gates the same surface area regardless. [Resolves: CONTEXT.md `<open_questions_for_planning>` item 3]

### 4. ESLint version compatibility with `eslint-plugin-obsidianmd@^0.3.0`

**Resolution:** Current devDep pins satisfy 0.3.0 peer ranges with no co-bump:

| Peer dep declared by 0.3.0 | Range | Currently pinned | Satisfies? |
|----------------------------|-------|------------------|------------|
| `@eslint/js` | `^9.30.1` | `9.30.1` | ✓ |
| `@eslint/json` | `0.14.0` | (transitive — verify after install) | likely ✓ |
| `eslint` | `>=9.0.0` | (transitive via `@eslint/js@9.30.1` and `typescript-eslint@8.35.1`) | ✓ |
| `obsidian` | `1.8.7` | `latest` (1.12.3) | "informational" peer — works |
| `typescript-eslint` | `^8.35.1` | `8.35.1` | ✓ |

Action: bump only `eslint-plugin-obsidianmd` to `^0.3.0`. [VERIFIED: `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies` 2026-05-15]

### 5. Platform-portable bundle-size check

**Recommendation:** Node shim. See Pitfall 6 above for the exact 12-line script. [Resolves: CONTEXT.md `<open_questions_for_planning>` item 5]

### 6. Cache-miss preview render contract

**Recommendation:** **Render the loading state synchronously, fire `plugin.client.getProblemDetail(slug)` in parallel, render on resolve, surface error state on reject.** Do NOT pre-fetch on row-hover (UI-SPEC.md doesn't ask for it; LC rate budget tightens unnecessarily).

Verification of cache-write semantics:
- The existing `NoteWriter.openProblem` calls `client.getProblemDetail(slug)`, then explicitly `await this.settings.setProblemDetail(slug, newEntry)` (`src/notes/NoteWriter.ts:280-281`). The `LeetCodeClient.getProblemDetail` itself does NOT auto-persist — `NoteWriter` is the persister.
- **Implication:** Preview should ALSO persist on cache miss (or use `ephemeralDetailFromFetch` for render-only and let the next "Start Problem" path do the persisting via NoteWriter).
- **Recommendation:** Persist on cache miss. The cost is 1 disk write on first preview (negligible); the benefit is that subsequent previews of the same slug are instant. Code:
  ```ts
  const fetched = await this.plugin.client.getProblemDetail(slug);
  if (fetched && fetched.content) {
    const entry = toDetailCacheEntry(fetched);  // reuse NoteWriter.toDetailCacheEntry
    await this.plugin.settings.setProblemDetail(slug, entry);
  }
  ```
  This requires `toDetailCacheEntry` to be EXPORTED from `src/notes/NoteWriter.ts` (currently a non-exported function at line 527). Plan 06.03 adds the `export` keyword OR moves the helper into a new `src/notes/detailCacheHelpers.ts` for cleanly-scoped reuse.

[Resolves: CONTEXT.md `<open_questions_for_planning>` item 6]

### 7. Existing `addCommand` audit for 0.3.0 rules

**Audit (verified by `grep -n "addCommand\|registerView" src/`):**

| Site | id | name | 0.3.0 rule violations |
|------|----|----|------------------------|
| `src/main.ts:239` | `'open-problem-browser'` | `'Open problem browser'` | none — already clean |
| `src/main.ts:253` | `'refresh-current-problem'` | `'Refresh current problem'` | none |
| `src/main.ts:293` | `'submit'` | `'Submit'` | none |
| `src/main.ts:311` | `'reset-code'` | `'Reset code'` | none |
| `src/main.ts:330` | `'view-past-submissions'` | `'View past submissions'` | none |
| `src/main.ts:348` | `'cancel-submission'` | `'Cancel running submission'` | none |
| `src/solve/runCommandRegistration.ts:45` | `'run'` | `'Run'` | none |

**Verdict:** All v1.0 command IDs already comply with `commands/no-plugin-id-in-command-id`, `commands/no-command-in-command-id`, `commands/no-command-in-command-name`, `commands/no-default-hotkeys` (no `hotkeys` field anywhere). The lint bump to 0.3.0 will pass on commands. [VERIFIED: `grep` 2026-05-15]

The new Phase 06 command (`open-in-preview`) follows the same convention: bare ID, sentence-case name, no `hotkeys` field.

### 8. Lucide icon name for preview tab

**Recommendation:** `'eye'`. Fallback: `'book-open'`. [VERIFIED: `setIcon` accepts `IconName`; `IconName = string` (i.e., any string passes the type-check; unknown icon names silently no-op). The Lucide icon set bundled with Obsidian 1.12.x DOES include `eye` (per UI-SPEC.md research note). If a future Obsidian build drops `eye`, swap to `book-open` — UI-SPEC.md already lists it as fallback.]

### 9. `WorkspaceLeaf.openIfExtant`

**Resolution: does NOT exist.** Use `getLeavesOfType + setViewState` per Pattern 2. [VERIFIED: grep returned no match in obsidian.d.ts]

### 10. `MarkdownRenderer.render` exact signature

**Verified:** `static render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>` ([VERIFIED: obsidian.d.ts:4013])

For preview: pass `''` for `sourcePath` (no real file backs the preview; wikilinks resolve against the global vault) and `this` (the view, which IS a Component) for `component`. The existing v1.0 SubmissionDetailModal call passes `this.deps.file.path` (a real file) and `this.component` (an explicit Component child). The preview's call uses the view as Component directly because it has no file context.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, esbuild, lint, vitest, bundle-size script | ✓ | (any modern; CI pins to 20) | — |
| npm | Install + scripts | ✓ | bundled with Node | — |
| esbuild | `npm run build` | ✓ | 0.25.5 (already a devDep) | — |
| TypeScript | `tsc -noEmit -skipLibCheck` (already in `npm run build`) | ✓ | 5.8.3 (already a devDep) | — |
| vitest | `npm test` | ✓ | 4.1.5 (already a devDep) | — |
| eslint-plugin-obsidianmd | `npm run lint` | ✓ → bump | 0.2.9 → ^0.3.0 | — |
| GitHub Actions runner | `.github/workflows/ci.yml` | ✓ (any actions-supported runner: `ubuntu-latest` recommended for speed) | — | none — Phase 06 explicitly opts into CI gating |
| `obsidian` runtime (Electron host) | Plugin runtime; preview view loads here | ✓ | provided by Obsidian (>= 1.12.x verified by `node_modules/obsidian/obsidian.d.ts`) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

`workflow.nyquist_validation: true` in `.planning/config.json` — validation section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` (already pinned) |
| Config file | `vitest.config.ts` (env: `happy-dom`; setup: `tests/helpers/setup.ts`; obsidian module aliased to `tests/helpers/obsidian-stub.ts`) |
| Quick run command | `npm test -- <pattern>` (e.g., `npm test -- preview` to run only Phase 06 preview tests) |
| Full suite command | `npm test` |

Existing infrastructure: `tests/browse/`, `tests/notes/`, `tests/settings/`, `tests/integration/` — all v1.0 patterns. Phase 06 adds `tests/preview/` and `tests/foundations/`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FOUND-01 | `npm run lint` exits 0 against `eslint-plugin-obsidianmd@^0.3.0` | smoke (npm script) | `npm run lint` | ❌ Wave 0 — script exists; behavior verified at Plan 06.01 |
| FOUND-01 | All new 0.3.0 rules are enabled in `eslint.config.mts` (still uses `obsidianmd.configs.recommended` so this is automatic) | unit (config introspection) | `npm test -- foundations.eslint-config` | ❌ Wave 0 |
| FOUND-02 | `scripts/check-bundle-size.mjs` exits 1 when stub `main.js` > 500_000 bytes | unit | `npm test -- foundations.check-bundle-size` | ❌ Wave 0 |
| FOUND-02 | The same script exits 0 with a warning when 400_000 < size ≤ 500_000 | unit | (same as above) | ❌ Wave 0 |
| FOUND-02 | CI workflow YAML is well-formed and runs the four expected steps | unit (parse YAML, assert step list) | `npm test -- foundations.ci-workflow` | ❌ Wave 0 |
| FOUND-03 | New `open-in-preview` command id has no plugin-id prefix and no "command" word | unit | `npm test -- preview.command-ids` | ❌ Wave 0 |
| PREVIEW-01 | Right-click on a row dispatches `routeProblemClick(slug, status, 'preview', {force:true})` | unit (vitest + happy-dom) | `npm test -- preview.right-click` | ❌ Wave 0 |
| PREVIEW-01 | Right-click does NOT create a `.md` file (smoke / regression hardening) | manual UAT | n/a (manual reload-vault smoke) | ❌ |
| PREVIEW-02 | Default click previews; setting `previewClickBehavior='open'` flips back to v1.0 | unit | `npm test -- preview.click-behavior` | ❌ Wave 0 |
| PREVIEW-02 | Shift-click always opens (regardless of setting) | unit | (same as above) | ❌ Wave 0 |
| PREVIEW-02 | Settings dropdown round-trips through `data.json` (load + save + reload) | unit | `npm test -- settings-store-preview` | ❌ Wave 0 |
| PREVIEW-03 | Preview header renders id+title heading, difficulty pill, topic chips | unit (happy-dom DOM assert) | `npm test -- preview.header-render` | ❌ Wave 0 |
| PREVIEW-04 | "Start Problem" button calls `plugin.openProblem(slug, status)` then schedules detach | unit | `npm test -- preview.start-button` | ❌ Wave 0 |
| PREVIEW-04 | Header shows "Start Problem" iff vault has no `LeetCode/{id}-{slug}.md` | unit | `npm test -- preview.existing-note-detection` | ❌ Wave 0 |
| PREVIEW-05 | Header shows "Open Problem" iff note exists; clicking it calls `plugin.openProblem(...)` | unit | (same as above) | ❌ Wave 0 |
| Tab reuse | Two consecutive previews use the SAME leaf (no duplicate tab) | unit | `npm test -- preview.tab-reuse` | ❌ Wave 0 |
| Detach lifecycle | After Start completes, leaf detaches within ~100 ms | unit (mock setWindowTimeout) | `npm test -- preview.detach` | ❌ Wave 0 |
| Regression hardening | `grep "vault\.create\\|openLinkText" src/preview/` returns zero | unit (filesystem grep test) | `npm test -- preview.regression-grep` | ❌ Wave 0 |
| Regression hardening | `grep "MarkdownRenderer\\.render\\(" src/preview/` matches `, this)` (passes view, not plugin) | unit | (same as above) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- <area>` (run the area-scoped tests; full lint also fast)
- **Per wave merge:** `npm test && npm run lint && npm run build`
- **Phase gate:** Full suite green (`npm test && npm run lint && npm run build && npm run check:bundle-size`) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/foundations/eslint-config.test.ts` — covers FOUND-01
- [ ] `tests/foundations/check-bundle-size.test.ts` — covers FOUND-02
- [ ] `tests/foundations/ci-workflow.test.ts` — covers FOUND-02 (workflow shape)
- [ ] `tests/preview/right-click.test.ts` — covers PREVIEW-01
- [ ] `tests/preview/click-behavior.test.ts` — covers PREVIEW-02
- [ ] `tests/preview/header-render.test.ts` — covers PREVIEW-03
- [ ] `tests/preview/start-button.test.ts` + `existing-note-detection.test.ts` — cover PREVIEW-04 + PREVIEW-05
- [ ] `tests/preview/tab-reuse.test.ts` — covers tab-reuse contract
- [ ] `tests/preview/detach.test.ts` — covers detach lifecycle
- [ ] `tests/preview/regression-grep.test.ts` — covers no-vault-create regression hardening
- [ ] `tests/preview/command-ids.test.ts` — covers FOUND-03 for new commands
- [ ] `tests/settings/preview-click-behavior.test.ts` — covers SettingsStore field round-trip
- [ ] `tests/preview/router.test.ts` — covers `routeProblemClick` decision flow (intent + force + setting matrix)

Framework install / config — none required (vitest + happy-dom already in place).

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives apply to Phase 06 — planner MUST verify compliance:

- **`'leetcode.*'` userEvent annotation rule:** ANY plugin-internal CM6 dispatch into a locked range MUST set `userEvent: 'leetcode.<verb>'`. Phase 06's preview view does NOT dispatch any CM6 transactions (preview renders via `MarkdownRenderer.render` into a plain `HTMLElement`, never an Editor). **Verdict: not triggered. Acceptance grep:** `grep -n "cm.dispatch" src/preview/` returns zero. [CITED: CLAUDE.md §Conventions]
- **`app.vault.process` discipline:** Vault-layer body writes must use `app.vault.process(...)`. Phase 06's preview NEVER writes to the vault — preview is read-only. Start/Open delegates to `NoteWriter.openProblem` which already follows the discipline. **Verdict: not triggered.** [CITED: CLAUDE.md §Conventions]
- **`requestUrl` discipline:** All HTTP to leetcode.com via `requestUrl` (already wrapped by `throttledRequestUrl`). Phase 06's cache-miss preview path uses `plugin.client.getProblemDetail(slug)` which is the existing `LeetCodeClient` chain — no new HTTP. **Verdict: compliant.** [CITED: CLAUDE.md §Constraints]
- **Plugin-store hard rules:** No telemetry; no `eval` / `new Function`; no `innerHTML` for LC content; no auto-default-hotkeys; no `obsidian` in plugin id; no global `app`. **Verdict: all six already enforced by v1.0 + `eslint-plugin-obsidianmd@^0.3.0`. Plan 06.01 audit confirms.** [CITED: CLAUDE.md §Project + plugin-store guidelines]
- **`ItemView` registration cleanup:** Custom views unload via `onClose()`. Preview's `onClose` cancels any in-flight detail fetch (planner: connect to AbortController if/when LeetCodeClient supports it; otherwise rely on the view detach + closure capture).

---

## Sources

### Primary (HIGH confidence)

- `node_modules/obsidian/obsidian.d.ts` (1.12.3) — verified `MarkdownRenderer.render` signature (line 4013), `ItemView extends View` (line 3456), `WorkspaceLeaf.setViewState` (line 7306), `Workspace.getLeavesOfType` (line 7050), `Workspace.getLeaf` (line 6912/6927), absence of `WorkspaceLeaf.openIfExtant`, `setIcon` / `IconName = string` declarations
- `node_modules/eslint-plugin-obsidianmd/dist/lib/rules/` (0.2.9) — directly inspected installed rule list to confirm command rule names + which rules are NEW in 0.3.0
- npm registry — `npm view eslint-plugin-obsidianmd@0.3.0 peerDependencies` (verified 2026-05-15) returned `{ '@eslint/js': '^9.30.1', '@eslint/json': '0.14.0', eslint: '>=9.0.0', obsidian: '1.8.7', 'typescript-eslint': '^8.35.1' }`
- npm registry — `npm view eslint-plugin-obsidianmd version` → `0.3.0` (published 2026-05-12)
- `src/main.ts` (1170 lines, hand-inspected) — onload sequence, all 7 command IDs, `LeetCodePlugin.openProblem` entry signature
- `src/browse/ProblemBrowserView.ts` (611 lines) — row-click handler at line 605-609, `pickRandom` at 471-484
- `src/notes/NoteWriter.ts` — `openProblem` orchestrator, `toDetailCacheEntry` helper, cache-write semantics
- `src/notes/NoteTemplate.ts` — `buildNotePath` exact signature
- `src/settings/SettingsStore.ts` — `PluginData` shape, getter/setter conventions, shape-guard precedent
- `src/settings/SettingsTab.ts` — section ordering precedent (Authentication / Manual cookie / Notes / Knowledge graph)
- `src/shared/timers.ts` — `setWindowTimeout` / `clearWindowTimeout` API
- `src/graph/SubmissionDetailModal.ts` — verified live `MarkdownRenderer.render` call (line 136-143) for the existing v1.0 pattern reference
- `src/main/sectionLockExtension.ts` — confirmed `'leetcode.*'` userEvent contract (lines 311-371)
- `package.json` — verified pinned versions
- `esbuild.config.mjs` — verified bundle entry + externals (electron stays external)
- `eslint.config.mts` — verified flat-config shape using `obsidianmd.configs.recommended`
- `.planning/research/SUMMARY.md` §7, §6.1, §6.5, §6.8 — Phase 06 brief and locked decisions
- `.planning/research/ARCHITECTURE.md` §2.1, §2.2, §3.1, §6 — router refactor, NEW vs MODIFIED matrix, Preview deep dive, build order
- `.planning/research/FEATURES.md` §A — Preview feature landscape and anti-features
- `.planning/research/PITFALLS.md` Pitfalls 14, 15, 16, 18 — preview / lint / README / bundle gate
- `.planning/research/STACK.md` — confirmed no new runtime deps
- `.planning/phases/06-foundations-preview-mode/06-CONTEXT.md` — locked decisions consumed verbatim above
- `.planning/phases/06-foundations-preview-mode/06-UI-SPEC.md` — UI design contract, acceptance grep gates, copywriting

### Secondary (MEDIUM confidence)

- `eslint-plugin-obsidianmd@0.3.0` README (referenced from PITFALLS.md research) — full rule list including newly-added rules

### Tertiary (LOW confidence)

- None — every claim in this research has either a direct file citation, a `grep` verification, or a `npm view` query.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every dep verified against `package.json` + `node_modules/`; npm registry queried 2026-05-15
- Architecture: HIGH — every NEW/MODIFIED file path is justified by an existing v1.0 source line + a CONTEXT.md decision
- Pitfalls: HIGH — drawn from `.planning/research/PITFALLS.md` and re-grounded in current code state via `grep`
- Resolved open questions: HIGH for items 2, 4, 7, 9, 10 (verified by grep / npm); MEDIUM for items 1, 3, 6, 8 (recommendation grounded in code precedent but planner could deviate)

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days; `eslint-plugin-obsidianmd` minor bumps could ship within this window — re-verify if Phase 06 implementation slips past 2026-06-15)

---

## RESEARCH COMPLETE
