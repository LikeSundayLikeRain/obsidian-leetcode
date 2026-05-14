# Research Summary: obsidian-leetcode

**Project:** Obsidian community plugin integrating LeetCode
**Dimensions covered:** Stack, Features, Architecture, Pitfalls
**Confidence:** HIGH
**Date:** 2026-05-07

---

## Executive Summary

This is a desktop-only Obsidian community plugin that integrates with LeetCode to let users browse problems, write solutions, run and submit code, and capture solved problems as linked vault notes. The proven reference implementation is **vscode-leetcode**, which sets the feature bar. The key differentiation is Obsidian-native graph integration: every solved problem becomes a note with frontmatter, backlinks to technique stubs, and LC topic tags namespaced under `lc/`. The entire build happens on Obsidian's plugin API using TypeScript + esbuild, with **`requestUrl`** as the sole HTTP primitive — native `fetch` is CORS-blocked in Electron's renderer.

The recommended technical approach uses **`@leetnotion/leetcode-api` v3.0.0** for GraphQL reads injected with a `requestUrl` adapter, plus **hand-rolled REST** for the three run/submit/check endpoints no library covers. Authentication uses Electron `BrowserWindow` with `nodeIntegration: false`, extracting cookies via `cookies.changed` event, with cookie-paste as a first-class fallback. The note schema — `{id}-{slug}.md` filenames, `lc-` prefixed frontmatter fields, `lc/` namespaced tags — must be **locked in Phase 2** and never changed without a migration tool.

The highest-risk work is **Run/Submit**: three undocumented, CSRF-sensitive REST endpoints requiring exponential-backoff polling, only fully verifiable against the live LC service. Phase 1 decisions (`requestUrl` adapter, `isDesktopOnly: true`, `eslint-plugin-obsidianmd` from day one, Electron imports quarantined to one file) are hard gates, not preferences.

---

## Critical Path Blockers

These force phase ordering; violating the order compounds rework cost:

1. **`requestUrl` HTTP adapter** — Nothing calls LC until `@leetnotion/leetcode-api`'s `fetcher.set()` hook is bridged to Obsidian's `requestUrl`. Native `fetch`/`axios` are silently blocked by CORS.
2. **Auth layer** — Problem browsing + detail + run + submit all require a valid `LEETCODE_SESSION` cookie + CSRF token. Without auth, no feature works.
3. **`manifest.json` with `"isDesktopOnly": true`** — Using Electron `BrowserWindow` requires this flag; omission is auto-rejected by the store bot.
4. **ESLint with `eslint-plugin-obsidianmd`** — Catches ~15 of 18 pitfalls at lint time. Retrofit cost is high; enable in Phase 1.
5. **Filename + frontmatter schema lock** — `{id}-{slug}.md` filenames, `lc-` field prefix, `lc/` tag prefix must be frozen in Phase 2. Changing these after shipping forces a migration tool (HIGH rework cost).

---

## Library / Technology Selections

| Area | Selection | Why / Alternatives rejected |
|------|-----------|-----------------------------|
| Language / build | TypeScript + esbuild (via `obsidian-sample-plugin` template) | Standard Obsidian plugin baseline |
| HTTP client | Obsidian's `requestUrl` | `fetch`/`axios` fail with CORS to leetcode.com in Electron renderer |
| LC GraphQL | `@leetnotion/leetcode-api` v3.0.0 | More recent than `leetcode-query` (2026-04 vs 2025-07); supports `fetcher.set()` for requestUrl injection |
| Run/Submit/Check | **Hand-rolled REST** — no library covers these endpoints | `interpret_solution` + `submit` + `check/{id}` are LC internal REST, library gap |
| HTML → Markdown | `turndown` v7.2.4 | Convert once at fetch time; never use `innerHTML` (store reject) |
| Auth flow | Electron `BrowserWindow` (primary) + cookie paste (fallback) | Equivalent UX to vscode-leetcode without LC's custom redirect endpoint |
| Code editor | Native note code block (Obsidian's built-in CodeMirror 6) | Do not build a custom editor pane; the note editor IS CodeMirror 6 |
| Safe vault writes | `vault.process()` + `fileManager.processFrontMatter()` | `vault.modify()` silently drops user edits during submission polling |
| Plugin data | `data.json` for auth + settings; separate `obsidian-leetcode-index.json` for problem index | Keeps `data.json` small; lazy-load problem list (never bulk-fetch all 3,300) |
| State | Plain class state | No need for Svelte/mobx at this scope |

---

## Schema Decisions — Must Lock Early (Phase 2)

Changes after shipping are breaking changes for users' vaults:

- **Filename scheme:** `{leetcode-id}-{slug}.md` (e.g. `0001-two-sum.md`) — collision-free, sortable
- **Tag namespace:** `lc/` prefix on all LC-sourced tags (e.g. `#lc/array`, `#lc/medium`). User-added personal tags stay unprefixed (`#revisit`, `#interview-asked`).
- **Frontmatter fields:** `lc-` prefix — `lc-id`, `lc-slug`, `lc-difficulty`, `lc-status`, `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, `lc-language`
- **Content sections:** `## Problem` (imported statement), `## Solution` (appended accepted code block), `## Techniques` (auto-curated backlinks like `[[Two Pointers]]`), `## Notes` (user-owned)
- **Technique notes:** stub notes created in a configurable `Techniques/` folder on first use, never overwritten after creation

---

## High-Risk Areas

| Risk | Phase | Mitigation |
|------|-------|-----------|
| LC REST endpoint drift (`interpret_solution`, `submit`, `check`) | Phase 3 | Live verification spike before implementation; capture fixtures for all verdict types (AC, WA, TLE, MLE, CE, RE) |
| CSRF token refresh / session expiry | Phases 1, 3 | Trap `response.errors[0].message` from GraphQL (200 status even on auth failure); refresh CSRF on each response set-cookie |
| Rate limiting (LC doesn't publish thresholds) | All phases | Limit 20 req / 10 s, 2 concurrent; exponential backoff on 429; never bulk-fetch problem list |
| BrowserWindow stability across Obsidian versions | Phase 1 | Keep cookie-paste fallback first-class; quarantine `require('electron')` to a single module |
| Vault write races during polling | Phase 4 | `vault.process()` only; no `vault.modify()` on problem notes ever |
| Community store rejection | Phases 1 & 5 | ESLint from day one; `isDesktopOnly: true`; no telemetry; no remote code; README discloses network usage |
| LC ToS risk (scraping concerns) | Phase 2 | Only fetch on user action (not bulk); disclose in README; document offline-cache tradeoff |

---

## Top Pitfalls Per Phase

**Phase 1 (Foundation):** Wrong HTTP client (CORS failure), missing `isDesktopOnly`, Electron `require` scattered across files, skipping ESLint setup, hardcoded styles via `element.style`.

**Phase 2 (Notes + Schema):** Unprefixed tags polluting user's tag pane, filename collisions, frontmatter mangling, `innerHTML` for LC HTML, writing to vault without user action.

**Phase 3 (Run/Submit):** Not handling all verdict types, no exponential backoff on polling, blocking UI thread, not checking `response.errors`, CSRF header missing on POST.

**Phase 4 (Write-back):** `vault.modify()` overwriting user edits, non-atomic multi-step writes, 3,000 graph nodes from auto-created technique stubs (need dedup), backlinks without user opt-out.

**Phase 5 (Polish):** Missing README network disclosure, sample-plugin placeholder strings leftover, unhandled Promises, UI text not sentence-case, no LICENSE.

---

## Recommended Phase Sequence (5 phases)

| # | Phase | Outputs | Why this order |
|---|-------|---------|----------------|
| 1 | **Plugin Foundation** | Scaffold, ESLint config, `isDesktopOnly` manifest, `requestUrl` adapter, `LeetCodeClient` facade (GraphQL reads), `AuthService` (BrowserWindow + paste), settings tab, problem-list view | Everything downstream needs HTTP + auth. ESLint early prevents retrofit pain. |
| 2 | **Problems as Notes** | Problem detail fetch, HTML→MD conversion, `{id}-{slug}.md` creation, frontmatter schema, `lc/` tag import, template system | Locks permanent schema before any user ships a vault. One-note-per-problem unblocks solving UX. |
| 3 | **Run & Submit** | Hand-rolled `interpret_solution` + `submit` + `check` polling with exponential backoff, verdict modal, custom test-case input | Highest-risk, hand-rolled against undocumented endpoints. Must be verified live. |
| 4 | **Knowledge Graph Wiring** | On-accept: append solution + update metadata + generate `[[Technique]]` backlinks, technique-note stub creation, post-solve hooks | Builds on verdict event from Phase 3. Realizes Obsidian-native value. |
| 5 | **Polish & Ship** | Full settings UI, error handling, README with screenshots, network disclosure, LICENSE, store submission PR | Gated on zero ESLint-required violations (if Phase 1 did its job, this is formality). |

---

## Deferred to Future Milestones

- Spaced repetition (v2)
- leetcode.cn support (v2)
- Obsidian mobile (requires replacing BrowserWindow with paste-only)
- AI tagging
- Local code execution (not needed — LC's run endpoint handles all languages remotely)

---

## Research Flags

**Needs live verification:**
- LC REST endpoint response shapes for all verdict types (AC, WA, TLE, MLE, CE, RE) — Phase 3 implementation blocker
- BrowserWindow cookie extraction on macOS / Windows / Linux in real Obsidian dev vault — Phase 1 integration test

**Standard patterns (no deep research needed):**
- `processFrontMatter`, `vault.process()`, `normalizePath` — well-documented official API
- ESLint-plugin-obsidianmd rules — all enumerated in plugin docs

---

## Key Takeaways for Requirements / Roadmap

1. The roadmap should match the 5-phase sequence above — dependencies, not opinions, drive it.
2. v1 "done" is roughly what vscode-leetcode does, minus the IDE features, plus note creation + tags + backlinks + offline cache.
3. The author's daily-driver threshold is the acceptance bar, not a store review — but shipping to the store is the closing checkpoint for v1.
4. The hardest technical work concentrates in Phase 3. Plan for a research/spike step at the top of Phase 3.
5. Anti-features (mobile, leetcode.cn, SR, AI, local exec) must stay excluded throughout v1 or scope creep is near-certain.
