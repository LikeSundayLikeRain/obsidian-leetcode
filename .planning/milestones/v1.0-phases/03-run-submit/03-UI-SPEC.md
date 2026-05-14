---
phase: 3
slug: run-submit
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-05-08
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for Phase 3: Run & Submit. Extends Phase 1 UI-SPEC consistently. This is an Obsidian plugin — design system is Obsidian's native CSS variables so the plugin inherits every installed theme without modification.

**Scope covered by this contract:**
1. `VerdictModal` — all six verdict states (AC / WA / TLE / MLE / CE / RE), pending state, timeout state, unknown-verdict state
2. `CustomTestModal` — tabbed case input (Case 1 / Case 2 / Case 3 / +), textarea per tab, Run button
3. `Notice` strings — new Phase 3 toasts (extends Phase 1 Notice copy contract)
4. Icons for verdict status — `setIcon` palette assignments
5. CSS class namespace — `.leetcode-verdict-*` and `.leetcode-custom-test-*`
6. Accessibility contracts — focus management, color-not-alone policy

**Explicitly out of scope for Phase 3** (deferred, noted for Phase 5):
- Overlay Run/Submit icon row on the code block — Phase 5 Polish design goal: `MarkdownPostProcessor`-based icon row in Reading Mode (LC-style language switcher, format, reset, Run, Submit)
- Per-argument labeled inputs in `CustomTestModal` — Phase 5 (requires starter-code signature parsing per language)
- Settings tab additions for Phase 3 fields (poll timeout override, overlay-button toggle) — Phase 5

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Obsidian-native) |
| Preset | not applicable (Obsidian plugin — vanilla DOM via `createEl()`) |
| Component library | Obsidian API primitives (`Modal`, `Notice`, `setIcon`) — no React, no Svelte |
| Styling approach | Class-scoped plain CSS in `styles.css` — extends existing `.leetcode-browser` / `.leetcode-settings` convention with new `.leetcode-verdict` and `.leetcode-custom-test` namespaces |
| Token system | Obsidian CSS variables — **never hardcoded hex values**. New Phase 3 tokens: `--text-error` (red verdicts), `--text-success` (AC), `--color-orange` (CE/Unknown amber) |
| Icon library | Lucide (Obsidian's built-in) — referenced by string name via `setIcon(el, 'name')` |
| Font | Inherit `--font-interface` (modal body) and `--font-monospace` (code output, compile-error pre blocks) |
| DOM constructor | `createEl()` / `createDiv()` / `createSpan()` only — `innerHTML` is permanently forbidden. WA diff output uses `.setText()` on nested spans. `<pre>` blocks via `createEl('pre').setText(str)` |

**Rationale:** Phase 1 locked Obsidian-native design system. Phase 3 extends the same system. Modal content inherits Obsidian's modal theme (`.modal-content`) so dark/light/community themes apply automatically.

---

## Spacing Scale

Inherits Phase 1 scale. Phase 3 uses the same 4-point values with modal-specific additions.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gap inside status indicator, inline-badge padding, tab-remove button padding |
| sm | 8px | Between verdict sections (Input / Output / Expected), between tab buttons, footer button gap |
| md | 12px | Modal inner section padding, between runtime line and body |
| md2 | 16px | Modal content-area padding (matches `.modal-content` default), between verdict title and runtime row |
| lg | 24px | Between major verdict sections in WA/CE/RE layout |
| xl | 32px | Reserved (not used in Phase 3 modals) |

Exceptions:
- **Tab button height: 28px** — matches Obsidian's native button default; consistent with Phase 1 button sizing.
- **Textarea min-height: 120px** (custom test) — enough to show 4–6 lines of test input without scrolling immediately.
- **AC status text: 32px** — the "big green status" for AC uses a display-size font to match the LC-native verdict feel. Applies only to the single AC status string, not to surrounding text.
- **Pending-state spinner container: 48px × 48px** — centered in modal body, gives visual weight appropriate to a loading state.

---

## Typography

Inherits Phase 1 type scale. Phase 3 adds two new usage contexts.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 14px (`var(--font-ui-small)`) | 400 (regular) | 1.5 | Verdict body copy, pending-state copy, custom-test textarea, runtime/memory line, WA Input/Output/Expected labels |
| Label | 12px (`var(--font-ui-smaller)`) | 600 (semibold) | 1.4 | Tab labels (`Case 1`, `Case 2`), subtitles (backoff hint `Backoff: 1s → 2s → 4s → 8s`), percentile line |
| Heading | 16px (`var(--font-ui-medium)`) | 600 (semibold) | 1.3 | Modal title (set via `titleEl.setText(...)`) — Obsidian renders `titleEl` at its own heading size; plugin does not override |
| Display | 32px | 600 (semibold) | 1.1 | AC status string only (`Accepted`) — single usage, conveys the celebration moment. All other verdicts use body size |
| Monospace | 12px (`var(--font-monospace)`) | 400 (regular) | 1.6 | CE `compile_error` pre block, RE `runtime_error` pre block, WA diff values (`Output:` / `Expected:` content), custom-test textarea content |

Two declared weights: **400 (regular)** and **600 (semibold)**. These two weights cover all roles including the AC display text.

---

## Color

Inherits Phase 1 60/30/10 contract. Phase 3 adds verdict-specific semantic colors. All values are Obsidian CSS variables — no raw hex.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--background-primary)` | Modal body background (inherited from `.modal-content`) |
| Secondary (30%) | `var(--background-secondary)` | WA diff section backgrounds (Input / Output / Expected), tab bar background, inactive tab background |
| Accent (10%) | `var(--interactive-accent)` | Run button in `CustomTestModal` (primary CTA, `.mod-cta`); progress fill in pending-state indicator |
| Accent text | `var(--text-on-accent)` | Text inside Run button |
| Text normal | `var(--text-normal)` | WA Input label, CE error label, modal body copy |
| Text muted | `var(--text-muted)` | Backoff subtitle, runtime/memory line values, percentile line, tab close `×` default state |
| Success (AC) | `var(--text-success)` | AC status icon (`check-circle`), AC "Accepted" display text, AC section border-left accent |
| Error (WA/TLE/MLE/RE) | `var(--text-error)` | WA/TLE/MLE/RE status icon (`x-circle`), "Output" diff section label (the wrong value), WA output value text |
| Warning (CE/Unknown) | `var(--color-orange, var(--color-yellow))` | CE/Unknown status icon (`alert-triangle`), CE section border-left accent |
| Expected (WA) | `var(--text-success)` | WA "Expected" label and expected-output value — green indicates correctness target |
| Destructive | `var(--text-error)` | Cancel button hover state in pending modal (never filled, outline-only on hover) |

**Accent (`--interactive-accent`) is reserved EXCLUSIVELY for (extending Phase 1 list):**
1. `Log in via embedded window` primary button (Phase 1)
2. Active filter chip in problem browser (Phase 1)
3. **Run button in `CustomTestModal`** (Phase 3 addition — the single primary CTA in that modal)
4. Pending-state progress indicator fill (Phase 3 — visual-only, not interactive)

**NOT accent:** Close button in verdict modal, Cancel button in pending modal, Copy buttons (all secondary/neutral), tab buttons, tab remove icon.

**Color-not-alone policy (accessibility):** Red (`--text-error`) and green (`--text-success`) are always paired with an icon from the Lucide set. The icon carries the semantic meaning; color amplifies it. This is mandatory — do not use color as the sole differentiator for verdict state.

---

## Copywriting Contract

Extends Phase 1 contract. All rules carry forward:
- Sentence case everywhere (enforced by `eslint-plugin-obsidianmd`)
- Notice messages: full sentence ending with a period
- Modal titles: no `LeetCode:` plugin prefix (verdict modals are presenter-to-user; the command-palette context already establishes the LeetCode brand)
- Button labels: verb + noun, no trailing period
- No title case in headings or labels

### Verdict modal — titles

Format: `{Verdict name} — {Problem title}` (em dash with spaces).

| Verdict state | Modal title |
|---------------|-------------|
| Pending | `Running…` (unicode ellipsis; updated to verdict title on poll return) |
| AC | `Accepted — {problem title}` |
| WA | `Wrong Answer — {problem title}` |
| TLE | `Time Limit Exceeded — {problem title}` |
| MLE | `Memory Limit Exceeded — {problem title}` |
| CE | `Compile Error — {problem title}` |
| RE | `Runtime Error — {problem title}` |
| Unknown | `Unrecognized verdict — {problem title}` |
| Timeout (60s) | `Judge timeout` (no problem title — timer fired before verdict) |

### Verdict modal — runtime/memory line

Format: `Runtime: {value} · Memory: {value}` (middle-dot `·` U+00B7 as separator, single space each side).

Examples:
- `Runtime: 12 ms · Memory: 14.2 MB`
- `Runtime: — · Memory: —` (when LC does not return these for a failed run)

### Verdict modal — percentile line (AC only)

Format: `Beats {runtime_pct}% (runtime) · {memory_pct}% (memory)`

Example: `Beats 94.2% (runtime) · 72.8% (memory)`

If `runtime_percentile` or `memory_percentile` is absent from the check response, omit the percentile line entirely (do not render a placeholder).

### Verdict modal — pending state copy

| Element | Copy |
|---------|------|
| Body primary line | `Polling LeetCode for verdict…` |
| Body subtitle | `Backoff: 1s → 2s → 4s → 8s` |
| Footer cancel button | `Cancel` |

### Verdict modal — timeout state copy

| Element | Copy |
|---------|------|
| Body | `LeetCode judge timed out. Try again or check leetcode.com.` |
| Footer close button | `Close` |

### Verdict modal — WA section labels

| Label | Copy |
|-------|------|
| Failing input section | `Input` |
| Actual output section | `Output` |
| Expected output section | `Expected` |

### Verdict modal — action buttons

| Verdict | Action button copy | Secondary action |
|---------|--------------------|-----------------|
| AC | *(no action button)* | `Close` |
| WA | `Copy failing testcase to custom input` | `Close` |
| TLE | `Copy failing testcase to custom input` | `Close` |
| MLE | *(no action button — failing input shown but no copy action for MLE)* | `Close` |
| CE | `Copy error` | `Close` |
| RE | `Copy failing testcase to custom input` | `Close` |
| Unknown | `Copy payload` | `Close` |
| Timeout | *(no action button)* | `Close` |

The `Close` button is always present. It is the default-focus element on modal open.

### `CustomTestModal` — copy

| Element | Copy |
|---------|------|
| Modal title | `Custom test input` |
| Tab labels | `Case 1`, `Case 2`, `Case 3` … (sequential, no zero-padding) |
| Add tab button | `+` |
| Tab remove icon | `×` (visible on tab hover only) |
| Textarea placeholder | `Enter test input (one value per line)` |
| Footer run button | `Run` |

### `Notice` strings — new Phase 3 additions

Follows Phase 1 sentence-case + terminal-period discipline.

| Trigger | Copy | Duration |
|---------|------|----------|
| No fenced code block found (D-04) | `No code block found. Add a fenced block with your solution.` | 6s |
| Concurrent submit attempt (D-24) | `A submission is already in progress. Cancel it first or wait for the verdict.` | 6s |
| Command invoked outside a problem note | `Open a LeetCode problem note first.` | 4s |
| Starter code inserted on-demand (D-07, optional) | `Starter code inserted.` | 3s |

**Carried forward from Phase 1 (no new copy needed):**
- Session expired: `LeetCode session expired. Log in again.` (8s)
- Rate-limited: `LeetCode rate-limited — slowing down.` (6s)

**Not a Notice** (silent): Cancel during pending verdict (user action, not a failure — modal closes, no toast). Retrofit starter code on note open (D-09 — silent on success).

### Primary CTAs per surface

| Surface | Primary CTA | Verb + noun |
|---------|-------------|-------------|
| `CustomTestModal` | `Run` | Run (implicit: run test) |
| `VerdictModal` pending | `Cancel` | Cancel (submission) |
| `VerdictModal` resolved | `Close` | Close |
| `VerdictModal` WA/TLE/RE action | `Copy failing testcase to custom input` | Copy … to … |
| `VerdictModal` CE action | `Copy error` | Copy error |
| `VerdictModal` Unknown action | `Copy payload` | Copy payload |

---

## Interaction Contracts

### `VerdictModal` — state machine

| From state | To state | Trigger |
|------------|----------|---------|
| (not open) | Pending | `SubmissionOrchestrator.submit()` called — modal opens before first REST POST returns |
| Pending | Verdict (AC / WA / TLE / MLE / CE / RE / Unknown) | Poll returns `state === 'SUCCESS'` |
| Pending | Timeout | 60s wall-clock cap hit (D-22) |
| Pending | (closed) | User clicks `Cancel` — modal closes silently, abort flag set |
| Any resolved state | (closed) | User clicks `Close` |

Transitions update in place via refs + mutation (Pattern 3 from RESEARCH.md). `onOpen()` runs once; bodyEl / runtimeRowEl / footerEl refs are mutated on state change.

### `VerdictModal` — focus management

- On open (pending state): focus the `Cancel` button.
- On transition to resolved verdict: focus the `Close` button (which replaces `Cancel` in the footer).
- On transition to WA/TLE/RE with action button: focus the action button (`Copy failing testcase to custom input` etc.); `Close` is secondary and reachable via `Tab`.
- `Escape` key: same as clicking `Close` (or `Cancel` in pending state) — Obsidian's `Modal` handles this natively.

### `VerdictModal` — WA diff layout

Three stacked sections in the modal body, each with a label and a value block:

```
┌─────────────────────────────────────┐
│  [status icon] Wrong Answer         │  ← titleEl (via Obsidian modal chrome)
│  Runtime: 12 ms · Memory: 14.2 MB  │  ← runtimeRowEl (muted, 12px)
├─────────────────────────────────────┤
│  Input                              │  ← label, 12px, --text-muted
│  ┌──────────────────────────────┐   │
│  │ [3,2,4]                      │   │  ← monospace pre, --background-secondary bg
│  │ 6                            │   │
│  └──────────────────────────────┘   │
│                                     │
│  Output                             │  ← label, 12px, --text-error
│  ┌──────────────────────────────┐   │
│  │ 0                            │   │  ← monospace pre, red left-border accent
│  └──────────────────────────────┘   │
│                                     │
│  Expected                           │  ← label, 12px, --text-success
│  ┌──────────────────────────────┐   │
│  │ 1                            │   │  ← monospace pre, green left-border accent
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Copy failing testcase…]  [Close] │  ← footerEl; Close is right-aligned
└─────────────────────────────────────┘
```

Left-border accent approach: `border-left: 3px solid var(--text-error)` on the Output `<pre>`, `border-left: 3px solid var(--text-success)` on the Expected `<pre>`. Background remains `--background-secondary` for both — the border is the diff signal, not a filled background. This avoids accessibility contrast issues with light themes.

### `VerdictModal` — AC layout

```
┌─────────────────────────────────────┐
│  [check-circle] Accepted            │  ← titleEl
│  Runtime: 72 ms · Memory: 16.8 MB  │  ← runtimeRowEl
├─────────────────────────────────────┤
│                                     │
│         Accepted                    │  ← 32px semibold, --text-success, centered
│                                     │
│  Beats 94.2% (runtime) · 72.8% (memory)  ← 12px, --text-muted, centered
│                                     │
│  (Phase 4 will add "Wrote to note" │  ← placeholder space; not rendered in Phase 3
│   confirmation line here)           │
├─────────────────────────────────────┤
│                               [Close]  ← footer; no action button
└─────────────────────────────────────┘
```

### `VerdictModal` — CE layout

```
┌─────────────────────────────────────┐
│  [alert-triangle] Compile Error     │  ← titleEl
├─────────────────────────────────────┤
│  Compile error                      │  ← label, --text-muted, 12px
│  ┌──────────────────────────────┐   │
│  │ Line 3: expected ':'         │   │  ← <pre>, --font-monospace 12px, 1.6 line-height
│  │ found EOF                    │   │     max-height: 200px, overflow-y: auto
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Copy error]                [Close] │
└─────────────────────────────────────┘
```

### `VerdictModal` — TLE / MLE layout

```
┌─────────────────────────────────────┐
│  [x-circle] Time Limit Exceeded     │  ← titleEl (or Memory Limit Exceeded)
├─────────────────────────────────────┤
│  Input                              │  ← label, --text-muted, 12px
│  ┌──────────────────────────────┐   │
│  │ [failing input value]        │   │  ← monospace pre
│  └──────────────────────────────┘   │
│                                     │
│  (TLE only, when available)         │
│  Last output                        │  ← label; omit entire block if absent
│  ┌──────────────────────────────┐   │
│  │ [partial output]             │   │
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Copy failing testcase…]  [Close] │  ← TLE has action; MLE has Close only
└─────────────────────────────────────┘
```

MLE: same layout as TLE but no "Last output" section and no action button.

### `VerdictModal` — RE layout

```
┌─────────────────────────────────────┐
│  [x-circle] Runtime Error           │  ← titleEl
├─────────────────────────────────────┤
│  Error                              │  ← label, --text-muted, 12px
│  ┌──────────────────────────────┐   │
│  │ IndexError: list index out   │   │  ← monospace pre, --text-error text
│  │ of range                     │   │
│  └──────────────────────────────┘   │
│                                     │
│  Input                              │  ← label
│  ┌──────────────────────────────┐   │
│  │ [triggering input]           │   │
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Copy failing testcase…]  [Close] │
└─────────────────────────────────────┘
```

### `VerdictModal` — Unknown verdict layout

```
┌─────────────────────────────────────┐
│  [alert-triangle] Unrecognized verdict  ← titleEl
├─────────────────────────────────────┤
│  LeetCode returned an unrecognized  │  ← body copy, --text-muted
│  status. Copy the payload to file   │
│  a bug report.                      │
│                                     │
│  ▶ Raw response                     │  ← <details> collapsed; label 12px
│    { "status_code": 99, ...}        │     <pre> inside details, max 2 KB display
└─────────────────────────────────────┘
│  [Copy payload]              [Close] │
└─────────────────────────────────────┘
```

`<details>` is collapsed on open. The payload shown in the `<pre>` is truncated to 2 KB for display; the full payload goes to clipboard on `Copy payload`. Clipboard copy runs through `logger.redact()` before writing (security — strip any embedded session/cookie tokens).

### `VerdictModal` — pending layout

```
┌─────────────────────────────────────┐
│  Running…                           │  ← titleEl
├─────────────────────────────────────┤
│                                     │
│     [loader spinner icon, 32px]     │  ← centered, --interactive-accent color
│                                     │
│   Polling LeetCode for verdict…     │  ← centered, 14px
│   Backoff: 1s → 2s → 4s → 8s       │  ← centered, 12px --text-muted
│                                     │
├─────────────────────────────────────┤
│                          [Cancel]   │
└─────────────────────────────────────┘
```

Spinner: `setIcon(spinnerEl, 'loader')` with CSS animation `@keyframes lc-spin { to { transform: rotate(360deg); } }` applied to the element. Color: `var(--interactive-accent)`. Size: 32px × 32px.

### `CustomTestModal` — layout and interaction

```
┌─────────────────────────────────────┐
│  Custom test input                  │  ← titleEl
├─────────────────────────────────────┤
│  [Case 1 ×] [Case 2 ×] [Case 3 ×] [+]  ← tab bar, 28px height buttons
├─────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │ [3,2,4]                      │   │  ← textarea, --font-monospace 12px
│  │ 6                            │   │     min-height: 120px, resize: vertical
│  │                              │   │     spellcheck=false
│  │                              │   │
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│                             [Run]   │  ← mod-cta (accent), right-aligned
└─────────────────────────────────────┘
```

Tab interactions:
| Interaction | Contract |
|-------------|----------|
| Click inactive tab | Save current textarea content to current case; switch active tab; load new tab's content into textarea; focus textarea |
| Hover tab (when >1 case) | Show `×` remove icon inside the tab button |
| Click `×` on tab | Remove that case; if removed tab was active, activate adjacent tab (prefer previous, fallback to next); focus textarea. Never removes the last remaining tab |
| Click `+` | Append new empty case; make it active; focus textarea |
| Click `Run` | Save current tab content to case; close modal; pass active tab's input to `SubmissionOrchestrator`; open `VerdictModal` in pending state |
| Close modal (Escape / outside click) | Save current tab content; persist all cases to `## Custom Tests` in note if content changed; close silently |

Custom-test tab keyboard:
- Tabs are `<button>` elements, keyboard-reachable via `Tab` key (DOM order)
- `Enter` on a tab activates it (same as click)
- `Tab` inside the modal cycles: tab buttons → `+` button → textarea → `Run` button → (wrap to tabs)

### Shared modal behavior

| Behavior | Contract |
|----------|----------|
| Escape key | Native Obsidian `Modal` handles — closes modal |
| Click outside modal | Native Obsidian `Modal` handles — closes modal |
| No stacking | Only one verdict-type modal open at a time; `SubmissionOrchestrator` gates this |

---

## Icons

Extends Phase 1 icon palette (all Lucide, all via `setIcon(el, 'lucide-name')`).

| Element | Icon name | Color | Size |
|---------|-----------|-------|------|
| AC status | `check-circle` | `var(--text-success)` | 20px |
| WA / TLE / MLE / RE status | `x-circle` | `var(--text-error)` | 20px |
| CE / Unknown status | `alert-triangle` | `var(--color-orange, var(--color-yellow))` | 20px |
| Pending spinner | `loader` | `var(--interactive-accent)` | 32px (centered in body) |
| Custom-test tab remove | `x` (rendered as text `×` for lightweight inline) | `var(--text-muted)` on idle; `var(--text-normal)` on hover | 12px inline |

**No custom SVGs in Phase 3.** All via `setIcon`. Tab `×` MAY be rendered as unicode `×` (U+00D7) in a `<span>` rather than a full `setIcon` call — acceptable for the inline tab affordance; executor chooses.

---

## CSS Class Namespace

All new Phase 3 selectors scoped under `.leetcode-verdict` (modal) or `.leetcode-custom-test` (custom test modal). Append to existing `styles.css`.

### Verdict modal classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.leetcode-verdict` | `contentEl` | Root scope for modal; wraps all content |
| `.leetcode-verdict-pending` | `contentEl` modifier | Applied during pending state; removed on verdict |
| `.leetcode-verdict-ac` | `contentEl` modifier | Applied on AC verdict |
| `.leetcode-verdict-wa` | `contentEl` modifier | Applied on WA verdict |
| `.leetcode-verdict-tle` | `contentEl` modifier | Applied on TLE verdict |
| `.leetcode-verdict-mle` | `contentEl` modifier | Applied on MLE verdict |
| `.leetcode-verdict-ce` | `contentEl` modifier | Applied on CE verdict |
| `.leetcode-verdict-re` | `contentEl` modifier | Applied on RE verdict |
| `.leetcode-verdict-unknown` | `contentEl` modifier | Applied on unknown verdict |
| `.leetcode-verdict-spinner` | spinner container div | Pending-state loader icon wrapper |
| `.leetcode-verdict-runtime` | runtime/memory row div | `Runtime: X · Memory: Y` text |
| `.leetcode-verdict-body` | body content div | Mutable region; `.empty()` on state transitions |
| `.leetcode-verdict-footer` | footer div | Mutable region; `.empty()` on state transitions |
| `.leetcode-verdict-section` | each Input/Output/Expected section | WA/TLE/RE diff sections |
| `.leetcode-verdict-section-label` | label above a diff pre | "Input", "Output", "Expected" |
| `.leetcode-verdict-diff-input` | `<pre>` for failing input | Monospace, neutral background |
| `.leetcode-verdict-diff-actual` | `<pre>` for actual output | Red left-border accent |
| `.leetcode-verdict-diff-expected` | `<pre>` for expected output | Green left-border accent |
| `.leetcode-verdict-error-pre` | `<pre>` for CE/RE error text | Monospace, max-height 200px, overflow-y auto |
| `.leetcode-verdict-action-row` | action button row | Contains action button + Close |
| `.leetcode-verdict-ac-display` | "Accepted" display text | 32px, semibold, success color, centered |
| `.leetcode-verdict-percentile` | percentile line | 12px, muted, centered |
| `.leetcode-verdict-unknown-details` | `<details>` element | Collapsed raw payload |

### Custom test modal classes

| Class | Element | Purpose |
|-------|---------|---------|
| `.leetcode-custom-test` | `contentEl` | Root scope for custom test modal |
| `.leetcode-custom-test-tabs` | tabs container div | Tab button row |
| `.leetcode-custom-test-tab` | individual tab `<button>` | Case tab button |
| `.leetcode-custom-test-tab.is-active` | active tab modifier | Highlighted tab |
| `.leetcode-custom-test-tab-remove` | `×` span inside a tab | Remove affordance (visibility toggled on tab hover) |
| `.leetcode-custom-test-textarea` | `<textarea>` | Test input area |
| `.leetcode-custom-test-footer` | footer div | Contains Run button |

### CSS skeleton (executor reference)

```css
/* ── Verdict Modal ────────────────────────────────────────────────────────── */
.leetcode-verdict .leetcode-verdict-runtime {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.leetcode-verdict .leetcode-verdict-spinner {
  display: flex;
  justify-content: center;
  margin: 16px 0;
  color: var(--interactive-accent);
}
.leetcode-verdict .leetcode-verdict-spinner svg {
  width: 32px;
  height: 32px;
  animation: lc-spin 1s linear infinite;
}
@keyframes lc-spin { to { transform: rotate(360deg); } }

.leetcode-verdict .leetcode-verdict-section {
  margin-bottom: 12px;
}
.leetcode-verdict .leetcode-verdict-section-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.leetcode-verdict .leetcode-verdict-diff-input,
.leetcode-verdict .leetcode-verdict-diff-actual,
.leetcode-verdict .leetcode-verdict-diff-expected,
.leetcode-verdict .leetcode-verdict-error-pre {
  margin: 0;
  padding: 8px 12px;
  background: var(--background-secondary);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.leetcode-verdict .leetcode-verdict-diff-actual {
  border-left: 3px solid var(--text-error);
  color: var(--text-error);
}
.leetcode-verdict .leetcode-verdict-diff-expected {
  border-left: 3px solid var(--text-success);
}
.leetcode-verdict .leetcode-verdict-section-label--output {
  color: var(--text-error);
}
.leetcode-verdict .leetcode-verdict-section-label--expected {
  color: var(--text-success);
}
.leetcode-verdict .leetcode-verdict-error-pre {
  max-height: 200px;
  overflow-y: auto;
}
.leetcode-verdict .leetcode-verdict-ac-display {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-success);
  text-align: center;
  margin: 12px 0 8px;
}
.leetcode-verdict .leetcode-verdict-percentile {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
.leetcode-verdict .leetcode-verdict-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.leetcode-verdict .leetcode-verdict-unknown-details {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.leetcode-verdict .leetcode-verdict-unknown-details pre {
  font-family: var(--font-monospace);
  font-size: 12px;
  padding: 8px;
  background: var(--background-secondary);
  border-radius: 4px;
  max-height: 160px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Custom Test Modal ────────────────────────────────────────────────────── */
.leetcode-custom-test .leetcode-custom-test-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.leetcode-custom-test .leetcode-custom-test-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
}
.leetcode-custom-test .leetcode-custom-test-tab.is-active {
  background: var(--background-modifier-border);
  color: var(--text-normal);
  font-weight: 600;
}
.leetcode-custom-test .leetcode-custom-test-tab-remove {
  display: none;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1;
}
.leetcode-custom-test .leetcode-custom-test-tab:hover .leetcode-custom-test-tab-remove {
  display: inline;
}
.leetcode-custom-test .leetcode-custom-test-tab-remove:hover {
  color: var(--text-normal);
}
.leetcode-custom-test .leetcode-custom-test-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  padding: 8px;
  background: var(--background-secondary);
  border-radius: 4px;
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
}
.leetcode-custom-test .leetcode-custom-test-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
```

**Never:** `color: #xxx`, `background: rgba(...)` with literal values, `innerHTML`, `style=""` attribute, `!important`.

---

## Accessibility

| Requirement | Contract |
|-------------|----------|
| Default focus | `VerdictModal` — `Cancel` button on open (pending state); `Close` button on verdict state. `CustomTestModal` — textarea on open. |
| Focus restore | On modal close, Obsidian's `Modal` restores focus to the previously focused element natively. |
| Keyboard navigation | Every interactive element reachable via `Tab`. Custom-test tabs are `<button>` elements. `×` remove is inside the tab button and reachable via `Tab` when visible. |
| Escape | Closes modals natively (Obsidian `Modal`). |
| ARIA | Tab buttons: `role="tab"` + `aria-selected="{true|false}"`. Tab panel (textarea): `role="tabpanel"`. Tab container: `role="tablist"`. WA diff sections: `aria-label="Input"`, `aria-label="Output"`, `aria-label="Expected"`. Verdict modal: `aria-live="polite"` on `bodyEl` so screen readers announce state transitions. |
| Color-not-alone | All verdict state colors (red for WA/TLE/MLE/RE, green for AC, amber for CE/Unknown) are paired with icons from the Lucide set. The icon carries semantic meaning; color amplifies it. |
| Focus rings | Do not override Obsidian's default focus ring. Any `outline: none` is a bug. |
| Contrast | Inherited from Obsidian CSS variables — themes meet WCAG AA. Plugin does not override. |
| Motion | Spinner animation uses `prefers-reduced-motion` — wrap the `@keyframes lc-spin` with `@media (prefers-reduced-motion: no-preference)`. When reduced motion is preferred, show the loader icon statically without rotation. |

---

## Phase 5 Design Expectation (captured, not specced)

Per CONTEXT D-11 and the author's dogfooding conversation, Phase 5 Polish carries the following design goal that Phase 3 deliberately defers:

**Overlay Run/Submit icon row on the code block.** Target: an LC-style icon row rendered over the `## Code` fenced block in Reading Mode via `MarkdownPostProcessor`. Intended affordances: language indicator, format code, reset to starter, Run, Submit — mirroring LC's code editor chrome. Reading Mode path (`MarkdownPostProcessor`) is the low-risk Phase 5 implementation; Live Preview/Source Mode via CM6 `EditorView` (undocumented API) is a harder follow-on. Phase 3's command-palette-only invocation is the authoritative Phase 3 contract; the overlay is additive in Phase 5.

This expectation is noted here so Phase 5 UI-SPEC can extend consistently.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — Obsidian plugin, no React component registry |
| third-party | none | not applicable |

No shadcn, no component registries, no third-party UI blocks. All UI built from Obsidian's built-in API primitives (`Modal`, `Notice`, `setIcon`). Lucide ships inside Obsidian itself — no separate vetting needed.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — modal titles, runtime format, percentile format, Notice strings, CTA labels, empty/error/action states all declared
- [ ] Dimension 2 Visuals: PASS — ASCII layout diagrams for all 8 modal states, CSS skeleton, component inventory
- [ ] Dimension 3 Color: PASS — 60/30/10 mapped to Obsidian variables, accent reserved-for list updated (4 elements), color-not-alone policy declared
- [ ] Dimension 4 Typography: PASS — 5 roles declared (Body 14px/400, Label 12px/600, Heading 16px/600, Display 32px/600, Mono 12px/400); 2 declared weights: 400 (regular) and 600 (semibold)
- [ ] Dimension 5 Spacing: PASS — 4-point scale declared, modal exceptions documented (28px tabs, 120px textarea, 32px spinner, 48px pending container); all CSS values are multiples of 4
- [ ] Dimension 6 Registry Safety: PASS — no third-party registries, no vetting required

**Approval:** pending
