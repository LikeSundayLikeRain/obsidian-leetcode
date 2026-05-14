---
phase: 2
slug: problems-as-notes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@4.1.5` (Node environment) |
| **Config file** | `vitest.config.ts` at repo root (installed in Phase 1) |
| **Quick run command** | `npm test -- <relevant-file>.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds (warm cache) |

---

## Sampling Rate

- **After every task commit:** Run the 1–3 tests closest to the changed file (e.g., `npm test -- tests/note-frontmatter-*.test.ts`)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** `npm test && npm run lint && npm run build` must all be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

> Task IDs are `{phase}-{plan}-{task}`. Plan/wave assignments are finalized by the planner; entries below are keyed by requirement and decision so the planner can stamp them into plan frontmatter. All tests currently ❌ W0 — created in Wave 0 before the implementing wave runs.

| Req / Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------------|----------|-----------|-------------------|-------------|--------|
| NOTE-01 | Filename `{id}-{slug}.md`, unpadded | unit | `npm test -- tests/note-filename.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-01 | Creates problems folder if missing | unit | `npm test -- tests/note-writer-folder.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-02 | `htmlToMarkdown` converts `<pre><code class="language-python">...</code></pre>` → fenced ```python block | unit | `npm test -- tests/htmlToMarkdown.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-02 | `htmlToMarkdown` output is deterministic across 100 runs | unit | `npm test -- tests/htmlToMarkdown-determinism.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-02 | Snapshot fixtures for 3 real LC HTML payloads stay byte-identical | snapshot | `npm test -- tests/htmlToMarkdown-snapshots.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-03 | `applyFrontmatter` writes 7 `lc-*` keys + aliases + difficulty tag on empty frontmatter | unit | `npm test -- tests/note-frontmatter-write.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-04 / D-05 | Phase 2 writes exactly `[lc/{difficulty}]`; no topic tags | unit | `npm test -- tests/note-frontmatter-tags.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-05 / D-10 | Pre-existing `tags: [lc/easy, revisit]` preserved on regeneration | unit | `npm test -- tests/note-frontmatter-preserve-user-tags.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-05 / D-10 | Pre-existing `aliases: [Two Sum, My Alias]` preserved on regeneration (union) | unit | `npm test -- tests/note-frontmatter-preserve-user-aliases.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-06 / D-08 | `rewriteProblemSection` preserves content under `## Notes` | unit | `npm test -- tests/heading-region.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-06 / D-09 | Renamed `## Problem` heading is left untouched | unit | `npm test -- tests/heading-region-rename.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-06 / D-09 | Missing `## Problem` → re-inserted above `## Notes` | unit | `npm test -- tests/heading-region-reinsert.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-07 | Cached-HTML regeneration succeeds with no network call | unit (mocked client) | `npm test -- tests/offline-regenerate.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-07 / D-12 | Network failure during re-open is silent; note still readable | unit (client throws) | `npm test -- tests/re-open-silent-offline.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-08 | Problem path uses `settings.getProblemsFolder()` | unit | `npm test -- tests/note-path-uses-settings.test.ts` | ❌ W0 | ⬜ pending |
| NOTE-09 | `lc-language` field uses `settings.getDefaultLanguage()` | unit | `npm test -- tests/note-language-uses-settings.test.ts` | ❌ W0 | ⬜ pending |
| D-11 | Cache fresh (< 7 days) → no network on re-open | unit (fake timer) | `npm test -- tests/cache-ttl.test.ts` | ❌ W0 | ⬜ pending |
| D-11 | Cache stale (≥ 7 days) → background fetch triggered | unit | `npm test -- tests/cache-ttl.test.ts` | ❌ W0 | ⬜ pending |
| D-13 | New-note fetch failure → no file created + Notice shown | unit (mock Notice) | `npm test -- tests/new-note-fetch-failure.test.ts` | ❌ W0 | ⬜ pending |
| D-18 | `LeetCode.base` created if missing | unit (mocked Vault) | `npm test -- tests/base-file-ship.test.ts` | ❌ W0 | ⬜ pending |
| D-18 | `LeetCode.base` never overwritten if already exists | unit | `npm test -- tests/base-file-preserve.test.ts` | ❌ W0 | ⬜ pending |
| D-19 | `manifest.json` `minAppVersion` ≥ `1.10.0` | lint/unit | `npm test -- tests/manifest-version.test.ts` | ❌ W0 | ⬜ pending |
| D-22 | No `vault.modify(` calls inside `src/notes/` or `src/browse/` | grep gate | `./scripts/grep-no-vault-modify.sh` | ❌ W0 | ⬜ pending |
| CF-01 | No `fetch(` / `axios` / `node-fetch` in `src/notes/` | grep gate | extend Phase 1 grep | ✅ (Phase 1) | ✅ green |
| CF-05 | `eslint-plugin-obsidianmd` zero Required violations across `src/notes/` | lint | `npm run lint` | ✅ (Phase 1) | ⬜ pending |

*Status key: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files to stub before any implementation task runs (red tests first, one per row):

- [ ] `tests/htmlToMarkdown.test.ts` — NOTE-02 primary conversion
- [ ] `tests/htmlToMarkdown-determinism.test.ts` — D-20 determinism gate
- [ ] `tests/htmlToMarkdown-snapshots.test.ts` — 3 LC HTML fixtures
- [ ] `tests/note-frontmatter-write.test.ts` — NOTE-03
- [ ] `tests/note-frontmatter-tags.test.ts` — NOTE-04 / D-05 (difficulty-only)
- [ ] `tests/note-frontmatter-preserve-user-tags.test.ts` — NOTE-05 tag union
- [ ] `tests/note-frontmatter-preserve-user-aliases.test.ts` — D-10 alias union
- [ ] `tests/heading-region.test.ts` — NOTE-06 base case
- [ ] `tests/heading-region-rename.test.ts` — D-09 user-rename preservation
- [ ] `tests/heading-region-reinsert.test.ts` — D-09 missing-heading path
- [ ] `tests/offline-regenerate.test.ts` — NOTE-07 cache-driven regen
- [ ] `tests/re-open-silent-offline.test.ts` — D-12 silent policy
- [ ] `tests/cache-ttl.test.ts` — D-11 / D-14 TTL behavior
- [ ] `tests/new-note-fetch-failure.test.ts` — D-13 Notice-and-abort
- [ ] `tests/base-file-ship.test.ts` — D-18 lazy ship
- [ ] `tests/base-file-preserve.test.ts` — D-18 never-overwrite
- [ ] `tests/note-filename.test.ts` — D-16 unpadded filename
- [ ] `tests/note-writer-folder.test.ts` — NOTE-01 folder autocreate
- [ ] `tests/manifest-version.test.ts` — D-19 minAppVersion bump
- [ ] `tests/note-path-uses-settings.test.ts` — NOTE-08
- [ ] `tests/note-language-uses-settings.test.ts` — NOTE-09
- [ ] `tests/fixtures/lc-two-sum.html`, `lc-median.html`, `lc-regex.html` — snapshot inputs
- [ ] `tests/helpers/mock-vault.ts` — reusable mocked `Vault` + `FileManager` + `workspace`
- [ ] `tests/helpers/mock-leetcode-client.ts` — reusable mocked client with `getProblemDetail` and throw modes
- [ ] `scripts/grep-no-vault-modify.sh` — D-22 grep gate (exits non-zero on any match)

No new framework install — `vitest@4.1.5` is already present from Phase 1.

---

## Manual-Only Verifications

Behaviors that require a live Obsidian instance (no automated test possible without it):

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end first-open creates note | NOTE-01..04, NOTE-08, NOTE-09 | Requires real `Vault` + metadata-cache | Install plugin in dev vault, log in, click a problem, verify `LeetCode/1-two-sum.md` exists with full frontmatter + `## Problem` + `## Notes` |
| Re-open reveals instantly (no spinner) | D-11 | Timing is observable only in UI | Open same problem twice; second open should reveal in < 100 ms with no loading indicator |
| User `## Notes` preserved across re-open | NOTE-05, NOTE-06 | Requires real user edit cycle | Type under `## Notes`, close, re-open, verify text retained |
| Manual `#revisit` tag preserved | NOTE-05 / D-10 | Requires real vault roundtrip | Add `revisit` to `tags` frontmatter in UI, close, re-open, verify still present |
| `LeetCode.base` renders as sortable Bases view | D-17, D-18, D-19 | Bases rendering is client-side only | Open `LeetCode.base` in File Explorer; verify it lists problems sorted by `lc-id` desc |
| Offline previously-opened problem reveals silently | NOTE-07 / D-12 | Requires real network toggle | Disconnect network; click a cached problem; reveal instant, zero Notice |
| Offline never-opened problem shows error Notice | D-13 | Requires real network failure path | Disconnect network; click a fresh problem; Notice "Couldn't fetch…"; no file created |
| Session-expired detection still fires | CF-04 | Requires real cookie clear | Clear LC session cookie; click a problem; existing Phase 1 session-expired Notice fires; no partial file created |
| `minAppVersion` blocks install on Obsidian < 1.10 | D-19 | Requires older Obsidian install | Try installing on Obsidian 1.9.x; verify install refused with version message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (25 files/scripts listed above)
- [ ] No watch-mode flags in any automated command
- [ ] Feedback latency < 5 s per quick run
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 completes and full suite is green

**Approval:** pending
