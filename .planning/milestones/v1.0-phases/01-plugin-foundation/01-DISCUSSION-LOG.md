# Phase 1: Plugin Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 1-plugin-foundation
**Areas discussed:** Source layout & module boundaries, BrowserWindow login UX, Problem browser view design, Settings scope & rate-limit UX

---

## Source Layout & Module Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Feature-first | Each feature owns view+service+types (`auth/`, `browse/`, `api/`, `settings/`, `shared/`). Phases add sibling folders. | ✓ |
| Layer-first | Group by role (`services/`, `views/`, `api/`, `types/`). More familiar MVC shape; auth code scattered across 4 folders. | |
| Flat (sample-plugin style) | All `.ts` at `src/` root until >15 files. Lowest friction; likely to hit reorg by Phase 3. | |

**User's choice:** Feature-first
**Notes:** Aligns with GSD phase boundaries — each new phase adds one folder. Sets precedent for Phases 2-5 (`notes/`, `solve/`, `graph/`).

---

## BrowserWindow Login — Success Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Cookie-poll on `did-navigate` | On each navigation, read cookie jar; when both `LEETCODE_SESSION` + `csrftoken` present, persist and close. Robust across LC login variants. | ✓ |
| URL-match on redirect to /problems | Wait for URL matching `/problems` or `/u/`. Simpler but brittle — LC has A/B tested post-login routes. | |
| Explicit "I'm done" button | Obsidian-owned header bar with a finish button. No route guessing; feels manual. | |

**User's choice:** Cookie-poll on `did-navigate`
**Notes:** Impossible to bypass; tolerant of LC route changes, OAuth, and 2FA paths.

---

## BrowserWindow Login — Failure / Cancel Path

| Option | Description | Selected |
|--------|-------------|----------|
| Silent cancel + Notice | Window closed without cookies → single Notice "LeetCode login cancelled." No modal stacking. | ✓ |
| Offer paste-fallback on cancel | Auto-open cookie-paste modal when window closed without cookies. Pushes the fallback; feels pushy. | |
| Error modal with retry options | Modal with Retry / Paste / Cancel buttons. Most explicit; adds friction. | |

**User's choice:** Silent cancel + Notice
**Notes:** Routine cancel shouldn't be noisy. User re-triggers from settings or command palette.

---

## Problem Browser — Host Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Right-sidebar ItemView | Docked like File Explorer/Outline. Always visible alongside problem note. | ✓ |
| Main-pane ItemView | Full tab. More room; forces tab-switch back to browse. | |
| Modal browser | Command-palette-invoked full-screen search. Keyboard-first; no persistent surface. | |

**User's choice:** Right-sidebar ItemView
**Notes:** Mirrors vscode-leetcode's docked-panel UX while staying Obsidian-native.

---

## Problem Browser — List Fetch Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Index-once + paged render | Fetch slim index (id/slug/title/diff/paid) once, cache 24h in `data.json`, virtualized render. Detail on click (Phase 2). | ✓ |
| Paged server calls per-scroll | No index cache; each scroll/search hits network. Always-fresh; breaks offline search; rate-limit pressure. | |
| Full detail prefetch | Prefetch full detail for 3,300 problems. Violates BROWSE-02; 50-150 MB blob. Rejected. | |

**User's choice:** Index-once + paged render
**Notes:** ~250 KB index for 3,300 problems — safe for `data.json`. In-memory search is instant.

---

## Settings Tab Scope (Phase 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal-to-function | Auth + paste + vault folder (default `LeetCode/`) + default language (default Python). Defer technique folder and auto-backlink to Phase 4. | ✓ |
| Full POLISH-01 surface now | Build entire POLISH-01 settings; Phase 4 controls show but do nothing. Risk of ghost controls. | |
| Auth-only | Only auth + paste. Vault folder hardcoded. Forces Phase 2 to revisit settings. | |

**User's choice:** Minimal-to-function
**Notes:** Only controls needed to use Phase 1. Ghost controls avoided; Phase 5 owns final polish.

---

## Rate-Limit Enforcement & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Fetcher adapter + silent queue | Token bucket (20/10s) + concurrency limit (2) inside `requestUrlFetcher`. Footer hint only after 2s queue depth. | ✓ |
| Fetcher + Notice on any throttle | Same enforcement; every >500ms delay shows a Notice. Noisy during active browsing. | |
| Per-view throttling | Each view owns its limiter. Views can race together and exceed LC's 20/10s ceiling. Not bypass-proof. | |

**User's choice:** Fetcher adapter + silent queue
**Notes:** Impossible to bypass — every LC call routes through this fetcher. UX invisible during normal use.

---

## Claude's Discretion

Areas left open for researcher/planner to refine:
- Token-bucket implementation (hand-rolled vs a dep like `limiter`); default: hand-rolled in `shared/`
- Virtualized list rendering mechanism (hand-rolled IntersectionObserver vs a tiny dep); default: hand-rolled
- Scoped CSS approach for the sidebar view; default: plain class-scoped CSS in `styles.css`
- Exact shape of cached `data.json` structure (nested vs flat), with a version-migration guard
- Whether the ribbon icon is the primary activating surface vs the command-palette entry (both exist per BROWSE-01)

## Deferred Ideas

None emerged during discussion — stayed within Phase 1 scope.

Standing deferrals (already tracked in PROJECT.md / REQUIREMENTS.md):
- Technique folder + auto-backlink toggle → Phase 4
- Error-copy polish + network-disclosure text → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI enhancements → v2
