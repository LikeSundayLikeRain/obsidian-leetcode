---
phase: 1
slug: plugin-foundation
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-05-07
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for the Obsidian LeetCode plugin foundation. This is an Obsidian plugin (not a web app) — the design system is Obsidian's native CSS variables so the plugin inherits every installed theme without modification.

**Scope covered by this contract:**
1. Right-sidebar `ItemView` — Problem Browser (primary surface)
2. `PluginSettingTab` — minimal Phase-1 settings (D-09 layout verbatim)
3. Electron `BrowserWindow` — LC login page (native LC rendering, no plugin styling)
4. `Notice` toasts — 429 rate-limit, session-expiry, login-cancel
5. Ribbon icon + command-palette entry — both activate the Problem Browser

**Explicitly out of scope for Phase 1** (deferred):
- Problem detail pane / note rendering → Phase 2
- Verdict modal, run/submit UI → Phase 3
- Technique folder, auto-backlink toggle → Phase 4
- Error-copy polish, network-disclosure copy → Phase 5

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Obsidian-native) |
| Preset | not applicable (not a React/Next/Vite project — Obsidian uses vanilla DOM via `createEl()`) |
| Component library | Obsidian API primitives (`ItemView`, `PluginSettingTab`, `Setting`, `Notice`, `Modal`) |
| Styling approach | Class-scoped plain CSS in `styles.css` with the root class `.leetcode-browser` (CONTEXT.md Claude's Discretion) |
| Token system | Obsidian CSS variables (`--background-primary`, `--text-normal`, `--interactive-accent`, etc.) — **never hardcoded hex values** |
| Icon library | Lucide (Obsidian's built-in) — referenced by string name (e.g. `code-2`, `search`, `check-circle`, `log-in`) |
| Font | Inherit Obsidian's `--font-interface` and `--font-monospace` — no custom web fonts |
| DOM constructor | `createEl()` / `createDiv()` / `createSpan()` only — `innerHTML` is forbidden (ESLint `no-forbidden-elements` + `prefer-create-el`) |

**Rationale:** Obsidian ships dozens of user themes; using CSS variables means the plugin matches the user's active theme in light mode, dark mode, and every community theme without per-theme overrides. This is a hard requirement of Obsidian's community plugin guidelines.

---

## Spacing Scale

Obsidian-aligned 4-point scale. All plugin CSS spacing MUST come from this table; executor may reference Obsidian's `var(--size-4-N)` scale where it maps 1:1 but explicit px is acceptable in Phase 1 CSS for clarity.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gap inside a filter chip, inline-badge padding |
| sm | 8px | Row internal padding, space between search bar and filter row |
| md | 12px | Row vertical rhythm (row height = 32px with 12px internal line-height wrap) |
| md2 | 16px | Section padding (outer padding of view content container), settings group padding |
| lg | 24px | Between major Settings sections (Authentication / Notes) |
| xl | 32px | Not used in Phase 1 (reserved for verdict modal in Phase 3) |

Exceptions:
- **Row min-height 32px** for list rows — touch-friendly without being over-tall for a 3,300-row list. (44px would make the viewport show too few rows.)
- **Button min-height 28px** — matches Obsidian's native settings button default; never smaller.
- **Filter chips min-height 24px with 4px/8px padding** — Obsidian-native chip sizing.

---

## Typography

Inherits Obsidian's `--font-interface` and `--font-monospace`. Sizes declared relative to Obsidian's defaults to stay theme-consistent.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 14px (`var(--font-ui-small)`) | 400 (regular) | 1.5 | Row title, row ID, search input, settings descriptions |
| Label | 12px (`var(--font-ui-smaller)`) | 500 (medium) | 1.4 | Filter chip labels, status-pill text, footer throttle indicator, difficulty tag text |
| Heading | 16px (`var(--font-ui-medium)`) | 600 (semibold) | 1.3 | Settings section headings ("Authentication", "Notes"), view header "LeetCode problems" |

Two declared weights: **400 (regular)** for body + **600 (semibold)** for headings. 500 (medium) is used by Obsidian's own chip components — if the executor prefers a strict 2-weight rule, fall back to 400 for labels.

Monospace usage: the Manual cookie paste `<input>` fields in the Settings tab use `var(--font-monospace)` at 12px so that pasted cookie values wrap predictably.

**Line height rationale:** 1.5 for body per reading-comfort convention; 1.3 for headings matches Obsidian's own settings-tab headings.

---

## Color

**Hard rule: every color value in the plugin CSS references an Obsidian CSS variable. No raw hex. No `rgba()` with literal numbers.** This is non-negotiable — hardcoding breaks every custom theme and fails community-plugin review on aesthetic grounds.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--background-primary)` | Problem Browser view body, Settings tab body |
| Secondary (30%) | `var(--background-secondary)` | Row hover state background, filter-chip inactive background, search-bar background |
| Accent (10%) | `var(--interactive-accent)` | **ONLY** the primary action button (`Log in via embedded window`) and the active-filter chip background |
| Accent text | `var(--text-on-accent)` | Text inside accent-filled buttons and active-filter chips |
| Destructive | `var(--text-error)` | Logout button hover outline only (Logout itself stays neutral until hovered) |
| Text normal | `var(--text-normal)` | Row title, settings labels |
| Text muted | `var(--text-muted)` | Row LC-id prefix, row subtitle, empty-state helper text, footer throttle text |
| Difficulty — Easy | `var(--color-green)` | Easy difficulty tag text + 12%-opacity background via `color-mix(in srgb, var(--color-green) 12%, transparent)` |
| Difficulty — Medium | `var(--color-yellow)` | Medium difficulty tag (same pattern) |
| Difficulty — Hard | `var(--color-red)` | Hard difficulty tag (same pattern) |
| Status — Solved | `var(--color-green)` | Check-circle icon prefix on row when status === 'ac' |
| Status — Attempted | `var(--color-yellow)` | Dot icon prefix on row when status === 'notac' |
| Status — Untouched | `var(--text-faint)` | No icon; row title at normal weight |

**Accent (`--interactive-accent`) is reserved EXCLUSIVELY for:**
1. The `Log in via embedded window` primary button in the Settings tab.
2. The currently-active filter chip(s) in the browser's filter row.
3. (Phase 2+ will extend this list — do NOT add to it in Phase 1.)

**NOT accent:** row hover, search-input focus ring (use Obsidian's default focus ring — do not override), logout button, `Save cookies` button, settings input focus, ribbon icon.

**60/30/10 split justification:** Obsidian's own File Explorer + Outline views use ~60% `--background-primary` for the scrollable surface, ~30% `--background-secondary` for hover states / group backgrounds, ~10% `--interactive-accent` for active selection. This plugin mirrors that so it reads as native.

---

## Copywriting Contract

All user-facing strings are **sentence case** (enforced by `eslint-plugin-obsidianmd`'s `ui/sentence-case` rule — see RESEARCH.md Pitfall 6). No trailing periods on button labels or headings. Notice messages end with a period because they are full sentences.

### Problem Browser — strings

| Element | Copy |
|---------|------|
| View header title | `LeetCode problems` |
| View tab tooltip | `LeetCode problems` |
| Ribbon icon tooltip | `Open LeetCode browser` |
| Command palette entry | `LeetCode: Open problem browser` |
| Search input placeholder | `Search by title or number` |
| Difficulty filter label | `Difficulty` (with chips: `Easy` / `Medium` / `Hard`) |
| Status filter label | `Status` (with chips: `Solved` / `Attempted` / `Untouched`) |
| Filter reset (when any filter active) | `Clear filters` |
| Footer throttle indicator | `Fetching from LeetCode…` (unicode ellipsis) |

### Empty / loading states — Problem Browser

| State | Heading | Body | Action |
|-------|---------|------|--------|
| Not logged in | `Log in to browse problems` | `Sign in to LeetCode to load the problem list.` | `[Log in]` button (opens Settings tab to the Authentication section) |
| First load, logged in | `Loading problems…` | `Fetching the problem list. This happens once.` | *(no action — spinner or plain text)* |
| Filters exclude everything | `No matching problems` | `Try a different search term or clear filters.` | `[Clear filters]` button |
| Load failed (network) | `Couldn't reach LeetCode` | `Check your internet connection and try again.` | `[Retry]` button |

### Settings tab — strings

| Element | Copy |
|---------|------|
| Authentication section heading | `Authentication` |
| Status label (logged in) | `Logged in as {username}` |
| Status label (logged out) | `Not logged in` |
| Primary auth button (logged out) | `Log in via embedded window` |
| Primary auth button (logged in) | `Logout` |
| Manual-cookie sub-heading | `Manual cookie (fallback)` |
| Manual-cookie description | `Paste your LeetCode session cookies if the embedded login doesn't work on your system.` |
| `LEETCODE_SESSION` field label | `LEETCODE_SESSION` |
| `csrftoken` field label | `csrftoken` |
| Save cookies button | `Save cookies` |
| Notes section heading | `Notes` |
| Problems-folder setting name | `Problems folder` |
| Problems-folder setting description | `Vault folder where problem notes are created.` |
| Default-language setting name | `Default language` |
| Default-language setting description | `Starter code language for new problems.` |

### `Notice` messages (toast)

| Trigger | Copy | Duration |
|---------|------|----------|
| Login window closed without cookies (D-04) | `LeetCode login cancelled.` | 4s (Obsidian default) |
| Session expired detected (CF-04, AUTH-04) | `LeetCode session expired. Log in again.` | 8s (longer — actionable) |
| 429 received from LC (D-14) | `LeetCode rate-limited — slowing down.` | 6s |
| Login success | `Logged in to LeetCode.` | 4s |
| Logout success | `Logged out of LeetCode.` | 4s |
| Manual cookies saved | `Cookies saved.` | 3s |
| Problem row clicked (Phase-1 stub) | `Phase 1 stub: would open {slug}.` | 3s — replaced in Phase 2 |

### Primary CTA per surface

| Surface | Primary CTA | Verb + Noun |
|---------|-------------|-------------|
| Settings (logged out) | `Log in via embedded window` | Log in |
| Settings (logged in) | `Logout` | Log out |
| Problem Browser (empty state) | `Log in` | Log in |
| Problem Browser (load failed) | `Retry` | Retry |

### Destructive actions — Phase 1

**Logout (AUTH-05):** destructive in spirit but low-consequence (cookies can be re-captured by re-login). **No confirmation modal** — click-to-logout, immediate Notice, no "Are you sure?" step. Rationale: cookie re-capture is fast, a confirmation modal would be heavier than the action. A single-click Notice acknowledgement is sufficient feedback.

**Clear manual cookies:** not exposed as a distinct button in Phase 1 — the same Logout clears manual-paste cookies. No additional destructive surface.

Phase 1 has no other destructive actions. (Phase 4 will introduce technique-note creation which is write-only, not destructive. Phase 5 may add a "Clear problem cache" action that WILL need confirmation.)

---

## Interaction Contracts

### Problem Browser view

| Interaction | Contract |
|-------------|----------|
| Open via ribbon icon (`code-2`) | Reveal existing leaf if present; otherwise `workspace.getRightLeaf(false)` + `setViewState(BROWSER_VIEW_TYPE)` |
| Open via command palette | Same as ribbon |
| Type in search | Debounce 150ms; in-memory filter over cached index (no LC call) |
| Click difficulty chip | Toggle that difficulty in active-filter set; multi-select allowed |
| Click status chip | Same toggle pattern |
| Click `Clear filters` | Reset all chips + search input; refocus search input |
| Click row (Phase 1) | Show Notice `Phase 1 stub: would open {slug}.` (Phase 2 replaces with real note open) |
| Hover row | Background → `var(--background-secondary)`; cursor → pointer |
| Keyboard: `Tab` | Focus moves through search → each chip → each visible row (DOM order) |
| Keyboard: `Enter` on row | Same as click |
| Keyboard: `Esc` in search | Clear search text; keep focus in input |
| Scroll near bottom (50 rows from end) | Virtualized list mounts next window of rows (no additional LC call — index is pre-cached) |
| Queue depth > 0 for > 2s | Footer shows `Fetching from LeetCode…` in `var(--text-muted)`; hide when queue drains (D-13) |

### Settings tab

| Interaction | Contract |
|-------------|----------|
| Click `Log in via embedded window` | Open Electron `BrowserWindow` at `persist:leetcode` partition; button enters loading state (disabled + text `Opening login…`); on cookies captured → close window, update status line, Notice success; on window closed without cookies → Notice cancel, button returns to idle |
| Click `Logout` | Clear cookies from `data.json` immediately; Notice; status line updates to `Not logged in`; button label switches to `Log in via embedded window` |
| Type in `LEETCODE_SESSION` / `csrftoken` | No validation until submit; masked with `type="password"` style (obscured) but with a "show" toggle icon (eye icon, Lucide `eye` / `eye-off`) |
| Click `Save cookies` | Validate both fields are non-empty; persist to `data.json`; Notice success; status line updates |
| Edit `Problems folder` | On blur / Enter → trim trailing slash, persist |
| Change `Default language` dropdown | Persist immediately on change |

### BrowserWindow login

Native LC page renders inside the Electron window. **Plugin applies zero styling** — it is LeetCode's actual login form. The only plugin behavior is cookie polling on navigation events (see RESEARCH.md Pattern 4). Window chrome:
- Width 980px, height 720px
- `autoHideMenuBar: true`
- Title: inherit from LC page (do not override)

### Notices

Use Obsidian's built-in `new Notice(message, ms)`. Never stack more than one active Notice for the same event class (D-04 discipline — "exactly one Notice").

---

## Icons (Lucide names)

| Element | Icon name | Rationale |
|---------|-----------|-----------|
| Ribbon icon + view icon | `code-2` | Matches CONTEXT.md; LC-adjacent imagery |
| Search input prefix | `search` | Universal |
| Filter row icon | `filter` (optional, can omit to save space) | Obsidian convention |
| Solved status prefix on row | `check-circle` in `var(--color-green)` | Obsidian convention |
| Attempted status prefix on row | `circle-dot` in `var(--color-yellow)` | Distinguishes from solved |
| Untouched row | no icon | Reduces visual noise on 2,500+ rows |
| Log in button | `log-in` | Universal |
| Logout button | `log-out` | Universal |
| Cookie show/hide toggle | `eye` / `eye-off` | Standard |
| Footer throttle indicator | `loader-2` (animated) OR three-dot unicode `⋯` | Either acceptable; prefer unicode to avoid animation cost |

**No custom SVGs in Phase 1.** All icons via `setIcon(el, 'lucide-name')` from the Obsidian API.

---

## Accessibility

| Requirement | Contract |
|-------------|----------|
| Keyboard navigation | Every clickable element reachable via `Tab`; row list supports arrow keys (up/down) once focused |
| Focus rings | **Do not override Obsidian's default.** Obsidian themes provide theme-consistent focus styling — any `outline: none` is a bug |
| ARIA | Search input has `aria-label="Search by title or number"`. Filter chips have `role="button"` + `aria-pressed="{true|false}"`. Row list has `role="listbox"`, rows have `role="option"` |
| Color contrast | Inherited from Obsidian CSS variables — all themes are required to meet WCAG AA by Obsidian's theme guidelines. Plugin does not override |
| Screen reader | Row title is readable as `{id}. {title}, {difficulty}, {status}` via a hidden `aria-label` on each row |
| Motion | No animations beyond Obsidian's built-in transitions. Throttle indicator prefers unicode `⋯` over spinner |

---

## Layout — Problem Browser view

```
┌─────────────────────────────────────────┐  ← Obsidian view header (native)
│ [code-2]  LeetCode problems             │
├─────────────────────────────────────────┤
│                                         │
│  [search-icon] Search by title or...   │  ← 32px row, 8px outer padding, inherits --font-ui-small
│                                         │
│  Difficulty  [Easy] [Medium] [Hard]    │  ← chips: 24px height, 4px gap, 500 weight at 12px
│  Status      [Solved] [Attempted] [Untouched]
│                                         │
│  [Clear filters]                        │  ← only when any filter active; muted text
│                                         │
├─────────────────────────────────────────┤  ← 1px subtle separator (--background-modifier-border)
│  [✓] 1.   Two Sum             [Easy]   │  ← row: 32px min-height
│  [○] 2.   Add Two Numbers    [Medium]  │
│      3.   Longest Substring… [Medium]  │
│  [✓] 4.   Median of Two…      [Hard]   │
│  …                                     │
│  (virtualized — only visible rows)     │
│                                         │
├─────────────────────────────────────────┤
│  ⋯ Fetching from LeetCode…             │  ← footer, only when queue > 0 for > 2s
└─────────────────────────────────────────┘
```

**Row layout (left to right):** 16px status-icon column · 40px LC-id column (right-aligned, muted color) · flexible title column (truncate with ellipsis) · 64px difficulty tag column (right-aligned pill). All left-aligned except LC-id and difficulty.

**Difficulty pill:** 22px × auto width, 4px horizontal padding, 4px border radius, 12px label, colored background at `color-mix(in srgb, var(--color-{diff}) 15%, transparent)`, text in `var(--color-{diff})`.

---

## Layout — Settings tab (D-09 verbatim expansion)

```
Authentication
    Status: Logged in as moxu                               [muted text]
    [ Log in via embedded window ]    [ Logout ]            [primary]  [neutral]

    Manual cookie (fallback)
    Paste your LeetCode session cookies if the embedded     [muted desc]
    login doesn't work on your system.
    LEETCODE_SESSION       [ •••••••••••••••••••• ] [eye]  [monospace input]
    csrftoken              [ •••••••••••••••••••• ] [eye]  [monospace input]
    [ Save cookies ]                                        [neutral]

                                                            [24px gap]
Notes
    Problems folder                                         [setting name]
    Vault folder where problem notes are created.           [setting desc]
                              [ LeetCode/                 ] [text input]

    Default language                                        [setting name]
    Starter code language for new problems.                 [setting desc]
                              [ Python              v ]     [dropdown]
```

Built with Obsidian's `Setting` builder pattern — each row is `new Setting(containerEl).setName(...).setDesc(...).addButton(...)` etc. Group headings via `containerEl.createEl('h2', { text: 'Authentication' })`.

---

## Component Inventory (Phase 1)

| Component | Obsidian primitive | File |
|-----------|-------------------|------|
| Problem Browser view | `ItemView` | `src/browse/ProblemBrowserView.ts` |
| Search input row | `createEl('input', { type: 'search' })` | inside `ProblemBrowserView` |
| Filter chip | `createDiv({ cls: 'lc-chip' })` + click handler | inside `ProblemBrowserView` |
| Virtualized row list | `createDiv({ cls: 'lc-rows' })` + IntersectionObserver | inside `ProblemBrowserView` |
| Problem row | `createDiv({ cls: 'lc-row' })` | row render helper |
| Footer throttle indicator | `createDiv({ cls: 'lc-footer' })` | shown/hidden via class toggle |
| Settings tab | `PluginSettingTab` | `src/settings/SettingsTab.ts` |
| Auth status line | `createEl('div')` + `Setting` | inside `SettingsTab` |
| Primary auth button | `Setting.addButton().setCta()` | inside `SettingsTab` |
| Logout button | `Setting.addButton()` (no `.setCta()`) | inside `SettingsTab` |
| Manual-cookie form | two `Setting.addText()` + save button | inside `SettingsTab` |
| Problems-folder input | `Setting.addText()` | inside `SettingsTab` |
| Language dropdown | `Setting.addDropdown()` | inside `SettingsTab` |
| Login window | Electron `BrowserWindow` (no plugin styling) | `src/auth/BrowserWindowLogin.ts` |
| All toasts | `new Notice(...)` | emitted from `AuthService` / `LeetCodeClient` |

---

## CSS conventions (`styles.css`)

Root scope everything under `.leetcode-browser` (view) or `.leetcode-settings` (settings-tab root class to add) to prevent bleed into other plugin UIs.

```css
/* Example — executor reference only */
.leetcode-browser { padding: 16px; }
.leetcode-browser .lc-search { margin-bottom: 8px; font-size: var(--font-ui-small); }
.leetcode-browser .lc-chip {
  display: inline-flex; align-items: center; height: 24px;
  padding: 0 8px; margin-right: 4px; border-radius: 4px;
  font-size: 12px; font-weight: 500;
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
}
.leetcode-browser .lc-chip.is-active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.leetcode-browser .lc-row {
  display: flex; align-items: center; min-height: 32px;
  padding: 0 8px; gap: 8px;
  cursor: pointer;
}
.leetcode-browser .lc-row:hover { background: var(--background-secondary); }
.leetcode-browser .lc-row__id { color: var(--text-muted); min-width: 40px; text-align: right; }
.leetcode-browser .lc-diff--easy {
  color: var(--color-green);
  background: color-mix(in srgb, var(--color-green) 15%, transparent);
}
/* Medium and Hard follow the same pattern with --color-yellow / --color-red. */
.leetcode-browser .lc-footer {
  padding: 8px;
  font-size: 12px;
  color: var(--text-muted);
  border-top: 1px solid var(--background-modifier-border);
}
```

**Never:** `color: #xxx`, `background: rgba(...)`, inline `style="..."` (flagged by `no-static-styles-assignment`), `!important`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — Obsidian plugin, no React component registry |
| third-party | none | not applicable |

No shadcn, no component registries, no third-party UI blocks used or declared. All UI is built from Obsidian's built-in API primitives (`ItemView`, `PluginSettingTab`, `Setting`, `Notice`, `Modal`, `setIcon`). The Lucide icon set ships inside Obsidian itself — no separate dependency, no separate vetting needed.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — all strings sentence case, primary CTAs declared, empty/error/destructive states covered
- [ ] Dimension 2 Visuals: PASS — layout diagrams + component inventory declared
- [ ] Dimension 3 Color: PASS — 60/30/10 mapped to Obsidian variables, accent reserved-for list explicit (2 elements only)
- [ ] Dimension 4 Typography: PASS — 3 sizes (14/12/16), 2 primary weights (400/600)
- [ ] Dimension 5 Spacing: PASS — 4-point scale declared (4/8/12/16/24), exceptions documented
- [ ] Dimension 6 Registry Safety: PASS — no third-party registries, no vetting required

**Approval:** pending
