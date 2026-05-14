---
phase: 4
slug: knowledge-graph-wiring
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-05-09
---

# Phase 4 — UI Design Contract

> Visual and interaction contract for Phase 4: Knowledge Graph Wiring. Extends Phase 1 and Phase 3 UI-SPEC consistently. This is an Obsidian plugin — design system is Obsidian's native CSS variables so the plugin inherits every installed theme without modification.

**Scope covered by this contract:**
1. `SubmissionPickerModal` — list of past submissions for the active problem (AC + WA + TLE + MLE + CE + RE), verdict chip per row, runtime/memory/date/language metadata
2. `SubmissionDetailModal` — read-only viewer: syntax-highlighted code via `MarkdownRenderer.render`, metadata row, `Copy to ## Code` primary action, `Close` secondary
3. `ConfirmOverwriteModal` — sub-modal shown when `## Code` is non-empty before Copy-to-Code overwrites it
4. Inline error/empty/session-expired states inside `SubmissionPickerModal` (D-06 inline posture, NOT Notice)
5. `## Techniques` body shape — bulleted `[[TopicTag]]` wikilinks, one per LC topic tag; insertion after `## Notes`
6. Technique stub note frontmatter shape (`Techniques/{Name}.md`) — frontmatter-only, three fields
7. On-AC frontmatter field shapes as rendered in Obsidian's properties pane (`lc-solved-date` ISO-8601 local-tz, `lc-runtime-ms`/`lc-memory-mb` as numbers, `lc-language` slug, `lc-status: accepted`)
8. New Phase 4 Notice strings (minimal — D-06 prefers inline)
9. Icons for verdict chips, "Copy to code", "Close"
10. CSS class namespace — `.leetcode-submissions-picker` and `.leetcode-submissions-detail` (verdict chips reuse Phase 3's `.leetcode-verdict-*` color classes)

**Explicitly out of scope for Phase 4** (deferred, noted for Phase 5):
- Chevron/dropdown overlay widget on the `## Code` block (`< 2/2 >` LC-style navigator) — Phase 5 Polish, Reading Mode `MarkdownPostProcessor`
- Settings UI toggle for `autoBacklinksEnabled` — Phase 5 POLISH-01 (field + getter ship in Phase 4; visible control ships in Phase 5)
- Settings UI override for `Techniques/` folder location — rejected (D-15: derived from `problemsFolder`)
- Diff view in `SubmissionDetailModal` (vs current `## Code`) — Phase 5 Polish
- Filter chips on picker (Accepted-only, language-only) — Phase 5 Polish if demand emerges
- "Load more" pagination below the first 20 picker rows — Phase 5 Polish (Pitfall 8 mitigation)
- First-run prompt modal for auto-backlink opt-in — rejected (D-22: default on, graph view is the onboarding)
- Retroactive cleanup command ("Strip all technique sections") — Phase 5 optional

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Obsidian-native) |
| Preset | not applicable (Obsidian plugin — vanilla DOM via `createEl()`) |
| Component library | Obsidian API primitives (`Modal`, `Notice`, `setIcon`, `MarkdownRenderer`, `Component`) — no React, no Svelte |
| Styling approach | Class-scoped plain CSS in `styles.css` — extends existing `.leetcode-browser` / `.leetcode-settings` / `.leetcode-verdict` / `.leetcode-custom-test` namespaces with new `.leetcode-submissions-picker` and `.leetcode-submissions-detail` scopes |
| Token system | Obsidian CSS variables — **never hardcoded hex values**. Phase 4 introduces no new tokens; reuses `--text-success` / `--text-error` / `--color-orange` from Phase 3 for verdict chips |
| Icon library | Lucide (Obsidian's built-in) — referenced by string name via `setIcon(el, 'name')` |
| Font | Inherit `--font-interface` (list rows, metadata row, modal body) and `--font-monospace` (code rendered inside `MarkdownRenderer.render` inherits Obsidian's own code-block theme automatically) |
| DOM constructor | `createEl()` / `createDiv()` / `createSpan()` only — `innerHTML` is permanently forbidden. Code in `SubmissionDetailModal` rendered via `MarkdownRenderer.render(app, fenced, el, '', component)` which handles escaping |
| Markdown rendering | `MarkdownRenderer.render` (not deprecated `.renderMarkdown`) — current API [VERIFIED Research Pattern 5]; lifecycle via `Component` child attached with `modal.addChild(component)` |

**Rationale:** Phase 1 locked Obsidian-native design system; Phase 3 extended it with `.leetcode-verdict-*` chip classes; Phase 4 re-uses both. No new design primitives introduced — only new UX surfaces built from existing primitives.

---

## Spacing Scale

Inherits Phase 1 + Phase 3 scale. Phase 4 uses the same 4-point values with picker-specific row additions.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gap inside verdict chip, inline-badge padding, tab-like affordance spacing |
| sm | 8px | Modal inner body section gap, between verdict chip and row metadata, picker row internal horizontal padding |
| md | 12px | Modal inner-section padding, between modal title and first content block, picker row vertical padding |
| md2 | 16px | Modal content-area padding (matches `.modal-content` default), between metadata row and code block |
| lg | 24px | Between distinct groups inside `SubmissionDetailModal` (metadata block vs code block vs footer) |
| xl | 32px | Reserved — not used in Phase 4 |

Exceptions:
- **Picker row min-height 44px** — taller than Phase 1's 32px browser row because each row carries four pieces of metadata (verdict chip + date + runtime/memory + language). 44px gives each piece breathing room and matches common list-row touch target size.
- **Verdict chip height 20px** — inline chip inside a row; matches Phase 3 `.leetcode-verdict` chip class rendering (reused here).
- **`SubmissionPickerModal` body min-height 320px** — enough for ~7 rows visible by default before scrolling; matches the LC-web submission panel footprint the author referenced.
- **`SubmissionPickerModal` body max-height `60vh`** — prevents overly tall modals on large displays; scrollbar activates beyond this.
- **Code block inside `SubmissionDetailModal` max-height `50vh`** with vertical scroll — prevents runaway modal height on long submissions; keeps footer buttons accessible.
- **`ConfirmOverwriteModal` body min-height 80px** — short confirm dialog, no extra padding needed.

---

## Typography

Inherits Phase 1 + Phase 3 type scale. Phase 4 introduces no new roles — the code block uses Obsidian's own `MarkdownRenderer` output and inherits the theme's code-block typography automatically.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 14px (`var(--font-ui-small)`) | 400 (regular) | 1.5 | Picker row title (verdict chip label + problem name if ever multi-problem), metadata row in `SubmissionDetailModal` (`Runtime: 12 ms · Memory: 14.2 MB · python3 · 2026-05-09T14:32:01-07:00`), confirm-overwrite body copy |
| Label | 12px (`var(--font-ui-smaller)`) | 600 (semibold) | 1.4 | Picker row secondary text (date, language chip), verdict chip label ("AC", "WA", "TLE", "MLE", "CE", "RE"), empty-state heading inside picker, inline error heading |
| Heading | 16px (`var(--font-ui-medium)`) | 600 (semibold) | 1.3 | Modal titles set via `titleEl.setText(...)` — Obsidian renders its modal title at this size; plugin does not override |
| Monospace | inherits Obsidian code-block defaults | inherits | inherits | Code rendered via `MarkdownRenderer.render` — Obsidian handles sizing, CM6 highlighting, scrollbars. Plugin does NOT override. |

Two declared weights: **400 (regular)** and **600 (semibold)**. Carries forward from Phase 1 and Phase 3.

**Wikilink/markdown typography (rendered inside Obsidian's own vault):** `## Techniques` bullet list is plain markdown — Obsidian's theme/reading-mode CSS controls list-item spacing, bullet color, wikilink color. Plugin does not specify because markdown IS the theme.

---

## Color

Inherits Phase 1 60/30/10 contract and Phase 3 verdict semantic colors. Phase 4 introduces no new colors. All values are Obsidian CSS variables — no raw hex.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--background-primary)` | Modal body background (inherited from `.modal-content`), picker list surface |
| Secondary (30%) | `var(--background-secondary)` | Picker row hover state background, metadata row subtle background inside `SubmissionDetailModal`, code block surround |
| Accent (10%) | `var(--interactive-accent)` | `Copy to ## Code` primary button in `SubmissionDetailModal` (`.mod-cta`); `Yes, overwrite` primary button in `ConfirmOverwriteModal` |
| Accent text | `var(--text-on-accent)` | Text inside the two accent buttons above |
| Text normal | `var(--text-normal)` | Picker row primary metadata (date, runtime/memory), modal body copy |
| Text muted | `var(--text-muted)` | Picker row secondary metadata (language chip default state), inline empty-state body copy, inline error body copy |
| Success (AC chip) | `var(--text-success)` | AC verdict chip text + 12% background via `color-mix(in srgb, var(--text-success) 12%, transparent)` |
| Error (WA/TLE/MLE/RE chips) | `var(--text-error)` | WA/TLE/MLE/RE verdict chip text + 12% background via `color-mix` — **reuses Phase 3 `.leetcode-verdict-*` classes** |
| Warning (CE chip) | `var(--color-orange, var(--color-yellow))` | CE verdict chip text + 12% background — reuses Phase 3 |
| Destructive | `var(--text-error)` | No destructive button in Phase 4 (see Copywriting § Destructive). Reserved for potential future Phase 5 "Strip technique sections" command. |

**Accent (`var(--interactive-accent)`) is reserved EXCLUSIVELY for (extending Phase 1 + Phase 3 list):**
1. `Log in via embedded window` primary button (Phase 1)
2. Active filter chip in problem browser (Phase 1)
3. Run button in `CustomTestModal` (Phase 3)
4. Pending-state progress indicator fill (Phase 3)
5. **`Copy to ## Code` primary button in `SubmissionDetailModal`** (Phase 4)
6. **`Yes, overwrite` primary button in `ConfirmOverwriteModal`** (Phase 4)

**NOT accent:** `Close` button in picker/detail modal, `Cancel` button in confirm-overwrite, picker row hover (uses `--background-secondary` only), picker row click-to-select visual (no special treatment — click opens detail modal immediately, no pre-selection state), verdict chips (semantic colors only — never accent).

**Color-not-alone policy (carried from Phase 3):** verdict chips always pair the semantic color with a short uppercase label (`AC`, `WA`, `TLE`, `MLE`, `CE`, `RE`). The label carries meaning; color amplifies. Screen readers read the label; color-blind users see the label.

---

## Copywriting Contract

Extends Phase 1 + Phase 3 contract. All rules carry forward:
- Sentence case everywhere (enforced by `eslint-plugin-obsidianmd`)
- `Notice` messages: full sentence ending with a period
- Modal titles: no `LeetCode:` plugin prefix — command-palette context establishes brand
- Button labels: verb + noun, no trailing period
- No title case in headings or labels

### Modal titles

Format conventions:
- `SubmissionPickerModal` title is static (no problem-title interpolation — the command-palette already scoped to the active note)
- `SubmissionDetailModal` title follows CONTEXT D-04 convention: `{Verdict name} · {Problem title}` (middle-dot `·` U+00B7 with single space each side — aligns with CONTEXT D-04's locked form; distinct from Phase 3's em-dash verdict-modal title)
- `ConfirmOverwriteModal` title is a short imperative

| Modal | Title |
|-------|-------|
| `SubmissionPickerModal` | `Past submissions` |
| `SubmissionDetailModal` (AC) | `Accepted · {problem title}` |
| `SubmissionDetailModal` (WA) | `Wrong Answer · {problem title}` |
| `SubmissionDetailModal` (TLE) | `Time Limit Exceeded · {problem title}` |
| `SubmissionDetailModal` (MLE) | `Memory Limit Exceeded · {problem title}` |
| `SubmissionDetailModal` (CE) | `Compile Error · {problem title}` |
| `SubmissionDetailModal` (RE) | `Runtime Error · {problem title}` |
| `ConfirmOverwriteModal` | `Overwrite current code?` |

### `SubmissionPickerModal` — row shape

Each row contains:
- **Verdict chip** — 20px height, 12px label font, uppercase abbreviation (`AC` / `WA` / `TLE` / `MLE` / `CE` / `RE`), semantic color
- **Date** — primary display: ISO-8601 local-tz rendered as `YYYY-MM-DD HH:MM` for readability (seconds dropped; full ISO available as tooltip via `aria-label`). Example: `2026-05-09 14:32`
- **Runtime · Memory** — middle-dot separator (`·` U+00B7) with single space each side, same pattern as Phase 3. Example: `12 ms · 14.2 MB`. When LC omits a value, render `—` (U+2014 em dash): `— · 14.2 MB`
- **Language chip** — right-aligned, small chip containing LC's `langSlug` verbatim (e.g. `python3`, `cpp`, `java`). Uses `.leetcode-submissions-picker__lang` style: 18px height, 11px semibold, `--background-secondary` bg, `--text-muted` text.

Row layout (left to right, gap 8px):
```
[AC]  2026-05-09 14:32   12 ms · 14.2 MB                          [python3]
^chip ^date              ^runtime-memory                          ^lang chip
```

### `SubmissionPickerModal` — empty / error states (D-06)

All three states render **INSIDE THE MODAL BODY** — never as a `Notice`. Rationale (D-06): user explicitly invoked the picker; surfacing failure in the modal keeps context.

| State | Heading (Label size) | Body (Body size, muted) | Action |
|-------|---------------------|-------------------------|--------|
| Empty — no submissions yet | `No submissions yet.` | `Submit a solution to LeetCode to see it here.` | *(no action — Close via `Escape` or `×`)* |
| Empty — filtered out (reserved for Phase 5 filter) | *(N/A in Phase 4)* | *(N/A)* | *(N/A)* |
| Network/4xx/5xx failure | `Couldn't load submissions.` | `Check your connection and try again.` | `[Retry]` button, 28px height, neutral (not accent) |
| Session expired (D-06) | *(no inline render — closes modal)* | *(N/A)* | Fires locked Phase 1 Notice `LeetCode session expired. Log in again.` THEN closes modal |

**Special case:** session expiry closes the picker entirely (matches Phase 3 session-expiry chrome) rather than rendering inline. The user needs to re-auth; keeping the picker open under a logged-out state is confusing. Other failures (no network, 500, malformed payload) render inline because they're retriable without leaving the picker.

### `SubmissionPickerModal` — loading state

First-open of picker before list fetch resolves:

| Element | Copy |
|---------|------|
| Centered body | `Loading submissions…` (unicode ellipsis) |
| Icon | Lucide `loader`, 24px, `var(--interactive-accent)`, same CSS `lc-spin` animation from Phase 3 |
| Footer | empty |

Loading state replaces itself with the row list (success), empty-state block (empty), or inline error (failure). No "Cancel" button — the fetch typically completes in <1s; user can close the modal via `Escape` to abort.

### `SubmissionDetailModal` — metadata row

Single line below the title, 14px body, muted secondary style. Format:

```
Runtime: {runtime} · Memory: {memory} · {langSlug} · {iso-local-tz}
```

Example: `Runtime: 12 ms · Memory: 14.2 MB · python3 · 2026-05-09T14:32:01-07:00`

If `runtime` or `memory` is absent, render `—`: `Runtime: — · Memory: — · python3 · 2026-05-09T14:32:01-07:00`.

The ISO-8601 local-tz date renders in full (not abbreviated like the picker row) so the user can copy the exact submission timestamp if they want to reference it in notes.

### `SubmissionDetailModal` — code block

Rendered via `MarkdownRenderer.render(app, '```' + langSlug + '\n' + code + '\n```', codeBlockEl, '', component)`. Obsidian's own CM6 pipeline handles:
- Syntax highlighting per language
- Line wrapping / horizontal scroll per theme defaults
- Theme-consistent colors for keywords, strings, comments

Plugin wraps the render target in `.leetcode-submissions-detail__code` which applies `max-height: 50vh; overflow-y: auto` to prevent runaway modal height.

### `SubmissionDetailModal` — action buttons

Footer, right-aligned with 8px gap:

| Button | Label | Style | Position |
|--------|-------|-------|----------|
| Primary | `Copy to ## Code` | `.mod-cta` (accent) | left of the button group |
| Secondary | `Close` | neutral | right of the button group |

`Close` is the default-focus element on modal open (matches Phase 3 resolved-verdict convention: destructive-if-accidental actions should never be the default focus).

**Icon on `Copy to ## Code`:** Lucide `copy`, 14px, leading the label with 4px gap. Button label reads (icon)(space)`Copy to ## Code`.

### `ConfirmOverwriteModal` — body copy

Sub-modal opened synchronously when `Copy to ## Code` is clicked AND the current `## Code` fenced block is non-empty. (If empty, skip this modal and overwrite silently — no confirmation needed for writing into an empty block.)

| Element | Copy |
|---------|------|
| Title | `Overwrite current code?` |
| Body primary | `Your current ## Code block will be replaced with this submission.` |
| Body secondary | `This can't be undone from the modal, but Obsidian's undo (Cmd/Ctrl+Z) works after closing.` |
| Primary action | `Yes, overwrite` |
| Secondary action | `Cancel` |

**Default focus: `Cancel`.** This is a destructive-overwrite confirmation — never default-focus the destructive primary; user must intentionally Tab + Enter or click.

**Icon on `Yes, overwrite`:** no icon (confirmation dialogs stay text-only to reduce visual noise before a destructive action).

### `Notice` strings — new Phase 4 additions

Phase 4 deliberately minimizes new Notices (D-06 prefers inline modal errors). Only two new candidates, both carry forward from Phase 1/3 (reused, not new copy):

| Trigger | Copy | Duration | Source |
|---------|------|----------|--------|
| Session expired during picker fetch (D-06) | `LeetCode session expired. Log in again.` | 8s | Phase 1 (reused) |
| Rate-limited during picker / detail fetch (CF-10) | `LeetCode rate-limited — slowing down.` | 6s | Phase 1 (reused) |

**NOT a Notice** (deliberately):
- Picker load failure → inline in modal (D-06)
- Picker empty state → inline in modal (D-06)
- On-AC graph write success → invisible-by-design. The Verdict Modal's AC state already confirms "Accepted." The graph write is a side-effect that the user discovers by glancing at the note properties pane or Graph View. No toast.
- Stub technique note creation success → silent (invisible). User sees the wikilink resolve in the note; that's the only feedback needed.
- Stub technique note creation failure (disk full, race) → silent debug log (CF-19, D-19). Obsidian will render the unresolved wikilink in a distinct theme-provided style; user-visible without a toast.
- Copy-to-Code write success → silent. The user sees the `## Code` block update in the note behind the modal; no toast.

**Rationale:** Phase 4's headline feature is silent-by-design graph enrichment. The plugin works in the background; the note and graph view are the UI. Notices would add noise to an otherwise seamless flow.

### Primary CTAs per surface

| Surface | Primary CTA | Verb + noun |
|---------|-------------|-------------|
| `SubmissionPickerModal` | *(row click — no button)* | Open (implicit: open submission) |
| `SubmissionPickerModal` error state | `Retry` | Retry (implicit: retry fetch) |
| `SubmissionDetailModal` | `Copy to ## Code` | Copy (code) to (section) |
| `ConfirmOverwriteModal` | `Yes, overwrite` | Yes (confirm), overwrite (the block) |

### Destructive actions — Phase 4

**Copy-to-Code over a non-empty `## Code` block (D-04):** destructive (replaces user's in-flight code). Gated by `ConfirmOverwriteModal`. Default focus on `Cancel`. Copy guard phrased as "Your current ## Code block will be replaced" — declarative not imperative. Obsidian's undo is mentioned as a safety net.

**On-AC frontmatter re-write (D-24):** NOT destructive in the UX sense — values are authored by LC itself (runtime, memory, date), never user-typed. Frontmatter fields like `lc-status`, `lc-runtime-ms`, `lc-memory-mb`, `lc-language` are plugin-owned (CF-12). User tags (`#revisit`, `#tricky`) are union-merged (never overwritten, Phase 2 D-10 pattern). No confirmation needed — re-write happens silently on every AC.

**On-AC `## Techniques` re-write (D-13):** NOT destructive — union-merge preserves user-added lines. No confirmation.

**Stub technique note creation/re-creation (D-18):** not destructive — creates new files only; never overwrites existing stubs. If a stub was deleted by the user and a new problem references it, Phase 4 re-creates it silently (D-18 divergence from Phase 2 BaseFile pattern — rationale: a dangling `[[Two Pointers]]` link is worse UX than a silent re-create).

**No retroactive opt-out cleanup in Phase 4 (D-26):** opt-out is go-forward only. Existing `## Techniques` sections are NOT auto-removed when the user flips `autoBacklinksEnabled` off. User can manually delete sections. Rationale: user-owned content — if the plugin auto-cleans, it might delete user-added interleaved lines (D-13 union-merge pairs with this invariant).

---

## Markdown-Rendered Surfaces (graph-native contracts)

Phase 4's primary UX is not a modal — it's the enriched markdown inside the problem note and the stub technique notes. These surfaces are Obsidian-native (no plugin styling); the "contract" is the shape of the emitted markdown.

### `## Techniques` body shape (D-12, D-14)

**Heading line:** `## Techniques` (exact string — uppercase T, single space, no trailing content on the heading line).

**Content:** bulleted list of `[[TopicTag]]` wikilinks, one per LC topic tag from `problemDetails[slug].topicTags`, in LC's natural ordering (no alphabetical sort — D-12). Each bullet uses the `-` bullet marker (canonical form; existing `*` or `+` bullets in user-edited sections are preserved as-is per D-13 merge semantics).

**Example (3 topic tags):**
```markdown
## Techniques

- [[Two Pointers]]
- [[Hash Table]]
- [[Sliding Window]]
```

**Blank line between heading and first bullet:** yes (standard Obsidian markdown formatting).

**Blank line before next H2:** yes (if another H2 follows, e.g. `## Custom Tests`).

**Insertion point in note body:** immediately after `## Notes` section; if `## Notes` is absent, at EOF (before any `## Custom Tests` section, which is always last). Concrete anchor order locked in `NoteTemplate.ts`:

```
## Problem
## Code
## Notes
## Techniques        ← Phase 4 inserts here
## Custom Tests      ← Phase 3 lazy (D-20), always last
```

**Union-merge behavior (D-13):** when the section already exists and the user has added their own lines inside it, the plugin's merge transform:
- Preserves every plugin-derived wikilink exactly once (no duplicates)
- Preserves user-added non-link lines in their original relative position
- Preserves user-added wikilinks to non-LC-topic targets (e.g. `[[My Custom Technique]]`)
- Appends plugin targets missing from the current section at the end of the link run
- No sentinel comments; no `<!-- user additions below -->` markers (rejected in D-13)

### Problem note frontmatter shape — on AC (D-10)

Visible in Obsidian's properties pane after an Accepted submission. New Phase 4 fields (all five always written together; values sourced from the terminal `SubmitCheckResponse`):

| Key | Type | Example value | Notes |
|-----|------|---------------|-------|
| `lc-status` | string | `accepted` | Controlled vocabulary from `LC_STATUS_VALUES`. GAP-2a non-downgrade guard ensures existing `accepted` never regresses. |
| `lc-solved-date` | string (ISO-8601 local-tz) | `2026-05-09T14:32:01-07:00` | Format `YYYY-MM-DDTHH:MM:SS±HH:MM`. DST-aware via native `Date.getTimezoneOffset()`. Updated on every AC (D-24: reflects most recent AC, not best-ever). |
| `lc-runtime-ms` | number | `12` | Parsed from LC's `"12 ms"` string via `parseInt`. Undefined on parse failure (still writes status + date). Updated on every AC even if worse (D-24). |
| `lc-memory-mb` | number | `14.2` | Parsed from LC's `"14.2 MB"` string via `parseFloat`. Undefined on parse failure. Updated on every AC. |
| `lc-language` | string (LC langSlug) | `python3` | LC's `langSlug` verbatim — never the display name. Sourced from `checkResponse.lang`. Updated on every AC (which means: switching language + submitting overwrites). |

**Tags array (union-merged, Phase 2 D-10 + Phase 4 D-11):**
```yaml
tags:
  - lc/easy                    # Phase 2 (difficulty, always)
  - lc/two-pointers            # Phase 4 (topic tag, added on first AC)
  - lc/hash-table              # Phase 4
  - revisit                    # user-added, preserved
```

**Example full frontmatter block after AC:**
```yaml
---
lc-id: 1
lc-slug: two-sum
lc-title: Two Sum
lc-difficulty: Easy
lc-url: https://leetcode.com/problems/two-sum/
lc-status: accepted
lc-solved-date: 2026-05-09T14:32:01-07:00
lc-runtime-ms: 12
lc-memory-mb: 14.2
lc-language: python3
aliases:
  - Two Sum
tags:
  - lc/easy
  - lc/two-pointers
  - lc/hash-table
  - revisit
---
```

**Edge case — problem without any topic tags (D-25):** frontmatter fires (lc-status + lc-solved-date + lc-runtime-ms + lc-memory-mb + lc-language + lc/difficulty tag all written). No `lc/{topic-slug}` tags added (nothing to add). `## Techniques` write and stub creation are skipped (nothing to link). Note renders normally.

### Stub technique note shape (D-15, D-16, D-17)

**Filename:** `{topicTag.name}.md` — LC's topic-tag name verbatim with special-char normalization:

| Character | Replacement | Example |
|-----------|-------------|---------|
| `/` | `-` | `A/B` → `A-B.md` |
| `\` | `-` | — |
| `:` | `-` | — |
| `*` | `-` | — |
| `?` | `-` | — |
| `"` | `-` | — |
| `<` | `-` | — |
| `>` | `-` | — |
| `|` | `-` | — |
| `+` | *(preserved)* | `C++` → `C++.md` (plus is filesystem-legal on Win/macOS/Linux) |

Spaces preserved: `Two Pointers.md`, `Hash Table.md`, `Depth-First Search.md`.

**Location:** `{problemsFolder}/Techniques/{Name}.md` — derived from the existing problems folder setting (Phase 1 D-10), no new settings field (D-15). Folder auto-created on first stub write.

**Body:** frontmatter-only, empty body below. Three fields exactly:

```yaml
---
lc-technique: two-pointers
aliases:
  - Two Pointers
tags:
  - lc/technique/two-pointers
---

```

(Trailing newline after closing `---` is required Obsidian convention so the cursor lands in the empty body when the user clicks in to type.)

**Field semantics:**
- `lc-technique` — machine-readable slug (LC's `topicTag.slug`, e.g. `two-pointers`). Queryable in Dataview/Bases (`WHERE lc-technique = "two-pointers"`).
- `aliases` — single-element array containing the display name verbatim. Makes both `[[Two Pointers]]` and `[[two-pointers]]` (via alias resolution) find this note.
- `tags` — single-element array `lc/technique/{slug}` using nested tag namespace. Mirrors the problem-note `lc/{slug}` namespace (NOT identical — technique notes use `lc/technique/` prefix so graph queries distinguish "notes ABOUT a technique" from "notes USING a technique").

**Never-overwrite (D-18):** if `{path}` exists (user-created, or previously stub-created with additions), plugin skips entirely. Existing stubs are user-owned after first creation — they may have added their own notes, examples, links; plugin never touches them again.

**Re-create after user deletion (D-18 divergence):** if the user deletes `Techniques/Two Pointers.md` and then a new AC references the "Two Pointers" topic tag, the plugin re-creates the stub (silent, no Notice). Rationale: a dangling `[[Two Pointers]]` wikilink in the problem note's `## Techniques` section is worse UX than silent re-creation.

---

## Layout — `SubmissionPickerModal`

```
┌──────────────────────────────────────────────────────────────────────┐
│  Past submissions                                                [×] │  ← titleEl (Obsidian native)
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [AC]   2026-05-09 14:32    72 ms · 16.8 MB          [python3]     │  ← row, 44px min-height
│  [WA]   2026-05-09 14:28   122 ms · 16.2 MB          [python3]     │
│  [AC]   2026-05-08 09:11    84 ms · 17.0 MB          [python3]     │
│  [TLE]  2026-05-07 22:05     — · —                   [java]        │
│  [CE]   2026-05-07 21:58     — · —                   [cpp]         │
│  [RE]   2026-05-07 21:40     — · —                   [rust]        │
│  [MLE]  2026-05-06 10:22    88 ms · 512 MB           [python3]     │
│  …                                                                  │
│  (scrollable — up to 20 rows fetched; no pagination in Phase 4)    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Row layout (left to right, 8px gap):**
- Verdict chip column: 48px min-width (fits `TLE`/`MLE` plus 8px chip padding); left-aligned; chip is `.leetcode-verdict-ac` / `.leetcode-verdict-wa` / `.leetcode-verdict-tle` / `.leetcode-verdict-mle` / `.leetcode-verdict-ce` / `.leetcode-verdict-re` (reused Phase 3 classes)
- Date column: ~120px; left-aligned; `var(--text-normal)` color; 14px body weight 400
- Runtime · Memory column: flex (takes remaining space); left-aligned; `var(--text-normal)` 14px
- Language chip column: right-aligned; 18px pill, 11px semibold, `--background-secondary` bg, `--text-muted` text

**Row hover:** background `var(--background-secondary)`, cursor pointer.

**Row click:** opens `SubmissionDetailModal` for that submission. Picker remains open BEHIND the detail modal (Obsidian's stacking default; detail modal closes back to picker on `Escape`).

**Picker close behavior:** `Escape` or `×` closes picker. If detail modal is open above, `Escape` closes detail first; second `Escape` closes picker.

### Empty state layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Past submissions                                                [×] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                    No submissions yet.                              │  ← heading-size label, centered
│                                                                      │
│      Submit a solution to LeetCode to see it here.                  │  ← body-size muted, centered
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Error state layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Past submissions                                                [×] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                 Couldn't load submissions.                           │  ← heading-size label, centered
│                                                                      │
│         Check your connection and try again.                         │  ← body-size muted, centered
│                                                                      │
│                        [ Retry ]                                     │  ← 28px button, neutral (not accent)
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Loading state layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Past submissions                                                [×] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                  [spinning loader icon, 24px]                        │  ← --interactive-accent, centered
│                                                                      │
│                   Loading submissions…                               │  ← 14px body, centered
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Layout — `SubmissionDetailModal`

```
┌──────────────────────────────────────────────────────────────────────┐
│  Accepted · Two Sum                                              [×] │  ← titleEl
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Runtime: 12 ms · Memory: 14.2 MB · python3 · 2026-05-09T14:32:01-07:00  ← metadata row, 14px muted
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ class Solution:                                                │ │
│  │     def twoSum(self, nums: List[int], target: int) -> …       │ │  ← rendered via MarkdownRenderer.render
│  │         seen = {}                                              │ │     Obsidian CM6 highlights the code
│  │         for i, n in enumerate(nums):                           │ │     max-height 50vh, overflow-y auto
│  │             if target - n in seen:                             │ │
│  │                 return [seen[target - n], i]                   │ │
│  │             seen[n] = i                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                            [Copy to ## Code]    [Close]             │  ← footer, right-aligned, 8px gap
└──────────────────────────────────────────────────────────────────────┘
```

**Title verdict mapping:** same `classifyStatus` mapping as Phase 3 — `Accepted` / `Wrong Answer` / `Time Limit Exceeded` / `Memory Limit Exceeded` / `Compile Error` / `Runtime Error`. For unknown status codes in historical submissions: title falls back to `Submission` (no problem-title interpolation if unknown — keeps chrome defensive).

**Metadata row values:** drawn from the `SubmissionDetail` response. When LC omits runtime or memory for a failed verdict: render `—` (em dash). The `langSlug` and `iso-local-tz` submitted-at are always present.

**Code block:** rendered via `MarkdownRenderer.render` with the fenced language = `langSlug` exactly. If `langSlug` isn't a language Obsidian's CM6 highlighter recognizes, Obsidian falls back to plain-text rendering (acceptable — text is still readable).

**Footer buttons:** primary `Copy to ## Code` (accent) on the left; secondary `Close` (neutral) on the right. 8px gap. Right-aligned group. Default focus: `Close`.

---

## Layout — `ConfirmOverwriteModal`

```
┌──────────────────────────────────────────────────────┐
│  Overwrite current code?                         [×] │  ← titleEl
├──────────────────────────────────────────────────────┤
│                                                      │
│  Your current ## Code block will be replaced with   │  ← 14px body
│  this submission.                                    │
│                                                      │
│  This can't be undone from the modal, but Obsidian's ← 12px muted
│  undo (Cmd/Ctrl+Z) works after closing.             │
│                                                      │
├──────────────────────────────────────────────────────┤
│                         [Yes, overwrite]   [Cancel] │  ← footer, right-aligned
└──────────────────────────────────────────────────────┘
```

**Primary action:** `Yes, overwrite` with `.mod-cta` (accent). Small but deliberate UX friction — the label reads as a compound affirmation.

**Secondary action:** `Cancel` (neutral, default-focused).

**Close behavior:** `Escape` dismisses equivalent to `Cancel`. Click outside modal dismisses equivalent to `Cancel`. Both cases: no write happens, return to `SubmissionDetailModal`.

**On `Yes, overwrite` click:** close `ConfirmOverwriteModal` → close `SubmissionDetailModal` → execute `vault.process(file, rewriteCodeBlock(submittedCode, langSlug))` silently → return user to the problem note (which now shows the updated `## Code` block). No Notice — the updated code in the note is the feedback.

**Skip-confirmation condition:** if the current `## Code` fenced block is empty (whitespace-only or entirely absent), `Copy to ## Code` bypasses this modal and writes directly. Rationale: no destructive loss; confirmation would be annoying.

---

## Interaction Contracts

### `SubmissionPickerModal` — interactions

| Interaction | Contract |
|-------------|----------|
| Open (via `LeetCode: View past submissions` command) | Fetch submission list for active-note's `lc-slug` via `submissionHistoryClient.listForSlug()` through `throttledRequestUrl`. Open modal in loading state. Transition to list / empty / error on promise resolution |
| Click row | Open `SubmissionDetailModal` for that submission id. Picker stays open behind. Fetch detail via `submissionHistoryClient.detail(id)` through `throttledRequestUrl` (lazy — only on click, D-28 rejected hover prefetch) |
| Hover row | Background → `var(--background-secondary)`; cursor → pointer |
| Keyboard — `Tab` | Focus cycles through rows in DOM order (top to bottom) |
| Keyboard — `Enter` on focused row | Same as row click |
| Keyboard — `Escape` | Close picker. If detail modal is stacked above, Escape closes detail first |
| Click `Retry` (error state) | Re-fire list fetch; transition back to loading state |
| Click `×` / outside modal | Close picker |
| Session expired during fetch (D-06) | Close picker + fire locked Notice `LeetCode session expired. Log in again.` |
| Rate-limited during fetch (CF-10) | Surface one-shot Notice `LeetCode rate-limited — slowing down.` (existing Phase 1 behavior); the fetch retries silently via throttle |

### `SubmissionDetailModal` — interactions

| Interaction | Contract |
|-------------|----------|
| Open (from picker row click) | Render title + metadata row + code block. Loading state shown during the detail fetch; code block populates on resolve |
| Click `Copy to ## Code` | If current `## Code` block empty → overwrite silently; close both modals. If non-empty → open `ConfirmOverwriteModal` |
| Click `Close` | Close detail modal; picker re-foregrounds |
| Keyboard — `Escape` | Same as `Close` |
| Click outside modal | Same as `Close` |
| Keyboard — `Tab` | Focus cycles: `Close` → `Copy to ## Code` → (wrap). Default focus: `Close` |
| Session expired during detail fetch (D-06) | Close detail modal + fire locked Notice; picker (still open behind) stays open so user can retry a different row |
| Detail fetch fails (4xx/5xx) | Inline error inside detail modal body with `[Retry]` button, parallel to picker-error pattern |

### `ConfirmOverwriteModal` — interactions

| Interaction | Contract |
|-------------|----------|
| Open | Only when `Copy to ## Code` clicked AND current `## Code` fenced block is non-empty. Default focus on `Cancel` |
| Click `Yes, overwrite` | Close confirm → close detail → `vault.process` rewrite `## Code` fenced block with submitted code + submitted langSlug |
| Click `Cancel` | Close confirm only; return to detail modal (no write) |
| Keyboard — `Escape` | Same as `Cancel` |
| Click outside modal | Same as `Cancel` |

### `View past submissions` command

| Aspect | Contract |
|--------|----------|
| Command id | `view-past-submissions` (no plugin-id prefix per Phase 1 FND-03) |
| Command palette label | `LeetCode: View past submissions` |
| Enabled via | `editorCheckCallback` — true only when active editor's file frontmatter has a valid `lc-slug` (same pattern as Phase 3 commands) |
| Default hotkey | **NONE** (CF-19, Obsidian store requirement) |
| Ribbon icon | **NONE** in Phase 4 (the command palette is sufficient; ribbon adds visual noise for a command that's problem-scoped) |

### On-AC graph write — interactions (silent)

Not a UI surface per se, but the post-AC flow is a user-visible cascade:

| Step | What the user sees |
|------|-------------------|
| 1. Submit command fires | Phase 3 Verdict Modal opens in pending state |
| 2. Verdict resolves to AC | Verdict Modal transitions to AC state (big green "Accepted" + percentile) |
| 3. `KnowledgeGraphWriter.onAccepted` fires (behind Verdict Modal) | **Nothing visible yet** — Verdict Modal is foreground |
| 4. Frontmatter write completes | Invisible (Verdict Modal still foreground). If user peeks at properties pane behind modal: updated fields visible |
| 5. `## Techniques` write completes | Invisible (behind modal). If user glances at note: section appears/updates |
| 6. Stub creation loop completes | Invisible. Any wikilinks that previously showed as unresolved now resolve |
| 7. User clicks Close on Verdict Modal | Returns to the note. Sees updated `## Code` (no, wait — Phase 4 doesn't touch `## Code`; Phase 3 D-06 locked that — code stays user-authored), updated frontmatter in properties pane, new `## Techniques` section, resolvable wikilinks |

No explicit "graph write succeeded" Notice. The graph IS the feedback.

---

## Icons

Extends Phase 1 + Phase 3 icon palette (all Lucide, all via `setIcon(el, 'lucide-name')`).

| Element | Icon name | Color | Size |
|---------|-----------|-------|------|
| Picker verdict chip — AC | `check-circle` (optional; label alone is sufficient — executor may omit icon inside chip for space) | `var(--text-success)` | 12px if included |
| Picker verdict chip — WA/TLE/MLE/RE | `x-circle` (optional) | `var(--text-error)` | 12px if included |
| Picker verdict chip — CE | `alert-triangle` (optional) | `var(--color-orange, var(--color-yellow))` | 12px if included |
| Picker loading spinner | `loader` | `var(--interactive-accent)` | 24px, animated via existing `lc-spin` keyframes (Phase 3) |
| Picker retry button | `refresh-cw` | `var(--text-normal)` | 14px, leads the button label |
| Detail modal `Copy to ## Code` | `copy` | `var(--text-on-accent)` | 14px, leads the button label |
| Detail modal `Close` | no icon | — | — |
| Detail modal retry (on fetch error) | `refresh-cw` | `var(--text-normal)` | 14px |
| Confirm modal `Yes, overwrite` | no icon | — | — (deliberate — text-only for destructive confirm) |
| Confirm modal `Cancel` | no icon | — | — |

**Recommended chip rendering:** the verdict chip is a compact `<span>` with the abbreviation label only (e.g. `AC`, `WA`). Chip background uses the Phase 3 `color-mix` pattern at 12% opacity; chip text uses the semantic variable at full strength. Adding the icon inside the 48px chip is visually cramped — omit for picker rows. Use the icon only for the detail modal title (where Phase 3 chrome already includes it per `{status}` title).

**No custom SVGs in Phase 4.** All icons via `setIcon`. Language chips (`python3`, `cpp`) are text-only — no per-language icons.

---

## CSS Class Namespace

All new Phase 4 selectors scoped under `.leetcode-submissions-picker` (picker modal), `.leetcode-submissions-detail` (detail modal), or `.leetcode-submissions-confirm` (confirm-overwrite modal). Verdict chip classes `.leetcode-verdict-ac` / `-wa` / `-tle` / `-mle` / `-ce` / `-re` are **reused from Phase 3** — do NOT duplicate the CSS; append chip layout rules scoped to the picker namespace.

### Picker modal classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.leetcode-submissions-picker` | `contentEl` | Root scope for picker modal |
| `.leetcode-submissions-picker__list` | list container div | Scrollable row container (`max-height: 60vh; overflow-y: auto`) |
| `.leetcode-submissions-picker__row` | individual row div | Clickable row, 44px min-height, 8px horizontal padding |
| `.leetcode-submissions-picker__row:hover` | row hover state | `background: var(--background-secondary)` |
| `.leetcode-submissions-picker__chip` | verdict chip inside row | Layout wrapper — COMBINED with Phase 3 `.leetcode-verdict-ac` etc. for color |
| `.leetcode-submissions-picker__date` | date text | 14px, `var(--text-normal)` |
| `.leetcode-submissions-picker__perf` | runtime·memory text | 14px, `var(--text-normal)` |
| `.leetcode-submissions-picker__lang` | language chip | 18px pill, 11px semibold, `--background-secondary` bg, `--text-muted` text, right-aligned |
| `.leetcode-submissions-picker__empty` | empty-state container | Centered, vertical flex |
| `.leetcode-submissions-picker__empty-heading` | empty-state heading | 12px semibold, `var(--text-normal)` |
| `.leetcode-submissions-picker__empty-body` | empty-state body copy | 14px, `var(--text-muted)` |
| `.leetcode-submissions-picker__error` | error-state container | Same structure as empty-state |
| `.leetcode-submissions-picker__error-heading` | error heading | 12px semibold, `var(--text-normal)` |
| `.leetcode-submissions-picker__error-body` | error body copy | 14px, `var(--text-muted)` |
| `.leetcode-submissions-picker__retry` | Retry button | 28px, neutral (not `.mod-cta`) |
| `.leetcode-submissions-picker__loading` | loading-state container | Centered, vertical flex with spinner |
| `.leetcode-submissions-picker__spinner` | loading spinner wrapper | Uses existing Phase 3 `lc-spin` keyframes |

### Detail modal classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.leetcode-submissions-detail` | `contentEl` | Root scope for detail modal |
| `.leetcode-submissions-detail__meta` | metadata row | 14px, `var(--text-muted)` |
| `.leetcode-submissions-detail__code` | code block wrapper | `max-height: 50vh; overflow-y: auto` — encloses the `MarkdownRenderer.render` target |
| `.leetcode-submissions-detail__footer` | footer row | Flex right-aligned, 8px gap |
| `.leetcode-submissions-detail__copy` | Copy-to-Code button | `.mod-cta` styling via Obsidian |
| `.leetcode-submissions-detail__close` | Close button | Neutral styling |
| `.leetcode-submissions-detail__loading` | loading state inside detail | Same spinner pattern as picker |
| `.leetcode-submissions-detail__error` | error state inside detail | Same structure as picker error |

### Confirm-overwrite modal classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.leetcode-submissions-confirm` | `contentEl` | Root scope |
| `.leetcode-submissions-confirm__body` | body copy wrapper | 14px body |
| `.leetcode-submissions-confirm__note` | secondary undo note | 12px `var(--text-muted)` |
| `.leetcode-submissions-confirm__footer` | footer row | Flex right-aligned, 8px gap |
| `.leetcode-submissions-confirm__yes` | Yes, overwrite button | `.mod-cta` |
| `.leetcode-submissions-confirm__cancel` | Cancel button | Neutral |

### CSS skeleton (executor reference — append to `styles.css`)

```css
/* ── Submissions Picker Modal ──────────────────────────────────────────── */
.leetcode-submissions-picker .leetcode-submissions-picker__list {
  max-height: 60vh;
  overflow-y: auto;
  min-height: 320px;
}
.leetcode-submissions-picker .leetcode-submissions-picker__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 8px;
  cursor: pointer;
  border-radius: 4px;
}
.leetcode-submissions-picker .leetcode-submissions-picker__row:hover {
  background: var(--background-secondary);
}
.leetcode-submissions-picker .leetcode-submissions-picker__chip {
  /* Layout for the chip; color comes from composed .leetcode-verdict-* class */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 20px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}
.leetcode-submissions-picker .leetcode-submissions-picker__date {
  min-width: 120px;
  font-size: 14px;
  color: var(--text-normal);
}
.leetcode-submissions-picker .leetcode-submissions-picker__perf {
  flex: 1;
  font-size: 14px;
  color: var(--text-normal);
}
.leetcode-submissions-picker .leetcode-submissions-picker__lang {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--background-secondary);
  color: var(--text-muted);
  border-radius: 4px;
}
.leetcode-submissions-picker .leetcode-submissions-picker__empty,
.leetcode-submissions-picker .leetcode-submissions-picker__error,
.leetcode-submissions-picker .leetcode-submissions-picker__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  padding: 24px;
  text-align: center;
}
.leetcode-submissions-picker .leetcode-submissions-picker__empty-heading,
.leetcode-submissions-picker .leetcode-submissions-picker__error-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-normal);
}
.leetcode-submissions-picker .leetcode-submissions-picker__empty-body,
.leetcode-submissions-picker .leetcode-submissions-picker__error-body {
  font-size: 14px;
  color: var(--text-muted);
}
.leetcode-submissions-picker .leetcode-submissions-picker__retry {
  margin-top: 8px;
}
.leetcode-submissions-picker .leetcode-submissions-picker__spinner {
  color: var(--interactive-accent);
}
.leetcode-submissions-picker .leetcode-submissions-picker__spinner svg {
  width: 24px;
  height: 24px;
  animation: lc-spin 1s linear infinite;
}

/* ── Verdict chip color variants (reused from Phase 3; see .leetcode-verdict-*) ── */
/* The .leetcode-verdict-ac / -wa / -tle / -mle / -ce / -re classes from Phase 3  */
/* already define: color + background via color-mix. Compose them onto the        */
/* __chip base class at the DOM level. No additional CSS needed here.             */

/* ── Submissions Detail Modal ──────────────────────────────────────────── */
.leetcode-submissions-detail .leetcode-submissions-detail__meta {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 16px;
}
.leetcode-submissions-detail .leetcode-submissions-detail__code {
  max-height: 50vh;
  overflow-y: auto;
  margin-bottom: 16px;
}
.leetcode-submissions-detail .leetcode-submissions-detail__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.leetcode-submissions-detail .leetcode-submissions-detail__loading,
.leetcode-submissions-detail .leetcode-submissions-detail__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 160px;
  padding: 24px;
  text-align: center;
}

/* ── Confirm Overwrite Modal ───────────────────────────────────────────── */
.leetcode-submissions-confirm .leetcode-submissions-confirm__body {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 8px;
}
.leetcode-submissions-confirm .leetcode-submissions-confirm__note {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 16px;
}
.leetcode-submissions-confirm .leetcode-submissions-confirm__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* Reduced-motion support — reuse Phase 3 pattern */
@media (prefers-reduced-motion: reduce) {
  .leetcode-submissions-picker .leetcode-submissions-picker__spinner svg {
    animation: none;
  }
}
```

**Never:** `color: #xxx`, `background: rgba(...)` with literal values, `innerHTML`, `style=""` attribute, `!important`. Verdict chip color classes are **reused, not re-defined** — composing `.leetcode-submissions-picker__chip.leetcode-verdict-ac` on the DOM element picks up the Phase 3 color rules automatically.

---

## Accessibility

| Requirement | Contract |
|-------------|----------|
| Default focus | `SubmissionPickerModal` — first row (or the Retry button in error state). `SubmissionDetailModal` — `Close` button. `ConfirmOverwriteModal` — `Cancel` button (destructive protection). |
| Focus restore | On any modal close, Obsidian's `Modal` restores focus to the previously focused element natively. Verified Phase 3 behavior. |
| Keyboard navigation | Every interactive element reachable via `Tab`. Picker rows are native-button-like (`role="button"` + `tabindex="0"`) since divs don't focus by default. |
| Row keyboard activation | `Enter` and `Space` on focused row = click (standard ARIA button pattern) |
| `Escape` | Closes the topmost modal natively (Obsidian `Modal`) |
| ARIA — picker | `role="listbox"` on `.leetcode-submissions-picker__list`; `role="option"` on each `.leetcode-submissions-picker__row`; `aria-label="{verdict} submission on {date-iso}, runtime {ms} ms, memory {mb} MB, {langSlug}"` on each row |
| ARIA — chips | Verdict chip: `aria-label="{Accepted|Wrong Answer|...}"` so screen readers announce the full verdict, not just the abbreviation |
| ARIA — detail modal | Metadata row: `aria-label="Runtime {x} milliseconds, memory {y} megabytes, language {langSlug}, submitted at {iso}"` |
| ARIA — confirm modal | `aria-describedby` on confirm title points to body copy so screen readers read the consequence before announcing button focus |
| Color-not-alone | Verdict chips include the uppercase abbreviation label (`AC`, `WA`, `TLE`, `MLE`, `CE`, `RE`) — color is secondary. Color-blind users see the label. |
| Focus rings | **Do not override Obsidian's default.** Any `outline: none` is a bug (carried from Phase 1). |
| Contrast | Inherited from Obsidian CSS variables — themes meet WCAG AA. Plugin does not override. |
| Motion | Picker loading spinner respects `prefers-reduced-motion: reduce` — animation disabled. Existing Phase 3 `@media` block covers `.leetcode-submissions-picker__spinner svg` via the shared `lc-spin` keyframes (see CSS skeleton above). |
| Screen reader — empty state | Announces "No submissions yet. Submit a solution to LeetCode to see it here." via default DOM text read. |
| Screen reader — error state | Announces the error heading + body + presence of Retry button. Retry focus order: after heading + body. |

---

## Component Inventory (Phase 4)

| Component | Obsidian primitive | File |
|-----------|-------------------|------|
| `SubmissionPickerModal` | `Modal` | `src/graph/SubmissionPickerModal.ts` |
| Picker row | `createDiv({ cls: 'leetcode-submissions-picker__row' })` + click handler | inside `SubmissionPickerModal` |
| Picker verdict chip | `createSpan({ cls: 'leetcode-submissions-picker__chip leetcode-verdict-{verdict}' })` + `setText(label)` | inside picker row helper |
| Picker language chip | `createSpan({ cls: 'leetcode-submissions-picker__lang' })` + `setText(langSlug)` | inside picker row helper |
| Picker empty/error/loading states | `createDiv` hierarchy | inside `SubmissionPickerModal` |
| `SubmissionDetailModal` | `Modal` (extends `Component`) | `src/graph/SubmissionDetailModal.ts` |
| Detail metadata row | `createDiv({ cls: 'leetcode-submissions-detail__meta' })` | inside `SubmissionDetailModal` |
| Detail code block wrapper | `createDiv({ cls: 'leetcode-submissions-detail__code' })` + `MarkdownRenderer.render(app, fenced, el, '', this.renderChild)` | inside `SubmissionDetailModal` |
| Detail Copy-to-Code button | `new ButtonComponent(footerEl).setButtonText('Copy to ## Code').setIcon('copy').setCta()` | inside `SubmissionDetailModal` |
| Detail Close button | `new ButtonComponent(footerEl).setButtonText('Close')` | inside `SubmissionDetailModal` |
| `ConfirmOverwriteModal` | `Modal` | `src/graph/ConfirmOverwriteModal.ts` (or inline in `SubmissionDetailModal` — planner discretion) |
| All modal titles | `this.titleEl.setText(...)` (Obsidian native) | inside each modal |
| All toasts | `new Notice(...)` (ONLY session-expiry + rate-limit, both Phase 1 reused) | emitted from `submissionHistoryClient` failure handlers |
| `## Techniques` bulleted list | plain markdown string from `buildTechniquesBlock(topicTags)` in `src/notes/NoteTemplate.ts` | — |
| Technique stub note body | plain markdown string from `buildTechniqueStubBody(slug, name)` in `src/notes/NoteTemplate.ts` | — |
| Stub filename | helper `buildTechniqueFilename(name)` in `src/notes/NoteTemplate.ts` | — |

---

## Phase 5 Design Expectation (captured, not specced)

Per CONTEXT `<specifics>` and `<deferred>`, Phase 5 Polish carries the following design goal that Phase 4 deliberately defers:

**Chevron/dropdown navigator overlay on `## Code`.** Target: an LC-style `< 2/2 >` widget rendered over the `## Code` fenced block, with a middle dropdown to jump to a specific submission without leaving the note. Reading Mode implementation via `MarkdownPostProcessor` is the Phase 5 lower-risk path (same lane as Phase 3 D-11 Run/Submit overlay). Live Preview path via CM6 `EditorView` is the harder follow-on.

Phase 4's command-palette-only invocation (`LeetCode: View past submissions`) is the authoritative Phase 4 contract; the overlay is additive in Phase 5.

Also deferred to Phase 5:
- **Settings UI toggle for `autoBacklinksEnabled`** — POLISH-01 adds visible control. Phase 4 ships only the `PluginData` field + getter/setter.
- **Diff view in `SubmissionDetailModal`** — side-by-side or unified diff against current `## Code`. Powerful for "what did I change to beat TLE" introspection.
- **Filter chips in picker** (Accepted-only, language-only) — if visual noise becomes an issue in practice.
- **"Load more" pagination** below the first 20 picker rows — Pitfall 8 mitigation.
- **Retroactive cleanup command** (`LeetCode: Strip all technique sections`) — for users who flip opt-out after the fact.

These expectations are noted here so Phase 5 UI-SPEC can extend consistently.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — Obsidian plugin, no React component registry |
| third-party | none | not applicable |

No shadcn, no component registries, no third-party UI blocks. All UI built from Obsidian's built-in API primitives (`Modal`, `Notice`, `setIcon`, `MarkdownRenderer`, `Component`, `ButtonComponent`). Lucide ships inside Obsidian itself — no separate vetting needed. No new npm dependencies introduced in Phase 4 (confirmed in RESEARCH.md Standard Stack).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — modal titles, metadata row format, picker row shape, empty/error/loading copy, Notice strings (reused Phase 1), CTA labels, destructive confirmation copy all declared
- [ ] Dimension 2 Visuals: PASS — ASCII layout diagrams for all 3 modals plus empty/error/loading states; `## Techniques` markdown shape declared; stub frontmatter shape declared; CSS class namespace + skeleton; component inventory
- [ ] Dimension 3 Color: PASS — 60/30/10 inherited from Phase 1; accent reserved-for list extended (6 elements total across Phase 1+3+4); verdict chip classes reused from Phase 3; color-not-alone policy (chip label + icon optional) carried forward
- [ ] Dimension 4 Typography: PASS — 3 primary roles (Body 14px/400, Label 12px/600, Heading 16px/600) + Monospace inherits Obsidian code-block theme (via MarkdownRenderer). 2 declared weights: 400 and 600. Consistent with Phase 1 + Phase 3.
- [ ] Dimension 5 Spacing: PASS — 4-point scale inherited (4/8/12/16/24); modal exceptions documented (44px row, 20px chip, 320px min body, 60vh max body, 50vh code max, 80px confirm min); all CSS values multiples of 4
- [ ] Dimension 6 Registry Safety: PASS — no third-party registries, no new npm deps, no vetting required

**Approval:** pending
